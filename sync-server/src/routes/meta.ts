import { Router } from 'express';
import { getDatabase } from '../database';
import { SERVER_CAPABILITIES } from '../database/schema';

const router = Router();

/**
 * 获取用户标识符
 */
function getUserIdentifier(req: Express.Request): string {
  if (req.userId) {
    return `user:${req.userId}`;
  }
  if (req.apiKeyHash) {
    return `apikey:${req.apiKeyHash}`;
  }
  return 'global';
}

function parseCapabilities(value?: string): string[] {
  if (!value) {
    return SERVER_CAPABILITIES;
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return Array.from(new Set([...parsed.filter(v => typeof v === 'string'), ...SERVER_CAPABILITIES]));
    }
  } catch {
    // Fall through to the authoritative server capability list.
  }

  return SERVER_CAPABILITIES;
}

// GET /api/meta - 获取服务器元数据
router.get('/', (req, res) => {
  const db = getDatabase();
  const identifier = getUserIdentifier(req);

  const versionRow = db.prepare('SELECT value FROM metadata WHERE key = ?').get('version') as { value: string } | undefined;
  const capabilitiesRow = db.prepare('SELECT value FROM metadata WHERE key = ?').get('capabilities') as { value: string } | undefined;
  
  // 用户隔离的 last_sync_time
  const lastSyncKey = `last_sync_time:${identifier}`;
  const lastSyncRow = db.prepare('SELECT value FROM metadata WHERE key = ?').get(lastSyncKey) as { value: string } | undefined;
  const keyIdentifierKey = `key_identifier:${identifier}`;
  const keyIdentifierRow = db.prepare('SELECT value FROM metadata WHERE key = ?').get(keyIdentifierKey) as { value: string } | undefined;

  res.json({
    version: versionRow?.value || '1.0',
    capabilities: parseCapabilities(capabilitiesRow?.value),
    last_sync_time: lastSyncRow ? parseInt(lastSyncRow.value, 10) : null,
    key_identifier: keyIdentifierRow?.value || null,
  });
});

// PUT /api/meta - 更新服务器元数据
router.put('/', (req, res) => {
  const db = getDatabase();
  const identifier = getUserIdentifier(req);
  const { last_sync_time, key_identifier } = req.body;
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO metadata (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
  `);

  if (last_sync_time !== undefined) {
    // 用户隔离的 last_sync_time
    const lastSyncKey = `last_sync_time:${identifier}`;
    stmt.run(lastSyncKey, last_sync_time.toString(), now, last_sync_time.toString(), now);
  }

  if (typeof key_identifier === 'string') {
    const keyIdentifierKey = `key_identifier:${identifier}`;
    stmt.run(keyIdentifierKey, key_identifier, now, key_identifier, now);
  }

  res.json({ success: true });
});

export default router;
