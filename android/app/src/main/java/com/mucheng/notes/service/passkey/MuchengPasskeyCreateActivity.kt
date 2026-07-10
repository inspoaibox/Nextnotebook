package com.mucheng.notes.service.passkey

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.provider.PendingIntentHandler
import androidx.lifecycle.lifecycleScope
import com.mucheng.notes.domain.repository.ItemRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

@AndroidEntryPoint
class MuchengPasskeyCreateActivity : ComponentActivity() {

    @Inject
    lateinit var itemRepository: ItemRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        lifecycleScope.launch {
            val resultIntent = Intent()
            try {
                val request = PendingIntentHandler.retrieveProviderCreateCredentialRequest(intent)
                    ?: error("Missing provider create credential request")
                val publicKeyRequest = request.callingRequest as? CreatePublicKeyCredentialRequest
                    ?: error("Missing public key create request")

                if (!MuchengPasskeyVaultGuard.ensureUnlocked(this@MuchengPasskeyCreateActivity)) {
                    error("Vault is locked")
                }

                val registrationResponseJson = withContext(Dispatchers.IO) {
                    val options = MuchengPasskeySupport.parseCreationOptions(publicKeyRequest.requestJson)
                    val origin = MuchengPasskeySupport.resolveOrigin(request.callingAppInfo)
                    MuchengPasskeySupport.createAndStorePasskey(
                        itemRepository = itemRepository,
                        options = options,
                        clientDataHash = publicKeyRequest.clientDataHash,
                        origin = origin,
                        packageName = request.callingAppInfo.packageName
                    ).registrationResponseJson
                }

                PendingIntentHandler.setCreateCredentialResponse(
                    resultIntent,
                    CreatePublicKeyCredentialResponse(registrationResponseJson)
                )
                setResult(Activity.RESULT_OK, resultIntent)
            } catch (error: Exception) {
                PendingIntentHandler.setCreateCredentialException(
                    resultIntent,
                    CreateCredentialUnknownException(error.message ?: "Passkey creation failed")
                )
                setResult(Activity.RESULT_OK, resultIntent)
            } finally {
                finish()
            }
        }
    }
}
