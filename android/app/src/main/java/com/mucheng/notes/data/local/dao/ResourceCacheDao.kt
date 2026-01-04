package com.mucheng.notes.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.mucheng.notes.data.local.entity.ResourceCacheEntity

/**
 * 资源缓存 DAO
 * 管理本地资源文件缓存
 */
@Dao
interface ResourceCacheDao {
    
    /**
     * 按资源 ID 获取缓存记录
     */
    @Query("SELECT * FROM resource_cache WHERE resource_id = :resourceId")
    suspend fun getByResourceId(resourceId: String): ResourceCacheEntity?
    
    /**
     * 插入或更新缓存记录
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(cache: ResourceCacheEntity)
    
    /**
     * 删除缓存记录
     */
    @Query("DELETE FROM resource_cache WHERE resource_id = :resourceId")
    suspend fun delete(resourceId: String)
    
    /**
     * 删除指定时间之前的缓存记录
     */
    @Query("DELETE FROM resource_cache WHERE last_accessed_at < :threshold")
    suspend fun deleteOlderThan(threshold: Long)
    
    /**
     * 获取所有缓存记录
     */
    @Query("SELECT * FROM resource_cache ORDER BY last_accessed_at DESC")
    suspend fun getAll(): List<ResourceCacheEntity>
    
    /**
     * 获取缓存总大小（需要配合文件系统计算）
     */
    @Query("SELECT COUNT(*) FROM resource_cache")
    suspend fun getCacheCount(): Int
}
