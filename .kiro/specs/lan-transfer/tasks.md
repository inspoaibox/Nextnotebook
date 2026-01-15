# Implementation Plan: LAN Transfer Assistant

## Overview

本实现计划将局域网传输助手功能分解为可执行的开发任务。实现将分为桌面端、Android端和中继服务器三个部分，采用增量开发方式，确保每个阶段都能独立测试和验证。

技术栈：
- 桌面端：TypeScript + Socket.IO Client + React
- Android端：Kotlin + Socket.IO Client + Jetpack Compose
- 中继服务器：TypeScript + Socket.IO Server + Express

## Tasks

- [x] 0. 依赖和环境准备
  - [x] 0.1 安装桌面端依赖
    - 安装 Socket.IO 客户端：`npm install socket.io-client`
    - 安装 Socket.IO 服务器：`npm install socket.io`
    - 验证 qrcode.react 支持数据生成（已安装）
    - _Requirements: 1.1, 1.2_

  - [x] 0.2 更新 Android 依赖配置
    - 在 `android/gradle/libs.versions.toml` 添加 Socket.IO 客户端
    - 添加版本：`socketio = "2.1.0"`
    - 添加库：`socketio-client = { group = "io.socket", name = "socket.io-client", version.ref = "socketio" }`
    - 在 `android/app/build.gradle.kts` 添加依赖
    - _Requirements: 1.1, 1.3_

  - [x] 0.3 添加 Android 二维码扫描依赖
    - 选择方案：ZXing 或 ML Kit
    - ZXing: `zxing-core = { group = "com.google.zxing", name = "core", version = "3.5.3" }`
    - ZXing Android: `zxing-android = { group = "com.journeyapps", name = "zxing-android-embedded", version = "4.3.0" }`
    - 或 ML Kit: `mlkit-barcode = { group = "com.google.mlkit", name = "barcode-scanning", version = "17.2.0" }`
    - _Requirements: 1.3, 9.2_

  - [x] 0.4 添加 Android 相机权限
    - 在 `android/app/src/main/AndroidManifest.xml` 添加权限
    - `<uses-permission android:name="android.permission.CAMERA" />`
    - `<uses-feature android:name="android.hardware.camera" android:required="false" />`
    - _Requirements: 1.3, 9.2_

  - [x] 0.5 创建 Transfer 常量文件
    - 创建 `src/shared/transfer/constants.ts`
    - 定义 TRANSFER_CONSTANTS 和 TransferErrorCode
    - 创建 Android 版本 `TransferConstants.kt`
    - _Requirements: All_

- [x] 1. 数据库和数据模型
  - [x] 1.1 创建桌面端传输数据库表结构
    - 创建 TransferDatabase.ts
    - 实现 4 个表的 CREATE TABLE 语句
    - 实现基础 CRUD 操作
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 1.2 编写桌面端数据库操作的单元测试
    - 测试表创建和约束
    - 测试 CRUD 操作
    - 测试外键关系
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 1.3 创建 Android 端传输数据库表结构
    - 创建 TransferDatabase.kt
    - 定义 Entity 类（Device, Session, Message, FileTransfer）
    - 创建 DAO 接口
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 1.4 编写 Android 端数据库操作的单元测试
    - 测试 Entity 映射
    - 测试 DAO 操作
    - 测试数据库迁移
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 2. 桌面端内置服务器
  - [x] 2.1 实现 TransferServer 类
    - 创建 src/main/services/TransferServer.ts
    - 实现 start() 方法（启动 Socket.IO 服务器）
    - 实现 stop() 方法
    - 实现设备注册和管理
    - _Requirements: 1.1, 7.1_

  - [x] 2.2 实现服务器事件处理
    - 处理 device:register 事件
    - 处理 pair:request 事件
    - 处理 message:send 事件转发
    - 处理 file:chunk 事件转发
    - 广播设备列表更新
    - _Requirements: 1.4, 2.3, 4.1, 5.4_

  - [x] 2.3 实现网络接口检测
    - 获取本机局域网 IP 地址
    - 过滤内网地址
    - 处理多网卡情况
    - _Requirements: 1.1_

  - [x] 2.4 编写服务器单元测试
    - 测试服务器启动和停止
    - 测试设备注册
    - 测试消息转发
    - _Requirements: 1.1, 1.4, 2.3_

