# Requirements Document

## Introduction

暮城笔记自建同步服务器是一个独立的后端服务程序，用于支持暮城笔记桌面端（Electron）和移动端（Android）之间的数据同步。服务器需要实现完整的 REST API 接口，支持多终端同步、增量同步、冲突处理等核心功能。

## Glossary

- **Sync_Server**: 自建同步服务器，提供 REST API 接口供客户端同步数据
- **ItemBase**: 统一的数据项基础结构，包含 id、type、payload、content_hash 等字段
- **Change_Log**: 变更日志，记录所有数据项的变更历史，用于增量同步
- **Cursor**: 游标，指向变更日志中的某个位置，用于增量拉取
- **Remote_Rev**: 远端版本号，用于标识数据项在服务器上的版本
- **API_Key**: API 密钥，用于客户端认证
- **Resource**: 资源文件，如图片、附件等二进制数据
- **Content_Hash**: 内容哈希，用于检测数据项内容是否真正变更
- **Soft_Delete**: 软删除，通过设置 deleted_time 标记删除而非物理删除
- **Hard_Delete**: 硬删除，物理删除数据项
- **Key_Fingerprint**: 密钥指纹，用于验证客户端加密密钥的一致性

## Requirements

### Requirement 1: 服务器基础架构

**User Story:** 作为系统管理员，我希望能够部署一个独立的同步服务器，以便为暮城笔记用户提供自托管的数据同步服务。

#### Acceptance Criteria

1. THE Sync_Server SHALL provide a health check endpoint at GET /api/health that returns server status
2. THE Sync_Server SHALL support configuration via environment variables for port, database path, and API keys
3. THE Sync_Server SHALL use SQLite as the default database for data persistence
4. THE Sync_Server SHALL log all API requests with timestamp, method, path, and response status
5. THE Sync_Server SHALL support graceful shutdown when receiving SIGTERM or SIGINT signals
6. THE Sync_Server SHALL provide CORS support for cross-origin requests from client applications

### Requirement 2: API 认证

**User Story:** 作为用户，我希望我的同步数据受到认证保护，以防止未授权访问。

#### Acceptance Criteria

1. WHEN a request includes X-API-Key header, THE Sync_Server SHALL validate it against configured API keys
2. WHEN a request includes Authorization Bearer token, THE Sync_Server SHALL validate the token
3. IF a request lacks valid authentication, THEN THE Sync_Server SHALL return 401 Unauthorized status
4. IF a request has invalid credentials, THEN THE Sync_Server SHALL return 403 Forbidden status
5. THE Sync_Server SHALL support multiple API keys for different users or devices

### Requirement 3: 元数据管理

**User Story:** 作为客户端应用，我需要获取和更新服务器元数据，以便了解服务器能力和同步状态。

#### Acceptance Criteria

1. WHEN a client requests GET /api/meta, THE Sync_Server SHALL return version, capabilities, and last_sync_time
2. WHEN a client sends PUT /api/meta with updated metadata, THE Sync_Server SHALL persist the changes
3. THE Sync_Server SHALL include capabilities array indicating supported features (items, resources, changes)
4. THE Sync_Server SHALL track and return the last successful sync timestamp

### Requirement 4: 数据项 CRUD 操作

**User Story:** 作为客户端应用，我需要对数据项进行创建、读取、更新和删除操作，以便同步笔记、书签、密码库等数据。

#### Acceptance Criteria

1. WHEN a client requests GET /api/items/{id}, THE Sync_Server SHALL return the item with matching id or 404 if not found
2. WHEN a client sends PUT /api/items/{id} with item data, THE Sync_Server SHALL create or update the item and return remoteRev
3. WHEN a client sends DELETE /api/items/{id}, THE Sync_Server SHALL remove the item and return success status
4. WHEN an item is created or updated, THE Sync_Server SHALL generate a new remoteRev based on timestamp
5. WHEN an item is modified, THE Sync_Server SHALL record the change in the Change_Log
6. THE Sync_Server SHALL support all item types: note, folder, tag, resource, bookmark, bookmark_folder, vault_entry, vault_folder, diagram, todo, ai_config, ai_conversation, ai_message

### Requirement 5: 增量同步 - 变更列表

**User Story:** 作为客户端应用，我需要获取自上次同步以来的变更列表，以便高效地进行增量同步。

#### Acceptance Criteria

