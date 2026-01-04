package com.mucheng.notes.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Android Keystore 管理器
 * 
 * 使用 Android Keystore 安全存储主密钥。
 * 主密钥用于加密/解密同步数据的加密密钥。
 */
@Singleton
class KeystoreManager @Inject constructor() {
    
    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val KEY_ALIAS = "mucheng_master_key"
        private const val ALGORITHM = "AES/GCM/NoPadding"
        private const val KEY_SIZE = 256
        private const val AUTH_TAG_SIZE = 128
        private const val IV_SIZE = 12
    }
    
    private val keyStore: KeyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply {
        load(null)
    }
    
    /**
     * 检查主密钥是否存在
     */
    fun hasMasterKey(): Boolean {
        return keyStore.containsAlias(KEY_ALIAS)
    }
    
    /**
     * 生成主密钥（如果不存在）
     */
    fun generateMasterKey() {
        if (hasMasterKey()) return
        
        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            KEYSTORE_PROVIDER
        )
        
        val keySpec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(KEY_SIZE)
            .setUserAuthenticationRequired(false) // 可以改为 true 以要求用户认证
            .build()
        
        keyGenerator.init(keySpec)
        keyGenerator.generateKey()
    }
    
    /**
     * 使用主密钥加密数据
     * @param plaintext 要加密的数据
     * @return 加密后的数据（IV + ciphertext）
     */
    fun encrypt(plaintext: ByteArray): ByteArray {
        val secretKey = getSecretKey()
        val cipher = Cipher.getInstance(ALGORITHM)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey)
        
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(plaintext)
        
        // 返回 IV + ciphertext
        return iv + ciphertext
    }
    
    /**
     * 使用主密钥解密数据
     * @param encryptedData 加密的数据（IV + ciphertext）
     * @return 解密后的数据
     */
    fun decrypt(encryptedData: ByteArray): ByteArray {
        require(encryptedData.size > IV_SIZE) { "Invalid encrypted data" }
        
        val iv = encryptedData.copyOfRange(0, IV_SIZE)
        val ciphertext = encryptedData.copyOfRange(IV_SIZE, encryptedData.size)
        
        val secretKey = getSecretKey()
        val cipher = Cipher.getInstance(ALGORITHM)
        val gcmSpec = GCMParameterSpec(AUTH_TAG_SIZE, iv)
        cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)
        
        return cipher.doFinal(ciphertext)
    }
    
    /**
     * 加密同步密钥
     * @param syncKey 同步密钥（32 字节）
     * @return 加密后的同步密钥
     */
    fun encryptSyncKey(syncKey: ByteArray): ByteArray {
        require(syncKey.size == 32) { "Sync key must be 32 bytes" }
        return encrypt(syncKey)
    }
    
    /**
     * 解密同步密钥
     * @param encryptedSyncKey 加密的同步密钥
     * @return 解密后的同步密钥（32 字节）
     */
    fun decryptSyncKey(encryptedSyncKey: ByteArray): ByteArray {
        val decrypted = decrypt(encryptedSyncKey)
        require(decrypted.size == 32) { "Decrypted sync key must be 32 bytes" }
        return decrypted
    }
    
    /**
     * 删除主密钥
     */
    fun deleteMasterKey() {
        if (hasMasterKey()) {
            keyStore.deleteEntry(KEY_ALIAS)
        }
    }
    
    /**
     * 获取 Keystore 中的密钥
     */
    private fun getSecretKey(): SecretKey {
        val entry = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
            ?: throw IllegalStateException("Master key not found")
        return entry.secretKey
    }
}
