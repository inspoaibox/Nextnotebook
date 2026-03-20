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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.TableChart
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
    
    // 删除加密笔记的密码验证状态
    var showDeletePasswordDialog by remember { mutableStateOf(false) }
    var noteToDelete by remember { mutableStateOf<NoteItem?>(null) }
    var deletePassword by remember { mutableStateOf("") }
    var deletePasswordError by remember { mutableStateOf<String?>(null) }
    
    // 锁定笔记对话框状态
    var showLockDialog by remember { mutableStateOf(false) }
    var noteToLock by remember { mutableStateOf<NoteItem?>(null) }
    var lockPassword by remember { mutableStateOf("") }
    var lockConfirmPassword by remember { mutableStateOf("") }
    var lockPasswordError by remember { mutableStateOf<String?>(null) }
    
    // 从菜单解锁笔记对话框状态
    var showUnlockFromMenuDialog by remember { mutableStateOf(false) }
    var noteToUnlockFromMenu by remember { mutableStateOf<NoteItem?>(null) }
    var unlockFromMenuPassword by remember { mutableStateOf("") }
    var unlockFromMenuError by remember { mutableStateOf<String?>(null) }
    
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
            if (note.isExcelNote) {
                navController.navigate(Screen.ExcelDetail.createRoute(note.id))
            } else {
                navController.navigate(Screen.NoteDetail.createRoute(note.id, null))
            }
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
                    if (note.isExcelNote) {
                        navController.navigate(Screen.ExcelDetail.createRoute(note.id))
                    } else {
                        navController.navigate(Screen.NoteDetail.createRoute(note.id, null))
                    }
                } else {
                    unlockError = "密码错误，请重试"
                }
            }
        }
    }
    
    // 显示错误消息
    LaunchedEffect(uiState.error) {
        uiState.error?.let {
            snackbarHostState.showSnackbar(
                message = it,
                duration = androidx.compose.material3.SnackbarDuration.Short
            )
            viewModel.clearError()
        }
    }
    
    // 显示同步成功消息
    LaunchedEffect(uiState.message) {
        uiState.message?.let {
            snackbarHostState.showSnackbar(
                message = it,
                duration = androidx.compose.material3.SnackbarDuration.Short
            )
            viewModel.clearMessage()
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
    
    // 过滤笔记：先按文件夹过滤，再按搜索查询过滤
    val filteredNotes = notes.filter { note ->
        // 文件夹过滤
        if (selectedFolderId != null && note.folderId != selectedFolderId) {
            return@filter false
        }
        // 搜索过滤
        if (uiState.searchQuery.isNotBlank()) {
            val query = uiState.searchQuery.lowercase()
            note.title.lowercase().contains(query) ||
            note.content.lowercase().contains(query)
        } else {
            true
        }
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
                Column {
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
                    // 搜索框
                    OutlinedTextField(
                        value = uiState.searchQuery,
                        onValueChange = { viewModel.search(it) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        placeholder = { Text("搜索笔记...") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = "搜索") },
                        trailingIcon = {
                            if (uiState.searchQuery.isNotEmpty()) {
                                IconButton(onClick = { viewModel.search("") }) {
                                    Icon(Icons.Default.Close, contentDescription = "清除")
                                }
                            }
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search)
                    )
                }
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
                                contextMenuNote = null
                                if (note.isLocked) {
                                    // 加密笔记需要验证密码才能删除
                                    noteToDelete = note
                                    deletePassword = ""
                                    deletePasswordError = null
                                    showDeletePasswordDialog = true
                                } else {
                                    // 未加密笔记直接删除
                                    viewModel.deleteNote(note.id)
                                }
                            },
                            onMoveToFolder = {
                                noteToMove = note
                                showMoveToFolderDialog = true
                                contextMenuNote = null
                            },
                            onLock = {
                                noteToLock = note
                                lockPassword = ""
                                lockConfirmPassword = ""
                                lockPasswordError = null
                                showLockDialog = true
                                contextMenuNote = null
                            },
                            onUnlock = {
                                noteToUnlockFromMenu = note
                                unlockFromMenuPassword = ""
                                unlockFromMenuError = null
                                showUnlockFromMenuDialog = true
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
    
    // 删除加密笔记的密码验证对话框
    if (showDeletePasswordDialog && noteToDelete != null) {
        AlertDialog(
            onDismissRequest = {
                showDeletePasswordDialog = false
                noteToDelete = null
                deletePassword = ""
                deletePasswordError = null
            },
            icon = {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error
                )
            },
            title = { Text("删除加密笔记") },
            text = {
                Column {
                    Text(
                        text = "请输入密码以删除「${noteToDelete?.title?.ifEmpty { "无标题" }}」",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    OutlinedTextField(
                        value = deletePassword,
                        onValueChange = { 
                            deletePassword = it
                            deletePasswordError = null
                        },
                        label = { Text("密码") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = {
                                noteToDelete?.let { note ->
                                    scope.launch {
                                        val isValid = viewModel.verifyNotePassword(note.id, deletePassword)
                                        if (isValid) {
                                            viewModel.deleteNote(note.id)
                                            showDeletePasswordDialog = false
                                            noteToDelete = null
                                            deletePassword = ""
                                            deletePasswordError = null
                                        } else {
                                            deletePasswordError = "密码错误，请重试"
                                        }
                                    }
                                }
                            }
                        ),
                        isError = deletePasswordError != null,
                        supportingText = if (deletePasswordError != null) {
                            { Text(deletePasswordError!!, color = MaterialTheme.colorScheme.error) }
                        } else null,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        noteToDelete?.let { note ->
                            scope.launch {
                                val isValid = viewModel.verifyNotePassword(note.id, deletePassword)
                                if (isValid) {
                                    viewModel.deleteNote(note.id)
                                    showDeletePasswordDialog = false
                                    noteToDelete = null
                                    deletePassword = ""
                                    deletePasswordError = null
                                } else {
                                    deletePasswordError = "密码错误，请重试"
                                }
                            }
                        }
                    },
                    enabled = deletePassword.isNotEmpty()
                ) {
                    Text("删除", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showDeletePasswordDialog = false
                        noteToDelete = null
                        deletePassword = ""
                        deletePasswordError = null
                    }
                ) {
                    Text("取消")
                }
            }
        )
    }
    
    // 锁定笔记对话框
    if (showLockDialog && noteToLock != null) {
        AlertDialog(
            onDismissRequest = {
                showLockDialog = false
                noteToLock = null
                lockPassword = ""
                lockConfirmPassword = ""
                lockPasswordError = null
            },
            icon = {
                Icon(
                    Icons.Default.Lock,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
            },
            title = { Text("锁定笔记") },
            text = {
                Column {
                    Text(
                        text = "为「${noteToLock?.title?.ifEmpty { "无标题" }}」设置密码",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    OutlinedTextField(
                        value = lockPassword,
                        onValueChange = { 
                            lockPassword = it
                            lockPasswordError = null
                        },
                        label = { Text("密码") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    OutlinedTextField(
                        value = lockConfirmPassword,
                        onValueChange = { 
                            lockConfirmPassword = it
                            lockPasswordError = null
                        },
                        label = { Text("确认密码") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        isError = lockPasswordError != null,
                        supportingText = if (lockPasswordError != null) {
                            { Text(lockPasswordError!!, color = MaterialTheme.colorScheme.error) }
                        } else null,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        when {
                            lockPassword.length < 4 -> {
                                lockPasswordError = "密码至少 4 位"
                            }
                            lockPassword != lockConfirmPassword -> {
                                lockPasswordError = "两次密码不一致"
                            }
                            else -> {
                                noteToLock?.let { note ->
                                    viewModel.lockNote(note.id, lockPassword)
                                }
                                showLockDialog = false
                                noteToLock = null
                                lockPassword = ""
                                lockConfirmPassword = ""
                                lockPasswordError = null
                            }
                        }
                    },
                    enabled = lockPassword.isNotEmpty() && lockConfirmPassword.isNotEmpty()
                ) {
                    Text("锁定")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showLockDialog = false
                        noteToLock = null
                        lockPassword = ""
                        lockConfirmPassword = ""
                        lockPasswordError = null
                    }
                ) {
                    Text("取消")
                }
            }
        )
    }
    
    // 从菜单解锁笔记对话框
    if (showUnlockFromMenuDialog && noteToUnlockFromMenu != null) {
        AlertDialog(
            onDismissRequest = {
                showUnlockFromMenuDialog = false
                noteToUnlockFromMenu = null
                unlockFromMenuPassword = ""
                unlockFromMenuError = null
            },
            icon = {
                Icon(
                    Icons.Default.LockOpen,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
            },
            title = { Text("解锁笔记") },
            text = {
                Column {
                    Text(
                        text = "请输入密码以解锁「${noteToUnlockFromMenu?.title?.ifEmpty { "无标题" }}」",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    OutlinedTextField(
                        value = unlockFromMenuPassword,
                        onValueChange = { 
                            unlockFromMenuPassword = it
                            unlockFromMenuError = null
                        },
                        label = { Text("密码") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = {
                                noteToUnlockFromMenu?.let { note ->
                                    scope.launch {
                                        val isValid = viewModel.verifyNotePassword(note.id, unlockFromMenuPassword)
                                        if (isValid) {
                                            viewModel.unlockNote(note.id)
                                            showUnlockFromMenuDialog = false
                                            noteToUnlockFromMenu = null
                                            unlockFromMenuPassword = ""
                                            unlockFromMenuError = null
                                        } else {
                                            unlockFromMenuError = "密码错误，请重试"
                                        }
                                    }
                                }
                            }
                        ),
                        isError = unlockFromMenuError != null,
                        supportingText = if (unlockFromMenuError != null) {
                            { Text(unlockFromMenuError!!, color = MaterialTheme.colorScheme.error) }
                        } else null,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        noteToUnlockFromMenu?.let { note ->
                            scope.launch {
                                val isValid = viewModel.verifyNotePassword(note.id, unlockFromMenuPassword)
                                if (isValid) {
                                    viewModel.unlockNote(note.id)
                                    showUnlockFromMenuDialog = false
                                    noteToUnlockFromMenu = null
                                    unlockFromMenuPassword = ""
                                    unlockFromMenuError = null
                                } else {
                                    unlockFromMenuError = "密码错误，请重试"
                                }
                            }
                        }
                    },
                    enabled = unlockFromMenuPassword.isNotEmpty()
                ) {
                    Text("解锁")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showUnlockFromMenuDialog = false
                        noteToUnlockFromMenu = null
                        unlockFromMenuPassword = ""
                        unlockFromMenuError = null
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
    onLock: () -> Unit,
    onUnlock: () -> Unit,
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
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Excel 笔记显示表格图标
                        if (note.isExcelNote) {
                            Icon(
                                Icons.Default.TableChart,
                                contentDescription = "Excel 笔记",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(end = 8.dp).size(20.dp)
                            )
                        }
                        Text(
                            text = note.title.ifEmpty { "无标题" },
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = formatTime(note.updatedTime),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.outline
                        )
                        if (note.isPinned) {
                            Icon(
                                Icons.Default.PushPin,
                                contentDescription = stringResource(R.string.note_pinned),
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(start = 4.dp).size(16.dp)
                            )
                        }
                        if (note.isLocked) {
                            Icon(
                                Icons.Default.Lock,
                                contentDescription = stringResource(R.string.note_locked),
                                tint = MaterialTheme.colorScheme.outline,
                                modifier = Modifier.padding(start = 4.dp).size(16.dp)
                            )
                        }
                    }
                }
                
                // Excel 笔记显示预览信息
                if (note.isExcelNote && note.content.isNotEmpty()) {
                    Text(
                        text = note.content,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
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
            // 锁定/解锁选项
            DropdownMenuItem(
                text = { Text(if (note.isLocked) "解锁笔记" else "锁定笔记") },
                onClick = if (note.isLocked) onUnlock else onLock,
                leadingIcon = {
                    Icon(
                        if (note.isLocked) Icons.Default.LockOpen else Icons.Default.Lock,
                        contentDescription = null
                    )
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
