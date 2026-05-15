import jwt from 'jsonwebtoken';
import { getDatabase } from '../database';
import { generateId, generateToken, hashRefreshToken } from '../utils/crypto';
import { config } from '../config';
import { 
  AccessTokenPayload, 
  RefreshTokenPayload, 
  TokenPair, 
  UserRole,
  Session 
} from '../types';

// 从配置读取 JWT 密钥
const JWT_SECRET = config.jwtSecret;
const JWT_REFRESH_SECRET = config.jwtRefreshSecret;

// 令牌过期时间（从配置读取）
const ACCESS_TOKEN_EXPIRES_IN = config.accessTokenExpiresIn;
const REFRESH_TOKEN_EXPIRES_IN = config.refreshTokenExpiresIn;

// 最大活跃会话数（防止会话泛滥）
const MAX_ACTIVE_SESSIONS_PER_USER = 10;

export class TokenService {
  /**
   * 生成令牌对（访问令牌 + 刷新令牌）
   */
  generateTokenPair(
    userId: string, 
    syncKeyFingerprint: string, 
    role: UserRole,
    deviceInfo?: string,
    ipAddress?: string
  ): TokenPair & { sessionId: string } {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    
    // 检查活跃会话数量，如果超过限制则清理最旧的会话
    const activeCount = this.getActiveSessionCount(userId);
    if (activeCount >= MAX_ACTIVE_SESSIONS_PER_USER) {
      // 删除最旧的会话
      db.prepare(`
        DELETE FROM sessions WHERE id IN (
          SELECT id FROM sessions 
          WHERE user_id = ? AND revoked = 0 AND expires_at > ?
          ORDER BY created_at ASC
          LIMIT ?
        )
      `).run(userId, Date.now(), activeCount - MAX_ACTIVE_SESSIONS_PER_USER + 1);
    }
    
    // 创建会话
    const sessionId = generateId();
    const tokenId = generateId();
    const refreshToken = generateToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    
    // 存储会话
    db.prepare(`
      INSERT INTO sessions (id, user_id, refresh_token_hash, device_info, ip_address, created_at, expires_at, revoked)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      sessionId,
      userId,
      refreshTokenHash,
      deviceInfo || null,
      ipAddress || null,
      now * 1000,
      (now + REFRESH_TOKEN_EXPIRES_IN) * 1000
    );

    // 生成访问令牌
    const accessTokenPayload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
      sub: userId,
      sid: sessionId,
      skf: syncKeyFingerprint,
      role: role
    };
    
    const accessToken = jwt.sign(accessTokenPayload, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN
    });

    // 生成刷新令牌
    const refreshTokenPayload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
      sub: userId,
      sid: sessionId,
      tid: tokenId
    };
    
    const signedRefreshToken = jwt.sign(refreshTokenPayload, JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN
    });

    return {
      accessToken,
      refreshToken: signedRefreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      sessionId
    };
  }

  /**
   * 验证访问令牌
   */
  verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
      
      // 检查会话是否被撤销，同时确认用户仍然有效。
      const db = getDatabase();
      const session = db.prepare(`
        SELECT s.revoked, s.user_id, u.status, u.role, u.sync_key_fingerprint
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = ?
      `).get(payload.sid) as {
        revoked: number;
        user_id: string;
        status: string;
        role: UserRole;
        sync_key_fingerprint: string;
      } | undefined;
      
      if (
        !session ||
        session.revoked === 1 ||
        session.status === 'disabled' ||
        session.user_id !== payload.sub ||
        session.sync_key_fingerprint !== payload.skf
      ) {
        return null;
      }

      payload.role = session.role;
      
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * 验证刷新令牌并生成新的令牌对
   */
  refreshTokens(refreshToken: string): (TokenPair & { sessionId: string; userId: string }) | null {
    try {
      const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as RefreshTokenPayload;
      const db = getDatabase();
      
      // 获取会话
      const session = db.prepare(`
        SELECT s.*, u.sync_key_fingerprint, u.role, u.status
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = ?
      `).get(payload.sid) as (Session & { sync_key_fingerprint: string; role: UserRole; status: string }) | undefined;
      
      if (!session) {
        return null;
      }
      
      // 检查会话是否被撤销
      if (session.revoked === 1) {
        return null;
      }
      
      // 检查用户是否被禁用
      if (session.status === 'disabled') {
        return null;
      }
      
      // 检查会话是否过期
      if (session.expires_at < Date.now()) {
        return null;
      }
      
      // 撤销旧会话
      db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?').run(payload.sid);
      
      // 生成新的令牌对
      const newTokens = this.generateTokenPair(
        session.user_id,
        session.sync_key_fingerprint,
        session.role,
        session.device_info || undefined,
        session.ip_address || undefined
      );
      
      return {
        ...newTokens,
        userId: session.user_id
      };
    } catch {
      return null;
    }
  }

  /**
   * 撤销会话
   */
  revokeSession(sessionId: string): void {
    const db = getDatabase();
    db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?').run(sessionId);
  }

  /**
   * 撤销用户的所有会话
   */
  revokeAllUserSessions(userId: string): void {
    const db = getDatabase();
    db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ?').run(userId);
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions(): number {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM sessions WHERE expires_at < ? OR revoked = 1').run(Date.now());
    return result.changes;
  }

  /**
   * 获取用户的活跃会话数
   */
  getActiveSessionCount(userId: string): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM sessions 
      WHERE user_id = ? AND revoked = 0 AND expires_at > ?
    `).get(userId, Date.now()) as { count: number };
    return result.count;
  }
}

// 导出单例
export const tokenService = new TokenService();
