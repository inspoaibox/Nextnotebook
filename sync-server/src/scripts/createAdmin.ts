/**
 * 创建管理员用户脚本
 * 
 * 使用方法:
 * npx ts-node src/scripts/createAdmin.ts <username> <password> <syncKey>
 * 
 * 示例:
 * npx ts-node src/scripts/createAdmin.ts admin MySecurePassword123 MySyncKeyAtLeast16Chars
 */

import { getDatabase, closeDatabase } from '../database';
import { authService } from '../services/AuthService';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('用法: npx ts-node src/scripts/createAdmin.ts <username> <password> <syncKey>');
    console.log('');
    console.log('参数:');
    console.log('  username  - 管理员用户名 (3-32字符，只能包含字母、数字、下划线和连字符)');
    console.log('  password  - 密码 (至少8个字符)');
    console.log('  syncKey   - 同步密钥 (至少16个字符)');
    console.log('');
    console.log('示例:');
    console.log('  npx ts-node src/scripts/createAdmin.ts admin MySecurePassword123 MySyncKeyAtLeast16Chars');
    process.exit(1);
  }

  const [username, password, syncKey] = args;

  console.log('正在初始化数据库...');
  getDatabase();

  console.log(`正在创建管理员用户: ${username}`);
  
  try {
    const result = await authService.register(username, password, syncKey, 'admin');
    
    if (result.success) {
      console.log('✓ 管理员用户创建成功!');
      console.log(`  用户ID: ${result.userId}`);
      console.log(`  用户名: ${username}`);
      console.log('');
      console.log('请妥善保管您的密码和同步密钥，它们无法被恢复。');
    } else {
      console.error(`✗ 创建失败: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('创建管理员用户时发生错误:', error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

main();
