import * as crypto from 'crypto';
import { CryptoEngine } from '../crypto/CryptoEngine';

export interface LockConfig {
  enabled: boolean;
  type: 'pin' | 'password';
  autoLockTimeout: number;  // 分钟，0 表示不自动锁定
  lockOnMinimize: boolean;
  lockOnScreenLock: boolean;
}

export interface LockState {
  isLocked: boolean;
  lastUnlockTime: number | null;
  failedAttempts: number;
  lockedUntil: number | null;  // 多次失败后的锁定时间
}

export class AppLock {
  private config: LockConfig;
  private state: LockState;
  private passwordHash: string | null = null;
  private salt: string | null = null;
  private cryptoEngine: CryptoEngine;
  private autoLockTimer: NodeJS.Timeout | null = null;
  private onLockCallback: (() => void) | null = null;

  constructor(cryptoEngine: CryptoEngine) {
    this.cryptoEngine = cryptoEngine;
    this.config = {
      enabled: false,
      type: 'password',
      autoLockTimeout: 5,
      lockOnMinimize: false,
      lockOnScreenLock: true,
    };
    this.state = {
      isLocked: false,
      lastUnlockTime: null,
      failedAttempts: 0,
      lockedUntil: null,
    };
  }

  // 设置锁定密码
  setPassword(password: string): void {
    this.salt = crypto.randomBytes(32).toString('hex');
    this.passwordHash = this.hashPassword(password, this.salt);
    this.config.enabled = true;
  }

  // 验证密码
  verifyPassword(password: string): boolean {
    if (!this.passwordHash || !this.salt) return false;

    // 检查是否被临时锁定
    if (this.state.lockedUntil && Date.now() < this.state.lockedUntil) {
      return false;
    }

    const hash = this.hashPassword(password, this.salt);
    const isValid = hash === this.passwordHash;

    if (isValid) {
      this.state.failedAttempts = 0;
      this.state.lockedUntil = null;
    } else {
      this.state.failedAttempts++;
      // 5次失败后锁定5分钟
      if (this.state.failedAttempts >= 5) {
        this.state.lockedUntil = Date.now() + 5 * 60 * 1000;
      }
    }

    return isValid;
  }

  // 修改密码
  changePassword(oldPassword: string, newPassword: string): boolean {
    if (!this.verifyPassword(oldPassword)) {
      return false;
    }
    this.setPassword(newPassword);
    return true;
  }

  // 移除密码保护
  removePassword(password: string): boolean {
    if (!this.verifyPassword(password)) {
      return false;
    }
    this.passwordHash = null;
    this.salt = null;
    this.config.enabled = false;
    return true;
  }

  // 锁定应用
  lock(): void {
    if (!this.config.enabled) return;
    this.state.isLocked = true;
    this.stopAutoLockTimer();
    this.onLockCallback?.();
  }

  // 解锁应用
  unlock(password: string): boolean {
    if (!this.config.enabled) {
      this.state.isLocked = false;
      return true;
    }

    if (this.verifyPassword(password)) {
      this.state.isLocked = false;
      this.state.lastUnlockTime = Date.now();
      this.startAutoLockTimer();
      return true;
    }

    return false;
  }

  // 获取锁定状态
  getState(): LockState {
    return { ...this.state };
  }

  // 获取配置
  getConfig(): LockConfig {
    return { ...this.config };
  }

  // 更新配置
  updateConfig(config: Partial<LockConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.config.autoLockTimeout > 0 && !this.state.isLocked) {
      this.startAutoLockTimer();
    } else {
      this.stopAutoLockTimer();
    }
  }

  // 设置锁定回调
  onLock(callback: () => void): void {
    this.onLockCallback = callback;
  }

  // 重置活动计时器（用户有操作时调用）
  resetActivityTimer(): void {
    if (this.config.enabled && this.config.autoLockTimeout > 0 && !this.state.isLocked) {
      this.startAutoLockTimer();
    }
  }

  // 获取剩余锁定时间
  getRemainingLockTime(): number {
    if (!this.state.lockedUntil) return 0;
    return Math.max(0, this.state.lockedUntil - Date.now());
  }

  // 导出锁定配置（不包含密码）
  exportConfig(): { config: LockConfig; hasPassword: boolean } {
    return {
      config: this.config,
      hasPassword: !!this.passwordHash,
    };
  }

  // 导入锁定配置
  importConfig(config: LockConfig): void {
    this.config = config;
  }

  // 哈希密码
  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  }

  // 启动自动锁定计时器
  private startAutoLockTimer(): void {
    this.stopAutoLockTimer();
    
    if (this.config.autoLockTimeout <= 0) return;

    const timeout = this.config.autoLockTimeout * 60 * 1000;
    this.autoLockTimer = setTimeout(() => {
      this.lock();
    }, timeout);
  }

  // 停止自动锁定计时器
  private stopAutoLockTimer(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }
}

export default AppLock;
