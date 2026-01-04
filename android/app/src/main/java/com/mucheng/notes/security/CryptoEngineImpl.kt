package com.mucheng.notes.security

import android.util.Base64
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import javax.inject.Inject
import javax.inject.Singleton

/**
 * CryptoEngine 实现
 * 
 * 加密参数（与桌面端完全一致）:
 * - 算法: AES-256-GCM
 * - 密钥长度: 32 bytes (256 bits)
 * - IV 长度: 12 bytes (96 bits)
 * - AuthTag 长度: 16 bytes (128 bits)
 * - Salt 长度: 32 bytes
 * - PBKDF2 迭代次数: 100000
 * - PBKDF2 哈希算法: SHA-256
 */
@Singleton
class CryptoEngineImpl @Inject constructor() : CryptoEngine {
    
    companion object {
        private const val ALGORITHM = "AES/GCM/NoPadding"
        private const val KEY_SIZE = 256
        private const val IV_SIZE = 12
        private const val AUTH_TAG_SIZE = 128 // bits
        private const val SALT_SIZE = 32
        private const val PBKDF2_ITERATIONS = 100000
        private const val PBKDF2_ALGORITHM = "PBKDF2WithHmacSHA256"
    }
    
    private val secureRandom = SecureRandom()
    private val json = Json { ignoreUnknownKeys = true }
    
    @Volatile
    private var masterKey: ByteArray? = null
    
    override fun deriveKeyFromPassword(password: String, salt: ByteArray?): DerivedKey {
        val actualSalt = salt ?: generateSalt()
        
        val factory = SecretKeyFactory.getInstance(PBKDF2_ALGORITHM)
        val spec = PBEKeySpec(
            password.toCharArray(),
            actualSalt,
            PBKDF2_ITERATIONS,
            KEY_SIZE
        )
        val secretKey = factory.generateSecret(spec)
        
        return DerivedKey(
            key = secretKey.encoded,
            salt = actualSalt
        )
    }
    
    override fun encrypt(plaintext: String): EncryptedData {
        val key = masterKey ?: throw IllegalStateException("Master key not set")
        
        val iv = generateIV()
        val cipher = Cipher.getInstance(ALGORITHM)
        val secretKey = SecretKeySpec(key, "AES")
        val gcmSpec = GCMParameterSpec(AUTH_TAG_SIZE, iv)
        
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, gcmSpec)
        val ciphertextWithTag = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        
        // GCM 模式下，authTag 附加在 ciphertext 末尾
        val authTagSize = AUTH_TAG_SIZE / 8
        val ciphertext = ciphertextWithTag.copyOfRange(0, ciphertextWithTag.size - authTagSize)
        val authTag = ciphertextWithTag.copyOfRange(ciphertextWithTag.size - authTagSize, ciphertextWithTag.size)
        
        return EncryptedData(
            ciphertext = Base64.encodeToString(ciphertext, Base64.NO_WRAP),
            iv = Base64.encodeToString(iv, Base64.NO_WRAP),
            authTag = Base64.encodeToString(authTag, Base64.NO_WRAP)
        )
    }
    
    override fun decrypt(encryptedData: EncryptedData): String {
        val key = masterKey ?: throw IllegalStateException("Master key not set")
        
        val ciphertext = Base64.decode(encryptedData.ciphertext, Base64.NO_WRAP)
        val iv = Base64.decode(encryptedData.iv, Base64.NO_WRAP)
        val authTag = Base64.decode(encryptedData.authTag, Base64.NO_WRAP)
        
        // 重新组合 ciphertext 和 authTag
        val ciphertextWithTag = ciphertext + authTag
        
        val cipher = Cipher.getInstance(ALGORITHM)
        val secretKey = SecretKeySpec(key, "AES")
        val gcmSpec = GCMParameterSpec(AUTH_TAG_SIZE, iv)
        
        cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)
        val plaintext = cipher.doFinal(ciphertextWithTag)
        
        return String(plaintext, Charsets.UTF_8)
    }
    
    override fun encryptPayload(payload: String): String {
        val encrypted = encrypt(payload)
        return json.encodeToString(encrypted)
    }
    
    override fun decryptPayload(encryptedPayload: String): String {
        val encrypted = json.decodeFromString<EncryptedData>(encryptedPayload)
        return decrypt(encrypted)
    }
    
    override fun computeHash(content: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(content.toByteArray(Charsets.UTF_8))
        // 返回完整的 64 字符哈希，与桌面端保持一致
        return hashBytes.joinToString("") { "%02x".format(it) }
    }
    
    override fun generateKeyIdentifier(): String {
        val key = masterKey ?: throw IllegalStateException("Master key not set")
        val digest = MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(key)
        return hashBytes.joinToString("") { "%02x".format(it) }.take(16)
    }
    
    override fun getKeyIdentifier(): String {
        return generateKeyIdentifier()
    }
    
    override fun setMasterKey(key: ByteArray) {
        require(key.size == KEY_SIZE / 8) { "Key must be ${KEY_SIZE / 8} bytes" }
        masterKey = key.copyOf()
    }
    
    override fun initMasterKey(password: String) {
        // 使用固定的 salt 以确保相同密码生成相同密钥
        // 这与桌面端保持一致：'mucheng-sync-salt-2024-fixed-key'
        val fixedSalt = "mucheng-sync-salt-2024-fixed-key".toByteArray(Charsets.UTF_8)
            .copyOf(SALT_SIZE) // 确保 32 bytes
        val derivedKey = deriveKeyFromPassword(password, fixedSalt)
        setMasterKey(derivedKey.key)
    }
    
    override fun clearMasterKey() {
        masterKey?.fill(0)
        masterKey = null
    }
    
    override fun hasMasterKey(): Boolean = masterKey != null
    
    private fun generateSalt(): ByteArray {
        val salt = ByteArray(SALT_SIZE)
        secureRandom.nextBytes(salt)
        return salt
    }
    
    private fun generateIV(): ByteArray {
        val iv = ByteArray(IV_SIZE)
        secureRandom.nextBytes(iv)
        return iv
    }
}
