package com.mucheng.notes.security

import android.content.Context
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
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
class CryptoEngineImpl @Inject constructor(
    @ApplicationContext private val context: Context
) : CryptoEngine {
    
    companion object {
        private const val ALGORITHM = "AES/GCM/NoPadding"
        private const val KEY_SIZE = 256
        private const val IV_SIZE = 12
        private const val AUTH_TAG_SIZE = 128 // bits
        private const val SALT_SIZE = 32
        private const val PBKDF2_ITERATIONS = 100000
        private const val PBKDF2_ALGORITHM = "PBKDF2WithHmacSHA256"
        
        // 密钥持久化相关
        private const val PREFS_NAME = "crypto_prefs"
        private const val KEY_MASTER_KEY = "master_key_base64"
    }
    
    private val secureRandom = SecureRandom()
    private val json = Json { ignoreUnknownKeys = true }
    
    @Volatile
    private var masterKey: ByteArray? = null
    
    // 使用 EncryptedSharedPreferences 安全存储密钥
    private val encryptedPrefs by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            
            EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            android.util.Log.e("CryptoEngine", "Failed to create EncryptedSharedPreferences: ${e.message}")
            // 回退到普通 SharedPreferences（不推荐，但比崩溃好）
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        }
    }
    
    init {
        // 启动时尝试从持久化存储恢复密钥
        loadPersistedKey()
    }
    
    /**
     * 从持久化存储加载密钥
     */
    private fun loadPersistedKey() {
        try {
            val keyBase64 = encryptedPrefs.getString(KEY_MASTER_KEY, null)
            if (keyBase64 != null) {
                val key = Base64.decode(keyBase64, Base64.NO_WRAP)
                if (key.size == KEY_SIZE / 8) {
                    masterKey = key
                    android.util.Log.d("CryptoEngine", "Master key restored from storage")
                } else {
                    android.util.Log.w("CryptoEngine", "Invalid persisted key size: ${key.size}, expected: ${KEY_SIZE / 8}")
                }
            } else {
                android.util.Log.d("CryptoEngine", "No persisted master key found")
            }
        } catch (e: Exception) {
            android.util.Log.e("CryptoEngine", "Failed to load persisted key: ${e.message}")
        }
    }
    
    /**
     * 持久化密钥到安全存储
     */
    private fun persistKey(key: ByteArray) {
        try {
            val keyBase64 = Base64.encodeToString(key, Base64.NO_WRAP)
            encryptedPrefs.edit().putString(KEY_MASTER_KEY, keyBase64).apply()
            android.util.Log.d("CryptoEngine", "Master key persisted to storage")
        } catch (e: Exception) {
            android.util.Log.e("CryptoEngine", "Failed to persist key: ${e.message}")
        }
    }
    
    /**
     * 清除持久化的密钥
     */
    private fun clearPersistedKey() {
        try {
            encryptedPrefs.edit().remove(KEY_MASTER_KEY).apply()
            android.util.Log.d("CryptoEngine", "Persisted master key cleared")
        } catch (e: Exception) {
            android.util.Log.e("CryptoEngine", "Failed to clear persisted key: ${e.message}")
        }
    }
    
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

        try {
            val ciphertext = Base64.decode(encryptedData.ciphertext, Base64.NO_WRAP)
            val iv = Base64.decode(encryptedData.iv, Base64.NO_WRAP)
            val authTag = Base64.decode(encryptedData.authTag, Base64.NO_WRAP)

            // 验证长度
            if (iv.size != IV_SIZE) {
                throw IllegalArgumentException("Invalid IV length: ${iv.size}, expected: $IV_SIZE")
            }
            if (authTag.size != AUTH_TAG_SIZE / 8) {
                throw IllegalArgumentException("Invalid AuthTag length: ${authTag.size}, expected: ${AUTH_TAG_SIZE / 8}")
            }

            // 重新组合 ciphertext 和 authTag
            val ciphertextWithTag = ciphertext + authTag

            val cipher = Cipher.getInstance(ALGORITHM)
            val secretKey = SecretKeySpec(key, "AES")
            val gcmSpec = GCMParameterSpec(AUTH_TAG_SIZE, iv)

            cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)
            val plaintext = cipher.doFinal(ciphertextWithTag)

            return String(plaintext, Charsets.UTF_8)
        } catch (e: javax.crypto.AEADBadTagException) {
            android.util.Log.e("CryptoEngine", "❌ Authentication failed - wrong encryption key or corrupted data")
            throw IllegalArgumentException("Decryption failed: wrong encryption key", e)
        } catch (e: IllegalArgumentException) {
            android.util.Log.e("CryptoEngine", "❌ Invalid Base64 or data format: ${e.message}")
            throw e
        } catch (e: Exception) {
            android.util.Log.e("CryptoEngine", "❌ Unexpected decryption error: ${e.javaClass.simpleName} - ${e.message}")
            e.printStackTrace()
            throw e
        }
    }
    
    override fun encryptPayload(payload: String): String {
        val encrypted = encrypt(payload)
        return json.encodeToString(encrypted)
    }
    
    override fun decryptPayload(encryptedPayload: String): String {
        try {
            val encrypted = json.decodeFromString<EncryptedData>(encryptedPayload)
            val result = decrypt(encrypted)
            return result
        } catch (e: kotlinx.serialization.SerializationException) {
            android.util.Log.e("CryptoEngine", "Failed to parse encrypted payload JSON: ${e.message}")
            throw IllegalArgumentException("Invalid encrypted payload format: ${e.message}", e)
        } catch (e: Exception) {
            android.util.Log.e("CryptoEngine", "Decryption failed: ${e.javaClass.simpleName} - ${e.message}")
            throw e
        }
    }
    
    override fun computeHash(content: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(content.toByteArray(Charsets.UTF_8))
        // 返回完整的 64 字符十六进制哈希，与桌面端保持一致
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
        // 持久化密钥
        persistKey(key)
    }
    
    override fun initMasterKey(password: String) {
        // 使用固定的 salt 以确保相同密码生成相同密钥
        // 这与桌面端保持一致：'mucheng-sync-salt-2024-fixed-key'
        // 注意：桌面端使用的是完整的字符串（33字节），不截断
        val fixedSalt = "mucheng-sync-salt-2024-fixed-key".toByteArray(Charsets.UTF_8)

        val derivedKey = deriveKeyFromPassword(password, fixedSalt)
        setMasterKey(derivedKey.key)

        android.util.Log.d("CryptoEngine", "Master key derived successfully")
    }
    
    override fun clearMasterKey() {
        masterKey?.fill(0)
        masterKey = null
        // 清除持久化的密钥
        clearPersistedKey()
    }
    
    override fun hasMasterKey(): Boolean = masterKey != null

    override fun getKeyFingerprint(): String? {
        val key = masterKey ?: return null

        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(key)
        return Base64.encodeToString(hash, Base64.NO_WRAP)
    }

    override fun verifyKeyFingerprint(fingerprint: String): Boolean {
        val currentFingerprint = getKeyFingerprint() ?: return false
        return currentFingerprint == fingerprint
    }

    /**
     * 导出密钥（明文 Base64）
     * 注意：导出密码只是本地操作保护，不参与密钥加密
     */
    override fun exportKey(exportPassword: String): String {
        val key = masterKey ?: throw IllegalStateException("Master key not set")
        // 直接返回主密钥的 Base64 编码
        return Base64.encodeToString(key, Base64.NO_WRAP)
    }

    /**
     * 导入密钥（明文 Base64）
     * 注意：导入密码只是本地操作保护，不参与密钥解密
     */
    override fun importKey(encryptedKey: String, importPassword: String) {
        try {
            // 尝试解析为 JSON（兼容旧格式）
            try {
                val encrypted = json.decodeFromString<EncryptedData>(encryptedKey)
                if (encrypted.ciphertext.isNotEmpty() && encrypted.iv.isNotEmpty()) {
                    // 旧格式：加密的密钥，无法解密
                    throw IllegalArgumentException("旧格式密钥不兼容，请在电脑端重新导出密钥")
                }
            } catch (e: kotlinx.serialization.SerializationException) {
                // 不是 JSON，继续处理为 Base64
            }
            
            // 新格式：直接是 Base64 编码的主密钥
            val key = Base64.decode(encryptedKey, Base64.NO_WRAP)
            setMasterKey(key)
            
            android.util.Log.d("CryptoEngine", "Key imported successfully, fingerprint: ${getKeyFingerprint()?.take(16)}...")
        } catch (e: IllegalArgumentException) {
            throw e
        } catch (e: Exception) {
            throw IllegalArgumentException("导入失败：${e.message}", e)
        }
    }

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
