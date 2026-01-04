import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { ItemBase, ItemType, SyncStatus } from '@shared/types';
import { DatabaseManager } from './Database';

export class ItemsManager {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  // 计算内容哈希
  private computeHash(payload: string): string {
    return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
  }

  // 创建新 Item
  create<T extends object>(type: ItemType, payload: T): ItemBase {
    const now = Date.now();
    const payloadStr = JSON.stringify(payload);
    const item: ItemBase = {
      id: uuidv4(),
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

    this.db.run(
      `INSERT INTO items (id, type, created_time, updated_time, deleted_time, payload, 
       content_hash, sync_status, local_rev, remote_rev, encryption_applied, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id, item.type, item.created_time, item.updated_time, item.deleted_time,
        item.payload, item.content_hash, item.sync_status, item.local_rev,
        item.remote_rev, item.encryption_applied, item.schema_version,
      ]
    );

    return item;
  }

  // 创建带指定 ID 的 Item（用于同步时保持远端 ID）
  createWithId(item: ItemBase): ItemBase {
    this.db.run(
      `INSERT OR REPLACE INTO items (id, type, created_time, updated_time, deleted_time, payload, 
       content_hash, sync_status, local_rev, remote_rev, encryption_applied, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id, item.type, item.created_time, item.updated_time, item.deleted_time,
        item.payload, item.content_hash, 'clean', item.local_rev,
        item.remote_rev, item.encryption_applied, item.schema_version,
      ]
    );

    return item;
  }

  // 获取单个 Item
  getById(id: string): ItemBase | undefined {
    return this.db.get<ItemBase>('SELECT * FROM items WHERE id = ? AND deleted_time IS NULL', [id]);
  }

  // 获取单个 Item（包括已删除的）
  getByIdIncludeDeleted(id: string): ItemBase | undefined {
    return this.db.get<ItemBase>('SELECT * FROM items WHERE id = ?', [id]);
  }

  // 获取所有指定类型的 Items
  getByType(type: ItemType): ItemBase[] {
    return this.db.query<ItemBase>(
      'SELECT * FROM items WHERE type = ? AND deleted_time IS NULL ORDER BY updated_time DESC',
      [type]
    );
  }

  // 更新 Item
  update<T extends object>(id: string, payload: T): ItemBase | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const now = Date.now();
    const payloadStr = JSON.stringify(payload);
    const newHash = this.computeHash(payloadStr);

    // 只有内容变化时才更新
    if (newHash === existing.content_hash) {
      return existing;
    }

    this.db.run(
      `UPDATE items SET payload = ?, content_hash = ?, updated_time = ?, 
       local_rev = local_rev + 1, sync_status = 'modified' WHERE id = ?`,
      [payloadStr, newHash, now, id]
    );

    return this.getById(id);
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
      return this.db.query<ItemBase>(
        'SELECT * FROM items WHERE type = ? AND deleted_time IS NOT NULL ORDER BY deleted_time DESC',
        [type]
      );
    }
    return this.db.query<ItemBase>(
      'SELECT * FROM items WHERE deleted_time IS NOT NULL ORDER BY deleted_time DESC'
    );
  }

  // 获取需要同步的 Items
  getPendingSync(): ItemBase[] {
    return this.db.query<ItemBase>(
      "SELECT * FROM items WHERE sync_status IN ('modified', 'deleted') ORDER BY updated_time ASC"
    );
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
    const likeQuery = `%${query}%`;
    if (type) {
      return this.db.query<ItemBase>(
        `SELECT * FROM items WHERE type = ? AND deleted_time IS NULL 
         AND payload LIKE ? ORDER BY updated_time DESC`,
        [type, likeQuery]
      );
    }
    return this.db.query<ItemBase>(
      `SELECT * FROM items WHERE deleted_time IS NULL 
       AND payload LIKE ? ORDER BY updated_time DESC`,
      [likeQuery]
    );
  }

  // 按文件夹获取笔记
  // folderId === null 时返回所有笔记（用于"所有笔记"视图）
  getNotesByFolder(folderId: string | null): ItemBase[] {
    if (folderId === null) {
      // 返回所有笔记，不限制文件夹
      return this.db.query<ItemBase>(
        `SELECT * FROM items WHERE type = 'note' AND deleted_time IS NULL 
         ORDER BY updated_time DESC`
      );
    }
    return this.db.query<ItemBase>(
      `SELECT * FROM items WHERE type = 'note' AND deleted_time IS NULL 
       AND json_extract(payload, '$.folder_id') = ? ORDER BY updated_time DESC`,
      [folderId]
    );
  }

  // 获取置顶笔记
  getPinnedNotes(): ItemBase[] {
    return this.db.query<ItemBase>(
      `SELECT * FROM items WHERE type = 'note' AND deleted_time IS NULL 
       AND json_extract(payload, '$.is_pinned') = 1 ORDER BY updated_time DESC`
    );
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
