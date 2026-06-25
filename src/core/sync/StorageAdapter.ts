import { ItemBase, ItemType } from '@shared/types';

// 远端变更记录
export interface RemoteChange {
  change_id: number;
  item_id: string;
  type: ItemType;
  updated_time: number;
  deleted_time: number | null;
  content_hash: string;
}

// 远端元数据
export interface RemoteMeta {
  version: string;
  capabilities: string[];
  last_sync_time: number | null;
  key_identifier?: string;  // 加密密钥标识
}

// 同步游标
export interface SyncCursor {
  cursor: string;
  timestamp: number;
}

// 变更日志保留时间（毫秒）- 90 天
export const CHANGE_LOG_RETENTION = 90 * 24 * 60 * 60 * 1000;

// 统一的存储适配器接口
export interface StorageAdapter {
  // 连接测试
  testConnection(): Promise<boolean>;

  // 获取远端元数据
  getRemoteMeta(): Promise<RemoteMeta>;

  // 列出增量变更
  listChanges(cursor: string | null, limit?: number): Promise<{
    changes: RemoteChange[];
    nextCursor: string | null;
    hasMore: boolean;
  }>;

  // 获取单个对象
  getItem(id: string): Promise<ItemBase | null>;

  // 上传对象
  putItem(item: ItemBase): Promise<{ success: boolean; remoteRev: string; error?: string }>;

  // 删除对象（或标记删除）
  deleteItem(id: string): Promise<boolean>;

  // 获取附件
  getResource(id: string): Promise<Buffer | null>;

  // 上传附件
  putResource(id: string, data: Buffer, mimeType: string): Promise<boolean>;

  // 删除附件
  deleteResource(id: string): Promise<boolean>;

  // 获取/设置同步游标
  getSyncCursor(): Promise<SyncCursor | null>;
  setSyncCursor(cursor: SyncCursor): Promise<boolean>;

  // 获取/设置远端元数据
  putRemoteMeta(meta: RemoteMeta): Promise<boolean>;

  // ============ 分块上传（大文件 / 断点续传）============
  // 说明：这是「能力可选」接口。ServerAdapter 实现（REST）；
  // WebDAVAdapter 协议层不支持分块，仅实现 streamUploadFile 降级。
  // 调用方（CloudDriveScheduler）需先检测 hasChunkedUpload()，
  // 不支持时回退到 streamUploadFile。

  /** 是否支持分块上传（能力探测） */
  hasChunkedUpload?(): boolean;

  /**
   * 创建分块上传会话
   * @returns sessionId / 服务端最终采用的 chunkSize / totalChunks
   */
  createChunkedUpload?(params: {
    itemId: string;
    totalSize: number;
    chunkSize: number;
    extension?: string;
  }): Promise<{ sessionId: string; chunkSize: number; totalChunks: number }>;

  /**
   * 上传单个分块（幂等：重复块应返回 duplicate:true 而非报错）
   * @param data 该分块原始二进制
   * @param signal 可选的 AbortSignal：用于超时与上传任务取消（中止后 Promise 应立即 reject）
   * @param onUploadProgress 可选的字节级进度回调：分块流式发送时按累计已发送字节触发。
   *   不传时适配器可走快速路径（整块作为 body，无中途进度）。对齐 downloadFile.onProgress 语义。
   */
  uploadChunk?(params: {
    sessionId: string;
    chunkIndex: number;
    data: Buffer;
    signal?: AbortSignal;
    onUploadProgress?: (sentBytes: number) => void;
  }): Promise<{ accepted: boolean; duplicate: boolean }>;

  /** 完成上传：服务端拼接 + 校验 SHA-256 + 原子落库 */
  completeChunkedUpload?(sessionId: string): Promise<{
    success: boolean;
    size: number;
    sha256: string;
    location?: string;
  }>;

