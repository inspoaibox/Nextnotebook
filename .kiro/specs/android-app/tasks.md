# Implementation Plan: 暮城笔记 Android 客户端

## Overview

本实现计划将 Android 客户端开发分为 8 个主要阶段：项目初始化、数据层、加密引擎、同步引擎、五大功能模块、安全组件、UI 完善和测试。采用 Kotlin + Jetpack Compose 技术栈。

## Tasks

- [ ] 1. 项目初始化和基础架构
  - [ ] 1.1 创建 Android 项目并配置 Gradle 依赖
    - 配置 Kotlin 2.0, Compose BOM, Hilt, Room, Kotlinx Serialization
    - 添加 Sardine (WebDAV), SQLCipher, Tink 依赖
    - 配置 Kotest 属性测试框架
    - _Requirements: 1.1, 11.1_

  - [ ] 1.2 设置项目目录结构
    - 创建 data/, domain/, presentation/ 三层目录
    - 创建 di/ (Hilt modules), util/, security/ 目录
    - _Requirements: 1.1_

  - [ ] 1.3 实现 ItemEntity 和 ItemType
    - 创建 Room Entity 与桌面端字段完全一致
    - 实现 ItemType 枚举和 SENSITIVE_TYPES
    - _Requirements: 1.1, 1.2_

  - [ ] 1.4 编写 UUID v4 格式属性测试
    - **Property 2: UUID v4 Format Compliance**
    - **Validates: Requirements 1.4**

- [ ] 2. 数据层实现
  - [ ] 2.1 实现所有 Payload 数据类
    - NotePayload, FolderPayload, TagPayload
    - TodoPayload, TodoQuadrant
    - BookmarkPayload, BookmarkFolderPayload
    - VaultEntryPayload, VaultFolderPayload, VaultTotp, VaultUri, VaultCustomField
    - AIConversationPayload, AIMessagePayload, AIConfigPayload, AIChannel, AIModel
    - _Requirements: 1.3, 5.1-5.8, 6.1-6.5, 7.1-7.6, 8.1-8.6, 9.1-9.8_

  - [ ] 2.2 编写 Payload 序列化往返属性测试
    - **Property 3: Payload Serialization Round-Trip**
    - **Validates: Requirements 1.3**

  - [ ] 2.3 实现 ItemDao (Room DAO)
    - getByType, getById, getPendingSync
    - upsert, softDelete, markSynced
    - 实现 content_hash 计算 (SHA-256 前16字符)
    - _Requirements: 1.5, 10.1, 10.2_

  - [ ] 2.4 编写内容哈希一致性属性测试
    - **Property 1: Content Hash Consistency**
    - **Validates: Requirements 1.5**

  - [ ] 2.5 实现 AppDatabase (Room Database)
    - 配置 SQLCipher 加密
    - 创建数据库迁移策略
    - _Requirements: 10.1, 10.3_

  - [ ] 2.6 编写数据库 CRUD 往返属性测试
    - **Property 10: Database CRUD Round-Trip**
    - **Validates: Requirements 10.1, 10.2**

  - [ ] 2.7 实现 ItemRepository
    - 实现 ItemRepository 接口
    - 实现 getByType, getById, create, update, softDelete, search
    - _Requirements: 10.4, 10.5_

- [ ] 3. Checkpoint - 数据层验证
  - 确保所有数据层测试通过
  - 验证 Payload 序列化与桌面端兼容

- [ ] 4. 加密引擎实现
  - [ ] 4.1 实现 CryptoEngine 接口
    - deriveKeyFromPassword (PBKDF2, 100000 iterations, SHA-256)
    - encrypt/decrypt (AES-256-GCM, 12-byte IV, 16-byte authTag)
    - encryptPayload/decryptPayload
    - computeHash, generateKeyIdentifier
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 4.2 编写密钥派生一致性属性测试
    - **Property 5: Key Derivation Consistency**
    - **Validates: Requirements 4.1**

  - [ ] 4.3 编写加密数据结构属性测试
    - **Property 6: Encrypted Data Structure**
    - **Validates: Requirements 4.2, 4.4**

  - [ ] 4.4 编写加密往返兼容性属性测试
    - **Property 4: Encryption Round-Trip Compatibility**
    - **Validates: Requirements 4.7, 4.4**

  - [ ] 4.5 编写密钥标识符生成属性测试
    - **Property 7: Key Identifier Generation**
    - **Validates: Requirements 4.5**

  - [ ] 4.6 实现 Android Keystore 集成
    - 使用 Keystore 安全存储主密钥
    - _Requirements: 12.5_

