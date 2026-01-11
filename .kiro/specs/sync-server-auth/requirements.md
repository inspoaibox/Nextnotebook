# Requirements Document

## Introduction

为暮城笔记同步服务器添加完整的用户认证系统，支持账号+密码+密钥的三重认证方式。该系统将提供用户注册、登录、会话管理、数据隔离以及管理员功能，确保多用户环境下的数据安全和访问控制。

## Glossary

- **Auth_System**: 用户认证系统，负责用户身份验证和授权
- **User**: 系统用户实体，包含账号、密码哈希、加密密钥等信息
- **Session**: 用户会话，包含 JWT Token 和刷新令牌
- **Sync_Key**: 同步密钥，用于数据加密和额外的身份验证
- **Admin**: 管理员用户，拥有用户管理和系统配置权限
- **Password_Hasher**: 密码哈希处理器，使用 bcrypt 算法
- **Token_Manager**: JWT 令牌管理器，负责生成和验证访问令牌
- **Rate_Limiter**: 请求频率限制器，防止暴力破解攻击

## Requirements

### Requirement 1: 用户注册

**User Story:** As a 新用户, I want to 注册账号, so that 我可以使用同步服务存储和同步我的笔记数据。

#### Acceptance Criteria

1. WHEN 用户提交有效的用户名、密码和同步密钥 THEN THE Auth_System SHALL 创建新用户账号并返回成功响应
2. WHEN 用户提交的用户名已存在 THEN THE Auth_System SHALL 返回用户名已存在的错误
3. WHEN 用户提交的密码长度少于8个字符 THEN THE Auth_System SHALL 返回密码强度不足的错误
4. WHEN 用户提交的同步密钥长度少于16个字符 THEN THE Auth_System SHALL 返回密钥长度不足的错误
5. THE Password_Hasher SHALL 使用 bcrypt 算法对密码进行哈希存储
6. THE Auth_System SHALL 对同步密钥进行 SHA-256 哈希后存储指纹

### Requirement 2: 用户登录

**User Story:** As a 已注册用户, I want to 登录系统, so that 我可以访问我的同步数据。

#### Acceptance Criteria

1. WHEN 用户提交正确的用户名、密码和同步密钥 THEN THE Auth_System SHALL 返回访问令牌和刷新令牌
2. WHEN 用户提交错误的用户名或密码 THEN THE Auth_System SHALL 返回认证失败错误
3. WHEN 用户提交错误的同步密钥 THEN THE Auth_System SHALL 返回密钥验证失败错误
4. WHEN 用户连续5次登录失败 THEN THE Rate_Limiter SHALL 锁定该账号15分钟
5. THE Token_Manager SHALL 生成有效期为1小时的访问令牌
6. THE Token_Manager SHALL 生成有效期为7天的刷新令牌

### Requirement 3: 会话管理

**User Story:** As a 已登录用户, I want to 管理我的会话, so that 我可以安全地使用服务并在需要时登出。

#### Acceptance Criteria

1. WHEN 访问令牌过期且刷新令牌有效 THEN THE Token_Manager SHALL 颁发新的访问令牌
2. WHEN 刷新令牌过期 THEN THE Auth_System SHALL 要求用户重新登录
3. WHEN 用户请求登出 THEN THE Auth_System SHALL 使当前会话的所有令牌失效
4. WHEN 用户请求登出所有设备 THEN THE Auth_System SHALL 使该用户的所有会话令牌失效
5. THE Auth_System SHALL 在令牌中包含用户ID和同步密钥指纹

### Requirement 4: API 访问控制

**User Story:** As a 系统, I want to 验证每个API请求, so that 只有授权用户才能访问其数据。

#### Acceptance Criteria

1. WHEN 请求包含有效的访问令牌 THEN THE Auth_System SHALL 允许访问并注入用户上下文
2. WHEN 请求不包含访问令牌 THEN THE Auth_System SHALL 返回401未授权错误
3. WHEN 请求包含无效或过期的访问令牌 THEN THE Auth_System SHALL 返回403禁止访问错误
4. THE Auth_System SHALL 确保用户只能访问自己的数据
5. WHILE 用户已登录 THE Auth_System SHALL 在每个请求中验证同步密钥指纹一致性

### Requirement 5: 数据隔离

**User Story:** As a 用户, I want to 我的数据与其他用户隔离, so that 我的笔记数据安全且私密。

#### Acceptance Criteria

