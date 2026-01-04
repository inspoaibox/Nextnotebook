package com.mucheng.notes.presentation.screens.vault

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.mucheng.notes.R
import com.mucheng.notes.domain.model.payload.VaultCustomField
import com.mucheng.notes.domain.model.payload.VaultEntryType
import com.mucheng.notes.domain.model.payload.VaultTotp
import com.mucheng.notes.domain.model.payload.VaultUri
import com.mucheng.notes.presentation.components.FolderItem
import com.mucheng.notes.presentation.components.FolderTree
import com.mucheng.notes.presentation.navigation.Screen
import com.mucheng.notes.presentation.viewmodel.VaultEntryItem
import com.mucheng.notes.presentation.viewmodel.VaultViewModel
import com.mucheng.notes.security.TOTPCode
import kotlinx.coroutines.launch
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VaultScreen(
    navController: NavController,
    bottomPadding: PaddingValues = PaddingValues(),
    viewModel: VaultViewModel = hiltViewModel()
) {
    val entries by viewModel.entries.collectAsState()
    val folders by viewModel.folders.collectAsState()
    val selectedFolderId by viewModel.selectedFolderId.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    
    // 设置 Activity 用于生物识别
    LaunchedEffect(Unit) {
        (context as? androidx.fragment.app.FragmentActivity)?.let {
            viewModel.setActivity(it)
        }
        // 刷新锁定设置（从设置页面返回时）
        viewModel.refreshLockSettings()
    }
    
    // 对话框状态
    var showAddEntryDialog by remember { mutableStateOf(false) }
    var showEditEntryDialog by remember { mutableStateOf(false) }
    var showDeleteEntryDialog by remember { mutableStateOf(false) }
    var selectedEntry by remember { mutableStateOf<VaultEntryItem?>(null) }
    var showCreateFolderDialog by remember { mutableStateOf(false) }
    var createFolderParentId by remember { mutableStateOf<String?>(null) }

    val filteredEntries = if (selectedFolderId == null) entries
        else entries.filter { it.folderId == selectedFolderId }

    val folderItems = folders.map { f ->
        FolderItem(f.id, f.name, f.parentId, entries.count { it.folderId == f.id })
    }

    LaunchedEffect(uiState.copiedMessage) {
        uiState.copiedMessage?.let { snackbarHostState.showSnackbar(it) }
    }
    
    // 如果需要验证，显示锁定界面
    if (uiState.requiresAuth && !uiState.isUnlocked) {
        VaultLockScreen(
            biometricAvailable = uiState.biometricAvailable && uiState.vaultBiometricEnabled,
            error = uiState.error,
            onUnlockWithPassword = { password -> viewModel.unlockWithPassword(password) },
            onUnlockWithBiometric = { viewModel.unlockWithBiometric() },
            onClearError = { viewModel.clearError() }
        )
        return
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(Modifier.width(280.dp)) {
                Column(Modifier.fillMaxHeight().padding(16.dp)) {
                    Text("密码库文件夹", style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(bottom = 16.dp))
                    FolderTree(
                        folders = folderItems,
                        selectedFolderId = selectedFolderId,
                        onFolderSelect = { viewModel.selectFolder(it); scope.launch { drawerState.close() } },
                        onCreateFolder = { parentId ->
                            createFolderParentId = parentId
                            showCreateFolderDialog = true
                        },
                        modifier = Modifier.weight(1f),
                        allOptionLabel = "全部条目"
                    )
                    HorizontalDivider(Modifier.padding(vertical = 8.dp))
                    Row(Modifier.fillMaxWidth().clickable {
                        scope.launch { drawerState.close() }
                        navController.navigate(Screen.Settings.route)
                    }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Settings, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(12.dp))
                        Text(stringResource(R.string.settings), style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(if (selectedFolderId == null) stringResource(R.string.nav_vault)
                        else folders.find { it.id == selectedFolderId }?.name ?: stringResource(R.string.nav_vault)) },
                    navigationIcon = { IconButton({ scope.launch { drawerState.open() } }) {
                        Icon(Icons.Default.Menu, "打开文件夹") } }
                )
            },
            floatingActionButton = {
                FloatingActionButton(
                    onClick = { showAddEntryDialog = true },
                    modifier = Modifier.padding(bottom = bottomPadding.calculateBottomPadding())
                ) { 
                    Icon(Icons.Default.Add, stringResource(R.string.add)) 
                }
            },
            snackbarHost = { SnackbarHost(snackbarHostState) }
        ) { pv ->
            if (filteredEntries.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(pv).padding(bottom = bottomPadding.calculateBottomPadding()), Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.Lock, null, Modifier.size(64.dp), MaterialTheme.colorScheme.outline)
                        Spacer(Modifier.height(16.dp))
                        Text("密码库为空", style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.outline)
                        Spacer(Modifier.height(8.dp))
                        Text("点击右下角按钮添加凭据", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.outline)
                    }
                }
            } else {
                LazyColumn(Modifier.fillMaxSize().padding(pv).padding(horizontal = 16.dp),
                    contentPadding = PaddingValues(bottom = bottomPadding.calculateBottomPadding()),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(filteredEntries) { entry ->
                        // 只有当 TOTP 密钥非空时才观察
                        val totpSecret = entry.totpSecrets.firstOrNull()?.secret?.takeIf { it.isNotBlank() }
                        val totpCode by if (totpSecret != null) {
                            viewModel.observeTotpCode(totpSecret).collectAsState(initial = null)
                        } else {
                            remember { mutableStateOf<TOTPCode?>(null) }
                        }
                        
                        VaultEntryCard(
                            entry = entry,
                            onClick = {
                                selectedEntry = entry
                                showEditEntryDialog = true
                            },
                            onCopyUsername = { viewModel.copyToClipboard(entry.username, "用户名", false) },
                            onCopyPassword = { viewModel.copyToClipboard(entry.password, "密码") },
                            totpCode = totpCode,
                            onCopyTotp = totpCode?.let { code -> { viewModel.copyToClipboard(code.code, "验证码", false) } },
                            onEdit = {
                                selectedEntry = entry
                                showEditEntryDialog = true
                            },
                            onDelete = {
                                selectedEntry = entry
                                showDeleteEntryDialog = true
                            },
                            onToggleFavorite = { viewModel.toggleFavorite(entry.id) }
                        )
                    }
                }
            }
        }
    }
    
    // 添加条目对话框
    if (showAddEntryDialog) {
        AddEditEntryDialog(
            title = "添加凭据",
            entry = null,
            folders = folders.map { it.id to it.name },
            currentFolderId = selectedFolderId,
            onDismiss = { showAddEntryDialog = false },
            onSave = { entryData ->
                viewModel.createEntry(
                    name = entryData.name,
                    entryType = entryData.entryType,
                    folderId = entryData.folderId,
                    favorite = entryData.favorite,
                    notes = entryData.notes,
                    username = entryData.username,
                    password = entryData.password,
                    totpSecrets = entryData.totpSecrets,
                    uris = entryData.uris,
                    cardHolderName = entryData.cardHolderName,
                    cardNumber = entryData.cardNumber,
                    cardBrand = entryData.cardBrand,
                    cardExpMonth = entryData.cardExpMonth,
                    cardExpYear = entryData.cardExpYear,
                    cardCvv = entryData.cardCvv,
                    identityTitle = entryData.identityTitle,
                    identityFirstName = entryData.identityFirstName,
                    identityLastName = entryData.identityLastName,
                    identityEmail = entryData.identityEmail,
                    identityPhone = entryData.identityPhone,
                    identityAddress = entryData.identityAddress,
                    customFields = entryData.customFields
                )
                showAddEntryDialog = false
            },
            onGeneratePassword = { viewModel.generatePassword() }
        )
    }
    
    // 编辑条目对话框
    if (showEditEntryDialog && selectedEntry != null) {
        AddEditEntryDialog(
            title = "编辑凭据",
            entry = selectedEntry,
            folders = folders.map { it.id to it.name },
            currentFolderId = selectedEntry?.folderId,
            onDismiss = { 
                showEditEntryDialog = false
                selectedEntry = null
            },
            onSave = { entryData ->
                viewModel.updateEntry(
                    id = selectedEntry!!.id,
                    name = entryData.name,
                    entryType = entryData.entryType,
                    folderId = entryData.folderId,
                    favorite = entryData.favorite,
                    notes = entryData.notes,
                    username = entryData.username,
                    password = entryData.password,
                    totpSecrets = entryData.totpSecrets,
                    uris = entryData.uris,
                    cardHolderName = entryData.cardHolderName,
                    cardNumber = entryData.cardNumber,
                    cardBrand = entryData.cardBrand,
                    cardExpMonth = entryData.cardExpMonth,
                    cardExpYear = entryData.cardExpYear,
                    cardCvv = entryData.cardCvv,
                    identityTitle = entryData.identityTitle,
                    identityFirstName = entryData.identityFirstName,
                    identityLastName = entryData.identityLastName,
                    identityEmail = entryData.identityEmail,
                    identityPhone = entryData.identityPhone,
                    identityAddress = entryData.identityAddress,
                    customFields = entryData.customFields
                )
                showEditEntryDialog = false
                selectedEntry = null
            },
            onGeneratePassword = { viewModel.generatePassword() }
        )
    }
    
    // 删除确认对话框
    if (showDeleteEntryDialog && selectedEntry != null) {
        AlertDialog(
            onDismissRequest = { 
                showDeleteEntryDialog = false
                selectedEntry = null
            },
            title = { Text("删除凭据") },
            text = { Text("确定要删除 \"${selectedEntry!!.name}\" 吗？此操作无法撤销。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteEntry(selectedEntry!!.id)
                        showDeleteEntryDialog = false
                        selectedEntry = null
                    }
                ) {
                    Text("删除", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { 
                    showDeleteEntryDialog = false
                    selectedEntry = null
                }) {
                    Text("取消")
                }
            }
        )
    }
    
    // 创建文件夹对话框
    if (showCreateFolderDialog) {
        var folderName by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCreateFolderDialog = false },
            title = { Text("新建文件夹") },
            text = {
                OutlinedTextField(
                    value = folderName,
                    onValueChange = { folderName = it },
                    label = { Text("文件夹名称") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (folderName.isNotBlank()) {
                            viewModel.createFolder(folderName, createFolderParentId)
                            showCreateFolderDialog = false
                            folderName = ""
                        }
                    },
                    enabled = folderName.isNotBlank()
                ) {
                    Text("创建")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateFolderDialog = false }) {
                    Text("取消")
                }
            }
        )
    }
}


