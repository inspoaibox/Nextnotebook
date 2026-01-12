# Design Document

## Overview

本设计文档描述了 AI 数据同步增强和 Android 端功能优化的技术实现方案。主要包括：
1. 级联删除机制确保数据一致性
2. 修复 Android 端 AI API URL 构建问题
3. 重构 Android 端 AI 界面为对话列表主视图
4. 增强 Android 端笔记编辑器功能
5. 添加 Android 端笔记加密锁定功能

## Architecture

### 数据流架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Sync Server                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   items     │  │   changes   │  │  resources  │              │
│  │ (all types) │  │    log      │  │   (files)   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Sync API
                              ▼
┌─────────────────┐                    ┌─────────────────┐
│  Desktop Client │                    │  Android Client │
│  ┌───────────┐  │                    │  ┌───────────┐  │
│  │ ItemsDB   │  │                    │  │ ItemsDB   │  │
│  │ (SQLite)  │  │                    │  │ (Room)    │  │
│  └───────────┘  │                    │  └───────────┘  │
│  ┌───────────┐  │                    │  ┌───────────┐  │
│  │ AI Module │  │                    │  │ AI Module │  │
│  │ - Config  │  │                    │  │ - Config  │  │
│  │ - Conv    │  │                    │  │ - Conv    │  │
│  │ - Message │  │                    │  │ - Message │  │
│  └───────────┘  │                    │  └───────────┘  │
└─────────────────┘                    └─────────────────┘
```

## Components and Interfaces

### 1. 级联删除组件

#### Desktop Client (TypeScript)

当前实现（需要修改）：
```typescript
// src/renderer/hooks/useAI.ts - 当前只删除对话，不删除消息
const deleteConversation = useCallback(async (id: string) => {
  const success = await aiConversationsApi.delete(id);
  // 缺少：删除关联的消息
  return success;
}, []);
```

修改后：
```typescript
// src/renderer/hooks/useAI.ts
const deleteConversation = useCallback(async (id: string) => {
  // 1. 先删除所有关联的消息
  const allMessages = await aiMessagesApi.getByConversation(id);
  for (const msg of allMessages) {
    await aiMessagesApi.delete(msg.id);
  }
  // 2. 再删除对话本身
  const success = await aiConversationsApi.delete(id);
  if (success) {
    await loadConversations();
  }
  return success;
}, [loadConversations]);
```

#### Android Client (Kotlin)

当前实现（已正确实现级联删除）：
```kotlin
// AIViewModel.kt - 已实现级联删除
fun deleteConversation(conversationId: String) {
    viewModelScope.launch {
        // 1. 删除所有关联的消息
        messages.value.filter { it.conversationId == conversationId }.forEach { message ->
            itemRepository.softDelete(message.id)
        }
        // 2. 删除对话本身
        itemRepository.softDelete(conversationId)
    }
}
```

### 2. AI API Client 修复

#### Android Client URL 规范化

当前实现（有 bug）：
```kotlin
// AIApiClient.kt
private fun normalizeApiUrl(url: String): String {
    var normalized = url.trim()
    if (normalized.endsWith("/")) {
        normalized = normalized.dropLast(1)
    }
    // BUG: 没有检查 URL 是否已包含 /chat/completions
    if (!normalized.endsWith("/chat/completions")) {
        normalized = "$normalized/chat/completions"
    }
    return normalized
}
```

修改后：
```kotlin
// AIApiClient.kt
private fun normalizeApiUrl(url: String): String {
    var normalized = url.trim()
    if (normalized.endsWith("/")) {
        normalized = normalized.dropLast(1)
    }
    // 修复：检查 URL 是否已包含 /chat/completions（可能在中间或末尾）
    if (!normalized.contains("/chat/completions")) {
        normalized = "$normalized/chat/completions"
    }
    return normalized
}
```

同时需要统一预设模板 URL 格式（与桌面端一致，不包含 /chat/completions）：
```kotlin
// AISettingsScreen.kt - 修改预设模板
val CHANNEL_TEMPLATES = listOf(
    AIChannel(
        id = "openai",
        name = "OpenAI",
        type = AIChannelType.OPENAI.name,
        apiUrl = "https://api.openai.com/v1",  // 移除 /chat/completions
        // ...
    ),
    // 其他渠道同理
)
```

### 3. AI 界面组件 (Android)

当前实现：使用 ModalNavigationDrawer 侧边栏显示对话列表

修改后结构：
```kotlin
// AIScreen.kt - 重构为对话列表主视图
@Composable
fun AIScreen(...) {
    // 移除 ModalNavigationDrawer
    // 根据是否选中对话显示不同视图
    if (selectedConversationId == null) {
        // 主视图：对话列表
        ConversationListScreen(
            conversations = conversations,
            onConversationClick = { viewModel.selectConversation(it.id) },
            onCreateClick = { showCreateDialog = true },
            onDeleteClick = { viewModel.deleteConversation(it.id) }
        )
    } else {
        // 聊天视图
        ChatScreen(
            conversation = currentConversation,
            messages = messages,
            onBack = { viewModel.selectConversation(null) },
            onSend = { viewModel.sendMessage(it) },
            onSettingsClick = { showSettingsDialog = true }
        )
    }
}