  /** 查询会话状态（用于断点续传：得知已上传的 chunk 索引） */
  getUploadStatus?(sessionId: string): Promise<{
    totalChunks: number;
    chunkSize: number;
    totalSize: number;
    uploadedChunks: number[];
    completed: boolean;
  }>;

  /** 取消/中止会话，清理服务端临时分块 */
  abortChunkedUpload?(sessionId: string): Promise<void>;

  /**
   * 非分块流式上传（降级路径，WebDAV 用）。
   * 直接从本地文件读取流式 PUT，不缓存到内存。
   * 返回最终存储位置 / sha256（如协议可计算）。
   */
  streamUploadFile?(params: {
    itemId: string;
    filePath: string; // 本地绝对路径
    size: number;
    extension?: string;
    mimeType?: string;
  }): Promise<{ success: boolean; size: number; sha256: string }>;

  // ============ Range/206 下载（大文件 / 断点续传）============
  // 说明：能力可选接口。ServerAdapter 实现（HTTP Range/206）；
  // WebDAVAdapter 协议层无 Range 语义，仅实现 downloadFile 全量降级。
  // 调用方（CloudDriveScheduler）需先检测 hasRangeDownload()，
  // 不支持时回退到 downloadFile（无 resume、<100MB 可接受）。

  /** 是否支持 Range/206 断点续传下载（能力探测） */
  hasRangeDownload?(): boolean;

  /**
   * 查询远端文件元信息（用于下载前校验大小、mtime 等）
   * @returns 文件总字节、最近 mtime、MIME（如协议可提供）
   */
  getRemoteFileInfo?(itemId: string): Promise<{
    size: number;
    mtime: number | null;
    mimeType: string | null;
  } | null>;

  /**
   * Range/206 下载：从 start 字节开始下载一段（chunk），追加写入本地文件。
   * 调用方负责决定 start（断点续传时基于本地已下载字节）和 chunkSize。
   * onProgress 回调按已接收字节累加。
   * signal 可用于取消（AbortController）。
   *
   * 返回本次实际写入的字节数（用于累加 progress）。
   */
  downloadFile?(params: {
    itemId: string;
    start: number;            // Range start（包含）
    chunkSize: number;        // 本次请求的段长（0 = 读到文件尾）
    destPath: string;         // 本地目标绝对路径
    signal?: AbortSignal;
    onProgress?: (receivedBytes: number) => void;
  }): Promise<{ bytesWritten: number }>;

  // 清理过期的变更日志
  cleanupChangeLogs?(beforeTimestamp: number): Promise<number>;

  // 检查远端是否已有数据（用于首次同步检测）
  hasExistingData?(): Promise<boolean>;

  // 全量拉取所有 item（新客户端首次同步使用，绕过变更日志）
  listAllItems?(): Promise<ItemBase[]>;

  // 检查游标是否已过期（游标对应的变更日志已被清理）
  // 返回 true 表示游标过期，需要降级到全量拉取
  isCursorExpired?(cursor: string): Promise<boolean>;

  // 密钥指纹验证
  getKeyFingerprint(): Promise<string | null>;
  saveKeyFingerprint(fingerprint: string): Promise<boolean>;
  verifyKeyFingerprint(localFingerprint: string): Promise<{ valid: boolean; remoteFingerprint: string | null }>;
}

// 适配器配置
export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  basePath?: string;
}

export interface ServerConfig {
  url: string;
  apiKey?: string;
  token?: string;
  // 传输鲁棒性可选配置（Phase 3）。未提供时由 ServerAdapter 用内置默认值。
  upload_timeout_ms?: number;            // 单次请求超时（毫秒，0 = 不限）
  upload_retry_count?: number;           // 失败额外重试次数
  upload_retry_backoff_base_ms?: number; // 指数退避基数（毫秒）
  keep_alive?: boolean;                  // 复用 TCP 连接
  max_sockets?: number;                  // 单源最大并发连接数
}

export type AdapterConfig = WebDAVConfig | ServerConfig;