/**
 * 条目数据类（用于对话框）
 */
data class EntryFormData(
    val name: String = "",
    val entryType: VaultEntryType = VaultEntryType.LOGIN,
    val folderId: String? = null,
    val favorite: Boolean = false,
    val notes: String = "",
    val username: String = "",
    val password: String = "",
    val totpSecrets: List<VaultTotp> = emptyList(),
    val uris: List<VaultUri> = emptyList(),
    val cardHolderName: String = "",
    val cardNumber: String = "",
    val cardBrand: String = "",
    val cardExpMonth: String = "",
    val cardExpYear: String = "",
    val cardCvv: String = "",
    val identityTitle: String = "",
    val identityFirstName: String = "",
    val identityLastName: String = "",
    val identityEmail: String = "",
    val identityPhone: String = "",
    val identityAddress: String = "",
    val customFields: List<VaultCustomField> = emptyList()
)

/**
 * 添加/编辑条目对话框
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddEditEntryDialog(
    title: String,
    entry: VaultEntryItem?,
    folders: List<Pair<String, String>>,
    currentFolderId: String?,
    onDismiss: () -> Unit,
    onSave: (EntryFormData) -> Unit,
    onGeneratePassword: () -> String
) {
    var formData by remember {
        mutableStateOf(
            if (entry != null) {
                EntryFormData(
                    name = entry.name,
                    entryType = entry.entryType,
                    folderId = entry.folderId,
                    favorite = entry.favorite,
                    username = entry.username,
                    password = entry.password,
                    totpSecrets = entry.totpSecrets,
                    uris = entry.uris
                )
            } else {
                EntryFormData(folderId = currentFolderId)
            }
        )
    }
    var showPassword by remember { mutableStateOf(false) }
    var showEntryTypeMenu by remember { mutableStateOf(false) }
    var showFolderMenu by remember { mutableStateOf(false) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 500.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // 条目类型选择
                ExposedDropdownMenuBox(
                    expanded = showEntryTypeMenu,
                    onExpandedChange = { showEntryTypeMenu = it }
                ) {
                    OutlinedTextField(
                        value = getEntryTypeName(formData.entryType),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("类型") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = showEntryTypeMenu) },
                        modifier = Modifier.fillMaxWidth().menuAnchor()
                    )
                    ExposedDropdownMenu(
                        expanded = showEntryTypeMenu,
                        onDismissRequest = { showEntryTypeMenu = false }
                    ) {
                        VaultEntryType.entries.forEach { type ->
                            DropdownMenuItem(
                                text = { Text(getEntryTypeName(type)) },
                                onClick = {
                                    formData = formData.copy(entryType = type)
                                    showEntryTypeMenu = false
                                },
                                leadingIcon = { Icon(getEntryTypeIcon(type), null) }
                            )
                        }
                    }
                }
                
                // 名称
                OutlinedTextField(
                    value = formData.name,
                    onValueChange = { formData = formData.copy(name = it) },
                    label = { Text("名称 *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                
                // 文件夹选择
                ExposedDropdownMenuBox(
                    expanded = showFolderMenu,
                    onExpandedChange = { showFolderMenu = it }
                ) {
                    OutlinedTextField(
                        value = folders.find { it.first == formData.folderId }?.second ?: "未分类",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("文件夹") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = showFolderMenu) },
                        modifier = Modifier.fillMaxWidth().menuAnchor()
                    )
                    ExposedDropdownMenu(
                        expanded = showFolderMenu,
                        onDismissRequest = { showFolderMenu = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("未分类") },
                            onClick = {
                                formData = formData.copy(folderId = null)
                                showFolderMenu = false
                            }
                        )
                        folders.forEach { (id, name) ->
                            DropdownMenuItem(
                                text = { Text(name) },
                                onClick = {
                                    formData = formData.copy(folderId = id)
                                    showFolderMenu = false
                                }
                            )
                        }
                    }
                }
                
                // 根据类型显示不同字段
                when (formData.entryType) {
                    VaultEntryType.LOGIN -> {
                        // 用户名
                        OutlinedTextField(
                            value = formData.username,
                            onValueChange = { formData = formData.copy(username = it) },
                            label = { Text("用户名") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        
                        // 密码
                        OutlinedTextField(
                            value = formData.password,
                            onValueChange = { formData = formData.copy(password = it) },
                            label = { Text("密码") },
                            singleLine = true,
                            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                            trailingIcon = {
                                Row {
                                    IconButton(onClick = { showPassword = !showPassword }) {
                                        Icon(
                                            if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                            contentDescription = if (showPassword) "隐藏密码" else "显示密码"
                                        )
                                    }
                                    IconButton(onClick = { formData = formData.copy(password = onGeneratePassword()) }) {
                                        Icon(Icons.Default.Refresh, contentDescription = "生成密码")
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        )
                        
                        // 多网址编辑器
                        UriListEditor(
                            uris = formData.uris,
                            onUrisChange = { formData = formData.copy(uris = it) }
                        )
                        
                        // 多 TOTP 编辑器
                        TotpListEditor(
                            totps = formData.totpSecrets,
                            onTotpsChange = { formData = formData.copy(totpSecrets = it) }
                        )
                    }
                    
                    VaultEntryType.CARD -> {
                        OutlinedTextField(
                            value = formData.cardHolderName,
                            onValueChange = { formData = formData.copy(cardHolderName = it) },
                            label = { Text("持卡人姓名") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = formData.cardNumber,
                            onValueChange = { formData = formData.copy(cardNumber = it) },
                            label = { Text("卡号") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = formData.cardExpMonth,
                                onValueChange = { formData = formData.copy(cardExpMonth = it) },
                                label = { Text("月") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = formData.cardExpYear,
                                onValueChange = { formData = formData.copy(cardExpYear = it) },
                                label = { Text("年") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = formData.cardCvv,
                                onValueChange = { formData = formData.copy(cardCvv = it) },
                                label = { Text("CVV") },
                                singleLine = true,
                                visualTransformation = PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                    
                    VaultEntryType.IDENTITY -> {
                        OutlinedTextField(
                            value = formData.identityFirstName,
                            onValueChange = { formData = formData.copy(identityFirstName = it) },
                            label = { Text("名") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = formData.identityLastName,
                            onValueChange = { formData = formData.copy(identityLastName = it) },
                            label = { Text("姓") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = formData.identityEmail,
                            onValueChange = { formData = formData.copy(identityEmail = it) },
                            label = { Text("邮箱") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = formData.identityPhone,
                            onValueChange = { formData = formData.copy(identityPhone = it) },
                            label = { Text("电话") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = formData.identityAddress,
                            onValueChange = { formData = formData.copy(identityAddress = it) },
                            label = { Text("地址") },
                            maxLines = 3,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    
                    VaultEntryType.SECURE_NOTE -> {
                        OutlinedTextField(
                            value = formData.notes,
                            onValueChange = { formData = formData.copy(notes = it) },
                            label = { Text("安全笔记内容") },
                            maxLines = 10,
                            modifier = Modifier.fillMaxWidth().heightIn(min = 150.dp)
                        )
                    }
                }
                
                // 备注（非安全笔记类型）
                if (formData.entryType != VaultEntryType.SECURE_NOTE) {
                    OutlinedTextField(
                        value = formData.notes,
                        onValueChange = { formData = formData.copy(notes = it) },
                        label = { Text("备注") },
                        maxLines = 3,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(formData) },
                enabled = formData.name.isNotBlank()
            ) {
                Text("保存")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("取消")
            }
        }
    )
}


@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun VaultEntryCard(
    entry: VaultEntryItem, 
    onClick: () -> Unit,
    onCopyUsername: () -> Unit, 
    onCopyPassword: () -> Unit,
    totpCode: TOTPCode? = null, 
    onCopyTotp: (() -> Unit)? = null,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onToggleFavorite: () -> Unit
) {
    var showPassword by remember { mutableStateOf(false) }
    var showMenu by remember { mutableStateOf(false) }
    
    Box {
        Card(
            Modifier
                .fillMaxWidth()
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = { showMenu = true }
                ),
            colors = CardDefaults.cardColors(MaterialTheme.colorScheme.surface)
        ) {
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Icon(getEntryTypeIcon(entry.entryType), null, Modifier.size(40.dp), MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(entry.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                            if (entry.favorite) {
                                Spacer(Modifier.width(4.dp))
                                Icon(Icons.Default.Star, null, Modifier.size(16.dp), MaterialTheme.colorScheme.primary)
                            }
                        }
                        if (entry.username.isNotEmpty()) Text(entry.username, style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (entry.password.isNotEmpty()) Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(if (showPassword) entry.password else "••••••••",
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
                            IconButton({ showPassword = !showPassword }, Modifier.size(24.dp)) {
                                Icon(if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    null, Modifier.size(16.dp))
                            }
                        }
                    }
                    Column {
                        if (entry.username.isNotEmpty()) IconButton(onCopyUsername) {
                            Icon(Icons.Default.Person, "复制用户名", tint = MaterialTheme.colorScheme.outline) }
                        if (entry.password.isNotEmpty()) IconButton(onCopyPassword) {
                            Icon(Icons.Default.ContentCopy, "复制密码", tint = MaterialTheme.colorScheme.outline) }
                    }
                }
                
                // TOTP 显示
                if (totpCode != null && onCopyTotp != null) {
                    Spacer(Modifier.height(12.dp))
                    HorizontalDivider()
                    Spacer(Modifier.height(12.dp))
                    TOTPDisplay(totpCode = totpCode, onCopy = onCopyTotp)
                }
            }
        }
        
        // 长按菜单
        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            offset = DpOffset(x = 100.dp, y = 0.dp)
        ) {
            DropdownMenuItem(
                text = { Text("编辑") },
                onClick = {
                    showMenu = false
                    onEdit()
                },
                leadingIcon = { Icon(Icons.Default.Edit, null) }
            )
            DropdownMenuItem(
                text = { Text(if (entry.favorite) "取消收藏" else "收藏") },
                onClick = {
                    showMenu = false
                    onToggleFavorite()
                },
                leadingIcon = { 
                    Icon(
                        if (entry.favorite) Icons.Default.StarOutline else Icons.Default.Star, 
                        null,
                        tint = MaterialTheme.colorScheme.primary
                    ) 
                }
            )
            DropdownMenuItem(
                text = { Text("删除", color = MaterialTheme.colorScheme.error) },
                onClick = {
                    showMenu = false
                    onDelete()
                },
                leadingIcon = { Icon(Icons.Default.Delete, null, tint = MaterialTheme.colorScheme.error) }
            )
        }
    }
}

/**
 * TOTP 验证码显示组件
 */
