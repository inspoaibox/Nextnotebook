package com.mucheng.notes.presentation.screens.todos

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.mucheng.notes.R
import com.mucheng.notes.domain.model.payload.TodoQuadrant
import com.mucheng.notes.presentation.viewmodel.TodoItem
import com.mucheng.notes.presentation.viewmodel.TodosViewModel
import java.text.SimpleDateFormat
import java.util.*

/**
 * 待办事项页面 - 按象限分组显示
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodosScreen(
    navController: NavController,
    bottomPadding: PaddingValues = PaddingValues(),
    viewModel: TodosViewModel = hiltViewModel()
) {
    val todosByQuadrant by viewModel.todosByQuadrant.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    
    var showAddDialog by remember { mutableStateOf(false) }
    var showEditDialog by remember { mutableStateOf(false) }
    var selectedTodo by remember { mutableStateOf<TodoItem?>(null) }
    var showCompletedSection by remember { mutableStateOf(false) }
    
    // 各象限展开状态
    var expandedQuadrants by remember { 
        mutableStateOf(setOf(
            TodoQuadrant.URGENT_IMPORTANT,
            TodoQuadrant.NOT_URGENT_IMPORTANT,
            TodoQuadrant.URGENT_NOT_IMPORTANT,
            TodoQuadrant.NOT_URGENT_NOT_IMPORTANT
        )) 
    }
    
    // 所有待办
    val allTodos = todosByQuadrant.values.flatten()
    val completedTodos = allTodos.filter { it.completed }
    
    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                modifier = Modifier.padding(bottom = bottomPadding.calculateBottomPadding()),
                containerColor = MaterialTheme.colorScheme.primary
            ) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.add))
            }
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(bottom = bottomPadding.calculateBottomPadding()),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 紧急重要
            item {
                QuadrantSection(
                    quadrant = TodoQuadrant.URGENT_IMPORTANT,
                    title = "紧急重要",
                    color = MaterialTheme.colorScheme.error,
                    todos = todosByQuadrant[TodoQuadrant.URGENT_IMPORTANT]?.filter { !it.completed } ?: emptyList(),
                    expanded = TodoQuadrant.URGENT_IMPORTANT in expandedQuadrants,
                    onToggleExpand = {
                        expandedQuadrants = if (TodoQuadrant.URGENT_IMPORTANT in expandedQuadrants) {
                            expandedQuadrants - TodoQuadrant.URGENT_IMPORTANT
                        } else {
                            expandedQuadrants + TodoQuadrant.URGENT_IMPORTANT
                        }
                    },
                    onTodoClick = { todo ->
                        selectedTodo = todo
                        showEditDialog = true
                    },
                    onToggleComplete = { viewModel.toggleCompleted(it.id) },
                    onDelete = { viewModel.deleteTodo(it.id) }
                )
            }
            
            // 重要不紧急
            item {
                QuadrantSection(
                    quadrant = TodoQuadrant.NOT_URGENT_IMPORTANT,
                    title = "重要不紧急",
                    color = MaterialTheme.colorScheme.primary,
                    todos = todosByQuadrant[TodoQuadrant.NOT_URGENT_IMPORTANT]?.filter { !it.completed } ?: emptyList(),
                    expanded = TodoQuadrant.NOT_URGENT_IMPORTANT in expandedQuadrants,
                    onToggleExpand = {
                        expandedQuadrants = if (TodoQuadrant.NOT_URGENT_IMPORTANT in expandedQuadrants) {
                            expandedQuadrants - TodoQuadrant.NOT_URGENT_IMPORTANT
                        } else {
                            expandedQuadrants + TodoQuadrant.NOT_URGENT_IMPORTANT
                        }
                    },
                    onTodoClick = { todo ->
                        selectedTodo = todo
                        showEditDialog = true
                    },
                    onToggleComplete = { viewModel.toggleCompleted(it.id) },
                    onDelete = { viewModel.deleteTodo(it.id) }
                )
            }
            
            // 紧急不重要
            item {
                QuadrantSection(
                    quadrant = TodoQuadrant.URGENT_NOT_IMPORTANT,
                    title = "紧急不重要",
                    color = MaterialTheme.colorScheme.tertiary,
                    todos = todosByQuadrant[TodoQuadrant.URGENT_NOT_IMPORTANT]?.filter { !it.completed } ?: emptyList(),
                    expanded = TodoQuadrant.URGENT_NOT_IMPORTANT in expandedQuadrants,
                    onToggleExpand = {
                        expandedQuadrants = if (TodoQuadrant.URGENT_NOT_IMPORTANT in expandedQuadrants) {
                            expandedQuadrants - TodoQuadrant.URGENT_NOT_IMPORTANT
                        } else {
                            expandedQuadrants + TodoQuadrant.URGENT_NOT_IMPORTANT
                        }
                    },
                    onTodoClick = { todo ->
                        selectedTodo = todo
                        showEditDialog = true
                    },
                    onToggleComplete = { viewModel.toggleCompleted(it.id) },
                    onDelete = { viewModel.deleteTodo(it.id) }
                )
            }
            
            // 不紧急不重要
            item {
                QuadrantSection(
                    quadrant = TodoQuadrant.NOT_URGENT_NOT_IMPORTANT,
                    title = "不紧急不重要",
                    color = MaterialTheme.colorScheme.outline,
                    todos = todosByQuadrant[TodoQuadrant.NOT_URGENT_NOT_IMPORTANT]?.filter { !it.completed } ?: emptyList(),
                    expanded = TodoQuadrant.NOT_URGENT_NOT_IMPORTANT in expandedQuadrants,
                    onToggleExpand = {
                        expandedQuadrants = if (TodoQuadrant.NOT_URGENT_NOT_IMPORTANT in expandedQuadrants) {
                            expandedQuadrants - TodoQuadrant.NOT_URGENT_NOT_IMPORTANT
                        } else {
                            expandedQuadrants + TodoQuadrant.NOT_URGENT_NOT_IMPORTANT
                        }
                    },
                    onTodoClick = { todo ->
                        selectedTodo = todo
                        showEditDialog = true
                    },
                    onToggleComplete = { viewModel.toggleCompleted(it.id) },
                    onDelete = { viewModel.deleteTodo(it.id) }
                )
            }
            
            // 已完成
            if (completedTodos.isNotEmpty()) {
                item {
                    CompletedSection(
                        todos = completedTodos,
                        expanded = showCompletedSection,
                        onToggleExpand = { showCompletedSection = !showCompletedSection },
                        onTodoClick = { todo ->
                            selectedTodo = todo
                            showEditDialog = true
                        },
                        onToggleComplete = { viewModel.toggleCompleted(it.id) },
                        onDelete = { viewModel.deleteTodo(it.id) }
                    )
                }
            }
            
            // 底部间距
            item { Spacer(modifier = Modifier.height(80.dp)) }
        }
    }
    
    // 添加待办对话框
    if (showAddDialog) {
        AddEditTodoDialog(
            title = "添加待办",
            initialTitle = "",
            initialDescription = "",
            initialQuadrant = TodoQuadrant.URGENT_IMPORTANT,
            initialDueDate = null,
            initialReminderTime = null,
            onDismiss = { showAddDialog = false },
            onConfirm = { todoTitle, description, quadrant, dueDate, reminderTime ->
                viewModel.createTodo(todoTitle, description, quadrant, dueDate, reminderTime)
                showAddDialog = false
            }
        )
    }
    
    // 编辑待办对话框
    if (showEditDialog && selectedTodo != null) {
        AddEditTodoDialog(
            title = "编辑待办",
            initialTitle = selectedTodo!!.title,
            initialDescription = selectedTodo!!.description,
            initialQuadrant = selectedTodo!!.quadrant,
            initialDueDate = selectedTodo!!.dueDate,
            initialReminderTime = selectedTodo!!.reminderTime,
            onDismiss = { 
                showEditDialog = false
                selectedTodo = null
            },
            onConfirm = { todoTitle, description, quadrant, dueDate, reminderTime ->
                viewModel.updateTodoFull(
                    selectedTodo!!.id, 
                    todoTitle, 
                    description, 
                    quadrant,
                    dueDate,
                    reminderTime
                )
                showEditDialog = false
                selectedTodo = null
            }
        )
    }
}

/**
 * 象限分组
 */
