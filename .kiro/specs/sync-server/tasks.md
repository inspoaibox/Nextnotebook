# Tasks - 暮城笔记自建同步服务器

## Phase 1: 项目初始化和基础架构

### Task 1.1: 项目脚手架
- [x] 创建 `sync-server/` 目录结构
- [x] 初始化 `package.json` (Node.js 18+, TypeScript)
- [x] 配置 `tsconfig.json`
- [x] 安装依赖: express, better-sqlite3, cors, dotenv
- [x] 创建 `src/index.ts` 入口文件
- [x] 创建 `src/app.ts` Express 应用配置

**Requirements:** R1.1, R1.2, R1.3

### Task 1.2: 配置管理
- [x] 创建 `src/config.ts`
- [x] 实现环境变量读取 (PORT, DATABASE_PATH, API_KEYS, etc.)
- [x] 添加默认值和验证
- [ ] 支持可选的 config.yaml 配置文件 (可选功能，暂不实现)

**Requirements:** R1.2, R12.5

### Task 1.3: 数据库初始化
- [x] 创建 `src/database/index.ts`
- [x] 创建 `src/database/schema.ts`
- [x] 实现 5 张表的创建 (items, changes, metadata, key_fingerprints, sync_cursors)
- [x] 创建索引
- [ ] 实现数据库迁移机制 (可选功能，暂不实现)

**Requirements:** R1.3, R14


### Task 1.4: 中间件实现
- [x] 创建 `src/middleware/auth.ts` - API Key 和 Bearer Token 认证
- [x] 创建 `src/middleware/cors.ts` - CORS 支持
- [x] 创建 `src/middleware/logger.ts` - 请求日志记录
- [x] 创建 `src/middleware/errorHandler.ts` - 统一错误处理

**Requirements:** R1.4, R1.6, R2, R13

### Task 1.5: 优雅关闭
- [x] 在 `src/index.ts` 实现 SIGTERM/SIGINT 信号处理
- [x] 实现 HTTP 服务器优雅关闭
- [x] 实现数据库连接关闭
- [x] 添加关闭超时机制

**Requirements:** R1.5

---

## Phase 2: 核心 API 实现

### Task 2.1: 健康检查和状态 API
- [x] 创建 `src/routes/health.ts`
- [x] 实现 `GET /api/health` - 健康检查（无需认证）
- [x] 实现 `GET /api/status` - 服务器状态和统计
- [x] 包含 uptime、version、storage 统计

**Requirements:** R1.1, R9

### Task 2.2: 元数据 API
- [x] 创建 `src/routes/meta.ts`
- [x] 实现 `GET /api/meta` - 获取服务器元数据
- [x] 实现 `PUT /api/meta` - 更新元数据
- [x] 返回 version, capabilities, last_sync_time

**Requirements:** R3

### Task 2.3: 数据项服务
- [x] 创建 `src/services/ItemService.ts`
- [x] 实现 `getItem(id)` - 获取单个数据项
- [x] 实现 `putItem(item)` - 创建/更新数据项
- [x] 实现 `deleteItem(id)` - 硬删除数据项
- [x] 实现 `getCount(type?)` - 获取数据项计数
- [x] 实现 `batchPut(items)` - 批量操作
- [x] 实现 `cleanupSoftDeleted(before)` - 清理软删除数据

**Requirements:** R4, R8, R10, R16, R17

### Task 2.4: 数据项 API
- [x] 创建 `src/routes/items.ts`
- [x] 实现 `GET /api/items/{id}` - 获取数据项
- [x] 实现 `PUT /api/items/{id}` - 创建/更新数据项
- [x] 实现 `DELETE /api/items/{id}` - 硬删除数据项
- [x] 实现 `GET /api/items/count` - 数据项计数
- [x] 实现 `POST /api/items/batch` - 批量上传
- [x] 实现 `DELETE /api/items/cleanup` - 清理软删除数据

**Requirements:** R4, R8, R10, R16


### Task 2.5: 变更日志服务
- [x] 创建 `src/services/ChangeService.ts`
- [x] 实现 `recordChange(item)` - 记录变更
- [x] 实现 `listChanges(cursor, limit)` - 获取变更列表
- [x] 实现 `cleanupBefore(timestamp)` - 清理过期变更
- [x] 确保变更按 change_id 升序返回
- [x] 实现分页 (nextCursor, hasMore)

**Requirements:** R5, R6

### Task 2.6: 变更日志 API
- [x] 创建 `src/routes/changes.ts`
- [x] 实现 `GET /api/changes` - 获取变更列表
- [x] 支持 cursor 和 limit 参数
- [x] 实现 `DELETE /api/changes` - 清理过期变更
- [x] 支持 before 参数

**Requirements:** R5, R6

### Task 2.7: 资源文件服务
- [x] 创建 `src/services/ResourceService.ts`
- [x] 实现 `getResource(id)` - 获取资源文件
- [x] 实现 `putResource(id, data, mimeType)` - 保存资源文件
- [x] 实现 `deleteResource(id)` - 删除资源文件
- [x] 实现 `getStorageStats()` - 获取存储统计
- [x] 文件存储在 `data/resources/` 目录

**Requirements:** R7

