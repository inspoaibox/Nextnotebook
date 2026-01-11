# Design Document - 暮城笔记自建同步服务器

## Overview

本设计文档描述暮城笔记自建同步服务器的技术架构和实现方案。服务器采用 Node.js + Express + SQLite 技术栈，提供 RESTful API 供桌面端和移动端同步数据。

## Architecture

### 技术栈选择

- **运行时**: Node.js 18+ (LTS)
- **Web 框架**: Express.js 4.x
- **数据库**: SQLite 3 (better-sqlite3)
- **语言**: TypeScript 5.x
- **容器化**: Docker + docker-compose

### 项目结构

```
sync-server/
├── src/
│   ├── index.ts              # 入口文件
│   ├── app.ts                # Express 应用配置
│   ├── config.ts             # 配置管理
│   ├── database/
│   │   ├── index.ts          # 数据库初始化
│   │   ├── schema.ts         # 表结构定义
│   │   └── migrations/       # 数据库迁移
│   ├── middleware/
│   │   ├── auth.ts           # 认证中间件
│   │   ├── cors.ts           # CORS 中间件
│   │   ├── logger.ts         # 日志中间件
│   │   └── errorHandler.ts   # 错误处理
│   ├── routes/
│   │   ├── health.ts         # 健康检查路由
│   │   ├── meta.ts           # 元数据路由
│   │   ├── items.ts          # 数据项路由
│   │   ├── changes.ts        # 变更日志路由
│   │   ├── resources.ts      # 资源文件路由
│   │   └── sync.ts           # 同步相关路由
│   ├── services/
│   │   ├── ItemService.ts    # 数据项服务
│   │   ├── ChangeService.ts  # 变更日志服务
│   │   └── ResourceService.ts # 资源服务
│   └── types/
│       └── index.ts          # 类型定义
├── data/                     # 数据目录 (SQLite + 资源文件)
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```


## Database Schema

### items 表

存储所有同步数据项。字段名与客户端 `ItemBase` 保持一致。

```sql
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  remote_rev TEXT,
  deleted_time INTEGER,
  created_time INTEGER NOT NULL,
  updated_time INTEGER NOT NULL,
  -- 以下字段服务器不直接使用，但需要存储以便完整返回给客户端
  sync_status TEXT DEFAULT 'clean',
  local_rev INTEGER DEFAULT 0,
  encryption_applied INTEGER DEFAULT 0,
  schema_version INTEGER DEFAULT 1
);

CREATE INDEX idx_items_type ON items(type);
CREATE INDEX idx_items_updated_time ON items(updated_time);
CREATE INDEX idx_items_deleted_time ON items(deleted_time);
```

**字段说明（与客户端 ItemBase 对应）：**
- `id`: UUID 全局唯一
- `type`: 实体类型 (note, folder, tag, resource, todo, vault_entry, vault_folder, bookmark, bookmark_folder, diagram, ai_config, ai_conversation, ai_message)
- `payload`: JSON 业务字段
- `content_hash`: 内容哈希（用于快速比对）
- `remote_rev`: 远端版本标记（服务器生成的时间戳）
- `deleted_time`: 软删除时间（null 表示未删除）
- `created_time`: 创建时间戳
- `updated_time`: 最后修改时间戳
- `sync_status`: 同步状态 (clean, modified, deleted, conflict)
- `local_rev`: 本地递增版本号
- `encryption_applied`: 是否加密 (0 或 1)
- `schema_version`: payload 版本

### changes 表

记录所有数据变更，支持增量同步。字段名与客户端 `RemoteChange` 保持一致。

```sql
CREATE TABLE changes (
  change_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  type TEXT NOT NULL,
  updated_time INTEGER NOT NULL,
  deleted_time INTEGER,
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_changes_item_id ON changes(item_id);
CREATE INDEX idx_changes_created_at ON changes(created_at);
```

**字段说明（与客户端 RemoteChange 对应）：**
- `change_id`: 自增变更 ID，用于游标定位
- `item_id`: 关联的数据项 ID
- `type`: 数据项类型
- `updated_time`: 数据项的更新时间
- `deleted_time`: 数据项的删除时间（软删除）
- `content_hash`: 数据项的内容哈希
- `created_at`: 变更记录创建时间

### metadata 表

