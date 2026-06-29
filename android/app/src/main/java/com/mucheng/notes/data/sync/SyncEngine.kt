package com.mucheng.notes.data.sync

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import com.mucheng.notes.data.cloud.CloudDriveConfigStore
import com.mucheng.notes.data.cloud.CloudDriveDirectoryScanner
import com.mucheng.notes.data.cloud.CloudDriveDownloadManager
import com.mucheng.notes.data.cloud.CloudDriveFolderPicker
import com.mucheng.notes.data.cloud.CloudDrivePathIdentity
import com.mucheng.notes.data.cloud.CloudDriveUploadManager
import com.mucheng.notes.data.local.dao.CloudFileLocalPathDao
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
import com.mucheng.notes.domain.model.SyncModules
import com.mucheng.notes.domain.model.SyncResult
import com.mucheng.notes.domain.model.payload.CloudFilePayload
import com.mucheng.notes.domain.model.payload.CloudFolderPayload
import com.mucheng.notes.domain.model.payload.ResourcePayload
import com.mucheng.notes.security.SecureSyncStorage
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
    private val cloudDriveDownloadManager: CloudDriveDownloadManager,
    private val cloudDriveUploadManager: CloudDriveUploadManager,
    private val cloudDriveConfigStore: CloudDriveConfigStore,
    private val cloudDriveDirectoryScanner: CloudDriveDirectoryScanner,
    private val cloudDriveFolderPicker: CloudDriveFolderPicker,
    private val cloudFileLocalPathDao: CloudFileLocalPathDao,
    @ApplicationContext private val context: Context
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true  // 允许更宽松的 JSON 解析
        coerceInputValues = true  // 将缺失的字段填充为默认值
    }

    /**
     * 冲突副本后缀。用于：
     * - addConflictSuffixToPayload 给显示名/relativePath 加后缀
     * - isStaleOrphanConflictCopy 识别陈旧孤儿副本（避免对 path-derived id 做正则误判）
     * - isLocalStaleConflictCopy 在 pull 阶段去重，防止冲突副本自我繁殖
     *
     * 必须与桌面端 CONFLICT_SUFFIX 保持一致。
     */
    private val CONFLICT_SUFFIX = " (冲突副本)"

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
                    val expiresAt = System.currentTimeMillis() + expiresIn * 1000L
                    SecureSyncStorage.putString(context, "server_token", newToken)
                    SecureSyncStorage.putString(context, "server_refresh_token", newRefreshToken)
                    SecureSyncStorage.putLong(context, "server_token_expires", expiresAt)
                }
                
                // 设置重新登录回调
                onReloginRequired = {
                    android.util.Log.w("SyncEngine", "Relogin required - token refresh failed")
                    SecureSyncStorage.remove(
                        context,
                        "server_token",
                        "server_refresh_token",
                        "server_token_expires"
                    )
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
                    // 否则尝试从安全存储读取
                    val syncPrefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)
                    val savedUsername = syncPrefs.getString("server_username", null)
                    val savedPassword = SecureSyncStorage.getString(context, "server_password")
                    val savedSyncKey = SecureSyncStorage.getString(context, "server_sync_key")
                    
                    if (savedUsername != null && savedPassword != null && savedSyncKey != null) {
                        android.util.Log.d("SyncEngine", "Using credentials from secure storage")
                        saveCredentials(savedUsername, savedPassword, savedSyncKey)
                    } else {
                        android.util.Log.w("SyncEngine", "No credentials found for auto-relogin")
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
        val errors = mutableListOf<String>()
        
        try {
            android.util.Log.d("SyncEngine", "Starting sync...")

            if (cfg.type == "server" && cfg.syncModules.cloudDrive) {
                pulled += backfillCloudDriveMetadata(cfg)

                val scanResult = cloudDriveDirectoryScanner.scanAndReconcile()
                if (scanResult.error != null) {
                    android.util.Log.w("SyncEngine", "Cloud drive scan skipped/failed: ${scanResult.error}")
                } else if (scanResult.changed > 0) {
                    android.util.Log.d(
                        "SyncEngine",
                        "Cloud drive scan reconciled: files=${scanResult.scannedFiles}, " +
                            "folders=${scanResult.scannedFolders}, changed=${scanResult.changed}, " +
                            "deleted=${scanResult.deleted}, skipped=${scanResult.skipped}"
                    )
                }
            }
            
            // 1. Push 本地变更
            val pushResult = pushChanges(cfg)
            pushed += pushResult.count
            errors.addAll(pushResult.errors)
            
            // 2. Pull 远端变更
            val pullResult = pullChanges(cfg)
            pulled += pullResult.count
            conflicts = pullResult.conflicts

            if (cfg.type == "server" && cfg.syncModules.cloudDrive) {
                pulled += backfillCloudDriveMetadata(cfg)
            }
            
            android.util.Log.d("SyncEngine", "Sync completed: pushed=$pushed, pulled=$pulled, conflicts=$conflicts")
            
            SyncResult(
                success = errors.isEmpty(),
                pushed = pushed,
                pulled = pulled,
                conflicts = conflicts,
                error = errors.firstOrNull(),
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
     * 网盘元数据补全。
     *
     * 普通增量同步依赖全局 cursor；如果某台手机在网盘模块启用前已经推进过 cursor，
     * 云端既有的 cloud_file/cloud_folder 不会再次出现在 /api/changes 中。这里从
     * /api/items/all 只补齐网盘元数据，不下载二进制，也不覆盖本地 modified 项。
     */
    private suspend fun backfillCloudDriveMetadata(cfg: SyncConfig): Int {
        if (cfg.type != "server" || !cfg.syncModules.cloudDrive) return 0
        val adapter = getAdapter()
        return try {
            var count = 0
            var skippedLocalModified = 0
            var skippedPendingDelete = 0
            var restoredPendingDelete = 0
            val remoteItems = adapter.listAllItems()
                .filter { it.type == ItemType.CLOUD_FILE.value || it.type == ItemType.CLOUD_FOLDER.value }
            val remoteFolders = remoteItems.count { it.type == ItemType.CLOUD_FOLDER.value }
            val remoteFiles = remoteItems.count { it.type == ItemType.CLOUD_FILE.value }

            for (remoteItem in remoteItems) {
                val localItem = itemDao.getById(remoteItem.id)

                if (remoteItem.deletedTime != null) {
                    if (localItem != null && (localItem.deletedTime == null || localItem.syncStatus != "clean")) {
                        if (applyRemoteDeletedItem(
                                itemId = remoteItem.id,
                                deletedTime = remoteItem.deletedTime,
                                updatedTime = remoteItem.updatedTime,
                                contentHash = remoteItem.contentHash,
                                remoteItem = remoteItem
                            )
                        ) {
                            count++
                        }
                    }
                    continue
                }

                if (localItem?.syncStatus == "modified") {
                    skippedLocalModified++
                    continue
                }

                if (localItem?.syncStatus == "deleted") {
                    val localDeleteTime = localItem.deletedTime ?: localItem.updatedTime
                    if (remoteItem.updatedTime > localDeleteTime) {
                        itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
                        count++
                        restoredPendingDelete++
                    } else {
                        skippedPendingDelete++
                    }
                    continue
                }

                if (localItem == null ||
                    localItem.deletedTime != remoteItem.deletedTime ||
                    localItem.contentHash != remoteItem.contentHash
                ) {
                    itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
                    count++
                }
            }
            android.util.Log.d(
                "SyncEngine",
                "Cloud drive metadata backfill: remoteFolders=$remoteFolders, remoteFiles=$remoteFiles, " +
                    "upserted=$count, restoredPendingDelete=$restoredPendingDelete, " +
                    "skippedModified=$skippedLocalModified, skippedPendingDelete=$skippedPendingDelete"
            )
            count
        } catch (e: Exception) {
            android.util.Log.w("SyncEngine", "Cloud drive metadata backfill skipped: ${e.message}")
            0
        }
    }

    /**
     * 按需下载单个云盘文件（不依赖 configStore.autoDownload 配置）
     *
     * 网盘浏览器调用该方法触发单个文件的即时下载，复用引擎内部已注入的
     * 下载管理器与适配器解析逻辑，避免向调用方暴露 [getAdapter]。
     */
    suspend fun downloadCloudFile(cloudFileId: String): Result<Unit> = withContext(Dispatchers.IO) {
        val cfg = ensureConfiguredFromStoredSettings()
            ?: return@withContext Result.failure(IllegalStateException("同步未配置"))

        if (!cfg.enabled) {
            return@withContext Result.failure(IllegalStateException("同步已禁用"))
        }

        if (cfg.type != "server") {
            return@withContext Result.failure(UnsupportedOperationException("网盘功能仅支持自建同步服务器"))
        }

        return@withContext try {
            val adapter = getAdapter()
            if (!adapter.hasRangeDownload()) {
                return@withContext Result.failure(UnsupportedOperationException("当前服务器不支持 Range 下载"))
            }
            val item = itemDao.getById(cloudFileId)
                ?: return@withContext Result.failure(IllegalStateException("文件不存在"))
            val payload = CloudFilePayload.fromJson(json, item.payload)
            cloudDriveDownloadManager.download(cloudFileId, payload, adapter)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun ensureConfiguredFromStoredSettings(): SyncConfig? {
        val current = config
        if (current != null && (current.type != "server" || serverAdapter != null)) {
            return current
        }

        val loaded = loadSyncConfigFromPreferences() ?: return null
        setConfig(loaded)
        return loaded
    }

    private fun loadSyncConfigFromPreferences(): SyncConfig? {
        val appPrefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)
        val syncEnabled = appPrefs.getBoolean("sync_enabled", false)
        val syncType = appPrefs.getString("sync_type", "webdav") ?: "webdav"
        val webdavUrl = appPrefs.getString("webdav_url", "") ?: ""
        if (webdavUrl.isBlank()) return null

        return SyncConfig(
            enabled = syncEnabled,
            type = syncType,
            url = webdavUrl,
            syncPath = appPrefs.getString("sync_path", "/mucheng-notes") ?: "/mucheng-notes",
            username = appPrefs.getString("username", null),
            password = SecureSyncStorage.getString(context, "password"),
            apiKey = appPrefs.getString("api_key", null),
            syncModules = SyncModules(
                notes = appPrefs.getBoolean("sync_notes", true),
                bookmarks = appPrefs.getBoolean("sync_bookmarks", true),
                vault = appPrefs.getBoolean("sync_vault", true),
                diagrams = appPrefs.getBoolean("sync_diagrams", true),
                todos = appPrefs.getBoolean("sync_todos", true),
                ai = appPrefs.getBoolean("sync_ai", true),
                cloudDrive = appPrefs.getBoolean("sync_cloud_drive", true),
            ),
            serverUsername = appPrefs.getString("server_username", null),
            serverPassword = SecureSyncStorage.getString(context, "server_password"),
            serverSyncKey = SecureSyncStorage.getString(context, "server_sync_key"),
            serverToken = SecureSyncStorage.getString(context, "server_token"),
            serverRefreshToken = SecureSyncStorage.getString(context, "server_refresh_token"),
            serverTokenExpires = SecureSyncStorage.getLong(context, "server_token_expires")?.takeIf { it > 0 },
        )
    }
    
    /**
     * 推送本地变更到远端（明文同步）
     */
    private suspend fun pushChanges(cfg: SyncConfig): PushResult {
        val adapter = getAdapter()
        val effectiveModules = if (cfg.type == "server") cfg.syncModules else cfg.syncModules.copy(cloudDrive = false)
        val enabledTypes = SyncModuleTypes.getEnabledTypes(effectiveModules)
        val pendingItems = itemDao.getPendingSync()
            .filter { it.type in enabledTypes }
        
        var count = 0
        val errors = mutableListOf<String>()
        for (item in pendingItems) {
            if (item.syncStatus == "deleted") {
                if ((item.type == ItemType.CLOUD_FILE.value || item.type == ItemType.CLOUD_FOLDER.value) &&
                    shouldRestoreRemoteCloudItemInsteadOfDeleting(item, adapter)
                ) {
                    count++
                    continue
                }

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
                    } else if (item.type == "cloud_file" && adapter.hasChunkedUpload()) {
                        // 网盘文件：二进制复用 /api/resources/:id（裸 id，无扩展名）。
                        // 与 resource 类型不同，cloud_file 的资源 id 就是 item.id 本身
                        //（见 ServerAdapterImpl 的 cloud_drive 扩展注释 + UploadManager.createChunkedUpload）。
                        // WebDAV 不支持分块上传（hasChunkedUpload=false），其 cloud_file 无远端
                        // 二进制，跳过清理，避免误删。
                        try {
                            adapter.deleteResource(item.id)
                        } catch (e: Exception) {
                            android.util.Log.w("SyncEngine", "Failed to delete remote cloud_file binary: ${e.message}")
                        }
                    }
                    itemDao.hardDelete(item.id)
                    count++
                }
            } else {
                // 明文同步：确保 encryptionApplied = 0
                // 使用 var 是因为云盘文件上传管理器会回写 payload（含真实 file_hash），
                // 随后我们需要用最新 payload 覆盖待上传快照。
                var itemToUpload = item.copy(encryptionApplied = 0)

                // 如果是云盘文件类型，先确保服务端已有 item 元数据，再执行二进制分块上传。
                // 服务端 /api/resources/upload 会校验 item 归属；手机端新文件首次同步时，
                // 远端还没有该 cloud_file，因此需要先 PUT 一次占位元数据，随后分块完成后
                // 再 PUT 含真实 file_hash / size / upload_state=completed 的最终元数据。
                //
                // 上传管理器内部会：流式读 SAF 文件 → 分块上传 → 服务端合并 →
                // SHA-256 校验 → 回写 ItemEntity.payload（含真实 file_hash / size /
                // upload_state=completed）并把 sync_status 置为 "modified"、local_rev+1。
                // 注意：必须在上传成功后用最新 payload 覆盖 itemToUpload，否则下面的
                // putItem 推上去的会是旧的（PENDING、无 file_hash）payload。
                if (item.type == "cloud_file" && adapter.hasChunkedUpload()) {
                    try {
                        val remoteItem = adapter.getItem(item.id)
                        if (remoteItem == null || remoteItem.deletedTime != null) {
                            val preflight = adapter.putItem(itemToUpload)
                            if (preflight.isFailure) {
                                errors.add(
                                    "Failed to create remote cloud file metadata for item ${item.id}: " +
                                        (preflight.exceptionOrNull()?.message ?: "unknown error")
                                )
                                continue
                            }
                        }

                        val payload = CloudFilePayload.fromJson(json, item.payload)
                        if (shouldAdoptRemoteCloudFileInsteadOfUploading(item, payload, remoteItem)) {
                            itemDao.upsert(remoteItem!!.copy(syncStatus = "clean"))
                            count++
                            continue
                        }

                        // 兜底：若这是陈旧的冲突副本（UUID id 且本地 SAF 源缺失/为空），
                        // 直接丢弃而不是抛 "Cannot determine local size"。
                        // 这通常出现在历史数据（relativePath 未派生）升级后仍残留的孤儿记录。
                        if (isStaleOrphanConflictCopy(item, payload)) {
                            android.util.Log.w(
                                "SyncEngine",
                                "Drop stale orphan conflict copy on push: id=${item.id}, " +
                                    "relPath=${payload.relativePath}"
                            )
                            itemDao.hardDelete(item.id)
                            continue
                        }

                        val uploadResult = cloudDriveUploadManager.upload(item.id, payload, adapter)
                        if (uploadResult.isFailure) {
                            val cause = uploadResult.exceptionOrNull()?.message ?: "unknown error"
                            errors.add("Failed to upload cloud file binary for item ${item.id}: $cause")
                            continue
                        }
                        // 上传管理器已回写本地 DB；重新读取以拿到含 file_hash 的最新 payload
                        itemDao.getById(item.id)?.let { freshItem ->
                            itemToUpload = freshItem.copy(encryptionApplied = 0)
                        }
                    } catch (e: Exception) {
                        errors.add("Failed to upload cloud file binary for item ${item.id}: ${e.message}")
                        continue
                    }
                }

                // 上传项目
                val result = adapter.putItem(itemToUpload)

                if (result.isSuccess) {
                    val remoteRev = result.getOrThrow()

                    // 如果是资源类型，上传资源二进制文件
                    // （资源路径：putItem 先行，再 uploadResource，与云盘文件相反）
                    if (item.type == "resource") {
                        var resourceUploadFailed = false
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
                                        resourceUploadFailed = true
                                        android.util.Log.w("SyncEngine", "Failed to upload resource file: $resourceId")
                                    }
                                } else {
                                    resourceUploadFailed = true
                                    android.util.Log.w("SyncEngine", "Resource file not found: ${localFile.absolutePath}")
                                }
                            } else {
                                resourceUploadFailed = true
                                android.util.Log.w("SyncEngine", "No local cache found for resource item: ${item.id}")
                            }
                        } catch (e: Exception) {
                            resourceUploadFailed = true
                            android.util.Log.w("SyncEngine", "Failed to upload resource file: ${e.message}")
                        }

                        if (resourceUploadFailed) {
                            errors.add("Failed to upload resource file for item ${item.id}")
                            continue
                        }
                    }

                    itemDao.markSynced(item.id, remoteRev)
                    count++
                } else {
                    errors.add("Failed to upload item ${item.id}: ${result.exceptionOrNull()?.message ?: "unknown error"}")
                }
            }
        }
        
        return PushResult(count, errors)
    }

    /**
     * 防止仅云端占位/下载缓存状态被误当成“本地新增文件”上传。
     *
     * 若本地 cloud_file 处于 modified，但 SAF 目录中没有真实可上传源文件，且远端已经有
     * 有效二进制元数据，则说明这不是一个需要上传的本地变更。此时采用远端记录并标 clean，
     * 避免同步阶段创建 0B 源文件后报 Cannot determine local size。
     */
    private suspend fun shouldAdoptRemoteCloudFileInsteadOfUploading(
        localItem: ItemEntity,
        localPayload: CloudFilePayload,
        remoteItem: ItemEntity?
    ): Boolean {
        if (remoteItem == null || remoteItem.deletedTime != null || remoteItem.type != ItemType.CLOUD_FILE.value) {
            return false
        }

        val remotePayload = runCatching {
            CloudFilePayload.fromJson(json, remoteItem.payload)
        }.getOrNull() ?: return false
        val remoteHasBinary = remotePayload.fileHash.isNotBlank() || remotePayload.size > 0L
        if (!remoteHasBinary) return false

        val localRecord = cloudFileLocalPathDao.getByCloudFileId(localItem.id)
        val verifiedDownload = localRecord?.state == "completed" &&
            remotePayload.fileHash.isNotBlank() &&
            localRecord.fileHashVerified?.equals(remotePayload.fileHash, ignoreCase = true) == true
        if (verifiedDownload) return true

        val localSource = cloudDriveFolderPicker.findRelativeDocumentFile(localPayload.relativePath)
            ?.takeIf { it.exists() && it.isFile }
        val localSize = localSource?.length()?.takeIf { it > 0L } ?: 0L

        return localSource == null || (localSize <= 0L && localPayload.size <= 0L)
    }

    /**
     * 判定一个待上传的 cloud_file 是否为"陈旧孤儿冲突副本"。
     *
     * 触发条件（同时满足）：
     * 1. filename / relativePath 含冲突后缀 " (冲突副本)"——这是
     *    [addConflictSuffixToPayload] 产出的冲突副本的独有特征，正常的
     *    path-derived 记录不会有此后缀（不能用 UUID 形态判定，因为
     *    [CloudDrivePathIdentity.deriveId] 也会把 path-derived id 规整成
     *    UUID 字形）；
     * 2. SAF 源无法解析、或解析出 0 字节空文件——说明没有真实本地内容可上传。
     *
     * 此类记录大多来自历史 Bug（relativePath 未派生）的残留，强传会抛
     * "Cannot determine local size" 并把错误塞进结果。这里在 push 入口直接丢弃，
     * 避免无限错误循环。注意：新版本已派生独立 relativePath 并物理拷贝字节，
     * 不会再落入此分支。
     */
    private fun isStaleOrphanConflictCopy(
        item: ItemEntity,
        payload: CloudFilePayload
    ): Boolean {
        val hasConflictSuffix = payload.filename.contains(CONFLICT_SUFFIX) ||
            payload.relativePath.contains(CONFLICT_SUFFIX)
        if (!hasConflictSuffix) return false

        if (payload.relativePath.isBlank()) return true

        val source = runCatching {
            cloudDriveFolderPicker.findRelativeDocumentFile(payload.relativePath)
        }.getOrNull()
        if (source == null || !source.exists() || !source.isFile) return true
        val length = runCatching { source.length() }.getOrDefault(-1L)
        if (length <= 0L && payload.size <= 0L) return true
        return false
    }

    /**
     * pull 阶段的冲突去重判定：本地这条记录本身是不是一个"陈旧冲突副本"。
     *
     * 背景：旧版本生成的冲突副本会沿用原 relativePath（甚至 id 形如 UUID），
     * 当远端同一 id 下发新版本时，pull 会把本地副本再次 [createConflictCopy]，
     * 产生 "副本的副本的副本..." —— 这正是网盘根目录堆出几十个 "(冲突副本)" 的根因。
     *
     * 判定依据仍然是 CONFLICT_SUFFIX：path-derived id 也形如 UUID，不能用 UUID
     * 正则区分；只有 payload 中的后缀是安全判别符。普通类型（note/...）的标题
     * 中后缀不可靠（用户可能真的起名带括号），这里只针对 cloud_file/cloud_folder，
     * 检查 filename/relativePath 两个字段。
     *
     * 命中时调用方应：跳过 [createConflictCopy]，直接用远端记录覆盖本地
     * （syncStatus="clean"），可选 hardDelete 本地陈旧副本。
     */
    private fun isLocalStaleConflictCopy(item: ItemEntity): Boolean {
        if (item.type != "cloud_file" && item.type != "cloud_folder") return false
        return try {
            when (item.type) {
                "cloud_file" -> {
                    val p = CloudFilePayload.fromJson(json, item.payload)
                    p.filename.contains(CONFLICT_SUFFIX) ||
                        p.relativePath.contains(CONFLICT_SUFFIX)
                }
                "cloud_folder" -> {
                    val p = json.decodeFromString<CloudFolderPayload>(item.payload)
                    p.name.contains(CONFLICT_SUFFIX) ||
                        p.relativePath.contains(CONFLICT_SUFFIX)
                }
                else -> false
            }
        } catch (e: Exception) {
            false
        }
    }

    private suspend fun shouldRestoreRemoteCloudItemInsteadOfDeleting(
        localDeletedItem: ItemEntity,
        adapter: WebDAVAdapter
    ): Boolean {
        val localDeleteTime = localDeletedItem.deletedTime ?: localDeletedItem.updatedTime
        val remoteItem = try {
            adapter.getItem(localDeletedItem.id)
        } catch (e: Exception) {
            android.util.Log.w(
                "SyncEngine",
                "Skip stale cloud delete check for ${localDeletedItem.id}: ${e.message}"
            )
            null
        }

        if (remoteItem == null || remoteItem.deletedTime != null) return false
        if (remoteItem.updatedTime <= localDeleteTime) return false

        itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
        android.util.Log.w(
            "SyncEngine",
            "Restored cloud item from newer remote before pushing stale delete: " +
                "id=${localDeletedItem.id}, type=${localDeletedItem.type}, " +
                "remoteUpdated=${remoteItem.updatedTime}, localDelete=$localDeleteTime"
        )
        return true
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
        val effectiveModules = if (cfg.type == "server") cfg.syncModules else cfg.syncModules.copy(cloudDrive = false)
        val enabledTypes = SyncModuleTypes.getEnabledTypes(effectiveModules)

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
                        if (remoteItem.deletedTime != null) {
                            if (applyRemoteDeletedItem(
                                    itemId = remoteItem.id,
                                    deletedTime = remoteItem.deletedTime,
                                    updatedTime = remoteItem.updatedTime,
                                    contentHash = remoteItem.contentHash,
                                    remoteItem = remoteItem
                                )
                            ) {
                                count++
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
                                if (isLocalStaleConflictCopy(localItem)) {
                                    // 本地本身就是陈旧冲突副本（relativePath/filename
                                    // 含后缀）：不要再派生 "副本的副本"，直接用远端覆盖。
                                    itemDao.hardDelete(localItem.id)
                                    itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
                                    conflicts++
                                } else {
                                    val conflictItem = createConflictCopy(localItem)
                                    itemDao.upsert(conflictItem)
                                    itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
                                    conflicts++
                                }
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

                        // 如果是云盘文件类型，按配置自动下载到 SAF 文件夹
                        // 下载管理器只更新侧表（CloudFileLocalPathEntity），不动 payload，
                        // 因此不会触发本地 rev 增长 / 同步 churn。
                        if (remoteItem.type == "cloud_file" &&
                            cloudDriveConfigStore.current.autoDownload &&
                            adapter.hasRangeDownload()
                        ) {
                            try {
                                val payload = CloudFilePayload.fromJson(json, remoteItem.payload)
                                val downloadResult = cloudDriveDownloadManager.download(
                                    remoteItem.id, payload, adapter
                                )
                                if (downloadResult.isFailure) {
                                    val cause = downloadResult.exceptionOrNull()?.message ?: "unknown error"
                                    android.util.Log.w(
                                        "SyncEngine",
                                        "Failed to download cloud file ${remoteItem.id}: $cause"
                                    )
                                }
                            } catch (e: Exception) {
                                android.util.Log.w(
                                    "SyncEngine",
                                    "Failed to download cloud file ${remoteItem.id}: ${e.message}"
                                )
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
                    if (change.deletedTime != null) {
                        if (applyRemoteDeletedItem(
                                itemId = change.itemId,
                                deletedTime = change.deletedTime,
                                updatedTime = change.updatedTime,
                                contentHash = change.contentHash,
                                remoteItem = null
                            )
                        ) {
                            count++
                        }
                        continue
                    }
                    android.util.Log.w("SyncEngine", "Remote item ${change.itemId} not found, skipping")
                    continue
                }

                val localItem = itemDao.getById(remoteItem.id)

                if (remoteItem.deletedTime != null) {
                    if (applyRemoteDeletedItem(
                            itemId = remoteItem.id,
                            deletedTime = remoteItem.deletedTime,
                            updatedTime = remoteItem.updatedTime,
                            contentHash = remoteItem.contentHash,
                            remoteItem = remoteItem
                        )
                    ) {
                        count++
                    }
                    continue
                }

                if (localItem != null && localItem.syncStatus == "clean") {
                    val hashMatches = localItem.contentHash == change.contentHash
                    if (hashMatches) continue
                }

                if (localItem != null && localItem.syncStatus == "modified") {
                    if (isLocalStaleConflictCopy(localItem)) {
                        // 本地本身就是陈旧冲突副本：跳过派生，直接用远端覆盖
                        itemDao.hardDelete(localItem.id)
                        itemDao.upsert(remoteItem.copy(syncStatus = "clean"))
                        count++
                        conflicts++
                        continue
                    }
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

                // 如果是云盘文件类型，按配置自动下载到 SAF 文件夹
                if (remoteItem.type == "cloud_file" &&
                    cloudDriveConfigStore.current.autoDownload &&
                    adapter.hasRangeDownload()
                ) {
                    try {
                        val payload = CloudFilePayload.fromJson(json, remoteItem.payload)
                        val downloadResult = cloudDriveDownloadManager.download(
                            remoteItem.id, payload, adapter
                        )
                        if (downloadResult.isFailure) {
                            val cause = downloadResult.exceptionOrNull()?.message ?: "unknown error"
                            android.util.Log.w(
                                "SyncEngine",
                                "Failed to download cloud file ${remoteItem.id}: $cause"
                            )
                        }
                    } catch (e: Exception) {
                        android.util.Log.w(
                            "SyncEngine",
                            "Failed to download cloud file ${remoteItem.id}: ${e.message}"
                        )
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
     * 应用远端删除。
     *
     * 服务端软删会保留 deleted_time，客户端必须保留 clean tombstone 才能稳定收敛。
     * 同时兼容历史硬删：change 有 deleted_time 但 /api/items/:id 已经 404 时，
     * 仍用本地已有 item 落删除，避免“云端已删、手机还显示”。
     */
    private suspend fun applyRemoteDeletedItem(
        itemId: String,
        deletedTime: Long,
        updatedTime: Long,
        contentHash: String,
        remoteItem: ItemEntity?
    ): Boolean {
        val localItem = itemDao.getById(itemId)
        val baseItem = remoteItem ?: localItem ?: return false
        val itemsToDelete = collectCloudDeletedItems(baseItem)
        var changed = false

        for (item in itemsToDelete) {
            cleanupLocalCloudArtifactsForRemoteDelete(item)
            val source = if (item.id == itemId && remoteItem != null) remoteItem else item
            val tombstone = source.copy(
                deletedTime = if (item.id == itemId) deletedTime else (item.deletedTime ?: deletedTime),
                updatedTime = if (item.id == itemId) updatedTime else item.updatedTime,
                contentHash = if (item.id == itemId) contentHash else item.contentHash,
                syncStatus = "clean"
            )
            if (item.deletedTime == null || item.syncStatus != "clean") {
                changed = true
            }
            itemDao.upsert(tombstone)
        }

        return changed
    }

    private suspend fun collectCloudDeletedItems(root: ItemEntity): List<ItemEntity> {
        if (root.type != ItemType.CLOUD_FOLDER.value) return listOf(root)

        val rootPath = runCatching {
            CloudDrivePathIdentity.normalize(json.decodeFromString<CloudFolderPayload>(root.payload).relativePath)
        }.getOrDefault("")
        if (rootPath.isBlank()) return listOf(root)

        val prefix = "$rootPath/"
        val folders = itemDao.getByTypeOnce(ItemType.CLOUD_FOLDER.value).filter { item ->
            item.id != root.id && runCatching {
                CloudDrivePathIdentity.normalize(json.decodeFromString<CloudFolderPayload>(item.payload).relativePath)
            }.getOrDefault("").startsWith(prefix)
        }
        val files = itemDao.getByTypeOnce(ItemType.CLOUD_FILE.value).filter { item ->
            runCatching {
                CloudDrivePathIdentity.normalize(CloudFilePayload.fromJson(json, item.payload).relativePath)
            }.getOrDefault("").startsWith(prefix)
        }

        return listOf(root) + folders + files
    }

    private suspend fun cleanupLocalCloudArtifactsForRemoteDelete(item: ItemEntity) {
        if (item.type == ItemType.CLOUD_FOLDER.value) {
            val relativePath = runCatching {
                CloudDrivePathIdentity.normalize(json.decodeFromString<CloudFolderPayload>(item.payload).relativePath)
            }.getOrDefault("")
            if (relativePath.isNotBlank()) {
                runCatching {
                    cloudDriveFolderPicker.findRelativeDocumentFile(relativePath)
                        ?.takeIf { it.exists() && it.isDirectory }
                        ?.delete()
                }
            }
            return
        }

        if (item.type != ItemType.CLOUD_FILE.value) return

        val payload = runCatching {
            CloudFilePayload.fromJson(json, item.payload)
        }.getOrNull()
        val record = cloudFileLocalPathDao.getByCloudFileId(item.id)
        if (record != null) {
            runCatching {
                DocumentFile.fromSingleUri(context, Uri.parse(record.documentUri))
                    ?.takeIf { it.exists() }
                    ?.delete()
            }
            cloudFileLocalPathDao.delete(item.id)
        }

        val relativePath = CloudDrivePathIdentity.normalize(payload?.relativePath.orEmpty())
        if (relativePath.isNotBlank()) {
            runCatching {
                cloudDriveFolderPicker.findRelativeDocumentFile(relativePath)
                    ?.takeIf { it.exists() && it.isFile }
                    ?.delete()
            }
        }
    }
    
    /**
     * 创建冲突副本。
     *
     * 对 cloud_file/cloud_folder：除了给显示名加后缀，还会派生独立的 relativePath，
     * 并把原始物理文件（或文件夹）的字节复制到新的 SAF 路径。否则冲突副本会沿用
     * 原 relativePath，导致上传时找不到可用的本地源（Cannot determine local size），
     * 也会被 DirectoryScanner 当成孤儿记录反复触发冲突，越积越多。
     */
    private suspend fun createConflictCopy(item: ItemEntity): ItemEntity {
        // 修改 payload：添加后缀 + 派生独立 relativePath
        val modifiedPayload = addConflictSuffixToPayload(item.payload, item.type)

        val conflictItem = item.copy(
            id = UUID.randomUUID().toString(),
            payload = modifiedPayload,
            syncStatus = "modified",
            localRev = 1,
            remoteRev = null
        )

        // cloud_file/cloud_folder：把原始字节/目录复制到新 relativePath，
        // 这样上传与扫描才能解析到真实的本地源。复制失败不阻断冲突副本的创建，
        // 由 push 阶段的源校验兜底（不再因找不到源而无限报错）。
        if (item.type == "cloud_file" || item.type == "cloud_folder") {
            copyConflictPhysicalSource(item, conflictItem)
        }

        return conflictItem
    }

    /**
     * 把原始 cloud_file/cloud_folder 的物理文件/目录复制到冲突副本的新 relativePath。
     * 对应桌面端 CloudDriveService.handleCloudFileConflict。
     */
    private suspend fun copyConflictPhysicalSource(
        original: ItemEntity,
        conflict: ItemEntity
    ) = withContext(Dispatchers.IO) {
        val originalRelPath = when (original.type) {
            "cloud_file" -> CloudFilePayload.fromJson(json, original.payload).relativePath
            "cloud_folder" -> json.decodeFromString<CloudFolderPayload>(original.payload).relativePath
            else -> return@withContext
        }
        val conflictRelPath = when (original.type) {
            "cloud_file" -> CloudFilePayload.fromJson(json, conflict.payload).relativePath
            "cloud_folder" -> json.decodeFromString<CloudFolderPayload>(conflict.payload).relativePath
            else -> return@withContext
        }
        if (originalRelPath.isBlank() || conflictRelPath.isBlank() || originalRelPath == conflictRelPath) {
            return@withContext
        }

        try {
            val source = cloudDriveFolderPicker.findRelativeDocumentFile(originalRelPath)
            if (source == null || !source.exists()) {
                // 原文件已不在本地（被改名/删除是产生冲突的常见原因）。
                // 此时冲突副本只是占位：远端会随后下发新版本，本地无需复制字节。
                android.util.Log.d(
                    "SyncEngine",
                    "copyConflictPhysicalSource: original source gone for ${original.id}, skip copy"
                )
                return@withContext
            }

            if (original.type == "cloud_folder") {
                // 复制整个目录树到冲突副本的新 relativePath
                copyConflictDirectoryTree(source, conflictRelPath)
            } else {
                // cloud_file：构建目标文件并复制字节
                val target = cloudDriveFolderPicker.buildRelativeDocumentFile(conflictRelPath)
                if (target == null || !target.exists()) {
                    android.util.Log.w(
                        "SyncEngine",
                        "copyConflictPhysicalSource: cannot build target for $conflictRelPath"
                    )
                    return@withContext
                }
                cloudDriveFolderPicker.copyDocumentBytes(source, target)
            }
        } catch (e: Exception) {
            android.util.Log.w(
                "SyncEngine",
                "copyConflictPhysicalSource failed for ${original.id}: ${e.message}"
            )
        }
    }

    /**
     * 递归把源目录及其内容复制到 [conflictRelPath]。
     */
    private suspend fun copyConflictDirectoryTree(
        sourceDir: DocumentFile,
        conflictRelPath: String
    ) = withContext(Dispatchers.IO) {
        val targetRoot = cloudDriveFolderPicker.buildRelativeDirectory(conflictRelPath) ?: run {
            android.util.Log.w(
                "SyncEngine",
                "copyConflictDirectoryTree: cannot build target dir $conflictRelPath"
            )
            return@withContext
        }
        copyDocumentTree(sourceDir, targetRoot)
    }

    private suspend fun copyDocumentTree(source: DocumentFile, target: DocumentFile): Unit {
        for (child in source.listFiles()) {
            val childName = child.name
            if (childName.isNullOrEmpty()) continue
            if (child.isDirectory) {
                val childTarget = target.createDirectory(childName) ?: continue
                copyDocumentTree(child, childTarget)
            } else if (child.isFile) {
                val childTarget = target.createFile(
                    child.type ?: "application/octet-stream",
                    childName
                ) ?: continue
                cloudDriveFolderPicker.copyDocumentBytes(child, childTarget)
            }
        }
    }

    /**
     * 为 payload 添加冲突后缀。
     *
     * 普通类型（note/bookmark/vault/...）只修改标题字段。
     * cloud_file/cloud_folder 除了显示名加后缀，还必须派生独立 relativePath，
     * 否则冲突副本与原文件会指向同一物理路径。
     */
    private fun addConflictSuffixToPayload(payload: String, type: String): String {
        val suffix = CONFLICT_SUFFIX
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
                // 网盘类型使用各自 payload 的命名字段：
                // CloudFilePayload 用 filename，CloudFolderPayload 用 name
                "cloud_file" -> "filename"
                "cloud_folder" -> "name"
                else -> "title"
            }

            // 修改标题字段
            val currentTitle = mutableMap[titleField]?.let { element ->
                if (element is JsonPrimitive && element.isString) {
                    element.content
                } else ""
            } ?: ""

            val newTitle = currentTitle + suffix
            mutableMap[titleField] = JsonPrimitive(newTitle)

            // cloud_file/cloud_folder：必须同时派生独立 relativePath。
            // 桌面端 deriveConflictPath 的等价实现：目录/文件名后缀插到扩展名前。
            if (type == "cloud_file" || type == "cloud_folder") {
                val relPathField = "relative_path"
                val currentRelPath = mutableMap[relPathField]?.let { element ->
                    if (element is JsonPrimitive && element.isString) element.content else ""
                } ?: ""
                if (currentRelPath.isNotBlank()) {
                    val conflictRelPath = deriveConflictRelativePath(currentRelPath)
                    mutableMap[relPathField] = JsonPrimitive(conflictRelPath)
                    // cloud_file 的 filename 也应与新的 relativePath 末端保持一致
                    if (type == "cloud_file") {
                        mutableMap["filename"] = JsonPrimitive(
                            conflictRelPath.substringAfterLast('/').ifBlank { newTitle }
                        )
                    }
                }
            }

            json.encodeToString(JsonObject.serializer(), JsonObject(mutableMap))
        } catch (e: Exception) {
            // 解析失败，返回原始 payload
            payload
        }
    }

    /**
     * 派生冲突副本的 relativePath，避免覆盖原文件。
     * 对应桌面端 SyncEngine.deriveConflictPath：
     *   "docs/file.pdf" -> "docs/file (冲突副本).pdf"
     *   "docs/folder"   -> "docs/folder (冲突副本)"
     */
    private fun deriveConflictRelativePath(relativePath: String): String {
        val suffix = CONFLICT_SUFFIX
        val lastSlash = maxOf(relativePath.lastIndexOf('/'), relativePath.lastIndexOf('\\'))
        val dir = if (lastSlash >= 0) relativePath.substring(0, lastSlash + 1) else ""
        val fileName = if (lastSlash >= 0) relativePath.substring(lastSlash + 1) else relativePath

        val dotIdx = fileName.lastIndexOf('.')
        val base = if (dotIdx > 0) fileName.substring(0, dotIdx) else fileName
        val ext = if (dotIdx > 0) fileName.substring(dotIdx) else ""
        val conflictName = "$base$suffix$ext"
        return if (dir.isNotEmpty()) "$dir$conflictName" else conflictName
    }

}

private data class PushResult(val count: Int, val errors: List<String> = emptyList())
private data class PullResult(val count: Int, val conflicts: Int)
