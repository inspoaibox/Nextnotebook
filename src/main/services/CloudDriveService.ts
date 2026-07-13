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

import { app, ipcMain, IpcMainInvokeEvent, dialog, BrowserWindow, shell } from 'electron';
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
  CloudLocalAvailability,
  ItemBase,
} from '@shared/types';

type CloudDriveItemsChangedHint = {
  changedIds?: string[];
  deletedIds?: string[];
  full?: boolean;
};

type CloudDriveItemSnapshotForUi = {
  id: string;
  type: string;
  payload: CloudFilePayload | CloudFolderPayload;
  sync_status: ItemBase['sync_status'];
  remote_rev: string | null;
};

export type CloudDriveItemsChangedEvent = {
  at: number;
  full?: boolean;
  changed?: CloudDriveItemSnapshotForUi[];
  deletedIds?: string[];
};

export type CloudDriveDirectoryListingForUi = {
  folderPath: string;
  items: CloudDriveItemSnapshotForUi[];
  localStates: Record<string, { availability: CloudLocalAvailability }>;
  total: number;
  at: number;
};

type CloudDriveDirectoryIndexCache = {
  at: number;
  foldersByParent: Map<string, CloudDriveItemSnapshotForUi[]>;
  filesByParent: Map<string, CloudDriveItemSnapshotForUi[]>;
  folderItems: CloudDriveItemSnapshotForUi[];
  transferItems: CloudDriveItemSnapshotForUi[];
  itemParents: Map<string, string>;
  itemTypes: Map<string, 'cloud_file' | 'cloud_folder'>;
};

type CloudDrivePathLookupCache = {
  files: Map<string, string>;
  folders: Map<string, string>;
  itemPaths: Map<string, { type: 'cloud_file' | 'cloud_folder'; path: string }>;
};

// ========== 模块单例 ==========
let cloudDriveService: CloudDriveService | null = null;

// 用于派生稳定 ID 的命名空间 UUID（v5 NS）
// 固定值：com.mucheng.notes.cloud-drive 的 sha1 前 16 字节派生
const CLOUD_DRIVE_NAMESPACE = '6f3c1d2a-9b7e-4a8c-b5f3-2e1d0c9b8a74';

export class CloudDriveService {
  private static readonly VERBOSE_ITEM_LOGS = false;
  private static readonly LOCAL_STATES_CACHE_TTL_MS = 5_000;
  private static readonly CLOUD_ITEMS_UI_CACHE_TTL_MS = 5_000;
  private itemsManager: ItemsManager;
  private userDataPath: string;
  private configPath: string;
  private localStatePath: string;
  private config: CloudDriveConfig;
  private localAvailability: Record<string, CloudLocalAvailability>;
  private localStatesCache: {
    at: number;
    value: Record<string, { availability: CloudLocalAvailability }>;
  } | null = null;
  private cloudItemsUiCache: {
    at: number;
    items: CloudDriveItemSnapshotForUi[];
  } | null = null;
  private cloudDirectoryIndexCache: CloudDriveDirectoryIndexCache | null = null;
  private cloudItemPathLookupCache: CloudDrivePathLookupCache | null = null;
  private pendingItemsChangedFullRefresh = false;
  private pendingItemsChangedIds = new Set<string>();
  private pendingItemsDeletedIds = new Set<string>();

  private watcher: FSWatcher | null = null;
  private mainWindow: BrowserWindow | null = null;
  private itemsChangedTimer: NodeJS.Timeout | null = null;
  private consistencyTimer: NodeJS.Timeout | null = null;
  private static readonly CONSISTENCY_CHECK_INTERVAL_MS = 60_000;
  private lastSnapshotConsistencyAt = 0;
  private static readonly SNAPSHOT_CONSISTENCY_MIN_INTERVAL_MS = 30_000;

  // ========== 下载回环抑制（P2-4）==========
  // 当 CloudDriveScheduler 下载文件 / CloudDriveService 处理删除/冲突复制时，
  // 写入动作会触发 chokidar 事件，造成"下载完又触发上传"的回环。
  // 用 writingPaths 集合标记"本次写入由系统发起"，onFileAdded 命中即跳过。
  // writingTimers 是兜底机制：若写入过程崩溃导致 unmarkWriting 漏调，
  // 5s 后自动清理标记，避免长期屏蔽用户后续真实修改。
  private writingPaths = new Set<string>();
  private writingTimers = new Map<string, NodeJS.Timeout>();
  private static readonly WRITING_GUARD_TTL_MS = 5000;

  // ========== 重命名检测（Bug A 修复）==========
  // chokidar 不发独立 rename 事件，重命名 = unlink(旧名) + add(新名)。
  // 若两者各自独立处理，旧名软删除、新名当全新文件，会出现"改名后两个文件"，
  // 且旧名软删除若未及时推送，重开应用会被远端拉取复活并触发冲突副本（Bug B）。
  // 这里用一个时间窗缓冲：unlink 先记下被删项的 id/size/mtime，延迟一个短窗口再真正软删除；
  // 若窗口内出现一个 size+mtime 匹配的新文件，判定为重命名 → 迁移旧项（保留 id、改路径），
  // 而不是删旧建新。
  private recentUnlinks = new Map<string, { id: string; size: number; mtime: number; ts: number }>();
  private static readonly RENAME_WINDOW_MS = 1500;

  constructor(itemsManager: ItemsManager, userDataPath: string) {
    this.itemsManager = itemsManager;
    this.userDataPath = userDataPath;
    this.configPath = path.join(userDataPath, 'cloud-drive-config.json');
    this.localStatePath = path.join(userDataPath, 'cloud-drive-local-state.json');
    this.config = this.loadConfig();
    this.localAvailability = this.loadLocalAvailability();
  }

  // ========== 配置持久化 ==========

  private loadConfig(): CloudDriveConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<CloudDriveConfig>;
        // 与默认值合并，保证新增字段有兜底
        const merged = { ...DEFAULT_CLOUD_DRIVE_CONFIG, ...parsed };
        // 兼容旧版本默认值：若用户仍停留在历史默认 2s + 3s，自动迁移到更快的 0.8s + 0.8s。
        // 只在精确命中旧默认值时迁移，避免覆盖用户自定义调优。
        if (merged.stability_threshold === 2000 && merged.debounce_ms === 3000) {
          merged.stability_threshold = DEFAULT_CLOUD_DRIVE_CONFIG.stability_threshold;
          merged.debounce_ms = DEFAULT_CLOUD_DRIVE_CONFIG.debounce_ms;
        }
        return merged;
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

