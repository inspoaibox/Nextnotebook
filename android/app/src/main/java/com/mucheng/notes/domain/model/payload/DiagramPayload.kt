package com.mucheng.notes.domain.model.payload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 图表类型 - 与桌面端 DiagramType 完全一致
 */
@Serializable
enum class DiagramType {
    @SerialName("mindmap")
    MINDMAP,
    
    @SerialName("flowchart")
    FLOWCHART,
    
    @SerialName("whiteboard")
    WHITEBOARD
}

/**
 * 图表 Payload - 与桌面端 DiagramPayload 完全一致
 */
@Serializable
data class DiagramPayload(
    val name: String,
    @SerialName("diagram_type") val diagramType: DiagramType,
    val data: String, // JSON 格式的图表数据
    val thumbnail: String? = null, // Base64 缩略图
    @SerialName("folder_id") val folderId: String? = null
)
