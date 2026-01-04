import { SyncEngine, SyncResult, SyncProgress } from './SyncEngine';

export interface SyncSchedulerOptions {
  autoSyncOnStart: boolean;
  syncInterval: number;  // 分钟
  syncOnChange: boolean;
  changeDebounce: number;  // 秒
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncState {
  status: SyncStatus;
  lastSyncTime: number | null;
  lastSyncResult: SyncResult | null;
  pendingChanges: number;
  isOnline: boolean;
  progress: SyncProgress | null;  // 当前同步进度
}

type SyncEventCallback = (state: SyncState) => void;

export class SyncScheduler {
  private syncEngine: SyncEngine;
  private options: SyncSchedulerOptions;
  private state: SyncState;
  private intervalId: NodeJS.Timeout | null = null;
  private debounceId: NodeJS.Timeout | null = null;
  private listeners: Set<SyncEventCallback> = new Set();

  constructor(syncEngine: SyncEngine, options: Partial<SyncSchedulerOptions> = {}) {
    this.syncEngine = syncEngine;
    this.options = {
      autoSyncOnStart: false,  // 默认不在启动时立即同步，而是按间隔时间同步
      syncInterval: 5,
      syncOnChange: true,
      changeDebounce: 30,
      ...options,
    };
    this.state = {
      status: 'idle',
      lastSyncTime: null,
      lastSyncResult: null,
      pendingChanges: 0,
      isOnline: true,
      progress: null,
    };

    // 设置进度回调
    this.syncEngine.setProgressCallback((progress) => {
      this.updateState({ progress });
    });

    // 监听网络状态
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
      this.state.isOnline = navigator.onLine;
    }
  }

  // 启动调度器
  start(): void {
    if (this.options.autoSyncOnStart) {
      this.triggerSync();
    }

    if (this.options.syncInterval > 0) {
      this.startInterval();
    }
  }

  // 停止调度器
  stop(): void {
    this.stopInterval();
    this.cancelDebounce();
  }

  // 手动触发同步
  async triggerSync(): Promise<SyncResult | null> {
    if (this.state.status === 'syncing') {
      console.log('Sync already in progress');
      return null;
    }

    if (!this.state.isOnline) {
      console.log('Offline, skipping sync');
      return null;
    }

    this.updateState({ status: 'syncing', progress: { phase: 'connecting', message: '正在连接服务器...' } });

    try {
      const result = await this.syncEngine.sync();
      this.updateState({
        status: result.success ? 'idle' : 'error',
        lastSyncTime: Date.now(),
        lastSyncResult: result,
        pendingChanges: 0,
        progress: null,
      });
      return result;
    } catch (error) {
      console.error('Sync failed:', error);
      this.updateState({
        status: 'error',
        lastSyncResult: {
          success: false,
          pushed: 0,
          pulled: 0,
          conflicts: 0,
          errors: [(error as Error).message],
          duration: 0,
        },
        progress: { phase: 'error', message: '同步失败', detail: (error as Error).message },
      });
      return null;
    }
  }

  // 通知有内容变更（触发防抖同步）
  notifyChange(): void {
    if (!this.options.syncOnChange) return;

    this.updateState({ pendingChanges: this.state.pendingChanges + 1 });

    this.cancelDebounce();
    this.debounceId = setTimeout(() => {
      this.triggerSync();
    }, this.options.changeDebounce * 1000);
  }

  // 获取当前状态
  getState(): SyncState {
    return { ...this.state };
  }

  // 订阅状态变化
  subscribe(callback: SyncEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // 更新配置
  updateOptions(options: Partial<SyncSchedulerOptions>): void {
    const oldInterval = this.options.syncInterval;
    this.options = { ...this.options, ...options };

    // 如果间隔变化，重启定时器
    if (oldInterval !== this.options.syncInterval) {
      this.stopInterval();
      if (this.options.syncInterval > 0) {
        this.startInterval();
      }
    }
  }

  // 启动定时同步
  private startInterval(): void {
    this.stopInterval();
    const intervalMs = this.options.syncInterval * 60 * 1000;
    this.intervalId = setInterval(() => {
      this.triggerSync();
    }, intervalMs);
  }

  // 停止定时同步
  private stopInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // 取消防抖
  private cancelDebounce(): void {
    if (this.debounceId) {
      clearTimeout(this.debounceId);
      this.debounceId = null;
    }
  }

  // 处理上线
  private handleOnline(): void {
    this.updateState({ isOnline: true, status: 'idle' });
    // 上线后立即同步
    this.triggerSync();
  }

  // 处理离线
  private handleOffline(): void {
    this.updateState({ isOnline: false, status: 'offline' });
    this.cancelDebounce();
  }

  // 更新状态并通知监听器
  private updateState(updates: Partial<SyncState>): void {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach(callback => callback(this.state));
  }
}

export default SyncScheduler;
