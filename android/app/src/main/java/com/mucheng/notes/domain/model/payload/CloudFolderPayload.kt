package com.mucheng.notes.domain.model.payload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 网盘文件夹 Payload - 与桌面端 CloudFolderPayload 完全一致
 */
@Serializable
data class CloudFolderPayload(
    val name: String = "",
    @SerialName("parent_folder_id") val parentFolderId: String? = null,
    @SerialName("relative_path") val relativePath: String = ""
)
