package com.mucheng.notes.presentation.viewmodel

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.payload.BookmarkFolderPayload
import com.mucheng.notes.domain.model.payload.BookmarkPayload
import com.mucheng.notes.domain.repository.ItemRepository
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

/**
 * 书签 UI 状态
 */
data class BookmarksUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val selectedFolderId: String? = null,
    val searchQuery: String = ""
)

/**
 * 书签视图模型
 */
@HiltViewModel
class BookmarksViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val itemRepository: ItemRepository
) : ViewModel() {
    
    private val json = Json { 
        ignoreUnknownKeys = true 
        isLenient = true
        coerceInputValues = true  // 将 null 转换为默认值
    }
    
    private val _uiState = MutableStateFlow(BookmarksUiState())
    val uiState: StateFlow<BookmarksUiState> = _uiState.asStateFlow()
    
    private val _selectedFolderId = MutableStateFlow<String?>(null)
    val selectedFolderId: StateFlow<String?> = _selectedFolderId.asStateFlow()
    
    /**
     * 书签列表（实时流）
     */
    val bookmarks: StateFlow<List<BookmarkItem>> = itemRepository.getByType(ItemType.BOOKMARK)
        .map { items -> items.map { it.toBookmarkItem() } }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    /**
     * 书签文件夹列表（实时流）
     */
    val folders: StateFlow<List<BookmarkFolderItem>> = itemRepository.getByType(ItemType.BOOKMARK_FOLDER)
        .map { items -> items.map { it.toBookmarkFolderItem() } }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    /**
     * 创建书签
     */
    fun createBookmark(
        name: String,
        url: String,
        description: String = "",
        folderId: String? = null
    ) {
        viewModelScope.launch {
            val payload = BookmarkPayload(
                name = name,
                url = url,
                description = description,
                folderId = folderId,
                icon = null,
                tags = emptyList()
            )
            itemRepository.create(ItemType.BOOKMARK, json.encodeToString(payload))
        }
    }
    
    /**
     * 更新书签
     */
    fun updateBookmark(id: String, name: String, url: String, description: String, folderId: String? = null) {
        viewModelScope.launch {
            val existing = itemRepository.getById(id) ?: return@launch
            val oldPayload = json.decodeFromString<BookmarkPayload>(existing.payload)
            val newPayload = oldPayload.copy(
                name = name, 
                url = url, 
                description = description,
                folderId = folderId
            )
            itemRepository.update(id, json.encodeToString(newPayload))
        }
    }
    
    /**
     * 删除书签
     */
    fun deleteBookmark(id: String) {
        viewModelScope.launch {
            itemRepository.softDelete(id)
        }
    }
    
    /**
     * 打开书签（在浏览器中）
     */
    fun openBookmark(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            _uiState.value = _uiState.value.copy(error = "无法打开链接")
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
     * 搜索书签
     */
    fun search(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
    }
    
    /**
     * 创建文件夹
     */
    fun createFolder(parentId: String?) {
        viewModelScope.launch {
            val payload = BookmarkFolderPayload(name = "新建文件夹", parentId = parentId)
            itemRepository.create(ItemType.BOOKMARK_FOLDER, json.encodeToString(payload))
        }
    }
    
    /**
     * 创建文件夹（带名称）
     */
    fun createFolder(name: String, parentId: String?) {
        viewModelScope.launch {
            val payload = BookmarkFolderPayload(name = name, parentId = parentId)
            itemRepository.create(ItemType.BOOKMARK_FOLDER, json.encodeToString(payload))
        }
    }
    
    /**
     * 重命名文件夹
     */
    fun renameFolder(id: String, newName: String) {
        viewModelScope.launch {
            val existing = itemRepository.getById(id) ?: return@launch
            val oldPayload = json.decodeFromString<BookmarkFolderPayload>(existing.payload)
            val newPayload = oldPayload.copy(name = newName)
            itemRepository.update(id, json.encodeToString(newPayload))
        }
    }
    
    /**
     * 删除文件夹
     */
    fun deleteFolder(id: String) {
        viewModelScope.launch {
            // 将该文件夹下的书签移到根目录
            val bookmarksInFolder = bookmarks.value.filter { it.folderId == id }
            bookmarksInFolder.forEach { bookmark ->
                val existing = itemRepository.getById(bookmark.id) ?: return@forEach
                val oldPayload = json.decodeFromString<BookmarkPayload>(existing.payload)
                val newPayload = oldPayload.copy(folderId = null)
                itemRepository.update(bookmark.id, json.encodeToString(newPayload))
            }
            
            // 将子文件夹移到根目录
            val subFolders = folders.value.filter { it.parentId == id }
            subFolders.forEach { folder ->
                val existing = itemRepository.getById(folder.id) ?: return@forEach
                val oldPayload = json.decodeFromString<BookmarkFolderPayload>(existing.payload)
                val newPayload = oldPayload.copy(parentId = null)
                itemRepository.update(folder.id, json.encodeToString(newPayload))
            }
            
            // 删除文件夹
            itemRepository.softDelete(id)
        }
    }
    
    /**
     * 移动书签到文件夹
     */
    fun moveBookmarkToFolder(bookmarkId: String, folderId: String?) {
        viewModelScope.launch {
            val existing = itemRepository.getById(bookmarkId) ?: return@launch
            val oldPayload = json.decodeFromString<BookmarkPayload>(existing.payload)
            val newPayload = oldPayload.copy(folderId = folderId)
            itemRepository.update(bookmarkId, json.encodeToString(newPayload))
        }
    }
    
    private fun ItemEntity.toBookmarkItem(): BookmarkItem {
        val payload = json.decodeFromString<BookmarkPayload>(this.payload)
        return BookmarkItem(
            id = this.id,
            name = payload.name,
            url = payload.url,
            description = payload.description,
            folderId = payload.folderId,
            icon = payload.icon,
            tags = payload.tags,
            updatedTime = this.updatedTime
        )
    }
    
    private fun ItemEntity.toBookmarkFolderItem(): BookmarkFolderItem {
        val payload = json.decodeFromString<BookmarkFolderPayload>(this.payload)
        return BookmarkFolderItem(
            id = this.id,
            name = payload.name,
            parentId = payload.parentId
        )
    }
}

/**
 * 书签展示模型
 */
data class BookmarkItem(
    val id: String,
    val name: String,
    val url: String,
    val description: String,
    val folderId: String?,
    val icon: String?,
    val tags: List<String>,
    val updatedTime: Long
)

/**
 * 书签文件夹展示模型
 */
data class BookmarkFolderItem(
    val id: String,
    val name: String,
    val parentId: String?
)
