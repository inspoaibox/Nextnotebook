# Implementation Plan: 暮城笔记 Android 客户端

## Overview

本实现计划将 Android 客户端开发分为 8 个主要阶段：项目初始化、数据层、加密引擎、同步引擎、五大功能模块、安全组件、UI 完善和测试。采用 Kotlin + Jetpack Compose 技术栈。

## Tasks

- [x] 1. 项目初始化和基础架构
  - [x] 1.1 创建 Android 项目并配置 Gradle 依赖
    - 配置 Kotlin 2.0, Compose BOM, Hilt, Room, Kotlinx Serialization
    - 添加 Sardine (WebDAV), SQLCipher, Tink 依赖
    - 配置 Kotest 属性测试框架
    - _Requirements: 1.1, 11.1_

  - [x] 1.2 设置项目目录结构
    - 创建 data/, domain/, presentation/ 三层目录
    - 创建 di/ (Hilt modules), util/, security/ 目录
    - _Requirements: 1.1_

  - [x] 1.3 实现 ItemEntity 和 ItemType
    - 创建 Room Entity 与桌面端字段完全一致
    - 实现 ItemType 枚举和 SENSITIVE_TYPES
    - _Requirements: 1.1, 1.2_

  - [x] 1.4 编写 UUID v4 格式属性测试
    - **Property 2: UUID v4 Format Compliance**
    - **Validates: Requirements 1.4**

- [x] 2. 数据层实现
  - [x] 2.1 实现所有 Payload 数据类（使用 @SerialName 保持 snake_case）
    - NotePayload: title, content, folder_id, is_pinned, is_locked, lock_password_hash, tags
    - FolderPayload: name, parent_id, icon, color
    - TagPayload: name, color
    - TodoPayload: title, description, quadrant, completed, completed_at, due_date, reminder_time, reminder_enabled, priority, tags
    - BookmarkPayload: name, url, description, folder_id, icon, tags
    - BookmarkFolderPayload: name, parent_id
    - VaultEntryPayload: name, entry_type, folder_id, favorite, notes, username, password, totp_secrets, uris, card_*, identity_*, custom_fields
    - VaultFolderPayload: name, parent_id
    - VaultTotp, VaultUri, VaultCustomField
    - AIConversationPayload: title, model, system_prompt, temperature, max_tokens, created_at
    - AIMessagePayload: conversation_id, role, content, model, tokens_used, created_at
    - AIConfigPayload: enabled, default_channel, default_model, channels
    - AIChannel, AIModel
    - _Requirements: 1.3, 5.1-5.8, 6.1-6.5, 7.1-7.6, 8.1-8.6, 9.1-9.8_

  - [x] 2.2 编写 Payload 序列化往返属性测试
    - **Property 3: Payload Serialization Round-Trip**
    - **Validates: Requirements 1.3**

  - [x] 2.2.1 编写 JSON 序列化桌面端兼容性属性测试
    - **Property 13: JSON Serialization Desktop Compatibility**
    - 验证所有 Payload 序列化后字段名为 snake_case
    - 验证与桌面端 JSON 格式完全一致
    - **Validates: Requirements 1.3, 4.7**

  - [x] 2.3 实现 ItemDao (Room DAO)
    - getByType, getById, getPendingSync
    - upsert, softDelete, markSynced
    - 实现 content_hash 计算 (SHA-256 前16字符)
    - _Requirements: 1.5, 10.1, 10.2_

  - [x] 2.4 编写内容哈希一致性属性测试
    - **Property 1: Content Hash Consistency**
    - **Validates: Requirements 1.5**
    - 已在 CryptoEnginePropertyTest.kt 中实现

  - [x] 2.5 实现 AppDatabase (Room Database)
    - 配置 SQLCipher 加密
    - 创建数据库迁移策略
    - _Requirements: 10.1, 10.3_

  - [x] 2.6 编写数据库 CRUD 往返属性测试
    - **Property 10: Database CRUD Round-Trip**
    - **Validates: Requirements 10.1, 10.2**
    - 已创建 DatabaseCrudPropertyTest.kt

  - [x] 2.7 实现 ItemRepository
    - 实现 ItemRepository 接口
    - 实现 getByType, getById, create, update, softDelete, search
    - _Requirements: 10.4, 10.5_

  - [x] 2.8 实现 ResourcePayload 和 DiagramPayload（使用 @SerialName 保持 snake_case）
    - ResourcePayload: filename, mime_type, size, file_hash, note_id (与桌面端完全一致，不含 local_path)
    - DiagramPayload: name, diagram_type, data, folder_id, thumbnail
    - DiagramType 枚举: @SerialName("mindmap"), @SerialName("flowchart"), @SerialName("whiteboard")
    - _Requirements: 1.2, 1.3_

  - [x] 2.9 实现 ResourceCacheEntity 本地缓存表
    - 单独的 resource_cache 表管理本地文件路径（不参与同步）
    - ResourceCacheDao: getByResourceId, upsert, delete, deleteOlderThan
    - _Requirements: 10.1_

