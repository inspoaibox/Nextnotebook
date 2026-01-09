# 手机端同步解析错误排查指南

## 📋 问题描述

**症状**: 电脑端数据同步到WebDAV后，手机端拉取时提示"解析错误"

**常见场景**: 
- 密码库数据同步失败
- 文件夹数据无法解析
- 部分笔记可以同步，部分失败

---

## 🔍 根本原因分析

根据代码分析，解析错误可能由以下几个原因导致：

### 1. **加密密钥不匹配** ⚠️⚠️⚠️ (最常见)

**原因**: 
- 桌面端和移动端使用了不同的加密密钥
- 密钥派生过程不一致

**症状**:
- 日志显示 `AEADBadTagException` 或 `Authentication failed`
- 错误信息: "Decryption failed: wrong encryption key"

**验证方法**:
```bash
# 查看移动端日志
adb logcat | grep -E "CryptoEngine|SyncEngine"

# 关键日志:
# ❌ Authentication failed - wrong encryption key or corrupted data
```

**解决方案**: 见下文 "修复方案 1"

---

### 2. **JSON字段格式不兼容** ⚠️⚠️

**原因**:
- 桌面端序列化时使用了不同的字段名
- 缺少必需字段或字段类型不匹配

**症状**:
- 日志显示 `SerializationException`
- 错误信息: "Field 'xxx' is required but missing"

**验证方法**:
```bash
# 查看详细的JSON内容
adb logcat | grep "JSON preview"

# 检查字段名是否为 snake_case:
# ✅ 正确: "created_time", "updated_time", "content_hash"
# ❌ 错误: "createdTime", "updatedTime", "contentHash"
```

**解决方案**: 见下文 "修复方案 2"

---

### 3. **Payload内容格式问题** ⚠️

**原因**:
- Payload包含特殊字符或非法JSON
- 嵌套JSON未正确转义

**症状**:
- 日志显示 `JsonDecodingException`
- 错误信息: "Unexpected JSON token"

**验证方法**:
```bash
# 查看payload内容
adb logcat | grep "payload preview"
```

**解决方案**: 见下文 "修复方案 3"

---

## 🛠️ 修复方案

### 修复方案 1: 统一加密密钥

#### 步骤1: 导出桌面端密钥

在桌面端应用中:
1. 打开 **设置 → 同步设置**
2. 点击 **导出加密密钥**
3. 保存为 `sync-key.json`

#### 步骤2: 在移动端导入密钥

方法A - 通过文件导入 (推荐):
1. 将 `sync-key.json` 传输到手机
2. 在移动端应用中: **设置 → 同步设置 → 导入密钥**
3. 选择文件并导入

方法B - 手动输入密钥:
1. 打开 `sync-key.json`，复制 `key` 字段的值
2. 在移动端应用中: **设置 → 同步设置 → 高级 → 手动设置密钥**
3. 粘贴密钥值

#### 步骤3: 验证密钥

```bash
# 查看日志确认密钥已设置
adb logcat | grep "hasMasterKey"

# 应该看到:
# prepareForLocal: hasMasterKey=true
```

#### 步骤4: 重新同步

1. 清空本地数据 (可选，如果之前有损坏数据)
2. 执行同步
3. 检查日志:
```bash
adb logcat | grep "Successfully decrypted"

# 应该看到:
# ✅ Successfully decrypted item xxx, type=vault_entry
```

---

### 修复方案 2: 修复JSON格式不兼容

#### 检查桌面端序列化配置

确保桌面端使用 snake_case:

```typescript
// src/core/sync/WebDAVAdapter.ts
async putItem(item: ItemBase): Promise<...> {
  const content = JSON.stringify(item, null, 2);  // ✅ 直接序列化，保持字段名
  // ...
}
```

#### 检查移动端反序列化配置

确保移动端使用 `@SerialName` 注解:

