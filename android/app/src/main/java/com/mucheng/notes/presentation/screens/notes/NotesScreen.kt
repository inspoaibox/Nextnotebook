package com.mucheng.notes.presentation.screens.notes

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.mucheng.notes.R
import com.mucheng.notes.presentation.components.FolderItem
import com.mucheng.notes.presentation.components.FolderTree
import com.mucheng.notes.presentation.components.SyncStatusIndicator
import com.mucheng.notes.presentation.navigation.Screen
import com.mucheng.notes.presentation.viewmodel.NoteItem
import com.mucheng.notes.presentation.viewmodel.NotesViewModel
import com.mucheng.notes.presentation.viewmodel.FolderItem as ViewModelFolderItem
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 笔记列表页面
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun NotesScreen(
    navController: NavController,
    bottomPadding: PaddingValues = PaddingValues(),
    viewModel: NotesViewModel = hiltViewModel()
) {
    val notes by viewModel.notes.collectAsState()
    val folders by viewModel.folders.collectAsState()
    val selectedFolderId by viewModel.selectedFolderId.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    
    // 文件夹编辑对话框状态
    var showFolderDialog by remember { mutableStateOf(false) }
    var folderDialogMode by remember { mutableStateOf<FolderDialogMode>(FolderDialogMode.Create(null)) }
    var folderName by remember { mutableStateOf("") }
    
    // 长按菜单状态
    var contextMenuNote by remember { mutableStateOf<NoteItem?>(null) }
    var showMoveToFolderDialog by remember { mutableStateOf(false) }
    var noteToMove by remember { mutableStateOf<NoteItem?>(null) }
    
    // 密码验证对话框状态
    var showPasswordDialog by remember { mutableStateOf(false) }
    var noteToUnlock by remember { mutableStateOf<NoteItem?>(null) }
    var unlockPassword by remember { mutableStateOf("") }
    var unlockError by remember { mutableStateOf<String?>(null) }
    
    // 页面显示时刷新同步配置状态
    LaunchedEffect(Unit) {
        viewModel.refreshSyncStatus()
    }
    
    // 确保抽屉在导航返回后处于关闭状态
    LaunchedEffect(Unit) {
        if (drawerState.isOpen) {
            drawerState.close()
        }
    }
    
    // 处理点击笔记
    val handleNoteClick: (NoteItem) -> Unit = { note ->
        if (note.isLocked) {
            // 加密笔记，显示密码验证对话框
            noteToUnlock = note
            unlockPassword = ""
            unlockError = null
            showPasswordDialog = true
        } else {
            // 未加密笔记，直接进入详情页
            navController.navigate(Screen.NoteDetail.createRoute(note.id, null))
        }
    }
    
    // 验证密码并进入笔记
    val handleUnlockNote: () -> Unit = {
        noteToUnlock?.let { note ->
            scope.launch {
                val isValid = viewModel.verifyNotePassword(note.id, unlockPassword)
                if (isValid) {
                    showPasswordDialog = false
                    unlockPassword = ""
                    unlockError = null
                    navController.navigate(Screen.NoteDetail.createRoute(note.id, null))
                } else {
                    unlockError = "密码错误，请重试"
                }
            }
        }
    }
    
    // 显示错误消息
    LaunchedEffect(uiState.error) {
        uiState.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearError()
        }
    }
    
    // 处理编辑文件夹
    LaunchedEffect(uiState.editingFolderId) {
        uiState.editingFolderId?.let { folderId ->
            val folder = folders.find { it.id == folderId }
            if (folder != null) {
                folderName = folder.name
                folderDialogMode = FolderDialogMode.Edit(folderId)
                showFolderDialog = true
            }
        }
    }
    
    // 过滤笔记
    val filteredNotes = if (selectedFolderId == null) {
        notes
    } else {
        notes.filter { it.folderId == selectedFolderId }
    }
    
    // 按置顶排序
    val sortedNotes = filteredNotes.sortedWith(
        compareByDescending<NoteItem> { it.isPinned }
            .thenByDescending { it.updatedTime }
    )
    
    // 转换文件夹数据
    val folderItems = folders.map { folder ->
        FolderItem(
            id = folder.id,
            name = folder.name,
            parentId = folder.parentId,
            itemCount = notes.count { it.folderId == folder.id }
        )
    }
    
    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = drawerState.isOpen, // 只有在抽屉打开时才允许手势关闭
        drawerContent = {
            ModalDrawerSheet(
                modifier = Modifier.width(280.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxHeight()
                        .padding(16.dp)
                ) {
                    Text(
                        text = "笔记文件夹",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                    
                    FolderTree(
                        folders = folderItems,
                        selectedFolderId = selectedFolderId,
                        onFolderSelect = { folderId ->
                            viewModel.selectFolder(folderId)
                            scope.launch { drawerState.close() }
                        },
                        onCreateFolder = { parentId ->
                            folderName = ""
                            folderDialogMode = FolderDialogMode.Create(parentId)
                            showFolderDialog = true
                        },
                        onEditFolder = { folderId ->
                            val folder = folders.find { it.id == folderId }
                            if (folder != null) {
                                folderName = folder.name
                                folderDialogMode = FolderDialogMode.Edit(folderId)
                                showFolderDialog = true
                            }
                        },
                        onDeleteFolder = { folderId ->
                            viewModel.deleteFolder(folderId)
                        },
                        modifier = Modifier.weight(1f),
                        allOptionLabel = "全部笔记"
                    )
                    
                    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                    
                    // 设置入口
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { 
                                scope.launch { drawerState.close() }
                                navController.navigate(Screen.Settings.route)
                            }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Settings,
                            contentDescription = "设置",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = stringResource(R.string.settings),
                            style = MaterialTheme.typography.bodyLarge
                        )
                    }
                }
            }
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { 
                        Text(
                            text = if (selectedFolderId == null) {
                                stringResource(R.string.nav_notes)
                            } else {
                                folders.find { it.id == selectedFolderId }?.name ?: stringResource(R.string.nav_notes)
                            }
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Default.Menu, contentDescription = "打开文件夹")
                        }
                    },
                    actions = {
                        // 同步状态指示器
                        SyncStatusIndicator(
                            status = uiState.syncStatus,
                            lastSyncTime = uiState.lastSyncTime,
                            onClick = { viewModel.sync() }
                        )
                    }
                )
            },
            floatingActionButton = {
                FloatingActionButton(
                    onClick = { 
                        // 创建笔记时传递当前选中的文件夹 ID
                        navController.navigate(Screen.NoteDetail.createRoute(null, selectedFolderId)) 
                    },
                    modifier = Modifier.padding(bottom = bottomPadding.calculateBottomPadding())
                ) {
                    Icon(Icons.Default.Add, contentDescription = stringResource(R.string.note_new))
                }
            },
            snackbarHost = { SnackbarHost(snackbarHostState) }
        ) { paddingValues ->
            if (sortedNotes.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .padding(bottom = bottomPadding.calculateBottomPadding()),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.note_empty),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .padding(horizontal = 16.dp),
                    contentPadding = PaddingValues(bottom = bottomPadding.calculateBottomPadding()),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(sortedNotes) { note ->
                        NoteCard(
                            note = note,
                            onClick = { handleNoteClick(note) },
                            onLongClick = { contextMenuNote = note },
                            showContextMenu = contextMenuNote?.id == note.id,
                            onDismissMenu = { contextMenuNote = null },
                            onTogglePin = {
                                viewModel.togglePinned(note.id)
                                contextMenuNote = null
                            },
                            onDelete = {
                                viewModel.deleteNote(note.id)
                                contextMenuNote = null
                            },
                            onMoveToFolder = {
                                noteToMove = note
                                showMoveToFolderDialog = true
                                contextMenuNote = null
                            },
                            isPinned = note.isPinned
                        )
                    }
                }
            }
        }
    }
    
    // 文件夹编辑/创建对话框
    if (showFolderDialog) {
        FolderDialog(
            mode = folderDialogMode,
            folderName = folderName,
            onNameChange = { folderName = it },
            onConfirm = {
                when (val mode = folderDialogMode) {
                    is FolderDialogMode.Create -> {
                        viewModel.createFolder(folderName, mode.parentId)
                    }
                    is FolderDialogMode.Edit -> {
                        viewModel.updateFolderName(mode.folderId, folderName)
                    }
                }
                showFolderDialog = false
                folderName = ""
            },
            onDismiss = {
                showFolderDialog = false
                folderName = ""
                viewModel.cancelEditFolder()
            }
        )
    }
    
    // 移动到文件夹对话框
    if (showMoveToFolderDialog && noteToMove != null) {
        MoveToFolderDialog(
            folders = folders,
            currentFolderId = noteToMove?.folderId,
            onSelect = { folderId ->
                noteToMove?.let { note ->
                    viewModel.moveNoteToFolder(note.id, folderId)
                }
                showMoveToFolderDialog = false
                noteToMove = null
            },
            onDismiss = {
                showMoveToFolderDialog = false
                noteToMove = null
            }
        )
    }
    
    // 密码验证对话框
    if (showPasswordDialog && noteToUnlock != null) {
        AlertDialog(
            onDismissRequest = {
                showPasswordDialog = false
                noteToUnlock = null
                unlockPassword = ""
                unlockError = null
            },
            icon = {
                Icon(
                    Icons.Default.Lock,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
            },
            title = { Text("此笔记已加密") },
            text = {
                Column {
                    Text(
                        text = "请输入密码以查看「${noteToUnlock?.title?.ifEmpty { "无标题" }}」",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    OutlinedTextField(
                        value = unlockPassword,
                        onValueChange = { 
                            unlockPassword = it
                            unlockError = null
                        },
                        label = { Text("密码") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = { handleUnlockNote() }
                        ),
                        isError = unlockError != null,
                        supportingText = if (unlockError != null) {
                            { Text(unlockError!!, color = MaterialTheme.colorScheme.error) }
                        } else null,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { handleUnlockNote() },
                    enabled = unlockPassword.isNotEmpty()
                ) {
                    Text("解锁")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showPasswordDialog = false
                        noteToUnlock = null
                        unlockPassword = ""
                        unlockError = null
                    }
                ) {
                    Text("取消")
                }
            }
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun NoteCard(
    note: NoteItem,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    showContextMenu: Boolean,
    onDismissMenu: () -> Unit,
    onTogglePin: () -> Unit,
    onDelete: () -> Unit,
    onMoveToFolder: () -> Unit,
    isPinned: Boolean
) {
    Box {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = onLongClick
                ),
            colors = CardDefaults.cardColors(
                containerColor = if (note.isPinned) 
                    MaterialTheme.colorScheme.primaryContainer 
                else 
                    MaterialTheme.colorScheme.surface
            )
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = note.title.ifEmpty { "无标题" },
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    
                    Row {
                        if (note.isPinned) {
                            Icon(
                                Icons.Default.PushPin,
                                contentDescription = stringResource(R.string.note_pinned),
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(start = 4.dp)
                            )
                        }
                        if (note.isLocked) {
                            Icon(
                                Icons.Default.Lock,
                                contentDescription = stringResource(R.string.note_locked),
                                tint = MaterialTheme.colorScheme.outline,
                                modifier = Modifier.padding(start = 4.dp)
                            )
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(4.dp))
                
                // 内容预览（去除 HTML 标签）
                val preview = note.content
                    .replace(Regex("<[^>]*>"), "")
                    .replace(Regex("\\s+"), " ")
                    .trim()
                    .take(100)
                
                if (preview.isNotEmpty()) {
                    Text(
                        text = preview,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                
                Text(
                    text = formatTime(note.updatedTime),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
                )
            }
        }
        
        // 长按上下文菜单
        DropdownMenu(
            expanded = showContextMenu,
            onDismissRequest = onDismissMenu
        ) {
            DropdownMenuItem(
                text = { Text(if (isPinned) "取消置顶" else "置顶") },
                onClick = onTogglePin,
                leadingIcon = {
                    Icon(
                        if (isPinned) Icons.Default.StarBorder else Icons.Default.Star,
                        contentDescription = null
                    )
                }
            )
            DropdownMenuItem(
                text = { Text("移动到文件夹") },
                onClick = onMoveToFolder,
                leadingIcon = {
                    Icon(Icons.Default.Folder, contentDescription = null)
                }
            )
            DropdownMenuItem(
                text = { Text("删除") },
                onClick = onDelete,
                leadingIcon = {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error
                    )
                }
            )
        }
    }
}

private fun formatTime(timestamp: Long): String {
    val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())
    return sdf.format(Date(timestamp))
}

/**
 * 文件夹对话框模式
 */
private sealed class FolderDialogMode {
    data class Create(val parentId: String?) : FolderDialogMode()
    data class Edit(val folderId: String) : FolderDialogMode()
}

/**
 * 文件夹编辑/创建对话框
 */
@Composable
private fun FolderDialog(
    mode: FolderDialogMode,
    folderName: String,
    onNameChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    val title = when (mode) {
        is FolderDialogMode.Create -> if (mode.parentId != null) "新建子文件夹" else "新建文件夹"
        is FolderDialogMode.Edit -> "重命名文件夹"
    }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = folderName,
                onValueChange = onNameChange,
                label = { Text("文件夹名称") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                enabled = folderName.isNotBlank()
            ) {
                Text("确定")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("取消")
            }
        }
    )
}

/**
 * 移动到文件夹对话框
 */
@Composable
private fun MoveToFolderDialog(
    folders: List<ViewModelFolderItem>,
    currentFolderId: String?,
    onSelect: (String?) -> Unit,
    onDismiss: () -> Unit
) {
    var selectedFolderId by remember { mutableStateOf(currentFolderId) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("移动到文件夹") },
        text = {
            LazyColumn {
                // 根目录选项
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedFolderId = null }
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = selectedFolderId == null,
                            onClick = { selectedFolderId = null }
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Icon(Icons.Default.Folder, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("根目录（无文件夹）")
                    }
                }
                
                // 文件夹列表
                items(folders) { folder ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedFolderId = folder.id }
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = selectedFolderId == folder.id,
                            onClick = { selectedFolderId = folder.id }
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Icon(Icons.Default.Folder, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(folder.name)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSelect(selectedFolderId) }) {
                Text("确定")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("取消")
            }
        }
    )
}