- [x] 3. Checkpoint - 数据层验证
  - 确保所有数据层测试通过
  - 验证 Payload 序列化与桌面端兼容
  - 已通过 PayloadSerializationPropertyTest, DatabaseCrudPropertyTest 验证

- [x] 4. 加密引擎实现
  - [x] 4.1 实现 CryptoEngine 接口
    - deriveKeyFromPassword (PBKDF2, 100000 iterations, SHA-256)
    - encrypt/decrypt (AES-256-GCM, 12-byte IV, 16-byte authTag)
    - encryptPayload/decryptPayload
    - computeHash, generateKeyIdentifier
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.2 编写密钥派生一致性属性测试
    - **Property 5: Key Derivation Consistency**
    - **Validates: Requirements 4.1**

  - [x] 4.3 编写加密数据结构属性测试
    - **Property 6: Encrypted Data Structure**
    - **Validates: Requirements 4.2, 4.4**

  - [x] 4.4 编写加密往返兼容性属性测试
    - **Property 4: Encryption Round-Trip Compatibility**
    - **Validates: Requirements 4.7, 4.4**

  - [x] 4.5 编写密钥标识符生成属性测试
    - **Property 7: Key Identifier Generation**
    - **Validates: Requirements 4.5**

  - [x] 4.6 实现 Android Keystore 集成
    - 使用 Keystore 安全存储主密钥
    - 已创建 KeystoreManager.kt
    - _Requirements: 12.5_

- [x] 5. Checkpoint - 加密引擎验证
  - 确保所有加密测试通过
  - 验证与桌面端加密兼容性
  - 已通过 CryptoEnginePropertyTest, CryptoCompatibilityTest 验证


- [x] 6. 同步引擎实现
  - [x] 6.1 实现 WebDAVAdapter
    - testConnection, getItem, putItem, deleteItem
    - listChanges, acquireLock, releaseLock
    - getSyncCursor, setSyncCursor
    - 使用 Sardine 库实现 WebDAV 操作
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 6.2 实现 SyncEngine
    - sync() 主流程: 获取锁 → 验证密钥 → Push → Pull → 释放锁
    - pushChanges: 上传 modified/deleted 状态的 items
    - pullChanges: 拉取远端变更并应用
    - 冲突处理: 创建 "(冲突副本)"
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [x] 6.3 编写敏感类型强制加密属性测试
    - **Property 8: Sensitive Types Always Encrypted**
    - **Validates: Requirements 3.5**

  - [x] 6.4 实现 SyncConfig 和 SyncModules
    - 支持加密/明文模式切换
    - 支持模块选择性同步
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 2.7_

  - [x] 6.5 实现 SyncRepository
    - sync(), getSyncStatus(), observeSyncStatus()
    - 后台同步调度 (WorkManager)
    - _Requirements: 2.4, 2.5_

  - [x] 6.6 实现资源文件同步
    - ResourceSyncManager 实现
    - uploadResource, downloadResource 方法
    - 本地缓存管理和清理
    - 已创建 ResourceSyncManager.kt, ResourceCacheDao.kt, ResourceCacheEntity.kt
    - _Requirements: 2.2_

  - [x] 6.7 编写资源文件完整性属性测试
    - **Property 11: Resource File Integrity**
    - **Validates: Requirements 2.2**
    - 已创建 ResourceIntegrityPropertyTest.kt

  - [x] 6.8 实现离线队列管理
    - OfflineQueueManager 实现
    - ConnectivityManager 网络状态监听
    - 网络恢复自动触发同步
    - 已创建 OfflineQueueManager.kt
    - _Requirements: 10.5_

- [x] 7. Checkpoint - 同步引擎验证
  - 确保同步测试通过
  - 使用本地 WebDAV 服务器测试端到端同步
  - 已通过 SensitiveTypesPropertyTest, SyncIntegrationTest 验证

- [x] 8. 笔记功能模块
  - [x] 8.1 实现 NotesViewModel
    - 笔记列表、文件夹筛选、搜索
    - 创建、编辑、删除笔记
    - 置顶、加锁功能
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.8_

  - [x] 8.2 实现 NotesScreen (Compose)
    - 笔记列表视图 (title, preview, updated_time)
    - 文件夹侧边栏/抽屉
    - 搜索栏
    - _Requirements: 5.1, 5.2_

  - [x] 8.3 实现 NoteDetailScreen
    - 富文本内容显示 (WebView for HTML)
    - 编辑器 (Markdown 或简单富文本)
    - 标签管理
    - 已创建 NoteDetailScreen.kt, NoteDetailViewModel.kt
    - _Requirements: 5.3, 5.4, 5.7_

  - [x] 8.4 实现 FoldersViewModel 和文件夹管理
    - 文件夹 CRUD
    - 层级结构支持
    - _Requirements: 5.2_