  private loadLocalAvailability(): Record<string, CloudLocalAvailability> {
    try {
      if (fs.existsSync(this.localStatePath)) {
        const raw = fs.readFileSync(this.localStatePath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, CloudLocalAvailability>;
        return parsed && typeof parsed === 'object' ? parsed : {};
      }
    } catch (err) {
      console.error('[CloudDriveService] 读取本地可用性状态失败，使用默认值:', err);
    }
    return {};
  }

  private saveLocalAvailability(): void {
    this.invalidateLocalStatesCache();
    try {
      fs.writeFileSync(this.localStatePath, JSON.stringify(this.localAvailability, null, 2), 'utf-8');
    } catch (err) {
      console.error('[CloudDriveService] 保存本地可用性状态失败:', err);
    }
  }

  private invalidateLocalStatesCache(): void {
    this.localStatesCache = null;
  }

  private invalidateCloudItemsUiCache(): void {
    this.cloudItemsUiCache = null;
  }

  private invalidateCloudDirectoryIndexCache(): void {
    this.cloudDirectoryIndexCache = null;
  }

  private invalidateCloudItemPathLookupCache(): void {
    this.cloudItemPathLookupCache = null;
  }

  getConfig(): CloudDriveConfig {
    return { ...this.config };
  }

  updateConfig(patch: Partial<CloudDriveConfig>): CloudDriveConfig {
    this.config = { ...this.config, ...patch };
    this.invalidateLocalStatesCache();
    this.invalidateCloudItemsUiCache();
    this.invalidateCloudDirectoryIndexCache();
    this.invalidateCloudItemPathLookupCache();
    this.saveConfig();
    return { ...this.config };
  }

  getLocalStates(): Record<string, { availability: CloudLocalAvailability }> {
    const now = Date.now();
    if (
      this.localStatesCache &&
      now - this.localStatesCache.at < CloudDriveService.LOCAL_STATES_CACHE_TTL_MS
    ) {
      return { ...this.localStatesCache.value };
    }

    const out: Record<string, { availability: CloudLocalAvailability }> = {};
    const files = this.itemsManager.getByType('cloud_file');
    const root = this.config.watched_root_path;
    for (const file of files) {
      let absPath: string | null = null;
      if (root) {
        try {
          const payload = JSON.parse(file.payload) as CloudFilePayload;
          if (payload.relative_path) {
            absPath = path.join(root, payload.relative_path);
          }
        } catch {
          absPath = null;
        }
      }
      const stored = this.localAvailability[file.id];
      const exists = !!absPath && fs.existsSync(absPath);
      out[file.id] = {
        availability: exists
          ? (stored === 'offline' ? 'offline' : 'local')
          : 'online_only',
      };
    }
    this.localStatesCache = { at: now, value: out };
    return { ...out };
  }

  private getCloudFilePayload(itemId: string): CloudFilePayload | null {
    const item = this.itemsManager.getById(itemId);
    if (!item || item.type !== 'cloud_file') return null;
    try {
      return JSON.parse(item.payload) as CloudFilePayload;
    } catch {
      return null;
    }
  }

  private getAbsolutePathForCloudFile(itemId: string): string | null {
    const payload = this.getCloudFilePayload(itemId);
    const root = this.config.watched_root_path;
    if (!payload || !root) return null;
    return path.join(root, payload.relative_path);
  }

  private getEffectiveAvailability(itemId: string): CloudLocalAvailability {
    const stored = this.localAvailability[itemId];
    const absPath = this.getAbsolutePathForCloudFile(itemId);
    const exists = !!absPath && fs.existsSync(absPath);
    if (!exists) return 'online_only';
    return stored === 'offline' ? 'offline' : 'local';
  }

  private enqueueDownloadsForLocalAvailability(itemIds: string[]): void {
    if (itemIds.length === 0) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      const scheduler = getCloudDriveScheduler();
      for (const itemId of itemIds) {
        scheduler?.enqueueDownload(itemId);
      }
    } catch (err) {
      console.warn('[CloudDriveService] 本地可用性触发下载失败:', err);
    }
  }

  /**
   * 删除保护只认“用户显式设置为仅云端”。
   * 不能根据“文件此刻不存在”反推 online_only，否则用户手动删除后会被误判成占位文件，
   * 导致 unlink / reconcile 跳过软删除，界面与云端都残留幽灵记录。
   */
  private isExplicitOnlineOnly(itemId: string): boolean {
    return this.localAvailability[itemId] === 'online_only';
  }

  markLocalCopyPresent(itemId: string, relativePath?: string): void {
    const previous = this.localAvailability[itemId];
    if (previous === 'local' || previous === 'offline') return;
    this.localAvailability[itemId] = 'local';

    if (relativePath) {
      let parent = path.dirname(relativePath.replace(/\\/g, '/'));
      while (parent && parent !== '.' && parent !== '/') {
        const parentId = this.resolveCloudItemIdByRelativePath('cloud_folder', parent);
        const parentPrevious = this.localAvailability[parentId];
        if (parentPrevious !== 'local' && parentPrevious !== 'offline') {
          this.localAvailability[parentId] = 'local';
        }
        parent = path.dirname(parent);
      }
    }

    this.saveLocalAvailability();
  }

  private hasLocalCopyProof(itemId: string): boolean {
    const availability = this.localAvailability[itemId];
    return availability === 'local' || availability === 'offline';
  }

  private hasCompletedLocalCopyPayload(payload: {
    size?: number;
    file_hash?: string;
    download_state?: string;
    downloaded_size?: number;
    downloaded_at?: number | null;
  }): boolean {
    const size = Number(payload.size ?? 0);
    const downloadedSize = Number(payload.downloaded_size ?? 0);
    return (
      payload.download_state === 'completed' &&
      !!payload.file_hash &&
      payload.downloaded_at != null &&
      (size <= 0 || downloadedSize >= size)
    );
  }

  /**
   * 远端拉下来的网盘元数据可能还没有本机物理副本，尤其是在 auto_download=false 时。
   * 这类 clean + remote_rev 的记录缺少本地存在证明时，不能因为磁盘路径不存在就反推为删除。
   */
  private shouldPreserveMissingRemoteOnlyItem(
    item: ItemBase | undefined,
    payload: {
      relative_path?: string;
      download_state?: string;
      upload_state?: string;
      file_hash?: string;
      size?: number;
      downloaded_size?: number;
      downloaded_at?: number | null;
    }
  ): boolean {
    if (!item || (item.type !== 'cloud_file' && item.type !== 'cloud_folder')) return false;
    if (this.isExplicitOnlineOnly(item.id)) return true;
    if (this.hasLocalCopyProof(item.id)) return false;
    if (item.sync_status !== 'clean' || !item.remote_rev) return false;

    if (item.type === 'cloud_file') {
      const needsLocalMaterialization =
        payload.download_state !== 'completed' ||
        payload.upload_state !== 'completed' ||
        !payload.file_hash;
      if (needsLocalMaterialization) return true;
      return (
        this.localAvailability[item.id] === undefined &&
        !this.hasCompletedLocalCopyPayload(payload)
      );
    }

    return this.localAvailability[item.id] === undefined;
  }

