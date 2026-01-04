package com.mucheng.notes.presentation.screens.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.mucheng.notes.presentation.viewmodel.SettingsViewModel
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * AI 渠道类型
 */
enum class AIChannelType(val label: String) {
    OPENAI("OpenAI"),
    GEMINI("Google Gemini"),
    ANTHROPIC("Anthropic"),
    OPENAI_COMPATIBLE("OpenAI 兼容")
}

/**
 * AI 渠道数据
 */
@Serializable
data class AIChannel(
    val id: String,
    val name: String,
    val type: String, // 使用 String 以便序列化
    val apiUrl: String,
    val apiKey: String,
    val models: List<AIModel> = emptyList(),
    val enabled: Boolean = true
)

/**
 * AI 模型数据
 */
@Serializable
data class AIModel(
    val id: String,
    val name: String,
    val isCustom: Boolean = false
)

/**
 * 预设渠道模板
 */
val CHANNEL_TEMPLATES = listOf(
    AIChannel(
        id = "openai",
        name = "OpenAI",
        type = AIChannelType.OPENAI.name,
        apiUrl = "https://api.openai.com/v1/chat/completions",
        apiKey = "",
        models = listOf(
            AIModel("gpt-4o", "GPT-4o"),
            AIModel("gpt-4o-mini", "GPT-4o Mini"),
            AIModel("gpt-4-turbo", "GPT-4 Turbo"),
            AIModel("gpt-3.5-turbo", "GPT-3.5 Turbo"),
            AIModel("o1-preview", "O1 Preview"),
            AIModel("o1-mini", "O1 Mini")
        )
    ),
    AIChannel(
        id = "gemini",
        name = "Google Gemini",
        type = AIChannelType.GEMINI.name,
        apiUrl = "https://generativelanguage.googleapis.com/v1beta/models",
        apiKey = "",
        models = listOf(
            AIModel("gemini-1.5-pro", "Gemini 1.5 Pro"),
            AIModel("gemini-1.5-flash", "Gemini 1.5 Flash"),
            AIModel("gemini-1.0-pro", "Gemini 1.0 Pro")
        )
    ),
    AIChannel(
        id = "anthropic",
        name = "Anthropic",
        type = AIChannelType.ANTHROPIC.name,
        apiUrl = "https://api.anthropic.com/v1/messages",
        apiKey = "",
        models = listOf(
            AIModel("claude-3-5-sonnet-20241022", "Claude 3.5 Sonnet"),
            AIModel("claude-3-opus-20240229", "Claude 3 Opus"),
            AIModel("claude-3-haiku-20240307", "Claude 3 Haiku")
        )
    ),
    AIChannel(
        id = "deepseek",
        name = "DeepSeek",
        type = AIChannelType.OPENAI_COMPATIBLE.name,
        apiUrl = "https://api.deepseek.com/v1/chat/completions",
        apiKey = "",
        models = listOf(
            AIModel("deepseek-chat", "DeepSeek Chat"),
            AIModel("deepseek-coder", "DeepSeek Coder"),
            AIModel("deepseek-reasoner", "DeepSeek Reasoner")
        )
    ),
    AIChannel(
        id = "moonshot",
        name = "Moonshot (月之暗面)",
        type = AIChannelType.OPENAI_COMPATIBLE.name,
        apiUrl = "https://api.moonshot.cn/v1/chat/completions",
        apiKey = "",
        models = listOf(
            AIModel("moonshot-v1-8k", "Moonshot V1 8K"),
            AIModel("moonshot-v1-32k", "Moonshot V1 32K"),
            AIModel("moonshot-v1-128k", "Moonshot V1 128K")
        )
    ),
    AIChannel(
        id = "zhipu",
        name = "智谱 AI",
        type = AIChannelType.OPENAI_COMPATIBLE.name,
        apiUrl = "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        apiKey = "",
        models = listOf(
            AIModel("glm-4", "GLM-4"),
            AIModel("glm-4-flash", "GLM-4 Flash"),
            AIModel("glm-3-turbo", "GLM-3 Turbo")
        )
    ),
    AIChannel(
        id = "qwen",
        name = "通义千问",
        type = AIChannelType.OPENAI_COMPATIBLE.name,
        apiUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        apiKey = "",
        models = listOf(
            AIModel("qwen-turbo", "Qwen Turbo"),
            AIModel("qwen-plus", "Qwen Plus"),
            AIModel("qwen-max", "Qwen Max")
        )
    ),
    AIChannel(
        id = "custom",
        name = "自定义 OpenAI 兼容",
        type = AIChannelType.OPENAI_COMPATIBLE.name,
        apiUrl = "",
        apiKey = "",
        models = emptyList()
    )
)

