package com.mucheng.notes.presentation.screens.excel

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.mucheng.notes.presentation.components.SpreadsheetView
import com.mucheng.notes.presentation.viewmodel.ExcelViewModel
import com.mucheng.notes.presentation.viewmodel.ExcelNoteItem

/**
 * Excel 笔记主屏幕
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExcelScreen(
    viewModel: ExcelViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsState()

    // 错误提示
    uiState.error?.let { error ->
        LaunchedEffect(error) {
            // 显示错误后清除
            viewModel.clearError()
        }
    }

    if (uiState.selectedNote != null) {
        // 编辑器视图
        ExcelEditorView(
            note = uiState.selectedNote!!,
            selectedSheetIndex = uiState.selectedSheetIndex,
            selectedCell = uiState.selectedCell,
            onBack = { viewModel.backToList() },
            onSelectSheet = { viewModel.selectSheet(it) },
            onSelectCell = { row, col -> viewModel.selectCell(row, col) },
            onCellChange = { row, col, value -> viewModel.updateCell(row, col, value) },
            getCellDisplayValue = { row, col ->
                val sheet = uiState.selectedNote?.payload?.sheets?.getOrNull(uiState.selectedSheetIndex)
                sheet?.let { viewModel.getCellDisplayValue(it, row, col) } ?: ""
            }
        )
    } else {
        // 列表视图
        ExcelListView(
            notes = uiState.notes,
            isLoading = uiState.isLoading,
            onSelectNote = { viewModel.selectNote(it.id) },
            onNavigateBack = onNavigateBack
        )
    }
}

/**
 * Excel 笔记列表视图
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExcelListView(
    notes: List<ExcelNoteItem>,
    isLoading: Boolean,
    onSelectNote: (ExcelNoteItem) -> Unit,
    onNavigateBack: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Excel 笔记") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center)
                )
            } else if (notes.isEmpty()) {
                Column(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        Icons.Default.TableChart,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.outline
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "暂无 Excel 笔记",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(notes) { note ->
                        ExcelNoteCard(
                            note = note,
                            onClick = { onSelectNote(note) }
                        )
                    }
                }
            }
        }
    }
}

/**
 * Excel 笔记卡片
 */
@Composable
private fun ExcelNoteCard(
    note: ExcelNoteItem,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.TableChart,
                contentDescription = null,
                modifier = Modifier.size(40.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = note.payload.title.ifEmpty { "未命名" },
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "${note.payload.sheets.size} 个工作表",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
                )
            }
            Icon(
                Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outline
            )
        }
    }
}

/**
 * Excel 编辑器视图
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExcelEditorView(
    note: ExcelNoteItem,
    selectedSheetIndex: Int,
    selectedCell: com.mucheng.notes.presentation.viewmodel.CellPosition,
    onBack: () -> Unit,
    onSelectSheet: (Int) -> Unit,
    onSelectCell: (Int, Int) -> Unit,
    onCellChange: (Int, Int, String) -> Unit,
    getCellDisplayValue: (Int, Int) -> String
) {
    val currentSheet = note.payload.sheets.getOrNull(selectedSheetIndex)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(note.payload.title.ifEmpty { "未命名" }) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        },
        bottomBar = {
            // 工作表标签
            if (note.payload.sheets.isNotEmpty()) {
                Surface(
                    tonalElevation = 2.dp
                ) {
                    LazyRow(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        itemsIndexed(note.payload.sheets) { index, sheet ->
                            FilterChip(
                                selected = index == selectedSheetIndex,
                                onClick = { onSelectSheet(index) },
                                label = { Text(sheet.name) }
                            )
                        }
                    }
                }
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            if (currentSheet != null) {
                SpreadsheetView(
                    sheet = currentSheet,
                    selectedCell = selectedCell,
                    onCellSelect = onSelectCell,
                    onCellChange = onCellChange,
                    getCellDisplayValue = getCellDisplayValue
                )
            } else {
                Text(
                    text = "无工作表",
                    modifier = Modifier.align(Alignment.Center),
                    color = MaterialTheme.colorScheme.outline
                )
            }
        }
    }
}
