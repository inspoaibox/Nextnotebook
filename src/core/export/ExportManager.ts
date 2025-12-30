import * as fs from 'fs';
import * as path from 'path';
import { ItemBase, NotePayload } from '@shared/types';
import { ItemsManager } from '../database/ItemsManager';

export interface ExportOptions {
  format: 'markdown' | 'pdf' | 'html';
  includeAttachments: boolean;
  outputDir: string;
}

export interface ExportResult {
  success: boolean;
  filePath: string;
  attachmentPaths: string[];
  error?: string;
}

export class ExportManager {
  private itemsManager: ItemsManager;
  private resourcesDir: string;

  constructor(itemsManager: ItemsManager, resourcesDir: string) {
    this.itemsManager = itemsManager;
    this.resourcesDir = resourcesDir;
  }

  // 导出单个笔记为 Markdown
  async exportToMarkdown(noteId: string, outputDir: string, includeAttachments: boolean = true): Promise<ExportResult> {
    const note = this.itemsManager.getById(noteId);
    if (!note) {
      return { success: false, filePath: '', attachmentPaths: [], error: 'Note not found' };
    }

    const payload = JSON.parse(note.payload) as NotePayload;
    const safeTitle = this.sanitizeFilename(payload.title || 'Untitled');
    const outputPath = path.join(outputDir, `${safeTitle}.md`);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    let content = payload.content;
    const attachmentPaths: string[] = [];

    if (includeAttachments) {
      const attachmentsDir = path.join(outputDir, `${safeTitle}_attachments`);
      const { processedContent, copiedAttachments } = await this.processAttachments(
        content,
        noteId,
        attachmentsDir
      );
      content = processedContent;
      attachmentPaths.push(...copiedAttachments);
    }

    const frontMatter = this.generateFrontMatter(payload, note);
    const fullContent = `${frontMatter}\n${content}`;

    fs.writeFileSync(outputPath, fullContent, 'utf8');

    return { success: true, filePath: outputPath, attachmentPaths };
  }

  // 批量导出笔记
  async exportMultiple(noteIds: string[], options: ExportOptions): Promise<ExportResult[]> {
    const results: ExportResult[] = [];
    for (const noteId of noteIds) {
      const result = await this.exportToMarkdown(noteId, options.outputDir, options.includeAttachments);
      results.push(result);
    }
    return results;
  }

  // 导出所有笔记
  async exportAll(options: ExportOptions): Promise<ExportResult[]> {
    const notes = this.itemsManager.getByType('note');
    const noteIds = notes.map(n => n.id);
    return this.exportMultiple(noteIds, options);
  }

  // 导出为 HTML
  async exportToHtml(noteId: string, outputDir: string): Promise<ExportResult> {
    const note = this.itemsManager.getById(noteId);
    if (!note) {
      return { success: false, filePath: '', attachmentPaths: [], error: 'Note not found' };
    }

    const payload = JSON.parse(note.payload) as NotePayload;
    const safeTitle = this.sanitizeFilename(payload.title || 'Untitled');
    const outputPath = path.join(outputDir, `${safeTitle}.html`);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(payload.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1 { border-bottom: 1px solid #eee; padding-bottom: 10px; }
    pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
    code { background: #f5f5f5; padding: 2px 4px; border-radius: 2px; }
    img { max-width: 100%; }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(payload.title)}</h1>
  <div class="content">
    ${this.markdownToHtml(payload.content)}
  </div>
</body>
</html>`;

    fs.writeFileSync(outputPath, html, 'utf8');

    return { success: true, filePath: outputPath, attachmentPaths: [] };
  }

  // 生成 YAML front matter
  private generateFrontMatter(payload: NotePayload, item: ItemBase): string {
    const lines = ['---'];
    lines.push(`title: "${payload.title.replace(/"/g, '\\"')}"`);
    lines.push(`created: ${new Date(item.created_time).toISOString()}`);
    lines.push(`updated: ${new Date(item.updated_time).toISOString()}`);

    if (payload.tags.length > 0) {
      lines.push(`tags: [${payload.tags.map(t => `"${t}"`).join(', ')}]`);
    }

    if (payload.is_pinned) {
      lines.push('pinned: true');
    }

    lines.push('---');
    return lines.join('\n');
  }

  // 处理附件
  private async processAttachments(
    content: string,
    noteId: string,
    attachmentsDir: string
  ): Promise<{ processedContent: string; copiedAttachments: string[] }> {
    const copiedAttachments: string[] = [];
    const resourcePattern = /!\[([^\]]*)\]\(resource:\/\/([^)]+)\)/g;
    let processedContent = content;

    const matches = [...content.matchAll(resourcePattern)];
    if (matches.length === 0) {
      return { processedContent, copiedAttachments };
    }

    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    }

    for (const match of matches) {
      const [fullMatch, altText, resourceRef] = match;
      const resourceId = resourceRef.split('.')[0];

      const files = fs.readdirSync(this.resourcesDir);
      const resourceFile = files.find(f => f.startsWith(resourceId));

      if (resourceFile) {
        const sourcePath = path.join(this.resourcesDir, resourceFile);
        const destPath = path.join(attachmentsDir, resourceFile);

        fs.copyFileSync(sourcePath, destPath);
        copiedAttachments.push(destPath);

        const relativePath = `./${path.basename(attachmentsDir)}/${resourceFile}`;
        processedContent = processedContent.replace(fullMatch, `![${altText}](${relativePath})`);
      }
    }

    return { processedContent, copiedAttachments };
  }

  // 简单的 Markdown 转 HTML
  private markdownToHtml(markdown: string): string {
    let html = markdown;

    // 标题
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

    // 粗体和斜体
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 代码块
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 链接和图片
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // 列表
    html = html.replace(/^\- (.*$)/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // 段落
    html = html.replace(/\n\n/g, '</p><p>');
    html = `<p>${html}</p>`;

    return html;
  }

  // 清理文件名
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  // HTML 转义
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export default ExportManager;