@Composable
private fun TOTPDisplay(totpCode: TOTPCode, onCopy: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 倒计时圆环
        Box(modifier = Modifier.size(36.dp), contentAlignment = Alignment.Center) {
            val progress = totpCode.remainingSeconds / 30f
            val color = if (totpCode.remainingSeconds <= 5) MaterialTheme.colorScheme.error 
                        else MaterialTheme.colorScheme.primary
            
            Canvas(modifier = Modifier.fillMaxSize()) {
                drawArc(
                    color = color.copy(alpha = 0.2f),
                    startAngle = -90f, sweepAngle = 360f, useCenter = false,
                    style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round),
                    size = Size(size.width, size.height)
                )
                drawArc(
                    color = color,
                    startAngle = -90f, sweepAngle = 360f * progress, useCenter = false,
                    style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round),
                    size = Size(size.width, size.height)
                )
            }
            Text(
                text = "${totpCode.remainingSeconds}",
                style = MaterialTheme.typography.labelSmall,
                color = color
            )
        }
        
        Spacer(Modifier.width(12.dp))
        
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.totp_code),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline
            )
            Text(
                text = formatTOTPCode(totpCode.code),
                style = MaterialTheme.typography.headlineSmall,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.primary
            )
        }
        
        IconButton(onClick = onCopy) {
            Icon(Icons.Default.ContentCopy, "复制验证码", tint = MaterialTheme.colorScheme.primary)
        }
    }
}

