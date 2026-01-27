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
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.mucheng.notes.presentation.screens.settings.AIChannel
import com.mucheng.notes.presentation.screens.settings.AIModel
import com.mucheng.notes.presentation.viewmodel.AIViewModel
import com.mucheng.notes.presentation.viewmodel.ConversationItem
import com.mucheng.notes.presentation.viewmodel.MessageItem
import com.mucheng.notes.presentation.viewmodel.SettingsUiState
import com.mucheng.notes.presentation.viewmodel.SettingsViewModel
import kotlinx.serialization.json.Json
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 模型与渠道信息（本地定义，避免导入问题）
 */
private data class ModelInfo(
    val channelId: String,
    val channelName: String,
    val modelId: String,
    val modelName: String
)

/**
 * AI 助手页面 - 重构版
 * 移除侧边栏，对话列表作为主视图
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AIScreen(
    navController: NavController,
    bottomPadding: PaddingValues = PaddingValues(),
    viewModel: AIViewModel = hiltViewModel(),
    settingsViewModel: SettingsViewModel = hiltViewModel()
) {
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

    // 当前选中的对话
    val currentConversation = conversations.find { it.id == uiState.selectedConversationId }
    
    // 设置更新回调
    val handleUpdateSettings: (String, String, String, Float, Int) -> Unit = { convId, model, systemPrompt, temperature, maxTokens ->
        viewModel.updateSettings(convId, model, systemPrompt, temperature, maxTokens)
    }
    
    // 根据是否选中对话显示不同视图
    if (uiState.selectedConversationId == null) {
        // 主视图：对话列表
        ConversationListScreen(
            conversations = conversations,
            bottomPadding = bottomPadding,
            onConversationClick = { viewModel.selectConversation(it.id) },
            onCreateClick = { showCreateDialog = true },
            onDeleteClick = { 
                conversationToDelete = it
                showDeleteDialog = true
            },
            onSettingsClick = { navController.navigate("settings/ai") }
        )
    } else {
        // 聊天视图
        ChatScreen(
            conversation = currentConversation,
            viewModel = viewModel,
            settingsState = settingsState,
            bottomPadding = bottomPadding,
            onBack = { viewModel.selectConversation(null) },
            onSettingsClick = { navController.navigate("settings/ai") },
            onUpdateSettings = handleUpdateSettings
        )
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


/**
 * 对话列表主视图
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationListScreen(
    conversations: List<ConversationItem>,
    bottomPadding: PaddingValues,
    onConversationClick: (ConversationItem) -> Unit,
    onCreateClick: () -> Unit,
    onDeleteClick: (ConversationItem) -> Unit,
    onSettingsClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        // 顶部栏
        TopAppBar(
            title = { Text("AI 助手") },
            actions = {
                IconButton(onClick = onSettingsClick) {
                    Icon(Icons.Default.Settings, contentDescription = "设置")
                }
                IconButton(onClick = onCreateClick) {
                    Icon(Icons.Default.Add, contentDescription = "新建对话")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        )

        // 内容区域
        if (conversations.isEmpty()) {
            EmptyStateView(
                modifier = Modifier.weight(1f),
                onCreateClick = onCreateClick
            )
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(conversations.sortedByDescending { it.createdAt }) { conversation ->
                    ConversationListItem(
                        conversation = conversation,
                        onClick = { onConversationClick(conversation) },
                        onDelete = { onDeleteClick(conversation) }
                    )
                }
            }
        }
        
        // 底部导航栏间距
        Spacer(modifier = Modifier.padding(bottomPadding))
    }
}

/**
 * 对话列表项
 */
@Composable
fun ConversationListItem(
    conversation: ConversationItem,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    var showMenu by remember { mutableStateOf(false) }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // 图标
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.ChatBubbleOutline,
                    contentDescription = null,
                    modifier = Modifier.size(24.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
            }
            
            Spacer(modifier = Modifier.width(12.dp))
            
            // 内容
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = conversation.title,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = conversation.model,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())
                        .format(Date(conversation.createdAt)),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline
                )
            }
            
            // 更多菜单
            Box {
                IconButton(onClick = { showMenu = true }) {
                    Icon(
                        Icons.Default.MoreVert,
                        contentDescription = "更多",
                        tint = MaterialTheme.colorScheme.outline
                    )
                }
                DropdownMenu(
                    expanded = showMenu,
                    onDismissRequest = { showMenu = false }
                ) {
                    DropdownMenuItem(
                        text = { Text("删除", color = MaterialTheme.colorScheme.error) },
                        leadingIcon = {
                            Icon(
                                Icons.Default.Delete,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error
                            )
                        },
                        onClick = {
                            showMenu = false
                            onDelete()
                        }
                    )
                }
            }
        }
    }
}


