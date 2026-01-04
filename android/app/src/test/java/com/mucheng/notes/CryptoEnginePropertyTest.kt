package com.mucheng.notes

import com.mucheng.notes.security.CryptoEngineImpl
import com.mucheng.notes.security.EncryptedData
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldHaveLength
import io.kotest.matchers.string.shouldMatch
import io.kotest.property.Arb
import io.kotest.property.arbitrary.string
import io.kotest.property.checkAll
import kotlinx.serialization.json.Json
import java.util.Base64

/**
 * CryptoEngine 属性测试
 */
class CryptoEnginePropertyTest : StringSpec({
    
    val cryptoEngine = CryptoEngineImpl()
    val json = Json { ignoreUnknownKeys = true }
    
    // 设置测试密钥
    beforeSpec {
        val testKey = ByteArray(32) { it.toByte() }
        cryptoEngine.setMasterKey(testKey)
    }
    
    afterSpec {
        cryptoEngine.clearMasterKey()
    }
    
    /**
     * Property 1: Content Hash Consistency
     * 对于任意 payload 字符串，使用 SHA-256 计算内容哈希并取前 16 字符
     * 应该产生一致的 16 字符十六进制字符串，相同 payload 应该总是产生相同哈希
     */
    "Property 1: Content Hash Consistency - same content produces same hash" {
        checkAll(Arb.string(0, 1000)) { content ->
            val hash1 = cryptoEngine.computeHash(content)
            val hash2 = cryptoEngine.computeHash(content)
            
            hash1 shouldBe hash2
            hash1 shouldHaveLength 16
            hash1 shouldMatch Regex("^[0-9a-f]{16}$")
        }
    }
    
    /**
     * Property 4: Encryption Round-Trip Compatibility
     * 对于任意明文 payload，使用 CryptoEngine 加密后解密应该返回原始明文
     */
    "Property 4: Encryption Round-Trip - encrypt then decrypt returns original" {
        checkAll(Arb.string(0, 1000)) { plaintext ->
            val encrypted = cryptoEngine.encrypt(plaintext)
            val decrypted = cryptoEngine.decrypt(encrypted)
            
            decrypted shouldBe plaintext
        }
    }
    
    /**
     * Property 5: Key Derivation Consistency
     * 对于任意密码和盐值组合，使用 PBKDF2 派生密钥应该产生一致的 32 字节密钥
     * 相同密码+盐值应该总是产生相同密钥
     */
    "Property 5: Key Derivation Consistency - same password and salt produces same key" {
        checkAll(Arb.string(1, 100)) { password ->
            val derived1 = cryptoEngine.deriveKeyFromPassword(password, null)
            val derived2 = cryptoEngine.deriveKeyFromPassword(password, derived1.salt)
            
            derived1.key.contentEquals(derived2.key) shouldBe true
            derived1.key.size shouldBe 32
            derived1.salt.size shouldBe 32
        }
    }
    
    /**
     * Property 6: Encrypted Data Structure
     * 对于任意加密的 payload，输出应该是包含 ciphertext、iv (12 字节 Base64) 
     * 和 authTag (16 字节 Base64) 字段的有效 JSON
     */
    "Property 6: Encrypted Data Structure - output has correct structure" {
        checkAll(Arb.string(0, 500)) { plaintext ->
            val encrypted = cryptoEngine.encrypt(plaintext)
            
            // 验证 IV 长度 (12 bytes = 16 chars Base64)
            val ivBytes = Base64.getDecoder().decode(encrypted.iv)
            ivBytes.size shouldBe 12
            
            // 验证 AuthTag 长度 (16 bytes)
            val authTagBytes = Base64.getDecoder().decode(encrypted.authTag)
            authTagBytes.size shouldBe 16
            
            // 验证 ciphertext 是有效的 Base64
            Base64.getDecoder().decode(encrypted.ciphertext)
        }
    }
    
    /**
     * Property 7: Key Identifier Generation
     * 对于任意加密密钥，生成的密钥标识符应该是一致的 16 字符十六进制字符串
     */
    "Property 7: Key Identifier Generation - produces consistent 16-char hex string" {
        val keyId1 = cryptoEngine.generateKeyIdentifier()
        val keyId2 = cryptoEngine.generateKeyIdentifier()
        
        keyId1 shouldBe keyId2
        keyId1 shouldHaveLength 16
        keyId1 shouldMatch Regex("^[0-9a-f]{16}$")
    }
})
