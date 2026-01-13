package com.mucheng.notes.presentation.viewmodel

import android.content.Context
import android.util.Base64
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mucheng.notes.data.remote.AIApiClient
import com.mucheng.notes.data.remote.ChatMessage
import com.mucheng.notes.data.sync.ResourceSyncManager
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.payload.AIChannel
import com.mucheng.notes.domain.model.payload.NotePayload
import com.mucheng.notes.domain.repository.ItemRepository
import com.mucheng.notes.security.CryptoEngine
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import javax.inject.Inject

/**
 * 笔记详情界面状态
 */
data class NoteDetailUiState(
    val noteId: String? = null,
    val title: String = "",
    val content: String = "",
    val folderId: String? = null,
    val isPinned: Boolean = false,
    val isLocked: Boolean = false,
    val tags: List<String> = emptyList(),
    val createdTime: Long = 0,
    val updatedTime: Long = 0,
    val isEditing: Boolean = false,
    val hasChanges: Boolean = false,
    val isLoading: Boolean = false,
    val error: String? = null,
    // AI 撰写状态
    val aiWriteLoading: Boolean = false,
    val aiWriteError: String? = null,
    // 资源图片缓存 (resourceId -> base64 data URI)
    val resourceImages: Map<String, String> = emptyMap()
)

/**
 * 笔记详情 ViewModel
 */
