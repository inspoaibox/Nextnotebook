import { app, ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { TransferServer, ServerStatus, ConnectedDevice } from './TransferServer';
import { RelayClient, relayClient } from './RelayClient';
import { TransferDatabase, TransferMessage, TransferFile, TransferSession, TransferDevice } from '../../core/transfer/TransferDatabase';
import { TRANSFER_CONSTANTS, DeviceType, MessageType, FileTransferStatus } from '@shared/transfer/constants';

// ============================================
// TransferService
// ============================================

class TransferService {
    private db: TransferDatabase | null = null;
    private server: TransferServer | null = null;
    private relay: RelayClient = relayClient;

    // File streams for incoming files via LAN (TransferServer)
    // RelayClient manages its own streams, but TransferServer emits chunks that we must handle.
    private fileStreams: Map<string, fs.WriteStream> = new Map();
    private filePaths: Map<string, string> = new Map();

    private deviceId: string = '';
    private deviceName: string = '';

    constructor() {
        this.loadDeviceInfo();
    }

    private loadDeviceInfo() {
        // Load or generate device ID from settings
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
            this.deviceName = os.hostname(); // Default to hostname
        } catch (e) {
            console.error('[TransferService] Failed to load device info:', e);
            this.deviceId = uuidv4();
            this.deviceName = os.hostname();
        }
    }

    /**
     * Initialize the service
     */
    async initialize(): Promise<void> {
        const userDataPath = app.getPath('userData');

        // 1. Initialize Database
        this.db = new TransferDatabase(userDataPath);
        this.db.initialize();

        // 2. Initialize Server
        this.server = new TransferServer(this.deviceId, this.deviceName);

        // 3. Initialize Relay Client
        this.relay.setDatabase(this.db); // RelayClient handles its own DB writes for some events

        // 4. Register IPC Handlers
        this.registerIpcHandlers();

        // 5. Setup Event Listeners
        this.setupServerListeners();
        this.setupRelayListeners();

        console.log('[TransferService] Initialized');
    }

    /**
     * Setup listeners for TransferServer (LAN)
     */
    private setupServerListeners() {
        if (!this.server) return;

        // Server started/stopped
        this.server.on('server:started', (status) => {
            this.broadcast('server:started', status);
        });
        this.server.on('server:error', (error) => {
            this.broadcast('server:error', error);
        });

        // Device events
        this.server.on('device:connected', (device) => {
            // Save to DB
            this.saveDeviceToDb(device);
            this.broadcast('transfer:device-connected', device);
        });
        this.server.on('device:disconnected', (deviceId) => {
            this.broadcast('transfer:device-disconnected', deviceId);
        });
        this.server.on('device:list-updated', (devices) => {
            this.broadcast('transfer:device-list-updated', devices);
        });

        // Message received
        this.server.on('message:received', (data: any) => {
            // data: { senderId, sessionId, message: { id, type, content, ... } }
            this.saveMessageToDb(data);
            this.broadcast('transfer:message-received', data);
        });

        // File Incoming
        this.server.on('file:incoming', (data: any) => {
            // data: { senderId, fileInfo: { id, filename, fileSize, mimeType, totalChunks } }
            this.handleLanFileIncoming(data);
            this.broadcast('transfer:file-incoming', data);
        });

        // File Chunk
        this.server.on('file:chunk', (data: any) => {
            // data: { senderId, fileId, chunkIndex, chunk (base64), totalChunks }
            this.handleLanFileChunk(data);
            this.broadcast('transfer:file-chunk', data);
        });

        // File Complete
        this.server.on('file:complete', (data: any) => {
            // data: { senderId, fileId, fileHash }
            this.handleLanFileComplete(data);
            this.broadcast('transfer:file-complete', data);
        });
    }

    /**
     * Setup listeners for RelayClient
     */
    private setupRelayListeners() {
        // Forward all events to renderer
        this.relay.on('connected', () => this.broadcast('transfer:relay:connected'));
        this.relay.on('disconnected', (reason) => this.broadcast('transfer:relay:disconnected', reason));
        this.relay.on('error', (err) => this.broadcast('transfer:relay:error', err));
        this.relay.on('device:list', (devices) => this.broadcast('transfer:relay:device-list', devices));

        this.relay.on('message:received', (data) => {
            // RelayClient saves to DB internally, so we just broadcast
            this.broadcast('transfer:relay:message-received', data);
            // Also broadcast generic message received for ChatView
            this.broadcast('transfer:message-received', data);
        });

        this.relay.on('file:incoming', (data) => {
            this.broadcast('transfer:relay:file-incoming', data);
            this.broadcast('transfer:file-incoming', data);
        });

        this.relay.on('file:chunk', (data) => {
            this.broadcast('transfer:relay:file-chunk', data);
            this.broadcast('transfer:file-chunk', data);
        });

        this.relay.on('file:complete', (data) => {
            this.broadcast('transfer:relay:file-complete', data);
            this.broadcast('transfer:file-complete', data);
        });
    }

    // ============================================
    // Handlers for LAN File Transfer (since TransferServer doesn't write files)
    // ============================================

    private handleLanFileIncoming(data: any) {
        const { fileInfo, senderId } = data;
        if (!fileInfo || !fileInfo.id) return;

        try {
            const downloadPath = app.getPath('downloads');
            const targetDir = path.join(downloadPath, 'NextNotebook');
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            const targetPath = path.join(targetDir, path.basename(fileInfo.filename));
            const stream = fs.createWriteStream(targetPath);

            this.fileStreams.set(fileInfo.id, stream);
            this.filePaths.set(fileInfo.id, targetPath);

            // Save entry to DB
            // We need a session ID. TransferServer might not pass session ID in file:incoming event directly
            // usually it does. Let's check if we can get it.
            // Actually TransferServer.ts emits: { senderId, fileInfo }
            // It DOES NOT emit sessionId in file:incoming!
            // We have to find an active session for the senderId.

            const sessions = this.db?.getSessionsByDevice(senderId) || [];
            // Assuming the most recent active session
            const session = sessions[0] || { id: 'unknown' };

            const transferFile: TransferFile = {
                id: fileInfo.id,
                session_id: session.id,
                filename: fileInfo.filename,
                file_size: fileInfo.fileSize,
                mime_type: fileInfo.mimeType,
                local_path: targetPath,
                direction: 'received',
                status: 'transferring',
                progress: 0,
                file_hash: null,
                created_at: Date.now(),
                completed_at: null
            };

            this.db?.createFileTransfer(transferFile);

        } catch (e) {
            console.error('[TransferService] Failed to handle incoming file:', e);
        }
    }

    private handleLanFileChunk(data: any) {
        const { fileId, chunk, chunkIndex, totalChunks } = data;
        const stream = this.fileStreams.get(fileId);
        if (stream) {
            try {
                const buffer = Buffer.from(chunk, 'base64');
                stream.write(buffer);

                // Optionally update DB progress every N chunks
            } catch (e) {
                console.error('[TransferService] Failed to write chunk:', e);
            }
        }
    }

    private handleLanFileComplete(data: any) {
        const { fileId, fileHash } = data;
        const stream = this.fileStreams.get(fileId);
        const localPath = this.filePaths.get(fileId);

        if (stream) {
            stream.end();
            this.fileStreams.delete(fileId);
            this.filePaths.delete(fileId);

            if (localPath) {
                this.db?.completeFileTransfer(fileId, localPath, fileHash);
                console.log('[TransferService] File transfer completed:', localPath);
            }
        }
    }

    private saveDeviceToDb(device: ConnectedDevice) {
        this.db?.createDevice({
            id: device.id,
            name: device.name,
            type: 'android', // Assuming mostly android connects
            last_ip: device.ip,
            last_port: 0,
            last_seen: Date.now(),
            is_favorite: 0
        });
    }

    private saveMessageToDb(data: any) {
        const { senderId, sessionId, message } = data;
        this.db?.createMessage({
            id: message.id,
            session_id: sessionId,
            direction: 'received',
            type: message.type,
            content: message.content,
            file_id: message.fileId,
            created_at: Date.now(),
            read_at: null
        });
    }

    private broadcast(channel: string, data?: any) {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
            win.webContents.send(channel, data);
        });

        // Show system notification for completed files and new messages
        if (channel === 'transfer:file-complete') {
            // data: { senderId, fileId, fileHash } (and we can infer filename if we had it, but simplified for now)
            // Ideally we pass filename in the event or look it up.
            // For simplicity, generic message.
            const { Notification } = require('electron');
            new Notification({ title: '文件传输完成', body: '收到新文件' }).show();
        } else if (channel === 'transfer:message-received') {
            // data: { senderId, sessionId, message: { content } }
            const content = data.message?.content || '收到新消息';
            const { Notification } = require('electron');
            new Notification({ title: '新消息', body: content }).show();
        }
    }

    /**
     * Register IPC Handlers
     */
    private registerIpcHandlers() {
        // Server Management
        ipcMain.handle('transfer:startServer', (_, port) => this.server?.start(port));
        ipcMain.handle('transfer:stopServer', () => this.server?.stop());
        ipcMain.handle('transfer:getServerStatus', () => this.server?.getStatus());
        ipcMain.handle('transfer:getConnectedDevices', () => this.server?.getConnectedDevices());
        ipcMain.handle('transfer:generateQRData', () => this.server?.generatePairingQRData());
        ipcMain.handle('transfer:getDeviceInfo', () => ({
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            deviceType: 'desktop' as DeviceType
        }));

        // Messages & Files (Smart routing between LAN and Relay)
        ipcMain.handle('transfer:sendMessage', async (_, targetDeviceId, sessionId, message) => {
            // Try LAN first
            if (this.server?.sendMessage(targetDeviceId, sessionId, message)) {
                return true;
            }
            // Fallback to Relay
            return this.relay.sendMessage(targetDeviceId, sessionId, message);
        });

        ipcMain.handle('transfer:sendFile', async (_, targetDeviceId, sessionId, filePath) => {
            // Try LAN first
            try {
                return await this.server?.sendFile(targetDeviceId, sessionId, filePath);
            } catch (e) {
                // Fallback to Relay
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
        ipcMain.handle('transfer:db:getAllSessions', () => this.db?.getAllSessions());
        ipcMain.handle('transfer:db:getSessionsByDevice', (_, id) => this.db?.getSessionsByDevice(id));
        ipcMain.handle('transfer:db:endSession', (_, id) => this.db?.endSession(id));
        ipcMain.handle('transfer:db:deleteSession', (_, id) => this.db?.deleteSession(id));

        ipcMain.handle('transfer:db:createMessage', (_, m) => this.db?.createMessage(m));
        ipcMain.handle('transfer:db:getMessage', (_, id) => this.db?.getMessageById(id));
        ipcMain.handle('transfer:db:getMessagesBySession', (_, id, lim, off) => this.db?.getMessagesBySession(id, lim, off));
        ipcMain.handle('transfer:db:markMessageAsRead', (_, id) => this.db?.markMessageAsRead(id));
        ipcMain.handle('transfer:db:markSessionMessagesAsRead', (_, id) => this.db?.markSessionMessagesAsRead(id));
        ipcMain.handle('transfer:db:deleteMessage', (_, id) => this.db?.deleteMessage(id));

        ipcMain.handle('transfer:db:createFileTransfer', (_, f) => this.db?.createFileTransfer(f));
        ipcMain.handle('transfer:db:getFile', (_, id) => this.db?.getFileById(id));
        ipcMain.handle('transfer:db:getFilesBySession', (_, id) => this.db?.getFilesBySession(id));
        ipcMain.handle('transfer:db:updateFileProgress', (_, id, p) => this.db?.updateFileProgress(id, p));
        ipcMain.handle('transfer:db:completeFileTransfer', (_, id, p, h) => this.db?.completeFileTransfer(id, p, h));
        ipcMain.handle('transfer:db:failFileTransfer', (_, id) => this.db?.failFileTransfer(id));
        ipcMain.handle('transfer:db:cancelFileTransfer', (_, id) => this.db?.cancelFileTransfer(id));
        ipcMain.handle('transfer:db:deleteFile', (_, id) => this.db?.deleteFile(id));

        ipcMain.handle('transfer:db:getStats', () => this.db?.getStats());
        ipcMain.handle('transfer:db:cleanupOldSessions', (_, d) => this.db?.cleanupOldSessions(d));
        ipcMain.handle('transfer:db:cleanupFailedTransfers', () => this.db?.cleanupFailedTransfers());

        // Relay Specific
        ipcMain.handle('transfer:relay:connect', (_, url, key) =>
            this.relay.connect({
                serverUrl: url,
                relayKey: key,
                deviceId: this.deviceId,
                deviceName: this.deviceName
            })
        );
        ipcMain.handle('transfer:relay:disconnect', () => this.relay.disconnect());
        ipcMain.handle('transfer:relay:getStatus', () => this.relay.getStatus());
    }
}

export const transferService = new TransferService();
export const initializeTransferService = () => transferService.initialize();
