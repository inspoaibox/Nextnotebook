package com.mucheng.notes.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.mucheng.notes.data.local.dao.ItemDao
import com.mucheng.notes.data.local.dao.ResourceCacheDao
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.data.local.entity.ResourceCacheEntity
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

/**
 * Room Database with SQLCipher encryption
 */
@Database(
    entities = [
        ItemEntity::class,
        ResourceCacheEntity::class
    ],
    version = 1,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    
    abstract fun itemDao(): ItemDao
    abstract fun resourceCacheDao(): ResourceCacheDao
    
    companion object {
        private const val DATABASE_NAME = "mucheng_notes.db"
        
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
            // 初始化 SQLCipher
            System.loadLibrary("sqlcipher")
            
            val factory = SupportOpenHelperFactory(passphrase, null, false)
            
            return Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                DATABASE_NAME
            )
                .openHelperFactory(factory)
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
