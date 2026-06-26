export interface ItemsAPI {
  create: (type: string, payload: object) => Promise<any>;
  getById: (id: string) => Promise<any>;
  getByIdIncludeDeleted: (id: string) => Promise<any>;
  getByType: (type: string) => Promise<any[]>;
  update: (id: string, payload: object) => Promise<any>;
  delete: (id: string) => Promise<boolean>;
  hardDelete: (id: string) => Promise<boolean>;
  restore: (id: string) => Promise<boolean>;
  search: (query: string, type?: string) => Promise<any[]>;
  getNotesByFolder: (folderId: string | null) => Promise<any[]>;
  getPinnedNotes: () => Promise<any[]>;
  getDeleted: (type?: string) => Promise<any[]>;
  getStats: () => Promise<{ total: number; byType: Record<string, number> }>;
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  space: string;
  channels: number;
  depth: string;
  density?: number;
  hasAlpha: boolean;
  size: number;
  exif?: Record<string, any>;
  icc?: {
    name: string;
    description?: string;
  };
}

export interface ProcessResult {
  buffer: string;
  info: {
    format: string;
    width: number;
    height: number;
    size: number;
  };
}

export interface ImageAPI {
  getMetadata: (input: string) => Promise<ImageMetadata>;
  process: (input: string, options: object) => Promise<ProcessResult>;
  generatePreview: (input: string, maxSize: number) => Promise<string>;
  saveFile: (buffer: string, defaultName: string) => Promise<boolean>;
}

export interface SyncCursor {
  cursor: string;
  timestamp: number;
}

export interface SyncAPI {
  initialize: (config: object) => Promise<any>;
  start: () => Promise<any>;
  stop: () => Promise<any>;
  trigger: () => Promise<any>;
  getState: () => Promise<any>;
  notifyChange: () => Promise<any>;
  testConnection: (config: object) => Promise<any>;
  forceResync: () => Promise<{ success: boolean; count: number; error?: string }>;
  resetStatus: () => Promise<{ success: boolean; count: number; error?: string }>;
  checkFirstSync: () => Promise<{ isFirstSync: boolean; remoteHasData: boolean; localItemCount: number }>;
  getLocalCursor: (serverType?: string, serverUrl?: string) => Promise<SyncCursor | null>;
  clearLocalCursor: (serverType?: string, serverUrl?: string) => Promise<{ success: boolean }>;
  onLastSyncTimeUpdated: (callback: (lastSyncTime: number) => void) => void;
  onTokenRefreshed: (callback: (data: { token: string; refreshToken: string; expiresIn: number }) => void) => void;
}

export interface DesktopElectronAPI {
  getAppPath: () => Promise<any>;
  getAppPaths: () => Promise<any>;
  openExternal: (url: string) => Promise<any>;
  openPath: (filePath: string) => Promise<any>;
  setAutoLaunch: (enabled: boolean) => Promise<any>;
  getAutoLaunch: () => Promise<any>;
  saveThemeSettings: (settings: { theme: string }) => Promise<any>;
  saveSyncConfig: (config: object) => Promise<any>;
  loadSyncConfig: () => Promise<any>;
  minimizeToTray: () => void;
  quitApp: () => void;
  onWindowCloseRequest: (callback: () => void) => void;
  onWindowMinimized: (callback: () => void) => void;
  triggerMenuAction: (action: string) => void;
  onMenuAction: (callback: (action: string) => void) => void;
}

