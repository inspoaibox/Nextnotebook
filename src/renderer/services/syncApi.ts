// 同步 API 服务

export interface SyncConfig {
  enabled: boolean;
  type: 'webdav' | 'server';
  url: string;
  syncPath: string;  // 同步目录路径
  username?: string;
  password?: string;
  apiKey?: string;
  encryptionEnabled: boolean;
  encryptionKey?: string;
  syncInterval: number;
}

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
  duration: number;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'error' | 'offline';
  lastSyncTime: number | null;
  lastSyncResult: SyncResult | null;
  pendingChanges: number;
  isOnline: boolean;
}

const getElectronAPI = () => {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return (window as any).electronAPI;
  }
  return null;
};

export const syncApi = {
  // 初始化同步服务
  initialize: async (config: SyncConfig): Promise<boolean> => {
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
  testConnection: async (config: SyncConfig): Promise<boolean> => {
    const api = getElectronAPI();
    return api?.sync?.testConnection(config) ?? false;
  },
};

export default syncApi;
