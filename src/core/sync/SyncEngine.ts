import { ItemBase, ItemType, SyncModules, SYNC_MODULE_TYPES } from '@shared/types';
import { StorageAdapter, RemoteChange, CHANGE_LOG_RETENTION } from './StorageAdapter';
import { ItemsManager } from '../database/ItemsManager';

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
  duration: number;
  cleanedChangeLogs?: number;  // 清理的变更日志数量
}

// 同步进度信息
export interface SyncProgress {
  phase: 'idle' | 'connecting' | 'pushing' | 'pulling' | 'committing' | 'done' | 'error';
  message: string;
  current?: number;
  total?: number;
  detail?: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

// 服务器标识信息（用于区分不同的同步后端）
export interface ServerIdentifier {
  type: 'webdav' | 'server';
  url: string;
}

export interface SyncOptions {
  conflictStrategy: 'remote-wins' | 'local-wins' | 'create-copy';
  syncModules: SyncModules;
  onProgress?: SyncProgressCallback;
  serverIdentifier?: ServerIdentifier;  // 服务器标识，用于独立存储游标
}

export class SyncEngine {
  private adapter: StorageAdapter;
  private itemsManager: ItemsManager;
  private options: SyncOptions;
  private allowedTypes: Set<ItemType>;
  private progressCallback: SyncProgressCallback | null = null;
  private serverIdentifier: ServerIdentifier | null = null;

  constructor(
    adapter: StorageAdapter,
    itemsManager: ItemsManager,
    options: Partial<SyncOptions> = {}
  ) {
    this.adapter = adapter;
    this.itemsManager = itemsManager;
    this.options = {
      conflictStrategy: 'create-copy',
      syncModules: {
        notes: true,
        bookmarks: true,
        vault: true,
        diagrams: true,
        todos: true,
        ai: true,
      },
      ...options,
    };
    this.allowedTypes = this.buildAllowedTypes();
    this.progressCallback = options.onProgress || null;
    this.serverIdentifier = options.serverIdentifier || null;
  }

  // 设置服务器标识（用于独立存储游标）
  setServerIdentifier(identifier: ServerIdentifier): void {
    this.serverIdentifier = identifier;
    console.log('[SyncEngine] Server identifier set:', identifier.type, identifier.url);
  }

  // 获取当前服务器的游标
  private getServerCursor(): { cursor: string | null; timestamp: number | null } {
    if (this.serverIdentifier) {
      const cursorData = this.itemsManager.getLocalSyncCursor(
        this.serverIdentifier.type,
        this.serverIdentifier.url
      );
      return {
        cursor: cursorData?.cursor || null,
        timestamp: cursorData?.timestamp || null,
      };
    }
    // 兼容旧版本
    const cursorData = this.itemsManager.getLocalSyncCursor();
    return {
      cursor: cursorData?.cursor || null,
      timestamp: cursorData?.timestamp || null,
    };
  }

  // 保存当前服务器的游标
  private setServerCursor(cursor: string, timestamp: number): boolean {
    if (this.serverIdentifier) {
      return this.itemsManager.setLocalSyncCursor(
        { cursor, timestamp },
        this.serverIdentifier.type,
        this.serverIdentifier.url
      );
    }
    // 兼容旧版本
    return this.itemsManager.setLocalSyncCursor({ cursor, timestamp });
  }

  // 清除当前服务器的游标
  private clearServerCursor(): boolean {
    if (this.serverIdentifier) {
      return this.itemsManager.clearLocalSyncCursor(
        this.serverIdentifier.type,
        this.serverIdentifier.url
      );
    }
    // 兼容旧版本
    return this.itemsManager.clearLocalSyncCursor();
  }

  // 报告进度
  private reportProgress(progress: SyncProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  // 根据模块配置构建允许同步的类型集合
  private buildAllowedTypes(): Set<ItemType> {
    const types = new Set<ItemType>();
    const modules = this.options.syncModules;
    
    for (const [module, enabled] of Object.entries(modules)) {
      if (enabled) {
        const moduleTypes = SYNC_MODULE_TYPES[module as keyof SyncModules];
        if (moduleTypes) {
          moduleTypes.forEach(t => types.add(t));
        }
      }
    }
    
    return types;
  }

  // 检查类型是否允许同步
  private shouldSyncType(type: ItemType): boolean {
    return this.allowedTypes.has(type);
  }

  // 执行完整同步
  async sync(): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      errors: [],
      duration: 0,
      cleanedChangeLogs: 0,
    };

