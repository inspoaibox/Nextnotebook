package com.mucheng.notes.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * 同步相关敏感信息的安全存储。
 * 会自动迁移历史明文 SharedPreferences 中的值，并删除旧明文。
 */
object SecureSyncStorage {
    private const val PREFS_NAME = "secure_sync_prefs"
    private val legacyPrefsNames = listOf("app_settings", "sync_config")

    private fun getPrefs(context: Context): SharedPreferences {
        return try {
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
        } catch (e: Exception) {
            android.util.Log.e("SecureSyncStorage", "Falling back to local prefs: ${e.message}")
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        }
    }

    fun getString(context: Context, key: String): String? {
        val prefs = getPrefs(context)
        if (prefs.contains(key)) {
            return prefs.getString(key, null)
        }

        for (prefsName in legacyPrefsNames) {
            val legacyPrefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            if (!legacyPrefs.contains(key)) {
                continue
            }

            val value = legacyPrefs.getString(key, null)
            if (value != null) {
                prefs.edit().putString(key, value).apply()
            }
            legacyPrefs.edit().remove(key).apply()
            return value
        }

        return null
    }

    fun getLong(context: Context, key: String): Long? {
        val prefs = getPrefs(context)
        if (prefs.contains(key)) {
            return prefs.getLong(key, 0L)
        }

        for (prefsName in legacyPrefsNames) {
            val legacyPrefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            if (!legacyPrefs.contains(key)) {
                continue
            }

            val value = legacyPrefs.getLong(key, 0L)
            prefs.edit().putLong(key, value).apply()
            legacyPrefs.edit().remove(key).apply()
            return value
        }

        return null
    }

    fun putString(context: Context, key: String, value: String?) {
        val prefs = getPrefs(context)
        prefs.edit().apply {
            if (value == null) remove(key) else putString(key, value)
        }.apply()
        clearLegacy(context, key)
    }

    fun putLong(context: Context, key: String, value: Long?) {
        val prefs = getPrefs(context)
        prefs.edit().apply {
            if (value == null) remove(key) else putLong(key, value)
        }.apply()
        clearLegacy(context, key)
    }

    fun remove(context: Context, vararg keys: String) {
        val prefs = getPrefs(context)
        prefs.edit().apply {
            keys.forEach { remove(it) }
        }.apply()

        keys.forEach { key ->
            clearLegacy(context, key)
        }
    }

    private fun clearLegacy(context: Context, key: String) {
        legacyPrefsNames.forEach { prefsName ->
            context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
                .edit()
                .remove(key)
                .apply()
        }
    }
}
