package com.mucheng.notes.service.passkey

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.text.InputType
import android.widget.EditText
import kotlinx.coroutines.suspendCancellableCoroutine
import java.security.MessageDigest
import kotlin.coroutines.resume

internal object MuchengPasskeyVaultGuard {
    private const val PREFS_NAME = "app_settings"
    private const val KEY_VAULT_PASSWORD = "vault_password"
    private const val KEY_VAULT_LOCK_ENABLED = "vault_lock_enabled"
    private const val KEY_PASSKEY_UNLOCKED_UNTIL = "passkey_unlocked_until"
    private const val UNLOCK_TTL_MS = 5 * 60 * 1000L

    fun isVaultLockConfigured(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_VAULT_LOCK_ENABLED, false) &&
            prefs.getString(KEY_VAULT_PASSWORD, null) != null
    }

    fun isVaultLocked(context: Context): Boolean {
        return isVaultLockConfigured(context) && !isTemporarilyUnlocked(context)
    }

    suspend fun ensureUnlocked(activity: Activity): Boolean {
        val prefs = activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val storedHash = prefs.getString(KEY_VAULT_PASSWORD, null)
        val lockEnabled = prefs.getBoolean(KEY_VAULT_LOCK_ENABLED, false)
        if (!lockEnabled || storedHash == null) return true

        if (isTemporarilyUnlocked(activity)) return true

        val verified = promptForPassword(activity, storedHash)
        if (verified) {
            prefs.edit()
                .putLong(KEY_PASSKEY_UNLOCKED_UNTIL, System.currentTimeMillis() + UNLOCK_TTL_MS)
                .apply()
        }
        return verified
    }

    private fun isTemporarilyUnlocked(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getLong(KEY_PASSKEY_UNLOCKED_UNTIL, 0L) > System.currentTimeMillis()
    }

    private suspend fun promptForPassword(activity: Activity, storedHash: String): Boolean {
        return suspendCancellableCoroutine { continuation ->
            val input = EditText(activity).apply {
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                hint = "密码库密码"
                setSingleLine(true)
            }

            val dialog = AlertDialog.Builder(activity)
                .setTitle("解锁密码库")
                .setMessage("请先验证密码库密码")
                .setView(input)
                .setPositiveButton("解锁", null)
                .setNegativeButton("取消") { _, _ ->
                    if (continuation.isActive) continuation.resume(false)
                }
                .setOnCancelListener {
                    if (continuation.isActive) continuation.resume(false)
                }
                .create()

            dialog.setOnShowListener {
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val password = input.text?.toString().orEmpty()
                    if (hashPassword(password) == storedHash) {
                        if (continuation.isActive) continuation.resume(true)
                        dialog.dismiss()
                    } else {
                        input.error = "密码错误"
                    }
                }
            }

            continuation.invokeOnCancellation {
                if (dialog.isShowing) dialog.dismiss()
            }
            dialog.show()
        }
    }

    private fun hashPassword(password: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(password.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }
}
