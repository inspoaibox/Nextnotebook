package com.mucheng.notes.presentation.screens.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.navigation.NavController
import com.mucheng.notes.R
import com.mucheng.notes.presentation.viewmodel.LockTimeout
import com.mucheng.notes.presentation.viewmodel.SettingsViewModel
import com.mucheng.notes.security.LockType
import kotlinx.coroutines.launch

/**
 * 安全设置页面
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SecuritySettingsScreen(
    navController: NavController,
    viewModel: SettingsViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var showLockTimeoutMenu by remember { mutableStateOf(false) }
    
    LaunchedEffect(uiState.message) {
        uiState.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearMessage()
        }
    }
    
    // 处理应用锁生物识别启用
    fun handleBiometricToggle(enabled: Boolean) {
        if (enabled) {
            val activity = context as? FragmentActivity
            if (activity != null) {
                viewModel.authenticateBiometricAndEnable(activity) { success, message ->
                    message?.let {
                        scope.launch { snackbarHostState.showSnackbar(it) }
                    }
                }
            } else {
                scope.launch { snackbarHostState.showSnackbar("无法获取 Activity 上下文") }
            }
        } else {
            viewModel.setBiometricEnabled(false)
        }
    }
    
    // 处理密码库生物识别启用
    fun handleVaultBiometricToggle(enabled: Boolean) {
        if (enabled) {
            val activity = context as? FragmentActivity
            if (activity != null) {
                viewModel.authenticateVaultBiometricAndEnable(activity) { success, message ->
                    message?.let {
                        scope.launch { snackbarHostState.showSnackbar(it) }
                    }
                }
            } else {
                scope.launch { snackbarHostState.showSnackbar("无法获取 Activity 上下文") }
            }
        } else {
            viewModel.setVaultBiometricEnabled(false)
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_security)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        if (!uiState.isInitialized) {
            Box(
                modifier = Modifier.fillMaxSize().padding(paddingValues),
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
            // ========== 应用锁定部分 ==========
            Text(
                "应用锁定",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                "启用后每次打开应用需要验证身份",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline
            )
            Spacer(modifier = Modifier.height(16.dp))
            
            SettingsSwitch(
                title = "启用应用锁",
                checked = uiState.appLockEnabled,
                onCheckedChange = { viewModel.setAppLockEnabled(it) }
            )
            
            if (uiState.appLockEnabled) {
                Spacer(modifier = Modifier.height(16.dp))
                
                // 锁定方式
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("锁定方式", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        when (uiState.lockType) {
                            LockType.PIN -> "PIN 码"
                            LockType.PATTERN -> "图案"
                            LockType.BIOMETRIC -> "生物识别"
                            LockType.NONE -> "未设置"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                
                // 锁定超时
                ExposedDropdownMenuBox(
                    expanded = showLockTimeoutMenu,
                    onExpandedChange = { showLockTimeoutMenu = it }
                ) {
                    OutlinedTextField(
                        value = uiState.lockTimeout.label,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("自动锁定时间") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = showLockTimeoutMenu) },
                        modifier = Modifier.fillMaxWidth().menuAnchor()
                    )
                    ExposedDropdownMenu(
                        expanded = showLockTimeoutMenu,
                        onDismissRequest = { showLockTimeoutMenu = false }
                    ) {
                        LockTimeout.entries.forEach { timeout ->
                            DropdownMenuItem(
                                text = { Text(timeout.label) },
                                onClick = {
                                    viewModel.setLockTimeout(timeout)
                                    showLockTimeoutMenu = false
                                }
                            )
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                // 生物识别
                if (uiState.biometricAvailable) {
                    SettingsSwitch(
                        title = "使用生物识别",
                        subtitle = "使用指纹或面部识别解锁应用",
                        checked = uiState.biometricEnabled,
                        onCheckedChange = { handleBiometricToggle(it) }
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                }
                
                // 修改/重设 PIN 按钮
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { viewModel.showChangePinDialog() }) {
                        Text(if (uiState.lockType == LockType.NONE) "设置 PIN" else "修改 PIN")
                    }
                    if (uiState.lockType != LockType.NONE) {
                        OutlinedButton(
                            onClick = { viewModel.setAppLockEnabled(false) },
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = MaterialTheme.colorScheme.error
                            )
                        ) {
                            Text("移除锁定")
                        }
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(32.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(24.dp))
            
            // ========== 密码库锁定部分 ==========
            Text(
                "密码库锁定",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                "为密码库设置独立密码，每次访问密码库需要验证",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline
            )
            Spacer(modifier = Modifier.height(16.dp))
            
            // 启用密码库锁定
            SettingsSwitch(
                title = "启用密码库锁定",
                subtitle = "访问密码库时需要验证密码",
                checked = uiState.vaultLockEnabled,
                onCheckedChange = { viewModel.setVaultLockEnabled(it) }
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // 密码库密码状态
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("密码库密码", style = MaterialTheme.typography.bodyLarge)
                if (uiState.vaultPasswordSet) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            "已设置",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                } else {
                    Text(
                        "未设置",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            // 密码库密码操作按钮
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { viewModel.showVaultPasswordDialog() }) {
                    Icon(
                        if (uiState.vaultPasswordSet) Icons.Default.Edit else Icons.Default.Lock,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(if (uiState.vaultPasswordSet) "修改密码" else "设置密码")
                }
                if (uiState.vaultPasswordSet) {
                    OutlinedButton(
                        onClick = { viewModel.removeVaultPassword() },
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.error
                        )
                    ) {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("移除密码")
                    }
                }
            }
            
            // 密码库生物识别（仅当密码已设置时显示）
            if (uiState.vaultPasswordSet && uiState.biometricAvailable) {
                Spacer(modifier = Modifier.height(16.dp))
                SettingsSwitch(
                    title = "使用生物识别",
                    subtitle = "使用指纹或面部识别解锁密码库",
                    checked = uiState.vaultBiometricEnabled,
                    onCheckedChange = { handleVaultBiometricToggle(it) }
                )
            }
            
            // 提示信息
            if (uiState.vaultLockEnabled && uiState.vaultPasswordSet) {
                Spacer(modifier = Modifier.height(16.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Icon(
                            Icons.Default.Info,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "密码库锁定已启用，每次进入密码库页面都需要验证密码" +
                                    if (uiState.vaultBiometricEnabled) "或生物识别" else "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }
    }
    
    // PIN 设置对话框
    if (uiState.showPinDialog) {
        PinSetupDialog(
            onDismiss = { viewModel.dismissPinDialog() },
            onConfirm = { pin -> viewModel.setPin(pin) }
        )
    }
    
    // 密码库密码设置对话框
    if (uiState.showVaultPasswordDialog) {
        VaultPasswordDialog(
            mode = uiState.vaultPasswordDialogMode,
            onDismiss = { viewModel.dismissVaultPasswordDialog() },
            onConfirm = { password -> viewModel.setVaultPassword(password) },
            onVerify = { password -> viewModel.verifyVaultPassword(password) }
        )
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

@Composable
private fun PinSetupDialog(
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var pin by remember { mutableStateOf("") }
    var confirmPin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("设置 PIN") },
        text = {
            Column {
                OutlinedTextField(
                    value = pin,
                    onValueChange = { if (it.length <= 6 && it.all { c -> c.isDigit() }) pin = it },
                    label = { Text("输入 PIN (4-6 位数字)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = confirmPin,
                    onValueChange = { if (it.length <= 6 && it.all { c -> c.isDigit() }) confirmPin = it },
                    label = { Text(stringResource(R.string.confirm_password)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                error?.let {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                when {
                    pin.length < 4 -> error = "PIN 至少 4 位"
                    pin != confirmPin -> error = "两次输入不一致"
                    else -> onConfirm(pin)
                }
            }) {
                Text(stringResource(R.string.confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        }
    )
}

/**
 * 密码库密码设置对话框
 */
