package com.mucheng.notes.presentation.screens.settings

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.util.Log

private const val TAG = "PasskeySettingsLauncher"

// Settings.ACTION_CREDENTIAL_PROVIDER exists in newer SDKs, but keeping the
// action string here also keeps this source compatible with older compile SDKs.
private const val ACTION_CREDENTIAL_PROVIDER_SETTINGS = "android.settings.CREDENTIAL_PROVIDER"

internal fun openPasskeyServiceSettings(context: Context): Boolean {
    return openFirstAvailableSettings(
        context,
        listOf(
            Intent(ACTION_CREDENTIAL_PROVIDER_SETTINGS),
            Intent(Settings.ACTION_SECURITY_SETTINGS),
            Intent(Settings.ACTION_SETTINGS)
        )
    )
}

internal fun openAutofillServiceSettings(context: Context): Boolean {
    return openFirstAvailableSettings(
        context,
        listOf(
            Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
                data = Uri.parse("package:${context.packageName}")
            },
            Intent(Settings.ACTION_SETTINGS)
        )
    )
}

private fun openFirstAvailableSettings(context: Context, intents: List<Intent>): Boolean {
    intents.map { intent ->
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }.forEach { intent ->
        try {
            context.startActivity(intent)
            return true
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "Unable to open settings action: ${intent.action}", e)
        }
    }

    return false
}
