# 暮城笔记 - 增量同步技术细节

## 概述

暮城笔记采用**基于游标的增量同步**机制，确保高效的数据同步和带宽利用。

## 核心概念

### 1. 游标 (Cursor)

**定义**: 游标是指向远端变更日志中某个位置的标记。

**结构**:
```typescript
interface SyncCursor {
  cursor: string;        // 变更日志的最后一条记录 ID
  timestamp: number;     // 游标更新时间
}
```

**存储位置**: 本地数据库 (ItemsManager)

**生命周期**:

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

### 2. 变更日志 (Change Log)

**定义**: 远端服务器维护的所有项目变更记录。

**结构**:
```typescript
interface RemoteChange {
  change_id: number;           // 递增的变更 ID
  item_id: string;             // 项目 ID
  type: ItemType;              // 项目类型
  updated_time: number;        // 更新时间戳
  deleted_time: number | null; // 删除时间戳
  content_hash: string;        // 内容哈希
}
```

**特点**:
- 变更 ID 递增，保证顺序
- 包含删除标记，支持软删除
- 内容哈希用于快速比对
- 保留 7 天历史

### 3. 同步状态 (Sync Status)

**定义**: 本地项目的同步状态。

**状态值**:
```typescript
type SyncStatus = 'clean' | 'modified' | 'deleted' | 'conflict';

// clean: 已同步，与远端一致
// modified: 本地修改，待上传
// deleted: 本地删除，待上传
// conflict: 冲突，需要手动处理
```

**状态转换**:

```
创建项目:
  modified → (push) → clean

修改项目:
  clean → modified → (push) → clean

删除项目:
  clean → deleted → (push) → 硬删除

冲突:
  modified + 远端变更 → conflict → (处理) → clean
```

## 增量同步流程

### 1. Push 阶段 (上传本地变更)

**目标**: 将本地修改上传到远端

**流程**:

```
1. 获取待同步项目
   SELECT * FROM items WHERE sync_status IN ('modified', 'deleted')
   
2. 过滤启用的模块
   filter(item => enabledModules.includes(item.type))
   
3. 逐项上传
   for each item:
     if item.sync_status == 'deleted':
       DELETE /api/items/{id}
       硬删除本地记录
     else:
       PUT /api/items/{id}
       记录变更到远端
       
4. 标记为已同步
   UPDATE items SET sync_status = 'clean' WHERE id = ?
```

**代码实现**:

```typescript
private async pushChanges(): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  const pendingItems = this.itemsManager.getPendingSync()
    .filter(item => this.shouldSyncType(item.type));

  for (const item of pendingItems) {
    try {
      // 明文同步：确保 encryption_applied = 0
      const itemToUpload: ItemBase = {
        ...item,
        encryption_applied: 0 as const,
      };

      // 上传
      const result = await this.adapter.putItem(itemToUpload);

      if (result.success) {
        this.itemsManager.markSynced(item.id, result.remoteRev);
        count++;
      } else {
        errors.push(`Failed to push item ${item.id}: ${result.error}`);
      }
    } catch (error) {
      errors.push(`Error pushing item ${item.id}: ${(error as Error).message}`);
    }
  }

  return { count, errors };
}
```

### 2. Pull 阶段 (下载远端变更)

**目标**: 将远端变更应用到本地

**流程**:

```
1. 获取本地游标
   cursor = itemsManager.getLocalSyncCursor()
   
2. 循环拉取变更
   while hasMore:
     changes = adapter.listChanges(cursor, limit=100)
     
     for each change:
       if change.type not in enabledModules:
         skip
       
       remoteItem = adapter.getItem(change.item_id)
       localItem = itemsManager.getById(change.item_id)
       
       if localItem && localItem.sync_status == 'modified':
         冲突! → handleConflict()
       else:
         应用变更 → itemsManager.upsert(remoteItem)
     
     cursor = changes.nextCursor
     
3. 更新本地游标
   itemsManager.setLocalSyncCursor(cursor)
```

**代码实现**:

```typescript
private async pullChanges(): Promise<{ count: number; conflicts: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;
  let conflicts = 0;

  // 从本地数据库获取游标
  const localCursor = this.itemsManager.getLocalSyncCursor();
  let currentCursor = localCursor?.cursor || null;
  let lastSuccessfulCursor = currentCursor;

  let hasMore = true;
  while (hasMore) {
    try {
      const { changes, nextCursor, hasMore: more } = await this.adapter.listChanges(currentCursor);
      hasMore = more;

      const filteredChanges = changes.filter(c => this.shouldSyncType(c.type));

      let batchSuccessful = true;
      for (const change of filteredChanges) {
        try {
          const result = await this.processRemoteChange(change);
          if (result.success) {
            count++;
          }
          if (result.conflict) {
            conflicts++;
          }
          if (result.error) {
            errors.push(result.error);
            batchSuccessful = false;
          }
        } catch (error) {
          errors.push(`Error processing change ${change.item_id}: ${(error as Error).message}`);
          batchSuccessful = false;
        }
      }

      // 每批次处理完成后更新本地游标
      if (nextCursor && batchSuccessful) {
        lastSuccessfulCursor = nextCursor;
        this.itemsManager.setLocalSyncCursor({
          cursor: lastSuccessfulCursor,
          timestamp: Date.now(),
        });
      }

      currentCursor = nextCursor;
    } catch (error) {
      errors.push(`Pull changes error: ${(error as Error).message}`);
      hasMore = false;
    }
  }

  return { count, conflicts, errors };
}
```

