package com.mucheng.notes.domain.repository

import com.mucheng.notes.domain.model.SyncResult
import com.mucheng.notes.domain.model.SyncStatus
import kotlinx.coroutines.flow.Flow

/**
 * 同步仓库接口
 */
interface SyncRepository {
    
    /**
     * 执行同步
     */
    suspend fun sync(): SyncResult
    
    /**
     * 获取当前同步状态
     */
    suspend fun getSyncStatus(): SyncStatus
    
    /**
     * 观察同步状态变化
     */
    fun observeSyncStatus(): Flow<SyncStatus>
}
