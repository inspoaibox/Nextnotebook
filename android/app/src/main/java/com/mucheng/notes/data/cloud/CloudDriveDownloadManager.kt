package com.mucheng.notes.data.cloud

import android.content.Context
import android.net.Uri
import android.util.Log
import com.mucheng.notes.data.local.dao.CloudFileLocalPathDao
import com.mucheng.notes.data.local.entity.CloudFileLocalPathEntity
import com.mucheng.notes.data.remote.RemoteFileInfo
import com.mucheng.notes.data.remote.WebDAVAdapter
import com.mucheng.notes.domain.model.payload.CloudDownloadState
import com.mucheng.notes.domain.model.payload.CloudFilePayload
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield
import java.io.IOException
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.coroutineContext

/**
 * 网盘文件下载管理器（Android 端）。
 *
 * 职责：把云端 [CloudFilePayload] 描述的二进制内容，通过适配器的 Range 下载能力
 * 落盘到用户通过 SAF 授权的目录（[CloudDriveFolderPicker] 解析出的 DocumentFile）。
 *
 * 设计要点（与 [com.mucheng.notes.data.sync.ResourceSyncManager] 对齐）：
 *
 * 1. **只维护侧表，不回写 payload**：下载进度 / 状态 / 校验哈希全部写入
 *    [CloudFileLocalPathEntity] 侧表，与 ResourceSyncManager 只写 ResourceCacheEntity
 *    完全一致。这样不会触发 ItemEntity 的 sync_status=modified，避免把"本地下载进度"
 *    当作变更推回服务器造成同步风暴。payload 中的 download_state / downloaded_size
 *    字段仅作信息展示用，由同步仲裁从远端拉取时覆盖。
 *
 * 2. **适配器由调用方传入**：SyncEngine 在 [setConfig] 时根据 syncType 决定使用
 *    ServerAdapterImpl（自建服务器，具备 Range/分块能力）还是 Hilt 注入的
 *    WebDAVAdapterImpl（WebDAV，不具备）。因此本类不从构造函数注入 WebDAVAdapter，
 *    而由 [download] / [downloadAll] 的调用方把当前解析出的适配器传进来。
 *
 * 3. **断点续传**：从侧表 [CloudFileLocalPathEntity.downloadedSize] 处续传，
 *    使用 contentResolver.openOutputStream(uri, "wa") 追加写。
 *
 * 4. **完整性校验**：下载完成后流式计算整文件 SHA-256，与 [CloudFilePayload.fileHash]
 *    比对；不一致则清空已下载字节、重置为 error 状态，并整文件重试一次。
 *
 * 5. **并发控制**：[downloadAll] 在调用方协程作用域内通过 [Semaphore]（容量 =
 *    config.downloadConcurrency，默认 2）限流；取消调用方协程会传播到所有子下载。
 */
