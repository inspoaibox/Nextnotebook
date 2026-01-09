# 同步机制迁移指南

## 📋 概述

本文档说明了从旧版本同步机制迁移到新版本统一同步机制的步骤和注意事项。

### 变更摘要

| 项目 | 旧版本 | 新版本 | 影响 |
|------|--------|--------|------|
| **移动端变更追踪** | 扫描 items 目录 + 文件修改时间 | 读取 changes 目录 + 变更日志 | ✅ 与桌面端统一 |
| **游标格式** | 时间戳字符串 | 变更文件名 | ✅ 跨平台兼容 |
| **RemoteChange 结构** | 包含 item 对象 | 仅包含元数据 | ✅ 减少数据传输 |
| **向后兼容** | 不支持 | 自动回退到旧模式 | ✅ 平滑升级 |

---

## 🔄 迁移步骤

### 对于用户

**无需手动操作**，应用会自动处理迁移：

1. **首次同步**：
   - 如果 WebDAV 服务器上没有 `changes` 目录，移动端会自动回退到扫描 `items` 目录
   - 同步完成后，后续操作会自动创建变更日志

2. **后续同步**：
   - 自动使用新的变更日志机制
   - 游标格式自动转换

### 对于开发者

#### 1. 更新代码

**移动端 (Android)**:
```bash
# 拉取最新代码
git pull origin main

# 重新构建
./gradlew clean assembleDebug
```

**桌面端 (Electron)**:
```bash
# 拉取最新代码
git pull origin main

# 重新安装依赖
npm install

# 重新构建
npm run build
```

#### 2. 测试迁移

运行自动化测试：
```bash
# 安装测试依赖
npm install webdav

# 运行测试
node scripts/test-sync-mechanism.js
```

#### 3. 验证数据完整性

检查 WebDAV 服务器目录结构：
```
/mucheng-notes/
├── workspace.json          ✅ 必须存在
├── sync-cursor.json        ✅ 必须存在
├── items/                  ✅ 数据文件
│   ├── {uuid}.json
│   └── ...
├── changes/                ✅ 变更日志 (新增)
│   ├── {timestamp}.json
│   └── ...
├── resources/              ✅ 附件资源
└── locks/                  ✅ 同步锁
```

---

## 🔧 技术细节

### 新的 RemoteChange 结构

**桌面端 (TypeScript)**:
```typescript
interface RemoteChange {
  change_id: number;        // 变更ID = 时间戳
  item_id: string;          // 数据项ID
  type: ItemType;           // 数据类型
  updated_time: number;     // 更新时间
  deleted_time: number | null; // 删除时间
  content_hash: string;     // 内容哈希
}
```

**移动端 (Kotlin)**:
```kotlin
@Serializable
data class RemoteChange(
    @SerialName("change_id")
    val changeId: Long,
    
    @SerialName("item_id")
    val itemId: String,
    
    val type: String,
    
    @SerialName("updated_time")
    val updatedTime: Long,
    
    @SerialName("deleted_time")
    val deletedTime: Long?,
    
    @SerialName("content_hash")
    val contentHash: String
)
```

### 游标格式

**新格式**:
```json
{
  "cursor": "1704537600000.json",
  "timestamp": 1704537600000
}
```

- `cursor`: 最后处理的变更文件名
- `timestamp`: 游标更新时间

### 同步流程

#### 桌面端 Push
```typescript
1. 查询 sync_status = 'modified' 的数据
2. 上传到 /items/{id}.json
3. 创建变更日志 /changes/{timestamp}.json  ← 关键
4. 更新 sync_status = 'clean'
```

#### 移动端 Push
```kotlin
1. 查询 syncStatus = "modified" 的数据
2. 上传到 /items/{id}.json
3. 创建变更日志 /changes/{timestamp}.json  ← 新增
4. 更新 syncStatus = "clean"
```

#### 移动端 Pull (新逻辑)
```kotlin
1. 读取游标 /sync-cursor.json
2. 尝试读取 /changes 目录
   - 成功: 使用变更日志模式
   - 失败: 回退到扫描 items 目录 (向后兼容)
3. 处理变更:
   - 从 /items/{id}.json 获取完整数据
   - 检查冲突
   - 写入本地数据库
4. 更新游标
```

---

## ⚠️ 注意事项

### 1. 数据备份

**迁移前务必备份数据**：
- 导出所有笔记
- 备份 WebDAV 服务器数据
- 备份本地数据库

### 2. 同步顺序

建议迁移顺序：
1. 先更新桌面端
2. 桌面端执行一次完整同步
3. 再更新移动端
4. 移动端执行同步

### 3. 冲突处理

迁移期间可能出现冲突：
- 系统会自动创建冲突副本
- 手动检查并合并冲突内容
- 删除不需要的冲突副本

### 4. 性能影响

- **首次迁移**: 可能需要较长时间（需要扫描所有 items）
- **后续同步**: 性能显著提升（仅读取变更日志）

---

## 🐛 故障排查

### 问题1: 移动端无法同步

**症状**: 移动端同步后没有拉取到桌面端的数据

**排查步骤**:
1. 检查 WebDAV 连接
   ```kotlin
   // 查看日志
   adb logcat | grep WebDAV
   ```

2. 检查 changes 目录
   - 访问 `{webdav_url}/mucheng-notes/changes/`
   - 确认有变更日志文件

3. 检查游标格式
   - 访问 `{webdav_url}/mucheng-notes/sync-cursor.json`
   - 确认格式为 `{"cursor": "xxx.json", "timestamp": 123}`

**解决方案**:
- 清空游标: 删除 `sync-cursor.json`
- 重新同步

### 问题2: 数据重复

**症状**: 同一笔记出现多次

**原因**: 游标未正确更新

**解决方案**:
```kotlin
// 清空本地数据库
itemDao.deleteAll()

// 删除远端游标
webDAVAdapter.setSyncCursor(SyncCursor("", 0))

// 重新同步
syncEngine.sync()
```

### 问题3: 变更日志过多

**症状**: `/changes` 目录文件过多，影响性能

**解决方案**:
桌面端会自动清理 7 天前的变更日志：
```typescript
// 手动触发清理
const beforeTimestamp = Date.now() - 7 * 24 * 60 * 60 * 1000;
await adapter.cleanupChangeLogs(beforeTimestamp);
```

---

## 📊 迁移验证清单

- [ ] 桌面端和移动端都已更新到最新版本
- [ ] WebDAV 服务器上存在 `changes` 目录
- [ ] 游标格式正确 (`{cursor: "xxx.json", timestamp: number}`)
- [ ] 变更日志格式正确 (包含 `change_id`, `item_id` 等字段)
- [ ] 桌面端 → 移动端同步正常
- [ ] 移动端 → 桌面端同步正常
- [ ] 冲突检测和处理正常
- [ ] 数据完整性验证通过
- [ ] 性能测试通过

---

## 📞 支持

如遇到问题，请：
1. 查看日志文件
2. 运行测试脚本 `node scripts/test-sync-mechanism.js`
3. 提交 Issue 并附上日志

---

## 📚 相关文档

- [同步机制测试指南](./SYNC_MECHANISM_TEST.md)
- [开发指南](./DEVELOPMENT_GUIDE.md)
- [API 文档](./API_DOCUMENTATION.md)

