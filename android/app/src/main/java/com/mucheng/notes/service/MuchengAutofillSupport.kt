package com.mucheng.notes.service

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.service.autofill.SaveInfo
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import com.mucheng.notes.R
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.payload.VaultEntryPayload
import com.mucheng.notes.domain.model.payload.VaultEntryType
import com.mucheng.notes.domain.model.payload.VaultUri
import com.mucheng.notes.domain.repository.ItemRepository
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.Locale
import java.util.UUID

internal object MuchengAutofillSupport {
    private const val EXTRA_USERNAME_ID = "mucheng.autofill.extra.USERNAME_ID"
    private const val EXTRA_PASSWORD_ID = "mucheng.autofill.extra.PASSWORD_ID"
    private const val EXTRA_PACKAGE_NAME = "mucheng.autofill.extra.PACKAGE_NAME"
    private const val EXTRA_WEB_DOMAIN = "mucheng.autofill.extra.WEB_DOMAIN"
    private const val MAX_DATASETS = 5

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    fun parseStructure(structure: AssistStructure): AutofillParsedStructure {
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

                node.webDomain?.let { webDomain = it }
            }

            packageName = structure.activityComponent?.packageName
        }

        return AutofillParsedStructure(
            usernameId = usernameId,
            passwordId = passwordId,
            packageName = packageName,
            webDomain = webDomain,
            usernameValue = usernameValue,
            passwordValue = passwordValue
        )
    }

    fun buildAuthenticationResponse(
        context: Context,
        parsedInfo: AutofillParsedStructure
    ): FillResponse? {
        val ids = parsedInfo.fillableIds()
        if (ids.isEmpty()) return null

        val authIntent = Intent(context, MuchengAutofillAuthActivity::class.java).apply {
            putParsedInfo(parsedInfo)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            parsedInfo.authRequestCode(),
            authIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or mutablePendingIntentFlag()
        )
        val presentation = RemoteViews(context.packageName, R.layout.autofill_item).apply {
            setTextViewText(R.id.autofill_title, "解锁暮城密码库")
            setTextViewText(R.id.autofill_subtitle, parsedInfo.webDomain ?: parsedInfo.packageName ?: "账号密码自动填充")
        }

        return try {
            FillResponse.Builder()
                .setAuthentication(ids.toTypedArray(), pendingIntent.intentSender, presentation)
                .build()
        } catch (_: Exception) {
            null
        }
    }

    fun readParsedInfo(intent: Intent): AutofillParsedStructure? {
        val usernameId = intent.getParcelableExtraCompat<AutofillId>(EXTRA_USERNAME_ID)
        val passwordId = intent.getParcelableExtraCompat<AutofillId>(EXTRA_PASSWORD_ID)
        if (usernameId == null && passwordId == null) return null

        return AutofillParsedStructure(
            usernameId = usernameId,
            passwordId = passwordId,
            packageName = intent.getStringExtra(EXTRA_PACKAGE_NAME),
            webDomain = intent.getStringExtra(EXTRA_WEB_DOMAIN),
            usernameValue = null,
            passwordValue = null
        )
    }

    suspend fun findMatchingRecords(
        itemRepository: ItemRepository,
        packageName: String?,
        webDomain: String?
    ): List<AutofillVaultRecord> {
        if (packageName == null && webDomain == null) return emptyList()

        return loadVaultLoginRecords(itemRepository)
            .filter { record ->
                record.payload.password.isNotBlank() &&
                    record.payload.uris.any { uri -> matchUri(uri, packageName, webDomain) }
            }
    }

    fun buildFillResponse(
        context: Context,
        records: List<AutofillVaultRecord>,
        parsedInfo: AutofillParsedStructure,
        includeSaveInfo: Boolean
    ): FillResponse? {
        val responseBuilder = FillResponse.Builder()
        var hasResponse = false

        records.take(MAX_DATASETS).forEach { record ->
            val dataset = buildDataset(context, record.payload, parsedInfo)
            if (dataset != null) {
                responseBuilder.addDataset(dataset)
                hasResponse = true
            }
        }

        if (includeSaveInfo) {
            buildSaveInfo(parsedInfo)?.let { saveInfo ->
                responseBuilder.setSaveInfo(saveInfo)
                hasResponse = true
            }
        }

        return if (hasResponse) {
            try {
                responseBuilder.build()
            } catch (_: Exception) {
                null
            }
        } else {
            null
        }
    }

    suspend fun saveCredential(
        context: Context,
        itemRepository: ItemRepository,
        parsedInfo: AutofillParsedStructure
    ) {
        val password = parsedInfo.passwordValue?.trim().orEmpty()
        if (password.isBlank()) return

        val username = parsedInfo.usernameValue?.trim().orEmpty()
        val targetUri = parsedInfo.webDomain?.takeIf { it.isNotBlank() }
            ?: parsedInfo.packageName?.takeIf { it.isNotBlank() }
            ?: return
        val isWebCredential = !parsedInfo.webDomain.isNullOrBlank()
        val uriMatchType = if (isWebCredential) "domain" else "exact"
        val entryName = parsedInfo.webDomain?.takeIf { it.isNotBlank() }
            ?: resolveAppLabel(context, parsedInfo.packageName)
            ?: parsedInfo.packageName
            ?: username.ifBlank { "登录凭据" }

        val existingRecord = loadVaultLoginRecords(itemRepository).firstOrNull { record ->
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

    private fun Intent.putParsedInfo(parsedInfo: AutofillParsedStructure) {
        putExtra(EXTRA_USERNAME_ID, parsedInfo.usernameId)
        putExtra(EXTRA_PASSWORD_ID, parsedInfo.passwordId)
        putExtra(EXTRA_PACKAGE_NAME, parsedInfo.packageName)
        putExtra(EXTRA_WEB_DOMAIN, parsedInfo.webDomain)
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

    private suspend fun loadVaultLoginRecords(itemRepository: ItemRepository): List<AutofillVaultRecord> {
        return itemRepository.getByTypeOnce(ItemType.VAULT_ENTRY)
            .mapNotNull { item ->
                try {
                    val payload = json.decodeFromString<VaultEntryPayload>(item.payload)
                    if (payload.entryType == VaultEntryType.LOGIN) {
                        AutofillVaultRecord(item.id, payload)
                    } else {
                        null
                    }
                } catch (_: Exception) {
                    null
                }
            }
    }

    private fun buildDataset(
        context: Context,
        entry: VaultEntryPayload,
        parsedInfo: AutofillParsedStructure
    ): Dataset? {
        if (entry.password.isBlank()) return null

        val presentation = RemoteViews(context.packageName, R.layout.autofill_item).apply {
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
        } catch (_: Exception) {
            null
        }
    }

    private fun buildSaveInfo(parsedInfo: AutofillParsedStructure): SaveInfo? {
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
                } catch (_: Exception) {
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
            .split("/")
            .firstOrNull()
            ?.split(".")
            ?.takeLast(2)
            ?.joinToString(".") ?: url
    }

    private fun extractHost(url: String): String {
        return url.removePrefix("https://")
            .removePrefix("http://")
            .split("/")
            .firstOrNull() ?: url
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

    private fun resolveAppLabel(context: Context, packageName: String?): String? {
        if (packageName.isNullOrBlank()) return null
        return try {
            val appInfo = context.packageManager.getApplicationInfo(packageName, 0)
            context.packageManager.getApplicationLabel(appInfo).toString()
        } catch (_: Exception) {
            null
        }
    }

    private fun AutofillParsedStructure.fillableIds(): List<AutofillId> {
        return listOfNotNull(usernameId, passwordId)
    }

    private fun AutofillParsedStructure.authRequestCode(): Int {
        return listOf(packageName, webDomain, usernameId?.hashCode(), passwordId?.hashCode())
            .joinToString("|")
            .hashCode()
    }

    private fun mutablePendingIntentFlag(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_MUTABLE
        } else {
            0
        }
    }

    @Suppress("DEPRECATION")
    private inline fun <reified T> Intent.getParcelableExtraCompat(name: String): T? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getParcelableExtra(name, T::class.java)
        } else {
            getParcelableExtra(name) as? T
        }
    }
}

internal data class AutofillParsedStructure(
    val usernameId: AutofillId?,
    val passwordId: AutofillId?,
    val packageName: String?,
    val webDomain: String?,
    val usernameValue: String?,
    val passwordValue: String?
)

internal data class AutofillVaultRecord(
    val id: String,
    val payload: VaultEntryPayload
)
