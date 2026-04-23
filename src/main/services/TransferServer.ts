/**
 * LAN Transfer Assistant - 桌面端内置服务器
 *
 * 使用 Socket.IO 实现局域网设备发现和数据传输
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { createServer, Server as HttpServer } from 'http';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import {
  TRANSFER_CONSTANTS,
  SOCKET_EVENTS,
  TransferErrorCode,
  createTransferError,
  DeviceType,
  ConnectionMode,
  PairingQRData,
  createPairingQRData,
} from '@shared/transfer/constants';

// ============================================
// 类型定义
// ============================================

export interface ConnectedDevice {
  id: string;
  name: string;
  type: DeviceType;
  socketId: string;
  ip: string;
  connectedAt: number;
  lastHeartbeat: number;
}

export interface PendingPairing {
  requesterId: string;
  targetId: string;
  timestamp: number;
  expiresAt: number;
}

export interface ServerStatus {
  running: boolean;
  port: number | null;
  ip: string | null;
  connectedDevices: number;
  startedAt: number | null;
}

export interface TransferServerEvents {
  'server:started': (status: ServerStatus) => void;
  'server:stopped': () => void;
  'server:error': (error: any) => void;
  'device:connected': (device: ConnectedDevice) => void;
  'device:disconnected': (deviceId: string) => void;
  'device:list-updated': (devices: ConnectedDevice[]) => void;
  'pair:request': (data: { requesterId: string; requesterName: string }) => void;
  'session:created': (data: {
    sessionId: string;
    peerDeviceId: string;
    peerDeviceName: string;
  }) => void;
  'message:received': (data: any) => void;
  'file:incoming': (data: any) => void;
  'file:chunk': (data: any) => void;
  'file:complete': (data: any) => void;
  'pair:success': (data: { sessionId: string; peerId: string; peerName: string }) => void;
}

type EventCallback<T> = (data: T) => void;

// ============================================
// TransferServer 类
// ============================================

export class TransferServer {
  private httpServer: HttpServer | null = null;
  private io: SocketIOServer | null = null;
  private port: number | null = null;
  private localIp: string | null = null;
  private startedAt: number | null = null;

  private connectedDevices: Map<string, ConnectedDevice> = new Map();
  private socketToDevice: Map<string, string> = new Map();
  private pendingPairings: Map<string, PendingPairing> = new Map();

  private eventListeners: Map<string, Set<EventCallback<any>>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionTimeoutInterval: NodeJS.Timeout | null = null;
  private activeSessions: Map<string, { lastActivity: number; deviceIds: string[] }> = new Map();

  private deviceId: string;
  private deviceName: string;

  // 文件接收相关
  private fileStreams: Map<string, fs.WriteStream> = new Map();
  private fileInfoCache: Map<string, { filename: string; localPath: string; sessionId?: string }> =
    new Map();

  constructor(deviceId: string, deviceName: string) {
    this.deviceId = deviceId;
    this.deviceName = deviceName;
  }

  // ============================================
  // 事件系统
  // ============================================

  on<K extends keyof TransferServerEvents>(event: K, callback: TransferServerEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback as EventCallback<any>);
  }

  off<K extends keyof TransferServerEvents>(event: K, callback: TransferServerEvents[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback as EventCallback<any>);
    }
  }

  private emit<K extends keyof TransferServerEvents>(
    event: K,
    data: Parameters<TransferServerEvents[K]>[0]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  // ============================================
  // 服务器生命周期
  // ============================================

  /**
   * 启动服务器
   */
  async start(preferredPort?: number): Promise<ServerStatus> {
    if (this.io) {
      throw createTransferError(TransferErrorCode.SERVER_ALREADY_RUNNING);
    }

    this.localIp = this.getLocalIP();
    if (!this.localIp) {
      throw createTransferError(TransferErrorCode.NETWORK_UNAVAILABLE);
    }

    const port = await this.findAvailablePort(preferredPort);

    return new Promise((resolve, reject) => {
      try {
        this.httpServer = createServer();
        this.io = new SocketIOServer(this.httpServer, {
          cors: {
            origin: '*',
            methods: ['GET', 'POST'],
          },
          maxHttpBufferSize: TRANSFER_CONSTANTS.CHUNK_SIZE * 2,
        });

        this.setupSocketHandlers();

        this.httpServer.listen(port, () => {
          this.port = port;
          this.startedAt = Date.now();

          const status = this.getStatus();
          console.log(`[TransferServer] Started on ${this.localIp}:${port}`);

          this.startHeartbeatCheck();
          this.startSessionTimeoutCheck();
          this.emit('server:started', status);
          resolve(status);
        });

        this.httpServer.on('error', (error: any) => {
          console.error('[TransferServer] Server error:', error);
          this.emit('server:error', error);
          reject(createTransferError(TransferErrorCode.SERVER_START_FAILED, error));
        });
      } catch (error) {
        reject(createTransferError(TransferErrorCode.SERVER_START_FAILED, error));
      }
    });
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.sessionTimeoutInterval) {
      clearInterval(this.sessionTimeoutInterval);
      this.sessionTimeoutInterval = null;
    }

    // 清理所有未完成的文件流
    for (const [fileId, stream] of this.fileStreams) {
      try {
        stream.end();
        const fileInfo = this.fileInfoCache.get(fileId);
        if (fileInfo?.localPath && fs.existsSync(fileInfo.localPath)) {
          fs.unlinkSync(fileInfo.localPath);
        }
      } catch (error) {
        console.error('[TransferServer] Failed to cleanup file stream:', error);
      }
    }
    this.fileStreams.clear();
    this.fileInfoCache.clear();

    if (this.io) {
      // 通知所有连接的设备
      this.io.emit(SOCKET_EVENTS.DEVICE_OFFLINE, { deviceId: this.deviceId });

      await new Promise<void>(resolve => {
        this.io!.close(() => {
          resolve();
        });
      });
      this.io = null;
    }

    if (this.httpServer) {
      await new Promise<void>(resolve => {
        this.httpServer!.close(() => {
          resolve();
        });
      });
      this.httpServer = null;
    }

    this.connectedDevices.clear();
    this.socketToDevice.clear();
    this.pendingPairings.clear();
    this.activeSessions.clear();
    this.port = null;
    this.startedAt = null;

    console.log('[TransferServer] Stopped');
    this.emit('server:stopped', undefined as any);
  }

  /**
   * 获取服务器状态
   */
  getStatus(): ServerStatus {
    return {
      running: this.io !== null,
      port: this.port,
      ip: this.localIp,
      connectedDevices: this.connectedDevices.size,
      startedAt: this.startedAt,
    };
  }

  /**
   * 获取连接的设备列表
   */
  getConnectedDevices(): ConnectedDevice[] {
    return Array.from(this.connectedDevices.values());
  }

  /**
   * 发送消息到指定设备
   */
  sendMessage(
    targetDeviceId: string,
    sessionId: string,
    message: { id: string; type: string; content: string }
  ): boolean {
    const target = this.connectedDevices.get(targetDeviceId);
    if (!target) {
      console.warn(`[TransferServer] Target device not found: ${targetDeviceId}`);
      return false;
    }

    const targetSocket = this.io?.sockets.sockets.get(target.socketId);
    if (!targetSocket) {
      console.warn(`[TransferServer] Target socket not found: ${target.socketId}`);
      return false;
    }

    targetSocket.emit(SOCKET_EVENTS.MESSAGE_RECEIVE, {
      senderId: this.deviceId,
      sessionId,
      message,
    });

    return true;
  }

  /**
   * 发送文件到指定设备
   */
  async sendFile(
    targetDeviceId: string,
    sessionId: string,
    filePath: string
  ): Promise<{ id: string; filename: string; fileSize: number; mimeType: string }> {
    const fs = await import('fs');
    const path = await import('path');
    const crypto = await import('crypto');

    const target = this.connectedDevices.get(targetDeviceId);
    if (!target) {
      throw createTransferError(TransferErrorCode.SESSION_NOT_FOUND);
    }

    const targetSocket = this.io?.sockets.sockets.get(target.socketId);
    if (!targetSocket) {
      throw createTransferError(TransferErrorCode.SESSION_NOT_FOUND);
    }

    const stats = fs.statSync(filePath);
    const filename = path.basename(filePath);
    const fileId = uuidv4();
    const fileSize = stats.size;
    const totalChunks = Math.ceil(fileSize / TRANSFER_CONSTANTS.CHUNK_SIZE);

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
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    targetSocket.emit(SOCKET_EVENTS.FILE_INCOMING, {
      senderId: this.deviceId,
      fileInfo: { id: fileId, filename, fileSize, mimeType, totalChunks },
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
        targetSocket.emit(SOCKET_EVENTS.FILE_CHUNK, {
          senderId: this.deviceId,
          fileId,
          chunkIndex: i,
          chunk: chunk.toString('base64'),
          totalChunks,
        });
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      targetSocket.emit(SOCKET_EVENTS.FILE_COMPLETE, {
        senderId: this.deviceId,
        fileId,
        fileHash,
      });
      console.log(`[TransferServer] File transfer to ${targetDeviceId} completed: ${fileId}`);
    })().catch(err => {
      console.error('[TransferServer] Background file send failed:', err);
    });

    return { id: fileId, filename, fileSize, mimeType };
  }

  /**
   * 发送消息已读回执
   */
  sendMessageRead(targetDeviceId: string, messageIds: string[]): boolean {
    const target = this.connectedDevices.get(targetDeviceId);
    if (!target) {
      return false;
    }

    const targetSocket = this.io?.sockets.sockets.get(target.socketId);
    if (!targetSocket) {
      return false;
    }

    targetSocket.emit(SOCKET_EVENTS.MESSAGE_READ, {
      readerId: this.deviceId,
      messageIds,
    });

    return true;
  }

  /**
   * 生成配对二维码数据
   */
  generatePairingQRData(): PairingQRData | null {
    if (!this.localIp || !this.port) {
      return null;
    }
    return createPairingQRData(this.deviceId, this.deviceName, this.localIp, this.port);
  }

  // ============================================
  // Socket 事件处理
  // ============================================

  private setupSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      console.log(`[TransferServer] New connection: ${socket.id}`);
      const clientIp = socket.handshake.address;

      // 设备注册
      socket.on(
        SOCKET_EVENTS.DEVICE_REGISTER,
        (data: { deviceId: string; deviceName: string; deviceType: DeviceType }) => {
          this.handleDeviceRegister(socket, data, clientIp);
        }
      );

      // 配对请求
      socket.on(SOCKET_EVENTS.PAIR_REQUEST, (data: { targetDeviceId: string }) => {
        this.handlePairRequest(socket, data);
      });

      // 配对接受
      socket.on(SOCKET_EVENTS.PAIR_ACCEPT, (data: { requesterId: string }) => {
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
    data: { deviceId: string; deviceName: string; deviceType: DeviceType },
    clientIp: string
  ): void {
    const { deviceId, deviceName, deviceType } = data;

    // 检查是否已存在相同设备 ID
    if (this.connectedDevices.has(deviceId)) {
      const existingDevice = this.connectedDevices.get(deviceId)!;
      // 如果是同一个 socket，更新信息
      if (existingDevice.socketId === socket.id) {
        existingDevice.lastHeartbeat = Date.now();
        return;
      }
      // 否则断开旧连接
      const oldSocket = this.io?.sockets.sockets.get(existingDevice.socketId);
      if (oldSocket) {
        oldSocket.disconnect(true);
      }
    }

    // 检查连接数限制
    if (this.connectedDevices.size >= TRANSFER_CONSTANTS.MAX_CONNECTIONS) {
      socket.emit(SOCKET_EVENTS.ERROR, createTransferError(TransferErrorCode.SERVER_FULL));
      socket.disconnect(true);
      return;
    }

    const device: ConnectedDevice = {
      id: deviceId,
      name: deviceName,
      type: deviceType,
      socketId: socket.id,
      ip: clientIp,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    this.connectedDevices.set(deviceId, device);
    this.socketToDevice.set(socket.id, deviceId);

    console.log(`[TransferServer] Device registered: ${deviceName} (${deviceId})`);

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

    // 自动为新连接的设备创建配对会话
    // 这样手机端扫码连接后就能自动看到与桌面端的会话
    const sessionId = uuidv4();
    socket.emit(SOCKET_EVENTS.PAIR_SUCCESS, {
      sessionId,
      peerId: this.deviceId,
      peerName: this.deviceName,
    });
    console.log(`[TransferServer] Auto-paired with device: ${deviceName}, sessionId: ${sessionId}`);

    // 发出事件通知 main.ts 创建会话记录
    this.emit('session:created', {
      sessionId,
      peerDeviceId: deviceId,
      peerDeviceName: deviceName,
    });

    this.emit('device:connected', device);
    this.emit('device:list-updated', this.getConnectedDevices());
  }

  private handlePairRequest(socket: Socket, data: { targetDeviceId: string }): void {
    const requesterId = this.socketToDevice.get(socket.id);
    if (!requesterId) return;

    const requester = this.connectedDevices.get(requesterId);
    const target = this.connectedDevices.get(data.targetDeviceId);

    if (!requester || !target) {
      socket.emit(SOCKET_EVENTS.ERROR, createTransferError(TransferErrorCode.SESSION_NOT_FOUND));
      return;
    }

    const pairingId = `${requesterId}-${data.targetDeviceId}`;
    this.pendingPairings.set(pairingId, {
      requesterId,
      targetId: data.targetDeviceId,
      timestamp: Date.now(),
      expiresAt: Date.now() + TRANSFER_CONSTANTS.QR_CODE_EXPIRY,
    });

    // 发送配对请求给目标设备
    const targetSocket = this.io?.sockets.sockets.get(target.socketId);
    if (targetSocket) {
      targetSocket.emit(SOCKET_EVENTS.PAIR_REQUEST, {
        requesterId,
        requesterName: requester.name,
      });
    }

    this.emit('pair:request', { requesterId, requesterName: requester.name });
  }

  private handlePairAccept(socket: Socket, data: { requesterId: string }): void {
    const accepterId = this.socketToDevice.get(socket.id);
    if (!accepterId) return;

    const pairingId = `${data.requesterId}-${accepterId}`;
    const pairing = this.pendingPairings.get(pairingId);

    if (!pairing || Date.now() > pairing.expiresAt) {
      socket.emit(SOCKET_EVENTS.ERROR, createTransferError(TransferErrorCode.PAIRING_TIMEOUT));
      return;
    }

    this.pendingPairings.delete(pairingId);

    const sessionId = uuidv4();
    const requester = this.connectedDevices.get(data.requesterId);
    const accepter = this.connectedDevices.get(accepterId);

    if (!requester || !accepter) return;

    // 通知双方配对成功
    const requesterSocket = this.io?.sockets.sockets.get(requester.socketId);
    if (requesterSocket) {
      requesterSocket.emit(SOCKET_EVENTS.PAIR_SUCCESS, {
        sessionId,
        peerId: accepterId,
        peerName: accepter.name,
      });
    }

    socket.emit(SOCKET_EVENTS.PAIR_SUCCESS, {
      sessionId,
      peerId: data.requesterId,
      peerName: requester.name,
    });

    this.emit('session:created', {
      sessionId,
      peerDeviceId: data.requesterId,
      peerDeviceName: requester.name,
    });

    this.emit('pair:success', {
      sessionId,
      peerId: data.requesterId,
      peerName: requester.name,
    });
  }

  private handlePairReject(socket: Socket, data: { requesterId: string }): void {
    const rejecterId = this.socketToDevice.get(socket.id);
    if (!rejecterId) return;

    const pairingId = `${data.requesterId}-${rejecterId}`;
    this.pendingPairings.delete(pairingId);

    const requester = this.connectedDevices.get(data.requesterId);
    if (requester) {
      const requesterSocket = this.io?.sockets.sockets.get(requester.socketId);
      if (requesterSocket) {
        requesterSocket.emit(
          SOCKET_EVENTS.ERROR,
          createTransferError(TransferErrorCode.PAIRING_REJECTED)
        );
      }
    }
  }

  private handleMessageSend(socket: Socket, data: any): void {
    const senderId = this.socketToDevice.get(socket.id);
    if (!senderId) {
      console.warn('[TransferServer] handleMessageSend: senderId not found for socket', socket.id);
      return;
    }

    const { targetDeviceId, sessionId, message } = data;
    console.log(
      `[TransferServer] handleMessageSend: from=${senderId}, to=${targetDeviceId}, sessionId=${sessionId}`
    );
    console.log(`[TransferServer] handleMessageSend: this.deviceId=${this.deviceId}`);
    console.log(
      `[TransferServer] handleMessageSend: targetDeviceId === this.deviceId: ${targetDeviceId === this.deviceId}`
    );
    console.log(`[TransferServer] handleMessageSend: message=`, message);

    // 检查目标是否是桌面端自己
    if (targetDeviceId === this.deviceId) {
      console.log(`[TransferServer] Message received for desktop from ${senderId}`);
      this.updateSessionActivity(sessionId, [senderId, targetDeviceId]);
      this.emit('message:received', { senderId, sessionId, message });
      return;
    }

    // 消息发给其他连接的设备
    const target = this.connectedDevices.get(targetDeviceId);

    if (!target) {
      console.log(
        `[TransferServer] Target device ${targetDeviceId} not found in connected devices`
      );
      console.log(`[TransferServer] Connected devices:`, Array.from(this.connectedDevices.keys()));
      socket.emit(SOCKET_EVENTS.ERROR, createTransferError(TransferErrorCode.SESSION_NOT_FOUND));
      return;
    }

    // 更新会话活动时间
    this.updateSessionActivity(sessionId, [senderId, targetDeviceId]);

    const targetSocket = this.io?.sockets.sockets.get(target.socketId);
    if (targetSocket) {
      console.log(`[TransferServer] Forwarding message to device ${targetDeviceId}`);
      targetSocket.emit(SOCKET_EVENTS.MESSAGE_RECEIVE, {
        senderId,
        sessionId,
        message,
      });
    } else {
      console.warn(`[TransferServer] Target socket not found for device ${targetDeviceId}`);
    }

    // Do NOT emit 'message:received' for forwarded messages
    // Only desktop-targeted messages should be saved to desktop's own history
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
    if (!senderId) {
      console.warn('[TransferServer] handleFileStart: senderId not found');
      return;
    }

    const { targetDeviceId, fileInfo, sessionId } = data;
    console.log(`[TransferServer] handleFileStart: from=${senderId}, to=${targetDeviceId}`);
    console.log(`[TransferServer] handleFileStart: this.deviceId=${this.deviceId}`);
    console.log(
      `[TransferServer] handleFileStart: targetDeviceId === this.deviceId: ${targetDeviceId === this.deviceId}`
    );
    console.log(`[TransferServer] handleFileStart: fileInfo=`, fileInfo);

    // 检查目标是否是桌面端自己
    if (targetDeviceId === this.deviceId) {
      // 文件发给桌面端自己，创建写入流并保存文件
      console.log(
        `[TransferServer] File incoming for desktop from ${senderId}: ${fileInfo?.filename}`
      );

      try {
        // 创建下载目录
        const downloadPath = app.getPath('downloads');
        const targetDir = path.join(downloadPath, 'NextNotebook');
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        // 创建目标文件路径（处理文件名冲突）
        let targetPath = path.join(targetDir, path.basename(fileInfo.filename));
        let counter = 1;
        const ext = path.extname(fileInfo.filename);
        const baseName = path.basename(fileInfo.filename, ext);
        while (fs.existsSync(targetPath)) {
          targetPath = path.join(targetDir, `${baseName}_${counter}${ext}`);
          counter++;
        }

        // 创建写入流
        const stream = fs.createWriteStream(targetPath);
        this.fileStreams.set(fileInfo.id, stream);
        this.fileInfoCache.set(fileInfo.id, {
          filename: fileInfo.filename,
          localPath: targetPath,
          sessionId: sessionId,
        });

        console.log(`[TransferServer] Created write stream for file: ${targetPath}`);
      } catch (error) {
        console.error('[TransferServer] Failed to create write stream:', error);
      }

      this.emit('file:incoming', { senderId, fileInfo, sessionId });
      return;
    }

    const target = this.connectedDevices.get(targetDeviceId);

    if (!target) {
      console.warn(`[TransferServer] handleFileStart: target device ${targetDeviceId} not found`);
      console.log(`[TransferServer] Connected devices:`, Array.from(this.connectedDevices.keys()));
      socket.emit(SOCKET_EVENTS.ERROR, createTransferError(TransferErrorCode.SESSION_NOT_FOUND));
      return;
    }

    const targetSocket = this.io?.sockets.sockets.get(target.socketId);
    if (targetSocket) {
      console.log(`[TransferServer] Forwarding file start to device ${targetDeviceId}`);
      targetSocket.emit(SOCKET_EVENTS.FILE_INCOMING, {
        senderId,
        fileInfo,
      });
    }

    // Forward only; do NOT emit 'file:incoming' to desktop for relayed files
    // The desktop handler only cares about files addressed to itself
  }

  private handleFileChunk(socket: Socket, data: any): void {
    const senderId = this.socketToDevice.get(socket.id);
    if (!senderId) return;

    const { targetDeviceId, fileId, chunkIndex, chunk, totalChunks } = data;

    // 检查目标是否是桌面端自己
    if (targetDeviceId === this.deviceId) {
      // 文件块发给桌面端自己，写入文件
      const stream = this.fileStreams.get(fileId);
      if (stream) {
        try {
          // chunk 是 base64 编码的字符串，需要解码
          const buffer = Buffer.from(chunk, 'base64');
          stream.write(buffer);
        } catch (error) {
          console.error('[TransferServer] Failed to write chunk:', error);
        }
      }
      this.emit('file:chunk', { senderId, fileId, chunkIndex, chunk, totalChunks });
      return;
    }

    const target = this.connectedDevices.get(targetDeviceId);

    if (!target) return;

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

    // 检查目标是否是桌面端自己
    if (targetDeviceId === this.deviceId) {
      // 文件完成发给桌面端自己，关闭写入流
      console.log(`[TransferServer] File complete for desktop from ${senderId}`);

      const stream = this.fileStreams.get(fileId);
      const fileInfo = this.fileInfoCache.get(fileId);

      if (stream) {
        stream.end();
        this.fileStreams.delete(fileId);
        console.log(`[TransferServer] Closed write stream for file: ${fileInfo?.localPath}`);
      }

      // 发出事件，包含本地路径和 sessionId
      this.emit('file:complete', {
        senderId,
        fileId,
        fileHash,
        localPath: fileInfo?.localPath,
        filename: fileInfo?.filename,
        sessionId: fileInfo?.sessionId,
      });

      this.fileInfoCache.delete(fileId);
      return;
    }

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

    // 检查目标是否是桌面端自己
    if (targetDeviceId === this.deviceId) {
      // 取消文件传输，清理写入流和临时文件
      const stream = this.fileStreams.get(fileId);
      const fileInfo = this.fileInfoCache.get(fileId);

      if (stream) {
        stream.end();
        this.fileStreams.delete(fileId);

        // 删除未完成的文件
        if (fileInfo?.localPath && fs.existsSync(fileInfo.localPath)) {
          try {
            fs.unlinkSync(fileInfo.localPath);
            console.log(`[TransferServer] Deleted incomplete file: ${fileInfo.localPath}`);
          } catch (error) {
            console.error('[TransferServer] Failed to delete incomplete file:', error);
          }
        }
      }

      this.fileInfoCache.delete(fileId);
      return;
    }

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
      console.log(`[TransferServer] Device disconnected: ${device.name} (${deviceId})`);

      this.connectedDevices.delete(deviceId);
      this.socketToDevice.delete(socket.id);

      // 清理该设备的所有进行中文件传输
      for (const [fileId, info] of this.fileInfoCache) {
        if (info.sessionId) {
          const stream = this.fileStreams.get(fileId);
          if (stream) {
            try {
              stream.end();
            } catch (e) {
              /* ignore */
            }
            this.fileStreams.delete(fileId);
          }
          if (info.localPath && fs.existsSync(info.localPath)) {
            try {
              fs.unlinkSync(info.localPath);
            } catch (e) {
              /* ignore */
            }
          }
          this.fileInfoCache.delete(fileId);
        }
      }

      // 广播设备下线
      this.io?.emit(SOCKET_EVENTS.DEVICE_OFFLINE, { deviceId });

      this.emit('device:disconnected', deviceId);
      this.emit('device:list-updated', this.getConnectedDevices());
    }
  }

  // ============================================
  // 辅助方法
  // ============================================

  private getDeviceListForClient(excludeDeviceId: string): Array<{
    id: string;
    name: string;
    type: DeviceType;
  }> {
    return Array.from(this.connectedDevices.values())
      .filter(d => d.id !== excludeDeviceId)
      .map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
      }));
  }

  private startHeartbeatCheck(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = TRANSFER_CONSTANTS.SESSION_TIMEOUT;

      for (const [deviceId, device] of this.connectedDevices) {
        if (now - device.lastHeartbeat > timeout) {
          console.log(`[TransferServer] Device timeout: ${device.name}`);
          const socket = this.io?.sockets.sockets.get(device.socketId);
          if (socket) {
            socket.disconnect(true);
          }
        }
      }
    }, TRANSFER_CONSTANTS.HEARTBEAT_INTERVAL);
  }

  /**
   * 启动会话超时检查
   */
  private startSessionTimeoutCheck(): void {
    this.sessionTimeoutInterval = setInterval(() => {
      const now = Date.now();
      const timeout = TRANSFER_CONSTANTS.SESSION_TIMEOUT;

      for (const [sessionId, session] of this.activeSessions) {
        if (now - session.lastActivity > timeout) {
          console.log(`[TransferServer] Session timeout: ${sessionId}`);
          this.closeSession(sessionId);
        }
      }
    }, 60000); // 每分钟检查一次
  }

  /**
   * 更新会话活动时间
   */
  updateSessionActivity(sessionId: string, deviceIds?: string[]): void {
    const existing = this.activeSessions.get(sessionId);
    if (existing) {
      existing.lastActivity = Date.now();
    } else if (deviceIds) {
      this.activeSessions.set(sessionId, {
        lastActivity: Date.now(),
        deviceIds,
      });
    }
  }

  /**
   * 关闭会话
   */
  closeSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    // 通知会话中的设备
    for (const deviceId of session.deviceIds) {
      const device = this.connectedDevices.get(deviceId);
      if (device) {
        const socket = this.io?.sockets.sockets.get(device.socketId);
        if (socket) {
          socket.emit('session:closed', { sessionId, reason: 'timeout' });
        }
      }
    }

    this.activeSessions.delete(sessionId);
    console.log(`[TransferServer] Session closed: ${sessionId}`);
  }

  /**
   * 获取活跃会话列表
   */
  getActiveSessions(): Array<{ sessionId: string; lastActivity: number; deviceIds: string[] }> {
    return Array.from(this.activeSessions.entries()).map(([sessionId, data]) => ({
      sessionId,
      ...data,
    }));
  }

  /**
   * 获取本机局域网 IP
   */
  private getLocalIP(): string | null {
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
      const netInterface = interfaces[name];
      if (!netInterface) continue;

      for (const info of netInterface) {
        // 跳过内部地址和 IPv6
        if (info.internal || info.family !== 'IPv4') continue;

        // 优先返回常见的局域网地址
        if (info.address.startsWith('192.168.') || info.address.startsWith('10.')) {
          return info.address;
        }
        const match = info.address.match(/^172\.(\d+)\./);
        if (match) {
          const secondOctet = parseInt(match[1], 10);
          if (secondOctet >= 16 && secondOctet <= 31) {
            return info.address;
          }
        }
      }
    }

    return null;
  }

  /**
   * 查找可用端口
   */
  private async findAvailablePort(preferredPort?: number): Promise<number> {
    const startPort = preferredPort || TRANSFER_CONSTANTS.PORT_RANGE_START;
    const endPort = TRANSFER_CONSTANTS.PORT_RANGE_END;

    for (let port = startPort; port <= endPort; port++) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }

    throw createTransferError(TransferErrorCode.PORT_IN_USE);
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port);
    });
  }
}

export default TransferServer;
