import { Router, Request, Response } from 'express';
import { adminMiddleware } from '../middleware/auth';
import { userService } from '../services/UserService';
import { auditService } from '../services/AuditService';
import { authService, AuthErrorCodes } from '../services/AuthService';
import { 
  getClientIp, 
  clearLoginBlock, 
  clearAllLoginBlocks, 
  getBlockedIPs,
  getRateLimitConfig,
  updateRateLimitConfig
} from '../middleware/rateLimiter';

const router = Router();

// 所有管理员路由都需要管理员权限
router.use(adminMiddleware);

/**
 * GET /api/admin/settings - 获取系统设置
 */
router.get('/settings', (req: Request, res: Response) => {
  try {
    const status = authService.getSystemStatus();
    res.json({
      success: true,
      settings: {
        registrationEnabled: status.registrationEnabled,
        userCount: status.userCount
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * PUT /api/admin/settings/registration - 设置注册开关
 */
router.put('/settings/registration', (req: Request, res: Response) => {
  const { enabled } = req.body;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  if (typeof enabled !== 'boolean') {
    res.status(400).json({
      error: {
        code: 'AUTH_015',
        message: 'enabled 参数必须是布尔值'
      }
    });
    return;
  }

  try {
    authService.setRegistrationEnabled(enabled);

    // 记录审计日志
    auditService.log({
      userId: req.userId,
      action: 'admin_action',
      ip,
      userAgent,
      details: { action: 'set_registration', enabled },
      success: true
    });

    res.json({
      success: true,
      message: enabled ? '注册已开启' : '注册已关闭',
      registrationEnabled: enabled
    });
  } catch (error) {
    console.error('Set registration error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * GET /api/admin/users - 获取用户列表
 */
router.get('/users', (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  try {
    const result = userService.listUsers(page, limit);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * GET /api/admin/users/stats - 获取用户统计
 */
router.get('/users/stats', (req: Request, res: Response) => {
  try {
    const stats = userService.getUserStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * PUT /api/admin/users/:id/disable - 禁用用户
 */
router.put('/users/:id/disable', (req: Request, res: Response) => {
  const { id } = req.params;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  try {
    const result = userService.disableUser(id);

    // 记录审计日志
    auditService.log({
      userId: req.userId,
      action: 'user_disable',
      ip,
      userAgent,
      details: { targetUserId: id },
      success: result.success
    });

    if (result.success) {
      res.json({
        success: true,
        message: '用户已禁用'
      });
    } else {
      res.status(400).json({
        error: {
          code: 'AUTH_017',
          message: result.error
        }
      });
    }
  } catch (error) {
    console.error('Disable user error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * PUT /api/admin/users/:id/enable - 启用用户
 */
router.put('/users/:id/enable', (req: Request, res: Response) => {
  const { id } = req.params;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  try {
    const result = userService.enableUser(id);

    // 记录审计日志
    auditService.log({
      userId: req.userId,
      action: 'user_enable',
      ip,
      userAgent,
      details: { targetUserId: id },
      success: result.success
    });

    if (result.success) {
      res.json({
        success: true,
        message: '用户已启用'
      });
    } else {
      res.status(400).json({
        error: {
          code: 'AUTH_017',
          message: result.error
        }
      });
    }
  } catch (error) {
    console.error('Enable user error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * DELETE /api/admin/users/:id - 删除用户
 */
router.delete('/users/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  try {
    const result = userService.deleteUser(id);

    // 记录审计日志
    auditService.log({
      userId: req.userId,
      action: 'user_delete',
      ip,
      userAgent,
      details: { targetUserId: id },
      success: result.success
    });

    if (result.success) {
      res.json({
        success: true,
        message: '用户已删除'
      });
    } else {
      res.status(400).json({
        error: {
          code: 'AUTH_017',
          message: result.error
        }
      });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * GET /api/admin/logs - 获取审计日志
 */
router.get('/logs', (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const userId = req.query.userId as string | undefined;
  const action = req.query.action as string | undefined;
  const startTime = req.query.startTime ? parseInt(req.query.startTime as string) : undefined;
  const endTime = req.query.endTime ? parseInt(req.query.endTime as string) : undefined;

  try {
    const result = auditService.query({
      userId,
      action: action as any,
      startTime,
      endTime,
      page,
      limit
    });

    res.json({
      success: true,
      ...result,
      page,
      limit
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * GET /api/admin/logs/stats - 获取审计日志统计
 */
router.get('/logs/stats', (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 7;

  try {
    const stats = auditService.getStats(days);
    res.json({
      success: true,
      stats,
      period: `${days} days`
    });
  } catch (error) {
    console.error('Get audit stats error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

// ========== 频率限制管理 ==========

/**
 * GET /api/admin/rate-limit/config - 获取频率限制配置
 */
router.get('/rate-limit/config', (req: Request, res: Response) => {
  try {
    const config = getRateLimitConfig();
    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Get rate limit config error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * PUT /api/admin/rate-limit/config - 更新频率限制配置
 */
router.put('/rate-limit/config', (req: Request, res: Response) => {
  const { loginMaxAttempts, blockDurationMinutes } = req.body;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  try {
    updateRateLimitConfig({
      loginMaxAttempts: loginMaxAttempts !== undefined ? parseInt(loginMaxAttempts, 10) : undefined,
      blockDurationMinutes: blockDurationMinutes !== undefined ? parseInt(blockDurationMinutes, 10) : undefined
    });

    // 记录审计日志
    auditService.log({
      userId: req.userId,
      action: 'admin_action',
      ip,
      userAgent,
      details: { action: 'update_rate_limit_config', loginMaxAttempts, blockDurationMinutes },
      success: true
    });

    res.json({
      success: true,
      message: '配置已更新',
      config: getRateLimitConfig()
    });
  } catch (error) {
    console.error('Update rate limit config error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * GET /api/admin/rate-limit/blocked - 获取被锁定的 IP 列表
 */
router.get('/rate-limit/blocked', (req: Request, res: Response) => {
  try {
    const blockedIPs = getBlockedIPs();
    res.json({
      success: true,
      blockedIPs,
      count: blockedIPs.length
    });
  } catch (error) {
    console.error('Get blocked IPs error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * DELETE /api/admin/rate-limit/blocked/:ip - 解除指定 IP 的锁定
 */
router.delete('/rate-limit/blocked/:ip', (req: Request, res: Response) => {
  const { ip: targetIp } = req.params;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  try {
    const cleared = clearLoginBlock(targetIp);

    // 记录审计日志
    auditService.log({
      userId: req.userId,
      action: 'admin_action',
      ip,
      userAgent,
      details: { action: 'clear_login_block', targetIp },
      success: cleared
    });

    if (cleared) {
      res.json({
        success: true,
        message: `已解除 ${targetIp} 的登录锁定`
      });
    } else {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: '未找到该 IP 的锁定记录'
        }
      });
    }
  } catch (error) {
    console.error('Clear login block error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

/**
 * DELETE /api/admin/rate-limit/blocked - 解除所有 IP 的锁定
 */
router.delete('/rate-limit/blocked', (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  try {
    const count = clearAllLoginBlocks();

    // 记录审计日志
    auditService.log({
      userId: req.userId,
      action: 'admin_action',
      ip,
      userAgent,
      details: { action: 'clear_all_login_blocks', clearedCount: count },
      success: true
    });

    res.json({
      success: true,
      message: `已解除 ${count} 个 IP 的登录锁定`,
      clearedCount: count
    });
  } catch (error) {
    console.error('Clear all login blocks error:', error);
    res.status(500).json({
      error: {
        code: 'AUTH_500',
        message: '服务器内部错误'
      }
    });
  }
});

export default router;
