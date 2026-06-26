/**
 * useCloudDrive Hook
 * 网盘功能：管理监听目录配置、上传进度、同步状态、手动控制
 *
 * 注：主进程桥接对象 window.electronAPI.cloudDrive.* 在层4-层7逐步实现，
 *     本 Hook 内部对未就绪的接口做了容错处理。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CloudDriveConfig,
  DEFAULT_CLOUD_DRIVE_CONFIG,
  CloudUploadProgress,
  CloudDownloadProgress,
  CloudFilePayload,
  CloudFolderPayload,
  CloudLocalAvailability,
} from '@shared/types';

// 获取 electronAPI（主进程桥接对象）
const getElectronAPI = (): any => {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return (window as any).electronAPI;
  }
  return null;
};

/**
 * 把主进程返回的 cloud_file 元数据（payload）转换为 UI 用的 CloudUploadProgress。
 * 仅 cloud_file 类型需要展示进度；cloud_folder 在 UI 里不渲染行。
 */
const filePayloadToProgress = (id: string, payload: CloudFilePayload): CloudUploadProgress => {
  const uploadedCount = Array.isArray(payload.uploaded_chunks) ? payload.uploaded_chunks.length : 0;
  const total = payload.total_chunks > 0 ? payload.total_chunks : 0;
  const bytesPerChunk = payload.chunk_size > 0 ? payload.chunk_size : 1;
  return {
    file_id: id,
    filename: payload.filename,
    relative_path: payload.relative_path,
    size: payload.size,
    uploaded_bytes: total > 0 ? Math.min(payload.size, uploadedCount * bytesPerChunk) : 0,
    uploaded_chunks: uploadedCount,
    total_chunks: total,
    state: payload.upload_state,
    error_message: payload.error_message,
  };
};

/**
 * 把主进程返回的 cloud_file 元数据（payload）转换为 UI 用的 CloudDownloadProgress。
 * 用于从快照水合下载进度列表（download_state 缺省时按 'pending' 兜底，
 * 仅当远端需要落盘但尚未在 UI 上出现过时才展示）。
 */
const filePayloadToDownloadProgress = (id: string, payload: CloudFilePayload): CloudDownloadProgress => {
  const dlState = payload.download_state ?? 'pending';
  return {
    file_id: id,
    filename: payload.filename,
    relative_path: payload.relative_path,
    size: payload.size,
    downloaded_bytes: payload.downloaded_size ?? 0,
    state: dlState,
    error_message: payload.download_error ?? null,
  };
};

export interface UseCloudDriveReturn {
  /** 当前网盘配置 */
  config: CloudDriveConfig;
  /** 是否正在监听目录 */
  isWatching: boolean;
  /** 上传进度列表 */
  uploadProgress: CloudUploadProgress[];
  /** 当前网盘元数据快照（文件 + 文件夹） */
  cloudItems: Array<{ id: string; type: 'cloud_file' | 'cloud_folder'; payload: CloudFilePayload | CloudFolderPayload }>;
  /** 是否正在加载配置 */
  loading: boolean;

  /** 选择监听根目录（弹出原生目录选择框） */
  selectWatchedFolder: () => Promise<void>;
  /** 启动监听 */
  startWatching: () => Promise<void>;
  /** 停止监听 */
  stopWatching: () => Promise<void>;
  /** 立即触发一次全量扫描 */
  scanNow: () => Promise<void>;
  /** 刷新配置 */
  refreshConfig: () => Promise<void>;
  /** 从主进程重新拉取一次 cloud_file 列表，水合到 uploadProgress（合并：保留实时进度事件中的更新） */
  refreshProgress: () => Promise<void>;
  /** 更新配置（部分字段） */
  updateConfig: (patch: Partial<CloudDriveConfig>) => Promise<void>;

  /** 重试所有失败任务，返回入队数 */
  retryFailed: () => Promise<number>;
  /** 重试单个任务 */
  retryItem: (itemId: string) => Promise<boolean>;
  /** 暂停单个任务 */
  pauseItem: (itemId: string) => Promise<boolean>;
  /** 恢复单个任务（断点续传） */
  resumeItem: (itemId: string) => Promise<boolean>;
  /** 取消/删除单个任务（含本地元数据 hardDelete） */
  cancelUpload: (itemId: string) => Promise<boolean>;
  /** 清空已完成任务（仅 UI 语义；云端副本与本地元数据不动） */
  clearCompleted: () => Promise<string[]>;