private fun formatTOTPCode(code: String): String {
    return if (code.length == 6) "${code.substring(0, 3)} ${code.substring(3)}" else code
}

private fun getEntryTypeIcon(type: VaultEntryType): ImageVector = when (type) {
    VaultEntryType.LOGIN -> Icons.Default.Person
    VaultEntryType.CARD -> Icons.Default.CreditCard
    VaultEntryType.IDENTITY -> Icons.Default.Badge
    VaultEntryType.SECURE_NOTE -> Icons.Default.Note
}

private fun getEntryTypeName(type: VaultEntryType): String = when (type) {
    VaultEntryType.LOGIN -> "登录"
    VaultEntryType.CARD -> "银行卡"
    VaultEntryType.IDENTITY -> "身份"
    VaultEntryType.SECURE_NOTE -> "安全笔记"
}

/**
 * 多网址编辑器
 */
@Composable
private fun UriListEditor(
    uris: List<VaultUri>,
    onUrisChange: (List<VaultUri>) -> Unit
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("关联网站", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.outline)
            TextButton(onClick = {
                onUrisChange(uris + VaultUri(UUID.randomUUID().toString(), "", "", "domain"))
            }) {
                Icon(Icons.Default.Add, null, Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("添加")
            }
        }
        
        uris.forEachIndexed { index, uri ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = uri.name,
                    onValueChange = { newName ->
                        onUrisChange(uris.mapIndexed { i, u -> if (i == index) u.copy(name = newName) else u })
                    },
                    label = { Text("名称") },
                    singleLine = true,
                    modifier = Modifier.width(80.dp)
                )
                OutlinedTextField(
                    value = uri.uri,
                    onValueChange = { newUri ->
                        onUrisChange(uris.mapIndexed { i, u -> if (i == index) u.copy(uri = newUri) else u })
                    },
                    label = { Text("网址") },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                IconButton(
                    onClick = { onUrisChange(uris.filterIndexed { i, _ -> i != index }) }
                ) {
                    Icon(Icons.Default.Delete, "删除", tint = MaterialTheme.colorScheme.error)
                }
            }
        }
        
        if (uris.isEmpty()) {
            Text(
                "点击添加按钮添加网站",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }
    }
}

