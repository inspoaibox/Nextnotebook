/**
 * 同步错误诊断脚本
 * 
 * 用法:
 *   node scripts/diagnose-sync-error.js <item-id>
 * 
 * 功能:
 *   1. 从WebDAV下载指定的数据项
 *   2. 验证JSON格式
 *   3. 检查字段完整性
 *   4. 验证加密数据格式
 *   5. 生成诊断报告
 */

const { createClient } = require('webdav');
const fs = require('fs');

// 配置
const config = {
  url: process.env.WEBDAV_URL || 'http://localhost:8080',
  username: process.env.WEBDAV_USER || 'test',
  password: process.env.WEBDAV_PASS || 'test123',
  basePath: '/mucheng-notes',
};

const client = createClient(config.url, {
  username: config.username,
  password: config.password,
});

// 必需字段
const REQUIRED_FIELDS = [
  'id',
  'type',
  'created_time',
  'updated_time',
  'deleted_time',
  'payload',
  'content_hash',
  'sync_status',
  'local_rev',
  'remote_rev',
  'encryption_applied',
  'schema_version',
];

// 字段类型
const FIELD_TYPES = {
  id: 'string',
  type: 'string',
  created_time: 'number',
  updated_time: 'number',
  deleted_time: ['number', 'null'],
  payload: 'string',
  content_hash: 'string',
  sync_status: 'string',
  local_rev: 'number',
  remote_rev: ['string', 'null'],
  encryption_applied: 'number',
  schema_version: 'number',
};

