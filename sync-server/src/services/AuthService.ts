import { getDatabase } from '../database';
import { tokenService } from './TokenService';
import {
  hashPassword,
  verifyPassword,
  computeSyncKeyFingerprint,
  generateId,
  validatePasswordStrength,
  validateSyncKeyLength,
  validateUsername
} from '../utils/crypto';
import {
  User,
  UserInfo,
  UserRole,
  LoginResult,
  RegisterResult,
  TokenPair
} from '../types';

// 错误码
export const AuthErrorCodes = {
  NO_AUTH: 'AUTH_001',
  INVALID_TOKEN: 'AUTH_002',
  REFRESH_TOKEN_INVALID: 'AUTH_003',
  INVALID_CREDENTIALS: 'AUTH_004',
  SYNC_KEY_MISMATCH: 'AUTH_005',
  ACCOUNT_DISABLED: 'AUTH_006',
  USERNAME_EXISTS: 'AUTH_007',
  WEAK_PASSWORD: 'AUTH_008',
  SHORT_SYNC_KEY: 'AUTH_009',
  RATE_LIMITED: 'AUTH_010',
  ACCOUNT_LOCKED: 'AUTH_011',
  NO_ADMIN: 'AUTH_012',
  REGISTRATION_DISABLED: 'AUTH_016'
};

export class AuthService {
  /**
   * 检查是否有任何用户存在
   */
  hasAnyUser(): boolean {
    const db = getDatabase();
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return row.count > 0;
  }

  /**
   * 检查注册是否开放
   */
  isRegistrationEnabled(): boolean {
    const db = getDatabase();
    // 如果没有任何用户，始终允许注册（第一个用户）
    if (!this.hasAnyUser()) {
      return true;
    }
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('registration_enabled') as { value: string } | undefined;
    return row?.value === 'true';
  }

  /**
   * 设置注册开关（仅管理员）
   */
  setRegistrationEnabled(enabled: boolean): void {
    const db = getDatabase();
    const now = Date.now();
    db.prepare('INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('registration_enabled', enabled ? 'true' : 'false', now);
  }

  /**
   * 获取系统状态
   */
  getSystemStatus(): { initialized: boolean; registrationEnabled: boolean; userCount: number } {
    const db = getDatabase();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const initialized = countRow.count > 0;
    return {
      initialized,
      registrationEnabled: this.isRegistrationEnabled(),
      userCount: countRow.count
    };
  }

  /**
   * 用户注册
   */
  async register(
    username: string,
    password: string,
    syncKey: string,
    role: UserRole = 'user'
  ): Promise<RegisterResult> {
    const db = getDatabase();
    const isFirstUser = !this.hasAnyUser();

    // 如果不是第一个用户，检查注册是否开放
    if (!isFirstUser && !this.isRegistrationEnabled()) {
      return { success: false, error: '注册已关闭', errorCode: AuthErrorCodes.REGISTRATION_DISABLED };
    }

    // 第一个用户自动成为管理员
    const actualRole: UserRole = isFirstUser ? 'admin' : role;

    // 验证用户名
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return { success: false, error: usernameValidation.error, errorCode: 'AUTH_013' };
    }

    // 验证密码强度
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return { success: false, error: passwordValidation.error, errorCode: AuthErrorCodes.WEAK_PASSWORD };
    }

    // 验证密码不能与用户名相同
    if (password.toLowerCase() === username.toLowerCase()) {
      return { success: false, error: '密码不能与用户名相同', errorCode: AuthErrorCodes.WEAK_PASSWORD };
    }

    // 验证同步密钥长度
    const syncKeyValidation = validateSyncKeyLength(syncKey);
    if (!syncKeyValidation.valid) {
      return { success: false, error: syncKeyValidation.error, errorCode: AuthErrorCodes.SHORT_SYNC_KEY };
    }