@Singleton
class CloudDriveDownloadManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val folderPicker: CloudDriveFolderPicker,
    private val configStore: CloudDriveConfigStore,
    private val localPathDao: CloudFileLocalPathDao
) {

    /**
     * 各文件的下载进度（供 UI 观察实时刷新）。
     *
     * key = cloudFileId（ItemEntity.id），value = 该文件的最新进度快照；
     * 文件下载结束（completed/error）后条目保留，由 UI 决定何时清除展示。
     */
    private val _progress = MutableStateFlow<Map<String, CloudDownloadProgress>>(emptyMap())
    val progress: StateFlow<Map<String, CloudDownloadProgress>> = _progress.asStateFlow()

    /**
     * 下载单个网盘文件（挂起直到完成或失败）。
     *
     * 支持协程取消：取消会在下个 [ensureActive] 检查点抛出
     * [kotlinx.coroutines.CancellationException]，此时侧表保留已下载进度以便续传。
     *
     * @param cloudFileId ItemEntity.id（cloud_file 主键）
     * @param payload 该 cloud_file 的 payload（提供 size / fileHash / relativePath）
     * @param adapter 当前同步会话解析出的适配器（需具备 Range 能力，否则返回失败）
     */
    suspend fun download(
        cloudFileId: String,
        payload: CloudFilePayload,
        adapter: WebDAVAdapter
    ): Result<Unit> = withContext(Dispatchers.IO) {
        // 1. 能力探测：WebDAV 不支持 Range 下载
        if (!adapter.hasRangeDownload()) {
            val msg = "Adapter does not support Range download; skipped $cloudFileId"
            Log.w(TAG, msg)
            publishProgress(cloudFileId, payload.filename, payload.size, 0L,
                CloudDownloadState.ERROR, msg)
            return@withContext Result.failure(UnsupportedOperationException(msg))
        }

        // 2. 解析 SAF 目标文件（未授权 / 目录被删则失败）
        val targetFile = folderPicker.buildRelativeDocumentFile(payload.relativePath)
        if (targetFile == null) {
            val msg = "SAF target not resolvable for ${payload.relativePath} (re-authorize folder)"
            Log.w(TAG, msg)
            publishProgress(cloudFileId, payload.filename, payload.size, 0L,
                CloudDownloadState.ERROR, msg)
            return@withContext Result.failure(IllegalStateException(msg))
        }
        val documentUri = targetFile.uri.toString()

        // 3. 解析远端总大小（Range:0-0 探测，失败回退 payload.size）
        val totalSize = resolveTotalSize(cloudFileId, payload, adapter)
        if (totalSize <= 0L) {
            val msg = "Cannot determine remote size for $cloudFileId"
            Log.w(TAG, msg)
            publishProgress(cloudFileId, payload.filename, 0L, 0L,
                CloudDownloadState.ERROR, msg)
            return@withContext Result.failure(IllegalStateException(msg))
        }

        // 4. 读取/创建侧表记录（含断点续传偏移），标记为 downloading
        val existing = localPathDao.getByCloudFileId(cloudFileId)
        val resumeFrom = existing
            ?.takeIf { it.documentUri == documentUri && it.state != CloudDownloadState.ERROR.value }
            ?.downloadedSize
            ?.coerceIn(0L, totalSize)
            ?: 0L
        val baseRecord = (existing?.copy(documentUri = documentUri, relativePath = payload.relativePath)
            ?: CloudFileLocalPathEntity(
                cloudFileId = cloudFileId,
                documentUri = documentUri,
                relativePath = payload.relativePath
            )).copy(
            downloadedSize = resumeFrom,
            state = CloudDownloadState.DOWNLOADING.value,
            errorMessage = null
        )
        localPathDao.upsert(baseRecord)
        publishProgress(cloudFileId, payload.filename, totalSize, resumeFrom,
            CloudDownloadState.DOWNLOADING, null)

        // 5. 下载 + 校验循环（hash 不匹配时整文件重试一次）
        var attempt = 0
        var startOffset = resumeFrom
        while (true) {
            coroutineContext.ensureActive()

            val transferErr = transferRanges(
                cloudFileId, payload, adapter, documentUri, totalSize, startOffset
            )
            if (transferErr != null) {
                // 网络类失败：保留续传偏移，标 error（不整文件重试，Range 已续传）
                localPathDao.updateProgress(cloudFileId, startOffset,
                    CloudDownloadState.ERROR.value, null, null, transferErr)
                publishProgress(cloudFileId, payload.filename, totalSize, startOffset,
                    CloudDownloadState.ERROR, transferErr)
                return@withContext Result.failure(IOException(transferErr))
            }

            // 完整性校验（流式 SHA-256）
            val computed = runCatching { computeDocumentFileHash(Uri.parse(documentUri)) }
            if (computed.isFailure) {
                val err = "hash compute failed: ${computed.exceptionOrNull()?.message}"
                localPathDao.updateProgress(cloudFileId, totalSize,
                    CloudDownloadState.ERROR.value, null, null, err)
                publishProgress(cloudFileId, payload.filename, totalSize, totalSize,
                    CloudDownloadState.ERROR, err)
                return@withContext Result.failure(IOException(err))
            }

            val actualHash = computed.getOrThrow()
            if (actualHash.equals(payload.fileHash, ignoreCase = true) || payload.fileHash.isBlank()) {
                // 校验通过（远端无 hash 时跳过强校验，仅记录实际哈希）
                val now = System.currentTimeMillis()
                localPathDao.updateProgress(cloudFileId, totalSize,
                    CloudDownloadState.COMPLETED.value, actualHash, now, null)
                publishProgress(cloudFileId, payload.filename, totalSize, totalSize,
                    CloudDownloadState.COMPLETED, null)
                Log.i(TAG, "Download completed & verified: $cloudFileId (sha256=$actualHash)")
                return@withContext Result.success(Unit)
            }

            // hash 不匹配：截断本地文件，整文件重试
            attempt++
            if (attempt > MAX_VERIFY_RETRIES) {
                val err = "Hash verification failed after $MAX_VERIFY_RETRIES retries " +
                    "(expected=${payload.fileHash}, last=$actualHash)"
                localPathDao.updateProgress(cloudFileId, 0L,
                    CloudDownloadState.ERROR.value, null, null, err)
                publishProgress(cloudFileId, payload.filename, totalSize, 0L,
                    CloudDownloadState.ERROR, err)
                return@withContext Result.failure(SecurityException(err))
            }
            Log.w(TAG, "Hash mismatch for $cloudFileId (attempt $attempt): " +
                "expected=${payload.fileHash} actual=$actualHash — retrying from scratch")
            runCatching { truncateDocumentFile(documentUri) }
                .onFailure { Log.w(TAG, "truncate failed (will overwrite on retry): ${it.message}") }
            startOffset = 0L
            publishProgress(cloudFileId, payload.filename, totalSize, 0L,
                CloudDownloadState.DOWNLOADING, null)
        }
        @Suppress("UNREACHABLE_CODE")
        Result.failure(IllegalStateException("unreachable"))
    }

    /**
     * 并发下载多个文件，阻塞至全部完成。
     *
     * 并发上限由 [CloudDriveConfigStore.current.downloadConcurrency] 决定（默认 2）。
     * 在调用方协程作用域内通过 [coroutineScope] + [async] 启动子任务，取消调用方
     * 协程会传播取消到所有子下载。
     *
     * @return 每个文件的结果（key = cloudFileId），便于调用方聚合统计
     */
    suspend fun downloadAll(
        tasks: List<Pair<String, CloudFilePayload>>,
        adapter: WebDAVAdapter
    ): Map<String, Result<Unit>> {
        if (tasks.isEmpty()) return emptyMap()
        val concurrency = configStore.current.downloadConcurrency.coerceAtLeast(1)
        val semaphore = Semaphore(concurrency)
        return coroutineScope {
            tasks.map { (cloudFileId, payload) ->
                async {
                    semaphore.withPermit {
                        cloudFileId to runCatching { download(cloudFileId, payload, adapter) }
                            .let { it.fold({ it }, { e -> Result.failure(e) }) }
                    }
                }
            }.awaitAll().toMap()
        }
    }

    /** 清除某个文件的进度展示（UI 用，不影响正在进行的任务）。 */
    fun clearProgress(cloudFileId: String) {
        _progress.update { current -> current - cloudFileId }
    }

    /** 清除所有进度展示。 */
    fun clearAllProgress() {
        _progress.value = emptyMap()
    }

    // ------------------------------------------------------------------
    // 内部：Range 分块下载
    // ------------------------------------------------------------------

    /**
     * 从 [startOffset] 开始按 [CloudDriveConfigStore.current.downloadChunkSize] 分块下载，
     * 追加写入 DocumentFile，实时刷新侧表与进度流。
     *
     * @return null 表示传输完成；非 null 为错误信息（调用方据此标 error）。
     *         遇到协程取消会抛 [kotlinx.coroutines.CancellationException]，不在此捕获。
     */
    private suspend fun transferRanges(
        cloudFileId: String,
        payload: CloudFilePayload,
        adapter: WebDAVAdapter,
        documentUri: String,
        totalSize: Long,
        startOffset: Long
    ): String? {
        val chunkSize = configStore.current.downloadChunkSize.coerceAtLeast(1L)
        var offset = startOffset.coerceIn(0L, totalSize)
        var firstChunk = true

        while (offset < totalSize) {
            coroutineContext.ensureActive()
            yield()

            val remaining = totalSize - offset
            // 最后一块可能不足 chunkSize：传 0 让适配器取到 EOF，
            // 否则传完整 chunkSize（适配器按 Range:start-(start+chunkSize-1) 取）
            val effective = if (remaining <= chunkSize) 0L else chunkSize

            val bytesResult = adapter.downloadFileRange(cloudFileId, offset, effective)
            if (bytesResult.isFailure) {
                return "Range download failed at offset $offset: " +
                    "${bytesResult.exceptionOrNull()?.message}"
            }
            val bytes = bytesResult.getOrThrow()
            if (bytes.isEmpty()) {
                return "Empty range response at offset $offset"
            }

            // 首块：resume 时追加写（"wa"），全新/重试时截断写（"w"）；后续块一律追加
            val append = !firstChunk || startOffset > 0L
            try {
                appendBytes(documentUri, bytes, append)
            } catch (e: IOException) {
                return "write failed at offset $offset: ${e.message}"
            }
            firstChunk = false
            offset += bytes.size

            localPathDao.updateProgress(cloudFileId, offset,
                CloudDownloadState.DOWNLOADING.value, null, null, null)
            publishProgress(cloudFileId, payload.filename, totalSize, offset,
                CloudDownloadState.DOWNLOADING, null)
        }
        return null
    }

    /**
     * 解析远端文件总大小：优先 Range:0-0 探测，失败回退到 [payload.size]。
     */
    private suspend fun resolveTotalSize(
        cloudFileId: String,
        payload: CloudFilePayload,
        adapter: WebDAVAdapter
    ): Long {
        val info: RemoteFileInfo? = runCatching { adapter.getRemoteFileInfo(cloudFileId) }
            .getOrNull()
        val remote = info?.size?.takeIf { it > 0L }
        if (remote != null) return remote
        if (payload.size > 0L) {
            Log.w(TAG, "getRemoteFileInfo unavailable, falling back to payload.size for $cloudFileId")
            return payload.size
        }
        return 0L
    }

    // ------------------------------------------------------------------
    // 内部：DocumentFile I/O
    // ------------------------------------------------------------------

    /** 追加字节到 DocumentFile（append=true 时用 "wa" 模式续写，否则 "w" 截断写）。 */
    private fun appendBytes(documentUri: String, bytes: ByteArray, append: Boolean) {
        val mode = if (append) "wa" else "w"
        val uri = Uri.parse(documentUri)
        context.contentResolver.openOutputStream(uri, mode).use { os ->
            if (os == null) throw IOException("Cannot open output stream for $documentUri")
            os.write(bytes)
            os.flush()
        }
    }

    /** 截断 DocumentFile 到 0 字节（hash 校验失败重试前调用）。 */
    private fun truncateDocumentFile(documentUri: String) {
        val uri = Uri.parse(documentUri)
        context.contentResolver.openOutputStream(uri, "wt").use { os ->
            if (os == null) throw IOException("Cannot truncate $documentUri")
            // "wt" 模式打开即截断，无需写内容
        }
    }

    /**
     * 流式计算 DocumentFile 的 SHA-256（避免一次性把大文件读入内存）。
     * 与 [com.mucheng.notes.data.sync.ResourceSyncManager] 的哈希算法保持一致。
     */
    private suspend fun computeDocumentFileHash(uri: Uri): String = withContext(Dispatchers.IO) {
        val digest = MessageDigest.getInstance("SHA-256")
        context.contentResolver.openInputStream(uri).use { input ->
            if (input == null) throw IOException("Cannot open input stream for $uri")
            val buffer = ByteArray(HASH_BUFFER_SIZE)
            var read = input.read(buffer)
            while (read > 0) {
                coroutineContext.ensureActive()
                digest.update(buffer, 0, read)
                read = input.read(buffer)
            }
        }
        digest.digest().joinToString("") { "%02x".format(it) }
    }

    // ------------------------------------------------------------------
    // 内部：进度发布
    // ------------------------------------------------------------------

    private fun publishProgress(
        cloudFileId: String,
        filename: String,
        totalBytes: Long,
        downloadedBytes: Long,
        state: CloudDownloadState,
        errorMessage: String?
    ) {
        _progress.update { current ->
            current + (cloudFileId to CloudDownloadProgress(
                cloudFileId = cloudFileId,
                filename = filename,
                totalBytes = totalBytes,
                downloadedBytes = downloadedBytes,
                state = state,
                errorMessage = errorMessage
            ))
        }
    }

    companion object {
        private const val TAG = "CloudDriveDownloadMgr"

        /** hash 校验失败后的最大整文件重试次数（首次下载算第 0 次） */
        private const val MAX_VERIFY_RETRIES = 1

        /** 流式哈希计算的缓冲区（64KB） */
        private const val HASH_BUFFER_SIZE = 64 * 1024
    }
}

/**
 * 单个文件的下载进度快照（暴露给 UI）。
 *
 * 与侧表 [CloudFileLocalPathEntity] 字段对应，但是只读视图，避免 UI 直接访问 DAO。
 */
data class CloudDownloadProgress(
    val cloudFileId: String,
    val filename: String,
    val totalBytes: Long,
    val downloadedBytes: Long,
    val state: CloudDownloadState,
    val errorMessage: String? = null
) {
    /** 进度百分比 0..1，totalBytes 未知时返回 0 */
    val fraction: Float
        get() = if (totalBytes > 0L) (downloadedBytes.toFloat() / totalBytes).coerceIn(0f, 1f) else 0f

    /** 是否处于终态（无需再刷新） */
    val isTerminal: Boolean
        get() = state == CloudDownloadState.COMPLETED || state == CloudDownloadState.ERROR
}
