package com.mucheng.notes.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.payload.NotePayload
import com.mucheng.notes.domain.repository.ItemRepository
import com.mucheng.notes.security.CryptoEngine
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
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
    val error: String? = null
)

/**
 * 笔记详情 ViewModel
 */
@HiltViewModel
class NoteDetailViewModel @Inject constructor(
    private val itemRepository: ItemRepository,
    private val cryptoEngine: CryptoEngine
) : ViewModel() {
    
    private val json = Json { 
        ignoreUnknownKeys = true 
        isLenient = true
        coerceInputValues = true
    }
    
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
}
