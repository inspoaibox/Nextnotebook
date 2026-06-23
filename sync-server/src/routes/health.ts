import { Router } from 'express';
import { authService } from '../services/AuthService';
import { config } from '../config';

const router = Router();

// GET /api/health - 健康检查（无需认证）
router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
  });
});

// GET /api/health/status - 系统状态（无需认证）
// 用于前端判断是否需要初始化
router.get('/status', (_req, res) => {
  const status = authService.getSystemStatus();
  const setupTokenRequired = !status.initialized && (config.requireInitialSetupToken || Boolean(config.initialSetupToken));
  res.json({
    status: 'ok',
    initialized: status.initialized,
    registrationEnabled: status.registrationEnabled,
    setupTokenRequired,
    setupBlocked: setupTokenRequired && !config.initialSetupToken,
    timestamp: Date.now(),
  });
});

export default router;