    // 检查用户名是否已存在
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return { success: false, error: '用户名已存在', errorCode: AuthErrorCodes.USERNAME_EXISTS };
    }

    // 创建用户
    const userId = generateId();
    const passwordHash = await hashPassword(password);
    const syncKeyFingerprint = computeSyncKeyFingerprint(syncKey);
    const now = Date.now();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, sync_key_fingerprint, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(userId, username, passwordHash, syncKeyFingerprint, actualRole, now, now);

    // 如果是第一个用户（管理员），默认关闭注册
    if (isFirstUser) {
      this.setRegistrationEnabled(false);
    }

    return { success: true, userId, isAdmin: actualRole === 'admin' };
  }

  /**
   * 用户登录
   */
  async login(
    username: string,
    password: string,
    syncKey: string,
    deviceInfo?: string,
    ipAddress?: string
  ): Promise<LoginResult> {
    const db = getDatabase();

    // 查找用户（不泄露用户是否存在）
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;

    // 统一的错误消息，不泄露用户是否存在
    const genericError = { success: false, error: '用户名或密码错误', errorCode: AuthErrorCodes.INVALID_CREDENTIALS };

    if (!user) {
      // 执行一次假的密码验证，防止时序攻击
      await verifyPassword(password, '$2b$10$dummy.hash.for.timing.attack.prevention');
      return genericError;
    }

    // 检查用户状态
    if (user.status === 'disabled') {
      return { success: false, error: '账号已被禁用', errorCode: AuthErrorCodes.ACCOUNT_DISABLED };
    }

    // 验证密码
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return genericError;
    }

    // 验证同步密钥
    const syncKeyFingerprint = computeSyncKeyFingerprint(syncKey);
    if (syncKeyFingerprint !== user.sync_key_fingerprint) {
      return { success: false, error: '同步密钥验证失败', errorCode: AuthErrorCodes.SYNC_KEY_MISMATCH };
    }

    // 生成令牌
    const tokens = tokenService.generateTokenPair(
      user.id,
      user.sync_key_fingerprint,
      user.role,
      deviceInfo,
      ipAddress
    );

    // 更新最后登录时间
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        created_at: user.created_at,
        last_login_at: Date.now()
      }
    };
  }

  /**
   * 刷新令牌
   */
  refreshToken(refreshToken: string): (TokenPair & { userId: string }) | null {
    return tokenService.refreshTokens(refreshToken);
  }

  /**
   * 登出
   */
  logout(sessionId: string): void {
    tokenService.revokeSession(sessionId);
  }

  /**
   * 登出所有设备
   */
  logoutAll(userId: string): void {
    tokenService.revokeAllUserSessions(userId);
  }

  /**
   * 修改密码
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string; errorCode?: string }> {
    const db = getDatabase();

    // 获取用户
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
    if (!user) {
      return { success: false, error: '用户不存在', errorCode: 'AUTH_014' };
    }

    // 验证当前密码
    const passwordValid = await verifyPassword(currentPassword, user.password_hash);
    if (!passwordValid) {
      return { success: false, error: '当前密码错误', errorCode: AuthErrorCodes.INVALID_CREDENTIALS };
    }

    // 验证新密码强度
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return { success: false, error: passwordValidation.error, errorCode: AuthErrorCodes.WEAK_PASSWORD };
    }

    // 验证新密码不能与用户名相同
    if (newPassword.toLowerCase() === user.username.toLowerCase()) {
      return { success: false, error: '密码不能与用户名相同', errorCode: AuthErrorCodes.WEAK_PASSWORD };
    }

    // 更新密码
    const newPasswordHash = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(newPasswordHash, Date.now(), userId);

    // 使所有会话失效
    tokenService.revokeAllUserSessions(userId);

    return { success: true };
  }

  /**
   * 重置密码（使用同步密钥验证）
   */
  async resetPassword(
    username: string,
    syncKey: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string; errorCode?: string }> {
    const db = getDatabase();

    // 查找用户
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
    if (!user) {
      return { success: false, error: '用户不存在', errorCode: 'AUTH_014' };
    }

    // 验证同步密钥
    const syncKeyFingerprint = computeSyncKeyFingerprint(syncKey);
    if (syncKeyFingerprint !== user.sync_key_fingerprint) {
      return { success: false, error: '同步密钥验证失败', errorCode: AuthErrorCodes.SYNC_KEY_MISMATCH };
    }

    // 验证新密码强度
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return { success: false, error: passwordValidation.error, errorCode: AuthErrorCodes.WEAK_PASSWORD };
    }

    // 验证新密码不能与用户名相同
    if (newPassword.toLowerCase() === user.username.toLowerCase()) {
      return { success: false, error: '密码不能与用户名相同', errorCode: AuthErrorCodes.WEAK_PASSWORD };
    }

    // 更新密码
    const newPasswordHash = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(newPasswordHash, Date.now(), user.id);

    // 使所有会话失效
    tokenService.revokeAllUserSessions(user.id);

    return { success: true };
  }

  /**
   * 更新同步密钥
   */
  async updateSyncKey(
    userId: string,
    password: string,
    oldSyncKey: string,
    newSyncKey: string
  ): Promise<{ success: boolean; error?: string; errorCode?: string }> {
    const db = getDatabase();

    // 获取用户
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
    if (!user) {
      return { success: false, error: '用户不存在', errorCode: 'AUTH_014' };
    }

    // 验证密码
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return { success: false, error: '密码错误', errorCode: AuthErrorCodes.INVALID_CREDENTIALS };
    }

    // 验证旧同步密钥
    const oldSyncKeyFingerprint = computeSyncKeyFingerprint(oldSyncKey);
    if (oldSyncKeyFingerprint !== user.sync_key_fingerprint) {
      return { success: false, error: '旧同步密钥验证失败', errorCode: AuthErrorCodes.SYNC_KEY_MISMATCH };
    }

    // 验证新同步密钥长度
    const syncKeyValidation = validateSyncKeyLength(newSyncKey);
    if (!syncKeyValidation.valid) {
      return { success: false, error: syncKeyValidation.error, errorCode: AuthErrorCodes.SHORT_SYNC_KEY };
    }

    // 更新同步密钥指纹
    const newSyncKeyFingerprint = computeSyncKeyFingerprint(newSyncKey);
    db.prepare('UPDATE users SET sync_key_fingerprint = ?, updated_at = ? WHERE id = ?')
      .run(newSyncKeyFingerprint, Date.now(), userId);

    // 使所有会话失效
    tokenService.revokeAllUserSessions(userId);

    return { success: true };
  }

  /**
   * 获取用户信息
   */
  getUser(userId: string): UserInfo | null {
    const db = getDatabase();
    const user = db.prepare('SELECT id, username, role, status, created_at, last_login_at FROM users WHERE id = ?')
      .get(userId) as UserInfo | undefined;
    return user || null;
  }

  /**
   * 通过用户名获取用户
   */
  getUserByUsername(username: string): User | null {
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
    return user || null;
  }

  /**
   * 验证同步密钥指纹
   */
  verifySyncKeyFingerprint(userId: string, fingerprint: string): boolean {
    const db = getDatabase();
    const user = db.prepare('SELECT sync_key_fingerprint FROM users WHERE id = ?')
      .get(userId) as { sync_key_fingerprint: string } | undefined;
    return user?.sync_key_fingerprint === fingerprint;
  }
}

// 导出单例
export const authService = new AuthService();
