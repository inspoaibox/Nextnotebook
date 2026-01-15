# Requirements Document - LAN Transfer Assistant

## Introduction

局域网传输助手是一个独立的点对点文件和消息传输功能，与笔记同步系统完全分离。它支持所有设备类型（桌面端、Android）之间的直接传输，无需登录认证，提供简单快速的数据共享体验。

## Glossary

- **Transfer_Assistant**: 局域网传输助手系统
- **Device**: 参与传输的设备（桌面端或 Android 端）
- **Session**: 两个设备之间建立的传输会话
- **LAN_Connection**: 局域网内的直接 WebSocket 连接
- **Relay_Connection**: 通过中继服务器的间接连接
- **Transfer_Server**: 桌面端内置的 Socket.IO 服务器
- **Relay_Server**: 可选的中继服务器（可部署在现有同步服务器上）
- **Pairing_Code**: 用于设备配对的二维码数据
- **Message**: 文本消息或文件传输消息
- **File_Chunk**: 文件分块传输的数据块

## Requirements

### Requirement 1: 设备发现和配对

**User Story:** 作为用户，我希望能够快速发现并连接到局域网内的其他设备，以便开始传输数据。

#### Acceptance Criteria

1. WHEN 桌面端启动传输助手 THEN THE Transfer_Assistant SHALL 启动内置 Socket.IO 服务器并监听随机端口
2. WHEN 服务器启动成功 THEN THE Transfer_Assistant SHALL 生成包含连接信息的二维码
3. WHEN Android 端扫描二维码 THEN THE Transfer_Assistant SHALL 解析连接信息并建立 WebSocket 连接
4. WHEN 设备连接成功 THEN THE Transfer_Assistant SHALL 在设备列表中显示已连接的设备
5. WHEN 设备断开连接 THEN THE Transfer_Assistant SHALL 从设备列表中移除该设备并通知用户

### Requirement 2: 局域网直连传输

**User Story:** 作为用户，我希望在局域网内直接连接设备进行高速传输，无需经过外部服务器。

#### Acceptance Criteria

1. WHEN 两个设备在同一局域网内 THEN THE Transfer_Assistant SHALL 优先使用局域网直连模式
2. WHEN 建立局域网连接 THEN THE Transfer_Assistant SHALL 使用 WebSocket 协议进行通信
3. WHEN 发送文本消息 THEN THE Transfer_Assistant SHALL 通过 WebSocket 直接发送到对端设备
4. WHEN 发送文件 THEN THE Transfer_Assistant SHALL 将文件分块（64KB）并通过 WebSocket 传输
5. WHEN 传输文件 THEN THE Transfer_Assistant SHALL 实时显示传输进度百分比

### Requirement 3: 中继服务器降级

**User Story:** 作为用户，我希望在无法建立局域网连接时，能够通过中继服务器进行传输。

#### Acceptance Criteria

1. WHEN 局域网连接失败 THEN THE Transfer_Assistant SHALL 自动尝试连接到配置的中继服务器
2. WHEN 连接到中继服务器 THEN THE Transfer_Assistant SHALL 注册设备信息并获取设备列表
3. WHEN 通过中继服务器传输 THEN THE Transfer_Assistant SHALL 使用相同的消息格式和协议
4. WHEN 中继服务器转发消息 THEN THE Transfer_Assistant SHALL 根据会话 ID 找到目标设备并转发
5. WHERE 用户配置了中继服务器 THEN THE Transfer_Assistant SHALL 在连接失败时显示中继服务器状态

### Requirement 4: 文本消息传输

**User Story:** 作为用户，我希望能够向连接的设备发送文本消息，以便快速分享信息。

#### Acceptance Criteria

1. WHEN 用户输入文本消息并发送 THEN THE Transfer_Assistant SHALL 创建消息记录并发送到对端
2. WHEN 接收到文本消息 THEN THE Transfer_Assistant SHALL 在聊天界面显示消息内容和时间戳
3. WHEN 消息发送成功 THEN THE Transfer_Assistant SHALL 在本地数据库保存发送记录
4. WHEN 消息接收成功 THEN THE Transfer_Assistant SHALL 在本地数据库保存接收记录
5. WHEN 用户查看消息 THEN THE Transfer_Assistant SHALL 发送已读回执到对端设备

### Requirement 5: 文件传输

**User Story:** 作为用户，我希望能够向连接的设备发送文件，支持各种文件类型和大小。

#### Acceptance Criteria

