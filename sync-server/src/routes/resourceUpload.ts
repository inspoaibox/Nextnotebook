import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';
import { createError } from '../middleware/errorHandler';
import { ResourceService } from '../services/ResourceService';
import { ItemService } from '../services/ItemService';
import { log } from '../middleware/logger';

const router = Router();

// ---------------------------------------------------------------------------
// 分块上传会话表（进程内）
// ---------------------------------------------------------------------------
// 一次上传会话只对应一个 item（resource 或 cloud_file）。会话创建时校验：
//   - item 元数据已存在于 items 表
//   - 归属当前登录用户
// 之后按 (sessionId, chunkIndex) 接收分块并流式落盘到临时目录，
// 全部分块到齐后在 complete 端点拼接到目标存储路径（与下载端点一致）。
// 会话 TTL 内可重复调用 status/complete 实现断点续传。

interface UploadSession {
  sessionId: string;
  itemId: string;
  extension: string;       // 文件扩展名（含点，如 ".xlsx"）
  totalSize: number;
  totalChunks: number;
  chunkSize: number;
  userId?: string;         // 创建会话的用户（防止他人操作别人的会话）
  createdAt: number;
  lastActivityAt: number;  // 最近一次写入分块的时间，用于空闲超时清理
  uploadedChunks: Set<number>;
}

const sessions = new Map<string, UploadSession>();

// 会话临时目录：{uploadTempPath}/{sessionId}/
function sessionDir(sessionId: string): string {
  return path.join(config.uploadTempPath, sessionId);
}

function chunkPath(sessionId: string, chunkIndex: number): string {
  return path.join(sessionDir(sessionId), String(chunkIndex).padStart(10, '0'));
}

function validateSessionId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(id)) {
    throw createError('Invalid session id', 400);
  }
}

// 确保请求者与会话所有者一致。会话不存在返回 404，不属于本人返回 403。
function requireSession(sessionId: string, userId?: string): UploadSession {
  const session = sessions.get(sessionId);
  if (!session) {
    throw createError('Upload session not found', 404);
  }
  if (session.userId && userId && session.userId !== userId) {
    throw createError('Access denied', 403);
  }
  return session;
}

// 后台定时清理空闲超时会话（去抖执行的兜底）。
let cleanupScheduled = false;
function scheduleCleanup(): void {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setTimeout(() => {
    cleanupScheduled = false;
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastActivityAt > config.uploadSessionTtl) {
        sessions.delete(id);
        // 删除临时目录（best-effort，不阻塞主流程）
        fs.rm(sessionDir(id), { recursive: true, force: true }, () => {});
        log('info', 'UploadSession', { message: 'session expired', sessionId: id });
      }
    }
    if (sessions.size > 0) {
      scheduleCleanup();
    }
  }, Math.min(config.uploadSessionTtl, 60 * 60 * 1000)).unref();
}

