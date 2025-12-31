import * as fs from 'fs';
import * as path from 'path';
import { ItemBase, NotePayload } from '@shared/types';
import { ItemsManager } from '../database/ItemsManager';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// Windows 系统字体路径（支持中文的字体）
const CHINESE_FONT_PATHS = [
  'C:/Windows/Fonts/msyh.ttc',      // 微软雅黑
  'C:/Windows/Fonts/simhei.ttf',    // 黑体
  'C:/Windows/Fonts/simsun.ttc',    // 宋体
  'C:/Windows/Fonts/simkai.ttf',    // 楷体
  '/System/Library/Fonts/PingFang.ttc',           // macOS 苹方
  '/System/Library/Fonts/STHeiti Light.ttc',      // macOS 华文黑体
  '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf', // Linux
];

/**
 * 查找可用的中文字体
 */
function findChineseFont(): string | null {
  for (const fontPath of CHINESE_FONT_PATHS) {
    if (fs.existsSync(fontPath)) {
      return fontPath;
    }
  }
  return null;
}

/**
 * 检测文本是否包含非 ASCII 字符（如中文）
 */
function containsNonAscii(text: string): boolean {
  return /[^\x00-\x7F]/.test(text);
}

export interface ExportOptions {
  format: 'markdown' | 'pdf' | 'html';
  includeAttachments: boolean;
  outputDir: string;
}

export interface PdfExportOptions {
  pageSize: 'a4' | 'letter';
  margins: { top: number; right: number; bottom: number; left: number };
  fontSize: number;
  includeTitle: boolean;
  includeMetadata: boolean;
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