```kotlin
// ItemEntity.kt
@Serializable
data class ItemEntity(
    @SerialName("created_time")  // ✅ 映射到 snake_case
    val createdTime: Long,
    // ...
)
```

#### 验证WebDAV上的数据格式

1. 访问 WebDAV 服务器
2. 下载 `/mucheng-notes/items/{uuid}.json`
3. 检查字段名:

```json
{
  "id": "xxx",
  "type": "vault_entry",
  "created_time": 1704537600000,  ← 必须是 snake_case
  "updated_time": 1704537600000,
  "deleted_time": null,
  "payload": "...",
  "content_hash": "...",
  "sync_status": "clean",
  "local_rev": 1,
  "remote_rev": "1704537600000",
  "encryption_applied": 1,
  "schema_version": 1
}
```

---

### 修复方案 3: 修复Payload格式问题

#### 检查密码库Payload结构

密码库的payload应该是**双重JSON编码**:

```json
{
  "payload": "{\"title\":\"我的密码\",\"username\":\"user\",\"password\":\"pass\",\"url\":\"https://example.com\",\"notes\":\"备注\"}"
}
```

注意:
- `payload` 字段的值是一个 **JSON字符串**
- 内部的引号需要转义: `\"`

#### 验证payload编码

桌面端:
```typescript
// 正确的编码方式
const payload = JSON.stringify({
  title: "我的密码",
  username: "user",
  // ...
});

const item: ItemBase = {
  // ...
  payload: payload,  // 已经是字符串
};
```

移动端:
```kotlin
// 正确的解码方式
val item = json.decodeFromString<ItemEntity>(content)
val vaultPayload = json.decodeFromString<VaultEntryPayload>(item.payload)
```

---

## 📊 诊断工具

### 1. 查看完整同步日志

```bash
# 清空日志缓冲区
adb logcat -c

# 开始同步并实时查看日志
adb logcat | grep -E "WebDAV|SyncEngine|CryptoEngine"
```

### 2. 关键日志标记

| 日志标记 | 含义 | 状态 |
|---------|------|------|
| `✅ Successfully parsed item` | JSON解析成功 | 正常 |
| `✅ Successfully decrypted item` | 解密成功 | 正常 |
| `❌ JSON Parse Error` | JSON格式错误 | 异常 |
| `❌ Authentication failed` | 密钥不匹配 | 异常 |
| `❌ Failed to decrypt item` | 解密失败 | 异常 |

### 3. 导出诊断报告

```bash
# 导出完整日志到文件
adb logcat -d > sync_debug.log

# 搜索错误
grep "❌" sync_debug.log
```

---

## ✅ 验证修复

### 1. 测试单个数据项

1. 在桌面端创建一个简单的密码库条目
2. 执行同步
3. 在移动端同步
4. 检查是否成功显示

### 2. 测试批量同步

1. 在桌面端创建多个不同类型的数据
2. 执行同步
3. 在移动端同步
4. 验证所有数据都正确同步

### 3. 测试加密数据

1. 确保加密已启用
2. 创建敏感数据 (密码库、锁定笔记)
3. 同步后在移动端验证可以正确解密

---

## 🚨 常见错误及解决

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `Master key not set` | 未设置加密密钥 | 导入密钥 |
| `wrong encryption key` | 密钥不匹配 | 重新导入正确的密钥 |
| `Field 'xxx' is required` | JSON字段缺失 | 检查桌面端序列化 |
| `Invalid Base64` | 加密数据损坏 | 重新从桌面端同步 |
| `Unexpected JSON token` | Payload格式错误 | 检查payload编码 |

---

## 📞 获取帮助

如果以上方案都无法解决问题:

1. 导出诊断日志: `adb logcat -d > sync_error.log`
2. 下载一个失败的数据文件 (从WebDAV)
3. 提交Issue并附上:
   - 错误日志
   - 数据文件 (脱敏后)
   - 桌面端和移动端版本号

