/**
 * LAN Transfer Assistant - 中继服务器客户端
 *
 * 当局域网直连不可用时，通过中继服务器进行消息和文件转发
 */

import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { TRANSFER_CONSTANTS, SOCKET_EVENTS, DeviceType } from '@shared/transfer/constants';

// ============================================
// 类型定义
// ============================================

export interface RelayConfig {
  serverUrl: string;
  relayKey: string;
  deviceId: string;
  deviceName: string;
}

export interface RelayDevice {
  id: string;
  name: string;
  type: DeviceType;
}

export interface RelayClientEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  error: (error: any) => void;
  'device:list': (devices: RelayDevice[]) => void;
  'device:online': (device: RelayDevice) => void;
  'device:offline': (deviceId: string) => void;
  'pair:request': (data: { requesterId: string; requesterName: string }) => void;
  'pair:success': (data: { sessionId: string; peerId: string; peerName: string }) => void;
  'message:received': (data: any) => void;
  'file:incoming': (data: any) => void;
  'file:chunk': (data: any) => void;
  'file:complete': (data: any) => void;
}

type EventCallback<T> = (data: T) => void;

// ============================================
// RelayClient 类
// ============================================

export class RelayClient {
  private socket: Socket | null = null;
  private config: RelayConfig | null = null;
  private eventListeners: Map<string, Set<EventCallback<any>>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnecting = false;
  private onlineDevices: RelayDevice[] = [];

  // ============================================
  // 事件系统
  // ============================================

