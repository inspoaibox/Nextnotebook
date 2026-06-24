import { ItemBase, ItemType, SyncModules, SYNC_MODULE_TYPES, ResourcePayload } from '@shared/types';
import { StorageAdapter, RemoteChange, CHANGE_LOG_RETENTION } from './StorageAdapter';
import { ItemsManager } from '../database/ItemsManager';
import * as fs from 'fs';
import * as path from 'path';

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
  resourcesDir?: string;  // 资源文件目录路径
  // Phase 2：cloud_file 下载 / 删除 / 冲突回调（由 CloudDriveService 注入，
  // SyncEngine 只负责把元数据写库并标记 download_state=pending，
  // 物理文件下载/删除/冲突副本由 CloudDriveService + CloudDriveScheduler 处理）
  onCloudFileChanged?: (itemId: string) => void;       // 元数据已更新，需触发下载
  onCloudItemDeleted?: (itemId: string) => void;       // 远端删除，需删除本地文件
  onCloudFileConflict?: (itemId: string, conflictPath: string) => void;  // 冲突副本已生成
}

export class SyncEngine {
  private adapter: StorageAdapter;
  private itemsManager: ItemsManager;
  private options: SyncOptions;
  private allowedTypes: Set<ItemType>;
  private progressCallback: SyncProgressCallback | null = null;
  private serverIdentifier: ServerIdentifier | null = null;
  private resourcesDir: string | null = null;
  // Phase 2：cloud_file 物理文件相关回调（由 CloudDriveService 注入）
  private onCloudFileChanged: ((itemId: string) => void) | null = null;
  private onCloudItemDeleted: ((itemId: string) => void) | null = null;
  private onCloudFileConflict: ((itemId: string, conflictPath: string) => void) | null = null;

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
        cloudDrive: true,
      },
      ...options,
    };
    this.allowedTypes = this.buildAllowedTypes();
    this.progressCallback = options.onProgress || null;
    this.serverIdentifier = options.serverIdentifier || null;
    this.resourcesDir = options.resourcesDir || null;
    this.onCloudFileChanged = options.onCloudFileChanged || null;
    this.onCloudItemDeleted = options.onCloudItemDeleted || null;
    this.onCloudFileConflict = options.onCloudFileConflict || null;
  }

  // 设置资源目录
  setResourcesDir(dir: string): void {
    this.resourcesDir = dir;
    console.log('[SyncEngine] Resources directory set:', dir);
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
    
    console.log('[SyncEngine] Building allowed types, syncModules:', modules);
    
    for (const [module, enabled] of Object.entries(modules)) {
      if (enabled) {
        const moduleTypes = SYNC_MODULE_TYPES[module as keyof SyncModules];
        console.log(`[SyncEngine] Module ${module} enabled, types:`, moduleTypes);
        if (moduleTypes) {
          moduleTypes.forEach(t => types.add(t));
        }
      }
    }
    
    console.log('[SyncEngine] Final allowed types:', [...types]);
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

    // 调试：检查数据库中所有 excel_note 的状态
    const allExcelNotes = this.itemsManager.getByType('excel_note');
    console.log('[SyncEngine] All excel_note in database:', allExcelNotes.length);
    allExcelNotes.forEach(note => {
      console.log(`[SyncEngine] Excel note: id=${note.id}, sync_status=${note.sync_status}, deleted_time=${note.deleted_time}`);
    });

    const allPendingItems = this.itemsManager.getPendingSync();
    console.log('[SyncEngine] All pending items:', allPendingItems.length);
    console.log('[SyncEngine] All pending items by type:', allPendingItems.reduce((acc, i) => {
      acc[i.type] = (acc[i.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>));
    console.log('[SyncEngine] Allowed types:', [...this.allowedTypes]);
    
    // 检查是否有 excel_note 类型
    const excelNotes = allPendingItems.filter(i => i.type === 'excel_note');
    if (excelNotes.length > 0) {
      console.log('[SyncEngine] Found excel_note items in pending:', excelNotes.map(i => ({ id: i.id, sync_status: i.sync_status })));
    } else {
      console.log('[SyncEngine] No excel_note items in pending sync');
    }
    
    const pendingItems = allPendingItems.filter(item => this.shouldSyncType(item.type));
    console.log('[SyncEngine] Filtered pending items:', pendingItems.length, 'types:', [...new Set(pendingItems.map(i => i.type))]);

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

        // 上传 item 元数据
        const result = await this.adapter.putItem(itemToUpload);

        if (result.success) {
          let resourceUploadFailed = false;

          // 如果是资源类型，同时上传资源文件
          if (item.type === 'resource' && this.resourcesDir) {
            try {
              const payload = JSON.parse(item.payload) as ResourcePayload;
              // 从 item.id 和 payload.filename 获取文件扩展名
              const ext = path.extname(payload.filename).toLowerCase() || '.bin';
              const resourceFilePath = path.join(this.resourcesDir, `${item.id}${ext}`);
              
              if (fs.existsSync(resourceFilePath)) {
                const fileData = fs.readFileSync(resourceFilePath);
                const resourceId = `${item.id}${ext}`;
                const uploadSuccess = await this.adapter.putResource(resourceId, fileData, payload.mime_type);
                if (!uploadSuccess) {
                  resourceUploadFailed = true;
                  console.warn(`[SyncEngine] Failed to upload resource file: ${resourceId}`);
                } else {
                  console.log(`[SyncEngine] Uploaded resource file: ${resourceId}`);
                }
              } else {
                resourceUploadFailed = true;
                console.warn(`[SyncEngine] Resource file not found: ${resourceFilePath}`);
              }
            } catch (resourceError) {
              resourceUploadFailed = true;
              console.error(`[SyncEngine] Error uploading resource file for ${item.id}:`, resourceError);
            }
          }

          if (resourceUploadFailed) {
            errors.push(`Failed to upload resource file for item ${item.id}`);
            continue;
          }

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
    // 自建服务器使用纯数字格式（change_id），WebDAV 使用文件名格式（{timestamp}.json）
    if (currentCursor) {
      const isWebDAVFormat = currentCursor.endsWith('.json');
      const isServerType = this.serverIdentifier?.type === 'server';
      
      // 如果当前是自建服务器但游标是 WebDAV 格式，清除游标
      if (isServerType && isWebDAVFormat) {
        console.log('[SyncEngine] Detected WebDAV cursor format for server sync, clearing');
        this.clearServerCursor();
        currentCursor = null;
      }
      // 如果当前是自建服务器且游标是异常大的数字（时间戳误设为游标），清除游标
      // change_id 是自增整数，正常不会超过 10 亿；时间戳是 13 位数字（万亿级别）
      else if (isServerType && /^\d+$/.test(currentCursor) && parseInt(currentCursor, 10) > 1_000_000_000) {
        console.log('[SyncEngine] Detected abnormally large cursor for server sync (likely timestamp), clearing:', currentCursor);
        this.clearServerCursor();
        currentCursor = null;
      }
      // 如果当前是 WebDAV 但游标不是 .json 格式（说明是旧的错误格式），清除游标
      // 注意：WebDAV 游标必须是 "{timestamp}.json" 格式，纯数字是错误的历史遗留
      else if (!isServerType && this.serverIdentifier?.type === 'webdav' && !isWebDAVFormat) {
        console.log('[SyncEngine] Detected non-WebDAV cursor format for WebDAV sync, clearing');
        this.clearServerCursor();
        currentCursor = null;
      }
    }

    console.log('[SyncEngine] Pull starting with cursor:', currentCursor, 'timestamp:', localTimestamp, 'server:', this.serverIdentifier);
    console.log('[SyncEngine] Adapter type:', this.adapter.constructor.name);
    this.reportProgress({ phase: 'pulling', message: '正在获取远端变更列表...' });

    // ✅ 触发全量拉取的两种情况：
    // 1. 游标为 null（新客户端首次同步）
    // 2. 游标已过期（长时间离线，变更日志已被清理）
    const cursorExpired = currentCursor && this.adapter.isCursorExpired
      ? await this.adapter.isCursorExpired(currentCursor)
      : false;

    if ((!currentCursor || cursorExpired) && this.adapter.listAllItems) {
      const remoteHasData = this.adapter.hasExistingData
        ? await this.adapter.hasExistingData()
        : false;

      if (remoteHasData) {
        if (cursorExpired) {
          console.log('[SyncEngine] Cursor expired (change logs cleaned up) — falling back to full pull');
          this.reportProgress({ phase: 'pulling', message: '变更日志已过期，正在全量拉取远端数据...' });
          // 清除过期游标，避免后续误用
          this.clearServerCursor();
        } else {
          console.log('[SyncEngine] No cursor found and remote has data — performing full pull');
          this.reportProgress({ phase: 'pulling', message: '首次同步，正在全量拉取远端数据...' });
        }

        const allItems = await this.adapter.listAllItems();
        const filteredItems = allItems.filter(item => this.shouldSyncType(item.type));
        console.log(`[SyncEngine] Full pull: ${filteredItems.length} items to process (filtered from ${allItems.length})`);

        const total = filteredItems.length;
        for (const remoteItem of filteredItems) {
          try {
            // 跳过已删除的 item
            if (remoteItem.deleted_time !== null) {
              const localItem = this.itemsManager.getByIdIncludeDeleted(remoteItem.id);
              if (localItem) {
                this.itemsManager.markDeletedFromRemote(remoteItem.id, remoteItem.deleted_time);
              }
              continue;
            }

            const localItem = this.itemsManager.getByIdIncludeDeleted(remoteItem.id);

            if (!localItem) {
              // 本地没有，直接创建
              this.itemsManager.createWithId(remoteItem);
              count++;
            } else if (localItem.content_hash !== remoteItem.content_hash) {
              // 内容不同，检查冲突
              if (localItem.sync_status === 'modified') {
                // 有冲突，创建副本
                const conflictPayload = JSON.parse(localItem.payload);
                conflictPayload.title = `${conflictPayload.title || 'Untitled'} (冲突副本)`;
                conflictPayload.is_conflict = true;
                this.itemsManager.create(localItem.type, conflictPayload);
                this.itemsManager.updateFromRemote(remoteItem);
                conflicts++;
              } else {
                // 远端更新，覆盖本地
                this.itemsManager.updateFromRemote(remoteItem);
              }
              count++;
            }
            // 内容相同则跳过

            if (count % 50 === 0) {
              this.reportProgress({
                phase: 'pulling',
                message: `正在全量下载... (${count}/${total})`,
                current: count,
                total,
              });
            }

            // 同时下载资源文件
            if (remoteItem.type === 'resource' && this.resourcesDir) {
              try {
                const payload = JSON.parse(remoteItem.payload) as ResourcePayload;
                const ext = path.extname(payload.filename).toLowerCase() || '.bin';
                const resourceId = `${remoteItem.id}${ext}`;
                const resourceFilePath = path.join(this.resourcesDir, resourceId);

                if (!fs.existsSync(resourceFilePath)) {
                  if (!fs.existsSync(this.resourcesDir)) {
                    fs.mkdirSync(this.resourcesDir, { recursive: true });
                  }
                  const fileData = await this.adapter.getResource(resourceId);
                  if (fileData) {
                    fs.writeFileSync(resourceFilePath, fileData);
                  }
                }
              } catch (resourceError) {
                console.error(`[SyncEngine] Error downloading resource for ${remoteItem.id}:`, resourceError);
              }
            }
          } catch (error) {
            errors.push(`Error processing item ${remoteItem.id}: ${(error as Error).message}`);
          }
        }

        // 全量拉取完成后，将游标设置为服务器最新的 change_id
        // 这样后续增量同步就能正常工作
        let newCursor: string;
        const serverAdapter = this.adapter as any;
        const lastChangeId = serverAdapter.getLastFullPullChangeId ? serverAdapter.getLastFullPullChangeId() : null;
        if (lastChangeId !== null && lastChangeId !== undefined) {
          // 自建服务器：用数字 change_id（包括 0，表示 changes 表为空）
          newCursor = lastChangeId.toString();
        } else if (this.serverIdentifier?.type === 'webdav') {
          // WebDAV：游标必须是 "{timestamp}.json" 格式，与变更文件名一致
          // 用当前时间戳生成一个游标，确保后续增量同步能正确定位
          newCursor = `${Date.now()}.json`;
        } else {
          newCursor = Date.now().toString();
        }
        this.setServerCursor(newCursor, Date.now());
        console.log('[SyncEngine] Full pull complete, set cursor to:', newCursor);

        this.reportProgress({
          phase: 'pulling',
          message: `全量下载完成，共 ${count} 项`,
          current: count,
          total,
        });

        return { count, conflicts, errors };
      }
    }

    // ✅ 增量同步：有游标时走变更日志路径
    let lastSuccessfulCursor = currentCursor;  // 记录最后成功处理的游标
    console.log('[SyncEngine] Entering incremental sync path with cursor:', currentCursor);

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
    // 使用包含已删除项的查询，确保能找到本地已存在的数据
    const localItem = this.itemsManager.getByIdIncludeDeleted(change.item_id);
    console.log(`[SyncEngine] processRemoteChange: item_id=${change.item_id}, type=${change.type}, deleted=${change.deleted_time !== null}, localExists=${!!localItem}, localSyncStatus=${localItem?.sync_status}, localHash=${localItem?.content_hash?.substring(0, 8)}, remoteHash=${change.content_hash?.substring(0, 8)}`);

    // 简化逻辑：远端标记删除，本地直接删除
    if (change.deleted_time !== null) {
      if (localItem) {
        // 本地有数据，直接标记删除
        this.itemsManager.markDeletedFromRemote(change.item_id, change.deleted_time);
        console.log(`[SyncEngine] Marked local item ${change.item_id} as deleted from remote`);
        // Phase 2：cloud_file/cloud_folder 删除需传播到本地文件系统
        if ((change.type === 'cloud_file' || change.type === 'cloud_folder') && this.onCloudItemDeleted) {
          try {
            this.onCloudItemDeleted(change.item_id);
          } catch (err) {
            console.warn(`[SyncEngine] onCloudItemDeleted 回调失败 ${change.item_id}:`, err);
          }
        }
      }
      // 本地没有数据，不需要处理（已删除的数据不需要创建）
      return { success: true, conflict: false };
    }

    // 以下处理非删除的变更
    if (localItem && localItem.deleted_time === null && localItem.sync_status === 'clean') {
      // 本地未删除且状态为 clean，检查是否需要更新
      if (localItem.content_hash === change.content_hash) {
        return { success: true, conflict: false, skipped: true };
      }
    }

    // 检查是否有冲突
    if (localItem && localItem.deleted_time === null && localItem.sync_status === 'modified') {
      return this.handleConflict(localItem, change);
    }

    // 拉取远端完整数据
    const remoteItem = await this.adapter.getItem(change.item_id);
    if (!remoteItem) {
      console.warn(`Remote item ${change.item_id} not found, skipping`);
      return { success: true, conflict: false };
    }

    // 如果是资源类型，下载资源文件
    if (change.type === 'resource' && this.resourcesDir) {
      try {
        const payload = JSON.parse(remoteItem.payload) as ResourcePayload;
        const ext = path.extname(payload.filename).toLowerCase() || '.bin';
        const resourceId = `${remoteItem.id}${ext}`;
        const resourceFilePath = path.join(this.resourcesDir, resourceId);
        
        if (!fs.existsSync(this.resourcesDir)) {
          fs.mkdirSync(this.resourcesDir, { recursive: true });
        }
        
        const fileData = await this.adapter.getResource(resourceId);
        if (fileData) {
          fs.writeFileSync(resourceFilePath, fileData);
        }
      } catch (resourceError) {
        console.error(`[SyncEngine] Error downloading resource file for ${change.item_id}:`, resourceError);
      }
    }

    // 写入本地
    if (localItem && localItem.deleted_time === null) {
      this.itemsManager.updateFromRemote(remoteItem);
    } else {
      this.itemsManager.createWithId(remoteItem);
    }

    // Phase 2：cloud_file 元数据已写入本地，触发物理文件下载
    // SyncEngine 不知道 watched_root_path，故只发回调；实际下载由 CloudDriveScheduler 执行。
    // download_state=pending 在此处标记：远端 file_hash 与本地不同即视为需下载。
    if (change.type === 'cloud_file' && this.onCloudFileChanged) {
      try {
        this.markCloudFileForDownload(remoteItem);
        this.onCloudFileChanged(remoteItem.id);
      } catch (err) {
        console.warn(`[SyncEngine] onCloudFileChanged 回调失败 ${remoteItem.id}:`, err);
      }
    }

    return { success: true, conflict: false };
  }

  /**
   * Phase 2：cloud_file 远端拉取后，标记 download_state=pending 触发物理下载。
   * 通过比较 payload.file_hash 与本地文件实际哈希决定是否需要重新下载；
   * 若本地文件尚不存在（首次拉取），直接标记 pending。
   */
  private markCloudFileForDownload(remoteItem: ItemBase): void {
    try {
      const payload = JSON.parse(remoteItem.payload) as import('@shared/types').CloudFilePayload;
      // 仅在 file_hash 存在时才校验；上传中 file_hash 可能尚未回填
      if (payload.file_hash) {
        payload.download_state = 'pending';
        payload.download_error = null;
        // 注意：downloaded_size 不清零——Scheduler 的 runDownload 会基于断点续传
        this.itemsManager.updateFromRemote({
          ...remoteItem,
          payload: JSON.stringify(payload),
        });
      }
    } catch (err) {
      console.warn(`[SyncEngine] markCloudFileForDownload 失败 ${remoteItem.id}:`, err);
    }
  }

  // 为冲突副本派生独立路径，避免覆盖原文件。
  // 例如 "notes/a.txt" -> "notes/a (冲突副本).txt"
  private deriveConflictPath(relativePath: string): string {
    const lastSlash = Math.max(relativePath.lastIndexOf('/'), relativePath.lastIndexOf('\\'));
    const dir = lastSlash >= 0 ? relativePath.slice(0, lastSlash + 1) : '';
    const fileName = lastSlash >= 0 ? relativePath.slice(lastSlash + 1) : relativePath;
    const dotIdx = fileName.lastIndexOf('.');
    const base = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
    const ext = dotIdx > 0 ? fileName.slice(dotIdx) : '';
    const conflictName = `${base} (冲突副本)${ext}`;
    return dir ? `${dir}${conflictName}` : conflictName;
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
      default: {
        // 创建冲突副本
        const conflictPayload = JSON.parse(localItem.payload);
        const originalTitle = conflictPayload.title || 'Untitled';
        conflictPayload.title = `${originalTitle} (冲突副本)`;
        conflictPayload.is_conflict = true;

        // cloud_file 需要额外处理：派生独立的 relative_path/filename，
        // 并通知 CloudDriveService 复制实际文件字节（P2-5 完成具体复制逻辑）。
        // 否则冲突副本与原记录会指向同一物理文件，远端覆盖时本地版本会丢失。
        if (localItem.type === 'cloud_file') {
          const originalRelPath: string =
            conflictPayload.relative_path || conflictPayload.filename || originalTitle;
          const conflictRelPath = this.deriveConflictPath(originalRelPath);
          conflictPayload.relative_path = conflictRelPath;
          conflictPayload.filename =
            conflictRelPath.split(/[\\/]/).pop() || conflictPayload.filename;

          // 重置下载相关状态——冲突副本是独立的本地副本，不需要下载
          conflictPayload.download_state = 'completed';
          conflictPayload.downloaded_size = conflictPayload.size || 0;
          conflictPayload.downloaded_at = Date.now();
          conflictPayload.download_error = null;

          if (this.onCloudFileConflict) {
            try {
              this.onCloudFileConflict(localItem.id, conflictRelPath);
            } catch (err) {
              console.warn(
                `[SyncEngine] onCloudFileConflict 回调失败 ${localItem.id}:`,
                err,
              );
            }
          }
        }

        this.itemsManager.create(localItem.type, conflictPayload);

        // 用远端版本覆盖原记录（使用专门的同步更新方法）
        this.itemsManager.updateFromRemote(remoteItem);

        return { success: true, conflict: true };
      }
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
