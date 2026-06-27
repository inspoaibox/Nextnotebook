package com.mucheng.notes.data.repository

import android.content.Context
import com.mucheng.notes.data.sync.SyncEngine
import com.mucheng.notes.domain.model.SyncConfig
import com.mucheng.notes.domain.model.SyncModules
import com.mucheng.notes.domain.model.SyncResult
import com.mucheng.notes.domain.model.SyncStatus
import com.mucheng.notes.domain.repository.SyncRepository
import com.mucheng.notes.security.SecureSyncStorage
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * SyncRepository 实现
 */
@Singleton
class SyncRepositoryImpl @Inject constructor(
    private val syncEngine: SyncEngine,
    @ApplicationContext private val context: Context
) : SyncRepository {
    
    private val _syncStatus = MutableStateFlow(SyncStatus.IDLE)
    
    override suspend fun sync(): SyncResult {
        _syncStatus.value = SyncStatus.SYNCING
        
        // 在同步前从 SharedPreferences 加载配置并设置到 SyncEngine
        // 这样无论从哪里调用 sync()，都能正确加载配置
        val config = loadSyncConfig()
        if (config == null) {
            _syncStatus.value = SyncStatus.FAILED
            return SyncResult(error = "同步未配置")
        }
        
        if (!config.enabled) {
            _syncStatus.value = SyncStatus.FAILED
            return SyncResult(error = "同步已禁用")
        }
        
        // 设置配置到 SyncEngine（会初始化适配器和 token）
        syncEngine.setConfig(config)
        
        val result = syncEngine.sync()
        
        _syncStatus.value = if (result.success) {
            SyncStatus.SUCCESS
        } else {
            SyncStatus.FAILED
        }
        
        return result
    }
    
    /**
     * 从 SharedPreferences 加载同步配置
     */
    private fun loadSyncConfig(): SyncConfig? {
        val prefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)
        
        val syncEnabled = prefs.getBoolean("sync_enabled", false)
        val syncType = prefs.getString("sync_type", "webdav") ?: "webdav"
        val webdavUrl = prefs.getString("webdav_url", "") ?: ""
        
        if (webdavUrl.isBlank()) {
            return null
        }
        
        // 加载同步模块配置
        val syncModules = SyncModules(
            notes = prefs.getBoolean("sync_notes", true),
            bookmarks = prefs.getBoolean("sync_bookmarks", true),
            vault = prefs.getBoolean("sync_vault", true),
            diagrams = prefs.getBoolean("sync_diagrams", true),
            todos = prefs.getBoolean("sync_todos", true),
            ai = prefs.getBoolean("sync_ai", true),
            cloudDrive = prefs.getBoolean("sync_cloud_drive", true)
        )
        
        return SyncConfig(
            enabled = syncEnabled,
            type = syncType,
            url = webdavUrl,
            syncPath = prefs.getString("sync_path", "/mucheng-notes") ?: "/mucheng-notes",
            username = prefs.getString("username", null),
            password = SecureSyncStorage.getString(context, "password"),
            apiKey = prefs.getString("api_key", null),
            syncModules = syncModules,
            // 自建服务器认证信息
            serverUsername = prefs.getString("server_username", null),
            serverPassword = SecureSyncStorage.getString(context, "server_password"),
            serverSyncKey = SecureSyncStorage.getString(context, "server_sync_key"),
            serverToken = SecureSyncStorage.getString(context, "server_token"),
            serverRefreshToken = SecureSyncStorage.getString(context, "server_refresh_token"),
            serverTokenExpires = SecureSyncStorage.getLong(context, "server_token_expires")?.takeIf { it > 0 }
        )
    }
    
    override suspend fun getSyncStatus(): SyncStatus {
        return _syncStatus.value
    }
    
    override fun observeSyncStatus(): Flow<SyncStatus> {
        return _syncStatus.asStateFlow()
    }
}