### 3. 变更处理 (Process Remote Change)

**目标**: 处理单个远端变更

**逻辑**:

```
1. 检查是否是自己刚上传的
   if localItem && localItem.sync_status == 'clean':
     if localItem.content_hash == change.content_hash:
       skip (内容一致)
     else:
       continue (哈希不同，说明远端有更新)

2. 检查冲突
   if localItem && localItem.sync_status == 'modified':
     冲突! → handleConflict()
     return

3. 获取远端完整数据
   remoteItem = adapter.getItem(change.item_id)
   if !remoteItem:
     skip (远端文件不存在)

4. 应用变更
   if localItem:
     update(remoteItem)
   else:
     insert(remoteItem)
```

**代码实现**:

```typescript
private async processRemoteChange(change: RemoteChange): Promise<{
  success: boolean;
  conflict: boolean;
  error?: string;
}> {
  const localItem = this.itemsManager.getById(change.item_id);

  // 检查是否是自己刚上传的
  if (localItem && localItem.sync_status === 'clean') {
    if (localItem.content_hash === change.content_hash) {
      return { success: true, conflict: false };
    }
  }

  // 检查冲突
  if (localItem && localItem.sync_status === 'modified') {
    return this.handleConflict(localItem, change);
  }

  // 获取远端完整数据
  const remoteItem = await this.adapter.getItem(change.item_id);
  if (!remoteItem) {
    if (localItem && localItem.sync_status === 'clean') {
      return { success: true, conflict: false };
    }
    return { success: true, conflict: false };
  }

  // 应用变更
  if (localItem) {
    this.itemsManager.update(change.item_id, JSON.parse(remoteItem.payload));
  } else {
    this.itemsManager.createWithId(remoteItem);
  }

  return { success: true, conflict: false };
}
```

## 冲突检测和解决

### 1. 冲突场景

**场景 1: 本地修改 + 远端修改**

```
时间线:
  T1: 本地修改项目 A (sync_status = modified)
  T2: 远端也修改了项目 A
  T3: 同步时检测到冲突
```

**场景 2: 本地删除 + 远端修改**

```
时间线:
  T1: 本地删除项目 A (sync_status = deleted)
  T2: 远端修改了项目 A
  T3: 同步时检测到冲突
```

### 2. 冲突解决策略

**策略 1: Remote Wins (远端覆盖本地)**

```typescript
case 'remote-wins':
  // 用远端版本覆盖本地
  this.itemsManager.update(localItem.id, JSON.parse(remoteItem.payload));
  return { success: true, conflict: true };
```

**策略 2: Local Wins (保持本地)**

```typescript
case 'local-wins':
  // 保持本地，下次 push 会覆盖远端
  return { success: true, conflict: true };
```

**策略 3: Create Copy (创建冲突副本，默认)**

```typescript
case 'create-copy':
default:
  // 创建冲突副本
  const conflictPayload = JSON.parse(localItem.payload);
  conflictPayload.title = `${conflictPayload.title || 'Untitled'} (冲突副本)`;
  conflictPayload.is_conflict = true;

  this.itemsManager.create(localItem.type, conflictPayload);

  // 用远端版本覆盖原记录
  this.itemsManager.update(localItem.id, JSON.parse(remoteItem.payload));

  return { success: true, conflict: true };
```

### 3. 冲突处理流程

```
检测到冲突
  ↓
根据策略处理
  ├─ remote-wins: 用远端覆盖本地
  ├─ local-wins: 保持本地
  └─ create-copy: 创建副本 + 用远端覆盖原项
  ↓
标记为已处理
  ↓
继续同步
```

## 首次同步检测

### 1. 检测逻辑

```typescript
// 检查是否首次同步
const remoteMeta = await currentAdapter.getRemoteMeta();
const syncCursor = await currentAdapter.getSyncCursor();
const remoteHasData = await syncEngine.checkRemoteHasData();

const isFirstSync = !remoteMeta.last_sync_time && !syncCursor;

if (isFirstSync) {
  console.log('First sync detected, marking all local data for sync...');
  const count = syncEngine.resetSyncStatus();
  console.log(`Marked ${count} items for sync`);
  
  if (remoteHasData) {
    console.warn('Remote server already has data. Conflicts may occur during first sync.');
  }
}
```

### 2. 首次同步场景

**场景 A: 本地有数据，远端为空**

```
本地: 100 条笔记
远端: 空

处理:
  1. 标记所有本地数据为 modified
  2. Push 阶段上传所有数据
  3. Pull 阶段无变更
  4. 同步完成
```

