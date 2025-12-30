# 暮城笔记 - 开发指南

## 项目架构

```
src/
├── core/                 # 核心业务逻辑（与 UI 无关）
│   ├── database/         # 数据库管理
│   ├── sync/             # 同步引擎
│   ├── crypto/           # 加密模块
│   ├── backup/           # 备份管理
│   ├── export/           # 导出功能
│   ├── search/           # 搜索引擎
│   ├── templates/        # 模板管理
│   ├── notes/            # 笔记功能（版本历史、链接解析）
│   ├── resources/        # 附件资源管理
│   └── security/         # 安全功能（应用锁）
├── main/                 # Electron 主进程
│   ├── main.ts           # 应用入口
│   ├── preload.ts        # 预加载脚本（IPC 桥接）
│   └── services/         # 主进程服务
│       ├── DatabaseService.ts  # 数据库 IPC
│       └── SyncService.ts      # 同步 IPC
├── renderer/             # 渲染进程（React UI）
│   ├── components/       # UI 组件
│   ├── hooks/            # React Hooks
│   ├── services/         # API 封装
│   ├── contexts/         # React Context
│   └── styles/           # 样式文件
└── shared/               # 共享类型定义
    └── types/
```

---

## 加密功能详解

### 1. 加密算法

| 项目 | 值 |
|------|-----|
| 算法 | AES-256-GCM |
| 密钥长度 | 256 bits (32 bytes) |
| IV 长度 | 96 bits (12 bytes) |
| 认证标签 | 128 bits (16 bytes) |
| 密钥派生 | PBKDF2-SHA256, 100000 次迭代 |
| 盐长度 | 256 bits (32 bytes) |

### 2. 加密数据结构

```typescript
interface EncryptedData {
  ciphertext: string;  // Base64 编码的密文
  iv: string;          // Base64 编码的初始化向量（每次加密随机生成）
  authTag: string;     // Base64 编码的认证标签（GCM 模式提供完整性校验）
  salt?: string;       // Base64 编码的盐（密码派生密钥时使用）
}
```

### 3. 明文 vs 加密同步

#### 明文同步（encryption_enabled = false）
```
本地数据库                    远端存储
┌─────────────────┐          ┌─────────────────┐
│ {               │          │ {               │
│   "title": "我的│  ──────► │   "title": "我的│
│   笔记",        │          │   笔记",        │
│   "content":    │          │   "content":    │
│   "内容..."     │          │   "内容..."     │
│ }               │          │ }               │
└─────────────────┘          └─────────────────┘
       │                            │
       └── payload 字段明文存储 ────┘
```

- 数据以 JSON 明文形式存储在远端
- 任何能访问 WebDAV 的人都能读取内容
- 适合私有服务器或不敏感数据

#### 加密同步（encryption_enabled = true）
```
本地数据库                    加密处理                     远端存储
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│ {               │          │ CryptoEngine    │          │ {               │
│   "title": "我的│  ──────► │   .encrypt()    │  ──────► │   "ciphertext": │
│   笔记",        │          │                 │          │   "a3F2x...",   │
│   "content":    │          │ AES-256-GCM     │          │   "iv": "b4...",│
│   "内容..."     │          │ + 随机 IV       │          │   "authTag":    │
│ }               │          │                 │          │   "c5..."       │
└─────────────────┘          └─────────────────┘          └─────────────────┘
       │                                                         │
       └── 本地明文，远端加密，只有持有密钥才能解密 ──────────────┘
```

- payload 字段在上传前加密，下载后解密
- 远端存储的是密文，无法直接读取
- 每次加密使用随机 IV，相同内容产生不同密文
- GCM 模式提供认证，防止数据被篡改

### 4. 密钥管理

#### 密钥生成
```typescript
// 方式1：从密码派生（用户输入密码）
const { key, salt } = cryptoEngine.deriveKeyFromPassword('user-password');

// 方式2：随机生成（推荐，更安全）
const key = cryptoEngine.generateRandomKey();
```

#### 密钥存储
```typescript
// 密钥存储在 localStorage（渲染进程）
localStorage.setItem('mucheng-sync-key', keyHex);

// 初始化同步时传递给主进程
await syncApi.initialize({
  encryptionEnabled: true,
  encryptionKey: localStorage.getItem('mucheng-sync-key'),
  // ...
});
```

