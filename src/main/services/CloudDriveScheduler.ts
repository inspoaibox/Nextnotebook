/**
 * CloudDriveScheduler
 * 网盘功能：去抖 + 哈希比对 + 分块上传队列（Phase1-层5）
 *
 * 四闸门之"闸门3 去抖" + "闸门4 哈希比对" 在本层完成。
 *   闸门1（awaitWriteFinish）/ 闸门2（垃圾过滤）由层4 CloudDriveService 完成。
 *
 * 上传流水线：
 *   CloudDriveService.onFileAdded/Change
 *     -> enqueue(itemId)
 *     -> 闸门3 去抖（debounce_ms）合并短时间内多次保存
 *     -> processItem(itemId)
 *     -> 闸门4 流式 SHA-256 比对：内容未变则跳过，避免重复上传
 *     -> 进入分层队列（小文件高并发 / 大文件独占）
 *     -> 能力探测：hasChunkedUpload() 走分块+续传，否则 streamUploadFile 降级
 *     -> 状态机：pending -> uploading -> completed / error
 *
 * 下载流水线（Phase 2）：
 *   SyncEngine 在 content_hash 不一致时把 download_state 置为 'pending'，
 *   CloudDriveService 调用 scanForDownloads() 后 -> enqueueDownload(itemId)
 *     -> 下载去抖（复用 debounce_ms）
 *     -> processDownloadItem(itemId)：能力探测 hasRangeDownload() 决定续传
 *     -> 下载并发队列（download_concurrency）
 *     -> runDownload: 按 download_chunk_size 循环 Range GET 写盘
 *     -> 状态机：pending -> downloading -> completed / error
 *
 * 设计要点：
 *   1. 复用 SyncService 的 currentAdapter（鉴权自包含，调用方无需关心 token）
 *   2. 大文件用流式读取 + 分块上传，避免一次性载入内存
 *   3. 断点续传：通过 getUploadStatus 得到已上传分块，只补传缺失部分
 *   4. 进度通过 CloudDriveService.emitUploadProgress 推送到渲染进程
 *   5. 下载与上传各自独立队列：同一文件可一边上传一边下载另一个
 *   6. 下载完成后对续传场景重算整文件 SHA-256 与 payload.file_hash 比对，防止拼接错位
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ItemsManager } from '@core/database';
import {
  CloudDriveConfig,
  CloudFilePayload,
  CloudUploadProgress,
  CloudUploadState,
  CloudDownloadProgress,
  CloudDownloadState,
} from '@shared/types';
import { StorageAdapter } from '@core/sync/StorageAdapter';

// ========== 模块单例 ==========
let cloudDriveScheduler: CloudDriveScheduler | null = null;

/** 小文件上限：超过此值进入"大文件独占"队列。
 *  取 chunk_size 的 2 倍作为分界（默认 8MB*2 = 16MB），
 *  既保证小文件高并发，又避免大文件相互抢占带宽。 */
function smallFileThreshold(config: CloudDriveConfig): number {
  return Math.max(config.chunk_size * 2, 4 * 1024 * 1024);
}

interface QueueTask {
  itemId: string;
  size: number;
  /** 进入队列的时间戳，用于排序（FIFO） */
  enqueuedAt: number;
}

export class CloudDriveScheduler {
  private itemsManager: ItemsManager;
  /** 配置回调：每次读取最新配置，便于运行期调整并发/去抖参数 */
  private getConfig: () => CloudDriveConfig;
  /** 进度推送回调（由 CloudDriveService 提供） */
  private emitProgress: (progress: CloudUploadProgress) => void;

  /** 闸门3：每个 itemId 的去抖定时器 */
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  /** 正在处理中（哈希计算/上传）的 itemId，避免重复入队 */
  private inFlight = new Set<string>();

  // 小文件队列：高并发
  private smallQueue: QueueTask[] = [];
  private smallRunning = 0;
  // 大文件队列：独占（同时只跑 1 个）
  private largeQueue: QueueTask[] = [];
  private largeRunning = false;

  private disposed = false;

  /**
   * 每个 itemId 的 AbortController：用于在 pause/cancel/dispose 时
   * 真正中止「正在上传中」的分块循环（C2/C3/C4 bug 根因）。
   * runUpload 开始时创建，runUpload finally 时清理。
   */
  private abortControllers = new Map<string, AbortController>();

  /**
   * 字节级上传进度节流：onUploadProgress 回调按 socket 切片（64KB）触发，
   * 频次远高于 IPC 推送所需。这里记录每个 itemId 上次推送的字节 / 时间戳，
   * 节流到 ≤ ~15fps，避免渲染进程被进度事件淹没（任务B）。
   */
  private lastUploadEmit = new Map<string, { bytes: number; ts: number }>();
  private static readonly UPLOAD_EMIT_MIN_INTERVAL_MS = 60;
  private static readonly UPLOAD_EMIT_MIN_BYTES_RATIO = 0.005; // ≥0.5% 才推送

  /**
   * resume-after-pause 竞态兜底（C2 引入）。
   * pause 触发 abort 后，runUpload 的 finally 是异步释放 inFlight 的
   * （abort 只在下一个分块循环检查点生效，当前 adapter.uploadChunk 的 HTTP
   * 请求仍会 resolve）。若用户在此窗口内点恢复，enqueue 会因 inFlight 仍在
   * 而被静默丢弃 → 文件永久卡在 paused。这里用 pendingResume 记录意图，
   * runUpload finally 释放 inFlight 后自动补一次 enqueue。
   */
  private pendingResume = new Set<string>();

  /** 中止信号被触发时抛出的错误标识，用于区分「主动中止」与「真实失败」 */
  private static readonly ABORT_REASON = 'aborted';

  // ========== Phase 2：下载队列 ==========
  /** 下载进度推送回调（由 CloudDriveService 提供） */
  private emitDownloadProgress: ((progress: CloudDownloadProgress) => void) | null = null;
  /** 闸门3（下载侧）：每个 itemId 的去抖定时器 */
  private downloadDebounceTimers = new Map<string, NodeJS.Timeout>();
  /** 正在处理中（下载）的 itemId */
  private downloadInFlight = new Set<string>();
  /** 下载并发队列（与上传分离：下载与上传互不阻塞） */
  private downloadQueue: QueueTask[] = [];
  private downloadRunning = 0;
  /** 下载侧 AbortController，用于 pause/cancel/dispose 中止在途 Range 循环 */
  private downloadAbortControllers = new Map<string, AbortController>();
  /** 下载侧 resume-after-pause 竞态兜底（与上传 pendingResume 同理） */
  private pendingDownloadResume = new Set<string>();

  /**
   * 判断某 itemId 是否已被主动中止（pause/cancel/dispose）。
   * 中止后不应再产生 error/completed 等状态推送，避免覆盖用户的 pause/cancel 决策（X1 根因）。
   */
  private isAborted(itemId: string): boolean {
    const ctrl = this.abortControllers.get(itemId);
    return !!ctrl && ctrl.signal.aborted;
  }

  /** 下载侧中止判定（独立于上传，避免下载 abort 被误判为上传 abort） */
  private isDownloadAborted(itemId: string): boolean {
    const ctrl = this.downloadAbortControllers.get(itemId);
    return !!ctrl && ctrl.signal.aborted;
  }

  constructor(
    itemsManager: ItemsManager,
    getConfig: () => CloudDriveConfig,
    emitProgress: (progress: CloudUploadProgress) => void,
    emitDownloadProgress?: (progress: CloudDownloadProgress) => void
  ) {
    this.itemsManager = itemsManager;
    this.getConfig = getConfig;
    this.emitProgress = emitProgress;
    this.emitDownloadProgress = emitDownloadProgress ?? null;
  }

  // ========== 闸门3：去抖入队 ==========

  /**
   * 由 CloudDriveService 在文件 add/change 时调用。
   * 启动/重置该文件的 debounce 定时器，到点后再进入 processItem。
   */
  enqueue(itemId: string): void {
    if (this.disposed) return;
    // 已在飞行中：等它结束后由调用方再次 enqueue 即可（这里不抢占）
    if (this.inFlight.has(itemId)) return;

    const config = this.getConfig();
    const ms = Math.max(0, config.debounce_ms | 0);

    const existing = this.debounceTimers.get(itemId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(itemId);
      // 异步处理，不阻塞定时器回调
      this.processItem(itemId).catch(err => {
        console.error(`[CloudDriveScheduler] processItem 失败: ${itemId}`, err);
      });
    }, ms);