- [x] 3. 桌面端客户端
  - [x] 3.1 实现 TransferClient 类
    - 创建 src/renderer/services/transferClient.ts
    - 实现 connect() 方法（连接到服务器）
    - 实现 disconnect() 方法
    - 实现设备 ID 生成和持久化
    - _Requirements: 1.3, 7.1_

  - [x] 3.2 实现二维码生成和解析
    - 实现 generatePairingQRCode() 方法
    - 实现 parsePairingQRCode() 方法
    - 添加过期时间验证
    - _Requirements: 1.2, 1.3, 9.1, 9.2_

  - [x] 3.3 编写二维码功能的属性测试
    - **Property 2: QR Code Expiration**
    - **Validates: Requirements 1.3, 9.1, 9.2**
    - 生成随机时间戳的二维码
    - 验证过期的二维码被拒绝
    - _Requirements: 1.3, 9.1, 9.2_

  - [x] 3.4 实现文本消息发送
    - 实现 sendTextMessage() 方法
    - 创建消息记录
    - 发送 message:send 事件
    - 保存到本地数据库
    - _Requirements: 4.1, 4.3_

  - [x] 3.5 实现文件传输发送
    - 实现 sendFile() 方法
    - 读取文件元数据
    - 实现文件分块（64KB）
    - 发送 file:start, file:chunk, file:complete 事件
    - 更新传输进度
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.7_

  - [ ] 3.6 编写文件分块的属性测试
    - **Property 4: File Chunk Integrity**
    - **Validates: Requirements 5.3, 5.4, 5.5, 5.6**
    - 生成随机大小的文件
    - 分块、传输、重组
    - 验证哈希值一致
    - _Requirements: 5.3, 5.4, 5.5, 5.6_

  - [x] 3.7 实现消息接收处理
    - 监听 message:receive 事件
    - 保存到本地数据库
    - 触发 UI 更新
    - 实现消息已读回执发送
    - _Requirements: 4.2, 4.4, 4.5_

  - [x] 3.8 实现文件接收处理
    - 监听 file:incoming, file:chunk, file:complete 事件
    - 写入临时文件
    - 组装完整文件
    - 移动到目标位置
    - _Requirements: 5.5, 5.6_

  - [ ] 3.9 编写客户端单元测试
    - 测试连接和断开
    - 测试消息发送和接收
    - 测试文件传输
    - _Requirements: 1.3, 4.1, 4.2, 5.1_



- [x] 4. 桌面端 UI 组件
  - [x] 4.1 创建 TransferPanel 主组件
    - 创建 src/renderer/components/TransferPanel.tsx
    - 实现服务器信息显示
    - 实现二维码显示
    - 实现设备列表和会话切换
    - _Requirements: 10.1, 10.2_

  - [x] 4.2 创建 DeviceListView 组件
    - 显示在线设备列表
    - 显示设备图标、名称、状态
    - 实现设备选择和连接
    - 实现常用设备标记
    - _Requirements: 1.4, 7.3, 10.2_

  - [x] 4.3 创建 ChatView 组件
    - 显示消息列表
    - 实现文本输入框
    - 实现文件选择按钮
    - 显示文件传输进度
    - _Requirements: 10.3, 10.4_

  - [x] 4.4 集成到 Sidebar
    - 在 Sidebar.tsx 添加传输助手按钮
    - 实现工具切换逻辑
    - 添加图标和提示
    - _Requirements: 10.1_

  - [x] 4.5 在 App.tsx 中集成 TransferPanel
    - 添加 TransferPanel 到主界面
    - 实现显示/隐藏逻辑
    - 连接状态管理
    - _Requirements: 10.1_

  - [x] 4.6 实现桌面端通知功能
    - 接收到新消息时显示系统通知
    - 显示未读消息计数
    - 实现通知点击跳转
    - _Requirements: 10.6_

  - [ ] 4.7 编写 UI 组件测试
    - 测试组件渲染
    - 测试用户交互
    - 测试状态更新
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 5. Android 端客户端
  - [x] 5.1 实现 TransferClient 类
    - 创建 TransferClient.kt
    - 实现 connect() 方法
    - 实现 disconnect() 方法
    - 实现设备 ID 生成和持久化
    - _Requirements: 1.3, 7.1_

  - [x] 5.2 实现二维码扫描
    - 集成 ZXing 或 ML Kit
    - 实现 scanQRCode() 方法
    - 解析二维码数据
    - 验证过期时间
    - _Requirements: 1.3, 9.2_

  - [x] 5.3 实现消息发送和接收
    - 实现 sendTextMessage() 方法
    - 实现 sendFile() 方法（使用 ContentResolver）
    - 监听 message:receive 事件
    - 保存到本地数据库
    - 实现消息已读回执发送
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 5.4 实现文件传输
    - 读取文件 URI
    - 实现文件分块
    - 发送文件数据
    - 接收并保存文件
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ] 5.5 编写 Android 客户端单元测试
    - 测试连接和断开
    - 测试消息发送和接收
    - 测试文件传输
    - _Requirements: 1.3, 4.1, 4.2, 5.1_

  - [ ] 5.6 编写 Android 端关键属性测试
    - **Property 2: QR Code Expiration** (Android)
    - **Property 4: File Chunk Integrity** (Android)
    - 验证二维码过期逻辑
    - 验证文件分块完整性
    - _Requirements: 1.3, 5.3, 5.4, 5.5, 5.6, 9.1, 9.2_

