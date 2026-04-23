package com.mucheng.notes.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mucheng.notes.domain.model.payload.ExcelSheet
import com.mucheng.notes.presentation.viewmodel.CellPosition

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
    val cellWidth = 100.dp
    val cellHeight = 36.dp
    val headerWidth = 50.dp
    val headerHeight = 36.dp

    // 计算实际有数据的行列范围，只读模式下只渲染有数据的区域
    val maxDataRow = if (sheet.rows.isEmpty()) 0
        else sheet.rows.maxOf { it.rowIndex } + 1
    val maxDataCol = if (sheet.rows.isEmpty()) 0
        else sheet.rows.flatMap { it.cells }.maxOfOrNull { it.columnIndex + 1 } ?: 0

    // 只读模式：只显示有数据的区域（最少显示 5 行 5 列）
    // 编辑模式：显示 50 行 26 列
    val visibleRows = if (readOnly) maxOf(maxDataRow, 5) else 50
    val visibleCols = if (readOnly) maxOf(maxDataCol, 5) else 26

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
            for (col in 0 until visibleCols) {
                Box(
                    modifier = Modifier
                        .size(cellWidth, headerHeight)
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
            items(visibleRows) { row ->
                Row(
                    modifier = Modifier.horizontalScroll(horizontalScrollState)
                ) {
                    // 行号
                    Box(
                        modifier = Modifier
                            .size(headerWidth, cellHeight)
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
                    for (col in 0 until visibleCols) {
                        SpreadsheetCell(
                            value = getCellDisplayValue(row, col),
                            isSelected = selectedCell.row == row && selectedCell.col == col,
                            onClick = { onCellSelect(row, col) },
                            onValueChange = { onCellChange(row, col, it) },
                            modifier = Modifier.size(cellWidth, cellHeight),
                            readOnly = readOnly
                        )
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
                        else MaterialTheme.colorScheme.outline
            )
            .background(
                if (isSelected && !readOnly) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                else MaterialTheme.colorScheme.surface
            )
            .clickable {
                if (!readOnly) {
                    onClick()
                    if (isSelected) isEditing = true
                }
            }
            .padding(4.dp),
        contentAlignment = Alignment.CenterStart
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
                textStyle = TextStyle(fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface),
                singleLine = true
            )
            LaunchedEffect(Unit) { focusRequester.requestFocus() }
        } else {
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
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
