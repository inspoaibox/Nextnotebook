# Requirements Document

## Introduction

本功能解决 AI 对话数据管理和 Android 端多项功能优化问题，包括：
1. 对话删除时级联删除关联消息（解决数据孤儿问题）
2. 修复 Android 端 AI API 请求 500 错误（URL 重复追加问题）
3. Android 端 AI 界面重构（对话列表为主页面，移除侧边栏）
4. Android 端笔记编辑器增强（添加工具栏、附件/图片入口）
5. Android 端笔记长按菜单增加锁定加密功能

## Glossary

- **AI_Conversation**: AI 对话记录，包含对话标题、模型设置等
- **AI_Message**: AI 消息内容，通过 conversation_id 关联到对话
- **Desktop_Client**: Electron 桌面客户端
- **Android_Client**: Android 移动客户端
- **Soft_Delete**: 软删除，设置 deleted_time 字段而非物理删除
- **Cascade_Delete**: 级联删除，删除父记录时同时删除关联的子记录
- **Note_Editor**: 笔记编辑器组件
- **Note_Toolbar**: 笔记编辑器工具栏，包含格式化、插入等功能
- **Context_Menu**: 长按弹出的上下文菜单

## Requirements

### Requirement 1: 对话删除时级联删除关联消息

**User Story:** As a user, I want my AI messages to be automatically deleted when I delete a conversation, so that I don't have orphan data in my database.

#### Acceptance Criteria

1. WHEN a user deletes an AI conversation, THE Desktop_Client SHALL soft-delete all AI_Message items where conversation_id matches the deleted conversation
2. WHEN a user deletes an AI conversation, THE Android_Client SHALL soft-delete all AI_Message items where conversation_id matches the deleted conversation
3. WHEN cascade deletion occurs, THE System SHALL update sync_status to 'deleted' for all affected items
4. WHEN cascade deletion is synced, THE Sync_Server SHALL receive and store the deleted_time for all affected items

### Requirement 2: 修复 Android 端 AI API 请求错误

**User Story:** As an Android user, I want to use the same AI configuration that works on desktop, so that I can chat with AI on my mobile device.

#### Acceptance Criteria

1. WHEN normalizing API URL, THE Android_Client SHALL check if URL already ends with '/chat/completions' before appending
2. THE Android_Client SHALL use consistent URL format with Desktop_Client for preset channel templates
3. WHEN API request fails, THE Android_Client SHALL include response body in error message for debugging
4. THE Android_Client SHALL handle all channel types (openai, anthropic, gemini, custom) with correct URL construction
5. IF URL already contains '/chat/completions', THE normalizeApiUrl function SHALL NOT append it again

### Requirement 3: Android 端 AI 界面重构

**User Story:** As an Android user, I want to see all my AI conversations directly when opening the AI tab, so that I can quickly access any conversation without navigating through a sidebar.

#### Acceptance Criteria

1. WHEN user opens AI tab, THE Android_Client SHALL display a list of all conversations as the main view
2. THE Android_Client SHALL remove the sidebar navigation drawer for AI conversations
3. THE Android_Client SHALL display a "+" button in the top-right corner to create new conversations
4. WHEN user taps a conversation in the list, THE Android_Client SHALL navigate to the chat view for that conversation
5. THE conversation list SHALL show conversation title, model name, and last message preview
6. THE conversation list SHALL be sorted by last updated time (most recent first)
7. WHEN no conversations exist, THE Android_Client SHALL show an empty state with a "Create Conversation" button

### Requirement 4: Android 端笔记编辑器增强

**User Story:** As an Android user, I want a full-featured note editor with formatting tools and attachment support, so that I can create rich notes on my mobile device.

#### Acceptance Criteria

1. THE Android_Client Note_Editor SHALL display a Note_Toolbar above the editor area
2. THE Note_Toolbar SHALL include text formatting buttons (bold, italic, underline, strikethrough)
3. THE Note_Toolbar SHALL include heading level buttons (H1, H2, H3)
4. THE Note_Toolbar SHALL include list buttons (bullet list, numbered list, checkbox list)
5. THE Note_Toolbar SHALL include an "Insert Image" button that opens image picker
6. THE Note_Toolbar SHALL include an "Insert Attachment" button that opens file picker
7. WHEN image is selected, THE Android_Client SHALL insert the image into the note content
8. WHEN attachment is selected, THE Android_Client SHALL upload and link the attachment to the note

### Requirement 5: Android 端笔记长按菜单增加锁定功能

**User Story:** As an Android user, I want to lock and encrypt my sensitive notes, so that I can protect my private information.

#### Acceptance Criteria

1. WHEN user long-presses a note, THE Context_Menu SHALL include a "Lock/Unlock" option
2. WHEN user selects "Lock" on an unlocked note, THE Android_Client SHALL prompt for a password
3. WHEN password is confirmed, THE Android_Client SHALL encrypt the note content and set is_locked to true
4. WHEN user selects "Unlock" on a locked note, THE Android_Client SHALL prompt for the password
5. WHEN correct password is entered, THE Android_Client SHALL decrypt the note and set is_locked to false
6. THE locked note SHALL display a lock icon in the note list
7. WHEN user tries to open a locked note, THE Android_Client SHALL prompt for password before showing content
