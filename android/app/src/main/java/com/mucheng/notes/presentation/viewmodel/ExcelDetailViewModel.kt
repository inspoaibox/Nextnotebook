package com.mucheng.notes.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mucheng.notes.domain.model.payload.ExcelNotePayload
import com.mucheng.notes.domain.model.payload.ExcelSheet
import com.mucheng.notes.domain.model.payload.ExcelRow
import com.mucheng.notes.domain.model.payload.ExcelCell
import com.mucheng.notes.domain.repository.ItemRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import javax.inject.Inject

/**
 * Excel 笔记详情 ViewModel - 用于加载和编辑单个 Excel 笔记
 */
@HiltViewModel
class ExcelDetailViewModel @Inject constructor(
    private val itemRepository: ItemRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ExcelDetailUiState())
    val uiState: StateFlow<ExcelDetailUiState> = _uiState.asStateFlow()

    private val json = Json { ignoreUnknownKeys = true }

    /**
     * 加载指定 ID 的 Excel 笔记
     */
    fun loadNote(noteId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            try {
                val item = itemRepository.getById(noteId)
                if (item != null) {
                    val payload = json.decodeFromString<ExcelNotePayload>(item.payload)
                    val note = ExcelNoteItem(
                        id = item.id,
                        payload = payload,
                        updatedAt = item.updatedTime
                    )
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        note = note,
                        selectedSheetIndex = payload.activeSheetIndex
                    )
                } else {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "笔记不存在"
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message
                )
            }
        }
    }

    /**
     * 切换工作表
     */
    fun selectSheet(index: Int) {
        _uiState.value = _uiState.value.copy(selectedSheetIndex = index)
    }

    /**
     * 选择单元格
     */
    fun selectCell(row: Int, col: Int) {
        _uiState.value = _uiState.value.copy(
            selectedCell = CellPosition(row, col)
        )
    }

    /**
     * 更新单元格值
     */
    fun updateCell(row: Int, col: Int, value: String) {
        val note = _uiState.value.note ?: return
        val sheetIndex = _uiState.value.selectedSheetIndex
        
        viewModelScope.launch {
            try {
                val sheets = note.payload.sheets.toMutableList()
                if (sheetIndex >= sheets.size) return@launch
                
                val sheet = sheets[sheetIndex]
                val rows = sheet.rows.toMutableList()
                
                // 查找或创建行
                val rowIndex = rows.indexOfFirst { it.rowIndex == row }
                val rowData = if (rowIndex >= 0) {
                    rows[rowIndex]
                } else {
                    ExcelRow(rowIndex = row, cells = emptyList()).also { rows.add(it) }
                }
                
                // 更新单元格
                val cells = rowData.cells.toMutableList()
                val cellIndex = cells.indexOfFirst { it.columnIndex == col }
                val cellValue = if (value.isEmpty()) null else {
                    value.toDoubleOrNull()?.let { JsonPrimitive(it) }
                        ?: JsonPrimitive(value)
                }
                
                val newCell = ExcelCell(
                    columnIndex = col,
                    value = cellValue,
                    formula = if (value.startsWith("=")) value else null,
                    style = cells.getOrNull(cellIndex)?.style
                )
                
                if (cellIndex >= 0) {
                    cells[cellIndex] = newCell
                } else {
                    cells.add(newCell)
                }
                
                // 更新行
                val newRow = rowData.copy(cells = cells)
                if (rowIndex >= 0) {
                    rows[rowIndex] = newRow
                }
                
                // 更新工作表
                sheets[sheetIndex] = sheet.copy(rows = rows)
                
                // 更新 payload
                val newPayload = note.payload.copy(sheets = sheets)
                val payloadJson = json.encodeToString(ExcelNotePayload.serializer(), newPayload)
                
                // 保存到数据库
                itemRepository.update(note.id, payloadJson)
                
                // 更新 UI 状态
                val newNote = note.copy(payload = newPayload)
                _uiState.value = _uiState.value.copy(note = newNote)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            }
        }
    }

    /**
     * 获取单元格显示值
     */
    fun getCellDisplayValue(sheet: ExcelSheet, row: Int, col: Int): String {
        val rowData = sheet.rows.find { it.rowIndex == row } ?: return ""
        val cell = rowData.cells.find { it.columnIndex == col } ?: return ""
        
        val value = cell.value ?: return ""
        return when (value) {
            is JsonNull -> ""
            is JsonPrimitive -> {
                value.doubleOrNull?.toString()
                    ?: value.booleanOrNull?.let { if (it) "TRUE" else "FALSE" }
                    ?: value.content
            }
            else -> value.toString()
        }
    }

    /**
     * 清除错误
     */
    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }
}

/**
 * Excel 详情 UI 状态
 */
data class ExcelDetailUiState(
    val isLoading: Boolean = false,
    val note: ExcelNoteItem? = null,
    val selectedSheetIndex: Int = 0,
    val selectedCell: CellPosition = CellPosition(0, 0),
    val error: String? = null
)
