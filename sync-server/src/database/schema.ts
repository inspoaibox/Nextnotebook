import Database from 'better-sqlite3';

// 数据库版本号 - 用于迁移
const SCHEMA_VERSION = 5;

// 服务端真实支持的能力声明，供 /api/meta 与数据库初始化共用。
export const SERVER_CAPABILITIES = [
  'items',
  'resources',
  'changes',
  'auth',
  'cloud_drive',
  'chunked_upload',
  'range_download',
];

export function initializeSchema(db: Database.Database): void {
  // items 表 - 存储所有同步数据项
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      remote_rev TEXT,
      deleted_time INTEGER,
      created_time INTEGER NOT NULL,
      updated_time INTEGER NOT NULL,
      sync_status TEXT DEFAULT 'clean',
      local_rev INTEGER DEFAULT 0,
      encryption_applied INTEGER DEFAULT 0,
      schema_version INTEGER DEFAULT 1,
      user_id TEXT
    )
  `);

  // changes 表 - 变更日志
  db.exec(`
    CREATE TABLE IF NOT EXISTS changes (
      change_id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      updated_time INTEGER NOT NULL,
      deleted_time INTEGER,
      content_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      user_id TEXT
    )
  `);

  // metadata 表 - 服务器元数据
  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // key_fingerprints 表 - 密钥指纹
  db.exec(`
    CREATE TABLE IF NOT EXISTS key_fingerprints (
      api_key_hash TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // sync_cursors 表 - 同步游标
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_cursors (
      api_key_hash TEXT PRIMARY KEY,
      cursor TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // ========== 用户认证系统表 ==========

  // users 表 - 用户账号
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      sync_key_fingerprint TEXT NOT NULL,
      role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login_at INTEGER
    )
  `);

  // sessions 表 - 用户会话
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      refresh_token_hash TEXT NOT NULL,
      device_info TEXT,
      ip_address TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // audit_logs 表 - 审计日志
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      user_agent TEXT,
      details TEXT,
      success INTEGER NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  // rate_limits 表 - 频率限制
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      window_start INTEGER NOT NULL,
      blocked_until INTEGER,
      block_count INTEGER DEFAULT 0
    )
  `);

  // 创建索引 - 原有索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
    CREATE INDEX IF NOT EXISTS idx_items_updated_time ON items(updated_time);
    CREATE INDEX IF NOT EXISTS idx_items_deleted_time ON items(deleted_time);
    CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);
    CREATE INDEX IF NOT EXISTS idx_changes_item_id ON changes(item_id);
    CREATE INDEX IF NOT EXISTS idx_changes_created_at ON changes(created_at);
    CREATE INDEX IF NOT EXISTS idx_changes_user_id ON changes(user_id);
  `);

  // 创建索引 - 用户认证系统索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
  `);

  // system_settings 表 - 系统设置
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // 初始化默认元数据
  const now = Date.now();
  const initMeta = db.prepare(`
    INSERT OR IGNORE INTO metadata (key, value, updated_at) VALUES (?, ?, ?)
  `);
  
  initMeta.run('version', '1.0', now);
  initMeta.run('capabilities', JSON.stringify(SERVER_CAPABILITIES), now);
  initMeta.run('schema_version', String(SCHEMA_VERSION), now);

  // 初始化系统设置（默认开放注册，直到第一个管理员创建）
  const initSetting = db.prepare(`
    INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)
  `);
  initSetting.run('registration_enabled', 'true', now);
}

// 运行数据库迁移
export function runMigrations(db: Database.Database): void {
  // 获取当前 schema 版本
  let currentVersion = 1;
  try {
    const row = db.prepare('SELECT value FROM metadata WHERE key = ?').get('schema_version') as { value: string } | undefined;
    if (row) {
      currentVersion = parseInt(row.value, 10);
    }
  } catch {
    // 表可能不存在，使用默认版本
  }

  // 迁移到版本 2：添加 user_id 字段
  if (currentVersion < 2) {
    migrateToV2(db);
  }

  // 迁移到版本 3：添加 system_settings 表
  if (currentVersion < 3) {
    migrateToV3(db);
  }

  // 迁移到版本 4：添加 block_count 字段到 rate_limits 表
  if (currentVersion < 4) {
    migrateToV4(db);
  }

  // 迁移到版本 5：补齐服务端能力声明（网盘 / 分块上传 / Range 下载）
  if (currentVersion < 5) {
    migrateToV5(db);
  }

  // 更新 schema 版本
  const now = Date.now();
  db.prepare('INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, ?)')
    .run('schema_version', String(SCHEMA_VERSION), now);
}

// 迁移到版本 2：添加用户隔离支持
function migrateToV2(db: Database.Database): void {
  // 检查 items 表是否已有 user_id 字段
  const itemsInfo = db.prepare("PRAGMA table_info(items)").all() as Array<{ name: string }>;
  const hasItemsUserId = itemsInfo.some(col => col.name === 'user_id');
  
  if (!hasItemsUserId) {
    db.exec('ALTER TABLE items ADD COLUMN user_id TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id)');
  }

  // 检查 changes 表是否已有 user_id 字段
  const changesInfo = db.prepare("PRAGMA table_info(changes)").all() as Array<{ name: string }>;
  const hasChangesUserId = changesInfo.some(col => col.name === 'user_id');
  
  if (!hasChangesUserId) {
    db.exec('ALTER TABLE changes ADD COLUMN user_id TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_changes_user_id ON changes(user_id)');
  }
}


// 迁移到版本 3：添加 system_settings 表
function migrateToV3(db: Database.Database): void {
  // 检查 system_settings 表是否存在
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='system_settings'").all();
  
  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    
    // 初始化默认设置
    const now = Date.now();
    db.prepare('INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('registration_enabled', 'true', now);
  }
}

// 迁移到版本 4：添加 block_count 字段到 rate_limits 表（渐进式封禁）
function migrateToV4(db: Database.Database): void {
  // 检查 rate_limits 表是否已有 block_count 字段
  const rateLimitsInfo = db.prepare("PRAGMA table_info(rate_limits)").all() as Array<{ name: string }>;
  const hasBlockCount = rateLimitsInfo.some(col => col.name === 'block_count');
  
  if (!hasBlockCount) {
    db.exec('ALTER TABLE rate_limits ADD COLUMN block_count INTEGER DEFAULT 0');
  }
}

// 迁移到版本 5：补齐 capabilities 元数据，兼容已初始化过的旧服务器数据库
function migrateToV5(db: Database.Database): void {
  const now = Date.now();
  const row = db.prepare('SELECT value FROM metadata WHERE key = ?')
    .get('capabilities') as { value: string } | undefined;

  let capabilities = SERVER_CAPABILITIES;
  if (row?.value) {
    try {
      const existing = JSON.parse(row.value);
      if (Array.isArray(existing)) {
        capabilities = Array.from(new Set([...existing, ...SERVER_CAPABILITIES]));
      }
    } catch {
      capabilities = SERVER_CAPABILITIES;
    }
  }

  db.prepare(`
    INSERT INTO metadata (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
  `).run(
    'capabilities',
    JSON.stringify(capabilities),
    now,
    JSON.stringify(capabilities),
    now
  );
}
