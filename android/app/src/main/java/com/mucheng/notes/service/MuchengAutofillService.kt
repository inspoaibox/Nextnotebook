package com.mucheng.notes.service

import android.app.assist.AssistStructure
import android.content.Context
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveInfo
import android.service.autofill.SaveRequest
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import androidx.annotation.RequiresApi
import com.mucheng.notes.R
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.repository.ItemRepository
import com.mucheng.notes.domain.model.payload.VaultEntryPayload
import com.mucheng.notes.domain.model.payload.VaultEntryType
import com.mucheng.notes.domain.model.payload.VaultUri
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.Locale
import java.util.UUID
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
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }
    
    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        val structure = request.fillContexts.lastOrNull()?.structure ?: run {
            callback.onSuccess(null)
            return
        }
        
        // 解析请求获取包名或域名
        val parsedInfo = parseStructure(structure)
        if (parsedInfo.usernameId == null && parsedInfo.passwordId == null) {
            callback.onSuccess(null)
            return
        }

        if (isVaultLocked()) {
            callback.onSuccess(null)
            return
        }
        
        serviceScope.launch {
            try {
                // 查询匹配的密码库条目
                val entries = findMatchingEntries(parsedInfo.packageName, parsedInfo.webDomain)
                
                // 构建填充响应
                val responseBuilder = FillResponse.Builder()
                var hasResponse = false
                
                for (entry in entries.take(5)) { // 最多显示5个
                    val dataset = buildDataset(entry, parsedInfo)
                    if (dataset != null) {
                        responseBuilder.addDataset(dataset)
                        hasResponse = true
                    }
                }

                buildSaveInfo(parsedInfo)?.let { saveInfo ->
                    responseBuilder.setSaveInfo(saveInfo)
                    hasResponse = true
                }
                
                callback.onSuccess(if (hasResponse) responseBuilder.build() else null)
            } catch (e: Exception) {
                callback.onFailure("自动填充失败: ${e.message}")
            }
        }
    }
    
    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        if (isVaultLocked()) {
            callback.onFailure("密码库已锁定")
            return
        }

        val structure = request.fillContexts.lastOrNull()?.structure ?: run {
            callback.onSuccess()
            return
        }
        val parsedInfo = parseStructure(structure)

        serviceScope.launch {
            try {
                saveCredential(parsedInfo)
                callback.onSuccess()
            } catch (e: Exception) {
                callback.onFailure("保存凭据失败: ${e.message}")
            }
        }
    }
    
    /**
     * 解析 AssistStructure 获取填充信息
     */
    private fun parseStructure(structure: AssistStructure): ParsedStructure {
        var usernameId: AutofillId? = null
        var passwordId: AutofillId? = null
        var packageName: String? = null
        var webDomain: String? = null
        var usernameValue: String? = null
        var passwordValue: String? = null
        
        for (i in 0 until structure.windowNodeCount) {
            val windowNode = structure.getWindowNodeAt(i)
            val rootNode = windowNode.rootViewNode
            
            parseNode(rootNode) { node ->
                val autofillId = node.autofillId
                val isUsernameField = isUsernameField(node)
                val isPasswordField = isPasswordField(node)
                val textValue = extractTextValue(node).trim()

                if (autofillId != null && isUsernameField && usernameId == null) {
                    usernameId = autofillId
                }
                if (autofillId != null && isPasswordField && passwordId == null) {
                    passwordId = autofillId
                }
                if (isUsernameField && usernameValue.isNullOrBlank() && textValue.isNotBlank()) {
                    usernameValue = textValue
                }
                if (isPasswordField && passwordValue.isNullOrBlank() && textValue.isNotBlank()) {
                    passwordValue = textValue
                }
                
                // 获取 web 域名
                node.webDomain?.let { webDomain = it }
            }
            
            packageName = structure.activityComponent?.packageName
        }
        
        return ParsedStructure(
            usernameId = usernameId,
            passwordId = passwordId,
            packageName = packageName,
            webDomain = webDomain,
            usernameValue = usernameValue,
            passwordValue = passwordValue
        )
    }
    
    private fun parseNode(
        node: AssistStructure.ViewNode,
        callback: (AssistStructure.ViewNode) -> Unit
    ) {
        callback(node)
        for (i in 0 until node.childCount) {
            parseNode(node.getChildAt(i), callback)
        }
    }
    
    /**
     * 查找匹配的密码库条目
     */
    private suspend fun findMatchingEntries(
        packageName: String?,
        webDomain: String?
    ): List<VaultEntryPayload> {
        if (packageName == null && webDomain == null) return emptyList()

        return loadVaultLoginRecords()
            .map { it.payload }
            .filter { entry ->
                entry.password.isNotBlank() &&
                    entry.uris.any { uri -> matchUri(uri, packageName, webDomain) }
            }
    }
    
    /**
     * 检查 URI 是否匹配
     */
    private fun matchUri(uri: VaultUri, packageName: String?, webDomain: String?): Boolean {
        val target = webDomain ?: packageName ?: return false
        
        return when (uri.matchType) {
            "domain" -> {
                val uriDomain = extractDomain(uri.uri)
                val targetDomain = extractDomain(target)
                uriDomain == targetDomain
            }
            "host" -> {
                val uriHost = extractHost(uri.uri)
                val targetHost = extractHost(target)
                uriHost == targetHost
            }
            "starts_with" -> target.startsWith(uri.uri)
            "exact" -> target == uri.uri
            "regex" -> {
                try {
                    Regex(uri.uri).matches(target)
                } catch (e: Exception) {
                    false
                }
            }
            "never" -> false
            else -> false
        }
    }
    
    private fun extractDomain(url: String): String {
        return url.removePrefix("https://")
            .removePrefix("http://")
            .split("/").firstOrNull()
            ?.split(".")
            ?.takeLast(2)
            ?.joinToString(".") ?: url
    }
    
    private fun extractHost(url: String): String {
        return url.removePrefix("https://")
            .removePrefix("http://")
            .split("/").firstOrNull() ?: url
    }
    
    /**
     * 构建数据集
     */
    private fun buildDataset(
        entry: VaultEntryPayload,
        parsedInfo: ParsedStructure
    ): Dataset? {
        if (entry.password.isBlank()) return null

        val presentation = RemoteViews(packageName, R.layout.autofill_item).apply {
            setTextViewText(R.id.autofill_title, entry.name)
            setTextViewText(R.id.autofill_subtitle, entry.username)
        }
        
        val datasetBuilder = Dataset.Builder(presentation)
        var hasValue = false
        
        parsedInfo.usernameId?.takeIf { entry.username.isNotBlank() }?.let { id ->
            datasetBuilder.setValue(id, AutofillValue.forText(entry.username))
            hasValue = true
        }
        
        parsedInfo.passwordId?.let { id ->
            datasetBuilder.setValue(id, AutofillValue.forText(entry.password))
            hasValue = true
        }

        if (!hasValue) return null
        
        return try {
            datasetBuilder.build()
        } catch (e: Exception) {
            null
        }
    }

    private suspend fun saveCredential(parsedInfo: ParsedStructure) {
        val password = parsedInfo.passwordValue?.trim().orEmpty()
        if (password.isBlank()) return

        val username = parsedInfo.usernameValue?.trim().orEmpty()
        val targetUri = parsedInfo.webDomain?.takeIf { it.isNotBlank() }
            ?: parsedInfo.packageName?.takeIf { it.isNotBlank() }
            ?: return
        val isWebCredential = !parsedInfo.webDomain.isNullOrBlank()
        val uriMatchType = if (isWebCredential) "domain" else "exact"
        val entryName = parsedInfo.webDomain?.takeIf { it.isNotBlank() }
            ?: resolveAppLabel(parsedInfo.packageName)
            ?: parsedInfo.packageName
            ?: username.ifBlank { "登录凭据" }

        val existingRecord = loadVaultLoginRecords().firstOrNull { record ->
            record.payload.username == username &&
                record.payload.uris.any { uri -> matchUri(uri, parsedInfo.packageName, parsedInfo.webDomain) }
        }

        if (existingRecord != null) {
            val nextUris = ensureUri(
                uris = existingRecord.payload.uris,
                targetUri = targetUri,
                name = entryName,
                matchType = uriMatchType
            )
            val updatedPayload = existingRecord.payload.copy(
                name = existingRecord.payload.name.ifBlank { entryName },
                password = password,
                uris = nextUris
            )
            if (updatedPayload != existingRecord.payload) {
                itemRepository.update(existingRecord.id, json.encodeToString(updatedPayload))
            }
            return
        }

        val payload = VaultEntryPayload(
            name = entryName,
            entryType = VaultEntryType.LOGIN,
            username = username,
            password = password,
            uris = listOf(
                VaultUri(
                    id = UUID.randomUUID().toString(),
                    name = entryName,
                    uri = targetUri,
                    matchType = uriMatchType
                )
            )
        )
        itemRepository.create(ItemType.VAULT_ENTRY, json.encodeToString(payload))
    }

    private suspend fun loadVaultLoginRecords(): List<VaultRecord> {
        return itemRepository.getByTypeOnce(ItemType.VAULT_ENTRY)
            .mapNotNull { item ->
                try {
                    val payload = json.decodeFromString<VaultEntryPayload>(item.payload)
                    if (payload.entryType == VaultEntryType.LOGIN) {
                        VaultRecord(item.id, payload)
                    } else {
                        null
                    }
                } catch (_: Exception) {
                    null
                }
            }
    }

    private fun buildSaveInfo(parsedInfo: ParsedStructure): SaveInfo? {
        val passwordId = parsedInfo.passwordId ?: return null
        val builder = SaveInfo.Builder(SaveInfo.SAVE_DATA_TYPE_PASSWORD, arrayOf(passwordId))
        parsedInfo.usernameId?.let { usernameId ->
            builder.setOptionalIds(arrayOf(usernameId))
        }
        return try {
            builder.build()
        } catch (_: Exception) {
            null
        }
    }

    private fun ensureUri(
        uris: List<VaultUri>,
        targetUri: String,
        name: String,
        matchType: String
    ): List<VaultUri> {
        if (uris.any { it.uri == targetUri && it.matchType == matchType }) return uris
        return uris + VaultUri(
            id = UUID.randomUUID().toString(),
            name = name,
            uri = targetUri,
            matchType = matchType
        )
    }

    private fun isUsernameField(node: AssistStructure.ViewNode): Boolean {
        val signals = fieldSignals(node)
        val usernameHint = android.view.View.AUTOFILL_HINT_USERNAME.lowercase(Locale.ROOT)
        val emailHint = android.view.View.AUTOFILL_HINT_EMAIL_ADDRESS.lowercase(Locale.ROOT)
        if (signals.any { it == usernameHint || it == emailHint }) {
            return true
        }
        return !isPasswordField(node) && signals.any { signal ->
            signal.contains("username") ||
                signal.contains("user") ||
                signal.contains("email") ||
                signal.contains("login") ||
                signal.contains("account") ||
                signal.contains("邮箱") ||
                signal.contains("账号") ||
                signal.contains("帐号")
        }
    }

    private fun isPasswordField(node: AssistStructure.ViewNode): Boolean {
        val signals = fieldSignals(node)
        val passwordHint = android.view.View.AUTOFILL_HINT_PASSWORD.lowercase(Locale.ROOT)
        return signals.any { signal ->
            signal == passwordHint ||
                signal.contains("password") ||
                signal.contains("passwd") ||
                signal.contains("pwd") ||
                signal.contains("密码")
        }
    }

    private fun fieldSignals(node: AssistStructure.ViewNode): List<String> {
        val signals = mutableListOf<String>()
        node.autofillHints?.forEach { signals += it.lowercase(Locale.ROOT) }
        node.idEntry?.let { signals += it.lowercase(Locale.ROOT) }
        node.hint?.let { signals += it.lowercase(Locale.ROOT) }
        node.htmlInfo?.attributes?.forEach { attr ->
            attr.first?.let { signals += it.lowercase(Locale.ROOT) }
            attr.second?.let { signals += it.lowercase(Locale.ROOT) }
        }
        return signals
    }

    private fun extractTextValue(node: AssistStructure.ViewNode): String {
        val value = node.autofillValue
        if (value != null && value.isText) {
            return value.textValue?.toString().orEmpty()
        }
        return node.text?.toString().orEmpty()
    }

    private fun resolveAppLabel(packageName: String?): String? {
        if (packageName.isNullOrBlank()) return null
        return try {
            val appInfo = packageManager.getApplicationInfo(packageName, 0)
            packageManager.getApplicationLabel(appInfo).toString()
        } catch (_: Exception) {
            null
        }
    }

    private fun isVaultLocked(): Boolean {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_VAULT_LOCK_ENABLED, false) &&
            prefs.getString(KEY_VAULT_PASSWORD, null) != null
    }
    
    private data class ParsedStructure(
        val usernameId: AutofillId?,
        val passwordId: AutofillId?,
        val packageName: String?,
        val webDomain: String?,
        val usernameValue: String?,
        val passwordValue: String?
    )

    private data class VaultRecord(
        val id: String,
        val payload: VaultEntryPayload
    )

    private companion object {
        private const val PREFS_NAME = "app_settings"
        private const val KEY_VAULT_PASSWORD = "vault_password"
        private const val KEY_VAULT_LOCK_ENABLED = "vault_lock_enabled"
    }
}
