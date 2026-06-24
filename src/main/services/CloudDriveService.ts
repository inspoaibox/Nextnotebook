/**
 * CloudDriveService
 * 网盘功能：本地目录监听 + 文件元数据入库（Phase1-层4）
 *
 * 职责边界：
 *   层4（本文件）= chokidar 监听 + 垃圾过滤 + cloud_file/cloud_folder 元数据 CRUD
 *   层5（CloudDriveScheduler）= 去抖 + 哈希比对 + 分块/续传上传队列
 *
 * 设计要点：
 *   1. 单根监听（watched_root_path），但支持任意深度子目录
 *   2. 稳定 ID：由相对路径派生 UUIDv5，重命名/重启后仍能复用同一 Item
 *   3. 四闸门之"闸门1 awaitWriteFinish" + "闸门2 垃圾过滤" 在本层完成
 *      "闸门3 去抖" + "闸门4 哈希比对" 由层5 Scheduler 负责（本层只入元数据）
 *   4. 配置独立持久化到 cloud-drive-config.json（无敏感信息，明文 JSON）
 *   5. cloud_file / cloud_folder 不在 LOCALLY_ENCRYPTED_ITEM_TYPES，自动明文
 */

import { app, ipcMain, IpcMainInvokeEvent, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as mime from 'mime-types';
import chokidar, { FSWatcher } from 'chokidar';
import { ItemsManager } from '@core/database';
import {
  CloudDriveConfig,
  DEFAULT_CLOUD_DRIVE_CONFIG,
  CloudFilePayload,
  CloudFolderPayload,
  CloudUploadProgress,
  CloudDownloadProgress,
  ItemBase,
} from '@shared/types';

// ========== 模块单例 ==========
let cloudDriveService: CloudDriveService | null = null;

// 用于派生稳定 ID 的命名空间 UUID（v5 NS）
// 固定值：com.mucheng.notes.cloud-drive 的 sha1 前 16 字节派生
const CLOUD_DRIVE_NAMESPACE = '6f3c1d2a-9b7e-4a8c-b5f3-2e1d0c9b8a74';

export class CloudDriveService {
  private itemsManager: ItemsManager;
  private userDataPath: string;
  private configPath: string;
  private config: CloudDriveConfig;

  private watcher: FSWatcher | null = null;
  private mainWindow: BrowserWindow | null = null;

  // ========== 下载回环抑制（P2-4）==========
  // 当 CloudDriveScheduler 下载文件 / CloudDriveService 处理删除/冲突复制时，
  // 写入动作会触发 chokidar 事件，造成"下载完又触发上传"的回环。
  // 用 writingPaths 集合标记"本次写入由系统发起"，onFileAdded 命中即跳过。
  // writingTimers 是兜底机制：若写入过程崩溃导致 unmarkWriting 漏调，
  // 5s 后自动清理标记，避免长期屏蔽用户后续真实修改。
  private writingPaths = new Set<string>();
  private writingTimers = new Map<string, NodeJS.Timeout>();
  private static readonly WRITING_GUARD_TTL_MS = 5000;

  constructor(itemsManager: ItemsManager, userDataPath: string) {
    this.itemsManager = itemsManager;
    this.userDataPath = userDataPath;
    this.configPath = path.join(userDataPath, 'cloud-drive-config.json');
    this.config = this.loadConfig();
  }

  // ========== 配置持久化 ==========

  private loadConfig(): CloudDriveConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<CloudDriveConfig>;
        // 与默认值合并，保证新增字段有兜底
        return { ...DEFAULT_CLOUD_DRIVE_CONFIG, ...parsed };
      }
    } catch (err) {
      console.error('[CloudDriveService] 读取配置失败，使用默认值:', err);
    }
    return { ...DEFAULT_CLOUD_DRIVE_CONFIG };
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('[CloudDriveService] 保存配置失败:', err);
    }
  }

  getConfig(): CloudDriveConfig {
    return { ...this.config };
  }

  updateConfig(patch: Partial<CloudDriveConfig>): CloudDriveConfig {
    this.config = { ...this.config, ...patch };
    this.saveConfig();
    return { ...this.config };
  }

  // ========== 主窗口（事件推送）==========

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  private emit(channel: string, payload: unknown): void {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, payload);
      }
    } catch (err) {
      console.error(`[CloudDriveService] 推送事件失败 (${channel}):`, err);
    }
  }

  /** 推送监听状态变化 */
  emitWatchingChange(watching: boolean): void {
    this.emit('cloud-drive:watchingChange', watching);
  }

  /** 推送上传进度（层5 调用；层4 仅保留接口） */
  emitUploadProgress(progress: CloudUploadProgress): void {
    this.emit('cloud-drive:uploadProgress', progress);
  }

  /** 推送下载进度（层5 调用；层4 仅保留接口） */
  emitDownloadProgress(progress: CloudDownloadProgress): void {
    this.emit('cloud-drive:downloadProgress', progress);
  }

  // ========== 下载回环抑制（P2-4）==========

  /**
   * 标记某路径"正在被系统写入"。写入前调用。
   * 写入完成后必须调用 unmarkWriting 清理，否则该路径在 TTL 内的用户修改会被忽略。
   */
  private markWriting(absolutePath: string): void {
    this.writingPaths.add(absolutePath);
    // 兜底定时器：即使 unmarkWriting 未被调用，TTL 后也自动解除
    const existing = this.writingTimers.get(absolutePath);
    if (existing) clearTimeout(existing);
    this.writingTimers.set(
      absolutePath,
      setTimeout(() => {
        this.writingPaths.delete(absolutePath);
        this.writingTimers.delete(absolutePath);
      }, CloudDriveService.WRITING_GUARD_TTL_MS),
    );
  }

  /**
   * 解除写入标记。调用时通常已 refresh(true) 完成，目的在于立刻让出控制权。
   */
  private unmarkWriting(absolutePath: string): void {
    this.writingPaths.delete(absolutePath);
    const timer = this.writingTimers.get(absolutePath);
    if (timer) {
      clearTimeout(timer);
      this.writingTimers.delete(absolutePath);
    }
  }

  /** 仅供 Scheduler 下载分支调用：在写入前标记路径，写入后解除。 */
  markFileWriting(absolutePath: string): void {
    this.markWriting(absolutePath);
  }

  unmarkFileWriting(absolutePath: string): void {
    this.unmarkWriting(absolutePath);
  }

  /** 暴露给 SyncEngine 删除传播回调：根据 itemId 解析出 absolutePath 后删除文件 */
  handleRemoteDelete(itemId: string): void {
    try {
      const item = this.itemsManager.getByIdIncludeDeleted(itemId);
      if (!item) return;
      if (item.type !== 'cloud_file' && item.type !== 'cloud_folder') return;

      let payloadObj: { relative_path?: string } = {};
      try {
        payloadObj = JSON.parse(item.payload);
      } catch {
        return;
      }
      const rel = payloadObj.relative_path;
      const root = this.config.watched_root_path;
      if (!rel || !root) return;

      const absolutePath = path.join(root, rel);
      this.markWriting(absolutePath);
      try {
        if (item.type === 'cloud_file') {
          if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
          }
        } else {
          // cloud_folder：递归删除目录（空目录才删；非空目录保留以免误删用户数据）
          if (fs.existsSync(absolutePath)) {
            try {
              fs.rmSync(absolutePath, { recursive: false, force: true });
            } catch {
              // 非空目录或权限不足——元数据已删除，物理文件留给用户自行处理
            }
          }
        }
      } finally {
        this.unmarkWriting(absolutePath);
      }
    } catch (err) {
      console.warn(`[CloudDriveService] handleRemoteDelete 失败 ${itemId}:`, err);
    }
  }

  /**
   * 暴露给 SyncEngine 冲突解决回调：把本地原文件复制到冲突路径，
   * 以保留本地版本（元数据副本已由 SyncEngine 入库）。
   * 调用时机：SyncEngine.create(localItem.type, conflictPayload) 之前。
   */
  async handleCloudFileConflict(originalItemId: string, conflictRelativePath: string): Promise<void> {
    try {
      const root = this.config.watched_root_path;
      if (!root) return;

      const originalItem = this.itemsManager.getByIdIncludeDeleted(originalItemId);
      if (!originalItem || originalItem.type !== 'cloud_file') return;

      let originalPayload: CloudFilePayload | null = null;
      try {
        originalPayload = JSON.parse(originalItem.payload) as CloudFilePayload;
      } catch {
        return;
      }
      const originalAbs = path.join(root, originalPayload.relative_path || originalPayload.filename);
      const conflictAbs = path.join(root, conflictRelativePath);

      // 确保冲突文件父目录存在
      const conflictDir = path.dirname(conflictAbs);
      if (!fs.existsSync(conflictDir)) {
        fs.mkdirSync(conflictDir, { recursive: true });
      }

      // 复制原文件字节——元数据副本（SyncEngine.create）会指向 conflictAbs
      if (fs.existsSync(originalAbs)) {
        this.markWriting(conflictAbs);
        try {
          fs.copyFileSync(originalAbs, conflictAbs);
        } finally {
          this.unmarkWriting(conflictAbs);
        }
      }
      // 原文件不存在：远端会随后写入新版本，本地副本仅为占位——无需复制
    } catch (err) {
      console.warn(
        `[CloudDriveService] handleCloudFileConflict 失败 ${originalItemId}:`,
        err,
      );
    }
  }

  // ========== ID 派生 ==========

  /**
   * 由相对路径派生稳定 UUIDv5。
   * 相对路径不变 => ID 不变，实现"重启/重命名后保持同一 Item"。
   * 路径变化（重命名/移动）会被识别为新 Item + 旧 Item 软删除。
   */
  private deriveId(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    return crypto
      .createHash('sha1')
      .update(CLOUD_DRIVE_NAMESPACE + ':' + normalized)
      .digest()
      .slice(0, 16)
      .toString('hex')
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  }

  // ========== 垃圾过滤（闸门2）==========

  /**
   * 判断文件/目录是否应被忽略（基于 ignore_patterns + ignore_hidden）。
   * chokidar 的 ignored 既支持 glob 也支持函数；这里用函数避免与 awaitWriteFinish 冲突。
   */
  private isIgnored(targetPath: string, stats?: fs.Stats): boolean {
    const baseName = path.basename(targetPath);

    // 隐藏文件（. 开头）
    if (this.config.ignore_hidden && baseName.startsWith('.')) {
      return true;
    }

    // 通配符匹配（简易实现，支持 * 通配）
    for (const pattern of this.config.ignore_patterns) {
      if (this.matchGlob(baseName, pattern)) {
        return true;
      }
    }

    // 空名兜底
    if (!baseName) return true;

    // stats 可用时进一步过滤系统目录（可选）
    if (stats && stats.isDirectory()) {
      // node_modules 通常体积巨大且与笔记无关，默认忽略
      if (baseName === 'node_modules') return true;
    }

    return false;
  }

  /** 简易 glob 匹配：支持 *（任意字符）与字面量。 */
  private matchGlob(name: string, pattern: string): boolean {
    if (!pattern) return false;
    // 转义正则元字符，再把 \* 还原为 .*
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp('^' + regexStr + '$', 'i').test(name);
  }

  // ========== MIME 推断 ==========

  private guessMime(filePath: string): string {
    const guessed = mime.lookup(filePath);
    return guessed || 'application/octet-stream';
  }

  // ========== 相对路径工具 ==========

  private toRelative(absolutePath: string): string | null {
    if (!this.config.watched_root_path) return null;
    const rel = path.relative(this.config.watched_root_path, absolutePath);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      return null; // 路径不在监听根下
    }
    return rel;
  }

  /** 由相对路径推导 parent_folder_id（父目录的派生 ID；根级为 'root'） */
  private deriveParentFolderId(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/');
    const parentDir = path.posix.dirname(normalized);
    if (parentDir === '.' || parentDir === '') return 'root';
    return this.deriveId(parentDir);
  }

  // ========== chokidar 监听 ==========

  /**
   * 启动监听（闸门1 awaitWriteFinish + 闸门2 垃圾过滤）。
   * 注意：本层只负责元数据入库；去抖与上传由层5 处理。
   */
  async startWatching(): Promise<boolean> {
    if (!this.config.watched_root_path) {
      throw new Error('未配置监听目录');
    }
    if (this.watcher) {
      await this.stopWatching();
    }
    const root = this.config.watched_root_path;
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new Error('监听目录不存在或不是目录: ' + root);
    }

    console.log(`[CloudDriveService] 启动监听: ${root}`);

    this.watcher = chokidar.watch(root, {
      ignoreInitial: false,
      // chokidar 运行时会传入 (path, stats)，但 anymatch 的 AnymatchFn 类型只声明了 path。
      // 这里把 stats 标为可选，使函数既能拿到 stats 又能赋值给 AnymatchFn。
      ignored: (filePath: string, stats?: fs.Stats) => this.isIgnored(filePath, stats),
      awaitWriteFinish: {
        stabilityThreshold: this.config.stability_threshold,
        pollInterval: 500,
      },
      persistent: true,
      depth: undefined, // 不限制深度，支持任意层级子目录
      ignorePermissionErrors: true,
      usePolling: false,
    });

    this.watcher
      .on('add', (fp, stats) => this.onFileAdded(fp, stats))
      .on('addDir', (fp, stats) => this.onFolderAdded(fp, stats))
      .on('change', (fp, stats) => this.onFileChanged(fp, stats))
      .on('unlink', fp => this.onFileUnlinked(fp))
      .on('unlinkDir', fp => this.onFolderUnlinked(fp))
      .on('error', err => {
        console.error('[CloudDriveService] 监听错误:', err);
      })
      .on('ready', () => {
        console.log('[CloudDriveService] 初始扫描完成');
        this.emitWatchingChange(true);
      });

    return true;
  }

  async stopWatching(): Promise<boolean> {
    if (this.watcher) {
      console.log('[CloudDriveService] 停止监听');
      await this.watcher.close();
      this.watcher = null;
      this.emitWatchingChange(false);
    }
    return true;
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }

  /** 立即触发一次全量扫描（chokidar 内部会重新枚举并触发 add 事件） */
  async scanNow(): Promise<boolean> {
    if (!this.watcher) {
      // 未启动监听则临时启动一次扫描
      await this.startWatching();
      return true;
    }
    // 已在监听：重新扫描会重新触发 add/addDir（带去重逻辑）
    const root = this.config.watched_root_path;
    if (!root) return false;
    // chokidar 没有公开 rescan，这里手动遍历一次以补全遗漏
    this.walkAndEmit(root);
    return true;
  }

  /** 手动遍历目录并对每个文件/文件夹复用 onFileAdded/onFolderAdded */
  private walkAndEmit(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      console.error(`[CloudDriveService] 遍历目录失败: ${dir}`, err);
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (this.isIgnored(full)) continue;
      try {
        const stats = fs.statSync(full);
        if (entry.isDirectory()) {
          this.onFolderAdded(full, stats);
          this.walkAndEmit(full);
        } else if (entry.isFile()) {
          this.onFileAdded(full, stats);
        }
      } catch {
        // 文件可能在遍历中被删除，忽略
      }
    }
  }

  // ========== chokidar 事件处理 ==========

  private onFileAdded(absolutePath: string, stats?: fs.Stats): void {
    try {
      // 下载回环抑制：系统自身写入（下载/冲突复制）触发的 chokidar 事件直接跳过，
      // 否则刚下载完的文件会被当作本地修改重新入上传队列。
      if (this.writingPaths.has(absolutePath)) {
        return;
      }
      const rel = this.toRelative(absolutePath);
      if (!rel) return;
      const size = stats?.size ?? (fs.existsSync(absolutePath) ? fs.statSync(absolutePath).size : 0);
      const mtime = stats?.mtimeMs ?? Date.now();
      const id = this.deriveId(rel);

      // 大小上限校验（0 = 无限制）
      if (this.config.max_file_size > 0 && size > this.config.max_file_size) {
        console.warn(`[CloudDriveService] 文件超限，跳过: ${rel} (${size} bytes)`);
        return;
      }

      const payload: CloudFilePayload = {
        filename: path.basename(absolutePath),
        mime_type: this.guessMime(absolutePath),
        size,
        file_hash: '', // 层5 Scheduler 在上传前计算（避免每个变更都全量哈希）
        parent_folder_id: this.deriveParentFolderId(rel),
        relative_path: rel,
        mtime,
        upload_state: 'pending',
        chunk_size: this.config.chunk_size,
        total_chunks: 0,
        uploaded_chunks: [],
        upload_session_id: null,
        error_message: null,
        download_state: 'completed',
        downloaded_size: size,
        downloaded_at: mtime,
        download_error: null,
      };

      this.upsertCloudItem(id, 'cloud_file', payload, absolutePath);

      // 接线层5：交由 Scheduler 去抖 + 哈希比对 + 分块上传
      // （onFileChanged 委托给本方法，故此处一并覆盖 change 场景）
      this.notifyScheduler(id);
    } catch (err) {
      console.error(`[CloudDriveService] onFileAdded 失败: ${absolutePath}`, err);
    }
  }

  /**
   * 通知层5 Scheduler 有文件需要处理。
   * 通过动态 require 获取调度器，避免 CloudDriveService ↔ CloudDriveScheduler 静态循环依赖。
   * 文件夹（cloud_folder）不入队——processItem 会按 type 过滤，这里也只对文件调用。
   */
  private notifyScheduler(itemId: string): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      const scheduler = getCloudDriveScheduler();
      if (scheduler) {
        scheduler.enqueue(itemId);
      }
      // scheduler 尚未初始化（如启动早期）时静默跳过：retryAll 会在初始化后兜底重扫
    } catch (err) {
      console.warn('[CloudDriveService] 调度器未就绪，跳过 enqueue:', err);
    }
  }

  private onFolderAdded(absolutePath: string, stats?: fs.Stats): void {
    try {
      const rel = this.toRelative(absolutePath);
      if (!rel) return;
      const id = this.deriveId(rel);

      const payload: CloudFolderPayload = {
        name: path.basename(absolutePath),
        parent_folder_id: this.deriveParentFolderId(rel),
        relative_path: rel,
      };

      this.upsertCloudItem(id, 'cloud_folder', payload, absolutePath);
      void stats;
    } catch (err) {
      console.error(`[CloudDriveService] onFolderAdded 失败: ${absolutePath}`, err);
    }
  }

  private onFileChanged(absolutePath: string, stats?: fs.Stats): void {
    // 与 add 复用同一逻辑（update 会做 content_hash 变化检测）
    this.onFileAdded(absolutePath, stats);
  }

  private onFileUnlinked(absolutePath: string): void {
    try {
      // 下载回环抑制：系统自身删除（远端删除传播）触发的 unlink 事件直接跳过，
      // 否则删除会被回写为本地修改又触发 push，与远端已删除的状态冲突。
      if (this.writingPaths.has(absolutePath)) {
        return;
      }
      const rel = this.toRelative(absolutePath);
      if (!rel) return;
      const id = this.deriveId(rel);
      this.softDeleteCloudItem(id);
    } catch (err) {
      console.error(`[CloudDriveService] onFileUnlinked 失败: ${absolutePath}`, err);
    }
  }

  private onFolderUnlinked(absolutePath: string): void {
    try {
      if (this.writingPaths.has(absolutePath)) {
        return;
      }
      const rel = this.toRelative(absolutePath);
      if (!rel) return;
      const id = this.deriveId(rel);
      // 删除文件夹本身
      this.softDeleteCloudItem(id);
      // 级联软删除其下所有子孙（按 relative_path 前缀匹配）
      this.cascadeDeleteByPathPrefix(rel);
    } catch (err) {
      console.error(`[CloudDriveService] onFolderUnlinked 失败: ${absolutePath}`, err);
    }
  }

  // ========== 元数据 CRUD（封装 ItemsManager）==========

  private upsertCloudItem(
    id: string,
    type: 'cloud_file' | 'cloud_folder',
    payload: CloudFilePayload | CloudFolderPayload,
    _absolutePath: string
  ): void {
    const existing = this.itemsManager.getByIdIncludeDeleted(id);
    const now = Date.now();

    if (!existing) {
      // 新建（带固定 ID）。create 不支持自定义 ID 之外的 deleted_time，
      // 因此直接构造完整 ItemBase 走 createWithId（sync_status='clean' 由同步层改）。
      // 但 cloud_drive 同步走自己游标，这里用 'modified' 标记本地变更。
      const item: ItemBase = {
        id,
        type,
        created_time: now,
        updated_time: now,
        deleted_time: null,
        payload: JSON.stringify(payload),
        content_hash: this.computePayloadHash(JSON.stringify(payload)),
        sync_status: 'modified',
        local_rev: 1,
        remote_rev: null,
        encryption_applied: 0,
        schema_version: 1,
      };
      this.itemsManager.createWithId(item);
      console.log(`[CloudDriveService] 新增 ${type}: ${payload.relative_path ?? ''} -> ${id}`);
    } else if (existing.deleted_time !== null) {
      // 之前被软删除、现在又出现：恢复
      this.itemsManager.restore(id);
      // 恢复后再 update 元数据（updated_time/size 等）
      this.itemsManager.update(id, payload);
      console.log(`[CloudDriveService] 恢复 ${type}: ${id}`);
    } else {
      // 已存在且未删除：更新（ItemsManager.update 内部会做 content_hash 去重）
      this.itemsManager.update(id, payload);
    }
  }

  private softDeleteCloudItem(id: string): void {
    const ok = this.itemsManager.softDelete(id);
    if (ok) {
      console.log(`[CloudDriveService] 软删除: ${id}`);
    }
  }

  /** 级联软删除：所有 relative_path 以给定前缀开头的子孙项 */
  private cascadeDeleteByPathPrefix(prefix: string): void {
    const normalizedPrefix = prefix.replace(/\\/g, '/').replace(/\/+$/, '');
    try {
      // 直接用 db 查询找出所有未删除的 cloud 项，按相对路径前缀过滤
      const rows = this.queryAllCloudItems(false);
      for (const row of rows) {
        let payloadObj: { relative_path?: string } = {};
        try {
          payloadObj = JSON.parse(row.payload);
        } catch {
          continue;
        }
        const rp = (payloadObj.relative_path || '').replace(/\\/g, '/');
        if (!rp) continue;
        // 必须是严格后代（路径分隔符后缀匹配）
        if (rp === normalizedPrefix) continue;
        if (rp.startsWith(normalizedPrefix + '/') || rp.startsWith(normalizedPrefix + '\\')) {
          this.itemsManager.softDelete(row.id);
        }
      }
    } catch (err) {
      console.error('[CloudDriveService] cascadeDeleteByPathPrefix 失败:', err);
    }
  }

  private queryAllCloudItems(includeDeleted: boolean): Array<{ id: string; payload: string }> {
    // ItemsManager.getByType 已自动过滤 deleted_time IS NULL。
    // includeDeleted=true 时改用 getByIdIncludeDeleted 不可行（无全量接口），
    // 故此处仅用于"未删除"集合的级联删除场景；废弃的 includeDeleted 参数保留以便未来扩展。
    void includeDeleted;
    const files = this.itemsManager.getByType('cloud_file');
    const folders = this.itemsManager.getByType('cloud_folder');
    return files.concat(folders).map(i => ({ id: i.id, payload: i.payload }));
  }

  /** 与 ItemsManager.computeHash 保持一致的 16 位 sha256 前缀 */
  private computePayloadHash(payloadStr: string): string {
    return crypto.createHash('sha256').update(payloadStr).digest('hex').substring(0, 16);
  }

  // ========== 层7：UI 列表查询辅助 ==========

  /** 返回所有处于 error/pending 的 cloud_file id（供 retryAll IPC 使用） */
  listCloudFilesForRetry(): string[] {
    const out: string[] = [];
    const files = this.itemsManager.getByType('cloud_file');
    for (const f of files) {
      try {
        const p = JSON.parse(f.payload) as CloudFilePayload;
        if (p.upload_state === 'error' || p.upload_state === 'pending') {
          out.push(f.id);
        }
      } catch {
        /* 跳过 */
      }
    }
    return out;
  }

  /**
   * 返回 UI 所需的 cloud_file/cloud_folder 摘要列表。
   * 用于渲染层（重新）构建进度面板：包括 pending/uploading/paused/error/completed 全部状态。
   */
  listCloudItemsForUi(): Array<{ id: string; type: string; payload: CloudFilePayload | CloudFolderPayload }> {
    const files = this.itemsManager.getByType('cloud_file');
    const folders = this.itemsManager.getByType('cloud_folder');
    const out: Array<{ id: string; type: string; payload: CloudFilePayload | CloudFolderPayload }> = [];
    for (const f of files) {
      try {
        out.push({ id: f.id, type: 'cloud_file', payload: JSON.parse(f.payload) as CloudFilePayload });
      } catch {
        /* 跳过损坏 payload */
      }
    }
    for (const fo of folders) {
      try {
        out.push({ id: fo.id, type: 'cloud_folder', payload: JSON.parse(fo.payload) as CloudFolderPayload });
      } catch {
        /* 跳过 */
      }
    }
    return out;
  }

  // ========== 销毁 ==========

  dispose(): void {
    if (this.watcher) {
      this.watcher.close().catch(() => undefined);
      this.watcher = null;
    }
    // 清理下载回环抑制的兜底定时器
    for (const timer of this.writingTimers.values()) {
      clearTimeout(timer);
    }
    this.writingTimers.clear();
    this.writingPaths.clear();
    // C4：销毁调度器，中止所有在途上传的分组循环。
    // 通过动态 require 获取，避免与 CloudDriveScheduler 形成静态导入环。
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      getCloudDriveScheduler()?.dispose();
    } catch (err) {
      console.warn('[CloudDriveService] dispose 调度器失败:', err);
    }
    this.mainWindow = null;
  }
}

