package com.mucheng.notes.di

import android.content.Context
import com.mucheng.notes.data.local.dao.ItemDao
import com.mucheng.notes.data.local.dao.ResourceCacheDao
import com.mucheng.notes.data.remote.WebDAVAdapter
import com.mucheng.notes.data.repository.ItemRepositoryImpl
import com.mucheng.notes.data.repository.SyncRepositoryImpl
import com.mucheng.notes.data.sync.OfflineQueueManager
import com.mucheng.notes.data.sync.OfflineQueueManagerImpl
import com.mucheng.notes.data.sync.ResourceSyncManager
import com.mucheng.notes.domain.repository.ItemRepository
import com.mucheng.notes.domain.repository.SyncRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.File
import javax.inject.Singleton

/**
 * Hilt Module for Repository bindings
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    
    @Binds
    @Singleton
    abstract fun bindItemRepository(
        impl: ItemRepositoryImpl
    ): ItemRepository
    
    @Binds
    @Singleton
    abstract fun bindSyncRepository(
        impl: SyncRepositoryImpl
    ): SyncRepository
    
    @Binds
    @Singleton
    abstract fun bindOfflineQueueManager(
        impl: OfflineQueueManagerImpl
    ): OfflineQueueManager
    
    companion object {
        @Provides
        @Singleton
        fun provideResourceSyncManager(
            webDAVAdapter: WebDAVAdapter,
            itemDao: ItemDao,
            resourceCacheDao: ResourceCacheDao,
            @ApplicationContext context: Context
        ): ResourceSyncManager {
            val cacheDir = File(context.cacheDir, "resources")
            return ResourceSyncManager(webDAVAdapter, itemDao, resourceCacheDao, cacheDir)
        }
    }
}
