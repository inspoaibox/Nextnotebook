import app from './app';
import { config, ensureDataDirs, checkSecurityConfig } from './config';
import { getDatabase, closeDatabase } from './database';
import { CleanupScheduler } from './services/CleanupScheduler';
import { log } from './middleware/logger';
import { transferRelayServer } from './transfer/relay';
import { createServer } from 'http';

// 确保数据目录存在
ensureDataDirs();

// 执行安全配置检查
checkSecurityConfig();

// 初始化数据库
getDatabase();

// 启动清理调度器
const cleanupScheduler = new CleanupScheduler();
cleanupScheduler.start();

// 创建 HTTP 服务器
const server = createServer(app);

// 初始化 Transfer 中继服务器
if (config.transferRelayEnabled) {
  transferRelayServer.initialize(server);
  log('info', `Transfer relay server enabled on path ${config.transferRelayPath}`);
}

// 启动服务器
server.listen(config.port, () => {
  log('info', `Sync server started on port ${config.port}`);
  log('info', `Database: ${config.databasePath}`);
  log('info', `Resources: ${config.resourcesPath}`);
  if (config.transferRelayEnabled) {
    log('info', `Transfer relay: enabled (max ${config.transferMaxConnections} connections)`);
  }
});

// 优雅关闭
function gracefulShutdown(signal: string): void {
  log('info', `Received ${signal}, shutting down gracefully...`);

  // 停止清理调度器
  cleanupScheduler.stop();

  // 关闭 Transfer 中继服务器
  if (config.transferRelayEnabled) {
    transferRelayServer.close();
    log('info', 'Transfer relay server closed');
  }

  // 关闭 HTTP 服务器
  server.close(() => {
    log('info', 'HTTP server closed');

    // 关闭数据库连接
    closeDatabase();
    log('info', 'Database connection closed');

    process.exit(0);
  });

  // 强制关闭超时
  setTimeout(() => {
    log('error', 'Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
