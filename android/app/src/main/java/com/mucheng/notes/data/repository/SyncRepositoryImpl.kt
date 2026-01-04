package com.mucheng.notes.data.repository

import com.mucheng.notes.data.sync.SyncEngine
import com.mucheng.notes.domain.model.SyncResult
import com.mucheng.notes.domain.model.SyncStatus
import com.mucheng.notes.domain.repository.SyncRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * SyncRepository 实现
 */
@Singleton
class SyncRepositoryImpl @Inject constructor(
    private val syncEngine: SyncEngine
) : SyncRepository {
    
    private val _syncStatus = MutableStateFlow(SyncStatus.IDLE)
    
    override suspend fun sync(): SyncResult {
        _syncStatus.value = SyncStatus.SYNCING
        
        val result = syncEngine.sync()
        
        _syncStatus.value = if (result.success) {
            SyncStatus.SUCCESS
        } else {
            SyncStatus.FAILED
        }
        
        return result
    }
    
    override suspend fun getSyncStatus(): SyncStatus {
        return _syncStatus.value
    }
    
    override fun observeSyncStatus(): Flow<SyncStatus> {
        return _syncStatus.asStateFlow()
    }
}
