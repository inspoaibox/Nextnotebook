package com.mucheng.notes.presentation.screens.notes

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Summarize
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.InputChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.foundation.Image
import androidx.hilt.navigation.compose.hiltViewModel
import com.mucheng.notes.R
import com.mucheng.notes.presentation.components.NoteToolbar
import com.mucheng.notes.presentation.viewmodel.NoteDetailViewModel
import com.mucheng.notes.security.AppLockExternalActivityGuard


/**
 * 笔记详情/编辑界面 - 增强版
 * 
 * 新增功能:
 * - 光标位置精准插入 Markdown
 * - 撤销/重做
 * - 标签编辑
 * - 图片插入
 * - AI 续写/润色/翻译
 * - 字数统计
 * - 深色模式适配
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun NoteDetailScreen(
    noteId: String?,
    defaultFolderId: String? = null,
    onNavigateBack: () -> Unit,
    viewModel: NoteDetailViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var showMenu by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showLockDialog by remember { mutableStateOf(false) }
    var showAIWriteDialog by remember { mutableStateOf(false) }
    var showAIMenuDialog by remember { mutableStateOf(false) }
    var showTagEditDialog by remember { mutableStateOf(false) }
    var showTranslateDialog by remember { mutableStateOf(false) }
    var showAIImageDialog by remember { mutableStateOf(false) }
    
    val isDarkTheme = isSystemInDarkTheme()
    
    // 图片选择器
    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let { viewModel.handleImageSelected(it) }
    }
    
    // 文件选择器（附件）
    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let { viewModel.handleAttachmentSelected(it) }
    }
    
    // AI 图片处理 - 图片选择器
    val aiImagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let { viewModel.setAiImage(it) }
    }
    
    // AI 图片处理 - 拍照
    var tempPhotoUri by remember { mutableStateOf<Uri?>(null) }
    val context = LocalContext.current
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success && tempPhotoUri != null) {
            viewModel.setAiImage(tempPhotoUri!!)
        }
    }

    
    LaunchedEffect(noteId, defaultFolderId) {
        if (noteId != null) {
            viewModel.loadNote(noteId)
        } else {
            viewModel.setDefaultFolderId(defaultFolderId)
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (uiState.isEditing) {
                        BasicTextField(
                            value = uiState.title,
                            onValueChange = { viewModel.updateTitle(it) },
                            textStyle = TextStyle(
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurface
                            ),
                            singleLine = true,
                            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                            modifier = Modifier.fillMaxWidth(),
                            decorationBox = { innerTextField ->
                                Box {
                                    if (uiState.title.isEmpty()) {
                                        Text(
                                            text = stringResource(R.string.note_title_hint),
                                            style = TextStyle(
                                                fontSize = 20.sp,
                                                fontWeight = FontWeight.Medium,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                                            )
                                        )
                                    }
                                    innerTextField()
                                }
                            }
                        )
                    } else {
                        Text(
                            text = uiState.title.ifEmpty { stringResource(R.string.untitled_note) },
                            maxLines = 1,
                            style = MaterialTheme.typography.titleLarge
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = {
                        if (uiState.isEditing && uiState.hasChanges) {
                            viewModel.saveNote()
                        }
                        onNavigateBack()
                    }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.back)
                        )
                    }
                },
                actions = {
                    // AI 功能菜单按钮（编辑模式）
                    if (uiState.isEditing) {
                        IconButton(
                            onClick = { showAIMenuDialog = true },
                            enabled = !uiState.aiWriteLoading && !uiState.aiContinueLoading && 
                                     !uiState.aiPolishLoading && !uiState.aiTranslateLoading
                        ) {
                            if (uiState.aiWriteLoading || uiState.aiContinueLoading || 
                                uiState.aiPolishLoading || uiState.aiTranslateLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.Default.AutoAwesome,
                                    contentDescription = "AI 功能",
                                    tint = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                        
                        // 标签编辑按钮
                        IconButton(onClick = { showTagEditDialog = true }) {
                            Icon(
                                imageVector = Icons.Default.Tag,
                                contentDescription = "编辑标签"
                            )
                        }
                        
                        // 保存按钮
                        IconButton(onClick = { viewModel.saveNote() }) {
                            Icon(
                                imageVector = Icons.Default.Save,
                                contentDescription = stringResource(R.string.save)
                            )
                        }
                    } else {
                        IconButton(onClick = { viewModel.toggleEditing() }) {
                            Icon(
                                imageVector = Icons.Default.Edit,
                                contentDescription = stringResource(R.string.edit)
                            )
                        }
                    }
                    
                    IconButton(onClick = { showMenu = true }) {
                        Icon(
                            imageVector = Icons.Default.MoreVert,
                            contentDescription = stringResource(R.string.more_options)
                        )
                    }
                    
                    DropdownMenu(
                        expanded = showMenu,
                        onDismissRequest = { showMenu = false }
                    ) {
                        DropdownMenuItem(
                            text = {
                                Text(
                                    if (uiState.isPinned) stringResource(R.string.unpin)
                                    else stringResource(R.string.pin)
                                )
                            },
                            onClick = {
                                viewModel.togglePin()
                                showMenu = false
                            },
                            leadingIcon = {
                                Icon(Icons.Default.PushPin, contentDescription = null)
                            }
                        )
                        
                        DropdownMenuItem(
                            text = {
                                Text(
                                    if (uiState.isLocked) stringResource(R.string.unlock_note)
                                    else stringResource(R.string.lock_note)
                                )
                            },
                            onClick = {
                                if (uiState.isLocked) {
                                    viewModel.unlockNote()
                                } else {
                                    showLockDialog = true
                                }
                                showMenu = false
                            },
                            leadingIcon = {
                                Icon(
                                    if (uiState.isLocked) Icons.Default.LockOpen
                                    else Icons.Default.Lock,
                                    contentDescription = null
                                )
                            }
                        )
                        
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.delete)) },
                            onClick = {
                                showDeleteDialog = true
                                showMenu = false
                            },
                            leadingIcon = {
                                Icon(Icons.Default.Delete, contentDescription = null)
                            }
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .imePadding()
        ) {
            // 标签显示区域
            if (uiState.tags.isNotEmpty() || uiState.isEditing) {
                LazyRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(uiState.tags) { tag ->
                        AssistChip(
                            onClick = { 
                                if (uiState.isEditing) {
                                    showTagEditDialog = true
                                }
                            },
                            label = { Text(tag) },
                            colors = AssistChipDefaults.assistChipColors(
                                containerColor = MaterialTheme.colorScheme.secondaryContainer
                            )
                        )
                    }
                    
                    // 编辑模式下显示添加标签按钮
                    if (uiState.isEditing) {
                        item {
                            AssistChip(
                                onClick = { showTagEditDialog = true },
                                label = { Text("添加标签") },
                                leadingIcon = {
                                    Icon(
                                        Icons.Default.Add,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            )
                        }
                    }
                }
            }
            
            // 内容区域
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f)
            ) {
                if (uiState.isEditing) {
                    // 编辑模式
                    Column(modifier = Modifier.fillMaxSize()) {
                        // 工具栏
                        NoteToolbar(
                            onBoldClick = { viewModel.insertMarkdown("**", "**") },
                            onItalicClick = { viewModel.insertMarkdown("*", "*") },
                            onUnderlineClick = { viewModel.insertMarkdown("<u>", "</u>") },
                            onStrikethroughClick = { viewModel.insertMarkdown("~~", "~~") },
                            onH1Click = { viewModel.insertPrefix("# ") },
                            onH2Click = { viewModel.insertPrefix("## ") },
                            onH3Click = { viewModel.insertPrefix("### ") },
                            onBulletListClick = { viewModel.insertPrefix("- ") },
                            onNumberListClick = { viewModel.insertPrefix("1. ") },
                            onCheckboxClick = { viewModel.insertPrefix("- [ ] ") },
                            onQuoteClick = { viewModel.insertPrefix("> ") },
                            onCodeClick = { viewModel.insertMarkdown("`", "`") },
                            onLinkClick = { viewModel.insertMarkdown("[", "](url)") },
                            onImageClick = {
                                AppLockExternalActivityGuard.launchFromUnlockedApp {
                                    imagePickerLauncher.launch("image/*")
                                }
                            },
                            onAttachmentClick = {
                                AppLockExternalActivityGuard.launchFromUnlockedApp {
                                    filePickerLauncher.launch("*/*")
                                }
                            },
                            onUndoClick = { viewModel.undo() },
                            onRedoClick = { viewModel.redo() },
                            onTableClick = { viewModel.insertTable() },
                            onHorizontalRuleClick = { viewModel.insertHorizontalRule() },
                            onCodeBlockClick = { viewModel.insertCodeBlock() },
                            canUndo = uiState.canUndo,
                            canRedo = uiState.canRedo
                        )
                        
                        // 编辑器
                        OutlinedTextField(
                            value = uiState.contentFieldValue,
                            onValueChange = { viewModel.updateContentFieldValue(it) },
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                            placeholder = { 
                                Text(
                                    text = stringResource(R.string.note_content_hint),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                                ) 
                            },
                            textStyle = TextStyle(
                                fontSize = 16.sp,
                                lineHeight = 24.sp,
                                color = MaterialTheme.colorScheme.onSurface
                            ),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color.Transparent,
                                unfocusedBorderColor = Color.Transparent,
                                focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                            ),
                            shape = RoundedCornerShape(12.dp)
                        )
                    }
                } else {
                    // 查看模式
                    NoteContentWebView(
                        content = viewModel.getProcessedContent(),
                        isDarkTheme = isDarkTheme,
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }
            
            // 底部信息栏
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // 字数统计
                if (uiState.isEditing) {
                    Text(
                        text = "字数: ${uiState.wordCount} | 字符: ${uiState.charCount}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    
                    // 自动保存状态
                    if (uiState.isAutoSaving) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(12.dp),
                                strokeWidth = 1.dp
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "保存中...",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else if (uiState.lastAutoSaveTime > 0) {
                        Text(
                            text = "已自动保存",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                } else if (uiState.updatedTime > 0) {
                    Text(
                        text = stringResource(
                            R.string.last_updated,
                            formatTime(uiState.updatedTime)
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    
                    // 字数统计（查看模式）
                    Text(
                        text = "字数: ${uiState.wordCount}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
    
    // ==================== 对话框 ====================
    
    // 删除确认对话框
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.delete_note)) },
            text = { Text(stringResource(R.string.delete_note_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteNote()
                        showDeleteDialog = false
                        onNavigateBack()
                    }
                ) {
                    Text(stringResource(R.string.delete))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text(stringResource(R.string.cancel))
                }
            }
        )
    }
    
    // 锁定笔记对话框
    if (showLockDialog) {
        var password by remember { mutableStateOf("") }
        var confirmPassword by remember { mutableStateOf("") }
        var error by remember { mutableStateOf<String?>(null) }
        
        AlertDialog(
            onDismissRequest = { showLockDialog = false },
            title = { Text(stringResource(R.string.lock_note)) },
            text = {
                Column {
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it; error = null },
                        label = { Text(stringResource(R.string.password)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    OutlinedTextField(
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it; error = null },
                        label = { Text(stringResource(R.string.confirm_password)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    if (error != null) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = error!!,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        when {
                            password.length < 4 -> {
                                error = "密码至少 4 位"
                            }
                            password != confirmPassword -> {
                                error = "两次密码不一致"
                            }
                            else -> {
                                viewModel.lockNote(password)
                                showLockDialog = false
                            }
                        }
                    }
                ) {
                    Text(stringResource(R.string.confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showLockDialog = false }) {
                    Text(stringResource(R.string.cancel))
                }
            }
        )
    }
    
    // AI 功能菜单对话框
    if (showAIMenuDialog) {
        AlertDialog(
            onDismissRequest = { showAIMenuDialog = false },
            title = { 
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.AutoAwesome,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text("AI 智能助手")
                }
            },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // AI 撰写
                    AiMenuButton(
                        icon = Icons.Default.EditNote,
                        text = "AI 撰写",
                        description = "根据描述生成内容",
                        onClick = {
                            showAIMenuDialog = false
                            showAIWriteDialog = true
                        }
                    )
                    
                    // AI 续写
                    AiMenuButton(
                        icon = Icons.Default.AutoAwesome,
                        text = "AI 续写",
                        description = "基于当前内容续写",
                        onClick = {
                            showAIMenuDialog = false
                            viewModel.aiContinue()
                        },
                        enabled = uiState.content.isNotBlank()
                    )
                    
                    // AI 润色
                    AiMenuButton(
                        icon = Icons.Default.AutoAwesome,
                        text = "AI 润色",
                        description = "改进表达和语法",
                        onClick = {
                            showAIMenuDialog = false
                            viewModel.aiPolish()
                        },
                        enabled = uiState.content.isNotBlank()
                    )
                    
                    // AI 翻译
                    AiMenuButton(
                        icon = Icons.Default.Translate,
                        text = "AI 翻译",
                        description = "翻译为其他语言",
                        onClick = {
                            showAIMenuDialog = false
                            showTranslateDialog = true
                        },
                        enabled = uiState.content.isNotBlank()
                    )
                    
                    // AI 图片处理
                    AiMenuButton(
                        icon = Icons.Default.Image,
                        text = "AI 图片处理",
                        description = "识别、整理、描述图片内容",
                        onClick = {
                            showAIMenuDialog = false
                            showAIImageDialog = true
                        }
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { showAIMenuDialog = false }) {
                    Text("关闭")
                }
            }
        )
    }
    
    // AI 撰写对话框
    if (showAIWriteDialog) {
        var aiPrompt by remember { mutableStateOf("") }
        // 跟踪是否曾经开始加载（用于检测撰写完成）
        var wasLoading by remember { mutableStateOf(false) }
        
        // 当开始加载时，记录状态
        LaunchedEffect(uiState.aiWriteLoading) {
            if (uiState.aiWriteLoading) {
                wasLoading = true
            }
        }
        
        // AI 撰写成功后关闭对话框（只有曾经加载过才触发）
        LaunchedEffect(uiState.aiWriteLoading, uiState.aiWriteError, wasLoading) {
            if (wasLoading && !uiState.aiWriteLoading && uiState.aiWriteError == null) {
                showAIWriteDialog = false
                viewModel.clearAiWriteError()
            }
        }
        
        AlertDialog(
            onDismissRequest = { 
                if (!uiState.aiWriteLoading) {
                    showAIWriteDialog = false
                    viewModel.clearAiWriteError()
                }
            },
            title = { 
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.AutoAwesome,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text("AI 撰写")
                }
            },
            text = {
                Column {
                    Text(
                        text = "描述你想要撰写的内容，AI 将为你生成 Markdown 格式的文本",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 12.dp)
                    )
                    
                    OutlinedTextField(
                        value = aiPrompt,
                        onValueChange = { aiPrompt = it },
                        label = { Text("撰写需求") },
                        placeholder = { Text("例如：写一篇关于时间管理的文章") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(120.dp),
                        enabled = !uiState.aiWriteLoading,
                        maxLines = 5
                    )
                    
                    if (uiState.aiWriteError != null) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = uiState.aiWriteError!!,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    
                    if (uiState.aiWriteLoading) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "AI 正在撰写...",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.aiWrite(aiPrompt)
                    },
                    enabled = !uiState.aiWriteLoading && aiPrompt.isNotBlank()
                ) {
                    Text("生成")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { 
                        showAIWriteDialog = false
                        viewModel.clearAiWriteError()
                    },
                    enabled = !uiState.aiWriteLoading
                ) {
                    Text(stringResource(R.string.cancel))
                }
            }
        )
    }
    
    // 翻译语言选择对话框
    if (showTranslateDialog) {
        val languages = listOf("英语", "日语", "韩语", "法语", "德语", "西班牙语", "俄语")
        var selectedLanguage by remember { mutableStateOf("英语") }
        
        AlertDialog(
            onDismissRequest = { showTranslateDialog = false },
            title = { 
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Translate,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text("选择目标语言")
                }
            },
            text = {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    languages.forEach { language ->
                        FilterChip(
                            selected = selectedLanguage == language,
                            onClick = { selectedLanguage = language },
                            label = { Text(language) }
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showTranslateDialog = false
                        viewModel.aiTranslate(selectedLanguage)
                    }
                ) {
                    Text("翻译")
                }
            },
            dismissButton = {
                TextButton(onClick = { showTranslateDialog = false }) {
                    Text(stringResource(R.string.cancel))
                }
            }
        )
    }
    
    // AI 图片处理对话框
    if (showAIImageDialog) {
        var imagePrompt by remember { mutableStateOf("") }
        var wasProcessing by remember { mutableStateOf(false) }
        
        // 跟踪处理状态
        LaunchedEffect(uiState.aiImageProcessingLoading) {
            if (uiState.aiImageProcessingLoading) {
                wasProcessing = true
            }
        }
        
        // 处理成功后关闭对话框
        LaunchedEffect(uiState.aiImageProcessingLoading, wasProcessing) {
            if (wasProcessing && !uiState.aiImageProcessingLoading && uiState.aiImageUri == null) {
                showAIImageDialog = false
            }
        }
        
        AlertDialog(
            onDismissRequest = { 
                if (!uiState.aiImageProcessingLoading) {
                    showAIImageDialog = false
                    viewModel.clearAiImage()
                }
            },
            title = { 
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Image,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text("AI 图片处理")
                }
            },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState())
                ) {
                    Text(
                        text = "选择图片后，AI 将根据您的要求处理图片内容（如 OCR 识别、内容整理、图片描述等）",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                    
                    // 图片选择按钮
                    if (uiState.aiImageUri == null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            // 拍照按钮
                            OutlinedButton(
                                onClick = {
                                    // 创建临时文件用于保存拍照结果
                                    val photoFile = java.io.File(
                                        context.cacheDir,
                                        "ai_photo_${System.currentTimeMillis()}.jpg"
                                    )
                                    tempPhotoUri = androidx.core.content.FileProvider.getUriForFile(
                                        context,
                                        "${context.packageName}.fileprovider",
                                        photoFile
                                    )
                                    AppLockExternalActivityGuard.launchFromUnlockedApp {
                                        cameraLauncher.launch(tempPhotoUri!!)
                                    }
                                },
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.CameraAlt,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("拍照")
                            }
                            
                            // 选择图片按钮
                            OutlinedButton(
                                onClick = {
                                    AppLockExternalActivityGuard.launchFromUnlockedApp {
                                        aiImagePickerLauncher.launch("image/*")
                                    }
                                },
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Image,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("选择图片")
                            }
                        }
                    } else {
                        // 显示已选择的图片预览
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(150.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                        ) {
                            // 图片预览 - 使用原生方式加载
                            val localContext = LocalContext.current
                            val imageBitmap = remember(uiState.aiImageUri) {
                                uiState.aiImageUri?.let { uri ->
                                    try {
                                        val inputStream = localContext.contentResolver.openInputStream(uri)
                                        val bitmap = android.graphics.BitmapFactory.decodeStream(inputStream)
                                        inputStream?.close()
                                        bitmap?.asImageBitmap()
                                    } catch (e: Exception) {
                                        null
                                    }
                                }
                            }
                            
                            if (imageBitmap != null) {
                                Image(
                                    bitmap = imageBitmap,
                                    contentDescription = "选择的图片",
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = ContentScale.Fit
                                )
                            } else {
                                // 加载失败时显示占位
                                Box(
                                    modifier = Modifier.fillMaxSize(),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Image,
                                        contentDescription = null,
                                        modifier = Modifier.size(48.dp),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                            
                            // 删除按钮
                            IconButton(
                                onClick = { viewModel.clearAiImage() },
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(4.dp)
                                    .size(32.dp)
                                    .background(
                                        MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                                        CircleShape
                                    )
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "移除图片",
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        // 处理要求输入
                        OutlinedTextField(
                            value = imagePrompt,
                            onValueChange = { imagePrompt = it },
                            label = { Text("处理要求") },
                            placeholder = { Text("例如：识别图片中的文字并整理成表格") },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !uiState.aiImageProcessingLoading,
                            maxLines = 3,
                            singleLine = false
                        )
                        
                        // 快捷操作建议
                        Spacer(modifier = Modifier.height(8.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            listOf(
                                "识别文字 (OCR)",
                                "描述图片内容",
                                "整理成表格",
                                "提取关键信息"
                            ).forEach { suggestion ->
                                AssistChip(
                                    onClick = { imagePrompt = suggestion },
                                    label = { Text(suggestion, fontSize = 12.sp) },
                                    enabled = !uiState.aiImageProcessingLoading
                                )
                            }
                        }
                    }
                    
                    // 加载状态
                    if (uiState.aiImageProcessingLoading) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "AI 正在处理图片...",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.aiProcessImage(imagePrompt)
                    },
                    enabled = !uiState.aiImageProcessingLoading && 
                              uiState.aiImageUri != null && 
                              imagePrompt.isNotBlank()
                ) {
                    Text("处理")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { 
                        showAIImageDialog = false
                        viewModel.clearAiImage()
                    },
                    enabled = !uiState.aiImageProcessingLoading
                ) {
                    Text(stringResource(R.string.cancel))
                }
            }
        )
    }

    if (showTagEditDialog) {
        var newTag by remember { mutableStateOf("") }
        
        AlertDialog(
            onDismissRequest = { showTagEditDialog = false },
            title = { 
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Tag,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text("编辑标签")
                }
            },
            text = {
                Column {
                    // 当前标签
                    if (uiState.tags.isNotEmpty()) {
                        Text(
                            text = "当前标签",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )
                        
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.padding(bottom = 16.dp)
                        ) {
                            uiState.tags.forEach { tag ->
                                InputChip(
                                    selected = false,
                                    onClick = { },
                                    label = { Text(tag) },
                                    trailingIcon = {
                                        Icon(
                                            Icons.Default.Close,
                                            contentDescription = "删除",
                                            modifier = Modifier
                                                .size(16.dp)
                                                .clickable { viewModel.removeTag(tag) }
                                        )
                                    },
                                    colors = InputChipDefaults.inputChipColors(
                                        containerColor = MaterialTheme.colorScheme.secondaryContainer
                                    )
                                )
                            }
                        }
                    }
                    
                    // 添加新标签
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        OutlinedTextField(
                            value = newTag,
                            onValueChange = { newTag = it },
                            label = { Text("新标签") },
                            placeholder = { Text("输入标签名称") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        
                        Spacer(modifier = Modifier.width(8.dp))
                        
                        IconButton(
                            onClick = {
                                if (newTag.isNotBlank()) {
                                    viewModel.addTag(newTag)
                                    newTag = ""
                                }
                            },
                            enabled = newTag.isNotBlank()
                        ) {
                            Icon(
                                Icons.Default.Add,
                                contentDescription = "添加",
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                    
                    // 可选标签建议
                    if (uiState.availableTags.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "已有标签",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )
                        
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            uiState.availableTags
                                .filter { it !in uiState.tags }
                                .take(10)
                                .forEach { tag ->
                                    AssistChip(
                                        onClick = { viewModel.addTag(tag) },
                                        label = { Text(tag) }
                                    )
                                }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showTagEditDialog = false }) {
                    Text("完成")
                }
            }
        )
    }
    
    // 图片处理进度指示器
    if (uiState.isProcessingImage) {
        AlertDialog(
            onDismissRequest = { },
            title = { Text("处理图片") },
            text = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                    Spacer(modifier = Modifier.width(16.dp))
                    Text("正在处理图片...")
                }
            },
            confirmButton = { }
        )
    }
}

