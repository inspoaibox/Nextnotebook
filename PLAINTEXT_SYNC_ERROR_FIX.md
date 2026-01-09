# 明文模式下同步解析错误修复指南

## 🔍 问题定位

在明文模式下，电脑端数据同步到WebDAV后，手机端拉取时提示"解析错误"。

根据代码分析，**最可能的原因**是：

### 1. **JSON字段默认值缺失** ⚠️⚠️⚠️

桌面端创建的密码库数据可能**没有包含所有字段**，而移动端的Kotlin数据类期望所有字段都存在（即使有默认值）。

**示例问题**:
```json
// 桌面端创建的数据（可能缺少某些字段）
{
  "name": "我的密码",
  "entry_type": "login",
  "username": "user",
  "password": "pass"
  // ❌ 缺少 totp_secrets, uris, custom_fields 等字段
}
```

```kotlin
// 移动端期望的数据
@Serializable
data class VaultEntryPayload(
    val name: String,
    @SerialName("entry_type") val entryType: VaultEntryType,
    val username: String = "",
    val password: String = "",
    @SerialName("totp_secrets") val totpSecrets: List<VaultTotp> = emptyList(),  // ← 需要这个字段
    val uris: List<VaultUri> = emptyList(),  // ← 需要这个字段
    // ...
)
```

### 2. **枚举类型序列化问题** ⚠️⚠️

`VaultEntryType`使用枚举，可能在某些情况下序列化/反序列化失败。

---

## 🛠️ 修复方案

### 方案1: 修改移动端JSON配置（推荐）

在移动端添加`coerceInputValues`配置，自动将缺失的字段填充为默认值：

```kotlin
// WebDAVAdapterImpl.kt
private val json = Json { 
    ignoreUnknownKeys = true
    encodeDefaults = true
    isLenient = true
    coerceInputValues = true  // ← 添加这一行
}
```

这样即使桌面端的JSON缺少某些字段，移动端也能正确解析。

### 方案2: 确保桌面端序列化所有字段

检查桌面端创建密码库数据时是否包含所有字段：

```typescript
// 确保所有字段都有值
const vaultPayload: VaultEntryPayload = {
  name: "我的密码",
  entry_type: "login",
  folder_id: null,
  favorite: false,
  notes: "",
  username: "user",
  password: "pass",
  totp_secrets: [],  // ← 必须包含
  uris: [],          // ← 必须包含
  card_holder_name: "",
  card_number: "",
  card_brand: "",
  card_exp_month: "",
  card_exp_year: "",
  card_cvv: "",
  identity_title: "",
  identity_first_name: "",
  identity_last_name: "",
  identity_email: "",
  identity_phone: "",
  identity_address: "",
  custom_fields: [],  // ← 必须包含
};
```

### 方案3: 添加更详细的错误日志

已经在代码中添加了详细的错误日志，现在可以通过以下命令查看具体错误：

```bash
# 清空日志
adb logcat -c

# 执行同步
# 在手机上点击同步按钮

# 查看详细日志
adb logcat | grep -E "WebDAV|SyncEngine|CryptoEngine"
```

**关键日志标记**:
- `❌ JSON Parse Error` - JSON格式错误
- `Content Preview` - 显示前500字符的JSON内容
- `Available fields` - 显示JSON中实际包含的字段

---

## 📋 诊断步骤

### 步骤1: 查看原始JSON数据

1. 访问WebDAV服务器
2. 下载失败的数据文件: `/mucheng-notes/items/{uuid}.json`
3. 检查JSON内容

**检查清单**:
- [ ] 所有字段名都是`snake_case`（如`entry_type`，不是`entryType`）
- [ ] `entry_type`的值是字符串（如`"login"`，不是`LOGIN`）
- [ ] 数组字段存在（如`totp_secrets: []`，不能缺失）
- [ ] 布尔字段存在（如`favorite: false`，不能缺失）

### 步骤2: 查看手机端日志

```bash
adb logcat -c
# 执行同步
adb logcat | grep "JSON preview"
```

查找类似这样的日志：
```
D/WebDAV: getItem: JSON preview: {"id":"xxx","type":"vault_entry","created_time":...
```

### 步骤3: 对比字段

将WebDAV上的JSON和日志中的JSON进行对比，找出差异。

---

## 🔧 快速修复

### 立即修复（无需重新编译）

如果问题是桌面端数据格式问题，可以手动修复WebDAV上的数据：

1. 下载问题文件
2. 添加缺失的字段：
```json
{
  "id": "...",
  "type": "vault_entry",
  "created_time": 1704537600000,
  "updated_time": 1704537600000,
  "deleted_time": null,
  "payload": "{\"name\":\"我的密码\",\"entry_type\":\"login\",\"folder_id\":null,\"favorite\":false,\"notes\":\"\",\"username\":\"user\",\"password\":\"pass\",\"totp_secrets\":[],\"uris\":[],\"card_holder_name\":\"\",\"card_number\":\"\",\"card_brand\":\"\",\"card_exp_month\":\"\",\"card_exp_year\":\"\",\"card_cvv\":\"\",\"identity_title\":\"\",\"identity_first_name\":\"\",\"identity_last_name\":\"\",\"identity_email\":\"\",\"identity_phone\":\"\",\"identity_address\":\"\",\"custom_fields\":[]}",
  "content_hash": "...",
  "sync_status": "clean",
  "local_rev": 1,
  "remote_rev": "1704537600000",
  "encryption_applied": 0,
  "schema_version": 1
}
```
3. 重新上传到WebDAV
4. 在手机端重新同步

### 代码修复（需要重新编译）

修改移动端代码，添加`coerceInputValues`：

```kotlin
// android/app/src/main/java/com/mucheng/notes/data/remote/WebDAVAdapterImpl.kt
private val json = Json { 
    ignoreUnknownKeys = true
    encodeDefaults = true
    isLenient = true
    coerceInputValues = true  // ← 添加这一行
}

// android/app/src/main/java/com/mucheng/notes/data/sync/SyncEngine.kt
private val json = Json { 
    ignoreUnknownKeys = true 
    encodeDefaults = true
    isLenient = true
    coerceInputValues = true  // ← 添加这一行
}
```

然后重新编译：
```bash
cd android
./gradlew assembleDebug
```

---

## ✅ 验证修复

1. 在桌面端创建一个新的密码库条目
2. 执行同步
3. 在手机端同步
4. 检查日志：
```bash
adb logcat | grep "Successfully parsed"
```

应该看到：
```
D/WebDAV: getItem: ✅ Successfully parsed item xxx, type=vault_entry
```

---

## 📞 仍然无法解决？

请提供以下信息：

1. **WebDAV上的原始JSON文件**（脱敏后）
2. **手机端完整日志**:
```bash
adb logcat -d > sync_error.log
```
3. **桌面端和移动端版本号**

