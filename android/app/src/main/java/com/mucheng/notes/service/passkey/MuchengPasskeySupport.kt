package com.mucheng.notes.service.passkey

import android.util.Base64
import androidx.credentials.provider.CallingAppInfo
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.payload.VaultEntryPayload
import com.mucheng.notes.domain.model.payload.VaultEntryType
import com.mucheng.notes.domain.model.payload.VaultPasskey
import com.mucheng.notes.domain.model.payload.VaultUri
import com.mucheng.notes.domain.repository.ItemRepository
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.math.BigInteger
import java.nio.ByteBuffer
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.Signature
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPrivateKeySpec
import java.time.Instant
import java.util.UUID

internal data class PasskeyRequestOptions(
    val rpId: String,
    val challenge: String,
    val allowCredentialIds: Set<String>
)

internal data class VaultPasskeyRecord(
    val itemId: String,
    val payload: VaultEntryPayload,
    val passkey: VaultPasskey
)

internal data class PasskeyAssertionResult(
    val authenticationResponseJson: String,
    val nextSignCount: Long
)

internal data class PasskeyCreationOptions(
    val rpId: String,
    val rpName: String,
    val challenge: String,
    val userId: String,
    val userName: String,
    val userDisplayName: String,
    val excludeCredentialIds: Set<String>,
    val supportsEs256: Boolean
)

internal data class PasskeyCreationResult(
    val registrationResponseJson: String,
    val itemId: String,
    val passkeyId: String
)

internal object MuchengPasskeySupport {
    const val EXTRA_ITEM_ID = "mucheng.passkey.extra.ITEM_ID"
    const val EXTRA_PASSKEY_ID = "mucheng.passkey.extra.PASSKEY_ID"

    private const val JWK_PREFIX = "jwk:"
    private const val PRIVILEGED_ALLOWLIST = """{"apps":[]}"""
    private val passkeyAaguid = sha256("mucheng-notes-software-passkey".toByteArray())
        .copyOfRange(0, 16)
    private val secureRandom = SecureRandom()

