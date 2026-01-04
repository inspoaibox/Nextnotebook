import { createClient, WebDAVClient } from 'webdav';
import {
  StorageAdapter,
  RemoteChange,
  RemoteMeta,
  SyncCursor,
  WebDAVConfig,
  DEFAULT_LOCK_TIMEOUT,
  CHANGE_LOG_RETENTION,
} from './StorageAdapter';
import { ItemBase } from '@shared/types';

// WebDAV 目录结构
const PATHS = {
  META: 'workspace.json',
  ITEMS: 'items',
  RESOURCES: 'resources',
  CHANGES: 'changes',
  LOCKS: 'locks',
  CURSOR: 'sync-cursor.json',
};

// 默认超时时间（毫秒）
const DEFAULT_TIMEOUT = 30000; // 30秒

export class WebDAVAdapter implements StorageAdapter {
  private client: WebDAVClient;
  private basePath: string;
  private timeout: number;

  constructor(config: WebDAVConfig) {
    this.client = createClient(config.url, {
      username: config.username,
      password: config.password,
      maxBodyLength: 100 * 1024 * 1024, // 100MB
      maxContentLength: 100 * 1024 * 1024,
    });
    this.basePath = config.basePath || '/mucheng-notes';
    this.timeout = DEFAULT_TIMEOUT;
  }

