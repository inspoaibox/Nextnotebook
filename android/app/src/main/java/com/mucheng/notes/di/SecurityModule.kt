package com.mucheng.notes.di

import com.mucheng.notes.security.AppLockManager
import com.mucheng.notes.security.AppLockManagerImpl
import com.mucheng.notes.security.BiometricManager
import com.mucheng.notes.security.BiometricManagerImpl
import com.mucheng.notes.security.CryptoEngine
import com.mucheng.notes.security.CryptoEngineImpl
import com.mucheng.notes.security.KeystoreManager
import com.mucheng.notes.security.TOTPGenerator
import com.mucheng.notes.security.TOTPGeneratorImpl
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt Module for Security dependencies
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class SecurityModule {
    
    @Binds
    @Singleton
    abstract fun bindCryptoEngine(
        impl: CryptoEngineImpl
    ): CryptoEngine
    
    @Binds
    @Singleton
    abstract fun bindBiometricManager(
        impl: BiometricManagerImpl
    ): BiometricManager
    
    @Binds
    @Singleton
    abstract fun bindAppLockManager(
        impl: AppLockManagerImpl
    ): AppLockManager
    
    @Binds
    @Singleton
    abstract fun bindTOTPGenerator(
        impl: TOTPGeneratorImpl
    ): TOTPGenerator
    
    companion object {
        @Provides
        @Singleton
        fun provideKeystoreManager(): KeystoreManager {
            return KeystoreManager()
        }
    }
}