private val json = Json { 
    ignoreUnknownKeys = true 
    encodeDefaults = true
}

/**
 * AI 设置页面
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AISettingsScreen(
    navController: NavController,
    viewModel: SettingsViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    
    // 从 ViewModel 加载渠道列表
    var channels by remember { mutableStateOf<List<AIChannel>>(emptyList()) }
    
    // 加载保存的渠道
    LaunchedEffect(uiState.aiChannelsJson) {
        if (uiState.aiChannelsJson.isNotBlank()) {
            try {
                channels = json.decodeFromString<List<AIChannel>>(uiState.aiChannelsJson)
            } catch (e: Exception) {
                // 解析失败，使用空列表
                channels = emptyList()
            }
        }
    }
    
    // 保存渠道到 ViewModel
    fun saveChannels(newChannels: List<AIChannel>) {
        channels = newChannels
        viewModel.setAiChannels(json.encodeToString(newChannels))
    }
    
    var showAddChannelDialog by remember { mutableStateOf(false) }
    var showEditChannelDialog by remember { mutableStateOf(false) }
    var editingChannel by remember { mutableStateOf<AIChannel?>(null) }
    var showAddModelDialog by remember { mutableStateOf(false) }
    var addModelChannelId by remember { mutableStateOf<String?>(null) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var deleteChannelId by remember { mutableStateOf<String?>(null) }
    var showTemplateDialog by remember { mutableStateOf(false) }
    
    // 表单状态
    var formName by remember { mutableStateOf("") }
    var formType by remember { mutableStateOf(AIChannelType.OPENAI) }
    var formApiUrl by remember { mutableStateOf("") }
    var formApiKey by remember { mutableStateOf("") }
    var showApiKey by remember { mutableStateOf(false) }
    var newModelId by remember { mutableStateOf("") }
    var newModelName by remember { mutableStateOf("") }
    var selectedTemplate by remember { mutableStateOf<AIChannel?>(null) }
    
    // 默认模型选择
    var showDefaultModelMenu by remember { mutableStateOf(false) }
    var selectedDefaultModel by remember { mutableStateOf(uiState.aiDefaultModel) }
    
    LaunchedEffect(uiState.message) {
        uiState.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearMessage()
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("AI 设置") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // 渠道管理标题
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "AI 渠道",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                Button(
                    onClick = { showTemplateDialog = true },
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                ) {
                    Icon(Icons.Default.Add, null, Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("添加渠道")
                }
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            
            // 渠道列表
            if (channels.isEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            Icons.Default.SmartToy,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.outline
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            "暂无 AI 渠道",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.outline
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "点击上方「添加渠道」选择渠道模板",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                }
            } else {
                channels.forEach { channel ->
                    ChannelCard(
                        channel = channel,
                        onToggleEnabled = { enabled ->
                            saveChannels(channels.map {
                                if (it.id == channel.id) it.copy(enabled = enabled) else it
                            })
                        },
                        onEdit = {
                            editingChannel = channel
                            formName = channel.name
                            formType = AIChannelType.entries.find { it.name == channel.type } ?: AIChannelType.OPENAI_COMPATIBLE
                            formApiUrl = channel.apiUrl
                            formApiKey = ""
                            showEditChannelDialog = true
                        },
                        onDelete = {
                            deleteChannelId = channel.id
                            showDeleteConfirm = true
                        },
                        onAddModel = {
                            addModelChannelId = channel.id
                            newModelId = ""
                            newModelName = ""
                            showAddModelDialog = true
                        },
                        onDeleteModel = { modelId ->
                            saveChannels(channels.map { ch ->
                                if (ch.id == channel.id) {
                                    ch.copy(models = ch.models.filter { it.id != modelId })
                                } else ch
                            })
                        }
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }
            }
            
            // 默认模型设置
            if (channels.isNotEmpty()) {
                HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
                
                Text(
                    "默认模型",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.height(8.dp))
                
                val allModels = channels.filter { it.enabled }.flatMap { ch ->
                    ch.models.map { model -> "${model.name} (${ch.name})" to model.id }
                }
                
                ExposedDropdownMenuBox(
                    expanded = showDefaultModelMenu,
                    onExpandedChange = { showDefaultModelMenu = it }
                ) {
                    OutlinedTextField(
                        value = allModels.find { it.second == selectedDefaultModel }?.first ?: "选择默认模型",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("默认模型") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = showDefaultModelMenu) },
                        modifier = Modifier.fillMaxWidth().menuAnchor()
                    )
                    ExposedDropdownMenu(
                        expanded = showDefaultModelMenu,
                        onDismissRequest = { showDefaultModelMenu = false }
                    ) {
                        allModels.forEach { (label, modelId) ->
                            DropdownMenuItem(
                                text = { Text(label) },
                                onClick = {
                                    selectedDefaultModel = modelId
                                    viewModel.setAiDefaultModel(modelId)
                                    showDefaultModelMenu = false
                                }
                            )
                        }
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // 说明
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "说明",
                        style = MaterialTheme.typography.titleSmall
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "• 选择渠道模板后填写 API Key 即可使用\n" +
                        "• 同一渠道可多次添加（如多个 OpenAI 账号）\n" +
                        "• 支持手动添加自定义模型 ID\n" +
                        "• 启用同步后，AI 配置会与桌面端同步",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }
        }
    }
    
    // 选择渠道模板对话框
    if (showTemplateDialog) {
        AlertDialog(
            onDismissRequest = { showTemplateDialog = false },
            title = { Text("选择渠道模板") },
            text = {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(CHANNEL_TEMPLATES) { template ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    selectedTemplate = template
                                    formName = template.name
                                    formType = AIChannelType.entries.find { it.name == template.type } ?: AIChannelType.OPENAI_COMPATIBLE
                                    formApiUrl = template.apiUrl
                                    formApiKey = ""
                                    showTemplateDialog = false
                                    showAddChannelDialog = true
                                },
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
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
                                    tint = MaterialTheme.colorScheme.primary
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        template.name,
                                        style = MaterialTheme.typography.titleSmall
                                    )
                                    Text(
                                        "${template.models.size} 个预设模型",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.outline
                                    )
                                }
                                Icon(
                                    Icons.Default.ChevronRight,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.outline
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showTemplateDialog = false }) {
                    Text("取消")
                }
            }
        )
    }
    
    // 添加渠道对话框
    if (showAddChannelDialog) {
        AddEditChannelDialog(
            title = "添加渠道: ${formName}",
            name = formName,
            onNameChange = { formName = it },
            type = formType,
            onTypeChange = { formType = it },
            apiUrl = formApiUrl,
            onApiUrlChange = { formApiUrl = it },
            apiKey = formApiKey,
            onApiKeyChange = { formApiKey = it },
            showApiKey = showApiKey,
            onToggleShowApiKey = { showApiKey = !showApiKey },
            onConfirm = {
                if (formApiKey.isNotBlank()) {
                    val newChannel = AIChannel(
                        id = java.util.UUID.randomUUID().toString(),
                        name = formName,
                        type = formType.name,
                        apiUrl = formApiUrl,
                        apiKey = formApiKey,
                        models = selectedTemplate?.models ?: emptyList(),
                        enabled = true
                    )
                    saveChannels(channels + newChannel)
                    showAddChannelDialog = false
                    selectedTemplate = null
                    viewModel.showMessage("渠道添加成功")
                }
            },
            onDismiss = { 
                showAddChannelDialog = false 
                selectedTemplate = null
            }
        )
    }
    
    // 编辑渠道对话框
    if (showEditChannelDialog && editingChannel != null) {
        AddEditChannelDialog(
            title = "编辑渠道: ${editingChannel!!.name}",
            name = formName,
            onNameChange = { formName = it },
            type = formType,
            onTypeChange = { formType = it },
            apiUrl = formApiUrl,
            onApiUrlChange = { formApiUrl = it },
            apiKey = formApiKey,
            onApiKeyChange = { formApiKey = it },
            showApiKey = showApiKey,
            onToggleShowApiKey = { showApiKey = !showApiKey },
            apiKeyPlaceholder = "留空则不修改",
            onConfirm = {
                if (formName.isNotBlank() && formApiUrl.isNotBlank()) {
                    saveChannels(channels.map { ch ->
                        if (ch.id == editingChannel!!.id) {
                            ch.copy(
                                name = formName,
                                type = formType.name,
                                apiUrl = formApiUrl,
                                apiKey = if (formApiKey.isNotBlank()) formApiKey else ch.apiKey
                            )
                        } else ch
                    })
                    showEditChannelDialog = false
                    editingChannel = null
                    viewModel.showMessage("渠道更新成功")
                }
            },
            onDismiss = {
                showEditChannelDialog = false
                editingChannel = null
            }
        )
    }
    
    // 添加模型对话框
    if (showAddModelDialog && addModelChannelId != null) {
        AlertDialog(
            onDismissRequest = { showAddModelDialog = false },
            title = { Text("添加自定义模型") },
            text = {
                Column {
                    OutlinedTextField(
                        value = newModelId,
                        onValueChange = { newModelId = it },
                        label = { Text("模型 ID") },
                        placeholder = { Text("如: gpt-4o") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = newModelName,
                        onValueChange = { newModelName = it },
                        label = { Text("显示名称") },
                        placeholder = { Text("如: GPT-4o") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (newModelId.isNotBlank()) {
                            saveChannels(channels.map { ch ->
                                if (ch.id == addModelChannelId) {
                                    ch.copy(models = ch.models + AIModel(
                                        id = newModelId,
                                        name = newModelName.ifBlank { newModelId },
                                        isCustom = true
                                    ))
                                } else ch
                            })
                            showAddModelDialog = false
                            addModelChannelId = null
                            viewModel.showMessage("模型添加成功")
                        }
                    },
                    enabled = newModelId.isNotBlank()
                ) {
                    Text("添加")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddModelDialog = false }) {
                    Text("取消")
                }
            }
        )
    }
    
    // 删除确认对话框
    if (showDeleteConfirm && deleteChannelId != null) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("删除渠道") },
            text = { Text("确定要删除此渠道吗？") },
            confirmButton = {
                TextButton(
                    onClick = {
                        saveChannels(channels.filter { it.id != deleteChannelId })
                        showDeleteConfirm = false
                        deleteChannelId = null
                        viewModel.showMessage("渠道已删除")
                    }
                ) {
                    Text("删除", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) {
                    Text("取消")
                }
            }
        )
    }
}


/**
 * 渠道卡片
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChannelCard(
    channel: AIChannel,
    onToggleEnabled: (Boolean) -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onAddModel: () -> Unit,
    onDeleteModel: (String) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (channel.enabled) 
                MaterialTheme.colorScheme.surface 
            else 
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // 标题行
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        channel.name,
                        style = MaterialTheme.typography.titleSmall
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    val typeLabel = AIChannelType.entries.find { it.name == channel.type }?.label ?: channel.type
                    AssistChip(
                        onClick = {},
                        label = { Text(typeLabel, style = MaterialTheme.typography.labelSmall) },
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = when (channel.type) {
                                AIChannelType.OPENAI.name -> MaterialTheme.colorScheme.primaryContainer
                                AIChannelType.GEMINI.name -> MaterialTheme.colorScheme.secondaryContainer
                                AIChannelType.ANTHROPIC.name -> MaterialTheme.colorScheme.tertiaryContainer
                                else -> MaterialTheme.colorScheme.surfaceVariant
                            }
                        )
                    )
                }
                Row {
                    Switch(
                        checked = channel.enabled,
                        onCheckedChange = onToggleEnabled,
                        modifier = Modifier.height(24.dp)
                    )
                    IconButton(onClick = onEdit, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Edit, null, Modifier.size(18.dp))
                    }
                    IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Delete, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error)
                    }
                }
            }
            
            // API URL
            Text(
                channel.apiUrl,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline
            )
            
            // API Key 状态
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = 4.dp)
            ) {
                Icon(
                    if (channel.apiKey.isNotBlank()) Icons.Default.Check else Icons.Default.Warning,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = if (channel.apiKey.isNotBlank()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    if (channel.apiKey.isNotBlank()) "API Key 已配置" else "未配置 API Key",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (channel.apiKey.isNotBlank()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                )
            }
            
            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
            
            // 模型列表
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "可用模型 (${channel.models.size})",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.outline
                )
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            // 模型标签
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                channel.models.forEach { model ->
                    InputChip(
                        selected = false,
                        onClick = { onDeleteModel(model.id) },
                        label = { Text(model.name, style = MaterialTheme.typography.labelSmall) },
                        trailingIcon = {
                            Icon(Icons.Default.Close, null, Modifier.size(14.dp))
                        }
                    )
                }
                // 添加模型按钮
                AssistChip(
                    onClick = onAddModel,
                    label = { Text("添加模型", style = MaterialTheme.typography.labelSmall) },
                    leadingIcon = { Icon(Icons.Default.Add, null, Modifier.size(14.dp)) }
                )
            }
        }
    }
}

/**
 * 添加/编辑渠道对话框
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddEditChannelDialog(
    title: String,
    name: String,
    onNameChange: (String) -> Unit,
    type: AIChannelType,
    onTypeChange: (AIChannelType) -> Unit,
    apiUrl: String,
    onApiUrlChange: (String) -> Unit,
    apiKey: String,
    onApiKeyChange: (String) -> Unit,
    showApiKey: Boolean,
    onToggleShowApiKey: () -> Unit,
    apiKeyPlaceholder: String = "API Key",
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    var showTypeMenu by remember { mutableStateOf(false) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = onNameChange,
                    label = { Text("渠道名称") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(12.dp))
                
                ExposedDropdownMenuBox(
                    expanded = showTypeMenu,
                    onExpandedChange = { showTypeMenu = it }
                ) {
                    OutlinedTextField(
                        value = type.label,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("渠道类型") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = showTypeMenu) },
                        modifier = Modifier.fillMaxWidth().menuAnchor()
                    )
                    ExposedDropdownMenu(
                        expanded = showTypeMenu,
                        onDismissRequest = { showTypeMenu = false }
                    ) {
                        AIChannelType.entries.forEach { channelType ->
                            DropdownMenuItem(
                                text = { Text(channelType.label) },
                                onClick = {
                                    onTypeChange(channelType)
                                    showTypeMenu = false
                                }
                            )
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = apiUrl,
                    onValueChange = onApiUrlChange,
                    label = { Text("API 地址") },
                    placeholder = { Text("https://api.example.com/v1/chat/completions") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = onApiKeyChange,
                    label = { Text(apiKeyPlaceholder) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = if (showApiKey) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = onToggleShowApiKey) {
                            Icon(
                                if (showApiKey) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = null
                            )
                        }
                    }
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                enabled = name.isNotBlank() && apiUrl.isNotBlank()
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
