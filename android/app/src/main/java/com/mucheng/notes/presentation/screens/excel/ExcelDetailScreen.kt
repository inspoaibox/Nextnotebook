package com.mucheng.notes.presentation.screens.excel

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.mucheng.notes.presentation.components.SpreadsheetView
import com.mucheng.notes.presentation.viewmodel.ExcelDetailViewModel

/**
 * Excel 笔记详情页 - 用于从笔记列表直接打开 Excel 笔记
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExcelDetailScreen(
    noteId: String,
    viewModel: ExcelDetailViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsState()
    
    // 加载指定的 Excel 笔记
    LaunchedEffect(noteId) {
        viewModel.loadNote(noteId)
    }
    
    // 错误提示
    uiState.error?.let { error ->
        LaunchedEffect(error) {
            viewModel.clearError()
        }
    }
    
    val note = uiState.note
    val currentSheet = note?.payload?.sheets?.getOrNull(uiState.selectedSheetIndex)
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(note?.payload?.title?.ifEmpty { "未命名" } ?: "加载中...") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        },
        bottomBar = {
            // 工作表标签
            if (note != null && note.payload.sheets.isNotEmpty()) {
                Surface(tonalElevation = 2.dp) {
                    LazyRow(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        itemsIndexed(note.payload.sheets) { index, sheet ->
                            FilterChip(
                                selected = index == uiState.selectedSheetIndex,
                                onClick = { viewModel.selectSheet(index) },
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
            when {
                uiState.isLoading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                note == null -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            Icons.Default.Error,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "无法加载笔记",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
                currentSheet != null -> {
                    SpreadsheetView(
                        sheet = currentSheet,
                        selectedCell = uiState.selectedCell,
                        onCellSelect = { row, col -> viewModel.selectCell(row, col) },
                        onCellChange = { row, col, value -> viewModel.updateCell(row, col, value) },
                        getCellDisplayValue = { row, col ->
                            viewModel.getCellDisplayValue(currentSheet, row, col)
                        }
                    )
                }
                else -> {
                    Text(
                        text = "无工作表",
                        modifier = Modifier.align(Alignment.Center),
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }
        }
    }
}
