# Design Document: 暮城笔记 Android 客户端

## Overview

暮城笔记 Android 客户端采用 Kotlin + Jetpack Compose 技术栈，遵循 Clean Architecture 架构模式。应用通过 WebDAV 协议与桌面端同步数据，支持加密和明文两种同步模式。核心功能包括笔记、书签、待办事项、智能助理和密码库五大模块。

### 技术选型

| 层级 | 技术方案 |
|------|----------|
| UI | Jetpack Compose + Material Design 3 |
| 架构 | MVVM + Clean Architecture |
| 依赖注入 | Hilt |
| 数据库 | Room + SQLCipher |
| 网络 | OkHttp + Sardine (WebDAV) |
| 加密 | Android Keystore + Tink |
| 异步 | Kotlin Coroutines + Flow |
| 生物识别 | BiometricPrompt API |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │   Screens   │ │  ViewModels │ │   States    │            │
│  │  (Compose)  │ │   (Hilt)    │ │  (StateFlow)│            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
├─────────────────────────────────────────────────────────────┤
│                      Domain Layer                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │  Use Cases  │ │  Entities   │ │ Repositories│            │
│  │             │ │  (ItemBase) │ │ (Interfaces)│            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
├─────────────────────────────────────────────────────────────┤
│                       Data Layer                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │    Room     │ │   WebDAV    │ │   Crypto    │            │
│  │  Database   │ │   Adapter   │ │   Engine    │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. 数据层 (Data Layer)

#### 1.1 ItemEntity (Room Entity)

```kotlin
@Entity(tableName = "items")
data class ItemEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "type") val type: String,
    @ColumnInfo(name = "created_time") val createdTime: Long,
    @ColumnInfo(name = "updated_time") val updatedTime: Long,
    @ColumnInfo(name = "deleted_time") val deletedTime: Long?,
    @ColumnInfo(name = "payload") val payload: String,
    @ColumnInfo(name = "content_hash") val contentHash: String,
    @ColumnInfo(name = "sync_status") val syncStatus: String,
    @ColumnInfo(name = "local_rev") val localRev: Int,
    @ColumnInfo(name = "remote_rev") val remoteRev: String?,
    @ColumnInfo(name = "encryption_applied") val encryptionApplied: Int,
    @ColumnInfo(name = "schema_version") val schemaVersion: Int
)
```

#### 1.2 ItemDao (Room DAO)

```kotlin
@Dao
interface ItemDao {
    @Query("SELECT * FROM items WHERE type = :type AND deleted_time IS NULL ORDER BY updated_time DESC")
    fun getByType(type: String): Flow<List<ItemEntity>>
    
    @Query("SELECT * FROM items WHERE id = :id AND deleted_time IS NULL")
    suspend fun getById(id: String): ItemEntity?
    
    @Query("SELECT * FROM items WHERE sync_status IN ('modified', 'deleted')")
    suspend fun getPendingSync(): List<ItemEntity>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: ItemEntity)
    
    @Query("UPDATE items SET deleted_time = :time, sync_status = 'deleted', local_rev = local_rev + 1 WHERE id = :id")
    suspend fun softDelete(id: String, time: Long)
    
    @Query("UPDATE items SET sync_status = 'clean', remote_rev = :remoteRev WHERE id = :id")
    suspend fun markSynced(id: String, remoteRev: String)
}
```

#### 1.3 WebDAVAdapter

```kotlin
interface WebDAVAdapter {
    suspend fun testConnection(): Boolean
    suspend fun getItem(id: String): ItemEntity?
    suspend fun putItem(item: ItemEntity): Result<String>  // Returns remoteRev
    suspend fun deleteItem(id: String): Boolean
    suspend fun listChanges(cursor: String?, limit: Int): ChangeListResult
    suspend fun acquireLock(deviceId: String, timeout: Long): Boolean
    suspend fun releaseLock(deviceId: String): Boolean
    suspend fun getSyncCursor(): SyncCursor?
    suspend fun setSyncCursor(cursor: SyncCursor): Boolean
}

data class ChangeListResult(
    val changes: List<RemoteChange>,
    val nextCursor: String?,
    val hasMore: Boolean
)
```

#### 1.4 CryptoEngine