#### 密钥导出/导入
```typescript
// 导出（用于备份）
const handleExportKey = () => {
  const key = localStorage.getItem('mucheng-sync-key');
  const blob = new Blob([JSON.stringify({ key, created: Date.now() })]);
  // 下载为 .json 文件
};

// 导入（恢复或多设备同步）
const handleImportKey = async (file) => {
  const data = JSON.parse(await file.text());
  localStorage.setItem('mucheng-sync-key', data.key);
};
```

### 5. 密钥验证

同步时会验证本地密钥与远端是否匹配：

```typescript
// SyncEngine.ts
private async verifyEncryptionKey(): Promise<boolean> {
  const remoteMeta = await this.adapter.getRemoteMeta();
  
  // 首次同步，远端没有密钥标识
  if (!remoteMeta.key_identifier) {
    return true;
  }
  
  // 比较密钥标识（密钥的 SHA256 前16字符）
  const localKeyId = this.cryptoEngine.generateKeyIdentifier();
  return localKeyId === remoteMeta.key_identifier;
}
```

如果密钥不匹配，同步会被拒绝，防止用错误密钥覆盖数据。

### 6. 安全注意事项

| 风险 | 缓解措施 |
|------|----------|
| 密钥丢失 | 提供导出功能，提醒用户备份 |
| 密钥泄露 | 密钥只存储在本地，不上传到服务器 |
| 暴力破解 | PBKDF2 100000次迭代增加破解成本 |
| 数据篡改 | GCM 模式提供认证标签验证 |
| 重放攻击 | 每次加密使用随机 IV |

---

## 同步功能架构

### 1. 核心组件

#### StorageAdapter（存储适配器接口）
```typescript
// src/core/sync/StorageAdapter.ts
interface StorageAdapter {
  testConnection(): Promise<boolean>;
  getItem(id: string): Promise<ItemBase | null>;
  putItem(item: ItemBase): Promise<{ success: boolean; remoteRev: string }>;
  deleteItem(id: string): Promise<boolean>;
  listChanges(cursor: string | null): Promise<{ changes: RemoteChange[]; nextCursor: string | null; hasMore: boolean }>;
  acquireLock(deviceId: string): Promise<boolean>;
  releaseLock(deviceId: string): Promise<boolean>;
  // ... 更多方法
}
```

#### WebDAVAdapter（WebDAV 实现）
```typescript
// src/core/sync/WebDAVAdapter.ts
class WebDAVAdapter implements StorageAdapter {
  // 远端目录结构：
  // /mucheng-notes/
  //   ├── workspace.json      # 元数据
  //   ├── items/              # 数据项（笔记、文件夹、标签）
  //   ├── resources/          # 附件文件
  //   ├── changes/            # 变更日志
  //   ├── locks/              # 同步锁
  //   └── sync-cursor.json    # 同步游标
}
```

#### SyncEngine（同步引擎）
```typescript
// src/core/sync/SyncEngine.ts
class SyncEngine {
  // 同步流程：
  // 1. acquireLock()     - 获取同步锁
  // 2. verifyKey()       - 验证加密密钥
  // 3. pushChanges()     - 上传本地变更
  // 4. pullChanges()     - 拉取远端变更
  // 5. commitSync()      - 提交同步状态
  // 6. releaseLock()     - 释放锁
  
  async sync(): Promise<SyncResult>;
}
```

#### SyncScheduler（同步调度器）
```typescript
// src/core/sync/SyncScheduler.ts
class SyncScheduler {
  // 功能：
  // - 定时自动同步
  // - 内容变更后延迟同步
  // - 同步状态管理
  
  start(): void;
  stop(): void;
  triggerSync(): Promise<SyncResult>;
  notifyChange(): void;
  getState(): SyncState;
}
```