@Composable
private fun QuadrantSection(
    quadrant: TodoQuadrant,
    title: String,
    color: Color,
    todos: List<TodoItem>,
    expanded: Boolean,
    onToggleExpand: () -> Unit,
    onTodoClick: (TodoItem) -> Unit,
    onToggleComplete: (TodoItem) -> Unit,
    onDelete: (TodoItem) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = color.copy(alpha = 0.05f)
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column {
            // 标题栏
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggleExpand)
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .background(color, CircleShape)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = color
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "(${todos.size})",
                    style = MaterialTheme.typography.bodyMedium,
                    color = color.copy(alpha = 0.7f)
                )
                Spacer(modifier = Modifier.weight(1f))
                Icon(
                    imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = color
                )
            }
            
            // 待办列表
            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (todos.isEmpty()) {
                        Text(
                            text = "暂无待办",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.outline,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    } else {
                        todos.forEach { todo ->
                            TodoItemCard(
                                todo = todo,
                                quadrantColor = color,
                                onClick = { onTodoClick(todo) },
                                onToggleComplete = { onToggleComplete(todo) },
                                onDelete = { onDelete(todo) }
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * 已完成分组
 */
@Composable
private fun CompletedSection(
    todos: List<TodoItem>,
    expanded: Boolean,
    onToggleExpand: () -> Unit,
    onTodoClick: (TodoItem) -> Unit,
    onToggleComplete: (TodoItem) -> Unit,
    onDelete: (TodoItem) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggleExpand)
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "已完成",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.outline
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "(${todos.size})",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.7f)
                )
                Spacer(modifier = Modifier.weight(1f))
                Icon(
                    imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.outline
                )
            }
            
            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    todos.forEach { todo ->
                        TodoItemCard(
                            todo = todo,
                            quadrantColor = MaterialTheme.colorScheme.outline,
                            onClick = { onTodoClick(todo) },
                            onToggleComplete = { onToggleComplete(todo) },
                            onDelete = { onDelete(todo) }
                        )
                    }
                }
            }
        }
    }
}