/**
 * 聊天视图
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    conversation: ConversationItem?,
    viewModel: AIViewModel,
    settingsState: com.mucheng.notes.presentation.viewmodel.SettingsUiState,
    bottomPadding: PaddingValues,
    onBack: () -> Unit,
    onSettingsClick: () -> Unit,
    onUpdateSettings: (String, String, String, Float, Int) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    var showMenu by remember { mutableStateOf(false) }
    var showSettingsPanel by remember { mutableStateOf(false) }
    var showModelSelector by remember { mutableStateOf(false) }
    
    // 当前对话设置（可编辑）- 使用 conversation 的值作为初始值
    var currentModel by remember(conversation?.id) { mutableStateOf(conversation?.model ?: "") }
    var currentSystemPrompt by remember(conversation?.id) { mutableStateOf(conversation?.systemPrompt ?: "") }
    var currentTemperature by remember(conversation?.id) { mutableFloatStateOf(conversation?.temperature ?: 0.7f) }
    var currentMaxTokens by remember(conversation?.id) { mutableStateOf(conversation?.maxTokens ?: 4096) }
    
    // 当 conversation 的具体属性变化时（如从数据库重新加载），更新本地状态
    // 但只在用户没有主动修改的情况下更新
    LaunchedEffect(conversation?.model) {
        if (conversation != null && currentModel.isEmpty()) {
            currentModel = conversation.model
        }
    }
    LaunchedEffect(conversation?.systemPrompt) {
        if (conversation != null) {
            // 始终同步 systemPrompt，因为它可能从服务器同步过来
            currentSystemPrompt = conversation.systemPrompt
        }
    }
    LaunchedEffect(conversation?.temperature) {
        if (conversation != null) {
            currentTemperature = conversation.temperature
        }
    }
    LaunchedEffect(conversation?.maxTokens) {
        if (conversation != null) {
            currentMaxTokens = conversation.maxTokens
        }
    }
    
    // 获取所有可用模型（从 SettingsViewModel 获取）
    val userChannels = remember(settingsState.aiChannelsJson) {
        if (settingsState.aiChannelsJson.isNotBlank()) {
            try {
                Json { ignoreUnknownKeys = true }.decodeFromString<List<AIChannel>>(settingsState.aiChannelsJson)
                    .filter { it.enabled && it.apiKey.isNotBlank() }
            } catch (e: Exception) { emptyList() }
        } else emptyList()
    }
    
    val allModels: List<ModelInfo> = remember(userChannels) { 
        userChannels.flatMap { channel ->
            channel.models.map { model ->
                ModelInfo(channel.id, channel.name, model.id, model.name)
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        // 顶部栏
        TopAppBar(
            title = {
                Column {
                    Text(
                        text = conversation?.title ?: "对话",
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                }
            },
            actions = {
                // 模型选择器按钮
                Box {
                    Surface(
                        onClick = { showModelSelector = true },
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.primaryContainer,
                        modifier = Modifier.padding(end = 4.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = allModels.find { it.modelId == currentModel }?.modelName 
                                    ?: currentModel.take(15),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                maxLines = 1
                            )
                            Icon(
                                Icons.Default.MoreVert,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }
                    
                    // 模型选择下拉菜单
                    DropdownMenu(
                        expanded = showModelSelector,
                        onDismissRequest = { showModelSelector = false }
                    ) {
                        if (allModels.isEmpty()) {
                            DropdownMenuItem(
                                text = { Text("未配置模型", color = MaterialTheme.colorScheme.outline) },
                                onClick = { showModelSelector = false }
                            )
                        } else {
                            allModels.forEach { modelInfo ->
                                DropdownMenuItem(
                                    text = { 
                                        Column {
                                            Text(modelInfo.modelName)
                                            Text(
                                                modelInfo.channelName,
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.outline
                                            )
                                        }
                                    },
                                    onClick = {
                                        currentModel = modelInfo.modelId
                                        val convId = conversation?.id
                                        if (convId != null) {
                                            onUpdateSettings(
                                                convId,
                                                modelInfo.modelId,
                                                currentSystemPrompt,
                                                currentTemperature,
                                                currentMaxTokens
                                            )
                                        }
                                        showModelSelector = false
                                    },
                                    leadingIcon = {
                                        if (modelInfo.modelId == currentModel) {
                                            Icon(
                                                Icons.Default.SmartToy,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.primary
                                            )
                                        }
                                    }
                                )
                            }
                        }
                    }
                }
                
                // 设置按钮
                IconButton(onClick = { showSettingsPanel = !showSettingsPanel }) {
                    Icon(
                        Icons.Default.Settings, 
                        contentDescription = "对话设置",
                        tint = if (showSettingsPanel) MaterialTheme.colorScheme.primary 
                               else MaterialTheme.colorScheme.onSurface
                    )
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
                                onSettingsClick()
                            }
                        )
                    }
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        )
        
        // 设置面板
        if (showSettingsPanel) {
            ConversationSettingsPanel(
                systemPrompt = currentSystemPrompt,
                temperature = currentTemperature,
                maxTokens = currentMaxTokens,
                onSystemPromptChange = { currentSystemPrompt = it },
                onTemperatureChange = { currentTemperature = it },
                onMaxTokensChange = { currentMaxTokens = it },
                onSave = {
                    val convId = conversation?.id
                    if (convId != null) {
                        onUpdateSettings(
                            convId,
                            currentModel,
                            currentSystemPrompt,
                            currentTemperature,
                            currentMaxTokens
                        )
                    }
                    showSettingsPanel = false
                },
                onCancel = { showSettingsPanel = false }
            )
        }

        // 消息列表
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            ChatMessagesList(
                viewModel = viewModel,
                conversationId = uiState.selectedConversationId!!,
                error = uiState.error,
                onErrorDismiss = { viewModel.clearError() }
            )
        }

        // 输入框 - 使用当前 UI 上的设置，而不是从数据库读取
        ChatInputArea(
            isThinking = uiState.isThinking,
            onSend = { message ->
                viewModel.sendMessageWithSettings(
                    content = message,
                    modelId = currentModel,
                    systemPrompt = currentSystemPrompt,
                    temperature = currentTemperature,
                    maxTokens = currentMaxTokens
                )
            },
            bottomPadding = bottomPadding
        )
    }
}

/**
 * 对话设置面板
 */