/**
 * 多 TOTP 编辑器
 */
@Composable
private fun TotpListEditor(
    totps: List<VaultTotp>,
    onTotpsChange: (List<VaultTotp>) -> Unit
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("TOTP 验证器", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.outline)
            TextButton(onClick = {
                onTotpsChange(totps + VaultTotp(UUID.randomUUID().toString(), "", "", ""))
            }) {
                Icon(Icons.Default.Add, null, Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("添加")
            }
        }
        
        totps.forEachIndexed { index, totp ->
            Card(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = totp.name,
                            onValueChange = { newName ->
                                onTotpsChange(totps.mapIndexed { i, t -> if (i == index) t.copy(name = newName) else t })
                            },
                            label = { Text("服务名称") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = totp.account,
                            onValueChange = { newAccount ->
                                onTotpsChange(totps.mapIndexed { i, t -> if (i == index) t.copy(account = newAccount) else t })
                            },
                            label = { Text("账户") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(
                            onClick = { onTotpsChange(totps.filterIndexed { i, _ -> i != index }) }
                        ) {
                            Icon(Icons.Default.Delete, "删除", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                    
                    Spacer(Modifier.height(8.dp))
                    
                    OutlinedTextField(
                        value = totp.secret,
                        onValueChange = { newSecret ->
                            // 支持粘贴 otpauth:// 链接自动解析
                            val trimmed = newSecret.trim()
                            if (trimmed.startsWith("otpauth://")) {
                                val parsed = parseOtpAuthUri(trimmed)
                                if (parsed != null) {
                                    onTotpsChange(totps.mapIndexed { i, t ->
                                        if (i == index) t.copy(
                                            secret = parsed.secret,
                                            name = parsed.name.ifEmpty { t.name },
                                            account = parsed.account.ifEmpty { t.account }
                                        ) else t
                                    })
                                    return@OutlinedTextField
                                }
                            }
                            onTotpsChange(totps.mapIndexed { i, t -> if (i == index) t.copy(secret = newSecret) else t })
                        },
                        label = { Text("密钥或 otpauth:// 链接") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
        
        if (totps.isEmpty()) {
            Text(
                "点击添加按钮添加 TOTP 验证器",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }
    }
}

/**
 * 解析 otpauth:// URI
 */
private data class ParsedOtpAuth(val secret: String, val name: String, val account: String)

private fun parseOtpAuthUri(uri: String): ParsedOtpAuth? {
    return try {
        // otpauth://totp/ServiceName:account@example.com?secret=XXXX&issuer=ServiceName
        if (!uri.startsWith("otpauth://totp/")) return null
        
        val withoutPrefix = uri.removePrefix("otpauth://totp/")
        val queryIndex = withoutPrefix.indexOf('?')
        if (queryIndex < 0) return null
        
        val labelPart = java.net.URLDecoder.decode(withoutPrefix.substring(0, queryIndex), "UTF-8")
        val queryPart = withoutPrefix.substring(queryIndex + 1)
        
        // 解析 label: "ServiceName:account" 或 "account"
        val colonIndex = labelPart.indexOf(':')
        val (name, account) = if (colonIndex >= 0) {
            labelPart.substring(0, colonIndex) to labelPart.substring(colonIndex + 1)
        } else {
            "" to labelPart
        }
        
        // 解析 query 参数
        val params = queryPart.split('&').associate {
            val eqIndex = it.indexOf('=')
            if (eqIndex >= 0) {
                it.substring(0, eqIndex).lowercase() to java.net.URLDecoder.decode(it.substring(eqIndex + 1), "UTF-8")
            } else {
                it.lowercase() to ""
            }
        }
        
        val secret = params["secret"] ?: return null
        val issuer = params["issuer"] ?: name
        
        ParsedOtpAuth(secret, issuer, account)
    } catch (e: Exception) {
        null
    }
}

/**
 * 密码库锁定界面
 */
@Composable
private fun VaultLockScreen(
    biometricAvailable: Boolean,
    error: String?,
    onUnlockWithPassword: (String) -> Boolean,
    onUnlockWithBiometric: () -> Unit,
    onClearError: () -> Unit
) {
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var localError by remember { mutableStateOf<String?>(null) }
    
    // 同步外部错误
    LaunchedEffect(error) {
        localError = error
    }
    
    // 自动触发生物识别
    LaunchedEffect(biometricAvailable) {
        if (biometricAvailable) {
            onUnlockWithBiometric()
        }
    }
    
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // 锁图标
            Icon(
                Icons.Default.Lock,
                contentDescription = null,
                modifier = Modifier.size(72.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Text(
                "密码库已锁定",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                "请输入密码以访问密码库",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.outline
            )
            
            Spacer(modifier = Modifier.height(32.dp))
            
            // 密码输入框
            OutlinedTextField(
                value = password,
                onValueChange = { 
                    password = it
                    localError = null
                    onClearError()
                },
                label = { Text("密码") },
                singleLine = true,
                visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    IconButton(onClick = { showPassword = !showPassword }) {
                        Icon(
                            if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = null
                        )
                    }
                },
                isError = localError != null,
                supportingText = localError?.let { { Text(it, color = MaterialTheme.colorScheme.error) } },
                modifier = Modifier.fillMaxWidth()
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // 解锁按钮
            Button(
                onClick = {
                    if (password.isBlank()) {
                        localError = "请输入密码"
                    } else {
                        val success = onUnlockWithPassword(password)
                        if (!success) {
                            localError = "密码错误"
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = password.isNotBlank()
            ) {
                Text("解锁")
            }
            
            // 生物识别按钮
            if (biometricAvailable) {
                Spacer(modifier = Modifier.height(16.dp))
                
                OutlinedButton(
                    onClick = onUnlockWithBiometric,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        Icons.Default.Fingerprint,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("使用生物识别")
                }
            }
        }
    }
}
