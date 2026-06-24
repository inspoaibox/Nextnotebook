package com.mucheng.notes.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.mucheng.notes.data.local.entity.CloudFileLocalPathEntity

/**
 * 网盘文件本地路径 DAO（不参与同步，仅 Android 端侧表）。
 */
@Dao
interface CloudFileLocalPathDao {

    /** 按 cloud_file id 取本地落盘记录（含 documentUri / 校验哈希 / 续传进度）。 */
    @Query("SELECT * FROM cloud_file_local_path WHERE cloud_file_id = :cloudFileId")
    suspend fun getByCloudFileId(cloudFileId: String): CloudFileLocalPathEntity?

    /** 插入或更新一条记录。 */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: CloudFileLocalPathEntity)

    /**
     * 仅更新续传进度与状态（不触碰 documentUri / relativePath 等定位字段）。
     */
    @Query(
        """UPDATE cloud_file_local_path
           SET downloaded_size = :downloadedSize,
               state = :state,
               file_hash_verified = :fileHashVerified,
               downloaded_at = :downloadedAt,
               error_message = :errorMessage
           WHERE cloud_file_id = :cloudFileId"""
    )
    suspend fun updateProgress(
        cloudFileId: String,
        downloadedSize: Long,
        state: String,
        fileHashVerified: String?,
        downloadedAt: Long?,
        errorMessage: String?
    )

    /** 删除单条（用于云端删除级联清理本地记录）。 */
    @Query("DELETE FROM cloud_file_local_path WHERE cloud_file_id = :cloudFileId")
    suspend fun delete(cloudFileId: String)

    /** 删除全部本地落盘记录（取消授权 / 切换目录时使用）。 */
    @Query("DELETE FROM cloud_file_local_path")
    suspend fun deleteAll()

    /** 列出所有记录（用于"切换授权目录后重建映射"等运维场景）。 */
    @Query("SELECT * FROM cloud_file_local_path")
    suspend fun getAll(): List<CloudFileLocalPathEntity>

    /** 统计待下载条数（UI 进度展示用）。 */
    @Query("SELECT COUNT(*) FROM cloud_file_local_path WHERE state != 'completed'")
    suspend fun countPending(): Int
}
