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
    
    // 资源文件操作
    suspend fun uploadResource(resourceId: String, data: ByteArray): Result<String>
    suspend fun downloadResource(resourceId: String): Result<ByteArray>
    suspend fun deleteResource(resourceId: String): Boolean
    suspend fun listResources(): List<String>
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

> **重要**: 所有 Payload 字段使用 `@SerialName` 注解保持与桌面端 JSON 格式一致（snake_case）

```kotlin
// 笔记
@Serializable
data class NotePayload(
    val title: String,
    val content: String,
    @SerialName("folder_id") val folderId: String?,
    @SerialName("is_pinned") val isPinned: Boolean,
    @SerialName("is_locked") val isLocked: Boolean,
    @SerialName("lock_password_hash") val lockPasswordHash: String?,
    val tags: List<String>
)

// 待办事项
@Serializable
data class TodoPayload(
    val title: String,
    val description: String,
    val quadrant: TodoQuadrant,
    val completed: Boolean,
    @SerialName("completed_at") val completedAt: Long?,
    @SerialName("due_date") val dueDate: Long?,
    @SerialName("reminder_time") val reminderTime: Long?,
    @SerialName("reminder_enabled") val reminderEnabled: Boolean,
    val priority: Int,
    val tags: List<String>
)

enum class TodoQuadrant {
    @SerialName("urgent-important") URGENT_IMPORTANT,
    @SerialName("not-urgent-important") NOT_URGENT_IMPORTANT,
    @SerialName("urgent-not-important") URGENT_NOT_IMPORTANT,
    @SerialName("not-urgent-not-important") NOT_URGENT_NOT_IMPORTANT
}

// 密码库条目
@Serializable
data class VaultEntryPayload(
    val name: String,
    @SerialName("entry_type") val entryType: VaultEntryType,
    @SerialName("folder_id") val folderId: String?,
    val favorite: Boolean,
    val notes: String,
    val username: String,
    val password: String,
    @SerialName("totp_secrets") val totpSecrets: List<VaultTotp>,
    val uris: List<VaultUri>,
    @SerialName("card_holder_name") val cardHolderName: String,
    @SerialName("card_number") val cardNumber: String,
    @SerialName("card_brand") val cardBrand: String,
    @SerialName("card_exp_month") val cardExpMonth: String,
    @SerialName("card_exp_year") val cardExpYear: String,
    @SerialName("card_cvv") val cardCvv: String,
    @SerialName("identity_title") val identityTitle: String,
    @SerialName("identity_first_name") val identityFirstName: String,
    @SerialName("identity_last_name") val identityLastName: String,
    @SerialName("identity_email") val identityEmail: String,
    @SerialName("identity_phone") val identityPhone: String,
    @SerialName("identity_address") val identityAddress: String,
    @SerialName("custom_fields") val customFields: List<VaultCustomField>
)

// 书签
@Serializable
data class BookmarkPayload(
    val name: String,
    val url: String,
    val description: String,
    @SerialName("folder_id") val folderId: String?,
    val icon: String?,
    val tags: List<String>
)

// AI 对话
@Serializable
data class AIConversationPayload(
    val title: String,
    val model: String,
    @SerialName("system_prompt") val systemPrompt: String,
    val temperature: Float,
    @SerialName("max_tokens") val maxTokens: Int,
    @SerialName("created_at") val createdAt: Long
)

// AI 消息
@Serializable
data class AIMessagePayload(
    @SerialName("conversation_id") val conversationId: String,
    val role: String,  // "user", "assistant", "system"
    val content: String,
    val model: String,
    @SerialName("tokens_used") val tokensUsed: Int?,
    @SerialName("created_at") val createdAt: Long
)

// AI 配置
@Serializable
data class AIConfigPayload(
    val enabled: Boolean,
    @SerialName("default_channel") val defaultChannel: String,
    @SerialName("default_model") val defaultModel: String,
    val channels: List<AIChannel>
)

@Serializable
data class AIChannel(
    val id: String,
    val name: String,
    val type: String,  // "openai", "anthropic", "custom"
    @SerialName("api_url") val apiUrl: String,
    @SerialName("api_key") val apiKey: String,
    val models: List<AIModel>,
    val enabled: Boolean
)

@Serializable
data class AIModel(
    val id: String,
    val name: String,
    @SerialName("channel_id") val channelId: String,
    @SerialName("max_tokens") val maxTokens: Int,
    @SerialName("is_custom") val isCustom: Boolean
)

// 文件夹
@Serializable
data class FolderPayload(
    val name: String,
    @SerialName("parent_id") val parentId: String?,
    val icon: String?,
    val color: String?
)

// 书签文件夹
@Serializable
data class BookmarkFolderPayload(
    val name: String,
    @SerialName("parent_id") val parentId: String?
)

// 密码库文件夹
@Serializable
data class VaultFolderPayload(
    val name: String,
    @SerialName("parent_id") val parentId: String?
)

// 密码库辅助类型
enum class VaultEntryType {
    @SerialName("login") LOGIN,
    @SerialName("card") CARD,
    @SerialName("identity") IDENTITY,
    @SerialName("secure_note") SECURE_NOTE
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
    @SerialName("match_type") val matchType: String  // "domain", "host", "starts_with", "exact", "regex", "never"
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

// 资源文件
@Serializable
data class ResourcePayload(
    val filename: String,
    @SerialName("mime_type") val mimeType: String,
    val size: Long,
    @SerialName("note_id") val noteId: String,
    @SerialName("file_hash") val fileHash: String
    // 注意: local_path 不参与同步，仅在本地使用
    // Android 端应在 ItemEntity 外部单独维护本地缓存路径
)

// 图表
@Serializable
data class DiagramPayload(
    val name: String,
    @SerialName("diagram_type") val diagramType: DiagramType,
    val data: String,  // JSON 格式的图表数据
    @SerialName("folder_id") val folderId: String?,
    val thumbnail: String?  // Base64 缩略图
)

enum class DiagramType {
    @SerialName("mindmap") MINDMAP,
    @SerialName("flowchart") FLOWCHART,
    @SerialName("whiteboard") WHITEBOARD
}
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

#### 4.4 AutofillManager

```kotlin
interface AutofillManager {
    fun isAutofillServiceEnabled(): Boolean
    fun requestEnableAutofillService()
    suspend fun getMatchingEntries(packageName: String?, webDomain: String?): List<VaultEntryPayload>
    suspend fun authenticateForAutofill(): AuthResult
}

