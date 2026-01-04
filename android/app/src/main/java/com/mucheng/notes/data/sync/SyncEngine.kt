package com.mucheng.notes.data.sync

import com.mucheng.notes.data.local.dao.ItemDao
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.data.remote.SyncCursor
import com.mucheng.notes.data.remote.WebDAVAdapter
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.SyncConfig
import com.mucheng.notes.domain.model.SyncModuleTypes
import com.mucheng.notes.domain.model.SyncResult
import com.mucheng.notes.security.CryptoEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 同步引擎
 * 负责与 WebDAV 服务器同步数据
 */
@Singleton
class SyncEngine @Inject constructor(
    private val webDAVAdapter: WebDAVAdapter,
    private val itemDao: ItemDao,
    private val cryptoEngine: CryptoEngine
) {
    private val deviceId = UUID.randomUUID().toString()
    private val json = Json { 
        ignoreUnknownKeys = true 
        encodeDefaults = true
        isLenient = true  // 允许更宽松的 JSON 解析
    }
    
    private var config: SyncConfig? = null
    
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
     * 执行同步
     */
    suspend fun sync(): SyncResult = withContext(Dispatchers.IO) {
        val cfg = config ?: return@withContext SyncResult(error = "同步未配置")
        
        if (!cfg.enabled) {
            return@withContext SyncResult(error = "同步已禁用")
        }
        
        // 确保加密引擎已初始化主密钥
        // 即使用户没有启用全局加密，也需要密钥来解密敏感数据（vault_entry, vault_folder, ai_config）
        // 这些敏感数据在桌面端始终会被加密
        if (!cryptoEngine.hasMasterKey()) {
            android.util.Log.d("SyncEngine", "Master key not set, initializing with default key")
            // 使用默认密钥（与桌面端保持一致）
            cryptoEngine.initMasterKey("mucheng-default-vault-key-2024")
        }
        
        val startTime = System.currentTimeMillis()
        var pushed = 0
        var pulled = 0
        var conflicts = 0
        var decryptionFailed = 0
        
        try {
            // 1. 获取锁（超时时间 2 分钟）
            android.util.Log.d("SyncEngine", "Attempting to acquire lock...")
            val lockAcquired = webDAVAdapter.acquireLock(deviceId, 120_000)
            if (!lockAcquired) {
                android.util.Log.e("SyncEngine", "Failed to acquire lock")
                return@withContext SyncResult(error = "无法获取同步锁，可能有其他设备正在同步")
            }
            android.util.Log.d("SyncEngine", "Lock acquired successfully")
            
            try {
                // 2. 验证密钥（如果启用加密）
                if (cfg.encryptionEnabled) {
                    val (keyValid, keyError) = verifyEncryptionKey()
                    if (!keyValid) {
                        return@withContext SyncResult(error = keyError ?: "密钥验证失败")
                    }
                }
                
                // 3. Push 本地变更
                val pushResult = pushChanges(cfg)
                pushed = pushResult.count
                
                // 4. Pull 远端变更
                val pullResult = pullChanges(cfg)
                pulled = pullResult.count
                conflicts = pullResult.conflicts
                decryptionFailed = pullResult.decryptionFailed
                
            } finally {
                // 5. 释放锁
                webDAVAdapter.releaseLock(deviceId)
            }
            
            SyncResult(
                success = true,
                pushed = pushed,
                pulled = pulled,
                conflicts = conflicts,
                decryptionFailed = decryptionFailed,
                duration = System.currentTimeMillis() - startTime
            )
        } catch (e: Exception) {
            SyncResult(
                error = e.message ?: "同步失败",
                duration = System.currentTimeMillis() - startTime
            )
        }
    }
    
    /**
     * 推送本地变更到远端
     */
    private suspend fun pushChanges(cfg: SyncConfig): PushResult {
        val enabledTypes = SyncModuleTypes.getEnabledTypes(cfg.syncModules)
        val pendingItems = itemDao.getPendingSync()
            .filter { it.type in enabledTypes }
        
        var count = 0
        for (item in pendingItems) {
            val itemToUpload = prepareForUpload(item, cfg)
            
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
     * 拉取远端变更到本地
     */
    private suspend fun pullChanges(cfg: SyncConfig): PullResult {
        val enabledTypes = SyncModuleTypes.getEnabledTypes(cfg.syncModules)
        
        // 首次同步时使用 null 游标，获取所有文件
        // 后续同步时从 WebDAV 服务器读取游标
        val serverCursor = webDAVAdapter.getSyncCursor()
        // 如果服务器游标为空或时间戳为 0，视为首次同步
        val cursor = if (serverCursor == null || serverCursor.timestamp == 0L) null else serverCursor.cursor
        
        var count = 0
        var conflicts = 0
        var decryptionFailed = 0
        var nextCursor = cursor
        
        android.util.Log.d("SyncEngine", "Starting pull, cursor=$cursor, isFirstSync=${cursor == null}, enabledTypes=$enabledTypes")
        android.util.Log.d("SyncEngine", "SyncModules: notes=${cfg.syncModules.notes}, bookmarks=${cfg.syncModules.bookmarks}, vault=${cfg.syncModules.vault}")
        
        do {
            val result = webDAVAdapter.listChanges(nextCursor)
            android.util.Log.d("SyncEngine", "Got ${result.changes.size} changes, hasMore=${result.hasMore}")
            
            // 打印所有变更的类型，帮助调试
            result.changes.forEach { change ->
                android.util.Log.d("SyncEngine", "Change available: id=${change.id}, type=${change.type}, inEnabled=${change.type in enabledTypes}")
            }
            
            for (change in result.changes) {
                if (change.type !in enabledTypes) {
                    android.util.Log.d("SyncEngine", "Skipping change ${change.id}, type ${change.type} not enabled")
                    continue
                }
                
                val remoteItem = change.item
                if (remoteItem == null) {
                    android.util.Log.w("SyncEngine", "Change ${change.id} has no item data")
                    continue
                }
                
                val localItem = itemDao.getById(remoteItem.id)
                android.util.Log.d("SyncEngine", "Processing change: id=${remoteItem.id}, type=${remoteItem.type}, localExists=${localItem != null}, localStatus=${localItem?.syncStatus}")
                
                if (localItem == null) {
                    // 本地不存在，直接插入
                    val decryptedItem = prepareForLocal(remoteItem, cfg)
                    if (decryptedItem == null) {
                        android.util.Log.e("SyncEngine", "Failed to decrypt new item ${remoteItem.id}, skipping")
                        decryptionFailed++
                        continue
                    }
                    itemDao.upsert(decryptedItem.copy(syncStatus = "clean"))
                    android.util.Log.d("SyncEngine", "Inserted new item: ${remoteItem.id}")
                    count++
                } else if (localItem.syncStatus == "clean") {
                    // 本地未修改，检查内容是否有变化
                    if (localItem.contentHash != remoteItem.contentHash) {
                        // 内容有变化，更新
                        val decryptedItem = prepareForLocal(remoteItem, cfg)
                        if (decryptedItem == null) {
                            android.util.Log.e("SyncEngine", "Failed to decrypt updated item ${remoteItem.id}, skipping")
                            decryptionFailed++
                            continue
                        }
                        itemDao.upsert(decryptedItem.copy(syncStatus = "clean"))
                        android.util.Log.d("SyncEngine", "Updated existing item: ${remoteItem.id}")
                        count++
                    } else {
                        android.util.Log.d("SyncEngine", "Skipping unchanged item: ${remoteItem.id}")
                    }
                } else {
                    // 冲突处理：创建冲突副本
                    android.util.Log.d("SyncEngine", "Conflict detected for item: ${remoteItem.id}")
                    val conflictItem = createConflictCopy(localItem)
                    itemDao.upsert(conflictItem)
                    
                    val decryptedItem = prepareForLocal(remoteItem, cfg)
                    if (decryptedItem == null) {
                        android.util.Log.e("SyncEngine", "Failed to decrypt conflicting item ${remoteItem.id}, skipping")
                        decryptionFailed++
                        continue
                    }
                    itemDao.upsert(decryptedItem.copy(syncStatus = "clean"))
                    
                    count++
                    conflicts++
                }
            }
            
            nextCursor = result.nextCursor
        } while (result.hasMore && nextCursor != null)
        
        // 更新同步游标
        if (nextCursor != null) {
            webDAVAdapter.setSyncCursor(SyncCursor(nextCursor, System.currentTimeMillis()))
        }
        
        android.util.Log.d("SyncEngine", "Pull completed: count=$count, conflicts=$conflicts, decryptionFailed=$decryptionFailed")
        return PullResult(count, conflicts, decryptionFailed)
    }
    
    /**
     * 准备上传的项目（加密处理）
     */
    private fun prepareForUpload(item: ItemEntity, cfg: SyncConfig): ItemEntity {
        val isSensitive = ItemType.SENSITIVE_TYPES.any { it.value == item.type }
        val shouldEncrypt = (cfg.encryptionEnabled || isSensitive) && cryptoEngine.hasMasterKey()
        
        return if (shouldEncrypt) {
            item.copy(
                payload = cryptoEngine.encryptPayload(item.payload),
                encryptionApplied = 1
            )
        } else {
            item.copy(encryptionApplied = 0)
        }
    }
    
    /**
     * 准备本地存储的项目（解密处理）
     * 
     * @return 解密后的项目，如果解密失败返回 null
     */
    private fun prepareForLocal(item: ItemEntity, cfg: SyncConfig): ItemEntity? {
        android.util.Log.d("SyncEngine", "prepareForLocal: id=${item.id}, type=${item.type}, encryptionApplied=${item.encryptionApplied}")
        android.util.Log.d("SyncEngine", "prepareForLocal: hasMasterKey=${cryptoEngine.hasMasterKey()}")
        android.util.Log.d("SyncEngine", "prepareForLocal: payload preview: ${item.payload.take(200)}...")
        
        if (item.encryptionApplied == 1) {
            if (!cryptoEngine.hasMasterKey()) {
                android.util.Log.e("SyncEngine", "Item ${item.id} is encrypted but no master key available")
                // 返回 null 表示无法处理此项目
                return null
            }
            
            return try {
                val decryptedPayload = cryptoEngine.decryptPayload(item.payload)
                android.util.Log.d("SyncEngine", "Successfully decrypted item ${item.id}, type=${item.type}")
                android.util.Log.d("SyncEngine", "Decrypted payload preview: ${decryptedPayload.take(200)}...")
                item.copy(
                    payload = decryptedPayload,
                    encryptionApplied = 0
                )
            } catch (e: Exception) {
                // 解密失败，记录详细错误
                android.util.Log.e("SyncEngine", "Failed to decrypt item ${item.id}, type=${item.type}: ${e.message}")
                android.util.Log.e("SyncEngine", "Encrypted payload preview: ${item.payload.take(200)}...")
                android.util.Log.e("SyncEngine", "This usually means the encryption key doesn't match. Please ensure the same key is used on all devices.")
                e.printStackTrace()
                // 返回 null 表示解密失败
                null
            }
        } else {
            android.util.Log.d("SyncEngine", "Item ${item.id} is not encrypted, using as-is")
            return item
        }
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
    
    /**
     * 验证加密密钥
     * 
     * 逻辑：
     * 1. 检查远端 WebDAV 同步目录是否有数据
     * 2. 如果远端没有数据，这是真正的首次同步，上传本地的 key_identifier
     * 3. 如果远端有数据，检查是否有 key_identifier
     *    - 没有 key_identifier：旧版本数据或未加密数据，允许同步
     *    - 有 key_identifier：必须与本地密钥匹配
     * 
     * @return Pair<Boolean, String?> - (是否验证通过, 错误信息)
     */
    private suspend fun verifyEncryptionKey(): Pair<Boolean, String?> {
        if (!cryptoEngine.hasMasterKey()) {
            return Pair(false, "未设置加密密钥")
        }
        
        return try {
            // 检查远端 WebDAV 是否有数据
            val hasRemoteData = webDAVAdapter.hasData()
            
            if (!hasRemoteData) {
                // 远端没有数据，真正的首次同步
                // 上传本地的 key_identifier，允许同步
                val localKeyId = cryptoEngine.getKeyIdentifier()
                webDAVAdapter.setKeyIdentifier(localKeyId)
                return Pair(true, null)
            }
            
            // 远端有数据，检查 key_identifier
            val remoteKeyId = webDAVAdapter.getKeyIdentifier()
            
            if (remoteKeyId == null) {
                // 远端有数据但没有 key_identifier
                // 可能是旧版本数据或未加密数据，允许同步并设置 key_identifier
                val localKeyId = cryptoEngine.getKeyIdentifier()
                webDAVAdapter.setKeyIdentifier(localKeyId)
                return Pair(true, null)
            }
            
            // 远端有 key_identifier，必须与本地匹配
            val localKeyId = cryptoEngine.getKeyIdentifier()
            if (remoteKeyId == localKeyId) {
                return Pair(true, null)
            }
            
            // 密钥不匹配
            Pair(false, "同步密钥不匹配，请确保与电脑端使用相同的加密密钥")
        } catch (e: Exception) {
            // 验证过程出错
            Pair(false, "密钥验证失败: ${e.message}")
        }
    }
}

private data class PushResult(val count: Int)
private data class PullResult(val count: Int, val conflicts: Int, val decryptionFailed: Int)
