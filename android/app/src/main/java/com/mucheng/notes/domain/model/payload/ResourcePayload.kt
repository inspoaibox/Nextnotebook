package com.mucheng.notes.domain.model.payload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 资源文件 Payload - 与桌面端 ResourcePayload 完全一致
 * 
 * 注意: local_path 不参与同步，仅在本地使用
 * Android 端使用单独的 resource_cache 表管理本地缓存路径
 */
@Serializable
data class ResourcePayload(
    val filename: String,
    @SerialName("mime_type") val mimeType: String,
    val size: Long,
    @SerialName("note_id") val noteId: String,
    @SerialName("file_hash") val fileHash: String
)
