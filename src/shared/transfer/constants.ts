/**
 * LAN Transfer Assistant - 常量定义
 * 
 * 包含所有传输相关的配置常量和错误码
 */

// ============================================
// 传输配置常量
// ============================================

export const TRANSFER_CONSTANTS = {
  // 文件传输
  CHUNK_SIZE: 64 * 1024,              // 64KB 分块大小
  // 局域网传输不限制文件大小，支持大文件传输
  
  // 时间配置
  QR_CODE_EXPIRY: 5 * 60 * 1000,      // 5 分钟二维码过期
  SESSION_TIMEOUT: 30 * 60 * 1000,    // 30 分钟会话超时
  HEARTBEAT_INTERVAL: 30 * 1000,      // 30 秒心跳间隔
  
  // 重试配置
  MAX_RETRY: 3,                        // 最大重试次数
  RETRY_INTERVAL: 1000,                // 1 秒重试间隔
  RETRY_BACKOFF_MULTIPLIER: 2,         // 指数退避倍数
  
  // 连接配置
  MAX_CONNECTIONS: 10,                 // 最大同时连接数
  PORT_RETRY_ATTEMPTS: 3,              // 端口冲突重试次数
  PORT_RANGE_START: 45000,             // 随机端口范围起始
  PORT_RANGE_END: 50000,               // 随机端口范围结束
  
  // 临时文件
  TEMP_FILE_CLEANUP_DELAY: 5000,       // 5 秒后清理临时文件
  TEMP_DIR_NAME: 'transfer-temp',      // 临时目录名称
  
  // 数据库
  DATABASE_NAME: 'transfer.db',        // 独立数据库文件名
  SCHEMA_VERSION: 1,                   // 数据库 schema 版本
};

// ============================================
// 错误码枚举
// ============================================

export enum TransferErrorCode {
  // 连接错误 (E001-E099)
  CONNECTION_FAILED = 'E001',
  CONNECTION_TIMEOUT = 'E002',
  PORT_IN_USE = 'E003',
  NETWORK_UNAVAILABLE = 'E004',
  CONNECTION_CLOSED = 'E005',
  
  // 配对错误 (E100-E199)
  QR_CODE_EXPIRED = 'E101',
  QR_CODE_INVALID = 'E102',
  DEVICE_ID_CONFLICT = 'E103',
  PAIRING_REJECTED = 'E104',
  PAIRING_TIMEOUT = 'E105',
  
  // 传输错误 (E200-E299)
  FILE_TOO_LARGE = 'E201',
  FILE_NOT_FOUND = 'E202',
  FILE_READ_ERROR = 'E203',
  FILE_WRITE_ERROR = 'E204',
  DISK_SPACE_INSUFFICIENT = 'E205',
  TRANSFER_INTERRUPTED = 'E206',
  CHUNK_INTEGRITY_ERROR = 'E207',
  TRANSFER_CANCELLED = 'E208',
  
  // 会话错误 (E300-E399)
  SESSION_NOT_FOUND = 'E301',
  SESSION_EXPIRED = 'E302',
  SESSION_CLOSED = 'E303',
  SESSION_INVALID = 'E304',
  
  // 服务器错误 (E400-E499)
  SERVER_START_FAILED = 'E401',
  SERVER_FULL = 'E402',
  RELAY_SERVER_UNAVAILABLE = 'E403',
  SERVER_ALREADY_RUNNING = 'E404',
  SERVER_NOT_RUNNING = 'E405',
  INVALID_RELAY_KEY = 'E406',
  
  // 权限错误 (E500-E599)
  PERMISSION_DENIED = 'E501',
  FILE_ACCESS_DENIED = 'E502',
  CAMERA_PERMISSION_DENIED = 'E503',
  STORAGE_PERMISSION_DENIED = 'E504',
  
  // 未知错误
  UNKNOWN_ERROR = 'E999',
}

// ============================================
// 错误消息映射
// ============================================

