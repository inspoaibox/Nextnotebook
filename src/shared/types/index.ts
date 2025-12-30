// 统一 Item 模型 - 所有可同步实体的基础类型
export interface ItemBase {
  id: string;                    // UUID 全局唯一
  type: ItemType;                // 实体类型
  created_time: number;          // 创建时间戳
  updated_time: number;          // 本地最后修改时间戳
  deleted_time: number | null;   // 软删除时间（null 表示未删除）
  payload: string;               // JSON 业务字段
  content_hash: string;          // 内容哈希（用于快速比对）
  sync_status: SyncStatus;       // 同步状态
  local_rev: number;             // 本地递增版本号
  remote_rev: string | null;     // 远端版本标记（etag）
  encryption_applied: 0 | 1;     // 是否加密
  schema_version: number;        // payload 版本
}

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
  | 'ai_conversation'
  | 'ai_message';

// 待办事项四象限类型
export type TodoQuadrant = 'urgent-important' | 'not-urgent-important' | 'urgent-not-important' | 'not-urgent-not-important';

// 待办事项 payload
export interface TodoPayload {
  title: string;
  description: string;
  quadrant: TodoQuadrant;
  completed: boolean;
  completed_at: number | null;
  due_date: number | null;
  reminder_time: number | null;  // 提醒时间
  reminder_enabled: boolean;     // 是否启用提醒
  priority: number;  // 在象限内的排序
  tags: string[];
}

// 密码库条目类型
export type VaultEntryType = 'login' | 'card' | 'identity' | 'secure_note';

// 自定义字段
export interface VaultCustomField {
  id: string;
  name: string;
  value: string;
  type: 'text' | 'hidden' | 'boolean';
}

// 关联网站/URI
export interface VaultUri {
  id: string;
  name: string;
  uri: string;
  match_type: 'domain' | 'host' | 'starts_with' | 'exact' | 'regex' | 'never';
}

// TOTP 密钥
export interface VaultTotp {
  id: string;
  name: string;      // 服务名称（如 GitHub）
  account: string;   // 账户/用户名（如 aorxuck41）
  secret: string;
}

// 密码库条目 payload
export interface VaultEntryPayload {
  name: string;
  entry_type: VaultEntryType;
  folder_id: string | null;
  favorite: boolean;
  notes: string;
  // 登录类型字段
  username: string;
  password: string;
  totp_secrets: VaultTotp[];  // 多个 TOTP 密钥
  uris: VaultUri[];
  // 银行卡类型字段
  card_holder_name: string;
  card_number: string;
  card_brand: string;
  card_exp_month: string;
  card_exp_year: string;
  card_cvv: string;
  // 身份类型字段
  identity_title: string;
  identity_first_name: string;
  identity_last_name: string;
  identity_email: string;
  identity_phone: string;
  identity_address: string;
  // 自定义字段
  custom_fields: VaultCustomField[];
}

// 密码库文件夹 payload
export interface VaultFolderPayload {
  name: string;
  parent_id: string | null;
}

// 功能开关设置
export interface FeatureSettings {
  ai_enabled: boolean;
  todo_enabled: boolean;
  vault_enabled: boolean;
  bookmark_enabled: boolean;
}

// 书签 payload
export interface BookmarkPayload {
  name: string;
  url: string;
  description: string;
  folder_id: string | null;
  icon: string | null;
  tags: string[];
}

// 书签文件夹 payload
export interface BookmarkFolderPayload {
  name: string;
  parent_id: string | null;
}

// AI 对话 payload
export interface AIConversationPayload {
  title: string;
  model: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  created_at: number;
}

// AI 消息 payload
export interface AIMessagePayload {
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string;
  tokens_used?: number;
  created_at: number;
}

// AI 渠道配置
export interface AIChannel {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'custom';
  api_url: string;
  api_key: string;
  models: AIModel[];
  enabled: boolean;
}

// AI 模型
export interface AIModel {
  id: string;
  name: string;
  channel_id: string;
  max_tokens: number;
  is_custom: boolean;
}

// AI 设置
export interface AISettings {
  enabled: boolean;
  default_channel: string;
  default_model: string;
  channels: AIChannel[];
}

export type SyncStatus = 'clean' | 'modified' | 'deleted' | 'conflict';

// 笔记 payload 类型
export interface NotePayload {
  title: string;
  content: string;
  folder_id: string | null;
  is_pinned: boolean;
  is_locked: boolean;
  lock_password_hash: string | null;
  tags: string[];
}

// 文件夹 payload 类型
export interface FolderPayload {
  name: string;
  parent_id: string | null;
  icon: string | null;
  color: string | null;
}

// 标签 payload 类型
export interface TagPayload {
  name: string;
  color: string | null;
}

// 附件 payload 类型
export interface ResourcePayload {
  filename: string;
  mime_type: string;
  size: number;
  note_id: string;
  file_hash: string;
}

// 同步配置
export interface SyncConfig {
  enabled: boolean;
  type: 'webdav' | 'server';
  url: string;
  sync_path: string;  // 同步目录路径
  username?: string;
  password?: string;
  api_key?: string;
  encryption_enabled: boolean;
  sync_interval: number;  // 分钟
  last_sync_time: number | null;
  sync_cursor: string | null;
}

// 应用设置
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  font_size: number;
  auto_save: boolean;
  auto_save_interval: number;
  show_line_numbers: boolean;
  spell_check: boolean;
  auto_launch: boolean;
  close_to_tray: boolean;
}
