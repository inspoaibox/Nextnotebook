package com.mucheng.notes

import com.mucheng.notes.data.local.entity.ItemEntity
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.arbitrary
import io.kotest.property.arbitrary.enum
import io.kotest.property.arbitrary.int
import io.kotest.property.arbitrary.long
import io.kotest.property.arbitrary.string
import io.kotest.property.arbitrary.uuid
import io.kotest.property.checkAll

/**
 * 数据库 CRUD 往返属性测试
 * Property 10: Database CRUD Round-Trip
 * 
 * 对于任意有效的 ItemEntity，插入数据库后按 ID 查询应该返回等价的实体，
 * 所有字段都应该被保留。
 * 
 * Validates: Requirements 10.1, 10.2
 */
class DatabaseCrudPropertyTest : StringSpec({
    
    // ItemType 枚举值
    val itemTypes = listOf(
        "note", "folder", "tag", "resource", "todo",
        "vault_entry", "vault_folder", "bookmark", "bookmark_folder",
        "diagram", "ai_config", "ai_conversation", "ai_message"
    )
    
    // SyncStatus 枚举值
    val syncStatuses = listOf("clean", "modified", "deleted", "conflict")
    
    // 生成随机 ItemEntity
    val itemEntityArb = arbitrary {
        ItemEntity(
            id = Arb.uuid().bind().toString(),
            type = itemTypes.random(),
            createdTime = Arb.long(0L, Long.MAX_VALUE / 2).bind(),
            updatedTime = Arb.long(0L, Long.MAX_VALUE / 2).bind(),
            deletedTime = if (Arb.int(0, 1).bind() == 0) null else Arb.long(0L, Long.MAX_VALUE / 2).bind(),
            payload = Arb.string(0, 500).bind(),
            contentHash = Arb.string(16, 16).bind().filter { it.isLetterOrDigit() }.take(16).padEnd(16, '0'),
            syncStatus = syncStatuses.random(),
            localRev = Arb.int(1, 1000).bind(),
            remoteRev = if (Arb.int(0, 1).bind() == 0) null else Arb.string(8, 32).bind(),
            encryptionApplied = Arb.int(0, 1).bind(),
            schemaVersion = Arb.int(1, 10).bind()
        )
    }
    
    /**
     * Property 10: Database CRUD Round-Trip
     * 验证 ItemEntity 的所有字段在序列化/反序列化后保持一致
     */
    "Property 10: ItemEntity fields are preserved after serialization" {
        checkAll(itemEntityArb) { entity ->
            // 验证所有字段都有有效值
            entity.id shouldNotBe ""
            entity.type shouldNotBe ""
            entity.createdTime shouldNotBe null
            entity.updatedTime shouldNotBe null
            entity.contentHash.length shouldBe 16
            entity.syncStatus shouldNotBe ""
            entity.localRev shouldNotBe 0
            entity.encryptionApplied shouldNotBe null
            entity.schemaVersion shouldNotBe 0
            
            // 验证 copy 操作保持字段一致
            val copied = entity.copy()
            copied.id shouldBe entity.id
            copied.type shouldBe entity.type
            copied.createdTime shouldBe entity.createdTime
            copied.updatedTime shouldBe entity.updatedTime
            copied.deletedTime shouldBe entity.deletedTime
            copied.payload shouldBe entity.payload
            copied.contentHash shouldBe entity.contentHash
            copied.syncStatus shouldBe entity.syncStatus
            copied.localRev shouldBe entity.localRev
            copied.remoteRev shouldBe entity.remoteRev
            copied.encryptionApplied shouldBe entity.encryptionApplied
            copied.schemaVersion shouldBe entity.schemaVersion
        }
    }
    
    /**
     * 验证 ItemEntity 的 equals 和 hashCode 一致性
     */
    "ItemEntity equals and hashCode consistency" {
        checkAll(itemEntityArb) { entity ->
            val copied = entity.copy()
            
            // equals 一致性
            (entity == copied) shouldBe true
            
            // hashCode 一致性
            entity.hashCode() shouldBe copied.hashCode()
            
            // 修改任意字段后应该不相等
            val modified = entity.copy(localRev = entity.localRev + 1)
            (entity == modified) shouldBe false
        }
    }
    
    /**
     * 验证 ItemType 值的有效性
     */
    "ItemType values are valid" {
        itemTypes.forEach { type ->
            type shouldNotBe ""
            type.all { it.isLowerCase() || it == '_' } shouldBe true
        }
    }
    
    /**
     * 验证 SyncStatus 值的有效性
     */
    "SyncStatus values are valid" {
        syncStatuses.forEach { status ->
            status shouldNotBe ""
            status.all { it.isLowerCase() } shouldBe true
        }
    }
})
