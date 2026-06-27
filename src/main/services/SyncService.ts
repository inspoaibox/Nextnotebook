import { ipcMain, IpcMainInvokeEvent, BrowserWindow, app } from 'electron';
import { SyncEngine, SyncResult, SyncOptions, ServerIdentifier } from '@core/sync/SyncEngine';
import { SyncScheduler, SyncState } from '@core/sync/SyncScheduler';
import { WebDAVAdapter } from '@core/sync/WebDAVAdapter';
import { ServerAdapter } from '@core/sync/ServerAdapter';
import { StorageAdapter, WebDAVConfig, ServerConfig } from '@core/sync/StorageAdapter';
import { SyncModules, DEFAULT_SYNC_MODULES } from '@shared/types';
import { getItemsManager } from './DatabaseService';
import { loadSyncConfig, saveSyncConfig } from './SyncConfigStorage';
import { getCloudDriveService } from './CloudDriveService';
import * as path from 'path';
import * as fs from 'fs';

let syncEngine: SyncEngine | null = null;
let syncScheduler: SyncScheduler | null = null;
let currentAdapter: StorageAdapter | null = null;
let currentServerIdentifier: ServerIdentifier | null = null;
let cloudDriveSyncTimer: NodeJS.Timeout | null = null;

/**
 * 获取当前同步适配器（网盘 Scheduler 复用同一适配器上传分块）。
 * 适配器内部的鉴权是自包含的（ServerAdapter 自动注入 Bearer + 401 刷新），
 * 调用方无需关心 token。未建立同步连接时返回 null。
 */
export function getSyncAdapter(): StorageAdapter | null {
  return currentAdapter;
}

export interface SyncServiceConfig {
  enabled: boolean;
  type: 'webdav' | 'server';
  url: string;
  syncPath?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  serverToken?: string;
  serverRefreshToken?: string;
  serverTokenExpires?: number;
  serverSyncKey?: string;
  serverUsername?: string;   // 自建服务器用户名
  serverPassword?: string;   // 自建服务器密码
  syncInterval: number;
  syncModules?: SyncModules;
  lastSyncTime?: number | null;
}

// 首次同步检测结果
export interface FirstSyncCheckResult {
  isFirstSync: boolean;
  remoteHasData: boolean;
  localItemCount: number;
}

/**
 * 任务C：从 CloudDriveService 单例读取传输层配置（超时/重试/连接池）。
 * 该配置是云盘与同步共用的权威来源——ServerAdapter 内部对这些字段做 `?? 默认值` 兜底，
 * 故此处返回 undefined 即可让适配器回退到内置默认。CloudDriveService 未初始化或读取异常时返回空对象。
 */
function readTransportConfig(): {
  upload_timeout_ms?: number;
  upload_retry_count?: number;
  upload_retry_backoff_base_ms?: number;
  keep_alive?: boolean;
  max_sockets?: number;
} {
  try {
    const cfg = getCloudDriveService()?.getConfig();
    if (!cfg) return {};
    return {
      upload_timeout_ms: cfg.upload_timeout_ms,
      upload_retry_count: cfg.upload_retry_count,
      upload_retry_backoff_base_ms: cfg.upload_retry_backoff_base_ms,
      keep_alive: cfg.keep_alive,
      max_sockets: cfg.max_sockets,
    };
  } catch {
    return {};
  }
}

