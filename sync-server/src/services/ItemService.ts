import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDatabase } from '../database';
import { ItemBase, CountResult } from '../types';
import { ChangeService } from './ChangeService';
import { userService } from './UserService';
import { ResourceService } from './ResourceService';

// 拥有二进制内容的 item 类型（resource = 附件，cloud_file = 网盘文件）。
// 这些类型的二进制内容以 id 为键存放在文件系统，软删除清理时需要一并删除磁盘文件。
const BINARY_ITEM_TYPES = new Set(['resource', 'cloud_file']);

export class ItemService {
  private changeService: ChangeService;
  private userId?: string;

  constructor(userId?: string) {
    this.changeService = new ChangeService();
    this.userId = userId;
  }

  private prepareUserScope(): void {
    userService.claimLegacyDataForSingleUser(this.userId);
  }

  // 获取单个数据项
  getItem(id: string): ItemBase | null {
    this.prepareUserScope();
    const db = getDatabase();
    let stmt;
    let row;

    if (this.userId) {
      // 用户隔离：只能获取自己的数据
      stmt = db.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?');
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
    this.prepareUserScope();
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
    this.prepareUserScope();
    const db = getDatabase();
    const existing = this.getItem(id);
    
    if (!existing) {
      return false;
    }

    let stmt;
    if (this.userId) {
      stmt = db.prepare('DELETE FROM items WHERE id = ? AND user_id = ?');
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

  // 软删除数据项
  softDeleteItem(id: string): boolean {
    this.prepareUserScope();
    const db = getDatabase();
    const existing = this.getItem(id);
    if (!existing || existing.deleted_time !== null) {
      return false;
    }
    const now = Date.now();
    let stmt;
    let result;

    if (this.userId) {
      stmt = db.prepare(
        `UPDATE items
         SET deleted_time = ?, updated_time = ?, sync_status = 'deleted'
         WHERE id = ? AND user_id = ? AND deleted_time IS NULL`
      );
      result = stmt.run(now, now, id, this.userId);
    } else {
      stmt = db.prepare(
        `UPDATE items
         SET deleted_time = ?, updated_time = ?, sync_status = 'deleted'
         WHERE id = ? AND deleted_time IS NULL`
      );
      result = stmt.run(now, now, id);
    }

    if (result.changes <= 0) {
      return false;
    }

    this.changeService.recordChange({
      item_id: id,
      type: existing.type,
      updated_time: now,
      deleted_time: now,
      content_hash: existing.content_hash,
    }, this.userId);

    return true;
  }

  moveCloudItem(id: string, newRelativePath: string, newParentFolderId: string | null): boolean {
    this.prepareUserScope();
    const db = getDatabase();
    const existing = this.getItem(id);
    if (!existing || existing.deleted_time !== null) {
      return false;
    }
    if (existing.type !== 'cloud_file' && existing.type !== 'cloud_folder') {
      return false;
    }

    const now = Date.now();
    const remoteRev = now.toString();
    const oldPayload = this.parsePayload(existing.payload);
    const oldRelativePath = String(oldPayload.relative_path || '');
    const normalizedNewRelativePath = this.normalizeCloudPath(newRelativePath);
    if (!normalizedNewRelativePath) {
      return false;
    }

    const updates: Array<{ item: ItemBase; payload: any }> = [];
    const rootPayload = { ...oldPayload };
    if (existing.type === 'cloud_folder') {
      rootPayload.name = normalizedNewRelativePath.split('/').pop() || rootPayload.name;
      rootPayload.parent_folder_id = newParentFolderId;
    } else {
      rootPayload.filename = normalizedNewRelativePath.split('/').pop() || rootPayload.filename;
      rootPayload.parent_folder_id = newParentFolderId ?? 'root';
    }
    rootPayload.relative_path = normalizedNewRelativePath;
    updates.push({ item: existing, payload: rootPayload });

    if (existing.type === 'cloud_folder') {
      const descendants = this.getCloudDescendants(oldRelativePath);
      for (const descendant of descendants) {
        const descendantPayload = this.parsePayload(descendant.payload);
        const currentRelativePath = String(descendantPayload.relative_path || '');
        if (!currentRelativePath.startsWith(oldRelativePath + '/')) continue;
        const suffix = currentRelativePath.substring(oldRelativePath.length);
        descendantPayload.relative_path = normalizedNewRelativePath + suffix;
        if (descendant.type === 'cloud_folder') {
          descendantPayload.name =
            descendantPayload.relative_path.split('/').pop() || descendantPayload.name;
        } else if (descendant.type === 'cloud_file') {
          descendantPayload.filename =
            descendantPayload.relative_path.split('/').pop() || descendantPayload.filename;
        }
        updates.push({ item: descendant, payload: descendantPayload });
      }
    }

    const transaction = db.transaction(() => {
      for (const entry of updates) {
        const payloadStr = JSON.stringify(entry.payload);
        const contentHash = this.computeContentHash(payloadStr);
        db.prepare(`
          UPDATE items SET
            payload = ?,
            content_hash = ?,
            remote_rev = ?,
            updated_time = ?,
            sync_status = 'clean'
          WHERE id = ?
        `).run(payloadStr, contentHash, remoteRev, now, entry.item.id);

        this.changeService.recordChange({
          item_id: entry.item.id,
          type: entry.item.type,
          updated_time: now,
          deleted_time: null,
          content_hash: contentHash,
        }, this.userId);
      }
    });

    transaction();
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
    this.prepareUserScope();
    const db = getDatabase();

    // 构建用户过滤条件
    const userFilter = this.userId 
      ? 'AND user_id = ?' 
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

  // 清理软删除的数据项（含二进制内容的磁盘文件）
  // 二进制类型（resource / cloud_file）的磁盘文件会随行一起被删除，
  // 避免软删除保留期到期后留下孤儿二进制（每个网盘文件可达 500MB）。
  cleanupSoftDeleted(before: number): number {
    this.prepareUserScope();
    const db = getDatabase();

    // 1) 先查出即将被删除的二进制类型行（需要 payload 解析扩展名 + 行级 user_id 定位磁盘目录）
    let selectStmt;
    if (this.userId) {
      selectStmt = db.prepare(`
        SELECT id, payload, user_id
        FROM items
        WHERE deleted_time IS NOT NULL AND deleted_time < ? AND user_id = ?
          AND type IN ('resource', 'cloud_file')
      `);
      selectStmt.all(before, this.userId).forEach((row) => this.deleteBinaryForRow(row as { id: string; payload: string; user_id: string | null }));
    } else {
      // 无用户隔离：扫描全部，按各行自己的 user_id 定位目录
      selectStmt = db.prepare(`
        SELECT id, payload, user_id
        FROM items
        WHERE deleted_time IS NOT NULL AND deleted_time < ?
          AND type IN ('resource', 'cloud_file')
      `);
      selectStmt.all(before).forEach((row) => this.deleteBinaryForRow(row as { id: string; payload: string; user_id: string | null }));
    }

    // 2) 删除行
    let stmt;
    if (this.userId) {
      stmt = db.prepare(`
        DELETE FROM items
        WHERE deleted_time IS NOT NULL AND deleted_time < ? AND user_id = ?
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

  // 删除单行对应的二进制磁盘文件（尽力而为，失败不抛出，只记录）。
  // 扩展名从 payload.filename 解析；磁盘目录由行级 user_id 决定。
  private deleteBinaryForRow(row: { id: string; payload: string; user_id: string | null }): void {
    try {
      let filename: string | undefined;
      try {
        const payload = JSON.parse(row.payload || '{}') as { filename?: string };
        filename = payload.filename;
      } catch {
        // payload 非法 JSON，无法确定扩展名 → 用无扩展名路径兜底（多数上传会带扩展名，此处可能 unlink 不到）
      }
      const extension = filename ? path.extname(filename) : '';
      const resourceService = new ResourceService(row.user_id || undefined);
      // resolveStoragePath 与上传端点落盘路径完全一致（users/{userId}/{subDir}/{id}{ext}）
      const filePath = resourceService.resolveStoragePath(row.id, extension);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // 删除磁盘文件失败不应阻断行清理流程；行删除后即变为孤儿，留待人工清理
    }
  }

  private parsePayload(payload: string): any {
    try {
      return JSON.parse(payload || '{}');
    } catch {
      return {};
    }
  }

  private normalizeCloudPath(relativePath: string): string {
    return String(relativePath || '')
      .split('/')
      .map(seg => seg.trim())
      .filter(Boolean)
      .join('/');
  }

  private computeContentHash(payload: string): string {
    return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
  }

  private getCloudDescendants(prefix: string): ItemBase[] {
    const db = getDatabase();
    const escapedPrefix = `${prefix.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}/`;
    let stmt;
    if (this.userId) {
      stmt = db.prepare(`
        SELECT * FROM items
        WHERE user_id = ?
          AND deleted_time IS NULL
          AND type IN ('cloud_file', 'cloud_folder')
          AND payload LIKE ?
      `);
      return stmt.all(this.userId, `%\"relative_path\":\"${escapedPrefix}%`) as ItemBase[];
    }
    stmt = db.prepare(`
      SELECT * FROM items
      WHERE deleted_time IS NULL
        AND type IN ('cloud_file', 'cloud_folder')
        AND payload LIKE ?
    `);
    return stmt.all(`%\"relative_path\":\"${escapedPrefix}%`) as ItemBase[];
  }
}
