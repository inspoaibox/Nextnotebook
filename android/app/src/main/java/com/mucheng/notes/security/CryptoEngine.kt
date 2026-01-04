package com.mucheng.notes.security

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 派生密钥
 */
data class DerivedKey(
    val key: ByteArray,
    val salt: ByteArray
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as DerivedKey
        return key.contentEquals(other.key) && salt.contentEquals(other.salt)
    }
    
    override fun hashCode(): Int {
        var result = key.contentHashCode()
        result = 31 * result + salt.contentHashCode()
        return result
    }
}

/**
 * 加密数据结构 - 与桌面端 EncryptedData 完全一致
 */
@Serializable
data class EncryptedData(
    val ciphertext: String, // Base64
    val iv: String,         // Base64, 12 bytes
    @SerialName("authTag") val authTag: String, // Base64, 16 bytes
    val salt: String? = null // Base64, 32 bytes (可选)
)

/**
 * 加密引擎接口
 * 实现与桌面端完全兼容的加密/解密
 */
interface CryptoEngine {
    
    /**
     * 从密码派生密钥
     * @param password 用户密码
     * @param salt 盐值，如果为 null 则生成新的
     * @return 派生的密钥和盐值
     */
    fun deriveKeyFromPassword(password: String, salt: ByteArray? = null): DerivedKey
    
    /**
     * 加密字符串
     * @param plaintext 明文
     * @return 加密数据
     */
    fun encrypt(plaintext: String): EncryptedData
    
    /**
     * 解密数据
     * @param encryptedData 加密数据
     * @return 明文
     */
    fun decrypt(encryptedData: EncryptedData): String
    
    /**
     * 加密 Payload（返回 JSON 字符串）
     * @param payload 明文 payload
     * @return 加密后的 JSON 字符串
     */
    fun encryptPayload(payload: String): String
    
    /**
     * 解密 Payload
     * @param encryptedPayload 加密的 JSON 字符串
     * @return 明文 payload
     */
    fun decryptPayload(encryptedPayload: String): String
    
    /**
     * 计算内容哈希（SHA-256 前 16 字符）
     */
    fun computeHash(content: String): String
    
    /**
     * 生成密钥标识符（用于验证密钥匹配）
     */
    fun generateKeyIdentifier(): String
    
    /**
     * 获取当前密钥标识符
     */
    fun getKeyIdentifier(): String
    
    /**
     * 设置主密钥
     */
    fun setMasterKey(key: ByteArray)
    
    /**
     * 从密码初始化主密钥
     * @param password 用户密码
     */
    fun initMasterKey(password: String)
    
    /**
     * 清除主密钥
     */
    fun clearMasterKey()
    
    /**
     * 检查是否有主密钥
     */
    fun hasMasterKey(): Boolean
}
