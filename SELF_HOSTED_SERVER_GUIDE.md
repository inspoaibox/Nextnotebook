# 暮城笔记 - 自建同步服务器部署指南

## 概述

暮城笔记支持自建同步服务器，提供完整的用户认证系统和多用户数据隔离。本指南将帮助你快速部署和配置同步服务器。

## 系统要求

- Node.js 18.0 或更高版本
- 至少 512MB 内存
- 至少 1GB 磁盘空间（根据数据量调整）

## 快速部署

### 方式一：Docker 部署（推荐）

这是最简单的部署方式，适合大多数用户。

#### 1. 准备配置文件

```bash
# 创建项目目录
mkdir mucheng-sync && cd mucheng-sync

# 创建 docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  sync-server:
    image: node:18-alpine
    container_name: mucheng-sync
    working_dir: /app
    volumes:
      - ./sync-server:/app
      - ./data:/app/data
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_PATH=/app/data/sync.db
      - RESOURCES_PATH=/app/data/resources
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
    command: sh -c "npm install && npm run build && npm start"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
EOF
```

#### 2. 生成安全密钥

```bash
# 生成 JWT 密钥
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

# 创建 .env 文件
cat > .env << EOF
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
EOF

echo "密钥已生成并保存到 .env 文件"
echo "请妥善保管这些密钥！"
```

#### 3. 复制同步服务器代码

```bash
# 从项目中复制 sync-server 目录
cp -r /path/to/mucheng-notes/sync-server ./
```

#### 4. 启动服务

```bash
# 启动容器
docker-compose up -d

# 查看日志
docker-compose logs -f
```

#### 5. 创建管理员账号

```bash
docker-compose exec sync-server npx ts-node src/scripts/createAdmin.ts admin YourPassword123 YourSyncKeyAtLeast16Chars
```

### 方式二：直接部署

适合有 Node.js 环境的服务器。

#### 1. 安装依赖

```bash
cd sync-server
npm install
```

#### 2. 配置环境变量

```bash
cp .env.example .env

# 编辑 .env 文件
nano .env
```

必须修改的配置：
```bash
JWT_SECRET=your-super-secret-jwt-key-at-least-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-at-least-32-chars
```

#### 3. 构建和启动

```bash
# 构建
npm run build

# 启动
npm start
```

#### 4. 使用 PM2 管理进程（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start dist/index.js --name mucheng-sync

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status

# 查看日志
pm2 logs mucheng-sync
```

#### 5. 创建管理员账号

```bash
npx ts-node src/scripts/createAdmin.ts admin YourPassword123 YourSyncKeyAtLeast16Chars
```

### 方式三：使用 systemd 服务

适合 Linux 服务器。

#### 1. 创建服务文件

```bash
sudo nano /etc/systemd/system/mucheng-sync.service
```

```ini
[Unit]
Description=Mucheng Notes Sync Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/mucheng-sync/sync-server
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=JWT_SECRET=your-jwt-secret
Environment=JWT_REFRESH_SECRET=your-refresh-secret

[Install]
WantedBy=multi-user.target
```

#### 2. 启动服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable mucheng-sync
sudo systemctl start mucheng-sync
sudo systemctl status mucheng-sync
```

## 配置 HTTPS（强烈推荐）

生产环境必须使用 HTTPS 保护数据传输安全。

### 使用 Nginx 反向代理

