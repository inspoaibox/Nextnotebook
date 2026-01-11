# Implementation Plan: Sync Server Authentication System

## Overview

实现暮城笔记同步服务器的用户认证系统，采用账号+密码+同步密钥三重认证，JWT会话管理，完整的用户管理和安全防护功能。

## Tasks

- [ ] 1. 数据库架构扩展
  - [x] 1.1 创建用户认证相关数据表
    - 在 `sync-server/src/database/schema.ts` 中添加 users、sessions、audit_logs、rate_limits 表
    - 添加必要的索引
    - _Requirements: 1.5, 1.6, 6.5_

  - [x] 1.2 扩展现有表支持用户隔离
    - 为 items 表添加 user_id 字段
    - 为 changes 表添加 user_id 字段
    - 添加 user_id 索引
    - _Requirements: 5.1_

  - [x] 1.3 创建数据库迁移逻辑
    - 添加版本检查和自动迁移
    - 迁移现有 key_fingerprints 数据到用户系统
    - 迁移现有 sync_cursors 数据到用户系统
    - 确保现有数据不受影响
    - _Requirements: 10.1, 10.4_

- [x] 2. 核心认证服务实现
  - [x] 2.1 实现密码哈希工具
    - 创建 `sync-server/src/utils/crypto.ts`
    - 实现 bcrypt 密码哈希和验证
    - 实现 SHA-256 同步密钥指纹计算
    - _Requirements: 1.5, 1.6, 7.3, 8.3_

  - [ ] 2.2 编写密码哈希属性测试
    - **Property 1: 密码哈希不可逆性**
    - **Property 6: 同步密钥指纹一致性**
    - **Validates: Requirements 1.5, 1.6, 7.3, 8.3**

  - [x] 2.3 实现 TokenService
    - 创建 `sync-server/src/services/TokenService.ts`
    - 实现 JWT 访问令牌生成和验证
    - 实现刷新令牌生成和验证
    - 实现令牌失效功能
    - _Requirements: 2.5, 2.6, 3.1, 3.2, 3.5_

  - [ ] 2.4 编写令牌服务属性测试
    - **Property 2: 令牌验证一致性**
    - **Property 5: 令牌失效传播**
    - **Validates: Requirements 2.5, 2.6, 3.5**

  - [x] 2.5 实现 AuthService
    - 创建 `sync-server/src/services/AuthService.ts`
    - 实现用户注册功能
    - 实现用户登录功能
    - 实现密码修改和重置功能
    - 实现同步密钥更新功能
    - _Requirements: 1.1-1.6, 2.1-2.3, 7.1, 7.2, 7.4, 8.1_

  - [ ] 2.5.1 编写注册登录属性测试
    - 测试有效注册创建用户
    - 测试无效输入被拒绝
    - 测试登录验证正确性
    - **Validates: Requirements 1.1-1.4, 2.1-2.3**

- [ ] 3. Checkpoint - 核心服务测试
  - 确保所有核心服务测试通过
  - 如有问题请询问用户

- [x] 4. 中间件实现
  - [x] 4.1 实现 RateLimiter 中间件
    - 创建 `sync-server/src/middleware/rateLimiter.ts`
    - 实现 API 请求频率限制（60次/分钟）
    - 实现登录尝试频率限制（10次/小时）
    - 实现 IP 封禁功能
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ] 4.2 编写频率限制属性测试
    - **Property 4: 频率限制有效性**
    - **Validates: Requirements 9.1, 9.2**

  - [x] 4.3 更新认证中间件
    - 修改 `sync-server/src/middleware/auth.ts`
    - 添加 JWT 令牌验证
    - 添加同步密钥指纹验证
    - 保持 API Key 向后兼容
    - _Requirements: 4.1-4.5, 10.1, 10.2_

  - [ ] 4.4 编写认证中间件属性测试
    - **Property 3: 会话隔离性**
    - **Validates: Requirements 4.1-4.5**

- [x] 5. 用户服务和管理功能
  - [x] 5.1 实现 UserService
    - 创建 `sync-server/src/services/UserService.ts`
    - 实现用户查询功能
    - 实现用户列表功能（管理员）
    - 实现用户禁用/启用功能
    - _Requirements: 6.1-6.3_

  - [x] 5.2 实现 AuditService
    - 创建 `sync-server/src/services/AuditService.ts`
    - 实现审计日志记录
    - 实现审计日志查询
    - _Requirements: 6.4, 6.5, 9.5_

