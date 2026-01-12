package com.mucheng.notes.presentation.screens.ai

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.mucheng.notes.R
import com.mucheng.notes.presentation.screens.settings.AIChannel
import com.mucheng.notes.presentation.screens.settings.AIModel
import com.mucheng.notes.presentation.viewmodel.AIViewModel
import com.mucheng.notes.presentation.viewmodel.ConversationItem
import com.mucheng.notes.presentation.viewmodel.MessageItem
import com.mucheng.notes.presentation.viewmodel.SettingsViewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * AI 助手页面 - 重构版
 * 采用侧边栏抽屉模式管理历史记录，界面更符合移动端习惯
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AIScreen(
    navController: NavController,
    bottomPadding: PaddingValues = PaddingValues(),
    viewModel: AIViewModel = hiltViewModel(),
    settingsViewModel: SettingsViewModel = hiltViewModel()
) {
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val conversations by viewModel.conversations.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    val settingsState by settingsViewModel.uiState.collectAsState()

    // 解析配置
    val userChannels = remember(settingsState.aiChannelsJson) {
        if (settingsState.aiChannelsJson.isNotBlank()) {
            try {
                Json { ignoreUnknownKeys = true }.decodeFromString<List<AIChannel>>(settingsState.aiChannelsJson)
                    .filter { it.enabled && it.apiKey.isNotBlank() }
            } catch (e: Exception) { emptyList() }
        } else emptyList()
    }

    // 对话框状态
    var showCreateDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var conversationToDelete by remember { mutableStateOf<ConversationItem?>(null) }
    var showMenu by remember { mutableStateOf(false) }

    // 当前选中的对话
    val currentConversation = conversations.find { it.id == uiState.selectedConversationId }
    
    // 判断是否应该显示输入框：有选中的对话ID即可（即使conversation列表还没加载完）
    val shouldShowInput = uiState.selectedConversationId != null
    
    // 调试日志
    androidx.compose.runtime.LaunchedEffect(uiState.selectedConversationId) {
        android.util.Log.d("AIScreen", "selectedConversationId changed: ${uiState.selectedConversationId}, shouldShowInput: $shouldShowInput")
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "历史对话",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(vertical = 12.dp)
                    )
                    Button(
                        onClick = {
                            showCreateDialog = true
                            scope.launch { drawerState.close() }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("开启新对话")
                    }
                }
                HorizontalDivider()
                LazyColumn(modifier = Modifier.weight(1f)) {
                    items(conversations) { conversation ->
                        NavigationDrawerItem(
                            label = { Text(conversation.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            selected = conversation.id == uiState.selectedConversationId,
                            onClick = {
                                viewModel.selectConversation(conversation.id)
                                scope.launch { drawerState.close() }
                            },
                            icon = { Icon(Icons.Default.ChatBubbleOutline, contentDescription = null) },
                            modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding),
                            badge = {
                                IconButton(
                                    onClick = {
                                        conversationToDelete = conversation
                                        showDeleteDialog = true
                                    },
                                    modifier = Modifier.size(24.dp)
                                ) {
                                    Icon(Icons.Default.Delete, contentDescription = "删除", tint = MaterialTheme.colorScheme.outline)
                                }
                            }
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
                        Column {
                            Text(
                                text = currentConversation?.title ?: "AI 助手",
                                style = MaterialTheme.typography.titleMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            if (currentConversation != null) {
                                Text(
                                    text = currentConversation.model,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Default.Menu, contentDescription = "菜单")
                        }
                    },
                    actions = {
                        IconButton(onClick = { showCreateDialog = true }) {
                            Icon(Icons.Default.Add, contentDescription = "新对话")
                        }
                        Box {
                            IconButton(onClick = { showMenu = true }) {
                                Icon(Icons.Default.MoreVert, contentDescription = "更多")
                            }
                            DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
                                DropdownMenuItem(
                                    text = { Text("AI 设置") },
                                    onClick = {
                                        showMenu = false
                                        navController.navigate("settings/ai")
                                    }
                                )
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface
                    )
                )
            },
            bottomBar = {
                // 当有选中的对话ID时显示输入框（即使conversation数据还在加载）
                if (shouldShowInput) {
                    ChatInputArea(
                        isThinking = uiState.isThinking,
                        onSend = { viewModel.sendMessage(it) }
                    )
                }
            }
        ) { paddingValues ->
            if (!shouldShowInput) {
                EmptyStateView(
                    paddingValues = paddingValues,
                    onCreateClick = { showCreateDialog = true }
                )
            } else {
                // 有选中的对话ID，显示消息列表
                ChatMessagesList(
                    viewModel = viewModel,
                    conversationId = uiState.selectedConversationId!!,
                    paddingValues = paddingValues,
                    error = uiState.error,
                    onErrorDismiss = { viewModel.clearError() }
                )
            }
        }
    }

    // 对话框逻辑
    if (showCreateDialog) {
        if (userChannels.isEmpty()) {
            NoChannelsDialog(
                onDismiss = { showCreateDialog = false },
                onGoToSettings = {
                    showCreateDialog = false
                    navController.navigate("settings/ai")
                }
            )
        } else {
            CreateConversationDialog(
                channels = userChannels,
                onDismiss = { showCreateDialog = false },
                onCreate = { title, model, systemPrompt, temperature, maxTokens ->
                    viewModel.createConversation(title, model, systemPrompt, temperature, maxTokens)
                    showCreateDialog = false
                }
            )
        }
    }

    if (showDeleteDialog && conversationToDelete != null) {
        DeleteConfirmDialog(
            title = conversationToDelete!!.title,
            onConfirm = {
                viewModel.deleteConversation(conversationToDelete!!.id)
                showDeleteDialog = false
                conversationToDelete = null
            },
            onDismiss = {
                showDeleteDialog = false
                conversationToDelete = null
            }
        )
    }
}

@Composable
fun EmptyStateView(paddingValues: PaddingValues, onCreateClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(paddingValues),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Default.SmartToy,
                contentDescription = null,
                modifier = Modifier.size(80.dp),
                tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
            )
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                "开始一次新的对话",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "选择一个模型，向 AI 提问",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.outline
            )
            Spacer(modifier = Modifier.height(32.dp))
            Button(onClick = onCreateClick) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("创建对话")
            }
        }
    }
}

