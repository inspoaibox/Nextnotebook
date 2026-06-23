import express from 'express';
import path from 'path';
import { config } from './config';
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

if (config.trustProxy) {
  app.set('trust proxy', 1);
}

// 中间件
app.use(corsMiddleware);
app.use(loggerMiddleware);
app.use((req, res, next) => {
  if (config.secureMode && !req.secure) {
    res.status(400).json({
      error: {
        code: 'SECURE_CONNECTION_REQUIRED',
        message: 'HTTPS is required',
      },
    });
    return;
  }
  next();
});
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (config.secureMode) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(express.json({ limit: config.jsonBodyLimit }));

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
