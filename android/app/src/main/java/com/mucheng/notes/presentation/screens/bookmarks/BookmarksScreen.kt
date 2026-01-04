package com.mucheng.notes.presentation.screens.bookmarks

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.mucheng.notes.R
import com.mucheng.notes.presentation.components.FolderItem
import com.mucheng.notes.presentation.components.FolderTree
import com.mucheng.notes.presentation.navigation.Screen
import com.mucheng.notes.presentation.viewmodel.BookmarkItem
import com.mucheng.notes.presentation.viewmodel.BookmarksViewModel
import kotlinx.coroutines.launch

/**
 * 书签列表页面
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookmarksScreen(
    navController: NavController,
    bottomPadding: PaddingValues = PaddingValues(),
    viewModel: BookmarksViewModel = hiltViewModel()
) {
    val bookmarks by viewModel.bookmarks.collectAsState()
    val folders by viewModel.folders.collectAsState()
    val selectedFolderId by viewModel.selectedFolderId.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    
    // 对话框状态
    var showAddBookmarkDialog by remember { mutableStateOf(false) }
    var showEditBookmarkDialog by remember { mutableStateOf(false) }
    var showDeleteBookmarkDialog by remember { mutableStateOf(false) }
    var showRenameFolderDialog by remember { mutableStateOf(false) }
    var showDeleteFolderDialog by remember { mutableStateOf(false) }
    var showCreateFolderDialog by remember { mutableStateOf(false) }
    
    var selectedBookmark by remember { mutableStateOf<BookmarkItem?>(null) }
    var selectedFolderForEdit by remember { mutableStateOf<String?>(null) }
    var createFolderParentId by remember { mutableStateOf<String?>(null) }
    
    // 过滤书签
    val filteredBookmarks = if (selectedFolderId == null) {
        bookmarks
    } else {
        bookmarks.filter { it.folderId == selectedFolderId }
    }
    
    // 转换文件夹数据
    val folderItems = folders.map { folder ->
        FolderItem(
            id = folder.id,
            name = folder.name,
            parentId = folder.parentId,
            itemCount = bookmarks.count { it.folderId == folder.id }
        )
    }
    
    ModalNavigationDrawer(
        drawerState = drawerState,
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
                        text = "书签文件夹",
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
                            createFolderParentId = parentId
                            showCreateFolderDialog = true
                        },
                        onEditFolder = { folderId ->
                            selectedFolderForEdit = folderId
                            showRenameFolderDialog = true
                        },
                        onDeleteFolder = { folderId ->
                            selectedFolderForEdit = folderId
                            showDeleteFolderDialog = true
                        },
                        modifier = Modifier.weight(1f),
                        allOptionLabel = "全部书签"
                    )
                    
                    Divider(modifier = Modifier.padding(vertical = 8.dp))
                    
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
                                stringResource(R.string.nav_bookmarks)
                            } else {
                                folders.find { it.id == selectedFolderId }?.name ?: stringResource(R.string.nav_bookmarks)
                            }
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Default.Menu, contentDescription = "打开文件夹")
                        }
                    }
                )
            },
            floatingActionButton = {
                FloatingActionButton(
                    onClick = { showAddBookmarkDialog = true },
                    modifier = Modifier.padding(bottom = bottomPadding.calculateBottomPadding())
                ) {
                    Icon(Icons.Default.Add, contentDescription = stringResource(R.string.bookmark_new))
                }
            }
        ) { paddingValues ->
            if (filteredBookmarks.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .padding(bottom = bottomPadding.calculateBottomPadding()),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.Bookmark,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.outline
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = stringResource(R.string.bookmark_empty),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
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
                    items(filteredBookmarks) { bookmark ->
                        BookmarkCard(
                            bookmark = bookmark,
                            onClick = { viewModel.openBookmark(bookmark.url) },
                            onOpenInBrowser = { viewModel.openBookmark(bookmark.url) },
                            onEdit = {
                                selectedBookmark = bookmark
                                showEditBookmarkDialog = true
                            },
                            onDelete = {
                                selectedBookmark = bookmark
                                showDeleteBookmarkDialog = true
                            }
                        )
                    }
                }
            }
        }
    }
    
    // 添加书签对话框
    if (showAddBookmarkDialog) {
        AddEditBookmarkDialog(
            title = "添加书签",
            initialName = "",
            initialUrl = "",
            initialDescription = "",
            initialFolderId = selectedFolderId,
            folders = folders,
            onDismiss = { showAddBookmarkDialog = false },
            onConfirm = { name, url, description, folderId ->
                viewModel.createBookmark(name, url, description, folderId)
                showAddBookmarkDialog = false
            }
        )
    }
    
    // 编辑书签对话框
    if (showEditBookmarkDialog && selectedBookmark != null) {
        AddEditBookmarkDialog(
            title = "编辑书签",
            initialName = selectedBookmark!!.name,
            initialUrl = selectedBookmark!!.url,
            initialDescription = selectedBookmark!!.description,
            initialFolderId = selectedBookmark!!.folderId,
            folders = folders,
            onDismiss = { 
                showEditBookmarkDialog = false
                selectedBookmark = null
            },
            onConfirm = { name, url, description, folderId ->
                viewModel.updateBookmark(selectedBookmark!!.id, name, url, description, folderId)
                showEditBookmarkDialog = false
                selectedBookmark = null
            }
        )
    }
    
    // 删除书签确认对话框
    if (showDeleteBookmarkDialog && selectedBookmark != null) {
        AlertDialog(
            onDismissRequest = { 
                showDeleteBookmarkDialog = false
                selectedBookmark = null
            },
            title = { Text("删除书签") },
            text = { Text("确定要删除书签 \"${selectedBookmark!!.name}\" 吗？") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteBookmark(selectedBookmark!!.id)
                        showDeleteBookmarkDialog = false
                        selectedBookmark = null
                    }
                ) {
                    Text("删除", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { 
                    showDeleteBookmarkDialog = false
                    selectedBookmark = null
                }) {
                    Text("取消")
                }
            }
        )
    }
    
    // 创建文件夹对话框
    if (showCreateFolderDialog) {
        var folderName by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCreateFolderDialog = false },
            title = { Text("新建文件夹") },
            text = {
                OutlinedTextField(
                    value = folderName,
                    onValueChange = { folderName = it },
                    label = { Text("文件夹名称") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (folderName.isNotBlank()) {
                            viewModel.createFolder(folderName, createFolderParentId)
                            showCreateFolderDialog = false
                            folderName = ""
                        }
                    },
                    enabled = folderName.isNotBlank()
                ) {
                    Text("创建")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateFolderDialog = false }) {
                    Text("取消")
                }
            }
        )
    }
    
    // 重命名文件夹对话框
    if (showRenameFolderDialog && selectedFolderForEdit != null) {
        val currentFolder = folders.find { it.id == selectedFolderForEdit }
        var newName by remember { mutableStateOf(currentFolder?.name ?: "") }
        AlertDialog(
            onDismissRequest = { 
                showRenameFolderDialog = false
                selectedFolderForEdit = null
            },
            title = { Text("重命名文件夹") },
            text = {
                OutlinedTextField(
                    value = newName,
                    onValueChange = { newName = it },
                    label = { Text("文件夹名称") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (newName.isNotBlank()) {
                            viewModel.renameFolder(selectedFolderForEdit!!, newName)
                            showRenameFolderDialog = false
                            selectedFolderForEdit = null
                        }
                    },
                    enabled = newName.isNotBlank()
                ) {
                    Text("确定")
                }
            },
            dismissButton = {
                TextButton(onClick = { 
                    showRenameFolderDialog = false
                    selectedFolderForEdit = null
                }) {
                    Text("取消")
                }
            }
        )
    }
    
    // 删除文件夹确认对话框
    if (showDeleteFolderDialog && selectedFolderForEdit != null) {
        val currentFolder = folders.find { it.id == selectedFolderForEdit }
        AlertDialog(
            onDismissRequest = { 
                showDeleteFolderDialog = false
                selectedFolderForEdit = null
            },
            title = { Text("删除文件夹") },
            text = { Text("确定要删除文件夹 \"${currentFolder?.name}\" 吗？文件夹内的书签将移到根目录。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteFolder(selectedFolderForEdit!!)
                        showDeleteFolderDialog = false
                        selectedFolderForEdit = null
                        // 如果删除的是当前选中的文件夹，切换到全部
                        if (selectedFolderId == selectedFolderForEdit) {
                            viewModel.selectFolder(null)
                        }
                    }
                ) {
                    Text("删除", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { 
                    showDeleteFolderDialog = false
                    selectedFolderForEdit = null
                }) {
                    Text("取消")
                }
            }
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun BookmarkCard(
    bookmark: BookmarkItem,
    onClick: () -> Unit,
    onOpenInBrowser: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    var showMenu by remember { mutableStateOf(false) }
    
    Box {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = { showMenu = true }
                ),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // 图标
                Icon(
                    Icons.Default.Bookmark,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(40.dp)
                )
                
                Spacer(modifier = Modifier.width(16.dp))
                
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = bookmark.name,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    
                    Text(
                        text = bookmark.url,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    
                    if (bookmark.description.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = bookmark.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                
                IconButton(onClick = onOpenInBrowser) {
                    Icon(
                        Icons.Default.OpenInBrowser,
                        contentDescription = "在浏览器中打开",
                        tint = MaterialTheme.colorScheme.outline
                    )
                }
            }
        }
        
        // 长按菜单
        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            offset = DpOffset(x = 100.dp, y = 0.dp)
        ) {
            DropdownMenuItem(
                text = { Text("在浏览器中打开") },
                onClick = {
                    showMenu = false
                    onOpenInBrowser()
                },
                leadingIcon = {
                    Icon(Icons.Default.OpenInBrowser, contentDescription = null)
                }
            )
            DropdownMenuItem(
                text = { Text("编辑") },
                onClick = {
                    showMenu = false
                    onEdit()
                },
                leadingIcon = {
                    Icon(Icons.Default.Edit, contentDescription = null)
                }
            )
            DropdownMenuItem(
                text = { Text("删除", color = MaterialTheme.colorScheme.error) },
                onClick = {
                    showMenu = false
                    onDelete()
                },
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

/**
 * 添加/编辑书签对话框
 */
