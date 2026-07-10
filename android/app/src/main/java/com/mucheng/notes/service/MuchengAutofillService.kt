package com.mucheng.notes.service

import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import androidx.annotation.RequiresApi
import com.mucheng.notes.domain.repository.ItemRepository
import com.mucheng.notes.service.passkey.MuchengPasskeyVaultGuard
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * 暮城笔记自动填充服务
 * 提供密码库条目的自动填充功能
 */
@AndroidEntryPoint
@RequiresApi(Build.VERSION_CODES.O)
class MuchengAutofillService : AutofillService() {

    @Inject
    lateinit var itemRepository: ItemRepository

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        val structure = request.fillContexts.lastOrNull()?.structure ?: run {
            callback.onSuccess(null)
            return
        }

        val parsedInfo = MuchengAutofillSupport.parseStructure(structure)
        if (parsedInfo.usernameId == null && parsedInfo.passwordId == null) {
            callback.onSuccess(null)
            return
        }

        if (MuchengPasskeyVaultGuard.isVaultLocked(this)) {
            callback.onSuccess(MuchengAutofillSupport.buildAuthenticationResponse(this, parsedInfo))
            return
        }

        serviceScope.launch {
            try {
                val records = MuchengAutofillSupport.findMatchingRecords(
                    itemRepository = itemRepository,
                    packageName = parsedInfo.packageName,
                    webDomain = parsedInfo.webDomain
                )
                val response = MuchengAutofillSupport.buildFillResponse(
                    context = this@MuchengAutofillService,
                    records = records,
                    parsedInfo = parsedInfo,
                    includeSaveInfo = true
                )
                callback.onSuccess(response)
            } catch (e: Exception) {
                callback.onFailure("自动填充失败: ${e.message}")
            }
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        if (MuchengPasskeyVaultGuard.isVaultLocked(this)) {
            callback.onFailure("密码库已锁定")
            return
        }

        val structure = request.fillContexts.lastOrNull()?.structure ?: run {
            callback.onSuccess()
            return
        }
        val parsedInfo = MuchengAutofillSupport.parseStructure(structure)

        serviceScope.launch {
            try {
                MuchengAutofillSupport.saveCredential(
                    context = this@MuchengAutofillService,
                    itemRepository = itemRepository,
                    parsedInfo = parsedInfo
                )
                callback.onSuccess()
            } catch (e: Exception) {
                callback.onFailure("保存凭据失败: ${e.message}")
            }
        }
    }
}
