import { ItemsManager } from '../database/ItemsManager';
import { ItemBase, NotePayload } from '@shared/types';

export interface NoteLink {
  raw: string;           // 原始文本 [[标题]]
  title: string;         // 链接的笔记标题
  targetId?: string;     // 目标笔记 ID（如果存在）
  startIndex: number;    // 在内容中的起始位置
  endIndex: number;      // 在内容中的结束位置
}

export interface BackLink {
  sourceId: string;
  sourceTitle: string;
  context: string;       // 链接所在的上下文
}

export class NoteLinkParser {
  private itemsManager: ItemsManager;
  private linkPattern = /\[\[([^\]]+)\]\]/g;

  constructor(itemsManager: ItemsManager) {
    this.itemsManager = itemsManager;
  }

  // 解析笔记中的所有链接
  parseLinks(content: string): NoteLink[] {
    const links: NoteLink[] = [];
    let match;

    while ((match = this.linkPattern.exec(content)) !== null) {
      const title = match[1].trim();
      const targetNote = this.findNoteByTitle(title);

      links.push({
        raw: match[0],
        title,
        targetId: targetNote?.id,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return links;
  }

  // 根据标题查找笔记
  findNoteByTitle(title: string): ItemBase | undefined {
    const notes = this.itemsManager.getByType('note');
    return notes.find(note => {
      const payload = JSON.parse(note.payload) as NotePayload;
      return payload.title.toLowerCase() === title.toLowerCase();
    });
  }

  // 获取笔记的反向链接
  getBackLinks(noteId: string): BackLink[] {
    const targetNote = this.itemsManager.getById(noteId);
    if (!targetNote) return [];

    const targetPayload = JSON.parse(targetNote.payload) as NotePayload;
    const targetTitle = targetPayload.title;

    const backLinks: BackLink[] = [];
    const allNotes = this.itemsManager.getByType('note');

    for (const note of allNotes) {
      if (note.id === noteId) continue;

      const payload = JSON.parse(note.payload) as NotePayload;
      const links = this.parseLinks(payload.content);

      for (const link of links) {
        if (link.title.toLowerCase() === targetTitle.toLowerCase()) {
          backLinks.push({
            sourceId: note.id,
            sourceTitle: payload.title,
            context: this.extractContext(payload.content, link.startIndex),
          });
        }
      }
    }

    return backLinks;
  }

  // 提取链接上下文
  private extractContext(content: string, linkIndex: number, contextLength: number = 100): string {
    const start = Math.max(0, linkIndex - contextLength / 2);
    const end = Math.min(content.length, linkIndex + contextLength / 2);
    let context = content.substring(start, end);

    if (start > 0) context = '...' + context;
    if (end < content.length) context = context + '...';

    return context.replace(/\n/g, ' ').trim();
  }

  // 更新笔记中的链接（当目标笔记标题变化时）
  updateLinks(oldTitle: string, newTitle: string): number {
    let updatedCount = 0;
    const allNotes = this.itemsManager.getByType('note');

    for (const note of allNotes) {
      const payload = JSON.parse(note.payload) as NotePayload;
      const oldPattern = `[[${oldTitle}]]`;
      const newPattern = `[[${newTitle}]]`;

      if (payload.content.includes(oldPattern)) {
        payload.content = payload.content.replace(
          new RegExp(`\\[\\[${this.escapeRegex(oldTitle)}\\]\\]`, 'g'),
          newPattern
        );
        this.itemsManager.update(note.id, payload);
        updatedCount++;
      }
    }

    return updatedCount;
  }

  // 将链接转换为可点击的 HTML
  renderLinksAsHtml(content: string): string {
    return content.replace(this.linkPattern, (match, title) => {
      const targetNote = this.findNoteByTitle(title);
      if (targetNote) {
        return `<a href="note://${targetNote.id}" class="note-link">${title}</a>`;
      }
      return `<span class="note-link-broken">${title}</span>`;
    });
  }

  // 获取所有链接的笔记（图谱数据）
  getLinksGraph(): Array<{ source: string; target: string; sourceTitle: string; targetTitle: string }> {
    const edges: Array<{ source: string; target: string; sourceTitle: string; targetTitle: string }> = [];
    const allNotes = this.itemsManager.getByType('note');

    for (const note of allNotes) {
      const payload = JSON.parse(note.payload) as NotePayload;
      const links = this.parseLinks(payload.content);

      for (const link of links) {
        if (link.targetId) {
          edges.push({
            source: note.id,
            target: link.targetId,
            sourceTitle: payload.title,
            targetTitle: link.title,
          });
        }
      }
    }

    return edges;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export default NoteLinkParser;
