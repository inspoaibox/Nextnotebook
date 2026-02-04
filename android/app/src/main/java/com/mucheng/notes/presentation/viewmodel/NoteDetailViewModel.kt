package com.mucheng.notes.presentation.viewmodel

import android.content.Context
import android.net.Uri
import android.util.Base64
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
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
import java.util.UUID
import javax.inject.Inject

/**
 * 撤销/重做历史记录项
 */
data class HistoryEntry(
    val content: String,
    val selection: TextRange
)

/**
 * 笔记详情界面状态
 */
data class NoteDetailUiState(
    val noteId: String? = null,
    val title: String = "",
    val contentFieldValue: TextFieldValue = TextFieldValue(""),
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
    val resourceImages: Map<String, String> = emptyMap(),
    // 标签编辑状态
    val isTagEditing: Boolean = false,
    val availableTags: List<String> = emptyList(),
    val newTagInput: String = "",
    // 撤销/重做状态
    val canUndo: Boolean = false,
    val canRedo: Boolean = false,
    // 字数统计
    val wordCount: Int = 0,
    val charCount: Int = 0,
    // 图片选择状态
    val isImagePickerOpen: Boolean = false,
    val isProcessingImage: Boolean = false,
    // AI 扩展功能状态
    val aiContinueLoading: Boolean = false,
    val aiPolishLoading: Boolean = false,
    val aiSummarizeLoading: Boolean = false,
    val aiTranslateLoading: Boolean = false,
    // 自动保存状态
    val lastAutoSaveTime: Long = 0,
    val isAutoSaving: Boolean = false,
    // AI 图片处理状态
    val aiImageProcessingLoading: Boolean = false,
    val aiImageUri: Uri? = null,
    val aiImageBase64: String? = null
) {
    // 兼容旧代码的 content 属性
    val content: String get() = contentFieldValue.text
}