// AutofillService 实现
@RequiresApi(Build.VERSION_CODES.O)
class MuchengAutofillService : AutofillService() {
    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        // 1. 解析请求获取 packageName 或 webDomain
        // 2. 查询匹配的密码库条目
        // 3. 如果需要，触发生物识别认证
        // 4. 构建 FillResponse 返回
    }
    
    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        // 保存新凭据到密码库
    }
}
```

#### 4.5 NetworkSecurityManager

```kotlin
interface NetworkSecurityManager {
    fun getSecureOkHttpClient(): OkHttpClient
    fun getCertificatePinner(): CertificatePinner
}

class NetworkSecurityManagerImpl : NetworkSecurityManager {
    override fun getCertificatePinner(): CertificatePinner {
        return CertificatePinner.Builder()
            // 可配置的证书固定
            .add("*.openai.com", "sha256/...")
            .add("*.anthropic.com", "sha256/...")
            .build()
    }
    
    override fun getSecureOkHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .certificatePinner(getCertificatePinner())
            .connectionSpecs(listOf(ConnectionSpec.MODERN_TLS))
            .build()
    }
}
```

#### 4.6 ConnectivityManager (离线队列)

```kotlin
interface OfflineQueueManager {
    fun isOnline(): Boolean
    fun observeConnectivity(): Flow<Boolean>
    suspend fun queueChange(itemId: String)
    suspend fun processQueue()
}