```kotlin
interface CryptoEngine {
    fun deriveKeyFromPassword(password: String, salt: ByteArray?): DerivedKey
    fun encrypt(plaintext: String): EncryptedData
    fun decrypt(encryptedData: EncryptedData): String
    fun encryptPayload(payload: String): String
    fun decryptPayload(encryptedPayload: String): String
    fun computeHash(content: String): String
    fun generateKeyIdentifier(): String
    fun setMasterKey(key: ByteArray)
    fun clearMasterKey()
    fun hasMasterKey(): Boolean
}

data class DerivedKey(val key: ByteArray, val salt: ByteArray)

data class EncryptedData(
    val ciphertext: String,  // Base64
    val iv: String,          // Base64
    val authTag: String,     // Base64
    val salt: String? = null // Base64
)
```

### 2. 领域层 (Domain Layer)

#### 2.1 ItemType 枚举

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
        val SENSITIVE_TYPES = setOf(VAULT_ENTRY, VAULT_FOLDER, AI_CONFIG)
    }
}
```

#### 2.2 Payload 数据类

```kotlin
// 笔记
@Serializable
data class NotePayload(
    val title: String,
    val content: String,
    val folderId: String?,
    val isPinned: Boolean,
    val isLocked: Boolean,
    val lockPasswordHash: String?,
    val tags: List<String>
)

// 待办事项
@Serializable
data class TodoPayload(
    val title: String,
    val description: String,
    val quadrant: TodoQuadrant,
    val completed: Boolean,
    val completedAt: Long?,
    val dueDate: Long?,
    val reminderTime: Long?,
    val reminderEnabled: Boolean,
    val priority: Int,
    val tags: List<String>
)

enum class TodoQuadrant {
    URGENT_IMPORTANT,
    NOT_URGENT_IMPORTANT,
    URGENT_NOT_IMPORTANT,
    NOT_URGENT_NOT_IMPORTANT
}

// 密码库条目
@Serializable
data class VaultEntryPayload(
    val name: String,
    val entryType: VaultEntryType,
    val folderId: String?,
    val favorite: Boolean,
    val notes: String,
    val username: String,
    val password: String,
    val totpSecrets: List<VaultTotp>,
    val uris: List<VaultUri>,
    val cardHolderName: String,
    val cardNumber: String,
    val cardBrand: String,
    val cardExpMonth: String,
    val cardExpYear: String,
    val cardCvv: String,
    val identityTitle: String,
    val identityFirstName: String,
    val identityLastName: String,
    val identityEmail: String,
    val identityPhone: String,
    val identityAddress: String,
    val customFields: List<VaultCustomField>
)

// 书签
@Serializable
data class BookmarkPayload(
    val name: String,
    val url: String,
    val description: String,
    val folderId: String?,
    val icon: String?,
    val tags: List<String>
)

// AI 对话
@Serializable
data class AIConversationPayload(
    val title: String,
    val model: String,
    val systemPrompt: String,
    val temperature: Float,
    val maxTokens: Int,
    val createdAt: Long
)

// AI 消息
@Serializable
data class AIMessagePayload(
    val conversationId: String,
    val role: String,  // "user", "assistant", "system"
    val content: String,
    val model: String,
    val tokensUsed: Int?,
    val createdAt: Long
)

// AI 配置
@Serializable
data class AIConfigPayload(
    val enabled: Boolean,
    val defaultChannel: String,
    val defaultModel: String,
    val channels: List<AIChannel>
)

@Serializable
data class AIChannel(
    val id: String,
    val name: String,
    val type: String,  // "openai", "anthropic", "custom"
    val apiUrl: String,
    val apiKey: String,
    val models: List<AIModel>,
    val enabled: Boolean
)

@Serializable
data class AIModel(
    val id: String,
    val name: String,
    val channelId: String,
    val maxTokens: Int,
    val isCustom: Boolean
)

// 文件夹
@Serializable
data class FolderPayload(
    val name: String,
    val parentId: String?,
    val icon: String?,
    val color: String?
)

// 书签文件夹
@Serializable
data class BookmarkFolderPayload(
    val name: String,
    val parentId: String?
)

// 密码库文件夹
@Serializable
data class VaultFolderPayload(
    val name: String,
    val parentId: String?
)

// 密码库辅助类型
enum class VaultEntryType {
    LOGIN, CARD, IDENTITY, SECURE_NOTE
}

@Serializable
data class VaultTotp(
    val id: String,
    val name: String,
    val account: String,
    val secret: String
)

