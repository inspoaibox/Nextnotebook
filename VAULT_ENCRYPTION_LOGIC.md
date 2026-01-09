# 密码库数据"始终加密"逻辑详解

## 📌 核心概念

**密码库数据始终加密**，即使用户未启用全局加密，密码库（vault）相关数据也会被加密后再上传到WebDAV服务器。

---

## 🔐 敏感数据类型定义

### 桌面端（TypeScript）

**文件**：`src/core/sync/SyncEngine.ts`

```typescript
// 敏感数据类型 - 这些类型始终需要加密同步（包含密码、API Key 等敏感信息）
const SENSITIVE_TYPES = ['vault_entry', 'vault_folder', 'ai_config'];
```

### 手机端（Kotlin）

**文件**：`android/app/src/main/java/com/mucheng/notes/domain/model/ItemType.kt`

```kotlin
enum class ItemType(val value: String) {
    NOTE("note"),
    FOLDER("folder"),
    TAG("tag"),
    RESOURCE("resource"),
    TODO("todo"),
    VAULT_ENTRY("vault_entry"),
    VAULT_FOLDER("vault_folder"),
    BOOKMARK("bookmark"),
    BOOKMARK_FOLDER("bookmark_folder"),
    DIAGRAM("diagram"),
    AI_CONFIG("ai_config"),
    AI_CONVERSATION("ai_conversation"),
    AI_MESSAGE("ai_message");

    companion object {
        /**
         * 敏感数据类型 - 这些类型始终需要加密同步
         */
        val SENSITIVE_TYPES = setOf(VAULT_ENTRY, VAULT_FOLDER, AI_CONFIG)
    }
}
```

**敏感类型包括**：
1. ✅ `vault_entry` - 密码库条目（登录凭据、银行卡、身份信息等）
2. ✅ `vault_folder` - 密码库文件夹
3. ✅ `ai_config` - AI配置（包含API Key等敏感信息）

---

## 🔄 加密逻辑实现

### 桌面端加密逻辑

**文件**：`src/core/sync/SyncEngine.ts`

```typescript
// Push阶段：准备上传数据
for (const item of pendingItems) {
  try {
    // 判断是否需要加密
    const isSensitive = SENSITIVE_TYPES.includes(item.type);
    const shouldEncrypt = (this.options.encryptionEnabled || isSensitive) && this.cryptoEngine;
    
    let itemToUpload = item;
    if (shouldEncrypt) {
      itemToUpload = {
        ...item,
        payload: this.cryptoEngine!.encryptPayload(item.payload),
        encryption_applied: 1,
      };
    }
    
    // 上传到WebDAV
    await this.adapter.putItem(itemToUpload);
  }
}
```

**逻辑解析**：
```typescript
const isSensitive = SENSITIVE_TYPES.includes(item.type);
// 如果是 vault_entry、vault_folder、ai_config，isSensitive = true

const shouldEncrypt = (this.options.encryptionEnabled || isSensitive) && this.cryptoEngine;
// 加密条件：(全局加密开启 OR 是敏感类型) AND 有加密引擎
```

**真值表**：

| 数据类型 | 全局加密 | isSensitive | shouldEncrypt | 结果 |
|---------|---------|-------------|---------------|------|
| vault_entry | ❌ 关闭 | ✅ true | ✅ true | **加密** |
| vault_entry | ✅ 开启 | ✅ true | ✅ true | **加密** |
| note | ❌ 关闭 | ❌ false | ❌ false | 明文 |
| note | ✅ 开启 | ❌ false | ✅ true | **加密** |

---

### 手机端加密逻辑

**文件**：`android/app/src/main/java/com/mucheng/notes/data/sync/SyncEngine.kt`

```kotlin
/**
 * 准备上传的项目（加密处理）
 */
private fun prepareForUpload(item: ItemEntity, cfg: SyncConfig): ItemEntity {
    val isSensitive = ItemType.SENSITIVE_TYPES.any { it.value == item.type }
    val shouldEncrypt = (cfg.encryptionEnabled || isSensitive) && cryptoEngine.hasMasterKey()
    
    return if (shouldEncrypt) {
        item.copy(
            payload = cryptoEngine.encryptPayload(item.payload),
            encryptionApplied = 1
        )
    } else {
        item.copy(encryptionApplied = 0)
    }
}
```

