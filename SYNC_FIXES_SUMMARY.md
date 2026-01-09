# 同步问题修复总结

## 📋 修复内容

### 1. ✅ 游标存储位置修复（核心问题）

#### 问题描述
- **错误设计**：游标存储在WebDAV服务器上（`/mucheng-notes/sync-cursor.json`）
- **导致问题**：所有设备共享同一个游标
  - 桌面端同步后更新游标到最新位置
  - 手机端首次同步读取到桌面端的游标
  - 手机端认为"已经同步到最新"，跳过所有数据
  - 结果：下载0项 ❌

#### 修复方案
- **正确设计**：每个设备独立维护自己的本地游标

**桌面端**：
- 游标存储在本地数据库 `sync_meta` 表中
- 文件：`src/core/database/ItemsManager.ts`
  - 新增：`getLocalSyncCursor()`
  - 新增：`setLocalSyncCursor()`
  - 新增：`clearLocalSyncCursor()`

- 文件：`src/core/sync/SyncEngine.ts`
  - 修改：`pullChanges()` 使用 `itemsManager.getLocalSyncCursor()`
  - 修改：更新游标时使用 `itemsManager.setLocalSyncCursor()`

- 文件：`src/core/sync/WebDAVAdapter.ts`
  - 修改：`getSyncCursor()` 和 `setSyncCursor()` 标记为废弃

**手机端**：
- 游标存储在 SharedPreferences 中
- 文件：`android/app/src/main/java/com/mucheng/notes/data/sync/SyncEngine.kt`
  - 新增：`getLocalSyncCursor()`
  - 新增：`setLocalSyncCursor()`
  - 新增：`clearLocalSyncCursor()`
  - 修改：`pullChanges()` 使用本地游标
  - 修改：注入 `@ApplicationContext Context`

- 文件：`android/app/src/main/java/com/mucheng/notes/data/remote/WebDAVAdapterImpl.kt`
  - 修改：`getSyncCursor()` 和 `setSyncCursor()` 标记为废弃

---

## 🎯 修复效果

### 修复前
```
场景：桌面端先同步，手机端后同步

1. 桌面端同步：
   - 上传27项数据
   - 更新 WebDAV:/sync-cursor.json → "1704537600000.json"

2. 手机端首次同步：
   - 读取 WebDAV:/sync-cursor.json → "1704537600000.json"
   - 查询游标之后的变更 → 没有新变更
   - 结果：下载0项 ❌
```

### 修复后
```
场景：桌面端先同步，手机端后同步

1. 桌面端同步：
   - 上传27项数据
   - 更新本地游标（保存到 sync_meta 表）→ "1704537600000.json"
   - ✅ WebDAV上没有 sync-cursor.json

2. 手机端首次同步：
   - 读取本地游标（从 SharedPreferences）→ null（首次同步）
   - 使用 null 游标查询所有变更
   - 结果：下载27项 ✅
   - 更新本地游标（保存到 SharedPreferences）→ "1704537600000.json"

3. 后续增量同步：
   - 桌面端修改数据 → 创建新变更 "1704537700000.json"
   - 手机端同步：
     - 读取本地游标 → "1704537600000.json"
     - 查询游标之后的变更 → 找到 "1704537700000.json"
     - 结果：下载1项 ✅
```

---

## 📁 修改的文件列表

### 桌面端（TypeScript）
1. `src/core/database/ItemsManager.ts` - 新增本地游标管理方法
2. `src/core/sync/SyncEngine.ts` - 使用本地游标
3. `src/core/sync/WebDAVAdapter.ts` - 废弃WebDAV游标方法

### 手机端（Kotlin）
1. `android/app/src/main/java/com/mucheng/notes/data/sync/SyncEngine.kt` - 新增本地游标管理
2. `android/app/src/main/java/com/mucheng/notes/data/remote/WebDAVAdapterImpl.kt` - 废弃WebDAV游标方法

---

## 🧪 测试步骤

### 测试1: 桌面端先同步

1. **桌面端**：
   - 创建一些笔记
   - 点击同步
   - 预期：上传N项，下载0项

2. **手机端**（首次同步）：
   - 点击同步
   - 预期：上传0项，下载N项 ✅
   - 验证：能看到所有笔记

### 测试2: 手机端先同步

1. **手机端**：
   - 创建一些密码库条目
   - 点击同步
   - 预期：上传N项，下载0项

2. **桌面端**（首次同步）：
   - 点击同步
   - 预期：上传0项，下载N项 ✅
   - 验证：能看到所有密码库条目

### 测试3: 双向增量同步

1. **桌面端**：
   - 修改一个笔记
   - 同步
   - 预期：上传1项

2. **手机端**：
   - 同步
   - 预期：下载1项 ✅
   - 验证：笔记内容已更新

3. **手机端**：
   - 修改一个密码库条目
   - 同步
   - 预期：上传1项

4. **桌面端**：
   - 同步
   - 预期：下载1项 ✅
   - 验证：密码库条目已更新

---

## 🔧 密码库同步问题排查

如果密码库数据仍然没有同步，请按照以下步骤排查：

### 1. 检查同步模块配置

**桌面端**：
- 设置 → 同步设置 → 确认"密码库"已勾选 ✅

**手机端**：
- 设置 → 同步设置 → 确认"密码库"已勾选 ✅

### 2. 检查加密密钥

密码库数据**始终加密**，即使全局加密未启用。

**手机端**：
- 设置 → 安全设置 → 设置加密密钥
- **密钥必须与桌面端一致**

### 3. 查看同步日志

**手机端**（通过adb）：
```bash
adb logcat | grep -E "SyncEngine|WebDAV"
```

**关键日志**：
```
SyncEngine: Starting pull, cursor=null, enabledTypes=[..., vault_entry, vault_folder, ...]
SyncEngine: Got 27 changes, hasMore=false
SyncEngine: Change available: itemId=xxx, type=vault_entry, inEnabled=true
SyncEngine: Pull completed: count=27, conflicts=0, decryptionFailed=0
```

**检查点**：
- `enabledTypes` 中是否包含 `vault_entry` 和 `vault_folder`
- `inEnabled=true` 表示该类型已启用同步
- `decryptionFailed=0` 表示没有解密失败

### 4. 详细排查指南

请参考：`VAULT_SYNC_TROUBLESHOOTING.md`

---

## 📚 相关文档

1. `CURSOR_STORAGE_ISSUE_AND_FIX.md` - 游标存储问题详细分析
2. `BIDIRECTIONAL_SYNC_VERIFICATION.md` - 双向同步机制验证
3. `VAULT_SYNC_TROUBLESHOOTING.md` - 密码库同步问题排查
4. `SYNC_MIGRATION_GUIDE.md` - 同步机制迁移指南

---

## ✅ 验证清单

- [x] 游标移至本地存储（桌面端）
- [x] 游标移至本地存储（手机端）
- [x] WebDAVAdapter 废弃游标方法
- [x] 首次同步逻辑修复
- [x] 增量同步逻辑保持不变
- [x] 密码库同步问题排查文档

---

## 🚀 下一步

1. **编译并测试**：
   ```bash
   # 桌面端
   npm run build
   
   # 手机端
   cd android
   ./gradlew assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

2. **清除旧游标**（可选）：
   - 删除WebDAV上的 `sync-cursor.json`（如果存在）
   - 这样可以确保使用新的本地游标机制

3. **测试同步**：
   - 按照上面的测试步骤验证
   - 检查密码库数据是否正常同步

4. **查看日志**：
   - 如果有问题，查看同步日志
   - 参考排查文档进行诊断