  async openLocalFile(itemId: string): Promise<boolean> {
    const absPath = this.getAbsolutePathForCloudFile(itemId);
    if (!absPath || !fs.existsSync(absPath)) return false;
    try {
      const result = await shell.openPath(absPath);
      if (result) {
        console.warn(`[CloudDriveService] 打开本地文件失败: ${absPath} -> ${result}`);
        return false;
      }
      return true;
    } catch (err) {
      console.warn(`[CloudDriveService] 打开本地文件异常: ${absPath}`, err);
      return false;
    }
  }

  async openLocalDirectory(folderPath: string): Promise<boolean> {
    const root = this.config.watched_root_path;
    if (!root) return false;
    const normalized = String(folderPath || '').split('/').filter(Boolean).join(path.sep);
    const absPath = normalized ? path.join(root, normalized) : root;
    if (!fs.existsSync(absPath)) return false;
    try {
      const result = await shell.openPath(absPath);
      if (result) {
        console.warn(`[CloudDriveService] 打开本地目录失败: ${absPath} -> ${result}`);
        return false;
      }
      return true;
    } catch (err) {
      console.warn(`[CloudDriveService] 打开本地目录异常: ${absPath}`, err);
      return false;
    }
  }

  setLocalAvailability(itemId: string, availability: CloudLocalAvailability): boolean {
    const payload = this.getCloudFilePayload(itemId);
    if (!payload) return false;
    const absPath = this.getAbsolutePathForCloudFile(itemId);
    const previous = this.localAvailability[itemId];

    if (availability === 'online_only' && absPath && fs.existsSync(absPath)) {
      this.localAvailability[itemId] = availability;
      this.saveLocalAvailability();
      this.markWriting(absPath);
      try {
        fs.unlinkSync(absPath);
      } catch (err) {
        if (previous) {
          this.localAvailability[itemId] = previous;
        } else {
          delete this.localAvailability[itemId];
        }
        this.saveLocalAvailability();
        console.warn(`[CloudDriveService] 删除本地副本失败: ${absPath}`, err);
        return false;
      }
      return true;
    }

    this.localAvailability[itemId] = availability;
    this.saveLocalAvailability();

    if ((availability === 'local' || availability === 'offline') && (!absPath || !fs.existsSync(absPath))) {
      this.enqueueDownloadsForLocalAvailability([itemId]);
    }

    return true;
  }

  setFolderLocalAvailability(folderPath: string, availability: CloudLocalAvailability): number {
    const normalized = String(folderPath || '').split('/').filter(Boolean).join('/');
    const files = this.itemsManager.getByType('cloud_file');
    let changed = 0;
    let shouldSave = false;
    let shouldInvalidateLocalStates = false;
    const downloadsToQueue: string[] = [];
    const root = this.config.watched_root_path;

    for (const file of files) {
      let payload: CloudFilePayload | null = null;
      try {
        payload = JSON.parse(file.payload) as CloudFilePayload;
      } catch {
        payload = null;
      }
      if (!payload) continue;
      const rel = String(payload.relative_path || '');
      const inFolder = normalized
        ? rel === normalized || rel.startsWith(normalized + '/')
        : true;
      if (!inFolder) continue;

      const absPath = root ? path.join(root, payload.relative_path) : null;
      const previous = this.localAvailability[file.id];
      const exists = !!absPath && fs.existsSync(absPath);

      if (availability === 'online_only' && absPath && exists) {
        this.localAvailability[file.id] = availability;
        shouldSave = shouldSave || previous !== availability;
        this.markWriting(absPath);
        try {
          fs.unlinkSync(absPath);
          shouldInvalidateLocalStates = true;
          changed++;
        } catch (err) {
          if (previous) {
            this.localAvailability[file.id] = previous;
          } else {
            delete this.localAvailability[file.id];
          }
          shouldSave = true;
          console.warn(`[CloudDriveService] 删除本地副本失败: ${absPath}`, err);
        }
        continue;
      }

      this.localAvailability[file.id] = availability;
      shouldSave = shouldSave || previous !== availability;
      shouldInvalidateLocalStates = shouldInvalidateLocalStates || previous !== availability;
      if ((availability === 'local' || availability === 'offline') && (!absPath || !exists)) {
        downloadsToQueue.push(file.id);
      }
      changed++;
    }

    if (shouldSave) {
      this.saveLocalAvailability();
    } else if (shouldInvalidateLocalStates) {
      this.invalidateLocalStatesCache();
    }
    this.enqueueDownloadsForLocalAvailability(downloadsToQueue);

    return changed;
  }

