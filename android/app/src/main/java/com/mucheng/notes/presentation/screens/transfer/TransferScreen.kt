/**
 * LAN Transfer Assistant - Android 传输界面
 */

package com.mucheng.notes.presentation.screens.transfer

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.mucheng.notes.data.local.transfer.TransferMessageEntity
import com.mucheng.notes.data.local.transfer.TransferSessionEntity
import com.mucheng.notes.data.transfer.*
import com.mucheng.notes.presentation.components.QRScannerDialog
import com.mucheng.notes.presentation.viewmodel.TransferUiState
import com.mucheng.notes.presentation.viewmodel.TransferViewModel
import java.text.SimpleDateFormat
import java.util.*

/**
 * 传输助手主界面
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransferScreen(
    navController: NavController,
    bottomPadding: PaddingValues = PaddingValues(),
    viewModel: TransferViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    
    // 相机权限
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }
    
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasCameraPermission = isGranted
        if (isGranted) {
            viewModel.setScanning(true)
        }
    }
    
    // 显示扫码错误
    LaunchedEffect(uiState.scanError) {
        uiState.scanError?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearScanError()
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("快传") },
                actions = {
                    // 连接状态指示器
                    ConnectionStatusBadge(state = uiState.connectionState)
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        if (uiState.selectedSessionId != null) {
            // 聊天视图
            ChatView(
                uiState = uiState,
                onBack = { viewModel.selectSession("") },
                onSendMessage = { viewModel.sendTextMessage(it) },
                onSendFile = { uri -> viewModel.sendFile(uri) },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(bottom = bottomPadding.calculateBottomPadding())
            )
        } else {
            // 设备列表视图
            DeviceListView(
                uiState = uiState,
                onScanQR = {
                    if (hasCameraPermission) {
                        viewModel.setScanning(true)
                    } else {
                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                },
                onConnectRelay = { viewModel.connectToRelay(it) },
                onSelectDevice = { device ->
                    val sessionId = viewModel.createSession(device)
                },
                onSelectSession = { viewModel.selectSession(it.id) },
                onDisconnect = { viewModel.disconnect() },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(bottom = bottomPadding.calculateBottomPadding())
            )
        }
    }
    
    // 扫码对话框
    if (uiState.isScanning) {
        QRScannerDialog(
            onDismiss = { viewModel.setScanning(false) },
            onScanned = { qrData ->
                viewModel.setScanning(false)
                viewModel.connectFromQRCode(qrData)
            }
        )
    }
}

/**
 * 连接状态徽章
 */
@Composable
private fun ConnectionStatusBadge(state: ConnectionState) {
    val (color, text) = when (state) {
        is ConnectionState.Disconnected -> MaterialTheme.colorScheme.outline to "未连接"
        is ConnectionState.Connecting -> MaterialTheme.colorScheme.tertiary to "连接中..."
        is ConnectionState.Connected -> MaterialTheme.colorScheme.primary to when (state.mode) {
            ConnectionMode.LAN -> "局域网"
            ConnectionMode.RELAY -> "中继"
        }
        is ConnectionState.Error -> MaterialTheme.colorScheme.error to "错误"
    }
    
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = color.copy(alpha = 0.1f),
        modifier = Modifier.padding(end = 8.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(color)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                color = color
            )
        }
    }
}

/**
 * 设备列表视图
 */
@Composable
private fun DeviceListView(
    uiState: TransferUiState,
    onScanQR: () -> Unit,
    onConnectRelay: (String) -> Unit,
    onSelectDevice: (OnlineDevice) -> Unit,
    onSelectSession: (TransferSessionEntity) -> Unit,
    onDisconnect: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showRelayDialog by remember { mutableStateOf(false) }
    
    Column(modifier = modifier) {
        // 连接操作区
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                when (uiState.connectionState) {
                    is ConnectionState.Disconnected, is ConnectionState.Error -> {
                        Text(
                            text = "扫描二维码连接到桌面端",
                            style = MaterialTheme.typography.bodyLarge,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Button(onClick = onScanQR) {
                                Icon(Icons.Default.QrCodeScanner, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("扫描二维码")
                            }
                            OutlinedButton(onClick = { showRelayDialog = true }) {
                                Icon(Icons.Default.Cloud, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("中继连接")
                            }
                        }
                        if (uiState.connectionState is ConnectionState.Error) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = (uiState.connectionState as ConnectionState.Error).error.message,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                    is ConnectionState.Connecting -> {
                        CircularProgressIndicator(modifier = Modifier.size(48.dp))
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("正在连接...")
                    }
                    is ConnectionState.Connected -> {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "已连接",
                                style = MaterialTheme.typography.bodyLarge,
                                modifier = Modifier.weight(1f)
                            )
                            TextButton(onClick = onDisconnect) {
                                Text("断开")
                            }
                        }
                    }
                }
            }
        }
        
        // 在线设备列表
        if (uiState.connectionState is ConnectionState.Connected) {
            Text(
                text = "在线设备 (${uiState.onlineDevices.size})",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )
            
            if (uiState.onlineDevices.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "暂无其他设备在线",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            } else {
                LazyColumn {
                    items(uiState.onlineDevices) { device ->
                        DeviceItem(
                            device = device,
                            onClick = { onSelectDevice(device) }
                        )
                    }
                }
            }
        }
        
        // 历史会话
        if (uiState.sessions.isNotEmpty()) {
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            Text(
                text = "历史会话",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )
            LazyColumn {
                items(uiState.sessions) { session ->
                    SessionItem(
                        session = session,
                        onClick = { onSelectSession(session) }
                    )
                }
            }
        }
    }
    
    // 中继服务器连接对话框
    if (showRelayDialog) {
        RelayServerDialog(
            onDismiss = { showRelayDialog = false },
            onConnect = { url ->
                showRelayDialog = false
                onConnectRelay(url)
            }
        )
    }
}

