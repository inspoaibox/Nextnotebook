package com.mucheng.notes.domain.model.payload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 网盘文件上传状态 - 与桌面端 CloudUploadState 完全一致
 */
@Serializable
enum class CloudUploadState(val value: String) {
    @SerialName("pending") PENDING("pending"),
    @SerialName("uploading") UPLOADING("uploading"),
    @SerialName("completed") COMPLETED("completed"),
    @SerialName("paused") PAUSED("paused"),
    @SerialName("error") ERROR("error");

    companion object {
        fun fromValue(value: String?): CloudUploadState? =
            value?.let { v -> entries.find { it.value == v } }
    }
}

/**
 * 网盘文件下载状态 - 与桌面端 CloudDownloadState 完全一致
 */
@Serializable
enum class CloudDownloadState(val value: String) {
    @SerialName("pending") PENDING("pending"),
    @SerialName("downloading") DOWNLOADING("downloading"),
    @SerialName("completed") COMPLETED("completed"),
    @SerialName("paused") PAUSED("paused"),
    @SerialName("error") ERROR("error");

    companion object {
        fun fromValue(value: String?): CloudDownloadState? =
            value?.let { v -> entries.find { it.value == v } }
    }
}

/**
 * 网盘文件 Payload - 与桌面端 CloudFilePayload 完全一致
 *
 * 注意：local DocumentFile 路径不参与同步，仅由 Android 端
 * CloudFileLocalPathEntity 侧表记录（保持与桌面端的 payload 兼容）
 */
@Serializable
data class CloudFilePayload(
    val filename: String = "",
    @SerialName("mime_type") val mimeType: String = "",
    val size: Long = 0L,
    @SerialName("file_hash") val fileHash: String = "",
    @SerialName("parent_folder_id") val parentFolderId: String = "root",
    @SerialName("relative_path") val relativePath: String = "",
    val mtime: Long = 0L,
    // 分块上传状态
    @SerialName("upload_state") val uploadState: String = CloudUploadState.PENDING.value,
    @SerialName("chunk_size") val chunkSize: Long = 0L,
    @SerialName("total_chunks") val totalChunks: Int = 0,
    @SerialName("uploaded_chunks") val uploadedChunks: List<Int> = emptyList(),
    @SerialName("upload_session_id") val uploadSessionId: String? = null,
    @SerialName("error_message") val errorMessage: String? = null,
    // 分块下载状态
    @SerialName("download_state") val downloadState: String = CloudDownloadState.PENDING.value,
    @SerialName("downloaded_size") val downloadedSize: Long = 0L,
    @SerialName("downloaded_at") val downloadedAt: Long? = null,
    @SerialName("download_error") val downloadError: String? = null
) {
    /** 便捷方法：读取上传状态枚举 */
    fun uploadStateEnum(): CloudUploadState =
        CloudUploadState.fromValue(uploadState) ?: CloudUploadState.PENDING

    /** 便捷方法：读取下载状态枚举 */
    fun downloadStateEnum(): CloudDownloadState =
        CloudDownloadState.fromValue(downloadState) ?: CloudDownloadState.PENDING
}
