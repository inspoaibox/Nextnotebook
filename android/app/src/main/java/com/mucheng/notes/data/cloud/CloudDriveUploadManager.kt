package com.mucheng.notes.data.cloud

import android.content.Context
import android.net.Uri
import android.util.Log
import com.mucheng.notes.data.local.dao.ItemDao
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.data.remote.WebDAVAdapter
import com.mucheng.notes.domain.model.payload.CloudFilePayload
import com.mucheng.notes.domain.model.payload.CloudUploadState
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield
import kotlinx.serialization.json.Json
import java.io.IOException
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.coroutineContext

/**
 * 网盘文件上传管理器（Android 端）。
 *
 * 职责：把用户通过 SAF 授权目录中的本地文件（[CloudDriveFolderPicker] 解析出的
 * DocumentFile），按适配器的分块上传能力推送到云端，并把回填后的 file_hash /
 * size / upload_state 等真实元数据写回 ItemEntity.payload。
 *
 * 设计要点（与 [com.mucheng.notes.data.cloud.CloudDriveDownloadManager] 镜像，
 * 但有**一处关键差异**）：
 *
 * 1. **上传要回写 payload，下载只写侧表**。
 *    下载管理器只维护 [com.mucheng.notes.data.local.entity.CloudFileLocalPathEntity]
 *    侧表、绝不碰 ItemEntity，原因是"本地下载进度"不应当作变更推回服务器造成
 *    同步风暴。而上传完成后，文件的真实 `file_hash` 是必须随同步传播的核心元数据
 *    （其它端要据此判断是否需要下载、是否一致）。因此上传完成后**会**调用
 *    [ItemDao.upsert] 写入新的 payload，并把 sync_status 置为 "modified"、
 *    local_rev +1。这与 [com.mucheng.notes.data.repository.ItemRepositoryImpl]
 *    在正常编辑后产生的变更等价，是"真实变更"而非"churn"，会顺理成章地参与下一轮
 *    push。详见下方 [commitCompletedPayload] 的实现注释。
 *
 * 2. **适配器由调用方传入**：SyncEngine 在 [setConfig] 时根据 syncType 决定使用
 *    ServerAdapterImpl（自建服务器，具备分块上传能力）还是 Hilt 注入的
 *    WebDAVAdapterImpl（WebDAV，不具备）。因此本类不从构造函数注入 WebDAVAdapter，
 *    而由 [upload] / [uploadAll] 的调用方把当前解析出的适配器传进来。
 *
 * 3. **断点续传**：把上传会话 id（upload_session_id）和已上传分块集合
 *    （uploaded_chunks）记入 payload，恢复时先调
 *    [WebDAVAdapter.getUploadStatus] 与服务端核对，跳过服务端已确认的分块。
 *
 * 4. **流式 SHA-256**：边读本地文件、边上传、边累加哈希，避免把大文件（默认上限
 *    500MB）一次性读入内存。最终把累加好的整文件哈希与服务端
 *    [com.mucheng.notes.data.remote.ChunkedUploadCompleteResult.sha256] 比对。
 *
 * 5. **并发控制**：[uploadAll] 在调用方协程作用域内通过 [Semaphore]（容量 =
 *    config.smallFileConcurrency，默认 3）限流；取消调用方协程会传播到所有子上传。
 */
