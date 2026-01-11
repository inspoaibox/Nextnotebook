import { getDatabase } from '../database';
import { generateId } from '../utils/crypto';
import { AuditAction, AuditLog, AuditLogResult } from '../types';

export interface AuditEntry {
  userId?: string;
  action: AuditAction;
  ip: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  success: boolean;
}

export interface AuditFilter {
  userId?: string;
  action?: AuditAction;
  startTime?: number;
  endTime?: number;
  page?: number;
  limit?: number;
}

export class AuditService {
  /**
   * 记录审计日志
   */
  log(entry: AuditEntry): void {
    const db = getDatabase();
    const id = generateId();
    const timestamp = Date.now();

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, ip_address, user_agent, details, success, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.userId || null,
      entry.action,
      entry.ip,
      entry.userAgent || null,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.success ? 1 : 0,
      timestamp
    );
  }

  /**
   * 查询审计日志
   */
  query(filter: AuditFilter): AuditLogResult {
    const db = getDatabase();
    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const offset = (page - 1) * limit;

    // 构建查询条件
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.userId) {
      conditions.push('user_id = ?');
      params.push(filter.userId);
    }

    if (filter.action) {
      conditions.push('action = ?');
      params.push(filter.action);
    }

    if (filter.startTime) {
      conditions.push('timestamp >= ?');
      params.push(filter.startTime);
    }

    if (filter.endTime) {
      conditions.push('timestamp <= ?');
      params.push(filter.endTime);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 获取总数
    const countResult = db.prepare(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`).get(...params) as { total: number };
    const total = countResult.total;

    // 获取日志列表
    const logs = db.prepare(`
      SELECT * FROM audit_logs 
      ${whereClause}
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as AuditLog[];

    // 解析 details JSON
    logs.forEach(log => {
      if (log.details && typeof log.details === 'string') {
        try {
          (log as AuditLog & { details: Record<string, unknown> | null }).details = JSON.parse(log.details);
        } catch {
          // 保持原样
        }
      }
    });

    return { logs, total };
  }

  /**
   * 获取用户最近的登录记录
   */
  getRecentLogins(userId: string, limit: number = 10): AuditLog[] {
    const db = getDatabase();
    const logs = db.prepare(`
      SELECT * FROM audit_logs 
      WHERE user_id = ? AND action = 'login'
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(userId, limit) as AuditLog[];

    return logs;
  }

  /**
   * 获取失败的登录尝试
   */
  getFailedLogins(ip: string, since: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM audit_logs 
      WHERE ip_address = ? AND action = 'login' AND success = 0 AND timestamp >= ?
    `).get(ip, since) as { count: number };

    return result.count;
  }

  /**
   * 清理旧的审计日志
   */
  cleanup(retentionDays: number = 90): number {
    const db = getDatabase();
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const result = db.prepare('DELETE FROM audit_logs WHERE timestamp < ?').run(cutoff);
    return result.changes;
  }

  /**
   * 获取审计日志统计
   */
  getStats(days: number = 7): {
    totalLogs: number;
    loginAttempts: number;
    failedLogins: number;
    registrations: number;
    passwordChanges: number;
  } {
    const db = getDatabase();
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);

    const totalLogs = (db.prepare('SELECT COUNT(*) as count FROM audit_logs WHERE timestamp >= ?').get(since) as { count: number }).count;
    const loginAttempts = (db.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE action = 'login' AND timestamp >= ?").get(since) as { count: number }).count;
    const failedLogins = (db.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE action = 'login' AND success = 0 AND timestamp >= ?").get(since) as { count: number }).count;
    const registrations = (db.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE action = 'register' AND success = 1 AND timestamp >= ?").get(since) as { count: number }).count;
    const passwordChanges = (db.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE action = 'password_change' AND success = 1 AND timestamp >= ?").get(since) as { count: number }).count;

    return {
      totalLogs,
      loginAttempts,
      failedLogins,
      registrations,
      passwordChanges
    };
  }
}

// 导出单例
export const auditService = new AuditService();