  // ─── 下载同步（第二部分） ─────────────────────────────────────────
  /** 下载进度列表（仅显示需要从云端落盘的任务） */
  downloadProgress: CloudDownloadProgress[];
  /** 上传速度（bytes/s） */
  uploadSpeedBps: Record<string, number>;
  /** 下载速度（bytes/s） */
  downloadSpeedBps: Record<string, number>;
  /** 本地可用性状态 */
  localStates: Record<string, CloudLocalAvailability>;
  /** 手动触发下载（state='pending' 的条目入队） */
  downloadFile: (itemId: string) => Promise<boolean>;
  /** 暂停下载 */
  pauseDownload: (itemId: string) => Promise<boolean>;
  /** 恢复下载（断点续传） */
  resumeDownload: (itemId: string) => Promise<boolean>;
  /** 取消下载（仅删除已下载的部分文件，状态回退为 paused；不删除元数据） */
  cancelDownload: (itemId: string) => Promise<boolean>;
  /** 重试失败下载 */
  retryDownload: (itemId: string) => Promise<boolean>;
  /** 重试所有失败下载 */
  retryAllDownloads: () => Promise<number>;
  /** 清空已完成下载（仅 UI 语义；不删除云端副本与本地文件） */
  clearCompletedDownloads: () => Promise<string[]>;
  /** 设置本地可用性（仅云端 / 本地 / 离线保留） */
  setLocalAvailability: (itemId: string, availability: CloudLocalAvailability) => Promise<boolean>;
  /** 设置整个文件夹（相对路径前缀）的本地可用性 */
  setFolderLocalAvailability: (folderPath: string, availability: CloudLocalAvailability) => Promise<number>;
  /** 打开已经落到本地的文件 */
  openLocalFile: (itemId: string) => Promise<boolean>;
  /** 打开本地目录 */
  openLocalDirectory: (folderPath: string) => Promise<boolean>;
}