/**
 * 笔记详情 ViewModel - 增强版
 * 
 * 新增功能:
 * - 光标位置精准插入 Markdown
 * - 撤销/重做历史
 * - 标签管理
 * - 图片插入
 * - AI 续写/润色/摘要/翻译
 * - 字数统计
 * - 自动保存草稿
 * - 深色模式适配
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
    
    // 撤销/重做历史栈
    private val undoStack = mutableListOf<HistoryEntry>()
    private val redoStack = mutableListOf<HistoryEntry>()
    private val maxHistorySize = 50
    
    // 自动保存定时器
    private var autoSaveJob: kotlinx.coroutines.Job? = null
    private val autoSaveIntervalMs = 30000L // 30秒自动保存
    
    init {
        // 加载所有可用标签
        loadAvailableTags()
    }
    
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
                    
                    // 清空历史栈
                    undoStack.clear()
                    redoStack.clear()
                    
                    val textFieldValue = TextFieldValue(
                        text = payload.content,
                        selection = TextRange(payload.content.length)
                    )
                    
                    _uiState.update {
                        it.copy(
                            noteId = noteId,
                            title = payload.title,
                            contentFieldValue = textFieldValue,
                            folderId = payload.folderId,
                            isPinned = payload.isPinned,
                            isLocked = payload.isLocked,
                            tags = payload.tags,
                            createdTime = item.createdTime,
                            updatedTime = item.updatedTime,
                            isLoading = false,
                            wordCount = countWords(payload.content),
                            charCount = payload.content.length,
                            canUndo = false,
                            canRedo = false
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
        undoStack.clear()
        redoStack.clear()
        
        _uiState.update {
            it.copy(
                noteId = null,
                title = "",
                contentFieldValue = TextFieldValue(""),
                folderId = folderId,
                isPinned = false,
                isLocked = false,
                tags = emptyList(),
                isEditing = true,
                hasChanges = false,
                wordCount = 0,
                charCount = 0,
                canUndo = false,
                canRedo = false
            )
        }
        originalTitle = ""
        originalContent = ""
        
        // 启动自动保存
        startAutoSave()
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
        startAutoSave()
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
     * 更新内容 (使用 TextFieldValue 支持光标位置)
     */
    fun updateContentFieldValue(value: TextFieldValue) {
        val oldContent = _uiState.value.content
        val newContent = value.text
        
        // 如果内容发生变化，保存到撤销栈
        if (oldContent != newContent) {
            pushToUndoStack(oldContent, _uiState.value.contentFieldValue.selection)
            redoStack.clear()
        }
        
        _uiState.update {
            it.copy(
                contentFieldValue = value,
                hasChanges = it.title != originalTitle || newContent != originalContent,
                wordCount = countWords(newContent),
                charCount = newContent.length,
                canUndo = undoStack.isNotEmpty(),
                canRedo = redoStack.isNotEmpty()
            )
        }
    }
    
    /**
     * 更新内容 (兼容旧 API，使用字符串)
     */
    fun updateContent(content: String) {
        val currentSelection = _uiState.value.contentFieldValue.selection
        val newValue = TextFieldValue(
            text = content,
            selection = TextRange(content.length.coerceAtMost(currentSelection.end))
        )
        updateContentFieldValue(newValue)
    }
    
    /**
     * 撤销操作
     */
    fun undo() {
        if (undoStack.isEmpty()) return
        
        val current = _uiState.value
        val entry = undoStack.removeLast()
        
        // 保存当前状态到重做栈
        redoStack.add(HistoryEntry(current.content, current.contentFieldValue.selection))
        
        _uiState.update {
            it.copy(
                contentFieldValue = TextFieldValue(entry.content, entry.selection),
                hasChanges = it.title != originalTitle || entry.content != originalContent,
                wordCount = countWords(entry.content),
                charCount = entry.content.length,
                canUndo = undoStack.isNotEmpty(),
                canRedo = redoStack.isNotEmpty()
            )
        }
    }
    
    /**
     * 重做操作
     */
    fun redo() {
        if (redoStack.isEmpty()) return
        
        val current = _uiState.value
        val entry = redoStack.removeLast()
        
        // 保存当前状态到撤销栈
        undoStack.add(HistoryEntry(current.content, current.contentFieldValue.selection))
        
        _uiState.update {
            it.copy(
                contentFieldValue = TextFieldValue(entry.content, entry.selection),
                hasChanges = it.title != originalTitle || entry.content != originalContent,
                wordCount = countWords(entry.content),
                charCount = entry.content.length,
                canUndo = undoStack.isNotEmpty(),
                canRedo = redoStack.isNotEmpty()
            )
        }
    }
    
    /**
     * 保存到撤销栈
     */
    private fun pushToUndoStack(content: String, selection: TextRange) {
        // 避免重复保存相同内容
        if (undoStack.isNotEmpty() && undoStack.last().content == content) return
        
        undoStack.add(HistoryEntry(content, selection))
        
        // 限制栈大小
        while (undoStack.size > maxHistorySize) {
            undoStack.removeFirst()
        }
    }
    
    /**
     * 切换编辑模式
     */
    fun toggleEditing() {
        val newIsEditing = !_uiState.value.isEditing
        _uiState.update { it.copy(isEditing = newIsEditing) }
        
        if (newIsEditing) {
            startAutoSave()
        } else {
            stopAutoSave()
        }
    }
    
    /**
     * 启动自动保存
     */
    private fun startAutoSave() {
        stopAutoSave()
        autoSaveJob = viewModelScope.launch {
            while (true) {
                kotlinx.coroutines.delay(autoSaveIntervalMs)
                if (_uiState.value.hasChanges && _uiState.value.isEditing) {
                    autoSave()
                }
            }
        }
    }
    
    /**
     * 停止自动保存
     */
    private fun stopAutoSave() {
        autoSaveJob?.cancel()
        autoSaveJob = null
    }
    
    /**
     * 自动保存草稿
     */
    private suspend fun autoSave() {
        val state = _uiState.value
        if (!state.hasChanges) return
        
        _uiState.update { it.copy(isAutoSaving = true) }
        
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
                itemRepository.update(state.noteId, payloadJson)
            } else {
                val newItem = itemRepository.create(ItemType.NOTE, payloadJson)
                _uiState.update { it.copy(noteId = newItem.id) }
            }
            
            _uiState.update { 
                it.copy(
                    isAutoSaving = false,
                    lastAutoSaveTime = System.currentTimeMillis()
                ) 
            }
        } catch (e: Exception) {
            _uiState.update { it.copy(isAutoSaving = false) }
        }
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
                
                stopAutoSave()
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
                stopAutoSave()
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
    
    // ==================== Markdown 插入功能 (光标位置精准插入) ====================
    
    /**
     * 在光标位置插入 Markdown 包围标记
     * 例如：insertMarkdown("**", "**") 会在选中文本两侧插入 **
     */
    fun insertMarkdown(prefix: String, suffix: String) {
        val current = _uiState.value.contentFieldValue
        val text = current.text
        val selection = current.selection
        
        val selectedText = if (selection.collapsed) {
            ""
        } else {
            text.substring(selection.min, selection.max)
        }
        
        val newText = StringBuilder(text)
        newText.replace(selection.min, selection.max, "$prefix$selectedText$suffix")
        
        // 光标移动到插入内容中间
        val newCursorPos = if (selection.collapsed) {
            selection.start + prefix.length
        } else {
            selection.min + prefix.length + selectedText.length + suffix.length
        }
        
        val newValue = TextFieldValue(
            text = newText.toString(),
            selection = TextRange(newCursorPos)
        )
        
        updateContentFieldValue(newValue)
    }
    
    /**
     * 在光标位置插入 Markdown 前缀（行首插入）
     * 例如：insertPrefix("# ") 会在当前行首插入 #
     */
    fun insertPrefix(prefix: String) {
        val current = _uiState.value.contentFieldValue
        val text = current.text
        val selection = current.selection
        
        // 找到当前行的开始位置
        val lineStart = text.lastIndexOf('\n', (selection.start - 1).coerceAtLeast(0)) + 1
        
        val newText = StringBuilder(text)
        newText.insert(lineStart, prefix)
        
        val newValue = TextFieldValue(
            text = newText.toString(),
            selection = TextRange(selection.start + prefix.length)
        )
        
        updateContentFieldValue(newValue)
    }
    
    /**
     * 插入代码块
     */
    fun insertCodeBlock(language: String = "") {
        val prefix = "```$language\n"
        val suffix = "\n```"
        insertMarkdown(prefix, suffix)
    }
    
    /**
     * 插入表格
     */
    fun insertTable(rows: Int = 3, cols: Int = 3) {
        val current = _uiState.value.contentFieldValue
        val text = current.text
        val selection = current.selection
        
        val table = StringBuilder()
        
        // 表头
        table.append("|")
        for (c in 1..cols) {
            table.append(" 标题$c |")
        }
        table.append("\n")
        
        // 分隔行
        table.append("|")
        for (c in 1..cols) {
            table.append(" --- |")
        }
        table.append("\n")
        
        // 数据行
        for (r in 1 until rows) {
            table.append("|")
            for (c in 1..cols) {
                table.append("  |")
            }
            table.append("\n")
        }
        
        val insertPos = if (selection.start == 0 || text.getOrNull(selection.start - 1) == '\n') {
            selection.start
        } else {
            // 确保表格在新行开始
            selection.start
        }
        
        val prefix = if (insertPos > 0 && text.getOrNull(insertPos - 1) != '\n') "\n" else ""
        
        val newText = StringBuilder(text)
        newText.insert(insertPos, "$prefix$table")
        
        val newValue = TextFieldValue(
            text = newText.toString(),
            selection = TextRange(insertPos + prefix.length + table.length)
        )
        
        updateContentFieldValue(newValue)
    }
    
    /**
     * 插入水平分隔线
     */
    fun insertHorizontalRule() {
        val current = _uiState.value.contentFieldValue
        val text = current.text
        val selection = current.selection
        
        val prefix = if (selection.start > 0 && text.getOrNull(selection.start - 1) != '\n') "\n" else ""
        val hr = "---\n"
        
        val newText = StringBuilder(text)
        newText.insert(selection.start, "$prefix$hr")
        
        val newValue = TextFieldValue(
            text = newText.toString(),
            selection = TextRange(selection.start + prefix.length + hr.length)
        )
        
        updateContentFieldValue(newValue)
    }
    
    // ==================== 图片插入功能 ====================
    
    /**
     * 打开图片选择器
     */
    fun openImagePicker() {
        _uiState.update { it.copy(isImagePickerOpen = true) }
    }
    
    /**
     * 关闭图片选择器
     */
    fun closeImagePicker() {
        _uiState.update { it.copy(isImagePickerOpen = false) }
    }
    
    /**
     * 处理选中的图片
     */
    fun handleImageSelected(uri: Uri) {
        viewModelScope.launch {
            _uiState.update { it.copy(isProcessingImage = true) }
            
            try {
                // 读取图片并转换为 base64
                val inputStream = context.contentResolver.openInputStream(uri)
                val bytes = inputStream?.readBytes()
                inputStream?.close()
                
                if (bytes != null) {
                    // 生成资源 ID
                    val resourceId = UUID.randomUUID().toString()
                    val mimeType = context.contentResolver.getType(uri) ?: "image/png"
                    val extension = when {
                        mimeType.contains("jpeg") || mimeType.contains("jpg") -> ".jpg"
                        mimeType.contains("gif") -> ".gif"
                        mimeType.contains("webp") -> ".webp"
                        else -> ".png"
                    }
                    
                    // 保存到本地资源目录
                    val resourceDir = File(context.filesDir, "resources")
                    if (!resourceDir.exists()) resourceDir.mkdirs()
                    
                    val resourceFile = File(resourceDir, "$resourceId$extension")
                    resourceFile.writeBytes(bytes)
                    
                    // 在编辑器中插入图片标记
                    val imageMarkdown = "![图片](resource://$resourceId$extension)"
                    insertAtCursor(imageMarkdown)
                    
                    // 添加到资源图片缓存
                    val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    val dataUri = "data:$mimeType;base64,$base64"
                    
                    _uiState.update { 
                        it.copy(
                            resourceImages = it.resourceImages + ("$resourceId$extension" to dataUri)
                        ) 
                    }
                }
                
                _uiState.update { it.copy(isProcessingImage = false, isImagePickerOpen = false) }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isProcessingImage = false, 
                        error = "图片处理失败: ${e.message}"
                    ) 
                }
            }
        }
    }
    
    /**
     * 在光标位置插入文本
     */
    private fun insertAtCursor(text: String) {
        val current = _uiState.value.contentFieldValue
        val cursorPos = current.selection.start
        
        val newText = StringBuilder(current.text)
        newText.insert(cursorPos, text)
        
        val newValue = TextFieldValue(
            text = newText.toString(),
            selection = TextRange(cursorPos + text.length)
        )
        
        updateContentFieldValue(newValue)
    }
    
    // ==================== 附件插入功能 ====================
    
    /**
     * 处理选中的附件文件
     */
    fun handleAttachmentSelected(uri: Uri) {
        viewModelScope.launch {
            _uiState.update { it.copy(isProcessingImage = true) }
            
            try {
                // 获取文件名
                val cursor = context.contentResolver.query(uri, null, null, null, null)
                var fileName = "attachment"
                cursor?.use {
                    if (it.moveToFirst()) {
                        val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                        if (nameIndex >= 0) {
                            fileName = it.getString(nameIndex) ?: "attachment"
                        }
                    }
                }
                
                // 读取文件
                val inputStream = context.contentResolver.openInputStream(uri)
                val bytes = inputStream?.readBytes()
                inputStream?.close()
                
                if (bytes != null) {
                    // 生成资源 ID
                    val resourceId = UUID.randomUUID().toString()
                    val mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream"
                    
                    // 获取文件扩展名
                    val extension = fileName.substringAfterLast('.', "").let { 
                        if (it.isNotEmpty()) ".$it" else ""
                    }
                    
                    // 保存到本地资源目录
                    val resourceDir = File(context.filesDir, "resources")
                    if (!resourceDir.exists()) resourceDir.mkdirs()
                    
                    val resourceFile = File(resourceDir, "$resourceId$extension")
                    resourceFile.writeBytes(bytes)
                    
                    // 根据文件类型决定插入格式
                    val isImage = mimeType.startsWith("image/")
                    val markdown = if (isImage) {
                        "![${fileName}](resource://$resourceId$extension)"
                    } else {
                        // 非图片文件使用链接格式
                        "[📎 ${fileName}](resource://$resourceId$extension)"
                    }
                    
                    insertAtCursor(markdown)
                    
                    // 如果是图片，添加到缓存
                    if (isImage) {
                        val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                        val dataUri = "data:$mimeType;base64,$base64"
                        
                        _uiState.update { 
                            it.copy(
                                resourceImages = it.resourceImages + ("$resourceId$extension" to dataUri)
                            ) 
                        }
                    }
                }
                
                _uiState.update { it.copy(isProcessingImage = false) }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isProcessingImage = false, 
                        error = "附件处理失败: ${e.message}"
                    ) 
                }
            }
        }
    }
    
    // ==================== 标签管理功能 ====================
    
    /**
     * 加载所有可用标签
     */
    private fun loadAvailableTags() {
        viewModelScope.launch {
            try {
                val notes = itemRepository.getByTypeOnce(ItemType.NOTE)
                val allTags = mutableSetOf<String>()
                
                for (note in notes) {
                    try {
                        val payload = json.decodeFromString<NotePayload>(note.payload)
                        allTags.addAll(payload.tags)
                    } catch (_: Exception) {}
                }
                
                _uiState.update { it.copy(availableTags = allTags.toList().sorted()) }
            } catch (_: Exception) {}
        }
    }
    
    /**
     * 开始编辑标签
     */
    fun startTagEditing() {
        _uiState.update { it.copy(isTagEditing = true, newTagInput = "") }
    }
    
    /**
     * 结束编辑标签
     */
    fun endTagEditing() {
        _uiState.update { it.copy(isTagEditing = false, newTagInput = "") }
    }
    
    /**
     * 更新新标签输入
     */
    fun updateNewTagInput(input: String) {
        _uiState.update { it.copy(newTagInput = input) }
    }
    
    /**
     * 添加标签
     */
    fun addTag(tag: String) {
        val trimmedTag = tag.trim()
        if (trimmedTag.isEmpty()) return
        
        val currentTags = _uiState.value.tags
        if (currentTags.contains(trimmedTag)) return
        
        _uiState.update { 
            it.copy(
                tags = currentTags + trimmedTag,
                hasChanges = true,
                newTagInput = ""
            ) 
        }
    }
    
    /**
     * 移除标签
     */
    fun removeTag(tag: String) {
        _uiState.update { 
            it.copy(
                tags = it.tags - tag,
                hasChanges = true
            ) 
        }
    }
    
    // ==================== AI 扩展功能 ====================
    
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
                val result = callAI(
                    systemPrompt = "你是一个专业的写作助手。请根据用户的需求撰写内容，输出格式为 Markdown。",
                    userPrompt = prompt
                )
                
                if (result.isNotBlank()) {
                    val currentContent = _uiState.value.content
                    val newContent = if (currentContent.isEmpty()) {
                        result
                    } else {
                        "$currentContent\n\n$result"
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
     * AI 续写功能
     * 基于当前内容续写下文
     */
    fun aiContinue() {
        val content = _uiState.value.content
        if (content.isBlank()) {
            _uiState.update { it.copy(error = "请先输入一些内容") }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(aiContinueLoading = true) }
            
            try {
                val result = callAI(
                    systemPrompt = "你是一个专业的写作助手。请根据用户已写的内容，自然地续写下去。保持相同的写作风格和语调。输出格式为 Markdown。只输出续写的内容，不要重复用户已有的内容。",
                    userPrompt = "请续写以下内容：\n\n$content"
                )
                
                if (result.isNotBlank()) {
                    val newContent = "$content\n\n$result"
                    updateContent(newContent)
                }
                
                _uiState.update { it.copy(aiContinueLoading = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(
                    aiContinueLoading = false,
                    error = "AI 续写失败: ${e.message ?: "未知错误"}"
                ) }
            }
        }
    }
    
    /**
     * AI 润色功能
     * 润色选中的文本或全部内容
     */
    fun aiPolish() {
        val content = _uiState.value.content
        if (content.isBlank()) {
            _uiState.update { it.copy(error = "请先输入一些内容") }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(aiPolishLoading = true) }
            
            try {
                val result = callAI(
                    systemPrompt = "你是一个专业的文字编辑。请润色以下内容，改进表达、修正语法错误、提升可读性，但保持原意不变。输出格式为 Markdown。",
                    userPrompt = content
                )
                
                if (result.isNotBlank()) {
                    updateContent(result)
                }
                
                _uiState.update { it.copy(aiPolishLoading = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(
                    aiPolishLoading = false,
                    error = "AI 润色失败: ${e.message ?: "未知错误"}"
                ) }
            }
        }
    }
    
    /**
     * AI 摘要功能
     * 生成内容摘要
     */
    fun aiSummarize(): String {
        val content = _uiState.value.content
        if (content.isBlank()) {
            _uiState.update { it.copy(error = "请先输入一些内容") }
            return ""
        }
        
        var summary = ""
        viewModelScope.launch {
            _uiState.update { it.copy(aiSummarizeLoading = true) }
            
            try {
                summary = callAI(
                    systemPrompt = "你是一个专业的文字编辑。请为以下内容生成一个简洁的摘要（不超过200字）。",
                    userPrompt = content
                )
                
                _uiState.update { it.copy(aiSummarizeLoading = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(
                    aiSummarizeLoading = false,
                    error = "AI 摘要失败: ${e.message ?: "未知错误"}"
                ) }
            }
        }
        return summary
    }
    
    /**
     * AI 翻译功能
     */
    fun aiTranslate(targetLanguage: String = "英语") {
        val content = _uiState.value.content
        if (content.isBlank()) {
            _uiState.update { it.copy(error = "请先输入一些内容") }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(aiTranslateLoading = true) }
            
            try {
                val result = callAI(
                    systemPrompt = "你是一个专业的翻译。请将以下内容翻译成$targetLanguage。保持原有的格式（Markdown）。",
                    userPrompt = content
                )
                
                if (result.isNotBlank()) {
                    // 将翻译结果追加到原文下方
                    val newContent = "$content\n\n---\n\n## $targetLanguage 翻译\n\n$result"
                    updateContent(newContent)
                }
                
                _uiState.update { it.copy(aiTranslateLoading = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(
                    aiTranslateLoading = false,
                    error = "AI 翻译失败: ${e.message ?: "未知错误"}"
                ) }
            }
        }
    }
    
    // ==================== AI 图片处理功能 ====================
    
    /**
     * 设置待处理的图片
     */
    fun setAiImage(uri: Uri) {
        viewModelScope.launch {
            try {
                val inputStream = context.contentResolver.openInputStream(uri)
                val bytes = inputStream?.readBytes()
                inputStream?.close()
                
                if (bytes != null) {
                    val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
                    val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    val dataUri = "data:$mimeType;base64,$base64"
                    
                    _uiState.update { 
                        it.copy(
                            aiImageUri = uri,
                            aiImageBase64 = dataUri
                        ) 
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = "图片加载失败: ${e.message}") }
            }
        }
    }
    
    /**
     * 清除待处理的图片
     */
    fun clearAiImage() {
        _uiState.update { 
            it.copy(
                aiImageUri = null,
                aiImageBase64 = null
            ) 
        }
    }
    
    /**
     * AI 图片处理功能
     * 支持图片描述、OCR、整理等
     */
    fun aiProcessImage(prompt: String) {
        val imageBase64 = _uiState.value.aiImageBase64
        if (imageBase64.isNullOrBlank()) {
            _uiState.update { it.copy(error = "请先选择图片") }
            return
        }
        
        if (prompt.isBlank()) {
            _uiState.update { it.copy(error = "请输入处理要求") }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(aiImageProcessingLoading = true) }
            
            try {
                val result = callAIWithImage(
                    systemPrompt = "你是一个专业的图片分析助手。请根据用户的要求处理图片内容。如果是文字识别(OCR)，请准确提取图片中的文字。如果是图片描述，请详细描述图片内容。如果是整理，请将图片内容整理成结构化的 Markdown 格式。",
                    userPrompt = prompt,
                    imageBase64 = imageBase64
                )
                
                if (result.isNotBlank()) {
                    val currentContent = _uiState.value.content
                    val newContent = if (currentContent.isEmpty()) {
                        result
                    } else {
                        "$currentContent\n\n---\n\n## 图片处理结果\n\n$result"
                    }
                    updateContent(newContent)
                }
                
                // 清除图片状态
                _uiState.update { 
                    it.copy(
                        aiImageProcessingLoading = false,
                        aiImageUri = null,
                        aiImageBase64 = null
                    ) 
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(
                    aiImageProcessingLoading = false,
                    error = "图片处理失败: ${e.message ?: "未知错误"}"
                ) }
            }
        }
    }
    
    /**
     * 调用带图片的 AI API
     * 使用视觉模型处理图片
     */
    private suspend fun callAIWithImage(systemPrompt: String, userPrompt: String, imageBase64: String): String {
        val channelsJson = prefs.getString("ai_channels_json", "") ?: ""
        val defaultModel = prefs.getString("ai_default_model", "") ?: ""
        
        if (channelsJson.isBlank()) {
            throw Exception("请先在设置中配置 AI 渠道")
        }
        
        val channels = try {
            json.decodeFromString<List<AIChannel>>(channelsJson)
        } catch (e: Exception) {
            throw Exception("AI 配置解析失败")
        }
        
        val enabledChannels = channels.filter { it.enabled && it.apiKey.isNotBlank() }
        if (enabledChannels.isEmpty()) {
            throw Exception("请先在设置中配置 AI 渠道和 API Key")
        }
        
        var targetChannel = enabledChannels.first()
        var targetModel = defaultModel
        
        // 尝试找到视觉模型（优先使用带 vision 的模型）
        for (channel in enabledChannels) {
            val visionModel = channel.models.find { 
                it.id.contains("vision", ignoreCase = true) || 
                it.id.contains("gpt-4o", ignoreCase = true) ||
                it.id.contains("claude-3", ignoreCase = true) ||
                it.id.contains("gemini", ignoreCase = true)
            }
            if (visionModel != null) {
                targetChannel = channel
                targetModel = visionModel.id
                break
            }
        }
        
        // 如果没有找到视觉模型，使用默认模型
        if (targetModel.isBlank() && targetChannel.models.isNotEmpty()) {
            targetModel = targetChannel.models.first().id
        }
        
        if (targetModel.isBlank()) {
            throw Exception("请先在设置中配置 AI 模型")
        }
        
        android.util.Log.d("NoteDetailViewModel", "Using vision model: $targetModel from channel: ${targetChannel.name}")
        
        // 调用带图片的 API
        val responseBuilder = StringBuilder()
        aiApiClient.streamChatWithImage(
            channel = targetChannel,
            model = targetModel,
            systemPrompt = systemPrompt,
            userPrompt = userPrompt,
            imageBase64 = imageBase64,
            temperature = 0.7f,
            maxTokens = 4096
        ).collect { chunk ->
            responseBuilder.append(chunk)
        }
        
        return responseBuilder.toString()
    }
    
    /**
     * 调用 AI API 的通用方法
     */
    private suspend fun callAI(systemPrompt: String, userPrompt: String): String {
        val channelsJson = prefs.getString("ai_channels_json", "") ?: ""
        val defaultModel = prefs.getString("ai_default_model", "") ?: ""
        
        android.util.Log.d("NoteDetailViewModel", "callAI: channelsJson length=${channelsJson.length}, defaultModel=$defaultModel")
        
        if (channelsJson.isBlank()) {
            throw Exception("请先在设置中配置 AI 渠道")
        }
        
        val channels = try {
            json.decodeFromString<List<AIChannel>>(channelsJson)
        } catch (e: Exception) {
            android.util.Log.e("NoteDetailViewModel", "AI config parse error: ${e.message}")
            throw Exception("AI 配置解析失败: ${e.message}")
        }
        
        android.util.Log.d("NoteDetailViewModel", "Parsed ${channels.size} AI channels")
        
        val enabledChannels = channels.filter { it.enabled && it.apiKey.isNotBlank() }
        if (enabledChannels.isEmpty()) {
            throw Exception("请先在设置中配置 AI 渠道和 API Key")
        }
        
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
        
        if (targetModel.isBlank() && targetChannel.models.isNotEmpty()) {
            targetModel = targetChannel.models.first().id
        }
        
        if (targetModel.isBlank()) {
            throw Exception("请先在设置中配置 AI 模型")
        }
        
        android.util.Log.d("NoteDetailViewModel", "Using channel: ${targetChannel.name}, type=${targetChannel.type}, apiUrl=${targetChannel.apiUrl}")
        android.util.Log.d("NoteDetailViewModel", "Using model: $targetModel")
        
        val messages = listOf(
            ChatMessage("system", systemPrompt),
            ChatMessage("user", userPrompt)
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
        
        return responseBuilder.toString()
    }
    
    /**
     * 清除 AI 撰写错误
     */
    fun clearAiWriteError() {
        _uiState.update { it.copy(aiWriteError = null) }
    }
    
    // ==================== 资源图片处理 ====================
    
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
                    // 尝试从本地资源目录加载
                    try {
                        val resourceDir = File(context.filesDir, "resources")
                        val resourceFile = File(resourceDir, resourcePath)
                        if (resourceFile.exists()) {
                            val bytes = resourceFile.readBytes()
                            val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                            val mimeType = when (ext.lowercase()) {
                                ".png" -> "image/png"
                                ".jpg", ".jpeg" -> "image/jpeg"
                                ".gif" -> "image/gif"
                                ".webp" -> "image/webp"
                                else -> "image/png"
                            }
                            resourceImages[resourcePath] = "data:$mimeType;base64,$base64"
                        }
                    } catch (_: Exception) {}
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
    
    // ==================== 辅助方法 ====================
    
    /**
     * 统计字数
     */
    private fun countWords(text: String): Int {
        if (text.isBlank()) return 0
        
        // 中文按字符计数，英文按单词计数
        val chineseCount = text.count { it.code in 0x4E00..0x9FFF }
        val englishWords = text.replace(Regex("[\\u4E00-\\u9FFF]"), " ")
            .split(Regex("\\s+"))
            .filter { it.isNotBlank() }
            .size
        
        return chineseCount + englishWords
    }
    
    /**
     * 检查是否为深色模式
     */
    fun isDarkMode(): Boolean {
        val nightModeFlags = context.resources.configuration.uiMode and 
                android.content.res.Configuration.UI_MODE_NIGHT_MASK
        return nightModeFlags == android.content.res.Configuration.UI_MODE_NIGHT_YES
    }
    
    override fun onCleared() {
        super.onCleared()
        stopAutoSave()
    }
}
