# 暮城笔记 - 同步系统架构详细分析

## 目录
1. [整体架构设计](#整体架构设计)
2. [核心组件](#核心组件)
3. [自建同步服务器支持](#自建同步服务器支持)
4. [增量同步机制](#增量同步机制)
5. [跨平台实现](#跨平台实现)
6. [关键特性](#关键特性)

---

## 整体架构设计

### 1.1 架构概览

暮城笔记采用**分层同步架构**，将同步逻辑分为三层：

```
┌─────────────────────────────────────────────────────────┐
│                  应用层 (Application Layer)              │
│  ┌──────────────────────────────────────────────────┐   │
│  │  SyncService (主进程)  │  syncApi (渲染进程)      │   │
│  │  - 初始化同步          │  - 提供 IPC 接口        │   │
│  │  - 启动/停止调度器      │  - 状态订阅            │   │
│  │  - 处理 IPC 请求       │  - 进度回调            │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│                  核心层 (Core Layer)                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │  SyncEngine (同步引擎)                           │   │
│  │  - 三阶段同步 (Push/Pull/Commit)                 │   │
│  │  - 冲突检测和处理                                │   │
│  │  - 进度报告                                      │   │
│  │  - 模块选择性同步                                │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  SyncScheduler (同步调度器)                      │   │
│  │  - 定时同步                                      │   │
│  │  - 防抖同步                                      │   │
│  │  - 网络状态监听                                  │   │
│  │  - 状态管理                                      │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│                  适配器层 (Adapter Layer)                │
│  ┌──────────────────────────────────────────────────┐   │
│  │  StorageAdapter (统一接口)                       │   │
│  │  ├─ WebDAVAdapter (WebDAV 实现)                  │   │
│  │  └─ ServerAdapter (自建服务器实现)               │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│                  数据层 (Data Layer)                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │  ItemsManager (本地数据管理)                     │   │
│  │  - 本地游标管理                                  │   │
│  │  - 待同步项目查询                                │   │
│  │  - 同步状态更新                                  │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  SQLite Database (本地存储)                      │   │
│  │  - items 表 (统一数据模型)                       │   │
│  │  - 同步元数据                                    │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 1.2 数据流向

```
本地修改 → ItemsManager → SQLite
                ↓
         SyncScheduler (定时/防抖)
                ↓
         SyncEngine.sync()
                ↓
    ┌───────────┴───────────┐
    ↓                       ↓
 Push 阶段              Pull 阶段
 (上传本地变更)         (下载远端变更)
    ↓                       ↓
 StorageAdapter ←────────────┘
    ↓
 WebDAVAdapter / ServerAdapter
    ↓
 远端服务器 (WebDAV / 自建服务器)
```

---

## 核心组件

### 2.1 SyncEngine (同步引擎)

**位置**: `src/core/sync/SyncEngine.ts`

**职责**:
- 执行完整的三阶段同步流程
- 管理同步进度和错误处理
- 实现冲突检测和解决
- 支持模块选择性同步

**关键方法**:

```typescript
// 执行完整同步
async sync(): Promise<SyncResult>

// Push 阶段：上传本地变更
private async pushChanges(): Promise<{ count: number; errors: string[] }>

// Pull 阶段：拉取远端变更
private async pullChanges(): Promise<{ count: number; conflicts: number; errors: string[] }>

// Commit 阶段：更新同步状态
private async commitSync(): Promise<void>

// 处理单个远端变更
private async processRemoteChange(change: RemoteChange): Promise<{...}>

// 冲突处理
private async handleConflict(localItem: ItemBase, remoteChange: RemoteChange): Promise<{...}>
```

**同步流程**:

1. **Push 阶段**
   - 获取所有待同步项目 (`sync_status = 'modified'`)
   - 过滤启用的模块类型
   - 逐项上传到远端
   - 标记为已同步 (`sync_status = 'clean'`)

2. **Pull 阶段**
   - 从本地数据库获取游标
   - 循环拉取远端变更
   - 检测冲突 (本地 `sync_status = 'modified'`)
   - 应用远端变更或创建冲突副本
   - 更新本地游标

3. **Commit 阶段**
   - 更新远端元数据 (`last_sync_time`)
   - 清理过期变更日志

### 2.2 SyncScheduler (同步调度器)

**位置**: `src/core/sync/SyncScheduler.ts`

**职责**:
- 定时触发同步
- 防抖处理内容变更
- 网络状态监听
- 状态管理和订阅

**配置选项**:

```typescript
interface SyncSchedulerOptions {
  autoSyncOnStart: boolean;      // 启动时是否自动同步 (默认 false)
  syncInterval: number;          // 同步间隔 (分钟)
  syncOnChange: boolean;         // 内容变更时是否同步 (默认 false)
  changeDebounce: number;        // 防抖延迟 (秒)
  initialLastSyncTime?: number;  // 初始上次同步时间
  onSyncComplete?: (lastSyncTime: number) => void;  // 同步完成回调
}
```

**状态管理**:

```typescript
interface SyncState {
  status: 'idle' | 'syncing' | 'error' | 'offline';
  lastSyncTime: number | null;
  lastSyncResult: SyncResult | null;
  pendingChanges: number;
  isOnline: boolean;
  progress: SyncProgress | null;
}
```

### 2.3 StorageAdapter (存储适配器)

**位置**: `src/core/sync/StorageAdapter.ts`

**职责**: 定义统一的存储接口，支持多种后端实现

**核心接口**:

```typescript
interface StorageAdapter {
  // 连接测试
  testConnection(): Promise<boolean>;

  // 元数据操作
  getRemoteMeta(): Promise<RemoteMeta>;
  putRemoteMeta(meta: RemoteMeta): Promise<boolean>;

  // 变更列表
  listChanges(cursor: string | null, limit?: number): Promise<{
    changes: RemoteChange[];
    nextCursor: string | null;
    hasMore: boolean;
  }>;

  // 项目操作
  getItem(id: string): Promise<ItemBase | null>;
  putItem(item: ItemBase): Promise<{ success: boolean; remoteRev: string; error?: string }>;
  deleteItem(id: string): Promise<boolean>;

  // 资源操作
  getResource(id: string): Promise<Buffer | null>;
  putResource(id: string, data: Buffer, mimeType: string): Promise<boolean>;
  deleteResource(id: string): Promise<boolean>;

  // 游标管理 (已弃用，改用本地存储)
  getSyncCursor(): Promise<SyncCursor | null>;
  setSyncCursor(cursor: SyncCursor): Promise<boolean>;

  // 密钥指纹验证
  getKeyFingerprint(): Promise<string | null>;
  saveKeyFingerprint(fingerprint: string): Promise<boolean>;
  verifyKeyFingerprint(localFingerprint: string): Promise<{ valid: boolean; remoteFingerprint: string | null }>;

  // 可选方法
  cleanupChangeLogs?(beforeTimestamp: number): Promise<number>;
  hasExistingData?(): Promise<boolean>;
}
```

---

## 自建同步服务器支持

### 3.1 ServerAdapter 实现

**位置**: `src/core/sync/ServerAdapter.ts`

**特点**:
- 基于 HTTP REST API
- 支持 API Key 和 Bearer Token 认证
- 自动重试机制
- 批量操作优化

**API 端点**:

```
GET    /api/health                    - 健康检查
GET    /api/meta                      - 获取元数据
PUT    /api/meta                      - 更新元数据
GET    /api/changes?cursor=X&limit=Y  - 获取变更列表
GET    /api/items/{id}                - 获取项目
PUT    /api/items/{id}                - 上传项目
DELETE /api/items/{id}                - 删除项目
GET    /api/resources/{id}            - 获取资源
PUT    /api/resources/{id}            - 上传资源
DELETE /api/resources/{id}            - 删除资源
GET    /api/items/count               - 获取项目数量
POST   /api/items/batch               - 批量上传项目
GET    /api/status                    - 获取服务器状态
GET    /api/sync/key-fingerprint      - 获取密钥指纹
PUT    /api/sync/key-fingerprint      - 保存密钥指纹
```

**配置示例**:

```typescript
const serverConfig: ServerConfig = {
  url: 'https://sync.example.com',
  apiKey: 'your-api-key-here'
};

const adapter = new ServerAdapter(serverConfig);
```

### 3.2 自建服务器实现指南

#### 最小化实现

自建服务器需要实现以下核心功能:

1. **项目存储**
   - 存储 ItemBase 对象
   - 支持 CRUD 操作
   - 维护版本号 (remoteRev)

2. **变更日志**
   - 记录所有项目变更
   - 支持游标分页
   - 保留 7 天历史

3. **元数据管理**
   - 存储 `last_sync_time`
   - 存储 `capabilities`
   - 存储 `version`

4. **认证**
   - API Key 验证
   - Bearer Token 支持

#### 数据库设计

```sql
-- 项目表
CREATE TABLE items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    remote_rev TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 变更日志表
CREATE TABLE changes (
    change_id BIGINT PRIMARY KEY,
    item_id TEXT NOT NULL,
    type TEXT NOT NULL,
    updated_time BIGINT NOT NULL,
    deleted_time BIGINT,
    content_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- 元数据表
CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_changes_created_at ON changes(created_at);
CREATE INDEX idx_items_updated_at ON items(updated_at);
```

#### API 实现示例 (Node.js/Express)

```typescript
// 获取变更列表
app.get('/api/changes', (req, res) => {
  const cursor = req.query.cursor as string | null;
  const limit = parseInt(req.query.limit as string) || 100;
  
  // 查询变更
  const changes = db.prepare(`
    SELECT * FROM changes 
    WHERE change_id > ? 
    ORDER BY change_id ASC 
    LIMIT ?
  `).all(cursor ? parseInt(cursor) : 0, limit + 1);
  
  const hasMore = changes.length > limit;
  const result = changes.slice(0, limit);
  const nextCursor = hasMore ? result[result.length - 1].change_id.toString() : null;
  
  res.json({
    changes: result,
    nextCursor,
    hasMore
  });
});

// 上传项目
app.put('/api/items/:id', (req, res) => {
  const { id } = req.params;
  const item = req.body;
  
  const remoteRev = Date.now().toString();
  
  db.prepare(`
    INSERT OR REPLACE INTO items (id, type, payload, remote_rev, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(id, item.type, JSON.stringify(item), remoteRev);
  
  // 记录变更
  db.prepare(`
    INSERT INTO changes (change_id, item_id, type, updated_time, deleted_time, content_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    Date.now(),
    id,
    item.type,
    item.updated_time,
    item.deleted_time,
    item.content_hash
  );
  
  res.json({ remoteRev });
});
```

---

## 增量同步机制

### 4.1 游标机制

**本地游标存储** (改进后):

```typescript
// 存储位置: ItemsManager (本地数据库)
interface SyncCursor {
  cursor: string;        // 变更日志的最后一条记录 ID
  timestamp: number;     // 游标更新时间
}

// 获取本地游标
const localCursor = itemsManager.getLocalSyncCursor();

// 更新本地游标
itemsManager.setLocalSyncCursor({
  cursor: lastChangeId,
  timestamp: Date.now()
});
```

**游标工作流**:

```
首次同步:
  cursor = null
  ↓
  拉取所有远端变更
  ↓
  保存最后一条变更 ID 作为游标

增量同步:
  cursor = "上次保存的变更 ID"
  ↓
  拉取 cursor 之后的变更
  ↓
  更新游标为最新变更 ID
```

### 4.2 变更检测

**本地变更检测**:

```typescript
// 获取待同步项目
const pendingItems = itemsManager.getPendingSync()
  .filter(item => this.shouldSyncType(item.type));

// 待同步条件: sync_status = 'modified'
// 包括:
// - 新创建的项目
// - 修改过的项目
// - 标记删除的项目
```

**远端变更检测**:

```typescript
// 远端变更记录结构
interface RemoteChange {
  change_id: number;           // 变更 ID (递增)
  item_id: string;             // 项目 ID
  type: ItemType;              // 项目类型
  updated_time: number;        // 更新时间
  deleted_time: number | null; // 删除时间
  content_hash: string;        // 内容哈希
}

// 通过游标分页获取变更
const { changes, nextCursor, hasMore } = await adapter.listChanges(cursor, limit);
```

### 4.3 冲突检测和解决

**冲突场景**:

```
本地状态: modified (有未同步的修改)
远端状态: 有新的变更
  ↓
  冲突!
```

**冲突解决策略**:

```typescript
enum ConflictStrategy {
  'remote-wins',    // 远端覆盖本地
  'local-wins',     // 保持本地，下次 push 覆盖远端
  'create-copy'     // 创建冲突副本 (默认)
}

// 创建冲突副本流程:
1. 复制本地项目，添加 "(冲突副本)" 后缀
2. 用远端版本覆盖原项目
3. 两个版本都保留在本地
```

### 4.4 增量同步优化

**批处理**:

```typescript
// 批量上传项目 (ServerAdapter 特有)
async batchPutItems(items: ItemBase[]): Promise<{
  success: boolean;
  results: Array<{ id: string; remoteRev: string }>;
}>
```

**变更日志清理**:

```typescript
// 清理 7 天前的变更日志
const beforeTimestamp = Date.now() - CHANGE_LOG_RETENTION; // 7 天
const deletedCount = await adapter.cleanupChangeLogs(beforeTimestamp);
```

**首次同步检测**:

```typescript
// 检查是否首次同步
const isFirstSync = !remoteMeta.last_sync_time && !syncCursor;

if (isFirstSync) {
  // 标记所有本地数据为待同步
  syncEngine.resetSyncStatus();
}
```

---

## 跨平台实现

### 5.1 桌面端 (Electron)

**位置**: `src/main/services/SyncService.ts`, `src/renderer/services/syncApi.ts`

**架构**:

```
主进程 (Main Process)
  ↓
SyncService (IPC Handler)
  ↓
SyncEngine + SyncScheduler
  ↓
ItemsManager (数据库访问)
  ↓
WebDAVAdapter / ServerAdapter

渲染进程 (Renderer Process)
  ↓
syncApi (IPC 调用)
  ↓
React 组件 (UI 更新)
```

**IPC 接口**:

```typescript
// 初始化同步
ipcMain.handle('sync:initialize', (event, config) => {...})

// 启动/停止调度
ipcMain.handle('sync:start', () => {...})
ipcMain.handle('sync:stop', () => {...})

// 手动同步
ipcMain.handle('sync:trigger', async () => {...})

// 获取状态
ipcMain.handle('sync:getState', () => {...})

// 测试连接
ipcMain.handle('sync:testConnection', async (event, config) => {...})

// 强制重新同步
ipcMain.handle('sync:forceResync', async () => {...})

// 重置同步状态
ipcMain.handle('sync:resetStatus', async () => {...})

// 检查首次同步
ipcMain.handle('sync:checkFirstSync', async () => {...})
```

**事件通知**:

```typescript
// 同步完成后通知渲染进程
win.webContents.send('sync:lastSyncTimeUpdated', lastSyncTime);
```

### 5.2 移动端 (Android)

**位置**: `android/app/src/main/java/com/mucheng/notes/data/sync/`

**核心组件**:

1. **SyncEngine.kt** - 同步引擎
   - 明文同步 (不加密)
   - Push/Pull 阶段
   - 冲突处理
   - 本地游标管理

2. **OfflineQueueManager.kt** - 离线队列管理
   - 网络状态监听
   - 网络恢复时自动同步
   - 离线队列处理

3. **ResourceSyncManager.kt** - 资源同步管理
   - 资源上传/下载
   - 本地缓存管理
   - 哈希验证
   - 缓存清理

**Android 同步流程**:

```
用户修改数据
  ↓
ItemDao 更新本地数据库
  ↓
SyncEngine.sync() (协程)
  ↓
┌─────────────────────────────────┐
│ Push 阶段                       │
│ - 获取待同步项目                │
│ - 上传到 WebDAV                 │
│ - 标记为已同步                  │
└─────────────────────────────────┘
  ↓
┌─────────────────────────────────┐
│ Pull 阶段                       │
│ - 获取本地游标                  │
│ - 拉取远端变更                  │
│ - 检测冲突                      │
│ - 应用变更                      │
│ - 更新本地游标                  │
└─────────────────────────────────┘
  ↓
网络恢复时自动重试 (OfflineQueueManager)
```

**网络监听**:

```kotlin
// 监听网络连接状态
offlineQueueManager.observeConnectivity().collect { isOnline ->
  if (isOnline) {
    // 网络恢复，自动同步
    syncEngine.sync()
  }
}
```

---

## 关键特性

### 6.1 模块选择性同步

**支持的模块**:

```typescript
interface SyncModules {
  notes: boolean;      // 笔记 + 文件夹 + 标签 + 附件
  bookmarks: boolean;  // 书签 + 书签文件夹
  vault: boolean;      // 密码库条目 + 密码库文件夹
  diagrams: boolean;   // 脑图/流程图/白板
  todos: boolean;      // 待办事项
  ai: boolean;         // AI 配置 + 对话 + 消息
}
```

**模块到类型映射**:

```typescript
const SYNC_MODULE_TYPES: Record<keyof SyncModules, ItemType[]> = {
  notes: ['note', 'folder', 'tag', 'resource'],
  bookmarks: ['bookmark', 'bookmark_folder'],
  vault: ['vault_entry', 'vault_folder'],
  diagrams: ['diagram'],
  todos: ['todo'],
  ai: ['ai_config', 'ai_conversation', 'ai_message'],
};
```

**使用示例**:

```typescript
// 只同步笔记和书签
const syncOptions: SyncOptions = {
  syncModules: {
    notes: true,
    bookmarks: true,
    vault: false,
    diagrams: false,
    todos: false,
    ai: false,
  }
};

syncEngine.setOptions(syncOptions);
```

### 6.2 进度报告

**进度阶段**:

```typescript
type SyncPhase = 
  | 'idle'           // 空闲
  | 'connecting'     // 连接中
  | 'pushing'        // 上传中
  | 'pulling'        // 下载中
  | 'committing'     // 提交中
  | 'done'           // 完成
  | 'error';         // 错误

interface SyncProgress {
  phase: SyncPhase;
  message: string;
  current?: number;  // 当前进度
  total?: number;    // 总数
  detail?: string;   // 详细信息
}
```

**进度回调**:

```typescript
syncEngine.setProgressCallback((progress) => {
  console.log(`${progress.phase}: ${progress.message}`);
  if (progress.current && progress.total) {
    console.log(`Progress: ${progress.current}/${progress.total}`);
  }
});
```

### 6.3 错误处理和重试

**WebDAV 重试机制**:

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,    // 1 秒
  maxDelay: 10000,    // 10 秒
};

// 指数退避重试
// 第 1 次: 1 秒
// 第 2 次: 2 秒
// 第 3 次: 4 秒
```

**可重试的错误**:

```
- ETIMEDOUT (连接超时)
- ECONNRESET (连接重置)
- ECONNREFUSED (连接拒绝)
- socket hang up (套接字挂起)
- network errors (网络错误)
```

**不可重试的错误**:

```
- 401/403 (认证失败)
- 404 (资源不存在)
- 400 (请求错误)
```

### 6.4 密钥指纹验证

**目的**: 防止密钥不匹配导致的数据混乱

**流程**:

```
首次同步:
  1. 生成本地密钥指纹
  2. 检查远端是否有指纹
  3. 如果没有，保存本地指纹
  4. 如果有，验证是否匹配

后续同步:
  1. 获取远端指纹
  2. 与本地指纹比对
  3. 不匹配则拒绝同步
```

**实现**:

```typescript
async verifyKeyFingerprint(localFingerprint: string): Promise<{
  valid: boolean;
  remoteFingerprint: string | null;
}> {
  const remoteFingerprint = await this.getKeyFingerprint();
  
  if (remoteFingerprint === null) {
    // 首次同步，保存本地指纹
    await this.saveKeyFingerprint(localFingerprint);
    return { valid: true, remoteFingerprint: null };
  }
  
  // 验证指纹匹配
  const valid = remoteFingerprint === localFingerprint;
  return { valid, remoteFingerprint };
}
```

---

## 总结

### 核心优势

1. **灵活的适配器架构** - 支持 WebDAV 和自建服务器
2. **增量同步** - 基于游标的高效增量同步
3. **冲突处理** - 多种冲突解决策略
4. **跨平台一致** - 桌面端和移动端同步逻辑一致
5. **模块化** - 支持选择性同步不同模块
6. **离线支持** - 离线队列和网络恢复自动同步
7. **进度报告** - 实时同步进度反馈
8. **错误恢复** - 智能重试和错误处理

### 部署建议

1. **WebDAV 方案** - 适合小规模用户，使用现有 WebDAV 服务
2. **自建服务器** - 适合大规模部署，完全控制数据
3. **混合方案** - 支持多个同步源，用户可选择

### 扩展方向

1. 支持更多存储后端 (S3, Azure Blob 等)
2. 端到端加密同步
3. 多设备冲突智能合并
4. 同步性能优化 (增量压缩、差异同步)
5. 同步统计和分析