/**
 * AI 菜单按钮
 */
@Composable
private fun AiMenuButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String,
    description: String,
    onClick: () -> Unit,
    enabled: Boolean = true
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled) { onClick() }
            .background(
                if (enabled) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f),
                RoundedCornerShape(12.dp)
            )
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = if (enabled) MaterialTheme.colorScheme.primary 
                   else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
            modifier = Modifier.size(24.dp)
        )
        
        Spacer(modifier = Modifier.width(16.dp))
        
        Column {
            Text(
                text = text,
                style = MaterialTheme.typography.bodyLarge,
                color = if (enabled) MaterialTheme.colorScheme.onSurface
                        else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = if (enabled) MaterialTheme.colorScheme.onSurfaceVariant
                        else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f)
            )
        }
    }
}

/**
 * WebView 显示笔记内容 - 支持深色模式
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun NoteContentWebView(
    content: String,
    isDarkTheme: Boolean,
    modifier: Modifier = Modifier
) {
    val htmlContent = remember(content, isDarkTheme) {
        wrapContentInHtml(content, isDarkTheme)
    }
    
    AndroidView(
        factory = { context ->
            WebView(context).apply {
                webViewClient = WebViewClient()
                settings.javaScriptEnabled = false
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = true
            }
        },
        update = { webView ->
            webView.loadDataWithBaseURL(
                null,
                htmlContent,
                "text/html",
                "UTF-8",
                null
            )
        },
        modifier = modifier
    )
}

/**
 * 将内容包装为 HTML - 支持深色模式
 */
