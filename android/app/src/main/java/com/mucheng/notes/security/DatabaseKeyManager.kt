package com.mucheng.notes.security

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import net.zetetic.database.sqlcipher.SQLiteDatabase
import java.security.SecureRandom

/**
 * Manages the SQLCipher passphrase for the local Room database.
 *
 * The passphrase is device-local and wrapped by AndroidX Security/Keystore.
 * Existing installations that used the historical hardcoded passphrase are
 * opened once and rekeyed to the generated passphrase.
 */
object DatabaseKeyManager {
    private const val TAG = "DatabaseKeyManager"
    private const val PREFS_NAME = "database_key_prefs"
    private const val KEY_PASSPHRASE = "sqlcipher_passphrase_v1"
    private const val KEY_MIGRATED_LEGACY = "legacy_passphrase_migrated"
    private const val PASSPHRASE_BYTES = 32
    private val LEGACY_PASSPHRASE = "mucheng_notes_db_key".toByteArray(Charsets.UTF_8)

    fun getOrCreatePassphrase(context: Context, databaseName: String): ByteArray {
        val appContext = context.applicationContext
        System.loadLibrary("sqlcipher")

        val prefs = getPrefs(appContext)
        val passphrase = getStoredPassphrase(prefs) ?: generatePassphrase().also {
            prefs.edit()
                .putString(KEY_PASSPHRASE, Base64.encodeToString(it, Base64.NO_WRAP))
                .apply()
        }

        migrateLegacyDatabaseIfNeeded(appContext, databaseName, prefs, passphrase)
        return passphrase.copyOf()
    }

    private fun getPrefs(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        return EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private fun getStoredPassphrase(prefs: SharedPreferences): ByteArray? {
        val encoded = prefs.getString(KEY_PASSPHRASE, null) ?: return null
        return Base64.decode(encoded, Base64.NO_WRAP)
    }

    private fun generatePassphrase(): ByteArray {
        val passphrase = ByteArray(PASSPHRASE_BYTES)
        SecureRandom().nextBytes(passphrase)
        return passphrase
    }

    private fun migrateLegacyDatabaseIfNeeded(
        context: Context,
        databaseName: String,
        prefs: SharedPreferences,
        newPassphrase: ByteArray
    ) {
        if (prefs.getBoolean(KEY_MIGRATED_LEGACY, false)) return

        val databasePath = context.getDatabasePath(databaseName)
        if (!databasePath.exists()) {
            prefs.edit().putBoolean(KEY_MIGRATED_LEGACY, true).apply()
            return
        }

        if (canOpenDatabase(databasePath.absolutePath, newPassphrase)) {
            prefs.edit().putBoolean(KEY_MIGRATED_LEGACY, true).apply()
            return
        }

        var database: SQLiteDatabase? = null
        try {
            database = SQLiteDatabase.openDatabase(
                databasePath.absolutePath,
                LEGACY_PASSPHRASE,
                null,
                SQLiteDatabase.OPEN_READWRITE,
                null
            )
            database.changePassword(newPassphrase)
            prefs.edit().putBoolean(KEY_MIGRATED_LEGACY, true).apply()
            Log.i(TAG, "Migrated local database passphrase from legacy key")
        } catch (error: Exception) {
            Log.e(TAG, "Failed to migrate legacy database passphrase", error)
            throw error
        } finally {
            database?.close()
        }
    }

    private fun canOpenDatabase(path: String, passphrase: ByteArray): Boolean {
        var database: SQLiteDatabase? = null
        return try {
            database = SQLiteDatabase.openDatabase(
                path,
                passphrase,
                null,
                SQLiteDatabase.OPEN_READONLY,
                null
            )
            database.rawQuery("SELECT count(*) FROM sqlite_master", emptyArray<String>()).use { cursor ->
                cursor.moveToFirst()
            }
            true
        } catch (_: Exception) {
            false
        } finally {
            database?.close()
        }
    }
}
