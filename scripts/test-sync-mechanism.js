/**
 * 同步机制自动化测试脚本
 * 
 * 用法:
 *   node scripts/test-sync-mechanism.js
 * 
 * 环境变量:
 *   WEBDAV_URL - WebDAV 服务器地址 (默认: http://localhost:8080)
 *   WEBDAV_USER - WebDAV 用户名 (默认: test)
 *   WEBDAV_PASS - WebDAV 密码 (默认: test123)
 */

const { createClient } = require('webdav');
const crypto = require('crypto');

// 配置
const config = {
  url: process.env.WEBDAV_URL || 'http://localhost:8080',
  username: process.env.WEBDAV_USER || 'test',
  password: process.env.WEBDAV_PASS || 'test123',
  basePath: '/mucheng-notes-test',
};

// 创建 WebDAV 客户端
const client = createClient(config.url, {
  username: config.username,
  password: config.password,
});

// 辅助函数
function getPath(subPath) {
  return `${config.basePath}/${subPath}`;
}

function generateId() {
  return crypto.randomUUID();
}

function computeHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 测试用例
class SyncMechanismTest {
  constructor() {
    this.testResults = [];
  }

  async setup() {
    console.log('🔧 Setting up test environment...');
    
    // 清理测试目录
    try {
      if (await client.exists(config.basePath)) {
        await client.deleteFile(config.basePath);
      }
    } catch (e) {
      // 忽略删除错误
    }
    
    // 创建目录结构
    await client.createDirectory(config.basePath);
    await client.createDirectory(getPath('items'));
    await client.createDirectory(getPath('changes'));
    await client.createDirectory(getPath('resources'));
    await client.createDirectory(getPath('locks'));
    
    // 创建 workspace.json
    const workspace = {
      version: '1.0',
      capabilities: ['items', 'resources', 'changes'],
      last_sync_time: null,
      key_identifier: null,
    };
    await client.putFileContents(getPath('workspace.json'), JSON.stringify(workspace, null, 2));
    
    console.log('✅ Test environment ready');
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');
    try {
      await client.deleteFile(config.basePath);
    } catch (e) {
      console.warn('⚠️  Cleanup failed:', e.message);
    }
  }

  async test1_CreateItemAndChange() {
    console.log('\n📝 Test 1: Create item and change log');
    
    const itemId = generateId();
    const now = Date.now();
    const payload = JSON.stringify({ title: 'Test Note', content: 'Hello World' });
    
    // 创建 item
    const item = {
      id: itemId,
      type: 'note',
      created_time: now,
      updated_time: now,
      deleted_time: null,
      payload: payload,
      content_hash: computeHash(payload),
      sync_status: 'clean',
      local_rev: 1,
      remote_rev: now.toString(),
      encryption_applied: 0,
      schema_version: 1,
    };
    
    await client.putFileContents(
      getPath(`items/${itemId}.json`),
      JSON.stringify(item, null, 2)
    );
    
    // 创建 change log
    const change = {
      change_id: now,
      item_id: itemId,
      type: 'note',
      updated_time: now,
      deleted_time: null,
      content_hash: item.content_hash,
    };
    
    await client.putFileContents(
      getPath(`changes/${now}.json`),
      JSON.stringify(change, null, 2)
    );
    
    // 验证
    const itemExists = await client.exists(getPath(`items/${itemId}.json`));
    const changeExists = await client.exists(getPath(`changes/${now}.json`));
    
    const passed = itemExists && changeExists;
    this.testResults.push({ name: 'Test 1', passed });
    
    console.log(passed ? '✅ PASSED' : '❌ FAILED');
    return { itemId, changeId: now };
  }

  async test2_ListChanges(changeId) {
    console.log('\n📋 Test 2: List changes');
    
    const changesDir = getPath('changes');
    const files = await client.getDirectoryContents(changesDir);
    
    const changeFiles = files.filter(f => f.basename.endsWith('.json'));
    const passed = changeFiles.length > 0;
    
    this.testResults.push({ name: 'Test 2', passed });
    console.log(passed ? '✅ PASSED' : '❌ FAILED');
    console.log(`   Found ${changeFiles.length} change file(s)`);
    
    return changeFiles;
  }

  async test3_SyncCursor(changeId) {
    console.log('\n🔖 Test 3: Sync cursor');

    const cursor = {
      cursor: `${changeId}.json`,
      timestamp: Date.now(),
    };

    await client.putFileContents(
      getPath('sync-cursor.json'),
      JSON.stringify(cursor, null, 2)
    );

    // 验证
    const content = await client.getFileContents(getPath('sync-cursor.json'), { format: 'text' });
    const savedCursor = JSON.parse(content);

    const passed = savedCursor.cursor === cursor.cursor;
    this.testResults.push({ name: 'Test 3', passed });

    console.log(passed ? '✅ PASSED' : '❌ FAILED');
    console.log(`   Cursor: ${savedCursor.cursor}`);
  }

  async test4_ChangeLogFormat(changeId) {
    console.log('\n📄 Test 4: Change log format validation');

    const content = await client.getFileContents(getPath(`changes/${changeId}.json`), { format: 'text' });
    const change = JSON.parse(content);

    // 验证必需字段
    const requiredFields = ['change_id', 'item_id', 'type', 'updated_time', 'content_hash'];
    const hasAllFields = requiredFields.every(field => change.hasOwnProperty(field));

    // 验证字段类型
    const validTypes =
      typeof change.change_id === 'number' &&
      typeof change.item_id === 'string' &&
      typeof change.type === 'string' &&
      typeof change.updated_time === 'number' &&
      typeof change.content_hash === 'string';

    const passed = hasAllFields && validTypes;
    this.testResults.push({ name: 'Test 4', passed });

    console.log(passed ? '✅ PASSED' : '❌ FAILED');
    if (!passed) {
      console.log('   Missing fields:', requiredFields.filter(f => !change.hasOwnProperty(f)));
    }
  }

  async runAll() {
    console.log('🚀 Starting Sync Mechanism Tests\n');
    console.log('Configuration:');
    console.log(`  URL: ${config.url}`);
    console.log(`  Base Path: ${config.basePath}`);
    console.log('');

    try {
      await this.setup();

      const { itemId, changeId } = await this.test1_CreateItemAndChange();
      await this.test2_ListChanges(changeId);
      await this.test3_SyncCursor(changeId);
      await this.test4_ChangeLogFormat(changeId);

      // 总结
      console.log('\n' + '='.repeat(50));
      console.log('📊 Test Summary');
      console.log('='.repeat(50));

      const passed = this.testResults.filter(r => r.passed).length;
      const total = this.testResults.length;

      this.testResults.forEach(result => {
        const icon = result.passed ? '✅' : '❌';
        console.log(`${icon} ${result.name}`);
      });

      console.log('');
      console.log(`Total: ${passed}/${total} passed`);

      if (passed === total) {
        console.log('\n🎉 All tests passed!');
      } else {
        console.log('\n⚠️  Some tests failed');
        process.exit(1);
      }

    } catch (error) {
      console.error('\n❌ Test failed with error:', error.message);
      console.error(error.stack);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// 运行测试
if (require.main === module) {
  const test = new SyncMechanismTest();
  test.runAll().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = SyncMechanismTest;