  // 带超时的 Promise 包装器
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = this.timeout): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  private getPath(relativePath: string): string {
    return `${this.basePath}/${relativePath}`;
  }

  async testConnection(): Promise<boolean> {
    try {
      // 尝试检查/创建基础目录（带超时）
      const exists = await this.withTimeout(this.client.exists(this.basePath));
      if (!exists) {
        // 逐级创建目录
        await this.ensureDirectory(this.basePath);
      }
      
      // 检查/创建子目录
      const subDirs = [PATHS.ITEMS, PATHS.RESOURCES, PATHS.CHANGES, PATHS.LOCKS];
      for (const dir of subDirs) {
        const dirPath = this.getPath(dir);
        const dirExists = await this.withTimeout(this.client.exists(dirPath));
        if (!dirExists) {
          await this.withTimeout(this.client.createDirectory(dirPath));
        }
      }
      
      return true;
    } catch (error) {
      console.error('WebDAV connection test failed:', error);
      return false;
    }
  }

  // 逐级创建目录
  private async ensureDirectory(path: string): Promise<void> {
    const parts = path.split('/').filter(p => p);
    let currentPath = '';
    
    for (const part of parts) {
      currentPath += '/' + part;
      try {
        const exists = await this.withTimeout(this.client.exists(currentPath));
        if (!exists) {
          await this.withTimeout(this.client.createDirectory(currentPath));
        }
      } catch (e) {
        // 目录可能已存在，忽略错误
        console.warn(`Directory creation warning for ${currentPath}:`, e);
      }
    }
  }

  async getRemoteMeta(): Promise<RemoteMeta> {
    try {
      const metaPath = this.getPath(PATHS.META);
      const exists = await this.withTimeout(this.client.exists(metaPath));
      if (exists) {
        const content = await this.withTimeout(
          this.client.getFileContents(metaPath, { format: 'text' })
        );
        return JSON.parse(content as string);
      }
    } catch (error) {
      console.error('Failed to get remote meta:', error);
    }

    // 返回默认元数据
    return {
      version: '1.0',
      capabilities: ['items', 'resources', 'changes'],
      last_sync_time: null,
    };
  }

  async putRemoteMeta(meta: RemoteMeta): Promise<boolean> {
    try {
      const metaPath = this.getPath(PATHS.META);
      await this.withTimeout(
        this.client.putFileContents(metaPath, JSON.stringify(meta, null, 2))
      );
      return true;
    } catch (error) {
      console.error('Failed to put remote meta:', error);
      return false;
    }
  }

  async listChanges(cursor: string | null, limit: number = 100): Promise<{
    changes: RemoteChange[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    try {
      const changesDir = this.getPath(PATHS.CHANGES);
      
      // 检查目录是否存在（带超时）
      let dirExists = false;
      try {
        dirExists = await this.withTimeout(this.client.exists(changesDir));
      } catch (e) {
        console.warn('Failed to check changes directory existence:', e);
        return { changes: [], nextCursor: null, hasMore: false };
      }
      
      if (!dirExists) {
        // 目录不存在，尝试创建
        try {
          await this.withTimeout(this.client.createDirectory(changesDir));
        } catch (e) {
          console.warn('Failed to create changes directory:', e);
        }
        return { changes: [], nextCursor: null, hasMore: false };
      }
      
      let files: Array<{ basename: string }> = [];
      try {
        files = await this.withTimeout(
          this.client.getDirectoryContents(changesDir)
        ) as Array<{ basename: string }>;
      } catch (e) {
        console.warn('Failed to list changes directory:', e);
        return { changes: [], nextCursor: null, hasMore: false };
      }

      // 过滤并排序 JSON 文件
      const sortedFiles = files
        .filter(f => f.basename && f.basename.endsWith('.json'))
        .sort((a, b) => a.basename.localeCompare(b.basename));

      // 如果没有变更文件，直接返回
      if (sortedFiles.length === 0) {
        return { changes: [], nextCursor: null, hasMore: false };
      }

      // 找到游标位置
      let startIndex = 0;
      if (cursor) {
        const cursorIndex = sortedFiles.findIndex(f => f.basename === cursor);
        if (cursorIndex >= 0) {
          startIndex = cursorIndex + 1;
        }
      }

      // 如果游标已经在末尾，没有更多变更
      if (startIndex >= sortedFiles.length) {
        return { changes: [], nextCursor: null, hasMore: false };
      }

      // 读取变更
      const changes: RemoteChange[] = [];
      const endIndex = Math.min(startIndex + limit, sortedFiles.length);

      for (let i = startIndex; i < endIndex; i++) {
        try {
          const content = await this.withTimeout(
            this.client.getFileContents(
              `${changesDir}/${sortedFiles[i].basename}`,
              { format: 'text' }
            )
          );
          const change = JSON.parse(content as string) as RemoteChange;
          changes.push(change);
        } catch (e) {
          console.warn(`Failed to read change file ${sortedFiles[i].basename}:`, e);
          // 跳过损坏的文件，继续处理
        }
      }

      const hasMore = endIndex < sortedFiles.length;
      const nextCursor = changes.length > 0 ? sortedFiles[endIndex - 1].basename : null;

      return { changes, nextCursor, hasMore };
    } catch (error) {
      console.error('Failed to list changes:', error);
      // 出错时返回空结果，避免卡住
      return { changes: [], nextCursor: null, hasMore: false };
    }
  }

  async getItem(id: string): Promise<ItemBase | null> {
    try {
      const itemPath = this.getPath(`${PATHS.ITEMS}/${id}.json`);
      const exists = await this.withTimeout(this.client.exists(itemPath));
      if (!exists) return null;

      const content = await this.withTimeout(
        this.client.getFileContents(itemPath, { format: 'text' })
      );
      return JSON.parse(content as string);
    } catch (error) {
      console.error(`Failed to get item ${id}:`, error);
      return null;
    }
  }

  async putItem(item: ItemBase): Promise<{ success: boolean; remoteRev: string; error?: string }> {
    try {
      const itemPath = this.getPath(`${PATHS.ITEMS}/${item.id}.json`);
      const content = JSON.stringify(item, null, 2);
      
      // 使用更长的超时时间（60秒）
      await this.withTimeout(this.client.putFileContents(itemPath, content), 60000);

      // 记录变更
      await this.recordChange(item);

      // 使用时间戳作为版本号
      const remoteRev = Date.now().toString();
      return { success: true, remoteRev };
    } catch (error) {
      const errorMessage = (error as Error).message || 'Unknown error';
      console.error(`Failed to put item ${item.id}:`, error);
      return { success: false, remoteRev: '', error: errorMessage };
    }
  }

  async deleteItem(id: string): Promise<boolean> {
    try {
      const itemPath = this.getPath(`${PATHS.ITEMS}/${id}.json`);
      const exists = await this.withTimeout(this.client.exists(itemPath));
      if (exists) {
        await this.withTimeout(this.client.deleteFile(itemPath));
      }
      return true;
    } catch (error) {
      console.error(`Failed to delete item ${id}:`, error);
      return false;
    }
  }

  async getResource(id: string): Promise<Buffer | null> {
    try {
      const resourceDir = this.getPath(PATHS.RESOURCES);
      const files = await this.withTimeout(
        this.client.getDirectoryContents(resourceDir)
      ) as Array<{ basename: string }>;
      const file = files.find(f => f.basename.startsWith(id));

      if (!file) return null;

      const content = await this.withTimeout(
        this.client.getFileContents(
          `${resourceDir}/${file.basename}`,
          { format: 'binary' }
        ),
        60000 // 资源文件可能较大，使用60秒超时
      );
      return Buffer.from(content as ArrayBuffer);
    } catch (error) {
      console.error(`Failed to get resource ${id}:`, error);
      return null;
    }
  }

  async putResource(id: string, data: Buffer, mimeType: string): Promise<boolean> {
    try {
      // 根据 MIME 类型确定扩展名
      const extMap: Record<string, string> = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/gif': '.gif',
        'application/pdf': '.pdf',
      };
      const ext = extMap[mimeType] || '';
      const resourcePath = this.getPath(`${PATHS.RESOURCES}/${id}${ext}`);

      await this.withTimeout(
        this.client.putFileContents(resourcePath, data),
        60000 // 资源文件可能较大，使用60秒超时
      );
      return true;
    } catch (error) {
      console.error(`Failed to put resource ${id}:`, error);
      return false;
    }
  }

  async deleteResource(id: string): Promise<boolean> {
    try {
      const resourceDir = this.getPath(PATHS.RESOURCES);
      const files = await this.withTimeout(
        this.client.getDirectoryContents(resourceDir)
      ) as Array<{ basename: string }>;
      const file = files.find(f => f.basename.startsWith(id));

      if (file) {
        await this.withTimeout(
          this.client.deleteFile(`${resourceDir}/${file.basename}`)
        );
      }
      return true;
    } catch (error) {
      console.error(`Failed to delete resource ${id}:`, error);
      return false;
    }
  }

  async getSyncCursor(): Promise<SyncCursor | null> {
    try {
      const cursorPath = this.getPath(PATHS.CURSOR);
      const exists = await this.withTimeout(this.client.exists(cursorPath));
      if (!exists) return null;

      const content = await this.withTimeout(
        this.client.getFileContents(cursorPath, { format: 'text' })
      );
      return JSON.parse(content as string);
    } catch (error) {
      console.error('Failed to get sync cursor:', error);
      return null;
    }
  }

  async setSyncCursor(cursor: SyncCursor): Promise<boolean> {
    try {
      const cursorPath = this.getPath(PATHS.CURSOR);
      await this.withTimeout(
        this.client.putFileContents(cursorPath, JSON.stringify(cursor, null, 2))
      );
      return true;
    } catch (error) {
      console.error('Failed to set sync cursor:', error);
      return false;
    }
  }

  async acquireLock(deviceId: string, timeout: number = DEFAULT_LOCK_TIMEOUT): Promise<boolean> {
    try {
      const lockPath = this.getPath(`${PATHS.LOCKS}/lock.json`);
      
      // 先确保 locks 目录存在
      const locksDir = this.getPath(PATHS.LOCKS);
      const locksDirExists = await this.withTimeout(this.client.exists(locksDir));
      if (!locksDirExists) {
        await this.withTimeout(this.client.createDirectory(locksDir));
      }
      
      const exists = await this.withTimeout(this.client.exists(lockPath));

      if (exists) {
        const content = await this.withTimeout(
          this.client.getFileContents(lockPath, { format: 'text' })
        );
        const lock = JSON.parse(content as string);

        // 检查锁是否过期
        if (lock.expires > Date.now() && lock.owner !== deviceId) {
          return false;
        }
      }

      // 创建新锁
      const lock = {
        owner: deviceId,
        acquired: Date.now(),
        expires: Date.now() + timeout,
      };
      await this.withTimeout(
        this.client.putFileContents(lockPath, JSON.stringify(lock, null, 2))
      );
      return true;
    } catch (error) {
      console.error('Failed to acquire lock:', error);
      return false;
    }
  }

  async releaseLock(deviceId: string): Promise<boolean> {
    try {
      const lockPath = this.getPath(`${PATHS.LOCKS}/lock.json`);
      const exists = await this.withTimeout(this.client.exists(lockPath));

      if (exists) {
        const content = await this.withTimeout(
          this.client.getFileContents(lockPath, { format: 'text' })
        );
        const lock = JSON.parse(content as string);

        if (lock.owner === deviceId) {
          await this.withTimeout(this.client.deleteFile(lockPath));
        }
      }
      return true;
    } catch (error) {
      console.error('Failed to release lock:', error);
      return false;
    }
  }

  async checkLock(): Promise<{ locked: boolean; owner?: string; expires?: number }> {
    try {
      const lockPath = this.getPath(`${PATHS.LOCKS}/lock.json`);
      const exists = await this.withTimeout(this.client.exists(lockPath));

      if (!exists) {
        return { locked: false };
      }

      const content = await this.withTimeout(
        this.client.getFileContents(lockPath, { format: 'text' })
      );
      const lock = JSON.parse(content as string);

      if (lock.expires < Date.now()) {
        return { locked: false };
      }

      return {
        locked: true,
        owner: lock.owner,
        expires: lock.expires,
      };
    } catch (error) {
      console.error('Failed to check lock:', error);
      return { locked: false };
    }
  }

  // 记录变更到变更日志
  private async recordChange(item: ItemBase): Promise<void> {
    const change: RemoteChange = {
      change_id: Date.now(),
      item_id: item.id,
      type: item.type,
      updated_time: item.updated_time,
      deleted_time: item.deleted_time,
      content_hash: item.content_hash,
    };

    const changePath = this.getPath(`${PATHS.CHANGES}/${change.change_id}.json`);
    await this.withTimeout(
      this.client.putFileContents(changePath, JSON.stringify(change, null, 2))
    );
  }

  // 清理过期的变更日志
  async cleanupChangeLogs(beforeTimestamp: number): Promise<number> {
    try {
      const changesDir = this.getPath(PATHS.CHANGES);
      const dirExists = await this.withTimeout(this.client.exists(changesDir));
      if (!dirExists) {
        return 0;
      }

      const files = await this.withTimeout(
        this.client.getDirectoryContents(changesDir)
      ) as Array<{ basename: string }>;

      let deletedCount = 0;
      for (const file of files) {
        if (!file.basename.endsWith('.json')) continue;
        
        // 从文件名提取时间戳（文件名格式：{timestamp}.json）
        const timestamp = parseInt(file.basename.replace('.json', ''), 10);
        if (isNaN(timestamp) || timestamp >= beforeTimestamp) continue;

        try {
          await this.withTimeout(
            this.client.deleteFile(`${changesDir}/${file.basename}`)
          );
          deletedCount++;
        } catch (e) {
          console.warn(`Failed to delete change log ${file.basename}:`, e);
        }
      }

      console.log(`Cleaned up ${deletedCount} expired change logs`);
      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup change logs:', error);
      return 0;
    }
  }

  // 检查远端是否已有数据
  async hasExistingData(): Promise<boolean> {
    try {
      const itemsDir = this.getPath(PATHS.ITEMS);
      const dirExists = await this.withTimeout(this.client.exists(itemsDir));
      if (!dirExists) {
        return false;
      }

      const files = await this.withTimeout(
        this.client.getDirectoryContents(itemsDir)
      ) as Array<{ basename: string }>;

      // 检查是否有任何 JSON 文件
      return files.some(f => f.basename.endsWith('.json'));
    } catch (error) {
      console.error('Failed to check existing data:', error);
      // 回退到检查元数据
      const meta = await this.getRemoteMeta();
      return meta.last_sync_time !== null;
    }
  }
}


export default WebDAVAdapter;
