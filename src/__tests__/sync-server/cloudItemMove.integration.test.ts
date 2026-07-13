import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-move-it-'));

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(TMP_ROOT, 'sync.db');
process.env.RESOURCES_PATH = path.join(TMP_ROOT, 'resources');
process.env.UPLOAD_TEMP_PATH = path.join(TMP_ROOT, 'uploads');
process.env.JWT_SECRET = 'move-test-jwt-secret-aaaaaaaaaaaaaaaaaaaaaa';
process.env.JWT_REFRESH_SECRET = 'move-test-refresh-secret-aaaaaaaaaaaaaaaa';
process.env.LEGACY_API_KEY_AUTH_ENABLED = 'false';

fs.mkdirSync(TMP_ROOT, { recursive: true });
fs.mkdirSync(process.env.RESOURCES_PATH, { recursive: true });
fs.mkdirSync(process.env.UPLOAD_TEMP_PATH, { recursive: true });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDatabase, closeDatabase } = require('../../../sync-server/src/database');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ItemService } = require('../../../sync-server/src/services/ItemService');

const USER_ID = 'move-user-001';

function seedUser(): void {
  const db = getDatabase();
  const now = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO users
       (id, username, password_hash, sync_key_fingerprint, role, status, created_at, updated_at)
     VALUES (?, 'move-user', '$2b$10$abcdefghijklmnopqrstuv', 'move-fp', 'user', 'active', ?, ?)`
  ).run(USER_ID, now, now);
}

function seedCloudItem(
  id: string,
  type: 'cloud_file' | 'cloud_folder',
  relativePath: string
): void {
  const db = getDatabase();
  const now = Date.now();
  const payload = type === 'cloud_folder'
    ? {
      name: path.posix.basename(relativePath),
      parent_folder_id: 'root',
      relative_path: relativePath,
    }
    : {
      filename: path.posix.basename(relativePath),
      mime_type: 'text/plain',
      size: 1,
      file_hash: `hash-${id}`,
      parent_folder_id: 'root',
      relative_path: relativePath,
      mtime: now,
      upload_state: 'completed',
      chunk_size: 1024,
      total_chunks: 1,
      uploaded_chunks: [0],
      upload_session_id: null,
      error_message: null,
      download_state: 'completed',
      downloaded_size: 1,
      downloaded_at: now,
      download_error: null,
    };
  const payloadStr = JSON.stringify(payload);
  db.prepare(
    `INSERT OR REPLACE INTO items
       (id, type, payload, content_hash, remote_rev, deleted_time, created_time, updated_time,
        sync_status, local_rev, encryption_applied, schema_version, user_id)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 'clean', 0, 0, 1, ?)`
  ).run(
    id,
    type,
    payloadStr,
    crypto.createHash('sha256').update(payloadStr).digest('hex'),
    now,
    now,
    USER_ID
  );
}

function getRelativePath(id: string): string {
  const row = getDatabase().prepare('SELECT payload FROM items WHERE id = ?').get(id) as { payload: string };
  return JSON.parse(row.payload).relative_path;
}

describe('ItemService cloud item move conflict checks', () => {
  beforeEach(() => {
    closeDatabase();
    for (const file of fs.readdirSync(TMP_ROOT)) {
      if (file === 'resources' || file === 'uploads') continue;
      fs.rmSync(path.join(TMP_ROOT, file), { recursive: true, force: true });
    }
    seedUser();
  });

  afterAll(() => {
    closeDatabase();
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it('rejects moving a cloud file onto an occupied relative_path', () => {
    seedCloudItem('file-a', 'cloud_file', 'a.txt');
    seedCloudItem('file-b', 'cloud_file', 'b.txt');
    const service = new ItemService(USER_ID);

    expect(service.hasCloudPathConflict('file-a', 'b.txt')).toBe(true);
    expect(service.moveCloudItem('file-a', 'b.txt', 'root')).toBe(false);
    expect(getRelativePath('file-a')).toBe('a.txt');
  });

  it('detects descendant collisions before moving a cloud folder', () => {
    seedCloudItem('folder-docs', 'cloud_folder', 'docs');
    seedCloudItem('file-docs-a', 'cloud_file', 'docs/a.txt');
    seedCloudItem('folder-archive', 'cloud_folder', 'archive');
    seedCloudItem('file-archive-a', 'cloud_file', 'archive/a.txt');
    const service = new ItemService(USER_ID);

    expect(service.hasCloudPathConflict('folder-docs', 'archive')).toBe(true);
    expect(service.moveCloudItem('folder-docs', 'archive', 'root')).toBe(false);
    expect(getRelativePath('folder-docs')).toBe('docs');
    expect(getRelativePath('file-docs-a')).toBe('docs/a.txt');
  });
});
