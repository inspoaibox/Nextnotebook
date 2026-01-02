# Requirements Document

## Introduction

暮城笔记 Android 移动客户端是桌面端应用的移动版本，通过 WebDAV 同步实现跨设备数据一致性。支持笔记、书签、待办事项、智能助理和密码库五大核心功能，兼容加密和明文两种同步模式。

## Glossary

- **Android_App**: 暮城笔记 Android 移动客户端应用
- **Sync_Engine**: 数据同步引擎，负责与 WebDAV 服务器的数据同步
- **Crypto_Engine**: 加密引擎，使用 AES-256-GCM 算法加密敏感数据
- **Items_Manager**: 数据管理器，负责本地 SQLite 数据库的 CRUD 操作
- **WebDAV_Adapter**: WebDAV 适配器，实现与 WebDAV 服务器的通信
- **ItemBase**: 统一数据模型，所有可同步实体的基础类型
- **Payload**: 业务数据 JSON 字符串，存储在 ItemBase 中
- **Content_Hash**: 内容哈希，用于快速检测数据变更
- **Sync_Status**: 同步状态（clean/modified/deleted/conflict）
- **Sensitive_Types**: 敏感数据类型（vault_entry, vault_folder, ai_config），始终加密

## Requirements

### Requirement 1: 数据模型兼容

**User Story:** As a user, I want the Android app to use the same data model as the desktop app, so that my data can sync seamlessly between devices.

#### Acceptance Criteria

1. THE Android_App SHALL implement ItemBase data model with identical fields: id, type, created_time, updated_time, deleted_time, payload, content_hash, sync_status, local_rev, remote_rev, encryption_applied, schema_version
2. THE Android_App SHALL support all ItemType values: note, folder, tag, resource, todo, vault_entry, vault_folder, bookmark, bookmark_folder, diagram, ai_config, ai_conversation, ai_message
3. THE Android_App SHALL implement identical Payload structures for each ItemType as defined in desktop app
4. THE Android_App SHALL use UUID v4 for generating item IDs
5. THE Android_App SHALL compute content_hash using SHA-256 algorithm (first 16 characters)

### Requirement 2: WebDAV 同步

**User Story:** As a user, I want to sync my data via WebDAV, so that I can access the same content on both desktop and mobile devices.

#### Acceptance Criteria

1. WHEN configuring sync, THE Android_App SHALL allow input of WebDAV URL, username, password, and sync path
2. WHEN testing connection, THE Android_App SHALL verify WebDAV server accessibility and create required directory structure (items/, resources/, changes/, locks/)
3. WHEN syncing, THE Sync_Engine SHALL acquire lock before sync and release after completion
4. WHEN pushing changes, THE Sync_Engine SHALL upload items with sync_status 'modified' or 'deleted'
5. WHEN pulling changes, THE Sync_Engine SHALL download remote changes and apply to local database
6. WHEN conflict occurs, THE Sync_Engine SHALL create conflict copy with "(冲突副本)" suffix
7. THE Android_App SHALL support sync_modules configuration to selectively sync: notes, bookmarks, vault, diagrams, todos, ai

### Requirement 3: 同步模式配置

**User Story:** As a user, I want to choose between encrypted and plaintext sync modes, so that I can balance security and convenience based on my needs.

#### Acceptance Criteria

1. THE Android_App SHALL support two sync modes: encrypted (加密模式) and plaintext (明文模式)
2. WHEN configuring sync, THE Android_App SHALL allow user to choose encryption_enabled (true/false)
3. WHEN encryption_enabled is true, THE Android_App SHALL require user to set sync password
4. WHEN encryption_enabled is false, THE Android_App SHALL sync data in plaintext (except sensitive types)
5. WHEN syncing sensitive types (vault_entry, vault_folder, ai_config), THE Sync_Engine SHALL always encrypt regardless of encryption_enabled setting
6. THE Android_App SHALL display current sync mode in settings (加密同步/明文同步)
7. IF user changes sync mode, THEN THE Android_App SHALL warn about re-sync requirement