- [x] 6. Android 端 UI
  - [x] 6.1 创建 TransferScreen
    - 创建 TransferScreen.kt
    - 实现设备列表视图
    - 实现聊天视图
    - 实现视图切换
    - _Requirements: 10.5_

  - [x] 6.2 创建 TransferViewModel
    - 创建 TransferViewModel.kt
    - 管理连接状态
    - 管理设备列表
    - 管理消息列表
    - _Requirements: 10.5_

  - [x] 6.3 实现 DeviceListView
    - 显示在线设备
    - 显示扫码按钮
    - 实现设备选择
    - _Requirements: 10.5_

  - [x] 6.4 实现 ChatView
    - 显示消息列表
    - 实现文本输入
    - 实现文件选择
    - 显示传输进度
    - _Requirements: 10.5, 10.6_

  - [x] 6.5 集成到主导航
    - 在 MainNavigation.kt 添加 Transfer 导航项
    - 添加图标和标题
    - 实现导航逻辑
    - _Requirements: 10.5_

  - [x] 6.6 实现 Android 端通知功能
    - 接收到新消息时显示通知
    - 显示未读消息计数
    - 实现通知点击跳转
    - _Requirements: 10.6_

  - [ ] 6.7 编写 UI 测试
    - 测试屏幕渲染
    - 测试用户交互
    - 测试状态更新
    - _Requirements: 10.5, 10.6_

- [x] 7. 中继服务器
  - [x] 7.1 创建 TransferRelayServer 类
    - 创建 sync-server/src/transfer/relay.ts
    - 实现 Socket.IO 服务器
    - 实现设备注册
    - 实现设备列表管理
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 7.2 实现消息转发
    - 处理 message:send 事件
    - 根据 sessionId 查找目标设备
    - 转发消息到目标设备
    - _Requirements: 3.3, 8.4_

  - [x] 7.3 实现文件分块转发
    - 处理 file:chunk 事件
    - 转发文件数据
    - 不存储文件内容
    - _Requirements: 3.3, 8.4_

  - [x] 7.4 实现设备上线/下线通知
    - 广播 device:online 事件
    - 广播 device:offline 事件
    - 清理断开设备的信息
    - _Requirements: 1.5, 8.5_

  - [x] 7.5 集成到同步服务器
    - 在 sync-server/src/index.ts 中启动中继服务器
    - 配置独立路径 /transfer
    - 添加环境变量配置
    - _Requirements: 8.1, 8.6_

  - [x] 7.6 实现中继服务器限流和连接管理
    - 实现连接数限制
    - 实现消息发送频率限制
    - 实现文件传输并发限制
    - _Requirements: 8.1, 9.4_

  - [ ] 7.7 编写中继服务器单元测试
    - 测试设备注册
    - 测试消息转发
    - 测试设备列表更新
    - 测试限流逻辑
    - _Requirements: 8.2, 8.3, 8.4_

- [x] 8. 连接管理和错误处理
  - [x] 8.1 实现连接模式切换
    - 优先尝试局域网直连
    - 失败后降级到中继服务器
    - 实现重试逻辑（3次，1秒间隔）
    - _Requirements: 2.1, 3.1, 3.2_

  - [ ] 8.2 编写连接降级的属性测试
    - **Property 6: Connection Mode Fallback**
    - **Validates: Requirements 3.1, 3.2**
    - 模拟局域网连接失败
    - 验证自动尝试中继连接
    - _Requirements: 3.1, 3.2_

  - [ ] 8.3 实现文件传输错误处理
    - 保存传输进度
    - 实现断点续传
    - 清理失败的临时文件
    - _Requirements: 5.8, 9.3_

  - [ ] 8.4 编写临时文件清理的属性测试
    - **Property 9: Temporary File Cleanup**
    - **Validates: Requirements 5.8, 9.3**
    - 模拟失败的传输
    - 验证临时文件被清理
    - _Requirements: 5.8, 9.3_

  - [x] 8.5 实现会话超时处理
    - 检测 30 分钟无活动
    - 自动关闭会话
    - 清理资源
    - _Requirements: 7.5_

  - [ ] 8.6 编写连接重试逻辑的单元测试
    - 测试重试次数（3次）
    - 测试重试间隔（1秒）
    - 测试最终失败处理
    - _Requirements: 3.1_

  - [ ] 8.7 编写会话超时的单元测试
    - 测试 30 分钟超时检测
    - 测试自动关闭逻辑
    - 测试资源清理
    - _Requirements: 7.5_