export interface PDFAPI {
  getInfo: (file: string) => Promise<any>;
  merge: (options: object) => Promise<string>;
  split: (options: object) => Promise<string[]>;
  toImage: (options: object) => Promise<string[]>;
  compress: (options: object) => Promise<any>;
  addWatermark: (options: object) => Promise<string>;
  rotate: (options: object) => Promise<string>;
  reorder: (options: object) => Promise<string>;
  deletePages: (options: object) => Promise<string>;
  extractPages: (options: object) => Promise<string>;
  setSecurity: (options: object) => Promise<string>;
  removeSecurity: (file: string, password: string) => Promise<string>;
  getMetadata: (file: string) => Promise<any>;
  setMetadata: (options: object) => Promise<string>;
  imagesToPdf: (options: object) => Promise<string>;
  getFormFields: (file: string) => Promise<any[]>;
  fillForm: (file: string, values: object) => Promise<string>;
  checkGhostscript: () => Promise<any>;
  toGrayscale: (file: string) => Promise<any>;
  toPDFA: (options: object) => Promise<any>;
  repair: (file: string) => Promise<any>;
  convertVersion: (options: object) => Promise<any>;
  linearize: (file: string) => Promise<any>;
  saveFile: (buffer: string, defaultName: string) => Promise<boolean>;
}

export interface DataExportResult {
  success: boolean;
  filePath?: string;
  itemsCount?: number;
  resourcesCount?: number;
  error?: string;
}

export interface DataImportResult {
  success: boolean;
  itemsImported?: number;
  itemsSkipped?: number;
  resourcesImported?: number;
  totalItems?: number;
  totalResources?: number;
  error?: string;
}

export interface DataPreviewResult {
  success: boolean;
  filePath?: string;
  version?: string;
  exportTime?: number;
  appVersion?: string;
  itemsCount?: number;
  resourcesCount?: number;
  typeCounts?: Record<string, number>;
  error?: string;
}

export interface DataAPI {
  export: (options: { includeResources: boolean }) => Promise<DataExportResult>;
  import: (options: { mode: 'merge' | 'replace' }) => Promise<DataImportResult>;
  previewImport: () => Promise<DataPreviewResult>;
}

export interface ResourceInfo {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  note_id: string;
  file_hash: string;
}

export interface ResourceAPI {
  uploadImage: (noteId: string, data: string, filename: string, mimeType: string) => Promise<string>;
  uploadAttachment: (noteId: string, data: string, filename: string, mimeType: string) => Promise<{ url: string; name: string }>;
  getPath: (resourceId: string, ext: string) => Promise<string | null>;
  read: (resourceId: string, ext: string) => Promise<string | null>;
  delete: (resourceId: string, ext: string) => Promise<boolean>;
  getNoteResources: (noteId: string) => Promise<ResourceInfo[]>;
}

export interface ClipImage {
  src: string;
  alt: string;
}

export interface ClipperConfirmData {
  title: string;
  content: string;
  folderId?: string;
  tags?: string[];
  downloadImages?: boolean;
  images?: ClipImage[];
}

export interface ClipperReceivedData {
  title: string;
  content: string;
  url: string;
  tags?: string[];
  images?: ClipImage[];
}

export interface ClipperExtensionAuthStatus {
  bound: boolean;
  paired: boolean;
  origin: string | null;
  extensionId: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  confirmedAt: number | null;
}

export interface ClipperAPI {
  confirm: (data: ClipperConfirmData) => Promise<{ success: boolean; noteId?: string; error?: string }>;
  cancel: () => Promise<{ success: boolean }>;
  getPending: () => Promise<ClipperReceivedData | null>;
  getExtensionAuth: () => Promise<ClipperExtensionAuthStatus>;
  revokeExtensionAuth: () => Promise<{ success: boolean; error?: string }>;
  onNoteCreated: (callback: (data: { noteId: string }) => void) => void;
}

export interface TransferDevice {
  id: string;
  name: string;
  type: 'desktop' | 'android';
  last_ip?: string | null;
  last_port?: number | null;
  last_seen: number;
  is_favorite: number;
  created_at: number;
}

export interface TransferSession {
  id: string;
  peer_device_id: string;
  peer_device_name: string;
  connection_type: 'lan' | 'relay';
  started_at: number;
  ended_at?: number | null;
}

export interface TransferMessage {
  id: string;
  session_id: string;
  direction: 'sent' | 'received';
  type: 'text' | 'file' | 'image';
  content: string;
  file_id?: string | null;
  created_at: number;
  read_at?: number | null;
}