**逻辑解析**：
```kotlin
val isSensitive = ItemType.SENSITIVE_TYPES.any { it.value == item.type }
// 检查 item.type 是否在 SENSITIVE_TYPES 集合中

val shouldEncrypt = (cfg.encryptionEnabled || isSensitive) && cryptoEngine.hasMasterKey()
// 加密条件：(全局加密开启 OR 是敏感类型) AND 有主密钥
```

**与桌面端完全一致** ✅

---

## 🔑 加密密钥管理

### 桌面端密钥管理

**文件**：`src/main/services/SyncService.ts`

```typescript
// 创建加密引擎
// 注意：即使用户不开启全局加密，也需要创建加密引擎用于敏感数据（密码库）
cryptoEngine = new CryptoEngine();
const fixedSalt = Buffer.from('mucheng-sync-salt-2024-fixed-key', 'utf8');

if (config.encryptionKey) {
  // 使用用户提供的密钥
  const { key } = cryptoEngine.deriveKeyFromPassword(config.encryptionKey, fixedSalt);
  cryptoEngine.setMasterKey(key);
} else {
  // 使用默认密钥（仅用于密码库等敏感数据的基本保护）
  // 注意：这不如用户自定义密钥安全，但比明文好
  const { key } = cryptoEngine.deriveKeyFromPassword('mucheng-default-vault-key-2024', fixedSalt);
  cryptoEngine.setMasterKey(key);
}
```

**密钥策略**：
1. **用户设置了加密密钥**：使用用户密钥（强安全性）
2. **用户未设置加密密钥**：使用默认密钥（基本保护）

**重要**：即使用户未开启全局加密，加密引擎也会被创建，用于加密敏感数据。

---

### 手机端密钥管理

**文件**：`android/app/src/main/java/com/mucheng/notes/data/sync/SyncEngine.kt`

```kotlin
// 在初始化时设置主密钥
private val cryptoEngine: CryptoEngine

init {
    // 从配置中获取加密密钥
    val encryptionKey = getEncryptionKeyFromConfig()
    if (encryptionKey != null) {
        cryptoEngine.setMasterKey(encryptionKey)
    } else {
        // 使用默认密钥
        cryptoEngine.setDefaultMasterKey()
    }
}
```

**与桌面端一致** ✅

---

## 🔍 解密逻辑

### 桌面端解密

**文件**：`src/core/sync/SyncEngine.ts`

```typescript
// Pull阶段：处理下载的数据
for (const change of changes) {
  const remoteItem = await this.adapter.getItem(change.item_id);
  
  if (remoteItem.encryption_applied === 1) {
    // 解密
    remoteItem.payload = this.cryptoEngine!.decryptPayload(remoteItem.payload);
    remoteItem.encryption_applied = 0;
  }
  
  // 保存到本地数据库
  this.itemsManager.createWithId(remoteItem);
}
```

### 手机端解密

**文件**：`android/app/src/main/java/com/mucheng/notes/data/sync/SyncEngine.kt`

```kotlin
/**
 * 准备本地存储的项目（解密处理）
 */
private fun prepareForLocal(item: ItemEntity, cfg: SyncConfig): ItemEntity? {
    if (item.encryptionApplied == 1) {
        if (!cryptoEngine.hasMasterKey()) {
            android.util.Log.e("SyncEngine", "Item ${item.id} is encrypted but no master key available")
            return null  // 无法解密，跳过此项
        }
        
        return try {
            val decryptedPayload = cryptoEngine.decryptPayload(item.payload)
            item.copy(
                payload = decryptedPayload,
                encryptionApplied = 0
            )
        } catch (e: Exception) {
            android.util.Log.e("SyncEngine", "Failed to decrypt item ${item.id}: ${e.message}")
            null  // 解密失败，跳过此项
        }
    } else {
        return item  // 未加密，直接使用
    }
}
```

