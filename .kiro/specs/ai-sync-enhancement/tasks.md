# Implementation Tasks

## Task 1: 修复 Android 端 AI API URL 规范化 bug ✅ DONE

**Priority:** High (阻塞 AI 功能使用)

### Subtask 1.1: 修改 normalizeApiUrl 函数
- **File:** `android/app/src/main/java/com/mucheng/notes/data/remote/AIApiClient.kt`
- **Change:** 将 `endsWith` 改为 `contains` 检查
- **Lines:** 56-60

```kotlin
// 修改前
if (!normalized.endsWith("/chat/completions")) {
    normalized = "$normalized/chat/completions"
}

// 修改后
if (!normalized.contains("/chat/completions")) {
    normalized = "$normalized/chat/completions"
}
```

### Subtask 1.2: 统一预设渠道模板 URL 格式
- **File:** `android/app/src/main/java/com/mucheng/notes/presentation/screens/settings/AISettingsScreen.kt`
- **Change:** 移除预设模板中的 `/chat/completions` 后缀，与桌面端保持一致
- **Lines:** 77, 107, 117, 127, 137

需要修改的模板：
- OpenAI: `https://api.openai.com/v1/chat/completions` → `https://api.openai.com/v1`
- DeepSeek: `https://api.deepseek.com/v1/chat/completions` → `https://api.deepseek.com/v1`
- Moonshot: `https://api.moonshot.cn/v1/chat/completions` → `https://api.moonshot.cn/v1`
- 智谱: `https://open.bigmodel.cn/api/paas/v4/chat/completions` → `https://open.bigmodel.cn/api/paas/v4`
- 通义千问: `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` → `https://dashscope.aliyuncs.com/compatible-mode/v1`

---

## Task 2: 修复桌面端对话删除级联删除消息 ✅ DONE

**Priority:** High (数据一致性问题)

### Subtask 2.1: 修改 deleteConversation 函数
- **File:** `src/renderer/hooks/useAI.ts`
- **Change:** 删除对话前先删除所有关联消息
- **Lines:** 243-249

```typescript
// 修改前
const deleteConversation = useCallback(async (id: string) => {
  const success = await aiConversationsApi.delete(id);
  if (success) {
    await loadConversations();
  }
  return success;
}, [loadConversations]);

// 修改后
const deleteConversation = useCallback(async (id: string) => {
  // 1. 先删除所有关联的消息
  const messages = await aiMessagesApi.getByConversation(id);
  for (const msg of messages) {
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

---

## Task 3: 重构 Android 端 AI 界面 ✅ DONE

**Priority:** Medium (用户体验优化)

### Subtask 3.1: 创建对话列表主视图
- **File:** `android/app/src/main/java/com/mucheng/notes/presentation/screens/ai/AIScreen.kt`
- **Change:** 移除 ModalNavigationDrawer，改为条件渲染对话列表或聊天视图

主要修改：
1. 移除 `ModalNavigationDrawer` 包装
2. 添加 `selectedConversationId` 状态判断
3. 当 `selectedConversationId == null` 时显示 `ConversationListScreen`
4. 当有选中对话时显示 `ChatScreen`
5. 在 TopAppBar 右侧添加 "+" 按钮创建新对话

### Subtask 3.2: 实现 ConversationListScreen 组件
- **File:** `android/app/src/main/java/com/mucheng/notes/presentation/screens/ai/AIScreen.kt`
- **Change:** 添加新的 Composable 函数

功能：
- 显示对话列表（LazyColumn）
- 每项显示：标题、模型名、最后消息预览
- 按更新时间倒序排列
- 空状态显示创建按钮
- 长按删除对话

### Subtask 3.3: 修改 ChatScreen 添加返回按钮
- **File:** `android/app/src/main/java/com/mucheng/notes/presentation/screens/ai/AIScreen.kt`
- **Change:** 在聊天视图 TopAppBar 添加返回按钮

---

## Task 4: Android 端笔记编辑器工具栏 ✅ DONE

**Priority:** Medium (功能增强)

### Subtask 4.1: 创建 NoteToolbar 组件
- **File:** `android/app/src/main/java/com/mucheng/notes/presentation/components/NoteToolbar.kt` (新建)
- **Change:** 创建可复用的编辑器工具栏组件

功能按钮：
- 格式化：粗体、斜体、下划线、删除线
- 标题：H1、H2、H3
- 列表：无序列表、有序列表、复选框
- 插入：图片、附件

### Subtask 4.2: 集成工具栏到 NoteDetailScreen
- **File:** `android/app/src/main/java/com/mucheng/notes/presentation/screens/notes/NoteDetailScreen.kt`
- **Change:** 在编辑区域上方添加 NoteToolbar

### Subtask 4.3: 实现 Markdown 插入逻辑
- **File:** `android/app/src/main/java/com/mucheng/notes/presentation/viewmodel/NoteDetailViewModel.kt`
- **Change:** 添加 insertMarkdown 和 insertPrefix 方法

---

## Task 5: Android 端笔记锁定功能 ✅ DONE

**Priority:** Medium (安全功能)

### Subtask 5.1: 添加锁定/解锁菜单项
- **File:** `android/app/src/main/java/com/mucheng/notes/presentation/screens/notes/NotesScreen.kt`
- **Change:** 在笔记长按菜单中添加锁定/解锁选项

### Subtask 5.2: 实现锁定/解锁对话框
- **File:** `android/app/src/main/java/com/mucheng/notes/presentation/screens/notes/NotesScreen.kt`
- **Change:** 添加密码输入对话框

### Subtask 5.3: 实现 ViewModel 锁定逻辑
- **File:** `android/app/src/main/java/com/mucheng/notes/presentation/viewmodel/NotesViewModel.kt`
- **Change:** 添加 lockNote 和 unlockNote 方法

使用现有 CryptoEngineImpl 进行加密：
- 加密内容使用 AES-GCM
- 密码哈希使用 PBKDF2

### Subtask 5.4: 显示锁定图标
- **File:** `android/app/src/main/java/com/mucheng/notes/presentation/screens/notes/NotesScreen.kt`
- **Change:** 在笔记列表项中显示锁定图标

### Subtask 5.5: 打开锁定笔记时验证密码
- **File:** `android/app/src/main/java/com/mucheng/notes/presentation/screens/notes/NoteDetailScreen.kt`
- **Change:** 检测锁定状态，显示密码验证对话框

---

## Implementation Order

1. **Task 1** (Subtask 1.1 → 1.2) - 修复 AI API 500 错误，最高优先级
2. **Task 2** (Subtask 2.1) - 修复级联删除，数据一致性
3. **Task 3** (Subtask 3.1 → 3.2 → 3.3) - AI 界面重构
4. **Task 4** (Subtask 4.1 → 4.2 → 4.3) - 笔记工具栏
5. **Task 5** (Subtask 5.1 → 5.2 → 5.3 → 5.4 → 5.5) - 笔记锁定

---

## Testing Checklist

- [x] Task 1: 测试各渠道 AI 对话功能正常（修复 URL 规范化）
- [x] Task 2: 删除对话后确认消息也被删除（桌面端级联删除）
- [x] Task 3: AI 界面导航流畅，对话列表正确显示（移除侧边栏）
- [x] Task 4: 工具栏按钮正确插入 Markdown 语法
- [x] Task 5: 锁定/解锁功能正常，密码验证正确