@Composable
fun ConversationSettingsPanel(
    systemPrompt: String,
    temperature: Float,
    maxTokens: Int,
    onSystemPromptChange: (String) -> Unit,
    onTemperatureChange: (Float) -> Unit,
    onMaxTokensChange: (Int) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceVariant,
        tonalElevation = 2.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // 系统提示词
            Text(
                "系统提示词",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.outline
            )
            OutlinedTextField(
                value = systemPrompt,
                onValueChange = onSystemPromptChange,
                placeholder = { Text("设置 AI 的角色和行为...") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4
            )
            
            // 温度
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "温度: ${"%.1f".format(temperature)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.width(80.dp)
                )
                Slider(
                    value = temperature,
                    onValueChange = onTemperatureChange,
                    valueRange = 0f..2f,
                    modifier = Modifier.weight(1f)
                )
            }
            
            // 最大输出
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "最大输出: $maxTokens",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.width(120.dp)
                )
                Slider(
                    value = maxTokens.toFloat(),
                    onValueChange = { onMaxTokensChange(it.toInt()) },
                    valueRange = 256f..32000f,
                    steps = 124,
                    modifier = Modifier.weight(1f)
                )
            }
            
            // 按钮
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                TextButton(onClick = onCancel) {
                    Text("取消")
                }
                Spacer(Modifier.width(8.dp))
                Button(onClick = onSave) {
                    Text("保存设置")
                }
            }
        }
    }
}

