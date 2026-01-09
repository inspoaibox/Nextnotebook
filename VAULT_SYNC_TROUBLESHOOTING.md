# 密码库同步问题排查指南

## 🔍 问题描述

密码库(vault)的数据和文件夹没有同步到手机端。

---

## ✅ 检查清单

### 1. 检查同步模块配置

#### 桌面端检查：

打开设置 → 同步设置，确认：
- ✅ **密码库** 模块已勾选
- ✅ 同步已启用

#### 手机端检查：

打开设置 → 同步设置，确认：
- ✅ **密码库** 模块已勾选
- ✅ 同步已启用

---

### 2. 检查桌面端数据是否存在

#### 方法1: 通过UI检查

1. 打开桌面端应用
2. 点击左侧 "密码库" 图标
3. 确认是否有密码库条目和文件夹

#### 方法2: 通过数据库检查

打开桌面端数据库（`mucheng-notes.db`），执行SQL：

```sql
-- 检查密码库条目
SELECT id, type, created_time, updated_time, sync_status 
FROM items 
WHERE type = 'vault_entry' AND deleted_time IS NULL;

-- 检查密码库文件夹
SELECT id, type, created_time, updated_time, sync_status 
FROM items 
WHERE type = 'vault_folder' AND deleted_time IS NULL;
```

**预期结果**：
- 如果有数据，应该能看到记录
- `sync_status` 应该是 `'modified'` 或 `'clean'`

---

### 3. 检查WebDAV服务器上的数据

#### 访问WebDAV服务器

使用浏览器或WebDAV客户端访问：
```
http://your-webdav-server/mucheng-notes/items/
```

#### 检查文件

查找密码库相关的JSON文件：
```bash
# 下载一个文件，检查内容
# 文件名格式: {uuid}.json
```

打开文件，检查 `type` 字段：
```json
{
  "id": "xxx-xxx-xxx",
  "type": "vault_entry",  ← 应该是这个
  "payload": "{...}",
  ...
}
```

或者：
```json
{
  "id": "xxx-xxx-xxx",
  "type": "vault_folder",  ← 或者这个
  "payload": "{...}",
  ...
}
```

---

### 4. 检查变更日志

#### 访问变更日志目录

```
http://your-webdav-server/mucheng-notes/changes/
```

#### 检查最新的变更日志

打开最新的 `{timestamp}.json` 文件，检查是否有 vault 相关的变更：

```json
{
  "change_id": 1704537600000,
  "item_id": "xxx-xxx-xxx",
  "type": "vault_entry",  ← 检查这个字段
  "updated_time": 1704537600000,
  "deleted_time": null,
  "content_hash": "abc123"
}
```

---

### 5. 检查手机端同步日志

#### 查看Logcat日志

连接手机，运行：
```bash
adb logcat | grep -E "SyncEngine|WebDAV"
```

#### 关键日志：

**Pull阶段**：
```
SyncEngine: Starting pull, cursor=null, isFirstSync=true, enabledTypes=[...]
SyncEngine: Got 27 changes, hasMore=false
SyncEngine: Change available: itemId=xxx, type=vault_entry, inEnabled=true
```

**检查点**：
- `enabledTypes` 中是否包含 `vault_entry` 和 `vault_folder`
- `inEnabled=true` 表示该类型已启用同步
- `inEnabled=false` 表示该类型被过滤掉了 ❌

---

### 6. 检查加密问题

密码库数据**始终加密**，即使全局加密未启用。

#### 桌面端检查：

打开数据库，检查 `encryption_applied` 字段：

```sql
SELECT id, type, encryption_applied 
FROM items 
WHERE type IN ('vault_entry', 'vault_folder');
```

**预期结果**：
- `encryption_applied` 应该是 `1`（已加密）

#### 手机端检查：

查看日志，确认是否有解密失败：