export const useCloudDrive = (): UseCloudDriveReturn => {
  const [config, setConfig] = useState<CloudDriveConfig>(DEFAULT_CLOUD_DRIVE_CONFIG);
  const [isWatching, setIsWatching] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<CloudUploadProgress[]>([]);
  const [cloudItems, setCloudItems] = useState<Array<{
    id: string;
    type: 'cloud_file' | 'cloud_folder';
    payload: CloudFilePayload | CloudFolderPayload;
  }>>([]);
  const [downloadProgress, setDownloadProgress] = useState<CloudDownloadProgress[]>([]);
  const [uploadSpeedBps, setUploadSpeedBps] = useState<Record<string, number>>({});
  const [downloadSpeedBps, setDownloadSpeedBps] = useState<Record<string, number>>({});
  const [localStates, setLocalStates] = useState<Record<string, CloudLocalAvailability>>({});
  const [loading, setLoading] = useState(true);

  // 防止重复初始化
  const initializedRef = useRef(false);
  const uploadSpeedRef = useRef<Record<string, { bytes: number; ts: number }>>({});
  const downloadSpeedRef = useRef<Record<string, { bytes: number; ts: number }>>({});

  // 刷新配置
  const refreshConfig = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.getConfig) {
      setLoading(false);
      return;
    }
    try {
      const cfg = await api.cloudDrive.getConfig();
      setConfig(cfg ?? DEFAULT_CLOUD_DRIVE_CONFIG);
      if (api?.cloudDrive?.isWatching) {
        const watching = await api.cloudDrive.isWatching();
        setIsWatching(Boolean(watching));
      }
    } catch (err) {
      console.error('[useCloudDrive] 获取配置失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 水合：把主进程的 cloud_file 元数据快照合并进 uploadProgress / downloadProgress
  const refreshProgress = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.listItems) return;
    try {
      const resp = await api.cloudDrive.listItems();
      const items: Array<{
        id: string;
        type: 'cloud_file' | 'cloud_folder';
        payload: CloudFilePayload | CloudFolderPayload;
      }> = resp?.items ?? [];
      const fileItems = items.filter(
        (it): it is { id: string; type: 'cloud_file'; payload: CloudFilePayload } => it.type === 'cloud_file'
      );
      setCloudItems(items);
      setUploadProgress(prev => {
        // 主进程快照为准，但保留实时进度事件中已有的最新状态
        const snapshotMap = new Map<string, CloudUploadProgress>();
        for (const it of fileItems) {
          snapshotMap.set(it.id, filePayloadToProgress(it.id, it.payload));
        }
        const merged: CloudUploadProgress[] = [];
        for (const [id, snap] of snapshotMap) {
          const live = prev.find(p => p.file_id === id);
          merged.push(live ?? snap);
        }
        return merged;
      });
      // 下载侧水合：仅包含真正需要落盘的任务。
      // 本地已上传的文件 download_state 缺省为 'completed'，过滤掉以免把上传镜像当成下载任务；
      // 但已在实时事件中出现的 completed 条目（刚从云端下载完）要保留。
      setDownloadProgress(prev => {
        const liveIds = new Set(prev.map(p => p.file_id));
        const snapshotMap = new Map<string, CloudDownloadProgress>();
        for (const it of fileItems) {
          const dl = it.payload.download_state ?? 'pending';
          const isInteresting =
            dl === 'pending' || dl === 'downloading' || dl === 'paused' || dl === 'error' || liveIds.has(it.id);
          if (isInteresting) {
            snapshotMap.set(it.id, filePayloadToDownloadProgress(it.id, it.payload));
          }
        }
        const merged: CloudDownloadProgress[] = [];
        for (const [id, snap] of snapshotMap) {
          const live = prev.find(p => p.file_id === id);
          merged.push(live ?? snap);
        }
        return merged;
      });

      if (api?.cloudDrive?.getLocalStates) {
        const local = await api.cloudDrive.getLocalStates();
        const next: Record<string, CloudLocalAvailability> = {};
        for (const [id, state] of Object.entries(local || {})) {
          next[id] = (state as { availability?: CloudLocalAvailability }).availability || 'local';
        }
        setLocalStates(next);
      }
    } catch (err) {
      console.error('[useCloudDrive] 拉取进度列表失败:', err);
    }
  }, []);

  // 初始化：读取配置 + 水合进度 + 监听事件
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    refreshConfig();
    refreshProgress();

    // 监听上传进度（主进程通过 IPC 推送）
    const api = getElectronAPI();
    if (api?.cloudDrive?.onUploadProgress) {
      api.cloudDrive.onUploadProgress((progress: CloudUploadProgress) => {
        const now = Date.now();
        const last = uploadSpeedRef.current[progress.file_id];
        if (last && progress.uploaded_bytes >= last.bytes && now > last.ts) {
          const speed = ((progress.uploaded_bytes - last.bytes) * 1000) / (now - last.ts);
          if (Number.isFinite(speed) && speed >= 0) {
            setUploadSpeedBps(prev => ({ ...prev, [progress.file_id]: speed }));
          }
        }
        uploadSpeedRef.current[progress.file_id] = { bytes: progress.uploaded_bytes, ts: now };
        setUploadProgress(prev => {
          const idx = prev.findIndex(p => p.file_id === progress.file_id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = progress;
            return next;
          }
          return [...prev, progress];
        });
        if (progress.state === 'completed' || progress.state === 'error' || progress.state === 'paused') {
          setUploadSpeedBps(prev => ({ ...prev, [progress.file_id]: 0 }));
        }
      });
    }
    // 监听下载进度（主进程通过 IPC 推送）
    if (api?.cloudDrive?.onDownloadProgress) {
      api.cloudDrive.onDownloadProgress((progress: CloudDownloadProgress) => {
        const now = Date.now();
        const last = downloadSpeedRef.current[progress.file_id];
        if (last && progress.downloaded_bytes >= last.bytes && now > last.ts) {
          const speed = ((progress.downloaded_bytes - last.bytes) * 1000) / (now - last.ts);
          if (Number.isFinite(speed) && speed >= 0) {
            setDownloadSpeedBps(prev => ({ ...prev, [progress.file_id]: speed }));
          }
        }
        downloadSpeedRef.current[progress.file_id] = { bytes: progress.downloaded_bytes, ts: now };
        setDownloadProgress(prev => {
          const idx = prev.findIndex(p => p.file_id === progress.file_id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = progress;
            return next;
          }
          return [...prev, progress];
        });
        if (progress.state === 'completed') {
          setLocalStates(prev => {
            const current = prev[progress.file_id];
            if (current === 'offline') return prev;
            if (current === 'local') return prev;
            return { ...prev, [progress.file_id]: 'local' };
          });
        }
        if (progress.state === 'completed' || progress.state === 'error' || progress.state === 'paused') {
          setDownloadSpeedBps(prev => ({ ...prev, [progress.file_id]: 0 }));
        }
      });
    }
    if (api?.cloudDrive?.onItemsChanged) {
      api.cloudDrive.onItemsChanged(() => {
        void refreshProgress();
      });
    }
    // 监听监听状态变化
    if (api?.cloudDrive?.onWatchingChange) {
      api.cloudDrive.onWatchingChange((watching: boolean) => {
        setIsWatching(watching);
      });
    }
  }, [refreshConfig, refreshProgress]);

  useEffect(() => {
    if (!isWatching) return;
    const timer = setInterval(() => {
      void refreshProgress();
    }, 2000);
    return () => clearInterval(timer);
  }, [isWatching, refreshProgress]);

  // 选择监听根目录
  const selectWatchedFolder = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.selectWatchedFolder) {
      console.warn('[useCloudDrive] 目录选择接口未就绪');
      return;
    }
    try {
      await api.cloudDrive.selectWatchedFolder();
      await refreshConfig();
    } catch (err) {
      console.error('[useCloudDrive] 选择目录失败:', err);
    }
  }, [refreshConfig]);

  // 启动监听
  const startWatching = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.startWatching) {
      console.warn('[useCloudDrive] 启动监听接口未就绪');
      return;
    }
    try {
      await api.cloudDrive.startWatching();
      setIsWatching(true);
    } catch (err) {
      console.error('[useCloudDrive] 启动监听失败:', err);
    }
  }, []);

  // 停止监听
  const stopWatching = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.stopWatching) {
      console.warn('[useCloudDrive] 停止监听接口未就绪');
      return;
    }
    try {
      await api.cloudDrive.stopWatching();
      setIsWatching(false);
    } catch (err) {
      console.error('[useCloudDrive] 停止监听失败:', err);
    }
  }, []);

  // 立即扫描
  const scanNow = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.scanNow) {
      console.warn('[useCloudDrive] 扫描接口未就绪');
      return;
    }
    try {
      await api.cloudDrive.scanNow();
    } catch (err) {
      console.error('[useCloudDrive] 扫描失败:', err);
    }
  }, []);

  // 更新配置
  const updateConfig = useCallback(async (patch: Partial<CloudDriveConfig>) => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.updateConfig) {
      console.warn('[useCloudDrive] 更新配置接口未就绪');
      return;
    }
    try {
      const next = await api.cloudDrive.updateConfig(patch);
      setConfig(next ?? { ...config, ...patch });
    } catch (err) {
      console.error('[useCloudDrive] 更新配置失败:', err);
    }
  }, [config]);

  // ─── 层7 手动控制 ───────────────────────────────────────────────

  // 重试所有失败任务
  const retryFailed = useCallback(async (): Promise<number> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.retryFailed) {
      console.warn('[useCloudDrive] retryFailed 接口未就绪');
      return 0;
    }
    try {
      const res = await api.cloudDrive.retryFailed();
      // X1：不做乐观突变。主进程 processItem 入口会推送 'pending' 进度事件，
      // 由主进程作为唯一状态权威驱动 UI。
      return res?.enqueued ?? 0;
    } catch (err) {
      console.error('[useCloudDrive] 重试失败任务出错:', err);
      return 0;
    }
  }, []);

  // 重试单个任务
  const retryItem = useCallback(async (itemId: string): Promise<boolean> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.retryItem) return false;
    try {
      // X1：不做乐观突变。主进程 processItem 入口会推送 'pending' 进度事件。
      return await api.cloudDrive.retryItem(itemId);
    } catch (err) {
      console.error('[useCloudDrive] 重试单任务出错:', err);
      return false;
    }
  }, []);

  // 暂停单个任务
  const pauseItem = useCallback(async (itemId: string): Promise<boolean> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.pauseItem) return false;
    try {
      // X1：不做乐观突变。主进程 pauseItem 会推送 'paused' 进度事件作为权威状态。
      // （之前的乐观突变会在主进程因竞态未能真正暂停时，让 UI 显示与实际不符的 paused。）
      return await api.cloudDrive.pauseItem(itemId);
    } catch (err) {
      console.error('[useCloudDrive] 暂停任务出错:', err);
      return false;
    }
  }, []);

  // 恢复单个任务
  const resumeItem = useCallback(async (itemId: string): Promise<boolean> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.resumeItem) return false;
    try {
      // X1：不做乐观突变。主进程 processItem 入口会推送 'pending' 进度事件。
      return await api.cloudDrive.resumeItem(itemId);
    } catch (err) {
      console.error('[useCloudDrive] 恢复任务出错:', err);
      return false;
    }
  }, []);

  // 取消/删除单个任务（本地元数据 hardDelete）
  const cancelUpload = useCallback(async (itemId: string): Promise<boolean> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.cancelUpload) return false;
    try {
      const ok: boolean = await api.cloudDrive.cancelUpload(itemId);
      if (ok) {
        setUploadProgress(prev => prev.filter(p => p.file_id !== itemId));
      }
      return ok;
    } catch (err) {
      console.error('[useCloudDrive] 取消任务出错:', err);
      return false;
    }
  }, []);

  // 清空已完成任务（仅 UI 语义）
  const clearCompleted = useCallback(async (): Promise<string[]> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.clearCompleted) return [];
    try {
      const res = await api.cloudDrive.clearCompleted();
      const cleared: string[] = res?.cleared ?? [];
      if (cleared.length > 0) {
        const set = new Set(cleared);
        setUploadProgress(prev => prev.filter(p => !set.has(p.file_id)));
      }
      return cleared;
    } catch (err) {
      console.error('[useCloudDrive] 清空已完成出错:', err);
      return [];
    }
  }, []);

  // ─── 下载同步控制（第二部分） ───────────────────────────────────────

  // 手动触发下载
  const downloadFile = useCallback(async (itemId: string): Promise<boolean> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.downloadFile) return false;
    try {
      // X1：不做乐观突变。主进程 enqueueDownload 入口会推送 'pending' 进度事件。
      return await api.cloudDrive.downloadFile(itemId);
    } catch (err) {
      console.error('[useCloudDrive] 触发下载出错:', err);
      return false;
    }
  }, []);

  // 暂停下载
  const pauseDownload = useCallback(async (itemId: string): Promise<boolean> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.pauseDownload) return false;
    try {
      // X1：主进程 pauseDownload 推送 'paused' 进度事件为权威状态。
      return await api.cloudDrive.pauseDownload(itemId);
    } catch (err) {
      console.error('[useCloudDrive] 暂停下载出错:', err);
      return false;
    }
  }, []);

  // 恢复下载（断点续传）
  const resumeDownload = useCallback(async (itemId: string): Promise<boolean> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.resumeDownload) return false;
    try {
      // X1：主进程恢复后会推送 'downloading'/'pending' 进度事件。
      return await api.cloudDrive.resumeDownload(itemId);
    } catch (err) {
      console.error('[useCloudDrive] 恢复下载出错:', err);
      return false;
    }
  }, []);

  // 取消下载（仅删除已下载部分文件，状态回退 paused；不删除本地元数据）
  const cancelDownload = useCallback(async (itemId: string): Promise<boolean> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.cancelDownload) return false;
    try {
      // X1：主进程 cancelDownload 会推送 'paused' 进度事件（保留元数据、只删部分文件）。
      return await api.cloudDrive.cancelDownload(itemId);
    } catch (err) {
      console.error('[useCloudDrive] 取消下载出错:', err);
      return false;
    }
  }, []);

  // 重试失败下载
  const retryDownload = useCallback(async (itemId: string): Promise<boolean> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.retryDownload) return false;
    try {
      // X1：主进程 retryDownloadItem 入口推送 'pending' 进度事件。
      return await api.cloudDrive.retryDownload(itemId);
    } catch (err) {
      console.error('[useCloudDrive] 重试下载出错:', err);
      return false;
    }
  }, []);

  // 重试所有失败下载
  const retryAllDownloads = useCallback(async (): Promise<number> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.retryAllDownloads) {
      console.warn('[useCloudDrive] retryAllDownloads 接口未就绪');
      return 0;
    }
    try {
      const res = await api.cloudDrive.retryAllDownloads();
      return res?.enqueued ?? 0;
    } catch (err) {
      console.error('[useCloudDrive] 重试所有下载出错:', err);
      return 0;
    }
  }, []);

  // 清空已完成下载（仅 UI 语义；不删除云端副本与本地文件）
  const clearCompletedDownloads = useCallback(async (): Promise<string[]> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.clearCompletedDownloads) return [];
    try {
      const res = await api.cloudDrive.clearCompletedDownloads();
      const cleared: string[] = res?.cleared ?? [];
      if (cleared.length > 0) {
        const set = new Set(cleared);
        setDownloadProgress(prev => prev.filter(p => !set.has(p.file_id)));
      }
      return cleared;
    } catch (err) {
      console.error('[useCloudDrive] 清空已完成下载出错:', err);
      return [];
    }
  }, []);

  const setLocalAvailability = useCallback(async (
    itemId: string,
    availability: CloudLocalAvailability
  ): Promise<boolean> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.setLocalAvailability) return false;
    try {
      const ok = await api.cloudDrive.setLocalAvailability(itemId, availability);
      if (ok) {
        setLocalStates(prev => ({ ...prev, [itemId]: availability }));
      }
      return ok;
    } catch (err) {
      console.error('[useCloudDrive] 设置本地可用性失败:', err);
      return false;
    }
  }, []);

  const setFolderLocalAvailability = useCallback(async (
    folderPath: string,
    availability: CloudLocalAvailability
  ): Promise<number> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.setFolderLocalAvailability) return 0;
    try {
      const changed = await api.cloudDrive.setFolderLocalAvailability(folderPath, availability);
      await refreshProgress();
      return changed ?? 0;
    } catch (err) {
      console.error('[useCloudDrive] 设置文件夹本地可用性失败:', err);
      return 0;
    }
  }, [refreshProgress]);

  const openLocalFile = useCallback(async (itemId: string): Promise<boolean> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.openLocalFile) return false;
    try {
      return await api.cloudDrive.openLocalFile(itemId);
    } catch (err) {
      console.error('[useCloudDrive] 打开本地文件失败:', err);
      return false;
    }
  }, []);

  const openLocalDirectory = useCallback(async (folderPath: string): Promise<boolean> => {
    const api = getElectronAPI();
    if (!api?.cloudDrive?.openLocalDirectory) return false;
    try {
      return await api.cloudDrive.openLocalDirectory(folderPath);
    } catch (err) {
      console.error('[useCloudDrive] 打开本地目录失败:', err);
      return false;
    }
  }, []);

  return {
    config,
    isWatching,
    uploadProgress,
    cloudItems,
    downloadProgress,
    uploadSpeedBps,
    downloadSpeedBps,
    localStates,
    loading,
    selectWatchedFolder,
    startWatching,
    stopWatching,
    scanNow,
    refreshConfig,
    refreshProgress,
    updateConfig,
    retryFailed,
    retryItem,
    pauseItem,
    resumeItem,
    cancelUpload,
    clearCompleted,
    downloadFile,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    retryAllDownloads,
    clearCompletedDownloads,
    setLocalAvailability,
    setFolderLocalAvailability,
    openLocalFile,
    openLocalDirectory,
  };
};
