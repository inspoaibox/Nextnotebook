package com.mucheng.notes.domain.model.payload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Excel 笔记 Payload - 与桌面端 ExcelNotePayload 完全一致
 */
@Serializable
data class ExcelNotePayload(
    val title: String,
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
    val id: String,
    val name: String,
    val rows: List<ExcelRow> = emptyList(),
    @SerialName("column_widths") val columnWidths: List<Int> = emptyList(),
    @SerialName("row_heights") val rowHeights: List<Int> = emptyList(),
    @SerialName("frozen_rows") val frozenRows: Int = 0,
    @SerialName("frozen_columns") val frozenColumns: Int = 0
)

/**
 * Excel 行
 */
@Serializable
data class ExcelRow(
    @SerialName("row_index") val rowIndex: Int,
    val cells: List<ExcelCell> = emptyList()
)

/**
 * Excel 单元格
 */
@Serializable
data class ExcelCell(
    @SerialName("column_index") val columnIndex: Int,
    val value: kotlinx.serialization.json.JsonElement? = null,  // 直接使用 JsonElement 以兼容桌面端的 string | number | boolean | null
    val formula: String? = null,
    val style: CellStyle? = null
)

/**
 * 单元格样式
 */
@Serializable
data class CellStyle(
    @SerialName("font_bold") val fontBold: Boolean = false,
    @SerialName("font_italic") val fontItalic: Boolean = false,
    @SerialName("font_color") val fontColor: String? = null,
    @SerialName("background_color") val backgroundColor: String? = null,
    @SerialName("text_align") val textAlign: String = "left",
    @SerialName("vertical_align") val verticalAlign: String = "middle",
    @SerialName("number_format") val numberFormat: NumberFormat? = null
)

/**
 * 数字格式
 */
@Serializable
sealed class NumberFormat {
    @Serializable
    @SerialName("general")
    object General : NumberFormat()
    
    @Serializable
    @SerialName("number")
    data class Number(val decimals: Int = 2) : NumberFormat()
    
    @Serializable
    @SerialName("percentage")
    data class Percentage(val decimals: Int = 2) : NumberFormat()
    
    @Serializable
    @SerialName("currency")
    data class Currency(val symbol: String = "¥", val decimals: Int = 2) : NumberFormat()
    
    @Serializable
    @SerialName("date")
    data class Date(val pattern: String = "YYYY-MM-DD") : NumberFormat()
}
