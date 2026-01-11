import { getDatabase } from '../database';
import { tokenService } from './TokenService';
import { User, UserInfo, UserListResult, UserRole } from '../types';

export class UserService {
  /**
   * 获取用户信息
   */
  getUser(userId: string): UserInfo | null {
    const db = getDatabase();
    const user = db.prepare(`
      SELECT id, username, role, status, created_at, last_login_at 
      FROM users WHERE id = ?
    `).get(userId) as UserInfo | undefined;
    return user || null;
  }

  /**
   * 获取用户列表（管理员功能）
   */
  listUsers(page: number = 1, limit: number = 20): UserListResult {
    const db = getDatabase();
    const offset = (page - 1) * limit;

    // 获取总数
    const countResult = db.prepare('SELECT COUNT(*) as total FROM users').get() as { total: number };
    const total = countResult.total;

    // 获取用户列表
    const users = db.prepare(`
      SELECT id, username, role, status, created_at, last_login_at 
      FROM users 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).all(limit, offset) as UserInfo[];

    return {
      users,
      total,
      page,
      limit
    };
  }

  /**
   * 禁用用户
   */
  disableUser(userId: string): { success: boolean; error?: string } {
    const db = getDatabase();

    // 检查用户是否存在
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: UserRole } | undefined;
    if (!user) {
      return { success: false, error: '用户不存在' };
    }

    // 不能禁用管理员
    if (user.role === 'admin') {
      return { success: false, error: '不能禁用管理员账号' };
    }

    // 禁用用户
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?')
      .run('disabled', Date.now(), userId);

    // 使所有会话失效
    tokenService.revokeAllUserSessions(userId);

    return { success: true };
  }

  /**
   * 启用用户
   */
  enableUser(userId: string): { success: boolean; error?: string } {
    const db = getDatabase();

    // 检查用户是否存在
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return { success: false, error: '用户不存在' };
    }

    // 启用用户
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?')
      .run('active', Date.now(), userId);

    return { success: true };
  }

  /**
   * 删除用户
   */
  deleteUser(userId: string): { success: boolean; error?: string } {
    const db = getDatabase();

    // 检查用户是否存在
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: UserRole } | undefined;
    if (!user) {
      return { success: false, error: '用户不存在' };
    }

    // 不能删除管理员
    if (user.role === 'admin') {
      return { success: false, error: '不能删除管理员账号' };
    }

    // 使所有会话失效
    tokenService.revokeAllUserSessions(userId);

    // 删除用户（会级联删除会话）
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    return { success: true };
  }

  /**
   * 检查用户名是否存在
   */
  usernameExists(username: string): boolean {
    const db = getDatabase();
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    return !!user;
  }

  /**
   * 设置用户角色
   */
  setUserRole(userId: string, role: UserRole): { success: boolean; error?: string } {
    const db = getDatabase();

    // 检查用户是否存在
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return { success: false, error: '用户不存在' };
    }

    // 更新角色
    db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
      .run(role, Date.now(), userId);

    // 使所有会话失效（角色变更需要重新登录）
    tokenService.revokeAllUserSessions(userId);

    return { success: true };
  }

  /**
   * 获取用户统计信息
   */
  getUserStats(): { total: number; active: number; disabled: number; admins: number } {
    const db = getDatabase();
    
    const total = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
    const active = (db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active'").get() as { count: number }).count;
    const disabled = (db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'disabled'").get() as { count: number }).count;
    const admins = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number }).count;

    return { total, active, disabled, admins };
  }
}

// 导出单例
export const userService = new UserService();
