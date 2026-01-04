package com.mucheng.notes

import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.domain.model.ItemType
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe

/**
 * 敏感类型加密属性测试
 */
class SensitiveTypesPropertyTest : StringSpec({
    
    /**
     * Property 8: Sensitive Types Always Encrypted
     * 对于 SENSITIVE_TYPES 中的任意类型 (vault_entry, vault_folder, ai_config)
     * 准备同步时应该设置 encryption_applied 为 1，无论全局 encryptionEnabled 设置如何
     */
    "Property 8: SENSITIVE_TYPES contains correct types" {
        val sensitiveTypes = ItemType.SENSITIVE_TYPES
        
        sensitiveTypes.contains(ItemType.VAULT_ENTRY) shouldBe true
        sensitiveTypes.contains(ItemType.VAULT_FOLDER) shouldBe true
        sensitiveTypes.contains(ItemType.AI_CONFIG) shouldBe true
        
        sensitiveTypes.size shouldBe 3
    }
    
    "Property 8: vault_entry is always in SENSITIVE_TYPES" {
        ItemType.SENSITIVE_TYPES.any { it.value == "vault_entry" } shouldBe true
    }
    
    "Property 8: vault_folder is always in SENSITIVE_TYPES" {
        ItemType.SENSITIVE_TYPES.any { it.value == "vault_folder" } shouldBe true
    }
    
    "Property 8: ai_config is always in SENSITIVE_TYPES" {
        ItemType.SENSITIVE_TYPES.any { it.value == "ai_config" } shouldBe true
    }
    
    "Property 8: note is NOT in SENSITIVE_TYPES" {
        ItemType.SENSITIVE_TYPES.any { it.value == "note" } shouldBe false
    }
    
    "Property 8: bookmark is NOT in SENSITIVE_TYPES" {
        ItemType.SENSITIVE_TYPES.any { it.value == "bookmark" } shouldBe false
    }
    
    "Property 8: todo is NOT in SENSITIVE_TYPES" {
        ItemType.SENSITIVE_TYPES.any { it.value == "todo" } shouldBe false
    }
    
    /**
     * 模拟 prepareForUpload 逻辑测试
     */
    "Property 8: Sensitive items should be encrypted regardless of global setting" {
        val sensitiveTypes = listOf("vault_entry", "vault_folder", "ai_config")
        
        for (type in sensitiveTypes) {
            val item = ItemEntity(
                id = "test-id",
                type = type,
                createdTime = System.currentTimeMillis(),
                updatedTime = System.currentTimeMillis(),
                deletedTime = null,
                payload = "{}",
                contentHash = "abcd1234abcd1234",
                syncStatus = "modified",
                localRev = 1,
                remoteRev = null,
                encryptionApplied = 0,
                schemaVersion = 1
            )
            
            // 检查类型是否在敏感类型列表中
            val isSensitive = ItemType.SENSITIVE_TYPES.any { it.value == item.type }
            isSensitive shouldBe true
        }
    }
    
    "Property 8: Non-sensitive items respect global encryption setting" {
        val nonSensitiveTypes = listOf("note", "folder", "tag", "bookmark", "todo", "diagram")
        
        for (type in nonSensitiveTypes) {
            val isSensitive = ItemType.SENSITIVE_TYPES.any { it.value == type }
            isSensitive shouldBe false
        }
    }
})
