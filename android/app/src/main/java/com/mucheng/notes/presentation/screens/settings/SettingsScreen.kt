package com.mucheng.notes.presentation.screens.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.mucheng.notes.R
import com.mucheng.notes.presentation.viewmodel.SettingsViewModel

/**
 * 设置主页面 - 显示设置菜单列表
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    navController: NavController,
    bottomPadding: PaddingValues = PaddingValues(),
    viewModel: SettingsViewModel
) {
    val settingsItems = listOf(
        SettingsMenuItem(
            route = "settings/features",
            icon = Icons.Default.Extension,
            title = "功能模块",
            subtitle = "启用或禁用应用功能"
        ),
        SettingsMenuItem(
            route = "settings/sync",
            icon = Icons.Default.Cloud,
            title = stringResource(R.string.settings_sync),
            subtitle = "WebDAV / 自建服务器同步"
        ),
        SettingsMenuItem(
            route = "settings/security",
            icon = Icons.Default.Lock,
            title = stringResource(R.string.settings_security),
            subtitle = "应用锁、密码库锁定"
        ),
        SettingsMenuItem(
            route = "settings/ai",
            icon = Icons.Default.SmartToy,
            title = "AI 设置",
            subtitle = "AI 渠道与模型配置"
        ),
        SettingsMenuItem(
            route = "settings/theme",
            icon = Icons.Default.Palette,
            title = stringResource(R.string.settings_theme),
            subtitle = "深色模式、跟随系统"
        ),
        SettingsMenuItem(
            route = "settings/data",
            icon = Icons.Default.Storage,
            title = "数据管理",
            subtitle = "缓存清理、数据导入导出"
        ),
        SettingsMenuItem(
            route = "settings/about",
            icon = Icons.Default.Info,
            title = stringResource(R.string.settings_about),
            subtitle = "版本信息"
        )
    )
    
    Scaffold(
        topBar = {
            TopAppBar(title = { Text(stringResource(R.string.settings)) })
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(bottom = bottomPadding.calculateBottomPadding()),
            contentPadding = PaddingValues(vertical = 8.dp)
        ) {
            items(settingsItems) { item ->
                SettingsMenuItemRow(
                    item = item,
                    onClick = { navController.navigate(item.route) }
                )
            }
        }
    }
}

data class SettingsMenuItem(
    val route: String,
    val icon: ImageVector,
    val title: String,
    val subtitle: String
)

@Composable
private fun SettingsMenuItemRow(
    item: SettingsMenuItem,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier
                .padding(horizontal = 16.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = item.icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.bodyLarge
                )
                Text(
                    text = item.subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
                )
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outline
            )
        }
    }
    HorizontalDivider(modifier = Modifier.padding(start = 56.dp))
}
