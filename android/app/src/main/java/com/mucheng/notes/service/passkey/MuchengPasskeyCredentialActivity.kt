package com.mucheng.notes.service.passkey

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.provider.PendingIntentHandler
import com.mucheng.notes.domain.repository.ItemRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MuchengPasskeyCredentialActivity : ComponentActivity() {

    @Inject
    lateinit var itemRepository: ItemRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        lifecycleScope.launch {
            val resultIntent = Intent()
            try {
                val request = PendingIntentHandler.retrieveProviderGetCredentialRequest(intent)
                    ?: error("Missing provider get credential request")
                val option = request.credentialOptions
                    .filterIsInstance<GetPublicKeyCredentialOption>()
                    .firstOrNull()
                    ?: error("Missing public key credential option")
                val itemId = intent.getStringExtra(MuchengPasskeySupport.EXTRA_ITEM_ID)
                    ?: error("Missing vault item id")
                val passkeyId = intent.getStringExtra(MuchengPasskeySupport.EXTRA_PASSKEY_ID)
                    ?: error("Missing passkey id")

                if (!MuchengPasskeyVaultGuard.ensureUnlocked(this@MuchengPasskeyCredentialActivity)) {
                    error("Vault is locked")
                }

                val responseJson = withContext(Dispatchers.IO) {
                    val options = MuchengPasskeySupport.parseRequestOptions(option.requestJson)
                    val record = MuchengPasskeySupport.findSelectedPasskey(
                        itemRepository = itemRepository,
                        itemId = itemId,
                        passkeyId = passkeyId,
                        options = options
                    ) ?: error("Selected passkey no longer exists")
                    val origin = MuchengPasskeySupport.resolveOrigin(request.callingAppInfo)
                    val assertion = MuchengPasskeySupport.buildAssertionResponse(
                        record = record,
                        options = options,
                        clientDataHash = option.clientDataHash,
                        origin = origin,
                        packageName = request.callingAppInfo.packageName
                    )
                    MuchengPasskeySupport.markPasskeyUsed(
                        itemRepository = itemRepository,
                        record = record,
                        nextSignCount = assertion.nextSignCount
                    )
                    assertion.authenticationResponseJson
                }

                val response = GetCredentialResponse(PublicKeyCredential(responseJson))
                PendingIntentHandler.setGetCredentialResponse(resultIntent, response, request)
                setResult(Activity.RESULT_OK, resultIntent)
            } catch (error: Exception) {
                PendingIntentHandler.setGetCredentialException(
                    resultIntent,
                    GetCredentialUnknownException(error.message ?: "Passkey assertion failed")
                )
                setResult(Activity.RESULT_OK, resultIntent)
            } finally {
                finish()
            }
        }
    }
}