class OfflineQueueManagerImpl(
    private val context: Context,
    private val syncRepository: SyncRepository
) : OfflineQueueManager {
    
    private val connectivityManager = context.getSystemService<ConnectivityManager>()
    
    override fun observeConnectivity(): Flow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(true)
                // 网络恢复时自动触发同步
                CoroutineScope(Dispatchers.IO).launch {
                    processQueue()
                }
            }
            override fun onLost(network: Network) {
                trySend(false)
            }
        }
        connectivityManager?.registerDefaultNetworkCallback(callback)
        awaitClose { connectivityManager?.unregisterNetworkCallback(callback) }
    }
    
    override suspend fun processQueue() {
        if (isOnline()) {
            syncRepository.sync()
        }
    }
}
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
    val type: String = "webdav",  // "webdav" | "server"
    val url: String,
    @SerialName("sync_path") val syncPath: String,
    val username: String?,
    val password: String?,
    @SerialName("api_key") val apiKey: String?,  // 用于 server 类型同步
    @SerialName("encryption_enabled") val encryptionEnabled: Boolean,
    @SerialName("sync_interval") val syncInterval: Int,  // minutes
    @SerialName("last_sync_time") val lastSyncTime: Long?,
    @SerialName("sync_cursor") val syncCursor: String?,
    @SerialName("sync_modules") val syncModules: SyncModules
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

// 模块到 ItemType 的映射（与桌面端一致）
object SyncModuleTypes {
    val NOTES = listOf("note", "folder", "tag", "resource")
    val BOOKMARKS = listOf("bookmark", "bookmark_folder")
    val VAULT = listOf("vault_entry", "vault_folder")
    val DIAGRAMS = listOf("diagram")
    val TODOS = listOf("todo")
    val AI = listOf("ai_config", "ai_conversation", "ai_message")
}
```

## Localization

### 字符串资源本地化

所有用户可见的字符串必须使用 Android 资源系统，支持中文本地化：

```xml
<!-- res/values-zh-rCN/strings.xml -->
<resources>
    <!-- 通用 -->
    <string name="app_name">暮城笔记</string>
    <string name="ok">确定</string>
    <string name="cancel">取消</string>
    <string name="delete">删除</string>
    <string name="edit">编辑</string>
    <string name="save">保存</string>
    
    <!-- 导航 -->
    <string name="nav_notes">笔记</string>
    <string name="nav_bookmarks">书签</string>
    <string name="nav_todos">待办</string>
    <string name="nav_ai">AI</string>
    <string name="nav_vault">密码库</string>
    
    <!-- 同步 -->
    <string name="sync_in_progress">同步中...</string>
    <string name="sync_success">同步成功</string>
    <string name="sync_failed">同步失败</string>
    <string name="error_key_mismatch">同步密钥不匹配</string>
    <string name="error_lock_occupied">同步锁被占用</string>
    <string name="error_network_unavailable">网络不可用</string>
    <string name="error_auth_failed">认证失败，请检查凭据</string>
    
    <!-- 加密 -->
    <string name="encryption_enabled">加密同步</string>
    <string name="encryption_disabled">明文同步</string>
    <string name="enter_sync_password">请输入同步密码</string>
    
    <!-- 安全 -->
    <string name="biometric_prompt_title">身份验证</string>
    <string name="biometric_prompt_subtitle">使用指纹或面部解锁</string>
    <string name="biometric_prompt_negative">使用密码</string>
    <string name="lock_screen_title">应用已锁定</string>
    <string name="enter_pin">请输入 PIN</string>
    <string name="draw_pattern">请绘制解锁图案</string>
    
    <!-- 待办四象限 -->
    <string name="quadrant_urgent_important">紧急且重要</string>
    <string name="quadrant_not_urgent_important">重要不紧急</string>
    <string name="quadrant_urgent_not_important">紧急不重要</string>
    <string name="quadrant_not_urgent_not_important">不紧急不重要</string>
    
    <!-- 密码库 -->
    <string name="vault_master_password">主密码</string>
    <string name="vault_copied">已复制到剪贴板</string>
    <string name="vault_clipboard_cleared">剪贴板已清除</string>
    <string name="totp_code">验证码</string>
</resources>
```

### 代码中使用字符串资源

```kotlin
// ViewModel 中
class SyncViewModel @Inject constructor(
    @ApplicationContext private val context: Context
) : ViewModel() {
    
    fun getSyncErrorMessage(error: SyncError): String {
        return when (error) {
            SyncError.KEY_MISMATCH -> context.getString(R.string.error_key_mismatch)
            SyncError.LOCK_OCCUPIED -> context.getString(R.string.error_lock_occupied)
            SyncError.NETWORK_UNAVAILABLE -> context.getString(R.string.error_network_unavailable)
            SyncError.AUTH_FAILED -> context.getString(R.string.error_auth_failed)
        }
    }
}