@Composable
fun ConversationListScreen(
    conversations: List<ConversationItem>,
    onConversationClick: (ConversationItem) -> Unit,
    onCreateClick: () -> Unit,
    onDeleteClick: (ConversationItem) -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("AI 助手") },
                actions = {
                    IconButton(onClick = onCreateClick) {
                        Icon(Icons.Default.Add, "新建对话")
                    }
                }
            )
        }
    ) { padding ->
        if (conversations.isEmpty()) {
            EmptyStateView(onCreateClick = onCreateClick)
        } else {
            LazyColumn(contentPadding = padding) {
                items(conversations) { conversation ->
                    ConversationListItem(
                        conversation = conversation,
                        onClick = { onConversationClick(conversation) },
                        onDelete = { onDeleteClick(conversation) }
                    )
                }
            }
        }
    }
}
```

### 4. 笔记编辑器组件 (Android)

当前实现：NoteDetailScreen 只有基础的 TextField 编辑

修改后结构：
```kotlin
// NoteDetailScreen.kt - 添加工具栏
@Composable
fun NoteDetailScreen(...) {
    Scaffold(
        topBar = { /* 现有 TopAppBar */ }
    ) { padding ->
        Column(modifier = Modifier.padding(padding)) {
            // 新增：编辑器工具栏
            NoteToolbar(
                onBoldClick = { insertMarkdown("**", "**") },
                onItalicClick = { insertMarkdown("*", "*") },
                onUnderlineClick = { insertMarkdown("<u>", "</u>") },
                onStrikethroughClick = { insertMarkdown("~~", "~~") },
                onH1Click = { insertPrefix("# ") },
                onH2Click = { insertPrefix("## ") },
                onH3Click = { insertPrefix("### ") },
                onBulletListClick = { insertPrefix("- ") },
                onNumberListClick = { insertPrefix("1. ") },
                onCheckboxClick = { insertPrefix("- [ ] ") },
                onImageClick = { showImagePicker = true },
                onAttachmentClick = { showFilePicker = true }
            )
            
            // 现有编辑区域
            TextField(
                value = content,
                onValueChange = { content = it },
                // ...
            )
        }
    }
}

@Composable
fun NoteToolbar(
    onBoldClick: () -> Unit,
    onItalicClick: () -> Unit,
    // ... 其他回调
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        // 格式化按钮
        ToolbarButton(icon = Icons.Default.FormatBold, onClick = onBoldClick)
        ToolbarButton(icon = Icons.Default.FormatItalic, onClick = onItalicClick)
        // ... 其他按钮
        
        Divider(modifier = Modifier.height(24.dp).width(1.dp))
        
        // 插入按钮
        ToolbarButton(icon = Icons.Default.Image, onClick = onImageClick)
        ToolbarButton(icon = Icons.Default.AttachFile, onClick = onAttachmentClick)
    }
}
```

### 5. 笔记加密组件 (Android)

当前实现：NotePayload 已有 is_locked 和 lock_password_hash 字段，但 UI 未实现

需要添加的组件：
```kotlin
// NotesScreen.kt - 长按菜单添加锁定选项
@Composable
fun NoteContextMenu(
    note: NoteItem,
    onPin: () -> Unit,
    onMove: () -> Unit,
    onLock: () -> Unit,    // 新增
    onDelete: () -> Unit
) {
    DropdownMenu(...) {
        DropdownMenuItem(
            text = { Text("置顶") },
            onClick = onPin
        )
        DropdownMenuItem(
            text = { Text("移动到文件夹") },
            onClick = onMove
        )
        // 新增：锁定/解锁选项
        DropdownMenuItem(
            text = { Text(if (note.isLocked) "解锁" else "锁定") },
            leadingIcon = { 
                Icon(
                    if (note.isLocked) Icons.Default.LockOpen else Icons.Default.Lock,
                    null
                )
            },
            onClick = onLock
        )
        DropdownMenuItem(
            text = { Text("删除") },
            onClick = onDelete
        )
    }
}