1. THE Auth_System SHALL 为每个用户的数据添加用户ID标识
2. WHEN 查询数据 THEN THE Auth_System SHALL 自动过滤只返回当前用户的数据
3. WHEN 用户尝试访问其他用户的数据 THEN THE Auth_System SHALL 返回404未找到错误
4. THE Auth_System SHALL 为每个用户的资源文件创建独立的存储目录

### Requirement 6: 管理员功能

**User Story:** As a 管理员, I want to 管理用户和查看系统状态, so that 我可以维护系统正常运行。

#### Acceptance Criteria

1. WHEN 管理员请求用户列表 THEN THE Auth_System SHALL 返回所有用户的基本信息（不含密码和密钥）
2. WHEN 管理员禁用用户账号 THEN THE Auth_System SHALL 立即使该用户的所有会话失效
3. WHEN 管理员启用用户账号 THEN THE Auth_System SHALL 允许该用户重新登录
4. WHEN 管理员请求系统日志 THEN THE Auth_System SHALL 返回最近的操作日志
5. THE Auth_System SHALL 记录所有登录尝试和管理操作到审计日志

### Requirement 7: 密码安全

**User Story:** As a 用户, I want to 安全地管理我的密码, so that 我的账号不会被盗用。

#### Acceptance Criteria

1. WHEN 用户请求修改密码 THEN THE Auth_System SHALL 验证当前密码后允许设置新密码
2. WHEN 用户忘记密码且提供正确的同步密钥 THEN THE Auth_System SHALL 允许重置密码
3. THE Password_Hasher SHALL 使用至少10轮的 bcrypt 哈希
4. THE Auth_System SHALL 拒绝与用户名相同的密码
5. IF 密码被修改 THEN THE Auth_System SHALL 使所有现有会话失效

### Requirement 8: 同步密钥管理

**User Story:** As a 用户, I want to 管理我的同步密钥, so that 我可以在需要时更新密钥。

#### Acceptance Criteria

1. WHEN 用户请求更新同步密钥 THEN THE Auth_System SHALL 验证当前密码和旧密钥后允许设置新密钥
2. IF 同步密钥被更新 THEN THE Auth_System SHALL 使所有现有会话失效
3. THE Auth_System SHALL 存储同步密钥的 SHA-256 指纹而非明文
4. WHEN 客户端同步时提供的密钥指纹与存储的不匹配 THEN THE Auth_System SHALL 拒绝同步请求

### Requirement 9: 安全防护

**User Story:** As a 系统管理员, I want to 防止恶意攻击, so that 系统和用户数据安全。

#### Acceptance Criteria

1. THE Rate_Limiter SHALL 限制每个IP每分钟最多60次API请求
2. THE Rate_Limiter SHALL 限制每个IP每小时最多10次登录尝试
3. WHEN 检测到暴力破解攻击 THEN THE Auth_System SHALL 临时封禁该IP地址
4. THE Auth_System SHALL 在响应中不泄露用户是否存在的信息
5. THE Auth_System SHALL 对所有敏感操作记录审计日志

### Requirement 10: 向后兼容

**User Story:** As a 现有用户, I want to 继续使用旧的API Key认证, so that 我不需要立即迁移到新系统。

#### Acceptance Criteria

1. WHILE 配置了API_KEYS环境变量 THE Auth_System SHALL 继续支持旧的API Key认证方式
2. WHEN 使用API Key认证 THEN THE Auth_System SHALL 将请求关联到默认用户
3. THE Auth_System SHALL 在日志中标记使用旧认证方式的请求
4. THE Auth_System SHALL 提供迁移工具将API Key数据迁移到用户账号

### Requirement 11: 客户端适配

**User Story:** As a 桌面/移动端用户, I want to 使用新的认证系统登录, so that 我可以安全地同步数据。

#### Acceptance Criteria

1. WHEN 客户端配置同步服务器 THEN THE Client SHALL 支持输入用户名、密码和同步密钥
2. WHEN 客户端登录成功 THEN THE Client SHALL 安全存储访问令牌和刷新令牌
3. WHEN 访问令牌过期 THEN THE Client SHALL 自动使用刷新令牌获取新令牌
4. WHEN 刷新令牌过期 THEN THE Client SHALL 提示用户重新登录
5. THE Client SHALL 在同步请求中使用 Authorization Bearer 令牌
6. THE Client SHALL 支持在设置中切换认证方式（API Key / 用户登录）