    try {
      // 1. Push 阶段 - 上传本地变更
      this.reportProgress({ phase: 'pushing', message: '正在检查本地变更...' });
      const pushResult = await this.pushChanges();
      result.pushed = pushResult.count;
      result.errors.push(...pushResult.errors);

      // 2. Pull 阶段 - 拉取远端变更
      this.reportProgress({ phase: 'pulling', message: '正在检查远端变更...' });
      const pullResult = await this.pullChanges();
      result.pulled = pullResult.count;
      result.conflicts = pullResult.conflicts;
      result.errors.push(...pullResult.errors);

      // 3. Commit 阶段 - 更新同步状态
      this.reportProgress({ phase: 'committing', message: '正在完成同步...' });
      await this.commitSync();

      // 4. 清理过期的变更日志
      if (this.adapter.cleanupChangeLogs) {
        const cleanupBefore = Date.now() - CHANGE_LOG_RETENTION;
        result.cleanedChangeLogs = await this.adapter.cleanupChangeLogs(cleanupBefore);
      }

      result.success = result.errors.length === 0;
      
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      this.reportProgress({ 
        phase: 'done', 
        message: `同步完成 (${durationSec}s)`,
        detail: `上传 ${result.pushed} 项, 下载 ${result.pulled} 项${result.conflicts > 0 ? `, ${result.conflicts} 个冲突` : ''}`
      });
    } catch (error) {
      this.reportProgress({ phase: 'error', message: '同步失败', detail: (error as Error).message });
      result.errors.push(`Sync failed: ${(error as Error).message}`);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  // Push 阶段：上传本地变更
  private async pushChanges(): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    const pendingItems = this.itemsManager.getPendingSync()
      .filter(item => this.shouldSyncType(item.type));

    const total = pendingItems.length;
    if (total === 0) {
      this.reportProgress({ phase: 'pushing', message: '没有本地变更需要上传' });
      return { count: 0, errors: [] };
    }

    this.reportProgress({ phase: 'pushing', message: `正在上传 ${total} 项变更...`, current: 0, total });

    for (const item of pendingItems) {
      try {
        // 明文同步：确保 encryption_applied = 0
        const itemToUpload: ItemBase = {
          ...item,
          encryption_applied: 0 as const,
        };

        // 上传
        const result = await this.adapter.putItem(itemToUpload);

        if (result.success) {
          this.itemsManager.markSynced(item.id, result.remoteRev);
          count++;
          this.reportProgress({ 
            phase: 'pushing', 
            message: `正在上传... (${count}/${total})`,
            current: count,
            total,
            detail: `上传: ${item.type}`
          });
        } else {
          const errorDetail = result.error ? `: ${result.error}` : '';
          errors.push(`Failed to push item ${item.id}${errorDetail}`);
        }
      } catch (error) {
        errors.push(`Error pushing item ${item.id}: ${(error as Error).message}`);
      }
    }

    this.reportProgress({ phase: 'pushing', message: `已上传 ${count} 项`, current: count, total });
    return { count, errors };
  }