// 初始化同步服务
export async function initializeSyncService(config: SyncServiceConfig): Promise<boolean> {
  try {
    // 停止现有的调度器
    if (syncScheduler) {
      syncScheduler.stop();
      syncScheduler = null;
    }
    if (cloudDriveSyncTimer) {
      clearTimeout(cloudDriveSyncTimer);
      cloudDriveSyncTimer = null;
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
        ? config.syncPath.startsWith('/')
          ? config.syncPath
          : '/' + config.syncPath
        : '/mucheng-notes';

      const webdavConfig: WebDAVConfig = {
        url: baseUrl,
        username: config.username || '',
        password: config.password || '',
        basePath: syncPath, // 将 syncPath 作为 basePath 传递
      };
      currentAdapter = new WebDAVAdapter(webdavConfig);
    } else {
      // 任务C：从 CloudDriveService 单例读取传输层配置（超时/重试/连接池），
      // 透传给 ServerAdapter。该适配器同时被网盘 Scheduler 复用做分块上传，
      // 故传输策略对云盘上传同样生效。读取失败或未初始化时回退到 ServerAdapter 内置默认。
      const transport = readTransportConfig();
      const serverConfig: ServerConfig = {
        url: config.url,
        apiKey: config.apiKey || '',
        token: config.serverToken,
        upload_timeout_ms: transport.upload_timeout_ms,
        upload_retry_count: transport.upload_retry_count,
        upload_retry_backoff_base_ms: transport.upload_retry_backoff_base_ms,
        keep_alive: transport.keep_alive,
        max_sockets: transport.max_sockets,
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

      // 保存凭据用于自动重新登录（refresh token 过期时）
      // 自建服务器用 serverUsername/serverPassword，WebDAV 用 username/password
      const credUsername = config.serverUsername || config.username;
      const credPassword = config.serverPassword || config.password;
      if (credUsername && credPassword && config.serverSyncKey) {
        serverAdapter.saveCredentials(credUsername, credPassword, config.serverSyncKey);
      }

      // 设置重新登录回调（通知渲染进程）
      serverAdapter.setReloginRequiredCallback(() => {
        console.warn('[SyncService] Session expired, user needs to re-login');
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('sync:reloginRequired');
        });
      });

      // 设置 token 刷新回调
      serverAdapter.setTokenRefreshCallback((token, refreshToken, expiresIn) => {
        // 保存新 token 到配置文件（确保持久化）
        try {
          const existingConfig = loadSyncConfig() || {};
          const updatedConfig = {
            ...existingConfig,
            server_token: token,
            server_refresh_token: refreshToken,
            server_token_expires: Date.now() + expiresIn * 1000,
          };
          saveSyncConfig(updatedConfig);
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
        const tokenExpiringSoon =
          config.serverTokenExpires && config.serverTokenExpires - Date.now() < 5 * 60 * 1000;

        if (tokenExpired || tokenExpiringSoon) {
          console.log('[SyncService] Token expired or expiring soon, refreshing...');
          const refreshed = await serverAdapter.refreshAccessToken();
          if (!refreshed) {
            console.warn('[SyncService] Failed to refresh token, sync will not start');
            return false;
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
      serverIdentifier: currentServerIdentifier, // 传递服务器标识
      resourcesDir, // 传递资源目录路径
      // Phase 2：cloud_file 物理文件操作的回调注入。
      // 通过动态 require 获取 CloudDriveService，避免 SyncService ↔ CloudDriveService 形成静态导入环。
      // SyncEngine 触发这些回调时元数据已写库，CloudDriveService 只做物理文件操作。
      onCloudFileChanged: (itemId: string) => {
        try {
          // 关闭自动下载时仅同步元数据，物理文件由用户手动触发下载。
          // auto_download 属于 CloudDriveConfig（云盘传输配置），不在 SyncServiceConfig 上，
          // 故通过 CloudDriveService 单例读取——与下方 onCloudItemDeleted 的取用方式一致。
          const autoDownload = getCloudDriveService()?.getConfig().auto_download;
          if (autoDownload === false) {
            return;
          }
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
          const scheduler = getCloudDriveScheduler();
          if (scheduler) {
            scheduler.enqueueDownload(itemId);
          }
        } catch (err) {
          console.warn('[SyncService] onCloudFileChanged 触发下载失败:', err);
        }
      },
      onCloudItemDeleted: (itemId: string) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getCloudDriveService } = require('./CloudDriveService') as typeof import('./CloudDriveService');
          getCloudDriveService()?.handleRemoteDelete(itemId);
        } catch (err) {
          console.warn('[SyncService] onCloudItemDeleted 处理失败:', err);
        }
      },
      onCloudFileConflict: (itemId: string, conflictPath: string) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getCloudDriveService } = require('./CloudDriveService') as typeof import('./CloudDriveService');
          const svc = getCloudDriveService();
          if (svc) {
            // 异步执行：copyFileSync 本身是同步的，但保留 void 容错
            void svc.handleCloudFileConflict(itemId, conflictPath);
          }
        } catch (err) {
          console.warn('[SyncService] onCloudFileConflict 处理失败:', err);
        }
      },
      onCloudItemsChanged: () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getCloudDriveService } = require('./CloudDriveService') as typeof import('./CloudDriveService');
          getCloudDriveService()?.notifyItemsChanged();
        } catch (err) {
          console.warn('[SyncService] onCloudItemsChanged 处理失败:', err);
        }
      },
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
      autoSyncOnStart: false, // 启动时不自动同步，避免网络问题导致卡顿
      syncInterval: config.syncInterval,
      syncOnChange: false, // 不在内容变更时触发同步
      changeDebounce: 30,
      initialLastSyncTime: config.lastSyncTime, // 从配置加载上次同步时间
      onSyncComplete: (lastSyncTime: number) => {
        // 同步完成后通知渲染进程更新持久化存储
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
          win.webContents.send('sync:lastSyncTimeUpdated', lastSyncTime);
        });
      },
    });

    try {
      // 同步连接建立后补偿网盘启动竞态：初始扫描可能早于 adapter ready。
      // 此时 retryAll 会把 pending/error 的云盘上传重新入队。
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getCloudDriveScheduler } = require('./CloudDriveScheduler') as typeof import('./CloudDriveScheduler');
      getCloudDriveScheduler()?.retryAll();
    } catch (err) {
      console.warn('[SyncService] 同步连接建立后触发网盘重试失败:', err);
    }

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
  if (cloudDriveSyncTimer) {
    clearTimeout(cloudDriveSyncTimer);
    cloudDriveSyncTimer = null;
  }
}