- [x] 6. API 路由实现
  - [x] 6.1 创建认证路由
    - 创建 `sync-server/src/routes/auth.ts`
    - POST /api/auth/register - 用户注册
    - POST /api/auth/login - 用户登录
    - POST /api/auth/refresh - 刷新令牌
    - POST /api/auth/logout - 登出
    - POST /api/auth/logout-all - 登出所有设备
    - _Requirements: 1.1, 2.1, 3.1-3.4_

  - [x] 6.2 创建用户路由
    - 创建 `sync-server/src/routes/user.ts`
    - PUT /api/user/password - 修改密码
    - PUT /api/user/sync-key - 更新同步密钥
    - POST /api/user/reset-password - 重置密码
    - GET /api/user/profile - 获取用户信息
    - _Requirements: 7.1, 7.2, 8.1_

  - [x] 6.3 创建管理员路由
    - 创建 `sync-server/src/routes/admin.ts`
    - GET /api/admin/users - 用户列表
    - PUT /api/admin/users/:id/disable - 禁用用户
    - PUT /api/admin/users/:id/enable - 启用用户
    - GET /api/admin/logs - 审计日志
    - _Requirements: 6.1-6.5_

  - [x] 6.4 更新应用入口
    - 修改 `sync-server/src/app.ts`
    - 注册新路由
    - 配置中间件顺序
    - _Requirements: 4.1-4.5_

- [ ] 7. Checkpoint - API 路由测试
  - 确保所有 API 端点正常工作
  - 如有问题请询问用户

- [ ] 8. 数据隔离实现
  - [ ] 8.1 更新 ItemService 支持用户隔离
    - 修改 `sync-server/src/services/ItemService.ts`
    - 添加用户ID过滤
    - 确保数据查询只返回当前用户数据
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ] 8.2 编写数据隔离属性测试
    - **Property 7: 用户数据隔离完整性**
    - **Validates: Requirements 5.1-5.3**

  - [ ] 8.3 更新资源存储支持用户隔离
    - 修改资源存储路径包含用户ID
    - 确保用户只能访问自己的资源
    - _Requirements: 5.4_

- [ ] 9. 安全增强
  - [ ] 9.1 实现安全响应处理
    - 确保错误响应不泄露用户存在信息
    - 统一错误消息格式
    - _Requirements: 9.4_

  - [ ] 9.2 实现会话失效传播
    - 密码修改后使所有会话失效
    - 同步密钥更新后使所有会话失效
    - 用户禁用后使所有会话失效
    - _Requirements: 7.5, 8.2, 6.2_

- [ ] 10. 向后兼容和迁移
  - [x] 10.1 实现 API Key 兼容层
    - 保持现有 API Key 认证方式
    - API Key 请求关联到默认用户
    - 在日志中标记认证方式
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 10.2 创建数据迁移工具
    - 创建 `sync-server/src/scripts/createAdmin.ts`
    - 将现有 API Key 数据迁移到用户账号
    - 迁移 sync_cursors 和 key_fingerprints 数据
    - _Requirements: 10.4_

- [ ] 11. 客户端适配（桌面端）
  - [ ] 11.1 更新 ServerAdapter 支持用户认证
    - 修改 `src/core/sync/ServerAdapter.ts`
    - 添加登录、登出、令牌刷新方法
    - 实现自动令牌刷新逻辑
    - _Requirements: 11.1, 11.3, 11.5_

  - [ ] 11.2 更新同步设置 UI
    - 修改 `src/renderer/components/SettingsModal.tsx`
    - 添加用户名、密码、同步密钥输入
    - 添加认证方式切换（API Key / 用户登录）
    - _Requirements: 11.1, 11.6_

  - [ ] 11.3 实现令牌安全存储
    - 使用 electron-store 或 keytar 安全存储令牌
    - 实现令牌过期检测和自动刷新
    - _Requirements: 11.2, 11.3, 11.4_

- [x] 12. 配置和文档更新
  - [x] 12.1 更新配置文件
    - 添加 JWT 密钥配置
    - 添加令牌过期时间配置
    - 添加频率限制配置
    - 更新 `.env.example`
    - 创建 `Dockerfile` 和 `docker-compose.yml`

  - [x] 12.2 更新 README 文档
    - 添加用户认证说明
    - 添加 API 文档
    - 添加部署教程
    - 更新 `SELF_HOSTED_SERVER_GUIDE.md`

- [ ] 13. Final Checkpoint - 完整测试
  - 确保所有测试通过
  - 验证向后兼容性
  - 测试桌面客户端认证流程
  - 如有问题请询问用户

## Notes

- 所有任务均为必需，包括测试任务
- 每个任务引用具体的需求以确保可追溯性
- Checkpoint 任务用于增量验证
- 属性测试验证通用正确性属性
- 单元测试验证具体示例和边界情况
