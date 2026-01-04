package com.mucheng.notes.domain.model.payload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 待办事项四象限类型 - 与桌面端 TodoQuadrant 完全一致
 */
@Serializable
enum class TodoQuadrant {
    @SerialName("urgent-important")
    URGENT_IMPORTANT,
    
    @SerialName("not-urgent-important")
    NOT_URGENT_IMPORTANT,
    
    @SerialName("urgent-not-important")
    URGENT_NOT_IMPORTANT,
    
    @SerialName("not-urgent-not-important")
    NOT_URGENT_NOT_IMPORTANT
}

/**
 * 待办事项 Payload - 与桌面端 TodoPayload 完全一致
 */
@Serializable
data class TodoPayload(
    val title: String,
    val description: String = "",
    val quadrant: TodoQuadrant,
    val completed: Boolean = false,
    @SerialName("completed_at") val completedAt: Long? = null,
    @SerialName("due_date") val dueDate: Long? = null,
    @SerialName("reminder_time") val reminderTime: Long? = null,
    @SerialName("reminder_enabled") val reminderEnabled: Boolean = false,
    val priority: Int = 0,
    val tags: List<String> = emptyList()
)