- [x] 9. 传输历史和设备管理
  - [x] 9.1 实现传输历史查询
    - 查询所有会话
    - 查询会话的消息列表
    - 查询文件传输记录
    - 实现分页加载
    - _Requirements: 6.4, 6.5_

  - [x] 9.2 实现设备管理功能
    - 查看设备列表
    - 标记常用设备
    - 删除设备记录
    - 查看设备最后在线时间
    - _Requirements: 7.2, 7.3, 7.4_

  - [x] 9.3 实现历史记录清理
    - 删除指定会话
    - 删除关联的消息和文件
    - 清理本地文件
    - _Requirements: 9.5_

  - [ ] 9.4 编写历史记录的单元测试
    - 测试查询功能
    - 测试删除功能
    - 测试数据一致性
    - _Requirements: 6.4, 6.5, 9.5_

- [ ] 10. 属性测试实现
  - [x] 10.1 编写设备注册唯一性属性测试
    - **Property 1: Device Registration Uniqueness**
    - **Validates: Requirements 1.1, 7.1**
    - 生成随机设备注册
    - 验证设备 ID 唯一性
    - _Requirements: 1.1, 7.1_

  - [x] 10.2 编写消息顺序属性测试
    - **Property 3: Message Delivery Order**
    - **Validates: Requirements 4.1, 4.2**
    - 发送随机消息序列
    - 验证接收顺序一致
    - _Requirements: 4.1, 4.2_

  - [ ] 10.3 编写会话持久化属性测试
    - **Property 5: Session Persistence**
    - **Validates: Requirements 4.3, 4.4, 6.2, 6.3**
    - 创建随机会话和消息
    - 验证数据库持久化
    - _Requirements: 4.3, 4.4, 6.2, 6.3_

  - [x] 10.4 编写设备列表一致性属性测试
    - **Property 7: Device List Consistency**
    - **Validates: Requirements 1.4, 8.3**
    - 连接随机设备
    - 验证所有设备看到一致的列表
    - _Requirements: 1.4, 8.3_

  - [x] 10.5 编写传输进度准确性属性测试
    - **Property 8: File Transfer Progress Accuracy**
    - **Validates: Requirements 5.7**
    - 传输随机大小的文件
    - 验证进度百分比准确性
    - _Requirements: 5.7_

  - [x] 10.6 编写消息已读回执属性测试
    - **Property 10: Message Read Receipt**
    - **Validates: Requirements 4.5**
    - 标记随机消息为已读
    - 验证回执发送到发送方
    - _Requirements: 4.5_

- [ ] 11. 集成测试
  - [ ] 11.1 桌面端到 Android 端文件传输测试
    - 启动桌面端服务器
    - Android 端扫码连接
    - 发送文件并验证接收
    - _Requirements: 2.1, 2.2, 5.1, 5.6_

  - [ ] 11.2 通过中继服务器传输测试
    - 连接到中继服务器
    - 发送消息和文件
    - 验证转发正确
    - _Requirements: 3.2, 3.3, 8.4_

  - [ ] 11.3 连接模式切换测试
    - 从局域网连接开始
    - 模拟网络变化
    - 验证降级到中继服务器
    - _Requirements: 3.1, 3.2_

  - [ ] 11.4 中继服务器负载和并发测试
    - 测试多设备同时连接
    - 测试并发消息转发
    - 测试限流机制
    - 验证性能指标
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 12. 文档和部署
  - [x] 12.1 编写用户文档
    - 创建 docs/lan-transfer/USER_GUIDE.md
    - 章节：功能介绍、快速开始、桌面端使用、Android 端使用
    - 章节：常见问题、故障排除
    - 添加截图和示例

  - [x] 12.2 编写中继服务器部署文档
    - 创建 docs/lan-transfer/RELAY_SERVER_GUIDE.md
    - 章节：系统要求、安装步骤、配置说明
    - 章节：Docker 部署、性能优化、监控和维护
    - 添加配置示例

  - [x] 12.3 更新项目 README
    - 在 README.md 添加传输助手功能介绍
    - 添加快速开始示例
    - 添加文档链接

  - [x] 12.4 配置中继服务器环境变量
    - 更新 sync-server/.env.example
    - 更新 sync-server/docker-compose.yml
    - 添加配置注释说明

## Notes

- 所有任务都是必需的，包括全面的测试覆盖
- 每个任务都引用了具体的需求编号，确保可追溯性
- 属性测试使用 fast-check (TypeScript) 和 Kotest (Kotlin)
- 建议按顺序执行任务，确保依赖关系正确
- 数据库和核心功能优先，UI 和测试可以并行开发
