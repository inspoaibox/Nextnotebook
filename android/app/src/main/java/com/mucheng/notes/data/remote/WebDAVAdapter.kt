package com.mucheng.notes.data.remote

import com.mucheng.notes.data.local.entity.ItemEntity

/**
 * 远程变更记录
 */
data class RemoteChange(
    val id: String,
    val type: String,
    val action: String, // "create", "update", "delete"
    val item: ItemEntity?,
    val timestamp: Long
)

/**
 * 变更列表结果
 */
data class ChangeListResult(
    val changes: List<RemoteChange>,
    val nextCursor: String?,
    val hasMore: Boolean
)

/**
 * 同步游标
 */
@kotlinx.serialization.Serializable
data class SyncCursor(
    val cursor: String,
    val timestamp: Long
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
     * 获取同步锁
     */
    suspend fun acquireLock(deviceId: String, timeout: Long): Boolean
    
    /**
     * 释放同步锁
     */
    suspend fun releaseLock(deviceId: String): Boolean
    
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
}
