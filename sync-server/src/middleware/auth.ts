import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { tokenService } from '../services/TokenService';
import { AuthErrorCodes } from '../services/AuthService';
import { AccessTokenPayload, AuthMethod } from '../types';

// 计算 API Key 的哈希值
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// 验证 API Key
function isValidApiKey(apiKey: string): boolean {
  if (!config.legacyApiKeyAuthEnabled) {
    return false;
  }
  return config.apiKeys.includes(apiKey);
}

// 不需要认证的路径
const PUBLIC_PATHS = [
  '/api/health',
  '/api/health/status',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/user/reset-password'
];

// 检查是否是公开路径
function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'));
}

// 认证中间件
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 公开端点不需要认证
  if (isPublicPath(req.path)) {
    return next();
  }

  const apiKey = req.headers['x-api-key'] as string | undefined;
  const authHeader = req.headers['authorization'] as string | undefined;

  // 优先检查 JWT Bearer Token
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    
    // 首先尝试验证为 JWT
    const payload = tokenService.verifyAccessToken(token);
    if (payload) {
      // JWT 认证成功
      req.userId = payload.sub;
      req.sessionId = payload.sid;
      req.syncKeyFingerprint = payload.skf;
      req.userRole = payload.role;
      req.authMethod = 'jwt';
      return next();
    }

    // 如果不是有效的 JWT，尝试作为 API Key 验证（向后兼容）
    if (isValidApiKey(token)) {
      req.apiKeyHash = hashApiKey(token);
      req.authMethod = 'apiKey';
      return next();
    }

    // 令牌无效
    res.status(401).json({
      error: {
        code: AuthErrorCodes.INVALID_TOKEN,
        message: '访问令牌无效或已过期'
      }
    });
    return;
  }

  // 检查 X-API-Key 头（向后兼容）
  if (apiKey && isValidApiKey(apiKey)) {
    req.apiKeyHash = hashApiKey(apiKey);
    req.authMethod = 'apiKey';
    return next();
  }

  // 认证失败
  if (apiKey || authHeader) {
    res.status(403).json({
      error: {
        code: AuthErrorCodes.INVALID_TOKEN,
        message: '无效的认证凭据'
      }
    });
  } else {
    res.status(401).json({
      error: {
        code: AuthErrorCodes.NO_AUTH,
        message: '未提供认证信息'
      }
    });
  }
}

// 管理员权限中间件
export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== 'admin') {
    res.status(403).json({
      error: {
        code: AuthErrorCodes.NO_ADMIN,
        message: '需要管理员权限'
      }
    });
    return;
  }
  next();
}

// 同步密钥指纹验证中间件（可选，用于需要额外验证的操作）
export function syncKeyMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 只对 JWT 认证的请求验证同步密钥
  if (req.authMethod !== 'jwt') {
    return next();
  }

  const clientFingerprint = req.headers['x-sync-key-fingerprint'] as string | undefined;
  
  // 如果客户端提供了指纹，验证是否匹配
  if (clientFingerprint && clientFingerprint !== req.syncKeyFingerprint) {
    res.status(403).json({
      error: {
        code: AuthErrorCodes.SYNC_KEY_MISMATCH,
        message: '同步密钥指纹不匹配'
      }
    });
    return;
  }

  next();
}