1. WHEN 用户选择文件并发送 THEN THE Transfer_Assistant SHALL 读取文件元数据（名称、大小、类型）
2. WHEN 开始文件传输 THEN THE Transfer_Assistant SHALL 发送文件元数据到对端设备
3. WHEN 传输文件内容 THEN THE Transfer_Assistant SHALL 将文件分块为 64KB 的数据块
4. WHEN 发送每个数据块 THEN THE Transfer_Assistant SHALL 包含文件 ID、偏移量和数据内容
5. WHEN 接收文件数据块 THEN THE Transfer_Assistant SHALL 按偏移量写入本地临时文件
6. WHEN 所有数据块传输完成 THEN THE Transfer_Assistant SHALL 发送完成信号并移动文件到目标位置
7. WHEN 文件传输过程中 THEN THE Transfer_Assistant SHALL 实时更新传输进度
8. IF 文件传输失败 THEN THE Transfer_Assistant SHALL 清理临时文件并通知用户

### Requirement 6: 传输历史记录

**User Story:** 作为用户，我希望能够查看传输历史记录，以便追溯之前的传输内容。

#### Acceptance Criteria

1. WHEN 建立新的传输会话 THEN THE Transfer_Assistant SHALL 在数据库中创建会话记录
2. WHEN 发送或接收消息 THEN THE Transfer_Assistant SHALL 在数据库中保存消息记录
3. WHEN 传输文件 THEN THE Transfer_Assistant SHALL 在数据库中保存文件传输记录
4. WHEN 用户查看历史记录 THEN THE Transfer_Assistant SHALL 显示所有会话和消息列表
5. WHEN 用户选择历史会话 THEN THE Transfer_Assistant SHALL 显示该会话的所有消息和文件

### Requirement 7: 设备管理

**User Story:** 作为用户，我希望能够管理已连接的设备，包括查看设备信息和断开连接。

#### Acceptance Criteria

1. WHEN 设备首次连接 THEN THE Transfer_Assistant SHALL 生成唯一的设备 ID 并持久化保存
2. WHEN 显示设备列表 THEN THE Transfer_Assistant SHALL 显示设备名称、类型和连接状态
3. WHEN 用户标记常用设备 THEN THE Transfer_Assistant SHALL 在设备列表中优先显示常用设备
4. WHEN 用户断开设备连接 THEN THE Transfer_Assistant SHALL 关闭 WebSocket 连接并更新状态
5. WHEN 设备长时间未活动 THEN THE Transfer_Assistant SHALL 自动断开连接并清理资源

### Requirement 8: 中继服务器部署

**User Story:** 作为系统管理员，我希望能够在现有同步服务器上部署中继服务功能，以便支持跨网络传输。

#### Acceptance Criteria

1. WHEN 部署中继服务器 THEN THE Relay_Server SHALL 复用现有同步服务器的基础设施
2. WHEN 设备连接到中继服务器 THEN THE Relay_Server SHALL 验证设备 ID 并注册设备信息
3. WHEN 设备请求设备列表 THEN THE Relay_Server SHALL 返回当前在线的所有设备
4. WHEN 设备发送消息 THEN THE Relay_Server SHALL 根据会话 ID 转发消息到目标设备
5. WHEN 设备断开连接 THEN THE Relay_Server SHALL 清理设备信息并通知其他设备
6. WHEN 中继服务器启动 THEN THE Relay_Server SHALL 监听独立端口（默认 3002）
7. WHERE 中继服务器配置了 CORS THEN THE Relay_Server SHALL 允许所有来源的连接

### Requirement 9: 安全和隐私

**User Story:** 作为用户，我希望传输过程是安全的，不会泄露我的数据。

#### Acceptance Criteria

1. WHEN 生成配对二维码 THEN THE Transfer_Assistant SHALL 包含时间戳和过期时间（5分钟）
2. WHEN 扫描过期的二维码 THEN THE Transfer_Assistant SHALL 拒绝连接并提示用户重新生成
3. WHEN 传输敏感文件 THEN THE Transfer_Assistant SHALL 在传输完成后清理临时文件
4. WHEN 设备断开连接 THEN THE Transfer_Assistant SHALL 清理所有会话相关的内存数据
5. WHEN 用户删除传输历史 THEN THE Transfer_Assistant SHALL 同时删除关联的文件记录

### Requirement 10: 用户界面

**User Story:** 作为用户，我希望有直观的界面来管理传输功能。

#### Acceptance Criteria

1. WHEN 桌面端打开传输助手 THEN THE Transfer_Assistant SHALL 显示服务器信息和二维码
2. WHEN 显示设备列表 THEN THE Transfer_Assistant SHALL 显示设备图标、名称和连接状态
3. WHEN 建立会话后 THEN THE Transfer_Assistant SHALL 显示聊天界面和文件传输按钮
4. WHEN 传输文件时 THEN THE Transfer_Assistant SHALL 显示进度条和传输速度
5. WHEN Android 端打开传输助手 THEN THE Transfer_Assistant SHALL 显示扫码按钮和设备列表
6. WHEN 接收到新消息 THEN THE Transfer_Assistant SHALL 显示通知并更新未读计数