@Composable
fun ChatMessagesList(
    viewModel: AIViewModel,
    conversationId: String,
    paddingValues: PaddingValues,
    error: String?,
    onErrorDismiss: () -> Unit
) {
    val allMessages by viewModel.messages.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    
    // 过滤并排序消息
    val messages = remember(allMessages, conversationId) {
        allMessages
            .filter { it.conversationId == conversationId }
            .sortedBy { it.createdAt }
    }
    
    val listState = rememberLazyListState()

    // 错误提示
    if (error != null) {
        AlertDialog(
            onDismissRequest = onErrorDismiss,
            title = { Text("提示") },
            text = { Text(error) },
            confirmButton = { TextButton(onClick = onErrorDismiss) { Text("确定") } }
        )
    }

    // 自动滚动到底部
    LaunchedEffect(messages.size, uiState.streamingContent.length) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    LazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .padding(paddingValues)
            .padding(horizontal = 12.dp),
        contentPadding = PaddingValues(top = 16.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        items(messages) { message ->
            val isStreaming = message.id == uiState.streamingMessageId
            val content = if (isStreaming) uiState.streamingContent else message.content
            
            // Only show if content is not empty (or is streaming)
            if (content.isNotEmpty() || isStreaming) {
                MessageBubble(message, content)
            }
        }
    }
}

@Composable
fun MessageBubble(message: MessageItem, displayContent: String) {
    val isUser = message.role == "user"
    val bubbleColor = if (isUser) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
    val textColor = if (isUser) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
    val align = if (isUser) Alignment.End else Alignment.Start

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = align
    ) {
        Row(
            verticalAlignment = Alignment.Top,
            horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (!isUser) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primaryContainer),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.SmartToy,
                        null,
                        modifier = Modifier.size(20.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
                Spacer(Modifier.width(8.dp))
            }

            Column(modifier = Modifier.weight(1f, fill = false)) {
                
                Card(
                    shape = RoundedCornerShape(
                        topStart = 18.dp,
                        topEnd = 18.dp,
                        bottomStart = if (!isUser) 4.dp else 18.dp,
                        bottomEnd = if (isUser) 4.dp else 18.dp
                    ),
                    colors = CardDefaults.cardColors(containerColor = bubbleColor),
                    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
                ) {
                    SelectionContainer {
                        Text(
                            text = displayContent,
                            modifier = Modifier.padding(12.dp),
                            color = textColor,
                            style = MaterialTheme.typography.bodyLarge.copy(lineHeight = 22.sp)
                        )
                    }
                }
                
                // 时间戳
                Text(
                    text = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(message.createdAt)),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.7f),
                    modifier = Modifier
                        .padding(top = 4.dp)
                        .align(if (isUser) Alignment.End else Alignment.Start)
                )
            }

            if (isUser) {
                Spacer(Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.secondaryContainer),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.Person,
                        null,
                        modifier = Modifier.size(20.dp),
                        tint = MaterialTheme.colorScheme.secondary
                    )
                }
            }
        }
    }
}

