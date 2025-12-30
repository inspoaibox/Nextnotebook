import { DatabaseManager } from '../database/Database';
import { ItemBase, NotePayload } from '@shared/types';

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  snippet: string;
  matchCount: number;
  score: number;
  updatedTime: number;
}

export interface SearchOptions {
  types?: string[];
  folderId?: string | null;
  tags?: string[];
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
}

export class SearchEngine {
  private db: DatabaseManager;
  private ftsInitialized: boolean = false;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  // 初始化 FTS5 索引
  initializeFTS(): void {
    if (this.ftsInitialized) return;

    // 创建 FTS5 虚拟表
    this.db.getDatabase().exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        id UNINDEXED,
        title,
        content,
        tags,
        tokenize='unicode61'
      )
    `);

    // 创建触发器以保持索引同步
    this.db.getDatabase().exec(`
      CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON items
      WHEN NEW.type = 'note' AND NEW.deleted_time IS NULL
      BEGIN
        INSERT INTO notes_fts(id, title, content, tags)
        VALUES (
          NEW.id,
          json_extract(NEW.payload, '$.title'),
          json_extract(NEW.payload, '$.content'),
          json_extract(NEW.payload, '$.tags')
        );
      END
    `);

    this.db.getDatabase().exec(`
      CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON items
      WHEN NEW.type = 'note'
      BEGIN
        DELETE FROM notes_fts WHERE id = OLD.id;
        INSERT OR IGNORE INTO notes_fts(id, title, content, tags)
        SELECT NEW.id,
          json_extract(NEW.payload, '$.title'),
          json_extract(NEW.payload, '$.content'),
          json_extract(NEW.payload, '$.tags')
        WHERE NEW.deleted_time IS NULL;
      END
    `);

    this.db.getDatabase().exec(`
      CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON items
      WHEN OLD.type = 'note'
      BEGIN
        DELETE FROM notes_fts WHERE id = OLD.id;
      END
    `);

    // 重建索引（首次初始化时）
    this.rebuildIndex();
    this.ftsInitialized = true;
  }

  // 重建全文索引
  rebuildIndex(): void {
    this.db.transaction(() => {
      // 清空现有索引
      this.db.run('DELETE FROM notes_fts');

      // 重新索引所有笔记
      const notes = this.db.query<ItemBase>(
        "SELECT * FROM items WHERE type = 'note' AND deleted_time IS NULL"
      );

      for (const note of notes) {
        const payload = JSON.parse(note.payload) as NotePayload;
        this.db.run(
          'INSERT INTO notes_fts(id, title, content, tags) VALUES (?, ?, ?, ?)',
          [note.id, payload.title, payload.content, JSON.stringify(payload.tags)]
        );
      }
    });
  }

  // 全文搜索
  search(query: string, options: SearchOptions = {}): SearchResult[] {
    if (!query.trim()) return [];

    const { folderId, dateFrom, dateTo, limit = 50, offset = 0 } = options;

    // 构建 FTS5 查询
    const ftsQuery = this.buildFTSQuery(query);

    // 执行搜索
    const results = this.db.query<{
      id: string;
      title: string;
      content: string;
      tags: string;
      rank: number;
      updated_time: number;
      payload: string;
    }>(
      `SELECT 
        notes_fts.id,
        notes_fts.title,
        snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) as content,
        notes_fts.tags,
        rank,
        items.updated_time,
        items.payload
      FROM notes_fts
      JOIN items ON notes_fts.id = items.id
      WHERE notes_fts MATCH ?
      ${folderId !== undefined ? 'AND json_extract(items.payload, "$.folder_id") = ?' : ''}
      ${dateFrom ? 'AND items.updated_time >= ?' : ''}
      ${dateTo ? 'AND items.updated_time <= ?' : ''}
      ORDER BY rank
      LIMIT ? OFFSET ?`,
      [
        ftsQuery,
        ...(folderId !== undefined ? [folderId] : []),
        ...(dateFrom ? [dateFrom] : []),
        ...(dateTo ? [dateTo] : []),
        limit,
        offset,
      ]
    );

    return results.map(r => ({
      id: r.id,
      type: 'note',
      title: r.title || '无标题',
      snippet: r.content,
      matchCount: this.countMatches(r.content, query),
      score: Math.abs(r.rank),
      updatedTime: r.updated_time,
    }));
  }

  // 简单搜索（不使用 FTS，用于回退）
  simpleSearch(query: string, options: SearchOptions = {}): SearchResult[] {
    const { limit = 50, offset = 0 } = options;
    const likeQuery = `%${query}%`;

    const results = this.db.query<ItemBase>(
      `SELECT * FROM items 
       WHERE type = 'note' 
       AND deleted_time IS NULL
       AND (payload LIKE ? OR payload LIKE ?)
       ORDER BY updated_time DESC
       LIMIT ? OFFSET ?`,
      [likeQuery, likeQuery, limit, offset]
    );

    return results.map(item => {
      const payload = JSON.parse(item.payload) as NotePayload;
      return {
        id: item.id,
        type: 'note',
        title: payload.title || '无标题',
        snippet: this.generateSnippet(payload.content, query),
        matchCount: this.countMatches(payload.content, query),
        score: 1,
        updatedTime: item.updated_time,
      };
    });
  }

  // 按标签搜索
  searchByTags(tags: string[]): ItemBase[] {
    if (tags.length === 0) return [];

    const conditions = tags.map(() => 'json_extract(payload, "$.tags") LIKE ?').join(' AND ');
    const params = tags.map(tag => `%"${tag}"%`);

    return this.db.query<ItemBase>(
      `SELECT * FROM items 
       WHERE type = 'note' 
       AND deleted_time IS NULL
       AND ${conditions}
       ORDER BY updated_time DESC`,
      params
    );
  }

  // 按日期范围搜索
  searchByDateRange(from: number, to: number): ItemBase[] {
    return this.db.query<ItemBase>(
      `SELECT * FROM items 
       WHERE type = 'note' 
       AND deleted_time IS NULL
       AND updated_time >= ? AND updated_time <= ?
       ORDER BY updated_time DESC`,
      [from, to]
    );
  }

  // 获取搜索建议
  getSuggestions(prefix: string, limit: number = 10): string[] {
    if (!prefix.trim()) return [];

    const results = this.db.query<{ title: string }>(
      `SELECT DISTINCT json_extract(payload, '$.title') as title
       FROM items 
       WHERE type = 'note' 
       AND deleted_time IS NULL
       AND json_extract(payload, '$.title') LIKE ?
       LIMIT ?`,
      [`${prefix}%`, limit]
    );

    return results.map(r => r.title).filter(Boolean);
  }

  // 获取热门标签
  getPopularTags(limit: number = 20): Array<{ tag: string; count: number }> {
    const notes = this.db.query<ItemBase>(
      "SELECT payload FROM items WHERE type = 'note' AND deleted_time IS NULL"
    );

    const tagCounts: Record<string, number> = {};
    for (const note of notes) {
      const payload = JSON.parse(note.payload) as NotePayload;
      for (const tag of payload.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // 构建 FTS5 查询字符串
  private buildFTSQuery(query: string): string {
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 1) {
      return `"${terms[0]}"*`;
    }
    return terms.map(t => `"${t}"*`).join(' AND ');
  }

  // 生成搜索结果片段
  private generateSnippet(content: string, query: string, maxLength: number = 150): string {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);

    if (index === -1) {
      return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
    }

    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + query.length + 100);
    let snippet = content.substring(start, end);

    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
  }

  // 计算匹配次数
  private countMatches(text: string, query: string): number {
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'gi');
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }
}

export default SearchEngine;
