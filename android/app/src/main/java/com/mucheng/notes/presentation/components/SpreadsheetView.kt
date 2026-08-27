package com.mucheng.notes.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mucheng.notes.domain.model.payload.ExcelCell
import com.mucheng.notes.domain.model.payload.ExcelSheet
import com.mucheng.notes.domain.model.payload.MergedCell
import com.mucheng.notes.presentation.viewmodel.CellPosition
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * 电子表格视图组件
 * @param readOnly 只读预览模式，只渲染有数据的区域
 */
@Composable
fun SpreadsheetView(
    sheet: ExcelSheet,
    selectedCell: CellPosition,
    onCellSelect: (Int, Int) -> Unit,
    onCellChange: (Int, Int, String) -> Unit,
    getCellDisplayValue: (Int, Int) -> String,
    modifier: Modifier = Modifier,
    readOnly: Boolean = false
) {
    val horizontalScrollState = rememberScrollState()
    val headerWidth = 50.dp
    val headerHeight = 36.dp
    val hiddenRows = remember(sheet.hiddenRows) { sheet.hiddenRows.toSet() }
    val hiddenColumns = remember(sheet.hiddenColumns) { sheet.hiddenColumns.toSet() }
    val cellsByPosition = remember(sheet.rows) {
        sheet.rows.flatMap { row ->
            row.cells.map { cell -> (row.rowIndex to cell.columnIndex) to cell }
        }.toMap()
    }

    // 计算实际有数据的行列范围，只读模式下只渲染有数据的区域
    val maxDataRow = if (sheet.rows.isEmpty()) 0 else sheet.rows.maxOf { it.rowIndex } + 1
    val maxDataCol = if (sheet.rows.isEmpty()) 0 else sheet.rows.flatMap { it.cells }.maxOfOrNull { it.columnIndex + 1 } ?: 0
    val maxMergedRow = sheet.mergedCells.maxOfOrNull { it.endRow + 1 } ?: 0
    val maxMergedCol = sheet.mergedCells.maxOfOrNull { it.endCol + 1 } ?: 0

    // 只读模式：只显示有数据的区域（最少显示 5 行 5 列）
    // 编辑模式：显示 50 行 26 列
    val visibleRows = if (readOnly) maxOf(maxDataRow, maxMergedRow, 5) else 50
    val visibleCols = if (readOnly) maxOf(maxDataCol, maxMergedCol, 5) else 26
    val rowIndexes = (0 until visibleRows).filter { it !in hiddenRows }
    val columnIndexes = (0 until visibleCols).filter { it !in hiddenColumns }

    Column(modifier = modifier.fillMaxSize()) {
        // 列头
        Row(
            modifier = Modifier
                .horizontalScroll(horizontalScrollState)
                .background(MaterialTheme.colorScheme.surfaceVariant)
        ) {
            // 左上角空白
            Box(
                modifier = Modifier
                    .size(headerWidth, headerHeight)
                    .border(0.5.dp, MaterialTheme.colorScheme.outline)
            )

            // 列标题 (A, B, C, ...)
            for (col in columnIndexes) {
                Box(
                    modifier = Modifier
                        .width(cellWidth(sheet, col))
                        .height(headerHeight)
                        .border(0.5.dp, MaterialTheme.colorScheme.outline),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = columnToLetter(col),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        // 数据行
        LazyColumn(
            modifier = Modifier.fillMaxSize()
        ) {
            items(rowIndexes) { row ->
                val rowHeight = cellHeight(sheet, row)
                Row(
                    modifier = Modifier.horizontalScroll(horizontalScrollState)
                ) {
                    // 行号
                    Box(
                        modifier = Modifier
                            .width(headerWidth)
                            .height(rowHeight)
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .border(0.5.dp, MaterialTheme.colorScheme.outline),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = (row + 1).toString(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    // 数据单元格
                    var columnPosition = 0
                    while (columnPosition < columnIndexes.size) {
                        val col = columnIndexes[columnPosition]
                        val merge = findMerge(sheet, row, col)
                        val isMergeStart = merge != null && merge.startRow == row && merge.startCol == col
                        val isCoveredByPreviousRow = merge != null && row > merge.startRow && col == merge.startCol

                        when {
                            isMergeStart -> {
                                val spanWidth = mergedWidth(sheet, columnIndexes, columnPosition, merge!!)
                                val spanCount = mergedVisibleColumnCount(columnIndexes, columnPosition, merge)
                                val cell = cellsByPosition[row to col]
                                SpreadsheetCell(
                                    value = getCellDisplayValue(row, col),
                                    visualStyle = parseCellVisualStyle(cell),
                                    isSelected = selectedCell.row == row && selectedCell.col == col,
                                    onClick = { onCellSelect(row, col) },
                                    onValueChange = { onCellChange(row, col, it) },
                                    modifier = Modifier.width(spanWidth).height(rowHeight),
                                    readOnly = readOnly
                                )
                                columnPosition += spanCount
                            }
                            isCoveredByPreviousRow -> {
                                val spanWidth = mergedWidth(sheet, columnIndexes, columnPosition, merge!!)
                                val spanCount = mergedVisibleColumnCount(columnIndexes, columnPosition, merge)
                                Box(
                                    modifier = Modifier
                                        .width(spanWidth)
                                        .height(rowHeight)
                                        .background(MaterialTheme.colorScheme.surface)
                                        .border(0.5.dp, MaterialTheme.colorScheme.outline)
                                )
                                columnPosition += spanCount
                            }
                            merge != null -> {
                                columnPosition += 1
                            }
                            else -> {
                                val cell = cellsByPosition[row to col]
                                SpreadsheetCell(
                                    value = getCellDisplayValue(row, col),
                                    visualStyle = parseCellVisualStyle(cell),
                                    isSelected = selectedCell.row == row && selectedCell.col == col,
                                    onClick = { onCellSelect(row, col) },
                                    onValueChange = { onCellChange(row, col, it) },
                                    modifier = Modifier.width(cellWidth(sheet, col)).height(rowHeight),
                                    readOnly = readOnly
                                )
                                columnPosition += 1
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * 单元格组件
 */
@Composable
private fun SpreadsheetCell(
    value: String,
    visualStyle: SpreadsheetCellVisualStyle,
    isSelected: Boolean,
    onClick: () -> Unit,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    readOnly: Boolean = false
) {
    var isEditing by remember { mutableStateOf(false) }
    var editValue by remember(value) { mutableStateOf(value) }
    val focusRequester = remember { FocusRequester() }

    Box(
        modifier = modifier
            .border(
                width = if (isSelected && !readOnly) 2.dp else 0.5.dp,
                color = if (isSelected && !readOnly) MaterialTheme.colorScheme.primary
                        else visualStyle.borderColor ?: MaterialTheme.colorScheme.outline
            )
            .background(
                if (isSelected && !readOnly) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                else visualStyle.backgroundColor ?: MaterialTheme.colorScheme.surface
            )
            .clickable {
                if (!readOnly) {
                    onClick()
                    if (isSelected) isEditing = true
                }
            }
            .padding(4.dp),
        contentAlignment = visualStyle.contentAlignment
    ) {
        if (isEditing && isSelected && !readOnly) {
            BasicTextField(
                value = editValue,
                onValueChange = { editValue = it },
                modifier = Modifier
                    .fillMaxSize()
                    .focusRequester(focusRequester)
                    .onFocusChanged { state ->
                        if (!state.isFocused && isEditing) {
                            isEditing = false
                            if (editValue != value) onValueChange(editValue)
                        }
                    },
                textStyle = TextStyle(
                    fontSize = visualStyle.fontSizeSp?.sp ?: 14.sp,
                    fontWeight = if (visualStyle.fontBold) FontWeight.Bold else FontWeight.Normal,
                    fontStyle = if (visualStyle.fontItalic) FontStyle.Italic else FontStyle.Normal,
                    textDecoration = visualStyle.textDecoration,
                    textAlign = visualStyle.textAlign,
                    color = visualStyle.fontColor ?: MaterialTheme.colorScheme.onSurface
                ),
                singleLine = true
            )
            LaunchedEffect(Unit) { focusRequester.requestFocus() }
        } else {
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontSize = visualStyle.fontSizeSp?.sp ?: MaterialTheme.typography.bodyMedium.fontSize,
                    fontWeight = if (visualStyle.fontBold) FontWeight.Bold else FontWeight.Normal,
                    fontStyle = if (visualStyle.fontItalic) FontStyle.Italic else FontStyle.Normal,
                    textDecoration = visualStyle.textDecoration,
                    textAlign = visualStyle.textAlign
                ),
                maxLines = if (readOnly && visualStyle.wrapText) 4 else 1,
                overflow = if (readOnly && visualStyle.wrapText) TextOverflow.Clip else TextOverflow.Ellipsis,
                color = visualStyle.fontColor ?: MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

private data class SpreadsheetCellVisualStyle(
    val fontBold: Boolean = false,
    val fontItalic: Boolean = false,
    val fontSizeSp: Float? = null,
    val fontColor: Color? = null,
    val backgroundColor: Color? = null,
    val textAlign: TextAlign = TextAlign.Start,
    val contentAlignment: Alignment = Alignment.CenterStart,
    val textDecoration: TextDecoration = TextDecoration.None,
    val wrapText: Boolean = false,
    val borderColor: Color? = null
)

private fun parseCellVisualStyle(cell: ExcelCell?): SpreadsheetCellVisualStyle {
    val style = cell?.style?.jsonObjectOrNull() ?: return SpreadsheetCellVisualStyle()
    val textAlignValue = style["text_align"]?.jsonPrimitive?.contentOrNull ?: "left"
    val verticalAlignValue = style["vertical_align"]?.jsonPrimitive?.contentOrNull ?: "middle"
    val underline = style["underline"]?.jsonPrimitive?.booleanOrNull == true
    val strikethrough = style["strikethrough"]?.jsonPrimitive?.booleanOrNull == true

    return SpreadsheetCellVisualStyle(
        fontBold = style["font_bold"]?.jsonPrimitive?.booleanOrNull == true,
        fontItalic = style["font_italic"]?.jsonPrimitive?.booleanOrNull == true,
        fontSizeSp = style["font_size"]?.jsonPrimitive?.doubleOrNull?.toFloat()?.coerceIn(8f, 32f),
        fontColor = parseColor(style["font_color"]?.jsonPrimitive?.contentOrNull),
        backgroundColor = parseColor(style["background_color"]?.jsonPrimitive?.contentOrNull),
        textAlign = when (textAlignValue) {
            "center" -> TextAlign.Center
            "right" -> TextAlign.End
            else -> TextAlign.Start
        },
        contentAlignment = contentAlignment(textAlignValue, verticalAlignValue),
        textDecoration = when {
            underline && strikethrough -> TextDecoration.combine(listOf(TextDecoration.Underline, TextDecoration.LineThrough))
            underline -> TextDecoration.Underline
            strikethrough -> TextDecoration.LineThrough
            else -> TextDecoration.None
        },
        wrapText = style["wrap_text"]?.jsonPrimitive?.booleanOrNull == true,
        borderColor = parseColor(style["border_color"]?.jsonPrimitive?.contentOrNull)
    )
}

private fun contentAlignment(horizontal: String, vertical: String): Alignment {
    return when (vertical) {
        "top" -> when (horizontal) {
            "center" -> Alignment.TopCenter
            "right" -> Alignment.TopEnd
            else -> Alignment.TopStart
        }
        "bottom" -> when (horizontal) {
            "center" -> Alignment.BottomCenter
            "right" -> Alignment.BottomEnd
            else -> Alignment.BottomStart
        }
        else -> when (horizontal) {
            "center" -> Alignment.Center
            "right" -> Alignment.CenterEnd
            else -> Alignment.CenterStart
        }
    }
}

private fun parseColor(value: String?): Color? {
    val raw = value?.trim().orEmpty()
    if (raw.isEmpty()) return null

    val normalized = when {
        raw.startsWith("#") -> raw
        raw.matches(Regex("^[0-9a-fA-F]{6}$")) -> "#$raw"
        raw.matches(Regex("^[0-9a-fA-F]{8}$")) -> "#$raw"
        raw.startsWith("rgb", ignoreCase = true) -> {
            val numbers = Regex("\\d+").findAll(raw).map { it.value.toInt().coerceIn(0, 255) }.toList()
            if (numbers.size < 3) return null
            "#%02x%02x%02x".format(numbers[0], numbers[1], numbers[2])
        }
        else -> return null
    }

    return runCatching { Color(android.graphics.Color.parseColor(normalized)) }.getOrNull()
}

private fun cellWidth(sheet: ExcelSheet, col: Int): Dp =
    sheet.getColumnWidth(col).coerceIn(56.0, 260.0).dp

private fun cellHeight(sheet: ExcelSheet, row: Int): Dp =
    sheet.getRowHeight(row).coerceIn(28.0, 160.0).dp

private fun findMerge(sheet: ExcelSheet, row: Int, col: Int): MergedCell? =
    sheet.mergedCells.firstOrNull {
        row in it.startRow..it.endRow && col in it.startCol..it.endCol
    }

private fun mergedVisibleColumnCount(
    columns: List<Int>,
    startPosition: Int,
    merge: MergedCell
): Int {
    var count = 0
    var position = startPosition
    while (position < columns.size && columns[position] <= merge.endCol) {
        if (columns[position] >= merge.startCol) {
            count += 1
        }
        position += 1
    }
    return count.coerceAtLeast(1)
}

private fun mergedWidth(
    sheet: ExcelSheet,
    columns: List<Int>,
    startPosition: Int,
    merge: MergedCell
): Dp {
    var width = 0.dp
    var position = startPosition
    while (position < columns.size && columns[position] <= merge.endCol) {
        if (columns[position] >= merge.startCol) {
            width += cellWidth(sheet, columns[position])
        }
        position += 1
    }
    return if (width > 0.dp) width else cellWidth(sheet, columns[startPosition])
}

/**
 * 列索引转字母
 */
private fun columnToLetter(col: Int): String {
    var result = ""
    var n = col
    while (n >= 0) {
        result = ('A' + (n % 26)) + result
        n = n / 26 - 1
    }
    return result
}

private fun JsonElement.jsonObjectOrNull() = runCatching { jsonObject }.getOrNull()