/**
 * 待办卡片
 */
@Composable
private fun TodoItemCard(
    todo: TodoItem,
    quadrantColor: Color,
    onClick: () -> Unit,
    onToggleComplete: () -> Unit,
    onDelete: () -> Unit
) {
    val dateFormat = remember { SimpleDateFormat("MM-dd HH:mm", Locale.getDefault()) }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = if (todo.completed) 
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
            else 
                MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = if (todo.completed) 0.dp else 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            // 完成按钮
            IconButton(
                onClick = onToggleComplete,
                modifier = Modifier.size(32.dp)
            ) {
                Icon(
                    imageVector = if (todo.completed) Icons.Filled.CheckCircle else Icons.Outlined.RadioButtonUnchecked,
                    contentDescription = null,
                    tint = if (todo.completed) MaterialTheme.colorScheme.primary else quadrantColor,
                    modifier = Modifier.size(24.dp)
                )
            }
            
            Spacer(modifier = Modifier.width(8.dp))
            
            // 内容
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = todo.title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (todo.completed) FontWeight.Normal else FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    textDecoration = if (todo.completed) TextDecoration.LineThrough else TextDecoration.None,
                    color = if (todo.completed) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.onSurface
                )
                
                if (todo.description.isNotBlank()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = todo.description,
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                
                // 到期时间和提醒
                if (todo.dueDate != null || todo.reminderTime != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // 到期时间
                        if (todo.dueDate != null) {
                            val isOverdue = !todo.completed && todo.dueDate < System.currentTimeMillis()
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Outlined.Event,
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp),
                                    tint = if (isOverdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outline
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = dateFormat.format(Date(todo.dueDate)),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (isOverdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outline
                                )
                            }
                        }
                        
                        // 提醒时间
                        if (todo.reminderTime != null && todo.reminderEnabled) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Outlined.Notifications,
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp),
                                    tint = MaterialTheme.colorScheme.tertiary
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = dateFormat.format(Date(todo.reminderTime)),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.tertiary
                                )
                            }
                        }
                    }
                }
            }
            
            // 删除按钮
            IconButton(
                onClick = onDelete,
                modifier = Modifier.size(32.dp)
            ) {
                Icon(
                    Icons.Outlined.Delete,
                    contentDescription = "删除",
                    tint = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

/**
 * 添加/编辑待办对话框
 */
@Composable
private fun AddEditTodoDialog(
    title: String,
    initialTitle: String,
    initialDescription: String,
    initialQuadrant: TodoQuadrant,
    initialDueDate: Long?,
    initialReminderTime: Long?,
    onDismiss: () -> Unit,
    onConfirm: (title: String, description: String, quadrant: TodoQuadrant, dueDate: Long?, reminderTime: Long?) -> Unit
) {
    val context = LocalContext.current
    val dateFormat = remember { SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()) }
    val calendar = remember { Calendar.getInstance() }
    
    var todoTitle by remember { mutableStateOf(initialTitle) }
    var description by remember { mutableStateOf(initialDescription) }
    var selectedQuadrant by remember { mutableStateOf(initialQuadrant) }
    var dueDate by remember { mutableStateOf(initialDueDate) }
    var reminderTime by remember { mutableStateOf(initialReminderTime) }
    
    // 日期选择器
    fun showDateTimePicker(onSelected: (Long) -> Unit) {
        val cal = Calendar.getInstance()
        DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                cal.set(year, month, dayOfMonth)
                TimePickerDialog(
                    context,
                    { _, hourOfDay, minute ->
                        cal.set(Calendar.HOUR_OF_DAY, hourOfDay)
                        cal.set(Calendar.MINUTE, minute)
                        cal.set(Calendar.SECOND, 0)
                        onSelected(cal.timeInMillis)
                    },
                    cal.get(Calendar.HOUR_OF_DAY),
                    cal.get(Calendar.MINUTE),
                    true
                ).show()
            },
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH),
            cal.get(Calendar.DAY_OF_MONTH)
        ).show()
    }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                OutlinedTextField(
                    value = todoTitle,
                    onValueChange = { todoTitle = it },
                    label = { Text("标题") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("描述（可选）") },
                    maxLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
                
                // 象限选择
                Text(
                    "选择象限",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary
                )
                
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        QuadrantSelectChip(
                            label = "紧急重要",
                            color = MaterialTheme.colorScheme.error,
                            selected = selectedQuadrant == TodoQuadrant.URGENT_IMPORTANT,
                            onClick = { selectedQuadrant = TodoQuadrant.URGENT_IMPORTANT },
                            modifier = Modifier.weight(1f)
                        )
                        QuadrantSelectChip(
                            label = "重要不紧急",
                            color = MaterialTheme.colorScheme.primary,
                            selected = selectedQuadrant == TodoQuadrant.NOT_URGENT_IMPORTANT,
                            onClick = { selectedQuadrant = TodoQuadrant.NOT_URGENT_IMPORTANT },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        QuadrantSelectChip(
                            label = "紧急不重要",
                            color = MaterialTheme.colorScheme.tertiary,
                            selected = selectedQuadrant == TodoQuadrant.URGENT_NOT_IMPORTANT,
                            onClick = { selectedQuadrant = TodoQuadrant.URGENT_NOT_IMPORTANT },
                            modifier = Modifier.weight(1f)
                        )
                        QuadrantSelectChip(
                            label = "不紧急不重要",
                            color = MaterialTheme.colorScheme.outline,
                            selected = selectedQuadrant == TodoQuadrant.NOT_URGENT_NOT_IMPORTANT,
                            onClick = { selectedQuadrant = TodoQuadrant.NOT_URGENT_NOT_IMPORTANT },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
                
                HorizontalDivider()
                
                // 到期时间
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showDateTimePicker { dueDate = it } }
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Outlined.Event,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("到期时间", style = MaterialTheme.typography.bodyMedium)
                        Text(
                            text = dueDate?.let { dateFormat.format(Date(it)) } ?: "未设置",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                    if (dueDate != null) {
                        IconButton(onClick = { dueDate = null }) {
                            Icon(Icons.Default.Close, contentDescription = "清除", modifier = Modifier.size(20.dp))
                        }
                    }
                }
                
                // 提醒时间
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showDateTimePicker { reminderTime = it } }
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Outlined.Notifications,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.tertiary
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("提醒时间", style = MaterialTheme.typography.bodyMedium)
                        Text(
                            text = reminderTime?.let { dateFormat.format(Date(it)) } ?: "未设置",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                    if (reminderTime != null) {
                        IconButton(onClick = { reminderTime = null }) {
                            Icon(Icons.Default.Close, contentDescription = "清除", modifier = Modifier.size(20.dp))
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(todoTitle, description, selectedQuadrant, dueDate, reminderTime) },
                enabled = todoTitle.isNotBlank()
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

@Composable
private fun QuadrantSelectChip(
    label: String,
    color: Color,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
        color = if (selected) color.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            if (selected) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = if (selected) color else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
