import * as crypto from 'crypto';

// 加密配置常量
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits for GCM
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

export interface EncryptedData {
  ciphertext: string;  // Base64 编码的密文
  iv: string;          // Base64 编码的 IV
  authTag: string;     // Base64 编码的认证标签
  salt?: string;       // Base64 编码的盐（用于密码派生密钥时）
}

export class CryptoEngine {
  private masterKey: Buffer | null = null;

  // 从密码派生密钥
  deriveKeyFromPassword(password: string, salt?: Buffer): { key: Buffer; salt: Buffer } {
    const useSalt = salt || crypto.randomBytes(SALT_LENGTH);
    const key = crypto.pbkdf2Sync(password, useSalt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
    return { key, salt: useSalt };
  }

  // 生成随机密钥
  generateRandomKey(): Buffer {
    return crypto.randomBytes(KEY_LENGTH);
  }

  // 设置主密钥
  setMasterKey(key: Buffer): void {
    if (key.length !== KEY_LENGTH) {
      throw new Error(`Invalid key length: expected ${KEY_LENGTH}, got ${key.length}`);
    }
    this.masterKey = key;
  }

  // 从密码设置主密钥
  setMasterKeyFromPassword(password: string, salt: Buffer): void {
    const { key } = this.deriveKeyFromPassword(password, salt);
    this.masterKey = key;
  }

  // 清除主密钥
  clearMasterKey(): void {
    if (this.masterKey) {
      this.masterKey.fill(0);
      this.masterKey = null;
    }
  }

  // 检查是否已设置主密钥
  hasMasterKey(): boolean {
    return this.masterKey !== null;
  }

  // 加密数据
  encrypt(plaintext: string, key?: Buffer): EncryptedData {
    const useKey = key || this.masterKey;
    if (!useKey) {
      throw new Error('No encryption key available');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, useKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  // 解密数据
  decrypt(encryptedData: EncryptedData, key?: Buffer): string {
    const useKey = key || this.masterKey;
    if (!useKey) {
      throw new Error('No decryption key available');
    }

    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');
    const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, useKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  // 使用密码加密（包含盐）
  encryptWithPassword(plaintext: string, password: string): EncryptedData {
    const { key, salt } = this.deriveKeyFromPassword(password);
    const encrypted = this.encrypt(plaintext, key);
    return {
      ...encrypted,
      salt: salt.toString('base64'),
    };
  }

  // 使用密码解密
  decryptWithPassword(encryptedData: EncryptedData, password: string): string {
    if (!encryptedData.salt) {
      throw new Error('Salt is required for password-based decryption');
    }
    const salt = Buffer.from(encryptedData.salt, 'base64');
    const { key } = this.deriveKeyFromPassword(password, salt);
    return this.decrypt(encryptedData, key);
  }

  // 加密 Item payload（用于同步）
  encryptPayload(payload: string): string {
    const encrypted = this.encrypt(payload);
    return JSON.stringify(encrypted);
  }

  // 解密 Item payload
  decryptPayload(encryptedPayload: string): string {
    const encrypted = JSON.parse(encryptedPayload) as EncryptedData;
    return this.decrypt(encrypted);
  }

  // 计算内容哈希
  computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // 验证密码（通过尝试解密测试数据）
  verifyPassword(password: string, testData: EncryptedData): boolean {
    try {
      this.decryptWithPassword(testData, password);
      return true;
    } catch {
      return false;
    }
  }

  // 生成同步密钥标识（用于验证密钥匹配）
  generateKeyIdentifier(key?: Buffer): string {
    const useKey = key || this.masterKey;
    if (!useKey) {
      throw new Error('No key available');
    }
    // 使用密钥的哈希前16字符作为标识
    return crypto.createHash('sha256').update(useKey).digest('hex').substring(0, 16);
  }

  // 导出密钥（加密后）
  exportKey(exportPassword: string): string {
    if (!this.masterKey) {
      throw new Error('No master key to export');
    }
    const encrypted = this.encryptWithPassword(this.masterKey.toString('base64'), exportPassword);
    return JSON.stringify(encrypted);
  }

  // 导入密钥
  importKey(encryptedKey: string, importPassword: string): void {
    const encrypted = JSON.parse(encryptedKey) as EncryptedData;
    const keyBase64 = this.decryptWithPassword(encrypted, importPassword);
    this.masterKey = Buffer.from(keyBase64, 'base64');
  }
}

export default CryptoEngine;
