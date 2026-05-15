import { getDatabase } from '../database';
import { RemoteChange, ChangeListResult, ItemType } from '../types';
import { userService } from './UserService';

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
    userService.claimLegacyDataForSingleUser(userId);
    const db = getDatabase();
    const cursorNum = cursor ? parseInt(cursor, 10) : 0;

    // 构建用户过滤条件
    const userFilter = userId 
      ? 'AND user_id = ?' 
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

  // 检查游标是否已过期（游标对应的变更记录已被清理）
  isCursorExpired(cursor: string, userId?: string): boolean {
    userService.claimLegacyDataForSingleUser(userId);
    const db = getDatabase();
    const cursorNum = parseInt(cursor, 10);
    if (isNaN(cursorNum)) return false;

    const userFilter = userId ? 'AND user_id = ?' : '';
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
  cleanupBefore(timestamp: number, userId?: string): number {
    userService.claimLegacyDataForSingleUser(userId);
    const db = getDatabase();
    const stmt = userId
      ? db.prepare('DELETE FROM changes WHERE created_at < ? AND user_id = ?')
      : db.prepare('DELETE FROM changes WHERE created_at < ?');
    const result = userId ? stmt.run(timestamp, userId) : stmt.run(timestamp);
    return result.changes;
  }
}
