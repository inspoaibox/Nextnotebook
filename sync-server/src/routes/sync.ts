import { Router } from 'express';
import { getDatabase } from '../database';
import { createError } from '../middleware/errorHandler';

const router = Router();

/**
 * 获取用户标识符
 * JWT 认证使用 userId，API Key 认证使用 apiKeyHash
 */
function getUserIdentifier(req: Express.Request): string {
  if (req.userId) {
    return `user:${req.userId}`;
  }
  if (req.apiKeyHash) {
    return `apikey:${req.apiKeyHash}`;
  }
  throw createError('No authentication identifier', 401);
}

// GET /api/sync/cursor - 获取同步游标
router.get('/cursor', (req, res, next) => {
  try {
    const db = getDatabase();
    const identifier = getUserIdentifier(req);

    // 优先查询新的用户系统
    if (req.userId) {
      const row = db.prepare('SELECT cursor, updated_at FROM sync_cursors WHERE api_key_hash = ?')
        .get(identifier) as { cursor: string; updated_at: number } | undefined;

      if (row) {
        res.json({ cursor: row.cursor, updated_at: row.updated_at });
        return;
      }
    }

    // 向后兼容：查询旧的 API Key 系统
    if (req.apiKeyHash) {
      const row = db.prepare('SELECT cursor, updated_at FROM sync_cursors WHERE api_key_hash = ?')
        .get(req.apiKeyHash) as { cursor: string; updated_at: number } | undefined;

      if (row) {
        res.json({ cursor: row.cursor, updated_at: row.updated_at });
        return;
      }
    }

    res.json({ cursor: null });
  } catch (error) {
    next(error);
  }
});

// PUT /api/sync/cursor - 保存同步游标
router.put('/cursor', (req, res, next) => {
  try {
    const db = getDatabase();
    const identifier = getUserIdentifier(req);
    const { cursor } = req.body;

    if (cursor === undefined) {
      throw createError('Missing required field: cursor', 400);
    }

    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO sync_cursors (api_key_hash, cursor, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(api_key_hash) DO UPDATE SET cursor = ?, updated_at = ?
    `);
    stmt.run(identifier, cursor, now, cursor, now);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/sync/key-fingerprint - 获取密钥指纹
router.get('/key-fingerprint', (req, res, next) => {
  try {
    const db = getDatabase();

    // JWT 认证：从用户表获取指纹
    if (req.userId) {
      const user = db.prepare('SELECT sync_key_fingerprint FROM users WHERE id = ?')
        .get(req.userId) as { sync_key_fingerprint: string } | undefined;
      res.json({ fingerprint: user?.sync_key_fingerprint || null });
      return;
    }

    // API Key 认证：从旧表获取指纹
    if (req.apiKeyHash) {
      const row = db.prepare('SELECT fingerprint FROM key_fingerprints WHERE api_key_hash = ?')
        .get(req.apiKeyHash) as { fingerprint: string } | undefined;
      res.json({ fingerprint: row?.fingerprint || null });
      return;
    }

    res.json({ fingerprint: null });
  } catch (error) {
    next(error);
  }
});

// PUT /api/sync/key-fingerprint - 保存密钥指纹
router.put('/key-fingerprint', (req, res, next) => {
  try {
    const db = getDatabase();
    const { fingerprint } = req.body;

    if (!fingerprint) {
      throw createError('Missing required field: fingerprint', 400);
    }

    // JWT 认证：指纹已在用户表中，只需验证
    if (req.userId) {
      const user = db.prepare('SELECT sync_key_fingerprint FROM users WHERE id = ?')
        .get(req.userId) as { sync_key_fingerprint: string } | undefined;

      if (!user) {
        throw createError('User not found', 404);
      }

      // 验证指纹是否匹配
      if (user.sync_key_fingerprint !== fingerprint) {
        res.status(409).json({
          error: 'Fingerprint conflict',
          message: '同步密钥指纹不匹配，请检查同步密钥是否正确',
        });
        return;
      }

      res.json({ success: true });
      return;
    }

    // API Key 认证：使用旧表
    if (req.apiKeyHash) {
      const existing = db.prepare('SELECT fingerprint FROM key_fingerprints WHERE api_key_hash = ?')
        .get(req.apiKeyHash) as { fingerprint: string } | undefined;

      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          res.status(409).json({
            error: 'Fingerprint conflict',
            existingFingerprint: existing.fingerprint,
          });
          return;
        }
        res.json({ success: true });
        return;
      }

      const now = Date.now();
      const stmt = db.prepare(`
        INSERT INTO key_fingerprints (api_key_hash, fingerprint, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(req.apiKeyHash, fingerprint, now, now);

      res.json({ success: true });
      return;
    }

    throw createError('No authentication identifier', 401);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/sync/key-fingerprint - 重置密钥指纹（管理员操作）
router.delete('/key-fingerprint', (req, res, next) => {
  try {
    const db = getDatabase();

    // JWT 认证：不允许通过此接口重置（需要通过用户设置更新）
    if (req.userId) {
      res.status(403).json({
        error: 'Forbidden',
        message: '请通过用户设置更新同步密钥',
      });
      return;
    }

    // API Key 认证：允许重置
    if (req.apiKeyHash) {
      const stmt = db.prepare('DELETE FROM key_fingerprints WHERE api_key_hash = ?');
      stmt.run(req.apiKeyHash);
      res.json({ success: true });
      return;
    }

    throw createError('No authentication identifier', 401);
  } catch (error) {
    next(error);
  }
});

export default router;
