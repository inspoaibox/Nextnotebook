import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../database';
import { AuthErrorCodes } from '../services/AuthService';
import { config as appConfig } from '../config';

// 默认频率限制配置
const DEFAULT_RATE_LIMITS = {
  api: {
    maxRequests: appConfig.apiRateLimit,
    windowMs: 60 * 1000   // 1分钟窗口
  },
  sync: {
    maxRequests: appConfig.syncRateLimit,
    windowMs: 60 * 1000   // 1分钟窗口
  },
  login: {
    maxRequests: appConfig.loginRateLimit,
    windowMs: 15 * 60 * 1000  // 15分钟窗口
  },
  register: {
    maxRequests: appConfig.registerRateLimit,
    windowMs: 60 * 60 * 1000  // 1小时窗口
  }
};

// 渐进式封禁时长（分钟）- 每次封禁时间翻倍
const PROGRESSIVE_BLOCK_DURATIONS = [15, 30, 60, 120, 240]; // 15分钟, 30分钟, 1小时, 2小时, 4小时

type LimitType = 'api' | 'sync' | 'login' | 'register';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * 获取系统设置
 */
function getSystemSetting(key: string, defaultValue: string): string {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * 设置系统设置
 */
export function setSystemSetting(key: string, value: string): void {
  const db = getDatabase();
  const now = Date.now();
  db.prepare('INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, now);
}

/**
 * 获取封禁时长（从数据库配置读取）
 */
function getBlockDuration(): number {
  const minutes = parseInt(getSystemSetting('login_block_duration_minutes', '15'), 10);
  return minutes * 60 * 1000;
}

/**
 * 获取登录尝试次数限制
 */
function getLoginMaxAttempts(): number {
  return parseInt(getSystemSetting('login_max_attempts', String(appConfig.loginRateLimit)), 10);
}

/**
 * 获取频率限制配置
 */
function getRateLimits() {
  return {
    ...DEFAULT_RATE_LIMITS,
    login: {
      maxRequests: getLoginMaxAttempts(),
      windowMs: 15 * 60 * 1000  // 15分钟窗口
    }
  };
}

/**
 * 获取渐进式封禁时长
 * @param blockCount 已被封禁的次数
 */
function getProgressiveBlockDuration(blockCount: number): number {
  const index = Math.min(blockCount, PROGRESSIVE_BLOCK_DURATIONS.length - 1);
  return PROGRESSIVE_BLOCK_DURATIONS[index] * 60 * 1000;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * 获取客户端 IP 地址
 */
function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * 检查频率限制
 */
function checkRateLimit(key: string, type: LimitType): RateLimitResult {
  const db = getDatabase();
  const RATE_LIMITS = getRateLimits();
  const config = RATE_LIMITS[type];
  const now = Date.now();
  const fullKey = `${type}:${key}`;

  // 获取当前记录
  const record = db.prepare('SELECT * FROM rate_limits WHERE key = ?').get(fullKey) as {
    key: string;
    count: number;
    window_start: number;
    blocked_until: number | null;
    block_count?: number;
  } | undefined;

  // 检查是否被封禁
  if (record?.blocked_until && record.blocked_until > now) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.blocked_until,
      retryAfter: Math.ceil((record.blocked_until - now) / 1000)
    };
  }

  // 检查窗口是否过期
  if (!record || (now - record.window_start) > config.windowMs) {
    // 创建新窗口，保留 block_count 用于渐进式封禁
    const blockCount = record?.block_count || 0;
    db.prepare(`
      INSERT OR REPLACE INTO rate_limits (key, count, window_start, blocked_until, block_count)
      VALUES (?, 1, ?, NULL, ?)
    `).run(fullKey, now, blockCount);

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs
    };
  }

  // 检查是否超过限制
  if (record.count >= config.maxRequests) {
    // 渐进式封禁
    const blockCount = (record.block_count || 0) + 1;
    const blockDuration = type === 'login' 
      ? getProgressiveBlockDuration(blockCount - 1)
      : getBlockDuration();
    const blockedUntil = now + blockDuration;
    
    db.prepare('UPDATE rate_limits SET blocked_until = ?, block_count = ? WHERE key = ?')
      .run(blockedUntil, blockCount, fullKey);

    return {
      allowed: false,
      remaining: 0,
      resetAt: blockedUntil,
      retryAfter: Math.ceil(blockDuration / 1000)
    };
  }

  // 增加计数
  db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(fullKey);

  return {
    allowed: true,
    remaining: config.maxRequests - record.count - 1,
    resetAt: record.window_start + config.windowMs
  };
}

/**
 * 记录失败尝试（用于登录失败等场景）
 */
export function recordFailure(key: string, type: LimitType): void {
  const db = getDatabase();
  const RATE_LIMITS = getRateLimits();
  const config = RATE_LIMITS[type];
  const now = Date.now();
  const fullKey = `${type}:${key}`;

  // 获取当前记录
  const record = db.prepare('SELECT * FROM rate_limits WHERE key = ?').get(fullKey) as {
    count: number;
    window_start: number;
  } | undefined;

  if (!record || (now - record.window_start) > config.windowMs) {
    // 创建新窗口
    db.prepare(`
      INSERT OR REPLACE INTO rate_limits (key, count, window_start, blocked_until)
      VALUES (?, 1, ?, NULL)
    `).run(fullKey, now);
  } else {
    // 增加计数
    db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(fullKey);
  }
}

/**
 * 重置计数器（用于登录成功后）
 */
export function resetCounter(key: string, type: LimitType): void {
  const db = getDatabase();
  const fullKey = `${type}:${key}`;
  db.prepare('DELETE FROM rate_limits WHERE key = ?').run(fullKey);
}

