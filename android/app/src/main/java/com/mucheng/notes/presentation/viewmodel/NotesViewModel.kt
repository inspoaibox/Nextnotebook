package com.mucheng.notes.presentation.viewmodel

import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.SyncStatus
import com.mucheng.notes.domain.model.payload.ExcelNotePayload
import com.mucheng.notes.domain.model.payload.FolderPayload
import com.mucheng.notes.domain.model.payload.NotePayload
import com.mucheng.notes.domain.repository.ItemRepository
import com.mucheng.notes.domain.repository.SyncRepository
import com.mucheng.notes.security.CryptoEngine
import com.mucheng.notes.security.SecureSyncStorage
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
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import javax.inject.Inject

/**
 * 笔记 UI 状态
 */
data class NotesUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val message: String? = null, // 同步成功消息
    val selectedFolderId: String? = null,
    val searchQuery: String = "",
    val syncStatus: SyncStatus = SyncStatus.IDLE,
    val lastSyncTime: Long? = null,
    val editingFolderId: String? = null,
    val showCreateFolderDialog: Boolean = false,
    val createFolderParentId: String? = null
)

/**
 * 笔记视图模型
 */
@HiltViewModel
class NotesViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val itemRepository: ItemRepository,
    private val syncRepository: SyncRepository,
    private val cryptoEngine: CryptoEngine
) : ViewModel() {
    
    private val json = Json { 
        ignoreUnknownKeys = true 
        isLenient = true
        coerceInputValues = true  // 将 null 转换为默认值
    }
    private val prefs: SharedPreferences = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)
    
    private val _uiState = MutableStateFlow(NotesUiState())
    val uiState: StateFlow<NotesUiState> = _uiState.asStateFlow()
    
    private val _selectedFolderId = MutableStateFlow<String?>(null)
    val selectedFolderId: StateFlow<String?> = _selectedFolderId.asStateFlow()

    private fun isServerLoggedIn(): Boolean {
        return SecureSyncStorage.getString(context, "server_token") != null
    }
    
    init {
        // 加载上次同步时间
        val lastSync = prefs.getLong("last_sync_time", 0).takeIf { it > 0 }
        
        // 检查同步配置状态
        val syncEnabled = prefs.getBoolean("sync_enabled", false)
        val syncType = prefs.getString("sync_type", "webdav") ?: "webdav"
        // 服务器地址统一存储在 webdav_url 中（WebDAV 和自建服务器共用）
        val syncUrl = prefs.getString("webdav_url", "") ?: ""
        
        // 自建服务器还需要检查是否已登录
        val serverLoggedIn = if (syncType == "server") {
            isServerLoggedIn()
        } else true
        
        val syncConfigured = syncEnabled && syncUrl.isNotBlank() && 
            (syncUrl.startsWith("http://") || syncUrl.startsWith("https://")) &&
            serverLoggedIn
        
        _uiState.value = _uiState.value.copy(
            lastSyncTime = lastSync,
            syncStatus = if (syncConfigured) SyncStatus.IDLE else SyncStatus.OFFLINE
        )
    }
    
    /**
     * 笔记列表（实时流）- 包含普通笔记和 Excel 笔记
     */
    val notes: StateFlow<List<NoteItem>> = itemRepository.getByTypes(listOf(ItemType.NOTE, ItemType.EXCEL_NOTE))
        .map { items -> items.mapNotNull { it.toNoteItem() } }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    /**
     * 文件夹列表（实时流）
     */
    val folders: StateFlow<List<FolderItem>> = itemRepository.getByType(ItemType.FOLDER)
        .map { items -> items.map { it.toFolderItem() } }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    /**
     * 创建笔记
     */
    fun createNote(title: String, content: String, folderId: String? = null) {
        viewModelScope.launch {
            val payload = NotePayload(
                title = title,
                content = content,
                folderId = folderId,
                isPinned = false,
                isLocked = false,
                lockPasswordHash = null,
                tags = emptyList()
            )
            itemRepository.create(ItemType.NOTE, json.encodeToString(payload))
        }
    }
    
    /**
     * 更新笔记
     */
    fun updateNote(id: String, title: String, content: String) {
        viewModelScope.launch {
            val existing = itemRepository.getById(id) ?: return@launch
            val oldPayload = json.decodeFromString<NotePayload>(existing.payload)
            val newPayload = oldPayload.copy(title = title, content = content)
            itemRepository.update(id, json.encodeToString(newPayload))
        }
    }
    
    /**
     * 删除笔记
     */
    fun deleteNote(id: String) {
        viewModelScope.launch {
            itemRepository.softDelete(id)
        }
    }
    
    /**
     * 切换置顶状态
     */
    fun togglePinned(id: String) {
        viewModelScope.launch {
            val existing = itemRepository.getById(id) ?: return@launch
            val oldPayload = json.decodeFromString<NotePayload>(existing.payload)
            val newPayload = oldPayload.copy(isPinned = !oldPayload.isPinned)
            itemRepository.update(id, json.encodeToString(newPayload))
        }
    }
    
    /**
     * 移动笔记到文件夹
     */
    fun moveNoteToFolder(noteId: String, folderId: String?) {
        viewModelScope.launch {
            val existing = itemRepository.getById(noteId) ?: return@launch
            val oldPayload = json.decodeFromString<NotePayload>(existing.payload)
            val newPayload = oldPayload.copy(folderId = folderId)
            itemRepository.update(noteId, json.encodeToString(newPayload))
        }
    }
    
    /**
     * 选择文件夹
     */
    fun selectFolder(folderId: String?) {
        _selectedFolderId.value = folderId
        _uiState.value = _uiState.value.copy(selectedFolderId = folderId)
    }
    
    /**
     * 搜索笔记
     */
    fun search(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
    }
    
    /**
     * 触发同步
     */
    fun sync() {
        viewModelScope.launch {
            // 检查同步配置
            val syncEnabled = prefs.getBoolean("sync_enabled", false)
            val syncType = prefs.getString("sync_type", "webdav") ?: "webdav"
            // 服务器地址统一存储在 webdav_url 中
            val syncUrl = prefs.getString("webdav_url", "") ?: ""
            
            if (!syncEnabled) {
                _uiState.value = _uiState.value.copy(
                    error = "请先在设置中启用同步",
                    syncStatus = SyncStatus.OFFLINE
                )
                return@launch
            }
            
            if (syncUrl.isBlank() || (!syncUrl.startsWith("http://") && !syncUrl.startsWith("https://"))) {
                _uiState.value = _uiState.value.copy(
                    error = "请先在设置中配置同步服务器",
                    syncStatus = SyncStatus.OFFLINE
                )
                return@launch
            }
            
            // 自建服务器需要先登录
            if (syncType == "server" && !isServerLoggedIn()) {
                _uiState.value = _uiState.value.copy(
                    error = "请先在设置中登录服务器",
                    syncStatus = SyncStatus.OFFLINE
                )
                return@launch
            }
            
            _uiState.value = _uiState.value.copy(isLoading = true, syncStatus = SyncStatus.SYNCING, error = null, message = null)
            val result = syncRepository.sync()
            val now = System.currentTimeMillis()
            if (result.success) {
                prefs.edit().putLong("last_sync_time", now).apply()
                // 同步成功后重新加载 AI 配置到 SharedPreferences
                loadAiConfigFromDb()
                
                // 构建同步结果消息（与设置页面一致）
                val message = buildString {
                    append("同步成功")
                    if (result.pushed > 0 || result.pulled > 0) {
                        append(" (上传 ${result.pushed}, 下载 ${result.pulled}")
                        if (result.conflicts > 0) {
                            append(", ${result.conflicts} 个冲突")
                        }
                        append(")")
                    }
                }
                
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = null,
                    message = message,
                    syncStatus = SyncStatus.SUCCESS,
                    lastSyncTime = now
                )
            } else {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = result.error,
                    message = null,
                    syncStatus = SyncStatus.FAILED,
                    lastSyncTime = _uiState.value.lastSyncTime
                )
            }
        }
    }
    
    /**
     * 清除消息
     */
    fun clearMessage() {
        _uiState.value = _uiState.value.copy(message = null)
    }
    
    /**
     * 从数据库加载 AI 配置到 SharedPreferences（同步后调用）
     * 注意：只加载 AI 渠道配置，不覆盖功能模块开关（ai_enabled）
     */
    private suspend fun loadAiConfigFromDb() {
        try {
            val aiConfigJson = Json { 
                ignoreUnknownKeys = true 
                encodeDefaults = true
            }
            
            val items = itemRepository.getByTypeOnce(ItemType.AI_CONFIG)
            if (items.isNotEmpty()) {
                val payload = aiConfigJson.decodeFromString<com.mucheng.notes.domain.model.payload.AIConfigPayload>(items[0].payload)
                
                // 更新 SharedPreferences（不更新 ai_enabled，保持本地设置）
                val channelsJsonStr = aiConfigJson.encodeToString(
                    kotlinx.serialization.builtins.ListSerializer(com.mucheng.notes.domain.model.payload.AIChannel.serializer()),
                    payload.channels
                )
                prefs.edit()
                    // 不覆盖 ai_enabled，保持用户本地设置
                    .putString("ai_default_channel", payload.defaultChannel)
                    .putString("ai_default_model", payload.defaultModel)
                    .putString("ai_channels_json", channelsJsonStr)
                    .apply()
                
                android.util.Log.d("NotesViewModel", "AI config loaded from database after sync: ${payload.channels.size} channels")
            }
        } catch (e: Exception) {
            android.util.Log.e("NotesViewModel", "Failed to load AI config from database: ${e.message}")
        }
    }
    
    /**
     * 创建文件夹
     */
    fun createFolder(parentId: String?) {
        viewModelScope.launch {
            val payload = FolderPayload(
                name = "新建文件夹",
                parentId = parentId,
                icon = null,
                color = null
            )
            itemRepository.create(ItemType.FOLDER, json.encodeToString(payload))
        }
    }
    
    /**
     * 创建文件夹（带名称）
     */
    fun createFolder(name: String, parentId: String?) {
        viewModelScope.launch {
            val payload = FolderPayload(
                name = name,
                parentId = parentId,
                icon = null,
                color = null
            )
            itemRepository.create(ItemType.FOLDER, json.encodeToString(payload))
        }
    }
    
    /**
     * 编辑文件夹（重命名）
     */
    fun editFolder(folderId: String) {
        // TODO: 显示重命名对话框
        // 这里先实现基础逻辑，UI 对话框在 NotesScreen 中处理
        _uiState.value = _uiState.value.copy(editingFolderId = folderId)
    }
    
    /**
     * 更新文件夹名称
     */
    fun updateFolderName(folderId: String, newName: String) {
        viewModelScope.launch {
            val existing = itemRepository.getById(folderId) ?: return@launch
            val oldPayload = json.decodeFromString<FolderPayload>(existing.payload)
            val newPayload = oldPayload.copy(name = newName)
            itemRepository.update(folderId, json.encodeToString(newPayload))
            _uiState.value = _uiState.value.copy(editingFolderId = null)
        }
    }
    
    /**
     * 删除文件夹
     */
    fun deleteFolder(folderId: String) {
        viewModelScope.launch {
            // 先检查文件夹下是否有笔记
            val notesInFolder = notes.value.count { it.folderId == folderId }
            val subFolders = folders.value.count { it.parentId == folderId }
            
            if (notesInFolder > 0 || subFolders > 0) {
                _uiState.value = _uiState.value.copy(
                    error = "文件夹不为空，请先移动或删除其中的内容"
                )
                return@launch
            }
            
            itemRepository.softDelete(folderId)
            
            // 如果删除的是当前选中的文件夹，清除选择
            if (_selectedFolderId.value == folderId) {
                _selectedFolderId.value = null
                _uiState.value = _uiState.value.copy(selectedFolderId = null)
            }
        }
    }
    
    /**
     * 取消编辑文件夹
     */
    fun cancelEditFolder() {
        _uiState.value = _uiState.value.copy(editingFolderId = null)
    }
    
    /**
     * 清除错误
     */
    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }
    
    /**
     * 刷新同步配置状态
     * 在页面显示时调用，确保同步状态与设置保持一致
     */
    fun refreshSyncStatus() {
        val syncEnabled = prefs.getBoolean("sync_enabled", false)
        val syncType = prefs.getString("sync_type", "webdav") ?: "webdav"
        // 服务器地址统一存储在 webdav_url 中
        val syncUrl = prefs.getString("webdav_url", "") ?: ""
        
        // 自建服务器还需要检查是否已登录
        val serverLoggedIn = if (syncType == "server") {
            isServerLoggedIn()
        } else true
        
        val syncConfigured = syncEnabled && syncUrl.isNotBlank() && 
            (syncUrl.startsWith("http://") || syncUrl.startsWith("https://")) &&
            serverLoggedIn
        
        val lastSync = prefs.getLong("last_sync_time", 0).takeIf { it > 0 }
        
        // 只有当当前状态不是 SYNCING 时才更新状态
        if (_uiState.value.syncStatus != SyncStatus.SYNCING) {
            _uiState.value = _uiState.value.copy(
                lastSyncTime = lastSync,
                syncStatus = if (syncConfigured) SyncStatus.IDLE else SyncStatus.OFFLINE
            )
        }
    }
    
    /**
     * 验证笔记密码
     * @param noteId 笔记 ID
     * @param password 用户输入的密码
     * @return 密码是否正确
     */
    suspend fun verifyNotePassword(noteId: String, password: String): Boolean {
        val note = itemRepository.getById(noteId) ?: return false
        val payload = try {
            json.decodeFromString<NotePayload>(note.payload)
        } catch (e: Exception) {
            return false
        }
        
        if (!payload.isLocked || payload.lockPasswordHash == null) {
            return true // 未加密的笔记直接返回 true
        }
        
        val inputHash = cryptoEngine.computeHash(password)
        return inputHash == payload.lockPasswordHash
    }
    
    /**
     * 获取笔记的密码哈希
     */
    suspend fun getNotePasswordHash(noteId: String): String? {
        val note = itemRepository.getById(noteId) ?: return null
        val payload = try {
            json.decodeFromString<NotePayload>(note.payload)
        } catch (e: Exception) {
            return null
        }
        return payload.lockPasswordHash
    }
    
    /**
     * 锁定笔记
     * @param noteId 笔记 ID
     * @param password 加密密码
     */
    fun lockNote(noteId: String, password: String) {
        viewModelScope.launch {
            try {
                val existing = itemRepository.getById(noteId) ?: return@launch
                val oldPayload = json.decodeFromString<NotePayload>(existing.payload)
                val passwordHash = cryptoEngine.computeHash(password)
                val newPayload = oldPayload.copy(
                    isLocked = true,
                    lockPasswordHash = passwordHash
                )
                itemRepository.update(noteId, json.encodeToString(newPayload))
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = "锁定失败: ${e.message}")
            }
        }
    }
    
    /**
     * 解锁笔记
     * @param noteId 笔记 ID
     */
    fun unlockNote(noteId: String) {
        viewModelScope.launch {
            try {
                val existing = itemRepository.getById(noteId) ?: return@launch
                val oldPayload = json.decodeFromString<NotePayload>(existing.payload)
                val newPayload = oldPayload.copy(
                    isLocked = false,
                    lockPasswordHash = null
                )
                itemRepository.update(noteId, json.encodeToString(newPayload))
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = "解锁失败: ${e.message}")
            }
        }
    }
    
    private fun ItemEntity.toNoteItem(): NoteItem? {
        return try {
            when (this.type) {
                ItemType.NOTE.value -> {
                    val payload = json.decodeFromString<NotePayload>(this.payload)
                    NoteItem(
                        id = this.id,
                        title = payload.title,
                        content = payload.content,
                        folderId = payload.folderId,
                        isPinned = payload.isPinned,
                        isLocked = payload.isLocked,
                        tags = payload.tags,
                        updatedTime = this.updatedTime,
                        isExcelNote = false
                    )
                }
                ItemType.EXCEL_NOTE.value -> {
                    val payload = json.decodeFromString<ExcelNotePayload>(this.payload)
                    // 生成 Excel 笔记的预览内容（显示工作表数量和单元格数量）
                    val sheetCount = payload.sheets.size
                    val cellCount = payload.sheets.sumOf { sheet -> 
                        sheet.rows.sumOf { row -> row.cells.size }
                    }
                    val previewContent = "表格笔记 · ${sheetCount}个工作表 · ${cellCount}个单元格"
                    
                    NoteItem(
                        id = this.id,
                        title = payload.title,
                        content = previewContent,
                        folderId = payload.folderId,
                        isPinned = payload.isPinned,
                        isLocked = payload.isLocked,
                        tags = payload.tags,
                        updatedTime = this.updatedTime,
                        isExcelNote = true
                    )
                }
                else -> {
                    android.util.Log.w("NotesViewModel", "Unknown item type: ${this.type}")
                    null
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("NotesViewModel", "Failed to parse note payload: ${e.message}, type: ${this.type}")
            val fallbackTitle = try {
                val element = json.parseToJsonElement(this.payload)
                element.jsonObject["title"]?.jsonPrimitive?.contentOrNull
            } catch (_: Exception) { null }
            NoteItem(
                id = this.id,
                title = fallbackTitle ?: "解析错误",
                content = "",
                folderId = null,
                isPinned = false,
                isLocked = false,
                tags = emptyList(),
                updatedTime = this.updatedTime,
                isExcelNote = this.type == ItemType.EXCEL_NOTE.value
            )
        }
    }
    
    private fun ItemEntity.toFolderItem(): FolderItem {
        return try {
            val payload = json.decodeFromString<FolderPayload>(this.payload)
            android.util.Log.d("NotesViewModel", "Parsed folder: id=${this.id}, name=${payload.name}, parentId=${payload.parentId}")
            FolderItem(
                id = this.id,
                name = payload.name,
                parentId = payload.parentId,
                icon = payload.icon,
                color = payload.color
            )
        } catch (e: Exception) {
            android.util.Log.e("NotesViewModel", "Failed to parse folder payload: ${e.message}")
            // 返回一个默认的文件夹，避免崩溃
            FolderItem(
                id = this.id,
                name = "解析错误",
                parentId = null,
                icon = null,
                color = null
            )
        }
    }
}

/**
 * 笔记展示模型
 */
data class NoteItem(
    val id: String,
    val title: String,
    val content: String,
    val folderId: String?,
    val isPinned: Boolean,
    val isLocked: Boolean,
    val tags: List<String>,
    val updatedTime: Long,
    val isExcelNote: Boolean = false  // 是否为 Excel 笔记
)

/**
 * 文件夹展示模型（ViewModel 内部使用）
 */
data class FolderItem(
    val id: String,
    val name: String,
    val parentId: String?,
    val icon: String? = null,
    val color: String? = null
)