@Composable
private fun AddEditBookmarkDialog(
    title: String,
    initialName: String,
    initialUrl: String,
    initialDescription: String,
    initialFolderId: String? = null,
    folders: List<com.mucheng.notes.presentation.viewmodel.BookmarkFolderItem> = emptyList(),
    onDismiss: () -> Unit,
    onConfirm: (name: String, url: String, description: String, folderId: String?) -> Unit
) {
    var name by remember { mutableStateOf(initialName) }
    var url by remember { mutableStateOf(initialUrl) }
    var description by remember { mutableStateOf(initialDescription) }
    var selectedFolderId by remember { mutableStateOf(initialFolderId) }
    var showFolderMenu by remember { mutableStateOf(false) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("名称") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("网址") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("描述（可选）") },
                    maxLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
                
                // 文件夹选择
                Box {
                    OutlinedTextField(
                        value = folders.find { it.id == selectedFolderId }?.name ?: "根目录",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("文件夹") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showFolderMenu = true },
                        enabled = false
                    )
                    
                    DropdownMenu(
                        expanded = showFolderMenu,
                        onDismissRequest = { showFolderMenu = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("根目录") },
                            onClick = {
                                selectedFolderId = null
                                showFolderMenu = false
                            }
                        )
                        folders.forEach { folder ->
                            DropdownMenuItem(
                                text = { Text(folder.name) },
                                onClick = {
                                    selectedFolderId = folder.id
                                    showFolderMenu = false
                                }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(name, url, description, selectedFolderId) },
                enabled = name.isNotBlank() && url.isNotBlank()
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