export const ERROR_MESSAGES: Record<TransferErrorCode, string> = {
  [TransferErrorCode.CONNECTION_FAILED]: '连接失败，请检查网络',
  [TransferErrorCode.CONNECTION_TIMEOUT]: '连接超时',
  [TransferErrorCode.PORT_IN_USE]: '端口被占用，正在重试...',
  [TransferErrorCode.NETWORK_UNAVAILABLE]: '网络不可用',
  [TransferErrorCode.CONNECTION_CLOSED]: '连接已关闭',
  
  [TransferErrorCode.QR_CODE_EXPIRED]: '二维码已过期，请重新生成',
  [TransferErrorCode.QR_CODE_INVALID]: '无效的二维码',
  [TransferErrorCode.DEVICE_ID_CONFLICT]: '设备 ID 冲突',
  [TransferErrorCode.PAIRING_REJECTED]: '配对请求被拒绝',
  [TransferErrorCode.PAIRING_TIMEOUT]: '配对超时',
  
  [TransferErrorCode.FILE_TOO_LARGE]: '文件过大',
  [TransferErrorCode.FILE_NOT_FOUND]: '文件不存在',
  [TransferErrorCode.FILE_READ_ERROR]: '文件读取失败',
  [TransferErrorCode.FILE_WRITE_ERROR]: '文件写入失败',
  [TransferErrorCode.DISK_SPACE_INSUFFICIENT]: '磁盘空间不足',
  [TransferErrorCode.TRANSFER_INTERRUPTED]: '传输中断',
  [TransferErrorCode.CHUNK_INTEGRITY_ERROR]: '数据块校验失败',
  [TransferErrorCode.TRANSFER_CANCELLED]: '传输已取消',
  
  [TransferErrorCode.SESSION_NOT_FOUND]: '会话不存在',
  [TransferErrorCode.SESSION_EXPIRED]: '会话已过期',
  [TransferErrorCode.SESSION_CLOSED]: '会话已关闭',
  [TransferErrorCode.SESSION_INVALID]: '无效的会话',
  
  [TransferErrorCode.SERVER_START_FAILED]: '服务器启动失败',
  [TransferErrorCode.SERVER_FULL]: '服务器连接数已满',
  [TransferErrorCode.RELAY_SERVER_UNAVAILABLE]: '中继服务器不可用',
  [TransferErrorCode.SERVER_ALREADY_RUNNING]: '服务器已在运行',
  [TransferErrorCode.SERVER_NOT_RUNNING]: '服务器未运行',
  [TransferErrorCode.INVALID_RELAY_KEY]: '中继密钥无效',
  
  [TransferErrorCode.PERMISSION_DENIED]: '权限被拒绝',
  [TransferErrorCode.FILE_ACCESS_DENIED]: '无法访问文件',
  [TransferErrorCode.CAMERA_PERMISSION_DENIED]: '相机权限被拒绝',
  [TransferErrorCode.STORAGE_PERMISSION_DENIED]: '存储权限被拒绝',
  
  [TransferErrorCode.UNKNOWN_ERROR]: '未知错误',
};

// ============================================
// 传输错误接口
// ============================================

export interface TransferError {
  code: TransferErrorCode;
  message: string;
  details?: any;
  timestamp: number;
}

/**
 * 创建传输错误对象
 */
export function createTransferError(
  code: TransferErrorCode,
  details?: any
): TransferError {
  return {
    code,
    message: ERROR_MESSAGES[code] || '未知错误',
    details,
    timestamp: Date.now(),
  };
}

// ============================================
// Socket.IO 事件名称
// ============================================

export const SOCKET_EVENTS = {
  // 设备相关
  DEVICE_REGISTER: 'device:register',
  DEVICE_LIST: 'device:list',
  DEVICE_ONLINE: 'device:online',
  DEVICE_OFFLINE: 'device:offline',
  
  // 配对相关
  PAIR_REQUEST: 'pair:request',
  PAIR_ACCEPT: 'pair:accept',
  PAIR_REJECT: 'pair:reject',
  PAIR_SUCCESS: 'pair:success',
  
  // 消息相关
  MESSAGE_SEND: 'message:send',
  MESSAGE_RECEIVE: 'message:receive',
  MESSAGE_READ: 'message:read',
  
  // 文件传输相关
  FILE_START: 'file:start',
  FILE_CHUNK: 'file:chunk',
  FILE_COMPLETE: 'file:complete',
  FILE_INCOMING: 'file:incoming',
  FILE_PROGRESS: 'file:progress',
  FILE_CANCEL: 'file:cancel',
  FILE_ERROR: 'file:error',
  
  // 通用
  ERROR: 'error',
  HEARTBEAT: 'heartbeat',
  DISCONNECT: 'disconnect',
};

// ============================================
// 设备类型
// ============================================

export type DeviceType = 'desktop' | 'android';

// ============================================
// 连接模式
// ============================================

export type ConnectionMode = 'lan' | 'relay';

// ============================================
// 消息类型
// ============================================

export type MessageType = 'text' | 'file' | 'image';

// ============================================
// 消息方向
// ============================================

export type MessageDirection = 'sent' | 'received';

// ============================================
// 文件传输状态
// ============================================

export type FileTransferStatus = 'pending' | 'transferring' | 'completed' | 'failed' | 'cancelled';

// ============================================
// 二维码数据接口
// ============================================

export interface PairingQRData {
  deviceId: string;
  deviceName: string;
  serverIp: string;
  serverPort: number;
  timestamp: number;
  expiresAt: number;
  version: string;
}

/**
 * 验证二维码是否过期
 */
export function isQRCodeExpired(qrData: PairingQRData): boolean {
  return Date.now() > qrData.expiresAt;
}

/**
 * 生成二维码数据
 */
export function createPairingQRData(
  deviceId: string,
  deviceName: string,
  serverIp: string,
  serverPort: number
): PairingQRData {
  const now = Date.now();
  return {
    deviceId,
    deviceName,
    serverIp,
    serverPort,
    timestamp: now,
    expiresAt: now + TRANSFER_CONSTANTS.QR_CODE_EXPIRY,
    version: '1.0',
  };
}
