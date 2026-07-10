package com.mucheng.notes.presentation.screens.settings

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.util.Log

private const val TAG = "PasskeySettingsLauncher"

// Settings.ACTION_CREDENTIAL_PROVIDER exists in newer SDKs, but keeping the
// action string here also keeps this source compatible with older compile SDKs.
private const val ACTION_CREDENTIAL_PROVIDER_SETTINGS = "android.settings.CREDENTIAL_PROVIDER"

internal fun openPasskeyServiceSettings(context: Context): Boolean {
    val intents = listOf(
        Intent(ACTION_CREDENTIAL_PROVIDER_SETTINGS),
        Intent(Settings.ACTION_SECURITY_SETTINGS),
        Intent(Settings.ACTION_SETTINGS)
    ).map { intent ->
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    intents.forEach { intent ->
        try {
            context.startActivity(intent)
            return true
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "Unable to open settings action: ${intent.action}", e)
        }
    }

    return false
}
