import bcrypt from 'bcrypt';
import crypto from 'crypto';

// bcrypt 哈希轮数（至少10轮）
const BCRYPT_ROUNDS = 10;

/**
 * 使用 bcrypt 对密码进行哈希
 * @param password 明文密码
 * @returns 哈希后的密码
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * 验证密码是否匹配
 * @param password 明文密码
 * @param hash 存储的哈希值
 * @returns 是否匹配
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * 计算同步密钥的 SHA-256 指纹
 * @param syncKey 同步密钥
 * @returns 十六进制指纹
 */
export function computeSyncKeyFingerprint(syncKey: string): string {
  return crypto.createHash('sha256').update(syncKey).digest('hex');
}

/**
 * 计算刷新令牌的哈希值
 * @param token 刷新令牌
 * @returns 十六进制哈希
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 生成随机 ID
 * @param length 字节长度（默认16，生成32字符的十六进制字符串）
 * @returns 随机十六进制字符串
 */
export function generateId(length: number = 16): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * 生成随机令牌
 * @param length 字节长度（默认32，生成64字符的十六进制字符串）
 * @returns 随机十六进制字符串
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * 验证密码强度
 * @param password 密码
 * @returns 验证结果
 */
export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: '密码长度至少8个字符' };
  }
  if (password.length > 128) {
    return { valid: false, error: '密码长度不能超过128个字符' };
  }
  // 检查是否包含至少一个数字
  if (!/\d/.test(password)) {
    return { valid: false, error: '密码必须包含至少一个数字' };
  }
  // 检查是否包含至少一个字母
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, error: '密码必须包含至少一个字母' };
  }
  // 检查常见弱密码
  const weakPasswords = [
    'password', '12345678', '123456789', 'qwerty123', 'admin123',
    'password1', 'password123', 'abc12345', 'letmein1', 'welcome1'
  ];
  if (weakPasswords.includes(password.toLowerCase())) {
    return { valid: false, error: '密码过于简单，请使用更复杂的密码' };
  }
  return { valid: true };
}

/**
 * 验证同步密钥长度
 * @param syncKey 同步密钥
 * @returns 验证结果
 */
export function validateSyncKeyLength(syncKey: string): { valid: boolean; error?: string } {
  if (syncKey.length < 16) {
    return { valid: false, error: '同步密钥长度至少16个字符' };
  }
  return { valid: true };
}

/**
 * 验证用户名格式
 * @param username 用户名
 * @returns 验证结果
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (username.length < 3) {
    return { valid: false, error: '用户名长度至少3个字符' };
  }
  if (username.length > 32) {
    return { valid: false, error: '用户名长度不能超过32个字符' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, error: '用户名只能包含字母、数字、下划线和连字符' };
  }
  return { valid: true };
}
