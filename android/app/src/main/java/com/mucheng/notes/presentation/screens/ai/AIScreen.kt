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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.mucheng.notes.R
import com.mucheng.notes.presentation.screens.settings.AIChannel
import com.mucheng.notes.presentation.screens.settings.AIModel
import com.mucheng.notes.presentation.viewmodel.AIViewModel
import com.mucheng.notes.presentation.viewmodel.ConversationItem
import com.mucheng.notes.presentation.viewmodel.MessageItem
import com.mucheng.notes.presentation.viewmodel.SettingsViewModel
import kotlinx.serialization.json.Json

/**
 * AI 助手页面
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
    
    // 从设置中解析用户配置的 AI 渠道
    val userChannels = remember(settingsState.aiChannelsJson) {
        if (settingsState.aiChannelsJson.isNotBlank()) {
            try {
                Json { ignoreUnknownKeys = true }.decodeFromString<List<AIChannel>>(settingsState.aiChannelsJson)
                    .filter { it.enabled && it.apiKey.isNotBlank() }
            } catch (e: Exception) {
                emptyList()
            }
        } else {
            emptyList()
        }
    }
    
    var showDeleteDialog by remember { mutableStateOf(false) }
    var conversationToDelete by remember { mutableStateOf<ConversationItem?>(null) }
    var showCreateDialog by remember { mutableStateOf(false) }
    
    val selectedConversationId = uiState.selectedConversationId
    
    if (selectedConversationId != null) {
        // 显示对话详情
        ConversationScreen(
            conversationId = selectedConversationId,
            viewModel = viewModel,
            onBack = { viewModel.selectConversation(null) }
        )
    } else {
        // 显示对话列表
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(stringResource(R.string.nav_ai)) }
                )
            },
            floatingActionButton = {
                FloatingActionButton(
                    onClick = { showCreateDialog = true },
                    modifier = Modifier.padding(bottom = bottomPadding.calculateBottomPadding())
                ) {
                    Icon(Icons.Default.Add, contentDescription = stringResource(R.string.ai_new_conversation))
                }
            }
        ) { paddingValues ->
            if (conversations.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .padding(bottom = bottomPadding.calculateBottomPadding()),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.SmartToy,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.outline
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = stringResource(R.string.ai_empty),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.outline
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "点击右下角 + 开始新对话",
                            style = MaterialTheme.typography.bodyMedium,
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
                    items(conversations) { conversation ->
                        ConversationCard(
                            conversation = conversation,
                            onClick = { viewModel.selectConversation(conversation.id) },
                            onDelete = {
                                conversationToDelete = conversation
                                showDeleteDialog = true
                            }
                        )
                    }
                }
            }
        }
    }
    
    // 创建对话对话框
    if (showCreateDialog) {
        if (userChannels.isEmpty()) {
            // 没有配置渠道，提示用户去设置
            AlertDialog(
                onDismissRequest = { showCreateDialog = false },
                title = { Text("未配置 AI 渠道") },
                text = { 
                    Column {
                        Text("请先在「设置 → AI 设置」中添加 AI 渠道并配置 API Key。")
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "支持 OpenAI、Anthropic、DeepSeek、月之暗面等多种渠道。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            showCreateDialog = false
                            navController.navigate("settings/ai")
                        }
                    ) {
                        Text("去设置")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showCreateDialog = false }) {
                        Text("取消")
                    }
                }
            )
        } else {
            CreateConversationDialog(
                channels = userChannels,
                onDismiss = { showCreateDialog = false },
                onCreate = { title, model, systemPrompt, temperature, maxTokens ->
                    viewModel.createConversation(
                        title = title,
                        model = model,
                        systemPrompt = systemPrompt,
                        temperature = temperature,
                        maxTokens = maxTokens
                    )
                    showCreateDialog = false
                }
            )
        }
    }
    
    // 删除确认对话框
    if (showDeleteDialog && conversationToDelete != null) {
        AlertDialog(
            onDismissRequest = { 
                showDeleteDialog = false
                conversationToDelete = null
            },
            title = { Text("删除对话") },
            text = { Text("确定要删除对话 \"${conversationToDelete!!.title}\" 吗？") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteConversation(conversationToDelete!!.id)
                        showDeleteDialog = false
                        conversationToDelete = null
                    }
                ) {
                    Text("删除", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { 
                    showDeleteDialog = false
                    conversationToDelete = null
                }) {
                    Text("取消")
                }
            }
        )
    }
}

/**
 * 创建对话对话框
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateConversationDialog(
    channels: List<AIChannel>,
    onDismiss: () -> Unit,
    onCreate: (title: String, model: String, systemPrompt: String, temperature: Float, maxTokens: Int) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var systemPrompt by remember { mutableStateOf("") }
    var temperature by remember { mutableFloatStateOf(0.7f) }
    var maxTokens by remember { mutableStateOf("4096") }
    
    // 渠道和模型选择
    var selectedChannel by remember { mutableStateOf<AIChannel?>(null) }
    var selectedModel by remember { mutableStateOf<AIModel?>(null) }
    var showChannelMenu by remember { mutableStateOf(false) }
    var showModelMenu by remember { mutableStateOf(false) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("新建 AI 助手") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // 名称
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("助手名称") },
                    placeholder = { Text("例如：代码助手、写作助手") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                
                // 渠道选择
                ExposedDropdownMenuBox(
                    expanded = showChannelMenu,
                    onExpandedChange = { showChannelMenu = it }
                ) {
                    OutlinedTextField(
                        value = selectedChannel?.name ?: "",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("选择渠道") },
                        placeholder = { Text("请先选择 AI 渠道") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = showChannelMenu) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                        colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
                    )
                    ExposedDropdownMenu(
                        expanded = showChannelMenu,
                        onDismissRequest = { showChannelMenu = false }
                    ) {
                        channels.forEach { channel ->
                            DropdownMenuItem(
                                text = { Text(channel.name) },
                                onClick = {
                                    selectedChannel = channel
                                    selectedModel = null // 重置模型选择
                                    showChannelMenu = false
                                },
                                leadingIcon = {
                                    Icon(
                                        Icons.Default.SmartToy,
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            )
                        }
                    }
                }
                
                // 模型选择（仅在选择渠道后显示）
                ExposedDropdownMenuBox(
                    expanded = showModelMenu,
                    onExpandedChange = { 
                        if (selectedChannel != null) {
                            showModelMenu = it 
                        }
                    }
                ) {
                    OutlinedTextField(
                        value = selectedModel?.name ?: "",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("选择模型") },
                        placeholder = { 
                            Text(
                                if (selectedChannel == null) "请先选择渠道" 
                                else "选择模型"
                            ) 
                        },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = showModelMenu) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                        enabled = selectedChannel != null,
                        colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
                    )
                    if (selectedChannel != null) {
                        ExposedDropdownMenu(
                            expanded = showModelMenu,
                            onDismissRequest = { showModelMenu = false }
                        ) {
                            selectedChannel!!.models.forEach { model ->
                                DropdownMenuItem(
                                    text = { Text(model.name) },
                                    onClick = {
                                        selectedModel = model
                                        showModelMenu = false
                                    },
                                    leadingIcon = {
                                        Icon(
                                            Icons.Default.Memory,
                                            contentDescription = null,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                )
                            }
                        }
                    }
                }
                
                // 温度参数
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("温度 (Temperature)", style = MaterialTheme.typography.bodyMedium)
                        Text("%.1f".format(temperature), style = MaterialTheme.typography.bodyMedium)
                    }
                    Slider(
                        value = temperature,
                        onValueChange = { temperature = it },
                        valueRange = 0f..2f,
                        steps = 19
                    )
                    Text(
                        "较低温度输出更确定，较高温度输出更随机",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
                
                // 最大输出 Token
                OutlinedTextField(
                    value = maxTokens,
                    onValueChange = { maxTokens = it.filter { c -> c.isDigit() } },
                    label = { Text("最大输出 Token") },
                    placeholder = { Text("4096") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    supportingText = { Text("控制单次回复的最大长度") }
                )
                
                // 系统提示词
                OutlinedTextField(
                    value = systemPrompt,
                    onValueChange = { systemPrompt = it },
                    label = { Text("系统提示词 (System Prompt)") },
                    placeholder = { Text("定义 AI 助手的角色和行为...") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 6,
                    supportingText = { Text("可选，用于定义 AI 的角色、风格和行为规则") }
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val finalTitle = title.ifBlank { "新对话" }
                    val finalModel = selectedModel?.id ?: "gpt-4"
                    val finalMaxTokens = maxTokens.toIntOrNull() ?: 4096
                    onCreate(finalTitle, finalModel, systemPrompt, temperature, finalMaxTokens)
                },
                enabled = selectedChannel != null && selectedModel != null
            ) {
                Text("创建")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("取消")
            }
        }
    )
}

@Composable
private fun ConversationCard(
    conversation: ConversationItem,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
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
            Icon(
                Icons.Default.SmartToy,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(40.dp)
            )
            
            Spacer(modifier = Modifier.width(16.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = conversation.title,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                
                Text(
                    text = conversation.model,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
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
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConversationScreen(
    conversationId: String,
    viewModel: AIViewModel,
    onBack: () -> Unit
) {
    val allMessages by viewModel.messages.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    var inputText by remember { mutableStateOf("") }
    
    // 过滤当前对话的消息
    val messages = allMessages
        .filter { it.conversationId == conversationId }
        .sortedBy { it.createdAt }
    
    val listState = rememberLazyListState()
    
    // 新消息时滚动到底部
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("AI 对话") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "返回"
                        )
                    }
                }
            )
        },
        // 底部输入框
        bottomBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .imePadding()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = inputText,
                    onValueChange = { inputText = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("输入消息...") },
                    shape = RoundedCornerShape(24.dp),
                    enabled = !uiState.isThinking,
                    maxLines = 4
                )
                
                Spacer(modifier = Modifier.width(8.dp))
                
                IconButton(
                    onClick = {
                        if (inputText.isNotBlank()) {
                            viewModel.sendMessage(inputText)
                            inputText = ""
                        }
                    },
                    enabled = inputText.isNotBlank() && !uiState.isThinking
                ) {
                    if (uiState.isThinking) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(
                            Icons.Default.Send,
                            contentDescription = stringResource(R.string.ai_send),
                            tint = if (inputText.isNotBlank()) 
                                MaterialTheme.colorScheme.primary 
                            else 
                                MaterialTheme.colorScheme.outline
                        )
                    }
                }
            }
        }
    ) { paddingValues ->
        // 消息列表
        if (messages.isEmpty()) {
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
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.outline
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "开始对话吧",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.outline
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "在下方输入框输入消息",
                        style = MaterialTheme.typography.bodySmall,
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
                state = listState,
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(vertical = 8.dp)
            ) {
                items(messages) { message ->
                    MessageBubble(message = message)
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: MessageItem) {
    val isUser = message.role == "user"
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
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
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
        }
        
        Card(
            colors = CardDefaults.cardColors(
                containerColor = if (isUser) 
                    MaterialTheme.colorScheme.primaryContainer 
                else 
                    MaterialTheme.colorScheme.surfaceVariant
            ),
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomStart = if (isUser) 16.dp else 4.dp,
                bottomEnd = if (isUser) 4.dp else 16.dp
            ),
            modifier = Modifier.weight(1f, fill = false)
        ) {
            Text(
                text = message.content,
                modifier = Modifier.padding(12.dp),
                style = MaterialTheme.typography.bodyMedium
            )
        }
        
        if (isUser) {
            Spacer(modifier = Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.Person,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.onPrimary
                )
            }
        }
    }
}
