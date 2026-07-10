/**
 * TransferServer 单元测试
 */

import { TransferServer, ServerStatus, ConnectedDevice } from './TransferServer';
import { io as SocketIOClient, Socket as ClientSocket } from 'socket.io-client';
import { SOCKET_EVENTS, TRANSFER_CONSTANTS } from '@shared/transfer/constants';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('TransferServer', () => {
  let server: TransferServer;
  const testDeviceId = uuidv4();
  const testDeviceName = 'Test Server';

  beforeEach(() => {
    server = new TransferServer(testDeviceId, testDeviceName);
  });

  afterEach(async () => {
    await server.stop();
  });

  // ============================================
  // 服务器生命周期测试
  // ============================================

  describe('Server Lifecycle', () => {
    it('should start server successfully', async () => {
      const status = await server.start(45100);
      
      expect(status.running).toBe(true);
      expect(status.port).toBe(45100);
      expect(status.ip).toBeTruthy();
      expect(status.connectedDevices).toBe(0);
      expect(status.startedAt).toBeTruthy();
    });

    it('should stop server successfully', async () => {
      await server.start(45101);
      await server.stop();
      
      const status = server.getStatus();
      expect(status.running).toBe(false);
      expect(status.port).toBeNull();
    });

    it('should throw error when starting already running server', async () => {
      await server.start(45102);
      
      await expect(server.start(45103)).rejects.toMatchObject({
        code: 'E404', // SERVER_ALREADY_RUNNING
      });
    });

    it('should emit server:started event', async () => {
      const startedCallback = jest.fn();
      server.on('server:started', startedCallback);
      
      await server.start(45104);
      
      expect(startedCallback).toHaveBeenCalledTimes(1);
      expect(startedCallback).toHaveBeenCalledWith(expect.objectContaining({
        running: true,
        port: 45104,
      }));
    });

    it('should emit server:stopped event', async () => {
      const stoppedCallback = jest.fn();
      server.on('server:stopped', stoppedCallback);
      
      await server.start(45105);
      await server.stop();
      
      expect(stoppedCallback).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // 设备连接测试
  // ============================================

  describe('Device Connection', () => {
    let client: ClientSocket;

    afterEach(() => {
      if (client?.connected) {
        client.disconnect();
      }
    });

    it('should accept device registration', async () => {
      const status = await server.start(45110);
      const deviceConnectedCallback = jest.fn();
      server.on('device:connected', deviceConnectedCallback);

      client = SocketIOClient(`http://localhost:${status.port}`);
      
      await new Promise<void>((resolve) => {
        client.on('connect', () => {
          client.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
            deviceId: 'client-device-1',
            deviceName: 'Test Client',
            deviceType: 'android',
          });
          
          setTimeout(resolve, 100);
        });
      });

      expect(deviceConnectedCallback).toHaveBeenCalledWith(expect.objectContaining({
        id: 'client-device-1',
        name: 'Test Client',
        type: 'android',
      }));
    });

    it('should send device list to new device', async () => {
      const status = await server.start(45111);

      // Connect first client
      const client1 = SocketIOClient(`http://localhost:${status.port}`);
      await new Promise<void>((resolve) => {
        client1.on('connect', () => {
          client1.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
            deviceId: 'device-1',
            deviceName: 'Device 1',
            deviceType: 'desktop',
          });
          setTimeout(resolve, 100);
        });
      });

      // Connect second client and check device list
      client = SocketIOClient(`http://localhost:${status.port}`);
      const deviceList = await new Promise<any[]>((resolve) => {
        client.on(SOCKET_EVENTS.DEVICE_LIST, (list) => {
          resolve(list);
        });
        client.on('connect', () => {
          client.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
            deviceId: 'device-2',
            deviceName: 'Device 2',
            deviceType: 'android',
          });
        });
      });

      expect(deviceList).toHaveLength(1);
      expect(deviceList[0]).toMatchObject({
        id: 'device-1',
        name: 'Device 1',
      });

      client1.disconnect();
    });

    it('should broadcast device online event', async () => {
      const status = await server.start(45112);

      // Connect first client
      const client1 = SocketIOClient(`http://localhost:${status.port}`);
      await new Promise<void>((resolve) => {
        client1.on('connect', () => {
          client1.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
            deviceId: 'device-1',
            deviceName: 'Device 1',
            deviceType: 'desktop',
          });
          setTimeout(resolve, 100);
        });
      });

      // Listen for device online on first client
      const onlinePromise = new Promise<any>((resolve) => {
        client1.on(SOCKET_EVENTS.DEVICE_ONLINE, resolve);
      });

      // Connect second client
      client = SocketIOClient(`http://localhost:${status.port}`);
      client.on('connect', () => {
        client.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
          deviceId: 'device-2',
          deviceName: 'Device 2',
          deviceType: 'android',
        });
      });

      const onlineData = await onlinePromise;
      expect(onlineData.device).toMatchObject({
        id: 'device-2',
        name: 'Device 2',
      });

      client1.disconnect();
    });

    it('should handle device disconnect', async () => {
      const status = await server.start(45113);
      const disconnectedCallback = jest.fn();
      server.on('device:disconnected', disconnectedCallback);

      client = SocketIOClient(`http://localhost:${status.port}`);
      
      await new Promise<void>((resolve) => {
        client.on('connect', () => {
          client.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
            deviceId: 'disconnect-test',
            deviceName: 'Disconnect Test',
            deviceType: 'android',
          });
          setTimeout(resolve, 100);
        });
      });

      client.disconnect();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(disconnectedCallback).toHaveBeenCalledWith('disconnect-test');
    });

    it('should enforce max connections limit', async () => {
      const status = await server.start(45114);
      const clients: ClientSocket[] = [];

      // Connect MAX_CONNECTIONS devices
      for (let i = 0; i < TRANSFER_CONSTANTS.MAX_CONNECTIONS; i++) {
        const c = SocketIOClient(`http://localhost:${status.port}`);
        clients.push(c);
        await new Promise<void>((resolve) => {
          c.on('connect', () => {
            c.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
              deviceId: `device-${i}`,
              deviceName: `Device ${i}`,
              deviceType: 'android',
            });
            setTimeout(resolve, 50);
          });
        });
      }

      // Try to connect one more
      client = SocketIOClient(`http://localhost:${status.port}`);
      const errorPromise = new Promise<any>((resolve) => {
        client.on(SOCKET_EVENTS.ERROR, resolve);
      });

      client.on('connect', () => {
        client.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
          deviceId: 'overflow-device',
          deviceName: 'Overflow Device',
          deviceType: 'android',
        });
      });

      const error = await errorPromise;
      expect(error.code).toBe('E402'); // SERVER_FULL

      // Cleanup
      clients.forEach(c => c.disconnect());
    });
  });

  // ============================================
  // 消息转发测试
  // ============================================

  describe('Message Forwarding', () => {
    it('should forward messages between devices', async () => {
      const status = await server.start(45120);

      // Connect two clients
      const client1 = SocketIOClient(`http://localhost:${status.port}`);
      const client2 = SocketIOClient(`http://localhost:${status.port}`);

      await Promise.all([
        new Promise<void>((resolve) => {
          client1.on('connect', () => {
            client1.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
              deviceId: 'sender',
              deviceName: 'Sender',
              deviceType: 'desktop',
            });
            setTimeout(resolve, 100);
          });
        }),
        new Promise<void>((resolve) => {
          client2.on('connect', () => {
            client2.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
              deviceId: 'receiver',
              deviceName: 'Receiver',
              deviceType: 'android',
            });
            setTimeout(resolve, 100);
          });
        }),
      ]);

      // Listen for message on receiver
      const messagePromise = new Promise<any>((resolve) => {
        client2.on(SOCKET_EVENTS.MESSAGE_RECEIVE, resolve);
      });

      // Send message from sender
      client1.emit(SOCKET_EVENTS.MESSAGE_SEND, {
        targetDeviceId: 'receiver',
        sessionId: 'test-session',
        message: {
          id: 'msg-1',
          type: 'text',
          content: 'Hello!',
        },
      });

      const receivedMessage = await messagePromise;
      expect(receivedMessage.senderId).toBe('sender');
      expect(receivedMessage.message.content).toBe('Hello!');

      client1.disconnect();
      client2.disconnect();
    });
  });

  // ============================================
  // 文件转发测试
  // ============================================

  describe('File Forwarding', () => {
    it('should include sessionId when desktop sends a file directly to a device', async () => {
      const status = await server.start(45121);
      const receiver = SocketIOClient(`http://localhost:${status.port}`);
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transfer-server-test-'));
      const tempFile = path.join(tempDir, 'sample.txt');
      fs.writeFileSync(tempFile, 'hello file');

      try {
        await new Promise<void>((resolve) => {
          receiver.on('connect', () => {
            receiver.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
              deviceId: 'receiver',
              deviceName: 'Receiver',
              deviceType: 'android',
            });
            setTimeout(resolve, 100);
          });
        });

        const incomingPromise = new Promise<any>((resolve) => {
          receiver.on(SOCKET_EVENTS.FILE_INCOMING, resolve);
        });

        await server.sendFile('receiver', 'test-session', tempFile);

        const incoming = await incomingPromise;
        expect(incoming.senderId).toBe(testDeviceId);
        expect(incoming.sessionId).toBe('test-session');
        expect(incoming.fileInfo.filename).toBe('sample.txt');
      } finally {
        receiver.disconnect();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should preserve sessionId when forwarding file start between devices', async () => {
      const status = await server.start(45122);
      const sender = SocketIOClient(`http://localhost:${status.port}`);
      const receiver = SocketIOClient(`http://localhost:${status.port}`);

      try {
        await Promise.all([
          new Promise<void>((resolve) => {
            sender.on('connect', () => {
              sender.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
                deviceId: 'sender',
                deviceName: 'Sender',
                deviceType: 'android',
              });
              setTimeout(resolve, 100);
            });
          }),
          new Promise<void>((resolve) => {
            receiver.on('connect', () => {
              receiver.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
                deviceId: 'receiver',
                deviceName: 'Receiver',
                deviceType: 'android',
              });
              setTimeout(resolve, 100);
            });
          }),
        ]);

        const incomingPromise = new Promise<any>((resolve) => {
          receiver.on(SOCKET_EVENTS.FILE_INCOMING, resolve);
        });

        sender.emit(SOCKET_EVENTS.FILE_START, {
          targetDeviceId: 'receiver',
          sessionId: 'forward-session',
          fileInfo: {
            id: 'file-1',
            filename: 'document.pdf',
            fileSize: 10,
            mimeType: 'application/pdf',
            totalChunks: 1,
          },
        });

        const incoming = await incomingPromise;
        expect(incoming.senderId).toBe('sender');
        expect(incoming.sessionId).toBe('forward-session');
        expect(incoming.fileInfo.filename).toBe('document.pdf');
      } finally {
        sender.disconnect();
        receiver.disconnect();
      }
    });
  });

  // ============================================
  // 二维码生成测试
  // ============================================

  describe('QR Code Generation', () => {
    it('should generate pairing QR data when server is running', async () => {
      await server.start(45130);
      
      const qrData = server.generatePairingQRData();
      
      expect(qrData).toBeTruthy();
      expect(qrData?.deviceId).toBe(testDeviceId);
      expect(qrData?.deviceName).toBe(testDeviceName);
      expect(qrData?.serverPort).toBe(45130);
      expect(qrData?.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should return null when server is not running', () => {
      const qrData = server.generatePairingQRData();
      expect(qrData).toBeNull();
    });
  });

  // ============================================
  // 状态查询测试
  // ============================================

  describe('Status Queries', () => {
    it('should return correct status when not running', () => {
      const status = server.getStatus();
      
      expect(status.running).toBe(false);
      expect(status.port).toBeNull();
      expect(status.connectedDevices).toBe(0);
    });

    it('should return connected devices list', async () => {
      const status = await server.start(45140);

      const client = SocketIOClient(`http://localhost:${status.port}`);
      await new Promise<void>((resolve) => {
        client.on('connect', () => {
          client.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
            deviceId: 'list-test',
            deviceName: 'List Test',
            deviceType: 'android',
          });
          setTimeout(resolve, 100);
        });
      });

      const devices = server.getConnectedDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].id).toBe('list-test');

      client.disconnect();
    });
  });
});
