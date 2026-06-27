import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { ResourceService } from '../services/ResourceService';
import { createError } from '../middleware/errorHandler';
import { config } from '../config';

const router = Router();

// 扩展名 -> Content-Type 的轻量映射，仅覆盖网盘/笔记常用类型。
// 未命中时回退到 application/octet-stream（浏览器走下载而非内联，安全默认）。
const MIME_BY_EXTENSION: Record<string, string> = {
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function getMimeType(id: string): string {
  const ext = path.extname(id).toLowerCase();
  return MIME_BY_EXTENSION[ext] || 'application/octet-stream';
}

function contentDispositionAttachment(filename: string): string {
  const fallback = path.basename(filename || 'download')
    .replace(/[\r\n"]/g, '_')
    .replace(/[^\x20-\x7E]/g, '_') || 'download';
  const encoded = encodeURIComponent(path.basename(filename || 'download'));
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * 解析 Range 请求头，返回 {start, end}（end 为闭区间）。
 * 仅支持单段 bytes=start-end / bytes=start- / bytes=-suffix 三种形式。
 * 失败时返回 null，调用方应回退到 416。
 */
function parseRange(rangeHeader: string, totalSize: number): { start: number; end: number } | null {
  // 形如 "bytes=0-1023" 或 "bytes=0-"
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return null;
  }

  const startStr = match[1];
  const endStr = match[2];

  // bytes=-N：取最后 N 字节
  if (!startStr && endStr) {
    const suffix = parseInt(endStr, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) {
      return null;
    }
    const start = Math.max(0, totalSize - suffix);
    return { start, end: totalSize - 1 };
  }

  // bytes=N- 或 bytes=N-M
  if (startStr) {
    const start = parseInt(startStr, 10);
    if (!Number.isFinite(start) || start < 0 || start >= totalSize) {
      return null;
    }
    const end = endStr ? Math.min(parseInt(endStr, 10), totalSize - 1) : totalSize - 1;
    if (!Number.isFinite(end) || end < start) {
      return null;
    }
    return { start, end };
  }

  return null;
}

// GET /api/resources/:id - 下载资源（支持 HTTP Range / 206，用于网盘大文件断点续传）
router.get('/:id', (req, res, next) => {
  try {
    const resourceService = new ResourceService(req.userId);
    const filePath = resourceService.resolveResourcePath(req.params.id);

    if (!filePath) {
      throw createError('Resource not found', 404);
    }

    // 统一走 fs.statSync 获取文件大小；缺失说明访问校验通过但磁盘文件已丢失
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      throw createError('Resource file missing on disk', 404);
    }

    const totalSize = stat.size;
    const contentType = getMimeType(path.basename(filePath));
    if (req.query.download === '1') {
      const filename = typeof req.query.filename === 'string' ? req.query.filename : req.params.id;
      res.setHeader('Content-Disposition', contentDispositionAttachment(filename));
    }

    // 始终声明支持断点续传，客户端据此决定是否复用已下载部分
    res.setHeader('Accept-Ranges', 'bytes');

    const rangeHeader = req.headers.range;
    if (!rangeHeader) {
      // 无 Range 头：整文件 200 响应，流式输出避免 readFileSync 全量进内存
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(totalSize));
      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => next(err));
      stream.pipe(res);
      return;
    }

    const range = parseRange(rangeHeader, totalSize);
    if (!range) {
      // 非法 Range：416 + 给出资源总大小，便于客户端修正
      res.setHeader('Content-Range', `bytes */${totalSize}`);
      res.status(416).end();
      return;
    }

    const { start, end } = range;
    const chunkSize = end - start + 1;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(chunkSize));
    res.setHeader(
      'Content-Range',
      `bytes ${start}-${end}/${totalSize}`
    );
    res.status(206);

    // 客户端断开连接时直接销毁流，避免 EPIPE/ECONNRESET 噪音
    req.on('close', () => {
      /* 流由 pipe 生命周期管理；此处仅作占位，避免额外销毁竞态 */
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', (err) => {
      if (!res.headersSent) {
        next(err);
      } else {
        // 头已发送，只能静默销毁底层 socket
        res.destroy();
      }
    });
    stream.pipe(res);
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
    let receivedBytes = 0;
    let rejected = false;
    
    req.on('data', (chunk: Buffer) => {
      if (rejected) {
        return;
      }

      receivedBytes += chunk.length;
      if (receivedBytes > config.maxResourceSize) {
        rejected = true;
        chunks.length = 0;
        res.status(413).json({ error: `Resource size exceeds limit (${config.maxResourceSize} bytes)` });
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        if (rejected || res.headersSent) {
          return;
        }

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
      if (rejected || res.headersSent) {
        return;
      }
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