  // ========== 主窗口（事件推送）==========

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
    if (win) {
      this.emitWatchingChange(this.isWatching());
    }
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
    if (progress.state === 'completed' || progress.state === 'error' || progress.state === 'paused') {
      this.invalidateCloudItemsUiCache();
    }
    this.emit('cloud-drive:uploadProgress', progress);
  }

  /** 推送下载进度（层5 调用；层4 仅保留接口） */
  emitDownloadProgress(progress: CloudDownloadProgress): void {
    if (progress.state === 'completed' || progress.state === 'error' || progress.state === 'paused') {
      this.invalidateCloudItemsUiCache();
      this.invalidateLocalStatesCache();
    }
    this.emit('cloud-drive:downloadProgress', progress);
  }

  /** 推送目录/文件元数据变更（用于前端更新目录树快照）。 */
  private emitItemsChanged(
    localMutation: boolean = false,
    hint?: CloudDriveItemsChangedHint
  ): void {
    this.invalidateCloudItemsUiCache();
    this.invalidateLocalStatesCache();
    this.updateCloudItemPathLookupCache(hint);
    this.updateCloudDirectoryIndexCache(hint);
    this.queueItemsChangedHint(hint);
    if (this.itemsChangedTimer) {
      clearTimeout(this.itemsChangedTimer);
    }
    this.itemsChangedTimer = setTimeout(() => {
      this.itemsChangedTimer = null;
      this.emit('cloud-drive:itemsChanged', this.consumeItemsChangedEvent());
      if (localMutation) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { scheduleCloudDriveSync } = require('./SyncService') as typeof import('./SyncService');
          scheduleCloudDriveSync(2000);
        } catch (err) {
          console.warn('[CloudDriveService] 触发网盘自动同步失败:', err);
        }
      }
    }, 120);
  }

  notifyItemsChanged(hint?: CloudDriveItemsChangedHint): void {
    this.emitItemsChanged(false, hint);
  }

  private queueItemsChangedHint(hint?: CloudDriveItemsChangedHint): void {
    if (!hint || hint.full) {
      this.pendingItemsChangedFullRefresh = true;
      return;
    }

    for (const id of hint.changedIds || []) {
      if (!id) continue;
      this.pendingItemsChangedIds.add(id);
      this.pendingItemsDeletedIds.delete(id);
    }
    for (const id of hint.deletedIds || []) {
      if (!id) continue;
      this.pendingItemsDeletedIds.add(id);
      this.pendingItemsChangedIds.delete(id);
    }
  }

  private consumeItemsChangedEvent(): CloudDriveItemsChangedEvent {
    const full = this.pendingItemsChangedFullRefresh;
    const changedIds = Array.from(this.pendingItemsChangedIds);
    const deletedIds = Array.from(this.pendingItemsDeletedIds);

    this.pendingItemsChangedFullRefresh = false;
    this.pendingItemsChangedIds.clear();
    this.pendingItemsDeletedIds.clear();

    if (full) {
      return { at: Date.now(), full: true };
    }

    return {
      at: Date.now(),
      changed: this.getCloudItemSnapshotsByIds(changedIds),
      deletedIds,
    };
  }

  private getCloudItemSnapshotsByIds(ids: string[]): CloudDriveItemSnapshotForUi[] {
    const out: CloudDriveItemSnapshotForUi[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const item = this.itemsManager.getByIdIncludeDeleted(id);
      if (!item) continue;
      const snapshot = this.snapshotCloudItemForUi(item);
      if (snapshot) out.push(snapshot);
    }
    return out;
  }

  private repairUnconfirmedCloudItems(): void {
    const repaired = this.itemsManager.markUnconfirmedCloudItemsForSync();
    if (repaired <= 0) return;

    console.warn(`[CloudDriveService] 修复 ${repaired} 个未确认远端版本的网盘元数据，重新同步`);
    this.emitItemsChanged(true);
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
   * 由相对路径派生稳定 UUIDv5，作为首次入库时的默认 ID。
   * 已经通过重命名/移动保留旧 ID 的记录，会先按 payload.relative_path 反查。
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

  private findCloudItemIdByRelativePath(
    type: 'cloud_file' | 'cloud_folder',
    relativePath: string
  ): string | null {
    const normalized = this.normalizeCloudRelativePath(relativePath);
    if (!normalized) return null;
    const cache = this.getCloudItemPathLookupCache();
    const target = type === 'cloud_file' ? cache.files : cache.folders;
    return target.get(normalized) ?? null;
  }

  private resolveCloudItemIdByRelativePath(
    type: 'cloud_file' | 'cloud_folder',
    relativePath: string
  ): string {
    return this.findCloudItemIdByRelativePath(type, relativePath) ?? this.deriveId(relativePath);
  }

  private createCloudItemPathLookupCache(): CloudDrivePathLookupCache {
    return {
      files: new Map(),
      folders: new Map(),
      itemPaths: new Map(),
    };
  }

  private getCloudItemPathLookupCache(): CloudDrivePathLookupCache {
    if (this.cloudItemPathLookupCache) {
      return this.cloudItemPathLookupCache;
    }

    const cache = this.createCloudItemPathLookupCache();
    if (typeof (this.itemsManager as any).getByType !== 'function') {
      this.cloudItemPathLookupCache = cache;
      return cache;
    }

    try {
      for (const folder of this.itemsManager.getByType('cloud_folder')) {
        this.addItemToPathLookupCache(cache, folder);
      }
      for (const file of this.itemsManager.getByType('cloud_file')) {
        this.addItemToPathLookupCache(cache, file);
      }
    } catch {
      // 测试桩或数据库暂不可用时退回路径派生 ID。
    }

    this.cloudItemPathLookupCache = cache;
    return cache;
  }

  private addItemToPathLookupCache(cache: CloudDrivePathLookupCache, item: ItemBase): void {
    if (item.deleted_time !== null) return;
    if (item.type !== 'cloud_file' && item.type !== 'cloud_folder') return;
    try {
      const payload = JSON.parse(item.payload) as { relative_path?: string };
      const relativePath = this.normalizeCloudRelativePath(payload.relative_path);
      if (!relativePath) return;
      this.removeItemFromPathLookupCache(cache, item.id);
      const target = item.type === 'cloud_file' ? cache.files : cache.folders;
      target.set(relativePath, item.id);
      cache.itemPaths.set(item.id, { type: item.type, path: relativePath });
    } catch {
      // 损坏 payload 不进入路径索引。
    }
  }

  private removeItemFromPathLookupCache(
    cache: CloudDrivePathLookupCache,
    itemId: string
  ): void {
    const previous = cache.itemPaths.get(itemId);
    if (!previous) return;
    const target = previous.type === 'cloud_file' ? cache.files : cache.folders;
    if (target.get(previous.path) === itemId) {
      target.delete(previous.path);
    }
    cache.itemPaths.delete(itemId);
  }

  private updateCloudItemPathLookupCache(hint?: CloudDriveItemsChangedHint): void {
    const cache = this.cloudItemPathLookupCache;
    if (!cache) return;
    if (!hint || hint.full) {
      this.invalidateCloudItemPathLookupCache();
      return;
    }

    for (const id of hint.deletedIds || []) {
      this.removeItemFromPathLookupCache(cache, id);
    }
    if (typeof (this.itemsManager as any).getByIdIncludeDeleted !== 'function') {
      this.invalidateCloudItemPathLookupCache();
      return;
    }
    for (const id of hint.changedIds || []) {
      this.removeItemFromPathLookupCache(cache, id);
      const item = this.itemsManager.getByIdIncludeDeleted(id);
      if (item) this.addItemToPathLookupCache(cache, item);
    }
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
    const normalized = this.normalizeCloudRelativePath(relativePath);
    const parentDir = path.posix.dirname(normalized);
    if (parentDir === '.' || parentDir === '') return 'root';
    return this.findCloudItemIdByRelativePath('cloud_folder', parentDir) ?? this.deriveId(parentDir);
  }

  private startConsistencyWatch(): void {
    this.stopConsistencyWatch();
    const timer = setInterval(() => {
      try {
        this.ensureSnapshotConsistency(false);
      } catch (err) {
        console.warn('[CloudDriveService] 一致性巡检失败:', err);
      }
    }, CloudDriveService.CONSISTENCY_CHECK_INTERVAL_MS);
    if (typeof timer.unref === 'function') timer.unref();
    this.consistencyTimer = timer;
  }

  private stopConsistencyWatch(): void {
    if (this.consistencyTimer) {
      clearInterval(this.consistencyTimer);
      this.consistencyTimer = null;
    }
  }

  private ensureSnapshotConsistency(force: boolean = false): void {
    this.repairUnconfirmedCloudItems();

    const root = this.config.watched_root_path;
    if (!root || !fs.existsSync(root)) return;
    const now = Date.now();
    if (!force && now - this.lastSnapshotConsistencyAt < CloudDriveService.SNAPSHOT_CONSISTENCY_MIN_INTERVAL_MS) {
      return;
    }
    this.lastSnapshotConsistencyAt = now;
    this.walkAndEmit(root);
    this.reconcileDeletedItems();
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
        // 初始正向扫描结束后做反向对账：app 离线期间被删除的文件在此补偿清理
        this.reconcileDeletedItems();
        // 与应用冷启动时 main.ts 中的 retryAll 语义保持一致：
        // 手动“开始监听”后，也要把当前会话遗留的 pending/error 项重新入队，
        // 否则 startWatching 期间被 onFileAdded 去重短路的旧任务不会自动续传。
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
          getCloudDriveScheduler()?.retryAll();
        } catch (err) {
          console.warn('[CloudDriveService] ready 阶段补做 retryAll 失败:', err);
        }
        this.startConsistencyWatch();
        this.emitWatchingChange(true);
      });

    return true;
  }

  async stopWatching(): Promise<boolean> {
    if (this.watcher) {
      console.log('[CloudDriveService] 停止监听');
      await this.watcher.close();
      this.watcher = null;
      this.stopConsistencyWatch();
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
    this.ensureSnapshotConsistency(true);
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

  /**
   * 反向对账（补偿离线删除）。
   * walkAndEmit 只做"磁盘存在 → 入库"的正向 upsert；而 chokidar 的 unlink/unlinkDir
   * 仅在监听存活时触发。若 app 离线期间用户/其他程序删掉了文件，重启后这些删除
   * 永远不会被捕获，DB 中残留的 cloud 项就成了幽灵记录。
   * 此方法枚举 DB 中所有未删除的 cloud 项，凡磁盘对应路径已不存在（且非系统正在写入）
   * 一律软删除。在 scanNow 与初始扫描 'ready' 后调用。
   */
  private reconcileDeletedItems(): void {
    const root = this.config.watched_root_path;
    if (!root) return;
    let rows: Array<{ id: string; payload: string }>;
    try {
      rows = this.queryAllCloudItems(false);
    } catch (err) {
      console.error('[CloudDriveService] reconcileDeletedItems 查询失败:', err);
      return;
    }
    let removed = 0;
    for (const row of rows) {
      try {
        const payloadObj = JSON.parse(row.payload) as { relative_path?: string };
        const rel = payloadObj.relative_path;
        if (!rel) continue;
        const abs = path.join(root, rel);
        // 系统自身正在写入（下载/冲突复制）的路径跳过，避免误删正在落地的文件
        if (this.writingPaths.has(abs)) continue;
        const item = this.itemsManager.getByIdIncludeDeleted(row.id);
        if (this.shouldPreserveMissingRemoteOnlyItem(item, payloadObj)) continue;
        if (!fs.existsSync(abs)) {
          this.softDeleteCloudItem(row.id);
          removed++;
        }
      } catch {
        // 损坏 payload 跳过
      }
    }
    if (removed > 0) {
      console.log(`[CloudDriveService] 反向对账：补偿删除 ${removed} 个离线删除项`);
      this.emitItemsChanged(true);
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
      const id = this.resolveCloudItemIdByRelativePath('cloud_file', rel);

      // 大小上限校验（0 = 无限制）
      if (this.config.max_file_size > 0 && size > this.config.max_file_size) {
        console.warn(`[CloudDriveService] 文件超限，跳过: ${rel} (${size} bytes)`);
        return;
      }
      this.markLocalCopyPresent(id, rel);

      // 闸门：扫描/变更事件去重。
      // 若该文件已存在、已上传完成（upload_state==='completed'）且 size+mtime 均未变，
      // 则视为内容未变，直接短路——既不重写 payload（避免把已存储的 file_hash 清成 ''），
      // 也不入队 Scheduler。否则旧逻辑会每次「立即扫描」都重置 file_hash=''，
      // 导致 Scheduler 的哈希闸门（newHash === payload.file_hash）恒为 false → 全量重传。
      // 注：size 是主信号，mtime 仅作辅助（按毫秒取整容忍亚毫秒抖动）；
      //     真正的内容校验仍由首次上传与内容变更路径的流式 SHA-256 兜底。
      const existing = this.itemsManager.getByIdIncludeDeleted(id);
      if (existing && existing.deleted_time === null && existing.type === 'cloud_file') {
        let existingPayload: CloudFilePayload | null = null;
        try {
          existingPayload = JSON.parse(existing.payload) as CloudFilePayload;
        } catch {
          existingPayload = null;
        }
        if (
          existingPayload &&
          existingPayload.size === size &&
          Math.floor(existingPayload.mtime) === Math.floor(mtime) &&
          existingPayload.upload_state === 'completed'
        ) {
          // 已上传且未变化：保留既有 file_hash/upload_state，跳过本次处理。
          return;
        }
        // 上传中且内容未变（size+mtime 一致）：绝不能用空 payload 覆盖。
        // 否则会把已计算的 file_hash 清成 ''、uploaded_chunks 清成 []，
        // processItem 的哈希闸门因此恒为 false → 从 chunk 0 整个重传，
        // 表现为进度反复从约 1 个分块边界（如 26%）倒退回 0。
        // 这里直接跳过，让正在跑的 runUpload 继续，不再重复入队。
        if (
          existingPayload &&
          existingPayload.size === size &&
          Math.floor(existingPayload.mtime) === Math.floor(mtime) &&
          (existingPayload.upload_state === 'uploading' ||
            existingPayload.upload_state === 'pending')
        ) {
          return;
        }
      }

      // 重命名检测（Bug A）：若存在一个最近被 unlink 且 size+mtime 匹配的旧项，
      // 则判定为重命名而非新增——迁移旧项到新路径（保留 id、payload），避免"两个文件"。
      // 这样新文件沿用旧 id，旧名不会被软删除（窗口内已消费），服务端只看到一次 rename。
      const renamedFromId = this.findRenameMatch(size, mtime);
      if (renamedFromId) {
        this.recentUnlinks.delete(renamedFromId);
        this.applyRename(renamedFromId, absolutePath, rel, size, mtime);
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
      const id = this.resolveCloudItemIdByRelativePath('cloud_folder', rel);
      this.markLocalCopyPresent(id, rel);

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
      const id = this.resolveCloudItemIdByRelativePath('cloud_file', rel);
      if (this.isExplicitOnlineOnly(id)) {
        return;
      }

      // 重命名检测：先记录 unlink，延迟到时间窗结束再真正软删除。
      // 取旧项的 size/mtime 作为重命名匹配依据。
      const existing = this.itemsManager.getByIdIncludeDeleted(id);
      let existingSize = 0;
      let existingMtime = 0;
      if (existing && existing.deleted_time === null && existing.type === 'cloud_file') {
        try {
          const p = JSON.parse(existing.payload) as CloudFilePayload;
          existingSize = p.size ?? 0;
          existingMtime = p.mtime ?? 0;
        } catch {
          /* 忽略 payload 解析失败 */
        }
      }

      if (existingSize > 0) {
        const unlinkTs = Date.now();
        this.recentUnlinks.set(id, { id, size: existingSize, mtime: existingMtime, ts: unlinkTs });
        // 延迟真正软删除：若窗口内出现 size+mtime 匹配的 add，则按重命名处理而非删除。
        setTimeout(() => {
          const pending = this.recentUnlinks.get(id);
          // 仅当缓冲项仍是我记录的那次 unlink（未被 add 消费）时才真正软删除。
          // add 命中会 delete 掉这个条目；若期间又来了一次同名 unlink，ts 不同也不应误删。
          if (pending && pending.ts === unlinkTs) {
            this.recentUnlinks.delete(id);
            this.softDeleteCloudItem(id);
          }
        }, CloudDriveService.RENAME_WINDOW_MS);
        return;
      }

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
      const id = this.resolveCloudItemIdByRelativePath('cloud_folder', rel);
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
    const payloadStr = JSON.stringify(payload);
    const payloadHash = this.computePayloadHash(payloadStr);

    if (!existing) {
      // 新建（带固定 ID）。不能走 createWithId：它是远端拉取专用入口，
      // 会强制把 sync_status 写成 clean。网盘本地扫描发现的新文件/目录
      // 必须保持 modified，否则空目录和未进入上传调度的文件不会被元数据同步推到云端。
      const item: ItemBase = {
        id,
        type,
        created_time: now,
        updated_time: now,
        deleted_time: null,
        payload: payloadStr,
        content_hash: payloadHash,
        sync_status: 'modified',
        local_rev: 1,
        remote_rev: null,
        encryption_applied: 0,
        schema_version: 1,
      };
      this.itemsManager.upsertFromPlainItem(item, 'modified');
      if (CloudDriveService.VERBOSE_ITEM_LOGS) {
        console.log(`[CloudDriveService] 新增 ${type}: ${payload.relative_path ?? ''} -> ${id}`);
      }
      this.emitItemsChanged(true, { changedIds: [id] });
    } else if (existing.deleted_time !== null) {
      // 之前被软删除、现在又出现：恢复
      const restored = this.itemsManager.restore(id);
      // 恢复后再 update 元数据（updated_time/size 等）
      const updated = this.itemsManager.update(id, payload);
      if (CloudDriveService.VERBOSE_ITEM_LOGS) {
        console.log(`[CloudDriveService] 恢复 ${type}: ${id}`);
      }
      if (restored || updated?.content_hash !== existing.content_hash) {
        this.emitItemsChanged(true, { changedIds: [id] });
      }
    } else {
      // 已存在且未删除：更新（ItemsManager.update 内部会做 content_hash 去重）
      if (existing.content_hash === payloadHash) {
        if (existing.sync_status === 'clean' && existing.remote_rev === null) {
          const repaired = this.itemsManager.markUnconfirmedCloudItemForSync(id);
          if (repaired) {
            console.warn(`[CloudDriveService] 修复未确认远端版本的 ${type}: ${payload.relative_path ?? id}`);
            this.emitItemsChanged(true, { changedIds: [id] });
          }
        }
        return;
      }
      this.itemsManager.update(id, payload);
      this.emitItemsChanged(true, { changedIds: [id] });
    }
  }

  private softDeleteCloudItem(id: string): void {
    this.discardUploadForLocalDelete(id);
    const ok = this.itemsManager.softDelete(id);
    if (ok) {
      this.invalidateLocalStatesCache();
      if (CloudDriveService.VERBOSE_ITEM_LOGS) {
        console.log(`[CloudDriveService] 软删除: ${id}`);
      }
      this.emitItemsChanged(true, { deletedIds: [id] });
    }
  }

  private discardUploadForLocalDelete(id: string): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      getCloudDriveScheduler()?.discardUploadForLocalDelete(id);
    } catch (err) {
      console.warn(`[CloudDriveService] 停止本地删除项上传失败: ${id}`, err);
    }
  }

  /**
   * 在最近 unlink 缓冲中找一个 size+mtime 匹配的旧项（重命名来源）。
   * 匹配标准：size 完全相等 + mtime 毫秒取整相等（容忍亚毫秒抖动）。
   * 同时过滤掉已过期的缓冲项（超过 RENAME_WINDOW_MS 视为真删除，已由 setTimeout 软删除）。
   */
  private findRenameMatch(size: number, mtime: number): string | null {
    const now = Date.now();
    let matchId: string | null = null;
    for (const [id, info] of this.recentUnlinks) {
      if (now - info.ts > CloudDriveService.RENAME_WINDOW_MS * 2) {
        // 超时兜底清理（正常情况 setTimeout 已删，这里防重复 match）
        this.recentUnlinks.delete(id);
        continue;
      }
      if (info.size === size && Math.floor(info.mtime) === Math.floor(mtime)) {
        matchId = id;
        break;
      }
    }
    return matchId;
  }

  /**
   * 重命名迁移：把旧 id 对应的 cloud_file 迁移到新路径。
   * 保留旧 id（这样服务端是"同一项更新"而非"删除+新建"），更新 filename/relative_path/size/mtime，
   * 并触发 Scheduler 重新校验上传（内容哈希未变则不会重传）。
   */
  private applyRename(
    oldId: string,
    absolutePath: string,
    rel: string,
    size: number,
    mtime: number
  ): void {
    const old = this.itemsManager.getByIdIncludeDeleted(oldId);
    if (!old || old.deleted_time !== null || old.type !== 'cloud_file') {
      // 旧项已不存在或已真正删除 → 退化为普通新增
      return;
    }
    let oldPayload: CloudFilePayload;
    try {
      oldPayload = JSON.parse(old.payload) as CloudFilePayload;
    } catch {
      return;
    }
    const newPayload: CloudFilePayload = {
      ...oldPayload,
      filename: path.basename(absolutePath),
      parent_folder_id: this.deriveParentFolderId(rel),
      relative_path: rel,
      size,
      mtime,
      // 保留 file_hash：若内容未变，Scheduler 的哈希闸门会跳过重传；
      // 若内容变了，Scheduler 会重新计算并覆盖。
    };
    console.log(`[CloudDriveService] 重命名: ${oldPayload.relative_path} → ${rel} (id=${oldId})`);
    this.upsertCloudItem(oldId, 'cloud_file', newPayload, absolutePath);
    this.notifyScheduler(oldId);
  }

  /** 级联软删除：所有 relative_path 以给定前缀开头的子孙项 */
  private cascadeDeleteByPathPrefix(prefix: string): void {
    const normalizedPrefix = prefix.replace(/\\/g, '/').replace(/\/+$/, '');
    try {
      // 直接用 db 查询找出所有未删除的 cloud 项，按相对路径前缀过滤
      const rows = this.queryAllCloudItems(false);
      let changed = false;
      const deletedIds: string[] = [];
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
          this.discardUploadForLocalDelete(row.id);
          const deleted = this.itemsManager.softDelete(row.id);
          if (deleted) {
            changed = true;
            deletedIds.push(row.id);
          }
        }
      }
      if (changed) {
        this.invalidateLocalStatesCache();
        this.emitItemsChanged(true, { deletedIds });
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

  private normalizeCloudRelativePath(value: string | null | undefined): string {
    return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  }

  private parentCloudRelativePath(value: string | null | undefined): string {
    const normalized = this.normalizeCloudRelativePath(value);
    if (!normalized) return '';
    const parts = normalized.split('/');
    parts.pop();
    return parts.join('/');
  }

  private snapshotCloudItemForUi(item: ItemBase): CloudDriveItemSnapshotForUi | null {
    if (item.deleted_time !== null) return null;
    if (item.type !== 'cloud_file' && item.type !== 'cloud_folder') return null;
    try {
      return {
        id: item.id,
        type: item.type,
        payload: JSON.parse(item.payload) as CloudFilePayload | CloudFolderPayload,
        sync_status: item.sync_status,
        remote_rev: item.remote_rev,
      };
    } catch {
      return null;
    }
  }

  private getEffectiveAvailabilityFromPayload(
    itemId: string,
    payload: CloudFilePayload
  ): CloudLocalAvailability {
    const root = this.config.watched_root_path;
    const absPath = root && payload.relative_path ? path.join(root, payload.relative_path) : null;
    const exists = !!absPath && fs.existsSync(absPath);
    if (!exists) return 'online_only';
    return this.localAvailability[itemId] === 'offline' ? 'offline' : 'local';
  }

  private createCloudDirectoryIndexCache(): CloudDriveDirectoryIndexCache {
    return {
      at: Date.now(),
      foldersByParent: new Map(),
      filesByParent: new Map(),
      folderItems: [],
      transferItems: [],
      itemParents: new Map(),
      itemTypes: new Map(),
    };
  }

  private getCloudDirectoryIndexCache(): CloudDriveDirectoryIndexCache {
    if (this.cloudDirectoryIndexCache) {
      return this.cloudDirectoryIndexCache;
    }

    const cache = this.createCloudDirectoryIndexCache();
    for (const folder of this.itemsManager.getByType('cloud_folder')) {
      const snapshot = this.snapshotCloudItemForUi(folder);
      if (snapshot) this.addSnapshotToDirectoryIndexCache(cache, snapshot);
    }
    for (const file of this.itemsManager.getByType('cloud_file')) {
      const snapshot = this.snapshotCloudItemForUi(file);
      if (snapshot) this.addSnapshotToDirectoryIndexCache(cache, snapshot);
    }
    this.sortCloudDirectoryIndexCache(cache);
    this.cloudDirectoryIndexCache = cache;
    return cache;
  }

  private addSnapshotToDirectoryIndexCache(
    cache: CloudDriveDirectoryIndexCache,
    snapshot: CloudDriveItemSnapshotForUi
  ): void {
    if (snapshot.type !== 'cloud_file' && snapshot.type !== 'cloud_folder') return;
    const payload = snapshot.payload as CloudFilePayload | CloudFolderPayload;
    const parentPath = this.parentCloudRelativePath(payload.relative_path);
    const target = snapshot.type === 'cloud_folder' ? cache.foldersByParent : cache.filesByParent;
    const siblings = target.get(parentPath) || [];
    siblings.push(snapshot);
    target.set(parentPath, siblings);
    cache.itemParents.set(snapshot.id, parentPath);
    cache.itemTypes.set(snapshot.id, snapshot.type);

    if (snapshot.type === 'cloud_folder') {
      cache.folderItems.push(snapshot);
    } else if (this.isTransferSnapshot(snapshot)) {
      cache.transferItems.push(snapshot);
    }
  }

  private removeSnapshotFromDirectoryIndexCache(
    cache: CloudDriveDirectoryIndexCache,
    itemId: string
  ): void {
    const parentPath = cache.itemParents.get(itemId);
    const type = cache.itemTypes.get(itemId);
    if (parentPath && type) {
      const target = type === 'cloud_folder' ? cache.foldersByParent : cache.filesByParent;
      const siblings = target.get(parentPath);
      if (siblings) {
        const next = siblings.filter(item => item.id !== itemId);
        if (next.length > 0) target.set(parentPath, next);
        else target.delete(parentPath);
      }
    }

    cache.folderItems = cache.folderItems.filter(item => item.id !== itemId);
    cache.transferItems = cache.transferItems.filter(item => item.id !== itemId);
    cache.itemParents.delete(itemId);
    cache.itemTypes.delete(itemId);
  }

  private sortCloudDirectoryIndexCache(cache: CloudDriveDirectoryIndexCache): void {
    const byRelativePath = (a: CloudDriveItemSnapshotForUi, b: CloudDriveItemSnapshotForUi) => {
      const left = this.normalizeCloudRelativePath((a.payload as CloudFilePayload | CloudFolderPayload).relative_path);
      const right = this.normalizeCloudRelativePath((b.payload as CloudFilePayload | CloudFolderPayload).relative_path);
      return left.localeCompare(right, 'zh-CN');
    };
    for (const items of cache.foldersByParent.values()) items.sort(byRelativePath);
    for (const items of cache.filesByParent.values()) items.sort(byRelativePath);
    cache.folderItems.sort(byRelativePath);
    cache.transferItems.sort(byRelativePath);
  }

  private isTransferSnapshot(snapshot: CloudDriveItemSnapshotForUi): boolean {
    if (snapshot.type !== 'cloud_file') return false;
    const payload = snapshot.payload as CloudFilePayload;
    const uploadActive = payload.upload_state !== 'completed';
    const downloadState = payload.download_state ?? 'completed';
    return uploadActive || downloadState !== 'completed';
  }

  private updateCloudDirectoryIndexCache(hint?: CloudDriveItemsChangedHint): void {
    const cache = this.cloudDirectoryIndexCache;
    if (!cache) return;
    if (!hint || hint.full) {
      this.invalidateCloudDirectoryIndexCache();
      return;
    }

    for (const id of hint.deletedIds || []) {
      this.removeSnapshotFromDirectoryIndexCache(cache, id);
    }
    for (const id of hint.changedIds || []) {
      if (!id) continue;
      this.removeSnapshotFromDirectoryIndexCache(cache, id);
      const item = this.itemsManager.getByIdIncludeDeleted(id);
      if (!item) continue;
      const snapshot = this.snapshotCloudItemForUi(item);
      if (snapshot) this.addSnapshotToDirectoryIndexCache(cache, snapshot);
    }
    cache.at = Date.now();
    this.sortCloudDirectoryIndexCache(cache);
  }

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
  listCloudItemsForUi(): CloudDriveItemSnapshotForUi[] {
    const now = Date.now();
    if (
      this.cloudItemsUiCache &&
      now - this.cloudItemsUiCache.at < CloudDriveService.CLOUD_ITEMS_UI_CACHE_TTL_MS
    ) {
      return this.cloudItemsUiCache.items.map(item => ({ ...item }));
    }

    const files = this.itemsManager.getByType('cloud_file');
    const folders = this.itemsManager.getByType('cloud_folder');
    const out: CloudDriveItemSnapshotForUi[] = [];
    for (const f of files) {
      const snapshot = this.snapshotCloudItemForUi(f);
      if (snapshot) out.push(snapshot);
    }
    for (const fo of folders) {
      const snapshot = this.snapshotCloudItemForUi(fo);
      if (snapshot) out.push(snapshot);
    }
    this.cloudItemsUiCache = { at: now, items: out };
    return out.map(item => ({ ...item }));
  }

  listCloudFoldersForUi(): CloudDriveItemSnapshotForUi[] {
    return this.getCloudDirectoryIndexCache().folderItems.map(item => ({ ...item }));
  }

  listCloudTransferItemsForUi(): CloudDriveItemSnapshotForUi[] {
    return this.getCloudDirectoryIndexCache().transferItems.map(item => ({ ...item }));
  }

  getLocalStatesByIds(itemIds: string[]): Record<string, { availability: CloudLocalAvailability }> {
    const out: Record<string, { availability: CloudLocalAvailability }> = {};
    const seen = new Set<string>();
    for (const itemId of itemIds || []) {
      if (!itemId || seen.has(itemId)) continue;
      seen.add(itemId);
      const payload = this.getCloudFilePayload(itemId);
      if (!payload) continue;
      out[itemId] = { availability: this.getEffectiveAvailabilityFromPayload(itemId, payload) };
    }
    return out;
  }

  listCloudDirectoryForUi(folderPath: string): CloudDriveDirectoryListingForUi {
    const normalizedFolder = this.normalizeCloudRelativePath(folderPath);
    const cache = this.getCloudDirectoryIndexCache();
    const folders = cache.foldersByParent.get(normalizedFolder) || [];
    const files = cache.filesByParent.get(normalizedFolder) || [];
    const out = [...folders, ...files].map(item => ({ ...item }));
    const localStates: Record<string, { availability: CloudLocalAvailability }> = {};
    for (const file of files) {
      localStates[file.id] = {
        availability: this.getEffectiveAvailabilityFromPayload(file.id, file.payload as CloudFilePayload),
      };
    }

    return {
      folderPath: normalizedFolder,
      items: out,
      localStates,
      total: out.length,
      at: Date.now(),
    };
  }

  // ========== 销毁 ==========

  dispose(): void {
    if (this.watcher) {
      this.watcher.close().catch(() => undefined);
      this.watcher = null;
    }
    this.stopConsistencyWatch();
    // 清理下载回环抑制的兜底定时器
    for (const timer of this.writingTimers.values()) {
      clearTimeout(timer);
    }
    this.writingTimers.clear();
    this.writingPaths.clear();
    if (this.itemsChangedTimer) {
      clearTimeout(this.itemsChangedTimer);
      this.itemsChangedTimer = null;
    }
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
  const cfg = cloudDriveService.getConfig();
  if (cfg.watched_root_path) {
    void cloudDriveService.startWatching().catch(err => {
      console.warn('[CloudDriveService] 自动启动监听失败:', err);
    });
  }
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

  ipcMain.handle('cloud-drive:isWatching', () => {
    return svc().isWatching();
  });

  ipcMain.handle('cloud-drive:getLocalStates', () => {
    return svc().getLocalStates();
  });

  ipcMain.handle(
    'cloud-drive:openLocalFile',
    async (_event: IpcMainInvokeEvent, itemId: string): Promise<boolean> => {
      return svc().openLocalFile(itemId);
    }
  );

  ipcMain.handle(
    'cloud-drive:openLocalDirectory',
    async (_event: IpcMainInvokeEvent, folderPath: string): Promise<boolean> => {
      return svc().openLocalDirectory(folderPath);
    }
  );

  ipcMain.handle(
    'cloud-drive:setLocalAvailability',
    (_event: IpcMainInvokeEvent, itemId: string, availability: CloudLocalAvailability): boolean => {
      return svc().setLocalAvailability(itemId, availability);
    }
  );

  ipcMain.handle(
    'cloud-drive:setFolderLocalAvailability',
    (_event: IpcMainInvokeEvent, folderPath: string, availability: CloudLocalAvailability): number => {
      return svc().setFolderLocalAvailability(folderPath, availability);
    }
  );

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

  ipcMain.handle('cloud-drive:listFolders', async (): Promise<{ items: unknown[] }> => {
    return { items: svc().listCloudFoldersForUi() };
  });

  ipcMain.handle('cloud-drive:listTransferItems', async (): Promise<{ items: unknown[] }> => {
    return { items: svc().listCloudTransferItemsForUi() };
  });

  ipcMain.handle(
    'cloud-drive:getLocalStatesByIds',
    async (_event: IpcMainInvokeEvent, itemIds: string[]): Promise<Record<string, { availability: CloudLocalAvailability }>> => {
      return svc().getLocalStatesByIds(Array.isArray(itemIds) ? itemIds : []);
    }
  );

  ipcMain.handle(
    'cloud-drive:listDirectory',
    async (_event: IpcMainInvokeEvent, folderPath: string): Promise<CloudDriveDirectoryListingForUi> => {
      return svc().listCloudDirectoryForUi(folderPath);
    }
  );

  ipcMain.handle('cloud-drive:listItems', async (): Promise<{ items: unknown[] }> => {
    // 返回当前所有未删除 cloud_file/cloud_folder 元数据（供 UI 重建进度列表）
    const svcInstance = svc();
    const items = svcInstance.listCloudItemsForUi();
    return { items };
  });
}
