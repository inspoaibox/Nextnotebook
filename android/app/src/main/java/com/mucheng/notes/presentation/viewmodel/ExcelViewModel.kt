package com.mucheng.notes.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mucheng.notes.domain.model.ItemType
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
 * Excel 笔记 ViewModel
 */
@HiltViewModel
class ExcelViewModel @Inject constructor(
    private val itemRepository: ItemRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ExcelUiState())
    val uiState: StateFlow<ExcelUiState> = _uiState.asStateFlow()

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    init {
        loadExcelNotes()
    }

    /**
     * 加载所有 Excel 笔记
     */
    fun loadExcelNotes() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            try {
                val items = itemRepository.getByTypeOnce(ItemType.EXCEL_NOTE)
                val notes = items.mapNotNull { item ->
                    try {
                        val payload = json.decodeFromString<ExcelNotePayload>(item.payload)
                        
                        // 修复：如果 sheets 为空，创建默认工作表
                        val fixedPayload = if (payload.sheets.isEmpty()) {
                            android.util.Log.w("ExcelViewModel", "Note ${item.id} has empty sheets, creating default")
                            payload.copy(
                                sheets = listOf(
                                    ExcelSheet(
                                        id = java.util.UUID.randomUUID().toString(),
                                        name = "Sheet1",
                                        rows = emptyList(),
                                        columnWidths = emptyList(),
                                        rowHeights = emptyList()
                                    )
                                ),
                                activeSheetIndex = 0
                            )
                        } else {
                            payload
                        }
                        
                        ExcelNoteItem(
                            id = item.id,
                            payload = fixedPayload,
                            updatedAt = item.updatedTime
                        )
                    } catch (e: Exception) {
                        android.util.Log.e("ExcelViewModel", "Failed to parse note ${item.id}: ${e.message}")
                        null
                    }
                }
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    notes = notes
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message
                )
            }
        }
    }

    /**
     * 选择笔记（进入预览模式）
     */
    fun selectNote(noteId: String) {
        val note = _uiState.value.notes.find { it.id == noteId }
        _uiState.value = _uiState.value.copy(
            selectedNote = note,
            selectedSheetIndex = note?.payload?.activeSheetIndex ?: 0,
            selectedCell = CellPosition(0, 0),
            isEditing = false  // 默认进入预览模式
        )
    }

    /**
     * 进入编辑模式
     */
    fun enterEditMode() {
        _uiState.value = _uiState.value.copy(isEditing = true)
    }

    /**
     * 退出编辑模式（回到预览）
     */
    fun exitEditMode() {
        _uiState.value = _uiState.value.copy(isEditing = false)
    }

    /**
     * 返回列表
     */
    fun backToList() {
        _uiState.value = _uiState.value.copy(selectedNote = null, isEditing = false)
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
        val note = _uiState.value.selectedNote ?: return
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
                _uiState.value = _uiState.value.copy(
                    selectedNote = newNote,
                    notes = _uiState.value.notes.map { if (it.id == note.id) newNote else it }
                )
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
 * Excel UI 状态
 */
data class ExcelUiState(
    val isLoading: Boolean = false,
    val notes: List<ExcelNoteItem> = emptyList(),
    val selectedNote: ExcelNoteItem? = null,
    val selectedSheetIndex: Int = 0,
    val selectedCell: CellPosition = CellPosition(0, 0),
    val isEditing: Boolean = false,  // false=预览模式，true=编辑模式
    val error: String? = null
)

/**
 * Excel 笔记项
 */
data class ExcelNoteItem(
    val id: String,
    val payload: ExcelNotePayload,
    val updatedAt: Long
)

/**
 * 单元格位置
 */
data class CellPosition(
    val row: Int,
    val col: Int
)