export interface TransferFile {
  id: string;
  session_id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  local_path?: string | null;
  direction: 'sent' | 'received';
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  file_hash?: string | null;
  created_at: number;
  completed_at?: number | null;
}

export interface TransferServerStatus {
  running: boolean;
  port: number | null;
  ip: string | null;
  connectedDevices: number;
  startedAt: number | null;
}

export interface ConnectedDevice {
  id: string;
  name: string;
  type: 'desktop' | 'android';
  socketId: string;
  ip: string;
  connectedAt: number;
  lastHeartbeat: number;
}

export interface PairingQRData {
  deviceId: string;
  deviceName: string;
  serverIp: string;
  serverPort: number;
  timestamp: number;
  expiresAt: number;
  version: string;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: 'desktop' | 'android';
}

export interface TransferError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
}

export interface TransferDatabaseAPI {
  // 设备
  createDevice: (device: Omit<TransferDevice, 'created_at'>) => Promise<TransferDevice>;
  getDevice: (id: string) => Promise<TransferDevice | undefined>;
  getAllDevices: () => Promise<TransferDevice[]>;
  updateDevice: (id: string, updates: Partial<TransferDevice>) => Promise<boolean>;
  deleteDevice: (id: string) => Promise<boolean>;
  // 会话
  createSession: (session: TransferSession) => Promise<TransferSession>;
  getSession: (id: string) => Promise<TransferSession | undefined>;
  getAllSessions: () => Promise<TransferSession[]>;
  getSessionsByDevice: (deviceId: string) => Promise<TransferSession[]>;
  endSession: (id: string) => Promise<boolean>;
  deleteSession: (id: string) => Promise<boolean>;
  // 消息
  createMessage: (message: TransferMessage) => Promise<TransferMessage>;
  getMessage: (id: string) => Promise<TransferMessage | undefined>;
  getMessagesBySession: (sessionId: string, limit?: number, offset?: number) => Promise<TransferMessage[]>;
  markMessageAsRead: (id: string) => Promise<boolean>;
  markSessionMessagesAsRead: (sessionId: string) => Promise<number>;
  deleteMessage: (id: string) => Promise<boolean>;
  // 文件传输
  createFileTransfer: (file: TransferFile) => Promise<TransferFile>;
  getFile: (id: string) => Promise<TransferFile | undefined>;
  getFilesBySession: (sessionId: string) => Promise<TransferFile[]>;
  updateFileProgress: (id: string, progress: number) => Promise<boolean>;
  completeFileTransfer: (id: string, localPath: string, fileHash?: string) => Promise<boolean>;
  failFileTransfer: (id: string) => Promise<boolean>;
  cancelFileTransfer: (id: string) => Promise<boolean>;
  deleteFile: (id: string) => Promise<boolean>;
  // 清理和统计
  cleanupOldSessions: (daysOld: number) => Promise<number>;
  cleanupFailedTransfers: () => Promise<number>;
  getStats: () => Promise<{ devices: number; sessions: number; messages: number; files: number }>;
}

export interface TransferAPI {
  // 服务器管理
  startServer: (port?: number) => Promise<TransferServerStatus>;
  stopServer: () => Promise<boolean>;
  getServerStatus: () => Promise<TransferServerStatus>;
  getConnectedDevices: () => Promise<ConnectedDevice[]>;
  generateQRData: () => Promise<PairingQRData | null>;
  getDeviceInfo: () => Promise<DeviceInfo>;

  // 数据库操作
  db: TransferDatabaseAPI;

  sendMessage: (targetDeviceId: string, sessionId: string, message: object) => Promise<boolean>;
  sendFile: (
    targetDeviceId: string,
    sessionId: string,
    filePath: string
  ) => Promise<{ id: string; filename: string; fileSize: number; mimeType: string }>;
  saveTempFile: (filename: string, base64Data: string) => Promise<string>;
  sendMessageRead: (targetDeviceId: string, messageIds: string[]) => Promise<void>;

