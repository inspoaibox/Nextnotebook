package com.mucheng.notes.data.cloud

import android.content.Context
import android.content.SharedPreferences
import com.mucheng.notes.domain.model.payload.CloudConflictStrategy
import com.mucheng.notes.domain.model.payload.CloudDriveConfig
import com.mucheng.notes.domain.model.payload.DEFAULT_CLOUD_DRIVE_CONFIG
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 网盘配置持久化存储（Android 端）。
 *
 * 与桌面端 [CloudDriveConfig] 字段一一对应，但 watched_root_path 在 Android
 * 上存的是 SAF tree-uri 字符串（content://...），而不是文件系统路径。
 *
 * 存储介质选择：
 *   - tree-uri、冲突策略、是否自动下载、分块大小、并发数均不属于敏感信息，
 *     使用普通 [SharedPreferences] 即可，避免 [SecureSyncStorage] 那套
 *     EncryptedSharedPreferences 的额外开销。
 *   - 仅认证类信息（服务器 token / 同步密钥）才走 [SecureSyncStorage]。
 *
 * 同时对外暴露 [StateFlow]，便于 UI 层（SettingsScreen / 设置页网盘区块）
 * 以响应式方式观察授权状态与配置变化。
 */
@Singleton
class CloudDriveConfigStore @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _configFlow = MutableStateFlow(loadConfig())
    /** 响应式配置流，UI 订阅后可在授权/撤销时立即刷新 */
    val configFlow: StateFlow<CloudDriveConfig> = _configFlow.asStateFlow()

    /** 当前配置快照（非响应式读取） */
    val current: CloudDriveConfig
        get() = _configFlow.value

    // ------------------------------------------------------------------
    // SAF 授权（watchedRootPath = tree-uri）
    // ------------------------------------------------------------------

    /**
     * 保存用户通过 SAF 选中的目录 tree-uri，并刷新 [configFlow]。
     * 调用方应在 [android.content.ContentResolver.takePersistableUriPermission]
     * 成功后再调用本方法。
     */
    fun setWatchedTreeUri(treeUri: String) {
        prefs.edit().putString(KEY_TREE_URI, treeUri).apply()
        refresh()
    }

    /** 是否已授权网盘根目录 */
    fun isAuthorized(): Boolean = _configFlow.value.watchedRootPath != null

    /** 撤销授权：清空 tree-uri 与本地缓存路径元数据外键引用（不删表） */
    fun clearAuthorization() {
        prefs.edit().remove(KEY_TREE_URI).apply()
        refresh()
    }

    // ------------------------------------------------------------------
    // 冲突策略 / 自动下载 / 分块 / 并发
    // ------------------------------------------------------------------

    fun setConflictStrategy(strategy: CloudConflictStrategy) {
        prefs.edit().putString(KEY_CONFLICT_STRATEGY, strategy.value).apply()
        refresh()
    }

    fun setAutoDownload(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_AUTO_DOWNLOAD, enabled).apply()
        refresh()
    }

    /** 上传分块大小（字节） */
    fun setChunkSize(chunkSize: Long) {
        prefs.edit().putLong(KEY_CHUNK_SIZE, chunkSize).apply()
        refresh()
    }

    /** 下载分块大小（字节） */
    fun setDownloadChunkSize(chunkSize: Long) {
        prefs.edit().putLong(KEY_DOWNLOAD_CHUNK_SIZE, chunkSize).apply()
        refresh()
    }

    /** 下载并发数 */
    fun setDownloadConcurrency(concurrency: Int) {
        prefs.edit().putInt(KEY_DOWNLOAD_CONCURRENCY, concurrency.coerceAtLeast(1)).apply()
        refresh()
    }

    // ------------------------------------------------------------------
    // 内部
    // ------------------------------------------------------------------

    /** 从 SharedPreferences 重新读取并刷新 [configFlow] */
    private fun refresh() {
        _configFlow.value = loadConfig()
    }

    /**
     * 把持久化的关键字段叠加到 [DEFAULT_CLOUD_DRIVE_CONFIG] 上。
     * 其余字段（ignore_patterns / stability_threshold 等）维持桌面默认，
     * Android 端暂不开放编辑入口。
     */
    private fun loadConfig(): CloudDriveConfig {
        val base = DEFAULT_CLOUD_DRIVE_CONFIG
        return base.copy(
            watchedRootPath = prefs.getString(KEY_TREE_URI, null),
            conflictStrategy = prefs.getString(
                KEY_CONFLICT_STRATEGY,
                base.conflictStrategy
            ) ?: base.conflictStrategy,
            autoDownload = prefs.getBoolean(KEY_AUTO_DOWNLOAD, base.autoDownload),
            chunkSize = prefs.getLong(KEY_CHUNK_SIZE, base.chunkSize),
            downloadChunkSize = prefs.getLong(KEY_DOWNLOAD_CHUNK_SIZE, base.downloadChunkSize),
            downloadConcurrency = prefs.getInt(KEY_DOWNLOAD_CONCURRENCY, base.downloadConcurrency)
        )
    }

    companion object {
        private const val PREFS_NAME = "cloud_drive_config"

        const val KEY_TREE_URI = "watched_tree_uri"
        const val KEY_CONFLICT_STRATEGY = "conflict_strategy"
        const val KEY_AUTO_DOWNLOAD = "auto_download"
        const val KEY_CHUNK_SIZE = "chunk_size"
        const val KEY_DOWNLOAD_CHUNK_SIZE = "download_chunk_size"
        const val KEY_DOWNLOAD_CONCURRENCY = "download_concurrency"
    }
}