@Serializable
data class VaultUri(
    val id: String,
    val name: String,
    val uri: String,
    val matchType: String  // "domain", "host", "starts_with", "exact", "regex", "never"
)

@Serializable
data class VaultCustomField(
    val id: String,
    val name: String,
    val value: String,
    val type: String  // "text", "hidden", "boolean"
)

// 标签
@Serializable
data class TagPayload(
    val name: String,
    val color: String?
)
```

#### 2.3 Repository 接口

```kotlin
interface ItemRepository {
    fun getByType(type: ItemType): Flow<List<ItemEntity>>
    suspend fun getById(id: String): ItemEntity?
    suspend fun create(type: ItemType, payload: String): ItemEntity
    suspend fun update(id: String, payload: String): ItemEntity?
    suspend fun softDelete(id: String): Boolean
    suspend fun search(query: String, type: ItemType?): List<ItemEntity>
}

interface SyncRepository {
    suspend fun sync(): SyncResult
    suspend fun getSyncStatus(): SyncStatus
    fun observeSyncStatus(): Flow<SyncStatus>
}
```

### 3. 表现层 (Presentation Layer)

#### 3.1 导航结构

```kotlin
sealed class Screen(val route: String) {
    object Notes : Screen("notes")
    object Bookmarks : Screen("bookmarks")
    object Todos : Screen("todos")
    object AI : Screen("ai")
    object Vault : Screen("vault")
    object Settings : Screen("settings")
    
    data class NoteDetail(val noteId: String) : Screen("notes/$noteId")
    data class AIConversation(val conversationId: String) : Screen("ai/$conversationId")
    data class VaultEntry(val entryId: String) : Screen("vault/$entryId")
}
```

#### 3.2 ViewModel 示例

```kotlin
@HiltViewModel
class NotesViewModel @Inject constructor(
    private val itemRepository: ItemRepository,
    private val syncRepository: SyncRepository
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(NotesUiState())
    val uiState: StateFlow<NotesUiState> = _uiState.asStateFlow()
    
    val notes = itemRepository.getByType(ItemType.NOTE)
        .map { items -> items.map { it.toNote() } }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    fun createNote(title: String, content: String, folderId: String?) {
        viewModelScope.launch {
            val payload = NotePayload(
                title = title,
                content = content,
                folderId = folderId,
                isPinned = false,
                isLocked = false,
                lockPasswordHash = null,
                tags = emptyList()
            )
            itemRepository.create(ItemType.NOTE, Json.encodeToString(payload))
        }
    }
}
```

### 4. 安全组件 (Security Components)

#### 4.1 BiometricManager

```kotlin
interface BiometricManager {
    fun canAuthenticate(): BiometricStatus
    suspend fun authenticate(
        title: String,
        subtitle: String,
        negativeButtonText: String
    ): AuthResult
    fun isBiometricEnabled(): Boolean
    fun setBiometricEnabled(enabled: Boolean)
}

enum class BiometricStatus {
    AVAILABLE,
    NO_HARDWARE,
    HARDWARE_UNAVAILABLE,
    NONE_ENROLLED
}

sealed class AuthResult {
    object Success : AuthResult()
    data class Error(val code: Int, val message: String) : AuthResult()
    object Cancelled : AuthResult()
    object Fallback : AuthResult()  // User chose PIN/pattern
}
```

#### 4.2 AppLockManager

```kotlin
interface AppLockManager {
    fun isLockEnabled(): Boolean
    fun setLockEnabled(enabled: Boolean)
    fun getLockType(): LockType
    fun setLockType(type: LockType)
    suspend fun verifyPin(pin: String): Boolean
    suspend fun verifyPattern(pattern: List<Int>): Boolean
    fun setPin(pin: String)
    fun setPattern(pattern: List<Int>)
    fun shouldLock(): Boolean  // Based on timeout
    fun recordUnlock()
}

enum class LockType {
    NONE, PIN, PATTERN, BIOMETRIC
}
```

#### 4.3 TOTPGenerator

```kotlin
interface TOTPGenerator {
    fun generateCode(secret: String, time: Long = System.currentTimeMillis()): String
    fun getRemainingSeconds(): Int
    fun observeCode(secret: String): Flow<TOTPCode>
}