### 2. 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                      渲染进程 (React)                        │
├─────────────────────────────────────────────────────────────┤
│  App.tsx                                                     │
│    ├── useSettings() → syncConfig                           │
│    ├── syncApi.initialize(config)                           │
│    ├── syncApi.start()                                      │
│    └── syncApi.trigger() → 手动同步                          │
│                                                              │
│  SyncStatusBar.tsx                                          │
│    └── 显示同步状态、上次同步时间、待同步数量                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (preload.ts)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      主进程 (Electron)                       │
├─────────────────────────────────────────────────────────────┤
│  SyncService.ts                                             │
│    ├── initializeSyncService(config)                        │
│    │     ├── 创建 WebDAVAdapter / ServerAdapter             │
│    │     ├── 创建 CryptoEngine（如果启用加密）               │
│    │     ├── 创建 SyncEngine                                │
│    │     └── 创建 SyncScheduler                             │
│    ├── startSyncScheduler()                                 │
│    ├── triggerSync()                                        │
│    └── getSyncState()                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      核心层 (Core)                           │
├─────────────────────────────────────────────────────────────┤
│  SyncEngine                                                 │
│    ├── ItemsManager → 读写本地数据库                         │
│    ├── CryptoEngine → 加密/解密 payload                     │
│    └── StorageAdapter → 读写远端存储                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      远端存储                                │
├─────────────────────────────────────────────────────────────┤
│  WebDAV 服务器 / 自建服务器                                  │
└─────────────────────────────────────────────────────────────┘
```

### 3. 使用同步功能

#### 在设置中配置
```typescript
// SettingsModal.tsx 中保存同步配置
const handleSaveSyncConfig = () => {
  updateSyncConfig({
    enabled: true,
    type: 'webdav',
    url: 'https://your-webdav-server.com/dav',
    username: 'user',
    password: 'pass',
    encryption_enabled: true,
    sync_interval: 5,  // 分钟
  });
};
```

#### 在 App.tsx 中初始化
```typescript
// App.tsx
useEffect(() => {
  const initSync = async () => {
    if (syncConfig.enabled && syncConfig.url) {
      const encryptionKey = localStorage.getItem('mucheng-sync-key');
      
      // 1. 初始化同步服务
      const success = await syncApi.initialize({
        enabled: syncConfig.enabled,
        type: syncConfig.type,
        url: syncConfig.url,
        username: syncConfig.username,
        password: syncConfig.password,
        encryptionEnabled: syncConfig.encryption_enabled,
        encryptionKey,
        syncInterval: syncConfig.sync_interval,
      });
      
      // 2. 启动自动同步
      if (success) {
        await syncApi.start();
      }
    }
  };
  initSync();
}, [syncConfig]);
```

#### 手动触发同步
```typescript
const handleSync = async () => {
  const result = await syncApi.trigger();
  if (result?.success) {
    message.success(`同步完成: 上传 ${result.pushed}, 下载 ${result.pulled}`);
  } else {
    message.error(`同步失败: ${result?.errors.join(', ')}`);
  }
};
```

#### 内容变更时通知
```typescript
const handleSaveNote = async (id, content, title) => {
  await updateNote(id, { content, title });
  // 通知同步服务有内容变更
  await syncApi.notifyChange();
};
```

---

## 扩展新功能

### 添加新的数据类型

1. **定义类型** (`src/shared/types/index.ts`)
```typescript
export type ItemType = 'note' | 'folder' | 'tag' | 'todo' | 'your_new_type';

export interface YourNewPayload {
  title: string;
  // ... 其他字段
}
```

2. **创建 API** (`src/renderer/services/itemsApi.ts`)
```typescript
export const yourNewApi = {
  create: (payload: YourNewPayload) => itemsApi.create('your_new_type', payload),
  getAll: () => itemsApi.getByType('your_new_type'),
  // ...
};
```

3. **创建 Hook** (`src/renderer/hooks/useYourNew.ts`)
```typescript
export function useYourNew() {
  const [items, setItems] = useState([]);
  // ... 加载、创建、更新、删除逻辑
  return { items, create, update, delete };
}
```

4. **同步自动支持** - 因为所有数据都存储在 `items` 表中，新类型会自动被同步！

### 添加新的同步适配器

1. **实现 StorageAdapter 接口**
```typescript
// src/core/sync/YourAdapter.ts
export class YourAdapter implements StorageAdapter {
  async testConnection(): Promise<boolean> { /* ... */ }
  async getItem(id: string): Promise<ItemBase | null> { /* ... */ }
  async putItem(item: ItemBase): Promise<{ success: boolean; remoteRev: string }> { /* ... */ }
  // ... 实现所有接口方法
}
```

2. **在 SyncService 中注册**
```typescript
// src/main/services/SyncService.ts
if (config.type === 'your_type') {
  currentAdapter = new YourAdapter(config);
}
```

---

## 常用命令

```bash
# 开发
npm run build          # 构建
npm start              # 运行
或者
npm run dev 直接运行开发服务器