**与桌面端一致** ✅

---

## ⚠️ 重要注意事项

### 1. 密钥一致性要求

**问题**：如果桌面端和手机端使用不同的加密密钥，会导致解密失败。

**场景**：
- 桌面端使用密钥 `key-A` 加密密码库数据
- 手机端使用密钥 `key-B` 尝试解密
- 结果：解密失败，数据无法同步 ❌

**解决方案**：
- ✅ 确保两端使用相同的加密密钥
- ✅ 在设置中手动输入相同的密钥
- ✅ 或者两端都不设置密钥（使用默认密钥）

---

### 2. 默认密钥的安全性

**默认密钥**：`mucheng-default-vault-key-2024`

**安全性分析**：
- ✅ 比明文传输安全
- ⚠️ 但不如用户自定义密钥安全
- ❌ 如果攻击者知道默认密钥，可以解密数据

**建议**：
- 🔒 强烈建议用户设置自定义加密密钥
- 🔒 密钥应该足够复杂（至少16位，包含大小写字母、数字、符号）

---

### 3. 加密字段

**被加密的字段**：
- ✅ `payload` - 业务数据（JSON字符串）

**不被加密的字段**：
- ❌ `id` - UUID
- ❌ `type` - 数据类型
- ❌ `created_time` - 创建时间
- ❌ `updated_time` - 更新时间
- ❌ `deleted_time` - 删除时间
- ❌ `content_hash` - 内容哈希
- ❌ `sync_status` - 同步状态
- ❌ `local_rev` - 本地版本号
- ❌ `remote_rev` - 远端版本号
- ❌ `schema_version` - Schema版本

**原因**：
- 这些字段用于同步逻辑，需要明文才能正确处理
- 敏感信息都在 `payload` 中

---

## 📊 完整流程示例

### 场景：桌面端创建密码库条目并同步

#### 1. 创建条目

```typescript
// 用户在桌面端创建一个登录凭据
const payload = {
  name: "GitHub",
  entry_type: "login",
  username: "user@example.com",
  password: "super-secret-password",
  uris: [{ uri: "https://github.com", ... }]
};

// 保存到本地数据库
const item = itemsManager.create('vault_entry', payload);
// item.encryption_applied = 0 (本地存储不加密)
// item.sync_status = 'modified'
```

#### 2. 同步到WebDAV

```typescript
// Push阶段
const isSensitive = SENSITIVE_TYPES.includes('vault_entry');  // true
const shouldEncrypt = (false || true) && cryptoEngine;  // true

// 加密 payload
const encryptedPayload = cryptoEngine.encryptPayload(JSON.stringify(payload));
// encryptedPayload = '{"ciphertext":"...","iv":"...","authTag":"..."}'

const itemToUpload = {
  ...item,
  payload: encryptedPayload,
  encryption_applied: 1
};

// 上传到 WebDAV
await adapter.putItem(itemToUpload);
```

#### 3. 手机端同步

```kotlin
// Pull阶段
val remoteItem = webDAVAdapter.getItem(itemId)
// remoteItem.encryptionApplied = 1
// remoteItem.payload = '{"ciphertext":"...","iv":"...","authTag":"..."}'

// 解密
val decryptedItem = prepareForLocal(remoteItem, cfg)
// decryptedItem.payload = '{"name":"GitHub","entry_type":"login",...}'
// decryptedItem.encryptionApplied = 0

// 保存到本地数据库
itemDao.upsert(decryptedItem)
```

---

## ✅ 总结

1. **密码库数据始终加密** = `(encryptionEnabled || isSensitive) && hasMasterKey()`
2. **敏感类型**：`vault_entry`, `vault_folder`, `ai_config`
3. **桌面端和手机端逻辑完全一致** ✅
4. **密钥必须一致**，否则无法解密 ⚠️
5. **默认密钥提供基本保护**，但建议用户自定义密钥 🔒

