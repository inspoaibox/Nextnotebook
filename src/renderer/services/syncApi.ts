// 同步 API 服务
// 注意：SyncConfig 使用驼峰命名，与主进程 SyncServiceConfig 保持一致
// shared/types 中的 SyncConfig 使用下划线命名，用于存储

import { SyncModules } from '@shared/types';

export interface SyncApiConfig {
  enabled: boolean;
  type: 'webdav' | 'server';
  url: string;
  syncPath: string;
  username?: string;
  password?: string;
  apiKey?: string;
  encryptionEnabled: boolean;
  encryptionKey?: string;
  syncInterval: number;
  syncModules?: SyncModules;
}

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
  duration: number;
  cleanedChangeLogs?: number;
}

export interface SyncProgress {
  phase: 'idle' | 'connecting' | 'acquiring-lock' | 'verifying-key' | 'pushing' | 'pulling' | 'committing' | 'done' | 'error';
  message: string;
  current?: number;
  total?: number;
  detail?: string;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'error' | 'offline';
  lastSyncTime: number | null;
  lastSyncResult: SyncResult | null;
  pendingChanges: number;
  isOnline: boolean;
  progress: SyncProgress | null;
}

const getElectronAPI = () => {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return (window as any).electronAPI;
  }
  return null;
};

export const syncApi = {
  // 初始化同步服务
  initialize: async (config: SyncApiConfig): Promise<boolean> => {
    const api = getElectronAPI();
    return api?.sync?.initialize(config) ?? false;
  },

  // 启动同步调度
  start: async (): Promise<boolean> => {
    const api = getElectronAPI();
    return api?.sync?.start() ?? false;
  },

  // 停止同步调度
  stop: async (): Promise<boolean> => {
    const api = getElectronAPI();
    return api?.sync?.stop() ?? false;
  },

  // 手动触发同步
  trigger: async (): Promise<SyncResult | null> => {
    const api = getElectronAPI();
    return api?.sync?.trigger() ?? null;
  },

  // 获取同步状态
  getState: async (): Promise<SyncState | null> => {
    const api = getElectronAPI();
    return api?.sync?.getState() ?? null;
  },

  // 通知内容变更
  notifyChange: async (): Promise<boolean> => {
    const api = getElectronAPI();
    return api?.sync?.notifyChange() ?? false;
  },

  // 测试连接
  testConnection: async (config: SyncApiConfig): Promise<boolean> => {
    const api = getElectronAPI();
    return api?.sync?.testConnection(config) ?? false;
  },

  // 强制重新同步（标记所有数据为待同步）
  forceResync: async (): Promise<{ success: boolean; count: number; error?: string }> => {
    const api = getElectronAPI();
    return api?.sync?.forceResync() ?? { success: false, count: 0, error: 'API not available' };
  },

  // 重置同步状态（用于切换服务器）
  resetStatus: async (): Promise<{ success: boolean; count: number; error?: string }> => {
    const api = getElectronAPI();
    return api?.sync?.resetStatus() ?? { success: false, count: 0, error: 'API not available' };
  },

  // 检查首次同步状态
  checkFirstSync: async (): Promise<{ isFirstSync: boolean; remoteHasData: boolean; localItemCount: number }> => {
    const api = getElectronAPI();
    return api?.sync?.checkFirstSync() ?? { isFirstSync: false, remoteHasData: false, localItemCount: 0 };
  },
};

export default syncApi;
