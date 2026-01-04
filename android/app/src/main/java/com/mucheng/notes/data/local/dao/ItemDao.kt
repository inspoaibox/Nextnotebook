package com.mucheng.notes.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.mucheng.notes.data.local.entity.ItemEntity
import kotlinx.coroutines.flow.Flow

/**
 * Room DAO for items table
 * 提供所有数据项的 CRUD 操作
 */
@Dao
interface ItemDao {
    
    /**
     * 按类型获取所有未删除的项目（实时流）
     */
    @Query("SELECT * FROM items WHERE type = :type AND deleted_time IS NULL ORDER BY updated_time DESC")
    fun getByType(type: String): Flow<List<ItemEntity>>
    
    /**
     * 按类型获取所有未删除的项目（一次性查询）
     */
    @Query("SELECT * FROM items WHERE type = :type AND deleted_time IS NULL ORDER BY updated_time DESC")
    suspend fun getByTypeOnce(type: String): List<ItemEntity>
    
    /**
     * 按 ID 获取单个项目
     */
    @Query("SELECT * FROM items WHERE id = :id")
    suspend fun getById(id: String): ItemEntity?
    
    /**
     * 按 ID 获取未删除的项目
     */
    @Query("SELECT * FROM items WHERE id = :id AND deleted_time IS NULL")
    suspend fun getByIdNotDeleted(id: String): ItemEntity?
    
    /**
     * 获取所有待同步的项目（modified 或 deleted 状态）
     */
    @Query("SELECT * FROM items WHERE sync_status IN ('modified', 'deleted')")
    suspend fun getPendingSync(): List<ItemEntity>
    
    /**
     * 获取所有项目（包括已删除）
     */
    @Query("SELECT * FROM items ORDER BY updated_time DESC")
    suspend fun getAll(): List<ItemEntity>
    
    /**
     * 插入或更新项目
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: ItemEntity)
    
    /**
     * 批量插入或更新
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<ItemEntity>)
    
    /**
     * 软删除项目
     */
    @Query("UPDATE items SET deleted_time = :time, sync_status = 'deleted', local_rev = local_rev + 1 WHERE id = :id")
    suspend fun softDelete(id: String, time: Long)
    
    /**
     * 标记为已同步
     */
    @Query("UPDATE items SET sync_status = 'clean', remote_rev = :remoteRev WHERE id = :id")
    suspend fun markSynced(id: String, remoteRev: String)
    
    /**
     * 更新同步状态
     */
    @Query("UPDATE items SET sync_status = :status, local_rev = local_rev + 1 WHERE id = :id")
    suspend fun updateSyncStatus(id: String, status: String)
    
    /**
     * 搜索项目（在 payload 中搜索）
     */
    @Query("SELECT * FROM items WHERE type = :type AND deleted_time IS NULL AND payload LIKE '%' || :query || '%' ORDER BY updated_time DESC")
    suspend fun search(query: String, type: String): List<ItemEntity>
    
    /**
     * 全局搜索（所有类型）
     */
    @Query("SELECT * FROM items WHERE deleted_time IS NULL AND payload LIKE '%' || :query || '%' ORDER BY updated_time DESC")
    suspend fun searchAll(query: String): List<ItemEntity>
    
    /**
     * 按 folder_id 获取项目（用于笔记、书签等）
     */
    @Query("SELECT * FROM items WHERE type = :type AND deleted_time IS NULL AND payload LIKE '%\"folder_id\":\"' || :folderId || '\"%' ORDER BY updated_time DESC")
    suspend fun getByFolderId(type: String, folderId: String): List<ItemEntity>
    
    /**
     * 获取根目录项目（folder_id 为 null）
     */
    @Query("SELECT * FROM items WHERE type = :type AND deleted_time IS NULL AND (payload LIKE '%\"folder_id\":null%' OR payload NOT LIKE '%\"folder_id\":%') ORDER BY updated_time DESC")
    suspend fun getRootItems(type: String): List<ItemEntity>
    
    /**
     * 获取指定时间之后更新的项目
     */
    @Query("SELECT * FROM items WHERE updated_time > :since ORDER BY updated_time ASC")
    suspend fun getUpdatedSince(since: Long): List<ItemEntity>
    
    /**
     * 物理删除项目（仅用于清理）
     */
    @Query("DELETE FROM items WHERE id = :id")
    suspend fun hardDelete(id: String)
    
    /**
     * 清理已删除超过指定天数的项目
     */
    @Query("DELETE FROM items WHERE deleted_time IS NOT NULL AND deleted_time < :threshold")
    suspend fun cleanupDeleted(threshold: Long)
    
    /**
     * 获取项目数量
     */
    @Query("SELECT COUNT(*) FROM items WHERE type = :type AND deleted_time IS NULL")
    suspend fun countByType(type: String): Int
}