data class TOTPCode(
    val code: String,
    val remainingSeconds: Int
)
```

### 5. UI 组件设计 (UI Components)

#### 5.1 底部导航

```kotlin
@Composable
fun MainNavigation() {
    val navController = rememberNavController()
    
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Notes, "笔记") },
                    label = { Text("笔记") },
                    selected = currentRoute == "notes",
                    onClick = { navController.navigate("notes") }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Bookmark, "书签") },
                    label = { Text("书签") },
                    selected = currentRoute == "bookmarks",
                    onClick = { navController.navigate("bookmarks") }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.CheckCircle, "待办") },
                    label = { Text("待办") },
                    selected = currentRoute == "todos",
                    onClick = { navController.navigate("todos") }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.SmartToy, "AI") },
                    label = { Text("AI") },
                    selected = currentRoute == "ai",
                    onClick = { navController.navigate("ai") }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Lock, "密码库") },
                    label = { Text("密码库") },
                    selected = currentRoute == "vault",
                    onClick = { navController.navigate("vault") }
                )
            }
        }
    ) { paddingValues ->
        NavHost(navController, startDestination = "notes") {
            composable("notes") { NotesScreen() }
            composable("bookmarks") { BookmarksScreen() }
            composable("todos") { TodosScreen() }
            composable("ai") { AIScreen() }
            composable("vault") { VaultScreen() }
        }
    }
}
```

#### 5.2 待办四象限视图

```kotlin
@Composable
fun TodoQuadrantView(
    todos: List<Todo>,
    onTodoClick: (Todo) -> Unit,
    onQuadrantChange: (Todo, TodoQuadrant) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(modifier = Modifier.weight(1f)) {
            QuadrantCard(
                title = "紧急且重要",
                quadrant = TodoQuadrant.URGENT_IMPORTANT,
                todos = todos.filter { it.quadrant == TodoQuadrant.URGENT_IMPORTANT },
                modifier = Modifier.weight(1f)
            )
            QuadrantCard(
                title = "重要不紧急",
                quadrant = TodoQuadrant.NOT_URGENT_IMPORTANT,
                todos = todos.filter { it.quadrant == TodoQuadrant.NOT_URGENT_IMPORTANT },
                modifier = Modifier.weight(1f)
            )
        }
        Row(modifier = Modifier.weight(1f)) {
            QuadrantCard(
                title = "紧急不重要",
                quadrant = TodoQuadrant.URGENT_NOT_IMPORTANT,
                todos = todos.filter { it.quadrant == TodoQuadrant.URGENT_NOT_IMPORTANT },
                modifier = Modifier.weight(1f)
            )
            QuadrantCard(
                title = "不紧急不重要",
                quadrant = TodoQuadrant.NOT_URGENT_NOT_IMPORTANT,
                todos = todos.filter { it.quadrant == TodoQuadrant.NOT_URGENT_NOT_IMPORTANT },
                modifier = Modifier.weight(1f)
            )
        }
    }
}
```

#### 5.3 系统手势支持

```kotlin
// 在 Activity 中启用边缘到边缘显示
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 启用边缘到边缘
        WindowCompat.setDecorFitsSystemWindows(window, false)
        
        // 启用预测性返回手势 (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT
            ) {
                // 处理返回逻辑
            }
        }
        
        setContent {
            MuchengNotesTheme {
                // 处理系统栏 insets
                val systemBarsPadding = WindowInsets.systemBars.asPaddingValues()
                Box(modifier = Modifier.padding(systemBarsPadding)) {
                    MainNavigation()
                }
            }
        }
    }
}

