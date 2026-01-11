package com.mucheng.notes.presentation.screens.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.mucheng.notes.R
import com.mucheng.notes.domain.model.SyncStatus
import com.mucheng.notes.presentation.viewmodel.SettingsViewModel
import com.mucheng.notes.presentation.viewmodel.SyncInterval
import java.text.SimpleDateFormat
import java.util.*

/**
 * 同步设置页面
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncSettingsScreen(
    navController: NavController,
    viewModel: SettingsViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current
    var showPasswordField by remember { mutableStateOf(false) }
    var showSyncIntervalMenu by remember { mutableStateOf(false) }
    
    LaunchedEffect(uiState.message) {
        uiState.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearMessage()
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_sync)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        // 等待状态初始化完成
        if (!uiState.isInitialized) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }
        
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // 启用同步
            SettingsSwitch(
                title = "启用同步",
                checked = uiState.syncEnabled,
                onCheckedChange = { viewModel.setSyncEnabled(it) }
            )
            
            if (uiState.syncEnabled) {
                Spacer(modifier = Modifier.height(24.dp))
                
                // 同步方式选择
                Text(
                    "同步方式",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    FilterChip(
                        selected = uiState.syncType == "webdav",
                        onClick = { viewModel.setSyncType("webdav") },
                        label = { Text("WebDAV") },
                        leadingIcon = if (uiState.syncType == "webdav") {
                            { Icon(Icons.Default.Check, null, Modifier.size(18.dp)) }
                        } else null
                    )
                    FilterChip(
                        selected = uiState.syncType == "server",
                        onClick = { viewModel.setSyncType("server") },
                        label = { Text("自建服务器") },
                        leadingIcon = if (uiState.syncType == "server") {
                            { Icon(Icons.Default.Check, null, Modifier.size(18.dp)) }
                        } else null
                    )
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                // 服务器地址
                OutlinedTextField(
                    value = uiState.webdavUrl,
                    onValueChange = { viewModel.setWebdavUrl(it) },
                    label = { Text(if (uiState.syncType == "webdav") "WebDAV 地址" else "服务器地址") },
                    placeholder = { Text(if (uiState.syncType == "webdav") "https://example.com/dav" else "https://api.example.com") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                
                Spacer(modifier = Modifier.height(12.dp))
                
                // 同步目录（仅 WebDAV 模式）
                if (uiState.syncType == "webdav") {
                    OutlinedTextField(
                        value = uiState.syncPath,
                        onValueChange = { viewModel.setSyncPath(it) },
                        label = { Text("同步目录") },
                        placeholder = { Text("/mucheng-notes") },
                        supportingText = { Text("数据将同步到此目录下") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    
                    Spacer(modifier = Modifier.height(12.dp))
                }
                
                if (uiState.syncType == "webdav") {
                    // WebDAV 用户名密码
                    OutlinedTextField(
                        value = uiState.username,
                        onValueChange = { viewModel.setUsername(it) },
                        label = { Text("用户名") },
                        placeholder = { Text("可选") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = uiState.password,
                        onValueChange = { viewModel.setPassword(it) },
                        label = { Text("密码") },
                        placeholder = { Text("可选") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        visualTransformation = if (showPasswordField) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { showPasswordField = !showPasswordField }) {
                                Icon(
                                    if (showPasswordField) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = null
                                )
                            }
                        }
                    )
                } else {
                    // 自建服务器认证
                    if (uiState.serverLoggedIn) {
                        // 已登录状态
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer
                            )
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        "已登录",
                                        style = MaterialTheme.typography.titleSmall,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer
                                    )
                                    Text(
                                        uiState.serverLoginUser ?: uiState.serverUsername,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                                    )
                                }
                                TextButton(onClick = { viewModel.serverLogout() }) {
                                    Text("登出")
                                }
                            }
                        }
                    } else {
                        // 未登录状态 - 显示登录表单
                        OutlinedTextField(
                            value = uiState.serverUsername,
                            onValueChange = { viewModel.setServerUsername(it) },
                            label = { Text("用户名") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedTextField(
                            value = uiState.serverPassword,
                            onValueChange = { viewModel.setServerPassword(it) },
                            label = { Text("密码") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            visualTransformation = if (showPasswordField) VisualTransformation.None else PasswordVisualTransformation(),
                            trailingIcon = {
                                IconButton(onClick = { showPasswordField = !showPasswordField }) {
                                    Icon(
                                        if (showPasswordField) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                        contentDescription = null
                                    )
                                }
                            }
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedTextField(
                            value = uiState.serverSyncKey,
                            onValueChange = { viewModel.setServerSyncKey(it) },
                            label = { Text("同步密钥") },
                            supportingText = { Text("用于数据加密，请妥善保管") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            visualTransformation = if (showPasswordField) VisualTransformation.None else PasswordVisualTransformation()
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = { viewModel.serverLogin() },
                            enabled = !uiState.serverLoggingIn,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            if (uiState.serverLoggingIn) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                            }
                            Text("登录")
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(24.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(24.dp))
                
                // 同步间隔
                ExposedDropdownMenuBox(
                    expanded = showSyncIntervalMenu,
                    onExpandedChange = { showSyncIntervalMenu = it }
                ) {
                    OutlinedTextField(
                        value = uiState.syncInterval.label,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("同步间隔") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = showSyncIntervalMenu) },
                        modifier = Modifier.fillMaxWidth().menuAnchor()
                    )
                    ExposedDropdownMenu(
                        expanded = showSyncIntervalMenu,
                        onDismissRequest = { showSyncIntervalMenu = false }
                    ) {
                        SyncInterval.entries.forEach { interval ->
                            DropdownMenuItem(
                                text = { Text(interval.label) },
                                onClick = {
                                    viewModel.setSyncInterval(interval)
                                    showSyncIntervalMenu = false
                                }
                            )
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(24.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(24.dp))
                
                // 同步模块选择
                Text(
                    "同步模块",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    "选择需要同步的数据模块",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
                )
                Spacer(modifier = Modifier.height(12.dp))
                
                SyncModuleCheckbox("笔记（含文件夹、标签、附件）", uiState.syncModules.notes) {
                    viewModel.setSyncModule("notes", it)
                }
                SyncModuleCheckbox("书签", uiState.syncModules.bookmarks) {
                    viewModel.setSyncModule("bookmarks", it)
                }
                SyncModuleCheckbox("密码库", uiState.syncModules.vault) {
                    viewModel.setSyncModule("vault", it)
                }
                SyncModuleCheckbox("脑图 / 流程图 / 白板", uiState.syncModules.diagrams) {
                    viewModel.setSyncModule("diagrams", it)
                }
                SyncModuleCheckbox("待办事项", uiState.syncModules.todos) {
                    viewModel.setSyncModule("todos", it)
                }
                SyncModuleCheckbox("AI 助手（配置与对话）", uiState.syncModules.ai) {
                    viewModel.setSyncModule("ai", it)
                }
                
                Spacer(modifier = Modifier.height(24.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(24.dp))
                
                // 操作按钮
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = { viewModel.testConnection() },
                        enabled = !uiState.testingConnection && uiState.webdavUrl.isNotEmpty(),
                        modifier = Modifier.weight(1f)
                    ) {
                        if (uiState.testingConnection) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            Spacer(modifier = Modifier.width(8.dp))
                        }
                        Text("测试连接")
                    }
                    Button(
                        onClick = { viewModel.syncNow() },
                        enabled = uiState.syncStatus != SyncStatus.SYNCING,
                        modifier = Modifier.weight(1f)
                    ) {
                        if (uiState.syncStatus == SyncStatus.SYNCING) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                        }
                        Text("立即同步")
                    }
                }

                // 上次同步时间
                uiState.lastSyncTime?.let { time ->
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Schedule,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.outline
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "上次同步: ${SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date(time))}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SyncModuleCheckbox(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Spacer(modifier = Modifier.width(8.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun SettingsSwitch(
    title: String,
    subtitle: String? = null,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled) { onCheckedChange(!checked) }
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.bodyLarge,
                color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline
            )
            if (subtitle != null) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
                )
            }
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
    }
}
