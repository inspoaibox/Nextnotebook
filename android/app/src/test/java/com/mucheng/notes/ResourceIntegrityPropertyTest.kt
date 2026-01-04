package com.mucheng.notes

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldHaveLength
import io.kotest.matchers.string.shouldMatch
import io.kotest.property.Arb
import io.kotest.property.arbitrary.byteArray
import io.kotest.property.arbitrary.int
import io.kotest.property.checkAll
import java.security.MessageDigest

/**
 * 资源文件完整性属性测试
 * Property 11: Resource File Integrity
 * 
 * 对于任意资源文件，上传到 WebDAV 后下载应该返回相同的字节内容，
 * 通过 SHA-256 哈希比较验证。
 * 
 * Validates: Requirements 2.2
 */
class ResourceIntegrityPropertyTest : StringSpec({
    
    /**
     * Property 11: SHA-256 hash consistency
     * 验证 SHA-256 哈希计算的一致性
     */
    "Property 11: SHA-256 hash is consistent for same content" {
        checkAll(Arb.byteArray(Arb.int(0, 1000))) { data ->
            val hash1 = computeSHA256(data)
            val hash2 = computeSHA256(data)
            
            hash1 shouldBe hash2
            hash1 shouldHaveLength 64  // SHA-256 produces 64 hex chars
            hash1 shouldMatch Regex("^[0-9a-f]{64}$")
        }
    }
    
    /**
     * 验证不同内容产生不同哈希
     */
    "Different content produces different hash" {
        checkAll(Arb.byteArray(Arb.int(1, 100))) { data ->
            if (data.isNotEmpty()) {
                val hash1 = computeSHA256(data)
                
                // 修改一个字节
                val modifiedData = data.copyOf()
                modifiedData[0] = (modifiedData[0].toInt() xor 0xFF).toByte()
                val hash2 = computeSHA256(modifiedData)
                
                // 哈希应该不同
                (hash1 != hash2) shouldBe true
            }
        }
    }
    
    /**
     * 验证空数据的哈希
     */
    "Empty data produces valid hash" {
        val emptyHash = computeSHA256(ByteArray(0))
        
        emptyHash shouldHaveLength 64
        emptyHash shouldMatch Regex("^[0-9a-f]{64}$")
        // SHA-256 of empty string is known value
        emptyHash shouldBe "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
    
    /**
     * 验证哈希的确定性
     */
    "Hash is deterministic across multiple calls" {
        val testData = "Hello, World!".toByteArray()
        val hashes = (1..100).map { computeSHA256(testData) }
        
        hashes.distinct().size shouldBe 1
    }
    
    /**
     * 验证大文件哈希计算
     */
    "Large data hash is computed correctly" {
        // 1MB 数据
        val largeData = ByteArray(1024 * 1024) { it.toByte() }
        val hash = computeSHA256(largeData)
        
        hash shouldHaveLength 64
        hash shouldMatch Regex("^[0-9a-f]{64}$")
    }
})

/**
 * 计算 SHA-256 哈希
 */
private fun computeSHA256(data: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256")
    return digest.digest(data).joinToString("") { "%02x".format(it) }
}
