package com.mucheng.notes.domain.model.payload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 书签 Payload - 与桌面端 BookmarkPayload 完全一致
 */
@Serializable
data class BookmarkPayload(
    val name: String,
    val url: String,
    val description: String = "",
    @SerialName("folder_id") val folderId: String? = null,
    val icon: String? = null,
    val tags: List<String> = emptyList()
)

/**
 * 书签文件夹 Payload - 与桌面端 BookmarkFolderPayload 完全一致
 */
@Serializable
data class BookmarkFolderPayload(
    val name: String,
    @SerialName("parent_id") val parentId: String? = null
)