# 打
## 1. 先构建项目
npm run build

## 2. 设置 Electron 镜像（加速下载）
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" 

## 3. 打包 Windows 版本
npm run dist:win

或者2.3合并一个步骤
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; npm run dist:win



# 测试
npm test               # 运行测试
npm run lint           # 代码检查
```

---

## 数据库结构

### items 表（核心数据表）

所有数据实体（笔记、文件夹、标签等）都存储在同一张表中：

```sql
CREATE TABLE items (
  id TEXT PRIMARY KEY,              -- UUID
  type TEXT NOT NULL,               -- 'note' | 'folder' | 'tag' | 'resource' | ...
  created_time INTEGER NOT NULL,    -- 创建时间戳
  updated_time INTEGER NOT NULL,    -- 更新时间戳
  deleted_time INTEGER,             -- 软删除时间（NULL 表示未删除）
  payload TEXT NOT NULL,            -- JSON 业务数据
  content_hash TEXT NOT NULL,       -- 内容哈希（用于变更检测）
  sync_status TEXT DEFAULT 'modified', -- 'clean' | 'modified' | 'deleted' | 'conflict'
  local_rev INTEGER DEFAULT 1,      -- 本地版本号
  remote_rev TEXT,                  -- 远端版本标记
  encryption_applied INTEGER DEFAULT 0, -- 是否已加密
  schema_version INTEGER DEFAULT 1  -- payload 结构版本
);
```

### Payload 结构示例

```typescript
// 笔记 payload
interface NotePayload {
  title: string;
  content: string;
  folder_id: string | null;
  is_pinned: boolean;
  is_locked: boolean;
  lock_password_hash: string | null;
  tags: string[];  // 标签 ID 数组
}

// 文件夹 payload
interface FolderPayload {
  name: string;
  parent_id: string | null;  // 支持多级目录
  icon: string | null;
  color: string | null;
}

// 标签 payload
interface TagPayload {
  name: string;
  color: string | null;
}
```

---

## IPC 通信架构

### 渲染进程 → 主进程

```
┌─────────────────────────────────────────────────────────────┐
│  渲染进程 (React)                                            │
│                                                              │
│  itemsApi.create('note', payload)                           │
│       │                                                      │
│       ▼                                                      │
│  window.electronAPI.items.create('note', payload)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ ipcRenderer.invoke()
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  preload.ts (桥接层)                                         │
│                                                              │
│  contextBridge.exposeInMainWorld('electronAPI', {           │
│    items: {                                                  │
│      create: (type, payload) =>                             │
│        ipcRenderer.invoke('items:create', type, payload)    │
│    }                                                         │
│  })                                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ IPC channel: 'items:create'
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  主进程 (DatabaseService.ts)                                 │
│                                                              │
│  ipcMain.handle('items:create', (event, type, payload) => { │
│    return itemsManager.create(type, payload);               │
│  })                                                          │
└─────────────────────────────────────────────────────────────┘
```

### 已注册的 IPC Handlers

| Channel | 说明 |
|---------|------|
| `items:create` | 创建数据项 |
| `items:getById` | 获取单个数据项 |
| `items:getByType` | 获取指定类型的所有数据项 |
| `items:update` | 更新数据项 |
| `items:delete` | 软删除数据项 |
| `items:restore` | 恢复已删除数据项 |
| `items:search` | 搜索数据项 |
| `items:getNotesByFolder` | 按文件夹获取笔记 |
| `items:getPinnedNotes` | 获取置顶笔记 |
| `items:getDeleted` | 获取回收站数据 |
| `items:getStats` | 获取统计信息 |
| `sync:initialize` | 初始化同步服务 |
| `sync:start` | 启动同步调度 |
| `sync:stop` | 停止同步调度 |
| `sync:trigger` | 手动触发同步 |
| `sync:getState` | 获取同步状态 |
| `sync:notifyChange` | 通知内容变更 |

---

## 添加新功能的完整流程

### 示例：添加「待办事项」功能

#### 1. 定义类型 (`src/shared/types/index.ts`)
```typescript
export type ItemType = 'note' | 'folder' | 'tag' | 'todo';  // 添加 'todo'