// NotesViewModel.kt - 添加锁定/解锁方法
class NotesViewModel @Inject constructor(
    private val itemRepository: ItemRepository,
    private val cryptoEngine: CryptoEngine  // 使用现有加密引擎
) : ViewModel() {
    
    suspend fun lockNote(noteId: String, password: String): Boolean {
        val note = itemRepository.getById(noteId) ?: return false
        val payload = json.decodeFromString<NotePayload>(note.payload)
        
        // 使用 CryptoEngine 加密内容
        val encryptedContent = cryptoEngine.encrypt(payload.content, password)
        val passwordHash = cryptoEngine.hashPassword(password)
        
        val updatedPayload = payload.copy(
            content = encryptedContent,
            is_locked = true,
            lock_password_hash = passwordHash
        )
        
        itemRepository.update(noteId, json.encodeToString(updatedPayload))
        return true
    }
    
    suspend fun unlockNote(noteId: String, password: String): Boolean {
        val note = itemRepository.getById(noteId) ?: return false
        val payload = json.decodeFromString<NotePayload>(note.payload)
        
        // 验证密码
        if (!cryptoEngine.verifyPassword(password, payload.lock_password_hash ?: "")) {
            return false
        }
        
        // 解密内容
        val decryptedContent = cryptoEngine.decrypt(payload.content, password)
        
        val updatedPayload = payload.copy(
            content = decryptedContent,
            is_locked = false,
            lock_password_hash = null
        )
        
        itemRepository.update(noteId, json.encodeToString(updatedPayload))
        return true
    }
}
```

## Data Models

### AI 相关数据模型（已存在，保持一致）

```typescript
// 桌面端和 Android 端使用相同的 payload 结构
interface AIConversationPayload {
  title: string;
  model: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  created_at: number;
}

interface AIMessagePayload {
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string;
  tokens_used?: number;
  created_at: number;
}
```

### 笔记加密相关（已存在于 NotePayload）

```typescript
interface NotePayload {
  title: string;
  content: string;
  folder_id: string | null;
  is_pinned: boolean;
  is_locked: boolean;           // 是否锁定
  lock_password_hash: string | null;  // 密码哈希
  tags: string[];
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Cascade Delete Completeness

*For any* AI conversation with associated messages, when the conversation is deleted, all messages with matching conversation_id SHALL have deleted_time set to a non-null value.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: URL Normalization Idempotence

*For any* API URL string, applying normalizeApiUrl twice SHALL produce the same result as applying it once (no double append of '/chat/completions').

**Validates: Requirements 2.1, 2.5**

### Property 3: Channel Type URL Construction

*For any* channel type (openai, anthropic, gemini, custom), the constructed API URL SHALL match the expected format for that channel type.

**Validates: Requirements 2.4**

### Property 4: Conversation List Ordering

*For any* list of conversations, the displayed order SHALL be sorted by updated_time in descending order (most recent first).

**Validates: Requirements 3.6**

### Property 5: Conversation List Content

*For any* conversation in the list, the displayed item SHALL contain the conversation title, model name, and last message preview.

**Validates: Requirements 3.5**

### Property 6: Note Lock Round-Trip

*For any* note, locking with a password and then unlocking with the same password SHALL restore the note to its original unlocked state with identical content.

**Validates: Requirements 5.3, 5.5**

### Property 7: Sync Status After Cascade Delete

*For any* item affected by cascade deletion, the sync_status SHALL be set to 'deleted'.

**Validates: Requirements 1.3**

## Error Handling

### AI API Errors

1. **URL Construction Errors**
   - Invalid URL format: Display user-friendly error message
   - Network timeout: Retry with exponential backoff (max 3 retries)
   - HTTP 4xx errors: Display API error message from response body
   - HTTP 5xx errors: Display server error with retry option

2. **Cascade Delete Errors**
   - Database transaction failure: Rollback all changes
   - Partial delete: Log error and mark items for retry

### Note Encryption Errors

1. **Lock Errors**
   - Empty password: Reject with validation message
   - Encryption failure: Display error, keep note unlocked

2. **Unlock Errors**
   - Wrong password: Display error, increment attempt counter
   - Decryption failure: Display error, keep note locked

## Testing Strategy

### Unit Tests

1. **URL Normalization Tests**
   - Test various URL formats (with/without trailing slash, with/without /chat/completions)
   - Test all channel types

2. **Cascade Delete Tests**
   - Test delete with 0, 1, many messages
   - Test sync_status update

3. **Note Lock/Unlock Tests**
   - Test password hashing
   - Test encryption/decryption

### Property-Based Tests

Using property-based testing framework (fast-check for TypeScript, Kotest for Kotlin):

1. **URL Normalization Property Test**
   - Generate random URLs
   - Verify idempotence property

2. **Cascade Delete Property Test**
   - Generate conversations with random number of messages
   - Verify all messages are deleted

3. **Note Lock Round-Trip Property Test**
   - Generate random note content and passwords
   - Verify round-trip preserves content

### Integration Tests

1. **Sync Integration**
   - Test cascade delete syncs correctly to server
   - Test AI config sync between devices

2. **UI Integration**
   - Test conversation list navigation
   - Test note toolbar actions
