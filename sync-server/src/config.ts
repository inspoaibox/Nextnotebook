import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

export interface Config {
  port: number;
  databasePath: string;
  resourcesPath: string;
  apiKeys: string[];
  logLevel: string;
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
  loginRateLimit: number;
  registerRateLimit: number;
  // 安全配置
  trustProxy: boolean;
  secureMode: boolean;
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

// 生成安全的随机密钥（如果未配置）
function getOrGenerateSecret(envValue: string | undefined, defaultValue: string): string {
  if (envValue && envValue.length >= 32) {
    return envValue;
  }
  // 如果没有配置或太短，使用默认值但输出警告
  return defaultValue;
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databasePath: process.env.DATABASE_PATH || './data/sync.db',
  resourcesPath: process.env.RESOURCES_PATH || './data/resources',
  apiKeys: parseApiKeys(process.env.API_KEYS),
  logLevel: process.env.LOG_LEVEL || 'info',
  maxResourceSize: parseInt(process.env.MAX_RESOURCE_SIZE || '104857600', 10),
  changeLogRetentionDays: parseInt(process.env.CHANGE_LOG_RETENTION_DAYS || '90', 10),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  // JWT 配置
  jwtSecret: getOrGenerateSecret(process.env.JWT_SECRET, 'mucheng-sync-server-jwt-secret-change-in-production'),
  jwtRefreshSecret: getOrGenerateSecret(process.env.JWT_REFRESH_SECRET, 'mucheng-sync-server-refresh-secret-change-in-production'),
  accessTokenExpiresIn: parseInt(process.env.ACCESS_TOKEN_EXPIRES_IN || '3600', 10), // 1小时
  refreshTokenExpiresIn: parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN || '2592000', 10), // 30天（原7天太短）
  // 频率限制配置
  apiRateLimit: parseInt(process.env.API_RATE_LIMIT || '10000', 10),
  loginRateLimit: parseInt(process.env.LOGIN_RATE_LIMIT || '5', 10),
  registerRateLimit: parseInt(process.env.REGISTER_RATE_LIMIT || '3', 10),
  // 安全配置
  trustProxy: process.env.TRUST_PROXY === 'true',  // 是否信任代理（用于获取真实 IP）
  secureMode: process.env.SECURE_MODE === 'true',  // 是否启用安全模式（强制 HTTPS）
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
