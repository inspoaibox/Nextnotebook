import { ItemBase } from '@shared/types';

// 远端变更记录
export interface RemoteChange {
  change_id: number;
  item_id: string;
  type: string;
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
  putItem(item: ItemBase): Promise<{ success: boolean; remoteRev: string }>;

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

  // 锁定（防止并发同步）
  acquireLock(deviceId: string, timeout?: number): Promise<boolean>;
  releaseLock(deviceId: string): Promise<boolean>;
  checkLock(): Promise<{ locked: boolean; owner?: string; expires?: number }>;
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
}

export type AdapterConfig = WebDAVConfig | ServerConfig;