  // Pull 阶段：拉取远端变更
  private async pullChanges(): Promise<{ count: number; conflicts: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;
    let conflicts = 0;

    // ✅ 从本地数据库获取游标（按服务器独立存储）
    const { cursor: localCursor, timestamp: localTimestamp } = this.getServerCursor();
    let currentCursor = localCursor;
    
    // 检查游标格式是否兼容
    // 自建服务器使用数字格式，WebDAV 使用文件名格式（包含 .json）
    if (currentCursor) {
      const isWebDAVFormat = currentCursor.includes('.json');
      const isServerType = this.serverIdentifier?.type === 'server';
      
      // 如果当前是自建服务器但游标是 WebDAV 格式，清除游标
      if (isServerType && isWebDAVFormat) {
        console.log('[SyncEngine] Detected WebDAV cursor format for server sync, clearing');
        this.clearServerCursor();
        currentCursor = null;
      }
      // 如果当前是 WebDAV 但游标是数字格式（纯数字），清除游标
      else if (!isServerType && this.serverIdentifier?.type === 'webdav' && /^\d+$/.test(currentCursor)) {
        console.log('[SyncEngine] Detected server cursor format for WebDAV sync, clearing');
        this.clearServerCursor();
        currentCursor = null;
      }
    }
    
    let lastSuccessfulCursor = currentCursor;  // 记录最后成功处理的游标

    console.log('[SyncEngine] Pull starting with cursor:', currentCursor, 'timestamp:', localTimestamp, 'server:', this.serverIdentifier);
    this.reportProgress({ phase: 'pulling', message: '正在获取远端变更列表...' });

    // 循环拉取所有变更
    let hasMore = true;
    let totalChanges = 0;
    let iterations = 0;
    const maxIterations = 100; // 防止无限循环
    
    while (hasMore && iterations < maxIterations) {
      iterations++;
      
      try {
        const { changes, nextCursor, hasMore: more } = await this.adapter.listChanges(currentCursor);
        hasMore = more;

        console.log(`[SyncEngine] listChanges: cursor=${currentCursor}, got ${changes.length} changes, hasMore=${more}, nextCursor=${nextCursor}`);
        if (changes.length > 0) {
          console.log(`[SyncEngine] First change: id=${changes[0].change_id}, item_id=${changes[0].item_id}, type=${changes[0].type}`);
          console.log(`[SyncEngine] Last change: id=${changes[changes.length-1].change_id}, item_id=${changes[changes.length-1].item_id}`);
        }

        const filteredChanges = changes.filter(c => this.shouldSyncType(c.type));
        totalChanges += filteredChanges.length;

        if (filteredChanges.length > 0) {
          this.reportProgress({ 
            phase: 'pulling', 
            message: `正在下载... (${count}/${totalChanges})`,
            current: count,
            total: totalChanges
          });
        }

        let batchSuccessful = true;
        for (const change of filteredChanges) {
          try {
            const result = await this.processRemoteChange(change);
            if (result.success && !result.skipped) {
              count++;
              this.reportProgress({ 
                phase: 'pulling', 
                message: `正在下载... (${count}/${totalChanges})`,
                current: count,
                total: totalChanges,
                detail: `下载: ${change.type}`
              });
            }
            if (result.conflict) {
              conflicts++;
            }
            if (result.error) {
              errors.push(result.error);
              batchSuccessful = false;
            }
          } catch (error) {
            errors.push(`Error processing change ${change.item_id}: ${(error as Error).message}`);
            batchSuccessful = false;
          }
        }

        // 每批次处理完成后更新本地游标（增量更新，避免重复处理）
        if (nextCursor && batchSuccessful) {
          lastSuccessfulCursor = nextCursor;
          // ✅ 保存到本地数据库（按服务器独立存储）
          this.setServerCursor(lastSuccessfulCursor, Date.now());
          console.log('[SyncEngine] Updated cursor to:', lastSuccessfulCursor, 'for server:', this.serverIdentifier);
        }

        currentCursor = nextCursor;
      } catch (error) {
        console.error('Error in pullChanges iteration:', error);
        errors.push(`Pull changes error: ${(error as Error).message}`);
        hasMore = false; // 出错时停止循环
      }
    }
    
    if (iterations >= maxIterations) {
      console.warn('Pull changes reached max iterations limit');
      errors.push('Pull changes reached iteration limit');
    }

    if (count === 0) {
      this.reportProgress({ phase: 'pulling', message: '没有远端变更需要下载' });
    } else {
      this.reportProgress({ phase: 'pulling', message: `已下载 ${count} 项`, current: count, total: totalChanges });
    }

    return { count, conflicts, errors };
  }

  // 处理单个远端变更
  private async processRemoteChange(change: RemoteChange): Promise<{
    success: boolean;
    conflict: boolean;
    skipped?: boolean;
    error?: string;
  }> {
    const localItem = this.itemsManager.getById(change.item_id);

    console.log(`[SyncEngine] Processing remote change: item_id=${change.item_id}, type=${change.type}, remote_hash=${change.content_hash}`);
    if (localItem) {
      console.log(`[SyncEngine] Local item exists: sync_status=${localItem.sync_status}, local_hash=${localItem.content_hash}`);
    } else {
      console.log(`[SyncEngine] No local item found`);
    }

    // 如果本地已有该数据且状态为 clean，检查是否需要更新
    if (localItem && localItem.sync_status === 'clean') {
      // 检查内容哈希是否一致，一致则跳过
      if (localItem.content_hash === change.content_hash) {
        console.log(`[SyncEngine] Skipping - hash matches (no update needed)`);
        return { success: true, conflict: false, skipped: true };  // 添加 skipped 标记
      }
      // 哈希不同但本地是 clean 状态，说明远端有更新，继续处理
      console.log(`[SyncEngine] Remote update detected for ${change.item_id}, local_hash=${localItem.content_hash}, remote_hash=${change.content_hash}`);
    }

    // 检查是否有冲突
    if (localItem && localItem.sync_status === 'modified') {
      // 本地也有修改，产生冲突
      return this.handleConflict(localItem, change);
    }

    // 拉取远端完整数据
    const remoteItem = await this.adapter.getItem(change.item_id);
    if (!remoteItem) {
      // 远端文件不存在的情况处理
      if (localItem) {
        // 本地已有数据，可能是：
        // 1. 刚上传还没完全同步
        // 2. 远端被删除了
        if (localItem.sync_status === 'clean') {
          // 本地是 clean 状态，可能是刚上传的，跳过
          console.log(`Remote item ${change.item_id} not found, but local is clean, skipping`);
          return { success: true, conflict: false };
        }
        // 其他情况记录警告但不报错
        console.warn(`Remote item ${change.item_id} not found, local status: ${localItem.sync_status}`);
        return { success: true, conflict: false };
      }
      // 本地没有，远端也没有，可能是已删除的变更记录，跳过
      console.warn(`Remote item ${change.item_id} not found and no local copy, skipping`);
      return { success: true, conflict: false };
    }

    // 直接使用远端数据（不再需要解密）
    const itemToSave = remoteItem;

    // 写入本地
    if (localItem) {
      // 更新现有记录（使用专门的同步更新方法，不改变 sync_status）
      this.itemsManager.updateFromRemote(itemToSave);
      console.log(`[SyncEngine] Updated local item ${change.item_id} from remote`);
    } else {
      // 创建新记录（使用远端的 ID）
      this.itemsManager.createWithId(itemToSave);
      console.log(`[SyncEngine] Created new local item ${change.item_id} from remote`);
    }

    return { success: true, conflict: false };
  }

