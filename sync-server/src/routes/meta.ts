import { Router } from 'express';
import { getDatabase } from '../database';

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

// GET /api/meta - 获取服务器元数据
router.get('/', (req, res) => {
  const db = getDatabase();
  const identifier = getUserIdentifier(req);

  const versionRow = db.prepare('SELECT value FROM metadata WHERE key = ?').get('version') as { value: string } | undefined;
  const capabilitiesRow = db.prepare('SELECT value FROM metadata WHERE key = ?').get('capabilities') as { value: string } | undefined;
  
  // 用户隔离的 last_sync_time
  const lastSyncKey = `last_sync_time:${identifier}`;
  const lastSyncRow = db.prepare('SELECT value FROM metadata WHERE key = ?').get(lastSyncKey) as { value: string } | undefined;

  res.json({
    version: versionRow?.value || '1.0',
    capabilities: capabilitiesRow ? JSON.parse(capabilitiesRow.value) : ['items', 'resources', 'changes', 'auth'],
    last_sync_time: lastSyncRow ? parseInt(lastSyncRow.value, 10) : null,
  });
});

// PUT /api/meta - 更新服务器元数据
router.put('/', (req, res) => {
  const db = getDatabase();
  const identifier = getUserIdentifier(req);
  const { last_sync_time } = req.body;
  const now = Date.now();

  if (last_sync_time !== undefined) {
    // 用户隔离的 last_sync_time
    const lastSyncKey = `last_sync_time:${identifier}`;
    const stmt = db.prepare(`
      INSERT INTO metadata (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
    `);
    stmt.run(lastSyncKey, last_sync_time.toString(), now, last_sync_time.toString(), now);
  }

  res.json({ success: true });
});

export default router;
