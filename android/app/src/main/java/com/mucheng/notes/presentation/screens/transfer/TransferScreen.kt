/**
 * LAN Transfer Assistant - Android 传输界面
 * 
 * 支持两种独立模式：
 * 1. 局域网模式：扫码连接同一网络的桌面端
 * 2. 中继模式：通过云端中继服务器跨网络连接
 */

package com.mucheng.notes.presentation.screens.transfer

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.mucheng.notes.data.local.transfer.TransferMessageEntity
import com.mucheng.notes.data.local.transfer.TransferSessionEntity
import com.mucheng.notes.data.local.transfer.TransferFileEntity
import com.mucheng.notes.data.transfer.*
import com.mucheng.notes.presentation.components.QRScannerDialog
import com.mucheng.notes.presentation.viewmodel.TransferUiState
import com.mucheng.notes.presentation.viewmodel.TransferViewModel
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

// 连接模式枚举
enum class TransferMode(val title: String, val icon: @Composable () -> Unit) {
    LAN("局域网", { Icon(Icons.Default.Wifi, contentDescription = null) }),
    RELAY("中继", { Icon(Icons.Default.Cloud, contentDescription = null) })
}

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
    val scope = rememberCoroutineScope()
    
    // Tab 状态
    val pagerState = rememberPagerState(pageCount = { 2 })
    val currentMode = if (pagerState.currentPage == 0) TransferMode.LAN else TransferMode.RELAY
    
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
    
    // 中继服务器配置（从 SharedPreferences 加载）
    var relayServerUrl by remember { mutableStateOf("") }
    var relayKey by remember { mutableStateOf("") }
    
    // 加载保存的中继配置
    LaunchedEffect(Unit) {
        val prefs = context.getSharedPreferences("transfer_relay", Context.MODE_PRIVATE)
        relayServerUrl = prefs.getString("server_url", "") ?: ""
        relayKey = prefs.getString("relay_key", "") ?: ""
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
                onBack = { viewModel.deselectSession() },
                onSendMessage = { viewModel.sendTextMessage(it) },
                onSendFile = { uri -> viewModel.sendFile(uri) },
                onOpenFile = { fileId -> viewModel.openFile(fileId) },
                onOpenFolder = { fileId -> viewModel.openFileFolder(fileId) },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(bottom = bottomPadding.calculateBottomPadding())
            )
        } else {
            // 模式选择 + 设备列表
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(bottom = bottomPadding.calculateBottomPadding())
            ) {
                // Tab 栏
                TabRow(
                    selectedTabIndex = pagerState.currentPage,
                    containerColor = MaterialTheme.colorScheme.surface
                ) {
                    TransferMode.entries.forEachIndexed { index, mode ->
                        Tab(
                            selected = pagerState.currentPage == index,
                            onClick = { scope.launch { pagerState.animateScrollToPage(index) } },
                            text = { Text(mode.title) },
                            icon = mode.icon
                        )
                    }
                }
                
                // 分页内容
                HorizontalPager(
                    state = pagerState,
                    modifier = Modifier.fillMaxSize()
                ) { page ->
                    when (page) {
                        0 -> LANModeContent(
                            uiState = uiState,
                            hasCameraPermission = hasCameraPermission,
                            onRequestCameraPermission = {
                                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                            },
                            onScanQR = { viewModel.setScanning(true) },
                            onSelectDevice = { device ->
                                viewModel.createSession(device)
                            },
                            onSelectSession = { viewModel.selectSession(it.id) },
                            onDisconnect = { viewModel.disconnect() }
                        )
                        1 -> RelayModeContent(
                            uiState = uiState,
                            serverUrl = relayServerUrl,
                            relayKey = relayKey,
                            onServerUrlChange = { relayServerUrl = it },
                            onRelayKeyChange = { relayKey = it },
                            onConnect = {
                                // 保存配置
                                context.getSharedPreferences("transfer_relay", Context.MODE_PRIVATE)
                                    .edit()
                                    .putString("server_url", relayServerUrl)
                                    .putString("relay_key", relayKey)
                                    .apply()
                                // 连接
                                viewModel.connectToRelay(relayServerUrl, relayKey)
                            },
                            onSelectDevice = { device ->
                                viewModel.createSession(device)
                            },
                            onSelectSession = { viewModel.selectSession(it.id) },
                            onDisconnect = { viewModel.disconnect() }
                        )
                    }
                }
            }
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
 * 局域网模式内容
 */
