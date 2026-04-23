package com.mucheng.notes.data.sync

import android.content.Context
import android.content.SharedPreferences
import com.mucheng.notes.data.local.dao.ItemDao
import com.mucheng.notes.data.local.dao.ResourceCacheDao
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.data.local.entity.ResourceCacheEntity
import com.mucheng.notes.data.remote.SyncCursor
import com.mucheng.notes.data.remote.WebDAVAdapter
import com.mucheng.notes.data.remote.ServerAdapterImpl
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.SyncConfig
import com.mucheng.notes.domain.model.SyncModuleTypes
import com.mucheng.notes.domain.model.SyncResult
import com.mucheng.notes.domain.model.payload.ResourcePayload
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 同步引擎
 * 负责与 WebDAV 服务器或自建服务器同步数据（明文同步）
 */
@Singleton
class SyncEngine @Inject constructor(
    private val webDAVAdapter: WebDAVAdapter,
    private val itemDao: ItemDao,
    private val resourceCacheDao: ResourceCacheDao,
    @ApplicationContext private val context: Context
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true  // 允许更宽松的 JSON 解析
        coerceInputValues = true  // 将缺失的字段填充为默认值
    }
    
    // 资源缓存目录
    private val resourceCacheDir: File by lazy {
        File(context.cacheDir, "resources").also { 
            if (!it.exists()) it.mkdirs() 
        }
    }

    // SharedPreferences for local sync cursor storage
    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences("sync_prefs", Context.MODE_PRIVATE)
    }
    
    // 持久化的设备 ID，确保同一设备始终使用相同的 ID
    private val deviceId: String by lazy {
        val key = "device_id"
        prefs.getString(key, null) ?: run {
            val newId = UUID.randomUUID().toString()
            prefs.edit().putString(key, newId).apply()
            android.util.Log.d("SyncEngine", "Generated new device ID: $newId")
            newId
        }.also {
            android.util.Log.d("SyncEngine", "Using device ID: $it")
        }
    }

    private var config: SyncConfig? = null
    
    // 自建服务器适配器
    private var serverAdapter: ServerAdapterImpl? = null

    // ========== 本地游标管理 ==========

    /**
     * 获取本地同步游标
     */
    private fun getLocalSyncCursor(): SyncCursor? {
        val cursorJson = prefs.getString("local_sync_cursor", null) ?: return null
        return try {
            json.decodeFromString<SyncCursor>(cursorJson)
        } catch (e: Exception) {
            android.util.Log.e("SyncEngine", "Failed to parse local sync cursor: ${e.message}")
            null
        }
    }

    /**
     * 设置本地同步游标
     */
    private fun setLocalSyncCursor(cursor: SyncCursor) {
        val cursorJson = json.encodeToString(cursor)
        prefs.edit().putString("local_sync_cursor", cursorJson).apply()
        android.util.Log.d("SyncEngine", "Updated local sync cursor to: ${cursor.cursor}")
    }

    /**
     * 清除本地同步游标（用于重置同步状态）
     */
    fun clearLocalSyncCursor() {
        prefs.edit().remove("local_sync_cursor").apply()
        android.util.Log.d("SyncEngine", "Cleared local sync cursor")
    }
    
    /**
     * 设置同步配置
     */
    suspend fun setConfig(syncConfig: SyncConfig) {
        config = syncConfig
        
        if (syncConfig.type == "server") {
            // 初始化自建服务器适配器
            serverAdapter = ServerAdapterImpl().apply {
                // 设置 token 刷新回调，用于持久化新 token
                onTokenRefresh = { newToken, newRefreshToken, expiresIn ->
                    android.util.Log.d("SyncEngine", "Token refreshed, saving to preferences")
                    // 保存新 token 到 SharedPreferences（同时保存到两个位置）
                    val syncPrefs = context.getSharedPreferences("sync_config", Context.MODE_PRIVATE)
                    syncPrefs.edit()
                        .putString("server_token", newToken)
                        .putString("server_refresh_token", newRefreshToken)
                        .putLong("server_token_expires", System.currentTimeMillis() + expiresIn * 1000L)
                        .apply()
                    
                    val appPrefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)
                    appPrefs.edit()
                        .putString("server_token", newToken)
                        .putString("server_refresh_token", newRefreshToken)
                        .putLong("server_token_expires", System.currentTimeMillis() + expiresIn * 1000L)
                        .apply()
                }
                
                // 设置重新登录回调
                onReloginRequired = {
                    android.util.Log.w("SyncEngine", "Relogin required - token refresh failed")
                    // 清除保存的 token，下次同步时会提示用户重新登录
                    val syncPrefs = context.getSharedPreferences("sync_config", Context.MODE_PRIVATE)
                    syncPrefs.edit()
                        .remove("server_token")
                        .remove("server_refresh_token")
                        .remove("server_token_expires")
                        .apply()
                    
                    val appPrefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)
                    appPrefs.edit()
                        .remove("server_token")
                        .remove("server_refresh_token")
                        .remove("server_token_expires")
                        .apply()
                }
                
                // 优先从 SyncConfig 获取凭据（由 SettingsViewModel 传入）
                // 如果 SyncConfig 中有凭据，使用它们
                val username = syncConfig.serverUsername
                val password = syncConfig.serverPassword
                val syncKey = syncConfig.serverSyncKey
                
                if (!username.isNullOrBlank() && !password.isNullOrBlank() && !syncKey.isNullOrBlank()) {
                    android.util.Log.d("SyncEngine", "Using credentials from SyncConfig")
                    saveCredentials(username, password, syncKey)
                } else {
                    // 否则尝试从 SharedPreferences 读取
                    val syncPrefs = context.getSharedPreferences("sync_config", Context.MODE_PRIVATE)
                    val savedUsername = syncPrefs.getString("server_username", null)
                    val savedPassword = syncPrefs.getString("server_password", null)
                    val savedSyncKey = syncPrefs.getString("server_sync_key", null)
                    
                    if (savedUsername != null && savedPassword != null && savedSyncKey != null) {
                        android.util.Log.d("SyncEngine", "Using credentials from sync_config prefs")
                        saveCredentials(savedUsername, savedPassword, savedSyncKey)
                    } else {
                        // 最后尝试从 app_settings 读取
                        val appPrefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)
                        val appUsername = appPrefs.getString("server_username", null)
                        val appPassword = appPrefs.getString("server_password", null)
                        val appSyncKey = appPrefs.getString("server_sync_key", null)
                        
                        if (appUsername != null && appPassword != null && appSyncKey != null) {
                            android.util.Log.d("SyncEngine", "Using credentials from app_settings prefs")
                            saveCredentials(appUsername, appPassword, appSyncKey)
                        } else {
                            android.util.Log.w("SyncEngine", "No credentials found for auto-relogin")
                        }
                    }
                }
                
                // 初始化（会自动检查并刷新过期的 token）
                initialize(syncConfig)
            }
            android.util.Log.d("SyncEngine", "Initialized server adapter for self-hosted server sync")
        } else {
            // 初始化 WebDAV 适配器
            serverAdapter = null
            if (webDAVAdapter is com.mucheng.notes.data.remote.WebDAVAdapterImpl) {
                webDAVAdapter.initialize(syncConfig)
            }
            android.util.Log.d("SyncEngine", "Initialized WebDAV adapter")
        }
    }
    
    /**
     * 获取当前使用的适配器
     */
    private fun getAdapter(): WebDAVAdapter {
        val cfg = config ?: throw IllegalStateException("Sync not configured")
        return if (cfg.type == "server") {
            serverAdapter ?: throw IllegalStateException("Server adapter not initialized")
        } else {
            webDAVAdapter
        }
    }
    
    /**
     * 执行同步（明文同步，不再需要加密）
     */
    suspend fun sync(): SyncResult = withContext(Dispatchers.IO) {
        val cfg = config ?: return@withContext SyncResult(error = "同步未配置")
        
        if (!cfg.enabled) {
            return@withContext SyncResult(error = "同步已禁用")
        }

        android.util.Log.d("SyncEngine", "Sync mode: plain text (encryption removed)")
        
        val startTime = System.currentTimeMillis()
        var pushed = 0
        var pulled = 0
        var conflicts = 0
        
        try {
            android.util.Log.d("SyncEngine", "Starting sync...")
            
            // 1. Push 本地变更
            val pushResult = pushChanges(cfg)
            pushed = pushResult.count
            
            // 2. Pull 远端变更
            val pullResult = pullChanges(cfg)
            pulled = pullResult.count
            conflicts = pullResult.conflicts
            
            android.util.Log.d("SyncEngine", "Sync completed: pushed=$pushed, pulled=$pulled, conflicts=$conflicts")
            
            SyncResult(
                success = true,
                pushed = pushed,
                pulled = pulled,
                conflicts = conflicts,
                duration = System.currentTimeMillis() - startTime
            )
        } catch (e: Exception) {
            android.util.Log.e("SyncEngine", "Sync failed: ${e.message}")
            e.printStackTrace()
            SyncResult(
                error = e.message ?: "同步失败",
                duration = System.currentTimeMillis() - startTime
            )
        }
    }
    
    /**
     * 推送本地变更到远端（明文同步）
     */
    private suspend fun pushChanges(cfg: SyncConfig): PushResult {
        val adapter = getAdapter()
        val enabledTypes = SyncModuleTypes.getEnabledTypes(cfg.syncModules)
        val pendingItems = itemDao.getPendingSync()
            .filter { it.type in enabledTypes }
        
        var count = 0
        for (item in pendingItems) {
            // 明文同步：确保 encryptionApplied = 0
            val itemToUpload = item.copy(encryptionApplied = 0)
            
            if (item.syncStatus == "deleted") {
                // 删除远端项目
                if (adapter.deleteItem(item.id)) {
                    // 如果是资源类型，同时删除远端资源文件
                    if (item.type == "resource") {
                        try {
                            val payload = json.decodeFromString<ResourcePayload>(item.payload)
                            val ext = getExtensionFromFilename(payload.filename)
                            adapter.deleteResource("${item.id}$ext")
                        } catch (e: Exception) {
                            android.util.Log.w("SyncEngine", "Failed to delete remote resource file: ${e.message}")
                        }
                    }
                    itemDao.hardDelete(item.id)
                    count++
                }
            } else {
                // 上传项目
                val result = adapter.putItem(itemToUpload)
                if (result.isSuccess) {
                    // 如果是资源类型，同时上传资源文件
                    if (item.type == "resource") {
                        try {
                            val payload = json.decodeFromString<ResourcePayload>(item.payload)
                            val ext = getExtensionFromFilename(payload.filename)
                            val resourceId = "${item.id}$ext"
                            
                            // 从本地缓存获取文件
                            val cache = resourceCacheDao.getByResourceId(item.id)
                            if (cache != null) {
                                val localFile = File(cache.localPath)
                                if (localFile.exists()) {
                                    val data = localFile.readBytes()
                                    val uploadResult = adapter.uploadResource(resourceId, data)
                                    if (uploadResult.isSuccess) {
                                        android.util.Log.d("SyncEngine", "Uploaded resource file: $resourceId")
                                    } else {
                                        android.util.Log.w("SyncEngine", "Failed to upload resource file: $resourceId")
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            android.util.Log.w("SyncEngine", "Failed to upload resource file: ${e.message}")
                        }
                    }
                    
                    itemDao.markSynced(item.id, result.getOrThrow())
                    count++
                }
            }
        }
        
        return PushResult(count)
    }
    
    /**
     * 从文件名获取扩展名
     */
    private fun getExtensionFromFilename(filename: String): String {
        val lastDot = filename.lastIndexOf('.')
        return if (lastDot > 0) filename.substring(lastDot) else ""
    }
    
    /**
     * 拉取远端变更到本地（明文同步）
     */
    private suspend fun pullChanges(cfg: SyncConfig): PullResult {
        val adapter = getAdapter()
        val enabledTypes = SyncModuleTypes.getEnabledTypes(cfg.syncModules)

        // ✅ 从本地 SharedPreferences 获取游标（每个设备独立维护）
        val localCursor = getLocalSyncCursor()

        // 检查本地是否有数据
        val localItemCount = itemDao.getAll().size
        val isLocalEmpty = localItemCount == 0

        // 如果本地游标为空或本地数据为空，视为首次同步
        val cursor = if (localCursor == null || isLocalEmpty) {
            android.util.Log.d("SyncEngine", "First sync detected: localCursor=$localCursor, localItemCount=$localItemCount")
            null
        } else {
            android.util.Log.d("SyncEngine", "Incremental sync: localCursor=${localCursor.cursor}")
            localCursor.cursor
        }
        
        var count = 0
        var conflicts = 0
        
        android.util.Log.d("SyncEngine", "Starting pull, cursor=$cursor, isFirstSync=${cursor == null}, enabledTypes=$enabledTypes")

        // ✅ 触发全量拉取的两种情况：
        // 1. 游标为 null（新客户端首次同步）
        // 2. 游标已过期（长时间离线，变更日志已被清理）
        val cursorExpired = if (cursor != null) {
            try { adapter.isCursorExpired(cursor) } catch (e: Exception) { false }
        } else false

        if ((cursor == null || cursorExpired)) {
            val remoteHasData = try { adapter.hasData() } catch (e: Exception) { false }

            if (remoteHasData) {
                if (cursorExpired) {
                    android.util.Log.d("SyncEngine", "Cursor expired — falling back to full pull")
                    clearLocalSyncCursor()
                } else {
                    android.util.Log.d("SyncEngine", "No cursor and remote has data — performing full pull")
                }

                val allItems = adapter.listAllItems()
                val filteredItems = allItems.filter { it.type in enabledTypes }
                android.util.Log.d("SyncEngine", "Full pull: ${filteredItems.size} items (filtered from ${allItems.size})")

                for (remoteItem in filteredItems) {
                    try {
                        // 跳过已删除的 item
                        if (remoteItem.deletedTime != null) {
                            val localItem = itemDao.getById(remoteItem.id)
                            if (localItem != null) {
                                itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
                            }
                            continue
                        }

                        val localItem = itemDao.getById(remoteItem.id)

                        if (localItem == null) {
                            // 本地没有，直接创建
                            itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
                            count++
                        } else if (localItem.contentHash != remoteItem.contentHash) {
                            // 内容不同，检查冲突
                            if (localItem.syncStatus == "modified") {
                                val conflictItem = createConflictCopy(localItem)
                                itemDao.upsert(conflictItem)
                                itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
                                conflicts++
                            } else {
                                itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
                            }
                            count++
                        }
                        // 内容相同则跳过

                        // 如果是资源类型，下载资源文件
                        if (remoteItem.type == "resource") {
                            try {
                                val payload = json.decodeFromString<ResourcePayload>(remoteItem.payload)
                                val ext = getExtensionFromFilename(payload.filename)
                                val resourceId = "${remoteItem.id}$ext"
                                val downloadResult = adapter.downloadResource(resourceId)
                                if (downloadResult.isSuccess) {
                                    val data = downloadResult.getOrThrow()
                                    val cacheFile = File(resourceCacheDir, resourceId)
                                    cacheFile.writeBytes(data)
                                    val now = System.currentTimeMillis()
                                    resourceCacheDao.upsert(
                                        ResourceCacheEntity(
                                            resourceId = remoteItem.id,
                                            localPath = cacheFile.absolutePath,
                                            downloadedAt = now,
                                            lastAccessedAt = now
                                        )
                                    )
                                }
                            } catch (e: Exception) {
                                android.util.Log.w("SyncEngine", "Failed to download resource: ${e.message}")
                            }
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("SyncEngine", "Error processing full pull item ${remoteItem.id}: ${e.message}")
                    }
                }

                // ✅ 全量拉取完成后，设置游标
                // 自建服务器：用 latestChangeId；WebDAV：用时间戳
                // 注意：latestChangeId 可能为 0（changes 表为空），此时用 "0" 作为游标
                // 这样下次增量同步 WHERE change_id > 0 能正确拉取到所有后续变更
                val lastChangeId = adapter.getLastFullPullChangeId()
                val newCursor = when {
                    lastChangeId != null && lastChangeId > 0 -> lastChangeId.toString()
                    lastChangeId != null && lastChangeId == 0L -> "0"  // changes 表为空，用 "0" 作为起始游标
                    else -> "0"  // WebDAV 或无法获取 changeId 时，用 "0" 保证增量同步能正常工作
                }
                setLocalSyncCursor(SyncCursor(newCursor, System.currentTimeMillis()))
                android.util.Log.d("SyncEngine", "Full pull complete: count=$count, conflicts=$conflicts, cursor set to $newCursor")

                return PullResult(count, conflicts)
            }
        }

        // ✅ 增量同步：有游标时走变更日志路径
        var nextCursor = cursor
        
        do {
            val result = adapter.listChanges(nextCursor)
            android.util.Log.d("SyncEngine", "Got ${result.changes.size} changes, hasMore=${result.hasMore}")

            for (change in result.changes) {
                if (change.type !in enabledTypes) continue

                val remoteItem = adapter.getItem(change.itemId)
                if (remoteItem == null) {
                    android.util.Log.w("SyncEngine", "Remote item ${change.itemId} not found, skipping")
                    continue
                }

                val localItem = itemDao.getById(remoteItem.id)

                if (localItem != null && localItem.syncStatus == "clean") {
                    val hashMatches = localItem.contentHash == change.contentHash
                    val deletedStatusMatches = (localItem.deletedTime == null) == (remoteItem.deletedTime == null)
                    if (hashMatches && deletedStatusMatches) continue
                }

                if (localItem != null && localItem.syncStatus == "modified") {
                    val conflictItem = createConflictCopy(localItem)
                    itemDao.upsert(conflictItem)
                    itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
                    count++
                    conflicts++
                    continue
                }

                // 如果是资源类型，下载资源文件
                if (remoteItem.type == "resource") {
                    try {
                        val payload = json.decodeFromString<ResourcePayload>(remoteItem.payload)
                        val ext = getExtensionFromFilename(payload.filename)
                        val resourceId = "${remoteItem.id}$ext"
                        val downloadResult = adapter.downloadResource(resourceId)
                        if (downloadResult.isSuccess) {
                            val data = downloadResult.getOrThrow()
                            val cacheFile = File(resourceCacheDir, resourceId)
                            cacheFile.writeBytes(data)
                            val now = System.currentTimeMillis()
                            resourceCacheDao.upsert(
                                ResourceCacheEntity(
                                    resourceId = remoteItem.id,
                                    localPath = cacheFile.absolutePath,
                                    downloadedAt = now,
                                    lastAccessedAt = now
                                )
                            )
                        }
                    } catch (e: Exception) {
                        android.util.Log.w("SyncEngine", "Failed to download resource: ${e.message}")
                    }
                }

                itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
                count++
            }

            nextCursor = result.nextCursor
        } while (result.hasMore && nextCursor != null)

        // ✅ 更新本地同步游标
        if (nextCursor != null) {
            setLocalSyncCursor(SyncCursor(nextCursor, System.currentTimeMillis()))
        }

        android.util.Log.d("SyncEngine", "Pull completed: count=$count, conflicts=$conflicts")
        return PullResult(count, conflicts)
    }
    
    /**
     * 创建冲突副本
     */
    private fun createConflictCopy(item: ItemEntity): ItemEntity {
        // 修改 payload 添加冲突后缀
        val modifiedPayload = addConflictSuffixToPayload(item.payload, item.type)
        
        return item.copy(
            id = UUID.randomUUID().toString(),
            payload = modifiedPayload,
            syncStatus = "modified",
            localRev = 1,
            remoteRev = null
        )
    }
    
    /**
     * 为 payload 添加冲突后缀
     */
    private fun addConflictSuffixToPayload(payload: String, type: String): String {
        val suffix = " (冲突副本)"
        return try {
            val jsonElement = json.parseToJsonElement(payload)
            val mutableMap = jsonElement.jsonObject.toMutableMap()
            
            // 根据类型确定标题字段
            val titleField = when (type) {
                "note", "folder", "tag", "bookmark_folder", "vault_folder", 
                "ai_conversation" -> "title"
                "bookmark" -> "title"
                "vault_entry" -> "name"
                "todo" -> "title"
                "diagram" -> "title"
                "ai_config" -> "name"
                else -> "title"
            }
            
            // 修改标题字段
            val currentTitle = mutableMap[titleField]?.let { element ->
                if (element is JsonPrimitive && element.isString) {
                    element.content
                } else ""
            } ?: ""
            
            mutableMap[titleField] = JsonPrimitive(currentTitle + suffix)
            
            json.encodeToString(JsonObject.serializer(), JsonObject(mutableMap))
        } catch (e: Exception) {
            // 解析失败，返回原始 payload
            payload
        }
    }

}

private data class PushResult(val count: Int)
private data class PullResult(val count: Int, val conflicts: Int)
