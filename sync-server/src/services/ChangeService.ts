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
    const hasMore = rows.length > limit;
    const changes = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = changes.length > 0 ? changes[changes.length - 1].change_id.toString() : null;

    return {
      changes,
      nextCursor,
      hasMore,
    };
  }

  // 清理过期变更
  cleanupBefore(timestamp: number): number {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM changes WHERE created_at < ?');
    const result = stmt.run(timestamp);
    return result.changes;
  }
}
