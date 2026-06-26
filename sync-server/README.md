# 暮城笔记同步服务器

暮城笔记自建同步服务器，支持桌面端和移动端数据同步。提供完整的用户认证系统，支持多用户数据隔离。

## 功能特性

- 🔐 **用户认证系统** - 用户名 + 密码 + 同步密钥三重认证
- 🎫 **JWT 会话管理** - 访问令牌 + 刷新令牌机制
- 👥 **多用户支持** - 完整的用户数据隔离
- 🛡️ **安全防护** - 频率限制、暴力破解防护
- 📝 **审计日志** - 记录所有安全相关操作
- 🔄 **向后兼容** - 支持旧版 API Key 认证
- 📦 **增量同步** - 基于变更日志的高效同步
- ⚙️ **注册控制** - 管理员可开启/关闭用户注册

## 快速开始

### 方式一：Docker 部署（推荐）

1. 创建配置文件

```bash
mkdir -p sync-server && cd sync-server

# 创建 docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  sync-server:
    image: node:18-alpine
    working_dir: /app
    volumes:
      - ./:/app
      - ./data:/app/data
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
    command: npm start
    restart: unless-stopped
EOF

# 创建 .env 文件
cat > .env << 'EOF'
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production
EOF
```

2. 启动服务

```bash
docker-compose up -d
```

3. 访问 `http://localhost:3000/api/health/status` 检查服务状态

4. **首次使用**：第一个注册的用户将自动成为管理员

### 方式二：本地部署

1. 安装依赖

```bash
cd sync-server
npm install
```

2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，设置 JWT_SECRET 和 JWT_REFRESH_SECRET
```

3. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

4. **首次使用**：第一个注册的用户将自动成为管理员

### 方式三：使用 PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 构建项目
npm run build

# 启动服务
pm2 start dist/index.js --name sync-server

# 设置开机自启
pm2 startup
pm2 save
```

## 首次初始化

服务器首次启动时，需要创建管理员账号：

### 方式一：通过 API 注册（推荐）

第一个注册的用户会自动成为管理员：

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "YourSecurePassword123",
    "syncKey": "YourSyncKeyAtLeast16Chars"
  }'
```

响应：
```json
{
  "success": true,
  "userId": "...",
  "isAdmin": true,
  "message": "管理员账号创建成功"
}
```

### 方式二：通过命令行创建

```bash
npx ts-node src/scripts/createAdmin.ts admin YourPassword123 YourSyncKeyAtLeast16Chars
```

## 注册控制

管理员创建后，默认会关闭用户注册。管理员可以通过 API 控制：

### 查看注册状态

```bash
curl http://localhost:3000/api/admin/settings \
  -H "Authorization: Bearer <admin_access_token>"
```

### 开启注册

```bash
curl -X PUT http://localhost:3000/api/admin/settings/registration \
  -H "Authorization: Bearer <admin_access_token>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### 关闭注册

```bash
curl -X PUT http://localhost:3000/api/admin/settings/registration \
  -H "Authorization: Bearer <admin_access_token>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

## 配置说明

### 环境变量

创建 `.env` 文件或设置环境变量：

```bash
# 服务器配置
PORT=3000                              # 服务端口
DATABASE_PATH=./data/sync.db           # 数据库路径
RESOURCES_PATH=./data/resources        # 资源文件路径
LOG_LEVEL=info                         # 日志级别 (debug/info/warn/error)

# JWT 认证配置（必须修改！）
JWT_SECRET=your-jwt-secret             # JWT 访问令牌密钥
JWT_REFRESH_SECRET=your-refresh-secret # JWT 刷新令牌密钥
ACCESS_TOKEN_EXPIRES_IN=3600           # 访问令牌过期时间（秒），默认1小时
REFRESH_TOKEN_EXPIRES_IN=604800        # 刷新令牌过期时间（秒），默认7天

# 频率限制配置
API_RATE_LIMIT=60                      # API 请求限制（每分钟）
LOGIN_RATE_LIMIT=10                    # 登录尝试限制（每小时）
REGISTER_RATE_LIMIT=5                  # 注册尝试限制（每小时）

