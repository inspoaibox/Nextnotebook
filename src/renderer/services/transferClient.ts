/**
 * LAN Transfer Assistant - 桌面端客户端服务
 * 
 * 提供传输功能的 React 接口
 */

import { v4 as uuidv4 } from 'uuid';
import {
  TRANSFER_CONSTANTS,
  TransferErrorCode,
  createTransferError,
  PairingQRData,
  isQRCodeExpired,
  DeviceType,
  MessageType,
  FileTransferStatus,
} from '@shared/transfer/constants';

// ============================================
// 类型定义
// ============================================

export interface ServerStatus {
  running: boolean;
  port: number | null;
  ip: string | null;
  connectedDevices: number;
  startedAt: number | null;
}

export interface ConnectedDevice {
  id: string;
  name: string;
  type: DeviceType;
  socketId: string;
  ip: string;
  connectedAt: number;
  lastHeartbeat: number;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
}

export interface TransferDevice {
  id: string;
  name: string;
  type: DeviceType;
  last_ip: string | null;
  last_port: number | null;
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
  ended_at: number | null;
}

export interface TransferMessage {
  id: string;
  session_id: string;
  direction: 'sent' | 'received';
  type: MessageType;
  content: string;
  file_id: string | null;
  created_at: number;
  read_at: number | null;
}

export interface TransferFile {
  id: string;
  session_id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  local_path: string | null;
  direction: 'sent' | 'received';
  status: FileTransferStatus;
  progress: number;
  file_hash: string | null;
  created_at: number;
  completed_at: number | null;
}

// ============================================
// Transfer API
// ============================================

const transferApi = (window as any).electronAPI?.transfer;

/**
 * 传输客户端服务
 */
