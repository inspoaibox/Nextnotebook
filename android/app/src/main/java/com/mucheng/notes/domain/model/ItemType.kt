package com.mucheng.notes.domain.model

/**
 * 数据类型枚举 - 与桌面端 ItemType 完全一致
 */
enum class ItemType(val value: String) {
    NOTE("note"),
    FOLDER("folder"),
    TAG("tag"),
    RESOURCE("resource"),
    TODO("todo"),
    VAULT_ENTRY("vault_entry"),
    VAULT_FOLDER("vault_folder"),
    BOOKMARK("bookmark"),
    BOOKMARK_FOLDER("bookmark_folder"),
    DIAGRAM("diagram"),
    AI_CONFIG("ai_config"),
    AI_CONVERSATION("ai_conversation"),
    AI_MESSAGE("ai_message");

    companion object {
        /**
         * 敏感数据类型 - 这些类型始终需要加密同步
         */
        val SENSITIVE_TYPES = setOf(VAULT_ENTRY, VAULT_FOLDER, AI_CONFIG)

        fun fromValue(value: String): ItemType? {
            return entries.find { it.value == value }
        }
    }
}

// SyncStatus 定义在 SyncConfig.kt 中，请使用 com.mucheng.notes.domain.model.SyncConfig.SyncStatus
