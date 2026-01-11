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
}

/**
 * 密钥指纹验证结果
 */
data class KeyFingerprintResult(
    val valid: Boolean,
    val remoteFingerprint: String?
)
