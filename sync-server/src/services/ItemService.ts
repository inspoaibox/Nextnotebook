import { getDatabase } from '../database';
import { ItemBase, CountResult } from '../types';
import { ChangeService } from './ChangeService';

export class ItemService {
  private changeService: ChangeService;
  private userId?: string;

  constructor(userId?: string) {
    this.changeService = new ChangeService();
    this.userId = userId;
  }

  // 获取单个数据项
  getItem(id: string): ItemBase | null {
    const db = getDatabase();
    let stmt;
    let row;

    if (this.userId) {
      // 用户隔离：只能获取自己的数据
      stmt = db.prepare('SELECT * FROM items WHERE id = ? AND (user_id = ? OR user_id IS NULL)');
      row = stmt.get(id, this.userId) as ItemBase | undefined;
    } else {
      // 向后兼容：无用户隔离
      stmt = db.prepare('SELECT * FROM items WHERE id = ?');
      row = stmt.get(id) as ItemBase | undefined;
    }

    return row || null;
  }

  // 创建或更新数据项
  putItem(item: Partial<ItemBase> & { id: string; type: string; payload: string; content_hash: string }): { remoteRev: string } {
    const db = getDatabase();
    const now = Date.now();
    const remoteRev = now.toString();

    const existing = this.getItem(item.id);

    if (existing) {
      // 更新现有数据项
      const stmt = db.prepare(`
        UPDATE items SET
          type = ?,
          payload = ?,
          content_hash = ?,
          remote_rev = ?,
          deleted_time = ?,
          updated_time = ?,
          sync_status = ?,
          local_rev = ?,
          encryption_applied = ?,
          schema_version = ?,
          user_id = COALESCE(user_id, ?)
        WHERE id = ?
      `);

      stmt.run(
        item.type,
        item.payload,
        item.content_hash,
        remoteRev,
        item.deleted_time ?? null,
        item.updated_time ?? now,
        item.sync_status ?? 'clean',
        item.local_rev ?? existing.local_rev,
        item.encryption_applied ?? existing.encryption_applied,
        item.schema_version ?? existing.schema_version,
        this.userId || null,
        item.id
      );
    } else {
      // 创建新数据项
      const stmt = db.prepare(`
        INSERT INTO items (
          id, type, payload, content_hash, remote_rev, deleted_time,
          created_time, updated_time, sync_status, local_rev,
          encryption_applied, schema_version, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        item.id,
        item.type,
        item.payload,
        item.content_hash,
        remoteRev,
        item.deleted_time ?? null,
        item.created_time ?? now,
        item.updated_time ?? now,
        item.sync_status ?? 'clean',
        item.local_rev ?? 0,
        item.encryption_applied ?? 0,
        item.schema_version ?? 1,
        this.userId || null
      );
    }

    // 记录变更
    this.changeService.recordChange({
      item_id: item.id,
      type: item.type as ItemBase['type'],
      updated_time: item.updated_time ?? now,
      deleted_time: item.deleted_time ?? null,
      content_hash: item.content_hash,
    }, this.userId);

    return { remoteRev };
  }

  // 硬删除数据项
  deleteItem(id: string): boolean {
    const db = getDatabase();
    const existing = this.getItem(id);
    
    if (!existing) {
      return false;
    }

    let stmt;
    if (this.userId) {
      stmt = db.prepare('DELETE FROM items WHERE id = ? AND (user_id = ? OR user_id IS NULL)');
      stmt.run(id, this.userId);
    } else {
      stmt = db.prepare('DELETE FROM items WHERE id = ?');
      stmt.run(id);
    }

    // 记录删除变更
    const now = Date.now();
    this.changeService.recordChange({
      item_id: id,
      type: existing.type,
      updated_time: now,
      deleted_time: now,
      content_hash: existing.content_hash,
    }, this.userId);

    return true;
  }

  // 批量操作
  batchPut(items: Array<Partial<ItemBase> & { id: string; type: string; payload: string; content_hash: string }>): { success: boolean; results: Array<{ id: string; remoteRev: string }> } {
    const db = getDatabase();
    const results: Array<{ id: string; remoteRev: string }> = [];

    const transaction = db.transaction(() => {
      for (const item of items) {
        const { remoteRev } = this.putItem(item);
        results.push({ id: item.id, remoteRev });
      }
    });

    transaction();

    return { success: true, results };
  }

  // 获取数据项计数
  getCount(type?: string): CountResult {
    const db = getDatabase();

    // 构建用户过滤条件
    const userFilter = this.userId 
      ? 'AND (user_id = ? OR user_id IS NULL)' 
      : '';
    const userParams = this.userId ? [this.userId] : [];

    // 总计数（不包括软删除的）
    let total: number;

    if (type) {
      const stmt = db.prepare(`SELECT COUNT(*) as count FROM items WHERE type = ? AND deleted_time IS NULL ${userFilter}`);
      total = (stmt.get(type, ...userParams) as { count: number }).count;
    } else {
      const stmt = db.prepare(`SELECT COUNT(*) as count FROM items WHERE deleted_time IS NULL ${userFilter}`);
      total = (stmt.get(...userParams) as { count: number }).count;
    }

    // 按类型统计
    const byTypeStmt = db.prepare(`
      SELECT type, COUNT(*) as count 
      FROM items 
      WHERE deleted_time IS NULL ${userFilter}
      GROUP BY type
    `);
    const byTypeRows = byTypeStmt.all(...userParams) as Array<{ type: string; count: number }>;
    const byType: Record<string, number> = {};
    for (const row of byTypeRows) {
      byType[row.type] = row.count;
    }

    return {
      hasData: total > 0,
      itemCount: total,
      byType,
    };
  }

  // 清理软删除的数据项
  cleanupSoftDeleted(before: number): number {
    const db = getDatabase();
    
    let stmt;
    if (this.userId) {
      stmt = db.prepare(`
        DELETE FROM items 
        WHERE deleted_time IS NOT NULL AND deleted_time < ? AND (user_id = ? OR user_id IS NULL)
      `);
      const result = stmt.run(before, this.userId);
      return result.changes;
    } else {
      stmt = db.prepare(`
        DELETE FROM items 
        WHERE deleted_time IS NOT NULL AND deleted_time < ?
      `);
      const result = stmt.run(before);
      return result.changes;
    }
  }
}
