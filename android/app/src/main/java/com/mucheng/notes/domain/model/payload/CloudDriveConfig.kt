package com.mucheng.notes.domain.model.payload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 网盘冲突解决策略 - 与桌面端 CloudConflictStrategy 完全一致
 *
 * - NEWEST_WINS: 以 mtime 更新者为准，覆盖较旧的一方
 * - CREATE_COPY: 保留两者，把本地较旧副本重命名为 "xxx (冲突副本).ext"
 * - SKIP: 跳过本次下载，保留本地版本不动
 */
@Serializable
enum class CloudConflictStrategy(val value: String) {
    @SerialName("newest-wins") NEWEST_WINS("newest-wins"),
    @SerialName("create-copy") CREATE_COPY("create-copy"),
    @SerialName("skip") SKIP("skip");

    companion object {
        fun fromValue(value: String?): CloudConflictStrategy =
            value?.let { v -> entries.find { it.value == v } } ?: CREATE_COPY
    }
}

/**
 * 网盘配置 - 与桌面端 CloudDriveConfig 完全一致
 *
 * 独立持久化，不混入 SyncConfig。
 * Android 端的 watched_root_path 存储 SAF tree-uri 字符串。
 */
@Serializable
data class CloudDriveConfig(
    @SerialName("watched_root_path") val watchedRootPath: String? = null,
    @SerialName("max_file_size") val maxFileSize: Long = MAX_FILE_SIZE_DEFAULT,
    @SerialName("chunk_size") val chunkSize: Long = CHUNK_SIZE_DEFAULT,
    @SerialName("ignore_patterns") val ignorePatterns: List<String> = DEFAULT_IGNORE_PATTERNS,
    @SerialName("ignore_hidden") val ignoreHidden: Boolean = true,
    @SerialName("sync_deletions") val syncDeletions: Boolean = true,
    @SerialName("soft_delete_retention_days") val softDeleteRetentionDays: Int = 30,
    @SerialName("stability_threshold") val stabilityThreshold: Long = 2000L,
    @SerialName("debounce_ms") val debounceMs: Long = 3000L,
    @SerialName("small_file_concurrency") val smallFileConcurrency: Int = 3,
    @SerialName("sync_cursor") val syncCursor: String? = null,
    @SerialName("auto_download") val autoDownload: Boolean = true,
    @SerialName("download_chunk_size") val downloadChunkSize: Long = CHUNK_SIZE_DEFAULT,
    @SerialName("download_concurrency") val downloadConcurrency: Int = 2,
    @SerialName("conflict_strategy") val conflictStrategy: String = CloudConflictStrategy.CREATE_COPY.value
) {
    fun conflictStrategyEnum(): CloudConflictStrategy =
        CloudConflictStrategy.fromValue(conflictStrategy)

    companion object {
        const val MAX_FILE_SIZE_DEFAULT: Long = 500L * 1024L * 1024L  // 500MB
        const val CHUNK_SIZE_DEFAULT: Long = 8L * 1024L * 1024L       // 8MB

        /** 与桌面端默认忽略规则一致 */
        val DEFAULT_IGNORE_PATTERNS: List<String> = listOf(
            "~\$*",          // Office 锁文件
            "*.tmp",         // 临时文件
            "*.asd",         // Office 自动恢复
            "*.wbk",         // Word 备份
            "~*.*",          // Office 临时
            ".DS_Store",     // macOS
            "Thumbs.db",     // Windows 缩略图
            "desktop.ini",   // Windows 文件夹配置
            "*.lnk"          // Windows 快捷方式
        )
    }
}

/**
 * 网盘配置默认值实例 - 与桌面端 DEFAULT_CLOUD_DRIVE_CONFIG 完全一致
 */
val DEFAULT_CLOUD_DRIVE_CONFIG: CloudDriveConfig = CloudDriveConfig()
