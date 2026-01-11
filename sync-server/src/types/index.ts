// 数据项类型 - 与客户端 ItemType 完全一致
export type ItemType = 
  | 'note'
  | 'folder'
  | 'tag'
  | 'resource'
  | 'todo'
  | 'vault_entry'
  | 'vault_folder'
  | 'bookmark'
  | 'bookmark_folder'
  | 'diagram'
  | 'ai_config'
  | 'ai_conversation'
  | 'ai_message';

// 同步状态 - 与客户端 SyncStatus 完全一致
export type SyncStatus = 'clean' | 'modified' | 'deleted' | 'conflict';

// 数据项基础结构 - 与客户端 ItemBase 完全一致
export interface ItemBase {
  id: string;
  type: ItemType;
  created_time: number;
  updated_time: number;
  deleted_time: number | null;
  payload: string;
  content_hash: string;
  sync_status: SyncStatus;
  local_rev: number;
  remote_rev: string | null;
  encryption_applied: 0 | 1;
  schema_version: number;
}

// 变更记录 - 与客户端 RemoteChange 一致
export interface RemoteChange {
  change_id: number;
  item_id: string;
  type: ItemType;
  updated_time: number;
  deleted_time: number | null;
  content_hash: string;
}

// 服务器元数据
export interface RemoteMeta {
  version: string;
  capabilities: string[];
  last_sync_time: number | null;
}

// 同步游标
export interface SyncCursor {
  cursor: string;
  updated_at: number;
}

// 变更列表响应
export interface ChangeListResult {
  changes: RemoteChange[];
  nextCursor: string | null;
  hasMore: boolean;
}

// 批量操作结果
export interface BatchResult {
  success: boolean;
  results: Array<{ id: string; remoteRev: string }>;
}

// 计数结果
export interface CountResult {
  hasData: boolean;
  itemCount: number;
  byType: Record<string, number>;
}

// 存储统计
export interface StorageStats {
  used: number;
  total: number;
  itemCount: number;
}

// 服务器状态
export interface ServerStatus {
  healthy: boolean;
  version: string;
  uptime: number;
  storage: StorageStats;
}

// 用户角色
export type UserRole = 'user' | 'admin';

// 用户状态
export type UserStatus = 'active' | 'disabled';

// 认证方式
export type AuthMethod = 'apiKey' | 'jwt';

// 用户实体
export interface User {
  id: string;
  username: string;
  password_hash: string;
  sync_key_fingerprint: string;
  role: UserRole;
  status: UserStatus;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

// 用户信息（不含敏感数据）
export interface UserInfo {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  created_at: number;
  last_login_at: number | null;
}

// 会话实体
export interface Session {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  device_info: string | null;
  ip_address: string | null;
  created_at: number;
  expires_at: number;
  revoked: number;
}

// 审计日志动作类型
export type AuditAction = 
  | 'register'
  | 'login'
  | 'logout'
  | 'logout_all'
  | 'password_change'
  | 'sync_key_change'
  | 'user_disable'
  | 'user_enable'
  | 'user_delete'
  | 'token_refresh'
  | 'admin_action';

// 审计日志实体
export interface AuditLog {
  id: string;
  user_id: string | null;
  action: AuditAction;
  ip_address: string;
  user_agent: string | null;
  details: string | null;
  success: number;
  timestamp: number;
}

// 频率限制实体
export interface RateLimit {
  key: string;
  count: number;
  window_start: number;
  blocked_until: number | null;
}

// 登录结果
export interface LoginResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: UserInfo;
  error?: string;
  errorCode?: string;
}

// 注册结果
export interface RegisterResult {
  success: boolean;
  userId?: string;
  isAdmin?: boolean;
  error?: string;
  errorCode?: string;
}

// 令牌对
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// 访问令牌载荷
export interface AccessTokenPayload {
  sub: string;           // 用户ID
  sid: string;           // 会话ID
  skf: string;           // 同步密钥指纹
  role: UserRole;        // 用户角色
  iat: number;           // 签发时间
  exp: number;           // 过期时间
}

// 刷新令牌载荷
export interface RefreshTokenPayload {
  sub: string;           // 用户ID
  sid: string;           // 会话ID
  tid: string;           // 令牌ID
  iat: number;           // 签发时间
  exp: number;           // 过期时间
}

// 错误响应
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// 用户列表结果
export interface UserListResult {
  users: UserInfo[];
  total: number;
  page: number;
  limit: number;
}

// 审计日志查询结果
export interface AuditLogResult {
  logs: AuditLog[];
  total: number;
}

// Express 请求扩展
declare global {
  namespace Express {
    interface Request {
      apiKeyHash?: string;           // 现有：API Key 哈希
      userId?: string;               // 新增：用户ID
      sessionId?: string;            // 新增：会话ID
      userRole?: UserRole;           // 新增：用户角色
      syncKeyFingerprint?: string;   // 新增：同步密钥指纹
      authMethod?: AuthMethod;       // 新增：认证方式
    }
  }
}
