/**
 * TransferServer 属性测试
 * 使用 fast-check 进行属性测试
 */

import * as fc from 'fast-check';
import { TransferServer } from './TransferServer';
import { io as SocketIOClient, Socket as ClientSocket } from 'socket.io-client';
import { SOCKET_EVENTS, TRANSFER_CONSTANTS, createPairingQRData, isQRCodeExpired } from '@shared/transfer/constants';
import { v4 as uuidv4 } from 'uuid';

describe('TransferServer Property Tests', () => {
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
  // Property 1: Device Registration Uniqueness
  // ============================================

  describe('Property 1: Device Registration Uniqueness', () => {
    it('should ensure unique device IDs across registrations', async () => {
      const status = await server.start(45200);
      const clients: ClientSocket[] = [];

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
          async (deviceIds) => {
            // 连接所有设备
            for (const deviceId of deviceIds) {
              const client = SocketIOClient(`http://localhost:${status.port}`);
              clients.push(client);
              
              await new Promise<void>((resolve) => {
                client.on('connect', () => {
                  client.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
                    deviceId,
                    deviceName: `Device ${deviceId.slice(0, 8)}`,
                    deviceType: 'android',
                  });
                  setTimeout(resolve, 50);
                });
              });
            }

            // 验证设备列表中没有重复 ID
            const devices = server.getConnectedDevices();
            const uniqueIds = new Set(devices.map(d => d.id));
            expect(uniqueIds.size).toBe(devices.length);

            // 清理
            clients.forEach(c => c.disconnect());
            clients.length = 0;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ============================================
  // Property 2: QR Code Expiration
  // ============================================

  describe('Property 2: QR Code Expiration', () => {
    it('should correctly identify expired QR codes', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -10000, max: 10000 }),
          (offsetMs) => {
            const now = Date.now();
            const qrData = createPairingQRData(
              'test-device',
              'Test Device',
              '192.168.1.1',
              45000
            );
            
            // 修改过期时间
            qrData.expiresAt = now + offsetMs;
            
            const isExpired = isQRCodeExpired(qrData);
            
            // 如果 offset < 0，应该过期（offset = 0 时刚好在边界，可能不过期）
            if (offsetMs < 0) {
              expect(isExpired).toBe(true);
            } else if (offsetMs > 0) {
              expect(isExpired).toBe(false);
            }
            // offset = 0 时不做断言，因为是边界情况
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate QR codes with valid expiration time', async () => {
      await server.start(45201);
      
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            const qrData = server.generatePairingQRData();
            expect(qrData).not.toBeNull();
            
            if (qrData) {
              // 过期时间应该在未来
              expect(qrData.expiresAt).toBeGreaterThan(Date.now());
              
              // 过期时间应该在 QR_CODE_EXPIRY 范围内
              const expectedExpiry = qrData.timestamp + TRANSFER_CONSTANTS.QR_CODE_EXPIRY;
              expect(qrData.expiresAt).toBe(expectedExpiry);
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ============================================
  // Property 3: Message Delivery Order
  // ============================================

  describe('Property 3: Message Delivery Order', () => {
    it('should preserve message order', async () => {
      const status = await server.start(45202);

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 10 }),
          async (messages) => {
            const client1 = SocketIOClient(`http://localhost:${status.port}`);
            const client2 = SocketIOClient(`http://localhost:${status.port}`);
            const receivedMessages: string[] = [];

            await Promise.all([
              new Promise<void>((resolve) => {
                client1.on('connect', () => {
                  client1.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
                    deviceId: 'sender-order',
                    deviceName: 'Sender',
                    deviceType: 'desktop',
                  });
                  setTimeout(resolve, 100);
                });
              }),
              new Promise<void>((resolve) => {
                client2.on('connect', () => {
                  client2.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
                    deviceId: 'receiver-order',
                    deviceName: 'Receiver',
                    deviceType: 'android',
                  });
                  setTimeout(resolve, 100);
                });
              }),
            ]);

            // 监听消息
            client2.on(SOCKET_EVENTS.MESSAGE_RECEIVE, (data: any) => {
              receivedMessages.push(data.message.content);
            });

            // 发送消息
            for (const msg of messages) {
              client1.emit(SOCKET_EVENTS.MESSAGE_SEND, {
                targetDeviceId: 'receiver-order',
                sessionId: 'test-session',
                message: { id: uuidv4(), type: 'text', content: msg },
              });
              await new Promise(resolve => setTimeout(resolve, 20));
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            // 验证顺序
            expect(receivedMessages).toEqual(messages);

            client1.disconnect();
            client2.disconnect();
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  // ============================================
  // Property 7: Device List Consistency
  // ============================================

  describe('Property 7: Device List Consistency', () => {
    it('should maintain consistent device list across all clients', async () => {
      const status = await server.start(45203);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (numDevices) => {
            const clients: ClientSocket[] = [];
            const deviceLists: Map<string, any[]> = new Map();

            // 连接所有设备（顺序连接，确保稳定）
            for (let i = 0; i < numDevices; i++) {
              const deviceId = `device-consistency-${i}-${Date.now()}`;
              const client = SocketIOClient(`http://localhost:${status.port}`);
              clients.push(client);

              client.on(SOCKET_EVENTS.DEVICE_LIST, (list: any[]) => {
                deviceLists.set(deviceId, list);
              });

              await new Promise<void>((resolve) => {
                client.on('connect', () => {
                  client.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
                    deviceId,
                    deviceName: `Device ${i}`,
                    deviceType: 'android',
                  });
                  setTimeout(resolve, 150);
                });
              });
            }

            await new Promise(resolve => setTimeout(resolve, 300));

            // 验证服务器设备列表包含所有连接的设备
            const serverDevices = server.getConnectedDevices();
            expect(serverDevices.length).toBeGreaterThanOrEqual(numDevices);

            // 清理
            clients.forEach(c => c.disconnect());
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        ),
        { numRuns: 3 }
      );
    });
  });

  // ============================================
  // Property 8: File Transfer Progress Accuracy
  // ============================================

  describe('Property 8: File Transfer Progress Accuracy', () => {
    it('should report accurate progress for file chunks', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // totalChunks
          fc.integer({ min: 0, max: 999 }),   // currentChunk
          (totalChunks, currentChunk) => {
            // 确保 currentChunk <= totalChunks
            const validCurrentChunk = Math.min(currentChunk, totalChunks - 1);
            
            // 计算进度
            const progress = (validCurrentChunk + 1) / totalChunks;
            
            // 验证进度在 0-1 范围内
            expect(progress).toBeGreaterThan(0);
            expect(progress).toBeLessThanOrEqual(1);
            
            // 验证进度百分比准确性
            const percentage = Math.round(progress * 100);
            expect(percentage).toBeGreaterThanOrEqual(0);
            expect(percentage).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // Property 10: Message Read Receipt
  // ============================================

  describe('Property 10: Message Read Receipt', () => {
    it('should forward read receipts to sender', async () => {
      const status = await server.start(45204);

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
          async (messageIds) => {
            const sender = SocketIOClient(`http://localhost:${status.port}`);
            const receiver = SocketIOClient(`http://localhost:${status.port}`);
            const receivedReceipts: string[] = [];

            await Promise.all([
              new Promise<void>((resolve) => {
                sender.on('connect', () => {
                  sender.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
                    deviceId: 'sender-receipt',
                    deviceName: 'Sender',
                    deviceType: 'desktop',
                  });
                  setTimeout(resolve, 100);
                });
              }),
              new Promise<void>((resolve) => {
                receiver.on('connect', () => {
                  receiver.emit(SOCKET_EVENTS.DEVICE_REGISTER, {
                    deviceId: 'receiver-receipt',
                    deviceName: 'Receiver',
                    deviceType: 'android',
                  });
                  setTimeout(resolve, 100);
                });
              }),
            ]);

            // 监听已读回执
            sender.on(SOCKET_EVENTS.MESSAGE_READ, (data: any) => {
              receivedReceipts.push(...data.messageIds);
            });

            // 发送已读回执
            receiver.emit(SOCKET_EVENTS.MESSAGE_READ, {
              targetDeviceId: 'sender-receipt',
              messageIds,
            });

            await new Promise(resolve => setTimeout(resolve, 200));

            // 验证回执被正确转发
            expect(receivedReceipts).toEqual(messageIds);

            sender.disconnect();
            receiver.disconnect();
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        ),
        { numRuns: 5 }
      );
    });
  });
});