1. WHEN a client requests GET /api/changes without cursor, THE Sync_Server SHALL return all changes from the beginning
2. WHEN a client requests GET /api/changes with cursor parameter, THE Sync_Server SHALL return changes after that cursor position
3. WHEN a client requests GET /api/changes with limit parameter, THE Sync_Server SHALL limit the number of returned changes (default 100)
4. THE Sync_Server SHALL return changes in ascending order by change_id
5. THE Sync_Server SHALL include nextCursor and hasMore fields in the response for pagination
6. WHEN returning changes, THE Sync_Server SHALL include change_id, item_id, type, updated_time, deleted_time, and content_hash for each change
7. WHEN an item is soft-deleted (deleted_time is set), THE Sync_Server SHALL include the deletion in the change log
8. THE Sync_Server SHALL use content_hash to allow clients to detect actual data changes vs metadata-only changes

### Requirement 6: 变更日志管理

**User Story:** 作为系统管理员，我希望变更日志能够自动清理过期数据，以避免数据库无限增长。

#### Acceptance Criteria

1. WHEN a client sends DELETE /api/changes with before parameter, THE Sync_Server SHALL delete changes older than the specified timestamp
2. THE Sync_Server SHALL retain change logs for at least 7 days by default
3. THE Sync_Server SHALL return the count of deleted change logs after cleanup
4. THE Sync_Server SHALL maintain referential integrity when cleaning up change logs

### Requirement 7: 资源文件管理

**User Story:** 作为客户端应用，我需要上传和下载资源文件（如图片、附件），以便同步笔记中的媒体内容。

#### Acceptance Criteria

1. WHEN a client requests GET /api/resources/{id}, THE Sync_Server SHALL return the binary resource data or 404 if not found
2. WHEN a client sends PUT /api/resources/{id} with binary data, THE Sync_Server SHALL store the resource file
3. WHEN a client sends DELETE /api/resources/{id}, THE Sync_Server SHALL remove the resource file
4. THE Sync_Server SHALL support Content-Type header for resource uploads to identify file type
5. THE Sync_Server SHALL store resources in a dedicated directory on the file system
6. THE Sync_Server SHALL support resources up to 100MB in size

### Requirement 8: 批量操作

**User Story:** 作为客户端应用，我希望能够批量上传多个数据项，以提高同步效率。

#### Acceptance Criteria

1. WHEN a client sends POST /api/items/batch with items array, THE Sync_Server SHALL process all items in a single transaction
2. THE Sync_Server SHALL return success status and remoteRev for each processed item
3. IF any item in the batch fails, THEN THE Sync_Server SHALL rollback the entire transaction
4. THE Sync_Server SHALL limit batch size to 100 items per request

### Requirement 9: 服务器状态和统计

**User Story:** 作为系统管理员，我希望能够查看服务器状态和存储统计，以便监控服务健康状况。

#### Acceptance Criteria

1. WHEN a client requests GET /api/status, THE Sync_Server SHALL return server health status
2. THE Sync_Server SHALL include storage usage statistics (used space, total items count)
3. THE Sync_Server SHALL include server version information
4. THE Sync_Server SHALL include uptime information

### Requirement 10: 数据项计数

**User Story:** 作为客户端应用，我需要查询服务器上的数据项数量，以便判断是否为首次同步。

#### Acceptance Criteria

1. WHEN a client requests GET /api/items/count, THE Sync_Server SHALL return the total item count
2. THE Sync_Server SHALL include hasData boolean indicating whether any items exist
3. THE Sync_Server SHALL support optional type parameter to count items of specific type

### Requirement 11: 密钥指纹验证

**User Story:** 作为客户端应用，我需要验证加密密钥指纹，以确保数据一致性和防止密钥不匹配。

#### Acceptance Criteria

1. WHEN a client requests GET /api/sync/key-fingerprint, THE Sync_Server SHALL return the stored fingerprint or null if not set
2. WHEN a client sends PUT /api/sync/key-fingerprint with fingerprint and no existing fingerprint exists, THE Sync_Server SHALL store the fingerprint (first sync scenario)
3. WHEN a client sends PUT /api/sync/key-fingerprint with fingerprint and an existing fingerprint exists, THE Sync_Server SHALL return 409 Conflict with the existing fingerprint
4. THE Sync_Server SHALL associate fingerprint with the authenticated user/API key
5. THE Sync_Server SHALL provide DELETE /api/sync/key-fingerprint endpoint for administrators to reset fingerprint (requires special permission)

### Requirement 12: Docker 部署支持

**User Story:** 作为系统管理员，我希望能够使用 Docker 快速部署同步服务器，以简化运维工作。

#### Acceptance Criteria

