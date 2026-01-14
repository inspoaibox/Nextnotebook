/**
 * Web Clipper 服务
 * 提供本地 HTTP 服务，接收浏览器扩展发送的网页剪藏请求
 */

import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { BrowserWindow, ipcMain, app } from 'electron';
import { ItemsManager } from '../../core/database/ItemsManager';

const CLIPPER_PORT = 27183;
const CLIPPER_HOST = '127.0.0.1';

export interface ClipImage {
  src: string;
  alt: string;
}

export interface ClipRequest {
  title: string;
  content: string;
  url: string;
  folderId?: string | null;
  tags?: string[];
  format?: 'html' | 'markdown';
  images?: ClipImage[];
  downloadImages?: boolean;
}

export interface ClipResponse {
  success: boolean;
  noteId?: string;
  error?: string;
}

export class ClipperService {
  private server: http.Server | null = null;
  private itemsManager: ItemsManager | null = null;
  private mainWindow: BrowserWindow | null = null;
  private pendingClip: ClipRequest | null = null;

  constructor() {
    this.setupIpcHandlers();
  }

  /**
   * 设置 ItemsManager 引用
   */
  setItemsManager(manager: ItemsManager) {
    this.itemsManager = manager;
  }

  /**
   * 设置主窗口引用
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  /**
   * 启动 HTTP 服务
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        resolve();
        return;
      }

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`Clipper port ${CLIPPER_PORT} is in use, trying next port...`);
          // 端口被占用时尝试下一个端口
          this.server?.listen(CLIPPER_PORT + 1, CLIPPER_HOST);
        } else {
          reject(err);
        }
      });

      this.server.listen(CLIPPER_PORT, CLIPPER_HOST, () => {
        console.log(`Web Clipper service started on http://${CLIPPER_HOST}:${CLIPPER_PORT}`);
        resolve();
      });
    });
  }

  /**
   * 停止 HTTP 服务
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          console.log('Web Clipper service stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 处理 HTTP 请求
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // 设置 CORS 头，允许浏览器扩展访问
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理预检请求
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || '';

    // 健康检查端点
    if (req.method === 'GET' && url === '/api/status') {
      this.handleStatus(res);
      return;
    }

    // 获取文件夹列表
    if (req.method === 'GET' && url === '/api/folders') {
      this.handleGetFolders(res);
      return;
    }

    // 剪藏端点
    if (req.method === 'POST' && url === '/api/clip') {
      this.handleClip(req, res);
      return;
    }

    // 获取书签文件夹列表
    if (req.method === 'GET' && url === '/api/bookmark-folders') {
      this.handleGetBookmarkFolders(res);
      return;
    }

    // 保存书签端点
    if (req.method === 'POST' && url === '/api/bookmark') {
      this.handleSaveBookmark(req, res);
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * 处理状态检查
   */
  private handleStatus(res: http.ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      app: '暮城笔记',
      version: '1.0.0',
    }));
  }

  /**
   * 获取文件夹列表
   */
  private async handleGetFolders(res: http.ServerResponse) {
    try {
      if (!this.itemsManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service not ready' }));
        return;
      }

      const folders = this.itemsManager.getByType('folder');
      const folderList = folders
        .filter(f => !f.deleted_time)
        .map(f => {
          const payload = JSON.parse(f.payload);
          console.log(`[Clipper] Folder: ${payload.name}, parent_id: ${payload.parent_id}`);
          return {
            id: f.id,
            name: payload.name || '未命名文件夹',
            // 笔记文件夹使用 parent_id（下划线格式）
            parentId: payload.parent_id || null,
          };
        });

      console.log(`[Clipper] Returning ${folderList.length} folders`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ folders: folderList }));
    } catch (err: any) {
      console.error('[Clipper] Error getting folders:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  /**
   * 获取书签文件夹列表
   */
  private async handleGetBookmarkFolders(res: http.ServerResponse) {
    try {
      if (!this.itemsManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service not ready' }));
        return;
      }

      const folders = this.itemsManager.getByType('bookmark_folder');
      const folderList = folders
        .filter(f => !f.deleted_time)
        .map(f => {
          const payload = JSON.parse(f.payload);
          return {
            id: f.id,
            name: payload.name || '未命名文件夹',
            parentId: payload.parent_id || null,
          };
        });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ folders: folderList }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  /**
   * 处理保存书签请求
   */
  private handleSaveBookmark(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);

        // 验证必要字段
        if (!data.name || !data.url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '缺少必要字段' }));
          return;
        }

        if (!this.itemsManager) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Service not ready' }));
          return;
        }

        // 创建书签
        const payload = {
          name: data.name,
          url: data.url,
          description: data.description || '',
          folder_id: data.folderId || null,
          icon: data.icon || null,
          tags: data.tags || [],
        };

        const bookmark = this.itemsManager.create('bookmark', payload);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, bookmarkId: bookmark.id }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '无效的请求数据' }));
      }
    });
  }

  /**
   * 处理剪藏请求
   */
  private handleClip(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const clipData: ClipRequest = JSON.parse(body);

        // 验证必要字段
        if (!clipData.title || !clipData.content) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '缺少必要字段' }));
          return;
        }

        if (!this.itemsManager) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Service not ready' }));
          return;
        }

        // 直接创建笔记
        const payload = {
          title: clipData.title,
          content: clipData.content,
          folder_id: clipData.folderId || null,
          is_pinned: false,
          is_locked: false,
          lock_password_hash: null,
          tags: clipData.tags || [],
        };

        const note = this.itemsManager.create('note', payload);

        // 如果需要下载图片
        if (clipData.downloadImages && clipData.images && clipData.images.length > 0) {
          const processedContent = await this.processImages(clipData.content, clipData.images, note.id);
          this.itemsManager.update(note.id, { content: processedContent });
        }

        // 聚焦窗口并通知保存成功
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          if (this.mainWindow.isMinimized()) {
            this.mainWindow.restore();
          }
          this.mainWindow.focus();
          // 通知渲染进程刷新笔记列表
          this.mainWindow.webContents.send('note-created', { noteId: note.id });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, noteId: note.id, message: '笔记已保存' }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '无效的请求数据' }));
      }
    });
  }

  /**
   * 下载图片并保存到本地资源目录
   */
  private async downloadImage(imageUrl: string, noteId: string): Promise<{ localUrl: string; resourceId: string } | null> {
    return new Promise((resolve) => {
      try {
        const protocol = imageUrl.startsWith('https') ? https : http;
        
        const request = protocol.get(imageUrl, { timeout: 10000 }, (response) => {
          // 处理重定向
          if (response.statusCode === 301 || response.statusCode === 302) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              this.downloadImage(redirectUrl, noteId).then(resolve);
              return;
            }
          }
          
          if (response.statusCode !== 200) {
            console.log(`Failed to download image: ${imageUrl}, status: ${response.statusCode}`);
            resolve(null);
            return;
          }

          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            try {
              const buffer = Buffer.concat(chunks);
              
              // 检查文件大小（限制 10MB）
              if (buffer.length > 10 * 1024 * 1024) {
                console.log(`Image too large: ${imageUrl}`);
                resolve(null);
                return;
              }

              // 获取文件扩展名
              const contentType = response.headers['content-type'] || '';
              let ext = '.jpg';
              if (contentType.includes('png')) ext = '.png';
              else if (contentType.includes('gif')) ext = '.gif';
              else if (contentType.includes('webp')) ext = '.webp';
              else if (contentType.includes('svg')) ext = '.svg';
              
              // 从 URL 获取扩展名作为备选
              const urlExt = path.extname(new URL(imageUrl).pathname).toLowerCase();
              if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(urlExt)) {
                ext = urlExt === '.jpeg' ? '.jpg' : urlExt;
              }

              // 生成资源 ID
              const resourceId = crypto.randomUUID();
              const filename = `${resourceId}${ext}`;
              
              // 保存到资源目录
              const resourcesDir = path.join(app.getPath('userData'), 'resources');
              if (!fs.existsSync(resourcesDir)) {
                fs.mkdirSync(resourcesDir, { recursive: true });
              }
              
              const resourcePath = path.join(resourcesDir, filename);
              fs.writeFileSync(resourcePath, buffer);

              // 创建资源记录
              if (this.itemsManager) {
                const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
                const payload = {
                  _id: resourceId,
                  filename: path.basename(imageUrl) || filename,
                  mime_type: contentType || `image/${ext.slice(1)}`,
                  size: buffer.length,
                  note_id: noteId,
                  file_hash: fileHash,
                };
                this.itemsManager.create('resource', payload);
              }

              const localUrl = `resource://${resourceId}${ext}`;
              console.log(`Downloaded image: ${imageUrl} -> ${localUrl}`);
              resolve({ localUrl, resourceId });
            } catch (err) {
              console.error('Failed to save image:', err);
              resolve(null);
            }
          });
          response.on('error', () => resolve(null));
        });

        request.on('error', () => resolve(null));
        request.on('timeout', () => {
          request.destroy();
          resolve(null);
        });
      } catch (err) {
        console.error('Download image error:', err);
        resolve(null);
      }
    });
  }

  /**
   * 处理内容中的图片，下载并替换为本地资源
   */
  private async processImages(content: string, images: ClipImage[], noteId: string): Promise<string> {
    let processedContent = content;
    
    for (const image of images) {
      try {
        const result = await this.downloadImage(image.src, noteId);
        if (result) {
          // 替换 Markdown 中的图片 URL
          // 匹配 ![alt](url) 格式
          const escapedSrc = image.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedSrc}\\)`, 'g');
          processedContent = processedContent.replace(regex, `![$1](${result.localUrl})`);
        }
      } catch (err) {
        console.error(`Failed to process image: ${image.src}`, err);
      }
    }
    
    return processedContent;
  }

  /**
   * 设置 IPC 处理器
   */
  private setupIpcHandlers() {
    // 确认剪藏（支持下载图片）
    ipcMain.handle('clipper:confirm', async (_, data: { 
      title: string; 
      content: string; 
      folderId?: string; 
      tags?: string[];
      downloadImages?: boolean;
      images?: ClipImage[];
    }) => {
      try {
        if (!this.itemsManager) {
          return { success: false, error: 'Service not ready' };
        }

        // 先创建笔记获取 ID
        const payload = {
          title: data.title,
          content: data.content,
          folder_id: data.folderId || null,
          is_pinned: false,
          is_locked: false,
          lock_password_hash: null,
          tags: data.tags || [],
        };

        const note = this.itemsManager.create('note', payload);
        
        // 如果需要下载图片
        if (data.downloadImages && data.images && data.images.length > 0) {
          const processedContent = await this.processImages(data.content, data.images, note.id);
          // 更新笔记内容
          this.itemsManager.update(note.id, { content: processedContent });
        }

        this.pendingClip = null;

        return { success: true, noteId: note.id };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    // 取消剪藏
    ipcMain.handle('clipper:cancel', async () => {
      this.pendingClip = null;
      return { success: true };
    });

    // 获取待处理的剪藏
    ipcMain.handle('clipper:getPending', async () => {
      return this.pendingClip;
    });
  }

  /**
   * 获取服务端口
   */
  getPort(): number {
    return CLIPPER_PORT;
  }
}

// 单例
export const clipperService = new ClipperService();