存储服务器元数据。

```sql
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### key_fingerprints 表

存储密钥指纹，按 API Key 隔离。

```sql
CREATE TABLE key_fingerprints (
  api_key_hash TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### sync_cursors 表

存储同步游标（可选功能）。

```sql
CREATE TABLE sync_cursors (
  api_key_hash TEXT PRIMARY KEY,
  cursor TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```


## API Design

### 认证机制

所有 API（除 `/api/health`）需要认证：

```
X-API-Key: <api_key>
# 或
Authorization: Bearer <token>
```

### API 端点详细设计

#### GET /api/health
健康检查，无需认证。

**Response 200:**
```json
{
  "status": "ok",
  "timestamp": 1704067200000
}
```

#### GET /api/status
服务器状态和统计。

**Response 200:**
```json
{
  "healthy": true,
  "version": "1.0.0",
  "uptime": 86400,
  "storage": {
    "used": 1048576,
    "total": 10737418240,
    "itemCount": 150
  }
}
```

#### GET /api/meta
获取服务器元数据。

**Response 200:**
```json
{
  "version": "1.0",
  "capabilities": ["items", "resources", "changes"],
  "last_sync_time": 1704067200000
}
```

#### PUT /api/meta
更新服务器元数据。

**Request Body:**
```json
{
  "last_sync_time": 1704067200000
}
```

#### GET /api/items/{id}
获取单个数据项。

**Response 200:**
```json
{
  "id": "uuid-xxx",
  "type": "note",
  "payload": "{\"title\":\"笔记标题\",\"content\":\"...\"}",
  "content_hash": "sha256-xxx",
  "remote_rev": "1704067200000",
  "deleted_time": null,
  "created_time": 1704067200000,
  "updated_time": 1704067200000,
  "sync_status": "clean",
  "local_rev": 1,
  "encryption_applied": 0,
  "schema_version": 1
}
```

**Response 404:**
```json
{
  "error": "Item not found"
}
```


#### PUT /api/items/{id}
创建或更新数据项。服务器接收完整的 ItemBase 对象。

**Request Body (完整 ItemBase):**
```json
{
  "id": "uuid-xxx",
  "type": "note",
  "payload": "{\"title\":\"笔记标题\",\"content\":\"...\"}",
  "content_hash": "sha256-xxx",
  "deleted_time": null,
  "created_time": 1704067200000,
  "updated_time": 1704067200000,
  "sync_status": "modified",
  "local_rev": 2,
  "encryption_applied": 0,
  "schema_version": 1
}
```

**Response 200:**
```json
{
  "success": true,
  "remoteRev": "1704067200000"
}
```

**Response 409 (Conflict):**
```json
{
  "error": "Version conflict",
  "currentRev": "1704067100000"
}
```

#### DELETE /api/items/{id}
硬删除数据项。

**Response 200:**
```json
{
  "success": true
}
```

#### GET /api/items/count
获取数据项计数。

**Query Parameters:**
- `type` (optional): 按类型过滤

**Response 200:**
```json
{
  "hasData": true,
  "itemCount": 150,
  "byType": {
    "note": 50,
    "folder": 10,
    "bookmark": 30
  }
}
```

#### POST /api/items/batch
批量上传数据项。

**Request Body:**
```json
{
  "items": [
    { "id": "uuid-1", "type": "note", "payload": "...", "content_hash": "..." },
    { "id": "uuid-2", "type": "folder", "payload": "...", "content_hash": "..." }
  ]
}
```

**Response 200:**
```json
{
  "success": true,
  "results": [
    { "id": "uuid-1", "remoteRev": "1704067200000" },
    { "id": "uuid-2", "remoteRev": "1704067200001" }
  ]
}
```

**Response 400:**
```json
{
  "error": "Batch size exceeds limit (100)"
}
```


#### GET /api/changes
获取变更列表（增量同步核心）。

**Query Parameters:**
- `cursor` (optional): 上次同步的游标位置
- `limit` (optional): 返回数量限制，默认 100

**Response 200:**
```json
{
  "changes": [
    {
      "change_id": 1001,
      "item_id": "uuid-xxx",
      "type": "note",
      "updated_time": 1704067200000,
      "deleted_time": null,
      "content_hash": "sha256-xxx"
    }
  ],
  "nextCursor": "1001",
  "hasMore": false
}
```

#### DELETE /api/changes
清理过期变更日志。

**Query Parameters:**
- `before` (required): 清理此时间戳之前的变更

**Response 200:**
```json
{
  "deleted": 500
}
```

#### GET /api/resources/{id}
下载资源文件。

**Response 200:**
- Content-Type: 原始文件类型
- Body: 二进制数据

**Response 404:**
```json
{
  "error": "Resource not found"
}
```

#### PUT /api/resources/{id}
上传资源文件。

**Request:**
- Content-Type: 文件 MIME 类型
- Body: 二进制数据

**Response 200:**
```json
{
  "success": true
}
```

#### DELETE /api/resources/{id}
删除资源文件。

**Response 200:**
```json
{
  "success": true
}
```

#### DELETE /api/items/cleanup
清理过期软删除数据（R16.5）。

**Query Parameters:**
- `before` (optional): 清理此时间戳之前软删除的数据，默认 30 天前

**Response 200:**
```json
{
  "deleted": 15,
  "message": "Cleaned up 15 soft-deleted items"
}
```


#### GET /api/sync/cursor
获取同步游标。

**Response 200:**
```json
{
  "cursor": "1001",
  "updated_at": 1704067200000
}
```

**Response 200 (无游标):**
```json
{
  "cursor": null
}
```

#### PUT /api/sync/cursor
保存同步游标。

**Request Body:**
```json
{
  "cursor": "1001"
}
```

**Response 200:**
```json
{
  "success": true
}
```

#### GET /api/sync/key-fingerprint
获取密钥指纹。

**Response 200:**
```json
{
  "fingerprint": "sha256-xxx"
}
```

**Response 200 (无指纹):**
```json
{
  "fingerprint": null
}
```

#### PUT /api/sync/key-fingerprint
保存密钥指纹。

**Request Body:**
```json
{
  "fingerprint": "sha256-xxx"
}
```

**Response 200 (首次设置):**
```json
{
  "success": true
}
```

**Response 409 (已存在不同指纹):**
```json
{
  "error": "Fingerprint conflict",
  "existingFingerprint": "sha256-yyy"
}
```

#### DELETE /api/sync/key-fingerprint
重置密钥指纹（管理员操作）。

**Response 200:**
```json
{
  "success": true
}
```


## Component Design

### 1. 认证中间件 (auth.ts)

```typescript
// 验证 API Key 或 Bearer Token
export function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];
  
  if (apiKey && isValidApiKey(apiKey)) {
    req.apiKeyHash = hashApiKey(apiKey);
    return next();
  }
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (isValidToken(token)) {
      req.apiKeyHash = hashToken(token);
      return next();
    }
  }
  
  return res.status(401).json({ error: 'Unauthorized' });
}
```

### 2. 数据项服务 (ItemService.ts)

```typescript
class ItemService {
  // 获取数据项
  getItem(id: string): Item | null;
  
  // 创建或更新数据项，返回 remoteRev
  putItem(item: ItemInput): { remoteRev: string };
  
  // 硬删除数据项
  deleteItem(id: string): boolean;
  
  // 批量操作
  batchPut(items: ItemInput[]): BatchResult;
  
  // 获取计数
  getCount(type?: string): CountResult;
}
```

### 3. 变更日志服务 (ChangeService.ts)

```typescript
class ChangeService {
  // 记录变更
  recordChange(item: Item): void;
  
  // 获取变更列表
  listChanges(cursor?: string, limit?: number): ChangeListResult;
  
  // 清理过期变更
  cleanupBefore(timestamp: number): number;
}
```

### 4. 资源服务 (ResourceService.ts)

```typescript
class ResourceService {
  // 资源存储目录
  private resourceDir: string;
  
  // 获取资源
  getResource(id: string): Buffer | null;
  
  // 保存资源
  putResource(id: string, data: Buffer, mimeType: string): boolean;
  
  // 删除资源
  deleteResource(id: string): boolean;
  
  // 获取存储统计
  getStorageStats(): { used: number; fileCount: number };
}
```

### 5. 日志中间件 (logger.ts)

```typescript
// 记录所有 API 请求 (R1.4)
export function loggerMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    }));
  });
  
  next();
}
```

### 6. CORS 中间件 (cors.ts)

```typescript
import cors from 'cors';

// 支持跨域请求 (R1.6)
export const corsMiddleware = cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
  credentials: true
});
```

### 7. 优雅关闭 (index.ts)

```typescript
// 优雅关闭处理 (R1.5)
function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  server.close(() => {
    console.log('HTTP server closed');
    db.close();
    console.log('Database connection closed');
    process.exit(0);
  });
  
  // 强制关闭超时
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

### 8. 定时清理任务

```typescript
// 自动清理过期数据 (R6.2, R16.5)
class CleanupScheduler {
  // 每天凌晨 3 点执行清理
  schedule() {
    setInterval(() => {
      const now = Date.now();
      
      // 清理 7 天前的变更日志
      const changeLogRetention = 7 * 24 * 60 * 60 * 1000;
      changeService.cleanupBefore(now - changeLogRetention);
      
      // 清理 30 天前软删除的数据项
      const softDeleteRetention = 30 * 24 * 60 * 60 * 1000;
      itemService.cleanupSoftDeleted(now - softDeleteRetention);
    }, 24 * 60 * 60 * 1000); // 每 24 小时
  }
}
```


## Configuration

### 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `PORT` | 服务器端口 | 3000 |
| `DATABASE_PATH` | SQLite 数据库路径 | ./data/sync.db |
| `RESOURCES_PATH` | 资源文件存储路径 | ./data/resources |
| `API_KEYS` | API 密钥列表（逗号分隔） | - |
| `LOG_LEVEL` | 日志级别 | info |
| `MAX_RESOURCE_SIZE` | 最大资源文件大小 (bytes) | 104857600 (100MB) |
| `CHANGE_LOG_RETENTION_DAYS` | 变更日志保留天数 | 7 |

### 配置文件示例

```yaml
# config.yaml (可选)
server:
  port: 3000
  cors:
    origins: ["*"]

database:
  path: ./data/sync.db

resources:
  path: ./data/resources
  maxSize: 104857600

auth:
  apiKeys:
    - key: "your-api-key-1"
      name: "Desktop Client"
    - key: "your-api-key-2"
      name: "Mobile Client"

sync:
  changeLogRetentionDays: 7
  batchLimit: 100
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  sync-server:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - sync-data:/app/data
    environment:
      - PORT=3000
      - API_KEYS=your-secret-api-key
      - LOG_LEVEL=info
    restart: unless-stopped

volumes:
  sync-data:
```


## Sequence Diagrams

### 增量同步流程

```
Client                          Server
  |                               |
  |-- GET /api/changes?cursor=X ->|
  |                               |-- Query changes after X
  |<-- { changes, nextCursor } ---|
  |                               |
  |-- For each change:            |
  |   GET /api/items/{id} ------->|
  |<-- Item data -----------------|
  |                               |
  |-- PUT /api/items/{id} ------->|  (local changes)
  |<-- { remoteRev } -------------|
  |                               |
  |-- PUT /api/sync/cursor ------>|  (optional)
  |<-- { success } ---------------|
```

### 首次同步流程

```
Client                          Server
  |                               |
  |-- GET /api/items/count ------>|
  |<-- { hasData: false } --------|
  |                               |
  |-- PUT /api/sync/key-fingerprint ->|
  |<-- { success } ---------------|
  |                               |
  |-- POST /api/items/batch ----->|  (upload all local items)
  |<-- { results } ---------------|
  |                               |
  |-- PUT /api/meta ------------->|
  |<-- { success } ---------------|
```

### 密钥验证流程

```
Client                          Server
  |                               |
  |-- GET /api/sync/key-fingerprint ->|
  |<-- { fingerprint: null } -----|  (first sync)
  |                               |
  |-- PUT /api/sync/key-fingerprint ->|
  |<-- { success } ---------------|
  |                               |
  |-- ... sync operations ... ----|
  |                               |
  |-- GET /api/sync/key-fingerprint ->|  (subsequent sync)
  |<-- { fingerprint: "xxx" } ----|
  |                               |
  |-- Compare with local ---------|
  |   If mismatch: abort sync     |
```

## Error Handling

### HTTP 状态码使用

| 状态码 | 场景 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误、验证失败 |
| 401 | 未认证 |
| 403 | 认证失败、权限不足 |
| 404 | 资源不存在 |
| 409 | 版本冲突、指纹冲突 |
| 413 | 资源文件过大 |
| 500 | 服务器内部错误 |

### 错误响应格式

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

## Security Considerations

1. **API Key 存储**: 服务器只存储 API Key 的哈希值
2. **HTTPS**: 生产环境必须使用 HTTPS
3. **Rate Limiting**: 建议在反向代理层实现
4. **数据隔离**: 不同 API Key 的数据完全隔离
5. **输入验证**: 所有输入参数严格验证

## Type Definitions

服务器端类型定义需与客户端 `src/shared/types/index.ts` 保持一致。

### ItemType (13 种类型)

```typescript
type ItemType = 
  | 'note'              // 笔记
  | 'folder'            // 文件夹
  | 'tag'               // 标签
  | 'resource'          // 附件资源
  | 'todo'              // 待办事项
  | 'vault_entry'       // 密码库条目
  | 'vault_folder'      // 密码库文件夹
  | 'bookmark'          // 书签
  | 'bookmark_folder'   // 书签文件夹
  | 'diagram'           // 图表（脑图/流程图/白板）
  | 'ai_config'         // AI 配置
  | 'ai_conversation'   // AI 对话
  | 'ai_message';       // AI 消息
```

### ItemBase (完整数据项结构)

```typescript
interface ItemBase {
  id: string;                    // UUID 全局唯一
  type: ItemType;                // 实体类型
  created_time: number;          // 创建时间戳
  updated_time: number;          // 本地最后修改时间戳
  deleted_time: number | null;   // 软删除时间（null 表示未删除）
  payload: string;               // JSON 业务字段
  content_hash: string;          // 内容哈希（用于快速比对）
  sync_status: SyncStatus;       // 同步状态
  local_rev: number;             // 本地递增版本号
  remote_rev: string | null;     // 远端版本标记（服务器生成）
  encryption_applied: 0 | 1;     // 是否加密
  schema_version: number;        // payload 版本
}

type SyncStatus = 'clean' | 'modified' | 'deleted' | 'conflict';
```

### RemoteChange (变更记录)

```typescript
interface RemoteChange {
  change_id: number;
  item_id: string;
  type: ItemType;
  updated_time: number;
  deleted_time: number | null;
  content_hash: string;
}
```

### RemoteMeta (服务器元数据)

```typescript
interface RemoteMeta {
  version: string;
  capabilities: string[];
  last_sync_time: number | null;
  key_identifier?: string;
}
```

### SyncCursor (同步游标)

```typescript
interface SyncCursor {
  cursor: string;
  timestamp: number;
}
```

## Requirements Traceability

| 需求 | 设计组件 |
|------|----------|
| R1.1 健康检查 | routes/health.ts, GET /api/health |
| R1.2 环境变量配置 | config.ts, 环境变量表 |
| R1.3 SQLite 数据库 | database/schema.ts |
| R1.4 请求日志 | middleware/logger.ts |
| R1.5 优雅关闭 | index.ts gracefulShutdown() |
| R1.6 CORS 支持 | middleware/cors.ts |
| R2 API认证 | middleware/auth.ts |
| R3 元数据管理 | routes/meta.ts |
| R4 数据项CRUD | routes/items.ts, ItemService.ts |
| R5 增量同步 | routes/changes.ts, ChangeService.ts |
| R6.1 变更日志清理API | DELETE /api/changes |
| R6.2 自动清理 | CleanupScheduler |
| R7 资源文件 | routes/resources.ts, ResourceService.ts |
| R8 批量操作 | POST /api/items/batch |
| R9 服务器状态 | GET /api/status |
| R10 数据项计数 | GET /api/items/count |
| R11 密钥指纹 | routes/sync.ts |
| R12 Docker部署 | Dockerfile, docker-compose.yml |
| R13 错误处理 | middleware/errorHandler.ts, HTTP状态码表 |
| R14 数据库架构 | database/schema.ts, 5张表SQL |
| R15 游标管理 | routes/sync.ts |
| R16.1-4 软删除 | ItemService.ts, deleted_time字段 |
| R16.5 软删除清理 | DELETE /api/items/cleanup, CleanupScheduler |
| R17 并发控制 | ItemService.ts (transactions), 409 Conflict |