@Composable
fun ChatInputArea(isThinking: Boolean, onSend: (String) -> Unit) {
    var text by remember { mutableStateOf("") }

    Surface(
        modifier = Modifier.imePadding(),
        shadowElevation = 8.dp,
        tonalElevation = 2.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(12.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                modifier = Modifier
                    .weight(1f)
                    .padding(end = 8.dp),
                placeholder = { Text("输入消息...") },
                maxLines = 5,
                shape = RoundedCornerShape(24.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
                ),
                enabled = !isThinking
            )

            Button(
                onClick = {
                    if (text.isNotBlank()) {
                        onSend(text)
                        text = ""
                    }
                },
                enabled = text.isNotBlank() && !isThinking,
                shape = CircleShape,
                contentPadding = PaddingValues(0.dp),
                modifier = Modifier.size(50.dp)
            ) {
                if (isThinking) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "发送")
                }
            }
        }
    }
}

// ---------------- DIALOGS ----------------

@Composable
fun NoChannelsDialog(onDismiss: () -> Unit, onGoToSettings: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("未配置 AI 渠道") },
        text = { Text("请先在「设置」中添加 AI 渠道并配置 API Key，支持 OpenAI、Anthropic、DeepSeek 等。") },
        confirmButton = { TextButton(onClick = onGoToSettings) { Text("去设置") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}

@Composable
fun DeleteConfirmDialog(title: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("删除对话") },
        text = { Text("确定要删除 \"$title\" 吗？此操作无法撤销。") },
        confirmButton = { TextButton(onClick = onConfirm) { Text("删除", color = MaterialTheme.colorScheme.error) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateConversationDialog(
    channels: List<AIChannel>,
    onDismiss: () -> Unit,
    onCreate: (String, String, String, Float, Int) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var selectedChannel by remember { mutableStateOf<AIChannel?>(null) }
    var selectedModel by remember { mutableStateOf<AIModel?>(null) }
    var systemPrompt by remember { mutableStateOf("") }
    var temperature by remember { mutableFloatStateOf(0.7f) }
    var maxTokensStr by remember { mutableStateOf("4096") }
    
    // Dropdown states
    var channelExpanded by remember { mutableStateOf(false) }
    var modelExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("开启新对话") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("对话名称") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                // Channel Selector
                Box(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = selectedChannel?.name ?: "",
                        onValueChange = {},
                        label = { Text("选择渠道") },
                        readOnly = true,
                        trailingIcon = { IconButton(onClick = { channelExpanded = true }) { Icon(Icons.Default.MoreVert, null) } },
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { channelExpanded = true },
                        enabled = false, // Disable typing, handled by box click or icon
                        colors = OutlinedTextFieldDefaults.colors(
                            disabledTextColor = MaterialTheme.colorScheme.onSurface,
                            disabledBorderColor = MaterialTheme.colorScheme.outline
                        )
                    )
                    // Box covering for click
                    Box(modifier = Modifier
                        .matchParentSize()
                        .clickable { channelExpanded = true })
                        
                    DropdownMenu(expanded = channelExpanded, onDismissRequest = { channelExpanded = false }) {
                        channels.forEach { channel ->
                            DropdownMenuItem(
                                text = { Text(channel.name) },
                                onClick = {
                                    selectedChannel = channel
                                    selectedModel = channel.models.firstOrNull()
                                    channelExpanded = false
                                }
                            )
                        }
                    }
                }

                // Model Selector
                Box(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = selectedModel?.name ?: "",
                        onValueChange = {},
                        label = { Text("选择模型") },
                        readOnly = true,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = false,
                        colors = OutlinedTextFieldDefaults.colors(
                            disabledTextColor = MaterialTheme.colorScheme.onSurface,
                            disabledBorderColor = MaterialTheme.colorScheme.outline
                        )
                    )
                     Box(modifier = Modifier
                        .matchParentSize()
                        .clickable(enabled = selectedChannel != null) { modelExpanded = true })

                    if (selectedChannel != null) {
                        DropdownMenu(expanded = modelExpanded, onDismissRequest = { modelExpanded = false }) {
                            selectedChannel!!.models.forEach { model ->
                                DropdownMenuItem(
                                    text = { Text(model.name) },
                                    onClick = {
                                        selectedModel = model
                                        modelExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }

                // Advanced Options
                OutlinedTextField(
                    value = systemPrompt,
                    onValueChange = { systemPrompt = it },
                    label = { Text("系统提示词 (System Prompt)") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
                
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("温度: ${"%.1f".format(temperature)}", modifier = Modifier.width(80.dp), style = MaterialTheme.typography.bodySmall)
                    Slider(value = temperature, onValueChange = { temperature = it }, valueRange = 0f..2f, modifier = Modifier.weight(1f))
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val finalModel = selectedModel?.id ?: "gpt-3.5-turbo"
                    val finalTokens = maxTokensStr.toIntOrNull() ?: 4096
                    onCreate(title.ifBlank { "新对话" }, finalModel, systemPrompt, temperature, finalTokens)
                },
                enabled = selectedChannel != null && selectedModel != null
            ) {
                Text("创建")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        }
    )
}
