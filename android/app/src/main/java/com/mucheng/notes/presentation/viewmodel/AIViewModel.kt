package com.mucheng.notes.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.payload.AIConversationPayload
import com.mucheng.notes.domain.model.payload.AIMessagePayload
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
 * AI UI 状态
 */
data class AIUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val selectedConversationId: String? = null,
    val isThinking: Boolean = false
)

/**
 * AI 助手视图模型
 */
@HiltViewModel
class AIViewModel @Inject constructor(
    private val itemRepository: ItemRepository
) : ViewModel() {
    
    private val json = Json { 
        ignoreUnknownKeys = true 
        isLenient = true
        coerceInputValues = true
    }
    
    private val _uiState = MutableStateFlow(AIUiState())
    val uiState: StateFlow<AIUiState> = _uiState.asStateFlow()
    
    /**
     * 对话列表（实时流）
     */
    val conversations: StateFlow<List<ConversationItem>> = itemRepository.getByType(ItemType.AI_CONVERSATION)
        .map { items -> items.map { it.toConversationItem() } }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    /**
     * 消息列表（实时流）
     */
    val messages: StateFlow<List<MessageItem>> = itemRepository.getByType(ItemType.AI_MESSAGE)
        .map { items -> items.map { it.toMessageItem() } }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    /**
     * 当前对话的消息
     */
    fun getMessagesForConversation(conversationId: String): List<MessageItem> {
        return messages.value.filter { it.conversationId == conversationId }
            .sortedBy { it.createdAt }
    }
    
    /**
     * 创建新对话
     */
    fun createConversation(
        title: String = "新对话",
        model: String = "gpt-4",
        systemPrompt: String = "",
        temperature: Float = 0.7f,
        maxTokens: Int = 4096
    ) {
        viewModelScope.launch {
            val payload = AIConversationPayload(
                title = title,
                model = model,
                systemPrompt = systemPrompt,
                temperature = temperature,
                maxTokens = maxTokens,
                createdAt = System.currentTimeMillis()
            )
            val item = itemRepository.create(ItemType.AI_CONVERSATION, json.encodeToString(payload))
            _uiState.value = _uiState.value.copy(selectedConversationId = item.id)
        }
    }
    
    /**
     * 选择对话
     */
    fun selectConversation(conversationId: String?) {
        _uiState.value = _uiState.value.copy(selectedConversationId = conversationId)
    }
    
    /**
     * 发送消息
     */
    fun sendMessage(content: String) {
        val conversationId = _uiState.value.selectedConversationId ?: return
        
        viewModelScope.launch {
            // 创建用户消息
            val userPayload = AIMessagePayload(
                conversationId = conversationId,
                role = "user",
                content = content,
                model = "",
                tokensUsed = null,
                createdAt = System.currentTimeMillis()
            )
            itemRepository.create(ItemType.AI_MESSAGE, json.encodeToString(userPayload))
            
            // 标记正在思考
            _uiState.value = _uiState.value.copy(isThinking = true)
            
            // TODO: 调用 AI API 获取响应
            // 这里需要实现 AI API 客户端
            
            // 模拟响应（实际应该调用 API）
            kotlinx.coroutines.delay(1000)
            
            val assistantPayload = AIMessagePayload(
                conversationId = conversationId,
                role = "assistant",
                content = "这是一个模拟响应。实际应用中需要调用 AI API。",
                model = "gpt-4",
                tokensUsed = 50,
                createdAt = System.currentTimeMillis()
            )
            itemRepository.create(ItemType.AI_MESSAGE, json.encodeToString(assistantPayload))
            
            _uiState.value = _uiState.value.copy(isThinking = false)
        }
    }
    
    /**
     * 删除对话
     */
    fun deleteConversation(conversationId: String) {
        viewModelScope.launch {
            // 删除对话
            itemRepository.softDelete(conversationId)
            
            // 删除相关消息
            messages.value
                .filter { it.conversationId == conversationId }
                .forEach { itemRepository.softDelete(it.id) }
            
            // 如果删除的是当前选中的对话，清除选择
            if (_uiState.value.selectedConversationId == conversationId) {
                _uiState.value = _uiState.value.copy(selectedConversationId = null)
            }
        }
    }
    
    /**
     * 更新对话标题
     */
    fun updateConversationTitle(conversationId: String, title: String) {
        viewModelScope.launch {
            val existing = itemRepository.getById(conversationId) ?: return@launch
            val oldPayload = json.decodeFromString<AIConversationPayload>(existing.payload)
            val newPayload = oldPayload.copy(title = title)
            itemRepository.update(conversationId, json.encodeToString(newPayload))
        }
    }
    
    private fun ItemEntity.toConversationItem(): ConversationItem {
        val payload = json.decodeFromString<AIConversationPayload>(this.payload)
        return ConversationItem(
            id = this.id,
            title = payload.title,
            model = payload.model,
            createdAt = payload.createdAt,
            updatedTime = this.updatedTime
        )
    }
    
    private fun ItemEntity.toMessageItem(): MessageItem {
        val payload = json.decodeFromString<AIMessagePayload>(this.payload)
        return MessageItem(
            id = this.id,
            conversationId = payload.conversationId,
            role = payload.role,
            content = payload.content,
            model = payload.model,
            tokensUsed = payload.tokensUsed,
            createdAt = payload.createdAt
        )
    }
}

/**
 * 对话展示模型
 */
data class ConversationItem(
    val id: String,
    val title: String,
    val model: String,
    val createdAt: Long,
    val updatedTime: Long
)

/**
 * 消息展示模型
 */
data class MessageItem(
    val id: String,
    val conversationId: String,
    val role: String,
    val content: String,
    val model: String,
    val tokensUsed: Int?,
    val createdAt: Long
)