// ---------------------------------------------------------------------------
// POST /api/resources/upload - 创建分块上传会话
// ---------------------------------------------------------------------------
// Body: { item_id, total_size, chunk_size, extension? }
// 响应: { session_id, chunk_size, total_chunks, uploaded_chunks: [] }
router.post('/upload', (req, res, next) => {
  try {
    const { item_id, total_size, chunk_size, extension } = (req.body || {}) as {
      item_id?: string;
      total_size?: number;
      chunk_size?: number;
      extension?: string;
    };

    if (typeof item_id !== 'string' || !/^[A-Za-z0-9._-]{1,255}$/.test(item_id) || item_id.includes('..')) {
      throw createError('Invalid item_id', 400);
    }
    if (!Number.isFinite(total_size) || (total_size as number) <= 0) {
      throw createError('Invalid total_size', 400);
    }
    if (!Number.isFinite(chunk_size) || (chunk_size as number) <= 0) {
      throw createError('Invalid chunk_size', 400);
    }

    const totalSize = Math.floor(total_size as number);
    const requestedChunkSize = Math.floor(chunk_size as number);

    // 服务端硬上限检查
    if (totalSize > config.maxChunkedUploadSize) {
      throw createError(
        `File size exceeds server limit (${config.maxChunkedUploadSize} bytes)`,
        413,
        'FILE_TOO_LARGE'
      );
    }
    // 客户端可能配置了更大的分块。这里按服务端硬上限下调并把实际
    // chunk_size 返回给客户端，桌面端会据此更新会话并按新分块续传。
    const chunkSize = Math.min(requestedChunkSize, config.maxUploadChunkSize);

    // 规范化扩展名：确保以点开头且不含路径分隔符
    let ext = '';
    if (typeof extension === 'string' && extension.length > 0) {
      ext = extension.startsWith('.') ? extension : `.${extension}`;
      if (!/^\.[A-Za-z0-9._-]+$/.test(ext)) {
        throw createError('Invalid extension', 400);
      }
    }

    // 校验 item 归属当前用户（cloud_file / resource 均可）
    const resourceService = new ResourceService(req.userId);
    const access = resourceService.canAccessItem(item_id);
    if (!access.ok) {
      throw createError('Item not found or access denied', 404);
    }

    const totalChunks = Math.ceil(totalSize / chunkSize);
    const sessionId = crypto.randomBytes(16).toString('hex');
    fs.mkdirSync(sessionDir(sessionId), { recursive: true });

    const session: UploadSession = {
      sessionId,
      itemId: item_id,
      extension: ext,
      totalSize,
      totalChunks,
      chunkSize,
      userId: req.userId,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      uploadedChunks: new Set(),
    };
    sessions.set(sessionId, session);
    scheduleCleanup();

    log('info', 'UploadSession', {
      message: 'session created',
      sessionId,
      itemId: item_id,
      totalSize,
      requestedChunkSize,
      chunkSize,
      totalChunks,
      userId: req.userId,
    });

    res.json({
      session_id: sessionId,
      chunk_size: chunkSize,
      total_chunks: totalChunks,
      uploaded_chunks: [],
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/resources/upload/:sessionId/chunk - 上传单个分块
// ---------------------------------------------------------------------------
// Header: X-Chunk-Index: <number>
// Body: 原始二进制流（流式落盘，不在内存中缓存整块）
router.put('/upload/:sessionId/chunk', (req, res, next) => {
  const { sessionId } = req.params;
  validateSessionId(sessionId);

  const session = sessions.get(sessionId);
  if (!session) {
    return next(createError('Upload session not found', 404));
  }
  if (session.userId && req.userId && session.userId !== req.userId) {
    return next(createError('Access denied', 403));
  }

  const chunkIndex = parseInt(req.headers['x-chunk-index'] as string, 10);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.totalChunks) {
    return next(createError('Invalid chunk index', 400));
  }

  // 已上传的分块直接幂等返回成功（支持重复上传）
  if (session.uploadedChunks.has(chunkIndex)) {
    // 丢弃本次请求体，避免连接挂起
    req.resume();
    return res.json({ session_id: sessionId, chunk_index: chunkIndex, accepted: true, duplicate: true });
  }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > session.chunkSize && contentLength > config.maxUploadChunkSize) {
    return next(createError('Chunk too large', 413, 'CHUNK_TOO_LARGE'));
  }

  // 流式落盘到临时文件
  const filePath = chunkPath(sessionId, chunkIndex);
  const writeStream = fs.createWriteStream(filePath);
  let receivedBytes = 0;
  let rejected = false;
  let hardCap = Math.max(session.chunkSize, config.maxUploadChunkSize);

  req.on('data', (chunk: Buffer) => {
    if (rejected) return;
    receivedBytes += chunk.length;
    if (receivedBytes > hardCap) {
      rejected = true;
      writeStream.destroy();
      fs.rm(filePath, { force: true }, () => {});
      res.status(413).json({ error: 'Chunk too large', code: 'CHUNK_TOO_LARGE' });
      req.destroy();
      return;
    }
    writeStream.write(chunk);
  });

  req.on('end', () => {
    if (rejected || res.headersSent) return;
    writeStream.end(() => {
      session.uploadedChunks.add(chunkIndex);
      session.lastActivityAt = Date.now();
      res.json({ session_id: sessionId, chunk_index: chunkIndex, accepted: true, duplicate: false });
    });
  });

  req.on('error', (err) => {
    if (rejected || res.headersSent) return;
    writeStream.destroy();
    fs.rm(filePath, { force: true }, () => {});
    next(err);
  });
});

// ---------------------------------------------------------------------------
// POST /api/resources/upload/:sessionId/complete - 完成上传，拼接分块到最终存储路径
// ---------------------------------------------------------------------------
// 响应: { success: true, item_id, location, size, sha256 }
router.post('/upload/:sessionId/complete', (req, res, next) => {
  try {
    const { sessionId } = req.params;
    validateSessionId(sessionId);
    const session = requireSession(sessionId, req.userId);

    if (session.uploadedChunks.size !== session.totalChunks) {
      throw createError(
        `Missing chunks: ${session.uploadedChunks.size}/${session.totalChunks}`,
        409,
        'INCOMPLETE'
      );
    }

    const resourceService = new ResourceService(req.userId);
    // 再次确认 item 归属（防止元数据在会话期间被删除/转交）
    const access = resourceService.canAccessItem(session.itemId);
    if (!access.ok) {
      throw createError('Item not found or access denied', 404);
    }

    const finalPath = resourceService.resolveStoragePath(session.itemId, session.extension);
    const targetDir = path.dirname(finalPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 拼接：把所有分块按顺序写入目标文件（原子写：先写临时文件再 rename）
    const tempFinal = `${finalPath}.assembling.${crypto.randomBytes(4).toString('hex')}`;
    const out = fs.createWriteStream(tempFinal);
    const hash = crypto.createHash('sha256');
    let totalWritten = 0;
    let currentIndex = 0;

    const stitchNext = (): void => {
      if (currentIndex >= session.totalChunks) {
        out.end(() => {
          // 重命名为最终文件（覆盖已有文件）
          fs.renameSync(tempFinal, finalPath);
          sessions.delete(sessionId);
          fs.rm(sessionDir(sessionId), { recursive: true, force: true }, () => {});

          const sha256Hex = hash.digest('hex');

          // 写入 items 表（payload 置为 completed 状态），触发 changes 表记录，
          // 使下载端能在游标增量同步中感知到本次上传的新文件/新版本。
          // 不阻断响应 —— 二进制已落盘，元数据写入失败可由客户端后续 PUT 补偿。
          try {
            const itemService = new ItemService(req.userId);
            const existing = itemService.getItem(session.itemId);
            if (existing && existing.type === 'cloud_file') {
              let payloadObj: any = {};
              try {
                payloadObj = JSON.parse(existing.payload);
              } catch {
                /* ignore parse error, use empty object */
              }
              const allChunks = Array.from({ length: session.totalChunks }, (_, i) => i);
              const updatedPayload = {
                ...payloadObj,
                upload_state: 'completed',
                uploaded_chunks: allChunks,
                upload_session_id: null,
                error_message: null,
                size: totalWritten,
                file_hash: sha256Hex,
              };
              const payloadStr = JSON.stringify(updatedPayload);
              const contentHash = crypto
                .createHash('sha256')
                .update(payloadStr)
                .digest('hex')
                .substring(0, 16);
              itemService.putItem({
                ...existing,
                payload: payloadStr,
                content_hash: contentHash,
              });
            } else {
              log('warn', 'UploadSession', {
                message: 'skip changes-write: item missing or not cloud_file',
                itemId: session.itemId,
                userId: req.userId,
              });
            }
          } catch (err) {
            log('error', 'UploadSession', {
              message: 'failed to write changes after upload complete',
              itemId: session.itemId,
              err,
            });
          }

          log('info', 'UploadSession', {
            message: 'upload completed',
            sessionId,
            itemId: session.itemId,
            size: totalWritten,
            userId: req.userId,
          });
          res.json({
            success: true,
            item_id: session.itemId,
            location: path.basename(finalPath),
            size: totalWritten,
            sha256: sha256Hex,
          });
        });
        return;
      }

      const cp = chunkPath(sessionId, currentIndex);
      const chunkStream = fs.createReadStream(cp);
      chunkStream.on('data', (d) => {
        const buf = Buffer.isBuffer(d) ? d : Buffer.from(String(d));
        hash.update(buf);
        totalWritten += buf.length;
      });
      chunkStream.on('error', (err) => {
        out.destroy();
        fs.rm(tempFinal, { force: true }, () => {});
        next(err);
      });
      chunkStream.pipe(out, { end: false });
      chunkStream.on('end', () => {
        currentIndex += 1;
        stitchNext();
      });
    };

    stitchNext();
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/resources/upload/:sessionId/status - 查询已上传分块（用于断点续传）
// ---------------------------------------------------------------------------
router.get('/upload/:sessionId/status', (req, res, next) => {
  try {
    const { sessionId } = req.params;
    validateSessionId(sessionId);
    const session = requireSession(sessionId, req.userId);
    res.json({
      session_id: sessionId,
      item_id: session.itemId,
      total_chunks: session.totalChunks,
      chunk_size: session.chunkSize,
      total_size: session.totalSize,
      uploaded_chunks: Array.from(session.uploadedChunks).sort((a, b) => a - b),
      completed: session.uploadedChunks.size === session.totalChunks,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/resources/upload/:sessionId - 中止上传并清理临时文件
// ---------------------------------------------------------------------------
router.delete('/upload/:sessionId', (req, res, next) => {
  try {
    const { sessionId } = req.params;
    validateSessionId(sessionId);
    const session = requireSession(sessionId, req.userId);
    sessions.delete(sessionId);
    fs.rm(sessionDir(sessionId), { recursive: true, force: true }, () => {});
    log('info', 'UploadSession', { message: 'session aborted', sessionId, itemId: session.itemId, userId: req.userId });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