// 手动触发同步
export async function triggerSync(): Promise<SyncResult | null> {
  if (!syncScheduler) {
    return null;
  }
  return syncScheduler.triggerSync(true);
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

export function scheduleCloudDriveSync(delayMs: number = 2000): void {
  if (!syncScheduler || !currentServerIdentifier || currentServerIdentifier.type !== 'server') {
    return;
  }
  if (cloudDriveSyncTimer) {
    clearTimeout(cloudDriveSyncTimer);
  }
  cloudDriveSyncTimer = setTimeout(() => {
    cloudDriveSyncTimer = null;
    void syncScheduler?.triggerSync(false);
  }, Math.max(0, delayMs | 0));
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
        ? config.syncPath.startsWith('/')
          ? config.syncPath
          : '/' + config.syncPath
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
      // 任务C：从 CloudDriveService 单例读取传输层配置（超时/重试/连接池），
      // 透传给 ServerAdapter。该适配器同时被网盘 Scheduler 复用做分块上传，
      // 故传输策略对云盘上传同样生效。读取失败或未初始化时回退到 ServerAdapter 内置默认。
      const transport = readTransportConfig();
      const serverConfig: ServerConfig = {
        url: config.url,
        apiKey: config.apiKey || '',
        token: config.serverToken,
        upload_timeout_ms: transport.upload_timeout_ms,
        upload_retry_count: transport.upload_retry_count,
        upload_retry_backoff_base_ms: transport.upload_retry_backoff_base_ms,
        keep_alive: transport.keep_alive,
        max_sockets: transport.max_sockets,
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
  ipcMain.handle(
    'sync:initialize',
    async (_event: IpcMainInvokeEvent, config: SyncServiceConfig) => {
      return initializeSyncService(config);
    }
  );

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
  ipcMain.handle(
    'sync:testConnection',
    async (_event: IpcMainInvokeEvent, config: SyncServiceConfig) => {
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
    }
  );

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
  ipcMain.handle(
    'sync:getLocalCursor',
    async (_event: IpcMainInvokeEvent, serverType?: string, serverUrl?: string) => {
      const itemsManager = getItemsManager();
      // 如果没有提供服务器信息，使用当前配置的服务器
      const type = serverType || currentServerIdentifier?.type;
      const url = serverUrl || currentServerIdentifier?.url;
      const cursor = itemsManager.getLocalSyncCursor(type, url);
      console.log('[SyncService] Local sync cursor for', type, url, ':', cursor);
      return cursor;
    }
  );

  // 清除本地同步游标（强制重新拉取所有变更）
  ipcMain.handle(
    'sync:clearLocalCursor',
    async (_event: IpcMainInvokeEvent, serverType?: string, serverUrl?: string) => {
      const itemsManager = getItemsManager();
      // 如果没有提供服务器信息，使用当前配置的服务器
      const type = serverType || currentServerIdentifier?.type;
      const url = serverUrl || currentServerIdentifier?.url;
      const success = itemsManager.clearLocalSyncCursor(type, url);
      console.log('[SyncService] Cleared local sync cursor for', type, url, ', success:', success);
      return { success };
    }
  );

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
