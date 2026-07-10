package com.mucheng.notes.testutil

import com.mucheng.notes.security.CryptoEngine
import com.mucheng.notes.security.DerivedKey
import com.mucheng.notes.security.EncryptedData
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Pure JVM test implementation of the Android crypto contract.
 *
 * Local unit tests cannot safely instantiate CryptoEngineImpl because it
 * initializes Android encrypted preferences. This helper keeps the same
 * crypto parameters so compatibility tests can run on the JVM.
 */
class JvmCryptoEngine : CryptoEngine {
    private val secureRandom = SecureRandom()
    private val json = Json { ignoreUnknownKeys = true }
    private var masterKey: ByteArray? = null

    override fun deriveKeyFromPassword(password: String, salt: ByteArray?): DerivedKey {
        val actualSalt = salt ?: ByteArray(SALT_SIZE).also(secureRandom::nextBytes)
        val factory = SecretKeyFactory.getInstance(PBKDF2_ALGORITHM)
        val spec = PBEKeySpec(password.toCharArray(), actualSalt, PBKDF2_ITERATIONS, KEY_SIZE_BITS)
        return DerivedKey(factory.generateSecret(spec).encoded, actualSalt)
    }

    override fun encrypt(plaintext: String): EncryptedData {
        val key = masterKey ?: error("Master key not set")
        val iv = ByteArray(IV_SIZE).also(secureRandom::nextBytes)
        val cipher = Cipher.getInstance(ALGORITHM)
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(AUTH_TAG_SIZE_BITS, iv))
        val ciphertextWithTag = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        val authTagSize = AUTH_TAG_SIZE_BITS / 8
        val ciphertext = ciphertextWithTag.copyOfRange(0, ciphertextWithTag.size - authTagSize)
        val authTag = ciphertextWithTag.copyOfRange(ciphertextWithTag.size - authTagSize, ciphertextWithTag.size)
        return EncryptedData(
            ciphertext = Base64.getEncoder().encodeToString(ciphertext),
            iv = Base64.getEncoder().encodeToString(iv),
            authTag = Base64.getEncoder().encodeToString(authTag)
        )
    }

    override fun decrypt(encryptedData: EncryptedData): String {
        val key = masterKey ?: error("Master key not set")
        val ciphertext = Base64.getDecoder().decode(encryptedData.ciphertext)
        val iv = Base64.getDecoder().decode(encryptedData.iv)
        val authTag = Base64.getDecoder().decode(encryptedData.authTag)
        val cipher = Cipher.getInstance(ALGORITHM)
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(AUTH_TAG_SIZE_BITS, iv))
        return String(cipher.doFinal(ciphertext + authTag), Charsets.UTF_8)
    }

    override fun encryptPayload(payload: String): String = json.encodeToString(encrypt(payload))

    override fun decryptPayload(encryptedPayload: String): String {
        return decrypt(json.decodeFromString<EncryptedData>(encryptedPayload))
    }

    override fun computeHash(content: String): String = sha256(content.toByteArray(Charsets.UTF_8)).toHex()

    override fun generateKeyIdentifier(): String {
        val key = masterKey ?: error("Master key not set")
        return sha256(key).toHex().take(16)
    }

    override fun getKeyIdentifier(): String = generateKeyIdentifier()

    override fun setMasterKey(key: ByteArray) {
        require(key.size == KEY_SIZE_BITS / 8) { "Key must be ${KEY_SIZE_BITS / 8} bytes" }
        masterKey = key.copyOf()
    }

    override fun initMasterKey(password: String) {
        val fixedSalt = "mucheng-sync-salt-2024-fixed-key".toByteArray(Charsets.UTF_8)
        setMasterKey(deriveKeyFromPassword(password, fixedSalt).key)
    }

    override fun clearMasterKey() {
        masterKey?.fill(0)
        masterKey = null
    }

    override fun hasMasterKey(): Boolean = masterKey != null

    override fun getKeyFingerprint(): String? {
        val key = masterKey ?: return null
        return Base64.getEncoder().encodeToString(sha256(key))
    }

    override fun verifyKeyFingerprint(fingerprint: String): Boolean = getKeyFingerprint() == fingerprint

    override fun exportKey(exportPassword: String): String {
        val key = masterKey ?: error("Master key not set")
        return Base64.getEncoder().encodeToString(key)
    }

    override fun importKey(encryptedKey: String, importPassword: String) {
        setMasterKey(Base64.getDecoder().decode(encryptedKey))
    }

    private fun sha256(data: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(data)

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

    private companion object {
        private const val ALGORITHM = "AES/GCM/NoPadding"
        private const val KEY_SIZE_BITS = 256
        private const val IV_SIZE = 12
        private const val AUTH_TAG_SIZE_BITS = 128
        private const val SALT_SIZE = 32
        private const val PBKDF2_ITERATIONS = 100000
        private const val PBKDF2_ALGORITHM = "PBKDF2WithHmacSHA256"
    }
}
