import { Router } from 'express';
import { ItemService } from '../services/ItemService';
import { ResourceService } from '../services/ResourceService';

const router = Router();
const startTime = Date.now();

// GET /api/status - 服务器状态
router.get('/', (req, res) => {
  const itemService = new ItemService();
  const resourceService = new ResourceService();

  const countResult = itemService.getCount();
  const storageStats = resourceService.getStorageStats();

  res.json({
    healthy: true,
    version: '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    storage: {
      used: storageStats.used,
      total: 10737418240, // 10GB 默认
      itemCount: countResult.itemCount,
    },
  });
});

export default router;
