import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { ItemBase, ItemType } from '@shared/types';
import { DatabaseManager } from './Database';
import { SyncCursor } from '../sync/StorageAdapter';
import {
  decryptLocalPayload,
  encryptLocalPayload,
  isLocalPayloadEncrypted,
} from './LocalPayloadCrypto';

const LOCALLY_ENCRYPTED_ITEM_TYPES = new Set<ItemType>([
  'note',
  'excel_note',
  'vault_entry',
]);

export class ItemsManager {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
    const droppedPlaintextSearch = this.dropPlaintextSearchArtifacts();
    const migratedPayloads = this.migratePayloadEncryptionScope();
    if (droppedPlaintextSearch || migratedPayloads > 0) {
      this.compactDatabase();
    }
  }

  // ========== 同步游标管理（本地存储，按服务器独立）==========

  /**
   * 生成服务器标识符（用于区分不同的同步后端）
   * @param serverType 服务器类型 ('webdav' | 'server')
   * @param serverUrl 服务器 URL
   */
  private generateServerKey(serverType: string, serverUrl: string): string {
    // 使用 URL 的哈希作为标识符，避免 URL 中的特殊字符问题
    const urlHash = crypto.createHash('md5').update(serverUrl).digest('hex').substring(0, 8);
    return `sync_cursor:${serverType}:${urlHash}`;
  }

  /**
   * 获取本地同步游标（按服务器独立存储）
   * @param serverType 服务器类型 ('webdav' | 'server')
   * @param serverUrl 服务器 URL
   */
  getLocalSyncCursor(serverType?: string, serverUrl?: string): SyncCursor | null {
    try {
      // 如果提供了服务器信息，使用新的按服务器存储方式
      const key = serverType && serverUrl 
        ? this.generateServerKey(serverType, serverUrl)
        : 'sync_cursor';  // 兼容旧版本
      
      const result = this.db.get<{ value: string }>(
        'SELECT value FROM sync_meta WHERE key = ?',
        [key]
      );
      if (!result || !result.value || result.value === '0') {
        return null;
      }
      return JSON.parse(result.value);
    } catch (error) {
      console.error('Failed to get local sync cursor:', error);
      return null;
    }
  }

  /**
   * 设置本地同步游标（按服务器独立存储）
   * @param cursor 游标数据
   * @param serverType 服务器类型 ('webdav' | 'server')
   * @param serverUrl 服务器 URL
   */
  setLocalSyncCursor(cursor: SyncCursor, serverType?: string, serverUrl?: string): boolean {
    try {
      const key = serverType && serverUrl 
        ? this.generateServerKey(serverType, serverUrl)
        : 'sync_cursor';
      
      this.db.run(
        'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
        [key, JSON.stringify(cursor)]
      );
      return true;
    } catch (error) {
      console.error('Failed to set local sync cursor:', error);
      return false;
    }
  }

  /**
   * 清除本地同步游标（按服务器独立存储）
   * @param serverType 服务器类型 ('webdav' | 'server')
   * @param serverUrl 服务器 URL
   */
  clearLocalSyncCursor(serverType?: string, serverUrl?: string): boolean {
    try {
      const key = serverType && serverUrl 
        ? this.generateServerKey(serverType, serverUrl)
        : 'sync_cursor';
      
      this.db.run(
        'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
        [key, '0']
      );
      return true;
    } catch (error) {
      console.error('Failed to clear local sync cursor:', error);
      return false;
    }
  }

  /**
   * 清除所有同步游标（用于完全重置）
   */
  clearAllSyncCursors(): boolean {
    try {
      this.db.run(
        "DELETE FROM sync_meta WHERE key LIKE 'sync_cursor%'"
      );
      return true;
    } catch (error) {
      console.error('Failed to clear all sync cursors:', error);
      return false;
    }
  }

  // 计算内容哈希
  private computeHash(payload: string): string {
    return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
  }

  private decryptItem(item: ItemBase): ItemBase {
    if (!isLocalPayloadEncrypted(item.payload)) {
      return item;
    }
    return {
      ...item,
      payload: decryptLocalPayload(item.payload),
    };
  }

  private decryptItems(items: ItemBase[]): ItemBase[] {
    return items.map(item => this.decryptItem(item));
  }

  private shouldEncryptPayload(type: ItemType): boolean {
    return LOCALLY_ENCRYPTED_ITEM_TYPES.has(type);
  }

  private preparePayloadForStorage(type: ItemType, payload: string): string {
    if (this.shouldEncryptPayload(type)) {
      return encryptLocalPayload(payload);
    }

    // Keep non-sensitive local payloads plaintext. This also normalizes rows
    // that may have been encrypted by an older local-only development build.
    return isLocalPayloadEncrypted(payload) ? decryptLocalPayload(payload) : payload;
  }

  private migratePayloadEncryptionScope(): number {
    const items = this.db.query<{ id: string; type: ItemType; payload: string }>(
      'SELECT id, type, payload FROM items'
    );

    const updates = items
      .map(item => ({
        ...item,
        nextPayload: this.preparePayloadForStorage(item.type, item.payload),
      }))
      .filter(item => item.nextPayload !== item.payload);

    if (updates.length === 0) return 0;

    this.db.transaction(() => {
      for (const item of updates) {
        this.db.run('UPDATE items SET payload = ? WHERE id = ?', [
          item.nextPayload,
          item.id,
        ]);
      }
    });
    console.log(`[ItemsManager] Normalized ${updates.length} local payloads`);
    return updates.length;
  }

  private dropPlaintextSearchArtifacts(): boolean {
    const artifacts = this.db.query<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE name IN (
         'notes_fts_insert',
         'notes_fts_update',
         'notes_fts_delete',
         'notes_fts',
         'items_fts'
       )`
    );
    if (artifacts.length === 0) {
      return false;
    }

    this.db.getDatabase().exec(`
      DROP TRIGGER IF EXISTS notes_fts_insert;
      DROP TRIGGER IF EXISTS notes_fts_update;
      DROP TRIGGER IF EXISTS notes_fts_delete;
      DROP TABLE IF EXISTS notes_fts;
      DROP TABLE IF EXISTS items_fts;
    `);
    return true;
  }

  private compactDatabase(): void {
    try {
      this.db.getDatabase().pragma('wal_checkpoint(TRUNCATE)');
      this.db.getDatabase().exec('VACUUM');
      this.db.getDatabase().pragma('wal_checkpoint(TRUNCATE)');
    } catch (error) {
      console.warn('[ItemsManager] Failed to compact database after local encryption migration:', error);
    }
  }

  getAllForExport(): ItemBase[] {
    return this.decryptItems(this.db.query<ItemBase>('SELECT * FROM items'));
  }

  getRawById(id: string): ItemBase | undefined {
    return this.db.get<ItemBase>('SELECT * FROM items WHERE id = ?', [id]);
  }

  upsertFromPlainItem(item: ItemBase, syncStatus: ItemBase['sync_status'] = item.sync_status): ItemBase {
    const storedPayload = this.preparePayloadForStorage(item.type, item.payload);
    this.db.run(
      `INSERT OR REPLACE INTO items (id, type, created_time, updated_time, deleted_time, payload,
       content_hash, sync_status, local_rev, remote_rev, encryption_applied, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id, item.type, item.created_time, item.updated_time, item.deleted_time,
        storedPayload, item.content_hash, syncStatus, item.local_rev || 1,
        item.remote_rev, item.encryption_applied || 0, item.schema_version || 1,
      ]
    );
    return this.decryptItem({
      ...item,
      payload: storedPayload,
      sync_status: syncStatus,
    });
  }

  // 创建新 Item
  create<T extends object>(type: ItemType, payload: T): ItemBase {
    const now = Date.now();
    
    // 检查 payload 中是否有 _id 字段（用于创建带固定 ID 的记录）
    const payloadWithId = payload as T & { _id?: string };
    const customId = payloadWithId._id;
    
    // 如果有自定义 ID，从 payload 中移除 _id 字段
    if (customId) {
      delete payloadWithId._id;
    }
    
    const payloadStr = JSON.stringify(payloadWithId);
    const item: ItemBase = {
      id: customId || uuidv4(),
      type,
      created_time: now,
      updated_time: now,
      deleted_time: null,
      payload: payloadStr,
      content_hash: this.computeHash(payloadStr),
      sync_status: 'modified',
      local_rev: 1,
      remote_rev: null,
      encryption_applied: 0,
      schema_version: 1,
    };

    console.log(`[ItemsManager] Creating item: type=${type}, id=${item.id}, sync_status=${item.sync_status}`);

    this.db.run(
      `INSERT INTO items (id, type, created_time, updated_time, deleted_time, payload, 
       content_hash, sync_status, local_rev, remote_rev, encryption_applied, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id, item.type, item.created_time, item.updated_time, item.deleted_time,
        this.preparePayloadForStorage(item.type, item.payload), item.content_hash, item.sync_status, item.local_rev,
        item.remote_rev, item.encryption_applied, item.schema_version,
      ]
    );

    // 验证创建后的状态
    const created = this.getById(item.id);
    console.log(`[ItemsManager] Created item verified: id=${item.id}, sync_status=${created?.sync_status}`);

    return item;
  }

  // 创建带指定 ID 的 Item（用于同步时保持远端 ID）
  createWithId(item: ItemBase): ItemBase {
    return this.upsertFromPlainItem(item, 'clean');
  }

  // 获取单个 Item
  getById(id: string): ItemBase | undefined {
    const item = this.db.get<ItemBase>('SELECT * FROM items WHERE id = ? AND deleted_time IS NULL', [id]);
    return item ? this.decryptItem(item) : undefined;
  }

  // 获取单个 Item（包括已删除的）
  getByIdIncludeDeleted(id: string): ItemBase | undefined {
    const item = this.db.get<ItemBase>('SELECT * FROM items WHERE id = ?', [id]);
    return item ? this.decryptItem(item) : undefined;
  }

  // 获取所有指定类型的 Items
  getByType(type: ItemType): ItemBase[] {
    return this.decryptItems(this.db.query<ItemBase>(
      'SELECT * FROM items WHERE type = ? AND deleted_time IS NULL ORDER BY updated_time DESC',
      [type]
    ));
  }

  // 更新 Item（合并更新，保留未修改的字段）
  update<T extends object>(id: string, payload: T): ItemBase | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    // 解析现有的 payload 并合并新的更新
    let existingPayload: object = {};
    try {
      existingPayload = JSON.parse(existing.payload);
    } catch (e) {
      console.error('Failed to parse existing payload:', e);
    }

    // 合并：新的 payload 覆盖旧的字段，保留未修改的字段
    const mergedPayload = { ...existingPayload, ...payload };

    const now = Date.now();
    const payloadStr = JSON.stringify(mergedPayload);
    const newHash = this.computeHash(payloadStr);

    // 只有内容变化时才更新
    if (newHash === existing.content_hash) {
      console.log(`[ItemsManager] update: no content change for id=${id}, type=${existing.type}`);
      return existing;
    }

    console.log(`[ItemsManager] update: updating id=${id}, type=${existing.type}, old_sync_status=${existing.sync_status}, new_sync_status=modified`);

    this.db.run(
      `UPDATE items SET payload = ?, content_hash = ?, updated_time = ?, 
       local_rev = local_rev + 1, sync_status = 'modified' WHERE id = ?`,
      [this.preparePayloadForStorage(existing.type, payloadStr), newHash, now, id]
    );

    const updated = this.getById(id);
    console.log(`[ItemsManager] update: verified id=${id}, sync_status=${updated?.sync_status}`);
    return updated;
  }

  // 从远端同步更新 Item（不改变 sync_status 为 modified）
  updateFromRemote(item: ItemBase): ItemBase | undefined {
    const existing = this.getById(item.id);
    if (!existing) return undefined;

    // 直接使用远端的数据覆盖本地，包括 deleted_time
    this.db.run(
      `UPDATE items SET payload = ?, content_hash = ?, updated_time = ?, 
       remote_rev = ?, sync_status = 'clean', deleted_time = ? WHERE id = ?`,
      [
        this.preparePayloadForStorage(item.type, item.payload),
        item.content_hash,
        item.updated_time,
        item.remote_rev,
        item.deleted_time ?? null,
        item.id,
      ]
    );

    return this.getById(item.id);
  }

  // 从远端同步标记删除（直接设置 deleted_time，不改变 local_rev）
  markDeletedFromRemote(id: string, deletedTime: number): boolean {
    const result = this.db.run(
      `UPDATE items SET deleted_time = ?, sync_status = 'clean' WHERE id = ?`,
      [deletedTime, id]
    );
    return result.changes > 0;
  }

  // 软删除 Item
  softDelete(id: string): boolean {
    const result = this.db.run(
      `UPDATE items SET deleted_time = ?, sync_status = 'deleted', 
       local_rev = local_rev + 1 WHERE id = ? AND deleted_time IS NULL`,
      [Date.now(), id]
    );
    return result.changes > 0;
  }

  // 标记一个"已软删除但同步状态不是 deleted"的 Item 为待推送删除。
  // Bug B 场景：本地已 deleted_time!=null，但 sync_status 可能仍是旧值（如 'clean'/'modified'），
  // 远端拉取时若不处理会被 updateFromRemote 复活。此方法确保删除态尽快推送，不改变 deleted_time。
  markPendingDelete(id: string): boolean {
    const result = this.db.run(
      `UPDATE items SET sync_status = 'deleted', local_rev = local_rev + 1 
       WHERE id = ? AND deleted_time IS NOT NULL`,
      [id]
    );
    return result.changes > 0;
  }

  // 恢复已删除的 Item
  restore(id: string): boolean {
    const result = this.db.run(
      `UPDATE items SET deleted_time = NULL, sync_status = 'modified', 
       local_rev = local_rev + 1 WHERE id = ? AND deleted_time IS NOT NULL`,
      [id]
    );
    return result.changes > 0;
  }

  // 永久删除 Item
  hardDelete(id: string): boolean {
    const result = this.db.run('DELETE FROM items WHERE id = ?', [id]);
    return result.changes > 0;
  }

  // 获取已删除的 Items（回收站）
  getDeleted(type?: ItemType): ItemBase[] {
    if (type) {
      return this.decryptItems(this.db.query<ItemBase>(
        'SELECT * FROM items WHERE type = ? AND deleted_time IS NOT NULL ORDER BY deleted_time DESC',
        [type]
      ));
    }
    return this.decryptItems(this.db.query<ItemBase>(
      'SELECT * FROM items WHERE deleted_time IS NOT NULL ORDER BY deleted_time DESC'
    ));
  }

  // 获取需要同步的 Items
  getPendingSync(): ItemBase[] {
    const items = this.decryptItems(this.db.query<ItemBase>(
      "SELECT * FROM items WHERE sync_status IN ('modified', 'deleted') ORDER BY updated_time ASC"
    ));
    console.log(`[ItemsManager] getPendingSync: found ${items.length} items`);
    if (items.length > 0) {
      const byType = items.reduce((acc, i) => {
        acc[i.type] = (acc[i.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log('[ItemsManager] getPendingSync by type:', byType);
    }
    return items;
  }

  // 标记同步完成
  markSynced(id: string, remoteRev: string): boolean {
    const result = this.db.run(
      "UPDATE items SET sync_status = 'clean', remote_rev = ? WHERE id = ?",
      [remoteRev, id]
    );
    return result.changes > 0;
  }

  // 强制标记所有数据为待同步（用于首次同步或强制重新同步）
  markAllForSync(): number {
    const result = this.db.run(
      "UPDATE items SET sync_status = 'modified' WHERE deleted_time IS NULL AND sync_status = 'clean'"
    );
    return result.changes;
  }

  // 重置同步状态（清除所有同步记录，用于切换同步服务器）
  resetSyncStatus(): number {
    const result = this.db.run(
      "UPDATE items SET sync_status = 'modified', remote_rev = NULL WHERE deleted_time IS NULL"
    );
    return result.changes;
  }

  // 标记为冲突
  markConflict(id: string): boolean {
    const result = this.db.run("UPDATE items SET sync_status = 'conflict' WHERE id = ?", [id]);
    return result.changes > 0;
  }

  // 搜索 Items（基础实现，后续用 FTS5 增强）
  search(query: string, type?: ItemType): ItemBase[] {
    const normalized = query.toLowerCase();
    const items = type
      ? this.getByType(type)
      : this.decryptItems(this.db.query<ItemBase>(
          'SELECT * FROM items WHERE deleted_time IS NULL ORDER BY updated_time DESC'
        ));
    return items.filter(item => item.payload.toLowerCase().includes(normalized));
  }

  // 递归获取所有子文件夹 ID
  private getAllChildFolderIds(folderId: string): string[] {
    const childIds: string[] = [];
    const directChildren = this.getByType('folder').filter(folder => {
      try {
        return (JSON.parse(folder.payload) as { parent_id?: string | null }).parent_id === folderId;
      } catch {
        return false;
      }
    });
    for (const child of directChildren) {
      childIds.push(child.id);
      childIds.push(...this.getAllChildFolderIds(child.id));
    }
    return childIds;
  }

  // 按文件夹获取笔记（包括子文件夹中的笔记）
  // folderId === null 时返回所有笔记（用于"所有笔记"视图）
  getNotesByFolder(folderId: string | null): ItemBase[] {
    if (folderId === null) {
      // 返回所有笔记，不限制文件夹
      return this.decryptItems(this.db.query<ItemBase>(
        `SELECT * FROM items WHERE type = 'note' AND deleted_time IS NULL 
         ORDER BY updated_time DESC`
      ));
    }
    
    // 获取当前文件夹及所有子文件夹的 ID
    const allFolderIds = [folderId, ...this.getAllChildFolderIds(folderId)];
    
    return this.getByType('note').filter(note => {
      try {
        return allFolderIds.includes((JSON.parse(note.payload) as { folder_id?: string | null }).folder_id || '');
      } catch {
        return false;
      }
    });
  }

  // 获取置顶笔记
  getPinnedNotes(): ItemBase[] {
    return this.getByType('note').filter(note => {
      try {
        return Boolean((JSON.parse(note.payload) as { is_pinned?: boolean }).is_pinned);
      } catch {
        return false;
      }
    });
  }

  // 统计信息
  getStats(): { total: number; byType: Record<string, number> } {
    const total = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM items WHERE deleted_time IS NULL'
    );
    const byType = this.db.query<{ type: string; count: number }>(
      'SELECT type, COUNT(*) as count FROM items WHERE deleted_time IS NULL GROUP BY type'
    );

    return {
      total: total?.count || 0,
      byType: byType.reduce(
        (acc, row) => {
          acc[row.type] = row.count;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }
}

export default ItemsManager;
