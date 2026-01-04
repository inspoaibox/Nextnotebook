package com.mucheng.notes.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.payload.TodoPayload
import com.mucheng.notes.domain.model.payload.TodoQuadrant
import com.mucheng.notes.domain.repository.ItemRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject

/**
 * 待办 UI 状态
 */
data class TodosUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val showCompleted: Boolean = false
)

/**
 * 待办事项视图模型
 */
@HiltViewModel
class TodosViewModel @Inject constructor(
    private val itemRepository: ItemRepository
) : ViewModel() {
    
    private val json = Json { 
        ignoreUnknownKeys = true 
        isLenient = true
        coerceInputValues = true
    }
    
    private val _uiState = MutableStateFlow(TodosUiState())
    val uiState: StateFlow<TodosUiState> = _uiState.asStateFlow()
    
    /**
     * 待办列表（实时流）
     */
    val todos: StateFlow<List<TodoItem>> = itemRepository.getByType(ItemType.TODO)
        .map { items -> items.map { it.toTodoItem() } }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    /**
     * 按象限分组的待办
     */
    val todosByQuadrant: StateFlow<Map<TodoQuadrant, List<TodoItem>>> = todos
        .map { list -> list.groupBy { it.quadrant } }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyMap())
    
    /**
     * 创建待办
     */
    fun createTodo(
        title: String,
        description: String = "",
        quadrant: TodoQuadrant = TodoQuadrant.NOT_URGENT_NOT_IMPORTANT,
        dueDate: Long? = null,
        reminderTime: Long? = null
    ) {
        viewModelScope.launch {
            val payload = TodoPayload(
                title = title,
                description = description,
                quadrant = quadrant,
                completed = false,
                completedAt = null,
                dueDate = dueDate,
                reminderTime = reminderTime,
                reminderEnabled = reminderTime != null,
                priority = 0,
                tags = emptyList()
            )
            itemRepository.create(ItemType.TODO, json.encodeToString(payload))
        }
    }
    
    /**
     * 更新待办
     */
    fun updateTodo(id: String, title: String, description: String, quadrant: TodoQuadrant? = null) {
        viewModelScope.launch {
            val existing = itemRepository.getById(id) ?: return@launch
            val oldPayload = json.decodeFromString<TodoPayload>(existing.payload)
            val newPayload = oldPayload.copy(
                title = title, 
                description = description,
                quadrant = quadrant ?: oldPayload.quadrant
            )
            itemRepository.update(id, json.encodeToString(newPayload))
        }
    }
    
    /**
     * 完整更新待办（包括到期时间和提醒）
     */
    fun updateTodoFull(
        id: String, 
        title: String, 
        description: String, 
        quadrant: TodoQuadrant,
        dueDate: Long?,
        reminderTime: Long?
    ) {
        viewModelScope.launch {
            val existing = itemRepository.getById(id) ?: return@launch
            val oldPayload = json.decodeFromString<TodoPayload>(existing.payload)
            val newPayload = oldPayload.copy(
                title = title, 
                description = description,
                quadrant = quadrant,
                dueDate = dueDate,
                reminderTime = reminderTime,
                reminderEnabled = reminderTime != null
            )
            itemRepository.update(id, json.encodeToString(newPayload))
        }
    }
    
    /**
     * 切换完成状态
     */
    fun toggleCompleted(id: String) {
        viewModelScope.launch {
            val existing = itemRepository.getById(id) ?: return@launch
            val oldPayload = json.decodeFromString<TodoPayload>(existing.payload)
            val newPayload = oldPayload.copy(
                completed = !oldPayload.completed,
                completedAt = if (!oldPayload.completed) System.currentTimeMillis() else null
            )
            itemRepository.update(id, json.encodeToString(newPayload))
        }
    }
    
    /**
     * 更改象限
     */
    fun changeQuadrant(id: String, quadrant: TodoQuadrant) {
        viewModelScope.launch {
            val existing = itemRepository.getById(id) ?: return@launch
            val oldPayload = json.decodeFromString<TodoPayload>(existing.payload)
            val newPayload = oldPayload.copy(quadrant = quadrant)
            itemRepository.update(id, json.encodeToString(newPayload))
        }
    }
    
    /**
     * 删除待办
     */
    fun deleteTodo(id: String) {
        viewModelScope.launch {
            itemRepository.softDelete(id)
        }
    }
    
    /**
     * 设置提醒
     */
    fun setReminder(id: String, reminderTime: Long?) {
        viewModelScope.launch {
            val existing = itemRepository.getById(id) ?: return@launch
            val oldPayload = json.decodeFromString<TodoPayload>(existing.payload)
            val newPayload = oldPayload.copy(
                reminderTime = reminderTime,
                reminderEnabled = reminderTime != null
            )
            itemRepository.update(id, json.encodeToString(newPayload))
        }
    }
    
    /**
     * 切换显示已完成
     */
    fun toggleShowCompleted() {
        _uiState.value = _uiState.value.copy(showCompleted = !_uiState.value.showCompleted)
    }
    
    private fun ItemEntity.toTodoItem(): TodoItem {
        val payload = json.decodeFromString<TodoPayload>(this.payload)
        return TodoItem(
            id = this.id,
            title = payload.title,
            description = payload.description,
            quadrant = payload.quadrant,
            completed = payload.completed,
            completedAt = payload.completedAt,
            dueDate = payload.dueDate,
            reminderTime = payload.reminderTime,
            reminderEnabled = payload.reminderEnabled,
            priority = payload.priority,
            tags = payload.tags,
            updatedTime = this.updatedTime
        )
    }
}

/**
 * 待办展示模型
 */
data class TodoItem(
    val id: String,
    val title: String,
    val description: String,
    val quadrant: TodoQuadrant,
    val completed: Boolean,
    val completedAt: Long?,
    val dueDate: Long?,
    val reminderTime: Long?,
    val reminderEnabled: Boolean,
    val priority: Int,
    val tags: List<String>,
    val updatedTime: Long
)
