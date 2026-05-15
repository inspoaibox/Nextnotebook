import { DatabaseManager } from '../database/Database';
import { ItemBase, NotePayload } from '@shared/types';
import { decryptLocalPayload, isLocalPayloadEncrypted } from '../database/LocalPayloadCrypto';

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

  initializeFTS(): void {
    if (this.ftsInitialized) return;
    this.dropPlaintextFtsArtifacts();
    this.ftsInitialized = true;
  }

  rebuildIndex(): void {
    this.dropPlaintextFtsArtifacts();
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    return this.simpleSearch(query, options);
  }

  simpleSearch(query: string, options: SearchOptions = {}): SearchResult[] {
    if (!query.trim()) return [];

    const { limit = 50, offset = 0 } = options;
    const normalized = query.toLowerCase();
    const notes = this.filterNotes(this.getNotes(), options)
      .map(item => ({ item, payload: this.parseNotePayload(item) }))
      .filter(({ payload }) => {
        const haystack = [
          payload.title,
          payload.content,
          ...(payload.tags || []),
        ].join('\n').toLowerCase();
        return haystack.includes(normalized);
      });

    return notes.slice(offset, offset + limit).map(({ item, payload }) => ({
      id: item.id,
      type: 'note',
      title: payload.title || '无标题',
      snippet: this.generateSnippet(payload.content || payload.title || '', query),
      matchCount: this.countMatches(`${payload.title}\n${payload.content}`, query),
      score: 1,
      updatedTime: item.updated_time,
    }));
  }

  searchByTags(tags: string[]): ItemBase[] {
    if (tags.length === 0) return [];
    return this.getNotes().filter(item => {
      const payload = this.parseNotePayload(item);
      return tags.every(tag => (payload.tags || []).includes(tag));
    });
  }

  searchByDateRange(from: number, to: number): ItemBase[] {
    return this.getNotes().filter(item => item.updated_time >= from && item.updated_time <= to);
  }

  getSuggestions(prefix: string, limit: number = 10): string[] {
    if (!prefix.trim()) return [];
    const normalized = prefix.toLowerCase();
    const seen = new Set<string>();
    const suggestions: string[] = [];

    for (const note of this.getNotes()) {
      const title = this.parseNotePayload(note).title || '';
      if (!title || !title.toLowerCase().startsWith(normalized) || seen.has(title)) {
        continue;
      }
      seen.add(title);
      suggestions.push(title);
      if (suggestions.length >= limit) break;
    }

    return suggestions;
  }

  getPopularTags(limit: number = 20): Array<{ tag: string; count: number }> {
    const tagCounts: Record<string, number> = {};
    for (const note of this.getNotes()) {
      const payload = this.parseNotePayload(note);
      for (const tag of payload.tags || []) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private getNotes(): ItemBase[] {
    return this.db.query<ItemBase>(
      "SELECT * FROM items WHERE type = 'note' AND deleted_time IS NULL ORDER BY updated_time DESC"
    ).map(item => this.decryptItem(item));
  }

  private filterNotes(notes: ItemBase[], options: SearchOptions): ItemBase[] {
    return notes.filter(note => {
      if (options.dateFrom && note.updated_time < options.dateFrom) return false;
      if (options.dateTo && note.updated_time > options.dateTo) return false;

      const payload = this.parseNotePayload(note);
      if (options.folderId !== undefined && payload.folder_id !== options.folderId) return false;
      if (options.tags?.length && !options.tags.every(tag => (payload.tags || []).includes(tag))) return false;
      return true;
    });
  }

  private decryptItem(item: ItemBase): ItemBase {
    if (!isLocalPayloadEncrypted(item.payload)) {
      return item;
    }
    return { ...item, payload: decryptLocalPayload(item.payload) };
  }

  private parseNotePayload(item: ItemBase): NotePayload {
    return JSON.parse(item.payload) as NotePayload;
  }

  private dropPlaintextFtsArtifacts(): void {
    this.db.getDatabase().exec(`
      DROP TRIGGER IF EXISTS notes_fts_insert;
      DROP TRIGGER IF EXISTS notes_fts_update;
      DROP TRIGGER IF EXISTS notes_fts_delete;
      DROP TABLE IF EXISTS notes_fts;
      DROP TABLE IF EXISTS items_fts;
    `);
  }

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

  private countMatches(text: string, query: string): number {
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'gi');
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }
}

export default SearchEngine;
