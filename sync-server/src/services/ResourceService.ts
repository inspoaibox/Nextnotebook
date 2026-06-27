import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { getDatabase } from '../database';
import { userService } from './UserService';

const RESOURCE_ID_PATTERN = /^[A-Za-z0-9._-]{1,255}$/;

// 拥有二进制内容的 item 类型。这些类型的元数据存在 items 表，
// 二进制内容以 id 为键存放在文件系统中（resource = 附件，cloud_file = 网盘文件）。
const BINARY_ITEM_TYPES = new Set(['resource', 'cloud_file']);

export class ResourceService {
  private resourceDir: string;
  private userId?: string;

  constructor(userId?: string) {
    this.resourceDir = config.resourcesPath;
    this.userId = userId;
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.resourceDir)) {
      fs.mkdirSync(this.resourceDir, { recursive: true });
    }
  }

  private isValidResourceId(id: string): boolean {
    return RESOURCE_ID_PATTERN.test(id) && !id.includes('..');
  }

  private getResourcePath(id: string): string {
    if (!this.isValidResourceId(id)) {
      throw new Error('Invalid resource id');
    }

    // 使用 ID 前两位作为子目录，避免单目录文件过多
    const subDir = id.substring(0, 2);
    
    // 如果有用户 ID，在用户目录下存储
    let dir: string;
    if (this.userId) {
      dir = path.join(this.resourceDir, 'users', this.userId, subDir);
    } else {
      // 向后兼容：无用户隔离时使用共享目录
      dir = path.join(this.resourceDir, 'shared', subDir);
    }
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, id);
  }

  private getResourceDirsForId(id: string): string[] {
    const subDir = id.substring(0, 2);
    const dirs: string[] = [];
    if (this.userId) {
      dirs.push(path.join(this.resourceDir, 'users', this.userId, subDir));
    }
    dirs.push(path.join(this.resourceDir, subDir));
    dirs.push(path.join(this.resourceDir, 'shared', subDir));
    return Array.from(new Set(dirs));
  }

  private findExistingResourcePath(id: string): string | null {
    for (const dir of this.getResourceDirsForId(id)) {
      const exactPath = path.join(dir, id);
      if (fs.existsSync(exactPath)) {
        return exactPath;
      }

      if (!fs.existsSync(dir)) {
        continue;
      }

      const candidates = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) =>
          entry.isFile() &&
          entry.name.startsWith(`${id}.`) &&
          !entry.name.includes('.assembling.')
        )
        .map((entry) => path.join(dir, entry.name))
        .sort();

      if (candidates.length > 0) {
        return candidates[0];
      }
    }

    return null;
  }

  private getItemIdFromResourceName(id: string): string {
    const ext = path.extname(id);
    return ext ? id.slice(0, -ext.length) : id;
  }

  private canAccessResource(id: string): boolean {
    if (!this.isValidResourceId(id)) {
      return false;
    }

    const itemId = this.getItemIdFromResourceName(id);
    const db = getDatabase();
    // 兼容任意带二进制内容的 item 类型（resource / cloud_file）。
    // 只要该 id 属于某个二进制类型且归当前用户所有，即视为可访问。
    let row: { id: string } | undefined;
    if (this.userId) {
      userService.claimLegacyDataForSingleUser(this.userId);
      row = db
        .prepare('SELECT id FROM items WHERE id = ? AND user_id = ? AND deleted_time IS NULL')
        .get(itemId, this.userId) as { id: string } | undefined;
    } else {
      row = db
        .prepare('SELECT id FROM items WHERE id = ? AND deleted_time IS NULL')
        .get(itemId) as { id: string } | undefined;
    }

    return !!row;
  }

  /**
   * 校验当前用户是否拥有指定 item（按 id），并返回其类型。
   * 用于分块上传：上传前确认 item 元数据已存在且归属当前用户，再落盘二进制。
   */
  canAccessItem(itemId: string): { ok: boolean; type?: string } {
    if (!this.isValidResourceId(itemId) || itemId.includes('..')) {
      return { ok: false };
    }
    const db = getDatabase();
    let row: { id: string; type: string } | undefined;
    if (this.userId) {
      userService.claimLegacyDataForSingleUser(this.userId);
      row = db
        .prepare('SELECT id, type FROM items WHERE id = ? AND user_id = ? AND deleted_time IS NULL')
        .get(itemId, this.userId) as { id: string; type: string } | undefined;
    } else {
      row = db
        .prepare('SELECT id, type FROM items WHERE id = ? AND deleted_time IS NULL')
        .get(itemId) as { id: string; type: string } | undefined;
    }
    return row ? { ok: true, type: row.type } : { ok: false };
  }

  /**
   * 返回某个 item id 对应的二进制存储绝对路径（不校验是否存在）。
   * 与下载端点使用同一套目录规则，保证上传/下载一致。
   */
  resolveStoragePath(itemId: string, extension?: string): string {
    const fileName = extension ? `${itemId}${extension}` : itemId;
    if (!this.isValidResourceId(fileName)) {
      throw new Error('Invalid resource id');
    }
    const subDir = fileName.substring(0, 2);
    let dir: string;
    if (this.userId) {
      dir = path.join(this.resourceDir, 'users', this.userId, subDir);
    } else {
      dir = path.join(this.resourceDir, 'shared', subDir);
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, fileName);
  }

  // 获取资源文件（支持向后兼容）
  getResource(id: string): Buffer | null {
    const filePath = this.resolveResourcePath(id);
    return filePath ? fs.readFileSync(filePath) : null;
  }

  /**
   * 返回某个资源 id 在磁盘上的真实路径（含扩展名）。
   * 仅做访问校验与文件存在性检查，不读取内容 —— 供下载端点流式输出使用，
   * 避免一次性 readFileSync 大文件（>500MB）造成的内存压力。
   * 兼容用户目录 / 旧共享目录 / shared 目录三种存储位置。
   */
  resolveResourcePath(id: string): string | null {
    if (!this.canAccessResource(id)) {
      return null;
    }

    return this.findExistingResourcePath(id);
  }

  // 保存资源文件
  putResource(id: string, data: Buffer): boolean {
    if (!this.canAccessResource(id)) {
      return false;
    }

    const filePath = this.getResourcePath(id);
    fs.writeFileSync(filePath, data);
    return true;
  }

  // 删除资源文件
  deleteResource(id: string): boolean {
    if (!this.canAccessResource(id)) {
      return false;
    }

    const filePath = this.findExistingResourcePath(id);
    if (!filePath) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  // 获取存储统计
  getStorageStats(): { used: number; fileCount: number } {
    let used = 0;
    let fileCount = 0;

    const walkDir = (dir: string): void => {
      if (!fs.existsSync(dir)) return;
      
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile()) {
          const stats = fs.statSync(fullPath);
          used += stats.size;
          fileCount++;
        }
      }
    };

    // 如果有用户 ID，只统计用户目录
    if (this.userId) {
      walkDir(path.join(this.resourceDir, 'users', this.userId));
    } else {
      walkDir(this.resourceDir);
    }

    return { used, fileCount };
  }
}