**场景 B: 本地为空，远端有数据**

```
本地: 空
远端: 100 条笔记

处理:
  1. Push 阶段无数据
  2. Pull 阶段下载所有数据
  3. 更新本地游标
  4. 同步完成
```

**场景 C: 本地和远端都有数据**

```
本地: 50 条笔记
远端: 100 条笔记

处理:
  1. Push 阶段上传本地数据
  2. Pull 阶段下载远端数据
  3. 可能产生冲突
  4. 根据冲突策略处理
```

## 性能优化

### 1. 批量操作

**WebDAV 限制**: 逐项上传

```typescript
// 单项上传
for (const item of items) {
  await adapter.putItem(item);
}
```

**服务器优化**: 批量上传

```typescript
// 批量上传
const results = await adapter.batchPutItems(items);
```

### 2. 分页拉取

**限制**: 每次最多拉取 100 条变更

```typescript
const { changes, nextCursor, hasMore } = await adapter.listChanges(cursor, limit=100);

// 循环拉取直到没有更多变更
while (hasMore) {
  // 处理变更
  // 更新游标
  cursor = nextCursor;
}
```

### 3. 内容哈希快速比对

**用途**: 快速判断内容是否一致

```typescript
// 计算哈希
const hash = crypto.createHash('sha256')
  .update(JSON.stringify(payload))
  .digest('hex');

// 比对
if (localItem.content_hash === remoteChange.content_hash) {
  // 内容一致，跳过
}
```

### 4. 变更日志清理

**保留期**: 7 天

```typescript
// 清理过期变更日志
const beforeTimestamp = Date.now() - CHANGE_LOG_RETENTION; // 7 天
const deletedCount = await adapter.cleanupChangeLogs(beforeTimestamp);
```

## 错误恢复

### 1. 网络错误恢复

**重试机制**:

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,    // 1 秒
  maxDelay: 10000,    // 10 秒
};

// 指数退避
// 第 1 次: 1 秒
// 第 2 次: 2 秒
// 第 3 次: 4 秒
```

**可重试错误**:
- ETIMEDOUT (连接超时)
- ECONNRESET (连接重置)
- ECONNREFUSED (连接拒绝)
- socket hang up (套接字挂起)

### 2. 部分同步失败恢复

**策略**: 保存游标，下次继续

```typescript
// 每批次处理完成后更新游标
if (nextCursor && batchSuccessful) {
  lastSuccessfulCursor = nextCursor;
  itemsManager.setLocalSyncCursor({
    cursor: lastSuccessfulCursor,
    timestamp: Date.now(),
  });
}

// 下次同步从上次中断的位置继续
const localCursor = itemsManager.getLocalSyncCursor();
const { changes, nextCursor } = await adapter.listChanges(localCursor?.cursor);
```

### 3. 游标损坏恢复

**检测**: 游标指向的变更不存在

**恢复**: 重置游标，重新同步

```typescript
// 如果游标无效，重置为 null
if (cursorInvalid) {
  itemsManager.setLocalSyncCursor(null);
  // 下次同步会从头开始
}
```

## 监控和调试

### 1. 同步进度报告

```typescript
interface SyncProgress {
  phase: 'idle' | 'connecting' | 'pushing' | 'pulling' | 'committing' | 'done' | 'error';
  message: string;
  current?: number;  // 当前进度
  total?: number;    // 总数
  detail?: string;   // 详细信息
}

// 进度回调
syncEngine.setProgressCallback((progress) => {
  console.log(`${progress.phase}: ${progress.message}`);
  if (progress.current && progress.total) {
    console.log(`Progress: ${progress.current}/${progress.total}`);
  }
});
```

### 2. 同步结果统计

```typescript
interface SyncResult {
  success: boolean;
  pushed: number;        // 上传项目数
  pulled: number;        // 下载项目数
  conflicts: number;     // 冲突数
  errors: string[];      // 错误列表
  duration: number;      // 同步耗时 (毫秒)
  cleanedChangeLogs?: number;  // 清理的变更日志数
}
```

### 3. 调试日志

```typescript
// 启用详细日志
console.log('[SyncEngine] Pull starting with local cursor:', currentCursor);
console.log('[SyncEngine] Got ${result.changes.size} changes, hasMore=${result.hasMore}');
console.log('[SyncEngine] Processing change: id=${remoteItem.id}, type=${remoteItem.type}');
console.log('[SyncEngine] Conflict detected for item: ${remoteItem.id}');
console.log('[SyncEngine] Updated local cursor to:', lastSuccessfulCursor);
```

## 总结

暮城笔记的增量同步机制通过以下特性实现高效同步:

1. **基于游标的分页** - 只拉取新变更
2. **内容哈希快速比对** - 避免不必要的更新
3. **冲突检测和解决** - 支持多种冲突策略
4. **错误恢复** - 智能重试和游标保存
5. **模块选择性同步** - 灵活的同步配置
6. **进度报告** - 实时反馈同步状态

这些特性共同确保了暮城笔记在各种网络条件下的可靠同步。
