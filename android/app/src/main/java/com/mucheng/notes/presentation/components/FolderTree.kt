package com.mucheng.notes.presentation.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp

/**
 * 文件夹数据模型
 */
data class FolderItem(
    val id: String,
    val name: String,
    val parentId: String?,
    val itemCount: Int = 0
)

/**
 * 文件夹树组件
 */
@Composable
fun FolderTree(
    folders: List<FolderItem>,
    selectedFolderId: String?,
    onFolderSelect: (String?) -> Unit,
    onCreateFolder: (String?) -> Unit,
    onEditFolder: ((String) -> Unit)? = null,
    onDeleteFolder: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier,
    showAllOption: Boolean = true,
    allOptionLabel: String = "全部"
) {
    val rootFolders = folders.filter { it.parentId == null }
    
    Column(modifier = modifier) {
        // "全部" 选项
        if (showAllOption) {
            FolderTreeItem(
                name = allOptionLabel,
                isSelected = selectedFolderId == null,
                isExpanded = false,
                hasChildren = false,
                level = 0,
                onClick = { onFolderSelect(null) },
                onExpandToggle = {},
                onEdit = null,
                onDelete = null,
                onAddSubfolder = null
            )
        }
        
        // 文件夹列表
        rootFolders.forEach { folder ->
            FolderTreeNode(
                folder = folder,
                allFolders = folders,
                selectedFolderId = selectedFolderId,
                onFolderSelect = onFolderSelect,
                onCreateFolder = onCreateFolder,
                onEditFolder = onEditFolder,
                onDeleteFolder = onDeleteFolder,
                level = 0
            )
        }
        
        // 添加文件夹按钮
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onCreateFolder(null) }
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Add,
                contentDescription = "新建文件夹",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "新建文件夹",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@Composable
private fun FolderTreeNode(
    folder: FolderItem,
    allFolders: List<FolderItem>,
    selectedFolderId: String?,
    onFolderSelect: (String?) -> Unit,
    onCreateFolder: (String?) -> Unit,
    onEditFolder: ((String) -> Unit)?,
    onDeleteFolder: ((String) -> Unit)?,
    level: Int
) {
    var isExpanded by remember { mutableStateOf(false) }
    val children = allFolders.filter { it.parentId == folder.id }
    val hasChildren = children.isNotEmpty()
    
    Column {
        FolderTreeItem(
            name = folder.name,
            itemCount = folder.itemCount,
            isSelected = selectedFolderId == folder.id,
            isExpanded = isExpanded,
            hasChildren = hasChildren,
            level = level,
            onClick = { onFolderSelect(folder.id) },
            onExpandToggle = { isExpanded = !isExpanded },
            onEdit = onEditFolder?.let { { it(folder.id) } },
            onDelete = onDeleteFolder?.let { { it(folder.id) } },
            onAddSubfolder = { onCreateFolder(folder.id) }
        )
        
        AnimatedVisibility(
            visible = isExpanded && hasChildren,
            enter = expandVertically(),
            exit = shrinkVertically()
        ) {
            Column {
                children.forEach { child ->
                    FolderTreeNode(
                        folder = child,
                        allFolders = allFolders,
                        selectedFolderId = selectedFolderId,
                        onFolderSelect = onFolderSelect,
                        onCreateFolder = onCreateFolder,
                        onEditFolder = onEditFolder,
                        onDeleteFolder = onDeleteFolder,
                        level = level + 1
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FolderTreeItem(
    name: String,
    itemCount: Int = 0,
    isSelected: Boolean,
    isExpanded: Boolean,
    hasChildren: Boolean,
    level: Int,
    onClick: () -> Unit,
    onExpandToggle: () -> Unit,
    onEdit: (() -> Unit)?,
    onDelete: (() -> Unit)?,
    onAddSubfolder: (() -> Unit)?
) {
    var showMenu by remember { mutableStateOf(false) }
    
    val backgroundColor = if (isSelected) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.surface
    }
    
    Box {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = (level * 16).dp)
                .clip(RoundedCornerShape(8.dp))
                .background(backgroundColor)
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = {
                        if (onEdit != null || onDelete != null || onAddSubfolder != null) {
                            showMenu = true
                        }
                    }
                )
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // 展开/折叠图标
            if (hasChildren) {
                Icon(
                    imageVector = if (isExpanded) Icons.Default.ExpandMore else Icons.Default.ChevronRight,
                    contentDescription = if (isExpanded) "折叠" else "展开",
                    modifier = Modifier
                        .size(20.dp)
                        .clickable { onExpandToggle() },
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                Spacer(modifier = Modifier.width(20.dp))
            }
            
            Spacer(modifier = Modifier.width(4.dp))
            
            // 文件夹图标
            Icon(
                imageVector = if (isExpanded) Icons.Default.FolderOpen else Icons.Default.Folder,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.width(8.dp))
            
            // 文件夹名称
            Text(
                text = name,
                style = MaterialTheme.typography.bodyMedium,
                color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            
            // 项目数量
            if (itemCount > 0) {
                Text(
                    text = itemCount.toString(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
                )
            }
        }
        
        // 长按菜单
        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            offset = DpOffset(x = 100.dp, y = 0.dp)
        ) {
            if (onAddSubfolder != null) {
                DropdownMenuItem(
                    text = { Text("添加子文件夹") },
                    onClick = {
                        showMenu = false
                        onAddSubfolder()
                    },
                    leadingIcon = {
                        Icon(Icons.Default.CreateNewFolder, contentDescription = null)
                    }
                )
            }
            if (onEdit != null) {
                DropdownMenuItem(
                    text = { Text("重命名") },
                    onClick = {
                        showMenu = false
                        onEdit()
                    },
                    leadingIcon = {
                        Icon(Icons.Default.Edit, contentDescription = null)
                    }
                )
            }
            if (onDelete != null) {
                DropdownMenuItem(
                    text = { Text("删除", color = MaterialTheme.colorScheme.error) },
                    onClick = {
                        showMenu = false
                        onDelete()
                    },
                    leadingIcon = {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error
                        )
                    }
                )
            }
        }
    }
}
