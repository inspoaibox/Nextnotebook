import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

export interface Config {
  port: number;
  databasePath: string;
  resourcesPath: string;
  apiKeys: string[];
  legacyApiKeyAuthEnabled: boolean;
  logLevel: string;
  jsonBodyLimit: string;
  maxResourceSize: number;
  changeLogRetentionDays: number;
  corsOrigins: string[];
  // JWT 配置
  jwtSecret: string;
  jwtRefreshSecret: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  // 频率限制配置
  apiRateLimit: number;
  syncRateLimit: number;
  loginRateLimit: number;
  registerRateLimit: number;
  // 安全配置
  trustProxy: boolean;
  secureMode: boolean;
  initialSetupToken: string;
  requireInitialSetupToken: boolean;
  // Transfer 中继服务器配置
  transferRelayEnabled: boolean;
  transferRelayPath: string;
  transferRelayKey: string;  // 中继服务器连接密钥
  transferMaxFileSize: number;
  transferMaxConnections: number;
  transferSessionTimeout: number;
  // Transfer 详细配置（供 relay.ts 使用）
  transfer?: {
    maxConnections: number;
    messageRateLimit: number;
    fileTransferLimit: number;
    sessionTimeout: number;
    heartbeatInterval: number;
    relayKey: string;  // 中继密钥
  };
}

function parseApiKeys(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map(k => k.trim()).filter(k => k.length > 0);
}

function parseCorsOrigins(value: string | undefined): string[] {
  if (!value || value === '*') return ['*'];
  return value.split(',').map(o => o.trim()).filter(o => o.length > 0);
}