    // 防止定时器阻止进程退出
    if (typeof timer.unref === 'function') timer.unref();
    this.debounceTimers.set(itemId, timer);
  }

  // ========== 闸门4：哈希比对 + 分层入队 ==========

  private async processItem(itemId: string): Promise<void> {
    if (this.disposed) return;
    if (this.inFlight.has(itemId)) return;

    const item = this.itemsManager.getById(itemId);
    if (!item || item.type !== 'cloud_file') return;

    let payload: CloudFilePayload;
    try {
      payload = JSON.parse(item.payload) as CloudFilePayload;
    } catch {
      console.warn(`[CloudDriveScheduler] payload 解析失败: ${itemId}`);
      return;
    }

    const config = this.getConfig();
    const root = config.watched_root_path;
    if (!root) return;

    const absPath = path.join(root, payload.relative_path);

    // 文件可能已被删除（去抖期间 unlink）
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      return;
    }

    this.inFlight.add(itemId);
    // 在进入处理流水线时即创建 AbortController，覆盖「哈希计算阶段」。
    // 此前 controller 仅在 runUpload 中创建，导致哈希计算（大文件可达数秒）期间
    // pauseItem.abortControllers.get(itemId)?.abort() 命中 undefined → no-op，
    // 于是 processItem 继续推进并把 upload_state 覆盖为 'uploading'，
    // 用户的 pause 决策被静默丢弃（呈现为「卡在上传中 0%」+ resumeItem 因状态已变
    // uploading 而早退「开始无反应」）。提前创建后 isAborted() 可正确返回 true，
    // 下面的哈希后守卫即可拦截，不再覆盖 paused。runUpload 会复用同一未中止的 controller。
    const ctrl = this.abortControllers.get(itemId);
    if (!ctrl || ctrl.signal.aborted) {
      this.abortControllers.set(itemId, new AbortController());
    }
    // X1：通知 UI 该文件已进入处理流水线（pending → uploading/completed/error）。
    // 这样 retry/resume 后渲染层无需乐观突变——主进程是唯一状态权威。
    this.emitProgressFor(itemId, payload, 'pending', 0);
    try {
      // 闸门4：流式 SHA-256 比对，内容未变则跳过上传
      const newHash = await this.computeFileHash(absPath);

      // 哈希计算是 await 点，期间用户可能 pause/cancel。
      // 若已被中止，processItem 不应再推进任何状态（避免覆盖 paused/removed）。
      if (this.isAborted(itemId)) {
        this.inFlight.delete(itemId);
        // 与 runUpload 的 finally 对齐：若用户在哈希运行期间点过 resume，
        // 此处需补 enqueue，否则恢复意图会被静默丢弃（inFlight 已 delete，
        // 但 runUpload 从未运行 → 它的 finally pendingResume 检查不会触发）。
        if (this.pendingResume.delete(itemId)) {
          this.enqueue(itemId);
        }
        return;
      }

      if (newHash === payload.file_hash) {
        // 仅“本地内容未变化”并不等于“云端已上传完成”。
        // paused / pending / error 场景下需要继续走下面的续传/重试流水线，
        // 否则会出现：
        //   - 暂停在 0% 后点恢复无反应
        //   - pending/error 项被错误标记为 completed，实际并未上传
        const cur = this.itemsManager.getById(itemId);
        let curState: string | undefined;
        try {
          curState = cur ? (JSON.parse(cur.payload) as CloudFilePayload).upload_state : undefined;
        } catch {
          /* 忽略 */
        }
        if (curState === undefined) {
          this.inFlight.delete(itemId);
          return;
        }
        if (curState === 'completed') {
          this.emitProgressFor(itemId, payload, 'completed', 0);
          this.inFlight.delete(itemId);
          return;
        }
        // 其余状态（pending/uploading/paused/error）继续向下执行：
        // 复用已有 file_hash / upload_session_id / uploaded_chunks，
        // 让 canResume 分支决定是否续传。
      }

      // 大小可能变化，重新读取
      const size = fs.statSync(absPath).size;
      const chunkSize = config.chunk_size;
      const totalChunks = chunkSize > 0 ? Math.ceil(size / chunkSize) : 1;

      // 断点续传保护：只有当文件内容发生变化（hash 不同）才重置上传会话。
      // 之前无条件把 upload_session_id 置 null + uploaded_chunks 置 []，
      // 导致 uploadChunked 里 L509 的"向服务端查询已上传分块"续传分支永远不可达——
      // 任何重试/重启都从 chunk 0 重传，表现为进度反复从 26%（约 1 个分块边界）倒退。
      // 现改为：hash 未变且已有会话 → 保留，让 uploadChunked 走续传分支只传未完成的分块。
      const prevHash = payload.file_hash as string | undefined;
      const prevSessionId = payload.upload_session_id as string | null | undefined;
      const prevUploaded = payload.uploaded_chunks as number[] | undefined;
      const prevSize = payload.size as number | undefined;
      const contentUnchanged = prevHash != null && prevHash === newHash;
      const canResume =
        contentUnchanged &&
        prevSessionId != null &&
        Array.isArray(prevUploaded) &&
        size === prevSize;

      this.updatePayload(itemId, {
        file_hash: newHash,
        size,
        chunk_size: chunkSize,
        total_chunks: totalChunks,
        upload_state: 'uploading',
        // 内容未变且有可用会话 → 保留，启用断点续传；否则从零开始
        upload_session_id: canResume ? prevSessionId! : null,
        uploaded_chunks: canResume ? prevUploaded! : [],
        error_message: null,
      });

      const task: QueueTask = { itemId, size, enqueuedAt: Date.now() };
      const threshold = smallFileThreshold(config);
      if (size <= threshold) {
        this.smallQueue.push(task);
        this.pumpSmall();
      } else {
        this.largeQueue.push(task);
        this.pumpLarge();
      }
      // 注意：inFlight 不在此处释放。它要覆盖「入队 + 实际上传」的完整
      // 生命周期（C1 bug 根因：原先在 processItem 的 finally 提前 delete，
      // 导致同一文件在 hash 计算期间可被再次 enqueue，产生重复上传竞态）。
      // 真正的释放点在 runUpload 的 finally。
    } catch (err) {
      // processItem 自身异常（如哈希计算失败）：必须释放 inFlight，
      // 否则该 itemId 永远无法再次入队。
      this.inFlight.delete(itemId);
      throw err;
    }
  }

  // ========== 分层队列调度 ==========

  private pumpSmall(): void {
    if (this.disposed) return;
    const config = this.getConfig();
    // small_file_concurrency <= 0 视为不限并发（用一个较大上限避免雪崩）
    const limit = config.small_file_concurrency > 0 ? config.small_file_concurrency : 8;
    // 任务C「排序」：小文件队列按 size 升序（短作业优先）。更小的文件先跑完，
    // 更快释放并发槽，让"文件过多"场景下多数文件尽早完成、减少尾部堆积。
    // 仅在队列长度>1时排序，避免无谓开销。enqueuedAt 作为稳定化次序键。
    if (this.smallQueue.length > 1) {
      this.smallQueue.sort(
        (a, b) => a.size - b.size || a.enqueuedAt - b.enqueuedAt
      );
    }
    while (this.smallRunning < limit && this.smallQueue.length > 0) {
      const task = this.smallQueue.shift()!;
      this.smallRunning++;
      this.runUpload(task)
        .catch(err => console.error(`[CloudDriveScheduler] 小文件上传失败: ${task.itemId}`, err))
        .finally(() => {
          this.smallRunning--;
          this.pumpSmall();
        });
    }
  }

  private pumpLarge(): void {
    if (this.disposed) return;
    if (this.largeRunning) return;
    // 大文件队列保持 FIFO（push+shift 即按 enqueuedAt 先进先出），保证公平、
    // 避免大文件之间因 size 排序导致某个早入队的大文件被长期延后。
    const task = this.largeQueue.shift();
    if (!task) return;
    this.largeRunning = true;
    this.runUpload(task)
      .catch(err => console.error(`[CloudDriveScheduler] 大文件上传失败: ${task.itemId}`, err))
      .finally(() => {
        this.largeRunning = false;
        this.pumpLarge();
      });
  }

  // ========== 单个文件上传执行 ==========

  private async runUpload(task: QueueTask): Promise<void> {
    if (this.disposed) return;
    const { itemId } = task;

    const item = this.itemsManager.getById(itemId);
    if (!item) return;
    let payload: CloudFilePayload;
    try {
      payload = JSON.parse(item.payload) as CloudFilePayload;
    } catch {
      return;
    }

    const config = this.getConfig();
    const root = config.watched_root_path;
    if (!root) return;
    const absPath = path.join(root, payload.relative_path);

    // 文件在中途被删除：标记 error（让用户感知），不改 completed
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      this.markError(itemId, payload, '文件在上传前已消失');
      return;
    }

    const adapter = this.getAdapter();
    if (!adapter) {
      this.markError(itemId, payload, '尚未建立同步连接（请先在设置中连接服务器）');
      return;
    }

    // 为本次上传创建 AbortController（C2/C3/C4）。
    // 若该 itemId 已存在 controller（理论上不应发生，因 inFlight 守卫），
    // 复用旧的——避免重复创建导致旧 controller 仍指向已被替换的循环。
    const existing = this.abortControllers.get(itemId);
    const controller = existing && !existing.signal.aborted ? existing : new AbortController();
    this.abortControllers.set(itemId, controller);
    const signal = controller.signal;

    try {
      // 有限次重试（任务C）：文件过多/网络抖动时部分分块会失败，原先一次失败即 markError。
      // 现在用配置的 upload_retry_count 做有界重试，仅在「传输类瞬时错误」上重试，
      // 指数退避（upload_retry_backoff_base_ms * 2^attempt，封顶 30s）。
      // uploadChunked/uploadStream 自带断点续传（getUploadStatus），重试不会重传已完成分块。
      const maxAttempts = Math.max(1, 1 + (config.upload_retry_count | 0));
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // 每次重试前检查中止（pause/cancel/dispose）。
        if (this.disposed || signal.aborted || this.isAborted(itemId)) {
          break;
        }
        try {
          if (adapter.hasChunkedUpload?.() === true) {
            await this.uploadChunked(adapter, itemId, payload, absPath, signal);
          } else if (adapter.streamUploadFile) {
            await this.uploadStream(adapter, itemId, payload, absPath, signal);
          } else {
            // 后端能力缺失：不可重试，直接报错。
            throw new Error('当前同步后端不支持文件上传');
          }
          lastErr = null;
          break; // 成功，跳出重试循环
        } catch (err) {
          lastErr = err;
          // 主动中止：不重试，不报错（X1：由 abort 触发方推送 paused/removed）。
          if (signal.aborted || this.isAborted(itemId) || this.disposed) {
            break;
          }
          // 不可重试的错误：哈希不一致、分块被拒、文件消失等「确定性」失败，
          // 重试也是同样的结果，直接交给下面的 markError。
          if (!this.isRetryableUploadError(err)) {
            break;
          }
          // 还有重试预算：退避后继续；否则让循环自然结束进入 markError。
          if (attempt + 1 < maxAttempts) {
            // 重试期间保持 uploading 状态（进度条停在上次位置），仅日志记录，
            // 不向 UI 推送 retry 事件——进度展示归 Task B 统一处理，避免改类型外溢。
            const attemptNo = attempt + 1;
            const errMsg = err instanceof Error ? err.message : String(err);
            console.warn(
              `[CloudDriveScheduler] 上传失败，准备第 ${attemptNo}/${maxAttempts - 1} 次重试: ${itemId}`,
              errMsg
            );
            await this.sleepBackoff(config.upload_retry_backoff_base_ms, attemptNo, signal);
            // 退避期间用户可能 pause/cancel：被中止则立即停止。
            if (signal.aborted || this.isAborted(itemId) || this.disposed) {
              break;
            }
          }
        }
      }

      // 循环结束后仍有未消费错误 → 标记 error。
      if (lastErr !== null && !signal.aborted && !this.isAborted(itemId) && !this.disposed) {
        const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
        this.markError(itemId, payload, msg);
      }
    } catch (err) {
      // 兜底：try 顶层的非上传逻辑异常（极少见，如 payload 二次读取失败）。
      if (signal.aborted || this.isAborted(itemId)) {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.markError(itemId, payload, msg);
    } finally {
      // C1：上传生命周期真正结束才释放 inFlight，使 enqueue 去重守卫生效。
      this.inFlight.delete(itemId);
      // 仅当本次上传未被中止时清理 controller（中止后 controller 可能仍被
      // cancelUpload/pauseItem 用于查询状态，统一在 finally 清理即可）。
      this.abortControllers.delete(itemId);
      // resume-after-pause 竞态兜底：若用户在 pause 的 abort 仍未退出的窗口
      // 内点过恢复，这里补一次 enqueue。
      if (this.pendingResume.delete(itemId)) {
        this.enqueue(itemId);
      }
    }
  }

  // ---------- 分块上传 + 断点续传 ----------

  private async uploadChunked(
    adapter: StorageAdapter,
    itemId: string,
    payload: CloudFilePayload,
    absPath: string,
    signal: AbortSignal
  ): Promise<void> {
    const config = this.getConfig();
    let chunkSize = payload.chunk_size > 0 ? payload.chunk_size : config.chunk_size;
    if (chunkSize <= 0) chunkSize = config.chunk_size > 0 ? config.chunk_size : payload.size;
    let totalChunks = payload.total_chunks > 0
      ? payload.total_chunks
      : Math.max(1, Math.ceil(payload.size / chunkSize));
    let progressPayload: CloudFilePayload = {
      ...payload,
      chunk_size: chunkSize,
      total_chunks: totalChunks,
    };

    // 1. 创建（或恢复）上传会话
    let sessionId = payload.upload_session_id;
    let uploadedChunks: number[] = payload.uploaded_chunks ?? [];
    const extension = path.extname(payload.filename).replace(/^\./, '') || undefined;

    if (!sessionId) {
      const created = await adapter.createChunkedUpload!({
        itemId,
        totalSize: payload.size,
        chunkSize,
        extension,
      });
      sessionId = created.sessionId;
      // 服务端可能调整 chunkSize（如对齐到更友好的边界）
      chunkSize = created.chunkSize;
      totalChunks = created.totalChunks;
      uploadedChunks = [];
      progressPayload = {
        ...progressPayload,
        upload_session_id: sessionId,
        chunk_size: chunkSize,
        total_chunks: totalChunks,
        uploaded_chunks: uploadedChunks,
      };
      this.updatePayload(itemId, {
        upload_session_id: sessionId,
        chunk_size: created.chunkSize,
        total_chunks: created.totalChunks,
        uploaded_chunks: uploadedChunks,
      });
    } else {
      // 断点续传：向服务端查询已上传分块，避免重传
      try {
        const status = await adapter.getUploadStatus!(sessionId);
        chunkSize = status.chunkSize || chunkSize;
        totalChunks = status.totalChunks || totalChunks;
        uploadedChunks = status.uploadedChunks ?? [];
        progressPayload = {
          ...progressPayload,
          upload_session_id: sessionId,
          chunk_size: chunkSize,
          total_chunks: totalChunks,
          uploaded_chunks: uploadedChunks,
        };
        this.updatePayload(itemId, {
          chunk_size: chunkSize,
          total_chunks: totalChunks,
          uploaded_chunks: uploadedChunks,
        });
        if (status.completed) {
          // 会话已完成（例如上次 complete 成功但本地状态没更新）
          // 注意：getUploadStatus 返回的字段名是 totalSize（不是 size）
          this.markCompleted(itemId, progressPayload, status.totalSize, uploadedChunks, sessionId);
          return;
        }
      } catch (err) {
        // 会话可能已过期/失效：重新创建
        console.warn(`[CloudDriveScheduler] 会话状态查询失败，重建会话: ${sessionId}`, err);
        try {
          await adapter.abortChunkedUpload!(sessionId);
        } catch {
          /* 忽略 abort 失败 */
        }
        const created = await adapter.createChunkedUpload!({
          itemId,
          totalSize: payload.size,
          chunkSize,
          extension,
        });
        sessionId = created.sessionId;
        chunkSize = created.chunkSize;
        totalChunks = created.totalChunks;
        uploadedChunks = [];
        progressPayload = {
          ...progressPayload,
          upload_session_id: sessionId,
          chunk_size: chunkSize,
          total_chunks: totalChunks,
          uploaded_chunks: uploadedChunks,
        };
        this.updatePayload(itemId, {
          upload_session_id: sessionId,
          chunk_size: chunkSize,
          uploaded_chunks: [],
          total_chunks: totalChunks,
        });
      }
    }

    // 2. 逐块上传（只传尚未完成的）
    const fd = fs.openSync(absPath, 'r');
    try {
      const uploadedSet = new Set(uploadedChunks);
      for (let i = 0; i < totalChunks; i++) {
        // C2/C3/C4：在 pause/cancel/dispose 时中止在途分块循环。
        // 抛出后由 runUpload 的 catch 识别 signal.aborted，静默退出不报错。
        if (this.disposed || signal.aborted) {
          throw new Error(CloudDriveScheduler.ABORT_REASON);
        }
        if (uploadedSet.has(i)) continue;

        const buf = Buffer.alloc(chunkSize);
        const bytesRead = fs.readSync(fd, buf, 0, chunkSize, i * chunkSize);
        const data = bytesRead < chunkSize ? buf.slice(0, bytesRead) : buf;

        // 透传 signal：pause/cancel/dispose 时让 doFetch 立即中止在途 HTTP 请求，
        // 而不是干等当前分块跑完。doFetch 内部已对 408/429/5xx/超时/网络错误做退避重试。
        //
        // onUploadProgress（B 任务核心）：分块按 64KB 切片流式发送，每片发完回调本次分块
        // 累计已发送字节。这里换算成整文件 uploaded_bytes = 之前已完成分块字节 + 本次分块已发送，
        // 上限 clamp 到 payload.size。从而使单块小文件也能呈现平滑进度（原先 0%→100% 跳变）。
        // 之前已完成分块数 = uploadedSet 大小（尚未加入 i）。
        const completedBytesBefore = uploadedSet.size * chunkSize;
        const arr = Array.from(uploadedSet).sort((a, b) => a - b);
        const res = await adapter.uploadChunk!({
          sessionId,
          chunkIndex: i,
          data,
          signal,
          onUploadProgress: (sentBytes) => {
            // 当前分块上传中：uploaded_bytes = 已完成分块字节 + 本分块已发送
            const uploadedBytes = Math.min(
              payload.size,
              completedBytesBefore + sentBytes
            );
            this.emitUploadBytesProgress(
              itemId,
              progressPayload,
              'uploading',
              uploadedBytes,
              arr,
              totalChunks
            );
          },
        });
        if (!res.accepted && !res.duplicate) {
          throw new Error(`分块 ${i} 被服务端拒绝`);
        }
        uploadedSet.add(i);
        arr.push(i);
        arr.sort((a, b) => a - b);
        this.updatePayload(itemId, { uploaded_chunks: arr });

        // 推送进度（块级：分块完成的里程碑事件）
        this.emitProgressFor(itemId, progressPayload, 'uploading', i + 1 - uploadedChunks.length, {
          uploadedChunks: arr,
          totalChunks,
        });
      }
    } finally {
      fs.closeSync(fd);
    }

    // 3. 完成上传：服务端拼接 + SHA-256 校验 + 落库
    if (this.disposed || signal.aborted) {
      throw new Error(CloudDriveScheduler.ABORT_REASON);
    }
    const completed = await adapter.completeChunkedUpload!(sessionId);
    if (!completed.success) {
      throw new Error('服务端 finalize 失败');
    }

    // 4. 校验哈希是否一致（双保险：传输块哈希 vs 完整文件哈希）
    //    H1：哈希不一致说明传输已损坏。原先仅 console.warn 后仍标记为 completed，
    //    导致用户看到"上传成功"但云端文件是坏的。改为 markError 并清理服务端会话，
    //    让用户能感知并重试。
    if (completed.sha256 && payload.file_hash && completed.sha256 !== payload.file_hash) {
      // 服务端 finalize 已落库一个损坏文件，尝试作废会话/清理（best-effort）
      try {
        await adapter.abortChunkedUpload!(sessionId);
      } catch {
        /* 忽略清理失败 */
      }
      this.markError(itemId, progressPayload, '云端文件哈希与本地不一致（传输可能损坏）');
      return;
    }

    const finalUploaded = Array.from({ length: totalChunks }, (_, i) => i);
    this.markCompleted(itemId, progressPayload, completed.size || payload.size, finalUploaded, sessionId);
  }

  // ---------- 流式上传降级（WebDAV）----------

  private async uploadStream(
    adapter: StorageAdapter,
    itemId: string,
    payload: CloudFilePayload,
    absPath: string,
    _signal: AbortSignal
  ): Promise<void> {
    const extension = path.extname(payload.filename).replace(/^\./, '') || undefined;
    const res = await adapter.streamUploadFile!({
      itemId,
      filePath: absPath,
      size: payload.size,
      extension,
      mimeType: payload.mime_type,
    });
    if (!res.success) {
      throw new Error('流式上传失败');
    }
    // WebDAV 不支持分块，状态里保留 chunk_size=0 表示"整文件单次上传"
    this.updatePayload(itemId, {
      total_chunks: 1,
      uploaded_chunks: [0],
      upload_session_id: null,
    });
    this.markCompleted(itemId, payload, res.size || payload.size, [0], null);
  }

  // ========== 状态收尾 ==========

  private markCompleted(
    itemId: string,
    payload: CloudFilePayload,
    size: number,
    uploadedChunks: number[],
    sessionId: string | null
  ): void {
    // 终态清理节流状态，避免 Map 无限增长；重试时也从全新节流起点开始
    this.lastUploadEmit.delete(itemId);
    this.updatePayload(itemId, {
      upload_state: 'completed',
      size,
      uploaded_chunks: uploadedChunks,
      upload_session_id: sessionId,
      error_message: null,
    });
    // 重新读取 payload 以反映最新 size
    const fresh = this.itemsManager.getById(itemId);
    let p = payload;
    if (fresh) {
      try {
        p = JSON.parse(fresh.payload) as CloudFilePayload;
      } catch {
        /* 用旧 payload 兜底 */
      }
    }
    this.emitProgressFor(itemId, p, 'completed', uploadedChunks.length);
  }

  /**
   * 判断上传错误是否值得重试（任务C）。
   * 只对「传输类瞬时错误」重试：网络抖动、连接重置、超时、5xx、429 等。
   * 确定性错误（哈希不一致、分块被服务端拒绝、文件不存在、后端不支持上传）
   * 重试结果不变，应直接 markError 让用户感知。
   */
  private isRetryableUploadError(err: unknown): boolean {
    if (err == null) return false;
    const msg = err instanceof Error ? err.message : String(err);
    // 主动中止信号：不重试（abort 由上层单独判定，这里兜底）。
    if (msg === CloudDriveScheduler.ABORT_REASON) return false;
    // 确定性失败关键字（与 uploadChunked/uploadStream/runUpload 中的抛出文案对齐）。
    const deterministic = [
      '不支持文件上传', // 后端能力缺失
      '分块', // "分块 N 被服务端拒绝"
      '拒绝',
      '哈希', // "云端文件哈希与本地不一致"
      '不一致',
      '消失', // "文件在上传前已消失"
      'finalize 失败',
      '413',
      'CHUNK_TOO_LARGE',
      'FILE_TOO_LARGE',
      'Payload Too Large',
      'too large',
      'duplex option',
    ];
    if (deterministic.some(k => msg.includes(k))) return false;
    // 其余（fetch reject / 超时 / "Upload chunk N failed: ..." 等）视为可重试。
    return true;
  }

  /**
   * 指数退避休眠（任务C）。
   * delay = base * 2^(attempt-1)，封顶 30s（与 ServerAdapter.backoffDelay 一致）。
   * signal 被 abort 时立即 reject，让重试循环快速退出（不消耗重试预算）。
   */
  private sleepBackoff(baseMs: number, attempt: number, signal: AbortSignal): Promise<void> {
    const cap = 30_000;
    const base = Math.max(0, baseMs | 0);
    const delay = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
    if (delay <= 0) {
      return signal.aborted ? Promise.reject(this.abortError()) : Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, delay);
      const onAbort = () => {
        clearTimeout(timer);
        reject(this.abortError());
      };
      if (signal.aborted) {
        clearTimeout(timer);
        reject(this.abortError());
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** 构造中止错误（复用 ABORT_REASON 标识，供 runUpload catch 识别） */
  private abortError(): Error {
    const e = new Error(CloudDriveScheduler.ABORT_REASON);
    return e;
  }

  private markError(itemId: string, payload: CloudFilePayload, message: string): void {
    // 终态清理节流状态（与 markCompleted 对称）
    this.lastUploadEmit.delete(itemId);
    this.updatePayload(itemId, {
      upload_state: 'error',
      error_message: message,
    });
    this.emitProgressFor(itemId, payload, 'error', 0);
    console.error(`[CloudDriveScheduler] 上传失败 ${payload.relative_path}: ${message}`);
  }

  // ========== 工具 ==========

  /** 合并更新 payload（ItemsManager.update 会做 content_hash 去重） */
  private updatePayload(itemId: string, patch: Partial<CloudFilePayload>): void {
    try {
      this.itemsManager.update(itemId, patch);
    } catch (err) {
      console.error(`[CloudDriveScheduler] 更新 payload 失败: ${itemId}`, err);
    }
  }

  /** 流式计算文件 SHA-256（支持大文件，避免一次性载入内存） */
  private computeFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /** 动态获取适配器（避免静态导入环） */
  private getAdapter(): StorageAdapter | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getSyncAdapter } = require('./SyncService') as typeof import('./SyncService');
      return getSyncAdapter();
    } catch (err) {
      console.error('[CloudDriveScheduler] 获取适配器失败:', err);
      return null;
    }
  }

  /** 构造并推送进度事件 */
  private emitProgressFor(
    itemId: string,
    payload: CloudFilePayload,
    state: CloudUploadState,
    uploadedChunkDelta: number,
    extra?: { uploadedChunks: number[]; totalChunks: number }
  ): void {
    const uploadedChunks = extra?.uploadedChunks ?? payload.uploaded_chunks ?? [];
    const totalChunks = extra?.totalChunks ?? payload.total_chunks;
    const chunkSize = payload.chunk_size > 0 ? payload.chunk_size : 1;
    const uploadedBytes = Math.min(
      payload.size,
      uploadedChunks.length * chunkSize
    );

    const progress: CloudUploadProgress = {
      file_id: itemId,
      filename: payload.filename,
      relative_path: payload.relative_path,
      size: payload.size,
      uploaded_bytes: uploadedBytes,
      uploaded_chunks: uploadedChunks.length,
      total_chunks: totalChunks,
      state,
      error_message: state === 'error' ? payload.error_message : null,
    };
    void uploadedChunkDelta;
    try {
      this.emitProgress(progress);
    } catch (err) {
      console.error('[CloudDriveScheduler] 推送进度失败:', err);
    }
  }

  /**
   * 字节级上传进度推送（B 任务核心）。
   * 与 emitProgressFor（块级）并列：emitProgressFor 在分块完成的里程碑触发，
   * 本方法在分块内部按 64KB 切片触发，使单块小文件也能呈现平滑进度。
   *
   * 节流：上传回调可能高频触发（每 64KB 一次），全部直推会造成 IPC 拥塞。
   * 采用「时间间隔 + 字节比例」双阈值：两者都不满足才跳过；满足任一则推送。
   * 这避免了「只按时间节流」导致大文件尾段长时间无事件，也避免了「只按比例节流」
   * 导致小文件事件过密。
   *
   * 完成态（uploaded_bytes 接近 size）与首事件（last 无记录）总是直推，避免漏掉
   * 关键 UI 节点。
   */
  private emitUploadBytesProgress(
    itemId: string,
    payload: CloudFilePayload,
    state: CloudUploadState,
    uploadedBytes: number,
    uploadedChunks: number[],
    totalChunks: number
  ): void {
    const now = Date.now();
    const last = this.lastUploadEmit.get(itemId);
    const confirmedBytesFloor = Math.min(
      payload.size,
      uploadedChunks.length * (payload.chunk_size > 0 ? payload.chunk_size : 1)
    );
    const rawUploadedBytes = Math.min(payload.size, uploadedBytes);
    // 进度条必须单调不回退：
    // uploadChunk 的 bodyFactory 在 retry 时会重新构造同一分块流，
    // onUploadProgress 因而会从 0 再次上报本分块 sentBytes。
    // 若直接使用 rawUploadedBytes，首块重试会把 UI 从 ~2% 拉回 ~0%，
    // 表现为“1%-2% 来回循环横条”。
    // 这里取 max(last.bytes, confirmed floor, raw bytes)，把瞬时重试折叠成“停住不退”，
    // 直到该分块真正完成并推进到下一块。
    const displayedUploadedBytes = Math.max(
      confirmedBytesFloor,
      last?.bytes ?? 0,
      rawUploadedBytes
    );
    const isComplete = displayedUploadedBytes >= payload.size;
    if (last && !isComplete) {
      const elapsed = now - last.ts;
      const byteDelta = displayedUploadedBytes - last.bytes;
      const minBytes = Math.max(
        1,
        CloudDriveScheduler.UPLOAD_EMIT_MIN_BYTES_RATIO * payload.size
      );
      // 时间够长 或 字节增量够大 才推送
      if (elapsed < CloudDriveScheduler.UPLOAD_EMIT_MIN_INTERVAL_MS && byteDelta < minBytes) {
        return;
      }
    }
    this.lastUploadEmit.set(itemId, { bytes: displayedUploadedBytes, ts: now });

    const progress: CloudUploadProgress = {
      file_id: itemId,
      filename: payload.filename,
      relative_path: payload.relative_path,
      size: payload.size,
      uploaded_bytes: displayedUploadedBytes,
      uploaded_chunks: uploadedChunks.length,
      total_chunks: totalChunks,
      state,
      error_message: state === 'error' ? payload.error_message : null,
    };
    try {
      this.emitProgress(progress);
    } catch (err) {
      console.error('[CloudDriveScheduler] 推送字节进度失败:', err);
    }
  }

  // ========== 手动控制（层7：重试 / 取消 / 暂停 / 恢复 / 清空已完成）==========

  /** 立即重试所有处于 error/pending 状态的 cloud_file（手动触发用） */
  retryAll(): void {
    const files = this.itemsManager.getByType('cloud_file');
    for (const f of files) {
      try {
        const p = JSON.parse(f.payload) as CloudFilePayload;
        if (p.upload_state === 'error' || p.upload_state === 'pending') {
          this.enqueue(f.id);
        }
      } catch {
        /* 跳过损坏 payload */
      }
    }
  }

  /** 重试单个文件（仅当其处于 error/pending）。返回是否成功入队。 */
  retryItem(itemId: string): boolean {
    const item = this.itemsManager.getById(itemId);
    if (!item) return false;
    try {
      const p = JSON.parse(item.payload) as CloudFilePayload;
      if (p.upload_state !== 'error' && p.upload_state !== 'pending') {
        return false;
      }
    } catch {
      return false;
    }
    this.enqueue(itemId);
    return true;
  }

  /** 暂停单个文件的上传：清去抖定时器 + 移出队列 + 中止在途分块 + 标记 paused。
   *  已完成分块由断点续传保留，下一轮恢复可续传（C2：原先无法中止在途上传）。 */
  pauseItem(itemId: string): boolean {
    // 1. 清去抖定时器
    const t = this.debounceTimers.get(itemId);
    if (t) {
      clearTimeout(t);
      this.debounceTimers.delete(itemId);
    }
    // 2. 从队列移除
    this.smallQueue = this.smallQueue.filter(t => t.itemId !== itemId);
    this.largeQueue = this.largeQueue.filter(t => t.itemId !== itemId);
    // 3. 中止在途分块上传（C2）。runUpload 的 catch 会识别 signal.aborted 静默退出，
    //    不再推送 error/completed，避免覆盖下面设置的 paused 状态。
    this.abortControllers.get(itemId)?.abort();
    // 4. 标记 payload 为 paused（仅当当前不是 completed）
    const item = this.itemsManager.getById(itemId);
    if (!item) return false;
    try {
      const p = JSON.parse(item.payload) as CloudFilePayload;
      if (p.upload_state === 'completed') return false;
      this.updatePayload(itemId, { upload_state: 'paused', error_message: null });
      this.emitProgressFor(itemId, { ...p, upload_state: 'paused' }, 'paused', 0);
      return true;
    } catch {
      return false;
    }
  }

  /** 恢复单个文件（paused/pending/error 均可重新入队） */
  resumeItem(itemId: string): boolean {
    const item = this.itemsManager.getById(itemId);
    if (!item) return false;
    try {
      const p = JSON.parse(item.payload) as CloudFilePayload;
      if (p.upload_state === 'completed' || p.upload_state === 'uploading') {
        return false;
      }
    } catch {
      return false;
    }
    // 若仍在飞行中（pause 的 abort 还没让 runUpload 退出），记录恢复意图，
    // 由 runUpload finally 释放 inFlight 后自动补 enqueue（避免静默丢弃）。
    if (this.inFlight.has(itemId)) {
      this.pendingResume.add(itemId);
      return true;
    }
    this.enqueue(itemId);
    return true;
  }

  /**
   * 取消单个文件上传：
   *   1. 清去抖定时器、移出队列、从 inFlight 移除
   *   2. 通知服务端作废上传会话（best-effort）
   *   3. 硬删除本地 Item（彻底移除该上传记录，不等保留期）
   * 返回是否成功处理（即使 abort 失败也算成功，只要本地记录被清理）。
   */
  cancelUpload(itemId: string): boolean {
    // 1. 清去抖定时器
    const t = this.debounceTimers.get(itemId);
    if (t) {
      clearTimeout(t);
      this.debounceTimers.delete(itemId);
    }
    // 2. 移出队列
    this.smallQueue = this.smallQueue.filter(t => t.itemId !== itemId);
    this.largeQueue = this.largeQueue.filter(t => t.itemId !== itemId);
    // 3. 中止在途分块上传（C3）。必须在 abortChunkedUpload 之前触发，使正在
    //    循环的 runUpload 尽快退出，避免其后再写入 payload。
    this.abortControllers.get(itemId)?.abort();
    // 4. 取消正在上传的会话（best-effort，不 await，避免阻塞 IPC）
    const item = this.itemsManager.getById(itemId);
    if (item) {
      let sessionId: string | null = null;
      try {
        const p = JSON.parse(item.payload) as CloudFilePayload;
        sessionId = p.upload_session_id ?? null;
      } catch {
        /* 忽略 */
      }
      if (sessionId) {
        const adapter = this.getAdapter();
        if (adapter?.abortChunkedUpload) {
          adapter.abortChunkedUpload(sessionId).catch(err => {
            console.warn(`[CloudDriveScheduler] abortChunkedUpload(${sessionId}) 失败:`, err);
          });
        }
      }
    }
    // 5. 硬删除本地记录
    const ok = this.itemsManager.hardDelete(itemId);
    // 6. 从 inFlight 移除（允许未来同 ID 重新入队；但因 hardDelete 后 Item 不存在，实际不会发生）
    this.inFlight.delete(itemId);
    return ok;
  }

  /**
   * 本地文件系统删除专用：停止该 item 的上传流水线，但保留本地 Item。
   * 后续由 CloudDriveService.softDeleteCloudItem 写入 tombstone，并通过 SyncEngine
   * 推送到服务端。不能复用 cancelUpload，因为 cancelUpload 会 hardDelete 本地记录，
   * 导致删除状态无法同步给其他端/服务端。
   */
  discardUploadForLocalDelete(itemId: string): void {
    const t = this.debounceTimers.get(itemId);
    if (t) {
      clearTimeout(t);
      this.debounceTimers.delete(itemId);
    }
    this.smallQueue = this.smallQueue.filter(task => task.itemId !== itemId);
    this.largeQueue = this.largeQueue.filter(task => task.itemId !== itemId);
    this.pendingResume.delete(itemId);
    this.lastUploadEmit.delete(itemId);

    this.abortControllers.get(itemId)?.abort();

    const item = this.itemsManager.getById(itemId);
    if (!item || item.type !== 'cloud_file') return;

    let sessionId: string | null = null;
    try {
      const p = JSON.parse(item.payload) as CloudFilePayload;
      sessionId = p.upload_session_id ?? null;
    } catch {
      /* 忽略损坏 payload，软删除仍由上层继续处理 */
    }

    if (sessionId) {
      const adapter = this.getAdapter();
      if (adapter?.abortChunkedUpload) {
        adapter.abortChunkedUpload(sessionId).catch(err => {
          console.warn(`[CloudDriveScheduler] abortChunkedUpload(${sessionId}) 失败:`, err);
        });
      }
    }
  }

  /**
   * 清空"已完成"的上传记录。
   * 已完成文件本身是合法云端对象，不应删除云端副本，也不应硬删除本地元数据
   * （元数据是同步依据）。这里仅"清空 UI 进度列表"语义：
   * 将 upload_state='completed' 的项的 payload 精简（保留同步必要字段），
   * 返回被清空的 itemId 列表，由渲染层从进度列表移除。
   */
  clearCompleted(): string[] {
    const cleared: string[] = [];
    const files = this.itemsManager.getByType('cloud_file');
    for (const f of files) {
      try {
        const p = JSON.parse(f.payload) as CloudFilePayload;
        if (p.upload_state === 'completed') {
          cleared.push(f.id);
        }
      } catch {
        /* 跳过 */
      }
    }
    return cleared;
  }

  // ========== Phase 2：下载流水线 ==========

  /**
   * 由 CloudDriveService（SyncEngine 拉到远端 cloud_file 变更后）调用。
   * 启动/重置该文件的下载去抖定时器，到点后进入 processDownloadItem。
   */
  enqueueDownload(itemId: string): void {
    if (this.disposed) return;
    if (this.downloadInFlight.has(itemId)) return;

    const config = this.getConfig();
    // 下载去抖复用 debounce_ms：避免 sync 期间短时间内多次变更重复入队
    const ms = Math.max(0, config.debounce_ms | 0);

    const existing = this.downloadDebounceTimers.get(itemId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.downloadDebounceTimers.delete(itemId);
      this.processDownloadItem(itemId).catch(err => {
        console.error(`[CloudDriveScheduler] processDownloadItem 失败: ${itemId}`, err);
      });
    }, ms);

    if (typeof timer.unref === 'function') timer.unref();
    this.downloadDebounceTimers.set(itemId, timer);
  }

  private async processDownloadItem(itemId: string): Promise<void> {
    if (this.disposed) return;
    if (this.downloadInFlight.has(itemId)) return;

    const item = this.itemsManager.getById(itemId);
    if (!item || item.type !== 'cloud_file') return;

    let payload: CloudFilePayload;
    try {
      payload = JSON.parse(item.payload) as CloudFilePayload;
    } catch {
      console.warn(`[CloudDriveScheduler] 下载侧 payload 解析失败: ${itemId}`);
      return;
    }

    // download_state 非 pending/error/paused 时不应进入下载（completed/uploading 等）
    if (
      payload.download_state !== 'pending' &&
      payload.download_state !== 'error' &&
      payload.download_state !== 'paused'
    ) {
      return;
    }

    const config = this.getConfig();
    const root = config.watched_root_path;
    if (!root) return;

    // 已下载完成且 hash 匹配：补齐 completed 状态后跳过
    const absPath = path.join(root, payload.relative_path);
    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
      try {
        const existingHash = await this.computeFileHash(absPath);
        if (existingHash === payload.file_hash) {
          this.markDownloadCompleted(itemId, payload, payload.size);
          return;
        }
      } catch {
        /* 已存在但哈希失败：继续下载（可能截断），下方逻辑会重置 */
      }
    }

    this.downloadInFlight.add(itemId);
    this.emitDownloadProgressFor(itemId, payload, 'pending', payload.downloaded_size ?? 0);
    try {
      // 重新设置状态为 pending（清掉 error），记录尺寸用于排队
      const size = payload.size > 0 ? payload.size : 0;
      this.updatePayload(itemId, {
        download_state: 'pending',
        download_error: null,
      });
      const task: QueueTask = { itemId, size, enqueuedAt: Date.now() };
      this.downloadQueue.push(task);
      this.pumpDownload();
      // inFlight 不在此处释放；真正释放点在 runDownload 的 finally（与上传同理）
    } catch (err) {
      this.downloadInFlight.delete(itemId);
      throw err;
    }
  }

  private pumpDownload(): void {
    if (this.disposed) return;
    const config = this.getConfig();
    const limit = config.download_concurrency > 0 ? config.download_concurrency : 2;
    while (this.downloadRunning < limit && this.downloadQueue.length > 0) {
      const task = this.downloadQueue.shift()!;
      this.downloadRunning++;
      this.runDownload(task)
        .catch(err => console.error(`[CloudDriveScheduler] 下载失败: ${task.itemId}`, err))
        .finally(() => {
          this.downloadRunning--;
          this.pumpDownload();
        });
    }
  }

  private async runDownload(task: QueueTask): Promise<void> {
    if (this.disposed) return;
    const { itemId } = task;

    const item = this.itemsManager.getById(itemId);
    if (!item) return;
    let payload: CloudFilePayload;
    try {
      payload = JSON.parse(item.payload) as CloudFilePayload;
    } catch {
      return;
    }

    const config = this.getConfig();
    const root = config.watched_root_path;
    if (!root) return;
    const absPath = path.join(root, payload.relative_path);

    const adapter = this.getAdapter();
    if (!adapter || !adapter.downloadFile) {
      this.markDownloadError(itemId, payload, '尚未建立同步连接或当前后端不支持下载');
      return;
    }

    // 目标目录可能尚未创建（远端新建的深层目录）
    try {
      const dir = path.dirname(absPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      this.markDownloadError(itemId, payload, `创建目标目录失败: ${(err as Error).message}`);
      return;
    }

    // 续传起点：已下载字节数。仅在适配器支持 Range 时复用，否则从 0 开始
    const supportsRange = adapter.hasRangeDownload?.() === true;
    let startOffset = 0;
    if (supportsRange && payload.downloaded_size > 0 && fs.existsSync(absPath)) {
      try {
        const stat = fs.statSync(absPath);
        if (stat.isFile() && stat.size === payload.downloaded_size) {
          startOffset = payload.downloaded_size;
        } else {
          // 本地尺寸与记录不一致：放弃续传，从头来过
          startOffset = 0;
        }
      } catch {
        startOffset = 0;
      }
    }
    const chunkSize = config.download_chunk_size > 0 ? config.download_chunk_size : 8 * 1024 * 1024;

    const existing = this.downloadAbortControllers.get(itemId);
    const controller =
      existing && !existing.signal.aborted ? existing : new AbortController();
    this.downloadAbortControllers.set(itemId, controller);
    const signal = controller.signal;

    // 标记为 downloading
    this.updatePayload(itemId, {
      download_state: 'downloading',
      download_error: null,
    });
    payload = { ...payload, download_state: 'downloading', download_error: null };
    this.emitDownloadProgressFor(itemId, payload, 'downloading', startOffset);

    try {
      let written = startOffset;
      const total = payload.size > 0 ? payload.size : 0;
      // 下载循环：按 chunkSize 推进，直至达到 total；total 未知（0）时按单次下载
      // 由 adapter 决定实际行为（Range 适配器返回 bytesWritten；非 Range 适配器一次性写完）
      if (supportsRange && total > 0) {
        while (written < total) {
          if (this.disposed || signal.aborted) {
            throw new Error(CloudDriveScheduler.ABORT_REASON);
          }
          const res = await adapter.downloadFile({
            itemId,
            start: written,
            chunkSize,
            destPath: absPath,
            signal,
            onProgress: (delta: number) => {
              // delta 是本次分块累计写入字节数；用于实时进度推送
              this.emitDownloadProgressFor(
                itemId,
                payload,
                'downloading',
                Math.min(total, written + delta)
              );
            },
          });
          written += res.bytesWritten;
          // 持久化进度，便于崩溃后恢复续传
          this.updatePayload(itemId, { downloaded_size: written });
          this.emitDownloadProgressFor(
            itemId,
            payload,
            'downloading',
            Math.min(total, written)
          );
        }
      } else {
        // 非 Range 后端：整文件下载（chunkSize=0 表示一次性）
        // 续传场景下 startOffset>0 但适配器不支持 Range，需先截断本地文件再从头下载
        if (startOffset > 0) {
          try {
            fs.truncateSync(absPath, 0);
          } catch {
            /* 忽略截断失败 */
          }
          this.updatePayload(itemId, { downloaded_size: 0 });
          written = 0;
        }
        const res = await adapter.downloadFile({
          itemId,
          start: 0,
          chunkSize: 0,
          destPath: absPath,
          signal,
          onProgress: (delta: number) => {
            this.emitDownloadProgressFor(itemId, payload, 'downloading', written + delta);
          },
        });
        written += res.bytesWritten;
        this.updatePayload(itemId, { downloaded_size: written });
      }

      if (this.disposed || signal.aborted) {
        throw new Error(CloudDriveScheduler.ABORT_REASON);
      }

      // 续传或下载完成后必须重算整文件 SHA-256，与 payload.file_hash 比对，
      // 防止分块拼接错位或 Range 边界偏差导致文件损坏
      if (payload.file_hash) {
        const finalHash = await this.computeFileHash(absPath);
        if (finalHash !== payload.file_hash) {
          // 损坏：重置进度让用户能重试（整文件重下，因无法定位损坏分块）
          this.updatePayload(itemId, { downloaded_size: 0 });
          this.markDownloadError(itemId, payload, '下载文件哈希与云端不一致（传输可能损坏），请重试');
          return;
        }
      }
      this.markDownloadCompleted(itemId, payload, written);
    } catch (err) {
      if (signal.aborted || this.isDownloadAborted(itemId)) {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.markDownloadError(itemId, payload, msg);
    } finally {
      this.downloadInFlight.delete(itemId);
      this.downloadAbortControllers.delete(itemId);
      if (this.pendingDownloadResume.delete(itemId)) {
        this.enqueueDownload(itemId);
      }
    }
  }

  private markDownloadCompleted(
    itemId: string,
    payload: CloudFilePayload,
    size: number
  ): void {
    this.updatePayload(itemId, {
      download_state: 'completed',
      downloaded_size: size,
      downloaded_at: Date.now(),
      download_error: null,
    });
    const fresh = this.itemsManager.getById(itemId);
    let p = payload;
    if (fresh) {
      try {
        p = JSON.parse(fresh.payload) as CloudFilePayload;
      } catch {
        /* 用旧 payload 兜底 */
      }
    }
    this.emitDownloadProgressFor(itemId, p, 'completed', p.size || size);
  }

  private markDownloadError(
    itemId: string,
    payload: CloudFilePayload,
    message: string
  ): void {
    this.updatePayload(itemId, {
      download_state: 'error',
      download_error: message,
    });
    this.emitDownloadProgressFor(
      itemId,
      { ...payload, download_state: 'error', download_error: message },
      'error',
      payload.downloaded_size ?? 0
    );
    console.error(`[CloudDriveScheduler] 下载失败 ${payload.relative_path}: ${message}`);
  }

  private emitDownloadProgressFor(
    itemId: string,
    payload: CloudFilePayload,
    state: CloudDownloadState,
    downloadedBytes: number
  ): void {
    if (!this.emitDownloadProgress) return;
    const progress: CloudDownloadProgress = {
      file_id: itemId,
      filename: payload.filename,
      relative_path: payload.relative_path,
      size: payload.size,
      downloaded_bytes: Math.min(payload.size || downloadedBytes, downloadedBytes),
      state,
      error_message: state === 'error' ? payload.download_error : null,
    };
    try {
      this.emitDownloadProgress(progress);
    } catch (err) {
      console.error('[CloudDriveScheduler] 推送下载进度失败', err);
    }
  }

  /**
   * 扫描所有 cloud_file，把 download_state === 'pending' 的入队；
   * 若配置 auto_download=true，则 error/paused 也尝试自动恢复。
   * 由 CloudDriveService 在每次 sync 拉取后调用。
   *
   * 关闭自动下载（auto_download=false）时整体跳过：仅同步元数据，物理文件由用户手动触发
   * （retryDownloadItem 不受此开关限制，用户显式重试仍可下载）。
   */
  scanForDownloads(): void {
    if (this.disposed) return;
    const config = this.getConfig();
    const auto = config.auto_download === true;
    if (!auto) return;
    const files = this.itemsManager.getByType('cloud_file');
    for (const f of files) {
      try {
        const p = JSON.parse(f.payload) as CloudFilePayload;
        if (
          p.download_state === 'pending' ||
          p.download_state === 'error' ||
          p.download_state === 'paused'
        ) {
          this.enqueueDownload(f.id);
        }
      } catch {
        /* 跳过损坏 payload */
      }
    }
  }

  /** 重试单个文件下载（仅当 error/pending） */
  retryDownloadItem(itemId: string): boolean {
    const item = this.itemsManager.getById(itemId);
    if (!item) return false;
    try {
      const p = JSON.parse(item.payload) as CloudFilePayload;
      if (p.download_state !== 'error' && p.download_state !== 'pending') {
        return false;
      }
    } catch {
      return false;
    }
    this.enqueueDownload(itemId);
    return true;
  }

  /** 暂停下载：清去抖定时器 + 移出队列 + 中止在途 Range 循环 + 标记 paused */
  pauseDownload(itemId: string): boolean {
    const t = this.downloadDebounceTimers.get(itemId);
    if (t) {
      clearTimeout(t);
      this.downloadDebounceTimers.delete(itemId);
    }
    this.downloadQueue = this.downloadQueue.filter(t => t.itemId !== itemId);
    this.downloadAbortControllers.get(itemId)?.abort();
    const item = this.itemsManager.getById(itemId);
    if (!item) return false;
    try {
      const p = JSON.parse(item.payload) as CloudFilePayload;
      if (p.download_state === 'completed') return false;
      this.updatePayload(itemId, { download_state: 'paused', download_error: null });
      this.emitDownloadProgressFor(
        itemId,
        { ...p, download_state: 'paused' },
        'paused',
        p.downloaded_size ?? 0
      );
      return true;
    } catch {
      return false;
    }
  }

  /** 恢复下载（paused/pending/error 均可重新入队） */
  resumeDownload(itemId: string): boolean {
    const item = this.itemsManager.getById(itemId);
    if (!item) return false;
    try {
      const p = JSON.parse(item.payload) as CloudFilePayload;
      if (p.download_state === 'completed' || p.download_state === 'downloading') {
        return false;
      }
    } catch {
      return false;
    }
    if (this.downloadInFlight.has(itemId)) {
      this.pendingDownloadResume.add(itemId);
      return true;
    }
    this.enqueueDownload(itemId);
    return true;
  }

  /**
   * 取消下载：
   *   1. 清去抖定时器、移出队列、中止在途下载
   *   2. 清理已下载的部分文件（best-effort）
   *   3. 重置 downloaded_size/download_error，保留 Item（与上传 cancelUpload 不同：
   *      下载记录是 sync 元数据，不应硬删除，否则下次 sync 又会重建）
   */
  cancelDownload(itemId: string): boolean {
    const t = this.downloadDebounceTimers.get(itemId);
    if (t) {
      clearTimeout(t);
      this.downloadDebounceTimers.delete(itemId);
    }
    this.downloadQueue = this.downloadQueue.filter(t => t.itemId !== itemId);
    this.downloadAbortControllers.get(itemId)?.abort();

    const item = this.itemsManager.getById(itemId);
    let absPath: string | null = null;
    if (item) {
      try {
        const p = JSON.parse(item.payload) as CloudFilePayload;
        absPath = path.join(this.getConfig().watched_root_path ?? '', p.relative_path);
      } catch {
        /* 忽略 */
      }
    }
    // 删除部分下载的文件
    if (absPath) {
      try {
        if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
          fs.unlinkSync(absPath);
        }
      } catch (err) {
        console.warn(`[CloudDriveScheduler] 删除部分下载文件失败: ${absPath}`, err);
      }
    }
    this.updatePayload(itemId, {
      download_state: 'paused',
      downloaded_size: 0,
      download_error: null,
    });
    this.downloadInFlight.delete(itemId);
    return true;
  }

  /** 重试所有 download_state==='error' 的 cloud_file（手动触发用） */
  retryAllDownloads(): void {
    const files = this.itemsManager.getByType('cloud_file');
    for (const f of files) {
      try {
        const p = JSON.parse(f.payload) as CloudFilePayload;
        if (p.download_state === 'error') {
          this.enqueueDownload(f.id);
        }
      } catch {
        /* 跳过 */
      }
    }
  }

  /** 清空已完成下载列表（仅返回 itemId 列表，由渲染层移除进度项） */
  clearCompletedDownloads(): string[] {
    const cleared: string[] = [];
    const files = this.itemsManager.getByType('cloud_file');
    for (const f of files) {
      try {
        const p = JSON.parse(f.payload) as CloudFilePayload;
        if (p.download_state === 'completed') {
          cleared.push(f.id);
        }
      } catch {
        /* 跳过 */
      }
    }
    return cleared;
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.smallQueue = [];
    this.largeQueue = [];
    // C4：中止所有在途上传，使 runUpload 循环尽快退出。
    // 注意：这里不清理 abortControllers map，因为 runUpload 的 finally 会负责清理；
    // 对于 dispose 后才进入 finally 的，控制器已 abort，delete 无副作用。
    for (const ctrl of this.abortControllers.values()) {
      ctrl.abort();
    }
    this.inFlight.clear();

    // Phase 2：下载侧同样清理
    for (const timer of this.downloadDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.downloadDebounceTimers.clear();
    this.downloadQueue = [];
    for (const ctrl of this.downloadAbortControllers.values()) {
      ctrl.abort();
    }
    this.downloadInFlight.clear();
    this.pendingDownloadResume.clear();
  }
}

// ========== 模块级导出（单例）==========

export function initializeCloudDriveScheduler(): void {
  if (cloudDriveScheduler) return;
  let itemsManager: ItemsManager;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getItemsManager } = require('./DatabaseService') as typeof import('./DatabaseService');
    itemsManager = getItemsManager();
  } catch (err) {
    console.error('[CloudDriveScheduler] 初始化失败：数据库未就绪', err);
    throw err;
  }

  // 通过动态 require 获取 CloudDriveService（避免静态导入环）
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getCloudDriveService } = require('./CloudDriveService') as typeof import('./CloudDriveService');

  const getConfig = () => {
    const svc = getCloudDriveService();
    return svc ? svc.getConfig() : ({} as CloudDriveConfig);
  };
  const emitProgress = (progress: CloudUploadProgress) => {
    getCloudDriveService()?.emitUploadProgress(progress);
  };
  // 下载进度回调：CloudDriveService 在 P2-4 中提供 emitDownloadProgress 方法
  const emitDownloadProgress = (progress: CloudDownloadProgress) => {
    getCloudDriveService()?.emitDownloadProgress(progress);
  };

  cloudDriveScheduler = new CloudDriveScheduler(itemsManager, getConfig, emitProgress, emitDownloadProgress);
  console.log('[CloudDriveScheduler] 已初始化');
}

export function getCloudDriveScheduler(): CloudDriveScheduler | null {
  return cloudDriveScheduler;
}

export function stopCloudDriveScheduler(): void {
  if (cloudDriveScheduler) {
    cloudDriveScheduler.dispose();
    cloudDriveScheduler = null;
    console.log('[CloudDriveScheduler] 已停止');
  }
}
