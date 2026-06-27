package com.mucheng.notes.domain.model.payload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

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

    companion object {
        fun fromJson(json: Json, payloadJson: String): CloudFilePayload {
            return runCatching {
                json.decodeFromString<CloudFilePayload>(payloadJson)
            }.getOrElse {
                fromLooseJson(json, payloadJson)
            }
        }

        private fun fromLooseJson(json: Json, payloadJson: String): CloudFilePayload {
            val obj = json.parseToJsonElement(payloadJson).jsonObject
            return CloudFilePayload(
                filename = obj.string("filename", "name"),
                mimeType = obj.string("mime_type", "mimeType"),
                size = obj.long("size"),
                fileHash = obj.string("file_hash", "fileHash"),
                parentFolderId = obj.string("parent_folder_id", "parentFolderId").ifBlank { "root" },
                relativePath = obj.string("relative_path", "relativePath"),
                mtime = obj.long("mtime", "updated_time", "updatedTime"),
                uploadState = obj.string("upload_state", "uploadState").ifBlank { CloudUploadState.PENDING.value },
                chunkSize = obj.long("chunk_size", "chunkSize"),
                totalChunks = obj.int("total_chunks", "totalChunks"),
                uploadedChunks = obj.intList("uploaded_chunks", "uploadedChunks"),
                uploadSessionId = obj.nullableString("upload_session_id", "uploadSessionId"),
                errorMessage = obj.nullableString("error_message", "errorMessage"),
                downloadState = obj.string("download_state", "downloadState").ifBlank { CloudDownloadState.PENDING.value },
                downloadedSize = obj.long("downloaded_size", "downloadedSize"),
                downloadedAt = obj.nullableLong("downloaded_at", "downloadedAt"),
                downloadError = obj.nullableString("download_error", "downloadError"),
            )
        }

        private fun JsonObject.firstValue(vararg keys: String): JsonElement? =
            keys.firstNotNullOfOrNull { key -> this[key] }

        private fun JsonObject.string(vararg keys: String): String =
            firstValue(*keys)?.jsonPrimitive?.contentOrNull.orEmpty()

        private fun JsonObject.nullableString(vararg keys: String): String? =
            firstValue(*keys)?.jsonPrimitive?.contentOrNull

        private fun JsonObject.long(vararg keys: String): Long =
            nullableLong(*keys) ?: 0L

        private fun JsonObject.nullableLong(vararg keys: String): Long? {
            val primitive = firstValue(*keys)?.jsonPrimitive ?: return null
            return primitive.contentOrNull?.toLongOrNull()
        }

        private fun JsonObject.int(vararg keys: String): Int =
            firstValue(*keys)?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 0

        private fun JsonObject.intList(vararg keys: String): List<Int> {
            val value = firstValue(*keys) ?: return emptyList()
            return when (value) {
                is JsonArray -> value.jsonArray.mapNotNull {
                    it.jsonPrimitive.contentOrNull?.toIntOrNull()
                }
                is JsonPrimitive -> value.contentOrNull
                    ?.split(',')
                    ?.mapNotNull { it.trim().toIntOrNull() }
                    .orEmpty()
                else -> emptyList()
            }
        }
    }
}
