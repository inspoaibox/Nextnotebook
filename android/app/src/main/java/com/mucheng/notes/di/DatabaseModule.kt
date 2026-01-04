package com.mucheng.notes.di

import android.content.Context
import com.mucheng.notes.data.local.AppDatabase
import com.mucheng.notes.data.local.dao.ItemDao
import com.mucheng.notes.data.local.dao.ResourceCacheDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt Module for Database dependencies
 */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    
    /**
     * 提供数据库实例
     * 注意: 实际使用时需要从安全存储获取密码
     */
    @Provides
    @Singleton
    fun provideAppDatabase(
        @ApplicationContext context: Context
    ): AppDatabase {
        // TODO: 从 Android Keystore 或安全存储获取数据库密码
        // 这里暂时使用固定密码，实际应用中需要安全处理
        val passphrase = "mucheng_notes_db_key".toByteArray()
        return AppDatabase.getInstance(context, passphrase)
    }
    
    @Provides
    @Singleton
    fun provideItemDao(database: AppDatabase): ItemDao {
        return database.itemDao()
    }
    
    @Provides
    @Singleton
    fun provideResourceCacheDao(database: AppDatabase): ResourceCacheDao {
        return database.resourceCacheDao()
    }
}
