import { v4 as uuidv4 } from 'uuid';
import { ItemBase, ItemType, SyncModules, SYNC_MODULE_TYPES } from '@shared/types';
import { StorageAdapter, RemoteChange } from './StorageAdapter';
import { ItemsManager } from '../database/ItemsManager';
import { CryptoEngine } from '../crypto/CryptoEngine';

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
  duration: number;
}

export interface SyncOptions {
  encryptionEnabled: boolean;
  conflictStrategy: 'remote-wins' | 'local-wins' | 'create-copy';
  syncModules: SyncModules;
}

// 敏感数据类型 - 这些类型始终需要加密同步（包含密码、API Key 等敏感信息）
const SENSITIVE_TYPES = ['vault_entry', 'vault_folder', 'ai_config'];

export class SyncEngine {
  private adapter: StorageAdapter;
  private itemsManager: ItemsManager;
  private cryptoEngine: CryptoEngine | null;
  private deviceId: string;
  private options: SyncOptions;
  private allowedTypes: Set<ItemType>;

  constructor(
    adapter: StorageAdapter,
    itemsManager: ItemsManager,
    cryptoEngine: CryptoEngine | null = null,
    options: Partial<SyncOptions> = {}
  ) {
    this.adapter = adapter;
    this.itemsManager = itemsManager;
    this.cryptoEngine = cryptoEngine;
    this.deviceId = uuidv4();
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
    };

    try {
      // 1. 获取锁
      const lockAcquired = await this.adapter.acquireLock(this.deviceId);
      if (!lockAcquired) {
        result.errors.push('Failed to acquire sync lock - another device may be syncing');
        return result;
      }

      try {
        // 2. 验证密钥（如果启用加密）
        if (this.options.encryptionEnabled) {
          const keyValid = await this.verifyEncryptionKey();
          if (!keyValid) {
            result.errors.push('Encryption key mismatch - 同步密钥不匹配，请确保使用相同的密钥');
            return result;
          }
        }

        // 3. Push 阶段 - 上传本地变更
        const pushResult = await this.pushChanges();
        result.pushed = pushResult.count;
        result.errors.push(...pushResult.errors);

        // 4. Pull 阶段 - 拉取远端变更
        const pullResult = await this.pullChanges();
        result.pulled = pullResult.count;
        result.conflicts = pullResult.conflicts;
        result.errors.push(...pullResult.errors);

        // 5. Commit 阶段 - 更新同步状态
        await this.commitSync();

        result.success = result.errors.length === 0;
      } finally {
        // 释放锁
        await this.adapter.releaseLock(this.deviceId);
      }
    } catch (error) {
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

    for (const item of pendingItems) {
      try {
        // 判断是否需要加密
        // 1. 敏感数据类型（密码库）始终加密
        // 2. 其他数据根据用户设置决定
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
        const { success, remoteRev } = await this.adapter.putItem(itemToUpload);

        if (success) {
          // 标记为已同步
          this.itemsManager.markSynced(item.id, remoteRev);
          count++;
        } else {
          errors.push(`Failed to push item ${item.id}`);
        }
      } catch (error) {
        errors.push(`Error pushing item ${item.id}: ${(error as Error).message}`);
      }
    }

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

    // 循环拉取所有变更
    let hasMore = true;
    while (hasMore) {
      const { changes, nextCursor, hasMore: more } = await this.adapter.listChanges(currentCursor);
      hasMore = more;
      currentCursor = nextCursor;

      for (const change of changes) {
        // 过滤不需要同步的类型
        if (!this.shouldSyncType(change.type)) {
          continue;
        }
        
        try {
          const result = await this.processRemoteChange(change);
          if (result.success) {
            count++;
          }
          if (result.conflict) {
            conflicts++;
          }
          if (result.error) {
            errors.push(result.error);
          }
        } catch (error) {
          errors.push(`Error processing change ${change.item_id}: ${(error as Error).message}`);
        }
      }
    }

    // 更新游标
    if (currentCursor) {
      await this.adapter.setSyncCursor({
        cursor: currentCursor,
        timestamp: Date.now(),
      });
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

    // 检查是否有冲突
    if (localItem && localItem.sync_status === 'modified') {
      // 本地也有修改，产生冲突
      return this.handleConflict(localItem, change);
    }

    // 拉取远端完整数据
    const remoteItem = await this.adapter.getItem(change.item_id);
    if (!remoteItem) {
      return { success: false, conflict: false, error: `Remote item ${change.item_id} not found` };
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
        return { success: false, conflict: false, error: `Failed to decrypt item ${change.item_id}` };
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
}

export default SyncEngine;