  on<K extends keyof RelayClientEvents>(event: K, callback: RelayClientEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback as EventCallback<any>);
  }

  off<K extends keyof RelayClientEvents>(event: K, callback: RelayClientEvents[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback as EventCallback<any>);
    }
  }

  private emit<K extends keyof RelayClientEvents>(
    event: K,
    data?: Parameters<RelayClientEvents[K]>[0]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data as any));
    }
  }

  // ============================================
  // 连接管理
  // ============================================

  /**
   * 获取中继状态
   */
  getStatus() {
    return {
      connected: this.socket?.connected || false,
      serverUrl: this.config?.serverUrl || null,
      connecting: this.isConnecting,
      error: null,
    };
  }

  /**
   * 获取在线设备
   */
  getConnectedDevices() {
    return this.onlineDevices;
  }

  private resolveRelayEndpoint(serverUrl: string): { url: string; path: string } {
    const trimmedUrl = serverUrl.trim();
    try {
      const parsed = new URL(trimmedUrl);
      const relayPath =
        parsed.pathname && parsed.pathname !== '/'
          ? parsed.pathname.replace(/\/$/, '') || '/transfer'
          : '/transfer';
      parsed.pathname = '';
      parsed.search = '';
      parsed.hash = '';
      return {
        url: parsed.toString().replace(/\/$/, ''),
        path: relayPath,
      };
    } catch {
      return {
        url: trimmedUrl.replace(/\/$/, ''),
        path: '/transfer',
      };
    }
  }
  // ============================================

  /**
   * 连接到中继服务器
   */
  async connect(config: RelayConfig): Promise<void> {
    if (this.socket?.connected) {
      console.log('[RelayClient] Already connected');
      return;
    }

    if (this.isConnecting) {
      console.log('[RelayClient] Connection in progress');
      return;
    }

    this.isConnecting = true;
    this.config = config;

    return new Promise((resolve, reject) => {
      try {
        // 构建连接 URL
        const endpoint = this.resolveRelayEndpoint(config.serverUrl);

        this.socket = io(endpoint.url, {
          path: endpoint.path,
          auth: {
            relayKey: config.relayKey,
          },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 10000,
        });

        // 连接成功
        this.socket.on('connect', () => {
          console.log('[RelayClient] Connected to relay server');
          this.isConnecting = false;
          this.reconnectAttempts = 0;

          // 注册设备
          this.registerDevice();
          this.startHeartbeat();
          this.emit('connected');
          resolve();
        });

        // 连接错误
        this.socket.on('connect_error', error => {
          console.error('[RelayClient] Connection error:', error.message);
          this.isConnecting = false;

          if (error.message === 'INVALID_RELAY_KEY') {
            this.emit('error', { code: 'INVALID_KEY', message: '中继密钥无效' });
            reject(new Error('中继密钥无效'));
          } else {
            this.emit('error', { code: 'CONNECTION_ERROR', message: error.message });
            reject(error);
          }
        });

        // 断开连接
        this.socket.on('disconnect', reason => {
          console.log('[RelayClient] Disconnected:', reason);
          this.stopHeartbeat();
          this.emit('disconnected', reason);
        });

        // 设置事件处理
        this.setupEventHandlers();
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.stopHeartbeat();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.config = null;
    this.isConnecting = false;
    console.log('[RelayClient] Disconnected');
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // ============================================
  // 设备注册
  // ============================================

  private registerDevice(): void {
    if (!this.socket || !this.config) return;

    this.socket.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
      deviceId: this.config.deviceId,
      deviceName: this.config.deviceName,
      deviceType: 'desktop' as DeviceType,
    });
  }

  // ============================================
  // 事件处理
  // ============================================

  private setupEventHandlers(): void {
    if (!this.socket) return;

    // 设备列表
    this.socket.on(SOCKET_EVENTS.DEVICE_LIST, (devices: RelayDevice[]) => {
      this.onlineDevices = devices;
      this.emit('device:list', devices);
    });

    // 设备上线
    this.socket.on(SOCKET_EVENTS.DEVICE_ONLINE, (data: { device: RelayDevice }) => {
      const exists = this.onlineDevices.some(d => d.id === data.device.id);
      if (!exists) {
        this.onlineDevices.push(data.device);
      }
      this.emit('device:online', data.device);
    });

    // 设备下线
    this.socket.on(SOCKET_EVENTS.DEVICE_OFFLINE, (data: { deviceId: string }) => {
      this.onlineDevices = this.onlineDevices.filter(d => d.id !== data.deviceId);
      this.emit('device:offline', data.deviceId);
    });

    // 配对请求
    this.socket.on(
      SOCKET_EVENTS.PAIR_REQUEST,
      (data: { requesterId: string; requesterName: string }) => {
        this.emit('pair:request', data);
      }
    );

    // 配对成功
    this.socket.on(
      SOCKET_EVENTS.PAIR_SUCCESS,
      (data: { sessionId: string; peerId: string; peerName: string }) => {
        this.emit('pair:success', data);
      }
    );

    // 消息接收
    this.socket.on(SOCKET_EVENTS.MESSAGE_RECEIVE, (data: any) => {
      console.log('[RelayClient] MESSAGE_RECEIVE event:', JSON.stringify(data));
      this.emit('message:received', data);
    });

    // 文件传入
    this.socket.on(SOCKET_EVENTS.FILE_INCOMING, (data: any) => {
      console.log(`[RelayClient] File incoming: ${data.fileInfo?.filename || 'unknown'}`);
      this.emit('file:incoming', data);
    });

    // 文件分块
    this.socket.on(SOCKET_EVENTS.FILE_CHUNK, (data: any) => {
      this.emit('file:chunk', data);
    });

    // 文件完成
    this.socket.on(SOCKET_EVENTS.FILE_COMPLETE, (data: any) => {
      this.emit('file:complete', data);
    });

    // 错误
    this.socket.on(SOCKET_EVENTS.ERROR, (error: any) => {
      console.error('[RelayClient] Server error:', error);
      this.emit('error', error);
    });
  }

  // ============================================
  // 配对操作
  // ============================================

  /**
   * 发送配对请求
   */
  sendPairRequest(targetDeviceId: string): void {
    if (!this.socket) return;
    this.socket.emit(SOCKET_EVENTS.PAIR_REQUEST, { targetDeviceId });
  }

  /**
   * 接受配对请求
   */
  acceptPairRequest(requesterId: string): string {
    if (!this.socket) return '';
    const sessionId = uuidv4();
    this.socket.emit(SOCKET_EVENTS.PAIR_ACCEPT, { requesterId, sessionId });
    return sessionId;
  }

  /**
   * 拒绝配对请求
   */
  rejectPairRequest(requesterId: string): void {
    if (!this.socket) return;
    this.socket.emit(SOCKET_EVENTS.PAIR_REJECT, { requesterId });
  }

  // ============================================
  // 消息操作
  // ============================================

  /**
   * 发送消息
   */
  sendMessage(
    targetDeviceId: string,
    sessionId: string,
    message: { id: string; type: string; content: string }
  ): boolean {
    if (!this.socket) return false;

    this.socket.emit(SOCKET_EVENTS.MESSAGE_SEND, {
      targetDeviceId,
      sessionId,
      message,
    });

    return true;
  }

  /**
   * 发送已读回执
   */
  sendMessageRead(targetDeviceId: string, messageIds: string[]): void {
    if (!this.socket) return;

    this.socket.emit(SOCKET_EVENTS.MESSAGE_READ, {
      targetDeviceId,
      messageIds,
    });
  }

  // ============================================
  // 文件操作
  // ============================================

  /**
   * 发送文件
   */
  async sendFile(
    targetDeviceId: string,
    sessionId: string,
    filePath: string
  ): Promise<{ id: string; filename: string; fileSize: number; mimeType: string }> {
    if (!this.socket) {
      throw new Error('未连接到中继服务器');
    }

    // 读取文件信息
    const stats = fs.statSync(filePath);
    const filename = path.basename(filePath);
    const fileId = uuidv4();
    const fileSize = stats.size;
    const totalChunks = Math.ceil(fileSize / TRANSFER_CONSTANTS.CHUNK_SIZE);

    // 获取 MIME 类型
    const ext = path.extname(filename).toLowerCase().slice(1);
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      pdf: 'application/pdf',
      doc: 'application/msword',
      txt: 'text/plain',
      zip: 'application/zip',
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      apk: 'application/vnd.android.package-archive',
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    // 发送文件开始事件
    this.socket.emit(SOCKET_EVENTS.FILE_START, {
      targetDeviceId,
      sessionId,
      fileInfo: {
        id: fileId,
        filename,
        fileSize,
        mimeType,
        totalChunks,
      },
    });

    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(fileBuffer);
    const fileHash = hash.digest('hex');

    (async () => {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * TRANSFER_CONSTANTS.CHUNK_SIZE;
        const end = Math.min(start + TRANSFER_CONSTANTS.CHUNK_SIZE, fileSize);
        const chunk = fileBuffer.slice(start, end);

        this.socket!.emit(SOCKET_EVENTS.FILE_CHUNK, {
          targetDeviceId,
          sessionId,
          fileId,
          chunkIndex: i,
          chunk: chunk.toString('base64'),
          totalChunks,
        });

        await new Promise(resolve => setTimeout(resolve, 10));
      }

      this.socket!.emit(SOCKET_EVENTS.FILE_COMPLETE, {
        targetDeviceId,
        sessionId,
        fileId,
        fileHash,
      });
      console.log(`[RelayClient] File transfer to ${targetDeviceId} completed: ${fileId}`);
    })().catch(err => {
      console.error('[RelayClient] Background file send failed:', err);
    });

    return { id: fileId, filename, fileSize, mimeType };
  }

  // ============================================
  // 心跳
  // ============================================

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit(SOCKET_EVENTS.HEARTBEAT);
      }
    }, TRANSFER_CONSTANTS.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

// 单例导出
export const relayClient = new RelayClient();
export default RelayClient;
