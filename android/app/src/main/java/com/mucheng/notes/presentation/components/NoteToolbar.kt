package com.mucheng.notes.presentation.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.FormatBold
import androidx.compose.material.icons.filled.FormatItalic
import androidx.compose.material.icons.filled.FormatListBulleted
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.filled.FormatStrikethrough
import androidx.compose.material.icons.filled.FormatUnderlined
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Title
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp


/**
 * 笔记编辑器工具栏
 * 提供 Markdown 格式化和插入功能
 */
@Composable
fun NoteToolbar(
    onBoldClick: () -> Unit,
    onItalicClick: () -> Unit,
    onUnderlineClick: () -> Unit,
    onStrikethroughClick: () -> Unit,
    onH1Click: () -> Unit,
    onH2Click: () -> Unit,
    onH3Click: () -> Unit,
    onBulletListClick: () -> Unit,
    onNumberListClick: () -> Unit,
    onCheckboxClick: () -> Unit,
    onQuoteClick: () -> Unit,
    onCodeClick: () -> Unit,
    onLinkClick: () -> Unit,
    onImageClick: () -> Unit,
    onAttachmentClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        tonalElevation = 2.dp,
        shadowElevation = 2.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // 格式化按钮组
            ToolbarIconButton(
                icon = Icons.Default.FormatBold,
                contentDescription = "粗体",
                onClick = onBoldClick
            )
            ToolbarIconButton(
                icon = Icons.Default.FormatItalic,
                contentDescription = "斜体",
                onClick = onItalicClick
            )
            ToolbarIconButton(
                icon = Icons.Default.FormatUnderlined,
                contentDescription = "下划线",
                onClick = onUnderlineClick
            )
            ToolbarIconButton(
                icon = Icons.Default.FormatStrikethrough,
                contentDescription = "删除线",
                onClick = onStrikethroughClick
            )
            
            ToolbarDivider()
            
            // 标题按钮组
            ToolbarTextButton(text = "H1", onClick = onH1Click)
            ToolbarTextButton(text = "H2", onClick = onH2Click)
            ToolbarTextButton(text = "H3", onClick = onH3Click)
            
            ToolbarDivider()
            
            // 列表按钮组
            ToolbarIconButton(
                icon = Icons.Default.FormatListBulleted,
                contentDescription = "无序列表",
                onClick = onBulletListClick
            )
            ToolbarIconButton(
                icon = Icons.Default.FormatListNumbered,
                contentDescription = "有序列表",
                onClick = onNumberListClick
            )
            ToolbarIconButton(
                icon = Icons.Default.Checklist,
                contentDescription = "复选框",
                onClick = onCheckboxClick
            )
            
            ToolbarDivider()
            
            // 其他格式
            ToolbarIconButton(
                icon = Icons.Default.FormatQuote,
                contentDescription = "引用",
                onClick = onQuoteClick
            )
            ToolbarIconButton(
                icon = Icons.Default.Code,
                contentDescription = "代码",
                onClick = onCodeClick
            )
            ToolbarIconButton(
                icon = Icons.Default.Link,
                contentDescription = "链接",
                onClick = onLinkClick
            )
            
            ToolbarDivider()
            
            // 插入按钮组
            ToolbarIconButton(
                icon = Icons.Default.Image,
                contentDescription = "插入图片",
                onClick = onImageClick
            )
            ToolbarIconButton(
                icon = Icons.Default.AttachFile,
                contentDescription = "插入附件",
                onClick = onAttachmentClick
            )
        }
    }
}

@Composable
private fun ToolbarIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit
) {
    IconButton(
        onClick = onClick,
        modifier = Modifier.size(40.dp),
        colors = IconButtonDefaults.iconButtonColors(
            contentColor = MaterialTheme.colorScheme.onSurface
        )
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(20.dp)
        )
    }
}

@Composable
private fun ToolbarTextButton(
    text: String,
    onClick: () -> Unit
) {
    IconButton(
        onClick = onClick,
        modifier = Modifier.size(40.dp),
        colors = IconButtonDefaults.iconButtonColors(
            contentColor = MaterialTheme.colorScheme.onSurface
        )
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun ToolbarDivider() {
    Spacer(modifier = Modifier.width(4.dp))
    HorizontalDivider(
        modifier = Modifier
            .height(24.dp)
            .width(1.dp),
        color = MaterialTheme.colorScheme.outlineVariant
    )
    Spacer(modifier = Modifier.width(4.dp))
}