private fun wrapContentInHtml(content: String, isDarkTheme: Boolean): String {
    val textColor = if (isDarkTheme) "#E0E0E0" else "#333333"
    val backgroundColor = if (isDarkTheme) "#121212" else "#FFFFFF"
    val codeBackground = if (isDarkTheme) "#2D2D2D" else "#F5F5F5"
    val borderColor = if (isDarkTheme) "#424242" else "#DDDDDD"
    val linkColor = if (isDarkTheme) "#90CAF9" else "#1976D2"
    val quoteColor = if (isDarkTheme) "#B0B0B0" else "#666666"
    
    // 如果内容已经是 HTML，直接使用
    if (content.trimStart().startsWith("<")) {
        return """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        font-size: 16px;
                        line-height: 1.6;
                        padding: 16px;
                        color: $textColor;
                        background-color: $backgroundColor;
                    }
                    img { max-width: 100%; height: auto; border-radius: 8px; }
                    pre { background: $codeBackground; padding: 12px; overflow-x: auto; border-radius: 8px; }
                    code { background: $codeBackground; padding: 2px 6px; border-radius: 4px; font-family: 'SF Mono', Menlo, monospace; }
                    blockquote { border-left: 4px solid $borderColor; margin: 0; padding-left: 16px; color: $quoteColor; }
                    a { color: $linkColor; }
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid $borderColor; padding: 8px; text-align: left; }
                    th { background: $codeBackground; }
                </style>
            </head>
            <body>
                $content
            </body>
            </html>
        """.trimIndent()
    }
    
    // Markdown 内容，转换为 HTML
    val htmlContent = markdownToHtml(content)
    
    return """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 16px;
                    line-height: 1.6;
                    padding: 16px;
                    color: $textColor;
                    background-color: $backgroundColor;
                }
                img { max-width: 100%; height: auto; border-radius: 8px; }
                pre { background: $codeBackground; padding: 12px; overflow-x: auto; border-radius: 8px; }
                code { background: $codeBackground; padding: 2px 6px; border-radius: 4px; font-family: 'SF Mono', Menlo, monospace; font-size: 14px; }
                blockquote { border-left: 4px solid $borderColor; margin: 16px 0; padding-left: 16px; color: $quoteColor; }
                a { color: $linkColor; text-decoration: none; }
                table { border-collapse: collapse; width: 100%; margin: 16px 0; }
                th, td { border: 1px solid $borderColor; padding: 10px; text-align: left; }
                th { background: $codeBackground; font-weight: 600; }
                h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; }
                h1 { font-size: 28px; border-bottom: 1px solid $borderColor; padding-bottom: 8px; }
                h2 { font-size: 24px; border-bottom: 1px solid $borderColor; padding-bottom: 6px; }
                h3 { font-size: 20px; }
                ul, ol { padding-left: 24px; }
                li { margin: 6px 0; }
                hr { border: none; border-top: 1px solid $borderColor; margin: 24px 0; }
                .task-list-item { list-style: none; margin-left: -24px; }
                .task-list-item input { margin-right: 8px; }
                .image-error { 
                    display: inline-block; 
                    padding: 8px 12px; 
                    background: ${if (isDarkTheme) "#3D2020" else "#FFF2F0"}; 
                    border: 1px solid ${if (isDarkTheme) "#5C3030" else "#FFCCC7"};
                    border-radius: 4px;
                    color: ${if (isDarkTheme) "#FF6B6B" else "#FF4D4F"};
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            $htmlContent
        </body>
        </html>
    """.trimIndent()
}

