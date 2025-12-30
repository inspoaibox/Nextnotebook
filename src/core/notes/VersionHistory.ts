import { DatabaseManager } from '../database/Database';

export interface NoteVersion {
  id: number;
  noteId: string;
  title: string;
  content: string;
  createdAt: number;
  size: number;
}

export class VersionHistory {
  private db: DatabaseManager;
  private maxVersions: number;
  private minInterval: number;  // 最小保存间隔（毫秒）

  constructor(db: DatabaseManager, maxVersions: number = 50, minInterval: number = 60000) {
    this.db = db;
    this.maxVersions = maxVersions;
    this.minInterval = minInterval;
    this.initializeTable();
  }

  // 初始化版本历史表
  private initializeTable(): void {
    this.db.getDatabase().exec(`
      CREATE TABLE IF NOT EXISTS note_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        size INTEGER NOT NULL,
        FOREIGN KEY (note_id) REFERENCES items(id) ON DELETE CASCADE
      )
    `);

    this.db.getDatabase().exec(`
      CREATE INDEX IF NOT EXISTS idx_note_versions_note_id ON note_versions(note_id)
    `);

    this.db.getDatabase().exec(`
      CREATE INDEX IF NOT EXISTS idx_note_versions_created_at ON note_versions(created_at)
    `);
  }

  // 保存版本
  saveVersion(noteId: string, title: string, content: string): boolean {
    // 检查是否需要保存（避免频繁保存）
    const lastVersion = this.getLatestVersion(noteId);
    if (lastVersion) {
      const timeSinceLastSave = Date.now() - lastVersion.createdAt;
      if (timeSinceLastSave < this.minInterval) {
        return false;
      }
      // 如果内容没有变化，不保存
      if (lastVersion.content === content && lastVersion.title === title) {
        return false;
      }
    }

    const size = new Blob([content]).size;
    this.db.run(
      'INSERT INTO note_versions (note_id, title, content, created_at, size) VALUES (?, ?, ?, ?, ?)',
      [noteId, title, content, Date.now(), size]
    );

    // 清理旧版本
    this.cleanupOldVersions(noteId);

    return true;
  }

  // 获取笔记的所有版本
  getVersions(noteId: string): NoteVersion[] {
    return this.db.query<NoteVersion>(
      'SELECT id, note_id as noteId, title, content, created_at as createdAt, size FROM note_versions WHERE note_id = ? ORDER BY created_at DESC',
      [noteId]
    );
  }

  // 获取最新版本
  getLatestVersion(noteId: string): NoteVersion | undefined {
    return this.db.get<NoteVersion>(
      'SELECT id, note_id as noteId, title, content, created_at as createdAt, size FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT 1',
      [noteId]
    );
  }

  // 获取特定版本
  getVersion(versionId: number): NoteVersion | undefined {
    return this.db.get<NoteVersion>(
      'SELECT id, note_id as noteId, title, content, created_at as createdAt, size FROM note_versions WHERE id = ?',
      [versionId]
    );
  }

  // 恢复到特定版本
  restoreVersion(versionId: number): { noteId: string; title: string; content: string } | null {
    const version = this.getVersion(versionId);
    if (!version) return null;

    return {
      noteId: version.noteId,
      title: version.title,
      content: version.content,
    };
  }

  // 删除特定版本
  deleteVersion(versionId: number): boolean {
    const result = this.db.run('DELETE FROM note_versions WHERE id = ?', [versionId]);
    return result.changes > 0;
  }

  // 删除笔记的所有版本
  deleteAllVersions(noteId: string): number {
    const result = this.db.run('DELETE FROM note_versions WHERE note_id = ?', [noteId]);
    return result.changes;
  }

  // 清理旧版本
  private cleanupOldVersions(noteId: string): void {
    const versions = this.getVersions(noteId);
    if (versions.length > this.maxVersions) {
      const toDelete = versions.slice(this.maxVersions);
      for (const version of toDelete) {
        this.deleteVersion(version.id);
      }
    }
  }

  // 获取版本统计
  getStats(noteId: string): { count: number; totalSize: number; oldestDate: number | null; newestDate: number | null } {
    const result = this.db.get<{
      count: number;
      totalSize: number;
      oldestDate: number | null;
      newestDate: number | null;
    }>(
      `SELECT 
        COUNT(*) as count, 
        COALESCE(SUM(size), 0) as totalSize,
        MIN(created_at) as oldestDate,
        MAX(created_at) as newestDate
      FROM note_versions WHERE note_id = ?`,
      [noteId]
    );

    return result || { count: 0, totalSize: 0, oldestDate: null, newestDate: null };
  }

  // 比较两个版本
  compareVersions(versionId1: number, versionId2: number): { added: string[]; removed: string[]; changed: boolean } {
    const v1 = this.getVersion(versionId1);
    const v2 = this.getVersion(versionId2);

    if (!v1 || !v2) {
      return { added: [], removed: [], changed: false };
    }

    const lines1 = v1.content.split('\n');
    const lines2 = v2.content.split('\n');

    const set1 = new Set(lines1);
    const set2 = new Set(lines2);

    const added = lines2.filter(line => !set1.has(line));
    const removed = lines1.filter(line => !set2.has(line));

    return {
      added,
      removed,
      changed: added.length > 0 || removed.length > 0,
    };
  }

  // 全局清理（清理所有笔记的旧版本）
  globalCleanup(): number {
    const noteIds = this.db.query<{ note_id: string }>(
      'SELECT DISTINCT note_id FROM note_versions'
    );

    let totalDeleted = 0;
    for (const { note_id } of noteIds) {
      const versions = this.getVersions(note_id);
      if (versions.length > this.maxVersions) {
        const toDelete = versions.slice(this.maxVersions);
        for (const version of toDelete) {
          this.deleteVersion(version.id);
          totalDeleted++;
        }
      }
    }

    return totalDeleted;
  }
}

export default VersionHistory;
