/**
 * 网盘文件浏览器 - Android ViewModel
 *
 * 提供云端文件浏览器的状态与交互逻辑：
 * - 文件夹层级导航（根目录 → 逐层钻入）
 * - SAF 文件选取 → 落盘到授权目录 → 创建 cloud_file 记录 → 触发同步上传
 * - 单个文件按需下载（调用 [SyncEngine.downloadCloudFile]）
 * - 打开已下载文件（通过侧表 documentUri 复用 ACTION_VIEW 逻辑）
 * - 新建文件夹、删除（软删 + 同步）
 */

package com.mucheng.notes.presentation.viewmodel

import android.app.Application
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.documentfile.provider.DocumentFile
import com.mucheng.notes.data.cloud.CloudDriveConfigStore
import com.mucheng.notes.data.cloud.CloudDriveDownloadManager
import com.mucheng.notes.data.cloud.CloudDriveFolderPicker
import com.mucheng.notes.data.cloud.CloudDrivePathIdentity
import com.mucheng.notes.data.cloud.CloudDriveUploadManager
import com.mucheng.notes.data.cloud.CloudDownloadProgress
import com.mucheng.notes.data.cloud.CloudUploadProgress
import com.mucheng.notes.data.local.dao.CloudFileLocalPathDao
import com.mucheng.notes.data.local.entity.CloudLocalAvailabilityValues
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.data.sync.SyncEngine
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.SyncResult
import com.mucheng.notes.domain.model.payload.CloudFilePayload
import com.mucheng.notes.domain.model.payload.CloudFolderPayload
import com.mucheng.notes.domain.repository.ItemRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.IOException
import javax.inject.Inject

/**
 * 单层文件夹/文件展示项（已解码 payload，方便 UI 直接渲染）
 */
data class CloudDriveItem(
    val entity: ItemEntity,
    val name: String,
    val size: Long,
    val mimeType: String,
    val mtime: Long,
    val isFolder: Boolean,
    val relativePath: String = "",
    val parentFolderId: String? = null,
)

/**
 * 浏览历史中的一层
 */
data class CloudDriveFolderStackEntry(
    val folderId: String,
    val name: String,
    val relativePath: String = "",
)

data class CloudDriveUiState(
    val authorized: Boolean = false,
    val stack: List<CloudDriveFolderStackEntry> = emptyList(),
    val items: List<CloudDriveItem> = emptyList(),
    val uploadProgress: Map<String, CloudUploadProgress> = emptyMap(),
    val downloadProgress: Map<String, CloudDownloadProgress> = emptyMap(),
    val localAvailability: Map<String, String> = emptyMap(),
    val isLoading: Boolean = false,
    val syncError: String? = null,
    val snackbarMessage: String? = null,
) {
    /** 当前所在文件夹 ID（栈顶，栈空时为根目录 "root"） */
    val currentFolderId: String
        get() = stack.lastOrNull()?.folderId ?: "root"

    /** 当前所在文件夹显示名 */
    val currentFolderName: String
        get() = stack.lastOrNull()?.name ?: "网盘"

    /** 是否在根目录 */
    val isAtRoot: Boolean
        get() = stack.isEmpty()
}

