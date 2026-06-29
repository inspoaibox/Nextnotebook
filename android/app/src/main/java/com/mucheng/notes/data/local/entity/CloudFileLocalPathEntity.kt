package com.mucheng.notes.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * 网盘文件本地路径侧表（Android 端独有）。
 *
 * 与 [ResourceCacheEntity] 采用完全相同的"侧表不参与同步"模式：
 * CloudFilePayload 中不包含 local_path / document_uri 字段，以保证
 * payload 与桌面端 [src/shared/types/index.ts] 中的 CloudFilePayload
 * 完全一致，可无损参与双向同步。
 *
 * 本表仅由 Android 端的 CloudDriveDownloadManager 维护，用于把云端
 * cloud_file 的二进制内容落到用户通过 SAF 授权的目录
 * （CloudDriveConfigStore 中持久化的 treeUri）下，并记录：
 *   - documentUri：DocumentFile 的 content:// Uri，断点续传/打开文件用
 *   - fileHashVerified：最后一次成功落盘并校验通过的 SHA-256
 *   - downloadedSize / state：断点续传进度与状态机
 *
 * 同步仲裁时：SyncEngine 比较远端 payload.file_hash 与本表
 * fileHashVerified，不同则触发 CloudDriveDownloadManager 重新拉取。
 */
@Entity(tableName = "cloud_file_local_path")
data class CloudFileLocalPathEntity(
    /** 主键 = ItemEntity.id（cloud_file 的 id） */
    @PrimaryKey
    @ColumnInfo(name = "cloud_file_id")
    val cloudFileId: String,

    /** SAF DocumentFile 的 content:// Uri，用于读写文件 */
    @ColumnInfo(name = "document_uri")
    val documentUri: String,

    /** 在授权目录下的相对路径（与 payload.relative_path 对应） */
    @ColumnInfo(name = "relative_path")
    val relativePath: String,

    /** 已成功下载并落盘的字节数（用于断点续传） */
    @ColumnInfo(name = "downloaded_size")
    val downloadedSize: Long = 0,

    /** 下载状态：pending / downloading / completed / error */
    @ColumnInfo(name = "state")
    val state: String = "pending",

    /** 最后一次校验通过的文件 SHA-256（与 payload.file_hash 比对） */
    @ColumnInfo(name = "file_hash_verified")
    val fileHashVerified: String? = null,

    /** 最后一次下载完成（或校验通过）的时间戳 */
    @ColumnInfo(name = "downloaded_at")
    val downloadedAt: Long? = null,

    /** 最后一次下载失败的错误信息 */
    @ColumnInfo(name = "error_message")
    val errorMessage: String? = null,

    /** 本地可用性：online_only（仅云端）、local（普通本地）、offline（离线保留） */
    @ColumnInfo(name = "availability")
    val availability: String = CloudLocalAvailabilityValues.ONLINE_ONLY
)

object CloudLocalAvailabilityValues {
    const val ONLINE_ONLY = "online_only"
    const val LOCAL = "local"
    const val OFFLINE = "offline"
}
