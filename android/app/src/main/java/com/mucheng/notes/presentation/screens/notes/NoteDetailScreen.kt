package com.mucheng.notes.presentation.screens.notes

import android.annotation.SuppressLint
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import com.mucheng.notes.R
import com.mucheng.notes.presentation.components.NoteToolbar
import com.mucheng.notes.presentation.viewmodel.NoteDetailViewModel

/**
 * 笔记详情/编辑界面
 * 
 * 使用 WebView 显示富文本内容（HTML）
 */
@OptIn(ExperimentalMaterial3Api::class)
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
    
    LaunchedEffect(noteId, defaultFolderId) {
        if (noteId != null) {
            viewModel.loadNote(noteId)
        } else {
            // 新建笔记时设置默认文件夹
            viewModel.setDefaultFolderId(defaultFolderId)
        }
    }
    
    // 显示 AI 撰写错误
    LaunchedEffect(uiState.aiWriteError) {
        if (uiState.aiWriteError != null) {
            // 错误会在对话框中显示
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (uiState.isEditing) {
                        // 优化后的标题输入框 - 简洁无边框样式
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
                    // AI 撰写按钮（仅在编辑模式显示）
                    if (uiState.isEditing) {
                        IconButton(
                            onClick = { showAIWriteDialog = true },
                            enabled = !uiState.aiWriteLoading
                        ) {
                            if (uiState.aiWriteLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.padding(8.dp),
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.Default.AutoAwesome,
                                    contentDescription = "AI 撰写",
                                    tint = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                    
                    if (uiState.isEditing) {
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
            // 标签
            if (uiState.tags.isNotEmpty()) {
                LazyRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    items(uiState.tags) { tag ->
                        AssistChip(
                            onClick = { /* 点击标签 */ },
                            label = { Text(tag) },
                            modifier = Modifier.padding(end = 8.dp)
                        )
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
                    // 编辑模式：带工具栏的文本编辑器
                    Column(modifier = Modifier.fillMaxSize()) {
                        // 编辑器工具栏
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
                            onImageClick = { /* TODO: 打开图片选择器 */ },
                            onAttachmentClick = { /* TODO: 打开文件选择器 */ }
                        )
                        
                        // 优化后的文本编辑器 - 更简洁的样式
                        OutlinedTextField(
                            value = uiState.content,
                            onValueChange = { viewModel.updateContent(it) },
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
                    // 查看模式：WebView 显示 HTML
                    NoteContentWebView(
                        content = viewModel.getProcessedContent(),
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }
            
            // 更新时间
            if (!uiState.isEditing && uiState.updatedTime > 0) {
                Text(
                    text = stringResource(
                        R.string.last_updated,
                        formatTime(uiState.updatedTime)
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp)
                )
            }
        }
    }
    
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
    
    // AI 撰写对话框
    if (showAIWriteDialog) {
        var aiPrompt by remember { mutableStateOf("") }
        
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
                                modifier = Modifier.padding(end = 8.dp),
                                strokeWidth = 2.dp
                            )
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
                        // 成功后关闭对话框（在 ViewModel 中处理）
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
        
        // AI 撰写成功后关闭对话框
        LaunchedEffect(uiState.aiWriteLoading, uiState.aiWriteError) {
            if (!uiState.aiWriteLoading && uiState.aiWriteError == null && aiPrompt.isNotBlank()) {
                // 检查内容是否已更新（表示撰写成功）
                showAIWriteDialog = false
            }
        }
    }
}

/**
 * WebView 显示笔记内容
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun NoteContentWebView(
    content: String,
    modifier: Modifier = Modifier
) {
    val htmlContent = remember(content) {
        wrapContentInHtml(content)
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
 * 将内容包装为 HTML
 */
private fun wrapContentInHtml(content: String): String {
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
                        color: #333;
                    }
                    img { max-width: 100%; height: auto; }
                    pre { background: #f5f5f5; padding: 12px; overflow-x: auto; border-radius: 4px; }
                    code { background: #f5f5f5; padding: 2px 4px; border-radius: 2px; }
                    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
                    a { color: #1976d2; }
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background: #f5f5f5; }
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
                    color: #333;
                }
                img { max-width: 100%; height: auto; border-radius: 4px; }
                pre { background: #f5f5f5; padding: 12px; overflow-x: auto; border-radius: 4px; }
                code { background: #f5f5f5; padding: 2px 4px; border-radius: 2px; font-family: monospace; }
                blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
                a { color: #1976d2; }
                table { border-collapse: collapse; width: 100%; margin: 16px 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background: #f5f5f5; }
                h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; }
                ul, ol { padding-left: 24px; }
                li { margin: 4px 0; }
                hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
                .task-list-item { list-style: none; margin-left: -24px; }
                .task-list-item input { margin-right: 8px; }
                .image-error { 
                    display: inline-block; 
                    padding: 8px 12px; 
                    background: #fff2f0; 
                    border: 1px solid #ffccc7;
                    border-radius: 4px;
                    color: #ff4d4f;
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
    
    // 转义 HTML 特殊字符（但保留 Markdown 语法）
    // 注意：这里不能直接转义，因为会影响 Markdown 解析
    
    // 代码块（需要先处理，避免内部内容被其他规则影响）
    val codeBlockRegex = Regex("```(\\w*)\\n([\\s\\S]*?)```")
    html = codeBlockRegex.replace(html) { match ->
        val language = match.groupValues[1]
        val code = match.groupValues[2]
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        "<pre><code class=\"language-$language\">$code</code></pre>"
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
            // resource:// 协议的图片（未能加载）显示占位符
            "<span class=\"image-error\">📷 图片: $alt (资源未同步)</span>"
        } else {
            // 普通 URL 或 data URI
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
    
    // 段落（将连续的非空行包装为段落）
    val lines = html.split("\n")
    val result = StringBuilder()
    var inParagraph = false
    
    for (line in lines) {
        val trimmedLine = line.trim()
        
        // 跳过已经是 HTML 标签的行
        if (trimmedLine.startsWith("<h") || 
            trimmedLine.startsWith("<ul") || 
            trimmedLine.startsWith("<ol") ||
            trimmedLine.startsWith("<li") ||
            trimmedLine.startsWith("<pre") ||
            trimmedLine.startsWith("<blockquote") ||
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
