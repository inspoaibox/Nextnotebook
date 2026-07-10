package com.mucheng.notes.security

import android.util.Base64
import com.mucheng.notes.domain.model.payload.VaultEntryPayload
import com.mucheng.notes.domain.model.payload.VaultEntryType
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

object PasskeyPrivateKeyFieldCrypto {
    private const val PREFIX = "enc:v1:"
    private const val FIELD_KEY_CONTEXT = "mucheng-notes-passkey-private-key-v1"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val AUTH_TAG_BITS = 128

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    @Serializable
    private data class EncryptedPrivateKey(
        val v: Int = 1,
        val alg: String = "AES-256-GCM",
        val iv: String,
        val ciphertext: String,
        @SerialName("authTag") val authTag: String
    )

    fun protectVaultPayloadForRemote(payloadText: String, secret: String?): String {
        if (secret.isNullOrBlank()) {
            val payload = json.decodeFromString<VaultEntryPayload>(payloadText)
            if (hasPasskeyPrivateKey(payload) { privateKey ->
                    privateKey.isNotBlank() && !isEncryptedPrivateKey(privateKey)
                }
            ) {
                throw IllegalStateException("Passkey private key sync requires a sync password or sync key")
            }
            return payloadText
        }
        return transformVaultPayload(payloadText) { privateKey ->
            encryptPrivateKey(privateKey, secret)
        }
    }

    fun restoreVaultPayloadFromRemote(payloadText: String, secret: String?): String {
        if (secret.isNullOrBlank()) {
            val payload = json.decodeFromString<VaultEntryPayload>(payloadText)
            if (hasPasskeyPrivateKey(payload) { privateKey ->
                    isEncryptedPrivateKey(privateKey)
                }
            ) {
                throw IllegalStateException("Encrypted passkey private key sync requires a sync password or sync key")
            }
            return payloadText
        }
        return transformVaultPayload(payloadText) { privateKey ->
            decryptPrivateKey(privateKey, secret)
        }
    }

    private fun hasPasskeyPrivateKey(
        payload: VaultEntryPayload,
        predicate: (String) -> Boolean
    ): Boolean {
        return payload.entryType == VaultEntryType.LOGIN &&
            payload.passkeys.any { passkey -> predicate(passkey.privateKey) }
    }

    fun hasPasskeyPrivateKey(payloadText: String): Boolean {
        return try {
            val payload = json.decodeFromString<VaultEntryPayload>(payloadText)
            hasPasskeyPrivateKey(payload) { privateKey -> privateKey.isNotBlank() }
        } catch (_: Exception) {
            false
        }
    }

    fun hasUnprotectedPasskeyPrivateKey(payloadText: String): Boolean {
        return try {
            val payload = json.decodeFromString<VaultEntryPayload>(payloadText)
            hasPasskeyPrivateKey(payload) { privateKey ->
                privateKey.isNotBlank() && !isEncryptedPrivateKey(privateKey)
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun transformVaultPayload(
        payloadText: String,
        transform: (String) -> String
    ): String {
        val payload = json.decodeFromString<VaultEntryPayload>(payloadText)
        if (payload.entryType != VaultEntryType.LOGIN || payload.passkeys.isEmpty()) {
            return payloadText
        }

        var changed = false
        val passkeys = payload.passkeys.map { passkey ->
            val nextPrivateKey = transform(passkey.privateKey)
            if (nextPrivateKey == passkey.privateKey) {
                passkey
            } else {
                changed = true
                passkey.copy(privateKey = nextPrivateKey)
            }
        }
        return if (changed) json.encodeToString(payload.copy(passkeys = passkeys)) else payloadText
    }

    private fun isEncryptedPrivateKey(privateKey: String): Boolean =
        privateKey.startsWith(PREFIX)

    private fun encryptPrivateKey(privateKey: String, secret: String): String {
        if (privateKey.isBlank() || isEncryptedPrivateKey(privateKey)) return privateKey
        val iv = ByteArray(12).also { java.security.SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(deriveKey(secret), "AES"), GCMParameterSpec(AUTH_TAG_BITS, iv))
        val ciphertextWithTag = cipher.doFinal(privateKey.toByteArray(Charsets.UTF_8))
        val authTagSize = AUTH_TAG_BITS / 8
        val ciphertext = ciphertextWithTag.copyOfRange(0, ciphertextWithTag.size - authTagSize)
        val authTag = ciphertextWithTag.copyOfRange(ciphertextWithTag.size - authTagSize, ciphertextWithTag.size)
        val encrypted = EncryptedPrivateKey(
            iv = base64(iv),
            ciphertext = base64(ciphertext),
            authTag = base64(authTag)
        )
        return PREFIX + base64Url(json.encodeToString(encrypted).toByteArray(Charsets.UTF_8))
    }

    private fun decryptPrivateKey(privateKey: String, secret: String): String {
        if (!isEncryptedPrivateKey(privateKey)) return privateKey
        val encoded = privateKey.removePrefix(PREFIX)
        val encrypted = json.decodeFromString<EncryptedPrivateKey>(
            base64UrlDecode(encoded).toString(Charsets.UTF_8)
        )
        require(encrypted.v == 1 && encrypted.alg == "AES-256-GCM") {
            "Unsupported encrypted passkey private key format"
        }

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(deriveKey(secret), "AES"),
            GCMParameterSpec(AUTH_TAG_BITS, Base64.decode(encrypted.iv, Base64.NO_WRAP))
        )
        val plaintext = cipher.doFinal(
            Base64.decode(encrypted.ciphertext, Base64.NO_WRAP) +
                Base64.decode(encrypted.authTag, Base64.NO_WRAP)
        )
        return plaintext.toString(Charsets.UTF_8)
    }

    private fun deriveKey(secret: String): ByteArray {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(FIELD_KEY_CONTEXT.toByteArray(Charsets.UTF_8))
        digest.update(0.toByte())
        digest.update(secret.toByteArray(Charsets.UTF_8))
        return digest.digest()
    }

    private fun base64(data: ByteArray): String =
        Base64.encodeToString(data, Base64.NO_WRAP)

    private fun base64Url(data: ByteArray): String =
        Base64.encodeToString(data, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

    private fun base64UrlDecode(value: String): ByteArray =
        Base64.decode(value, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
}