// Compose 中
@Composable
fun SyncStatusIndicator(status: SyncStatus) {
    val message = when (status) {
        SyncStatus.SYNCING -> stringResource(R.string.sync_in_progress)
        SyncStatus.SUCCESS -> stringResource(R.string.sync_success)
        SyncStatus.FAILED -> stringResource(R.string.sync_failed)
        else -> null
    }
    // ...
}
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

### Property 11: Resource File Integrity

*For any* resource file, uploading to WebDAV and downloading SHALL return identical byte content, verified by SHA-256 hash comparison.

**Validates: Requirements 2.2**

### Property 12: Autofill Entry Matching

*For any* vault entry with URIs, querying by package name or web domain SHALL return entries where at least one URI matches according to its matchType (domain, host, starts_with, exact, regex).

**Validates: Requirements 13.8**

### Property 13: JSON Serialization Desktop Compatibility

*For any* Payload object, serializing to JSON SHALL produce field names in snake_case format (e.g., "folder_id", "is_pinned", "created_at") matching the desktop app's JSON format exactly.

**Validates: Requirements 1.3, 4.7**

## Error Handling

### 同步错误处理

| 错误类型 | 处理策略 | 字符串资源 |
|---------|---------|-----------|
| 网络不可用 | 队列变更，下次同步时重试 | `R.string.error_network_unavailable` |
| WebDAV 认证失败 | 提示用户检查凭据 | `R.string.error_auth_failed` |
| 加密密钥不匹配 | 中止同步，显示错误 | `R.string.error_key_mismatch` |
| 同步锁被占用 | 等待并重试，最多 3 次 | `R.string.error_lock_occupied` |
| 冲突 | 创建冲突副本，保留两个版本 | `R.string.sync_conflict_created` |
| 服务器不可达 | 显示离线状态，允许本地操作 | `R.string.error_server_unreachable` |

### 加密错误处理

| 错误类型 | 处理策略 |
|---------|---------|
| 解密失败 | 记录错误，跳过该项，继续同步其他项 |
| 密钥派生失败 | 提示用户重新输入密码 |
| 数据损坏 | 标记为冲突，从远端重新拉取 |

### 生物识别错误处理

| 错误类型 | 处理策略 | 字符串资源 |
|---------|---------|-----------|
| 生物识别不可用 | 回退到 PIN/图案 | `R.string.biometric_unavailable` |
| 认证失败 3 次 | 强制使用 PIN/图案 | `R.string.biometric_too_many_attempts` |
| 硬件错误 | 显示错误提示，回退到 PIN/图案 | `R.string.biometric_hardware_error` |

## Resource Sync

### 本地缓存管理

资源文件的本地路径不参与同步（避免与桌面端不兼容），Android 端使用单独的缓存表管理：

```kotlin
// 本地资源缓存表（不参与同步）
@Entity(tableName = "resource_cache")
data class ResourceCacheEntity(
    @PrimaryKey val resourceId: String,  // 对应 items 表中的 resource id
    val localPath: String,               // 本地文件路径
    val downloadedAt: Long,              // 下载时间
    val lastAccessedAt: Long             // 最后访问时间
)

@Dao
interface ResourceCacheDao {
    @Query("SELECT * FROM resource_cache WHERE resourceId = :resourceId")
    suspend fun getByResourceId(resourceId: String): ResourceCacheEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(cache: ResourceCacheEntity)
    
    @Query("DELETE FROM resource_cache WHERE resourceId = :resourceId")
    suspend fun delete(resourceId: String)
    
    @Query("DELETE FROM resource_cache WHERE lastAccessedAt < :threshold")
    suspend fun deleteOlderThan(threshold: Long)
}
```

### 资源文件同步流程