# 其他配置
MAX_RESOURCE_SIZE=104857600            # 最大资源文件大小（字节），默认100MB
MAX_CHUNKED_UPLOAD_SIZE=524288000      # 网盘分块上传单文件上限（字节），默认500MB
MAX_UPLOAD_CHUNK_SIZE=16777216         # 网盘单块上传硬上限（字节），默认16MB
CHANGE_LOG_RETENTION_DAYS=7            # 变更日志保留天数
CORS_ORIGINS=*                         # CORS 允许的源

# 向后兼容（可选）
API_KEYS=key1,key2                     # 旧版 API Key，逗号分隔
```

### 生成安全密钥

```bash
# Linux/macOS
openssl rand -hex 32

# 或使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 使用教程

### 1. 用户注册

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "myuser",
    "password": "MySecurePassword123",
    "syncKey": "MySyncKeyAtLeast16Characters"
  }'
```

响应：
```json
{
  "success": true,
  "userId": "a1b2c3d4e5f6...",
  "message": "注册成功"
}
```

### 2. 用户登录

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "myuser",
    "password": "MySecurePassword123",
    "syncKey": "MySyncKeyAtLeast16Characters"
  }'
```

响应：
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600,
  "user": {
    "id": "a1b2c3d4e5f6...",
    "username": "myuser",
    "role": "user",
    "status": "active"
  }
}
```

### 3. 使用访问令牌

```bash
# 获取数据项计数
curl http://localhost:3000/api/items/count \
  -H "Authorization: Bearer <access_token>"

# 上传数据项
curl -X PUT http://localhost:3000/api/items/item-id-123 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "note",
    "payload": "{\"title\":\"My Note\",\"content\":\"Hello World\"}",
    "content_hash": "abc123..."
  }'
```

### 4. 刷新令牌

当访问令牌过期时，使用刷新令牌获取新的令牌对：

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<refresh_token>"
  }'
```

### 5. 修改密码

```bash
curl -X PUT http://localhost:3000/api/user/password \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "OldPassword123",
    "newPassword": "NewPassword456"
  }'
```

### 6. 重置密码（忘记密码）

使用同步密钥验证身份：

```bash
curl -X POST http://localhost:3000/api/user/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "username": "myuser",
    "syncKey": "MySyncKeyAtLeast16Characters",
    "newPassword": "NewPassword789"
  }'
```

## 管理员功能

### 查看用户列表

```bash
curl http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer <admin_access_token>"
```

### 禁用用户

```bash
curl -X PUT http://localhost:3000/api/admin/users/<user_id>/disable \
  -H "Authorization: Bearer <admin_access_token>"
```

### 查看审计日志

```bash
curl "http://localhost:3000/api/admin/logs?page=1&limit=50" \
  -H "Authorization: Bearer <admin_access_token>"
```

## 客户端配置

### 桌面端配置

1. 打开暮城笔记 → 设置 → 同步
2. 选择同步类型：**自建服务器**
3. 填写配置：
   - 服务器地址：`http://your-server:3000`
   - 用户名：你的用户名
   - 密码：你的密码
   - 同步密钥：你的同步密钥

### 移动端配置

1. 打开暮城笔记 App → 设置 → 同步设置
2. 选择：自建服务器
3. 填写相同的配置信息

## Nginx 反向代理配置

推荐使用 Nginx 终止 HTTPS，再反向代理到本机 `127.0.0.1:3000`。使用反代时，同步服务器 `.env` 建议同时设置：

```bash
TRUST_PROXY=true
SECURE_MODE=true
CORS_ORIGINS=https://sync.yourdomain.com
JSON_BODY_LIMIT=50mb
MAX_RESOURCE_SIZE=104857600
MAX_CHUNKED_UPLOAD_SIZE=524288000
MAX_UPLOAD_CHUNK_SIZE=16777216
TRANSFER_RELAY_PATH=/transfer
```

