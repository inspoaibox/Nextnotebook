/**
 * LAN Transfer Assistant - 中继服务器
 * 
 * 当设备无法直接通过局域网连接时，提供消息和文件转发服务
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { config } from '../config';

// ============================================
// 常量定义
// ============================================

const SOCKET_EVENTS = {
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
// 类型定义
// ============================================

interface ConnectedDevice {
  id: string;
  name: string;
  type: 'desktop' | 'android';
  socketId: string;
  connectedAt: number;
  lastHeartbeat: number;
}

interface RateLimitInfo {
  messageCount: number;
  lastReset: number;
  fileTransferCount: number;
}

// ============================================
// TransferRelayServer 类
// ============================================

export class TransferRelayServer {
  private io: SocketIOServer | null = null;
  private connectedDevices: Map<string, ConnectedDevice> = new Map();
  private socketToDevice: Map<string, string> = new Map();
  private rateLimits: Map<string, RateLimitInfo> = new Map();
  
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // 配置
  private readonly maxConnections: number;
  private readonly messageRateLimit: number;
  private readonly fileTransferLimit: number;
  private readonly sessionTimeout: number;
  private readonly heartbeatInterval_ms: number;

  constructor() {
    this.maxConnections = config.transfer?.maxConnections || 100;
    this.messageRateLimit = config.transfer?.messageRateLimit || 60; // 每分钟
    this.fileTransferLimit = config.transfer?.fileTransferLimit || 10; // 每分钟
    this.sessionTimeout = config.transfer?.sessionTimeout || 30 * 60 * 1000; // 30分钟
    this.heartbeatInterval_ms = config.transfer?.heartbeatInterval || 30 * 1000; // 30秒
  }

  /**
   * 初始化中继服务器
   */
  initialize(httpServer: HttpServer): void {
    this.io = new SocketIOServer(httpServer, {
      path: '/transfer',
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      maxHttpBufferSize: 64 * 1024 * 2, // 128KB for chunks
    });

    this.setupSocketHandlers();
    this.startHeartbeatCheck();
    this.startCleanupTask();

    console.log('[TransferRelay] Initialized on path /transfer');
  }

  /**
   * 关闭中继服务器
   */
  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.io) {
      this.io.close();
      this.io = null;
    }

    this.connectedDevices.clear();
    this.socketToDevice.clear();
    this.rateLimits.clear();

    console.log('[TransferRelay] Closed');
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    connectedDevices: number;
    maxConnections: number;
  } {
    return {
      connectedDevices: this.connectedDevices.size,
      maxConnections: this.maxConnections,
    };
  }

  // ============================================
  // Socket 事件处理
  // ============================================

  private setupSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      console.log(`[TransferRelay] New connection: ${socket.id}`);

      // 设备注册
      socket.on(SOCKET_EVENTS.DEVICE_REGISTER, (data: {
        deviceId: string;
        deviceName: string;
        deviceType: 'desktop' | 'android';
      }) => {
        this.handleDeviceRegister(socket, data);
      });

      // 配对请求
      socket.on(SOCKET_EVENTS.PAIR_REQUEST, (data: { targetDeviceId: string }) => {
        this.handlePairRequest(socket, data);
      });

      // 配对接受
      socket.on(SOCKET_EVENTS.PAIR_ACCEPT, (data: { requesterId: string; sessionId: string }) => {
        this.handlePairAccept(socket, data);
      });

      // 配对拒绝
      socket.on(SOCKET_EVENTS.PAIR_REJECT, (data: { requesterId: string }) => {
        this.handlePairReject(socket, data);
      });

      // 消息发送
      socket.on(SOCKET_EVENTS.MESSAGE_SEND, (data: any) => {
        this.handleMessageSend(socket, data);
      });

      // 消息已读
      socket.on(SOCKET_EVENTS.MESSAGE_READ, (data: any) => {
        this.handleMessageRead(socket, data);
      });

      // 文件传输开始
      socket.on(SOCKET_EVENTS.FILE_START, (data: any) => {
        this.handleFileStart(socket, data);
      });

      // 文件分块
      socket.on(SOCKET_EVENTS.FILE_CHUNK, (data: any) => {
        this.handleFileChunk(socket, data);
      });

      // 文件传输完成
      socket.on(SOCKET_EVENTS.FILE_COMPLETE, (data: any) => {
        this.handleFileComplete(socket, data);
      });

      // 文件传输取消
      socket.on(SOCKET_EVENTS.FILE_CANCEL, (data: any) => {
        this.handleFileCancel(socket, data);
      });

      // 心跳
      socket.on(SOCKET_EVENTS.HEARTBEAT, () => {
        this.handleHeartbeat(socket);
      });

      // 断开连接
      socket.on(SOCKET_EVENTS.DISCONNECT, () => {
        this.handleDisconnect(socket);
      });
    });
  }

  private handleDeviceRegister(
    socket: Socket,
    data: { deviceId: string; deviceName: string; deviceType: 'desktop' | 'android' }
  ): void {
    const { deviceId, deviceName, deviceType } = data;

    // 检查连接数限制
    if (this.connectedDevices.size >= this.maxConnections) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'E402',
        message: '服务器连接数已满',
      });
      socket.disconnect(true);
      return;
    }

    // 检查是否已存在相同设备 ID
    if (this.connectedDevices.has(deviceId)) {
      const existingDevice = this.connectedDevices.get(deviceId)!;
      // 断开旧连接
      const oldSocket = this.io?.sockets.sockets.get(existingDevice.socketId);
      if (oldSocket) {
        oldSocket.disconnect(true);
      }
      this.socketToDevice.delete(existingDevice.socketId);
    }

    const device: ConnectedDevice = {
      id: deviceId,
      name: deviceName,
      type: deviceType,
      socketId: socket.id,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    this.connectedDevices.set(deviceId, device);
    this.socketToDevice.set(socket.id, deviceId);
    this.rateLimits.set(deviceId, {
      messageCount: 0,
      lastReset: Date.now(),
      fileTransferCount: 0,
    });

    console.log(`[TransferRelay] Device registered: ${deviceName} (${deviceId})`);

    // 发送设备列表给新设备
    socket.emit(SOCKET_EVENTS.DEVICE_LIST, this.getDeviceListForClient(deviceId));

    // 广播新设备上线
    socket.broadcast.emit(SOCKET_EVENTS.DEVICE_ONLINE, {
      device: {
        id: device.id,
        name: device.name,
        type: device.type,
      },
    });
  }

  private handlePairRequest(socket: Socket, data: { targetDeviceId: string }): void {
    const requesterId = this.socketToDevice.get(socket.id);
    if (!requesterId) return;

    const requester = this.connectedDevices.get(requesterId);
    const target = this.connectedDevices.get(data.targetDeviceId);

    if (!requester || !target) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'E301',
        message: '目标设备不存在',
      });
      return;
    }

    // 转发配对请求给目标设备
    const targetSocket = this.io?.sockets.sockets.get(target.socketId);
    if (targetSocket) {
      targetSocket.emit(SOCKET_EVENTS.PAIR_REQUEST, {
        requesterId,
        requesterName: requester.name,
      });
    }
  }

  private handlePairAccept(socket: Socket, data: { requesterId: string; sessionId: string }): void {
    const accepterId = this.socketToDevice.get(socket.id);
    if (!accepterId) return;

    const requester = this.connectedDevices.get(data.requesterId);
    const accepter = this.connectedDevices.get(accepterId);

    if (!requester || !accepter) return;

    // 通知请求方配对成功
    const requesterSocket = this.io?.sockets.sockets.get(requester.socketId);
    if (requesterSocket) {
      requesterSocket.emit(SOCKET_EVENTS.PAIR_SUCCESS, {
        sessionId: data.sessionId,
        peerId: accepterId,
        peerName: accepter.name,
      });
    }

    // 通知接受方配对成功
    socket.emit(SOCKET_EVENTS.PAIR_SUCCESS, {
      sessionId: data.sessionId,
      peerId: data.requesterId,
      peerName: requester.name,
    });
  }

  private handlePairReject(socket: Socket, data: { requesterId: string }): void {
    const requester = this.connectedDevices.get(data.requesterId);
    if (requester) {
      const requesterSocket = this.io?.sockets.sockets.get(requester.socketId);
      if (requesterSocket) {
        requesterSocket.emit(SOCKET_EVENTS.ERROR, {
          code: 'E104',
          message: '配对请求被拒绝',
        });
      }
    }
  }

  private handleMessageSend(socket: Socket, data: any): void {
    const senderId = this.socketToDevice.get(socket.id);
    if (!senderId) return;

    // 检查限流
    if (!this.checkRateLimit(senderId, 'message')) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'E403',
        message: '消息发送过于频繁，请稍后再试',
      });
      return;
    }

    const { targetDeviceId, sessionId, message } = data;
    const target = this.connectedDevices.get(targetDeviceId);

    if (!target) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'E301',
        message: '目标设备不在线',
      });
      return;
    }

    // 转发消息
    const targetSocket = this.io?.sockets.sockets.get(target.socketId);
    if (targetSocket) {
      targetSocket.emit(SOCKET_EVENTS.MESSAGE_RECEIVE, {
        senderId,
        sessionId,
        message,
      });
    }
  }

  private handleMessageRead(socket: Socket, data: any): void {
    const readerId = this.socketToDevice.get(socket.id);
    if (!readerId) return;

    const { targetDeviceId, messageIds } = data;
    const target = this.connectedDevices.get(targetDeviceId);

    if (target) {
      const targetSocket = this.io?.sockets.sockets.get(target.socketId);
      if (targetSocket) {
        targetSocket.emit(SOCKET_EVENTS.MESSAGE_READ, {
          readerId,
          messageIds,
        });
      }
    }
  }

  private handleFileStart(socket: Socket, data: any): void {
    const senderId = this.socketToDevice.get(socket.id);
    if (!senderId) return;

    // 检查限流
    if (!this.checkRateLimit(senderId, 'file')) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'E403',
        message: '文件传输过于频繁，请稍后再试',
      });
      return;
    }

    const { targetDeviceId, fileInfo } = data;
    const target = this.connectedDevices.get(targetDeviceId);

    if (!target) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'E301',
        message: '目标设备不在线',
      });
      return;
    }

    // 转发文件开始事件
    const targetSocket = this.io?.sockets.sockets.get(target.socketId);
    if (targetSocket) {
      targetSocket.emit(SOCKET_EVENTS.FILE_INCOMING, {
        senderId,
        fileInfo,
      });
    }
  }

  private handleFileChunk(socket: Socket, data: any): void {
    const senderId = this.socketToDevice.get(socket.id);
    if (!senderId) return;

    const { targetDeviceId, fileId, chunkIndex, chunk, totalChunks } = data;
    const target = this.connectedDevices.get(targetDeviceId);

    if (!target) return;

    // 直接转发文件分块（不存储）
    const targetSocket = this.io?.sockets.sockets.get(target.socketId);
    if (targetSocket) {
      targetSocket.emit(SOCKET_EVENTS.FILE_CHUNK, {
        senderId,
        fileId,
        chunkIndex,
        chunk,
        totalChunks,
      });
    }
  }

  private handleFileComplete(socket: Socket, data: any): void {
    const senderId = this.socketToDevice.get(socket.id);
    if (!senderId) return;

    const { targetDeviceId, fileId, fileHash } = data;
    const target = this.connectedDevices.get(targetDeviceId);

    if (!target) return;

    const targetSocket = this.io?.sockets.sockets.get(target.socketId);
    if (targetSocket) {
      targetSocket.emit(SOCKET_EVENTS.FILE_COMPLETE, {
        senderId,
        fileId,
        fileHash,
      });
    }
  }

  private handleFileCancel(socket: Socket, data: any): void {
    const senderId = this.socketToDevice.get(socket.id);
    if (!senderId) return;

    const { targetDeviceId, fileId } = data;
    const target = this.connectedDevices.get(targetDeviceId);

    if (target) {
      const targetSocket = this.io?.sockets.sockets.get(target.socketId);
      if (targetSocket) {
        targetSocket.emit(SOCKET_EVENTS.FILE_CANCEL, {
          senderId,
          fileId,
        });
      }
    }
  }

  private handleHeartbeat(socket: Socket): void {
    const deviceId = this.socketToDevice.get(socket.id);
    if (deviceId) {
      const device = this.connectedDevices.get(deviceId);
      if (device) {
        device.lastHeartbeat = Date.now();
      }
    }
  }

  private handleDisconnect(socket: Socket): void {
    const deviceId = this.socketToDevice.get(socket.id);
    if (!deviceId) return;

    const device = this.connectedDevices.get(deviceId);
    if (device) {
      console.log(`[TransferRelay] Device disconnected: ${device.name} (${deviceId})`);
      
      this.connectedDevices.delete(deviceId);
      this.socketToDevice.delete(socket.id);
      this.rateLimits.delete(deviceId);

      // 广播设备下线
      this.io?.emit(SOCKET_EVENTS.DEVICE_OFFLINE, { deviceId });
    }
  }

  // ============================================
  // 辅助方法
  // ============================================

  private getDeviceListForClient(excludeDeviceId: string): Array<{
    id: string;
    name: string;
    type: 'desktop' | 'android';
  }> {
    return Array.from(this.connectedDevices.values())
      .filter(d => d.id !== excludeDeviceId)
      .map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
      }));
  }

  private checkRateLimit(deviceId: string, type: 'message' | 'file'): boolean {
    const limit = this.rateLimits.get(deviceId);
    if (!limit) return false;

    const now = Date.now();
    
    // 每分钟重置计数
    if (now - limit.lastReset > 60000) {
      limit.messageCount = 0;
      limit.fileTransferCount = 0;
      limit.lastReset = now;
    }

    if (type === 'message') {
      if (limit.messageCount >= this.messageRateLimit) {
        return false;
      }
      limit.messageCount++;
    } else {
      if (limit.fileTransferCount >= this.fileTransferLimit) {
        return false;
      }
      limit.fileTransferCount++;
    }

    return true;
  }

  private startHeartbeatCheck(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      for (const [deviceId, device] of this.connectedDevices) {
        if (now - device.lastHeartbeat > this.sessionTimeout) {
          console.log(`[TransferRelay] Device timeout: ${device.name}`);
          const socket = this.io?.sockets.sockets.get(device.socketId);
          if (socket) {
            socket.disconnect(true);
          }
        }
      }
    }, this.heartbeatInterval_ms);
  }

  private startCleanupTask(): void {
    // 每小时清理一次过期的限流记录
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [deviceId, limit] of this.rateLimits) {
        if (!this.connectedDevices.has(deviceId) && now - limit.lastReset > 3600000) {
          this.rateLimits.delete(deviceId);
        }
      }
    }, 3600000);
  }
}

// 单例导出
export const transferRelayServer = new TransferRelayServer();