@Singleton
class CloudDriveUploadManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val folderPicker: CloudDriveFolderPicker,
    private val configStore: CloudDriveConfigStore,
    private val itemDao: ItemDao
) {

    /**
     * Json 实例：与 [com.mucheng.notes.data.sync.ResourceSyncManager] 一致，使用
     * 私有实例（ignoreUnknownKeys = true），不依赖 Hilt 提供的 Json。
     */
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * 各文件的上传进度（供 UI 观察实时刷新）。
     *
     * key = cloudFileId（ItemEntity.id），value = 该文件的最新进度快照；
     * 文件上传结束（completed/error）后条目保留，由 UI 决定何时清除展示。
     */
    private val _progress = MutableStateFlow<Map<String, CloudUploadProgress>>(emptyMap())
    val progress: StateFlow<Map<String, CloudUploadProgress>> = _progress.asStateFlow()

    /**
     * 上传单个网盘文件（挂起直到完成或失败）。
     *
     * 支持协程取消：取消会在下个 [ensureActive] 检查点抛出
     * [kotlinx.coroutines.CancellationException]，此时已上传的分块进度保留在
     * payload 与服务端会话中，下次调用可继续。
     *
     * @param cloudFileId ItemEntity.id（cloud_file 主键）
     * @param payload 该 cloud_file 的 payload（提供 relativePath / size / 上次会话等）
     * @param adapter 当前同步会话解析出的适配器（需具备分块上传能力，否则返回失败）
     */
    suspend fun upload(
        cloudFileId: String,
        payload: CloudFilePayload,
        adapter: WebDAVAdapter
    ): Result<Unit> = withContext(Dispatchers.IO) {
        // 1. 能力探测：WebDAV 不支持分块上传
        if (!adapter.hasChunkedUpload()) {
            val msg = "Adapter does not support chunked upload; skipped $cloudFileId"
            Log.w(TAG, msg)
            publishProgress(cloudFileId, payload.filename, payload.size, 0L,
                CloudUploadState.ERROR, msg)
            return@withContext Result.failure(UnsupportedOperationException(msg))
        }

        // 2. 解析 SAF 源文件（未授权 / 文件被删则失败）
        val sourceFile = folderPicker.buildRelativeDocumentFile(payload.relativePath)
        if (sourceFile == null) {
            val msg = "SAF source not resolvable for ${payload.relativePath} (re-authorize folder)"
            Log.w(TAG, msg)
            publishProgress(cloudFileId, payload.filename, payload.size, 0L,
                CloudUploadState.ERROR, msg)
            return@withContext Result.failure(IllegalStateException(msg))
        }
        val sourceUri = sourceFile.uri

        // 3. 解析本地文件总大小；DocumentFile.length() 在部分 provider 上不可靠，
        //    退化时回退 payload.size
        val totalSize = sourceFile.length().takeIf { it > 0L } ?: payload.size
        if (totalSize <= 0L) {
            val msg = "Cannot determine local size for $cloudFileId"
            Log.w(TAG, msg)
            publishProgress(cloudFileId, payload.filename, 0L, 0L,
                CloudUploadState.ERROR, msg)
            return@withContext Result.failure(IllegalStateException(msg))
        }

        // 4. 文件扩展名（不含点），用于服务端落盘；从文件名或 relativePath 取
        val extension = extractExtension(payload.filename.ifBlank { payload.relativePath })

        // 5. 状态机：pending/uploading → uploading
        publishProgress(cloudFileId, payload.filename, totalSize, 0L,
            CloudUploadState.UPLOADING, null)

        // 6. 创建或恢复上传会话
        val session = openOrResumeSession(cloudFileId, adapter, payload, totalSize, extension)
        if (session == null) {
            val msg = "createChunkedUpload / resume failed for $cloudFileId"
            markError(cloudFileId, payload, msg)
            return@withContext Result.failure(IOException(msg))
        }
        val sessionId = session.sessionId
        val chunkSize = session.chunkSize.takeIf { it > 0L }
            ?: configStore.current.chunkSize.coerceAtLeast(1L)
        val totalChunks = session.totalChunks.takeIf { it > 0 }
            ?: ((totalSize + chunkSize - 1L) / chunkSize).toInt()

        // 7. 与服务端核对已上传分块（断点续传）
        val uploadedChunks: Set<Int> = runCatching {
            adapter.getUploadStatus(sessionId)?.uploadedChunks?.toSet()
        }.getOrNull() ?: emptySet()
        val resumeBytes = estimateUploadedBytes(uploadedChunks, chunkSize, totalSize)

        publishProgress(cloudFileId, payload.filename, totalSize, resumeBytes,
            CloudUploadState.UPLOADING, null)

        // 8. 流式读 + 上传 + 哈希累加
        val digest = MessageDigest.getInstance("SHA-256")
        var uploadedBytes = resumeBytes
        var chunkIndex = 0

        val streamErr = try {
            context.contentResolver.openInputStream(sourceUri).use { input ->
                if (input == null) {
                    return@use "Cannot open input stream for $sourceUri"
                }
                val buffer = ByteArray(chunkSize.coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
                while (true) {
                    coroutineContext.ensureActive()
                    // 把当前块读满（chunkSize 可能大于 buffer 已分配大小则复用）
                    val chunk = readFullChunk(input, buffer)
                    if (chunk == null || chunk.isEmpty()) break

                    // 哈希：本地累加整文件内容（无论是否跳过上传）
                    digest.update(chunk, 0, chunk.size)

                    if (chunkIndex !in uploadedChunks) {
                        val result = adapter.uploadChunk(sessionId, chunkIndex, chunk)
                        if (result == null || !result.accepted) {
                            return@use "uploadChunk failed at index $chunkIndex"
                        }
                    }

                    chunkIndex++
                    uploadedBytes = (uploadedBytes + chunk.size).coerceAtMost(totalSize)
                    publishProgress(cloudFileId, payload.filename, totalSize, uploadedBytes,
                        CloudUploadState.UPLOADING, null)
                    yield()
                }
                null
            }
        } catch (e: IOException) {
            "stream upload interrupted: ${e.message}"
        }

        if (streamErr != null) {
            // 失败：保留会话 id 以便续传，回写 payload，标 error
            val partial = payload.copy(
                size = totalSize,
                chunkSize = chunkSize,
                totalChunks = totalChunks,
                uploadSessionId = sessionId,
                uploadState = CloudUploadState.ERROR.value,
                errorMessage = streamErr
            )
            commitPartialPayload(cloudFileId, partial)
            publishProgress(cloudFileId, payload.filename, totalSize, uploadedBytes,
                CloudUploadState.ERROR, streamErr)
            return@withContext Result.failure(IOException(streamErr))
        }

        // 9. 校验分块数量
        if (chunkIndex < totalChunks) {
            val msg = "Uploaded $chunkIndex chunks but expected $totalChunks"
            runCatching { adapter.abortChunkedUpload(sessionId) }
            markError(cloudFileId, payload.copy(uploadSessionId = sessionId), msg)
            return@withContext Result.failure(IOException(msg))
        }

        // 10. 通知服务端合并
        val complete = adapter.completeChunkedUpload(sessionId)
        if (complete == null || !complete.success) {
            val msg = "completeChunkedUpload failed for session $sessionId"
            runCatching { adapter.abortChunkedUpload(sessionId) }
            markError(cloudFileId, payload.copy(uploadSessionId = sessionId), msg)
            return@withContext Result.failure(IOException(msg))
        }

        // 11. 整文件 SHA-256 校验
        val computedSha = digest.digest().joinToString("") { "%02x".format(it) }
        val remoteSha = complete.sha256
        if (remoteSha != null && remoteSha.isNotBlank() &&
            !remoteSha.equals(computedSha, ignoreCase = true)
        ) {
            val msg = "Hash mismatch after complete: local=$computedSha remote=$remoteSha"
            markError(cloudFileId, payload.copy(uploadSessionId = sessionId), msg)
            return@withContext Result.failure(SecurityException(msg))
        }

        // 12. 成功：回写 payload（含真实 file_hash / size / completed 状态），标 modified
        val now = System.currentTimeMillis()
        val finalPayload = payload.copy(
            size = totalSize,
            fileHash = computedSha,
            mimeType = completeMime(complete, payload),
            mtime = if (payload.mtime > 0L) payload.mtime else now,
            chunkSize = chunkSize,
            totalChunks = totalChunks,
            uploadedChunks = (0 until totalChunks).toList(),
            uploadSessionId = null,
            uploadState = CloudUploadState.COMPLETED.value,
            errorMessage = null,
            downloadState = payload.downloadState
        )
        commitCompletedPayload(cloudFileId, finalPayload)

        publishProgress(cloudFileId, payload.filename, totalSize, totalSize,
            CloudUploadState.COMPLETED, null)
        Log.i(TAG, "Upload completed & verified: $cloudFileId (sha256=$computedSha, " +
            "remote itemId=${complete.itemId})")
        Result.success(Unit)
    }

    /**
     * 并发上传多个文件，阻塞至全部完成。
     *
     * 并发上限由 [CloudDriveConfigStore.current.smallFileConcurrency] 决定（默认 3）。
     * 在调用方协程作用域内通过 [coroutineScope] + [async] 启动子任务，取消调用方
     * 协程会传播取消到所有子上传。
     *
     * @return 每个文件的结果（key = cloudFileId），便于调用方聚合统计
     */
    suspend fun uploadAll(
        tasks: List<Pair<String, CloudFilePayload>>,
        adapter: WebDAVAdapter
    ): Map<String, Result<Unit>> {
        if (tasks.isEmpty()) return emptyMap()
        val concurrency = configStore.current.smallFileConcurrency.coerceAtLeast(1)
        val semaphore = Semaphore(concurrency)
        return coroutineScope {
            tasks.map { (cloudFileId, payload) ->
                async {
                    semaphore.withPermit {
                        cloudFileId to runCatching { upload(cloudFileId, payload, adapter) }
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
    // 内部：上传会话管理
    // ------------------------------------------------------------------

    /**
     * 创建或恢复分块上传会话。
     *
     * 恢复策略：若 payload 已带 [CloudFilePayload.uploadSessionId]，先尝试
     * [WebDAVAdapter.getUploadStatus]；只要服务端仍能识别该会话（返回非 null
     * 且 totalChunks > 0），即复用之。否则视为会话已过期/失效，重新创建。
     *
     * 复用会话时仍返回原 sessionId 与服务端声明的 chunkSize / totalChunks，
     * 保证本地分块大小与服务端一致。
     */
    private suspend fun openOrResumeSession(
        cloudFileId: String,
        adapter: WebDAVAdapter,
        payload: CloudFilePayload,
        totalSize: Long,
        extension: String
    ): com.mucheng.notes.data.remote.ChunkedUploadSession? {
        val existing = payload.uploadSessionId?.takeIf { it.isNotBlank() }
        if (existing != null) {
            val status = runCatching { adapter.getUploadStatus(existing) }.getOrNull()
            if (status != null && status.totalChunks > 0 && !status.completed) {
                Log.i(TAG, "Resuming upload session $existing for $cloudFileId " +
                    "(uploaded=${status.uploadedChunks.size}/${status.totalChunks})")
                return com.mucheng.notes.data.remote.ChunkedUploadSession(
                    sessionId = existing,
                    chunkSize = status.chunkSize,
                    totalChunks = status.totalChunks
                )
            }
            // 已 completed 或失效，丢弃旧 sessionId
            if (status?.completed == true) {
                Log.w(TAG, "Session $existing already completed; will recreate for $cloudFileId")
            }
        }

        val chunkSize = configStore.current.chunkSize.coerceAtLeast(1L)
        val session = adapter.createChunkedUpload(cloudFileId, totalSize, chunkSize, extension)
        if (session == null) {
            Log.w(TAG, "createChunkedUpload returned null for $cloudFileId")
        }
        return session
    }

    // ------------------------------------------------------------------
    // 内部：payload 回写（关键差异点）
    // ------------------------------------------------------------------

    /**
     * 上传成功后回写 payload。
     *
     * 与下载管理器"只写侧表"不同：上传完成后，file_hash / size 是必须随同步传播
     * 的真实元数据。因此这里直接调用 [ItemDao.upsert]（REPLACE，不会自动 bump
     * local_rev），由本方法显式控制以下字段：
     *
     *   - payload：序列化后的新 CloudFilePayload（含真实 file_hash）
     *   - content_hash：基于新 payload 重算（与 ItemRepositoryImpl 保持一致：
     *     SHA-256 前 16 字符），供同步仲裁快速判断内容是否变化
     *   - updated_time：刷新为当前时间
     *   - sync_status：置为 "modified"，让下一轮 push 把这次上传的元数据传播出去
     *   - local_rev：+1，与 ItemRepositoryImpl 在 update() 中的处理一致
     *
     * 这是一次"真实变更"（文件确实被上传/更新），而非同步过程中的 churn，
     * 所以触发 push 是期望行为；下载则相反，写回 payload 会把"本地下载进度"
     * 推回服务器，故下载管理器走侧表路线。
     */
    private suspend fun commitCompletedPayload(cloudFileId: String, newPayload: CloudFilePayload) {
        val existing = itemDao.getById(cloudFileId) ?: return
        val payloadJson = json.encodeToString(CloudFilePayload.serializer(), newPayload)
        val now = System.currentTimeMillis()
        val updated = existing.copy(
            payload = payloadJson,
            contentHash = computeContentHash(payloadJson),
            updatedTime = now,
            syncStatus = "modified",
            localRev = existing.localRev + 1
        )
        itemDao.upsert(updated)
    }

    /**
     * 上传失败 / 中断时回写 payload（保留 sessionId 供续传，不重置 size）。
     *
     * 同样走 [ItemDao.upsert] 直接控制字段，但 sync_status 维持原值
     * （上传失败不应改变 clean 状态；若是 modified 状态则保持 modified），
     * 避免把"上传失败"误报为内容变更触发 push。
     */
    private suspend fun commitPartialPayload(cloudFileId: String, newPayload: CloudFilePayload) {
        val existing = itemDao.getById(cloudFileId) ?: return
        val payloadJson = json.encodeToString(CloudFilePayload.serializer(), newPayload)
        val updated = existing.copy(payload = payloadJson)
        itemDao.upsert(updated)
    }

    /** 标 error 并回写 payload（保留原 sync_status，不触发 push）。 */
    private suspend fun markError(
        cloudFileId: String,
        payload: CloudFilePayload,
        message: String
    ) {
        Log.w(TAG, "Upload error for $cloudFileId: $message")
        val errPayload = payload.copy(
            uploadState = CloudUploadState.ERROR.value,
            errorMessage = message
        )
        commitPartialPayload(cloudFileId, errPayload)
        publishProgress(cloudFileId, payload.filename, payload.size, 0L,
            CloudUploadState.ERROR, message)
    }

    // ------------------------------------------------------------------
    // 内部：流式读取
    // ------------------------------------------------------------------

    /** 从 input 尽量读满 [buffer] 的一整块；返回实际读到的字节数组（可能小于 buffer）。 */
    private fun readFullChunk(
        input: java.io.InputStream,
        buffer: ByteArray
    ): ByteArray? {
        var read = input.read(buffer)
        if (read <= 0) return null
        var total = read
        while (total < buffer.size) {
            val n = input.read(buffer, total, buffer.size - total)
            if (n <= 0) break
            total += n
        }
        return if (total == buffer.size) buffer else buffer.copyOf(total)
    }

    // ------------------------------------------------------------------
    // 内部：辅助
    // ------------------------------------------------------------------

    /** 估算已上传字节数（仅用于进度展示，服务端不依赖此值）。 */
    private fun estimateUploadedBytes(uploadedChunks: Set<Int>, chunkSize: Long, totalSize: Long): Long {
        if (uploadedChunks.isEmpty()) return 0L
        val lastFullChunk = uploadedChunks.maxOrNull() ?: return 0L
        // 简化估算：已上传块数 × chunkSize（末块可能更短，进度展示用够用）
        val approx = uploadedChunks.size.toLong() * chunkSize
        return approx.coerceIn(0L, totalSize.coerceAtLeast(lastFullChunk.toLong()))
    }

    /** 从文件名提取扩展名（不含点，转小写）；无扩展名返回空串。 */
    private fun extractExtension(name: String): String {
        val dot = name.lastIndexOf('.')
        if (dot < 0 || dot == name.length - 1) return ""
        return name.substring(dot + 1).lowercase().take(16)
    }

    /** complete 返回结果可能不覆盖 mimeType，沿用 payload 原值。 */
    private fun completeMime(
        complete: com.mucheng.notes.data.remote.ChunkedUploadCompleteResult,
        payload: CloudFilePayload
    ): String = payload.mimeType.ifBlank { "application/octet-stream" }

    /**
     * 计算 content_hash（SHA-256 前 16 字符）。
     * 与 [com.mucheng.notes.data.repository.ItemRepositoryImpl.computeContentHash] 完全一致。
     */
    private fun computeContentHash(content: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(content.toByteArray(Charsets.UTF_8))
        return hashBytes.joinToString("") { "%02x".format(it) }.take(16)
    }

    // ------------------------------------------------------------------
    // 内部：进度发布
    // ------------------------------------------------------------------

    private fun publishProgress(
        cloudFileId: String,
        filename: String,
        totalBytes: Long,
        uploadedBytes: Long,
        state: CloudUploadState,
        errorMessage: String?
    ) {
        _progress.update { current ->
            current + (cloudFileId to CloudUploadProgress(
                cloudFileId = cloudFileId,
                filename = filename,
                totalBytes = totalBytes,
                uploadedBytes = uploadedBytes,
                state = state,
                errorMessage = errorMessage
            ))
        }
    }

    companion object {
        private const val TAG = "CloudDriveUploadMgr"
    }
}

/**
 * 单个文件的上传进度快照（暴露给 UI）。
 *
 * 与 [CloudDownloadProgress] 形状镜像，便于 UI 复用同一份进度组件。
 */
data class CloudUploadProgress(
    val cloudFileId: String,
    val filename: String,
    val totalBytes: Long,
    val uploadedBytes: Long,
    val state: CloudUploadState,
    val errorMessage: String? = null
) {
    /** 进度百分比 0..1，totalBytes 未知时返回 0 */
    val fraction: Float
        get() = if (totalBytes > 0L) (uploadedBytes.toFloat() / totalBytes).coerceIn(0f, 1f) else 0f

    /** 是否处于终态（无需再刷新） */
    val isTerminal: Boolean
        get() = state == CloudUploadState.COMPLETED || state == CloudUploadState.ERROR
}
