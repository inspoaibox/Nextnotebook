package com.mucheng.notes.domain.model.payload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 笔记 Payload - 与桌面端 NotePayload 完全一致
 */
@Serializable
data class NotePayload(
    val title: String,
    val content: String,
    @SerialName("folder_id") val folderId: String? = null,
    @SerialName("is_pinned") val isPinned: Boolean = false,
    @SerialName("is_locked") val isLocked: Boolean = false,
    @SerialName("lock_password_hash") val lockPasswordHash: String? = null,
    val tags: List<String> = emptyList()
)

/**
 * 文件夹 Payload - 与桌面端 FolderPayload 完全一致
 */
@Serializable
data class FolderPayload(
    val name: String,
    @SerialName("parent_id") val parentId: String? = null,
    val icon: String? = null,
    val color: String? = null
)

/**
 * 标签 Payload - 与桌面端 TagPayload 完全一致
 */
@Serializable
data class TagPayload(
    val name: String,
    val color: String? = null
)
