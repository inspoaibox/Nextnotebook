package com.mucheng.notes.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * AppLockManager 实现
 */
@Singleton
class AppLockManagerImpl @Inject constructor(
    @ApplicationContext private val context: Context
) : AppLockManager {
    
    companion object {
        private const val PREFS_NAME = "app_lock_prefs"
        private const val KEY_LOCK_ENABLED = "lock_enabled"
        private const val KEY_LOCK_TYPE = "lock_type"
        private const val KEY_PIN_HASH = "pin_hash"
        private const val KEY_PIN_LENGTH = "pin_length"
        private const val KEY_PATTERN_HASH = "pattern_hash"
        private const val KEY_LAST_UNLOCK = "last_unlock"
        private const val KEY_LAST_BACKGROUND = "last_background"
        private const val KEY_LOCK_TIMEOUT = "lock_timeout"
        
        private const val DEFAULT_TIMEOUT = 5 * 60 * 1000L // 5 分钟
        private const val DEFAULT_PIN_LENGTH = 4
    }
    
    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        
        EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }
    
    override fun isLockEnabled(): Boolean {
        return prefs.getBoolean(KEY_LOCK_ENABLED, false)
    }

    override fun hasCredentialConfigured(): Boolean {
        val lockType = getLockType()
        // 生物识别只是 PIN 的便捷解锁方式，不能作为独立凭据；
        // 持久化的 lockType 为 BIOMETRIC 属于历史脏数据，按未配置处理，避免跳过 PIN 设置流程。
        val configured = when (lockType) {
            LockType.NONE, LockType.BIOMETRIC -> false
            LockType.PIN -> !prefs.getString(KEY_PIN_HASH, null).isNullOrBlank()
            LockType.PATTERN -> !prefs.getString(KEY_PATTERN_HASH, null).isNullOrBlank()
        }
        android.util.Log.d(
            "SecurityDebug",
            "hasCredentialConfigured: lockType=$lockType, lockEnabled=${isLockEnabled()}, result=$configured"
        )
        return configured
    }
    
    override fun setLockEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_LOCK_ENABLED, enabled).apply()
        if (!enabled) {
            prefs.edit().remove(KEY_LAST_BACKGROUND).apply()
        }
    }
    
    override fun getLockType(): LockType {
        val typeStr = prefs.getString(KEY_LOCK_TYPE, LockType.NONE.name)
        return try {
            LockType.valueOf(typeStr ?: LockType.NONE.name)
        } catch (e: Exception) {
            LockType.NONE
        }
    }
    
    override fun setLockType(type: LockType) {
        prefs.edit().putString(KEY_LOCK_TYPE, type.name).apply()
    }
    
    override suspend fun verifyPin(pin: String): Boolean {
        val storedHash = prefs.getString(KEY_PIN_HASH, null) ?: return false
        val inputHash = hashString(pin)
        return storedHash == inputHash
    }
    
    override suspend fun verifyPattern(pattern: List<Int>): Boolean {
        val storedHash = prefs.getString(KEY_PATTERN_HASH, null) ?: return false
        val inputHash = hashString(pattern.joinToString(","))
        return storedHash == inputHash
    }
    
    override fun setPin(pin: String) {
        val hash = hashString(pin)
        prefs.edit()
            .putString(KEY_PIN_HASH, hash)
            .putInt(KEY_PIN_LENGTH, pin.length)
            .apply()
    }
    
    override fun getPinLength(): Int {
        return prefs.getInt(KEY_PIN_LENGTH, DEFAULT_PIN_LENGTH)
    }
    
    override fun setPattern(pattern: List<Int>) {
        val hash = hashString(pattern.joinToString(","))
        prefs.edit().putString(KEY_PATTERN_HASH, hash).apply()
    }
    
    override fun shouldLock(): Boolean {
        if (!isLockEnabled() || !hasCredentialConfigured()) return false

        val lastUnlock = prefs.getLong(KEY_LAST_UNLOCK, 0)
        if (lastUnlock == 0L) return true

        val lastBackground = prefs.getLong(KEY_LAST_BACKGROUND, 0)
        val timeout = getLockTimeout()

        if (lastBackground <= lastUnlock) {
            return false
        }

        return timeout == 0L || System.currentTimeMillis() - lastBackground >= timeout
    }
    
    override fun recordUnlock() {
        prefs.edit()
            .putLong(KEY_LAST_UNLOCK, System.currentTimeMillis())
            .putLong(KEY_LAST_BACKGROUND, 0L)
            .apply()
    }

    override fun recordBackground() {
        if (!isLockEnabled() || !hasCredentialConfigured()) return
        prefs.edit().putLong(KEY_LAST_BACKGROUND, System.currentTimeMillis()).apply()
    }
    
    override fun getLockTimeout(): Long {
        return prefs.getLong(KEY_LOCK_TIMEOUT, DEFAULT_TIMEOUT)
    }
    
    override fun setLockTimeout(timeout: Long) {
        prefs.edit().putLong(KEY_LOCK_TIMEOUT, timeout).apply()
    }
    
    /**
     * 计算字符串的 SHA-256 哈希
     */
    private fun hashString(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(input.toByteArray(Charsets.UTF_8))
        return hashBytes.joinToString("") { "%02x".format(it) }
    }
}
