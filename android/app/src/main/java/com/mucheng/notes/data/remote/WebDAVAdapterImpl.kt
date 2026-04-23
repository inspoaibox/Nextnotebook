package com.mucheng.notes.data.remote

import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.domain.model.SyncConfig
import com.thegrizzlylabs.sardineandroid.Sardine
import com.thegrizzlylabs.sardineandroid.impl.OkHttpSardine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * WebDAV 适配器实现
 * 使用 Sardine 库进行 WebDAV 操作
 */
@Singleton
class WebDAVAdapterImpl @Inject constructor() : WebDAVAdapter {
    
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true  // 允许更宽松的 JSON 解析
        coerceInputValues = true  // 将缺失的字段填充为默认值
    }
    
    private var sardine: Sardine? = null
    private var config: SyncConfig? = null
    
    /**
     * 初始化 WebDAV 连接
     */
    fun initialize(syncConfig: SyncConfig) {
        config = syncConfig
        sardine = OkHttpSardine().apply {
            if (!syncConfig.username.isNullOrEmpty() && !syncConfig.password.isNullOrEmpty()) {
                setCredentials(syncConfig.username, syncConfig.password)
            }
        }
    }
    
    private fun getSardine(): Sardine {
        return sardine ?: throw IllegalStateException("WebDAV not initialized")
    }
    
    private fun getConfig(): SyncConfig {
        return config ?: throw IllegalStateException("WebDAV not initialized")
    }
    
    private fun getItemsPath(): String {
        val cfg = getConfig()
        return "${cfg.url}${cfg.syncPath}/items"
    }
    
    private fun getResourcesPath(): String {
        val cfg = getConfig()
        return "${cfg.url}${cfg.syncPath}/resources"
    }
    
    private fun getChangesPath(): String {
        val cfg = getConfig()
        return "${cfg.url}${cfg.syncPath}/changes"
    }
    
    override suspend fun testConnection(): Boolean = withContext(Dispatchers.IO) {
        try {
            val cfg = getConfig()
            val sardine = getSardine()
            
            android.util.Log.d("WebDAV", "Testing connection to: ${cfg.url}${cfg.syncPath}")
            android.util.Log.d("WebDAV", "Username: ${cfg.username}, Password length: ${cfg.password?.length ?: 0}")
            
            // 尝试访问同步目录
            val path = "${cfg.url}${cfg.syncPath}"
            val exists = sardine.exists(path)
            android.util.Log.d("WebDAV", "Path exists: $exists")
            
            if (!exists) {
                // 创建目录结构
                android.util.Log.d("WebDAV", "Creating directory structure...")
                sardine.createDirectory(path)
                sardine.createDirectory(getItemsPath())
                sardine.createDirectory(getResourcesPath())
                sardine.createDirectory(getChangesPath())
                android.util.Log.d("WebDAV", "Directory structure created")
            }
            
            android.util.Log.d("WebDAV", "Connection test successful")
            true
        } catch (e: Exception) {
            android.util.Log.e("WebDAV", "Connection test failed: ${e.message}")
            android.util.Log.e("WebDAV", "Exception type: ${e.javaClass.simpleName}")
            e.printStackTrace()
            false
        }
    }
    
    override suspend fun getItem(id: String): ItemEntity? = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val path = "${getItemsPath()}/$id.json"

            if (!sardine.exists(path)) {
                android.util.Log.d("WebDAV", "getItem: file does not exist: $path")
                return@withContext null
            }

            val inputStream = sardine.get(path)
            val content = inputStream.bufferedReader().use { it.readText() }
            android.util.Log.d("WebDAV", "getItem: read content for $id, length=${content.length}")

            // 添加详细的解析日志
            try {
                // 先打印原始JSON的前200字符，帮助调试
                val preview = if (content.length > 200) content.substring(0, 200) + "..." else content
                android.util.Log.d("WebDAV", "getItem: JSON preview: $preview")

                val item = json.decodeFromString<ItemEntity>(content)
                android.util.Log.d("WebDAV", "getItem: ✅ Successfully parsed item $id, type=${item.type}, encryptionApplied=${item.encryptionApplied}")
                item
            } catch (parseError: Exception) {
                // 详细的解析错误日志
                android.util.Log.e("WebDAV", "❌ JSON Parse Error for item $id:")
                android.util.Log.e("WebDAV", "  Error Type: ${parseError.javaClass.simpleName}")
                android.util.Log.e("WebDAV", "  Error Message: ${parseError.message}")
                android.util.Log.e("WebDAV", "  Content Length: ${content.length}")
                android.util.Log.e("WebDAV", "  Content Preview (first 500 chars):")
                android.util.Log.e("WebDAV", content.take(500))

                // 尝试解析为通用JSON对象，检查字段
                try {
                    val jsonElement = kotlinx.serialization.json.Json.parseToJsonElement(content)
                    android.util.Log.e("WebDAV", "  Available fields: ${jsonElement}")
                } catch (e: Exception) {
                    android.util.Log.e("WebDAV", "  Cannot parse as JSON at all: ${e.message}")
                }

                parseError.printStackTrace()
                null
            }
        } catch (e: Exception) {
            android.util.Log.e("WebDAV", "getItem: failed to get item $id: ${e.message}")
            e.printStackTrace()
            null
        }
    }
    
    override suspend fun putItem(item: ItemEntity): Result<String> = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val path = "${getItemsPath()}/${item.id}.json"
            val content = json.encodeToString(item)

            sardine.put(path, content.toByteArray(), "application/json")

            // 记录变更到变更日志 (与桌面端保持一致)
            recordChange(item)

            // 返回时间戳作为版本号
            val remoteRev = System.currentTimeMillis().toString()
            Result.success(remoteRev)
        } catch (e: Exception) {
            android.util.Log.e("WebDAV", "Failed to put item ${item.id}: ${e.message}")
            Result.failure(e)
        }
    }
    
    override suspend fun deleteItem(id: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val path = "${getItemsPath()}/$id.json"
            
            if (sardine.exists(path)) {
                sardine.delete(path)
            }
            true
        } catch (e: Exception) {
            false
        }
    }
    
    override suspend fun listChanges(cursor: String?, limit: Int): ChangeListResult = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val changesPath = getChangesPath()

            // 检查 changes 目录是否存在
            val dirExists = sardine.exists(changesPath)
            if (!dirExists) {
                android.util.Log.d("WebDAV", "Changes directory does not exist, creating...")
                try {
                    sardine.createDirectory(changesPath)
                } catch (e: Exception) {
                    android.util.Log.w("WebDAV", "Failed to create changes directory: ${e.message}")
                }

                // 向后兼容：如果没有changes目录，回退到扫描items目录 (首次同步或旧版本数据)
                android.util.Log.d("WebDAV", "Falling back to items directory scan for backward compatibility")
                return@withContext listChangesFromItems(cursor, limit)
            }

            // 列出所有变更文件
            val resources = sardine.list(changesPath)

            // 过滤并排序 JSON 文件
            val sortedFiles = resources
                .filter { !it.isDirectory && it.name.endsWith(".json") }
                .sortedBy { it.name }

            android.util.Log.d("WebDAV", "Found ${sortedFiles.size} change files, cursor=$cursor")

            // 如果没有变更文件，回退到扫描items目录 (向后兼容)
            if (sortedFiles.isEmpty()) {
                android.util.Log.d("WebDAV", "No change files found, falling back to items directory scan")
                return@withContext listChangesFromItems(cursor, limit)
            }

            // 找到游标位置
            var startIndex = 0
            if (cursor != null) {
                val cursorIndex = sortedFiles.indexOfFirst { it.name == cursor }
                if (cursorIndex >= 0) {
                    // 游标文件存在，从它的下一个开始
                    startIndex = cursorIndex + 1
                } else {
                    // 游标文件不存在（例如全量拉取后设置的时间点游标），
                    // 按文件名字符串比较找到第一个比游标新的文件
                    val firstNewerIndex = sortedFiles.indexOfFirst { it.name > cursor }
                    startIndex = if (firstNewerIndex >= 0) firstNewerIndex else sortedFiles.size
                }
            }

            // 如果游标已经在末尾，没有更多变更
            if (startIndex >= sortedFiles.size) {
                android.util.Log.d("WebDAV", "Cursor at end, no more changes")
                return@withContext ChangeListResult(emptyList(), null, false)
            }

            // 读取变更
            val changes = mutableListOf<RemoteChange>()
            val endIndex = minOf(startIndex + limit, sortedFiles.size)

            for (i in startIndex until endIndex) {
                try {
                    val inputStream = sardine.get("$changesPath/${sortedFiles[i].name}")
                    val content = inputStream.bufferedReader().use { it.readText() }
                    val change = json.decodeFromString<RemoteChange>(content)
                    changes.add(change)
                } catch (e: Exception) {
                    android.util.Log.w("WebDAV", "Failed to read change file ${sortedFiles[i].name}: ${e.message}")
                    // 跳过损坏的文件，继续处理
                }
            }

            val hasMore = endIndex < sortedFiles.size
            val nextCursor = if (changes.isNotEmpty()) sortedFiles[endIndex - 1].name else null

            android.util.Log.d("WebDAV", "Loaded ${changes.size} changes, hasMore=$hasMore, nextCursor=$nextCursor")

            ChangeListResult(
                changes = changes,
                nextCursor = nextCursor,
                hasMore = hasMore
            )
        } catch (e: Exception) {
            android.util.Log.e("WebDAV", "Failed to list changes: ${e.message}")
            e.printStackTrace()
            ChangeListResult(emptyList(), null, false)
        }
    }
    
    // ❌ 游标已移至本地存储，不再从WebDAV读写
    // 保留这两个方法是为了兼容 WebDAVAdapter 接口
    // 但实际上不再使用，游标由 SyncEngine 的 SharedPreferences 管理
    override suspend fun getSyncCursor(): SyncCursor? = withContext(Dispatchers.IO) {
        android.util.Log.w("WebDAVAdapter", "getSyncCursor is deprecated. Use SyncEngine.getLocalSyncCursor() instead.")
        return@withContext null
    }

    override suspend fun setSyncCursor(cursor: SyncCursor): Boolean = withContext(Dispatchers.IO) {
        android.util.Log.w("WebDAVAdapter", "setSyncCursor is deprecated. Use SyncEngine.setLocalSyncCursor() instead.")
        return@withContext true
    }
    
    // 资源文件操作
    
    override suspend fun uploadResource(resourceId: String, data: ByteArray): Result<String> = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val path = "${getResourcesPath()}/$resourceId"
            
            sardine.put(path, data, "application/octet-stream")
            Result.success(System.currentTimeMillis().toString())
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    override suspend fun downloadResource(resourceId: String): Result<ByteArray> = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val path = "${getResourcesPath()}/$resourceId"
            
            val inputStream = sardine.get(path)
            val data = inputStream.readBytes()
            Result.success(data)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    override suspend fun deleteResource(resourceId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val path = "${getResourcesPath()}/$resourceId"
            
            if (sardine.exists(path)) {
                sardine.delete(path)
            }
            true
        } catch (e: Exception) {
            false
        }
    }
    
    override suspend fun listResources(): List<String> = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val resourcesPath = getResourcesPath()
            
            val resources = sardine.list(resourcesPath)
            resources.filter { !it.isDirectory }.map { it.name }
        } catch (e: Exception) {
            emptyList()
        }
    }
    
    // 密钥标识符操作 - 从 workspace.json 读取，与电脑端保持一致
    
    override suspend fun getKeyIdentifier(): String? = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val cfg = getConfig()
            val metaPath = "${cfg.url}${cfg.syncPath}/workspace.json"
            
            if (!sardine.exists(metaPath)) return@withContext null
            
            val inputStream = sardine.get(metaPath)
            val content = inputStream.bufferedReader().use { it.readText() }
            val meta = json.decodeFromString<WorkspaceMeta>(content)
            meta.key_identifier
        } catch (e: Exception) {
            android.util.Log.e("WebDAV", "Failed to get key identifier: ${e.message}")
            null
        }
    }
    
    override suspend fun setKeyIdentifier(keyId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val cfg = getConfig()
            val metaPath = "${cfg.url}${cfg.syncPath}/workspace.json"
            
            // 读取现有的 workspace.json 或创建新的
            val existingMeta = try {
                if (sardine.exists(metaPath)) {
                    val inputStream = sardine.get(metaPath)
                    val content = inputStream.bufferedReader().use { it.readText() }
                    json.decodeFromString<WorkspaceMeta>(content)
                } else {
                    WorkspaceMeta()
                }
            } catch (e: Exception) {
                WorkspaceMeta()
            }
            
            // 更新 key_identifier
            val updatedMeta = existingMeta.copy(
                key_identifier = keyId,
                last_sync_time = System.currentTimeMillis()
            )
            
            val content = json.encodeToString(updatedMeta)
            sardine.put(metaPath, content.toByteArray(), "application/json")
            true
        } catch (e: Exception) {
            android.util.Log.e("WebDAV", "Failed to set key identifier: ${e.message}")
            false
        }
    }
    
    override suspend fun hasData(): Boolean = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val itemsPath = getItemsPath()

            // 检查 items 目录是否存在且有文件
            if (!sardine.exists(itemsPath)) {
                return@withContext false
            }

            val items = sardine.list(itemsPath)
            // 过滤掉目录本身，只检查文件
            items.any { !it.isDirectory && it.name.endsWith(".json") }
        } catch (e: Exception) {
            // 出错时假设没有数据，允许首次同步
            false
        }
    }

    override suspend fun listAllItems(): List<ItemEntity> = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val itemsPath = getItemsPath()

            if (!sardine.exists(itemsPath)) {
                return@withContext emptyList()
            }

            val resources = sardine.list(itemsPath)
            val items = mutableListOf<ItemEntity>()

            for (resource in resources) {
                if (resource.isDirectory || !resource.name.endsWith(".json")) continue
                val id = resource.name.removeSuffix(".json")
                try {
                    val item = getItem(id)
                    if (item != null) items.add(item)
                } catch (e: Exception) {
                    android.util.Log.w("WebDAV", "listAllItems: failed to read item $id: ${e.message}")
                }
            }

            android.util.Log.d("WebDAV", "listAllItems: got ${items.size} items")
            items
        } catch (e: Exception) {
            android.util.Log.e("WebDAV", "listAllItems failed: ${e.message}")
            emptyList()
        }
    }

    override suspend fun isCursorExpired(cursor: String): Boolean {
        // WebDAV 使用文件名作为游标，检查对应的变更文件是否还存在
        return withContext(Dispatchers.IO) {
            try {
                val sardine = getSardine()
                val changesPath = getChangesPath()
                if (!sardine.exists(changesPath)) return@withContext true
                val resources = sardine.list(changesPath)
                val files = resources.filter { !it.isDirectory && it.name.endsWith(".json") }.map { it.name }
                if (files.isEmpty()) return@withContext true
                // 如果游标文件名不在列表中且比最早的文件还早，说明已过期
                !files.contains(cursor) && cursor < (files.minOrNull() ?: cursor)
            } catch (e: Exception) {
                false
            }
        }
    }

    override fun getLastFullPullChangeId(): Long? {
        // WebDAV 不使用 change_id，返回 null
        return null
    }

    override suspend fun getKeyFingerprint(): String? = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val cfg = getConfig()
            val path = "${cfg.url}${cfg.syncPath}/.encryption-key-fingerprint"

            if (!sardine.exists(path)) {
                return@withContext null
            }

            val inputStream = sardine.get(path)
            val content = inputStream.bufferedReader().use { it.readText() }
            content
        } catch (e: Exception) {
            android.util.Log.e("WebDAV", "Failed to get key fingerprint: ${e.message}")
            null
        }
    }

    override suspend fun saveKeyFingerprint(fingerprint: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val cfg = getConfig()
            val path = "${cfg.url}${cfg.syncPath}/.encryption-key-fingerprint"

            sardine.put(path, fingerprint.toByteArray(), "text/plain")
            true
        } catch (e: Exception) {
            android.util.Log.e("WebDAV", "Failed to save key fingerprint: ${e.message}")
            false
        }
    }

    override suspend fun verifyKeyFingerprint(localFingerprint: String): KeyFingerprintResult = withContext(Dispatchers.IO) {
        val remoteFingerprint = getKeyFingerprint()

        if (remoteFingerprint == null) {
            // 远端没有指纹，检查是否有加密数据
            // 如果有加密数据但没有指纹，说明是旧版本数据或指纹丢失，应该报错
            val hasData = hasData()
            if (hasData) {
                // 远端有数据但没有指纹，可能是密钥不匹配
                return@withContext KeyFingerprintResult(valid = false, remoteFingerprint = null)
            }
            // 远端没有数据，这是真正的首次同步，保存本地指纹
            saveKeyFingerprint(localFingerprint)
            return@withContext KeyFingerprintResult(valid = true, remoteFingerprint = null)
        }

        // 验证指纹是否匹配
        val valid = remoteFingerprint == localFingerprint
        KeyFingerprintResult(valid = valid, remoteFingerprint = remoteFingerprint)
    }

    /**
     * 记录变更到变更日志 (与桌面端保持一致)
     *
     * 对应桌面端 src/core/sync/WebDAVAdapter.ts 中的 recordChange 方法
     */
    private suspend fun recordChange(item: ItemEntity) = withContext(Dispatchers.IO) {
        try {
            val change = RemoteChange(
                changeId = System.currentTimeMillis(),
                itemId = item.id,
                type = item.type,
                updatedTime = item.updatedTime,
                deletedTime = item.deletedTime,
                contentHash = item.contentHash
            )

            val changePath = "${getChangesPath()}/${change.changeId}.json"
            val content = json.encodeToString(change)

            val sardine = getSardine()
            sardine.put(changePath, content.toByteArray(), "application/json")

            android.util.Log.d("WebDAV", "Recorded change: ${change.changeId} for item ${item.id}")
        } catch (e: Exception) {
            android.util.Log.e("WebDAV", "Failed to record change for item ${item.id}: ${e.message}")
            // 不抛出异常，避免影响主流程
        }
    }

    /**
     * 从items目录扫描变更 (向后兼容旧版本)
     *
     * 用于首次同步或从旧版本升级时的回退逻辑
     */
    private suspend fun listChangesFromItems(cursor: String?, limit: Int): ChangeListResult = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val itemsPath = getItemsPath()

            if (!sardine.exists(itemsPath)) {
                android.util.Log.d("WebDAV", "Items directory does not exist")
                return@withContext ChangeListResult(emptyList(), null, false)
            }

            // 列出所有项目文件
            val resources = sardine.list(itemsPath)

            // 解析游标 (时间戳格式，用于向后兼容)
            val cursorTime = cursor?.toLongOrNull() ?: 0L
            val isFirstSync = cursorTime == 0L

            // 过滤出需要同步的文件
            val filesToSync = resources
                .filter { !it.isDirectory && it.name.endsWith(".json") }
                .filter { resource ->
                    val modified = resource.modified?.time ?: System.currentTimeMillis()
                    isFirstSync || modified >= cursorTime
                }

            android.util.Log.d("WebDAV", "[Fallback] Found ${filesToSync.size} files to sync (total: ${resources.size})")

            // 批量读取文件内容并转换为RemoteChange格式
            val changes = mutableListOf<RemoteChange>()
            for (resource in filesToSync) {
                val id = resource.name.removeSuffix(".json")
                val modified = resource.modified?.time ?: System.currentTimeMillis()

                try {
                    val item = getItem(id)
                    if (item != null) {
                        // 转换为新的RemoteChange格式
                        changes.add(RemoteChange(
                            changeId = modified,
                            itemId = item.id,
                            type = item.type,
                            updatedTime = item.updatedTime,
                            deletedTime = item.deletedTime,
                            contentHash = item.contentHash
                        ))
                    }
                } catch (e: Exception) {
                    android.util.Log.e("WebDAV", "[Fallback] Failed to get item $id: ${e.message}")
                }
            }

            // 按时间排序
            val sortedChanges = changes.sortedBy { it.changeId }
            val nextCursor = sortedChanges.lastOrNull()?.let {
                (it.changeId + 1).toString()
            }

            android.util.Log.d("WebDAV", "[Fallback] Loaded ${changes.size} items")

            ChangeListResult(
                changes = sortedChanges,
                nextCursor = nextCursor,
                hasMore = false  // 一次性返回所有
            )
        } catch (e: Exception) {
            android.util.Log.e("WebDAV", "[Fallback] Failed to list changes from items: ${e.message}")
            e.printStackTrace()
            ChangeListResult(emptyList(), null, false)
        }
    }
}

/**
 * 工作区元数据 - 与桌面端 workspace.json 格式一致
 */
@kotlinx.serialization.Serializable
private data class WorkspaceMeta(
    val version: String = "1.0",
    val capabilities: List<String> = listOf("items", "resources", "changes"),
    val last_sync_time: Long? = null,
    val key_identifier: String? = null
)