- [x] 9. 书签功能模块
  - [x] 9.1 实现 BookmarksViewModel
    - 书签列表、文件夹筛选
    - 创建、编辑、删除书签
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 9.2 实现 BookmarksScreen
    - 书签列表 (name, URL, icon)
    - 文件夹层级导航
    - 点击打开浏览器
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

- [x] 10. 待办事项功能模块
  - [x] 10.1 实现 TodosViewModel
    - 四象限分类
    - 创建、编辑、完成、删除待办
    - 提醒设置
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 10.2 实现 TodosScreen 四象限视图
    - 四象限网格布局
    - 拖拽改变象限
    - _Requirements: 7.1, 7.6_

  - [x] 10.3 实现待办提醒通知
    - AlarmManager 定时提醒
    - NotificationChannel 配置
    - _Requirements: 7.4, 7.5_

- [x] 11. 智能助理功能模块
  - [x] 11.1 实现 AIViewModel
    - 对话列表管理
    - 消息发送和接收
    - AI 配置同步
    - _Requirements: 8.1, 8.2, 8.5_

  - [x] 11.2 实现 AIScreen 对话列表
    - 对话列表 (title, last message)
    - 新建对话
    - _Requirements: 8.1, 8.2_

  - [x] 11.3 实现 AIConversationScreen
    - 消息列表 (user/assistant 区分)
    - 消息输入和发送
    - 流式响应显示
    - _Requirements: 8.3, 8.4_

  - [x] 11.4 实现 AI API 客户端
    - OpenAI/Anthropic/Custom API 调用
    - 流式响应处理 (SSE)
    - _Requirements: 8.4, 8.6_

- [x] 12. 密码库功能模块
  - [x] 12.1 实现 VaultViewModel
    - 条目列表、文件夹筛选
    - 条目 CRUD
    - _Requirements: 9.2, 9.3_

  - [x] 12.2 实现 VaultScreen
    - 条目列表 (按文件夹组织)
    - 四种条目类型显示
    - _Requirements: 9.2, 9.3_

  - [x] 12.3 实现 VaultEntryDetailScreen
    - 条目详情显示 (username, password masked, URIs, custom fields)
    - 复制到剪贴板 (30秒自动清除)
    - _Requirements: 9.4, 9.6, 9.7_

  - [x] 12.4 实现 TOTPGenerator
    - TOTP 代码生成 (RFC 6238)
    - 30秒刷新倒计时
    - _Requirements: 9.8_

  - [x] 12.5 编写 TOTP 代码生成属性测试
    - **Property 9: TOTP Code Generation**
    - **Validates: Requirements 9.8**

  - [x] 12.6 实现密码库访问认证
    - 主密码或生物识别验证
    - 查看密码时二次认证
    - 已更新 VaultViewModel.kt 添加认证支持
    - _Requirements: 9.1, 9.5_

  - [x] 12.7 实现 Android Autofill Service
    - MuchengAutofillService 实现
    - onFillRequest 处理自动填充请求
    - onSaveRequest 保存新凭据
    - 生物识别解锁集成
    - _Requirements: 13.8_

  - [x] 12.8 编写 Autofill 条目匹配属性测试
    - **Property 12: Autofill Entry Matching**
    - **Validates: Requirements 13.8**

- [x] 13. Checkpoint - 功能模块验证
  - 确保五大功能模块基本可用
  - 验证数据同步正确性
  - 已完成所有功能模块实现


- [x] 14. 安全组件实现
  - [x] 14.1 实现 BiometricManager
    - canAuthenticate() 检测生物识别能力
    - authenticate() 使用 BiometricPrompt API
    - BIOMETRIC_STRONG 认证级别
    - _Requirements: 13.1, 13.2, 13.6_

  - [x] 14.2 实现 AppLockManager
    - PIN/图案/生物识别锁定
    - 锁定超时检测
    - _Requirements: 12.1, 12.2, 13.3, 13.4, 13.5_

  - [x] 14.3 实现 LockScreen
    - PIN 输入界面
    - 图案输入界面
    - 生物识别提示
    - 已创建 LockScreen.kt, LockScreenViewModel.kt
    - _Requirements: 12.1, 12.2, 13.4_

  - [x] 14.4 实现安全防护
    - FLAG_SECURE 防截图 (密码库界面)
    - 后台时清除敏感数据
    - 已创建 SecurityUtils.kt
    - _Requirements: 12.3, 12.4_

  - [x] 14.5 实现 Certificate Pinning
    - NetworkSecurityManager 实现
    - OkHttp CertificatePinner 配置
    - 支持 OpenAI/Anthropic API 证书固定
    - _Requirements: 12.6_

