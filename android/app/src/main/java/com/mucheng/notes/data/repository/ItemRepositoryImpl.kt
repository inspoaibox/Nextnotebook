package com.mucheng.notes.data.repository

import com.mucheng.notes.data.local.dao.ItemDao
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.repository.ItemRepository
import kotlinx.coroutines.flow.Flow
import java.security.MessageDigest
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * ItemRepository 实现
 */
@Singleton
class ItemRepositoryImpl @Inject constructor(
    private val itemDao: ItemDao
) : ItemRepository {
    
    override fun getByType(type: ItemType): Flow<List<ItemEntity>> {
        return itemDao.getByType(type.value)
    }
    
    override suspend fun getById(id: String): ItemEntity? {
        return itemDao.getByIdNotDeleted(id)
    }
    
    override suspend fun create(type: ItemType, payload: String): ItemEntity {
        val now = System.currentTimeMillis()
        val item = ItemEntity(
            id = UUID.randomUUID().toString(),
            type = type.value,
            createdTime = now,
            updatedTime = now,
            deletedTime = null,
            payload = payload,
            contentHash = computeContentHash(payload),
            syncStatus = "modified",
            localRev = 1,
            remoteRev = null,
            encryptionApplied = 0,
            schemaVersion = 1
        )
        itemDao.upsert(item)
        return item
    }
    
    override suspend fun update(id: String, payload: String): ItemEntity? {
        val existing = itemDao.getByIdNotDeleted(id) ?: return null
        
        val updated = existing.copy(
            payload = payload,
            updatedTime = System.currentTimeMillis(),
            contentHash = computeContentHash(payload),
            syncStatus = "modified",
            localRev = existing.localRev + 1
        )
        itemDao.upsert(updated)
        return updated
    }
    
    override suspend fun softDelete(id: String): Boolean {
        val existing = itemDao.getByIdNotDeleted(id) ?: return false
        itemDao.softDelete(id, System.currentTimeMillis())
        return true
    }
    
    override suspend fun search(query: String, type: ItemType?): List<ItemEntity> {
        return if (type != null) {
            itemDao.search(query, type.value)
        } else {
            itemDao.searchAll(query)
        }
    }
    
    override suspend fun getByFolderId(type: ItemType, folderId: String): List<ItemEntity> {
        return itemDao.getByFolderId(type.value, folderId)
    }
    
    override suspend fun getRootItems(type: ItemType): List<ItemEntity> {
        return itemDao.getRootItems(type.value)
    }
    
    override suspend fun getPendingSync(): List<ItemEntity> {
        return itemDao.getPendingSync()
    }
    
    override suspend fun markSynced(id: String, remoteRev: String) {
        itemDao.markSynced(id, remoteRev)
    }
    
    override suspend fun upsertAll(items: List<ItemEntity>) {
        itemDao.upsertAll(items)
    }
    
    /**
     * 计算内容哈希（SHA-256 前 16 字符）
     * 与桌面端保持一致
     */
    private fun computeContentHash(content: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(content.toByteArray(Charsets.UTF_8))
        return hashBytes.joinToString("") { "%02x".format(it) }.take(16)
    }
}
