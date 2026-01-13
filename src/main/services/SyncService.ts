import { ipcMain, IpcMainInvokeEvent, BrowserWindow, app } from 'electron';
import { SyncEngine, SyncResult, SyncOptions, ServerIdentifier } from '@core/sync/SyncEngine';
import { SyncScheduler, SyncState } from '@core/sync/SyncScheduler';
import { WebDAVAdapter } from '@core/sync/WebDAVAdapter';
import { ServerAdapter } from '@core/sync/ServerAdapter';
import { StorageAdapter, WebDAVConfig, ServerConfig } from '@core/sync/StorageAdapter';
import { SyncModules, DEFAULT_SYNC_MODULES } from '@shared/types';
import { getItemsManager } from './DatabaseService';
import * as path from 'path';
import * as fs from 'fs';

let syncEngine: SyncEngine | null = null;
let syncScheduler: SyncScheduler | null = null;
let currentAdapter: StorageAdapter | null = null;
let currentServerIdentifier: ServerIdentifier | null = null;

export interface SyncServiceConfig {
  enabled: boolean;
  type: 'webdav' | 'server';
  url: string;
  syncPath?: string;  // 同步目录路径
  username?: string;
  password?: string;
  apiKey?: string;
  // 服务器认证字段
  serverToken?: string;
  serverRefreshToken?: string;
  serverTokenExpires?: number;
  syncInterval: number;
  syncModules?: SyncModules;  // 同步模块配置
  lastSyncTime?: number | null;  // 上次同步时间（从持久化存储加载）
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
      currentServerIdentifier = null;
      return true;
    }

    // 创建服务器标识（用于独立存储游标）
    currentServerIdentifier = {
      type: config.type,
      url: config.url,
    };

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
        token: config.serverToken,
      };
      const serverAdapter = new ServerAdapter(serverConfig);
      
      // 设置认证信息
      if (config.serverToken) {
        serverAdapter.setAuth(
          config.serverToken,
          config.serverRefreshToken,
          config.serverTokenExpires
        );
      }
      
      // 设置 token 刷新回调
      serverAdapter.setTokenRefreshCallback((token, refreshToken, expiresIn) => {
        // 保存新 token 到配置文件（确保持久化）
        const syncConfigPath = path.join(app.getPath('userData'), 'sync-config.json');
        try {
          let existingConfig = {};
          if (fs.existsSync(syncConfigPath)) {
            existingConfig = JSON.parse(fs.readFileSync(syncConfigPath, 'utf8'));
          }
          const updatedConfig = {
            ...existingConfig,
            server_token: token,
            server_refresh_token: refreshToken,
            server_token_expires: Date.now() + expiresIn * 1000,
          };
          fs.writeFileSync(syncConfigPath, JSON.stringify(updatedConfig, null, 2), 'utf8');
          console.log('[SyncService] Token refreshed and saved to config file');
        } catch (e) {
          console.error('[SyncService] Failed to save refreshed token to config:', e);
        }
        
        // 通知渲染进程更新 token
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
          win.webContents.send('sync:tokenRefreshed', { token, refreshToken, expiresIn });
        });
      });
      
      // 检查 token 是否已过期或即将过期，主动刷新
      if (config.serverRefreshToken) {
        const tokenExpired = config.serverTokenExpires && config.serverTokenExpires < Date.now();
        const tokenExpiringSoon = config.serverTokenExpires && (config.serverTokenExpires - Date.now() < 5 * 60 * 1000);
        
        if (tokenExpired || tokenExpiringSoon) {
          console.log('[SyncService] Token expired or expiring soon, refreshing...');
          const refreshed = await serverAdapter.refreshAccessToken();
          if (!refreshed) {
            console.warn('[SyncService] Failed to refresh token, sync may fail');
          } else {
            console.log('[SyncService] Token refreshed successfully');
          }
        }
      }
      
      currentAdapter = serverAdapter;
    }

    // 确保 adapter 已创建
    if (!currentAdapter) {
      console.error('Failed to create storage adapter');
      return false;
    }

    // 测试连接
    const connected = await currentAdapter.testConnection();
    if (!connected) {
      console.error('Failed to connect to sync server');
      return false;
    }

    // 创建同步引擎（明文同步，不再需要加密）
    const itemsManager = getItemsManager();
    const resourcesDir = path.join(app.getPath('userData'), 'resources');
    const syncOptions: Partial<SyncOptions> = {
      conflictStrategy: 'create-copy',
      syncModules: config.syncModules || DEFAULT_SYNC_MODULES,
      serverIdentifier: currentServerIdentifier,  // 传递服务器标识
      resourcesDir,  // 传递资源目录路径
    };
    syncEngine = new SyncEngine(currentAdapter, itemsManager, syncOptions);

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
    // 启动时不自动同步，只按时间间隔定时同步，用户可手动触发同步
    // syncOnChange 设为 false，不在内容变更时触发同步，只按时间间隔同步
    syncScheduler = new SyncScheduler(syncEngine, {
      autoSyncOnStart: false,  // 启动时不自动同步，避免网络问题导致卡顿
      syncInterval: config.syncInterval,
      syncOnChange: false,  // 不在内容变更时触发同步
      changeDebounce: 30,
      initialLastSyncTime: config.lastSyncTime,  // 从配置加载上次同步时间
      onSyncComplete: (lastSyncTime: number) => {
        // 同步完成后通知渲染进程更新持久化存储
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
          win.webContents.send('sync:lastSyncTimeUpdated', lastSyncTime);
        });
      },
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
  console.log('[SyncService] testSyncConnection called with config:', {
    type: config.type,
    url: config.url,
    syncPath: config.syncPath,
    username: config.username,
    passwordLength: config.password?.length || 0,
  });

  if (!config.url) {
    console.error('[SyncService] No URL provided');
    return false;
  }

  try {
    let adapter: StorageAdapter;

    if (config.type === 'webdav') {
      // 移除 URL 末尾斜杠
      const baseUrl = config.url.replace(/\/+$/, '');
      // 确保 syncPath 以 / 开头
      const syncPath = config.syncPath
        ? (config.syncPath.startsWith('/') ? config.syncPath : '/' + config.syncPath)
        : '/mucheng-notes';

      console.log('[SyncService] Creating WebDAV adapter with:', {
        url: baseUrl,
        syncPath,
        username: config.username,
        passwordLength: config.password?.length || 0,
      });

      const webdavConfig: WebDAVConfig = {
        url: baseUrl,
        username: config.username || '',
        password: config.password || '',
        basePath: syncPath,
      };
      
      console.log('[SyncService] WebDAV config created, creating adapter...');
      adapter = new WebDAVAdapter(webdavConfig);
      console.log('[SyncService] WebDAV adapter created successfully');
    } else {
      const serverConfig: ServerConfig = {
        url: config.url,
        apiKey: config.apiKey || '',
        token: config.serverToken,
      };
      const serverAdapter = new ServerAdapter(serverConfig);
      
      // 设置认证信息
      if (config.serverToken) {
        serverAdapter.setAuth(
          config.serverToken,
          config.serverRefreshToken,
          config.serverTokenExpires
        );
      }
      
      adapter = serverAdapter;
    }

    console.log('[SyncService] Calling adapter.testConnection()...');
    const startTime = Date.now();
    const result = await adapter.testConnection();
    const duration = Date.now() - startTime;
    console.log('[SyncService] testConnection result:', result, `(${duration}ms)`);
    return result;
  } catch (error: any) {
    console.error('[SyncService] testSyncConnection error:', error);
    if (error instanceof Error) {
      console.error('[SyncService] Error name:', error.name);
      console.error('[SyncService] Error message:', error.message);
      console.error('[SyncService] Error stack:', error.stack);
    }
    // 检查是否是网络错误
    if (error?.code) {
      console.error('[SyncService] Error code:', error.code);
    }
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
    try {
      console.log('[SyncService IPC] Received testConnection request:', {
        type: config.type,
        url: config.url,
        syncPath: config.syncPath,
        username: config.username,
        passwordLength: config.password?.length || 0,
      });
      const result = await testSyncConnection(config);
      console.log('[SyncService IPC] testConnection result:', result);
      return result;
    } catch (error) {
      console.error('[SyncService IPC] testConnection error:', error);
      return false;
    }
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

  // 获取本地同步游标（调试用）
  ipcMain.handle('sync:getLocalCursor', async (_event: IpcMainInvokeEvent, serverType?: string, serverUrl?: string) => {
    const itemsManager = getItemsManager();
    // 如果没有提供服务器信息，使用当前配置的服务器
    const type = serverType || currentServerIdentifier?.type;
    const url = serverUrl || currentServerIdentifier?.url;
    const cursor = itemsManager.getLocalSyncCursor(type, url);
    console.log('[SyncService] Local sync cursor for', type, url, ':', cursor);
    return cursor;
  });

  // 清除本地同步游标（强制重新拉取所有变更）
  ipcMain.handle('sync:clearLocalCursor', async (_event: IpcMainInvokeEvent, serverType?: string, serverUrl?: string) => {
    const itemsManager = getItemsManager();
    // 如果没有提供服务器信息，使用当前配置的服务器
    const type = serverType || currentServerIdentifier?.type;
    const url = serverUrl || currentServerIdentifier?.url;
    const success = itemsManager.clearLocalSyncCursor(type, url);
    console.log('[SyncService] Cleared local sync cursor for', type, url, ', success:', success);
    return { success };
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
