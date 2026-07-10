package com.mucheng.notes.service.passkey

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import androidx.annotation.RequiresApi
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.provider.BeginCreateCredentialRequest
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest
import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import androidx.credentials.provider.CreateEntry
import androidx.credentials.provider.CredentialProviderService
import androidx.credentials.provider.ProviderClearCredentialStateRequest
import androidx.credentials.provider.PublicKeyCredentialEntry
import com.mucheng.notes.R
import com.mucheng.notes.domain.repository.ItemRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class MuchengCredentialProviderService : CredentialProviderService() {

    @Inject
    lateinit var itemRepository: ItemRepository

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onBeginGetCredentialRequest(
        request: BeginGetCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>
    ) {
        serviceScope.launch {
            try {
                val responseBuilder = BeginGetCredentialResponse.Builder()

                request.beginGetCredentialOptions
                    .filterIsInstance<BeginGetPublicKeyCredentialOption>()
                    .forEach { option ->
                        if (cancellationSignal.isCanceled) return@launch
                        val options = MuchengPasskeySupport.parseRequestOptions(option.requestJson)
                        val records = MuchengPasskeySupport.findMatchingPasskeys(
                            itemRepository = itemRepository,
                            options = options
                        )
                        records.take(MAX_PASSKEY_ENTRIES).forEach { record ->
                            responseBuilder.addCredentialEntry(
                                PublicKeyCredentialEntry(
                                    context = this@MuchengCredentialProviderService,
                                    username = displayUsername(record),
                                    pendingIntent = buildPendingIntent(record.itemId, record.passkey.id, option.id),
                                    beginGetPublicKeyCredentialOption = option,
                                    displayName = displayName(record),
                                    lastUsedTime = MuchengPasskeySupport.lastUsedInstant(record.passkey),
                                    isAutoSelectAllowed = records.size == 1
                                )
                            )
                        }
                    }

                if (!cancellationSignal.isCanceled) {
                    callback.onResult(responseBuilder.build())
                }
            } catch (error: Exception) {
                callback.onError(GetCredentialUnknownException(error.message ?: "Passkey query failed"))
            }
        }
    }

    override fun onBeginCreateCredentialRequest(
        request: BeginCreateCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException>
    ) {
        try {
            if (cancellationSignal.isCanceled) {
                callback.onResult(BeginCreateCredentialResponse())
                return
            }

            if (request !is BeginCreatePublicKeyCredentialRequest) {
                callback.onResult(BeginCreateCredentialResponse())
                return
            }

            val options = MuchengPasskeySupport.parseCreationOptions(request.requestJson)
            if (!options.supportsEs256) {
                callback.onResult(BeginCreateCredentialResponse())
                return
            }

            val entry = CreateEntry(
                accountName = options.userName,
                pendingIntent = buildCreatePendingIntent(options.rpId, options.userId),
                description = "保存到 ${getString(R.string.app_name)}",
                publicKeyCredentialCount = 1,
                isAutoSelectAllowed = false
            )
            callback.onResult(
                BeginCreateCredentialResponse.Builder()
                    .addCreateEntry(entry)
                    .build()
            )
        } catch (_: Exception) {
            callback.onResult(BeginCreateCredentialResponse())
        }
    }

    override fun onClearCredentialStateRequest(
        request: ProviderClearCredentialStateRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<Void?, ClearCredentialException>
    ) {
        callback.onResult(null)
    }

    private fun buildPendingIntent(itemId: String, passkeyId: String, optionId: String): PendingIntent {
        val intent = Intent(this, MuchengPasskeyCredentialActivity::class.java).apply {
            putExtra(MuchengPasskeySupport.EXTRA_ITEM_ID, itemId)
            putExtra(MuchengPasskeySupport.EXTRA_PASSKEY_ID, passkeyId)
        }
        val requestCode = "$itemId|$passkeyId|$optionId".hashCode()
        return PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
    }

    private fun buildCreatePendingIntent(rpId: String, userId: String): PendingIntent {
        val intent = Intent(this, MuchengPasskeyCreateActivity::class.java)
        val requestCode = "create|$rpId|$userId".hashCode()
        return PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
    }

    private fun displayUsername(record: VaultPasskeyRecord): String {
        return record.passkey.userName
            .ifBlank { record.payload.username }
            .ifBlank { record.payload.name }
            .ifBlank { getString(R.string.app_name) }
    }

    private fun displayName(record: VaultPasskeyRecord): String? {
        return record.passkey.userDisplayName
            .ifBlank { record.payload.name }
            .takeIf { it.isNotBlank() }
    }

    private companion object {
        private const val MAX_PASSKEY_ENTRIES = 10
    }
}