/**
 * 设备列表项
 */
@Composable
private fun DeviceItem(
    device: OnlineDevice,
    onClick: () -> Unit
) {
    ListItem(
        headlineContent = { Text(device.name) },
        supportingContent = { Text(device.type.value) },
        leadingContent = {
            Icon(
                imageVector = when (device.type) {
                    DeviceType.DESKTOP -> Icons.Default.Computer
                    DeviceType.ANDROID -> Icons.Default.PhoneAndroid
                },
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary
            )
        },
        trailingContent = {
            Icon(Icons.Default.ChevronRight, contentDescription = null)
        },
        modifier = Modifier.clickable(onClick = onClick)
    )
}

/**
 * 会话列表项
 */
@Composable
private fun SessionItem(
    session: TransferSessionEntity,
    onClick: () -> Unit
) {
    val dateFormat = remember { SimpleDateFormat("MM-dd HH:mm", Locale.getDefault()) }
    
    ListItem(
        headlineContent = { Text(session.peerDeviceName) },
        supportingContent = {
            Text(dateFormat.format(Date(session.startedAt)))
        },
        leadingContent = {
            Icon(
                Icons.Default.History,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outline
            )
        },
        trailingContent = {
            if (session.endedAt == null) {
                Badge { Text("进行中") }
            }
        },
        modifier = Modifier.clickable(onClick = onClick)
    )
}

/**
 * 聊天视图
 */
@Composable
private fun ChatView(
    uiState: TransferUiState,
    onBack: () -> Unit,
    onSendMessage: (String) -> Unit,
    onSendFile: (android.net.Uri) -> Unit,
    modifier: Modifier = Modifier
) {
    val session = uiState.sessions.find { it.id == uiState.selectedSessionId }
    var inputText by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    
    // 文件选择器
    val filePickerLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        uri?.let { onSendFile(it) }
    }
    
    // 自动滚动到底部
    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            listState.animateScrollToItem(uiState.messages.size - 1)
        }
    }
    
    Column(modifier = modifier) {
        // 顶部栏
        Surface(
            tonalElevation = 2.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp)
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "返回")
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = session?.peerDeviceName ?: "会话",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Text(
                        text = if (session?.endedAt == null) "进行中" else "已结束",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }
        }
        
        // 消息列表
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 16.dp)
        ) {
            items(uiState.messages) { message ->
                MessageBubble(message = message)
            }
        }
        
        // 输入区域
        Surface(
            tonalElevation = 2.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp)
            ) {
                // 附件按钮
                IconButton(onClick = { filePickerLauncher.launch("*/*") }) {
                    Icon(Icons.Default.AttachFile, contentDescription = "附件")
                }
                
                // 输入框
                OutlinedTextField(
                    value = inputText,
                    onValueChange = { inputText = it },
                    placeholder = { Text("输入消息...") },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(
                        onSend = {
                            if (inputText.isNotBlank()) {
                                onSendMessage(inputText)
                                inputText = ""
                            }
                        }
                    )
                )
                
                Spacer(modifier = Modifier.width(8.dp))
                
                // 发送按钮
                IconButton(
                    onClick = {
                        if (inputText.isNotBlank()) {
                            onSendMessage(inputText)
                            inputText = ""
                        }
                    },
                    enabled = inputText.isNotBlank()
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.Send,
                        contentDescription = "发送",
                        tint = if (inputText.isNotBlank()) 
                            MaterialTheme.colorScheme.primary 
                        else 
                            MaterialTheme.colorScheme.outline
                    )
                }
            }
        }
    }
}

/**
 * 消息气泡
 */
@Composable
private fun MessageBubble(message: TransferMessageEntity) {
    val isSent = message.direction == MessageDirection.SENT.value
    val dateFormat = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isSent) Arrangement.End else Arrangement.Start
    ) {
        Surface(
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomStart = if (isSent) 16.dp else 4.dp,
                bottomEnd = if (isSent) 4.dp else 16.dp
            ),
            color = if (isSent) 
                MaterialTheme.colorScheme.primary 
            else 
                MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier.widthIn(max = 280.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = message.content,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isSent) 
                        MaterialTheme.colorScheme.onPrimary 
                    else 
                        MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = dateFormat.format(Date(message.createdAt)),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isSent) 
                        MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.7f) 
                    else 
                        MaterialTheme.colorScheme.outline
                )
            }
        }
    }
}

/**
 * 中继服务器连接对话框
 */
@Composable
private fun RelayServerDialog(
    onDismiss: () -> Unit,
    onConnect: (String) -> Unit
) {
    var serverUrl by remember { mutableStateOf("") }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("连接中继服务器") },
        text = {
            Column {
                Text(
                    text = "输入中继服务器地址以连接",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    label = { Text("服务器地址") },
                    placeholder = { Text("https://your-server.com") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConnect(serverUrl) },
                enabled = serverUrl.isNotBlank()
            ) {
                Text("连接")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("取消")
            }
        }
    )
}
