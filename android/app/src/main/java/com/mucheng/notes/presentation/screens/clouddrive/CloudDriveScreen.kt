/**
 * 网盘文件浏览器 - Android Compose 屏
 *
 * 与 [com.mucheng.notes.presentation.viewmodel.CloudDriveViewModel] 配合，
 * 提供完整的云端文件浏览器：
 * - 根目录 → 逐层钻入子文件夹
 * - SAF 多选文件上传
 * - 新建文件夹、删除（带确认）
 * - 文件点击：已下载则打开，未下载则按需下载
 * - 上传/下载进度条（沿用 SyncSettingsScreen 的 CloudProgressRow 视觉）
 *
 * 约定：本仓库 UI 一律使用 [androidx.compose.runtime.collectAsState]，
 * 与其它屏幕保持一致（不使用 collectAsStateWithLifecycle）。
 */

package com.mucheng.notes.presentation.screens.clouddrive

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.NavController
import com.mucheng.notes.data.cloud.CloudDownloadProgress
import com.mucheng.notes.data.cloud.CloudUploadProgress
import com.mucheng.notes.data.local.entity.CloudLocalAvailabilityValues
import com.mucheng.notes.domain.model.payload.CloudDownloadState
import com.mucheng.notes.domain.model.payload.CloudUploadState
import com.mucheng.notes.presentation.viewmodel.CloudDriveItem
import com.mucheng.notes.presentation.viewmodel.CloudDriveViewModel
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CloudDriveScreen(
    navController: NavController,
    bottomPadding: PaddingValues = PaddingValues(),
    viewModel: CloudDriveViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val lifecycleOwner = LocalLifecycleOwner.current

    BackHandler(enabled = !uiState.isAtRoot) {
        viewModel.navigateUp()
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.refresh()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // 对话框状态
    var showNewFolderDialog by remember { mutableStateOf(false) }
    var pendingDeleteItem by remember { mutableStateOf<CloudDriveItem?>(null) }
    var menuItem by remember { mutableStateOf<CloudDriveItem?>(null) }
    var folderMenuItem by remember { mutableStateOf<CloudDriveItem?>(null) }

    // SAF 多选文件上传
    val uploadLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenMultipleDocuments()
    ) { uris: List<Uri> ->
        if (uris.isNotEmpty()) viewModel.uploadFiles(uris)
    }

    // Snackbar：uiState.snackbarMessage 变化时弹出，随后交给 VM 清空
    LaunchedEffect(uiState.snackbarMessage) {
        uiState.snackbarMessage?.let {
            snackbarHostState.showSnackbar(it, duration = SnackbarDuration.Short)
            viewModel.consumeSnackbar()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.currentFolderName) },
                navigationIcon = {
                    IconButton(onClick = {
                        // 非根目录 → 出栈；根目录 → 退出本屏
                        if (!viewModel.navigateUp()) {
                            navController.popBackStack()
                        }
                    }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "返回"
                        )
                    }
                },
                actions = {
                    // 上传文件
                    IconButton(onClick = { uploadLauncher.launch(arrayOf("*/*")) }) {
                        Icon(Icons.Default.Upload, contentDescription = "上传文件")
                    }
                    IconButton(onClick = {
                        viewModel.setFolderLocalAvailability(uiState.currentFolderId, CloudLocalAvailabilityValues.OFFLINE)
                    }) {
                        Icon(Icons.Default.Cloud, contentDescription = "当前目录全部离线")
                    }
                    IconButton(onClick = {
                        viewModel.setFolderLocalAvailability(uiState.currentFolderId, CloudLocalAvailabilityValues.ONLINE_ONLY)
                    }) {
                        Icon(Icons.Default.Delete, contentDescription = "当前目录全部释放")
                    }
                    // 新建文件夹
                    IconButton(onClick = { showNewFolderDialog = true }) {
                        Icon(Icons.Default.CreateNewFolder, contentDescription = "新建文件夹")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { uploadLauncher.launch(arrayOf("*/*")) },
                modifier = Modifier.padding(bottom = bottomPadding.calculateBottomPadding())
            ) {
                Icon(Icons.Default.Upload, contentDescription = "上传文件")
            }
        }
    ) { paddingValues ->
        when {
            // 未授权：提示先去设置授权
            !uiState.authorized -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.Cloud,
                            contentDescription = null,
                            modifier = Modifier.size(56.dp),
                            tint = MaterialTheme.colorScheme.outline
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(
                            "请先在设置中授权网盘目录",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // 空且非加载中：空状态
            uiState.items.isEmpty() && !uiState.isLoading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "当前文件夹为空",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }

            // 正常列表
            else -> {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                ) {
                    items(uiState.items, key = { it.entity.id }) { item ->
                        if (item.isFolder) {
                            FolderRow(
                                item = item,
                                onClick = {
                                    viewModel.openFolder(item.entity.id, item.name, item.relativePath)
                                },
                                onLongClick = { folderMenuItem = item }
                            )
                        } else {
                            FileRow(
                                item = item,
                                uploadProgress = uiState.uploadProgress[item.entity.id],
                                downloadProgress = uiState.downloadProgress[item.entity.id],
                                localAvailability = uiState.localAvailability[item.entity.id]
                                    ?: CloudLocalAvailabilityValues.ONLINE_ONLY,
                                onClick = {
                                    scope.launch {
                                        if (viewModel.isDownloaded(item.entity.id)) {
                                            viewModel.openDownloadedFile(item.entity.id)
                                        } else {
                                            viewModel.downloadFile(item.entity.id)
                                        }
                                    }
                                },
                                onLongClick = { menuItem = item },
                                onDelete = { pendingDeleteItem = item }
                            )
                        }
                        HorizontalDivider()
                    }

                    // 顶部加载指示
                    if (uiState.isLoading) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator()
                            }
                        }
                    }
                }
            }
        }
    }

    // 新建文件夹对话框
    if (showNewFolderDialog) {
        NewFolderDialog(
            onDismiss = { showNewFolderDialog = false },
            onConfirm = { name ->
                viewModel.createFolder(name)
                showNewFolderDialog = false
            }
        )
    }

    // 删除确认对话框
    pendingDeleteItem?.let { item ->
        AlertDialog(
            onDismissRequest = { pendingDeleteItem = null },
            title = { Text("删除「${item.name}」？") },
            text = {
                Text(if (item.isFolder) "文件夹将被删除（含其内部文件）。此操作会在下次同步时生效。" else "文件将被删除。此操作会在下次同步时生效。")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteItem(item.entity.id)
                        pendingDeleteItem = null
                    }
                ) { Text("删除", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDeleteItem = null }) { Text("取消") }
            }
        )
    }

    menuItem?.let { item ->
        AlertDialog(
            onDismissRequest = { menuItem = null },
            title = { Text(item.name) },
            text = {
                Column {
                    TextButton(onClick = {
                        scope.launch {
                            if (viewModel.isDownloaded(item.entity.id)) {
                                viewModel.openDownloadedFile(item.entity.id)
                            } else {
                                viewModel.downloadFile(item.entity.id)
                            }
                            menuItem = null
                        }
                    }) { Text("下载并打开") }
                    TextButton(onClick = {
                        viewModel.setLocalAvailability(item.entity.id, CloudLocalAvailabilityValues.OFFLINE)
                        menuItem = null
                    }) { Text("离线保存") }
                    TextButton(onClick = {
                        viewModel.setLocalAvailability(item.entity.id, CloudLocalAvailabilityValues.ONLINE_ONLY)
                        menuItem = null
                    }) { Text("释放空间") }
                    TextButton(onClick = {
                        pendingDeleteItem = item
                        menuItem = null
                    }) { Text("删除", color = MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { menuItem = null }) { Text("关闭") }
            }
        )
    }

    folderMenuItem?.let {
        AlertDialog(
            onDismissRequest = { folderMenuItem = null },
            title = { Text(it.name) },
            text = {
                Column {
                    TextButton(onClick = {
                        viewModel.setFolderLocalAvailability(
                            it.entity.id,
                            CloudLocalAvailabilityValues.OFFLINE,
                            it.relativePath
                        )
                        folderMenuItem = null
                    }) { Text("该文件夹离线保存") }
                    TextButton(onClick = {
                        viewModel.setFolderLocalAvailability(
                            it.entity.id,
                            CloudLocalAvailabilityValues.ONLINE_ONLY,
                            it.relativePath
                        )
                        folderMenuItem = null
                    }) { Text("该文件夹释放空间") }
                    TextButton(onClick = {
                        pendingDeleteItem = it
                        folderMenuItem = null
                    }) { Text("删除", color = MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { folderMenuItem = null }) { Text("关闭") }
            }
        )
    }
}

@Composable
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
private fun FolderRow(item: CloudDriveItem, onClick: () -> Unit, onLongClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Default.Folder,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary
        )
        Spacer(Modifier.width(16.dp))
        Text(
            item.name,
            style = MaterialTheme.typography.bodyLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun FileRow(
    item: CloudDriveItem,
    uploadProgress: CloudUploadProgress?,
    downloadProgress: CloudDownloadProgress?,
    localAvailability: String,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.AutoMirrored.Filled.InsertDriveFile,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outline
            )
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    item.name,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                val secondary = buildString {
                    append(formatFileSize(item.size))
                    if (item.mtime > 0) {
                        append(" · ")
                        append(formatDate(item.mtime))
                    }
                }
                Text(
                    secondary,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    when (localAvailability) {
                        CloudLocalAvailabilityValues.OFFLINE -> "离线保留"
                        CloudLocalAvailabilityValues.LOCAL -> "本地可用"
                        else -> "仅云端"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            IconButton(onClick = onDelete) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = "删除",
                    tint = MaterialTheme.colorScheme.outline
                )
            }
        }

        // 上传进度（仅在未终结时展示）
        uploadProgress?.takeIf { !it.isTerminal }?.let { p ->
            Spacer(Modifier.height(8.dp))
            ProgressRow(
                filename = p.filename,
                fraction = p.fraction,
                stateText = uploadStateLabel(p.state),
                errorMessage = p.errorMessage,
                isError = p.state == CloudUploadState.ERROR
            )
        }

        // 下载进度（仅在未终结时展示）
        downloadProgress?.takeIf { !it.isTerminal }?.let { p ->
            Spacer(Modifier.height(8.dp))
            ProgressRow(
                filename = p.filename,
                fraction = p.fraction,
                stateText = downloadStateLabel(p.state),
                errorMessage = p.errorMessage,
                isError = p.state == CloudDownloadState.ERROR
            )
        }
    }
}

@Composable
private fun ProgressRow(
    filename: String,
    fraction: Float,
    stateText: String,
    errorMessage: String?,
    isError: Boolean,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                filename,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                stateText,
                style = MaterialTheme.typography.bodySmall,
                color = if (isError) MaterialTheme.colorScheme.error
                else MaterialTheme.colorScheme.outline
            )
        }
        Spacer(modifier = Modifier.height(4.dp))
        LinearProgressIndicator(
            progress = { fraction.coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth(),
            color = if (isError) MaterialTheme.colorScheme.error
            else MaterialTheme.colorScheme.primary,
            trackColor = MaterialTheme.colorScheme.surfaceVariant
        )
        if (isError && !errorMessage.isNullOrEmpty()) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                errorMessage,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                maxLines = 2
            )
        }
    }
}