  // 处理冲突
  private async handleConflict(localItem: ItemBase, remoteChange: RemoteChange): Promise<{
    success: boolean;
    conflict: boolean;
    skipped?: boolean;
    error?: string;
  }> {
    const remoteItem = await this.adapter.getItem(remoteChange.item_id);
    if (!remoteItem) {
      return { success: false, conflict: true, error: 'Remote item not found during conflict resolution' };
    }

    switch (this.options.conflictStrategy) {
      case 'remote-wins':
        // 远端覆盖本地（使用专门的同步更新方法）
        this.itemsManager.updateFromRemote(remoteItem);
        return { success: true, conflict: true };

      case 'local-wins':
        // 保持本地，下次 push 会覆盖远端
        return { success: true, conflict: true };

      case 'create-copy':
      default:
        // 创建冲突副本
        const conflictPayload = JSON.parse(localItem.payload);
        conflictPayload.title = `${conflictPayload.title || 'Untitled'} (冲突副本)`;
        conflictPayload.is_conflict = true;

        this.itemsManager.create(localItem.type, conflictPayload);

        // 用远端版本覆盖原记录（使用专门的同步更新方法）
        this.itemsManager.updateFromRemote(remoteItem);

        return { success: true, conflict: true };
    }
  }

  // 验证加密密钥
  // Commit 阶段
  private async commitSync(): Promise<void> {
    // 更新远端元数据
    const meta = await this.adapter.getRemoteMeta();
    meta.last_sync_time = Date.now();
    await this.adapter.putRemoteMeta(meta);
  }

  // 设置同步选项
  setOptions(options: Partial<SyncOptions>): void {
    this.options = { ...this.options, ...options };
    // 如果模块配置变化，重新构建允许的类型集合
    if (options.syncModules) {
      this.allowedTypes = this.buildAllowedTypes();
    }
    // 更新进度回调
    if (options.onProgress !== undefined) {
      this.progressCallback = options.onProgress;
    }
  }

  // 设置进度回调
  setProgressCallback(callback: SyncProgressCallback | null): void {
    this.progressCallback = callback;
  }

  // 获取同步状态
  async getStatus(): Promise<{
    pendingPush: number;
    lastSyncTime: number | null;
    isLocked: boolean;
  }> {
    const pendingItems = this.itemsManager.getPendingSync()
      .filter(item => this.shouldSyncType(item.type));
    const { timestamp } = this.getServerCursor();

    return {
      pendingPush: pendingItems.length,
      lastSyncTime: timestamp,
      isLocked: false,  // 锁机制已移除
    };
  }

  // 强制标记所有数据为待同步
  forceMarkAllForSync(): number {
    return this.itemsManager.markAllForSync();
  }

  // 重置同步状态（用于切换服务器或强制完全重新同步）
  resetSyncStatus(): number {
    // 清除当前服务器的同步游标，这样下次同步会从头开始拉取所有变更
    this.clearServerCursor();
    console.log('[SyncEngine] Cleared sync cursor for server:', this.serverIdentifier);
    
    return this.itemsManager.resetSyncStatus();
  }

  // 检查远端是否已有数据（用于首次同步检测）
  async checkRemoteHasData(): Promise<boolean> {
    if (this.adapter.hasExistingData) {
      return this.adapter.hasExistingData();
    }
    // 回退：检查远端元数据
    const meta = await this.adapter.getRemoteMeta();
    return meta.last_sync_time !== null;
  }
}

export default SyncEngine;
