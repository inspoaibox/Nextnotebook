package com.mucheng.notes.data.remote

import com.mucheng.notes.data.local.entity.ItemEntity
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 远程变更记录 - 与桌面端 RemoteChange 完全一致
 *
 * 对应桌面端 src/core/sync/StorageAdapter.ts 中的 RemoteChange 接口
 */
@Serializable
data class RemoteChange(
    @SerialName("change_id")
    val changeId: Long,           // 变更ID = 时间戳

    @SerialName("item_id")
    val itemId: String,           // 数据项ID

    val type: String,             // 数据类型

    @SerialName("updated_time")
    val updatedTime: Long,        // 更新时间

    @SerialName("deleted_time")
    val deletedTime: Long?,       // 删除时间

    @SerialName("content_hash")
    val contentHash: String       // 内容哈希
)

/**
 * 变更列表结果
 */
@Serializable
data class ChangeListResult(
    val changes: List<RemoteChange>,
    val nextCursor: String?,
    val hasMore: Boolean
)

/**
 * 同步游标 - 与桌面端 SyncCursor 完全一致
 */
@Serializable
data class SyncCursor(
    val cursor: String,           // 最后处理的变更文件名 (如 "1704537600000.json")
    @SerialName("updated_at")
    val timestamp: Long           // 游标更新时间
)

/**
 * WebDAV 适配器接口
 * 提供与 WebDAV 服务器的交互
 */
interface WebDAVAdapter {
    
    /**
     * 测试连接
     */
    suspend fun testConnection(): Boolean
    
    /**
     * 获取单个项目
     */
    suspend fun getItem(id: String): ItemEntity?
    
    /**
     * 上传项目
     * @return 远程版本号 (etag)
     */
    suspend fun putItem(item: ItemEntity): Result<String>
    
    /**
     * 删除项目
     */
    suspend fun deleteItem(id: String): Boolean
    
    /**
     * 获取变更列表
     */
    suspend fun listChanges(cursor: String?, limit: Int = 100): ChangeListResult
    
    /**
     * 获取同步游标
     */
    suspend fun getSyncCursor(): SyncCursor?
    
    /**
     * 设置同步游标
     */
    suspend fun setSyncCursor(cursor: SyncCursor): Boolean
    
    // 资源文件操作
    
    /**
     * 上传资源文件
     */
    suspend fun uploadResource(resourceId: String, data: ByteArray): Result<String>
    
    /**
     * 下载资源文件
     */
    suspend fun downloadResource(resourceId: String): Result<ByteArray>
    
    /**
     * 删除资源文件
     */
    suspend fun deleteResource(resourceId: String): Boolean
    
    /**
     * 列出所有资源文件
     */
    suspend fun listResources(): List<String>
    
    // 密钥标识符操作

    /**
     * 获取远端密钥标识符
     */
    suspend fun getKeyIdentifier(): String?

    /**
     * 设置远端密钥标识符
     */
    suspend fun setKeyIdentifier(keyId: String): Boolean

    /**
     * 检查远端是否有数据
     * 用于判断是否为首次同步
     */
    suspend fun hasData(): Boolean

    /**
     * 全量拉取所有数据项（新客户端首次同步或游标过期时使用）
     * @return 所有数据项列表
     */
    suspend fun listAllItems(): List<ItemEntity>

    /**
     * 检查游标是否已过期（对应的变更记录已被清理）
     */
    suspend fun isCursorExpired(cursor: String): Boolean

    /**
     * 获取全量拉取后的最新 change_id（仅自建服务器有效）
     */
    fun getLastFullPullChangeId(): Long?

    // 密钥指纹验证

    /**
     * 获取远端密钥指纹
     */
    suspend fun getKeyFingerprint(): String?

    /**
     * 保存密钥指纹
     */
    suspend fun saveKeyFingerprint(fingerprint: String): Boolean

    /**
     * 验证密钥指纹
     */
    suspend fun verifyKeyFingerprint(localFingerprint: String): KeyFingerprintResult

    // ========== 网盘（cloud_drive）扩展能力 ==========
    //
    // 以下方法均带默认实现：WebDAV 适配器（WebDAVAdapterImpl）不具备
    // Range 下载 / 分块上传能力，因此默认返回 false / null / 失败，
    // 由调用方（CloudDriveDownloadManager / UploadManager）做能力探测后降级。
    // 自建服务器适配器（ServerAdapterImpl）覆写这些方法以提供真实能力。
    //
    // 服务端契约与桌面端 ServerAdapter.ts 保持一致：
    //   - Range 下载复用 GET /api/resources/:id + Range 头
    //   - 分块上传复用 /api/resources/upload/:sessionId/*
    // cloud_file / cloud_folder 仅是 ItemEntity.payload 上的元数据层，
    // 二进制 I/O 与 resource 完全相同。

