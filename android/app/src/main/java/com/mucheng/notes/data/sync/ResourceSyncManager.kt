package com.mucheng.notes.data.sync

import com.mucheng.notes.data.local.dao.ItemDao
import com.mucheng.notes.data.local.dao.ResourceCacheDao
import com.mucheng.notes.data.local.entity.ResourceCacheEntity
import com.mucheng.notes.data.remote.WebDAVAdapter
import com.mucheng.notes.domain.model.payload.ResourcePayload
import kotlinx.serialization.json.Json
import java.io.File
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 资源文件同步管理器
 * 
 * 负责资源文件（图片、附件等）的上传、下载和本地缓存管理。
 * 资源文件的本地路径不参与同步，使用单独的 resource_cache 表管理。
 */
@Singleton
class ResourceSyncManager @Inject constructor(
    private val webDAVAdapter: WebDAVAdapter,
    private val itemDao: ItemDao,
    private val resourceCacheDao: ResourceCacheDao,
    private val cacheDir: File
) {
    
    private val json = Json { ignoreUnknownKeys = true }
    
    /**
     * 上传本地资源到 WebDAV
     * @param resourceId items 表中的 resource 记录 ID
     */
    suspend fun uploadResource(resourceId: String): Result<Unit> {
        // 获取本地缓存路径
        val cache = resourceCacheDao.getByResourceId(resourceId)
            ?: return Result.failure(Exception("No local cache for resource: $resourceId"))
        
        val localFile = File(cache.localPath)
        if (!localFile.exists()) {
            return Result.failure(Exception("Local file not found: ${cache.localPath}"))
        }
        
        // 获取 ResourcePayload 验证哈希
        val item = itemDao.getById(resourceId)
            ?: return Result.failure(Exception("Resource item not found: $resourceId"))
        
        val payload = try {
            json.decodeFromString<ResourcePayload>(item.payload)
        } catch (e: Exception) {
            return Result.failure(Exception("Failed to parse ResourcePayload: ${e.message}"))
        }
        
        val data = localFile.readBytes()
        val hash = computeSHA256(data)
        
        // 验证哈希一致性
        if (hash != payload.fileHash) {
            return Result.failure(Exception("Hash mismatch: expected ${payload.fileHash}, got $hash"))
        }
        
        return webDAVAdapter.uploadResource(resourceId, data)
            .map { /* 上传成功 */ }
    }
    
    /**
     * 下载远程资源到本地缓存
     * @param resourceId items 表中的 resource 记录 ID
     */
    suspend fun downloadResource(resourceId: String): Result<File> {
        // 获取 ResourcePayload 以验证下载的文件
        val item = itemDao.getById(resourceId)
            ?: return Result.failure(Exception("Resource item not found: $resourceId"))
        
        val payload = try {
            json.decodeFromString<ResourcePayload>(item.payload)
        } catch (e: Exception) {
            return Result.failure(Exception("Failed to parse ResourcePayload: ${e.message}"))
        }
        
        val result = webDAVAdapter.downloadResource(resourceId)
        return result.mapCatching { data ->
            // 验证下载文件的哈希
            val hash = computeSHA256(data)
            if (hash != payload.fileHash) {
                throw Exception("Downloaded file hash mismatch: expected ${payload.fileHash}, got $hash")
            }
            
            // 确保缓存目录存在
            if (!cacheDir.exists()) {
                cacheDir.mkdirs()
            }
            
            // 保存到本地缓存
            val cacheFile = File(cacheDir, resourceId)
            cacheFile.writeBytes(data)
            
            // 更新缓存记录
            val now = System.currentTimeMillis()
            resourceCacheDao.upsert(
                ResourceCacheEntity(
                    resourceId = resourceId,
                    localPath = cacheFile.absolutePath,
                    downloadedAt = now,
                    lastAccessedAt = now
                )
            )
            
            cacheFile
        }
    }
    
    /**
     * 获取资源文件（优先本地缓存，否则下载）
     * @param resourceId items 表中的 resource 记录 ID
     */
    suspend fun getResource(resourceId: String): Result<File> {
        val cache = resourceCacheDao.getByResourceId(resourceId)
        if (cache != null) {
            val file = File(cache.localPath)
            if (file.exists()) {
                // 更新访问时间
                resourceCacheDao.upsert(
                    cache.copy(lastAccessedAt = System.currentTimeMillis())
                )
                return Result.success(file)
            }
        }
        return downloadResource(resourceId)
    }
    
    /**
     * 删除资源（本地缓存和远程）
     * @param resourceId items 表中的 resource 记录 ID
     */
    suspend fun deleteResource(resourceId: String): Result<Unit> {
        // 删除本地缓存
        val cache = resourceCacheDao.getByResourceId(resourceId)
        if (cache != null) {
            val file = File(cache.localPath)
            if (file.exists()) {
                file.delete()
            }
            resourceCacheDao.delete(resourceId)
        }
        
        // 删除远程资源
        return try {
            webDAVAdapter.deleteResource(resourceId)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    /**
     * 清理过期缓存
     * @param maxAge 最大缓存时间（毫秒），默认 7 天
     */
    suspend fun cleanupCache(maxAge: Long = 7 * 24 * 60 * 60 * 1000L) {
        val threshold = System.currentTimeMillis() - maxAge
        
        // 获取要删除的缓存记录
        val allCaches = resourceCacheDao.getAll()
        val expiredCaches = allCaches.filter { it.lastAccessedAt < threshold }
        
        // 删除文件和数据库记录
        expiredCaches.forEach { cache ->
            val file = File(cache.localPath)
            if (file.exists()) {
                file.delete()
            }
        }
        
        // 批量删除数据库记录
        resourceCacheDao.deleteOlderThan(threshold)
        
        // 清理孤立文件（数据库中没有记录的文件）
        cacheDir.listFiles()?.forEach { file ->
            val hasRecord = allCaches.any { it.resourceId == file.name }
            if (!hasRecord && System.currentTimeMillis() - file.lastModified() > maxAge) {
                file.delete()
            }
        }
    }
    
    /**
     * 获取缓存统计信息
     */
    suspend fun getCacheStats(): CacheStats {
        val caches = resourceCacheDao.getAll()
        var totalSize = 0L
        var fileCount = 0
        
        caches.forEach { cache ->
            val file = File(cache.localPath)
            if (file.exists()) {
                totalSize += file.length()
                fileCount++
            }
        }
        
        return CacheStats(
            fileCount = fileCount,
            totalSize = totalSize,
            recordCount = caches.size
        )
    }
    
    /**
     * 计算 SHA-256 哈希
     */
    private fun computeSHA256(data: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(data).joinToString("") { "%02x".format(it) }
    }
}

/**
 * 缓存统计信息
 */
data class CacheStats(
    val fileCount: Int,
    val totalSize: Long,
    val recordCount: Int
)
