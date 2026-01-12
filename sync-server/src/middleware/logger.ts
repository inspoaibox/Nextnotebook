import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  const configLevel = config.logLevel as LogLevel;
  return LOG_LEVELS[level] >= LOG_LEVELS[configLevel];
}

export function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  
  console.log(JSON.stringify(logEntry));
}

export function loggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // 对同步相关的请求记录更详细的信息
    const isSyncRequest = req.originalUrl.startsWith('/api/items') || 
                          req.originalUrl.startsWith('/api/changes') ||
                          req.originalUrl.startsWith('/api/sync');
    
    const logData: Record<string, unknown> = {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    };
    
    // 添加用户标识（如果有）
    if ((req as any).userId) {
      logData.userId = (req as any).userId;
    }
    
    // 对 PUT/POST 请求记录请求体大小
    if (isSyncRequest && (req.method === 'PUT' || req.method === 'POST')) {
      logData.bodySize = req.headers['content-length'] || 0;
    }
    
    log('info', 'Request', logData);
  });

  next();
}
