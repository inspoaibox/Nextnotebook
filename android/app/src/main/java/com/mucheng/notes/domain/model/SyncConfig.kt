package com.mucheng.notes.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 同步模块配置 - 与桌面端 SyncModules 完全一致
 */
@Serializable
data class SyncModules(
    val notes: Boolean = true,      // 笔记 + 文件夹 + 标签 + 附件
    val bookmarks: Boolean = true,  // 书签 + 书签文件夹
    val vault: Boolean = true,      // 密码库条目 + 密码库文件夹
    val diagrams: Boolean = true,   // 脑图/流程图/白板
    val todos: Boolean = true,      // 待办事项
    val ai: Boolean = true          // AI 配置 + 对话 + 消息
)

/**
 * 同步配置 - 与桌面端 SyncConfig 完全一致
 */
@Serializable
data class SyncConfig(
    val enabled: Boolean = false,
    val type: String = "webdav", // "webdav" | "server"
    val url: String = "",
    @SerialName("sync_path") val syncPath: String = "/mucheng-notes",
    val username: String? = null,
    val password: String? = null,
    @SerialName("api_key") val apiKey: String? = null, // 用于 server 类型同步
    @SerialName("encryption_enabled") val encryptionEnabled: Boolean = true,
    @SerialName("sync_interval") val syncInterval: Int = 5, // minutes
    @SerialName("last_sync_time") val lastSyncTime: Long? = null,
    @SerialName("sync_cursor") val syncCursor: String? = null,
    @SerialName("sync_modules") val syncModules: SyncModules = SyncModules()
)

/**
 * 模块到 ItemType 的映射（与桌面端一致）
 */
object SyncModuleTypes {
    val NOTES = listOf("note", "folder", "tag", "resource")
    val BOOKMARKS = listOf("bookmark", "bookmark_folder")
    val VAULT = listOf("vault_entry", "vault_folder")
    val DIAGRAMS = listOf("diagram")
    val TODOS = listOf("todo")
    val AI = listOf("ai_config", "ai_conversation", "ai_message")
    
    /**
     * 根据同步模块配置获取需要同步的类型列表
     */
    fun getEnabledTypes(modules: SyncModules): List<String> {
        val types = mutableListOf<String>()
        if (modules.notes) types.addAll(NOTES)
        if (modules.bookmarks) types.addAll(BOOKMARKS)
        if (modules.vault) types.addAll(VAULT)
        if (modules.diagrams) types.addAll(DIAGRAMS)
        if (modules.todos) types.addAll(TODOS)
        if (modules.ai) types.addAll(AI)
        return types
    }
}

/**
 * 同步状态
 */
enum class SyncStatus {
    IDLE,       // 空闲
    SYNCING,    // 同步中
    SUCCESS,    // 同步成功
    FAILED,     // 同步失败
    ERROR,      // 同步错误（兼容 UI 组件）
    OFFLINE     // 离线
}

/**
 * 同步结果
 */
data class SyncResult(
    val success: Boolean = false,
    val pushed: Int = 0,
    val pulled: Int = 0,
    val conflicts: Int = 0,
    val error: String? = null,
    val duration: Long = 0
)