```kotlin
class ResourceSyncManager(
    private val webDAVAdapter: WebDAVAdapter,
    private val itemsManager: ItemsManager,
    private val resourceCacheDao: ResourceCacheDao,
    private val cacheDir: File
) {
    /**
     * 上传本地资源到 WebDAV
     * @param resourceId items 表中的 resource 记录 ID
     */
    suspend fun uploadResource(resourceId: String): Result<Unit> {
        // 获取本地缓存路径
        val cache = resourceCacheDao.getByResourceId(resourceId)
            ?: return Result.failure(Exception("No local cache"))
        
        val localFile = File(cache.localPath)
        if (!localFile.exists()) return Result.failure(Exception("File not found"))
        
        // 获取 ResourcePayload 验证哈希
        val item = itemsManager.getById(resourceId)
            ?: return Result.failure(Exception("Resource item not found"))
        val payload = Json.decodeFromString<ResourcePayload>(item.payload)
        
        val data = localFile.readBytes()
        val hash = computeSHA256(data)
        
        // 验证哈希一致性
        if (hash != payload.fileHash) {
            return Result.failure(Exception("Hash mismatch"))
        }
        
        return webDAVAdapter.uploadResource(resourceId, data)
            .map { /* 更新同步状态 */ }
    }
    
    /**
     * 下载远程资源到本地缓存
     */
    suspend fun downloadResource(resourceId: String): Result<File> {
        val result = webDAVAdapter.downloadResource(resourceId)
        return result.map { data ->
            val cacheFile = File(cacheDir, resourceId)
            cacheFile.writeBytes(data)
            
            // 更新缓存记录
            val now = System.currentTimeMillis()
            resourceCacheDao.upsert(ResourceCacheEntity(
                resourceId = resourceId,
                localPath = cacheFile.absolutePath,
                downloadedAt = now,
                lastAccessedAt = now
            ))
            
            cacheFile
        }
    }
    
    /**
     * 获取资源文件（优先本地缓存，否则下载）
     */
    suspend fun getResource(resourceId: String): Result<File> {
        val cache = resourceCacheDao.getByResourceId(resourceId)
        if (cache != null) {
            val file = File(cache.localPath)
            if (file.exists()) {
                // 更新访问时间
                resourceCacheDao.upsert(cache.copy(lastAccessedAt = System.currentTimeMillis()))
                return Result.success(file)
            }
        }
        return downloadResource(resourceId)
    }
    
    /**
     * 清理过期缓存
     */
    suspend fun cleanupCache(maxAge: Long = 7 * 24 * 60 * 60 * 1000L) {
        val threshold = System.currentTimeMillis() - maxAge
        resourceCacheDao.deleteOlderThan(threshold)
        
        // 同时清理文件系统
        cacheDir.listFiles()?.forEach { file ->
            if (System.currentTimeMillis() - file.lastModified() > maxAge) {
                file.delete()
            }
        }
    }
    
    private fun computeSHA256(data: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(data).joinToString("") { "%02x".format(it) }
    }
}
```

### WebDAV 资源目录结构

```
sync_path/
├── items/           # 数据项 JSON 文件
│   ├── {uuid}.json
│   └── ...
├── resources/       # 资源文件 (图片、附件等)
│   ├── {uuid}       # 无扩展名，使用 mimeType 识别
│   └── ...
├── changes/         # 变更日志
│   └── cursor.json
└── locks/           # 同步锁
    └── sync.lock
```

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


## Desktop Compatibility Checklist

### 数据模型兼容性检查清单

以下是 Android 端与桌面端数据同步的完整兼容性检查清单：

#### ItemEntity 字段 ✅

| 字段 | 桌面端 (TypeScript) | Android (Kotlin) | JSON 字段名 |
|------|---------------------|------------------|-------------|
| id | string | String | id |
| type | ItemType | String | type |
| created_time | number | Long | created_time |
| updated_time | number | Long | updated_time |
| deleted_time | number \| null | Long? | deleted_time |
| payload | string | String | payload |
| content_hash | string | String | content_hash |
| sync_status | SyncStatus | String | sync_status |
| local_rev | number | Int | local_rev |
| remote_rev | string \| null | String? | remote_rev |
| encryption_applied | 0 \| 1 | Int | encryption_applied |
| schema_version | number | Int | schema_version |

#### ItemType 枚举值 ✅

| 值 | 桌面端 | Android @SerialName |
|----|--------|---------------------|
| note | 'note' | "note" |
| folder | 'folder' | "folder" |
| tag | 'tag' | "tag" |
| resource | 'resource' | "resource" |
| todo | 'todo' | "todo" |
| vault_entry | 'vault_entry' | "vault_entry" |
| vault_folder | 'vault_folder' | "vault_folder" |
| bookmark | 'bookmark' | "bookmark" |
| bookmark_folder | 'bookmark_folder' | "bookmark_folder" |
| diagram | 'diagram' | "diagram" |
| ai_config | 'ai_config' | "ai_config" |
| ai_conversation | 'ai_conversation' | "ai_conversation" |
| ai_message | 'ai_message' | "ai_message" |