export const transferClient = {
  // ============================================
  // 服务器管理
  // ============================================

  /**
   * 启动传输服务器
   */
  async startServer(port?: number): Promise<ServerStatus> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.startServer(port);
  },

  /**
   * 停止传输服务器
   */
  async stopServer(): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.stopServer();
  },

  /**
   * 获取服务器状态
   */
  async getServerStatus(): Promise<ServerStatus> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.getServerStatus();
  },

  /**
   * 获取连接的设备列表
   */
  async getConnectedDevices(): Promise<ConnectedDevice[]> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.getConnectedDevices();
  },

  /**
   * 生成配对二维码数据
   */
  async generateQRData(): Promise<PairingQRData | null> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.generateQRData();
  },

  /**
   * 获取本机设备信息
   */
  async getDeviceInfo(): Promise<DeviceInfo> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.getDeviceInfo();
  },

  // ============================================
  // 二维码处理
  // ============================================

  /**
   * 解析配对二维码数据
   */
  parsePairingQRCode(qrString: string): PairingQRData | null {
    try {
      const data = JSON.parse(qrString) as PairingQRData;

      // 验证必要字段
      if (!data.deviceId || !data.serverIp || !data.serverPort || !data.expiresAt) {
        return null;
      }

      return data;
    } catch {
      return null;
    }
  },

  /**
   * 验证二维码是否有效
   */
  validateQRCode(qrData: PairingQRData): { valid: boolean; error?: TransferErrorCode } {
    if (isQRCodeExpired(qrData)) {
      return { valid: false, error: TransferErrorCode.QR_CODE_EXPIRED };
    }

    if (!qrData.deviceId || !qrData.serverIp || !qrData.serverPort) {
      return { valid: false, error: TransferErrorCode.QR_CODE_INVALID };
    }

    return { valid: true };
  },

  // ============================================
  // 数据库操作 - 设备
  // ============================================

  /**
   * 创建设备记录
   */
  async createDevice(device: Omit<TransferDevice, 'created_at'>): Promise<TransferDevice> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.createDevice(device);
  },

  /**
   * 获取设备
   */
  async getDevice(id: string): Promise<TransferDevice | undefined> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.getDevice(id);
  },

  /**
   * 获取所有设备
   */
  async getAllDevices(): Promise<TransferDevice[]> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.getAllDevices();
  },

  /**
   * 更新设备
   */
  async updateDevice(id: string, updates: Partial<TransferDevice>): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.updateDevice(id, updates);
  },

  /**
   * 删除设备
   */
  async deleteDevice(id: string): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.deleteDevice(id);
  },

  /**
   * 标记设备为常用
   */
  async setDeviceFavorite(id: string, isFavorite: boolean): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.updateDevice(id, { is_favorite: isFavorite ? 1 : 0 });
  },

  // ============================================
  // 数据库操作 - 会话
  // ============================================

  /**
   * 创建会话
   */
  async createSession(session: TransferSession): Promise<TransferSession> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.createSession(session);
  },

  /**
   * 获取会话
   */
  async getSession(id: string): Promise<TransferSession | undefined> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.getSession(id);
  },

  /**
   * 获取所有会话
   */
  async getAllSessions(): Promise<TransferSession[]> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.getAllSessions();
  },

  /**
   * 获取设备的会话
   */
  async getSessionsByDevice(deviceId: string): Promise<TransferSession[]> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.getSessionsByDevice(deviceId);
  },

  /**
   * 结束会话
   */
  async endSession(id: string): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.endSession(id);
  },

  /**
   * 删除会话
   */
  async deleteSession(id: string): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.deleteSession(id);
  },

  // ============================================
  // 数据库操作 - 消息
  // ============================================

  /**
   * 创建消息
   */
  async createMessage(message: TransferMessage): Promise<TransferMessage> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.createMessage(message);
  },

  /**
   * 获取消息
   */
  async getMessage(id: string): Promise<TransferMessage | undefined> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.getMessage(id);
  },

  /**
   * 获取会话的消息
   */
  async getMessagesBySession(sessionId: string, limit = 100, offset = 0): Promise<TransferMessage[]> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.getMessagesBySession(sessionId, limit, offset);
  },

  /**
   * 标记消息为已读
   */
  async markMessageAsRead(id: string): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.markMessageAsRead(id);
  },

  /**
   * 标记会话所有消息为已读
   */
  async markSessionMessagesAsRead(sessionId: string): Promise<number> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.markSessionMessagesAsRead(sessionId);
  },

  /**
   * 删除消息
   */
  async deleteMessage(id: string): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.deleteMessage(id);
  },

  // ============================================
  // 数据库操作 - 文件传输
  // ============================================

  /**
   * 创建文件传输记录
   */
  async createFileTransfer(file: TransferFile): Promise<TransferFile> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.createFileTransfer(file);
  },

  /**
   * 获取文件传输记录
   */
  async getFile(id: string): Promise<TransferFile | undefined> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.getFile(id);
  },

  /**
   * 获取会话的文件传输记录
   */
  async getFilesBySession(sessionId: string): Promise<TransferFile[]> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.getFilesBySession(sessionId);
  },

  /**
   * 更新文件传输进度
   */
  async updateFileProgress(id: string, progress: number): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.updateFileProgress(id, progress);
  },

  /**
   * 完成文件传输
   */
  async completeFileTransfer(id: string, localPath: string, fileHash?: string): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.completeFileTransfer(id, localPath, fileHash);
  },

  /**
   * 标记文件传输失败
   */
  async failFileTransfer(id: string): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.failFileTransfer(id);
  },

  /**
   * 取消文件传输
   */
  async cancelFileTransfer(id: string): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.cancelFileTransfer(id);
  },

  /**
   * 删除文件传输记录
   */
  async deleteFile(id: string): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.deleteFile(id);
  },

  // ============================================
  // 清理和统计
  // ============================================

  /**
   * 清理旧会话
   */
  async cleanupOldSessions(daysOld: number): Promise<number> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.cleanupOldSessions(daysOld);
  },

  /**
   * 清理失败的传输
   */
  async cleanupFailedTransfers(): Promise<number> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.cleanupFailedTransfers();
  },

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{ devices: number; sessions: number; messages: number; files: number }> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.db.getStats();
  },

  // ============================================
  // 传输历史和设备管理
  // ============================================

  /**
   * 获取传输历史（分页）
   */
  async getTransferHistory(
    limit = 50,
    offset = 0
  ): Promise<{ sessions: TransferSession[]; total: number }> {
    if (!transferApi) throw new Error('Transfer API not available');
    const sessions = await transferApi.db.getAllSessions();
    const sorted = sessions.sort((a: TransferSession, b: TransferSession) => b.started_at - a.started_at);
    return {
      sessions: sorted.slice(offset, offset + limit),
      total: sessions.length,
    };
  },

  /**
   * 获取会话详情（包含消息和文件）
   */
  async getSessionDetails(sessionId: string): Promise<{
    session: TransferSession | undefined;
    messages: TransferMessage[];
    files: TransferFile[];
  }> {
    if (!transferApi) throw new Error('Transfer API not available');
    const [session, messages, files] = await Promise.all([
      transferApi.db.getSession(sessionId),
      transferApi.db.getMessagesBySession(sessionId, 1000, 0),
      transferApi.db.getFilesBySession(sessionId),
    ]);
    return { session, messages, files };
  },

  /**
   * 删除会话及其关联数据
   */
  async deleteSessionWithData(sessionId: string): Promise<boolean> {
    if (!transferApi) throw new Error('Transfer API not available');

    // 获取会话的文件记录
    const files = await transferApi.db.getFilesBySession(sessionId);

    // 删除本地文件
    for (const file of files) {
      if (file.local_path) {
        try {
          await transferApi.deleteLocalFile?.(file.local_path);
        } catch (e) {
          console.warn('Failed to delete local file:', file.local_path);
        }
      }
    }

    // 删除数据库记录（级联删除消息和文件记录）
    return transferApi.db.deleteSession(sessionId);
  },

  /**
   * 获取常用设备
   */
  async getFavoriteDevices(): Promise<TransferDevice[]> {
    if (!transferApi) throw new Error('Transfer API not available');
    const devices = await transferApi.db.getAllDevices();
    return devices.filter((d: TransferDevice) => d.is_favorite === 1);
  },

  /**
   * 清理所有传输历史
   */
  async clearAllHistory(): Promise<{ sessions: number; messages: number; files: number }> {
    if (!transferApi) throw new Error('Transfer API not available');

    const sessions = await transferApi.db.getAllSessions();
    let deletedSessions = 0;
    let deletedMessages = 0;
    let deletedFiles = 0;

    for (const session of sessions) {
      const messages = await transferApi.db.getMessagesBySession(session.id, 10000, 0);
      const files = await transferApi.db.getFilesBySession(session.id);

      // 删除本地文件
      for (const file of files) {
        if (file.local_path) {
          try {
            await transferApi.deleteLocalFile?.(file.local_path);
          } catch (e) {
            // 忽略文件删除错误
          }
        }
      }

      await transferApi.db.deleteSession(session.id);
      deletedSessions++;
      deletedMessages += messages.length;
      deletedFiles += files.length;
    }

    return { sessions: deletedSessions, messages: deletedMessages, files: deletedFiles };
  },

  /**
   * 清理临时文件
   */
  async cleanupTempFiles(): Promise<number> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.cleanupTempFiles?.() || 0;
  },

  // ============================================
  // 消息和文件发送
  // ============================================

  /**
   * 发送文本消息
   */
  async sendTextMessage(
    targetDeviceId: string,
    sessionId: string,
    content: string
  ): Promise<TransferMessage> {
    if (!transferApi) throw new Error('Transfer API not available');

    const messageId = uuidv4();
    const message: TransferMessage = {
      id: messageId,
      session_id: sessionId,
      direction: 'sent',
      type: 'text',
      content,
      file_id: null,
      created_at: Date.now(),
      read_at: null,
    };

    // 保存到本地数据库
    await this.createMessage(message);

    // 发送到服务器
    await transferApi.sendMessage(targetDeviceId, sessionId, {
      id: messageId,
      type: 'text',
      content,
    });

    return message;
  },

  /**
   * 发送文件
   */
  async sendFile(
    targetDeviceId: string,
    sessionId: string,
    filePath: string
  ): Promise<{ id: string; filename: string; fileSize: number; mimeType: string }> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.sendFile(targetDeviceId, sessionId, filePath);
  },

  /**
   * 发送消息已读回执
   */
  async sendMessageReadReceipt(targetDeviceId: string, messageIds: string[]): Promise<void> {
    if (!transferApi) throw new Error('Transfer API not available');
    return transferApi.sendMessageRead(targetDeviceId, messageIds);
  },

  // ============================================
  // 事件监听
  // ============================================

  /**
   * 监听设备连接事件
   */
  onDeviceConnected(callback: (device: ConnectedDevice) => void): () => void {
    if (!transferApi) return () => { };
    return transferApi.onDeviceConnected(callback);
  },

  /**
   * 监听设备断开事件
   */
  onDeviceDisconnected(callback: (deviceId: string) => void): () => void {
    if (!transferApi) return () => { };
    return transferApi.onDeviceDisconnected(callback);
  },

  /**
   * 监听设备列表更新事件
   */
  onDeviceListUpdated(callback: (devices: ConnectedDevice[]) => void): () => void {
    if (!transferApi) return () => { };
    return transferApi.onDeviceListUpdated(callback);
  },

  /**
   * 监听消息接收事件
   */
  onMessageReceived(callback: (data: any) => void): () => void {
    if (!transferApi) return () => { };
    return transferApi.onMessageReceived(callback);
  },

  /**
   * 监听文件传入事件
   */
  onFileIncoming(callback: (data: any) => void): () => void {
    if (!transferApi) return () => { };
    return transferApi.onFileIncoming(callback);
  },

  /**
   * 监听文件分块事件
   */
  onFileChunk(callback: (data: any) => void): () => void {
    if (!transferApi) return () => { };
    return transferApi.onFileChunk(callback);
  },

  /**
   * 监听文件完成事件
   */
  onFileComplete(callback: (data: any) => void): () => void {
    if (!transferApi) return () => { };
    return transferApi.onFileComplete(callback);
  },

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 生成新的消息 ID
   */
  generateMessageId(): string {
    return uuidv4();
  },

  /**
   * 生成新的会话 ID
   */
  generateSessionId(): string {
    return uuidv4();
  },

  /**
   * 生成新的文件传输 ID
   */
  generateFileId(): string {
    return uuidv4();
  },

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * 获取文件 MIME 类型
   */
  getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      // 图片
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      // 文档
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // 文本
      'txt': 'text/plain',
      'md': 'text/markdown',
      'json': 'application/json',
      'xml': 'application/xml',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      // 压缩
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed',
      // 音视频
      'mp3': 'audio/mpeg',
      'mp4': 'video/mp4',
      'avi': 'video/x-msvideo',
      'mov': 'video/quicktime',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  },
};

export default transferClient;