@HiltViewModel
class NoteDetailViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val itemRepository: ItemRepository,
    private val cryptoEngine: CryptoEngine,
    private val aiApiClient: AIApiClient,
    private val resourceSyncManager: ResourceSyncManager
) : ViewModel() {
    
    private val json = Json { 
        ignoreUnknownKeys = true 
        isLenient = true
        coerceInputValues = true
    }
    
    private val prefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)
    
    private val _uiState = MutableStateFlow(NoteDetailUiState())
    val uiState: StateFlow<NoteDetailUiState> = _uiState.asStateFlow()
    
    private var originalTitle = ""
    private var originalContent = ""
    private var lockPasswordHash: String? = null
    
    /**
     * 加载笔记
     */
    fun loadNote(noteId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            
            try {
                val item = itemRepository.getById(noteId)
                if (item != null) {
                    val payload = json.decodeFromString<NotePayload>(item.payload)
                    
                    originalTitle = payload.title
                    originalContent = payload.content
                    lockPasswordHash = payload.lockPasswordHash
                    
                    _uiState.update {
                        it.copy(
                            noteId = noteId,
                            title = payload.title,
                            content = payload.content,
                            folderId = payload.folderId,
                            isPinned = payload.isPinned,
                            isLocked = payload.isLocked,
                            tags = payload.tags,
                            createdTime = item.createdTime,
                            updatedTime = item.updatedTime,
                            isLoading = false
                        )
                    }
                    
                    // 加载内容中的资源图片
                    loadResourceImages(payload.content)
                } else {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = "笔记不存在"
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = e.message
                    )
                }
            }
        }
    }
    /**
     * 创建新笔记
     */
    fun createNewNote(folderId: String? = null) {
        _uiState.update {
            it.copy(
                noteId = null,
                title = "",
                content = "",
                folderId = folderId,
                isPinned = false,
                isLocked = false,
                tags = emptyList(),
                isEditing = true,
                hasChanges = false
            )
        }
        originalTitle = ""
        originalContent = ""
    }
    
    /**
     * 设置默认文件夹 ID（用于新建笔记时）
     */
    fun setDefaultFolderId(folderId: String?) {
        _uiState.update {
            it.copy(
                folderId = folderId,
                isEditing = true  // 新建笔记默认进入编辑模式
            )
        }
    }
    
    /**
     * 更新标题
     */
    fun updateTitle(title: String) {
        _uiState.update {
            it.copy(
                title = title,
                hasChanges = title != originalTitle || it.content != originalContent
            )
        }
    }
    
    /**
     * 更新内容
     */
    fun updateContent(content: String) {
        _uiState.update {
            it.copy(
                content = content,
                hasChanges = it.title != originalTitle || content != originalContent
            )
        }
    }
    
    /**
     * 切换编辑模式
     */
    fun toggleEditing() {
        _uiState.update { it.copy(isEditing = !it.isEditing) }
    }
    
    /**
     * 保存笔记
     */
    fun saveNote() {
        val state = _uiState.value
        if (!state.hasChanges && state.noteId != null) return
        
        viewModelScope.launch {
            try {
                val payload = NotePayload(
                    title = state.title,
                    content = state.content,
                    folderId = state.folderId,
                    isPinned = state.isPinned,
                    isLocked = state.isLocked,
                    lockPasswordHash = lockPasswordHash,
                    tags = state.tags
                )
                
                val payloadJson = json.encodeToString(payload)
                
                if (state.noteId != null) {
                    // 更新现有笔记
                    itemRepository.update(state.noteId, payloadJson)
                } else {
                    // 创建新笔记
                    val newItem = itemRepository.create(ItemType.NOTE, payloadJson)
                    _uiState.update { it.copy(noteId = newItem.id) }
                }
                
                originalTitle = state.title
                originalContent = state.content
                
                _uiState.update {
                    it.copy(
                        hasChanges = false,
                        isEditing = false,
                        updatedTime = System.currentTimeMillis()
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }
    
    /**
     * 删除笔记
     */
    fun deleteNote() {
        val noteId = _uiState.value.noteId ?: return
        
        viewModelScope.launch {
            try {
                itemRepository.softDelete(noteId)
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }
    
    /**
     * 切换置顶状态
     */
    fun togglePin() {
        val state = _uiState.value
        val noteId = state.noteId ?: return
        
        viewModelScope.launch {
            try {
                val payload = NotePayload(
                    title = state.title,
                    content = state.content,
                    folderId = state.folderId,
                    isPinned = !state.isPinned,
                    isLocked = state.isLocked,
                    lockPasswordHash = lockPasswordHash,
                    tags = state.tags
                )
                
                itemRepository.update(noteId, json.encodeToString(payload))
                
                _uiState.update { it.copy(isPinned = !state.isPinned) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }
    
    /**
     * 锁定笔记
     */
    fun lockNote(password: String) {
        val state = _uiState.value
        val noteId = state.noteId ?: return
        
        viewModelScope.launch {
            try {
                val passwordHash = cryptoEngine.computeHash(password)
                lockPasswordHash = passwordHash
                
                val payload = NotePayload(
                    title = state.title,
                    content = state.content,
                    folderId = state.folderId,
                    isPinned = state.isPinned,
                    isLocked = true,
                    lockPasswordHash = passwordHash,
                    tags = state.tags
                )
                
                itemRepository.update(noteId, json.encodeToString(payload))
                
                _uiState.update { it.copy(isLocked = true) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }
    
    /**
     * 解锁笔记
     */
    fun unlockNote() {
        val state = _uiState.value
        val noteId = state.noteId ?: return
        
        viewModelScope.launch {
            try {
                lockPasswordHash = null
                
                val payload = NotePayload(
                    title = state.title,
                    content = state.content,
                    folderId = state.folderId,
                    isPinned = state.isPinned,
                    isLocked = false,
                    lockPasswordHash = null,
                    tags = state.tags
                )
                
                itemRepository.update(noteId, json.encodeToString(payload))
                
                _uiState.update { it.copy(isLocked = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }
    
    /**
     * 验证笔记密码
     */
    fun verifyNotePassword(password: String): Boolean {
        val hash = cryptoEngine.computeHash(password)
        return hash == lockPasswordHash
    }
    
    /**
     * 清除错误
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
    
    /**
     * 插入 Markdown 包围标记
     * 例如：insertMarkdown("**", "**") 会在光标位置插入 **|**
     */
    fun insertMarkdown(prefix: String, suffix: String) {
        val currentContent = _uiState.value.content
        val newContent = "$currentContent$prefix$suffix"
        updateContent(newContent)
    }
    
    /**
     * 插入 Markdown 前缀
     * 例如：insertPrefix("# ") 会在新行插入 # 
     */
    fun insertPrefix(prefix: String) {
        val currentContent = _uiState.value.content
        val newContent = if (currentContent.isEmpty() || currentContent.endsWith("\n")) {
            "$currentContent$prefix"
        } else {
            "$currentContent\n$prefix"
        }
        updateContent(newContent)
    }
    
    /**
     * AI 撰写功能
     * 使用设置中配置的默认模型生成内容
     */
    fun aiWrite(prompt: String) {
        if (prompt.isBlank()) {
            _uiState.update { it.copy(aiWriteError = "请输入撰写需求") }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(aiWriteLoading = true, aiWriteError = null) }
            
            try {
                // 从设置中获取 AI 配置
                val channelsJson = prefs.getString("ai_channels_json", "") ?: ""
                val defaultModel = prefs.getString("ai_default_model", "") ?: ""
                
                if (channelsJson.isBlank()) {
                    _uiState.update { it.copy(
                        aiWriteLoading = false,
                        aiWriteError = "请先在设置中配置 AI 渠道"
                    ) }
                    return@launch
                }
                
                // 解析渠道配置
                val channels = try {
                    json.decodeFromString<List<AIChannel>>(channelsJson)
                } catch (e: Exception) {
                    _uiState.update { it.copy(
                        aiWriteLoading = false,
                        aiWriteError = "AI 配置解析失败"
                    ) }
                    return@launch
                }
                
                // 找到启用的渠道
                val enabledChannels = channels.filter { it.enabled && it.apiKey.isNotBlank() }
                if (enabledChannels.isEmpty()) {
                    _uiState.update { it.copy(
                        aiWriteLoading = false,
                        aiWriteError = "请先在设置中配置 AI 渠道和 API Key"
                    ) }
                    return@launch
                }
                
                // 找到默认模型所在的渠道
                var targetChannel = enabledChannels.first()
                var targetModel = defaultModel
                
                if (targetModel.isNotBlank()) {
                    for (channel in enabledChannels) {
                        val model = channel.models.find { it.id == targetModel }
                        if (model != null) {
                            targetChannel = channel
                            break
                        }
                    }
                }
                
                // 如果没有默认模型，使用第一个渠道的第一个模型
                if (targetModel.isBlank() && targetChannel.models.isNotEmpty()) {
                    targetModel = targetChannel.models.first().id
                }
                
                if (targetModel.isBlank()) {
                    _uiState.update { it.copy(
                        aiWriteLoading = false,
                        aiWriteError = "请先在设置中配置 AI 模型"
                    ) }
                    return@launch
                }
                
                // 调用 AI API
                val messages = listOf(
                    ChatMessage("system", "你是一个专业的写作助手。请根据用户的需求撰写内容，输出格式为 Markdown。"),
                    ChatMessage("user", prompt)
                )
                
                val responseBuilder = StringBuilder()
                aiApiClient.streamChat(
                    channel = targetChannel,
                    model = targetModel,
                    messages = messages,
                    temperature = 0.7f,
                    maxTokens = 4096
                ).collect { chunk ->
                    responseBuilder.append(chunk)
                }
                
                val response = responseBuilder.toString()
                if (response.isNotBlank()) {
                    // 将 AI 生成的内容插入到编辑器
                    val currentContent = _uiState.value.content
                    val newContent = if (currentContent.isEmpty()) {
                        response
                    } else {
                        "$currentContent\n\n$response"
                    }
                    updateContent(newContent)
                }
                
                _uiState.update { it.copy(aiWriteLoading = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(
                    aiWriteLoading = false,
                    aiWriteError = "AI 撰写失败: ${e.message ?: "未知错误"}"
                ) }
            }
        }
    }
    
    /**
     * 清除 AI 撰写错误
     */
    fun clearAiWriteError() {
        _uiState.update { it.copy(aiWriteError = null) }
    }
    
    /**
     * 从内容中提取并加载 resource:// 协议的图片
     */
    private fun loadResourceImages(content: String) {
        viewModelScope.launch {
            // 使用正则表达式提取所有 resource:// 图片
            val imageRegex = Regex("!\\[[^\\]]*\\]\\(resource://([^)]+)\\)")
            val matches = imageRegex.findAll(content)
            
            val resourceImages = mutableMapOf<String, String>()
            
            for (match in matches) {
                val resourcePath = match.groupValues[1]
                // 解析资源 ID（去掉扩展名）
                val lastDotIndex = resourcePath.lastIndexOf('.')
                val resourceId = if (lastDotIndex > 0) {
                    resourcePath.substring(0, lastDotIndex)
                } else {
                    resourcePath
                }
                val ext = if (lastDotIndex > 0) {
                    resourcePath.substring(lastDotIndex)
                } else {
                    ".png"
                }
                
                // 尝试加载资源
                try {
                    val result = resourceSyncManager.getResource(resourceId)
                    result.onSuccess { file ->
                        val bytes = file.readBytes()
                        val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                        val mimeType = when (ext.lowercase()) {
                            ".png" -> "image/png"
                            ".jpg", ".jpeg" -> "image/jpeg"
                            ".gif" -> "image/gif"
                            ".webp" -> "image/webp"
                            ".svg" -> "image/svg+xml"
                            else -> "image/png"
                        }
                        resourceImages[resourcePath] = "data:$mimeType;base64,$base64"
                    }
                } catch (e: Exception) {
                    // 加载失败，跳过
                }
            }
            
            if (resourceImages.isNotEmpty()) {
                _uiState.update { it.copy(resourceImages = resourceImages) }
            }
        }
    }
    
    /**
     * 获取处理后的内容（将 resource:// 图片替换为 base64）
     */
    fun getProcessedContent(): String {
        val content = _uiState.value.content
        val resourceImages = _uiState.value.resourceImages
        
        if (resourceImages.isEmpty()) {
            return content
        }
        
        var processedContent = content
        for ((resourcePath, dataUri) in resourceImages) {
            processedContent = processedContent.replace(
                "resource://$resourcePath",
                dataUri
            )
        }
        
        return processedContent
    }
}
