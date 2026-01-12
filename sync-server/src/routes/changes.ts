import { Router } from 'express';
import { ChangeService } from '../services/ChangeService';
import { createError } from '../middleware/errorHandler';

const router = Router();

// GET /api/changes - 获取变更列表
router.get('/', (req, res, next) => {
  try {
    const changeService = new ChangeService();
    const cursor = req.query.cursor as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    const result = changeService.listChanges(cursor, limit, req.userId);
    
    // 记录变更查询详情
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Changes GET',
      userId: req.userId,
      cursor: cursor || 'null',
      limit,
      changesCount: result.changes.length,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    }));
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/changes - 清理过期变更
router.delete('/', (req, res, next) => {
  try {
    const before = req.query.before as string | undefined;

    if (!before) {
      throw createError('Missing required parameter: before', 400);
    }

    const changeService = new ChangeService();
    const deleted = changeService.cleanupBefore(parseInt(before, 10));
    res.json({ deleted });
  } catch (error) {
    next(error);
  }
});

export default router;
