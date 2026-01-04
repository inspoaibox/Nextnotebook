package com.mucheng.notes.di

import com.mucheng.notes.data.remote.WebDAVAdapter
import com.mucheng.notes.data.remote.WebDAVAdapterImpl
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt Module for Network dependencies
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class NetworkModule {
    
    @Binds
    @Singleton
    abstract fun bindWebDAVAdapter(
        impl: WebDAVAdapterImpl
    ): WebDAVAdapter
}
