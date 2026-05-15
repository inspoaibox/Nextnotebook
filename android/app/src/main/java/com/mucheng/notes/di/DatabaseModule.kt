package com.mucheng.notes.di

import android.content.Context
import com.mucheng.notes.data.local.AppDatabase
import com.mucheng.notes.data.local.dao.ItemDao
import com.mucheng.notes.data.local.dao.ResourceCacheDao
import com.mucheng.notes.security.DatabaseKeyManager
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
     * 提供数据库实例。
     * SQLCipher passphrase is generated per device and stored via Android Keystore.
     */
    @Provides
    @Singleton
    fun provideAppDatabase(
        @ApplicationContext context: Context
    ): AppDatabase {
        val passphrase = DatabaseKeyManager.getOrCreatePassphrase(
            context,
            AppDatabase.DATABASE_NAME
        )
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