```
SyncEngine: prepareForLocal: id=xxx, type=vault_entry, encryptionApplied=1
SyncEngine: prepareForLocal: hasMasterKey=true
SyncEngine: Item xxx is encrypted but no master key available  ← ❌ 解密失败
```

**解决方案**：
- 确保手机端已设置加密密钥
- 密钥必须与桌面端一致

---

## 🛠️ 常见问题和解决方案

### 问题1: 同步模块未启用

**症状**：
- 桌面端有数据
- WebDAV上有数据
- 手机端同步后没有数据

**原因**：
- 手机端的"密码库"同步模块未勾选

**解决方案**：
1. 打开手机端设置 → 同步设置
2. 勾选 "密码库" 模块
3. 重新同步

---

### 问题2: 加密密钥不匹配

**症状**：
- 同步日志显示 `decryptionFailed > 0`
- 日志中有 "Item xxx is encrypted but no master key available"

**原因**：
- 手机端未设置加密密钥
- 或密钥与桌面端不一致

**解决方案**：
1. 打开手机端设置 → 安全设置
2. 设置加密密钥（与桌面端一致）
3. 重新同步

---

### 问题3: 游标问题（已修复）

**症状**：
- 首次同步下载0项
- 但WebDAV上有数据

**原因**：
- 游标存储在WebDAV上，所有设备共享
- 桌面端同步后更新游标，手机端读取到最新游标，跳过所有数据

**解决方案**：
- ✅ 已通过代码修复（游标移至本地存储）
- 或临时方案：删除WebDAV上的 `sync-cursor.json`

---

## 📋 完整测试流程

### 步骤1: 桌面端创建测试数据

1. 打开桌面端
2. 进入密码库
3. 创建一个文件夹 "测试文件夹"
4. 创建一个登录条目 "测试账号"
   - 用户名: test@example.com
   - 密码: test123
5. 点击同步按钮

**预期结果**：
```
同步成功
上传: 2 项
下载: 0 项
```

### 步骤2: 检查WebDAV

访问 `http://your-webdav-server/mucheng-notes/items/`

**预期结果**：
- 应该能看到2个新的JSON文件
- 打开文件，确认 `type` 为 `vault_folder` 和 `vault_entry`

### 步骤3: 手机端同步

1. 打开手机端
2. 确认同步设置中"密码库"已勾选
3. 点击同步按钮

**预期结果**：
```
同步成功
上传: 0 项
下载: 2 项
```

### 步骤4: 验证数据

1. 打开手机端密码库
2. 应该能看到 "测试文件夹"
3. 应该能看到 "测试账号"
4. 点击查看详情，确认用户名和密码正确

---

## 🔧 调试命令

### 查看手机端数据库

```bash
adb shell
cd /data/data/com.mucheng.notes/databases
sqlite3 mucheng_notes.db

# 查询密码库数据
SELECT id, type, sync_status FROM items WHERE type IN ('vault_entry', 'vault_folder');
```

### 查看同步配置

```bash
adb shell
cd /data/data/com.mucheng.notes/shared_prefs
cat sync_prefs.xml
```

---

## 📞 需要提供的信息

如果问题仍然存在，请提供以下信息：

1. **桌面端数据库查询结果**：
   ```sql
   SELECT COUNT(*) FROM items WHERE type = 'vault_entry';
   SELECT COUNT(*) FROM items WHERE type = 'vault_folder';
   ```

2. **手机端同步日志**（关键部分）：
   ```
   SyncEngine: Starting pull, cursor=..., enabledTypes=[...]
   SyncEngine: Got X changes, hasMore=...
   SyncEngine: Pull completed: count=X, conflicts=X, decryptionFailed=X
   ```

3. **同步模块配置**：
   - 桌面端：设置 → 同步设置 → 截图
   - 手机端：设置 → 同步设置 → 截图

4. **WebDAV服务器检查**：
   - `/mucheng-notes/items/` 目录下有多少个文件？
   - 随机打开一个文件，`type` 字段是什么？

