import { Router } from 'express';
import { ResourceService } from '../services/ResourceService';
import { createError } from '../middleware/errorHandler';
import { config } from '../config';

const router = Router();

// GET /api/resources/:id - 下载资源
router.get('/:id', (req, res, next) => {
  try {
    const resourceService = new ResourceService(req.userId);
    const data = resourceService.getResource(req.params.id);

    if (!data) {
      throw createError('Resource not found', 404);
    }

    // 设置默认 Content-Type
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(data);
  } catch (error) {
    next(error);
  }
});

// PUT /api/resources/:id - 上传资源
router.put('/:id', (req, res, next) => {
  try {
    // 检查文件大小
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > config.maxResourceSize) {
      throw createError(`Resource size exceeds limit (${config.maxResourceSize} bytes)`, 413);
    }

    const chunks: Buffer[] = [];
    
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const data = Buffer.concat(chunks);

        if (data.length > config.maxResourceSize) {
          res.status(413).json({ error: `Resource size exceeds limit (${config.maxResourceSize} bytes)` });
          return;
        }

        const resourceService = new ResourceService(req.userId);
        const saved = resourceService.putResource(req.params.id, data);
        if (!saved) {
          next(createError('Resource item not found or access denied', 404));
          return;
        }
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    });

    req.on('error', (error) => {
      next(error);
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/resources/:id - 删除资源
router.delete('/:id', (req, res, next) => {
  try {
    const resourceService = new ResourceService(req.userId);
    const deleted = resourceService.deleteResource(req.params.id);

    if (!deleted) {
      throw createError('Resource not found', 404);
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