- [ ] 5. Checkpoint - 加密引擎验证
  - 确保所有加密测试通过
  - 验证与桌面端加密兼容性


- [ ] 6. 同步引擎实现
  - [ ] 6.1 实现 WebDAVAdapter
    - testConnection, getItem, putItem, deleteItem
    - listChanges, acquireLock, releaseLock
    - getSyncCursor, setSyncCursor
    - 使用 Sardine 库实现 WebDAV 操作
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 6.2 实现 SyncEngine
    - sync() 主流程: 获取锁 → 验证密钥 → Push → Pull → 释放锁
    - pushChanges: 上传 modified/deleted 状态的 items
    - pullChanges: 拉取远端变更并应用
    - 冲突处理: 创建 "(冲突副本)"
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [ ] 6.3 编写敏感类型强制加密属性测试
    - **Property 8: Sensitive Types Always Encrypted**
    - **Validates: Requirements 3.5**

  - [ ] 6.4 实现 SyncConfig 和 SyncModules
    - 支持加密/明文模式切换
    - 支持模块选择性同步
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 2.7_

  - [ ] 6.5 实现 SyncRepository
    - sync(), getSyncStatus(), observeSyncStatus()
    - 后台同步调度 (WorkManager)
    - _Requirements: 2.4, 2.5_

- [ ] 7. Checkpoint - 同步引擎验证
  - 确保同步测试通过
  - 使用本地 WebDAV 服务器测试端到端同步

- [ ] 8. 笔记功能模块
  - [ ] 8.1 实现 NotesViewModel
    - 笔记列表、文件夹筛选、搜索
    - 创建、编辑、删除笔记
    - 置顶、加锁功能
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.8_

  - [ ] 8.2 实现 NotesScreen (Compose)
    - 笔记列表视图 (title, preview, updated_time)
    - 文件夹侧边栏/抽屉
    - 搜索栏
    - _Requirements: 5.1, 5.2_

  - [ ] 8.3 实现 NoteDetailScreen
    - 富文本内容显示 (WebView for HTML)
    - 编辑器 (Markdown 或简单富文本)
    - 标签管理
    - _Requirements: 5.3, 5.4, 5.7_

  - [ ] 8.4 实现 FoldersViewModel 和文件夹管理
    - 文件夹 CRUD
    - 层级结构支持
    - _Requirements: 5.2_

- [ ] 9. 书签功能模块
  - [ ] 9.1 实现 BookmarksViewModel
    - 书签列表、文件夹筛选
    - 创建、编辑、删除书签
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 9.2 实现 BookmarksScreen
    - 书签列表 (name, URL, icon)
    - 文件夹层级导航
    - 点击打开浏览器
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

- [ ] 10. 待办事项功能模块
  - [ ] 10.1 实现 TodosViewModel
    - 四象限分类
    - 创建、编辑、完成、删除待办
    - 提醒设置
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 10.2 实现 TodosScreen 四象限视图
    - 四象限网格布局
    - 拖拽改变象限
    - _Requirements: 7.1, 7.6_

  - [ ] 10.3 实现待办提醒通知
    - AlarmManager 定时提醒
    - NotificationChannel 配置
    - _Requirements: 7.4, 7.5_

- [ ] 11. 智能助理功能模块
  - [ ] 11.1 实现 AIViewModel
    - 对话列表管理
    - 消息发送和接收
    - AI 配置同步
    - _Requirements: 8.1, 8.2, 8.5_

  - [ ] 11.2 实现 AIScreen 对话列表
    - 对话列表 (title, last message)
    - 新建对话
    - _Requirements: 8.1, 8.2_

  - [ ] 11.3 实现 AIConversationScreen
    - 消息列表 (user/assistant 区分)
    - 消息输入和发送
    - 流式响应显示
    - _Requirements: 8.3, 8.4_

  - [ ] 11.4 实现 AI API 客户端
    - OpenAI/Anthropic/Custom API 调用
    - 流式响应处理 (SSE)
    - _Requirements: 8.4, 8.6_