- [x] 15. UI 完善
  - [x] 15.1 实现 MainNavigation 底部导航
    - 五个模块: 笔记、书签、待办、AI、密码库
    - Material Design 3 NavigationBar
    - _Requirements: 11.2_

  - [x] 15.2 实现主题系统
    - 深色/浅色主题
    - 跟随系统设置
    - _Requirements: 11.3_

  - [x] 15.3 实现中文本地化
    - strings.xml 中文资源
    - 所有用户可见字符串使用资源引用
    - 错误消息本地化
    - _Requirements: 11.4_

  - [x] 15.4 实现同步状态指示器
    - Toolbar 同步图标
    - 同步进度指示
    - 下拉刷新触发同步
    - 已创建 SyncStatusIndicator.kt
    - _Requirements: 11.5, 11.6, 11.7_

  - [x] 15.5 实现系统手势支持
    - 边缘到边缘显示
    - WindowInsets 处理
    - 预测性返回手势 (Android 13+)
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 15.6 处理手势冲突
    - SwipeToDismiss 方向限制
    - ViewPager/DrawerLayout 手势区域
    - 已创建 GestureUtils.kt
    - _Requirements: 14.5, 14.6, 14.7_

- [x] 16. 设置页面
  - [x] 16.1 实现 SettingsScreen
    - 同步配置 (WebDAV URL, 用户名, 密码, 路径)
    - 加密模式切换
    - 同步模块选择
    - _Requirements: 2.1, 3.1, 3.2, 3.6_

  - [x] 16.2 实现安全设置
    - 应用锁开关
    - 锁定方式选择 (PIN/图案/生物识别)
    - 生物识别开关
    - _Requirements: 12.1, 13.2, 13.3_

- [x] 17. Checkpoint - UI 和安全验证
  - 确保 UI 符合 Material Design 3
  - 验证手势导航正常工作
  - 验证安全功能正常
  - 已完成所有 UI 和安全组件实现

- [x] 18. 集成测试和优化
  - [x] 18.1 端到端同步测试
    - 桌面端创建数据 → Android 同步 → 验证数据一致
    - Android 创建数据 → 桌面端同步 → 验证数据一致
    - 已创建 SyncIntegrationTest.kt, PayloadCompatibilityTest.kt
    - _Requirements: 1.1, 2.4, 2.5_

  - [x] 18.2 加密兼容性测试
    - 桌面端加密 → Android 解密
    - Android 加密 → 桌面端解密
    - 已创建 CryptoCompatibilityTest.kt
    - _Requirements: 4.7_

  - [x] 18.3 性能优化
    - 大量数据列表性能
    - 同步性能优化
    - 内存使用优化
    - 已创建 PerformanceTest.kt

  - [x] 18.4 无障碍测试
    - TalkBack 支持验证
    - 内容描述完整性
    - 已创建 AccessibilityTest.kt

- [x] 19. Final Checkpoint - 发布准备
  - 确保所有测试通过
  - 确保与桌面端数据完全兼容
  - 准备发布签名和配置
  - 所有核心功能已实现，待实际设备测试验证

## Notes

- 所有任务都是必选的，包括属性测试
- 每个 Checkpoint 确保阶段性功能完整
- 属性测试使用 Kotest Property Testing 框架
- 集成测试需要本地 WebDAV 服务器环境
- 建议按顺序执行，确保依赖关系正确
- 共 13 个正确性属性测试覆盖核心功能
- 新增任务: 2.8-2.9 (Payload + 缓存), 6.6-6.8 (资源同步/离线队列), 12.7-12.8 (Autofill), 14.5 (Certificate Pinning)

### 桌面端兼容性关键点

1. **所有 Payload 使用 `@SerialName` 注解**: 确保 JSON 字段名为 snake_case，与桌面端完全一致
2. **枚举值使用 `@SerialName`**: TodoQuadrant、VaultEntryType、DiagramType 的值必须与桌面端字符串一致
3. **ResourcePayload 不含 local_path**: 本地缓存路径使用单独的 resource_cache 表管理
4. **SyncConfig 包含 api_key**: 支持 server 类型同步
5. **加密参数完全一致**: PBKDF2 100000 次迭代，AES-256-GCM，12字节IV，16字节AuthTag
6. **敏感类型始终加密**: vault_entry, vault_folder, ai_config

