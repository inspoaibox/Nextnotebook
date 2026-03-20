import { getDatabase } from '../database';
import { RemoteChange, ChangeListResult, ItemType } from '../types';

export interface ChangeInput {
  item_id: string;
  type: ItemType;
  updated_time: number;
  deleted_time: number | null;
  content_hash: string;
}

export class ChangeService {
  // 记录变更
  recordChange(change: ChangeInput, userId?: string): void {
    const db = getDatabase();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO changes (item_id, type, updated_time, deleted_time, content_hash, created_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      change.item_id,
      change.type,
      change.updated_time,
      change.deleted_time,
      change.content_hash,
      now,
      userId || null
    );
  }

  // 获取变更列表
  listChanges(cursor?: string, limit: number = 100, userId?: string): ChangeListResult {
    const db = getDatabase();
    const cursorNum = cursor ? parseInt(cursor, 10) : 0;

    console.log(`[ChangeService] listChanges called: cursor=${cursor}, cursorNum=${cursorNum}, limit=${limit}, userId=${userId}`);

    // 构建用户过滤条件
    const userFilter = userId 
      ? 'AND (user_id = ? OR user_id IS NULL)' 
      : '';
    const userParams = userId ? [userId] : [];

    // 获取变更列表（多取一条用于判断 hasMore）
    const stmt = db.prepare(`
      SELECT change_id, item_id, type, updated_time, deleted_time, content_hash
      FROM changes
      WHERE change_id > ? ${userFilter}
      ORDER BY change_id ASC
      LIMIT ?
    `);

    const rows = stmt.all(cursorNum, ...userParams, limit + 1) as RemoteChange[];
    
    console.log(`[ChangeService] Query returned ${rows.length} rows`);
    if (rows.length > 0) {
      console.log(`[ChangeService] First change_id: ${rows[0].change_id}, Last change_id: ${rows[rows.length - 1].change_id}`);
    }
    
    // 调试：查看所有变更的 change_id 范围
    const allChanges = db.prepare('SELECT MIN(change_id) as min_id, MAX(change_id) as max_id, COUNT(*) as total FROM changes').get() as { min_id: number; max_id: number; total: number };
    console.log(`[ChangeService] Total changes in DB: ${allChanges.total}, min_id: ${allChanges.min_id}, max_id: ${allChanges.max_id}`);

    const hasMore = rows.length > limit;
    const changes = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = changes.length > 0 ? changes[changes.length - 1].change_id.toString() : null;

    console.log(`[ChangeService] Returning ${changes.length} changes, nextCursor=${nextCursor}, hasMore=${hasMore}`);

    return {
      changes,
      nextCursor,
      hasMore,
    };
  }

  // 检查游标是否已过期（游标对应的变更记录已被清理）
  isCursorExpired(cursor: string, userId?: string): boolean {
    const db = getDatabase();
    const cursorNum = parseInt(cursor, 10);
    if (isNaN(cursorNum)) return false;

    const userFilter = userId ? 'AND (user_id = ? OR user_id IS NULL)' : '';
    const userParams = userId ? [userId] : [];

    // 查找比游标更新的最早一条变更
    const stmt = db.prepare(`
      SELECT MIN(change_id) as min_id FROM changes
      WHERE change_id > 0 ${userFilter}
    `);
    const row = stmt.get(...userParams) as { min_id: number | null };

    if (row.min_id === null) return false; // 没有任何变更，不算过期

    // 如果最早现存变更的 change_id 大于游标，说明中间有变更被清理掉了
    return row.min_id > cursorNum + 1;
  }

  // 清理过期变更
  cleanupBefore(timestamp: number): number {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM changes WHERE created_at < ?');
    const result = stmt.run(timestamp);
    return result.changes;
  }
}