// ========== 模块级导出（单例 + IPC 注册）==========

export function initializeCloudDriveService(): void {
  if (cloudDriveService) return;
  // 复用 DatabaseService 已初始化的 itemsManager
  // 注意：必须在 initializeDatabase() 之后调用
  let itemsManager: ItemsManager;
  try {
    itemsManager = getItemsManagerInternal();
  } catch (err) {
    console.error('[CloudDriveService] 初始化失败：数据库未就绪', err);
    throw err;
  }
  const userDataPath = app.getPath('userData');
  cloudDriveService = new CloudDriveService(itemsManager, userDataPath);
  registerCloudDriveIpcHandlers();
  console.log('[CloudDriveService] 已初始化');
}

export function getCloudDriveService(): CloudDriveService | null {
  return cloudDriveService;
}

export function stopCloudDriveService(): void {
  if (cloudDriveService) {
    cloudDriveService.dispose();
    cloudDriveService = null;
    console.log('[CloudDriveService] 已停止');
  }
}

// 避免与 DatabaseService 形成静态导入环：通过动态 require 获取
function getItemsManagerInternal(): ItemsManager {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getItemsManager } = require('./DatabaseService') as typeof import('./DatabaseService');
  return getItemsManager();
}

// ========== IPC 处理器（与 useCloudDrive 契约一致）==========