/**
 * 检查是否被封禁
 */
export function isBlocked(key: string, type: LimitType): boolean {
  const db = getDatabase();
  const fullKey = `${type}:${key}`;
  const now = Date.now();

  const record = db.prepare('SELECT blocked_until FROM rate_limits WHERE key = ?').get(fullKey) as {
    blocked_until: number | null;
  } | undefined;

  return !!(record?.blocked_until && record.blocked_until > now);
}

/**
 * 清理过期的频率限制记录
 */
export function cleanupRateLimits(): number {
  const db = getDatabase();
  const now = Date.now();
  const RATE_LIMITS = getRateLimits();
  const maxWindowMs = Math.max(...Object.values(RATE_LIMITS).map(c => c.windowMs));
  
  const result = db.prepare(`
    DELETE FROM rate_limits 
    WHERE (blocked_until IS NULL OR blocked_until < ?) 
    AND window_start < ?
  `).run(now, now - maxWindowMs);

  return result.changes;
}

/**
 * 清除指定 IP 的登录锁定
 */
export function clearLoginBlock(ip: string): boolean {
  const db = getDatabase();
  const fullKey = `login:${ip}`;
  const result = db.prepare('DELETE FROM rate_limits WHERE key = ?').run(fullKey);
  return result.changes > 0;
}

/**
 * 清除所有登录锁定
 */
export function clearAllLoginBlocks(): number {
  const db = getDatabase();
  const result = db.prepare("DELETE FROM rate_limits WHERE key LIKE 'login:%'").run();
  return result.changes;
}

/**
 * 获取所有被锁定的 IP 列表
 */
export function getBlockedIPs(): Array<{ ip: string; blockedUntil: number; count: number }> {
  const db = getDatabase();
  const now = Date.now();
  const rows = db.prepare(`
    SELECT key, blocked_until, count FROM rate_limits 
    WHERE key LIKE 'login:%' AND blocked_until > ?
  `).all(now) as Array<{ key: string; blocked_until: number; count: number }>;
  
  return rows.map(row => ({
    ip: row.key.replace('login:', ''),
    blockedUntil: row.blocked_until,
    count: row.count
  }));
}

/**
 * 获取当前频率限制配置
 */
export function getRateLimitConfig(): {
  loginMaxAttempts: number;
  blockDurationMinutes: number;
} {
  return {
    loginMaxAttempts: getLoginMaxAttempts(),
    blockDurationMinutes: parseInt(getSystemSetting('login_block_duration_minutes', '15'), 10)
  };
}

/**
 * 更新频率限制配置
 */
export function updateRateLimitConfig(config: {
  loginMaxAttempts?: number;
  blockDurationMinutes?: number;
}): void {
  if (config.loginMaxAttempts !== undefined) {
    setSystemSetting('login_max_attempts', String(config.loginMaxAttempts));
  }
  if (config.blockDurationMinutes !== undefined) {
    setSystemSetting('login_block_duration_minutes', String(config.blockDurationMinutes));
  }
}

/**
 * API 频率限制中间件
 */
export function apiRateLimiter(req: Request, res: Response, next: NextFunction): void {
  // 健康检查端点不限制
  if (req.path === '/api/health') {
    return next();
  }

  // 同步相关端点使用单独的限制器
  if (req.path.startsWith('/api/items') || 
      req.path.startsWith('/api/resources') || 
      req.path.startsWith('/api/sync') ||
      req.path.startsWith('/api/changes') ||
      req.path.startsWith('/api/meta')) {
    return next();  // 跳过通用 API 限制，由 syncRateLimiter 处理
  }

  const ip = getClientIp(req);
  const result = checkRateLimit(ip, 'api');
  const RATE_LIMITS = getRateLimits();

  // 设置响应头
  res.setHeader('X-RateLimit-Limit', RATE_LIMITS.api.maxRequests);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter || 60);
    res.status(429).json({
      error: {
        code: AuthErrorCodes.RATE_LIMITED,
        message: '请求过于频繁，请稍后再试',
        details: {
          retryAfter: result.retryAfter
        }
      }
    });
    return;
  }

  next();
}

/**
 * 同步 API 频率限制中间件（更宽松的限制）
 */
export function syncRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const result = checkRateLimit(ip, 'sync');
  const RATE_LIMITS = getRateLimits();

  // 设置响应头
  res.setHeader('X-RateLimit-Limit', RATE_LIMITS.sync.maxRequests);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter || 60);
    res.status(429).json({
      error: {
        code: AuthErrorCodes.RATE_LIMITED,
        message: '同步请求过于频繁，请稍后再试',
        details: {
          retryAfter: result.retryAfter
        }
      }
    });
    return;
  }

  next();
}

/**
 * 登录频率限制中间件
 */
export function loginRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const result = checkRateLimit(ip, 'login');

  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter || 900);
    res.status(429).json({
      error: {
        code: AuthErrorCodes.ACCOUNT_LOCKED,
        message: '登录尝试次数过多，账号已被临时锁定',
        details: {
          retryAfter: result.retryAfter
        }
      }
    });
    return;
  }

  next();
}

/**
 * 注册频率限制中间件
 */
export function registerRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const result = checkRateLimit(ip, 'register');

  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter || 3600);
    res.status(429).json({
      error: {
        code: AuthErrorCodes.RATE_LIMITED,
        message: '注册尝试次数过多，请稍后再试',
        details: {
          retryAfter: result.retryAfter
        }
      }
    });
    return;
  }

  next();
}

/**
 * 获取客户端 IP（导出供其他模块使用）
 */
export { getClientIp };
