# 同步机制测试指南

## 测试目标
验证桌面端和移动端的同步机制在以下场景下工作正常：
1. 电脑A → WebDAV → 手机C 的数据同步
2. 手机C → WebDAV → 电脑A 的数据同步
3. 冲突检测和处理
4. 向后兼容性（从旧版本升级）

---

## 测试环境准备

### 1. WebDAV 服务器
推荐使用以下任一方案：
- **本地测试**: 使用 Docker 运行 WebDAV 服务器
  ```bash
  docker run -d -p 8080:80 \
    -e USERNAME=test \
    -e PASSWORD=test123 \
    bytemark/webdav
  ```
- **云服务**: 坚果云、Nextcloud、ownCloud 等

### 2. 配置同步
**桌面端配置**:
- URL: `http://localhost:8080/`
- 用户名: `test`
- 密码: `test123`
- 同步路径: `/mucheng-notes`

**移动端配置**:
- 相同的 WebDAV 配置

---

## 测试用例

### 测试1: 桌面端 → 移动端 首次同步

**步骤**:
1. 在桌面端创建3个笔记：
   - 笔记A: "测试笔记1"
   - 笔记B: "测试笔记2"
   - 文件夹F: "测试文件夹"
   
2. 桌面端执行同步
   - 检查 WebDAV 服务器上是否创建了以下文件：
     - `/mucheng-notes/items/` 下有3个 JSON 文件
     - `/mucheng-notes/changes/` 下有3个变更日志文件
     - `/mucheng-notes/sync-cursor.json` 存在

3. 移动端执行同步
   - 检查移动端是否成功拉取3个数据项
   - 检查数据内容是否完整

**预期结果**:
- ✅ 移动端成功同步3个数据项
- ✅ 数据内容与桌面端一致
- ✅ 同步状态为 `clean`

---

### 测试2: 移动端 → 桌面端 增量同步

**步骤**:
1. 在移动端创建1个新笔记：
   - 笔记C: "移动端笔记"

2. 移动端执行同步
   - 检查 WebDAV 服务器上是否新增：
     - `/mucheng-notes/items/` 下新增1个 JSON 文件
     - `/mucheng-notes/changes/` 下新增1个变更日志文件

3. 桌面端执行同步
   - 检查桌面端是否成功拉取新笔记

**预期结果**:
- ✅ 桌面端成功同步移动端的新笔记
- ✅ 数据内容一致
- ✅ 游标正确更新

---

### 测试3: 冲突检测和处理

**步骤**:
1. 在桌面端和移动端同时修改同一笔记（笔记A）
   - 桌面端: 修改标题为 "桌面端修改"
   - 移动端: 修改标题为 "移动端修改"

2. 桌面端先执行同步

3. 移动端执行同步
   - 检查是否创建冲突副本

**预期结果**:
- ✅ 移动端创建冲突副本 "移动端修改 (冲突副本)"
- ✅ 原笔记被远端版本覆盖为 "桌面端修改"
- ✅ 冲突计数器 > 0

---

### 测试4: 向后兼容性测试

**步骤**:
1. 清空 WebDAV 服务器的 `/mucheng-notes/changes/` 目录
   - 模拟旧版本数据（没有变更日志）

2. 移动端执行同步
   - 检查是否回退到扫描 items 目录

3. 移动端创建新笔记并同步
   - 检查是否创建变更日志

**预期结果**:
- ✅ 移动端成功回退到 items 扫描模式
- ✅ 后续同步正常创建变更日志
- ✅ 数据完整性保持

---

## 验证检查点

### WebDAV 服务器检查
使用浏览器或 WebDAV 客户端检查：

```
/mucheng-notes/
├── workspace.json          ✅ 存在
├── sync-cursor.json        ✅ 存在，格式正确
├── items/
│   ├── {uuid1}.json       ✅ 笔记数据
│   ├── {uuid2}.json       ✅ 文件夹数据
│   └── ...
├── changes/
│   ├── 1704537600000.json ✅ 变更日志
│   ├── 1704537700000.json ✅ 变更日志
│   └── ...
└── locks/
    └── lock.json          ✅ 同步锁（同步时存在）
```

### 游标格式检查
`sync-cursor.json` 内容示例：
```json
{
  "cursor": "1704537700000.json",
  "timestamp": 1704537700000
}
```

### 变更日志格式检查
`changes/1704537600000.json` 内容示例：
```json
{
  "change_id": 1704537600000,
  "item_id": "uuid-123-456",
  "type": "note",
  "updated_time": 1704537600000,
  "deleted_time": null,
  "content_hash": "abc123..."
}
```

---

## 常见问题排查

### 问题1: 移动端无法拉取桌面端数据
**检查**:
- WebDAV 连接是否正常
- `/mucheng-notes/changes/` 目录是否存在
- 游标格式是否正确

### 问题2: 桌面端无法拉取移动端数据
**检查**:
- 移动端是否正确创建变更日志
- 游标是否正确更新
- 变更日志格式是否正确

### 问题3: 数据重复同步
**检查**:
- 游标是否正确更新
- content_hash 是否正确计算
- sync_status 是否正确标记为 clean

---

## 日志分析

### 桌面端日志关键字
```
[SyncEngine] Starting sync...
[WebDAV] Recorded change: 1704537600000 for item uuid-123
[SyncEngine] Loaded 3 changes
[SyncEngine] Sync completed: pushed=1, pulled=2
```

### 移动端日志关键字
```
D/SyncEngine: Starting pull, cursor=1704537600000.json
D/WebDAV: Found 2 change files
D/SyncEngine: Processing change: id=uuid-123
D/SyncEngine: Pull completed: count=2, conflicts=0
```

---

## 性能基准

| 操作 | 预期时间 | 备注 |
|------|---------|------|
| 首次同步 100 笔记 | < 10s | 取决于网络速度 |
| 增量同步 10 笔记 | < 2s | 仅读取变更日志 |
| 冲突检测 | < 1s | 本地哈希比对 |

---

## 测试完成标准

- ✅ 所有4个测试用例通过
- ✅ WebDAV 目录结构正确
- ✅ 游标和变更日志格式正确
- ✅ 无数据丢失或重复
- ✅ 冲突处理正确
- ✅ 向后兼容性正常