注意：
- `TRUST_PROXY=true` 只应在服务确实位于可信 Nginx/Caddy 后面时启用，否则客户端可伪造来源 IP 影响限流和审计。
- `SECURE_MODE=true` 会要求请求经过 HTTPS。反代必须传递 `X-Forwarded-Proto https`，否则服务端会拒绝请求。
- 快传中继使用 Socket.IO，`/transfer` 路径必须支持 WebSocket Upgrade。
- `client_max_body_size` 必须大于实际请求体大小。普通资源直传时要覆盖 `MAX_RESOURCE_SIZE`；网盘分块上传时至少要大于实际单块大小（客户端分块大小会被服务端下调到 `MAX_UPLOAD_CHUNK_SIZE`，默认 16MB）。如果 Nginx 限制小于单块大小，请求会在到达 Node 服务前直接 413，服务端代码无法再下调或恢复。

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 443 ssl http2;
    server_name sync.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    client_max_body_size 100M;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # 可选：明确保留快传中继路径，便于排查 WebSocket 配置
    location /transfer/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name sync.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

## Caddy 反向代理配置

Caddy 会自动申请和续期 SSL 证书，配置更简单：

使用 Caddy 反代时，同步服务器 `.env` 同样建议设置：

```bash
TRUST_PROXY=true
SECURE_MODE=true
CORS_ORIGINS=https://sync.yourdomain.com
JSON_BODY_LIMIT=50mb
MAX_RESOURCE_SIZE=104857600
MAX_CHUNKED_UPLOAD_SIZE=524288000
MAX_UPLOAD_CHUNK_SIZE=16777216
TRANSFER_RELAY_PATH=/transfer
```

Caddy 的 `reverse_proxy` 默认支持 WebSocket，不需要额外写 Upgrade 头；但仍要保留 `X-Forwarded-Proto` 和真实 IP 头，供服务端 HTTPS 判断、登录限流和审计日志使用。

注意：`request_body.max_size` 与 Nginx 的 `client_max_body_size` 一样，会在请求进入 Node 服务前生效。普通资源直传要覆盖 `MAX_RESOURCE_SIZE`；网盘分块上传至少要大于实际单块大小（通常不小于 `MAX_UPLOAD_CHUNK_SIZE`，默认 16MB）。否则反代会先返回 413，服务端无法执行分块大小下调逻辑。

### 基础配置（Caddyfile）

```caddyfile
sync.yourdomain.com {
    # 反向代理到同步服务器
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
    
    # 上传文件大小限制
    request_body {
        max_size 100MB
    }
    
    # 日志
    log {
        output file /var/log/caddy/sync-access.log
    }
}
```

### 带安全头的完整配置

```caddyfile
sync.yourdomain.com {
    # 反向代理
    reverse_proxy 127.0.0.1:3000 {
        # 传递真实 IP
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
    
    # 上传文件大小限制
    request_body {
        max_size 100MB
    }
    
    # 安全响应头
    header {
        # 防止 XSS
        X-XSS-Protection "1; mode=block"
        # 防止 MIME 类型嗅探
        X-Content-Type-Options "nosniff"
        # 防止点击劫持
        X-Frame-Options "DENY"
        # 严格传输安全
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        # 移除服务器标识
        -Server
    }
    
    # 日志
    log {
        output file /var/log/caddy/sync-access.log {
            roll_size 10MB
            roll_keep 5
        }
    }
}
```

### Docker Compose 配置（Caddy + 同步服务器）

```yaml
version: '3.8'

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - sync-server

  sync-server:
    build: .
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - TRUST_PROXY=true
      - SECURE_MODE=true
      - CORS_ORIGINS=https://sync.yourdomain.com
      - TRANSFER_RELAY_KEY=${TRANSFER_RELAY_KEY}
    volumes:
      - ./data:/app/data

volumes:
  caddy_data:
  caddy_config:
```

对应的 Caddyfile：

```caddyfile
sync.yourdomain.com {
    reverse_proxy sync-server:3000
    request_body {
        max_size 100MB
    }
}
```

### 使用 Caddy 的优势

1. **自动 HTTPS** - 自动申请和续期 Let's Encrypt 证书
2. **配置简单** - 比 Nginx 配置更简洁
3. **零停机更新** - 配置更改自动热重载
4. **内置安全** - 默认启用现代 TLS 配置

## API 参考