### Requirement 4: 加密引擎

**User Story:** As a user, I want my encrypted data to be secure and compatible with desktop app, so that I can sync safely across devices.

#### Acceptance Criteria

1. WHEN encryption is enabled, THE Crypto_Engine SHALL derive key from password using PBKDF2 with 100,000 iterations and SHA-256
2. THE Crypto_Engine SHALL use AES-256-GCM algorithm with 12-byte IV and 16-byte auth tag
3. THE Crypto_Engine SHALL use 32-byte key length (256 bits) and 32-byte salt
4. WHEN encrypting payload, THE Crypto_Engine SHALL output JSON with ciphertext, iv, authTag (all Base64 encoded)
5. THE Crypto_Engine SHALL generate key_identifier (first 16 chars of SHA-256 key hash) for verifying key match
6. IF encryption key mismatch is detected during sync, THEN THE Sync_Engine SHALL abort and show "同步密钥不匹配" error
7. THE Crypto_Engine SHALL be fully compatible with desktop CryptoEngine implementation

### Requirement 5: 笔记功能

**User Story:** As a user, I want to create, edit, and organize notes on my phone, so that I can capture ideas anywhere.

#### Acceptance Criteria

1. THE Android_App SHALL display notes list with title, preview, and updated time
2. WHEN viewing notes, THE Android_App SHALL support folder-based organization
3. THE Android_App SHALL support creating, editing, and deleting notes
4. THE Android_App SHALL support rich text content display (HTML from TinyMCE)
5. THE Android_App SHALL support note pinning (is_pinned field)
6. THE Android_App SHALL support note locking with password (is_locked, lock_password_hash)
7. THE Android_App SHALL support tags for notes organization
8. WHEN a note is deleted, THE Android_App SHALL perform soft delete (set deleted_time)

### Requirement 6: 书签功能

**User Story:** As a user, I want to manage my bookmarks on mobile, so that I can access saved links anywhere.

#### Acceptance Criteria

1. THE Android_App SHALL display bookmarks with name, URL, description, and icon
2. THE Android_App SHALL support bookmark folders with hierarchical structure (parent_id)
3. THE Android_App SHALL support creating, editing, and deleting bookmarks
4. WHEN tapping a bookmark, THE Android_App SHALL open URL in browser
5. THE Android_App SHALL support bookmark tags for organization

### Requirement 7: 待办事项功能

**User Story:** As a user, I want to manage my todos with the four-quadrant system on mobile, so that I can prioritize tasks effectively.

#### Acceptance Criteria

1. THE Android_App SHALL display todos in four quadrants: urgent-important, not-urgent-important, urgent-not-important, not-urgent-not-important
2. THE Android_App SHALL support creating todos with title, description, quadrant, due_date, and priority
3. WHEN completing a todo, THE Android_App SHALL set completed=true and completed_at timestamp
4. THE Android_App SHALL support todo reminders with reminder_time and reminder_enabled
5. WHEN reminder_enabled is true and reminder_time is reached, THE Android_App SHALL show notification
6. THE Android_App SHALL support drag-and-drop to change todo quadrant and priority

### Requirement 8: 智能助理功能

**User Story:** As a user, I want to chat with AI assistants on mobile, so that I can get help anywhere.

#### Acceptance Criteria

1. THE Android_App SHALL display AI conversations list with title and last message preview
2. THE Android_App SHALL support creating new conversations with configurable model, system_prompt, temperature, max_tokens
3. THE Android_App SHALL display conversation messages with role (user/assistant/system) distinction
4. WHEN sending message, THE Android_App SHALL call configured AI API and display streaming response
5. THE Android_App SHALL sync AI configuration (channels, models, API keys) from ai_config item
6. THE Android_App SHALL support multiple AI channels (OpenAI, Anthropic, custom)

### Requirement 9: 密码库功能

**User Story:** As a user, I want to securely access my passwords on mobile, so that I can log into services anywhere.

#### Acceptance Criteria

