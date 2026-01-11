import fs from 'fs';
import path from 'path';
import { config } from '../config';

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

  private getResourcePath(id: string): string {
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

  // 获取资源文件（支持向后兼容）
  getResource(id: string): Buffer | null {
    // 首先尝试用户目录
    const userPath = this.getResourcePath(id);
    if (fs.existsSync(userPath)) {
      return fs.readFileSync(userPath);
    }

    // 向后兼容：尝试旧的共享目录结构
    const subDir = id.substring(0, 2);
    const legacyPath = path.join(this.resourceDir, subDir, id);
    if (fs.existsSync(legacyPath)) {
      return fs.readFileSync(legacyPath);
    }

    // 尝试 shared 目录
    const sharedPath = path.join(this.resourceDir, 'shared', subDir, id);
    if (fs.existsSync(sharedPath)) {
      return fs.readFileSync(sharedPath);
    }

    return null;
  }

  // 保存资源文件
  putResource(id: string, data: Buffer): boolean {
    const filePath = this.getResourcePath(id);
    fs.writeFileSync(filePath, data);
    return true;
  }

  // 删除资源文件
  deleteResource(id: string): boolean {
    // 首先尝试用户目录
    const userPath = this.getResourcePath(id);
    if (fs.existsSync(userPath)) {
      fs.unlinkSync(userPath);
      return true;
    }

    // 向后兼容：尝试旧的共享目录结构
    const subDir = id.substring(0, 2);
    const legacyPath = path.join(this.resourceDir, subDir, id);
    if (fs.existsSync(legacyPath)) {
      fs.unlinkSync(legacyPath);
      return true;
    }

    // 尝试 shared 目录
    const sharedPath = path.join(this.resourceDir, 'shared', subDir, id);
    if (fs.existsSync(sharedPath)) {
      fs.unlinkSync(sharedPath);
      return true;
    }

    return false;
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