async function diagnoseItem(itemId) {
  console.log('🔍 Diagnosing item:', itemId);
  console.log('');

  const report = {
    itemId,
    timestamp: new Date().toISOString(),
    checks: [],
    errors: [],
    warnings: [],
  };

  try {
    // 1. 下载数据
    console.log('📥 Step 1: Downloading item from WebDAV...');
    const itemPath = `${config.basePath}/items/${itemId}.json`;
    
    const exists = await client.exists(itemPath);
    if (!exists) {
      report.errors.push(`Item file does not exist: ${itemPath}`);
      console.log('❌ Item not found on WebDAV server');
      return report;
    }
    
    const content = await client.getFileContents(itemPath, { format: 'text' });
    console.log(`✅ Downloaded ${content.length} bytes`);
    report.checks.push({ name: 'Download', status: 'PASS' });

    // 2. 验证JSON格式
    console.log('\n📄 Step 2: Validating JSON format...');
    let item;
    try {
      item = JSON.parse(content);
      console.log('✅ Valid JSON');
      report.checks.push({ name: 'JSON Format', status: 'PASS' });
    } catch (e) {
      report.errors.push(`Invalid JSON: ${e.message}`);
      console.log('❌ Invalid JSON:', e.message);
      report.checks.push({ name: 'JSON Format', status: 'FAIL', error: e.message });
      return report;
    }

    // 3. 检查必需字段
    console.log('\n🔑 Step 3: Checking required fields...');
    const missingFields = [];
    for (const field of REQUIRED_FIELDS) {
      if (!(field in item)) {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      report.errors.push(`Missing fields: ${missingFields.join(', ')}`);
      console.log('❌ Missing fields:', missingFields);
      report.checks.push({ name: 'Required Fields', status: 'FAIL', missing: missingFields });
    } else {
      console.log('✅ All required fields present');
      report.checks.push({ name: 'Required Fields', status: 'PASS' });
    }

    // 4. 检查字段类型
    console.log('\n🔢 Step 4: Checking field types...');
    const typeErrors = [];
    for (const [field, expectedType] of Object.entries(FIELD_TYPES)) {
      if (!(field in item)) continue;
      
      const actualType = item[field] === null ? 'null' : typeof item[field];
      const expected = Array.isArray(expectedType) ? expectedType : [expectedType];
      
      if (!expected.includes(actualType)) {
        typeErrors.push(`${field}: expected ${expected.join(' or ')}, got ${actualType}`);
      }
    }
    
    if (typeErrors.length > 0) {
      report.errors.push(`Type errors: ${typeErrors.join('; ')}`);
      console.log('❌ Type errors:', typeErrors);
      report.checks.push({ name: 'Field Types', status: 'FAIL', errors: typeErrors });
    } else {
      console.log('✅ All field types correct');
      report.checks.push({ name: 'Field Types', status: 'PASS' });
    }

    // 5. 检查字段命名规范 (snake_case)
    console.log('\n🐍 Step 5: Checking field naming convention...');
    const camelCaseFields = Object.keys(item).filter(key => /[A-Z]/.test(key));
    if (camelCaseFields.length > 0) {
      report.warnings.push(`Found camelCase fields (should be snake_case): ${camelCaseFields.join(', ')}`);
      console.log('⚠️  Warning: Found camelCase fields:', camelCaseFields);
      console.log('   Mobile app expects snake_case (e.g., created_time, not createdTime)');
      report.checks.push({ name: 'Naming Convention', status: 'WARN', camelCase: camelCaseFields });
    } else {
      console.log('✅ All fields use snake_case');
      report.checks.push({ name: 'Naming Convention', status: 'PASS' });
    }

    // 6. 检查加密数据格式
    if (item.encryption_applied === 1) {
      console.log('\n🔐 Step 6: Checking encrypted payload format...');
      try {
        const encryptedData = JSON.parse(item.payload);
        const requiredEncFields = ['ciphertext', 'iv', 'authTag'];
        const missingEncFields = requiredEncFields.filter(f => !(f in encryptedData));
        
        if (missingEncFields.length > 0) {
          report.errors.push(`Encrypted payload missing fields: ${missingEncFields.join(', ')}`);
          console.log('❌ Missing encrypted fields:', missingEncFields);
          report.checks.push({ name: 'Encryption Format', status: 'FAIL', missing: missingEncFields });
        } else {
          console.log('✅ Encrypted payload format valid');
          console.log(`   - ciphertext: ${encryptedData.ciphertext.length} chars`);
          console.log(`   - iv: ${encryptedData.iv.length} chars`);
          console.log(`   - authTag: ${encryptedData.authTag.length} chars`);
          report.checks.push({ name: 'Encryption Format', status: 'PASS' });
        }
      } catch (e) {
        report.errors.push(`Invalid encrypted payload JSON: ${e.message}`);
        console.log('❌ Encrypted payload is not valid JSON:', e.message);
        report.checks.push({ name: 'Encryption Format', status: 'FAIL', error: e.message });
      }
    } else {
      console.log('\n📝 Step 6: Item is not encrypted');
      report.checks.push({ name: 'Encryption Format', status: 'N/A' });
    }

    // 7. 生成摘要
    console.log('\n' + '='.repeat(60));
    console.log('📊 Diagnosis Summary');
    console.log('='.repeat(60));
    console.log(`Item ID: ${itemId}`);
    console.log(`Type: ${item.type}`);
    console.log(`Encryption: ${item.encryption_applied === 1 ? 'Yes' : 'No'}`);
    console.log(`Sync Status: ${item.sync_status}`);
    console.log('');
    console.log(`Errors: ${report.errors.length}`);
    console.log(`Warnings: ${report.warnings.length}`);
    console.log('');

    if (report.errors.length > 0) {
      console.log('❌ Errors:');
      report.errors.forEach(err => console.log(`   - ${err}`));
    }

    if (report.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      report.warnings.forEach(warn => console.log(`   - ${warn}`));
    }

    if (report.errors.length === 0 && report.warnings.length === 0) {
      console.log('✅ No issues found - item should sync correctly to mobile');
    }

    return report;

  } catch (error) {
    report.errors.push(`Unexpected error: ${error.message}`);
    console.error('\n❌ Unexpected error:', error.message);
    console.error(error.stack);
    return report;
  }
}

// 主函数
async function main() {
  const itemId = process.argv[2];
  
  if (!itemId) {
    console.error('Usage: node scripts/diagnose-sync-error.js <item-id>');
    console.error('');
    console.error('Example:');
    console.error('  node scripts/diagnose-sync-error.js 12345678-1234-1234-1234-123456789abc');
    process.exit(1);
  }

  const report = await diagnoseItem(itemId);
  
  // 保存报告
  const reportPath = `diagnosis-${itemId}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('');
  console.log(`📄 Full report saved to: ${reportPath}`);
  
  process.exit(report.errors.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { diagnoseItem };