/**
 * 简单的 Markdown 到 HTML 转换
 * 支持基本的 Markdown 语法
 */
private fun markdownToHtml(markdown: String): String {
    var html = markdown

    // 1. 代码块（最先处理，避免内部内容被其他规则影响）
    val codeBlockRegex = Regex("```(\\w*)\\n([\\s\\S]*?)```")
    html = codeBlockRegex.replace(html) { match ->
        val language = match.groupValues[1]
        val code = match.groupValues[2]
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        "<pre><code class=\"language-$language\">$code</code></pre>"
    }

    // 2. Markdown 表格（在其他行级规则之前处理，防止 --- 被水平线规则替换）
    // 标准格式：表头行 + 分隔行（| --- |）+ 数据行
    val tableRegex = Regex("""(?m)(^\|.+\|[ \t]*\n)(^\|[ \t]*[-:]+[-| :\t]*\|[ \t]*\n)((?:^\|.+\|[ \t]*\n?)*)""")
    html = tableRegex.replace(html) { m ->
        val headerLine = m.groupValues[1].trim()
        val bodyLines = m.groupValues[3].trim().lines().filter { it.trim().startsWith("|") }

        fun parseCells(line: String) = line.trim()
            .removePrefix("|").removeSuffix("|")
            .split("|").map { it.trim() }

        val sb = StringBuilder("<table><thead><tr>")
        parseCells(headerLine).forEach { sb.append("<th>$it</th>") }
        sb.append("</tr></thead><tbody>")
        bodyLines.forEach { line ->
            sb.append("<tr>")
            parseCells(line).forEach { sb.append("<td>$it</td>") }
            sb.append("</tr>")
        }
        sb.append("</tbody></table>")
        sb.toString()
    }
    
    // 行内代码
    val inlineCodeRegex = Regex("`([^`]+)`")
    html = inlineCodeRegex.replace(html) { match ->
        val code = match.groupValues[1]
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        "<code>$code</code>"
    }
    
    // 图片 - 支持 resource:// 协议和普通 URL
    val imageRegex = Regex("!\\[([^\\]]*)\\]\\(([^)]+)\\)")
    html = imageRegex.replace(html) { match ->
        val alt = match.groupValues[1]
        val src = match.groupValues[2]
        
        if (src.startsWith("resource://")) {
            "<span class=\"image-error\">📷 图片: $alt (资源未同步)</span>"
        } else {
            "<img src=\"$src\" alt=\"$alt\" />"
        }
    }
    
    // 链接
    val linkRegex = Regex("\\[([^\\]]+)\\]\\(([^)]+)\\)")
    html = linkRegex.replace(html) { match ->
        val text = match.groupValues[1]
        val href = match.groupValues[2]
        "<a href=\"$href\">$text</a>"
    }
    
    // 标题
    html = Regex("^###### (.+)$", RegexOption.MULTILINE).replace(html) { "<h6>${it.groupValues[1]}</h6>" }
    html = Regex("^##### (.+)$", RegexOption.MULTILINE).replace(html) { "<h5>${it.groupValues[1]}</h5>" }
    html = Regex("^#### (.+)$", RegexOption.MULTILINE).replace(html) { "<h4>${it.groupValues[1]}</h4>" }
    html = Regex("^### (.+)$", RegexOption.MULTILINE).replace(html) { "<h3>${it.groupValues[1]}</h3>" }
    html = Regex("^## (.+)$", RegexOption.MULTILINE).replace(html) { "<h2>${it.groupValues[1]}</h2>" }
    html = Regex("^# (.+)$", RegexOption.MULTILINE).replace(html) { "<h1>${it.groupValues[1]}</h1>" }
    
    // 粗体和斜体
    html = Regex("\\*\\*\\*(.+?)\\*\\*\\*").replace(html) { "<strong><em>${it.groupValues[1]}</em></strong>" }
    html = Regex("\\*\\*(.+?)\\*\\*").replace(html) { "<strong>${it.groupValues[1]}</strong>" }
    html = Regex("\\*(.+?)\\*").replace(html) { "<em>${it.groupValues[1]}</em>" }
    
    // 删除线
    html = Regex("~~(.+?)~~").replace(html) { "<del>${it.groupValues[1]}</del>" }
    
    // 下划线
    html = Regex("<u>(.+?)</u>").replace(html) { "<u>${it.groupValues[1]}</u>" }
    
    // 引用块
    html = Regex("^> (.+)$", RegexOption.MULTILINE).replace(html) { "<blockquote>${it.groupValues[1]}</blockquote>" }
    
    // 水平线
    html = Regex("^---$", RegexOption.MULTILINE).replace(html) { "<hr />" }
    html = Regex("^\\*\\*\\*$", RegexOption.MULTILINE).replace(html) { "<hr />" }
    
    // 任务列表
    html = Regex("^- \\[x\\] (.+)$", RegexOption.MULTILINE).replace(html) { 
        "<li class=\"task-list-item\"><input type=\"checkbox\" checked disabled />${it.groupValues[1]}</li>" 
    }
    html = Regex("^- \\[ \\] (.+)$", RegexOption.MULTILINE).replace(html) { 
        "<li class=\"task-list-item\"><input type=\"checkbox\" disabled />${it.groupValues[1]}</li>" 
    }
    
    // 无序列表
    html = Regex("^- (.+)$", RegexOption.MULTILINE).replace(html) { "<li>${it.groupValues[1]}</li>" }
    html = Regex("^\\* (.+)$", RegexOption.MULTILINE).replace(html) { "<li>${it.groupValues[1]}</li>" }
    
    // 有序列表
    html = Regex("^\\d+\\. (.+)$", RegexOption.MULTILINE).replace(html) { "<li>${it.groupValues[1]}</li>" }
    
    // 包装连续的 li 标签
    html = Regex("(<li[^>]*>.*?</li>\\n?)+").replace(html) { "<ul>${it.value}</ul>" }
    
    // 段落
    val lines = html.split("\n")
    val result = StringBuilder()
    var inParagraph = false
    
    for (line in lines) {
        val trimmedLine = line.trim()
        
        if (trimmedLine.startsWith("<h") || 
            trimmedLine.startsWith("<ul") || 
            trimmedLine.startsWith("<ol") ||
            trimmedLine.startsWith("<li") ||
            trimmedLine.startsWith("<pre") ||
            trimmedLine.startsWith("<blockquote") ||
            trimmedLine.startsWith("<table") ||
            trimmedLine.startsWith("<thead") ||
            trimmedLine.startsWith("<tbody") ||
            trimmedLine.startsWith("<tr") ||
            trimmedLine.startsWith("<th") ||
            trimmedLine.startsWith("<td") ||
            trimmedLine.startsWith("<hr") ||
            trimmedLine.startsWith("</")) {
            if (inParagraph) {
                result.append("</p>\n")
                inParagraph = false
            }
            result.append(line).append("\n")
        } else if (trimmedLine.isEmpty()) {
            if (inParagraph) {
                result.append("</p>\n")
                inParagraph = false
            }
            result.append("\n")
        } else {
            if (!inParagraph) {
                result.append("<p>")
                inParagraph = true
            } else {
                result.append("<br />")
            }
            result.append(trimmedLine)
        }
    }
    
    if (inParagraph) {
        result.append("</p>")
    }
    
    return result.toString()
}

/**
 * 格式化时间
 */
private fun formatTime(timestamp: Long): String {
    val sdf = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.getDefault())
    return sdf.format(java.util.Date(timestamp))
}