### Task 2.8: 资源文件 API
- [x] 创建 `src/routes/resources.ts`
- [x] 实现 `GET /api/resources/{id}` - 下载资源
- [x] 实现 `PUT /api/resources/{id}` - 上传资源
- [x] 实现 `DELETE /api/resources/{id}` - 删除资源
- [x] 支持 Content-Type 头
- [x] 限制文件大小 (100MB)

**Requirements:** R7

---

## Phase 3: 同步功能实现

### Task 3.1: 同步游标 API
- [x] 在 `src/routes/sync.ts` 添加游标端点
- [x] 实现 `GET /api/sync/cursor` - 获取游标
- [x] 实现 `PUT /api/sync/cursor` - 保存游标
- [x] 按 API Key 隔离游标

**Requirements:** R15

### Task 3.2: 密钥指纹 API
- [x] 在 `src/routes/sync.ts` 添加指纹端点
- [x] 实现 `GET /api/sync/key-fingerprint` - 获取指纹
- [x] 实现 `PUT /api/sync/key-fingerprint` - 保存指纹
- [x] 实现 `DELETE /api/sync/key-fingerprint` - 重置指纹
- [x] 处理首次同步和冲突场景

**Requirements:** R11


### Task 3.3: 并发控制
- [x] 在 ItemService 中实现数据库事务
- [ ] 实现基于 remote_rev 的乐观锁 (待完善)
- [ ] 处理版本冲突返回 409 (待完善)
- [x] 确保变更日志写入的顺序性

**Requirements:** R17

### Task 3.4: 定时清理任务
- [x] 创建 `src/services/CleanupScheduler.ts`
- [x] 实现每日自动清理变更日志 (7 天前)
- [x] 实现每日自动清理软删除数据 (30 天前)
- [x] 添加清理日志记录

**Requirements:** R6.2, R16.5

---

## Phase 4: Docker 部署

### Task 4.1: Dockerfile
- [x] 创建 `Dockerfile`
- [x] 使用 node:18-alpine 基础镜像
- [x] 多阶段构建优化镜像大小
- [x] 配置 VOLUME 和 EXPOSE

**Requirements:** R12.1, R12.3, R12.4

### Task 4.2: Docker Compose
- [x] 创建 `docker-compose.yml`
- [x] 配置数据卷持久化
- [x] 配置环境变量
- [x] 添加健康检查

**Requirements:** R12.2, R12.5

### Task 4.3: 部署文档
- [x] 创建 `README.md` 使用说明
- [x] 添加快速开始指南
- [x] 添加配置说明
- [x] 添加 API 文档链接

---

## Phase 5: 测试和文档

### Task 5.1: 单元测试
- [ ] 配置 Jest 测试框架
- [ ] ItemService 单元测试
- [ ] ChangeService 单元测试
- [ ] ResourceService 单元测试
- [ ] 认证中间件测试

### Task 5.2: 集成测试
- [ ] API 端点集成测试
- [ ] 同步流程端到端测试
- [ ] 并发操作测试
- [ ] 错误处理测试

### Task 5.3: 与客户端集成测试
- [ ] 使用桌面端 ServerAdapter 测试连接
- [ ] 测试完整同步流程
- [ ] 测试增量同步
- [ ] 测试密钥指纹验证

---

## 任务依赖关系

```
Phase 1 (基础架构)
  ├── Task 1.1 项目脚手架
  ├── Task 1.2 配置管理 (依赖 1.1)
  ├── Task 1.3 数据库初始化 (依赖 1.1)
  ├── Task 1.4 中间件实现 (依赖 1.1)
  └── Task 1.5 优雅关闭 (依赖 1.1)

Phase 2 (核心 API) - 依赖 Phase 1
  ├── Task 2.1 健康检查 API
  ├── Task 2.2 元数据 API
  ├── Task 2.3 数据项服务 (依赖 1.3)
  ├── Task 2.4 数据项 API (依赖 2.3)
  ├── Task 2.5 变更日志服务 (依赖 1.3)
  ├── Task 2.6 变更日志 API (依赖 2.5)
  ├── Task 2.7 资源文件服务
  └── Task 2.8 资源文件 API (依赖 2.7)

Phase 3 (同步功能) - 依赖 Phase 2
  ├── Task 3.1 同步游标 API
  ├── Task 3.2 密钥指纹 API
  ├── Task 3.3 并发控制 (依赖 2.3)
  └── Task 3.4 定时清理任务 (依赖 2.5)

Phase 4 (Docker 部署) - 依赖 Phase 3
  ├── Task 4.1 Dockerfile
  ├── Task 4.2 Docker Compose (依赖 4.1)
  └── Task 4.3 部署文档

Phase 5 (测试) - 可与 Phase 2-4 并行
  ├── Task 5.1 单元测试
  ├── Task 5.2 集成测试
  └── Task 5.3 客户端集成测试
```

---

## 预估工时

| Phase | 任务数 | 预估时间 |
|-------|--------|----------|
| Phase 1 | 5 | 4-6 小时 |
| Phase 2 | 8 | 8-12 小时 |
| Phase 3 | 4 | 4-6 小时 |
| Phase 4 | 3 | 2-3 小时 |
| Phase 5 | 3 | 4-6 小时 |
| **总计** | **23** | **22-33 小时** |