// Compose 中处理手势冲突
@Composable
fun SwipeableNoteItem(
    note: Note,
    onDelete: () -> Unit
) {
    val dismissState = rememberDismissState(
        confirmValueChange = { dismissValue ->
            if (dismissValue == DismissValue.DismissedToStart) {
                onDelete()
                true
            } else false
        }
    )
    
    SwipeToDismiss(
        state = dismissState,
        background = { DeleteBackground() },
        dismissContent = { NoteCard(note) },
        // 避免与系统边缘手势冲突
        directions = setOf(DismissDirection.EndToStart)
    )
}
```

### 6. 同步引擎 (Sync Engine)

```kotlin
class SyncEngine(
    private val webDAVAdapter: WebDAVAdapter,
    private val itemDao: ItemDao,
    private val cryptoEngine: CryptoEngine,
    private val config: SyncConfig
) {
    private val deviceId = UUID.randomUUID().toString()
    
    suspend fun sync(): SyncResult {
        val startTime = System.currentTimeMillis()
        val result = SyncResult()
        
        // 1. 获取锁
        if (!webDAVAdapter.acquireLock(deviceId, 300_000)) {
            return result.copy(error = "同步锁被占用")
        }
        
        try {
            // 2. 验证密钥
            if (config.encryptionEnabled && !verifyEncryptionKey()) {
                return result.copy(error = "同步密钥不匹配")
            }
            
            // 3. Push 本地变更
            val pushResult = pushChanges()
            result.pushed = pushResult.count
            
            // 4. Pull 远端变更
            val pullResult = pullChanges()
            result.pulled = pullResult.count
            result.conflicts = pullResult.conflicts
            
            result.success = true
        } finally {
            webDAVAdapter.releaseLock(deviceId)
        }
        
        result.duration = System.currentTimeMillis() - startTime
        return result
    }
    
    private suspend fun pushChanges(): PushResult {
        val pendingItems = itemDao.getPendingSync()
            .filter { shouldSyncType(it.type) }
        
        var count = 0
        for (item in pendingItems) {
            val itemToUpload = prepareForUpload(item)
            val result = webDAVAdapter.putItem(itemToUpload)
            if (result.isSuccess) {
                itemDao.markSynced(item.id, result.getOrThrow())
                count++
            }
        }
        return PushResult(count)
    }
    
    private fun prepareForUpload(item: ItemEntity): ItemEntity {
        val isSensitive = ItemType.SENSITIVE_TYPES.any { it.value == item.type }
        val shouldEncrypt = (config.encryptionEnabled || isSensitive) && cryptoEngine.hasMasterKey()
        
        return if (shouldEncrypt) {
            item.copy(
                payload = cryptoEngine.encryptPayload(item.payload),
                encryptionApplied = 1
            )
        } else item
    }
}

