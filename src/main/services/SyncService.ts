import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { SyncEngine, SyncResult, SyncOptions } from '@core/sync/SyncEngine';
import { SyncScheduler, SyncState } from '@core/sync/SyncScheduler';
import { WebDAVAdapter } from '@core/sync/WebDAVAdapter';
import { ServerAdapter } from '@core/sync/ServerAdapter';
import { StorageAdapter, WebDAVConfig, ServerConfig } from '@core/sync/StorageAdapter';
import { CryptoEngine } from '@core/crypto/CryptoEngine';
import { getItemsManager } from './DatabaseService';

let syncEngine: SyncEngine | null = null;
let syncScheduler: SyncScheduler | null = null;
let cryptoEngine: CryptoEngine | null = null;
let currentAdapter: StorageAdapter | null = null;

export interface SyncServiceConfig {
  enabled: boolean;
  type: 'webdav' | 'server';
  url: string;
  syncPath?: string;  // 同步目录路径
  username?: string;
  password?: string;
  apiKey?: string;
  encryptionEnabled: boolean;
  encryptionKey?: string;
  syncInterval: number;
}

// 初始化同步服务
export async function initializeSyncService(config: SyncServiceConfig): Promise<boolean> {
  try {
    // 停止现有的调度器
    if (syncScheduler) {
      syncScheduler.stop();
      syncScheduler = null;
    }

    if (!config.enabled || !config.url) {
      syncEngine = null;
      currentAdapter = null;
      return true;
    }

    // 创建适配器
    if (config.type === 'webdav') {
      // 移除 URL 末尾斜杠
      const baseUrl = config.url.replace(/\/+$/, '');
      // 确保 syncPath 以 / 开头
      const syncPath = config.syncPath 
        ? (config.syncPath.startsWith('/') ? config.syncPath : '/' + config.syncPath)
        : '/mucheng-notes';
      
      const webdavConfig: WebDAVConfig = {
        url: baseUrl,
        username: config.username || '',
        password: config.password || '',
        basePath: syncPath,  // 将 syncPath 作为 basePath 传递
      };
      currentAdapter = new WebDAVAdapter(webdavConfig);
    } else {
      const serverConfig: ServerConfig = {
        url: config.url,
        apiKey: config.apiKey || '',
      };
      currentAdapter = new ServerAdapter(serverConfig);
    }

    // 测试连接
    const connected = await currentAdapter.testConnection();
    if (!connected) {
      console.error('Failed to connect to sync server');
      return false;
    }

    // 创建加密引擎
    // 注意：即使用户不开启全局加密，也需要创建加密引擎用于敏感数据（密码库）
    // 如果用户提供了加密密钥，使用用户密钥；否则使用默认密钥
    cryptoEngine = new CryptoEngine();
    const fixedSalt = Buffer.from('mucheng-sync-salt-2024-fixed-key', 'utf8');
    
    if (config.encryptionKey) {
      // 使用用户提供的密钥
      const { key } = cryptoEngine.deriveKeyFromPassword(config.encryptionKey, fixedSalt);
      cryptoEngine.setMasterKey(key);
    } else {
      // 使用默认密钥（仅用于密码库等敏感数据的基本保护）
      // 注意：这不如用户自定义密钥安全，但比明文好
      const { key } = cryptoEngine.deriveKeyFromPassword('mucheng-default-vault-key-2024', fixedSalt);
      cryptoEngine.setMasterKey(key);
    }

    // 创建同步引擎
    const itemsManager = getItemsManager();
    const syncOptions: Partial<SyncOptions> = {
      encryptionEnabled: config.encryptionEnabled,
      conflictStrategy: 'create-copy',
    };
    syncEngine = new SyncEngine(currentAdapter, itemsManager, cryptoEngine, syncOptions);

    // 创建调度器
    syncScheduler = new SyncScheduler(syncEngine, {
      autoSyncOnStart: true,
      syncInterval: config.syncInterval,
      syncOnChange: true,
      changeDebounce: 30,
    });

    return true;
  } catch (error) {
    console.error('Failed to initialize sync service:', error);
    return false;
  }
}

// 启动同步调度
export function startSyncScheduler(): void {
  if (syncScheduler) {
    syncScheduler.start();
  }
}

// 停止同步调度
export function stopSyncScheduler(): void {
  if (syncScheduler) {
    syncScheduler.stop();
  }
}

// 手动触发同步
export async function triggerSync(): Promise<SyncResult | null> {
  if (!syncScheduler) {
    return null;
  }
  return syncScheduler.triggerSync();
}

// 获取同步状态
export function getSyncState(): SyncState | null {
  if (!syncScheduler) {
    return null;
  }
  return syncScheduler.getState();
}

// 通知内容变更
export function notifySyncChange(): void {
  if (syncScheduler) {
    syncScheduler.notifyChange();
  }
}

// 测试连接
export async function testSyncConnection(config: SyncServiceConfig): Promise<boolean> {
  try {
    let adapter: StorageAdapter;
    
    if (config.type === 'webdav') {
      // 移除 URL 末尾斜杠
      const baseUrl = config.url.replace(/\/+$/, '');
      // 确保 syncPath 以 / 开头
      const syncPath = config.syncPath 
        ? (config.syncPath.startsWith('/') ? config.syncPath : '/' + config.syncPath)
        : '/mucheng-notes';
      
      const webdavConfig: WebDAVConfig = {
        url: baseUrl,
        username: config.username || '',
        password: config.password || '',
        basePath: syncPath,  // 将 syncPath 作为 basePath 传递
      };
      adapter = new WebDAVAdapter(webdavConfig);
    } else {
      const serverConfig: ServerConfig = {
        url: config.url,
        apiKey: config.apiKey || '',
      };
      adapter = new ServerAdapter(serverConfig);
    }

    return await adapter.testConnection();
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
}

// 注册 IPC handlers
export function registerSyncIpcHandlers(): void {
  // 初始化同步
  ipcMain.handle('sync:initialize', async (_event: IpcMainInvokeEvent, config: SyncServiceConfig) => {
    return initializeSyncService(config);
  });

  // 启动同步调度
  ipcMain.handle('sync:start', () => {
    startSyncScheduler();
    return true;
  });

  // 停止同步调度
  ipcMain.handle('sync:stop', () => {
    stopSyncScheduler();
    return true;
  });

  // 手动同步
  ipcMain.handle('sync:trigger', async () => {
    return triggerSync();
  });

  // 获取状态
  ipcMain.handle('sync:getState', () => {
    return getSyncState();
  });

  // 通知变更
  ipcMain.handle('sync:notifyChange', () => {
    notifySyncChange();
    return true;
  });

  // 测试连接
  ipcMain.handle('sync:testConnection', async (_event: IpcMainInvokeEvent, config: SyncServiceConfig) => {
    return testSyncConnection(config);
  });
}
