import { app, ipcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { TransferServer } from './TransferServer';
import { RelayClient, relayClient } from './RelayClient';
import { TransferDatabase } from '../../core/transfer/TransferDatabase';
import { DeviceType } from '@shared/transfer/constants';

class TransferService {
  private db: TransferDatabase | null = null;
  private server: TransferServer | null = null;
  private relay: RelayClient = relayClient;

  private fileStreams: Map<string, fs.WriteStream> = new Map();
  private filePaths: Map<string, string> = new Map();

  private deviceId: string = '';
  private deviceName: string = '';

  private relayEventCleanup: (() => void) | null = null;
  private relaySetupDone = false;
  private relayListeners: Array<{ event: string; fn: any }> = [];

  constructor() {
    this.loadDeviceInfo();
  }

  private loadDeviceInfo() {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'settings.json');

    try {
      let settings: any = {};
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }

      if (!settings.deviceId) {
        settings.deviceId = uuidv4();
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      }

      this.deviceId = settings.deviceId;
      this.deviceName = os.hostname() || 'Desktop';
    } catch (e) {
      console.error('[TransferService] Failed to load device info:', e);
      this.deviceId = uuidv4();
      this.deviceName = os.hostname() || 'Desktop';
    }
  }

  async initialize(): Promise<void> {
    const userDataPath = app.getPath('userData');

    this.db = new TransferDatabase(userDataPath);
    this.db.initialize();

    this.registerIpcHandlers();

    console.log('[TransferService] Initialized');
  }

  destroy(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
    this.cleanupRelayListeners();
    this.relay.disconnect();
    this.cleanupAllFileStreams();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private cleanupAllFileStreams() {
    for (const [fileId, stream] of this.fileStreams) {
      try {
        stream.end();
        const filePath = this.filePaths.get(fileId);
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.error('[TransferService] Failed to cleanup file stream:', e);
      }
    }
    this.fileStreams.clear();
    this.filePaths.clear();
  }

  private broadcast(channel: string, data?: any) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });

    if (channel === 'transfer:file-complete' && data) {
      const { Notification } = require('electron');
      new Notification({ title: '文件传输完成', body: '收到新文件' }).show();
    } else if (channel === 'transfer:message-received' && data) {
      const content = data.message?.content || data.desktopMessage?.content || '收到新消息';
      const { Notification } = require('electron');
      new Notification({
        title: '新消息',
        body: typeof content === 'string' ? content : '收到新消息',
      }).show();
    }
  }

  private getOrCreateSessionForDevice(senderId: string, senderName?: string): string {
    if (!this.db) return 'unknown';

    const sessions = this.db.getSessionsByDevice(senderId);
    if (sessions.length > 0) return sessions[0].id;

    const connectionType: 'lan' | 'relay' = this.relay.isConnected() ? 'relay' : 'lan';

    let deviceName = senderName || senderId;
    const device = this.server?.getConnectedDevices().find(d => d.id === senderId);
    if (device) {
      deviceName = device.name;
      try {
        this.db.createDevice({
          id: device.id,
          name: device.name,
          type: device.type,
          last_ip: device.ip || '',
          last_port: 0,
          last_seen: Date.now(),
          is_favorite: 0,
        });
      } catch (e) {
        // device may already exist
      }
    }

    const sessionId = uuidv4();
    this.db.createSession({
      id: sessionId,
      peer_device_id: senderId,
      peer_device_name: deviceName,
      connection_type: connectionType,
      started_at: Date.now(),
      ended_at: null,
    });
    console.log(
      '[TransferService] Created session:',
      sessionId,
      'for device:',
      deviceName,
      'type:',
      connectionType
    );
    return sessionId;
  }

  private setupServerListeners() {
    if (!this.server) return;

    this.server.on('device:connected', device => {
      if (this.db) {
        try {
          this.db.createDevice({
            id: device.id,
            name: device.name,
            type: device.type,
            last_ip: device.ip,
            last_port: 0,
            last_seen: Date.now(),
            is_favorite: 0,
          });
        } catch (e) {
          // device may already exist
        }
      }
      this.broadcast('transfer:device-connected', device);
    });

    this.server.on('device:disconnected', deviceId => {
      this.cleanupDeviceFileStreams(deviceId);
      if (this.db) {
        const sessions = this.db.getSessionsByDevice(deviceId);
        for (const session of sessions) {
          if (!session.ended_at) {
            this.db.endSession(session.id);
          }
        }
      }
      this.broadcast('transfer:device-disconnected', deviceId);
    });

    this.server.on('device:list-updated', devices => {
      this.broadcast('transfer:device-list-updated', devices);
    });

    this.server.on('session:created', data => {
      const { sessionId, peerDeviceId, peerDeviceName } = data;
      if (this.db) {
        const device = this.server?.getConnectedDevices().find(d => d.id === peerDeviceId);
        try {
          this.db.createDevice({
            id: peerDeviceId,
            name: peerDeviceName,
            type: device?.type || 'android',
            last_ip: device?.ip || '',
            last_port: 0,
            last_seen: Date.now(),
            is_favorite: 0,
          });
        } catch (e) {
          /* may exist */
        }

        try {
          this.db.createSession({
            id: sessionId,
            peer_device_id: peerDeviceId,
            peer_device_name: peerDeviceName,
            connection_type: 'lan',
            started_at: Date.now(),
            ended_at: null,
          });
        } catch (e) {
          /* may exist */
        }
      }

      this.broadcast('transfer:session-created', { sessionId, peerDeviceId, peerDeviceName });
    });

    this.server.on('message:received', data => {
      const { senderId, sessionId, message } = data;
      if (!message || message.id === undefined) return;

      const isForDesktop = this.isMessageForDesktop(data);
      if (!isForDesktop) return;

      const targetSessionId = sessionId || this.getOrCreateSessionForDevice(senderId);
      if (this.db && message && message.id) {
        this.db.createMessage({
          id: message.id,
          session_id: targetSessionId,
          direction: 'received',
          type: message.type || 'text',
          content: message.content || '',
          file_id: message.fileId || null,
          created_at: Date.now(),
          read_at: null,
        });
      }

      this.broadcast('transfer:message-received', {
        ...data,
        desktopSessionId: targetSessionId,
      });
    });

    this.server.on('file:incoming', data => {
      const { senderId, fileInfo, sessionId } = data;
      if (!fileInfo || !fileInfo.id) return;

      const isForDesktop = this.isFileForDesktop(data);
      if (!isForDesktop) return;

      const targetSessionId = sessionId || this.getOrCreateSessionForDevice(senderId);
      this.handleFileIncoming(fileInfo, targetSessionId);

      this.broadcast('transfer:file-incoming', {
        ...data,
        desktopSessionId: targetSessionId,
      });
    });

    this.server.on('file:chunk', data => {
      const { fileId, chunkIndex, totalChunks } = data;
      if (!fileId) return;

      const stream = this.fileStreams.get(fileId);
      if (stream) {
        try {
          const buffer = Buffer.from(data.chunk, 'base64');
          stream.write(buffer);
        } catch (e) {
          console.error('[TransferService] Failed to write chunk:', e);
        }
      }

      if (this.db && totalChunks > 0) {
        const progress = ((chunkIndex + 1) / totalChunks) * 100;
        this.db.updateFileProgress(fileId, progress);
      }

      this.broadcast('transfer:file-chunk', data);
    });

    this.server.on('file:complete', data => {
      const { fileId, fileHash } = data;
      if (!fileId) return;

      this.handleFileComplete(fileId, fileHash);

      this.broadcast('transfer:file-complete', data);
    });
  }

  private isMessageForDesktop(data: any): boolean {
    if (!this.server) return false;
    const serverAny = this.server as any;
    return !data.targetDeviceId || data.targetDeviceId === this.deviceId;
  }

  private isFileForDesktop(data: any): boolean {
    if (!this.server) return false;
    return !data.targetDeviceId || data.targetDeviceId === this.deviceId;
  }

  private handleFileIncoming(fileInfo: any, sessionId: string) {
    try {
      const downloadPath = app.getPath('downloads');
      const targetDir = path.join(downloadPath, 'NextNotebook');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      let targetPath = path.join(targetDir, path.basename(fileInfo.filename));
      const ext = path.extname(fileInfo.filename);
      const baseName = path.basename(fileInfo.filename, ext);
      let counter = 1;
      while (fs.existsSync(targetPath)) {
        targetPath = path.join(targetDir, `${baseName}_${counter}${ext}`);
        counter++;
      }

      const stream = fs.createWriteStream(targetPath);
      stream.on('error', err => {
        console.error('[TransferService] Write stream error:', err);
        this.fileStreams.delete(fileInfo.id);
        this.filePaths.delete(fileInfo.id);
      });

      this.fileStreams.set(fileInfo.id, stream);
      this.filePaths.set(fileInfo.id, targetPath);

      if (this.db) {
        this.db.createFileTransfer({
          id: fileInfo.id,
          session_id: sessionId,
          filename: fileInfo.filename,
          file_size: fileInfo.fileSize,
          mime_type: fileInfo.mimeType,
          local_path: targetPath,
          direction: 'received',
          status: 'transferring',
          progress: 0,
          file_hash: null,
          created_at: Date.now(),
          completed_at: null,
        });
      }
    } catch (e) {
      console.error('[TransferService] Failed to handle incoming file:', e);
    }
  }

  private handleFileComplete(fileId: string, fileHash?: string) {
    const stream = this.fileStreams.get(fileId);
    const localPath = this.filePaths.get(fileId);

    if (stream) {
      try {
        stream.end();
      } catch (e) {
        console.error('[TransferService] Error closing stream:', e);
      }
      this.fileStreams.delete(fileId);
    }
    this.filePaths.delete(fileId);

    if (this.db && localPath) {
      let verifiedHash: string | undefined = fileHash || undefined;
      if (fs.existsSync(localPath)) {
        try {
          const fileBuffer = fs.readFileSync(localPath);
          const computedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
          if (fileHash && computedHash !== fileHash) {
            console.error(
              `[TransferService] Hash mismatch for ${fileId}: expected ${fileHash}, got ${computedHash}`
            );
          }
          verifiedHash = computedHash;
        } catch (e) {
          console.error('[TransferService] Failed to verify file hash:', e);
        }
      }
      this.db.completeFileTransfer(fileId, localPath, verifiedHash);
      console.log('[TransferService] File transfer completed:', localPath);
    }
  }

  private cleanupDeviceFileStreams(deviceId: string) {
    if (!this.db) return;
    const sessions = this.db.getSessionsByDevice(deviceId);
    for (const session of sessions) {
      const files = this.db.getFilesBySession(session.id);
      for (const file of files) {
        if (file.status === 'transferring') {
          const stream = this.fileStreams.get(file.id);
          if (stream) {
            try {
              stream.end();
            } catch (e) {
              /* ignore */
            }
            this.fileStreams.delete(file.id);
          }
          const filePath = this.filePaths.get(file.id);
          if (filePath && fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (e) {
              /* ignore */
            }
          }
          this.filePaths.delete(file.id);
          this.db.failFileTransfer(file.id);
        }
      }
    }
  }

  private setupRelayListeners() {
    if (this.relaySetupDone) {
      return;
    }
    this.relaySetupDone = true;

    const on = (event: string, fn: any) => {
      (this.relay as any).on(event, fn);
      this.relayListeners.push({ event, fn });
    };

    on('connected', () => this.broadcast('transfer:relay:connected'));
    on('disconnected', (reason: string) => this.broadcast('transfer:relay:disconnected', reason));
    on('error', (err: any) => this.broadcast('transfer:relay:error', err));
    on('device:list', (devices: any) => this.broadcast('transfer:relay:device-list', devices));

    on('message:received', (data: any) => {
      const { senderId, sessionId, message } = data;
      if (this.db && message && message.id) {
        const targetSessionId = sessionId || this.getOrCreateSessionForDevice(senderId);
        this.db.createMessage({
          id: message.id,
          session_id: targetSessionId,
          direction: 'received',
          type: message.type || 'text',
          content: message.content || '',
          file_id: message.fileId || null,
          created_at: Date.now(),
          read_at: null,
        });
        const payload = { ...data, desktopSessionId: targetSessionId };
        this.broadcast('transfer:message-received', payload);
        this.broadcast('transfer:relay:message-received', payload);
      } else {
        this.broadcast('transfer:relay:message-received', data);
        this.broadcast('transfer:message-received', data);
      }
    });

    on('file:incoming', (data: any) => {
      const { senderId, fileInfo, sessionId } = data;
      if (fileInfo && fileInfo.id && this.db) {
        const targetSessionId = sessionId || this.getOrCreateSessionForDevice(senderId);
        this.handleFileIncoming(fileInfo, targetSessionId);
        const payload = { ...data, desktopSessionId: targetSessionId };
        this.broadcast('transfer:file-incoming', payload);
        this.broadcast('transfer:relay:file-incoming', payload);
      } else {
        this.broadcast('transfer:relay:file-incoming', data);
        this.broadcast('transfer:file-incoming', data);
      }
    });

    on('file:chunk', (data: any) => {
      const { fileId, chunkIndex, totalChunks } = data;
      if (fileId) {
        const stream = this.fileStreams.get(fileId);
        if (stream) {
          try {
            const chunk = Buffer.isBuffer(data.chunk)
              ? data.chunk
              : Buffer.from(data.chunk, 'base64');
            stream.write(chunk);
          } catch (e) {
            console.error('[TransferService] Relay chunk write error:', e);
          }
        }
        if (this.db && totalChunks > 0) {
          const progress = ((chunkIndex + 1) / totalChunks) * 100;
          this.db.updateFileProgress(fileId, progress);
        }
      }
      this.broadcast('transfer:relay:file-chunk', data);
      this.broadcast('transfer:file-chunk', data);
    });

    on('file:complete', (data: any) => {
      const { fileId } = data;
      if (fileId) {
        this.handleFileComplete(fileId, data.fileHash);
      }
      this.broadcast('transfer:relay:file-complete', data);
      this.broadcast('transfer:file-complete', data);
    });

    on('pair:request', (data: any) => {
      const sessionId = this.relay.acceptPairRequest(data.requesterId);
      console.log(
        `[TransferService] Auto accepted relay pair from ${data.requesterName}, sessionId: ${sessionId}`
      );
    });

    on('pair:success', (data: any) => {
      console.log(`[TransferService] Relay pair success with ${data.peerName}`);
      this.broadcast('transfer:relay:pair-success', data);
      this.broadcast('transfer:session-created', {
        sessionId: data.sessionId,
        peerDeviceId: data.peerId,
        peerDeviceName: data.peerName,
      });
    });
  }

  private cleanupRelayListeners() {
    for (const { event, fn } of this.relayListeners) {
      this.relay.off(event as any, fn);
    }
    this.relayListeners = [];
    this.relaySetupDone = false;
  }

  private registerIpcHandlers() {
    ipcMain.handle('transfer:startServer', async (_, port?) => {
      try {
        if (this.server) {
          return this.server.getStatus();
        }

        this.server = new TransferServer(this.deviceId, this.deviceName);
        this.setupServerListeners();
        const status = await this.server.start(port);
        console.log('[TransferService] Server started:', status);
        return status;
      } catch (error) {
        console.error('[TransferService] transfer:startServer error:', error);
        throw error;
      }
    });

    ipcMain.handle('transfer:stopServer', async () => {
      try {
        if (this.server) {
          await this.server.stop();
          this.server = null;
        }
        return true;
      } catch (error) {
        console.error('[TransferService] transfer:stopServer error:', error);
        throw error;
      }
    });

    ipcMain.handle('transfer:getServerStatus', () => {
      if (this.server) {
        return this.server.getStatus();
      }
      return { running: false, port: null, ip: null, connectedDevices: 0, startedAt: null };
    });

    ipcMain.handle('transfer:getConnectedDevices', () => {
      return this.server?.getConnectedDevices() || [];
    });

    ipcMain.handle('transfer:generateQRData', () => {
      return this.server?.generatePairingQRData() || null;
    });

    ipcMain.handle('transfer:getDeviceInfo', () => ({
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      deviceType: 'desktop' as DeviceType,
    }));

    ipcMain.handle('transfer:sendMessage', async (_, targetDeviceId, sessionId, message) => {
      if (this.server?.sendMessage(targetDeviceId, sessionId, message)) {
        return true;
      }
      return this.relay.sendMessage(targetDeviceId, sessionId, message);
    });

    ipcMain.handle('transfer:sendFile', async (_, targetDeviceId, sessionId, filePath) => {
      try {
        return await this.server?.sendFile(targetDeviceId, sessionId, filePath);
      } catch (e) {
        return await this.relay.sendFile(targetDeviceId, sessionId, filePath);
      }
    });

    ipcMain.handle('transfer:sendMessageRead', (_, targetDeviceId, messageIds) => {
      if (!this.server?.sendMessageRead(targetDeviceId, messageIds)) {
        this.relay.sendMessageRead(targetDeviceId, messageIds);
      }
    });

    // DB Operations
    ipcMain.handle('transfer:db:createDevice', (_, d) => this.db?.createDevice(d));
    ipcMain.handle('transfer:db:getDevice', (_, id) => this.db?.getDeviceById(id));
    ipcMain.handle('transfer:db:getAllDevices', () => this.db?.getAllDevices());
    ipcMain.handle('transfer:db:updateDevice', (_, id, u) => this.db?.updateDevice(id, u));
    ipcMain.handle('transfer:db:deleteDevice', (_, id) => this.db?.deleteDevice(id));

    ipcMain.handle('transfer:db:createSession', (_, s) => this.db?.createSession(s));
    ipcMain.handle('transfer:db:getSession', (_, id) => this.db?.getSessionById(id));
    ipcMain.handle('transfer:db:getAllSessions', () => this.db?.getAllSessions() ?? []);
    ipcMain.handle('transfer:db:getSessionsByDevice', (_, id) => this.db?.getSessionsByDevice(id));
    ipcMain.handle('transfer:db:endSession', (_, id) => this.db?.endSession(id));
    ipcMain.handle('transfer:db:deleteSession', (_, id) => this.db?.deleteSession(id));

    ipcMain.handle('transfer:db:createMessage', (_, m) => this.db?.createMessage(m));
    ipcMain.handle('transfer:db:getMessage', (_, id) => this.db?.getMessageById(id));
    ipcMain.handle('transfer:db:getMessagesBySession', (_, id, lim, off) =>
      this.db?.getMessagesBySession(id, lim, off)
    );
    ipcMain.handle('transfer:db:markMessageAsRead', (_, id) => this.db?.markMessageAsRead(id));
    ipcMain.handle('transfer:db:markSessionMessagesAsRead', (_, id) =>
      this.db?.markSessionMessagesAsRead(id)
    );
    ipcMain.handle('transfer:db:deleteMessage', (_, id) => this.db?.deleteMessage(id));

    ipcMain.handle('transfer:db:createFileTransfer', (_, f) => this.db?.createFileTransfer(f));
    ipcMain.handle('transfer:db:getFile', (_, id) => this.db?.getFileById(id));
    ipcMain.handle('transfer:db:getFilesBySession', (_, id) => this.db?.getFilesBySession(id));
    ipcMain.handle('transfer:db:updateFileProgress', (_, id, p) =>
      this.db?.updateFileProgress(id, p)
    );
    ipcMain.handle('transfer:db:completeFileTransfer', (_, id, p, h) =>
      this.db?.completeFileTransfer(id, p, h)
    );
    ipcMain.handle('transfer:db:failFileTransfer', (_, id) => this.db?.failFileTransfer(id));
    ipcMain.handle('transfer:db:cancelFileTransfer', (_, id) => this.db?.cancelFileTransfer(id));
    ipcMain.handle('transfer:db:deleteFile', (_, id) => this.db?.deleteFile(id));

    ipcMain.handle('transfer:db:getStats', () => this.db?.getStats());
    ipcMain.handle('transfer:db:cleanupOldSessions', (_, d) => this.db?.cleanupOldSessions(d));
    ipcMain.handle('transfer:db:cleanupFailedTransfers', () => this.db?.cleanupFailedTransfers());

    // Relay
    ipcMain.handle('transfer:relay:connect', async (_, url, key) => {
      try {
        this.setupRelayListeners();
        await this.relay.connect({
          serverUrl: url,
          relayKey: key,
          deviceId: this.deviceId,
          deviceName: this.deviceName,
        });
        return true;
      } catch (error) {
        console.error('[TransferService] relay:connect error:', error);
        throw error;
      }
    });

    ipcMain.handle('transfer:relay:disconnect', () => {
      this.relay.disconnect();
      return true;
    });

    ipcMain.handle('transfer:relay:getStatus', () => this.relay.getStatus());
    ipcMain.handle('transfer:relay:getConnectedDevices', () => this.relay.getConnectedDevices());
    ipcMain.handle('transfer:relay:sendMessage', (_, targetDeviceId, sessionId, message) => {
      return this.relay.sendMessage(targetDeviceId, sessionId, message);
    });
    ipcMain.handle('transfer:relay:sendFile', async (_, targetDeviceId, sessionId, filePath) => {
      return await this.relay.sendFile(targetDeviceId, sessionId, filePath);
    });
  }
}

export const transferService = new TransferService();
export const initializeTransferService = () => transferService.initialize();