data class SyncResult(
    val success: Boolean = false,
    val pushed: Int = 0,
    val pulled: Int = 0,
    val conflicts: Int = 0,
    val error: String? = null,
    val duration: Long = 0
)
```

## Data Models

### 数据库 Schema

```sql
CREATE TABLE items (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    created_time INTEGER NOT NULL,
    updated_time INTEGER NOT NULL,
    deleted_time INTEGER,
    payload TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'modified',
    local_rev INTEGER NOT NULL DEFAULT 1,
    remote_rev TEXT,
    encryption_applied INTEGER NOT NULL DEFAULT 0,
    schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_items_type ON items(type);
CREATE INDEX idx_items_sync_status ON items(sync_status);
CREATE INDEX idx_items_updated_time ON items(updated_time);
```

### 同步配置

```kotlin
@Serializable
data class SyncConfig(
    val enabled: Boolean,
    val type: String = "webdav",
    val url: String,
    val syncPath: String,
    val username: String?,
    val password: String?,
    val encryptionEnabled: Boolean,
    val syncInterval: Int,  // minutes
    val lastSyncTime: Long?,
    val syncCursor: String?,
    val syncModules: SyncModules
)

@Serializable
data class SyncModules(
    val notes: Boolean = true,
    val bookmarks: Boolean = true,
    val vault: Boolean = true,
    val diagrams: Boolean = true,
    val todos: Boolean = true,
    val ai: Boolean = true
)
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Content Hash Consistency

*For any* payload string, computing the content hash using SHA-256 and taking the first 16 characters SHALL produce a consistent 16-character hexadecimal string, and the same payload SHALL always produce the same hash.

**Validates: Requirements 1.5**

### Property 2: UUID v4 Format Compliance

*For any* generated item ID, the ID SHALL conform to UUID v4 format (8-4-4-4-12 hexadecimal pattern with version 4 indicator).

**Validates: Requirements 1.4**

### Property 3: Payload Serialization Round-Trip

*For any* valid payload object (NotePayload, TodoPayload, VaultEntryPayload, etc.), serializing to JSON and deserializing back SHALL produce an equivalent object.

**Validates: Requirements 1.3**

### Property 4: Encryption Round-Trip Compatibility

*For any* plaintext payload, encrypting with CryptoEngine and decrypting SHALL return the original plaintext. Additionally, data encrypted by Android CryptoEngine SHALL be decryptable by desktop CryptoEngine algorithm (same PBKDF2 + AES-256-GCM parameters).

**Validates: Requirements 4.7, 4.4**

### Property 5: Key Derivation Consistency

*For any* password and salt combination, deriving a key using PBKDF2 with 100,000 iterations and SHA-256 SHALL produce a consistent 32-byte key, and the same password+salt SHALL always produce the same key.

**Validates: Requirements 4.1**

### Property 6: Encrypted Data Structure

*For any* encrypted payload, the output SHALL be valid JSON containing ciphertext, iv (12 bytes Base64), and authTag (16 bytes Base64) fields.

**Validates: Requirements 4.2, 4.4**

### Property 7: Key Identifier Generation

*For any* encryption key, generating the key identifier SHALL produce a consistent 16-character hexadecimal string (first 16 chars of SHA-256 hash of key).

**Validates: Requirements 4.5**

### Property 8: Sensitive Types Always Encrypted

*For any* item with type in SENSITIVE_TYPES (vault_entry, vault_folder, ai_config), preparing for sync SHALL set encryption_applied to 1, regardless of the global encryptionEnabled setting.

**Validates: Requirements 3.5**

### Property 9: TOTP Code Generation

*For any* valid TOTP secret, generating a code SHALL produce a 6-digit numeric string, and codes generated within the same 30-second window SHALL be identical.

**Validates: Requirements 9.8**

### Property 10: Database CRUD Round-Trip

*For any* valid ItemEntity, inserting into database and querying by ID SHALL return an equivalent entity with all fields preserved.

**Validates: Requirements 10.1, 10.2**

## Error Handling

### 同步错误处理

| 错误类型 | 处理策略 |
|---------|---------|
| 网络不可用 | 队列变更，下次同步时重试 |
| WebDAV 认证失败 | 提示用户检查凭据 |
| 加密密钥不匹配 | 中止同步，显示"同步密钥不匹配"错误 |
| 同步锁被占用 | 等待并重试，最多 3 次 |
| 冲突 | 创建冲突副本，保留两个版本 |
| 服务器不可达 | 显示离线状态，允许本地操作 |

### 加密错误处理

| 错误类型 | 处理策略 |
|---------|---------|
| 解密失败 | 记录错误，跳过该项，继续同步其他项 |
| 密钥派生失败 | 提示用户重新输入密码 |
| 数据损坏 | 标记为冲突，从远端重新拉取 |

### 生物识别错误处理

| 错误类型 | 处理策略 |
|---------|---------|
| 生物识别不可用 | 回退到 PIN/图案 |
| 认证失败 3 次 | 强制使用 PIN/图案 |
| 硬件错误 | 显示错误提示，回退到 PIN/图案 |

## Testing Strategy

### 单元测试

使用 JUnit 5 + MockK 进行单元测试：

- **CryptoEngine 测试**: 加密/解密、密钥派生、哈希计算
- **Payload 序列化测试**: 各类型 Payload 的 JSON 序列化/反序列化
- **Repository 测试**: 使用 Room 内存数据库测试 CRUD 操作
- **ViewModel 测试**: 使用 Turbine 测试 StateFlow

### 属性测试

使用 Kotest Property Testing 进行属性测试：

```kotlin
class CryptoEnginePropertyTest : StringSpec({
    "encryption round-trip preserves plaintext" {
        checkAll(Arb.string()) { plaintext ->
            val encrypted = cryptoEngine.encrypt(plaintext)
            val decrypted = cryptoEngine.decrypt(encrypted)
            decrypted shouldBe plaintext
        }
    }
    
    "content hash is consistent" {
        checkAll(Arb.string()) { content ->
            val hash1 = cryptoEngine.computeHash(content)
            val hash2 = cryptoEngine.computeHash(content)
            hash1 shouldBe hash2
            hash1.length shouldBe 16
        }
    }
})
```

### 集成测试

- **WebDAV 同步测试**: 使用本地 WebDAV 服务器 (如 WsgiDAV)
- **数据库迁移测试**: Room 自动迁移测试
- **端到端同步测试**: 模拟桌面端数据，验证 Android 端正确同步

### UI 测试

使用 Compose UI Testing：

- **导航测试**: 验证底部导航和页面跳转
- **手势测试**: 验证返回手势和滑动操作
- **无障碍测试**: 验证 TalkBack 支持

