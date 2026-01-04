import { v4 as uuidv4 } from 'uuid';
import { ItemBase, ItemType, SyncModules, SYNC_MODULE_TYPES } from '@shared/types';
import { StorageAdapter, RemoteChange, CHANGE_LOG_RETENTION } from './StorageAdapter';
import { ItemsManager } from '../database/ItemsManager';
import { CryptoEngine } from '../crypto/CryptoEngine';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

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
  phase: 'idle' | 'connecting' | 'acquiring-lock' | 'verifying-key' | 'pushing' | 'pulling' | 'committing' | 'done' | 'error';
  message: string;
  current?: number;
  total?: number;
  detail?: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

export interface SyncOptions {
  encryptionEnabled: boolean;
  conflictStrategy: 'remote-wins' | 'local-wins' | 'create-copy';
  syncModules: SyncModules;
  onProgress?: SyncProgressCallback;
}

// 敏感数据类型 - 这些类型始终需要加密同步（包含密码、API Key 等敏感信息）
const SENSITIVE_TYPES = ['vault_entry', 'vault_folder', 'ai_config'];

// 获取或创建持久化的设备 ID
function getOrCreateDeviceId(): string {
  try {
    const userDataPath = app.getPath('userData');
    const deviceIdPath = path.join(userDataPath, 'device-id.txt');
    
    if (fs.existsSync(deviceIdPath)) {
      const existingId = fs.readFileSync(deviceIdPath, 'utf-8').trim();
      if (existingId) {
        return existingId;
      }
    }
    
    // 创建新的设备 ID
    const newId = uuidv4();
    fs.writeFileSync(deviceIdPath, newId, 'utf-8');
    return newId;
  } catch (error) {
    // 如果无法持久化，回退到随机 ID
    console.warn('Failed to persist device ID:', error);
    return uuidv4();
  }
}

export class SyncEngine {
  private adapter: StorageAdapter;
  private itemsManager: ItemsManager;
  private cryptoEngine: CryptoEngine | null;
  private deviceId: string;
  private options: SyncOptions;
  private allowedTypes: Set<ItemType>;
  private progressCallback: SyncProgressCallback | null = null;

