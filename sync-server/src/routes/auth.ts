import { Router, Request, Response } from 'express';
import { authService, AuthErrorCodes } from '../services/AuthService';
import { auditService } from '../services/AuditService';
import { loginRateLimiter, registerRateLimiter, recordFailure, resetCounter, getClientIp } from '../middleware/rateLimiter';

const router = Router();

/**
 * POST /api/auth/register - 用户注册
 */
router.post('/register', registerRateLimiter, async (req: Request, res: Response) => {
  const { username, password, syncKey } = req.body;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  // 验证必填字段
  if (!username || !password || !syncKey) {
    res.status(400).json({
      error: {
        code: 'AUTH_015',
        message: '用户名、密码和同步密钥都是必填项'
      }
    });
    return;
  }

  try {
    const result = await authService.register(username, password, syncKey);

    // 记录审计日志
    auditService.log({
      userId: result.userId,
      action: 'register',
      ip,
      userAgent,
      details: { username, isAdmin: result.isAdmin },
      success: result.success
    });

    if (result.success) {
      res.status(201).json({
        success: true,
        userId: result.userId,
        isAdmin: result.isAdmin,
        message: result.isAdmin ? '管理员账号创建成功' : '注册成功'
      });
    } else {
      res.status(400).json({
        error: {
          code: result.errorCode,
          message: result.error
        }
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * POST /api/auth/login - 用户登录
 */
router.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
  const { username, password, syncKey, deviceInfo } = req.body;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  // 验证必填字段
  if (!username || !password || !syncKey) {
    res.status(400).json({
      error: {
        code: 'AUTH_015',
        message: '用户名、密码和同步密钥都是必填项'
      }
    });
    return;
  }

  try {
    const result = await authService.login(username, password, syncKey, deviceInfo, ip);

    // 记录审计日志
    auditService.log({
      userId: result.user?.id,
      action: 'login',
      ip,
      userAgent,
      details: { username, deviceInfo },
      success: result.success
    });

    if (result.success) {
      // 登录成功，重置频率限制计数器
      resetCounter(ip, 'login');

      res.json({
        success: true,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        user: result.user
      });
    } else {
      // 登录失败，记录失败尝试
      recordFailure(ip, 'login');

      const statusCode = result.errorCode === AuthErrorCodes.ACCOUNT_DISABLED ? 403 : 401;
      res.status(statusCode).json({
        error: {
          code: result.errorCode,
          message: result.error
        }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * POST /api/auth/refresh - 刷新令牌
 */
router.post('/refresh', (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  if (!refreshToken) {
    res.status(400).json({
      error: {
        code: 'AUTH_015',
        message: '刷新令牌是必填项'
      }
    });
    return;
  }

  try {
    const result = authService.refreshToken(refreshToken);

    if (result) {
      // 记录审计日志
      auditService.log({
        userId: result.userId,
        action: 'token_refresh',
        ip,
        userAgent,
        success: true
      });

      res.json({
        success: true,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn
      });
    } else {
      res.status(401).json({
        error: {
          code: AuthErrorCodes.REFRESH_TOKEN_INVALID,
          message: '刷新令牌无效或已过期'
        }
      });
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * POST /api/auth/logout - 登出
 */
router.post('/logout', (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  // 需要认证
  if (!req.sessionId) {
    res.status(401).json({
      error: {
        code: AuthErrorCodes.NO_AUTH,
        message: '未提供认证信息'
      }
    });
    return;
  }

  try {
    authService.logout(req.sessionId);

    // 记录审计日志
    auditService.log({
      userId: req.userId,
      action: 'logout',
      ip,
      userAgent,
      success: true
    });

    res.json({
      success: true,
      message: '登出成功'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * POST /api/auth/logout-all - 登出所有设备
 */
router.post('/logout-all', (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  // 需要认证
  if (!req.userId) {
    res.status(401).json({
      error: {
        code: AuthErrorCodes.NO_AUTH,
        message: '未提供认证信息'
      }
    });
    return;
  }

  try {
    authService.logoutAll(req.userId);

    // 记录审计日志
    auditService.log({
      userId: req.userId,
      action: 'logout_all',
      ip,
      userAgent,
      success: true
    });

    res.json({
      success: true,
      message: '已登出所有设备'
    });
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

export default router;
