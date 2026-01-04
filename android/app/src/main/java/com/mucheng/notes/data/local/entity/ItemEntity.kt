package com.mucheng.notes.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 统一数据实体 - 与桌面端 ItemBase 完全一致
 * 所有可同步数据都存储在这个表中
 * 
 * 注意：使用 @SerialName 注解映射桌面端的 snake_case 字段名
 */
@Serializable
@Entity(tableName = "items")
data class ItemEntity(
    @PrimaryKey
    val id: String,
    
    @ColumnInfo(name = "type")
    val type: String,
    
    @SerialName("created_time")
    @ColumnInfo(name = "created_time")
    val createdTime: Long,
    
    @SerialName("updated_time")
    @ColumnInfo(name = "updated_time")
    val updatedTime: Long,
    
    @SerialName("deleted_time")
    @ColumnInfo(name = "deleted_time")
    val deletedTime: Long? = null,
    
    @ColumnInfo(name = "payload")
    val payload: String,
    
    @SerialName("content_hash")
    @ColumnInfo(name = "content_hash")
    val contentHash: String,
    
    @SerialName("sync_status")
    @ColumnInfo(name = "sync_status")
    val syncStatus: String = "modified",
    
    @SerialName("local_rev")
    @ColumnInfo(name = "local_rev")
    val localRev: Int = 1,
    
    @SerialName("remote_rev")
    @ColumnInfo(name = "remote_rev")
    val remoteRev: String? = null,
    
    @SerialName("encryption_applied")
    @ColumnInfo(name = "encryption_applied")
    val encryptionApplied: Int = 0,
    
    @SerialName("schema_version")
    @ColumnInfo(name = "schema_version")
    val schemaVersion: Int = 1
)
