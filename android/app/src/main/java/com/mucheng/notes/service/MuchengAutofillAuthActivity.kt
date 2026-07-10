package com.mucheng.notes.service

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.autofill.AutofillManager
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.mucheng.notes.domain.repository.ItemRepository
import com.mucheng.notes.service.passkey.MuchengPasskeyVaultGuard
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

@AndroidEntryPoint
class MuchengAutofillAuthActivity : ComponentActivity() {

    @Inject
    lateinit var itemRepository: ItemRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        lifecycleScope.launch {
            try {
                val parsedInfo = MuchengAutofillSupport.readParsedInfo(intent)
                    ?: error("Missing autofill request")

                if (!MuchengPasskeyVaultGuard.ensureUnlocked(this@MuchengAutofillAuthActivity)) {
                    setResult(Activity.RESULT_CANCELED)
                    return@launch
                }

                val records = withContext(Dispatchers.IO) {
                    MuchengAutofillSupport.findMatchingRecords(
                        itemRepository = itemRepository,
                        packageName = parsedInfo.packageName,
                        webDomain = parsedInfo.webDomain
                    )
                }
                val response = MuchengAutofillSupport.buildFillResponse(
                    context = this@MuchengAutofillAuthActivity,
                    records = records,
                    parsedInfo = parsedInfo,
                    includeSaveInfo = false
                )

                if (response != null) {
                    val resultIntent = Intent().apply {
                        putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, response)
                    }
                    setResult(Activity.RESULT_OK, resultIntent)
                } else {
                    setResult(Activity.RESULT_CANCELED)
                }
            } catch (_: Exception) {
                setResult(Activity.RESULT_CANCELED)
            } finally {
                finish()
            }
        }
    }
}