@Composable
private fun VaultPasswordDialog(
    mode: String, // "set" | "change"
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
    onVerify: (String) -> Boolean
) {
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var showCurrentPassword by remember { mutableStateOf(false) }
    var showNewPassword by remember { mutableStateOf(false) }
    var showConfirmPassword by remember { mutableStateOf(false) }
    
    val isChangeMode = mode == "change"
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isChangeMode) "修改密码库密码" else "设置密码库密码") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // 修改模式需要先验证当前密码
                if (isChangeMode) {
                    OutlinedTextField(
                        value = currentPassword,
                        onValueChange = { currentPassword = it; error = null },
                        label = { Text("当前密码") },
                        singleLine = true,
                        visualTransformation = if (showCurrentPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { showCurrentPassword = !showCurrentPassword }) {
                                Icon(
                                    if (showCurrentPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = null
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                
                OutlinedTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it; error = null },
                    label = { Text(if (isChangeMode) "新密码" else "密码") },
                    supportingText = { Text("至少 4 个字符") },
                    singleLine = true,
                    visualTransformation = if (showNewPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = { showNewPassword = !showNewPassword }) {
                            Icon(
                                if (showNewPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = null
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                )
                
                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it; error = null },
                    label = { Text("确认密码") },
                    singleLine = true,
                    visualTransformation = if (showConfirmPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = { showConfirmPassword = !showConfirmPassword }) {
                            Icon(
                                if (showConfirmPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = null
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                )
                
                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                when {
                    isChangeMode && currentPassword.isBlank() -> error = "请输入当前密码"
                    isChangeMode && !onVerify(currentPassword) -> error = "当前密码错误"
                    newPassword.length < 4 -> error = "密码至少 4 个字符"
                    newPassword != confirmPassword -> error = "两次输入的密码不一致"
                    else -> onConfirm(newPassword)
                }
            }) {
                Text("确定")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        }
    )
}
