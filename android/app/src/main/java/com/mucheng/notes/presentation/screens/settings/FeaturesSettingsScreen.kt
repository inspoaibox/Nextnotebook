package com.mucheng.notes.presentation.screens.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Notes
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.mucheng.notes.presentation.viewmodel.SettingsViewModel

/**
 * 功能模块设置页面
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeaturesSettingsScreen(
    navController: NavController,
    viewModel: SettingsViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("功能模块") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        }
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
            Text(
                "启用或禁用功能，禁用后底部导航将隐藏对应入口",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
                modifier = Modifier.padding(bottom = 16.dp)
            )
            
            FeatureSwitch(
                title = "笔记",
                subtitle = "笔记、文件夹、标签、附件（核心功能）",
                icon = Icons.AutoMirrored.Filled.Notes,
                checked = true,
                onCheckedChange = { },
                enabled = false
            )
            
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            
            FeatureSwitch(
                title = "书签",
                subtitle = "网页书签收藏，支持多级目录",
                icon = Icons.Default.Bookmark,
                checked = uiState.bookmarksEnabled,
                onCheckedChange = { viewModel.setBookmarksEnabled(it) }
            )
            
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            
            FeatureSwitch(
                title = "待办",
                subtitle = "四象限待办事项，支持提醒",
                icon = Icons.Default.CheckCircle,
                checked = uiState.todosEnabled,
                onCheckedChange = { viewModel.setTodosEnabled(it) }
            )
            
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            
            FeatureSwitch(
                title = "密码库",
                subtitle = "安全存储密码、银行卡、TOTP 验证码",
                icon = Icons.Default.Lock,
                checked = uiState.vaultEnabled,
                onCheckedChange = { viewModel.setVaultEnabled(it) }
            )
            
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            
            FeatureSwitch(
                title = "AI 助手",
                subtitle = "接入 AI 模型进行对话",
                icon = Icons.Default.SmartToy,
                checked = uiState.aiEnabled,
                onCheckedChange = { viewModel.setAiEnabled(it) }
            )
        }
    }
}

@Composable
private fun FeatureSwitch(
    title: String,
    subtitle: String,
    icon: ImageVector,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled) { onCheckedChange(!checked) }
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = if (enabled && checked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(16.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled
        )
    }
}