// 获取 JWT 密钥。
// 生产环境必须显式配置；开发环境使用进程级随机值，避免固定已知后备密钥。
function getRequiredSecret(envValue: string | undefined, envName: string): string {
  if (envValue && envValue.length >= 32) {
    return envValue;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${envName} must be set to a value with at least 32 characters`);
  }

  return crypto.randomBytes(32).toString('hex');
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databasePath: process.env.DATABASE_PATH || './data/sync.db',
  resourcesPath: process.env.RESOURCES_PATH || './data/resources',
  apiKeys: parseApiKeys(process.env.API_KEYS),
  legacyApiKeyAuthEnabled: process.env.LEGACY_API_KEY_AUTH_ENABLED === 'true',
  logLevel: process.env.LOG_LEVEL || 'info',
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '50mb',
  maxResourceSize: parseInt(process.env.MAX_RESOURCE_SIZE || '104857600', 10),
  changeLogRetentionDays: parseInt(process.env.CHANGE_LOG_RETENTION_DAYS || '90', 10),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  // JWT 配置
  jwtSecret: getRequiredSecret(process.env.JWT_SECRET, 'JWT_SECRET'),
  jwtRefreshSecret: getRequiredSecret(process.env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET'),
  accessTokenExpiresIn: parseInt(process.env.ACCESS_TOKEN_EXPIRES_IN || '3600', 10), // 1小时
  refreshTokenExpiresIn: parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN || '2592000', 10), // 30天（原7天太短）
  // 频率限制配置
  apiRateLimit: parseInt(process.env.API_RATE_LIMIT || '10000', 10),
  syncRateLimit: parseInt(process.env.SYNC_RATE_LIMIT || '50000', 10),
  loginRateLimit: parseInt(process.env.LOGIN_RATE_LIMIT || '5', 10),
  registerRateLimit: parseInt(process.env.REGISTER_RATE_LIMIT || '3', 10),
  // 安全配置
  trustProxy: process.env.TRUST_PROXY === 'true',  // 是否信任代理（用于获取真实 IP）
  secureMode: process.env.SECURE_MODE === 'true',  // 是否启用安全模式（强制 HTTPS）
  initialSetupToken: process.env.INITIAL_SETUP_TOKEN || '',
  requireInitialSetupToken: process.env.REQUIRE_INITIAL_SETUP_TOKEN === 'true' || process.env.NODE_ENV === 'production',
  // Transfer 中继服务器配置
  transferRelayEnabled: process.env.TRANSFER_RELAY_ENABLED !== 'false',  // 默认启用
  transferRelayPath: process.env.TRANSFER_RELAY_PATH || '/transfer',
  transferRelayKey: process.env.TRANSFER_RELAY_KEY || '',  // 中继密钥（必须设置才能使用中继）
  transferMaxFileSize: parseInt(process.env.TRANSFER_MAX_FILE_SIZE || '104857600', 10),  // 100MB
  transferMaxConnections: parseInt(process.env.TRANSFER_MAX_CONNECTIONS || '100', 10),
  transferSessionTimeout: parseInt(process.env.TRANSFER_SESSION_TIMEOUT || '1800000', 10),  // 30分钟
  // Transfer 详细配置
  transfer: {
    maxConnections: parseInt(process.env.TRANSFER_MAX_CONNECTIONS || '100', 10),
    messageRateLimit: parseInt(process.env.TRANSFER_MESSAGE_RATE_LIMIT || '60', 10),  // 每分钟
    fileTransferLimit: parseInt(process.env.TRANSFER_FILE_RATE_LIMIT || '10', 10),  // 每分钟
    sessionTimeout: parseInt(process.env.TRANSFER_SESSION_TIMEOUT || '1800000', 10),  // 30分钟
    heartbeatInterval: parseInt(process.env.TRANSFER_HEARTBEAT_INTERVAL || '30000', 10),  // 30秒
    relayKey: process.env.TRANSFER_RELAY_KEY || '',  // 中继密钥
  },
};

// 安全检查 - 在启动时输出警告
export function checkSecurityConfig(): void {
  const warnings: string[] = [];
  
  // 检查 JWT 密钥
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    warnings.push('JWT_SECRET 未设置或太短（建议至少32字符）');
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
    warnings.push('JWT_REFRESH_SECRET 未设置或太短（建议至少32字符）');
  }
  
  // 检查中继密钥
  if (config.transferRelayEnabled && !config.transferRelayKey) {
    warnings.push('TRANSFER_RELAY_KEY 未设置，中继服务将拒绝所有连接');
  } else if (config.transferRelayEnabled && config.transferRelayKey.length < 16) {
    warnings.push('TRANSFER_RELAY_KEY 太短（建议至少16字符）');
  }
  
  // 检查 CORS 配置
  if (config.corsOrigins.includes('*')) {
    warnings.push('CORS_ORIGINS 设置为 *，允许任何来源访问（生产环境建议限制）');
  }

  if (config.apiKeys.length > 0 && !config.legacyApiKeyAuthEnabled) {
    warnings.push('API_KEYS 已设置但旧版 API Key 认证未启用；如确需兼容旧客户端，请设置 LEGACY_API_KEY_AUTH_ENABLED=true');
  } else if (config.legacyApiKeyAuthEnabled) {
    warnings.push('旧版 API Key 认证已启用；当前账号+密码+同步密钥部署建议关闭 LEGACY_API_KEY_AUTH_ENABLED');
  }

  if (config.secureMode && !config.trustProxy) {
    warnings.push('SECURE_MODE 已启用但 TRUST_PROXY 未启用；如果服务在 HTTPS 反代后面，可能无法识别 HTTPS 请求');
  }

  if (process.env.NODE_ENV === 'production' && !config.secureMode) {
    warnings.push('生产环境建议启用 SECURE_MODE 并通过 HTTPS 访问登录界面');
  }

  if (config.requireInitialSetupToken && !config.initialSetupToken) {
    warnings.push('REQUIRE_INITIAL_SETUP_TOKEN 已启用但 INITIAL_SETUP_TOKEN 未设置；首次管理员初始化将被阻止');
  } else if (!config.requireInitialSetupToken && !config.initialSetupToken) {
    warnings.push('INITIAL_SETUP_TOKEN 未设置；首次公网初始化时存在管理员抢注风险');
  } else if (config.initialSetupToken.length < 16) {
    warnings.push('INITIAL_SETUP_TOKEN 太短（建议至少16字符）');
  }
  
  // 检查是否在生产环境使用默认端口
  if (process.env.NODE_ENV === 'production' && config.port === 3000) {
    warnings.push('生产环境建议使用非默认端口');
  }
  
  if (warnings.length > 0) {
    console.warn('\n⚠️  安全配置警告:');
    warnings.forEach(w => console.warn(`   - ${w}`));
    console.warn('');
  }
}

// 确保数据目录存在
export function ensureDataDirs(): void {
  const fs = require('fs');
  const dbDir = path.dirname(config.databasePath);
  
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  if (!fs.existsSync(config.resourcesPath)) {
    fs.mkdirSync(config.resourcesPath, { recursive: true });
  }
}