- [ ] 12. 密码库功能模块
  - [ ] 12.1 实现 VaultViewModel
    - 条目列表、文件夹筛选
    - 条目 CRUD
    - _Requirements: 9.2, 9.3_

  - [ ] 12.2 实现 VaultScreen
    - 条目列表 (按文件夹组织)
    - 四种条目类型显示
    - _Requirements: 9.2, 9.3_

  - [ ] 12.3 实现 VaultEntryDetailScreen
    - 条目详情显示 (username, password masked, URIs, custom fields)
    - 复制到剪贴板 (30秒自动清除)
    - _Requirements: 9.4, 9.6, 9.7_

  - [ ] 12.4 实现 TOTPGenerator
    - TOTP 代码生成 (RFC 6238)
    - 30秒刷新倒计时
    - _Requirements: 9.8_

  - [ ] 12.5 编写 TOTP 代码生成属性测试
    - **Property 9: TOTP Code Generation**
    - **Validates: Requirements 9.8**

  - [ ] 12.6 实现密码库访问认证
    - 主密码或生物识别验证
    - 查看密码时二次认证
    - _Requirements: 9.1, 9.5_

- [ ] 13. Checkpoint - 功能模块验证
  - 确保五大功能模块基本可用
  - 验证数据同步正确性


- [ ] 14. 安全组件实现
  - [ ] 14.1 实现 BiometricManager
    - canAuthenticate() 检测生物识别能力
    - authenticate() 使用 BiometricPrompt API
    - BIOMETRIC_STRONG 认证级别
    - _Requirements: 13.1, 13.2, 13.6_

  - [ ] 14.2 实现 AppLockManager
    - PIN/图案/生物识别锁定
    - 锁定超时检测
    - _Requirements: 12.1, 12.2, 13.3, 13.4, 13.5_

  - [ ] 14.3 实现 LockScreen
    - PIN 输入界面
    - 图案输入界面
    - 生物识别提示
    - _Requirements: 12.1, 12.2, 13.4_

  - [ ] 14.4 实现安全防护
    - FLAG_SECURE 防截图 (密码库界面)
    - 后台时清除敏感数据
    - _Requirements: 12.3, 12.4_

- [ ] 15. UI 完善
  - [ ] 15.1 实现 MainNavigation 底部导航
    - 五个模块: 笔记、书签、待办、AI、密码库
    - Material Design 3 NavigationBar
    - _Requirements: 11.2_

  - [ ] 15.2 实现主题系统
    - 深色/浅色主题
    - 跟随系统设置
    - _Requirements: 11.3_

  - [ ] 15.3 实现中文本地化
    - strings.xml 中文资源
    - _Requirements: 11.4_

  - [ ] 15.4 实现同步状态指示器
    - Toolbar 同步图标
    - 同步进度指示
    - 下拉刷新触发同步
    - _Requirements: 11.5, 11.6, 11.7_

  - [ ] 15.5 实现系统手势支持
    - 边缘到边缘显示
    - WindowInsets 处理
    - 预测性返回手势 (Android 13+)
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [ ] 15.6 处理手势冲突
    - SwipeToDismiss 方向限制
    - ViewPager/DrawerLayout 手势区域
    - _Requirements: 14.5, 14.6, 14.7_

- [ ] 16. 设置页面
  - [ ] 16.1 实现 SettingsScreen
    - 同步配置 (WebDAV URL, 用户名, 密码, 路径)
    - 加密模式切换
    - 同步模块选择
    - _Requirements: 2.1, 3.1, 3.2, 3.6_

  - [ ] 16.2 实现安全设置
    - 应用锁开关
    - 锁定方式选择 (PIN/图案/生物识别)
    - 生物识别开关
    - _Requirements: 12.1, 13.2, 13.3_

- [ ] 17. Checkpoint - UI 和安全验证
  - 确保 UI 符合 Material Design 3
  - 验证手势导航正常工作
  - 验证安全功能正常

- [ ] 18. 集成测试和优化
  - [ ] 18.1 端到端同步测试
    - 桌面端创建数据 → Android 同步 → 验证数据一致
    - Android 创建数据 → 桌面端同步 → 验证数据一致
    - _Requirements: 1.1, 2.4, 2.5_

  - [ ] 18.2 加密兼容性测试
    - 桌面端加密 → Android 解密
    - Android 加密 → 桌面端解密
    - _Requirements: 4.7_

  - [ ] 18.3 性能优化
    - 大量数据列表性能
    - 同步性能优化
    - 内存使用优化

  - [ ] 18.4 无障碍测试
    - TalkBack 支持验证
    - 内容描述完整性

- [ ] 19. Final Checkpoint - 发布准备
  - 确保所有测试通过
  - 确保与桌面端数据完全兼容
  - 准备发布签名和配置

## Notes

- 所有任务都是必选的，包括属性测试
- 每个 Checkpoint 确保阶段性功能完整
- 属性测试使用 Kotest Property Testing 框架
- 集成测试需要本地 WebDAV 服务器环境
- 建议按顺序执行，确保依赖关系正确

