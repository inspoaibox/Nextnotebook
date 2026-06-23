import { Router } from 'express';
import { ItemService } from '../services/ItemService';
import { createError } from '../middleware/errorHandler';
import { getDatabase } from '../database';
import { userService } from '../services/UserService';

const router = Router();

const VALID_ITEM_TYPES = new Set([
  'note',
  'folder',
  'tag',
  'resource',
  'todo',
  'vault_entry',
  'vault_folder',
  'bookmark',
  'bookmark_folder',
  'diagram',
  'ai_config',
  'ai_conversation',
  'ai_message',
  'excel_note',
  'template',
]);

function validateItemId(id: unknown): void {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(id)) {
    throw createError('Invalid item id', 400);
  }
}

function validateItemType(type: unknown): void {
  if (typeof type !== 'string' || !VALID_ITEM_TYPES.has(type)) {
    throw createError('Invalid item type', 400);
  }
}

function validateIncomingItem(item: { id?: unknown; type?: unknown }): void {
  validateItemId(item.id);
  validateItemType(item.type);
}

// GET /api/items/all - 全量拉取所有数据项（新客户端首次同步使用）
router.get('/all', (req, res, next) => {
  try {
    userService.claimLegacyDataForSingleUser(req.userId);
    const db = getDatabase();
    let sql = 'SELECT * FROM items';
    const params: (string | number)[] = [];

    if (req.userId) {
      sql += ' WHERE user_id = ?';
      params.push(req.userId);
    }

    sql += ' ORDER BY updated_time ASC';

    const items = db.prepare(sql).all(...params);

    // 返回当前最大 change_id，客户端全量拉取后用这个值作为游标（按用户过滤）
    let maxChangeSql = 'SELECT MAX(change_id) as max_id FROM changes';
    const maxChangeParams: (string | number)[] = [];
    if (req.userId) {
      maxChangeSql += ' WHERE user_id = ?';
      maxChangeParams.push(req.userId);
    }
    const maxChange = db.prepare(maxChangeSql).get(...maxChangeParams) as { max_id: number | null };
    const latestChangeId = maxChange?.max_id ?? 0;

    res.json({ items, latestChangeId });
  } catch (error) {
    next(error);
  }
});

// GET /api/items/count - 获取数据项计数
router.get('/count', (req, res, next) => {
  try {
    const itemService = new ItemService(req.userId);
    const type = req.query.type as string | undefined;
    if (type) {
      validateItemType(type);
    }
    const result = itemService.getCount(type);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/items/list - 获取数据项列表（管理界面用）
router.get('/list', (req, res, next) => {
  try {
    userService.claimLegacyDataForSingleUser(req.userId);
    const db = getDatabase();
    const type = req.query.type as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    if (type) {
      validateItemType(type);
    }
    
    // 构建查询
    let sql = 'SELECT * FROM items WHERE deleted_time IS NULL';
    const params: (string | number)[] = [];
    
    if (req.userId) {
      sql += ' AND user_id = ?';
      params.push(req.userId);
    }
    
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    
    sql += ' ORDER BY updated_time DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const items = db.prepare(sql).all(...params);
    res.json({ items, limit, offset });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/items/cleanup - 清理软删除数据
router.delete('/cleanup', (req, res) => {
  const itemService = new ItemService(req.userId);
  const before = req.query.before 
    ? parseInt(req.query.before as string, 10) 
    : Date.now() - 30 * 24 * 60 * 60 * 1000; // 默认 30 天前

  const deleted = itemService.cleanupSoftDeleted(before);
  res.json({
    deleted,
    message: `Cleaned up ${deleted} soft-deleted items`,
  });
});

// POST /api/items/batch - 批量上传
router.post('/batch', (req, res, next) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      throw createError('Items must be an array', 400);
    }

    if (items.length > 100) {
      throw createError('Batch size exceeds limit (100)', 400);
    }

    items.forEach(validateIncomingItem);

    const itemService = new ItemService(req.userId);
    const result = itemService.batchPut(items);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/items/:id - 获取单个数据项
router.get('/:id', (req, res, next) => {
  try {
    validateItemId(req.params.id);
    const itemService = new ItemService(req.userId);
    const item = itemService.getItem(req.params.id);

    if (!item) {
      throw createError('Item not found', 404);
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

// PUT /api/items/:id - 创建或更新数据项
router.put('/:id', (req, res, next) => {
  try {
    validateItemId(req.params.id);
    const itemService = new ItemService(req.userId);
    const item = {
      ...req.body,
      id: req.params.id,
    };

    // 验证必需字段
    if (!item.type || !item.payload || !item.content_hash) {
      throw createError('Missing required fields: type, payload, content_hash', 400);
    }
    validateIncomingItem(item);

    // 记录同步上传详情
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Item PUT',
      itemId: item.id,
      type: item.type,
      userId: req.userId,
      contentHash: item.content_hash,
      payloadLength: item.payload?.length || 0,
    }));

    const result = itemService.putItem(item);
    res.json({ success: true, remoteRev: result.remoteRev });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/items/:id - 硬删除数据项
router.delete('/:id', (req, res, next) => {
  try {
    validateItemId(req.params.id);
    const itemService = new ItemService(req.userId);
    const deleted = itemService.deleteItem(req.params.id);

    if (!deleted) {
      throw createError('Item not found', 404);
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
