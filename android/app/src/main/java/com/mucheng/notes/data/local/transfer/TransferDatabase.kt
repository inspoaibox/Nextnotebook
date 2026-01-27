/**
 * LAN Transfer Assistant - Android 数据库
 * 
 * 使用 Room 实现独立的传输数据库
 */

package com.mucheng.notes.data.local.transfer

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

// ============================================
// Entity 定义
// ============================================

@Entity(tableName = "transfer_devices")
data class TransferDeviceEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val type: String, // "desktop" | "android"
    @ColumnInfo(name = "last_ip")
    val lastIp: String?,
    @ColumnInfo(name = "last_port")
    val lastPort: Int?,
    @ColumnInfo(name = "last_seen")
    val lastSeen: Long,
    @ColumnInfo(name = "is_favorite")
    val isFavorite: Boolean = false,
    @ColumnInfo(name = "created_at")
    val createdAt: Long
)

@Entity(
    tableName = "transfer_sessions",
    foreignKeys = [
        ForeignKey(
            entity = TransferDeviceEntity::class,
            parentColumns = ["id"],
            childColumns = ["peer_device_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("peer_device_id")]
)
data class TransferSessionEntity(
    @PrimaryKey
    val id: String,
    @ColumnInfo(name = "peer_device_id")
    val peerDeviceId: String,
    @ColumnInfo(name = "peer_device_name")
    val peerDeviceName: String,
    @ColumnInfo(name = "connection_type")
    val connectionType: String, // "lan" | "relay"
    @ColumnInfo(name = "started_at")
    val startedAt: Long,
    @ColumnInfo(name = "ended_at")
    val endedAt: Long?
)

@Entity(
    tableName = "transfer_messages",
    foreignKeys = [
        ForeignKey(
            entity = TransferSessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["session_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("session_id"), Index("created_at")]
)
data class TransferMessageEntity(
    @PrimaryKey
    val id: String,
    @ColumnInfo(name = "session_id")
    val sessionId: String,
    val direction: String, // "sent" | "received"
    val type: String, // "text" | "file" | "image"
    val content: String,
    @ColumnInfo(name = "file_id")
    val fileId: String?,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "read_at")
    val readAt: Long?
)

@Entity(
    tableName = "transfer_files",
    foreignKeys = [
        ForeignKey(
            entity = TransferSessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["session_id"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("session_id"), Index("status")]
)
data class TransferFileEntity(
    @PrimaryKey
    val id: String,
    @ColumnInfo(name = "session_id")
    val sessionId: String,
    val filename: String,
    @ColumnInfo(name = "file_size")
    val fileSize: Long,
    @ColumnInfo(name = "mime_type")
    val mimeType: String,
    @ColumnInfo(name = "local_path")
    val localPath: String?,
    val direction: String, // "sent" | "received"
    val status: String, // "pending" | "transferring" | "completed" | "failed" | "cancelled"
    val progress: Float = 0f,
    @ColumnInfo(name = "file_hash")
    val fileHash: String?,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "completed_at")
    val completedAt: Long?
)

// ============================================
// DAO 定义
// ============================================

@Dao
interface TransferDeviceDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(device: TransferDeviceEntity)

    @Update
    suspend fun update(device: TransferDeviceEntity)

    @Delete
    suspend fun delete(device: TransferDeviceEntity)

    @Query("SELECT * FROM transfer_devices WHERE id = :id")
    suspend fun getById(id: String): TransferDeviceEntity?

    @Query("SELECT * FROM transfer_devices ORDER BY is_favorite DESC, last_seen DESC")
    fun getAllDevices(): Flow<List<TransferDeviceEntity>>

    @Query("SELECT * FROM transfer_devices ORDER BY is_favorite DESC, last_seen DESC")
    suspend fun getAllDevicesSync(): List<TransferDeviceEntity>

    @Query("UPDATE transfer_devices SET is_favorite = :isFavorite WHERE id = :id")
    suspend fun setFavorite(id: String, isFavorite: Boolean)

    @Query("UPDATE transfer_devices SET last_seen = :lastSeen, last_ip = :lastIp, last_port = :lastPort WHERE id = :id")
    suspend fun updateLastSeen(id: String, lastSeen: Long, lastIp: String?, lastPort: Int?)

    @Query("DELETE FROM transfer_devices WHERE id = :id")
    suspend fun deleteById(id: String)
}

@Dao
interface TransferSessionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(session: TransferSessionEntity)

    @Update
    suspend fun update(session: TransferSessionEntity)

    @Delete
    suspend fun delete(session: TransferSessionEntity)

    @Query("SELECT * FROM transfer_sessions WHERE id = :id")
    suspend fun getById(id: String): TransferSessionEntity?

    @Query("SELECT * FROM transfer_sessions ORDER BY started_at DESC")
    fun getAllSessions(): Flow<List<TransferSessionEntity>>

    @Query("SELECT * FROM transfer_sessions WHERE peer_device_id = :deviceId ORDER BY started_at DESC")
    fun getSessionsByDevice(deviceId: String): Flow<List<TransferSessionEntity>>

    @Query("SELECT * FROM transfer_sessions WHERE peer_device_id = :deviceId AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1")
    suspend fun getActiveSessionByDevice(deviceId: String): TransferSessionEntity?

    @Query("UPDATE transfer_sessions SET ended_at = :endedAt WHERE id = :id")
    suspend fun endSession(id: String, endedAt: Long)

    @Query("DELETE FROM transfer_sessions WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM transfer_sessions WHERE ended_at IS NOT NULL AND ended_at < :cutoff")
    suspend fun cleanupOldSessions(cutoff: Long): Int
}

@Dao
interface TransferMessageDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(message: TransferMessageEntity)

    @Update
    suspend fun update(message: TransferMessageEntity)

    @Delete
    suspend fun delete(message: TransferMessageEntity)

    @Query("SELECT * FROM transfer_messages WHERE id = :id")
    suspend fun getById(id: String): TransferMessageEntity?

    @Query("SELECT * FROM transfer_messages WHERE session_id = :sessionId ORDER BY created_at ASC LIMIT :limit OFFSET :offset")
    suspend fun getMessagesBySession(sessionId: String, limit: Int = 100, offset: Int = 0): List<TransferMessageEntity>

    @Query("SELECT * FROM transfer_messages WHERE session_id = :sessionId ORDER BY created_at ASC")
    fun observeMessagesBySession(sessionId: String): Flow<List<TransferMessageEntity>>

    @Query("UPDATE transfer_messages SET read_at = :readAt WHERE id = :id AND read_at IS NULL")
    suspend fun markAsRead(id: String, readAt: Long)

    @Query("UPDATE transfer_messages SET read_at = :readAt WHERE session_id = :sessionId AND direction = 'received' AND read_at IS NULL")
    suspend fun markSessionMessagesAsRead(sessionId: String, readAt: Long): Int

    @Query("SELECT COUNT(*) FROM transfer_messages WHERE session_id = :sessionId AND direction = 'received' AND read_at IS NULL")
    fun getUnreadCount(sessionId: String): Flow<Int>

    @Query("DELETE FROM transfer_messages WHERE id = :id")
    suspend fun deleteById(id: String)
}

@Dao
interface TransferFileDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(file: TransferFileEntity)

    @Update
    suspend fun update(file: TransferFileEntity)

    @Delete
    suspend fun delete(file: TransferFileEntity)

    @Query("SELECT * FROM transfer_files WHERE id = :id")
    suspend fun getById(id: String): TransferFileEntity?

    @Query("SELECT * FROM transfer_files WHERE session_id = :sessionId ORDER BY created_at DESC")
    fun getFilesBySession(sessionId: String): Flow<List<TransferFileEntity>>

    @Query("UPDATE transfer_files SET progress = :progress, status = 'transferring' WHERE id = :id")
    suspend fun updateProgress(id: String, progress: Float)

    @Query("UPDATE transfer_files SET status = 'completed', progress = 100, local_path = :localPath, file_hash = :fileHash, completed_at = :completedAt WHERE id = :id")
    suspend fun completeTransfer(id: String, localPath: String, fileHash: String?, completedAt: Long)

    @Query("UPDATE transfer_files SET status = 'failed' WHERE id = :id")
    suspend fun failTransfer(id: String)

    @Query("UPDATE transfer_files SET status = 'cancelled' WHERE id = :id")
    suspend fun cancelTransfer(id: String)

    @Query("DELETE FROM transfer_files WHERE status IN ('failed', 'cancelled')")
    suspend fun cleanupFailedTransfers(): Int

    @Query("DELETE FROM transfer_files WHERE id = :id")
    suspend fun deleteById(id: String)
}

// ============================================
// Database 定义
// ============================================

@Database(
    entities = [
        TransferDeviceEntity::class,
        TransferSessionEntity::class,
        TransferMessageEntity::class,
        TransferFileEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class TransferDatabase : RoomDatabase() {
    abstract fun deviceDao(): TransferDeviceDao
    abstract fun sessionDao(): TransferSessionDao
    abstract fun messageDao(): TransferMessageDao
    abstract fun fileDao(): TransferFileDao

    companion object {
        private const val DATABASE_NAME = "transfer.db"

        @Volatile
        private var INSTANCE: TransferDatabase? = null

        fun getInstance(context: Context): TransferDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context).also { INSTANCE = it }
            }
        }

        private fun buildDatabase(context: Context): TransferDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                TransferDatabase::class.java,
                DATABASE_NAME
            )
                .fallbackToDestructiveMigration()
                .build()
        }
    }
}