    val json: Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    fun parseRequestOptions(requestJson: String): PasskeyRequestOptions {
        val root = json.parseToJsonElement(requestJson).jsonObject
        val rpId = root["rpId"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        val challenge = root["challenge"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        val allowCredentialIds = (root["allowCredentials"] as? JsonArray)
            ?.mapNotNull { credential ->
                val credentialObject = credential.jsonObject
                val type = credentialObject["type"]?.jsonPrimitive?.contentOrNull ?: "public-key"
                if (type != "public-key") return@mapNotNull null
                credentialObject["id"]?.jsonPrimitive?.contentOrNull?.trim()?.takeIf { it.isNotBlank() }
            }
            ?.toSet()
            ?: emptySet()

        require(rpId.isNotBlank()) { "rpId is required" }
        require(challenge.isNotBlank()) { "challenge is required" }

        return PasskeyRequestOptions(
            rpId = rpId,
            challenge = challenge,
            allowCredentialIds = allowCredentialIds
        )
    }

    fun parseCreationOptions(requestJson: String): PasskeyCreationOptions {
        val root = json.parseToJsonElement(requestJson).jsonObject
        val rp = root["rp"]?.jsonObject ?: JsonObject(emptyMap())
        val user = root["user"]?.jsonObject ?: JsonObject(emptyMap())
        val rpId = rp["id"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        val rpName = rp["name"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty().ifBlank { rpId }
        val challenge = root["challenge"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        val userId = user["id"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        val userName = user["name"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        val userDisplayName = user["displayName"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
            .ifBlank { userName }
        val excludeCredentialIds = (root["excludeCredentials"] as? JsonArray)
            ?.mapNotNull { credential ->
                val credentialObject = credential.jsonObject
                val type = credentialObject["type"]?.jsonPrimitive?.contentOrNull ?: "public-key"
                if (type != "public-key") return@mapNotNull null
                credentialObject["id"]?.jsonPrimitive?.contentOrNull?.trim()?.takeIf { it.isNotBlank() }
            }
            ?.toSet()
            ?: emptySet()
        val supportsEs256 = (root["pubKeyCredParams"] as? JsonArray)
            ?.any { param ->
                val paramObject = param.jsonObject
                paramObject["type"]?.jsonPrimitive?.contentOrNull == "public-key" &&
                    paramObject["alg"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() == -7
            }
            ?: true

        require(rpId.isNotBlank()) { "rp.id is required" }
        require(challenge.isNotBlank()) { "challenge is required" }
        require(userId.isNotBlank()) { "user.id is required" }
        require(userName.isNotBlank() || userDisplayName.isNotBlank()) { "user.name is required" }

        return PasskeyCreationOptions(
            rpId = rpId,
            rpName = rpName,
            challenge = challenge,
            userId = userId,
            userName = userName.ifBlank { userDisplayName },
            userDisplayName = userDisplayName.ifBlank { userName },
            excludeCredentialIds = excludeCredentialIds,
            supportsEs256 = supportsEs256
        )
    }

    suspend fun findMatchingPasskeys(
        itemRepository: ItemRepository,
        options: PasskeyRequestOptions
    ): List<VaultPasskeyRecord> {
        return itemRepository.getByTypeOnce(ItemType.VAULT_ENTRY)
            .filter { it.deletedTime == null }
            .flatMap { item ->
                val payload = runCatching {
                    json.decodeFromString<VaultEntryPayload>(item.payload)
                }.getOrNull() ?: return@flatMap emptyList()

                if (payload.entryType != VaultEntryType.LOGIN) {
                    return@flatMap emptyList()
                }

                payload.passkeys
                    .filter { passkey ->
                        passkey.credentialType == "public-key" &&
                            passkey.rpId == options.rpId &&
                            (options.allowCredentialIds.isEmpty() ||
                                options.allowCredentialIds.contains(passkey.credentialId))
                    }
                    .map { passkey -> VaultPasskeyRecord(item.id, payload, passkey) }
            }
            .sortedByDescending { record ->
                record.passkey.lastUsedAt ?: record.passkey.createdAt
            }
    }

    suspend fun findSelectedPasskey(
        itemRepository: ItemRepository,
        itemId: String,
        passkeyId: String,
        options: PasskeyRequestOptions
    ): VaultPasskeyRecord? {
        val item = itemRepository.getById(itemId) ?: return null
        val payload = runCatching {
            json.decodeFromString<VaultEntryPayload>(item.payload)
        }.getOrNull() ?: return null

        if (payload.entryType != VaultEntryType.LOGIN) {
            return null
        }

        val passkey = payload.passkeys.firstOrNull { candidate ->
            candidate.id == passkeyId &&
                candidate.rpId == options.rpId &&
                (options.allowCredentialIds.isEmpty() ||
                    options.allowCredentialIds.contains(candidate.credentialId))
        } ?: return null

        return VaultPasskeyRecord(item.id, payload, passkey)
    }

    suspend fun markPasskeyUsed(
        itemRepository: ItemRepository,
        record: VaultPasskeyRecord,
        nextSignCount: Long
    ) {
        val updatedPasskeys = record.payload.passkeys.map { passkey ->
            if (passkey.id == record.passkey.id) {
                passkey.copy(
                    signCount = nextSignCount,
                    lastUsedAt = System.currentTimeMillis()
                )
            } else {
                passkey
            }
        }
        val updatedPayload = record.payload.copy(passkeys = updatedPasskeys)
        itemRepository.update(record.itemId, json.encodeToString(updatedPayload))
    }

    fun buildAssertionResponse(
        record: VaultPasskeyRecord,
        options: PasskeyRequestOptions,
        clientDataHash: ByteArray?,
        origin: String,
        packageName: String?
    ): PasskeyAssertionResult {
        val nextSignCount = (record.passkey.signCount + 1).coerceAtLeast(1)
        val authenticatorData = buildAuthenticatorData(options.rpId, nextSignCount)
        val clientDataJson = buildClientDataJson(options, origin, packageName)
        val hash = clientDataHash ?: sha256(clientDataJson)
        val signature = sign(record.passkey.privateKey, authenticatorData + hash)

        val response = buildJsonObject {
            if (clientDataHash == null) {
                put("clientDataJSON", JsonPrimitive(base64UrlEncode(clientDataJson)))
            }
            put("authenticatorData", JsonPrimitive(base64UrlEncode(authenticatorData)))
            put("signature", JsonPrimitive(base64UrlEncode(signature)))
            put("userHandle", JsonPrimitive(record.passkey.userId))
        }

        val credentialJson = buildJsonObject {
            put("id", JsonPrimitive(record.passkey.credentialId))
            put("rawId", JsonPrimitive(record.passkey.credentialId))
            put("type", JsonPrimitive("public-key"))
            put("authenticatorAttachment", JsonPrimitive("platform"))
            put("response", response)
            put("clientExtensionResults", JsonObject(emptyMap()))
        }.toString()

        return PasskeyAssertionResult(
            authenticationResponseJson = credentialJson,
            nextSignCount = nextSignCount
        )
    }

    suspend fun createAndStorePasskey(
        itemRepository: ItemRepository,
        options: PasskeyCreationOptions,
        clientDataHash: ByteArray?,
        origin: String,
        packageName: String?
    ): PasskeyCreationResult {
        require(options.supportsEs256) { "Only ES256 passkeys are supported" }
        val existingRecords = findPasskeysForRp(itemRepository, options.rpId)
        require(existingRecords.none { options.excludeCredentialIds.contains(it.passkey.credentialId) }) {
            "A matching passkey already exists"
        }

        val keyPair = KeyPairGenerator.getInstance("EC").apply {
            initialize(ECGenParameterSpec("secp256r1"), secureRandom)
        }.generateKeyPair()
        val publicKey = keyPair.public as ECPublicKey
        val privateKey = keyPair.private as ECPrivateKey
        val credentialId = ByteArray(32).also { secureRandom.nextBytes(it) }
        val credentialIdText = base64UrlEncode(credentialId)
        val passkey = createVaultPasskey(options, credentialIdText, publicKey, privateKey)
        val targetRecord = findTargetRecordForCreation(itemRepository, options)
        val itemId = if (targetRecord != null) {
            val updatedPayload = targetRecord.payload.copy(
                passkeys = targetRecord.payload.passkeys + passkey
            )
            itemRepository.update(targetRecord.itemId, json.encodeToString(updatedPayload))
            targetRecord.itemId
        } else {
            val payload = VaultEntryPayload(
                name = options.rpName.ifBlank { options.rpId },
                entryType = VaultEntryType.LOGIN,
                username = options.userName,
                password = "",
                uris = listOf(
                    VaultUri(
                        id = UUID.randomUUID().toString(),
                        name = options.rpId,
                        uri = "https://${options.rpId}",
                        matchType = "domain"
                    )
                ),
                passkeys = listOf(passkey)
            )
            itemRepository.create(ItemType.VAULT_ENTRY, json.encodeToString(payload)).id
        }

        val authData = buildAttestationAuthenticatorData(
            rpId = options.rpId,
            credentialId = credentialId,
            publicKey = publicKey
        )
        val attestationObject = cborEncode(
            linkedMapOf(
                "fmt" to "none",
                "attStmt" to linkedMapOf<Any, Any>(),
                "authData" to authData
            )
        )
        val clientDataJson = buildCreationClientDataJson(options, origin, packageName)
        val response = buildJsonObject {
            if (clientDataHash == null) {
                put("clientDataJSON", JsonPrimitive(base64UrlEncode(clientDataJson)))
            }
            put("attestationObject", JsonPrimitive(base64UrlEncode(attestationObject)))
            put("transports", JsonArray(listOf(JsonPrimitive("internal"))))
        }
        val registrationJson = buildJsonObject {
            put("id", JsonPrimitive(credentialIdText))
            put("rawId", JsonPrimitive(credentialIdText))
            put("type", JsonPrimitive("public-key"))
            put("authenticatorAttachment", JsonPrimitive("platform"))
            put("response", response)
            put("clientExtensionResults", JsonObject(emptyMap()))
        }.toString()

        return PasskeyCreationResult(
            registrationResponseJson = registrationJson,
            itemId = itemId,
            passkeyId = passkey.id
        )
    }

    fun resolveOrigin(callingAppInfo: CallingAppInfo): String {
        val privilegedOrigin = runCatching {
            callingAppInfo.getOrigin(PRIVILEGED_ALLOWLIST)
        }.getOrNull()
        if (!privilegedOrigin.isNullOrBlank()) {
            return privilegedOrigin
        }

        val signature = callingAppInfo.signingInfoCompat.signingCertificateHistory.firstOrNull()
            ?: return "android:apk-key-hash:${callingAppInfo.packageName}"
        return "android:apk-key-hash:${base64UrlEncode(sha256(signature.toByteArray()))}"
    }

    fun lastUsedInstant(passkey: VaultPasskey): Instant? {
        val millis = passkey.lastUsedAt ?: passkey.createdAt
        return if (millis > 0) Instant.ofEpochMilli(millis) else null
    }

    private fun buildAuthenticatorData(rpId: String, signCount: Long): ByteArray {
        val flags = (0x01 or 0x04 or 0x08 or 0x10).toByte()
        val counter = ByteBuffer.allocate(4)
            .putInt(signCount.coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
            .array()
        return sha256(rpId.toByteArray(Charsets.UTF_8)) + byteArrayOf(flags) + counter
    }

    private fun buildAttestationAuthenticatorData(
        rpId: String,
        credentialId: ByteArray,
        publicKey: ECPublicKey
    ): ByteArray {
        val flags = (0x01 or 0x04 or 0x08 or 0x10 or 0x40).toByte()
        val credentialIdLength = ByteBuffer.allocate(2).putShort(credentialId.size.toShort()).array()
        return sha256(rpId.toByteArray(Charsets.UTF_8)) +
            byteArrayOf(flags) +
            ByteArray(4) +
            passkeyAaguid +
            credentialIdLength +
            credentialId +
            buildCosePublicKey(publicKey)
    }

    private fun buildClientDataJson(
        options: PasskeyRequestOptions,
        origin: String,
        packageName: String?
    ): ByteArray {
        return buildJsonObject {
            put("type", JsonPrimitive("webauthn.get"))
            put("challenge", JsonPrimitive(options.challenge))
            put("origin", JsonPrimitive(origin))
            if (!packageName.isNullOrBlank()) {
                put("androidPackageName", JsonPrimitive(packageName))
            }
        }.toString().toByteArray(Charsets.UTF_8)
    }

    private fun buildCreationClientDataJson(
        options: PasskeyCreationOptions,
        origin: String,
        packageName: String?
    ): ByteArray {
        return buildJsonObject {
            put("type", JsonPrimitive("webauthn.create"))
            put("challenge", JsonPrimitive(options.challenge))
            put("origin", JsonPrimitive(origin))
            if (!packageName.isNullOrBlank()) {
                put("androidPackageName", JsonPrimitive(packageName))
            }
        }.toString().toByteArray(Charsets.UTF_8)
    }

    private suspend fun findPasskeysForRp(
        itemRepository: ItemRepository,
        rpId: String
    ): List<VaultPasskeyRecord> {
        return itemRepository.getByTypeOnce(ItemType.VAULT_ENTRY)
            .filter { it.deletedTime == null }
            .flatMap { item ->
                val payload = runCatching {
                    json.decodeFromString<VaultEntryPayload>(item.payload)
                }.getOrNull() ?: return@flatMap emptyList()
                payload.passkeys
                    .filter { it.rpId == rpId && it.credentialType == "public-key" }
                    .map { VaultPasskeyRecord(item.id, payload, it) }
            }
    }

    private suspend fun findTargetRecordForCreation(
        itemRepository: ItemRepository,
        options: PasskeyCreationOptions
    ): VaultPasskeyRecord? {
        return itemRepository.getByTypeOnce(ItemType.VAULT_ENTRY)
            .filter { it.deletedTime == null }
            .mapNotNull { item ->
                val payload = runCatching {
                    json.decodeFromString<VaultEntryPayload>(item.payload)
                }.getOrNull() ?: return@mapNotNull null
                if (payload.entryType != VaultEntryType.LOGIN) return@mapNotNull null
                item.id to payload
            }
            .firstOrNull { (_, payload) ->
                payload.username.equals(options.userName, ignoreCase = true) &&
                    (payload.passkeys.any { it.rpId == options.rpId } ||
                        payload.uris.any { uri -> uriMatchesRp(uri.uri, options.rpId) })
            }
            ?.let { (itemId, payload) ->
                VaultPasskeyRecord(
                    itemId = itemId,
                    payload = payload,
                    passkey = payload.passkeys.firstOrNull() ?: createPlaceholderPasskey(options)
                )
            }
    }

    private fun uriMatchesRp(uri: String, rpId: String): Boolean {
        val host = uri
            .removePrefix("https://")
            .removePrefix("http://")
            .substringBefore("/")
            .removePrefix("www.")
            .lowercase()
        val normalizedRp = rpId.removePrefix("www.").lowercase()
        return host == normalizedRp || host.endsWith(".$normalizedRp")
    }

    private fun createVaultPasskey(
        options: PasskeyCreationOptions,
        credentialId: String,
        publicKey: ECPublicKey,
        privateKey: ECPrivateKey
    ): VaultPasskey {
        val now = System.currentTimeMillis()
        val publicJwk = buildJsonObject {
            put("kty", JsonPrimitive("EC"))
            put("crv", JsonPrimitive("P-256"))
            put("x", JsonPrimitive(base64UrlEncode(fixedCoordinate(publicKey.w.affineX))))
            put("y", JsonPrimitive(base64UrlEncode(fixedCoordinate(publicKey.w.affineY))))
        }.toString()
        val privateJwk = buildJsonObject {
            put("kty", JsonPrimitive("EC"))
            put("crv", JsonPrimitive("P-256"))
            put("x", JsonPrimitive(base64UrlEncode(fixedCoordinate(publicKey.w.affineX))))
            put("y", JsonPrimitive(base64UrlEncode(fixedCoordinate(publicKey.w.affineY))))
            put("d", JsonPrimitive(base64UrlEncode(fixedCoordinate(privateKey.s))))
        }.toString()

        return VaultPasskey(
            id = UUID.randomUUID().toString(),
            credentialType = "public-key",
            rpId = options.rpId,
            rpName = options.rpName,
            credentialId = credentialId,
            userId = options.userId,
            userName = options.userName,
            userDisplayName = options.userDisplayName,
            publicKey = storeJwk(publicJwk),
            privateKey = storeJwk(privateJwk),
            signCount = 0,
            algorithm = "ES256",
            transports = listOf("internal"),
            backupEligible = true,
            backupState = true,
            createdAt = now,
            lastUsedAt = null
        )
    }

    private fun createPlaceholderPasskey(options: PasskeyCreationOptions): VaultPasskey {
        return VaultPasskey(
            rpId = options.rpId,
            rpName = options.rpName,
            userId = options.userId,
            userName = options.userName,
            userDisplayName = options.userDisplayName
        )
    }

    private fun storeJwk(jwkJson: String): String {
        return "$JWK_PREFIX${base64UrlEncode(jwkJson.toByteArray(Charsets.UTF_8))}"
    }

    private fun buildCosePublicKey(publicKey: ECPublicKey): ByteArray {
        return cborEncode(
            linkedMapOf(
                1 to 2,
                3 to -7,
                -1 to 1,
                -2 to fixedCoordinate(publicKey.w.affineX),
                -3 to fixedCoordinate(publicKey.w.affineY)
            )
        )
    }

    private fun cborEncode(value: Any): ByteArray {
        return when (value) {
            is Int -> encodeCborInteger(value.toLong())
            is Long -> encodeCborInteger(value)
            is String -> encodeCborTypeAndLength(3, value.toByteArray(Charsets.UTF_8).size.toLong()) +
                value.toByteArray(Charsets.UTF_8)
            is ByteArray -> encodeCborTypeAndLength(2, value.size.toLong()) + value
            is Map<*, *> -> {
                val entries = value.entries.flatMap { (key, itemValue) ->
                    listOf(
                        cborEncode(key ?: error("CBOR map key cannot be null")),
                        cborEncode(itemValue ?: error("CBOR map value cannot be null"))
                    )
                }
                encodeCborTypeAndLength(5, value.size.toLong()) +
                    entries.fold(ByteArray(0)) { acc, bytes -> acc + bytes }
            }
            else -> error("Unsupported CBOR value: ${value::class.java.name}")
        }
    }

    private fun encodeCborInteger(value: Long): ByteArray {
        return if (value >= 0) {
            encodeCborTypeAndLength(0, value)
        } else {
            encodeCborTypeAndLength(1, -1 - value)
        }
    }

    private fun encodeCborTypeAndLength(majorType: Int, length: Long): ByteArray {
        return when {
            length < 24 -> byteArrayOf(((majorType shl 5) or length.toInt()).toByte())
            length <= 0xff -> byteArrayOf(((majorType shl 5) or 24).toByte(), length.toByte())
            length <= 0xffff -> byteArrayOf(((majorType shl 5) or 25).toByte()) +
                ByteBuffer.allocate(2).putShort(length.toShort()).array()
            else -> byteArrayOf(((majorType shl 5) or 26).toByte()) +
                ByteBuffer.allocate(4).putInt(length.toInt()).array()
        }
    }

    private fun fixedCoordinate(value: BigInteger): ByteArray {
        val raw = value.toByteArray()
        val unsigned = if (raw.size > 1 && raw[0] == 0.toByte()) raw.copyOfRange(1, raw.size) else raw
        return when {
            unsigned.size == 32 -> unsigned
            unsigned.size > 32 -> unsigned.copyOfRange(unsigned.size - 32, unsigned.size)
            else -> ByteArray(32 - unsigned.size) + unsigned
        }
    }

    private fun sign(privateKeyValue: String, data: ByteArray): ByteArray {
        val privateJwk = decodeStoredJwk(privateKeyValue)
        val d = privateJwk["d"]?.jsonPrimitive?.contentOrNull
            ?: error("Missing P-256 private key scalar")
        val parameters = AlgorithmParameters.getInstance("EC").apply {
            init(ECGenParameterSpec("secp256r1"))
        }
        val ecSpec = parameters.getParameterSpec(ECParameterSpec::class.java)
        val keySpec = ECPrivateKeySpec(BigInteger(1, base64UrlDecode(d)), ecSpec)
        val privateKey = KeyFactory.getInstance("EC").generatePrivate(keySpec)

        return Signature.getInstance("SHA256withECDSA").run {
            initSign(privateKey)
            update(data)
            sign()
        }
    }

    private fun decodeStoredJwk(value: String): JsonObject {
        val raw = if (value.startsWith(JWK_PREFIX)) {
            base64UrlDecode(value.removePrefix(JWK_PREFIX)).toString(Charsets.UTF_8)
        } else {
            value
        }
        return json.parseToJsonElement(raw).jsonObject
    }

    private fun sha256(data: ByteArray): ByteArray {
        return MessageDigest.getInstance("SHA-256").digest(data)
    }

    private fun base64UrlEncode(data: ByteArray): String {
        return Base64.encodeToString(
            data,
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
        )
    }

    private fun base64UrlDecode(value: String): ByteArray {
        return Base64.decode(value, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }
}