  // 导出为 PDF（使用 pdf-lib）
  async exportToPdf(
    noteId: string,
    outputDir: string,
    options: Partial<PdfExportOptions> = {}
  ): Promise<ExportResult> {
    const note = this.itemsManager.getById(noteId);
    if (!note) {
      return { success: false, filePath: '', attachmentPaths: [], error: 'Note not found' };
    }

    const payload = JSON.parse(note.payload) as NotePayload;
    const safeTitle = this.sanitizeFilename(payload.title || 'Untitled');
    const outputPath = path.join(outputDir, `${safeTitle}.pdf`);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const defaultOptions: PdfExportOptions = {
      pageSize: 'a4',
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
      fontSize: 12,
      includeTitle: true,
      includeMetadata: true,
    };

    const opts = { ...defaultOptions, ...options };

    try {
      const pdfDoc = await PDFDocument.create();
      
      // 检测内容是否包含中文，选择合适的字体
      const contentText = payload.title + payload.content;
      let font: PDFFont;
      let boldFont: PDFFont;
      
      if (containsNonAscii(contentText)) {
        // 包含中文，使用系统中文字体
        const chineseFontPath = findChineseFont();
        if (!chineseFontPath) {
          return {
            success: false,
            filePath: '',
            attachmentPaths: [],
            error: '未找到支持中文的系统字体，请确保系统已安装中文字体（如微软雅黑、黑体等）'
          };
        }
        
        pdfDoc.registerFontkit(fontkit);
        const fontBytes = fs.readFileSync(chineseFontPath);
        font = await pdfDoc.embedFont(fontBytes);
        boldFont = font; // 中文字体通常没有单独的粗体文件，使用同一字体
      } else {
        // 纯 ASCII，使用标准字体
        font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      }

      // 页面尺寸
      const pageSizes = {
        a4: { width: 595.28, height: 841.89 },
        letter: { width: 612, height: 792 },
      };
      const pageSize = pageSizes[opts.pageSize];

      // 可用区域
      const contentWidth = pageSize.width - opts.margins.left - opts.margins.right;
      const contentHeight = pageSize.height - opts.margins.top - opts.margins.bottom;

      // 准备内容
      const lines: { text: string; bold: boolean; size: number }[] = [];

      // 添加标题
      if (opts.includeTitle && payload.title) {
        lines.push({ text: payload.title, bold: true, size: opts.fontSize * 1.5 });
        lines.push({ text: '', bold: false, size: opts.fontSize }); // 空行
      }

      // 添加元数据
      if (opts.includeMetadata) {
        const createdDate = new Date(note.created_time).toLocaleDateString('zh-CN');
        lines.push({ text: `创建时间: ${createdDate}`, bold: false, size: opts.fontSize * 0.8 });
        if (payload.tags.length > 0) {
          lines.push({ text: `标签: ${payload.tags.join(', ')}`, bold: false, size: opts.fontSize * 0.8 });
        }
        lines.push({ text: '', bold: false, size: opts.fontSize }); // 空行
      }

      // 处理内容（简单的文本处理）
      const contentLines = this.processContentForPdf(payload.content, opts.fontSize);
      lines.push(...contentLines);

      // 渲染到 PDF
      let currentPage = pdfDoc.addPage([pageSize.width, pageSize.height]);
      let y = pageSize.height - opts.margins.top;

      for (const line of lines) {
        const lineFont = line.bold ? boldFont : font;
        const lineHeight = line.size * 1.4;

        // 检查是否需要新页
        if (y - lineHeight < opts.margins.bottom) {
          currentPage = pdfDoc.addPage([pageSize.width, pageSize.height]);
          y = pageSize.height - opts.margins.top;
        }

        // 自动换行
        const words = line.text.split('');
        let currentLine = '';
        
        for (const char of words) {
          const testLine = currentLine + char;
          const testWidth = lineFont.widthOfTextAtSize(testLine, line.size);
          
          if (testWidth > contentWidth && currentLine.length > 0) {
            // 绘制当前行
            currentPage.drawText(currentLine, {
              x: opts.margins.left,
              y: y - line.size,
              size: line.size,
              font: lineFont,
              color: rgb(0, 0, 0),
            });
            y -= lineHeight;
            currentLine = char;

            // 检查是否需要新页
            if (y - lineHeight < opts.margins.bottom) {
              currentPage = pdfDoc.addPage([pageSize.width, pageSize.height]);
              y = pageSize.height - opts.margins.top;
            }
          } else {
            currentLine = testLine;
          }
        }

        // 绘制剩余文本
        if (currentLine.length > 0) {
          currentPage.drawText(currentLine, {
            x: opts.margins.left,
            y: y - line.size,
            size: line.size,
            font: lineFont,
            color: rgb(0, 0, 0),
          });
        }

        y -= lineHeight;
      }

      // 设置元数据
      pdfDoc.setTitle(payload.title);
      pdfDoc.setCreator('暮城笔记');
      pdfDoc.setProducer('暮城笔记 PDF Export');

      // 保存 PDF
      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(outputPath, pdfBytes);

      return { success: true, filePath: outputPath, attachmentPaths: [] };
    } catch (error) {
      console.error('Failed to export PDF:', error);
      return { 
        success: false, 
        filePath: '', 
        attachmentPaths: [], 
        error: `PDF export failed: ${error}` 
      };
    }
  }

  // 处理内容为 PDF 行
  private processContentForPdf(
    content: string,
    fontSize: number
  ): { text: string; bold: boolean; size: number }[] {
    const lines: { text: string; bold: boolean; size: number }[] = [];
    
    // 移除 Markdown 格式，保留纯文本
    const plainText = content
      // 移除代码块
      .replace(/```[\s\S]*?```/g, '[代码块]')
      // 移除行内代码
      .replace(/`([^`]+)`/g, '$1')
      // 移除图片
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '[图片: $1]')
      // 移除链接，保留文本
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // 移除粗体
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      // 移除斜体
      .replace(/\*([^*]+)\*/g, '$1')
      // 处理标题
      .replace(/^### (.*)$/gm, '$1')
      .replace(/^## (.*)$/gm, '$1')
      .replace(/^# (.*)$/gm, '$1')
      // 处理列表
      .replace(/^[\-\*] /gm, '• ')
      .replace(/^\d+\. /gm, '• ');

    // 按行分割
    const textLines = plainText.split('\n');
    
    for (const line of textLines) {
      lines.push({ text: line, bold: false, size: fontSize });
    }

    return lines;
  }
}


export default ExportManager;
