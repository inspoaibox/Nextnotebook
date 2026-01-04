import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { SyncEngine, SyncResult, SyncOptions } from '@core/sync/SyncEngine';
import { SyncScheduler, SyncState } from '@core/sync/SyncScheduler';
import { WebDAVAdapter } from '@core/sync/WebDAVAdapter';
import { ServerAdapter } from '@core/sync/ServerAdapter';
import { StorageAdapter, WebDAVConfig, ServerConfig } from '@core/sync/StorageAdapter';
import { CryptoEngine } from '@core/crypto/CryptoEngine';
import { SyncModules, DEFAULT_SYNC_MODULES } from '@shared/types';
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
  syncModules?: SyncModules;  // 同步模块配置
}

// 首次同步检测结果
export interface FirstSyncCheckResult {
  isFirstSync: boolean;
  remoteHasData: boolean;
  localItemCount: number;
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
      syncModules: config.syncModules || DEFAULT_SYNC_MODULES,
    };
    syncEngine = new SyncEngine(currentAdapter, itemsManager, cryptoEngine, syncOptions);

    // 检测是否首次同步（远端没有元数据或没有同步游标）
    // 如果是首次同步，自动标记所有本地数据为待同步
    try {
      const remoteMeta = await currentAdapter.getRemoteMeta();
      const syncCursor = await currentAdapter.getSyncCursor();
      const remoteHasData = await syncEngine.checkRemoteHasData();
      
      // 如果远端没有上次同步时间，说明是首次同步到这个服务器
      if (!remoteMeta.last_sync_time && !syncCursor) {
        console.log('First sync detected, marking all local data for sync...');
        const count = syncEngine.resetSyncStatus();
        console.log(`Marked ${count} items for sync`);
        
        // 如果远端已有数据，记录警告（可能会产生冲突）
        if (remoteHasData) {
          console.warn('Remote server already has data. Conflicts may occur during first sync.');
        }
      }
    } catch (e) {
      console.warn('Failed to check first sync status:', e);
    }

    // 创建调度器
    // 只有设置了同步间隔才自动同步，间隔为0表示纯手动模式
    // syncOnChange 设为 false，不在内容变更时触发同步，只按时间间隔同步
    syncScheduler = new SyncScheduler(syncEngine, {
      autoSyncOnStart: config.syncInterval > 0,
      syncInterval: config.syncInterval,
      syncOnChange: false,  // 不在内容变更时触发同步
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

  // 强制重新同步（标记所有数据为待同步）
  ipcMain.handle('sync:forceResync', async () => {
    if (!syncEngine) {
      return { success: false, count: 0, error: '同步服务未初始化' };
    }
    try {
      const count = syncEngine.forceMarkAllForSync();
      return { success: true, count };
    } catch (error) {
      return { success: false, count: 0, error: (error as Error).message };
    }
  });

  // 重置同步状态（用于切换服务器）
  ipcMain.handle('sync:resetStatus', async () => {
    if (!syncEngine) {
      return { success: false, count: 0, error: '同步服务未初始化' };
    }
    try {
      const count = syncEngine.resetSyncStatus();
      return { success: true, count };
    } catch (error) {
      return { success: false, count: 0, error: (error as Error).message };
    }
  });

  // 检查首次同步状态
  ipcMain.handle('sync:checkFirstSync', async () => {
    if (!syncEngine || !currentAdapter) {
      return { isFirstSync: false, remoteHasData: false, localItemCount: 0 };
    }
    try {
      const remoteMeta = await currentAdapter.getRemoteMeta();
      const syncCursor = await currentAdapter.getSyncCursor();
      const remoteHasData = await syncEngine.checkRemoteHasData();
      const itemsManager = getItemsManager();
      const stats = itemsManager.getStats();
      
      return {
        isFirstSync: !remoteMeta.last_sync_time && !syncCursor,
        remoteHasData,
        localItemCount: stats.total,
      };
    } catch (error) {
      console.error('Failed to check first sync status:', error);
      return { isFirstSync: false, remoteHasData: false, localItemCount: 0 };
    }
  });
}