@Composable
fun EmptyStateView(
    modifier: Modifier = Modifier,
    onCreateClick: () -> Unit
) {
    Box(
        modifier = modifier.fillMaxSize(),
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
    LaunchedEffect(messages.size, uiState.streamingContent.length, uiState.isThinking) {
        if (messages.isNotEmpty() || uiState.isThinking) {
            val targetIndex = if (uiState.isThinking && uiState.streamingContent.isEmpty()) {
                messages.size // 滚动到思考指示器
            } else {
                (messages.size - 1).coerceAtLeast(0)
            }
            if (targetIndex >= 0) {
                listState.animateScrollToItem(targetIndex)
            }
        }
    }

    LazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 12.dp),
        contentPadding = PaddingValues(top = 16.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        items(messages) { message ->
            // 只显示有内容的消息
            if (message.content.isNotEmpty()) {
                MessageBubble(message, message.content)
            }
        }
        
        // 正在思考时显示加载指示器（流式内容为空时）
        if (uiState.isThinking && uiState.streamingContent.isEmpty()) {
            item {
                ThinkingIndicator()
            }
        }
        
        // 显示流式内容（正在生成的回复）
        if (uiState.isThinking && uiState.streamingContent.isNotEmpty()) {
            item {
                StreamingMessageBubble(content = uiState.streamingContent)
            }
        }
    }
}


@Composable
fun ThinkingIndicator() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
        verticalAlignment = Alignment.CenterVertically
    ) {
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
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    "思考中...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun StreamingMessageBubble(content: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
        verticalAlignment = Alignment.Top
    ) {
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
        Column(modifier = Modifier.weight(1f, fill = false)) {
            Card(
                shape = RoundedCornerShape(
                    topStart = 18.dp,
                    topEnd = 18.dp,
                    bottomStart = 4.dp,
                    bottomEnd = 18.dp
                ),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    horizontalAlignment = Alignment.Start
                ) {
                    SelectionContainer {
                        MessageContent(
                            content = content, 
                            textColor = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    CircularProgressIndicator(
                        modifier = Modifier.size(12.dp),
                        strokeWidth = 1.5.dp,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
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
                        Column(modifier = Modifier.padding(12.dp)) {
                            MessageContent(content = displayContent, textColor = textColor)
                        }
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
fun MessageContent(content: String, textColor: androidx.compose.ui.graphics.Color) {
    val parts = remember(content) { content.split("```") }
    
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        parts.forEachIndexed { index, part ->
            if (index % 2 == 0) {
                // Regular Text
                if (part.isNotEmpty()) {
                    Text(
                        text = part,
                        color = textColor,
                        style = MaterialTheme.typography.bodyLarge.copy(lineHeight = 22.sp)
                    )
                }
            } else {
                // Code Block
                CodeBlock(code = part)
            }
        }
    }
}

@Composable
fun CodeBlock(code: String) {
    val clipboardManager = androidx.compose.ui.platform.LocalClipboardManager.current
    
    // Simple language extraction
    val (language, cleanedCode) = remember(code) {
        val trimmed = code.trim()
        val firstLineEnd = trimmed.indexOf('\n')
        if (firstLineEnd != -1) {
            val potentialLang = trimmed.substring(0, firstLineEnd).trim()
            if (potentialLang.isNotEmpty() && !potentialLang.contains(" ") && potentialLang.length < 20) {
                potentialLang to trimmed.substring(firstLineEnd + 1)
            } else {
                null to trimmed
            }
        } else {
            null to trimmed
        }
    }


    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f))
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = language ?: "Code",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontFamily = FontFamily.Monospace
                )
                IconButton(
                    onClick = { clipboardManager.setText(AnnotatedString(cleanedCode)) },
                    modifier = Modifier.size(24.dp)
                ) {
                    Icon(
                        Icons.Default.ContentCopy,
                        contentDescription = "Copy",
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            // Code
            Text(
                text = cleanedCode,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontFamily = FontFamily.Monospace,
                    fontSize = 13.sp,
                    lineHeight = 18.sp
                ),
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}


@Composable
fun ChatInputArea(
    isThinking: Boolean,
    onSend: (String) -> Unit,
    bottomPadding: PaddingValues
) {
    var text by remember { mutableStateOf("") }
    
    // 获取底部导航栏的高度
    val bottomPaddingDp = bottomPadding.calculateBottomPadding()

    Surface(
        modifier = Modifier.imePadding(),
        shadowElevation = 8.dp,
        tonalElevation = 2.dp,
        color = MaterialTheme.colorScheme.surface
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
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
            
            // 底部导航栏的间距
            Spacer(modifier = Modifier.height(bottomPaddingDp))
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
                        enabled = false,
                        colors = OutlinedTextFieldDefaults.colors(
                            disabledTextColor = MaterialTheme.colorScheme.onSurface,
                            disabledBorderColor = MaterialTheme.colorScheme.outline
                        )
                    )
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