#### 1. 安装 Nginx 和 Certbot

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install nginx certbot python3-certbot-nginx
```

#### 2. 配置 Nginx

```bash
sudo nano /etc/nginx/sites-available/mucheng-sync
```

```nginx
server {
    listen 80;
    server_name sync.yourdomain.com;
    
    # 用于 Let's Encrypt 验证
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # 重定向到 HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name sync.yourdomain.com;

    # SSL 证书（由 Certbot 自动配置）
    ssl_certificate /etc/letsencrypt/live/sync.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sync.yourdomain.com/privkey.pem;
    
    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # 上传文件大小限制
    client_max_body_size 100M;

    # 反向代理
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

#### 3. 启用配置并获取证书

```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/mucheng-sync /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx

# 获取 SSL 证书
sudo certbot --nginx -d sync.yourdomain.com
```

## 客户端配置

### 桌面端

1. 打开暮城笔记
2. 进入 **设置** → **同步**
3. 选择同步类型：**自建服务器**
4. 填写配置：
   - 服务器地址：`https://sync.yourdomain.com`（或 `http://localhost:3000`）
   - 用户名：你注册的用户名
   - 密码：你的密码
   - 同步密钥：你的同步密钥（至少16个字符）
5. 点击 **测试连接**
6. 连接成功后点击 **保存**

### 移动端

1. 打开暮城笔记 App
2. 进入 **设置** → **同步设置**
3. 选择：**自建服务器**
4. 填写相同的配置信息
5. 点击 **连接**

## 用户管理

### 注册新用户

用户可以通过 API 自行注册：

```bash
curl -X POST https://sync.yourdomain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "password": "SecurePassword123",
    "syncKey": "MySyncKeyAtLeast16Chars"
  }'
```

### 管理员操作

使用管理员账号登录后，可以：

```bash
# 获取访问令牌
TOKEN=$(curl -s -X POST https://sync.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YourPassword123","syncKey":"YourSyncKey"}' \
  | jq -r '.accessToken')

# 查看所有用户
curl https://sync.yourdomain.com/api/admin/users \
  -H "Authorization: Bearer $TOKEN"

# 禁用用户
curl -X PUT https://sync.yourdomain.com/api/admin/users/<user_id>/disable \
  -H "Authorization: Bearer $TOKEN"

# 查看审计日志
curl https://sync.yourdomain.com/api/admin/logs \
  -H "Authorization: Bearer $TOKEN"
```

## 数据备份

### 自动备份脚本

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backup/mucheng-sync"
DATA_DIR="/opt/mucheng-sync/data"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据库
cp $DATA_DIR/sync.db $BACKUP_DIR/sync_$DATE.db

# 备份资源文件
tar -czf $BACKUP_DIR/resources_$DATE.tar.gz -C $DATA_DIR resources

# 保留最近 7 天的备份
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

设置定时任务：
```bash
# 每天凌晨 3 点备份
crontab -e
0 3 * * * /opt/mucheng-sync/backup.sh >> /var/log/mucheng-backup.log 2>&1
```

## 监控和维护

### 健康检查

```bash
# 检查服务状态
curl https://sync.yourdomain.com/api/health

# 检查服务器状态
curl https://sync.yourdomain.com/api/status \
  -H "Authorization: Bearer $TOKEN"
```

### 日志查看

```bash
# Docker 部署
docker-compose logs -f --tail=100

# PM2 部署
pm2 logs mucheng-sync --lines 100

# systemd 部署
journalctl -u mucheng-sync -f
```

### 数据库维护

```bash
# 进入数据库
sqlite3 /opt/mucheng-sync/data/sync.db

# 查看表大小
SELECT name, SUM(pgsize) as size FROM dbstat GROUP BY name ORDER BY size DESC;

# 清理过期变更日志（保留 7 天）
DELETE FROM changes WHERE created_at < strftime('%s', 'now', '-7 days') * 1000;

# 优化数据库
VACUUM;
ANALYZE;
```

## 故障排除

### 常见问题

**Q: 无法连接到服务器**
- 检查服务是否运行：`curl http://localhost:3000/api/health`
- 检查防火墙是否开放端口
- 检查 Nginx 配置是否正确

**Q: 登录失败**
- 确认用户名、密码、同步密钥都正确
- 检查是否被频率限制（等待 15 分钟后重试）
- 查看服务器日志获取详细错误信息

**Q: 同步失败**
- 检查网络连接
- 确认访问令牌未过期
- 检查服务器磁盘空间

**Q: 忘记同步密钥**
- 同步密钥无法恢复
- 联系管理员删除账号后重新注册
- 或使用管理员账号重置

### 获取帮助

如果遇到问题，请：
1. 查看服务器日志
2. 检查 [GitHub Issues](https://github.com/your-repo/issues)
3. 提交新的 Issue 并附上日志信息

## 安全建议

1. **必须使用 HTTPS** - 保护数据传输安全
2. **使用强密钥** - JWT 密钥至少 32 个字符
3. **定期备份** - 防止数据丢失
4. **监控日志** - 及时发现异常活动
5. **更新软件** - 保持系统和依赖更新
6. **限制访问** - 使用防火墙限制不必要的访问
7. **保护同步密钥** - 同步密钥用于数据加密，请妥善保管

## API 参考

详细的 API 文档请参考 [sync-server/README.md](sync-server/README.md)。
