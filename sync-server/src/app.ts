import express from 'express';
import path from 'path';
import { corsMiddleware } from './middleware/cors';
import { loggerMiddleware } from './middleware/logger';
import { authMiddleware } from './middleware/auth';
import { apiRateLimiter, syncRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';

import healthRouter from './routes/health';
import statusRouter from './routes/status';
import metaRouter from './routes/meta';
import itemsRouter from './routes/items';
import changesRouter from './routes/changes';
import resourcesRouter from './routes/resources';
import syncRouter from './routes/sync';
import authRouter from './routes/auth';
import userRouter from './routes/user';
import adminRouter from './routes/admin';

const app = express();

// 中间件
app.use(corsMiddleware);
app.use(loggerMiddleware);
app.use(express.json({ limit: '10mb' }));

// 静态文件服务（管理界面）
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查（无需认证）
app.use('/api/health', healthRouter);

// API 频率限制
app.use(apiRateLimiter);

// 认证路由（部分端点无需认证）
app.use('/api/auth', authRouter);

// 认证中间件（其他路由需要认证）
app.use(authMiddleware);

// 用户路由
app.use('/api/user', userRouter);

// 管理员路由
app.use('/api/admin', adminRouter);

// API 路由（使用同步专用的宽松限制）
app.use('/api/status', statusRouter);
app.use('/api/meta', syncRateLimiter, metaRouter);
app.use('/api/items', syncRateLimiter, itemsRouter);
app.use('/api/changes', syncRateLimiter, changesRouter);
app.use('/api/resources', syncRateLimiter, resourcesRouter);
app.use('/api/sync', syncRateLimiter, syncRouter);

// 所有非 API 路由返回管理界面（SPA 支持）
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// 错误处理
app.use(errorHandler);

export default app;
