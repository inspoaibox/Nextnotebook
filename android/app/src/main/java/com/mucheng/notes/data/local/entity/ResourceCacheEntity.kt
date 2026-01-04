package com.mucheng.notes.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * 资源文件本地缓存实体
 * 
 * 此表不参与同步，仅用于管理 Android 端的本地资源文件缓存路径。
 * ResourcePayload 中不包含 local_path 字段，以保持与桌面端的兼容性。
 */
@Entity(tableName = "resource_cache")
data class ResourceCacheEntity(
    @PrimaryKey
    @ColumnInfo(name = "resource_id")
    val resourceId: String,  // 对应 items 表中的 resource id
    
    @ColumnInfo(name = "local_path")
    val localPath: String,   // 本地文件路径
    
    @ColumnInfo(name = "downloaded_at")
    val downloadedAt: Long,  // 下载时间
    
    @ColumnInfo(name = "last_accessed_at")
    val lastAccessedAt: Long // 最后访问时间
)