1. THE Sync_Server SHALL provide a Dockerfile for building container image
2. THE Sync_Server SHALL provide docker-compose.yml for easy deployment
3. THE Sync_Server SHALL support volume mounting for data persistence
4. THE Sync_Server SHALL expose configurable port (default 3000)
5. THE Sync_Server SHALL support environment variable configuration in Docker

### Requirement 13: 错误处理

**User Story:** 作为客户端应用，我需要收到清晰的错误响应，以便正确处理同步失败情况。

#### Acceptance Criteria

1. WHEN an error occurs, THE Sync_Server SHALL return appropriate HTTP status code (400, 401, 403, 404, 500)
2. THE Sync_Server SHALL include error message in JSON response body
3. THE Sync_Server SHALL log detailed error information for debugging
4. IF database operation fails, THEN THE Sync_Server SHALL return 500 Internal Server Error with generic message
5. IF request validation fails, THEN THE Sync_Server SHALL return 400 Bad Request with specific validation errors

### Requirement 14: 数据库架构

**User Story:** 作为开发者，我需要一个清晰的数据库架构，以便正确存储和查询同步数据。

#### Acceptance Criteria

1. THE Sync_Server SHALL create items table with columns: id (TEXT PRIMARY KEY), type (TEXT), payload (TEXT/JSON), content_hash (TEXT), remote_rev (TEXT), deleted_time (INTEGER NULL), created_at (INTEGER), updated_at (INTEGER)
2. THE Sync_Server SHALL create changes table with columns: change_id (INTEGER PRIMARY KEY AUTOINCREMENT), item_id (TEXT), type (TEXT), updated_time (INTEGER), deleted_time (INTEGER NULL), content_hash (TEXT), created_at (INTEGER)
3. THE Sync_Server SHALL create metadata table with columns: key (TEXT PRIMARY KEY), value (TEXT), updated_at (INTEGER)
4. THE Sync_Server SHALL create key_fingerprints table with columns: api_key_hash (TEXT PRIMARY KEY), fingerprint (TEXT), created_at (INTEGER), updated_at (INTEGER)
5. THE Sync_Server SHALL create sync_cursors table with columns: api_key_hash (TEXT PRIMARY KEY), cursor (TEXT), updated_at (INTEGER)
6. THE Sync_Server SHALL create indexes: idx_changes_change_id, idx_items_type, idx_items_updated_at, idx_changes_item_id
7. THE Sync_Server SHALL auto-increment change_id for ordering
8. THE Sync_Server SHALL use INTEGER for timestamps (Unix milliseconds) for cross-platform compatibility

### Requirement 15: 同步游标管理

**User Story:** 作为客户端应用，我需要在服务器端存储和获取同步游标，以便在设备间共享同步进度（可选功能）。

#### Acceptance Criteria

1. WHEN a client requests GET /api/sync/cursor, THE Sync_Server SHALL return the stored cursor for the authenticated user or null if not set
2. WHEN a client sends PUT /api/sync/cursor with cursor data, THE Sync_Server SHALL store the cursor associated with the authenticated user
3. THE Sync_Server SHALL store cursor with timestamp to track last update time
4. THE Sync_Server SHALL associate cursor with the authenticated API key
5. NOTE: This is an optional server-side feature; clients MAY choose to store cursors locally instead

### Requirement 16: 软删除支持

**User Story:** 作为客户端应用，我需要服务器支持软删除机制，以便在多终端间正确同步删除操作。

#### Acceptance Criteria

1. WHEN a client sends PUT /api/items/{id} with deleted_time set, THE Sync_Server SHALL mark the item as soft-deleted
2. WHEN returning items, THE Sync_Server SHALL include deleted_time field to indicate deletion status
3. THE Sync_Server SHALL include soft-deleted items in change logs for synchronization
4. WHEN a client sends DELETE /api/items/{id}, THE Sync_Server SHALL perform hard delete (permanent removal)
5. THE Sync_Server SHALL support a cleanup endpoint to permanently remove items soft-deleted more than 30 days ago

### Requirement 17: 并发控制

**User Story:** 作为系统管理员，我需要服务器能够正确处理多终端同时同步的情况，以避免数据损坏。

#### Acceptance Criteria

1. THE Sync_Server SHALL use database transactions for all write operations
2. THE Sync_Server SHALL use optimistic locking based on remote_rev for item updates
3. IF a client sends PUT /api/items/{id} with outdated remote_rev, THEN THE Sync_Server SHALL return 409 Conflict
4. THE Sync_Server SHALL serialize change log writes to ensure consistent ordering
5. THE Sync_Server SHALL handle concurrent requests to the same item gracefully