@Composable
private fun LANModeContent(
    uiState: TransferUiState,
    hasCameraPermission: Boolean,
    onRequestCameraPermission: () -> Unit,
    onScanQR: () -> Unit,
    onSelectDevice: (OnlineDevice) -> Unit,
    onSelectSession: (TransferSessionEntity) -> Unit,
    onDisconnect: () -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // 连接操作卡片
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    when (uiState.connectionState) {
                        is ConnectionState.Disconnected, is ConnectionState.Error -> {
                            Icon(
                                Icons.Default.QrCodeScanner,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                text = "扫描桌面端二维码连接",
                                style = MaterialTheme.typography.bodyLarge,
                                textAlign = TextAlign.Center
                            )
                            Text(
                                text = "确保手机和电脑在同一局域网内",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.outline,
                                textAlign = TextAlign.Center
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(
                                onClick = {
                                    if (hasCameraPermission) {
                                        onScanQR()
                                    } else {
                                        onRequestCameraPermission()
                                    }
                                },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Default.QrCodeScanner, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("扫描二维码")
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
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(24.dp)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "已连接 (局域网)",
                                        style = MaterialTheme.typography.bodyLarge
                                    )
                                    Text(
                                        text = "${uiState.onlineDevices.size} 个设备在线",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.outline
                                    )
                                }
                                TextButton(onClick = onDisconnect) {
                                    Text("断开")
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // 在线设备列表
        if (uiState.connectionState is ConnectionState.Connected && uiState.onlineDevices.isNotEmpty()) {
            item {
                Text(
                    text = "在线设备",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            }
            items(uiState.onlineDevices) { device ->
                DeviceItem(device = device, onClick = { onSelectDevice(device) })
            }
        }
        
        // 历史会话
        val lanSessions = uiState.sessions.filter { it.connectionType == ConnectionMode.LAN.value }
        if (lanSessions.isNotEmpty()) {
            item {
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                Text(
                    text = "历史会话",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            }
            items(lanSessions) { session ->
                SessionItem(session = session, onClick = { onSelectSession(session) })
            }
        }
    }
}

/**
 * 中继模式内容
 */
@Composable
private fun RelayModeContent(
    uiState: TransferUiState,
    serverUrl: String,
    relayKey: String,
    onServerUrlChange: (String) -> Unit,
    onRelayKeyChange: (String) -> Unit,
    onConnect: () -> Unit,
    onSelectDevice: (OnlineDevice) -> Unit,
    onSelectSession: (TransferSessionEntity) -> Unit,
    onDisconnect: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showKey by remember { mutableStateOf(false) }
    val isConnectedToRelay = uiState.connectionState is ConnectionState.Connected && 
        (uiState.connectionState as ConnectionState.Connected).mode == ConnectionMode.RELAY
    
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // 连接操作卡片
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    when {
                        uiState.connectionState is ConnectionState.Connecting -> {
                            CircularProgressIndicator(modifier = Modifier.size(48.dp))
                            Spacer(modifier = Modifier.height(16.dp))
                            Text("正在连接中继服务器...")
                        }
                        isConnectedToRelay -> {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(
                                    Icons.Default.Cloud,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(24.dp)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "已连接 (中继)",
                                        style = MaterialTheme.typography.bodyLarge
                                    )
                                    Text(
                                        text = serverUrl,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.outline,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                                TextButton(onClick = onDisconnect) {
                                    Text("断开")
                                }
                            }
                        }
                        else -> {
                            Icon(
                                Icons.Default.Cloud,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                text = "连接中继服务器",
                                style = MaterialTheme.typography.bodyLarge,
                                textAlign = TextAlign.Center
                            )
                            Text(
                                text = "跨网络传输，无需同一局域网",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.outline,
                                textAlign = TextAlign.Center
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            
                            // 服务器地址输入
                            OutlinedTextField(
                                value = serverUrl,
                                onValueChange = onServerUrlChange,
                                label = { Text("服务器地址") },
                                placeholder = { Text("https://your-server.com") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            
                            // 中继密钥输入
                            OutlinedTextField(
                                value = relayKey,
                                onValueChange = onRelayKeyChange,
                                label = { Text("中继密钥") },
                                placeholder = { Text("输入服务器配置的密钥") },
                                singleLine = true,
                                visualTransformation = if (showKey) VisualTransformation.None else PasswordVisualTransformation(),
                                trailingIcon = {
                                    IconButton(onClick = { showKey = !showKey }) {
                                        Icon(
                                            imageVector = if (showKey) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                            contentDescription = if (showKey) "隐藏密钥" else "显示密钥"
                                        )
                                    }
                                },
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            
                            Button(
                                onClick = onConnect,
                                enabled = serverUrl.isNotBlank() && relayKey.isNotBlank(),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Default.CloudUpload, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("连接中继服务器")
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
                    }
                }
            }
        }
        
        // 提示信息
        if (!isConnectedToRelay && uiState.connectionState !is ConnectionState.Connecting) {
            item {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Icon(
                            Icons.Default.Info,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.outline,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = "中继模式使用同步服务器进行消息转发，支持不同网络之间的设备连接。请确保同步服务器已配置中继功能。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                }
            }
        }
        
        // 在线设备列表
        if (isConnectedToRelay && uiState.onlineDevices.isNotEmpty()) {
            item {
                Text(
                    text = "在线设备",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            }
            items(uiState.onlineDevices) { device ->
                DeviceItem(device = device, onClick = { onSelectDevice(device) })
            }
        }
        
        // 历史会话
        val relaySessions = uiState.sessions.filter { it.connectionType == ConnectionMode.RELAY.value }
        if (relaySessions.isNotEmpty()) {
            item {
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                Text(
                    text = "历史会话",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            }
            items(relaySessions) { session ->
                SessionItem(session = session, onClick = { onSelectSession(session) })
            }
        }
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
    onOpenFile: (String) -> Unit,
    onOpenFolder: (String) -> Unit,
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
                .fillMaxWidth()
                .weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (uiState.messages.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(48.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "暂无消息\n发送第一条消息开始聊天",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.outline,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            } else {
                items(uiState.messages) { message ->
                    val fileEntity = if (message.type == "file" && message.fileId != null) {
                        uiState.files.find { it.id == message.fileId }
                    } else null
                    MessageBubble(
                        message = message,
                        fileEntity = fileEntity,
                        onOpenFile = { fileId -> onOpenFile(fileId) },
                        onOpenFolder = { fileId -> onOpenFolder(fileId) }
                    )
                }
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
                    Icon(Icons.Default.AttachFile, contentDescription = "发送文件")
                }
                
                // 输入框
                OutlinedTextField(
                    value = inputText,
                    onValueChange = { inputText = it },
                    placeholder = { Text("输入消息...") },
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 8.dp),
                    maxLines = 4,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(
                        onSend = {
                            if (inputText.isNotBlank()) {
                                onSendMessage(inputText)
                                inputText = ""
                            }
                        }
                    ),
                    shape = RoundedCornerShape(24.dp)
                )
                
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
private fun MessageBubble(
    message: TransferMessageEntity,
    fileEntity: TransferFileEntity? = null,
    onOpenFile: (String) -> Unit = {},
    onOpenFolder: (String) -> Unit = {}
) {
    val isSent = message.direction == MessageDirection.SENT.value
    val isFileMessage = message.type == "file" || message.type == "image"
    val dateFormat = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
    val context = LocalContext.current
    
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
                if (isFileMessage) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier
                            .clickable(enabled = fileEntity != null) {
                                fileEntity?.let { onOpenFile(it.id) }
                            }
                            .padding(vertical = 4.dp)
                    ) {
                        Icon(
                            imageVector = if (message.type == "image") Icons.Filled.Image else Icons.Filled.AttachFile,
                            contentDescription = "File",
                            modifier = Modifier.size(20.dp),
                            tint = if (isSent)
                                MaterialTheme.colorScheme.onPrimary
                            else
                                MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = message.content.ifBlank { "文件" },
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (isSent)
                                MaterialTheme.colorScheme.onPrimary
                            else
                                MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    if (fileEntity != null && fileEntity.localPath != null) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.padding(top = 4.dp)
                        ) {
                            TextButton(
                                onClick = { onOpenFile(fileEntity.id) },
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                            ) {
                                Text("打开", style = MaterialTheme.typography.labelSmall)
                            }
                            TextButton(
                                onClick = { onOpenFolder(fileEntity.id) },
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                            ) {
                                Text("打开文件夹", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                } else {
                    Text(
                        text = message.content,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isSent) 
                            MaterialTheme.colorScheme.onPrimary 
                        else 
                            MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
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
