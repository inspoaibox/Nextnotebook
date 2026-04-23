package com.mucheng.notes.domain.model.payload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Excel 笔记 Payload - 与桌面端 ExcelNotePayload 完全一致
 */
@Serializable
data class ExcelNotePayload(
    val title: String = "",
    val description: String = "",
    @SerialName("folder_id") val folderId: String? = null,
    @SerialName("is_pinned") val isPinned: Boolean = false,
    @SerialName("is_locked") val isLocked: Boolean = false,
    @SerialName("lock_password_hash") val lockPasswordHash: String? = null,
    val tags: List<String> = emptyList(),
    val sheets: List<ExcelSheet> = emptyList(),
    @SerialName("active_sheet_index") val activeSheetIndex: Int = 0
)

/**
 * Excel 工作表
 */
@Serializable
data class ExcelSheet(
    val id: String = "",
    val name: String = "",
    val rows: List<ExcelRow> = emptyList(),
    // 用 JsonElement 兼容桌面端整数/浮点数混用（如 100 和 120.5）
    @SerialName("column_widths") val columnWidths: List<JsonElement> = emptyList(),
    @SerialName("row_heights") val rowHeights: List<JsonElement> = emptyList(),
    @SerialName("frozen_rows") val frozenRows: Int = 0,
    @SerialName("frozen_columns") val frozenColumns: Int = 0,
    @SerialName("merged_cells") val mergedCells: List<MergedCell> = emptyList()
) {
    /** 获取列宽（Double），兼容整数和浮点数 */
    fun getColumnWidth(index: Int): Double =
        columnWidths.getOrNull(index)?.jsonPrimitive?.doubleOrNull ?: 100.0

    /** 获取行高（Double），兼容整数和浮点数 */
    fun getRowHeight(index: Int): Double =
        rowHeights.getOrNull(index)?.jsonPrimitive?.doubleOrNull ?: 25.0
}

/**
 * 合并单元格区域
 */
@Serializable
data class MergedCell(
    @SerialName("start_row") val startRow: Int = 0,
    @SerialName("start_col") val startCol: Int = 0,
    @SerialName("end_row") val endRow: Int = 0,
    @SerialName("end_col") val endCol: Int = 0
)

/**
 * Excel 行
 */
@Serializable
data class ExcelRow(
    @SerialName("row_index") val rowIndex: Int = 0,
    val cells: List<ExcelCell> = emptyList()
)

/**
 * Excel 单元格
 */
@Serializable
data class ExcelCell(
    @SerialName("column_index") val columnIndex: Int = 0,
    // JsonElement 兼容 string | number | boolean | null
    val value: JsonElement? = null,
    val formula: String? = null,
    // CellStyle 用 JsonElement 避免 NumberFormat sealed class 解析问题
    val style: JsonElement? = null
)
