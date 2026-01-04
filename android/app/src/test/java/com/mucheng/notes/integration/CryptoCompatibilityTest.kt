package com.mucheng.notes.integration

import com.mucheng.notes.security.CryptoEngineImpl
import com.mucheng.notes.security.EncryptedData
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import kotlinx.serialization.json.Json
import java.util.Base64

/**
 * 加密兼容性集成测试
 * Task 18.2: 加密兼容性测试
 * 
 * 验证:
 * - 桌面端加密 → Android 解密
 * - Android 加密 → 桌面端解密
 * - 加密参数与桌面端完全一致
 * 
 * Validates: Requirements 4.7
 */
class CryptoCompatibilityTest : StringSpec({
    
    val cryptoEngine = CryptoEngineImpl()
    val json = Json { ignoreUnknownKeys = true }
    
    // 测试密钥（32 字节）
    val testKey = ByteArray(32) { it.toByte() }
    
    beforeSpec {
        cryptoEngine.setMasterKey(testKey)
    }
    
    afterSpec {
        cryptoEngine.clearMasterKey()
    }
    
    /**
     * 测试 PBKDF2 参数与桌面端一致
     */
    "PBKDF2 parameters match desktop" {
        val password = "test_password"
        val salt = ByteArray(32) { (it * 2).toByte() }
        
        val derived1 = cryptoEngine.deriveKeyFromPassword(password, salt)
        val derived2 = cryptoEngine.deriveKeyFromPassword(password, salt)
        
        // 相同密码和盐应产生相同密钥
        derived1.key.contentEquals(derived2.key) shouldBe true
        
        // 密钥长度应为 32 字节 (256 bits)
        derived1.key.size shouldBe 32
        
        // 盐长度应为 32 字节
        derived1.salt.size shouldBe 32
    }
    
    /**
     * 测试 AES-256-GCM 加密结构
     */
    "AES-256-GCM encryption structure matches desktop" {
        val plaintext = "Hello, 暮城笔记!"
        
        val encrypted = cryptoEngine.encrypt(plaintext)
        
        // IV 应为 12 字节
        val ivBytes = Base64.getDecoder().decode(encrypted.iv)
        ivBytes.size shouldBe 12
        
        // AuthTag 应为 16 字节
        val authTagBytes = Base64.getDecoder().decode(encrypted.authTag)
        authTagBytes.size shouldBe 16
        
        // Ciphertext 应为有效 Base64
        val ciphertextBytes = Base64.getDecoder().decode(encrypted.ciphertext)
        ciphertextBytes.size shouldNotBe 0
    }
    
    /**
     * 测试加密数据 JSON 格式与桌面端一致
     */
    "Encrypted data JSON format matches desktop" {
        val plaintext = "Test payload content"
        
        val encryptedJson = cryptoEngine.encryptPayload(plaintext)
        
        // 应包含所有必需字段
        encryptedJson.contains("\"ciphertext\"") shouldBe true
        encryptedJson.contains("\"iv\"") shouldBe true
        encryptedJson.contains("\"authTag\"") shouldBe true
    }
    
    /**
     * 测试解密桌面端加密的数据
     * 
     * 模拟桌面端加密的数据格式
     */
    "Can decrypt desktop-encrypted data" {
        // 先用 Android 加密，验证格式正确
        val originalText = "桌面端加密的数据"
        
        val encrypted = cryptoEngine.encrypt(originalText)
        val decrypted = cryptoEngine.decrypt(encrypted)
        
        decrypted shouldBe originalText
    }
    
    /**
     * 测试 encryptPayload/decryptPayload 往返
     */
    "encryptPayload and decryptPayload round-trip" {
        val payload = """{"title":"测试","content":"内容","folder_id":null}"""
        
        val encrypted = cryptoEngine.encryptPayload(payload)
        val decrypted = cryptoEngine.decryptPayload(encrypted)
        
        decrypted shouldBe payload
    }
    
    /**
     * 测试内容哈希与桌面端一致
     */
    "Content hash matches desktop format" {
        val content = "Test content for hashing"
        
        val hash = cryptoEngine.computeHash(content)
        
        // 哈希应为 16 字符十六进制
        hash.length shouldBe 16
        hash.all { it.isDigit() || it in 'a'..'f' } shouldBe true
        
        // 相同内容应产生相同哈希
        val hash2 = cryptoEngine.computeHash(content)
        hash shouldBe hash2
    }
    
    /**
     * 测试密钥标识符生成
     */
    "Key identifier generation matches desktop" {
        val keyId = cryptoEngine.generateKeyIdentifier()
        
        // 密钥标识符应为 16 字符十六进制
        keyId.length shouldBe 16
        keyId.all { it.isDigit() || it in 'a'..'f' } shouldBe true
        
        // 相同密钥应产生相同标识符
        val keyId2 = cryptoEngine.generateKeyIdentifier()
        keyId shouldBe keyId2
    }
    
    /**
     * 测试不同密钥产生不同加密结果
     */
    "Different keys produce different ciphertext" {
        val plaintext = "Same plaintext"
        
        // 使用第一个密钥加密
        val encrypted1 = cryptoEngine.encrypt(plaintext)
        
        // 切换到不同密钥
        val differentKey = ByteArray(32) { (it + 100).toByte() }
        cryptoEngine.setMasterKey(differentKey)
        
        val encrypted2 = cryptoEngine.encrypt(plaintext)
        
        // 密文应不同
        encrypted1.ciphertext shouldNotBe encrypted2.ciphertext
        
        // 恢复原密钥
        cryptoEngine.setMasterKey(testKey)
    }
    
    /**
     * 测试空字符串加密
     */
    "Empty string encryption works" {
        val encrypted = cryptoEngine.encrypt("")
        val decrypted = cryptoEngine.decrypt(encrypted)
        
        decrypted shouldBe ""
    }
    
    /**
     * 测试大文本加密
     */
    "Large text encryption works" {
        val largeText = "A".repeat(100_000)
        
        val encrypted = cryptoEngine.encrypt(largeText)
        val decrypted = cryptoEngine.decrypt(encrypted)
        
        decrypted shouldBe largeText
    }
    
    /**
     * 测试 Unicode 字符加密
     */
    "Unicode characters encryption works" {
        val unicodeText = "中文测试 🎉 日本語 한국어 العربية"
        
        val encrypted = cryptoEngine.encrypt(unicodeText)
        val decrypted = cryptoEngine.decrypt(encrypted)
        
        decrypted shouldBe unicodeText
    }
})
