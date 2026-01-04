package com.mucheng.notes.domain.repository

import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.domain.model.ItemType
import kotlinx.coroutines.flow.Flow

/**
 * Item Repository 接口
 * 提供数据项的 CRUD 操作抽象
 */
interface ItemRepository {
    
    /**
     * 按类型获取所有项目（实时流）
     */
    fun getByType(type: ItemType): Flow<List<ItemEntity>>
    
    /**
     * 按 ID 获取单个项目
     */
    suspend fun getById(id: String): ItemEntity?
    
    /**
     * 创建新项目
     * @param type 项目类型
     * @param payload JSON 格式的业务数据
     * @return 创建的项目
     */
    suspend fun create(type: ItemType, payload: String): ItemEntity
    
    /**
     * 更新项目
     * @param id 项目 ID
     * @param payload 新的 JSON 格式业务数据
     * @return 更新后的项目，如果不存在返回 null
     */
    suspend fun update(id: String, payload: String): ItemEntity?
    
    /**
     * 软删除项目
     * @param id 项目 ID
     * @return 是否成功
     */
    suspend fun softDelete(id: String): Boolean
    
    /**
     * 搜索项目
     * @param query 搜索关键词
     * @param type 可选的类型过滤
     * @return 匹配的项目列表
     */
    suspend fun search(query: String, type: ItemType? = null): List<ItemEntity>
    
    /**
     * 按文件夹 ID 获取项目
     */
    suspend fun getByFolderId(type: ItemType, folderId: String): List<ItemEntity>
    
    /**
     * 获取根目录项目
     */
    suspend fun getRootItems(type: ItemType): List<ItemEntity>
    
    /**
     * 获取待同步的项目
     */
    suspend fun getPendingSync(): List<ItemEntity>
    
    /**
     * 标记项目为已同步
     */
    suspend fun markSynced(id: String, remoteRev: String)
    
    /**
     * 批量插入或更新（用于同步）
     */
    suspend fun upsertAll(items: List<ItemEntity>)
}