export interface TodoPayload {
  title: string;
  completed: boolean;
  due_date: number | null;
  priority: 'low' | 'medium' | 'high';
  note_id: string | null;  // 关联的笔记
}
```

#### 2. 创建 API (`src/renderer/services/itemsApi.ts`)
```typescript
export const todosApi = {
  create: (payload: TodoPayload) => itemsApi.create('todo', payload),
  getAll: () => itemsApi.getByType('todo'),
  update: (id: string, payload: TodoPayload) => itemsApi.update(id, payload),
  delete: (id: string) => itemsApi.delete(id),
};
```

#### 3. 创建 Hook (`src/renderer/hooks/useTodos.ts`)
```typescript
export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  
  const loadTodos = useCallback(async () => {
    const items = await todosApi.getAll();
    setTodos(items.map(itemToTodo));
  }, []);
  
  useEffect(() => { loadTodos(); }, [loadTodos]);
  
  const createTodo = async (title: string) => {
    await todosApi.create({ title, completed: false, due_date: null, priority: 'medium', note_id: null });
    await loadTodos();
  };
  
  return { todos, createTodo, /* ... */ };
}
```

#### 4. 创建 UI 组件 (`src/renderer/components/TodoList.tsx`)
```typescript
const TodoList: React.FC = () => {
  const { todos, createTodo, toggleComplete } = useTodos();
  // ... 渲染 UI
};
```

#### 5. 集成到 App (`src/renderer/App.tsx`)
```typescript
import { useTodos } from './hooks/useTodos';
// 在 App 中使用 hook 和组件
```

**无需修改**：
- 数据库 schema（items 表已支持任意类型）
- IPC handlers（通用的 items API 已支持）
- 同步逻辑（自动同步所有 items）

---

## 关键文件说明

| 文件 | 说明 |
|------|------|
| `src/shared/types/index.ts` | 所有类型定义 |
| `src/core/database/Database.ts` | SQLite 数据库管理 |
| `src/core/database/ItemsManager.ts` | 统一数据 CRUD |
| `src/core/database/schema.ts` | 数据库表结构 |
| `src/core/sync/StorageAdapter.ts` | 存储适配器接口 |
| `src/core/sync/WebDAVAdapter.ts` | WebDAV 实现 |
| `src/core/sync/SyncEngine.ts` | 同步核心逻辑 |
| `src/core/sync/SyncScheduler.ts` | 同步调度器 |
| `src/core/crypto/CryptoEngine.ts` | AES-256-GCM 加密 |
| `src/main/main.ts` | Electron 主进程入口 |
| `src/main/preload.ts` | IPC 桥接 |
| `src/main/services/DatabaseService.ts` | 数据库 IPC handlers |
| `src/main/services/SyncService.ts` | 同步 IPC handlers |
| `src/renderer/services/itemsApi.ts` | 渲染进程数据 API |
| `src/renderer/services/syncApi.ts` | 渲染进程同步 API |
| `src/renderer/hooks/useNotes.ts` | 笔记 Hook（参考实现） |
| `src/renderer/contexts/SettingsContext.tsx` | 设置状态管理 |

---

## 注意事项

1. **preload.ts 是安全边界** - 所有主进程功能必须通过 preload 暴露
2. **payload 是 JSON 字符串** - 存储时序列化，读取时解析
3. **sync_status 控制同步** - 修改数据后自动标记为 'modified'
4. **软删除优先** - 使用 deleted_time 而非真正删除，支持回收站
5. **加密只影响 payload** - 元数据（id, type, timestamps）始终明文
