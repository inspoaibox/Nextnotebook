import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { ItemsManager } from '../database/ItemsManager';
import { ResourcePayload } from '@shared/types';

export class ResourceManager {
  private resourcesDir: string;
  private itemsManager: ItemsManager;

  constructor(userDataPath: string, itemsManager: ItemsManager) {
    this.resourcesDir = path.join(userDataPath, 'resources');
    this.itemsManager = itemsManager;
    this.ensureResourcesDir();
  }

  private ensureResourcesDir(): void {
    if (!fs.existsSync(this.resourcesDir)) {
      fs.mkdirSync(this.resourcesDir, { recursive: true });
    }
  }

  // 计算文件哈希
  private computeFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // 获取文件扩展名
  private getExtension(filename: string): string {
    const ext = path.extname(filename);
    return ext ? ext.toLowerCase() : '';
  }

  // 保存资源文件
  async saveResource(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    noteId: string
  ): Promise<{ id: string; path: string }> {
    const fileHash = this.computeFileHash(buffer);
    const ext = this.getExtension(filename);
    const resourceId = uuidv4();
    const resourceFilename = `${resourceId}${ext}`;
    const resourcePath = path.join(this.resourcesDir, resourceFilename);

    // 写入文件
    fs.writeFileSync(resourcePath, buffer);

    // 创建资源记录
    const payload: ResourcePayload = {
      filename,
      mime_type: mimeType,
      size: buffer.length,
      note_id: noteId,
      file_hash: fileHash,
    };

    this.itemsManager.create('resource', payload);

    return { id: resourceId, path: resourcePath };
  }

  // 从剪贴板保存图片
  async saveFromClipboard(
    base64Data: string,
    noteId: string
  ): Promise<{ id: string; path: string; markdownRef: string }> {
    // 解析 base64 数据
    const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 data');
    }

    const mimeType = matches[1];
    const data = matches[2];
    const buffer = Buffer.from(data, 'base64');

    // 根据 MIME 类型确定扩展名
    const extMap: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };
    const ext = extMap[mimeType] || '.png';
    const filename = `clipboard-${Date.now()}${ext}`;

    const result = await this.saveResource(buffer, filename, mimeType, noteId);
    const markdownRef = `![${filename}](resource://${result.id}${ext})`;

    return { ...result, markdownRef };
  }

  // 从文件路径保存
  async saveFromFile(
    filePath: string,
    noteId: string
  ): Promise<{ id: string; path: string; markdownRef: string }> {
    const buffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const mimeType = this.getMimeType(filename);

    const result = await this.saveResource(buffer, filename, mimeType, noteId);
    const ext = this.getExtension(filename);
    const markdownRef = `![${filename}](resource://${result.id}${ext})`;

    return { ...result, markdownRef };
  }

  // 获取资源文件路径
  getResourcePath(resourceId: string, ext: string = ''): string {
    return path.join(this.resourcesDir, `${resourceId}${ext}`);
  }

  // 读取资源文件
  readResource(resourceId: string, ext: string = ''): Buffer | null {
    const resourcePath = this.getResourcePath(resourceId, ext);
    if (fs.existsSync(resourcePath)) {
      return fs.readFileSync(resourcePath);
    }
    return null;
  }

  // 删除资源文件
  deleteResource(resourceId: string, ext: string = ''): boolean {
    const resourcePath = this.getResourcePath(resourceId, ext);
    if (fs.existsSync(resourcePath)) {
      fs.unlinkSync(resourcePath);
      return true;
    }
    return false;
  }

  // 获取笔记的所有资源
  getNoteResources(noteId: string): string[] {
    const resources = this.itemsManager.getByType('resource');
    return resources
      .filter(r => {
        const payload = JSON.parse(r.payload) as ResourcePayload;
        return payload.note_id === noteId;
      })
      .map(r => r.id);
  }

  // 验证资源完整性
  verifyResource(resourceId: string, ext: string = ''): boolean {
    const item = this.itemsManager.getById(resourceId);
    if (!item) return false;

    const payload = JSON.parse(item.payload) as ResourcePayload;
    const buffer = this.readResource(resourceId, ext);
    if (!buffer) return false;

    const currentHash = this.computeFileHash(buffer);
    return currentHash === payload.file_hash;
  }

  // 获取 MIME 类型
  private getMimeType(filename: string): string {
    const ext = this.getExtension(filename);
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  // 获取资源统计
  getStats(): { count: number; totalSize: number } {
    const resources = this.itemsManager.getByType('resource');
    let totalSize = 0;

    for (const resource of resources) {
      const payload = JSON.parse(resource.payload) as ResourcePayload;
      totalSize += payload.size;
    }

    return { count: resources.length, totalSize };
  }
}

export default ResourceManager;