    /**
     * 是否支持 Range（断点续传）下载。
     */
    fun hasRangeDownload(): Boolean = false

    /**
     * 是否支持分块上传。
     */
    fun hasChunkedUpload(): Boolean = false

    /**
     * 探测远端资源大小（用 Range: bytes=0-0 探测，不下载正文）。
     * @return 远端文件信息，不支持时返回 null。
     */
    suspend fun getRemoteFileInfo(itemId: String): RemoteFileInfo? = null

    /**
     * 按 Range 下载一段字节。
     * @param start 起始字节偏移（含）
     * @param chunkSize 本块大小；为 0 表示从 start 到文件末尾
     * @return 该段字节；不支持时返回失败。
     */
    suspend fun downloadFileRange(itemId: String, start: Long, chunkSize: Long): Result<ByteArray> =
        Result.failure(UnsupportedOperationException("Range download not supported"))

    /**
     * 创建分块上传会话。
     * @param itemId 目标 ItemEntity id（若为新建文件可由服务端分配）
     * @param totalSize 文件总大小
     * @param chunkSize 建议分块大小
     * @param extension 文件扩展名（不含点），用于服务端落盘
     * @return 上传会话；不支持时返回 null。
     */
    suspend fun createChunkedUpload(
        itemId: String,
        totalSize: Long,
        chunkSize: Long,
        extension: String
    ): ChunkedUploadSession? = null

    /**
     * 上传单个分块。
     * @param sessionId 上传会话 id
     * @param chunkIndex 分块序号（从 0 起）
     * @param data 分块字节
     * @return 分块上传结果；不支持或失败返回 null。
     */
    suspend fun uploadChunk(
        sessionId: String,
        chunkIndex: Int,
        data: ByteArray
    ): ChunkUploadResult? = null

    /**
     * 完成分块上传（服务端合并落盘 + 返回 item_id / sha256）。
     */
    suspend fun completeChunkedUpload(sessionId: String): ChunkedUploadCompleteResult? = null

    /**
     * 查询分块上传进度（用于断点续传校验）。
     */
    suspend fun getUploadStatus(sessionId: String): ChunkedUploadStatus? = null

    /**
     * 中止分块上传会话（服务端 TTL 自动回收，失败可忽略）。
     */
    suspend fun abortChunkedUpload(sessionId: String): Boolean = false
}

/**
 * 密钥指纹验证结果
 */
data class KeyFingerprintResult(
    val valid: Boolean,
    val remoteFingerprint: String?
)

// ========== 网盘（cloud_drive）扩展能力的辅助数据类 ==========
// 字段命名与桌面端 ServerAdapter.ts / shared/types/index.ts 保持一致。

/**
 * 远端文件探测结果（来自 Range: bytes=0-0 + Content-Range 头）。
 */
data class RemoteFileInfo(
    val size: Long,
    val mimeType: String? = null,
    val mtime: Long? = null
)

/**
 * 分块上传会话（POST /api/resources/upload 返回）。
 */
@Serializable
data class ChunkedUploadSession(
    @SerialName("session_id")
    val sessionId: String,

    @SerialName("chunk_size")
    val chunkSize: Long,

    @SerialName("total_chunks")
    val totalChunks: Int
)

/**
 * 单块上传结果（PUT /api/resources/upload/:sessionId/chunk 返回）。
 */
@Serializable
data class ChunkUploadResult(
    val accepted: Boolean = false,
    val duplicate: Boolean = false
)

/**
 * 完成分块上传结果（POST /api/resources/upload/:sessionId/complete 返回）。
 */
@Serializable
data class ChunkedUploadCompleteResult(
    val success: Boolean = false,

    @SerialName("item_id")
    val itemId: String? = null,

    val location: String? = null,

    val size: Long = 0,

    val sha256: String? = null
)

/**
 * 分块上传进度查询结果（GET /api/resources/upload/:sessionId/status 返回）。
 */
@Serializable
data class ChunkedUploadStatus(
    @SerialName("total_chunks")
    val totalChunks: Int = 0,

    @SerialName("chunk_size")
    val chunkSize: Long = 0,

    @SerialName("total_size")
    val totalSize: Long = 0,

    @SerialName("uploaded_chunks")
    val uploadedChunks: List<Int> = emptyList(),

    val completed: Boolean = false
)
