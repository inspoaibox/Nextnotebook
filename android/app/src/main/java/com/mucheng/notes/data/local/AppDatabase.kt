package com.mucheng.notes.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.mucheng.notes.data.local.dao.CloudFileLocalPathDao
import com.mucheng.notes.data.local.dao.ItemDao
import com.mucheng.notes.data.local.dao.ResourceCacheDao
import com.mucheng.notes.data.local.entity.CloudFileLocalPathEntity
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.data.local.entity.ResourceCacheEntity
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

/**
 * Room Database with SQLCipher encryption
 */
@Database(
    entities = [
        ItemEntity::class,
        ResourceCacheEntity::class,
        CloudFileLocalPathEntity::class
    ],
    version = 3,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun itemDao(): ItemDao
    abstract fun resourceCacheDao(): ResourceCacheDao
    abstract fun cloudFileLocalPathDao(): CloudFileLocalPathDao
    
    companion object {
        const val DATABASE_NAME = "mucheng_notes.db"

        /**
         * v2 -> v3:
         * cloud_file_local_path 新增 availability 列，用于“仅云端 / 本地 / 离线保留”。
         * 该表是 Android 端侧表，不参与同步，但不能因为加列导致整库校验失败闪退。
         */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    """
                    ALTER TABLE cloud_file_local_path
                    ADD COLUMN availability TEXT NOT NULL DEFAULT 'local'
                    """.trimIndent()
                )
            }
        }
        
        @Volatile
        private var INSTANCE: AppDatabase? = null
        
        /**
         * 获取加密数据库实例
         * @param context Application context
         * @param passphrase 数据库加密密码
         */
        fun getInstance(context: Context, passphrase: ByteArray): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context, passphrase).also { INSTANCE = it }
            }
        }
        
        /**
         * 获取未加密数据库实例（仅用于测试）
         */
        fun getTestInstance(context: Context): AppDatabase {
            return Room.inMemoryDatabaseBuilder(
                context.applicationContext,
                AppDatabase::class.java
            ).build()
        }
        
        private fun buildDatabase(context: Context, passphrase: ByteArray): AppDatabase {
            val factory = SupportOpenHelperFactory(passphrase, null, false)
            
            return Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                DATABASE_NAME
            )
                .openHelperFactory(factory)
                .addMigrations(MIGRATION_2_3)
                .fallbackToDestructiveMigration() // TODO: 实现正式迁移策略
                .build()
        }
        
        /**
         * 关闭数据库连接
         */
        fun closeDatabase() {
            INSTANCE?.close()
            INSTANCE = null
        }
    }
}
