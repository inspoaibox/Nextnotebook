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
    
    private fun getLocksPath(): String {
        val cfg = getConfig()
        return "${cfg.url}${cfg.syncPath}/locks"
    }
    
    private fun getChangesPath(): String {
        val cfg = getConfig()
        return "${cfg.url}${cfg.syncPath}/changes"
    }
    
    private fun getSyncCursorPath(): String {
        val cfg = getConfig()
        return "${cfg.url}${cfg.syncPath}/sync-cursor.json"
    }
    
    private fun getLockFilePath(): String {
        return "${getLocksPath()}/lock.json"
    }
    
    override suspend fun testConnection(): Boolean = withContext(Dispatchers.IO) {
        try {
            val cfg = getConfig()
            val sardine = getSardine()
            
            // 尝试访问同步目录
            val path = "${cfg.url}${cfg.syncPath}"
            if (!sardine.exists(path)) {
                // 创建目录结构
                sardine.createDirectory(path)
                sardine.createDirectory(getItemsPath())
                sardine.createDirectory(getResourcesPath())
                sardine.createDirectory(getLocksPath())
                sardine.createDirectory(getChangesPath())
            }
            true
        } catch (e: Exception) {
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
            
            val item = json.decodeFromString<ItemEntity>(content)
            android.util.Log.d("WebDAV", "getItem: parsed item $id, type=${item.type}")
            item
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
            
            // 返回时间戳作为版本号
            Result.success(System.currentTimeMillis().toString())
        } catch (e: Exception) {
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
            val itemsPath = getItemsPath()
            
            // 检查 items 目录是否存在
            if (!sardine.exists(itemsPath)) {
                android.util.Log.d("WebDAV", "Items directory does not exist")
                return@withContext ChangeListResult(emptyList(), null, false)
            }
            
            // 列出所有项目文件
            val resources = sardine.list(itemsPath)
            
            // 解析游标
            val cursorTime = cursor?.toLongOrNull() ?: 0L
            val isFirstSync = cursorTime == 0L
            
            // 过滤出需要同步的文件
            val filesToSync = resources
                .filter { !it.isDirectory && it.name.endsWith(".json") }
                .filter { resource ->
                    val modified = resource.modified?.time ?: System.currentTimeMillis()
                    isFirstSync || modified >= cursorTime
                }
            
            android.util.Log.d("WebDAV", "Found ${filesToSync.size} files to sync (total: ${resources.size}, cursor: $cursor)")
            
            // 批量读取文件内容
            val changes = mutableListOf<RemoteChange>()
            for (resource in filesToSync) {
                val id = resource.name.removeSuffix(".json")
                val modified = resource.modified?.time ?: System.currentTimeMillis()
                
                try {
                    val item = getItem(id)
                    if (item != null) {
                        changes.add(RemoteChange(
                            id = id,
                            type = item.type,
                            action = if (item.deletedTime != null) "delete" else "update",
                            item = item,
                            timestamp = modified
                        ))
                    }
                } catch (e: Exception) {
                    android.util.Log.e("WebDAV", "Failed to get item $id: ${e.message}")
                }
            }
            
            android.util.Log.d("WebDAV", "Successfully loaded ${changes.size} items")
            
            // 按时间排序
            val sortedChanges = changes.sortedBy { it.timestamp }
            val nextCursor = sortedChanges.lastOrNull()?.let { 
                (it.timestamp + 1).toString() 
            }
            
            ChangeListResult(
                changes = sortedChanges,
                nextCursor = nextCursor,
                hasMore = false  // 一次性返回所有
            )
        } catch (e: Exception) {
            android.util.Log.e("WebDAV", "Failed to list changes: ${e.message}")
            e.printStackTrace()
            ChangeListResult(emptyList(), null, false)
        }
    }
    
    override suspend fun acquireLock(deviceId: String, timeout: Long): Boolean = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val lockPath = getLockFilePath()
            
            android.util.Log.d("WebDAV", "Attempting to acquire lock, deviceId=$deviceId, timeout=$timeout")
            
            // 检查是否已有锁
            if (sardine.exists(lockPath)) {
                android.util.Log.d("WebDAV", "Lock file exists, checking...")
                try {
                    val inputStream = sardine.get(lockPath)
                    val content = inputStream.bufferedReader().use { it.readText() }
                    android.util.Log.d("WebDAV", "Lock file content: $content")
                    
                    // 尝试解析锁信息
                    val lockInfo = try {
                        json.decodeFromString<LockInfo>(content)
                    } catch (e: Exception) {
                        // 解析失败，可能是旧格式或损坏的锁文件，直接删除
                        android.util.Log.w("WebDAV", "Lock file parse failed, deleting: ${e.message}")
                        try {
                            sardine.delete(lockPath)
                        } catch (de: Exception) {
                            android.util.Log.e("WebDAV", "Failed to delete corrupted lock: ${de.message}")
                        }
                        null
                    }
                    
                    if (lockInfo != null) {
                        val now = System.currentTimeMillis()
                        
                        android.util.Log.d("WebDAV", "Lock info: owner=${lockInfo.owner}, acquired=${lockInfo.acquired}, expires=${lockInfo.expires}, now=$now")
                        android.util.Log.d("WebDAV", "Lock expired: ${now >= lockInfo.expires}, same device: ${lockInfo.owner == deviceId}")
                        
                        // 检查锁是否过期
                        if (now >= lockInfo.expires) {
                            // 锁已过期，删除旧锁
                            android.util.Log.d("WebDAV", "Lock expired (${(now - lockInfo.expires) / 1000}s ago), deleting old lock")
                            try {
                                sardine.delete(lockPath)
                                android.util.Log.d("WebDAV", "Expired lock deleted successfully")
                            } catch (de: Exception) {
                                android.util.Log.e("WebDAV", "Failed to delete expired lock: ${de.message}")
                                // 继续尝试创建新锁
                            }
                        } else if (lockInfo.owner != deviceId) {
                            // 锁未过期且不是同一设备
                            val remaining = lockInfo.expires - now
                            android.util.Log.d("WebDAV", "Lock held by another device (${lockInfo.owner}), remaining: ${remaining}ms")
                            
                            // 如果剩余时间很短（小于10秒），等待后重试
                            if (remaining < 10_000) {
                                android.util.Log.d("WebDAV", "Waiting ${remaining + 1000}ms for lock to expire...")
                                kotlinx.coroutines.delay(remaining + 1000)
                                // 递归重试
                                return@withContext acquireLock(deviceId, timeout)
                            }
                            
                            android.util.Log.w("WebDAV", "Cannot acquire lock - held by ${lockInfo.owner}, expires in ${remaining / 1000}s")
                            return@withContext false
                        } else {
                            // 是同一设备，可以续期
                            android.util.Log.d("WebDAV", "Lock owned by this device, will renew")
                        }
                    }
                } catch (e: Exception) {
                    // 读取锁文件失败，尝试删除
                    android.util.Log.e("WebDAV", "Failed to read lock file: ${e.message}")
                    try {
                        sardine.delete(lockPath)
                        android.util.Log.d("WebDAV", "Deleted unreadable lock file")
                    } catch (de: Exception) {
                        android.util.Log.e("WebDAV", "Failed to delete unreadable lock: ${de.message}")
                    }
                }
            } else {
                android.util.Log.d("WebDAV", "No existing lock file")
            }
            
            // 确保 locks 目录存在
            val locksPath = getLocksPath()
            if (!sardine.exists(locksPath)) {
                try {
                    sardine.createDirectory(locksPath)
                    android.util.Log.d("WebDAV", "Created locks directory")
                } catch (e: Exception) {
                    // 目录可能已存在
                    android.util.Log.d("WebDAV", "Locks directory creation: ${e.message}")
                }
            }
            
            // 创建新锁 - 使用与 PC 端相同的格式
            val lockInfo = LockInfo(
                owner = deviceId,
                acquired = System.currentTimeMillis(),
                expires = System.currentTimeMillis() + timeout
            )
            val content = json.encodeToString(lockInfo)
            android.util.Log.d("WebDAV", "Creating new lock: $content")
            sardine.put(lockPath, content.toByteArray(), "application/json")
            
            android.util.Log.d("WebDAV", "Lock acquired successfully")
            true
        } catch (e: Exception) {
            android.util.Log.e("WebDAV", "Failed to acquire lock: ${e.message}")
            e.printStackTrace()
            false
        }
    }
    
    override suspend fun releaseLock(deviceId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val lockPath = getLockFilePath()
            
            if (sardine.exists(lockPath)) {
                val inputStream = sardine.get(lockPath)
                val content = inputStream.bufferedReader().use { it.readText() }
                val lockInfo = json.decodeFromString<LockInfo>(content)
                
                // 只能释放自己的锁
                if (lockInfo.owner == deviceId) {
                    sardine.delete(lockPath)
                }
            }
            true
        } catch (e: Exception) {
            false
        }
    }
    
    override suspend fun getSyncCursor(): SyncCursor? = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val cursorPath = getSyncCursorPath()
            
            if (!sardine.exists(cursorPath)) return@withContext null
            
            val inputStream = sardine.get(cursorPath)
            val content = inputStream.bufferedReader().use { it.readText() }
            json.decodeFromString<SyncCursor>(content)
        } catch (e: Exception) {
            null
        }
    }
    
    override suspend fun setSyncCursor(cursor: SyncCursor): Boolean = withContext(Dispatchers.IO) {
        try {
            val sardine = getSardine()
            val cursorPath = getSyncCursorPath()
            val content = json.encodeToString(cursor)
            
            sardine.put(cursorPath, content.toByteArray(), "application/json")
            true
        } catch (e: Exception) {
            false
        }
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
}

/**
 * 锁信息 - 与桌面端格式一致
 */
@kotlinx.serialization.Serializable
private data class LockInfo(
    val owner: String,
    val acquired: Long,
    val expires: Long
)

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