  constructor(
    adapter: StorageAdapter,
    itemsManager: ItemsManager,
    cryptoEngine: CryptoEngine | null = null,
    options: Partial<SyncOptions> = {}
  ) {
    this.adapter = adapter;
    this.itemsManager = itemsManager;
    this.cryptoEngine = cryptoEngine;
    // 使用持久化的设备 ID，确保同一设备始终使用相同的 ID
    this.deviceId = getOrCreateDeviceId();
    this.options = {
      encryptionEnabled: false,
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
      // 1. 获取锁
      this.reportProgress({ phase: 'acquiring-lock', message: '正在获取同步锁...' });
      const lockAcquired = await this.adapter.acquireLock(this.deviceId);
      if (!lockAcquired) {
        this.reportProgress({ phase: 'error', message: '获取同步锁失败', detail: '可能有其他设备正在同步' });
        result.errors.push('Failed to acquire sync lock - another device may be syncing');
        return result;
      }
      this.reportProgress({ phase: 'acquiring-lock', message: '已获取同步锁' });

      try {
        // 2. 验证密钥（如果启用加密）
        if (this.options.encryptionEnabled) {
          this.reportProgress({ phase: 'verifying-key', message: '正在验证加密密钥...' });
          const keyValid = await this.verifyEncryptionKey();
          if (!keyValid) {
            this.reportProgress({ phase: 'error', message: '密钥验证失败', detail: '同步密钥不匹配' });
            result.errors.push('Encryption key mismatch - 同步密钥不匹配，请确保使用相同的密钥');
            return result;
          }
          this.reportProgress({ phase: 'verifying-key', message: '密钥验证通过' });
        }

        // 3. Push 阶段 - 上传本地变更
        this.reportProgress({ phase: 'pushing', message: '正在检查本地变更...' });
        const pushResult = await this.pushChanges();
        result.pushed = pushResult.count;
        result.errors.push(...pushResult.errors);

        // 4. Pull 阶段 - 拉取远端变更
        this.reportProgress({ phase: 'pulling', message: '正在检查远端变更...' });
        const pullResult = await this.pullChanges();
        result.pulled = pullResult.count;
        result.conflicts = pullResult.conflicts;
        result.errors.push(...pullResult.errors);

        // 5. Commit 阶段 - 更新同步状态
        this.reportProgress({ phase: 'committing', message: '正在完成同步...' });
        await this.commitSync();

        // 6. 清理过期的变更日志
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
      } finally {
        // 释放锁
        await this.adapter.releaseLock(this.deviceId);
      }
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
        // 判断是否需要加密
        const isSensitive = SENSITIVE_TYPES.includes(item.type);
        const shouldEncrypt = (this.options.encryptionEnabled || isSensitive) && this.cryptoEngine;
        
        let itemToUpload = item;
        if (shouldEncrypt) {
          itemToUpload = {
            ...item,
            payload: this.cryptoEngine!.encryptPayload(item.payload),
            encryption_applied: 1,
          };
        }

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

    // 获取当前游标
    const cursor = await this.adapter.getSyncCursor();
    let currentCursor = cursor?.cursor || null;
    let lastSuccessfulCursor = currentCursor;  // 记录最后成功处理的游标

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
            if (result.success) {
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

        // 每批次处理完成后更新游标（增量更新，避免重复处理）
        if (nextCursor && batchSuccessful) {
          lastSuccessfulCursor = nextCursor;
          await this.adapter.setSyncCursor({
            cursor: lastSuccessfulCursor,
            timestamp: Date.now(),
          });
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
    error?: string;
  }> {
    const localItem = this.itemsManager.getById(change.item_id);

    // 如果本地已有该数据且状态为 clean，说明可能是自己刚上传的
    if (localItem && localItem.sync_status === 'clean') {
      // 检查内容哈希是否一致，一致则跳过
      if (localItem.content_hash === change.content_hash) {
        return { success: true, conflict: false };
      }
      // 哈希不同但本地是 clean 状态，说明远端有更新，继续处理
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

    // 解密（如果需要）
    let decryptedItem = remoteItem;
    if (remoteItem.encryption_applied && this.cryptoEngine) {
      try {
        decryptedItem = {
          ...remoteItem,
          payload: this.cryptoEngine.decryptPayload(remoteItem.payload),
          encryption_applied: 0,
        };
      } catch (error) {
        return { success: false, conflict: false, error: `Failed to decrypt item ${change.item_id}: ${(error as Error).message}` };
      }
    }

    // 写入本地
    if (localItem) {
      // 更新现有记录
      this.itemsManager.update(change.item_id, JSON.parse(decryptedItem.payload));
    } else {
      // 创建新记录（使用远端的 ID）
      this.itemsManager.createWithId(decryptedItem);
    }

    return { success: true, conflict: false };
  }

  // 处理冲突
  private async handleConflict(localItem: ItemBase, remoteChange: RemoteChange): Promise<{
    success: boolean;
    conflict: boolean;
    error?: string;
  }> {
    const remoteItem = await this.adapter.getItem(remoteChange.item_id);
    if (!remoteItem) {
      return { success: false, conflict: true, error: 'Remote item not found during conflict resolution' };
    }

    switch (this.options.conflictStrategy) {
      case 'remote-wins':
        // 远端覆盖本地
        this.itemsManager.update(localItem.id, JSON.parse(remoteItem.payload));
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

        // 用远端版本覆盖原记录
        this.itemsManager.update(localItem.id, JSON.parse(remoteItem.payload));

        return { success: true, conflict: true };
    }
  }

  // 验证加密密钥
  private async verifyEncryptionKey(): Promise<boolean> {
    if (!this.cryptoEngine) return true;

    const remoteMeta = await this.adapter.getRemoteMeta();

    // 如果远端没有密钥标识，说明是首次同步
    if (!remoteMeta.key_identifier) {
      return true;
    }

    // 比较密钥标识
    const localKeyId = this.cryptoEngine.generateKeyIdentifier();
    return localKeyId === remoteMeta.key_identifier;
  }

  // Commit 阶段
  private async commitSync(): Promise<void> {
    // 更新远端元数据
    const meta = await this.adapter.getRemoteMeta();
    meta.last_sync_time = Date.now();

    if (this.options.encryptionEnabled && this.cryptoEngine) {
      meta.key_identifier = this.cryptoEngine.generateKeyIdentifier();
    }

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
    const cursor = await this.adapter.getSyncCursor();
    const lockStatus = await this.adapter.checkLock();

    return {
      pendingPush: pendingItems.length,
      lastSyncTime: cursor?.timestamp || null,
      isLocked: lockStatus.locked,
    };
  }

  // 强制标记所有数据为待同步
  forceMarkAllForSync(): number {
    return this.itemsManager.markAllForSync();
  }

  // 重置同步状态（用于切换服务器或强制完全重新同步）
  resetSyncStatus(): number {
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