### 公开 API（无需认证）

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/health/status | 系统状态（是否已初始化、注册是否开放） |
| POST | /api/auth/register | 用户注册（需注册开放或首次初始化） |
| POST | /api/auth/login | 用户登录 |
| POST | /api/auth/refresh | 刷新令牌 |
| POST | /api/user/reset-password | 重置密码（需同步密钥验证） |

### 认证 API

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | /api/auth/logout | 登出 | 是 |
| POST | /api/auth/logout-all | 登出所有设备 | 是 |

### 用户 API

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/user/profile | 获取用户信息 | 是 |
| PUT | /api/user/password | 修改密码 | 是 |
| PUT | /api/user/sync-key | 更新同步密钥 | 是 |

### 管理员 API

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/admin/settings | 获取系统设置 | 管理员 |
| PUT | /api/admin/settings/registration | 设置注册开关 | 管理员 |
| GET | /api/admin/users | 用户列表 | 管理员 |
| GET | /api/admin/users/stats | 用户统计 | 管理员 |
| PUT | /api/admin/users/:id/disable | 禁用用户 | 管理员 |
| PUT | /api/admin/users/:id/enable | 启用用户 | 管理员 |
| DELETE | /api/admin/users/:id | 删除用户 | 管理员 |
| GET | /api/admin/logs | 审计日志 | 管理员 |
| GET | /api/admin/logs/stats | 日志统计 | 管理员 |

### 数据 API

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/items/:id | 获取数据项 | 是 |
| PUT | /api/items/:id | 创建/更新数据项 | 是 |
| DELETE | /api/items/:id | 删除数据项 | 是 |
| GET | /api/items/count | 数据项计数 | 是 |
| POST | /api/items/batch | 批量上传 | 是 |
| GET | /api/changes | 获取变更列表 | 是 |
| GET | /api/resources/:id | 下载资源 | 是 |
| PUT | /api/resources/:id | 上传资源 | 是 |

## 安全建议

### 生产环境必须配置

1. **设置强随机密钥**
   ```bash
   # 生成 JWT 密钥
   node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
   node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **使用 HTTPS** - 必须配置 SSL/TLS（使用 Caddy 或 Nginx）

3. **限制 CORS 来源**
   ```bash
   CORS_ORIGINS=https://sync.yourdomain.com
   ```

4. **启用代理信任**（如果使用反向代理）
   ```bash
   TRUST_PROXY=true
   ```

### 安全措施说明

| 安全措施 | 说明 |
|---------|------|
| **三重认证** | 用户名 + 密码 + 同步密钥，缺一不可 |
| **密码强度** | ≥8字符，必须包含字母和数字，禁止常见弱密码 |
| **渐进式封禁** | 登录失败后封禁时间递增：15分钟→30分钟→1小时→2小时→4小时 |
| **会话限制** | 每用户最多10个活跃会话 |
| **审计日志** | 记录所有登录、注册、密码修改等敏感操作 |
| **令牌过期** | 访问令牌1小时过期，刷新令牌7天过期 |

### 数据备份

```bash
# 备份数据库
cp ./data/sync.db ./backup/sync-$(date +%Y%m%d).db

# 备份资源文件
tar -czf ./backup/resources-$(date +%Y%m%d).tar.gz ./data/resources/
```

### 监控建议

1. **定期检查审计日志** - 关注失败的登录尝试
2. **监控磁盘空间** - 资源文件可能占用大量空间
3. **设置告警** - 对异常登录行为设置告警

## 故障排除

### 常见问题

**Q: 登录时提示"同步密钥验证失败"**
A: 确保登录时使用的同步密钥与注册时完全一致。同步密钥区分大小写。

**Q: 访问令牌过期后无法刷新**
A: 刷新令牌也有过期时间（默认7天），过期后需要重新登录。

**Q: 忘记同步密钥怎么办？**
A: 同步密钥无法恢复。如果忘记，需要联系管理员删除账号后重新注册。

**Q: 如何迁移旧版 API Key 数据？**
A: 旧版 API Key 认证仍然支持。建议逐步迁移到新的用户认证系统。

### 查看日志

```bash
# Docker 部署
docker-compose logs -f sync-server

# PM2 部署
pm2 logs sync-server

# 本地开发
# 日志直接输出到控制台
```

## 许可证

MIT License
