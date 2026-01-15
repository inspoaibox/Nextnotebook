/**
 * LAN Transfer Assistant - 独立数据库管理
 * 
 * 使用独立的 SQLite 数据库文件 (transfer.db)，与主应用数据库分离
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { TRANSFER_CONSTANTS } from '@shared/transfer/constants';

// ============================================
// 数据库 Schema
// ============================================

const SCHEMA_VERSION = TRANSFER_CONSTANTS.SCHEMA_VERSION;

const CREATE_TABLES_SQL = `
-- 设备表
CREATE TABLE IF NOT EXISTS transfer_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('desktop', 'android')),
  last_ip TEXT,
  last_port INTEGER,
  last_seen INTEGER NOT NULL,
  is_favorite INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 会话表
CREATE TABLE IF NOT EXISTS transfer_sessions (
  id TEXT PRIMARY KEY,
  peer_device_id TEXT NOT NULL,
  peer_device_name TEXT NOT NULL,
  connection_type TEXT NOT NULL CHECK (connection_type IN ('lan', 'relay')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  FOREIGN KEY (peer_device_id) REFERENCES transfer_devices(id) ON DELETE CASCADE
);

-- 消息表
CREATE TABLE IF NOT EXISTS transfer_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
  type TEXT NOT NULL CHECK (type IN ('text', 'file', 'image')),
  content TEXT NOT NULL,
  file_id TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES transfer_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES transfer_files(id) ON DELETE SET NULL
);

-- 文件传输表
CREATE TABLE IF NOT EXISTS transfer_files (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  local_path TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'transferring', 'completed', 'failed', 'cancelled')),
  progress REAL DEFAULT 0,
  file_hash TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES transfer_sessions(id) ON DELETE CASCADE
);

-- Schema 版本表
CREATE TABLE IF NOT EXISTS transfer_schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_sessions_peer_device ON transfer_sessions(peer_device_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON transfer_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON transfer_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_files_session ON transfer_files(session_id);
CREATE INDEX IF NOT EXISTS idx_files_status ON transfer_files(status);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON transfer_devices(last_seen);
CREATE INDEX IF NOT EXISTS idx_devices_favorite ON transfer_devices(is_favorite);
`;

// ============================================
// 数据模型接口
// ============================================

export interface TransferDevice {
  id: string;
  name: string;
  type: 'desktop' | 'android';
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
  type: 'text' | 'file' | 'image';
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
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  file_hash: string | null;
  created_at: number;
  completed_at: number | null;
}

// ============================================
// TransferDatabase 类
// ============================================

export class TransferDatabase {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(userDataPath: string) {
    this.dbPath = path.join(userDataPath, TRANSFER_CONSTANTS.DATABASE_NAME);
  }

  /**
   * 初始化数据库
   */
  initialize(): void {
    // 确保目录存在
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.initializeSchema();
  }

  /**
   * 初始化 Schema
   */
  private initializeSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    // 检查 schema 版本
    const versionTable = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='transfer_schema_version'")
      .get();

    if (!versionTable) {
      // 首次初始化
      this.db.exec(CREATE_TABLES_SQL);
      this.db.prepare('INSERT INTO transfer_schema_version (version, applied_at) VALUES (?, ?)')
        .run(SCHEMA_VERSION, Date.now());
      console.log(`[TransferDatabase] Initialized with schema version ${SCHEMA_VERSION}`);
    } else {
      // 检查是否需要升级
      const currentVersion = this.db
        .prepare('SELECT MAX(version) as version FROM transfer_schema_version')
        .get() as { version: number } | undefined;

      if (!currentVersion || currentVersion.version < SCHEMA_VERSION) {
        this.migrateSchema(currentVersion?.version || 0);
      }
    }
  }

  /**
   * Schema 迁移
   */
  private migrateSchema(fromVersion: number): void {
    console.log(`[TransferDatabase] Migrating from version ${fromVersion} to ${SCHEMA_VERSION}`);
    // 预留迁移逻辑
  }

  /**
   * 关闭数据库
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * 获取数据库实例
   */
  getDatabase(): Database.Database {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  // ============================================
  // 设备 CRUD
  // ============================================

  createDevice(device: Omit<TransferDevice, 'created_at'>): TransferDevice {
    if (!this.db) throw new Error('Database not initialized');
    
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO transfer_devices (id, name, type, last_ip, last_port, last_seen, is_favorite, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      device.id,
      device.name,
      device.type,
      device.last_ip,
      device.last_port,
      device.last_seen,
      device.is_favorite,
      now
    );
    
    return { ...device, created_at: now };
  }

  getDeviceById(id: string): TransferDevice | undefined {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM transfer_devices WHERE id = ?').get(id) as TransferDevice | undefined;
  }

  getAllDevices(): TransferDevice[] {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM transfer_devices ORDER BY is_favorite DESC, last_seen DESC').all() as TransferDevice[];
  }

  updateDevice(id: string, updates: Partial<TransferDevice>): boolean {
    if (!this.db) throw new Error('Database not initialized');
    
    const fields = Object.keys(updates).filter(k => k !== 'id');
    if (fields.length === 0) return false;
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => (updates as any)[f]);
    
    const result = this.db.prepare(`UPDATE transfer_devices SET ${setClause} WHERE id = ?`).run(...values, id);
    return result.changes > 0;
  }

  deleteDevice(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare('DELETE FROM transfer_devices WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============================================
  // 会话 CRUD
  // ============================================

  createSession(session: TransferSession): TransferSession {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare(`
      INSERT INTO transfer_sessions (id, peer_device_id, peer_device_name, connection_type, started_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      session.id,
      session.peer_device_id,
      session.peer_device_name,
      session.connection_type,
      session.started_at,
      session.ended_at
    );
    
    return session;
  }

  getSessionById(id: string): TransferSession | undefined {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM transfer_sessions WHERE id = ?').get(id) as TransferSession | undefined;
  }

  getAllSessions(): TransferSession[] {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM transfer_sessions ORDER BY started_at DESC').all() as TransferSession[];
  }

  getSessionsByDevice(deviceId: string): TransferSession[] {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM transfer_sessions WHERE peer_device_id = ? ORDER BY started_at DESC')
      .all(deviceId) as TransferSession[];
  }

  endSession(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare('UPDATE transfer_sessions SET ended_at = ? WHERE id = ?').run(Date.now(), id);
    return result.changes > 0;
  }

  deleteSession(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare('DELETE FROM transfer_sessions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============================================
  // 消息 CRUD
  // ============================================

  createMessage(message: TransferMessage): TransferMessage {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare(`
      INSERT INTO transfer_messages (id, session_id, direction, type, content, file_id, created_at, read_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      message.id,
      message.session_id,
      message.direction,
      message.type,
      message.content,
      message.file_id,
      message.created_at,
      message.read_at
    );
    
    return message;
  }

  getMessageById(id: string): TransferMessage | undefined {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM transfer_messages WHERE id = ?').get(id) as TransferMessage | undefined;
  }

  getMessagesBySession(sessionId: string, limit = 100, offset = 0): TransferMessage[] {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare(`
      SELECT * FROM transfer_messages 
      WHERE session_id = ? 
      ORDER BY created_at ASC 
      LIMIT ? OFFSET ?
    `).all(sessionId, limit, offset) as TransferMessage[];
  }

  markMessageAsRead(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare('UPDATE transfer_messages SET read_at = ? WHERE id = ? AND read_at IS NULL')
      .run(Date.now(), id);
    return result.changes > 0;
  }

  markSessionMessagesAsRead(sessionId: string): number {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare(`
      UPDATE transfer_messages SET read_at = ? 
      WHERE session_id = ? AND direction = 'received' AND read_at IS NULL
    `).run(Date.now(), sessionId);
    return result.changes;
  }

  deleteMessage(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare('DELETE FROM transfer_messages WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============================================
  // 文件传输 CRUD
  // ============================================

  createFileTransfer(file: TransferFile): TransferFile {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare(`
      INSERT INTO transfer_files (id, session_id, filename, file_size, mime_type, local_path, direction, status, progress, file_hash, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      file.id,
      file.session_id,
      file.filename,
      file.file_size,
      file.mime_type,
      file.local_path,
      file.direction,
      file.status,
      file.progress,
      file.file_hash,
      file.created_at,
      file.completed_at
    );
    
    return file;
  }

  getFileById(id: string): TransferFile | undefined {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM transfer_files WHERE id = ?').get(id) as TransferFile | undefined;
  }

  getFilesBySession(sessionId: string): TransferFile[] {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare('SELECT * FROM transfer_files WHERE session_id = ? ORDER BY created_at DESC')
      .all(sessionId) as TransferFile[];
  }

  updateFileProgress(id: string, progress: number): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare('UPDATE transfer_files SET progress = ?, status = ? WHERE id = ?')
      .run(progress, 'transferring', id);
    return result.changes > 0;
  }

  completeFileTransfer(id: string, localPath: string, fileHash?: string): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare(`
      UPDATE transfer_files 
      SET status = 'completed', progress = 100, local_path = ?, file_hash = ?, completed_at = ?
      WHERE id = ?
    `).run(localPath, fileHash || null, Date.now(), id);
    return result.changes > 0;
  }

  failFileTransfer(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare("UPDATE transfer_files SET status = 'failed' WHERE id = ?").run(id);
    return result.changes > 0;
  }

  cancelFileTransfer(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare("UPDATE transfer_files SET status = 'cancelled' WHERE id = ?").run(id);
    return result.changes > 0;
  }

  deleteFile(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare('DELETE FROM transfer_files WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============================================
  // 清理方法
  // ============================================

  /**
   * 清理过期会话（超过指定天数）
   */
  cleanupOldSessions(daysOld: number): number {
    if (!this.db) throw new Error('Database not initialized');
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const result = this.db.prepare('DELETE FROM transfer_sessions WHERE ended_at IS NOT NULL AND ended_at < ?').run(cutoff);
    return result.changes;
  }

  /**
   * 清理失败的文件传输记录
   */
  cleanupFailedTransfers(): number {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare("DELETE FROM transfer_files WHERE status IN ('failed', 'cancelled')").run();
    return result.changes;
  }

  /**
   * 获取统计信息
   */
  getStats(): { devices: number; sessions: number; messages: number; files: number } {
    if (!this.db) throw new Error('Database not initialized');
    
    const devices = (this.db.prepare('SELECT COUNT(*) as count FROM transfer_devices').get() as { count: number }).count;
    const sessions = (this.db.prepare('SELECT COUNT(*) as count FROM transfer_sessions').get() as { count: number }).count;
    const messages = (this.db.prepare('SELECT COUNT(*) as count FROM transfer_messages').get() as { count: number }).count;
    const files = (this.db.prepare('SELECT COUNT(*) as count FROM transfer_files').get() as { count: number }).count;
    
    return { devices, sessions, messages, files };
  }
}

export default TransferDatabase;
