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
  | 'ai_config'
  | 'ai_conversation'
  | 'ai_message'
  | 'excel_note'
  | 'cloud_file'      // 网盘文件
  | 'cloud_folder';   // 网盘文件夹

// 图表类型
export type DiagramType = 'mindmap' | 'flowchart' | 'whiteboard';

// 图表 payload
export interface DiagramPayload {
  name: string;
  diagram_type: DiagramType;
  data: string;  // JSON 格式的图表数据
  thumbnail: string | null;  // 缩略图 base64
  folder_id: string | null;
}

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
  toolbox_enabled: boolean;
  diagram_enabled: boolean;
  transfer_enabled: boolean;
  excel_enabled: boolean;
  cloud_drive_enabled: boolean;  // 网盘
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
  channel_id?: string;  // 渠道 ID（解决不同渠道有相同模型 ID 的问题）
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  created_at: number;
  web_search_enabled?: boolean; // 是否启用联网搜索
}

// AI 消息 payload
export interface AIMessagePayload {
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string;
  tokens_used?: number;
  created_at: number;
  images?: string[]; // base64 编码的图片数组
}

// AI 配置 payload（用于同步 AI 渠道和模型配置）
export interface AIConfigPayload {
  enabled: boolean;
  default_channel: string;
  default_model: string;
  channels: AIChannel[];
}