  // 事件监听（返回取消订阅函数）
  onDeviceConnected: (callback: (device: ConnectedDevice) => void) => () => void;
  onDeviceDisconnected: (callback: (deviceId: string) => void) => () => void;
  onDeviceListUpdated: (callback: (devices: ConnectedDevice[]) => void) => () => void;
  onMessageReceived: (callback: (data: any) => void) => () => void;
  onFileIncoming: (callback: (data: any) => void) => () => void;
  onFileChunk: (callback: (data: any) => void) => () => void;
  onFileComplete: (callback: (data: any) => void) => () => void;
}

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
}

export interface NotificationAPI {
  show: (options: NotificationOptions) => Promise<{ success: boolean }>;
  onClick: (callback: (tag: string) => void) => void;
}

export interface ElectronAPI {
  getAppPath: () => Promise<string>;
  getAppPaths: () => Promise<{
    installPath: string;
    exePath: string;
    userDataPath: string;
    logsPath: string;
    tempPath: string;
    appVersion: string;
    isDev: boolean;
  }>;
  openExternal: (url: string) => Promise<void>;
  openPath: (path: string) => Promise<string>;
  setAutoLaunch: (enabled: boolean) => Promise<boolean>;
  getAutoLaunch: () => Promise<boolean>;
  saveThemeSettings: (settings: { theme: string }) => Promise<boolean>;
  minimizeToTray: () => void;
  quitApp: () => void;
  onWindowCloseRequest: (callback: () => void) => void;
  onMenuAction: (callback: (action: string) => void) => void;
  items: ItemsAPI;
  sync: SyncAPI;
  fs: {
    readFile: (path: string) => Promise<Buffer>;
    writeFile: (path: string, data: string | Buffer) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
  };
  image: ImageAPI;
  pdf: PDFAPI;
  data: DataAPI;
  resource: ResourceAPI;
  clipper: ClipperAPI;
  transfer: TransferAPI;
  notification: NotificationAPI;
  mcp: McpAPI;
  cloudDrive: CloudDriveAPI;
}

export interface McpAPI {
  startServer: (config: object) => Promise<{ success: boolean; error?: string }>;
  stopServer: (serverId: string) => Promise<{ success: boolean; error?: string }>;
  listTools: (serverId: string) => Promise<any[]>;
  callTool: (serverId: string, toolName: string, args: any) => Promise<any>;
}

export interface CloudDriveAPI {
  getConfig: () => Promise<unknown>;
  getLocalStates: () => Promise<Record<string, { availability: 'online_only' | 'local' | 'offline' }>>;
  openLocalFile: (itemId: string) => Promise<boolean>;
  openLocalDirectory: (folderPath: string) => Promise<boolean>;
  setLocalAvailability: (itemId: string, availability: 'online_only' | 'local' | 'offline') => Promise<boolean>;
  setFolderLocalAvailability: (folderPath: string, availability: 'online_only' | 'local' | 'offline') => Promise<number>;
  selectWatchedFolder: () => Promise<{ canceled: boolean; path?: string }>;
  startWatching: () => Promise<boolean>;
  stopWatching: () => Promise<boolean>;
  scanNow: () => Promise<boolean>;
  updateConfig: (patch: object) => Promise<unknown>;
  retryFailed: () => Promise<{ enqueued: number }>;
  retryItem: (itemId: string) => Promise<boolean>;
  pauseItem: (itemId: string) => Promise<boolean>;
  resumeItem: (itemId: string) => Promise<boolean>;
  cancelUpload: (itemId: string) => Promise<boolean>;
  clearCompleted: () => Promise<{ cleared: string[] }>;
  listItems: () => Promise<{ items: unknown[] }>;
  onDownloadProgress: (callback: (progress: unknown) => void) => () => void;
  onItemsChanged: (callback: () => void) => () => void;
  onUploadProgress: (callback: (progress: unknown) => void) => () => void;
  onWatchingChange: (callback: (watching: boolean) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export { };