1. THE Android_App SHALL require master password or biometric authentication to access vault
2. THE Android_App SHALL display vault entries organized by folders
3. THE Android_App SHALL support four entry types: login, card, identity, secure_note
4. THE Android_App SHALL display entry details: username, password (masked), TOTP codes, URIs, custom fields
5. WHEN viewing password, THE Android_App SHALL require re-authentication
6. THE Android_App SHALL support copying username, password, and TOTP code to clipboard
7. THE Android_App SHALL auto-clear clipboard after 30 seconds for sensitive data
8. THE Android_App SHALL generate TOTP codes from totp_secrets with 30-second refresh

### Requirement 10: 本地数据存储

**User Story:** As a user, I want my data stored securely on my device, so that I can access it offline.

#### Acceptance Criteria

1. THE Android_App SHALL use SQLite database with single 'items' table matching desktop schema
2. THE Android_App SHALL store database in app's private storage directory
3. THE Android_App SHALL encrypt database file using SQLCipher when vault is accessed
4. WHEN app is offline, THE Android_App SHALL allow full read/write access to local data
5. WHEN app comes online, THE Android_App SHALL queue changes for next sync

### Requirement 11: 用户界面

**User Story:** As a user, I want a clean and intuitive mobile interface, so that I can use the app efficiently.

#### Acceptance Criteria

1. THE Android_App SHALL use Material Design 3 components
2. THE Android_App SHALL support bottom navigation for main modules: Notes, Bookmarks, Todos, AI, Vault
3. THE Android_App SHALL support dark/light theme matching system setting
4. THE Android_App SHALL support Chinese (zh_CN) language
5. THE Android_App SHALL display sync status indicator in toolbar
6. WHEN sync is in progress, THE Android_App SHALL show progress indicator
7. THE Android_App SHALL support pull-to-refresh for manual sync trigger

### Requirement 12: 安全性

**User Story:** As a user, I want my sensitive data protected, so that unauthorized access is prevented.

#### Acceptance Criteria

1. THE Android_App SHALL support app lock with PIN, pattern, or biometric (fingerprint/face)
2. WHEN app lock is enabled, THE Android_App SHALL require authentication on app launch
3. THE Android_App SHALL clear sensitive data from memory when app goes to background
4. THE Android_App SHALL prevent screenshots in vault and sensitive screens
5. THE Android_App SHALL use Android Keystore for storing encryption keys
6. THE Android_App SHALL implement certificate pinning for API communications

### Requirement 13: 生物识别解锁

**User Story:** As a user, I want to unlock the app with fingerprint or face recognition, so that I can access my data quickly and securely.

#### Acceptance Criteria

1. THE Android_App SHALL detect available biometric capabilities (fingerprint, face, iris)
2. WHEN biometric hardware is available, THE Android_App SHALL offer biometric unlock option in settings
3. WHEN enabling biometric unlock, THE Android_App SHALL require current PIN/pattern verification first
4. WHEN biometric unlock is enabled, THE Android_App SHALL show biometric prompt on app launch
5. IF biometric authentication fails 3 times, THEN THE Android_App SHALL fallback to PIN/pattern
6. THE Android_App SHALL use BiometricPrompt API with BIOMETRIC_STRONG authenticator
7. WHEN accessing vault, THE Android_App SHALL require biometric re-authentication even if app is unlocked
8. THE Android_App SHALL support biometric unlock for auto-fill service

### Requirement 14: 系统手势支持

**User Story:** As a user, I want the app to work smoothly with Android system gestures, so that I have a native navigation experience.

#### Acceptance Criteria

1. THE Android_App SHALL support edge-to-edge display with proper insets handling
2. THE Android_App SHALL support system back gesture (swipe from edge)
3. WHEN back gesture is triggered, THE Android_App SHALL navigate back or close current screen appropriately
4. THE Android_App SHALL support predictive back gesture animation (Android 13+)
5. THE Android_App SHALL handle gesture conflicts in swipeable components (ViewPager, DrawerLayout)
6. THE Android_App SHALL support home gesture and recent apps gesture without interference
7. THE Android_App SHALL adapt to different navigation modes (3-button, 2-button, gesture)

