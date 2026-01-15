/**
 * TransferDatabase 单元测试
 */

import { TransferDatabase, TransferDevice, TransferSession, TransferMessage, TransferFile } from './TransferDatabase';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

describe('TransferDatabase', () => {
  let db: TransferDatabase;
  let testDir: string;

  beforeEach(() => {
    // 创建临时测试目录
    testDir = path.join(os.tmpdir(), `transfer-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    
    db = new TransferDatabase(testDir);
    db.initialize();
  });

  afterEach(() => {
    db.close();
    // 清理测试目录
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ============================================
  // 数据库初始化测试
  // ============================================

  describe('Initialization', () => {
    it('should create database file', () => {
      const dbPath = path.join(testDir, 'transfer.db');
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should create all required tables', () => {
      const database = db.getDatabase();
      const tables = database.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'transfer_%'
      `).all() as { name: string }[];
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('transfer_devices');
      expect(tableNames).toContain('transfer_sessions');
      expect(tableNames).toContain('transfer_messages');
      expect(tableNames).toContain('transfer_files');
      expect(tableNames).toContain('transfer_schema_version');
    });

    it('should set schema version', () => {
      const database = db.getDatabase();
      const version = database.prepare('SELECT MAX(version) as version FROM transfer_schema_version').get() as { version: number };
      expect(version.version).toBe(1);
    });
  });

  // ============================================
  // 设备 CRUD 测试
  // ============================================

  describe('Device CRUD', () => {
    const createTestDevice = (): Omit<TransferDevice, 'created_at'> => ({
      id: uuidv4(),
      name: 'Test Device',
      type: 'desktop',
      last_ip: '192.168.1.100',
      last_port: 45678,
      last_seen: Date.now(),
      is_favorite: 0,
    });

    it('should create a device', () => {
      const deviceData = createTestDevice();
      const device = db.createDevice(deviceData);
      
      expect(device.id).toBe(deviceData.id);
      expect(device.name).toBe(deviceData.name);
      expect(device.type).toBe(deviceData.type);
      expect(device.created_at).toBeDefined();
    });

    it('should get device by id', () => {
      const deviceData = createTestDevice();
      db.createDevice(deviceData);
      
      const device = db.getDeviceById(deviceData.id);
      expect(device).toBeDefined();
      expect(device?.name).toBe(deviceData.name);
    });

    it('should return undefined for non-existent device', () => {
      const device = db.getDeviceById('non-existent-id');
      expect(device).toBeUndefined();
    });

    it('should get all devices', () => {
      db.createDevice(createTestDevice());
      db.createDevice(createTestDevice());
      
      const devices = db.getAllDevices();
      expect(devices.length).toBe(2);
    });

    it('should update device', () => {
      const deviceData = createTestDevice();
      db.createDevice(deviceData);
      
      const updated = db.updateDevice(deviceData.id, { name: 'Updated Name', is_favorite: 1 });
      expect(updated).toBe(true);
      
      const device = db.getDeviceById(deviceData.id);
      expect(device?.name).toBe('Updated Name');
      expect(device?.is_favorite).toBe(1);
    });

    it('should delete device', () => {
      const deviceData = createTestDevice();
      db.createDevice(deviceData);
      
      const deleted = db.deleteDevice(deviceData.id);
      expect(deleted).toBe(true);
      
      const device = db.getDeviceById(deviceData.id);
      expect(device).toBeUndefined();
    });

    it('should order devices by favorite and last_seen', () => {
      const device1 = { ...createTestDevice(), last_seen: Date.now() - 1000, is_favorite: 0 };
      const device2 = { ...createTestDevice(), last_seen: Date.now(), is_favorite: 1 };
      
      db.createDevice(device1);
      db.createDevice(device2);
      
      const devices = db.getAllDevices();
      expect(devices[0].id).toBe(device2.id); // Favorite first
    });
  });

  // ============================================
  // 会话 CRUD 测试
  // ============================================

  describe('Session CRUD', () => {
    let deviceId: string;

    beforeEach(() => {
      const device = db.createDevice({
        id: uuidv4(),
        name: 'Test Device',
        type: 'android',
        last_ip: '192.168.1.101',
        last_port: 45679,
        last_seen: Date.now(),
        is_favorite: 0,
      });
      deviceId = device.id;
    });

    const createTestSession = (): TransferSession => ({
      id: uuidv4(),
      peer_device_id: deviceId,
      peer_device_name: 'Test Device',
      connection_type: 'lan',
      started_at: Date.now(),
      ended_at: null,
    });

    it('should create a session', () => {
      const sessionData = createTestSession();
      const session = db.createSession(sessionData);
      
      expect(session.id).toBe(sessionData.id);
      expect(session.peer_device_id).toBe(deviceId);
    });

    it('should get session by id', () => {
      const sessionData = createTestSession();
      db.createSession(sessionData);
      
      const session = db.getSessionById(sessionData.id);
      expect(session).toBeDefined();
      expect(session?.connection_type).toBe('lan');
    });

    it('should get sessions by device', () => {
      db.createSession(createTestSession());
      db.createSession(createTestSession());
      
      const sessions = db.getSessionsByDevice(deviceId);
      expect(sessions.length).toBe(2);
    });

    it('should end session', () => {
      const sessionData = createTestSession();
      db.createSession(sessionData);
      
      const ended = db.endSession(sessionData.id);
      expect(ended).toBe(true);
      
      const session = db.getSessionById(sessionData.id);
      expect(session?.ended_at).toBeDefined();
    });

    it('should delete session and cascade to messages', () => {
      const sessionData = createTestSession();
      db.createSession(sessionData);
      
      // Create a message in the session
      db.createMessage({
        id: uuidv4(),
        session_id: sessionData.id,
        direction: 'sent',
        type: 'text',
        content: 'Test message',
        file_id: null,
        created_at: Date.now(),
        read_at: null,
      });
      
      const deleted = db.deleteSession(sessionData.id);
      expect(deleted).toBe(true);
      
      // Messages should be deleted too (cascade)
      const messages = db.getMessagesBySession(sessionData.id);
      expect(messages.length).toBe(0);
    });
  });

  // ============================================
  // 消息 CRUD 测试
  // ============================================

  describe('Message CRUD', () => {
    let sessionId: string;

    beforeEach(() => {
      const device = db.createDevice({
        id: uuidv4(),
        name: 'Test Device',
        type: 'android',
        last_ip: '192.168.1.101',
        last_port: 45679,
        last_seen: Date.now(),
        is_favorite: 0,
      });
      
      const session = db.createSession({
        id: uuidv4(),
        peer_device_id: device.id,
        peer_device_name: 'Test Device',
        connection_type: 'lan',
        started_at: Date.now(),
        ended_at: null,
      });
      sessionId = session.id;
    });

    const createTestMessage = (): TransferMessage => ({
      id: uuidv4(),
      session_id: sessionId,
      direction: 'sent',
      type: 'text',
      content: 'Hello, World!',
      file_id: null,
      created_at: Date.now(),
      read_at: null,
    });

    it('should create a message', () => {
      const messageData = createTestMessage();
      const message = db.createMessage(messageData);
      
      expect(message.id).toBe(messageData.id);
      expect(message.content).toBe('Hello, World!');
    });

    it('should get messages by session', () => {
      db.createMessage(createTestMessage());
      db.createMessage(createTestMessage());
      
      const messages = db.getMessagesBySession(sessionId);
      expect(messages.length).toBe(2);
    });

    it('should mark message as read', () => {
      const messageData = { ...createTestMessage(), direction: 'received' as const };
      db.createMessage(messageData);
      
      const marked = db.markMessageAsRead(messageData.id);
      expect(marked).toBe(true);
      
      const message = db.getMessageById(messageData.id);
      expect(message?.read_at).toBeDefined();
    });

    it('should mark all session messages as read', () => {
      db.createMessage({ ...createTestMessage(), direction: 'received' as const });
      db.createMessage({ ...createTestMessage(), direction: 'received' as const });
      db.createMessage({ ...createTestMessage(), direction: 'sent' as const }); // Should not be marked
      
      const count = db.markSessionMessagesAsRead(sessionId);
      expect(count).toBe(2); // Only received messages
    });

    it('should support pagination', () => {
      for (let i = 0; i < 10; i++) {
        db.createMessage(createTestMessage());
      }
      
      const page1 = db.getMessagesBySession(sessionId, 5, 0);
      const page2 = db.getMessagesBySession(sessionId, 5, 5);
      
      expect(page1.length).toBe(5);
      expect(page2.length).toBe(5);
    });
  });

  // ============================================
  // 文件传输 CRUD 测试
  // ============================================

  describe('File Transfer CRUD', () => {
    let sessionId: string;

    beforeEach(() => {
      const device = db.createDevice({
        id: uuidv4(),
        name: 'Test Device',
        type: 'android',
        last_ip: '192.168.1.101',
        last_port: 45679,
        last_seen: Date.now(),
        is_favorite: 0,
      });
      
      const session = db.createSession({
        id: uuidv4(),
        peer_device_id: device.id,
        peer_device_name: 'Test Device',
        connection_type: 'lan',
        started_at: Date.now(),
        ended_at: null,
      });
      sessionId = session.id;
    });

    const createTestFile = (): TransferFile => ({
      id: uuidv4(),
      session_id: sessionId,
      filename: 'test.pdf',
      file_size: 1024 * 1024, // 1MB
      mime_type: 'application/pdf',
      local_path: null,
      direction: 'sent',
      status: 'pending',
      progress: 0,
      file_hash: null,
      created_at: Date.now(),
      completed_at: null,
    });

    it('should create a file transfer', () => {
      const fileData = createTestFile();
      const file = db.createFileTransfer(fileData);
      
      expect(file.id).toBe(fileData.id);
      expect(file.filename).toBe('test.pdf');
      expect(file.status).toBe('pending');
    });

    it('should update file progress', () => {
      const fileData = createTestFile();
      db.createFileTransfer(fileData);
      
      const updated = db.updateFileProgress(fileData.id, 50);
      expect(updated).toBe(true);
      
      const file = db.getFileById(fileData.id);
      expect(file?.progress).toBe(50);
      expect(file?.status).toBe('transferring');
    });

    it('should complete file transfer', () => {
      const fileData = createTestFile();
      db.createFileTransfer(fileData);
      
      const completed = db.completeFileTransfer(fileData.id, '/path/to/file.pdf', 'abc123hash');
      expect(completed).toBe(true);
      
      const file = db.getFileById(fileData.id);
      expect(file?.status).toBe('completed');
      expect(file?.progress).toBe(100);
      expect(file?.local_path).toBe('/path/to/file.pdf');
      expect(file?.file_hash).toBe('abc123hash');
      expect(file?.completed_at).toBeDefined();
    });

    it('should fail file transfer', () => {
      const fileData = createTestFile();
      db.createFileTransfer(fileData);
      
      const failed = db.failFileTransfer(fileData.id);
      expect(failed).toBe(true);
      
      const file = db.getFileById(fileData.id);
      expect(file?.status).toBe('failed');
    });

    it('should cancel file transfer', () => {
      const fileData = createTestFile();
      db.createFileTransfer(fileData);
      
      const cancelled = db.cancelFileTransfer(fileData.id);
      expect(cancelled).toBe(true);
      
      const file = db.getFileById(fileData.id);
      expect(file?.status).toBe('cancelled');
    });

    it('should get files by session', () => {
      db.createFileTransfer(createTestFile());
      db.createFileTransfer(createTestFile());
      
      const files = db.getFilesBySession(sessionId);
      expect(files.length).toBe(2);
    });
  });

  // ============================================
  // 清理和统计测试
  // ============================================

  describe('Cleanup and Stats', () => {
    it('should get stats', () => {
      const device = db.createDevice({
        id: uuidv4(),
        name: 'Test Device',
        type: 'android',
        last_ip: '192.168.1.101',
        last_port: 45679,
        last_seen: Date.now(),
        is_favorite: 0,
      });
      
      const session = db.createSession({
        id: uuidv4(),
        peer_device_id: device.id,
        peer_device_name: 'Test Device',
        connection_type: 'lan',
        started_at: Date.now(),
        ended_at: null,
      });
      
      db.createMessage({
        id: uuidv4(),
        session_id: session.id,
        direction: 'sent',
        type: 'text',
        content: 'Test',
        file_id: null,
        created_at: Date.now(),
        read_at: null,
      });
      
      const stats = db.getStats();
      expect(stats.devices).toBe(1);
      expect(stats.sessions).toBe(1);
      expect(stats.messages).toBe(1);
      expect(stats.files).toBe(0);
    });

    it('should cleanup failed transfers', () => {
      const device = db.createDevice({
        id: uuidv4(),
        name: 'Test Device',
        type: 'android',
        last_ip: '192.168.1.101',
        last_port: 45679,
        last_seen: Date.now(),
        is_favorite: 0,
      });
      
      const session = db.createSession({
        id: uuidv4(),
        peer_device_id: device.id,
        peer_device_name: 'Test Device',
        connection_type: 'lan',
        started_at: Date.now(),
        ended_at: null,
      });
      
      // Create failed and cancelled transfers
      db.createFileTransfer({
        id: uuidv4(),
        session_id: session.id,
        filename: 'failed.pdf',
        file_size: 1024,
        mime_type: 'application/pdf',
        local_path: null,
        direction: 'sent',
        status: 'failed',
        progress: 50,
        file_hash: null,
        created_at: Date.now(),
        completed_at: null,
      });
      
      db.createFileTransfer({
        id: uuidv4(),
        session_id: session.id,
        filename: 'cancelled.pdf',
        file_size: 1024,
        mime_type: 'application/pdf',
        local_path: null,
        direction: 'sent',
        status: 'cancelled',
        progress: 25,
        file_hash: null,
        created_at: Date.now(),
        completed_at: null,
      });
      
      const cleaned = db.cleanupFailedTransfers();
      expect(cleaned).toBe(2);
      
      const files = db.getFilesBySession(session.id);
      expect(files.length).toBe(0);
    });
  });

  // ============================================
  // 外键约束测试
  // ============================================

  describe('Foreign Key Constraints', () => {
    it('should enforce foreign key on session -> device', () => {
      expect(() => {
        db.createSession({
          id: uuidv4(),
          peer_device_id: 'non-existent-device',
          peer_device_name: 'Test',
          connection_type: 'lan',
          started_at: Date.now(),
          ended_at: null,
        });
      }).toThrow();
    });

    it('should cascade delete sessions when device is deleted', () => {
      const device = db.createDevice({
        id: uuidv4(),
        name: 'Test Device',
        type: 'android',
        last_ip: '192.168.1.101',
        last_port: 45679,
        last_seen: Date.now(),
        is_favorite: 0,
      });
      
      const session = db.createSession({
        id: uuidv4(),
        peer_device_id: device.id,
        peer_device_name: 'Test Device',
        connection_type: 'lan',
        started_at: Date.now(),
        ended_at: null,
      });
      
      db.deleteDevice(device.id);
      
      const deletedSession = db.getSessionById(session.id);
      expect(deletedSession).toBeUndefined();
    });
  });
});
