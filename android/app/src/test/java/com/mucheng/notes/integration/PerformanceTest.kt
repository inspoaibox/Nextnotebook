package com.mucheng.notes.integration

import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.domain.model.payload.NotePayload
import com.mucheng.notes.security.CryptoEngineImpl
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.longs.shouldBeLessThan
import io.kotest.matchers.shouldBe
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID
import kotlin.system.measureTimeMillis

/**
 * 性能测试
 * Task 18.3: 性能优化
 * 
 * 验证:
 * - 大量数据列表性能
 * - 同步性能优化
 * - 内存使用优化
 */
class PerformanceTest : StringSpec({
    
    val json = Json { 
        ignoreUnknownKeys = true 
        encodeDefaults = true
    }
    
    val cryptoEngine = CryptoEngineImpl()
    
    beforeSpec {
        val testKey = ByteArray(32) { it.toByte() }
        cryptoEngine.setMasterKey(testKey)
    }
    
    afterSpec {
        cryptoEngine.clearMasterKey()
    }
    
    /**
     * 测试大量 ItemEntity 创建性能
     */
    "Creating 1000 ItemEntities should be fast" {
        val count = 1000
        
        val time = measureTimeMillis {
            repeat(count) { i ->
                ItemEntity(
                    id = UUID.randomUUID().toString(),
                    type = "note",
                    createdTime = System.currentTimeMillis(),
                    updatedTime = System.currentTimeMillis(),
                    deletedTime = null,
                    payload = """{"title":"Note $i","content":"Content $i","folder_id":null,"is_pinned":false,"is_locked":false,"lock_password_hash":null,"tags":[]}""",
                    contentHash = "hash${i.toString().padStart(12, '0')}",
                    syncStatus = "modified",
                    localRev = 1,
                    remoteRev = null,
                    encryptionApplied = 0,
                    schemaVersion = 1
                )
            }
        }
        
        // 创建 1000 个实体应在 1 秒内完成
        time shouldBeLessThan 1000L
    }
    
    /**
     * 测试 Payload 序列化性能
     */
    "Serializing 1000 NotePayloads should be fast" {
        val count = 1000
        val payloads = (0 until count).map { i ->
            NotePayload(
                title = "Note $i",
                content = "Content ".repeat(100),
                folderId = null,
                isPinned = i % 2 == 0,
                isLocked = false,
                lockPasswordHash = null,
                tags = listOf("tag1", "tag2", "tag3")
            )
        }
        
        val time = measureTimeMillis {
            payloads.forEach { payload ->
                json.encodeToString(payload)
            }
        }
        
        // 序列化 1000 个 payload 应在 2 秒内完成
        time shouldBeLessThan 2000L
    }
    
    /**
     * 测试 Payload 反序列化性能
     */
    "Deserializing 1000 NotePayloads should be fast" {
        val count = 1000
        val jsonStrings = (0 until count).map { i ->
            """{"title":"Note $i","content":"${"Content ".repeat(100)}","folder_id":null,"is_pinned":${i % 2 == 0},"is_locked":false,"lock_password_hash":null,"tags":["tag1","tag2","tag3"]}"""
        }
        
        val time = measureTimeMillis {
            jsonStrings.forEach { jsonStr ->
                json.decodeFromString<NotePayload>(jsonStr)
            }
        }
        
        // 反序列化 1000 个 payload 应在 2 秒内完成
        time shouldBeLessThan 2000L
    }
    
    /**
     * 测试加密性能
     */
    "Encrypting 100 payloads should be fast" {
        val count = 100
        val payloads = (0 until count).map { i ->
            """{"title":"Note $i","content":"${"Content ".repeat(50)}"}"""
        }
        
        val time = measureTimeMillis {
            payloads.forEach { payload ->
                cryptoEngine.encryptPayload(payload)
            }
        }
        
        // 加密 100 个 payload 应在 2 秒内完成
        time shouldBeLessThan 2000L
    }
    
    /**
     * 测试解密性能
     */
    "Decrypting 100 payloads should be fast" {
        val count = 100
        val encryptedPayloads = (0 until count).map { i ->
            val payload = """{"title":"Note $i","content":"${"Content ".repeat(50)}"}"""
            cryptoEngine.encryptPayload(payload)
        }
        
        val time = measureTimeMillis {
            encryptedPayloads.forEach { encrypted ->
                cryptoEngine.decryptPayload(encrypted)
            }
        }
        
        // 解密 100 个 payload 应在 2 秒内完成
        time shouldBeLessThan 2000L
    }
    
    /**
     * 测试内容哈希计算性能
     */
    "Computing 1000 content hashes should be fast" {
        val count = 1000
        val contents = (0 until count).map { i ->
            "Content $i ".repeat(100)
        }
        
        val time = measureTimeMillis {
            contents.forEach { content ->
                cryptoEngine.computeHash(content)
            }
        }
        
        // 计算 1000 个哈希应在 1 秒内完成
        time shouldBeLessThan 1000L
    }
    
    /**
     * 测试密钥派生性能
     * 注意：PBKDF2 100000 次迭代本身就比较慢
     */
    "Key derivation should complete in reasonable time" {
        val password = "test_password_123"
        val salt = ByteArray(32) { it.toByte() }
        
        val time = measureTimeMillis {
            cryptoEngine.deriveKeyFromPassword(password, salt)
        }
        
        // 密钥派生应在 5 秒内完成（PBKDF2 100000 次迭代）
        time shouldBeLessThan 5000L
    }
    
    /**
     * 测试大文本加密性能
     */
    "Encrypting large text (1MB) should complete in reasonable time" {
        val largeText = "A".repeat(1024 * 1024) // 1MB
        
        val time = measureTimeMillis {
            cryptoEngine.encrypt(largeText)
        }
        
        // 加密 1MB 文本应在 2 秒内完成
        time shouldBeLessThan 2000L
    }
    
    /**
     * 测试 UUID 生成性能
     */
    "Generating 10000 UUIDs should be fast" {
        val count = 10000
        
        val time = measureTimeMillis {
            repeat(count) {
                UUID.randomUUID().toString()
            }
        }
        
        // 生成 10000 个 UUID 应在 500ms 内完成
        time shouldBeLessThan 500L
    }
    
    /**
     * 测试列表过滤性能
     */
    "Filtering 10000 items should be fast" {
        val items = (0 until 10000).map { i ->
            ItemEntity(
                id = UUID.randomUUID().toString(),
                type = if (i % 5 == 0) "note" else "todo",
                createdTime = System.currentTimeMillis(),
                updatedTime = System.currentTimeMillis(),
                deletedTime = if (i % 10 == 0) System.currentTimeMillis() else null,
                payload = "{}",
                contentHash = "0000000000000000",
                syncStatus = if (i % 3 == 0) "modified" else "clean",
                localRev = 1,
                remoteRev = null,
                encryptionApplied = 0,
                schemaVersion = 1
            )
        }
        
        val time = measureTimeMillis {
            // 过滤未删除的笔记
            val notes = items.filter { it.type == "note" && it.deletedTime == null }
            // 过滤待同步的项目
            val pending = items.filter { it.syncStatus == "modified" || it.syncStatus == "deleted" }
            
            notes.size shouldBe 1800 // 10000 / 5 * 0.9 (90% 未删除)
        }
        
        // 过滤 10000 个项目应在 100ms 内完成
        time shouldBeLessThan 100L
    }
    
    /**
     * 测试排序性能
     */
    "Sorting 10000 items should be fast" {
        val items = (0 until 10000).map { i ->
            ItemEntity(
                id = UUID.randomUUID().toString(),
                type = "note",
                createdTime = System.currentTimeMillis() - (i * 1000L),
                updatedTime = System.currentTimeMillis() - (i * 500L),
                deletedTime = null,
                payload = "{}",
                contentHash = "0000000000000000",
                syncStatus = "clean",
                localRev = 1,
                remoteRev = null,
                encryptionApplied = 0,
                schemaVersion = 1
            )
        }
        
        val time = measureTimeMillis {
            items.sortedByDescending { it.updatedTime }
        }
        
        // 排序 10000 个项目应在 100ms 内完成
        time shouldBeLessThan 100L
    }
})