#### Payload 字段映射 ✅

所有 Payload 使用 `@SerialName` 注解确保 JSON 字段名为 snake_case：

| Payload | 关键字段 | @SerialName 映射 |
|---------|---------|------------------|
| NotePayload | folder_id, is_pinned, is_locked, lock_password_hash | ✅ |
| TodoPayload | completed_at, due_date, reminder_time, reminder_enabled | ✅ |
| VaultEntryPayload | entry_type, folder_id, totp_secrets, custom_fields, card_*, identity_* | ✅ |
| BookmarkPayload | folder_id | ✅ |
| AIConversationPayload | system_prompt, max_tokens, created_at | ✅ |
| AIMessagePayload | conversation_id, tokens_used, created_at | ✅ |
| AIConfigPayload | default_channel, default_model | ✅ |
| AIChannel | api_url, api_key | ✅ |
| AIModel | channel_id, max_tokens, is_custom | ✅ |
| FolderPayload | parent_id | ✅ |
| ResourcePayload | mime_type, note_id, file_hash | ✅ |
| DiagramPayload | diagram_type, folder_id | ✅ |

#### 枚举值映射 ✅

| 枚举 | 桌面端值 | Android @SerialName |
|------|---------|---------------------|
| TodoQuadrant | 'urgent-important' | "urgent-important" |
| TodoQuadrant | 'not-urgent-important' | "not-urgent-important" |
| TodoQuadrant | 'urgent-not-important' | "urgent-not-important" |
| TodoQuadrant | 'not-urgent-not-important' | "not-urgent-not-important" |
| VaultEntryType | 'login' | "login" |
| VaultEntryType | 'card' | "card" |
| VaultEntryType | 'identity' | "identity" |
| VaultEntryType | 'secure_note' | "secure_note" |
| DiagramType | 'mindmap' | "mindmap" |
| DiagramType | 'flowchart' | "flowchart" |
| DiagramType | 'whiteboard' | "whiteboard" |

#### 加密参数 ✅

| 参数 | 桌面端 | Android |
|------|--------|---------|
| 算法 | aes-256-gcm | AES-256-GCM |
| 密钥长度 | 32 bytes (256 bits) | 32 bytes |
| IV 长度 | 12 bytes (96 bits) | 12 bytes |
| AuthTag 长度 | 16 bytes | 16 bytes |
| Salt 长度 | 32 bytes | 32 bytes |
| PBKDF2 迭代次数 | 100000 | 100000 |
| PBKDF2 哈希算法 | sha256 | SHA-256 |

#### EncryptedData JSON 结构 ✅

```json
{
  "ciphertext": "Base64...",
  "iv": "Base64...",
  "authTag": "Base64...",
  "salt": "Base64..."  // 可选
}
```

#### SyncConfig 字段 ✅

| 字段 | 桌面端 | Android @SerialName |
|------|--------|---------------------|
| enabled | boolean | enabled |
| type | 'webdav' \| 'server' | type |
| url | string | url |
| sync_path | string | sync_path |
| username | string? | username |
| password | string? | password |
| api_key | string? | api_key |
| encryption_enabled | boolean | encryption_enabled |
| sync_interval | number | sync_interval |
| last_sync_time | number \| null | last_sync_time |
| sync_cursor | string \| null | sync_cursor |
| sync_modules | SyncModules | sync_modules |

#### 敏感类型（始终加密） ✅

- vault_entry
- vault_folder
- ai_config

#### WebDAV 目录结构 ✅

```
sync_path/
├── items/           # 数据项 JSON 文件
├── resources/       # 资源文件
├── changes/         # 变更日志
├── locks/           # 同步锁
└── workspace.json   # 元数据
```

### 不参与同步的 Android 特有数据

以下数据仅在 Android 本地使用，不参与同步：

1. **resource_cache 表**: 资源文件本地缓存路径
2. **应用锁配置**: PIN/图案/生物识别设置
3. **UI 偏好设置**: 主题、字体大小等本地设置
