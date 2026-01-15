# 中继服务器部署指南

## 概述

中继服务器用于在设备无法直接通过局域网连接时，提供消息和文件的转发服务。中继服务器集成在暮城笔记同步服务器中，通过 `/transfer` 路径提供服务。

## 系统要求

- Node.js 18.x 或更高版本
- 至少 512MB 内存
- 稳定的网络连接
- 开放端口（默认 3000）

## 安装步骤

### 1. 克隆代码

```bash
git clone https://github.com/your-repo/mucheng-notes.git
cd mucheng-notes/sync-server
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 服务器端口
PORT=3000

# 传输功能开关
TRANSFER_ENABLED=true

# 传输限制配置
TRANSFER_MAX_CONNECTIONS=100
TRANSFER_MAX_MESSAGE_RATE=60
TRANSFER_MAX_FILE_TRANSFERS=10

# 日志级别
LOG_LEVEL=info
```

### 4. 启动服务器

开发模式：
```bash
npm run dev
```

生产模式：
```bash
npm run build
npm start
```

## Docker 部署

### 使用 Docker Compose

```yaml
version: '3.8'

services:
  sync-server:
    build: ./sync-server
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - TRANSFER_ENABLED=true
      - TRANSFER_MAX_CONNECTIONS=100
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

启动：
```bash
docker-compose up -d
```

### 使用 Dockerfile

```bash
cd sync-server
docker build -t mucheng-sync-server .
docker run -d -p 3000:3000 --name sync-server mucheng-sync-server
```

## 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | 3000 | 服务器监听端口 |
| `TRANSFER_ENABLED` | true | 是否启用传输功能 |
| `TRANSFER_MAX_CONNECTIONS` | 100 | 最大同时连接数 |
| `TRANSFER_MAX_MESSAGE_RATE` | 60 | 每分钟最大消息数 |
| `TRANSFER_MAX_FILE_TRANSFERS` | 10 | 最大并发文件传输数 |
| `LOG_LEVEL` | info | 日志级别 |

### 限流配置

中继服务器内置了限流机制，防止滥用：

- **连接数限制**：单个 IP 最多 10 个连接
- **消息频率限制**：每分钟最多 60 条消息
- **文件传输限制**：最多 10 个并发传输

## 性能优化

### 内存优化

对于高并发场景，建议增加 Node.js 内存限制：

```bash
NODE_OPTIONS="--max-old-space-size=2048" npm start
```

### 连接池配置

在 `config.ts` 中调整 Socket.IO 配置：

```typescript
const io = new Server(httpServer, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e6, // 1MB
  pingTimeout: 60000,
  pingInterval: 25000,
});
```

### 负载均衡

对于大规模部署，建议使用 Nginx 进行负载均衡：

```nginx
upstream sync_servers {
    ip_hash;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}

server {
    listen 80;
    server_name sync.example.com;

    location /transfer {
        proxy_pass http://sync_servers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 监控和维护

### 健康检查

服务器提供健康检查端点：

```bash
curl http://localhost:3000/health
```

响应示例：
```json
{
  "status": "ok",
  "transfer": {
    "enabled": true,
    "connections": 5,
    "activeSessions": 2
  }
}
```

### 日志查看

```bash
# Docker 环境
docker logs -f sync-server

# 直接运行
tail -f logs/server.log
```

### 常见问题

#### 连接数过多

如果连接数持续增长，检查：
1. 客户端是否正确断开连接
2. 是否有恶意连接
3. 考虑增加服务器资源

#### 内存泄漏

如果内存持续增长：
1. 检查是否有未清理的会话
2. 重启服务器
3. 升级到最新版本

## 安全建议

1. **使用 HTTPS**：在生产环境中配置 SSL 证书
2. **限制来源**：配置 CORS 只允许可信来源
3. **监控异常**：设置告警监控异常连接
4. **定期更新**：保持依赖包更新

## API 参考

### Socket.IO 事件

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `device:register` | C→S | 设备注册 |
| `device:list` | S→C | 设备列表 |
| `message:send` | C→S | 发送消息 |
| `message:receive` | S→C | 接收消息 |
| `file:chunk` | C→S | 文件分块 |

详细 API 文档请参考 [API.md](./API.md)。

