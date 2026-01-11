import { Router, Request, Response } from 'express';
import { authService, AuthErrorCodes } from '../services/AuthService';
import { auditService } from '../services/AuditService';
import { getClientIp } from '../middleware/rateLimiter';

const router = Router();

/**
 * GET /api/user/profile - 获取用户信息
 */
router.get('/profile', (req: Request, res: Response) => {
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
    const user = authService.getUser(req.userId);

    if (user) {
      res.json({
        success: true,
        user
      });
    } else {
      res.status(404).json({
        error: {
          code: 'AUTH_014',
          message: '用户不存在'
        }
      });
    }
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * PUT /api/user/password - 修改密码
 */
router.put('/password', async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  if (!req.userId) {
    res.status(401).json({
      error: {
        code: AuthErrorCodes.NO_AUTH,
        message: '未提供认证信息'
      }
    });
    return;
  }

  if (!currentPassword || !newPassword) {
    res.status(400).json({
      error: {
        code: 'AUTH_015',
        message: '当前密码和新密码都是必填项'
      }
    });
    return;
  }

  try {
    const result = await authService.changePassword(req.userId, currentPassword, newPassword);

    // 记录审计日志
    auditService.log({
      userId: req.userId,
      action: 'password_change',
      ip,
      userAgent,
      success: result.success
    });

    if (result.success) {
      res.json({
        success: true,
        message: '密码修改成功，所有会话已失效，请重新登录'
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
    console.error('Change password error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * PUT /api/user/sync-key - 更新同步密钥
 */
router.put('/sync-key', async (req: Request, res: Response) => {
  const { password, oldSyncKey, newSyncKey } = req.body;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  if (!req.userId) {
    res.status(401).json({
      error: {
        code: AuthErrorCodes.NO_AUTH,
        message: '未提供认证信息'
      }
    });
    return;
  }

  if (!password || !oldSyncKey || !newSyncKey) {
    res.status(400).json({
      error: {
        code: 'AUTH_015',
        message: '密码、旧同步密钥和新同步密钥都是必填项'
      }
    });
    return;
  }

  try {
    const result = await authService.updateSyncKey(req.userId, password, oldSyncKey, newSyncKey);

    // 记录审计日志
    auditService.log({
      userId: req.userId,
      action: 'sync_key_change',
      ip,
      userAgent,
      success: result.success
    });

    if (result.success) {
      res.json({
        success: true,
        message: '同步密钥更新成功，所有会话已失效，请重新登录'
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
    console.error('Update sync key error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * POST /api/user/reset-password - 重置密码（使用同步密钥验证）
 * 注意：这是公开端点，不需要认证
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  const { username, syncKey, newPassword } = req.body;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  if (!username || !syncKey || !newPassword) {
    res.status(400).json({
      error: {
        code: 'AUTH_015',
        message: '用户名、同步密钥和新密码都是必填项'
      }
    });
    return;
  }

  try {
    const result = await authService.resetPassword(username, syncKey, newPassword);

    // 记录审计日志（不记录用户ID以保护隐私）
    auditService.log({
      action: 'password_change',
      ip,
      userAgent,
      details: { username, method: 'reset' },
      success: result.success
    });

    if (result.success) {
      res.json({
        success: true,
        message: '密码重置成功，请使用新密码登录'
      });
    } else {
      // 不泄露具体错误原因
      res.status(400).json({
        error: {
          code: 'AUTH_016',
          message: '密码重置失败，请检查用户名和同步密钥'
        }
      });
    }
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

export default router;