@HiltViewModel
class CloudDriveViewModel @Inject constructor(
    application: Application,
    private val syncEngine: SyncEngine,
    private val itemRepository: ItemRepository,
    private val configStore: CloudDriveConfigStore,
    private val folderPicker: CloudDriveFolderPicker,
    private val uploadManager: CloudDriveUploadManager,
    private val downloadManager: CloudDriveDownloadManager,
    private val localPathDao: CloudFileLocalPathDao,
) : AndroidViewModel(application) {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
        coerceInputValues = true
    }

    private val _uiState = MutableStateFlow(CloudDriveUiState())
    val uiState: StateFlow<CloudDriveUiState> = _uiState.asStateFlow()

    // 上传/下载进度直接映射自两个 Manager 的 StateFlow，UI 可独立订阅或读 uiState

    init {
        viewModelScope.launch {
            // 配置授权状态变化时刷新
            configStore.configFlow.collect { cfg ->
                val authorized = cfg.watchedRootPath != null && folderPicker.resolveRootDocumentFile() != null
                _uiState.update { it.copy(authorized = authorized) }
                refresh()
            }
        }

        viewModelScope.launch {
            uploadManager.progress.collect { progress ->
                _uiState.update { it.copy(uploadProgress = progress) }
            }
        }

        viewModelScope.launch {
            downloadManager.progress.collect { progress ->
                _uiState.update { it.copy(downloadProgress = progress) }
            }
        }

        viewModelScope.launch {
            refreshLocalAvailability()
        }
    }

    /** 进入屏幕/授权变更时刷新当前文件夹内容 */
    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, syncError = null) }
            val folderId = _uiState.value.currentFolderId
            val items = loadItems(folderId)
            refreshLocalAvailability()
            _uiState.update { it.copy(items = items, isLoading = false) }
        }
    }

    /** 打开一个子文件夹（入栈） */
    fun openFolder(folderId: String, name: String, relativePath: String = "") {
        viewModelScope.launch {
            _uiState.update { state ->
                state.copy(
                    stack = state.stack + CloudDriveFolderStackEntry(
                        folderId = folderId,
                        name = name,
                        relativePath = normalizeCloudPath(relativePath),
                    )
                )
            }
            _uiState.update { it.copy(isLoading = true) }
            val items = loadItems(folderId)
            _uiState.update { it.copy(items = items, isLoading = false) }
        }
    }

    /** 返回上一级文件夹（出栈） */
    fun navigateUp(): Boolean {
        val current = _uiState.value
        if (current.isAtRoot) return false
        viewModelScope.launch {
            val newStack = current.stack.dropLast(1)
            val folderId = newStack.lastOrNull()?.folderId ?: "root"
            _uiState.update { it.copy(stack = newStack, isLoading = true) }
            val items = loadItems(folderId)
            _uiState.update { it.copy(items = items, isLoading = false) }
        }
        return true
    }

    /**
     * 处理 SAF 文件选取结果：将选中的 Uri 逐个落盘到授权目录并创建 cloud_file 记录，
     * 随后触发同步上传。
     *
     * @param uris OpenDocument 返回的 content Uri 列表
     */
    fun uploadFiles(uris: List<Uri>) {
        if (uris.isEmpty()) return
        viewModelScope.launch {
            val parentFolderId = _uiState.value.currentFolderId
            var successCount = 0
            var lastError: String? = null
            for (uri in uris) {
                val err = materializeAndCreateCloudFile(uri, parentFolderId)
                if (err == null) {
                    successCount++
                } else {
                    lastError = err
                }
            }

            // 有新增 → 触发同步
            if (successCount > 0) {
                val result = syncEngine.sync()
                _uiState.update { it.copy(syncError = result.error) }
            }

            val msg = buildString {
                append("已添加 $successCount 个文件")
                if (lastError != null) append("（部分失败：$lastError）")
            }
            _uiState.update { it.copy(snackbarMessage = msg) }
            refresh()
        }
    }

    /** 新建文件夹 */
    fun createFolder(name: String) {
        if (name.isBlank()) return
        viewModelScope.launch {
            val parentFolderId = _uiState.value.currentFolderId
            // 计算新文件夹相对路径：根目录下直接用 name；子目录下拼 "父级相对路径/name"，
            // 与桌面端 onFolderAdded 写入的 relative_path 保持一致（云端路径前缀）
            val folderRelPath = relativeFolderPath(parentFolderId)
            val relativePath = if (folderRelPath.isBlank()) name.trim() else "$folderRelPath/${name.trim()}"
            val folderId = CloudDrivePathIdentity.deriveId(relativePath)
            val payload = CloudFolderPayload(
                name = name.trim(),
                parentFolderId = CloudDrivePathIdentity.deriveParentFolderId(relativePath),
                relativePath = relativePath,
            )
            val payloadJson = json.encodeToString(payload)
            if (itemRepository.getById(folderId) != null) {
                itemRepository.update(folderId, payloadJson)
            } else {
                itemRepository.createWithId(folderId, ItemType.CLOUD_FOLDER, payloadJson)
            }
            syncEngine.sync()
            _uiState.update { it.copy(snackbarMessage = "已新建文件夹「${name.trim()}」") }
            refresh()
        }
    }

    /**
     * 删除文件/文件夹（软删 + 同步）。
     *
     * 若删除的是文件夹，会先递归收集其全部子孙（子文件夹 + 子文件）并一并软删，
     * 避免留下指向已删除父文件夹的孤儿记录。子孙收集复用 [loadItems] 的内存过滤
     * 方案（DAO 的 getByFolderId 对 cloud_* 类型存在 key 不匹配）。
     */
    fun deleteItem(id: String) {
        viewModelScope.launch {
            val target = itemRepository.getById(id)
            val idsToDelete = mutableListOf<String>()
            if (target?.type == ItemType.CLOUD_FOLDER.value) {
                // 文件夹：级联软删全部子孙，再删自身
                val descendants = withContext(Dispatchers.IO) { collectDescendantIds(id) }
                idsToDelete.addAll(descendants)
            }
            idsToDelete.add(id)
            withContext(Dispatchers.IO) {
                for (targetId in idsToDelete) {
                    cleanupLocalCloudArtifacts(targetId)
                    itemRepository.softDelete(targetId)
                }
            }
            syncEngine.sync()
            _uiState.update { it.copy(snackbarMessage = "已删除") }
            refresh()
        }
    }

    /**
     * 在内存中收集 [folderId] 的全部子孙 item id（不含 [folderId] 本身）。
     * 广度优先遍历：加载所有未删除的 CLOUD_FOLDER / CLOUD_FILE。
     * 兼容两条链路：
     * - 旧 Android 本地创建项：按 parentFolderId 建立父→子映射；
     * - 桌面端/服务端生成项：按 relative_path 前缀识别子树。
     */
    private suspend fun collectDescendantIds(folderId: String): List<String> = withContext(Dispatchers.IO) {
        val folders = itemRepository.getByTypeOnce(ItemType.CLOUD_FOLDER)
        val files = itemRepository.getByTypeOnce(ItemType.CLOUD_FILE)
        val targetFolderPath = normalizeCloudPath(
            folders.firstOrNull { it.id == folderId && it.deletedTime == null }?.let { entity ->
                runCatching {
                    json.decodeFromString<CloudFolderPayload>(entity.payload).relativePath
                }.getOrNull()
            }.orEmpty()
        )

        // 建立 parentFolderId -> 子 item id 列表 的映射（同时覆盖文件夹与文件两类）
        val childrenByParent = mutableMapOf<String, MutableList<String>>()
        for (entity in folders) {
            if (entity.deletedTime != null) continue
            val payload = runCatching {
                json.decodeFromString<CloudFolderPayload>(entity.payload)
            }.getOrNull() ?: continue
            val parent = payload.parentFolderId
            if (parent != null) {
                childrenByParent.getOrPut(parent) { mutableListOf() }.add(entity.id)
            }
        }
        for (entity in files) {
            if (entity.deletedTime != null) continue
            val payload = runCatching {
                json.decodeFromString<CloudFilePayload>(entity.payload)
            }.getOrNull() ?: continue
            val parent = payload.parentFolderId
            if (parent.isNotBlank()) {
                childrenByParent.getOrPut(parent) { mutableListOf() }.add(entity.id)
            }
        }

        // BFS：从待删文件夹向下展开
        val result = mutableListOf<String>()
        val queue = ArrayDeque<String>()
        childrenByParent[folderId]?.let { queue.addAll(it) }
        while (queue.isNotEmpty()) {
            val current = queue.removeFirst()
            if (current in result) continue  // 防御环路
            result.add(current)
            childrenByParent[current]?.let { queue.addAll(it) }
        }

        if (targetFolderPath.isNotBlank()) {
            val prefix = "$targetFolderPath/"
            for (entity in folders) {
                if (entity.id == folderId || entity.deletedTime != null) continue
                val payload = runCatching {
                    json.decodeFromString<CloudFolderPayload>(entity.payload)
                }.getOrNull() ?: continue
                if (normalizeCloudPath(payload.relativePath).startsWith(prefix)) {
                    result.add(entity.id)
                }
            }
            for (entity in files) {
                if (entity.deletedTime != null) continue
                val payload = runCatching {
                    json.decodeFromString<CloudFilePayload>(entity.payload)
                }.getOrNull() ?: continue
                if (normalizeCloudPath(payload.relativePath).startsWith(prefix)) {
                    result.add(entity.id)
                }
            }
        }

        result.distinct()
    }

    /**
     * 清理 Android 端网盘文件的本地落盘痕迹：
     * - 删除 SAF DocumentFile（best-effort）
     * - 删除 cloud_file_local_path 侧表记录
     *
     * 仅对 cloud_file 生效；cloud_folder 与其它类型直接跳过。
     */
    private suspend fun cleanupLocalCloudArtifacts(itemId: String) {
        val item = itemRepository.getById(itemId) ?: return
        if (item.type != ItemType.CLOUD_FILE.value) return

        val record = localPathDao.getByCloudFileId(itemId)
        if (record != null) {
            runCatching {
                DocumentFile.fromSingleUri(getApplication(), Uri.parse(record.documentUri))
                    ?.takeIf { it.exists() }
                    ?.delete()
            }
            localPathDao.delete(itemId)
        }
    }

    private suspend fun refreshLocalAvailability() = withContext(Dispatchers.IO) {
        val local = localPathDao.getAll().associate { it.cloudFileId to it.availability }
        _uiState.update { it.copy(localAvailability = local) }
    }

    /** 按需下载单个文件（不依赖 autoDownload 配置） */
    fun downloadFile(cloudFileId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(snackbarMessage = "开始下载…") }
            val result = syncEngine.downloadCloudFile(cloudFileId)
            result.onSuccess {
                _uiState.update { it.copy(snackbarMessage = "下载完成") }
            }.onFailure { e ->
                _uiState.update {
                    it.copy(snackbarMessage = "下载失败：${e.message ?: "未知错误"}")
                }
            }
            refreshLocalAvailability()
            refresh()
        }
    }

    fun setLocalAvailability(cloudFileId: String, availability: String) {
        viewModelScope.launch {
            when (availability) {
                CloudLocalAvailabilityValues.ONLINE_ONLY -> {
                    cleanupLocalCloudArtifacts(cloudFileId)
                    _uiState.update { it.copy(snackbarMessage = "已释放本地空间") }
                }
                CloudLocalAvailabilityValues.LOCAL,
                CloudLocalAvailabilityValues.OFFLINE -> {
                    val result = syncEngine.downloadCloudFile(cloudFileId)
                    _uiState.update {
                        it.copy(
                            snackbarMessage = if (result.isSuccess) {
                                if (availability == CloudLocalAvailabilityValues.OFFLINE) "已保存为离线文件" else "已下载到本机"
                            } else {
                                "下载失败：${result.exceptionOrNull()?.message ?: "未知错误"}"
                            }
                        )
                    }
                    if (result.isFailure) {
                        refreshLocalAvailability()
                        return@launch
                    }
                    val record = localPathDao.getByCloudFileId(cloudFileId)
                    if (record != null) {
                        localPathDao.updateAvailability(cloudFileId, availability)
                    }
                }
            }
            refreshLocalAvailability()
            refresh()
        }
    }

    fun setFolderLocalAvailability(folderId: String, availability: String, relativePath: String = "") {
        viewModelScope.launch {
            val targetPath = normalizeCloudPath(relativePath).ifBlank { normalizeCloudPath(relativeFolderPath(folderId)) }
            val files = itemRepository.getByTypeOnce(ItemType.CLOUD_FILE)
            var changed = 0
            for (entity in files) {
                if (entity.deletedTime != null) continue
                val payload = runCatching {
                    json.decodeFromString<CloudFilePayload>(entity.payload)
                }.getOrNull() ?: continue
                val rel = normalizeCloudPath(payload.relativePath)
                val inFolder = if (targetPath.isBlank()) {
                    true
                } else {
                    rel == targetPath || rel.startsWith("$targetPath/")
                }
                if (!inFolder) continue
                when (availability) {
                    CloudLocalAvailabilityValues.ONLINE_ONLY -> {
                        cleanupLocalCloudArtifacts(entity.id)
                        changed++
                    }
                    CloudLocalAvailabilityValues.LOCAL,
                    CloudLocalAvailabilityValues.OFFLINE -> {
                        val result = syncEngine.downloadCloudFile(entity.id)
                        if (result.isSuccess) {
                            localPathDao.getByCloudFileId(entity.id)?.let {
                                localPathDao.updateAvailability(entity.id, availability)
                            }
                            changed++
                        }
                    }
                }
            }
            _uiState.update {
                it.copy(
                    snackbarMessage = if (changed > 0) {
                        if (availability == CloudLocalAvailabilityValues.ONLINE_ONLY) {
                            "已释放 $changed 个文件的本地空间"
                        } else {
                            "已为 $changed 个文件设置离线保存"
                        }
                    } else {
                        "当前目录没有可更新的文件"
                    }
                )
            }
            refreshLocalAvailability()
            refresh()
        }
    }

    /** 判断该文件是否已下载完成（用于决定点击是直接打开还是先下载） */
    suspend fun isDownloaded(cloudFileId: String): Boolean = withContext(Dispatchers.IO) {
        val record = localPathDao.getByCloudFileId(cloudFileId) ?: return@withContext false
        record.state == "completed" && runCatching {
            DocumentFile.fromSingleUri(getApplication(), Uri.parse(record.documentUri))?.exists() == true
        }.getOrDefault(false)
    }

    /**
     * 打开已下载的文件（通过侧表记录的 documentUri，复用 ACTION_VIEW + 读权限授权模式）。
     *
     * 调用方（Screen）应在确认 [isDownloaded] 为 true 后再调用。
     */
    suspend fun openDownloadedFile(cloudFileId: String) = withContext(Dispatchers.IO) {
        val context = getApplication<Application>()
        val record = localPathDao.getByCloudFileId(cloudFileId) ?: run {
            withContext(Dispatchers.Main) {
                Toast.makeText(context, "文件尚未下载", Toast.LENGTH_SHORT).show()
            }
            return@withContext
        }
        val item = itemRepository.getById(cloudFileId)
        val payload = item?.let { runCatching { json.decodeFromString<CloudFilePayload>(it.payload) }.getOrNull() }
        val filename = payload?.filename.orEmpty()
        val mimeType = payload?.mimeType.takeIf { !it.isNullOrBlank() } ?: "application/octet-stream"
        val isApk = mimeType == "application/vnd.android.package-archive" ||
            filename.lowercase().endsWith(".apk")

        val uri = Uri.parse(record.documentUri)
        val intent = if (isApk) {
            Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        } else {
            Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }

        withContext(Dispatchers.Main) {
            try {
                if (isApk) {
                    context.startActivity(intent)
                } else {
                    val chooser = Intent.createChooser(intent, "打开文件").apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    context.startActivity(chooser)
                }
            } catch (e: ActivityNotFoundException) {
                Toast.makeText(context, "没有可打开此文件的应用", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /** UI 消费 Snackbar 后清空消息 */
    fun consumeSnackbar() {
        _uiState.update { it.copy(snackbarMessage = null) }
    }

    // ---------- 内部实现 ----------

    /**
     * 从本地数据中读取指定文件夹下的所有未删除项，
     * 优先按 relative_path 还原目录结构；缺失路径的旧数据再回退到 parent_folder_id。
     *
     * 这与桌面端/云服务端页面保持一致：目录展示以 payload.relative_path 为准。
     */
    private suspend fun loadItems(folderId: String): List<CloudDriveItem> = withContext(Dispatchers.IO) {
        val targetParent = folderId
        val targetFolderPath = normalizeCloudPath(relativeFolderPath(folderId))
        val folders = itemRepository.getByTypeOnce(ItemType.CLOUD_FOLDER)
        val files = itemRepository.getByTypeOnce(ItemType.CLOUD_FILE)

        val folderItems = folders.mapNotNull { entity ->
            if (entity.deletedTime != null) return@mapNotNull null
            val payload = runCatching {
                json.decodeFromString<CloudFolderPayload>(entity.payload)
            }.getOrNull() ?: return@mapNotNull null
            val explicitPath = normalizeCloudPath(payload.relativePath)
            val folderRelPath = explicitPath.ifBlank { normalizeCloudPath(payload.name) }
            val belongsByPath = explicitPath.isNotBlank() &&
                parentCloudPath(explicitPath) == targetFolderPath
            val belongsById = when {
                targetParent == "root" -> payload.parentFolderId == null || payload.parentFolderId == "root"
                else -> payload.parentFolderId == targetParent
            }
            if (explicitPath.isNotBlank()) {
                if (!belongsByPath) return@mapNotNull null
            } else if (!belongsById) {
                return@mapNotNull null
            }
            CloudDriveItem(
                entity = entity,
                name = payload.name.ifBlank { baseCloudName(folderRelPath).ifBlank { "(未命名文件夹)" } },
                size = 0L,
                mimeType = "",
                mtime = entity.updatedTime,
                isFolder = true,
                relativePath = folderRelPath,
                parentFolderId = payload.parentFolderId,
            )
        }

        val fileItems = files.mapNotNull { entity ->
            if (entity.deletedTime != null) return@mapNotNull null
            val payload = runCatching {
                json.decodeFromString<CloudFilePayload>(entity.payload)
            }.getOrNull() ?: return@mapNotNull null
            val explicitPath = normalizeCloudPath(payload.relativePath)
            val fileRelPath = explicitPath.ifBlank { normalizeCloudPath(payload.filename) }
            val belongsByPath = explicitPath.isNotBlank() &&
                parentCloudPath(explicitPath) == targetFolderPath
            val belongsById = when {
                targetParent == "root" -> payload.parentFolderId == "root" || payload.parentFolderId.isBlank()
                else -> payload.parentFolderId == targetParent
            }
            if (explicitPath.isNotBlank()) {
                if (!belongsByPath) return@mapNotNull null
            } else if (!belongsById) {
                return@mapNotNull null
            }
            CloudDriveItem(
                entity = entity,
                name = payload.filename.ifBlank { baseCloudName(fileRelPath).ifBlank { "(未命名文件)" } },
                size = payload.size,
                mimeType = payload.mimeType,
                mtime = payload.mtime.takeIf { it > 0 } ?: entity.updatedTime,
                isFolder = false,
                relativePath = fileRelPath,
                parentFolderId = payload.parentFolderId,
            )
        }

        // 文件夹在前，按名称排序
        (folderItems + fileItems).sortedWith(
            compareByDescending<CloudDriveItem> { it.isFolder }
                .thenBy { it.name.lowercase() }
        )
    }

    /**
     * 把单个 SAF Uri 落盘到授权目录的当前文件夹下，并创建 CLOUD_FILE 记录。
     *
     * @return null 表示成功，非空字符串表示失败原因
     */
    private suspend fun materializeAndCreateCloudFile(uri: Uri, parentFolderId: String): String? =
        withContext(Dispatchers.IO) {
            val context = getApplication<Application>()
            val cr = context.contentResolver

            // 1. 从 Uri 解析文件名 + mime + 大小
            val filename = runCatching {
                cr.query(uri, null, null, null, null)?.use { c ->
                    val nameIdx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (c.moveToFirst() && nameIdx >= 0) c.getString(nameIdx) else null
                }
            }.getOrNull() ?: uri.lastPathSegment ?: "file_${System.currentTimeMillis()}"

            val mimeType = runCatching { cr.getType(uri) }.getOrNull()
                ?.takeIf { it.isNotBlank() && it != "application/octet-stream" }
                ?: guessMimeFromExtension(filename)

            val size = runCatching {
                cr.query(uri, null, null, null, null)?.use { c ->
                    val sizeIdx = c.getColumnIndex(android.provider.OpenableColumns.SIZE)
                    if (c.moveToFirst() && sizeIdx >= 0) c.getLong(sizeIdx) else 0L
                } ?: 0L
            }.getOrNull() ?: 0L

            // 2. 计算落盘相对路径：网盘/当前文件夹路径/filename
            val folderRelPath = relativeFolderPath(parentFolderId)
            val relativePath = if (folderRelPath.isBlank()) filename else "$folderRelPath/$filename"

            // 3. 通过 folderPicker 落盘（自动创建中间目录 + 目标文件）
            val target = folderPicker.buildRelativeDocumentFile(relativePath) ?: run {
                return@withContext "无法访问授权目录"
            }

            // 4. 流式拷贝 picked Uri → 目标 DocumentFile
            val copyErr = try {
                cr.openInputStream(uri).use { input ->
                    if (input == null) {
                        return@use "无法读取所选文件"
                    }
                    cr.openOutputStream(target.uri).use { output ->
                        if (output == null) {
                            return@use "无法写入目标文件"
                        }
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n <= 0) break
                            output.write(buf, 0, n)
                        }
                    }
                    null
                }
            } catch (e: IOException) {
                "拷贝文件失败：${e.message}"
            }
            if (copyErr != null) return@withContext copyErr

            // 5. 创建 CLOUD_FILE 记录
            val cloudFileId = CloudDrivePathIdentity.deriveId(relativePath)
            val payload = CloudFilePayload(
                filename = filename,
                mimeType = mimeType,
                size = target.length().takeIf { it > 0 } ?: size,
                parentFolderId = CloudDrivePathIdentity.deriveParentFolderId(relativePath),
                relativePath = relativePath,
                mtime = System.currentTimeMillis(),
            )
            val payloadJson = json.encodeToString(payload)
            if (itemRepository.getById(cloudFileId) != null) {
                itemRepository.update(cloudFileId, payloadJson)
            } else {
                itemRepository.createWithId(cloudFileId, ItemType.CLOUD_FILE, payloadJson)
            }
            null
        }

    /**
     * 根据当前栈的 parentFolderId 解析该文件夹在授权目录下的相对路径前缀。
     * 根目录返回空字符串。
     */
    private suspend fun relativeFolderPath(folderId: String): String = withContext(Dispatchers.IO) {
        if (folderId == "root") return@withContext ""
        // 顺栈查找名字链
        val stack = _uiState.value.stack
        stack.firstOrNull { it.folderId == folderId && it.relativePath.isNotBlank() }?.let {
            return@withContext it.relativePath
        }
        val folderPayload = itemRepository.getById(folderId)?.let { entity ->
            runCatching {
                json.decodeFromString<CloudFolderPayload>(entity.payload)
            }.getOrNull()
        }
        normalizeCloudPath(folderPayload?.relativePath.orEmpty()).takeIf { it.isNotBlank() }?.let {
            return@withContext it
        }
        // 栈里每层 name 即目录名；若 folderId 命中栈中某层，则取到那层的路径
        val builder = StringBuilder()
        for (entry in stack) {
            if (builder.isNotEmpty()) builder.append('/')
            builder.append(entry.name)
            if (entry.folderId == folderId) break
        }
        normalizeCloudPath(builder.toString())
    }

    private fun normalizeCloudPath(path: String): String =
        path.replace('\\', '/')
            .trim()
            .trim('/')
            .split('/')
            .filter { it.isNotBlank() }
            .joinToString("/")

    private fun parentCloudPath(path: String): String {
        val normalized = normalizeCloudPath(path)
        if (normalized.isBlank()) return ""
        val slash = normalized.lastIndexOf('/')
        return if (slash < 0) "" else normalized.substring(0, slash)
    }

    private fun baseCloudName(path: String): String =
        normalizeCloudPath(path).substringAfterLast('/')

    private fun guessMimeFromExtension(filename: String): String {
        val lower = filename.lowercase()
        return when {
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
            lower.endsWith(".png") -> "image/png"
            lower.endsWith(".gif") -> "image/gif"
            lower.endsWith(".webp") -> "image/webp"
            lower.endsWith(".pdf") -> "application/pdf"
            lower.endsWith(".txt") -> "text/plain"
            lower.endsWith(".zip") -> "application/zip"
            lower.endsWith(".apk") -> "application/vnd.android.package-archive"
            else -> "application/octet-stream"
        }
    }
}