export function registerCloudDriveIpcHandlers(): void {
  const svc = () => {
    if (!cloudDriveService) throw new Error('CloudDriveService 未初始化');
    return cloudDriveService;
  };

  ipcMain.handle('cloud-drive:getConfig', () => {
    return svc().getConfig();
  });

  ipcMain.handle(
    'cloud-drive:selectWatchedFolder',
    async (_event: IpcMainInvokeEvent): Promise<{ canceled: boolean; path?: string }> => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择网盘监听目录',
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }
      const selected = result.filePaths[0];
      svc().updateConfig({ watched_root_path: selected });
      return { canceled: false, path: selected };
    }
  );

  ipcMain.handle('cloud-drive:startWatching', async (): Promise<boolean> => {
    return svc().startWatching();
  });

  ipcMain.handle('cloud-drive:stopWatching', async (): Promise<boolean> => {
    return svc().stopWatching();
  });

  ipcMain.handle('cloud-drive:scanNow', async (): Promise<boolean> => {
    return svc().scanNow();
  });

  ipcMain.handle(
    'cloud-drive:updateConfig',
    (_event: IpcMainInvokeEvent, patch: Partial<CloudDriveConfig>): CloudDriveConfig => {
      return svc().updateConfig(patch || {});
    }
  );

  // ---------- 层7：手动控制（重试 / 取消 / 暂停 / 恢复 / 清空已完成）----------

  ipcMain.handle('cloud-drive:retryFailed', async (): Promise<{ enqueued: number }> => {
    // 复用 Scheduler.retryAll：内部会扫描 error/pending 项并重新入队
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
    const scheduler = getCloudDriveScheduler();
    if (!scheduler) return { enqueued: 0 };
    let enqueued = 0;
    const files = svc().listCloudFilesForRetry();
    for (const id of files) {
      if (scheduler.retryItem(id)) enqueued++;
    }
    return { enqueued };
  });

  ipcMain.handle(
    'cloud-drive:retryItem',
    (_event: IpcMainInvokeEvent, itemId: string): Promise<boolean> => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      const scheduler = getCloudDriveScheduler();
      if (!scheduler) return Promise.resolve(false);
      return Promise.resolve(scheduler.retryItem(itemId));
    }
  );

  ipcMain.handle(
    'cloud-drive:pauseItem',
    (_event: IpcMainInvokeEvent, itemId: string): Promise<boolean> => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      const scheduler = getCloudDriveScheduler();
      if (!scheduler) return Promise.resolve(false);
      return Promise.resolve(scheduler.pauseItem(itemId));
    }
  );

  ipcMain.handle(
    'cloud-drive:resumeItem',
    (_event: IpcMainInvokeEvent, itemId: string): Promise<boolean> => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      const scheduler = getCloudDriveScheduler();
      if (!scheduler) return Promise.resolve(false);
      return Promise.resolve(scheduler.resumeItem(itemId));
    }
  );

  ipcMain.handle(
    'cloud-drive:cancelUpload',
    (_event: IpcMainInvokeEvent, itemId: string): Promise<boolean> => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      const scheduler = getCloudDriveScheduler();
      if (!scheduler) return Promise.resolve(false);
      return Promise.resolve(scheduler.cancelUpload(itemId));
    }
  );

  ipcMain.handle('cloud-drive:clearCompleted', async (): Promise<{ cleared: string[] }> => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
    const scheduler = getCloudDriveScheduler();
    if (!scheduler) return { cleared: [] };
    return { cleared: scheduler.clearCompleted() };
  });

  // ---------- 层7：下载控制（P2-4）----------
  // 与上传侧一一对应：每个 handler 都通过动态 require 获取 Scheduler，
  // 委托给下载分支方法。独立的 download 队列/abort/in-flight 不影响上传。

  ipcMain.handle(
    'cloud-drive:downloadFile',
    (_event: IpcMainInvokeEvent, itemId: string): Promise<boolean> => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      const scheduler = getCloudDriveScheduler();
      if (!scheduler) return Promise.resolve(false);
      scheduler.enqueueDownload(itemId);
      return Promise.resolve(true);
    }
  );

  ipcMain.handle(
    'cloud-drive:pauseDownload',
    (_event: IpcMainInvokeEvent, itemId: string): Promise<boolean> => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      const scheduler = getCloudDriveScheduler();
      if (!scheduler) return Promise.resolve(false);
      return Promise.resolve(scheduler.pauseDownload(itemId));
    }
  );

  ipcMain.handle(
    'cloud-drive:resumeDownload',
    (_event: IpcMainInvokeEvent, itemId: string): Promise<boolean> => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      const scheduler = getCloudDriveScheduler();
      if (!scheduler) return Promise.resolve(false);
      return Promise.resolve(scheduler.resumeDownload(itemId));
    }
  );

  ipcMain.handle(
    'cloud-drive:cancelDownload',
    (_event: IpcMainInvokeEvent, itemId: string): Promise<boolean> => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      const scheduler = getCloudDriveScheduler();
      if (!scheduler) return Promise.resolve(false);
      return Promise.resolve(scheduler.cancelDownload(itemId));
    }
  );

  ipcMain.handle(
    'cloud-drive:retryDownload',
    (_event: IpcMainInvokeEvent, itemId: string): Promise<boolean> => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      const scheduler = getCloudDriveScheduler();
      if (!scheduler) return Promise.resolve(false);
      return Promise.resolve(scheduler.retryDownloadItem(itemId));
    }
  );

  ipcMain.handle('cloud-drive:retryAllDownloads', async (): Promise<{ enqueued: number }> => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
    const scheduler = getCloudDriveScheduler();
    if (!scheduler) return { enqueued: 0 };
    // 记录入队前 pending/error 数量作为参考（retryAllDownloads 内部扫描并重入队）
    scheduler.retryAllDownloads();
    return { enqueued: 1 };
  });

  ipcMain.handle('cloud-drive:clearCompletedDownloads', async (): Promise<{ cleared: string[] }> => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
    const scheduler = getCloudDriveScheduler();
    if (!scheduler) return { cleared: [] };
    return { cleared: scheduler.clearCompletedDownloads() };
  });

  ipcMain.handle('cloud-drive:listItems', async (): Promise<{ items: unknown[] }> => {
    // 返回当前所有未删除 cloud_file/cloud_folder 元数据（供 UI 重建进度列表）
    const svcInstance = svc();
    const items = svcInstance.listCloudItemsForUi();
    return { items };
  });
}