// AI 渠道配置
export interface AIChannel {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'gemini' | 'custom';
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

// MCP Server 配置
export interface McpServerConfig {
  id: string;
  name: string;
  command: string;      // 执行命令，如 'npx' 或 'python'
  args: string[];       // 命令行参数
  env?: Record<string, string>; // 环境变量
  enabled: boolean;
}

// AI 设置
export interface AISettings {
  enabled: boolean;
  default_channel: string;
  default_model: string;
  channels: AIChannel[];
  mcp_servers?: McpServerConfig[]; // MCP 工具服务器配置
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

// 网盘文件分块上传状态
export type CloudUploadState = 'pending' | 'uploading' | 'completed' | 'paused' | 'error';

// 网盘文件分块下载状态
export type CloudDownloadState =
  | 'pending'        // 已知需要下载，未开始
  | 'downloading'    // 进行中
  | 'completed'      // 完成
  | 'paused'         // 暂停
  | 'error';

// 冲突解决策略（远端版本 vs 本地已有文件）
// - newest-wins: 以 mtime 更新者为准，覆盖较旧的一方
// - create-copy: 保留两者，把本地较旧副本重命名为 "xxx (冲突副本).ext"
// - skip: 跳过本次下载，保留本地版本不动
export type CloudConflictStrategy = 'newest-wins' | 'create-copy' | 'skip';

// 网盘文件 payload
export interface CloudFilePayload {
  filename: string;            // 文件名
  mime_type: string;           // MIME 类型
  size: number;                // 字节大小
  file_hash: string;           // SHA-256（去重 & 变更检测）
  parent_folder_id: string;    // 关联 cloud_folder，构建目录树（根目录文件为 'root'）
  relative_path: string;       // 相对监听根目录的相对路径
  mtime: number;               // 本地最后修改时间
  // 分块上传状态（不加密，明文存储）
  upload_state: CloudUploadState;
  chunk_size: number;          // 分块大小（字节）
  total_chunks: number;        // 总块数
  uploaded_chunks: number[];   // 已上传的分块序号（断点续传依据）
  upload_session_id: string | null;  // 服务端上传会话 ID
  error_message: string | null;      // 最近一次上传错误
  // 分块下载状态（远端 → 本地）
  download_state: CloudDownloadState;
  downloaded_size: number;     // 已下载字节数（断点续传依据；HTTP Range start）
  downloaded_at: number | null;      // 最近一次下载完成时间戳
  download_error: string | null;     // 最近一次下载错误
}

// 网盘文件夹 payload
export interface CloudFolderPayload {
  name: string;                       // 文件夹名
  parent_folder_id: string | null;    // 父文件夹 ID（根为 null）
  relative_path: string;              // 相对监听根目录的相对路径
}

// 网盘配置（独立持久化，不混入 SyncConfig）
export interface CloudDriveConfig {
  watched_root_path: string | null;   // 监听根目录（单根）
  max_file_size: number;              // 单文件大小上限（字节，0 = 无限制）
  chunk_size: number;                 // 分块大小（字节）
  ignore_patterns: string[];          // 忽略规则（glob，如 ~$*、*.tmp）
  ignore_hidden: boolean;             // 是否忽略隐藏文件（. 开头）
  sync_deletions: boolean;            // 是否同步删除（软删除）
  soft_delete_retention_days: number; // 软删除保留天数（超过则云端清理）
  stability_threshold: number;        // 写入稳定阈值（毫秒，闸门1）
  debounce_ms: number;                // 变更去抖时长（毫秒，闸门3）
  small_file_concurrency: number;     // 小文件并发上传数
  sync_cursor: string | null;         // 网盘独立同步游标
  // 下载相关配置（Phase 2）
  auto_download: boolean;             // 检测到云端有新版本时自动下载
  download_chunk_size: number;        // 下载分块大小（字节，Range 段长）
  download_concurrency: number;       // 并行下载文件数（同一时刻）
  conflict_strategy: CloudConflictStrategy;  // 冲突解决策略
  // 传输鲁棒性（Phase 3：文件过多时部分直接失败的修复）
  upload_timeout_ms: number;          // 单次 HTTP 请求超时（毫秒，0 = 不限）
  upload_retry_count: number;         // 失败后额外重试次数（总尝试 = 1 + 此值）
  upload_retry_backoff_base_ms: number; // 指数退避基数（毫秒，实际等待 = base * 2^attempt，封顶 30s）
  keep_alive: boolean;                // 是否复用 TCP 连接（连接池）
  max_sockets: number;                // 单源最大并发连接数（连接池上限）
}

// 网盘配置默认值
export const DEFAULT_CLOUD_DRIVE_CONFIG: CloudDriveConfig = {
  watched_root_path: null,
  max_file_size: 500 * 1024 * 1024,   // 500MB
  chunk_size: 8 * 1024 * 1024,        // 8MB
  ignore_patterns: [
    '~$*',            // Office 锁文件
    '*.tmp',          // 临时文件
    '*.asd',          // Office 自动恢复
    '*.wbk',          // Word 备份
    '~*.*',           // Office 临时
    '.DS_Store',      // macOS
    'Thumbs.db',      // Windows 缩略图
    'desktop.ini',    // Windows 文件夹配置
    '*.lnk',          // Windows 快捷方式
  ],
  ignore_hidden: true,
  sync_deletions: true,
  soft_delete_retention_days: 30,
  stability_threshold: 2000,          // 2 秒
  debounce_ms: 3000,                  // 3 秒
  small_file_concurrency: 3,
  sync_cursor: null,
  // Phase 2 下载默认值
  auto_download: false,
  download_chunk_size: 8 * 1024 * 1024, // 8MB（与服务端 upload chunk 对齐）
  download_concurrency: 2,
  conflict_strategy: 'create-copy',
  // Phase 3 传输鲁棒性默认值
  upload_timeout_ms: 60000,            // 60s（覆盖大多数分块 RTT，避免无限挂起）
  upload_retry_count: 3,               // 总尝试 4 次（1 + 3）
  upload_retry_backoff_base_ms: 1000,  // 退避序列：1s → 2s → 4s（封顶 30s）
  keep_alive: true,                    // 复用连接，减少握手开销
  max_sockets: 16,                     // 兼顾并发与服务器压力
};

// 网盘上传进度（用于 UI 展示）
export interface CloudUploadProgress {
  file_id: string;
  filename: string;
  relative_path: string;
  size: number;
  uploaded_bytes: number;
  uploaded_chunks: number;
  total_chunks: number;
  state: CloudUploadState;
  error_message: string | null;
}

// 网盘下载进度（用于 UI 展示）
export interface CloudDownloadProgress {
  file_id: string;
  filename: string;
  relative_path: string;
  size: number;            // 远端文件总字节
  downloaded_bytes: number;  // 已下载字节（含断点续传已写入部分）
  state: CloudDownloadState;
  error_message: string | null;
}

// 本地占位/离线状态（仅本机持久化，不参与同步）
export type CloudLocalAvailability = 'online_only' | 'local' | 'offline';

export interface CloudLocalState {
  availability: CloudLocalAvailability;
}

// 同步模块配置
export interface SyncModules {
  notes: boolean;      // 笔记 + 文件夹 + 标签 + 附件
  bookmarks: boolean;  // 书签 + 书签文件夹
  vault: boolean;      // 密码库条目 + 密码库文件夹
  diagrams: boolean;   // 脑图/流程图/白板
  todos: boolean;      // 待办事项
  ai: boolean;         // AI 配置 + 对话 + 消息
  cloudDrive: boolean; // 网盘文件 + 文件夹（独立同步游标）
}

// 默认同步模块配置（全选）
export const DEFAULT_SYNC_MODULES: SyncModules = {
  notes: true,
  bookmarks: true,
  vault: true,
  diagrams: true,
  todos: true,
  ai: true,
  cloudDrive: true,
};

// 模块到 ItemType 的映射
export const SYNC_MODULE_TYPES: Record<keyof SyncModules, ItemType[]> = {
  notes: ['note', 'folder', 'tag', 'resource', 'excel_note'],
  bookmarks: ['bookmark', 'bookmark_folder'],
  vault: ['vault_entry', 'vault_folder'],
  diagrams: ['diagram'],
  todos: ['todo'],
  ai: ['ai_config', 'ai_conversation', 'ai_message'],
  cloudDrive: ['cloud_file', 'cloud_folder'],
};

// 同步配置
export interface SyncConfig {
  enabled: boolean;
  type: 'webdav' | 'server';
  url: string;
  sync_path: string;  // 同步目录路径
  username?: string;
  password?: string;
  api_key?: string;
  // 自建服务器认证字段
  server_username?: string;   // 服务器用户名
  server_password?: string;   // 服务器密码
  server_sync_key?: string;   // 同步密钥
  server_token?: string;      // JWT token
  server_refresh_token?: string;  // 刷新 token
  server_token_expires?: number;  // token 过期时间
  sync_interval: number;  // 分钟
  last_sync_time: number | null;
  sync_cursor: string | null;
  sync_modules: SyncModules;  // 同步模块选择
}

// 快传中继服务器配置
export interface TransferRelayConfig {
  enabled: boolean;           // 是否启用中继
  server_url: string;         // 中继服务器地址
  relay_key: string;          // 中继密钥
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

// ==================== 密码/资料生成器类型 ====================

// 支持的国家/地区代码
export type GeneratorCountryCode = 'en_US' | 'zh_CN' | 'ja' | 'ko' | 'en_GB' | 'de' | 'fr' | 'ru';

// 性别选项
export type GeneratorGender = 'random' | 'male' | 'female';

// 密码生成选项
export interface PasswordOptions {
  length: number;           // 密码长度，默认 16，范围 8-64
  uppercase: boolean;       // 包含大写字母，默认 true
  lowercase: boolean;       // 包含小写字母，默认 true
  numbers: boolean;         // 包含数字，默认 true
  symbols: boolean;         // 包含特殊符号，默认 true
}

// 可选字段配置
export interface GeneratorIncludeFields {
  name: boolean;            // 姓名
  address: boolean;         // 地址
  phone: boolean;           // 电话
  email: boolean;           // 邮箱
  company: boolean;         // 工作单位
}

// 生成器配置选项
export interface GeneratorOptions {
  country: GeneratorCountryCode;
  gender: GeneratorGender;
  quantity: number;
  includeFields: GeneratorIncludeFields;
  passwordOptions: PasswordOptions;
}

// 生成的用户资料
export interface GeneratedProfile {
  id: string;              // UUID
  username: string;        // 生成的用户名
  password: string;        // 生成的密码
  firstName?: string;      // 名
  lastName?: string;       // 姓
  fullName?: string;       // 全名（根据国家格式化）
  address?: string;        // 完整地址
  phone?: string;          // 电话号码
  email?: string;          // 邮箱地址
  company?: string;        // 公司名称
  generatedAt: number;     // 生成时间戳
}

// 国家配置
export interface CountryConfig {
  label: string;           // 中文名称
  fakerLocale: string;     // Faker locale 代码
}

// 默认生成器配置
export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  country: 'en_US',
  gender: 'random',
  quantity: 1,
  includeFields: {
    name: false,
    address: false,
    phone: false,
    email: false,
    company: false,
  },
  passwordOptions: {
    length: 16,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  },
};

// 国家配置映射
export const COUNTRY_CONFIG: Record<GeneratorCountryCode, CountryConfig> = {
  'en_US': { label: '美国', fakerLocale: 'en_US' },
  'zh_CN': { label: '中国', fakerLocale: 'zh_CN' },
  'ja': { label: '日本', fakerLocale: 'ja' },
  'ko': { label: '韩国', fakerLocale: 'ko' },
  'en_GB': { label: '英国', fakerLocale: 'en_GB' },
  'de': { label: '德国', fakerLocale: 'de' },
  'fr': { label: '法国', fakerLocale: 'fr' },
  'ru': { label: '俄罗斯', fakerLocale: 'ru' },
};

// ==================== Excel 笔记类型 ====================

// Excel 笔记 Payload
export interface ExcelNotePayload {
  title: string;
  description: string;
  folder_id: string | null;
  is_pinned: boolean;
  is_locked: boolean;
  lock_password_hash: string | null;
  tags: string[];
  sheets: ExcelSheet[];
  active_sheet_index: number;
}

// 工作表
export interface ExcelSheet {
  id: string;
  name: string;
  rows: ExcelRow[];
  column_widths: number[];
  row_heights: number[];
  frozen_rows: number;
  frozen_columns: number;
  merged_cells?: MergedCell[];  // 合并单元格区域
}

// 合并单元格区域
export interface MergedCell {
  start_row: number;
  start_col: number;
  end_row: number;
  end_col: number;
}

// 行数据
export interface ExcelRow {
  row_index: number;
  cells: ExcelCell[];
}

// 单元格
export interface ExcelCell {
  column_index: number;
  value: CellValue;
  formula: string | null;
  style: CellStyle | null;
}

// 单元格值类型
export type CellValue = string | number | boolean | null;

// 单元格样式
export interface CellStyle {
  font_bold: boolean;
  font_italic: boolean;
  font_color: string | null;
  background_color: string | null;
  text_align: 'left' | 'center' | 'right';
  vertical_align: 'top' | 'middle' | 'bottom';
  number_format: NumberFormat | null;
}

// 数字格式类型
export type NumberFormat =
  | { type: 'general' }
  | { type: 'number'; decimals: number }
  | { type: 'percentage'; decimals: number }
  | { type: 'currency'; symbol: string; decimals: number }
  | { type: 'date'; pattern: string };

// 默认单元格样式
export const DEFAULT_CELL_STYLE: CellStyle = {
  font_bold: false,
  font_italic: false,
  font_color: null,
  background_color: null,
  text_align: 'left',
  vertical_align: 'middle',
  number_format: null,
};

// 创建默认 Excel 笔记 Payload
export const createDefaultExcelNotePayload = (title: string = '未命名表格'): ExcelNotePayload => ({
  title,
  description: '',
  folder_id: null,
  is_pinned: false,
  is_locked: false,
  lock_password_hash: null,
  tags: [],
  sheets: [createDefaultExcelSheet('Sheet1')],
  active_sheet_index: 0,
});

// 创建默认工作表
export const createDefaultExcelSheet = (name: string): ExcelSheet => ({
  id: crypto.randomUUID ? crypto.randomUUID() : `sheet-${Date.now()}`,
  name,
  rows: [],
  column_widths: [],
  row_heights: [],
  frozen_rows: 0,
  frozen_columns: 0,
  merged_cells: [],
});
