// 数据库 Schema 定义
export const SCHEMA_VERSION = 1;

export const CREATE_ITEMS_TABLE = `
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    created_time INTEGER NOT NULL,
    updated_time INTEGER NOT NULL,
    deleted_time INTEGER,
    payload TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'modified',
    local_rev INTEGER NOT NULL DEFAULT 1,
    remote_rev TEXT,
    encryption_applied INTEGER NOT NULL DEFAULT 0,
    schema_version INTEGER NOT NULL DEFAULT 1
  )
`;

export const CREATE_ITEMS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_items_type ON items(type)',
  'CREATE INDEX IF NOT EXISTS idx_items_updated_time ON items(updated_time)',
  'CREATE INDEX IF NOT EXISTS idx_items_sync_status ON items(sync_status)',
  'CREATE INDEX IF NOT EXISTS idx_items_deleted_time ON items(deleted_time)',
];

// FTS5 全文搜索表
export const CREATE_FTS_TABLE = `
  CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
    id,
    title,
    content,
    tags,
    content='items',
    content_rowid='rowid'
  )
`;

// 同步元数据表
export const CREATE_SYNC_META_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`;

// Schema 版本表
export const CREATE_SCHEMA_VERSION_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )
`;

// 所有建表语句
export const ALL_SCHEMAS = [
  CREATE_ITEMS_TABLE,
  ...CREATE_ITEMS_INDEXES,
  CREATE_FTS_TABLE,
  CREATE_SYNC_META_TABLE,
  CREATE_SCHEMA_VERSION_TABLE,
];
