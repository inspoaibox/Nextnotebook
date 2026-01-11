package com.mucheng.notes.presentation.viewmodel

import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.data.remote.AIApiClient
import com.mucheng.notes.data.remote.ChatMessage
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.payload.AIConversationPayload
import com.mucheng.notes.domain.model.payload.AIMessagePayload
import com.mucheng.notes.domain.repository.ItemRepository
import com.mucheng.notes.presentation.screens.settings.AIChannel
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
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

data class AIUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val selectedConversationId: String? = null,
    val isThinking: Boolean = false,
    val streamingMessageId: String? = null,
    val streamingContent: String = ""
)

data class ConversationItem(
    val id: String,
    val title: String,
    val model: String,
    val systemPrompt: String,
    val temperature: Float,
    val maxTokens: Int,
    val createdAt: Long
)

data class MessageItem(
    val id: String,
    val conversationId: String,
    val role: String,
    val content: String,
    val model: String,
    val tokensUsed: Int?,
    val createdAt: Long
)

@HiltViewModel
class AIViewModel @Inject constructor(
    private val itemRepository: ItemRepository,
    private val aiApiClient: AIApiClient,
    @ApplicationContext private val context: Context
) : ViewModel() {
    
    private val json = Json { 
        ignoreUnknownKeys = true 
        isLenient = true
        coerceInputValues = true
        encodeDefaults = true
    }
    
    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)
    }
    
    private val _uiState = MutableStateFlow(AIUiState())
    val uiState: StateFlow<AIUiState> = _uiState.asStateFlow()
    
    val conversations: StateFlow<List<ConversationItem>> = itemRepository.getByType(ItemType.AI_CONVERSATION)
        .map { items -> items.mapNotNull { it.toConversationItem() } }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    val messages: StateFlow<List<MessageItem>> = itemRepository.getByType(ItemType.AI_MESSAGE)
        .map { items -> items.mapNotNull { it.toMessageItem() } }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    private fun getUserChannels(): List<AIChannel> {
        val channelsJson = prefs.getString("ai_channels_json", "") ?: ""
        return if (channelsJson.isNotBlank()) {
            try {
                json.decodeFromString<List<AIChannel>>(channelsJson).filter { it.enabled && it.apiKey.isNotBlank() }
            } catch (e: Exception) { emptyList() }
        } else emptyList()
    }
    
    private fun findChannelForModel(modelId: String): AIChannel? {
        return getUserChannels().find { channel -> channel.models.any { it.id == modelId } }
    }
    
    fun createConversation(title: String = "新对话", model: String = "gpt-4", systemPrompt: String = "", temperature: Float = 0.7f, maxTokens: Int = 4096) {
        viewModelScope.launch {
            try {
                val payload = AIConversationPayload(title = title, model = model, systemPrompt = systemPrompt, temperature = temperature, maxTokens = maxTokens, createdAt = System.currentTimeMillis())
                val item = itemRepository.create(ItemType.AI_CONVERSATION, json.encodeToString(payload))
                _uiState.value = _uiState.value.copy(selectedConversationId = item.id, error = null)
            } catch (e: Exception) {
                e.printStackTrace()
                _uiState.value = _uiState.value.copy(error = "创建对话失败: ${e.message}")
            }
        }
    }
    
    fun selectConversation(conversationId: String?) {
        _uiState.value = _uiState.value.copy(selectedConversationId = conversationId)
    }
    
    fun sendMessageWithSettings(content: String, modelId: String, systemPrompt: String, temperature: Float, maxTokens: Int) {
        val conversationId = _uiState.value.selectedConversationId ?: return
        viewModelScope.launch {
            try {
                // 1. Create user message
                val userPayload = AIMessagePayload(conversationId = conversationId, role = "user", content = content, model = "", tokensUsed = null, createdAt = System.currentTimeMillis())
                itemRepository.create(ItemType.AI_MESSAGE, json.encodeToString(userPayload))
                
                _uiState.value = _uiState.value.copy(isThinking = true, error = null)
                
                val channel = findChannelForModel(modelId)
                if (channel == null) {
                    val errorPayload = AIMessagePayload(conversationId = conversationId, role = "assistant", content = "未找到模型对应的 AI 渠道", model = modelId, tokensUsed = null, createdAt = System.currentTimeMillis())
                    itemRepository.create(ItemType.AI_MESSAGE, json.encodeToString(errorPayload))
                    _uiState.value = _uiState.value.copy(isThinking = false)
                    return@launch
                }
                
                // 2. Prepare history
                val historyMessages = messages.value.filter { it.conversationId == conversationId }.sortedBy { it.createdAt }.map { ChatMessage(role = it.role, content = it.content) }.toMutableList()
                val allMessages = mutableListOf<ChatMessage>()
                if (systemPrompt.isNotBlank()) allMessages.add(ChatMessage(role = "system", content = systemPrompt))
                allMessages.addAll(historyMessages)
                
                // 3. Create placeholder assistant message (for later update)
                val placeholderPayload = AIMessagePayload(conversationId = conversationId, role = "assistant", content = "", model = modelId, tokensUsed = null, createdAt = System.currentTimeMillis())
                val placeholderItem = itemRepository.create(ItemType.AI_MESSAGE, json.encodeToString(placeholderPayload))
                
                // 4. Start streaming
                _uiState.value = _uiState.value.copy(streamingMessageId = placeholderItem.id, streamingContent = "")
                
                val responseBuilder = StringBuilder()
                try {
                    val apiChannel = com.mucheng.notes.domain.model.payload.AIChannel(
                        id = channel.id, name = channel.name, type = channel.type, 
                        apiUrl = channel.apiUrl, apiKey = channel.apiKey, models = emptyList(), enabled = channel.enabled
                    )
                    
                    aiApiClient.streamChat(channel = apiChannel, model = modelId, messages = allMessages, temperature = temperature, maxTokens = maxTokens)
                        .collect { chunk -> 
                            responseBuilder.append(chunk)
                            // Update UI state only, don't write to DB yet
                            _uiState.value = _uiState.value.copy(streamingContent = responseBuilder.toString())
                        }
                    
                    // 5. Stream finished, update DB with full content
                    val finalPayload = placeholderPayload.copy(content = responseBuilder.toString())
                    itemRepository.update(placeholderItem.id, json.encodeToString(finalPayload))
                    
                } catch (e: Exception) {
                    // Update DB with error or partial content
                    val errorContent = if (responseBuilder.isNotEmpty()) responseBuilder.toString() + "\n[Error: ${e.message}]" else "AI 请求失败: ${e.message}"
                    val errorPayload = placeholderPayload.copy(content = errorContent)
                    itemRepository.update(placeholderItem.id, json.encodeToString(errorPayload))
                }
                
                // 6. Cleanup
                _uiState.value = _uiState.value.copy(isThinking = false, streamingMessageId = null, streamingContent = "")
                
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isThinking = false, error = e.message, streamingMessageId = null)
            }
        }
    }
    
    fun sendMessage(content: String) {
        val conversationId = _uiState.value.selectedConversationId ?: return
        val conversation = conversations.value.find { it.id == conversationId } ?: return
        sendMessageWithSettings(content, conversation.model, conversation.systemPrompt, conversation.temperature, conversation.maxTokens)
    }
    
    fun deleteConversation(conversationId: String) {
        viewModelScope.launch {
            messages.value.filter { it.conversationId == conversationId }.forEach { message ->
                itemRepository.softDelete(message.id)
            }
            itemRepository.softDelete(conversationId)
            if (_uiState.value.selectedConversationId == conversationId) {
                _uiState.value = _uiState.value.copy(selectedConversationId = null)
            }
        }
    }
    
    fun updateConversationTitle(conversationId: String, newTitle: String) {
        viewModelScope.launch {
            val item = itemRepository.getById(conversationId) ?: return@launch
            try {
                val payload = json.decodeFromString<AIConversationPayload>(item.payload)
                val updatedPayload = payload.copy(title = newTitle)
                itemRepository.update(conversationId, json.encodeToString(updatedPayload))
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = "更新标题失败: ${e.message}")
            }
        }
    }
    
    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }
    
    private fun ItemEntity.toConversationItem(): ConversationItem? {
        if (type != ItemType.AI_CONVERSATION.value) return null
        return try {
            val payloadData = json.decodeFromString<AIConversationPayload>(payload)
            ConversationItem(
                id = id,
                title = payloadData.title,
                model = payloadData.model,
                systemPrompt = payloadData.systemPrompt,
                temperature = payloadData.temperature,
                maxTokens = payloadData.maxTokens,
                createdAt = payloadData.createdAt
            )
        } catch (e: Exception) { null }
    }
    
    private fun ItemEntity.toMessageItem(): MessageItem? {
        if (type != ItemType.AI_MESSAGE.value) return null
        return try {
            val payloadData = json.decodeFromString<AIMessagePayload>(payload)
            MessageItem(
                id = id,
                conversationId = payloadData.conversationId,
                role = payloadData.role,
                content = payloadData.content,
                model = payloadData.model,
                tokensUsed = payloadData.tokensUsed,
                createdAt = payloadData.createdAt
            )
        } catch (e: Exception) { null }
    }
}