@Composable
private fun NewFolderDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("新建文件夹") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("文件夹名称") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(name) },
                enabled = name.isNotBlank()
            ) { Text("创建") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        }
    )
}

// ---------- 辅助 ----------

private fun formatFileSize(bytes: Long): String {
    if (bytes <= 0) return "0 B"
    val units = arrayOf("B", "KB", "MB", "GB", "TB")
    var size = bytes.toDouble()
    var idx = 0
    while (size >= 1024 && idx < units.lastIndex) {
        size /= 1024
        idx++
    }
    return if (idx == 0) "${bytes} B"
    else String.format(Locale.getDefault(), "%.1f %s", size, units[idx])
}

private fun formatDate(epochMillis: Long): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date(epochMillis))

private fun uploadStateLabel(state: CloudUploadState): String = when (state) {
    CloudUploadState.PENDING -> "等待中"
    CloudUploadState.UPLOADING -> "上传中"
    CloudUploadState.COMPLETED -> "已完成"
    CloudUploadState.PAUSED -> "已暂停"
    CloudUploadState.ERROR -> "失败"
}

private fun downloadStateLabel(state: CloudDownloadState): String = when (state) {
    CloudDownloadState.PENDING -> "等待中"
    CloudDownloadState.DOWNLOADING -> "下载中"
    CloudDownloadState.COMPLETED -> "已完成"
    CloudDownloadState.PAUSED -> "已暂停"
    CloudDownloadState.ERROR -> "失败"
}
