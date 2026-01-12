import { createClient, WebDAVClient } from 'webdav';
import {
  StorageAdapter,
  RemoteChange,
  RemoteMeta,
  SyncCursor,
  WebDAVConfig,
  CHANGE_LOG_RETENTION,
} from './StorageAdapter';
import { ItemBase } from '@shared/types';

// WebDAV 目录结构
const PATHS = {
  META: 'workspace.json',
  ITEMS: 'items',
  RESOURCES: 'resources',
  CHANGES: 'changes',
  CURSOR: 'sync-cursor.json',
  KEY_FINGERPRINT: '.encryption-key-fingerprint',
};

// 默认超时时间（毫秒）
const DEFAULT_TIMEOUT = 30000; // 30秒

// 重试配置
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1秒
  maxDelay: 10000, // 10秒
};

// 请求间隔（毫秒）- 避免服务器限流
const REQUEST_DELAY = 200;

export class WebDAVAdapter implements StorageAdapter {
  private client: WebDAVClient;
  private basePath: string;
  private timeout: number;
  private directoriesChecked: Set<string> = new Set(); // 缓存已检查的目录

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

  // 延迟函数
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 带重试的操作
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // 指数退避延迟
          const delayMs = Math.min(
            RETRY_CONFIG.baseDelay * Math.pow(2, attempt - 1),
            RETRY_CONFIG.maxDelay
          );
          console.log(`[WebDAVAdapter] Retry ${attempt}/${RETRY_CONFIG.maxRetries} for ${operationName} after ${delayMs}ms`);
          await this.delay(delayMs);
        }
        return await operation();
      } catch (error) {
        lastError = error as Error;
        const errorMsg = lastError.message || '';
        
        // 检查是否是可重试的错误
        const isRetryable = 
          errorMsg.includes('ETIMEDOUT') ||
          errorMsg.includes('ECONNRESET') ||
          errorMsg.includes('ECONNREFUSED') ||
          errorMsg.includes('socket hang up') ||
          errorMsg.includes('network') ||
          errorMsg.includes('timeout');
        
        if (!isRetryable) {
          throw lastError;
        }
        
        console.warn(`[WebDAVAdapter] ${operationName} failed (attempt ${attempt + 1}): ${errorMsg}`);
      }
    }
    
    throw lastError;
  }

  private getPath(relativePath: string): string {
    return `${this.basePath}/${relativePath}`;
  }

  async testConnection(): Promise<boolean> {
    console.log('[WebDAVAdapter] testConnection called');
    console.log('[WebDAVAdapter] basePath:', this.basePath);
    
    try {
      console.log('[WebDAVAdapter] Testing connection to:', this.basePath);

      // 第一步：尝试列出根目录来验证认证
      console.log('[WebDAVAdapter] Step 1: Testing authentication by listing root...');
      try {
        const rootContents = await this.withTimeout(this.client.getDirectoryContents('/'), 10000);
        console.log('[WebDAVAdapter] Root directory accessible, found', Array.isArray(rootContents) ? rootContents.length : 0, 'items');
      } catch (authError: any) {
        console.error('[WebDAVAdapter] Authentication test failed:', authError?.message || authError);
        // 检查是否是 401/403 错误
        if (authError?.response?.status === 401 || authError?.response?.status === 403) {
          console.error('[WebDAVAdapter] Authentication failed - check username/password');
          return false;
        }
        // 其他错误可能是网络问题，继续尝试
        console.log('[WebDAVAdapter] Will continue despite root listing error...');
      }

      // 第二步：检查/创建基础目录
      console.log('[WebDAVAdapter] Step 2: Checking if base path exists...');
      let exists = false;
      try {
        exists = await this.withTimeout(this.client.exists(this.basePath), 10000);
        console.log('[WebDAVAdapter] Base path exists:', exists);
      } catch (existsError: any) {
        console.error('[WebDAVAdapter] Error checking base path:', existsError?.message || existsError);
        // 如果检查失败，可能是认证问题或网络问题
        // 尝试直接创建目录
        console.log('[WebDAVAdapter] Will try to create directory anyway...');
      }

      if (!exists) {
        // 逐级创建目录
        console.log('[WebDAVAdapter] Step 3: Creating base directory...');
        try {
          await this.ensureDirectory(this.basePath);
          console.log('[WebDAVAdapter] Base directory created');
        } catch (createError: any) {
          console.error('[WebDAVAdapter] Error creating base directory:', createError?.message || createError);
          // 目录可能已存在，继续检查子目录
        }
      }

      // 第三步：检查/创建子目录
      console.log('[WebDAVAdapter] Step 4: Checking/creating sub-directories...');
      const subDirs = [PATHS.ITEMS, PATHS.RESOURCES, PATHS.CHANGES];
      let subDirSuccess = 0;
      for (const dir of subDirs) {
        const dirPath = this.getPath(dir);
        try {
          const dirExists = await this.withTimeout(this.client.exists(dirPath), 10000);
          if (!dirExists) {
            await this.withTimeout(this.client.createDirectory(dirPath), 10000);
            console.log(`[WebDAVAdapter] Created sub-directory: ${dir}`);
          } else {
            console.log(`[WebDAVAdapter] Sub-directory exists: ${dir}`);
          }
          subDirSuccess++;
        } catch (subDirError: any) {
          console.error(`[WebDAVAdapter] Error with sub-directory ${dir}:`, subDirError?.message || subDirError);
          // 继续检查其他目录
        }
      }

      // 如果至少有一个子目录操作成功，认为连接成功
      if (subDirSuccess > 0) {
        console.log(`[WebDAVAdapter] Connection test successful (${subDirSuccess}/${subDirs.length} sub-dirs ok)`);
        // 标记已检查的目录，避免后续重复检查
        for (const dir of subDirs) {
          this.directoriesChecked.add(this.getPath(dir));
        }
        return true;
      }

      // 如果所有子目录操作都失败，尝试一个简单的写入测试
      console.log('[WebDAVAdapter] Step 5: Trying simple write test...');
      try {
        const testPath = this.getPath('.connection-test');
        await this.withTimeout(this.client.putFileContents(testPath, 'test'), 10000);
        await this.withTimeout(this.client.deleteFile(testPath), 10000);
        console.log('[WebDAVAdapter] Write test successful');
        return true;
      } catch (writeError: any) {
        console.error('[WebDAVAdapter] Write test failed:', writeError?.message || writeError);
      }

      console.log('[WebDAVAdapter] Connection test failed - no operations succeeded');
      return false;
    } catch (error: any) {
      console.error('[WebDAVAdapter] Connection test failed with exception:', error);
      // 打印更详细的错误信息
      if (error instanceof Error) {
        console.error('[WebDAVAdapter] Error name:', error.name);
        console.error('[WebDAVAdapter] Error message:', error.message);
        console.error('[WebDAVAdapter] Error stack:', error.stack);
      }
      // 检查是否是 HTTP 错误
      if (error?.response) {
        console.error('[WebDAVAdapter] HTTP Status:', error.response?.status);
        console.error('[WebDAVAdapter] HTTP StatusText:', error.response?.statusText);
        console.error('[WebDAVAdapter] HTTP Data:', error.response?.data);
      }
      // 检查是否是 axios 错误
      if (error?.code) {
        console.error('[WebDAVAdapter] Error code:', error.code);
      }
      if (error?.config) {
        console.error('[WebDAVAdapter] Request URL:', error.config?.url);
        console.error('[WebDAVAdapter] Request method:', error.config?.method);
      }
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
      
      // 只在首次检查 items 目录（使用缓存避免重复检查）
      const itemsDir = this.getPath(PATHS.ITEMS);
      if (!this.directoriesChecked.has(itemsDir)) {
        try {
          const dirExists = await this.withTimeout(this.client.exists(itemsDir), 10000);
          if (!dirExists) {
            await this.withTimeout(this.client.createDirectory(itemsDir), 10000);
            console.log('[WebDAVAdapter] Created items directory');
          }
          this.directoriesChecked.add(itemsDir);
        } catch (dirError) {
          // 目录可能已存在，标记为已检查
          this.directoriesChecked.add(itemsDir);
          console.warn('[WebDAVAdapter] Directory check/create warning:', dirError);
        }
      }
      
      // 使用重试机制上传文件
      await this.withRetry(async () => {
        await this.withTimeout(
          this.client.putFileContents(itemPath, content, { overwrite: true }), 
          60000
        );
      }, `putItem(${item.id})`);

      // 添加请求间隔，避免服务器限流
      await this.delay(REQUEST_DELAY);

      // 记录变更（也使用重试）
      await this.withRetry(async () => {
        await this.recordChange(item);
      }, `recordChange(${item.id})`);

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
      // id 已经包含扩展名（如 uuid.png），直接使用
      const resourcePath = this.getPath(`${PATHS.RESOURCES}/${id}`);

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

  // ❌ 游标已移至本地存储，不再从WebDAV读写
  // 保留这两个方法是为了兼容 StorageAdapter 接口
  // 但实际上不再使用，游标由 ItemsManager 管理
  async getSyncCursor(): Promise<SyncCursor | null> {
    console.warn('[WebDAVAdapter] getSyncCursor is deprecated. Use ItemsManager.getLocalSyncCursor() instead.');
    return null;
  }

  async setSyncCursor(cursor: SyncCursor): Promise<boolean> {
    console.warn('[WebDAVAdapter] setSyncCursor is deprecated. Use ItemsManager.setLocalSyncCursor() instead.');
    return true;
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

    // 只在首次检查 changes 目录（使用缓存）
    const changesDir = this.getPath(PATHS.CHANGES);
    if (!this.directoriesChecked.has(changesDir)) {
      try {
        const dirExists = await this.withTimeout(this.client.exists(changesDir), 10000);
        if (!dirExists) {
          await this.withTimeout(this.client.createDirectory(changesDir), 10000);
        }
        this.directoriesChecked.add(changesDir);
      } catch (dirError) {
        // 目录可能已存在，标记为已检查
        this.directoriesChecked.add(changesDir);
      }
    }

    const changePath = this.getPath(`${PATHS.CHANGES}/${change.change_id}.json`);
    await this.withTimeout(
      this.client.putFileContents(changePath, JSON.stringify(change, null, 2), { overwrite: true })
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

  // 获取远端密钥指纹
  async getKeyFingerprint(): Promise<string | null> {
    try {
      const path = this.getPath(PATHS.KEY_FINGERPRINT);
      const exists = await this.withTimeout(this.client.exists(path));
      if (!exists) {
        return null;
      }
      const content = await this.withTimeout(this.client.getFileContents(path, { format: 'text' }));
      return content as string;
    } catch (error) {
      console.error('Failed to get key fingerprint:', error);
      return null;
    }
  }

  // 保存密钥指纹
  async saveKeyFingerprint(fingerprint: string): Promise<boolean> {
    try {
      const path = this.getPath(PATHS.KEY_FINGERPRINT);
      await this.withTimeout(this.client.putFileContents(path, fingerprint, { overwrite: true }));
      return true;
    } catch (error) {
      console.error('Failed to save key fingerprint:', error);
      return false;
    }
  }

  // 验证密钥指纹
  async verifyKeyFingerprint(localFingerprint: string): Promise<{ valid: boolean; remoteFingerprint: string | null }> {
    const remoteFingerprint = await this.getKeyFingerprint();

    if (remoteFingerprint === null) {
      // 远端没有指纹，检查是否有加密数据
      // 如果有加密数据但没有指纹，说明是旧版本数据或指纹丢失，应该报错
      const hasData = await this.hasExistingData();
      if (hasData) {
        // 远端有数据但没有指纹，可能是密钥不匹配
        console.error('[WebDAVAdapter] Remote has data but no key fingerprint - possible key mismatch');
        return { valid: false, remoteFingerprint: null };
      }
      // 远端没有数据，这是真正的首次同步，保存本地指纹
      await this.saveKeyFingerprint(localFingerprint);
      return { valid: true, remoteFingerprint: null };
    }

    // 验证指纹是否匹配
    const valid = remoteFingerprint === localFingerprint;
    return { valid, remoteFingerprint };
  }
}


export default WebDAVAdapter;
