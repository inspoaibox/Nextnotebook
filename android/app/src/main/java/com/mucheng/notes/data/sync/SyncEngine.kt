package com.mucheng.notes.data.sync

import android.content.Context
import android.content.SharedPreferences
import com.mucheng.notes.data.local.dao.ItemDao
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.data.remote.SyncCursor
import com.mucheng.notes.data.remote.WebDAVAdapter
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.SyncConfig
import com.mucheng.notes.domain.model.SyncModuleTypes
import com.mucheng.notes.domain.model.SyncResult
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 同步引擎
 * 负责与 WebDAV 服务器同步数据（明文同步）
 */
@Singleton
class SyncEngine @Inject constructor(
    private val webDAVAdapter: WebDAVAdapter,
    private val itemDao: ItemDao,
    @ApplicationContext private val context: Context
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true  // 允许更宽松的 JSON 解析
        coerceInputValues = true  // 将缺失的字段填充为默认值
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
    fun setConfig(syncConfig: SyncConfig) {
        config = syncConfig
        // 初始化 WebDAV 适配器
        if (webDAVAdapter is com.mucheng.notes.data.remote.WebDAVAdapterImpl) {
            webDAVAdapter.initialize(syncConfig)
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
        val enabledTypes = SyncModuleTypes.getEnabledTypes(cfg.syncModules)
        val pendingItems = itemDao.getPendingSync()
            .filter { it.type in enabledTypes }
        
        var count = 0
        for (item in pendingItems) {
            // 明文同步：确保 encryptionApplied = 0
            val itemToUpload = item.copy(encryptionApplied = 0)
            
            if (item.syncStatus == "deleted") {
                // 删除远端项目
                if (webDAVAdapter.deleteItem(item.id)) {
                    itemDao.hardDelete(item.id)
                    count++
                }
            } else {
                // 上传项目
                val result = webDAVAdapter.putItem(itemToUpload)
                if (result.isSuccess) {
                    itemDao.markSynced(item.id, result.getOrThrow())
                    count++
                }
            }
        }
        
        return PushResult(count)
    }
    
    /**
     * 拉取远端变更到本地（明文同步）
     */
    private suspend fun pullChanges(cfg: SyncConfig): PullResult {
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
        var nextCursor = cursor
        
        android.util.Log.d("SyncEngine", "Starting pull, cursor=$cursor, isFirstSync=${cursor == null}, enabledTypes=$enabledTypes")
        android.util.Log.d("SyncEngine", "SyncModules: notes=${cfg.syncModules.notes}, bookmarks=${cfg.syncModules.bookmarks}, vault=${cfg.syncModules.vault}")
        
        do {
            val result = webDAVAdapter.listChanges(nextCursor)
            android.util.Log.d("SyncEngine", "Got ${result.changes.size} changes, hasMore=${result.hasMore}")

            // 打印所有变更的类型，帮助调试
            result.changes.forEach { change ->
                android.util.Log.d("SyncEngine", "Change available: itemId=${change.itemId}, type=${change.type}, inEnabled=${change.type in enabledTypes}")
            }

            for (change in result.changes) {
                if (change.type !in enabledTypes) {
                    android.util.Log.d("SyncEngine", "Skipping change ${change.itemId}, type ${change.type} not enabled")
                    continue
                }

                // 从WebDAV获取完整的item数据 (与桌面端逻辑一致)
                val remoteItem = webDAVAdapter.getItem(change.itemId)
                if (remoteItem == null) {
                    android.util.Log.w("SyncEngine", "Remote item ${change.itemId} not found, skipping")
                    continue
                }

                val localItem = itemDao.getById(remoteItem.id)
                android.util.Log.d("SyncEngine", "Processing change: id=${remoteItem.id}, type=${remoteItem.type}, localExists=${localItem != null}, localStatus=${localItem?.syncStatus}")

                // 检查是否是自己刚上传的 (与桌面端逻辑一致)
                if (localItem != null && localItem.syncStatus == "clean") {
                    // 检查内容哈希是否一致，一致则跳过
                    if (localItem.contentHash == change.contentHash) {
                        android.util.Log.d("SyncEngine", "Skipping own upload: ${remoteItem.id}")
                        continue
                    }
                    // 哈希不同但本地是 clean 状态，说明远端有更新，继续处理
                }

                // 检查是否有冲突
                if (localItem != null && localItem.syncStatus == "modified") {
                    // 本地也有修改，产生冲突
                    android.util.Log.d("SyncEngine", "Conflict detected for item: ${remoteItem.id}")
                    val conflictItem = createConflictCopy(localItem)
                    itemDao.upsert(conflictItem)
                    itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
                    count++
                    conflicts++
                    continue
                }

                // 直接使用远端数据（明文同步，不需要解密）
                // 写入本地
                itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
                android.util.Log.d("SyncEngine", if (localItem == null) "Inserted new item: ${remoteItem.id}" else "Updated existing item: ${remoteItem.id}")
                count++
            }

            nextCursor = result.nextCursor
        } while (result.hasMore && nextCursor != null)

        // ✅ 更新本地同步游标（保存到 SharedPreferences，不再保存到 WebDAV）
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
