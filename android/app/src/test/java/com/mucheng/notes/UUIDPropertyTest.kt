package com.mucheng.notes

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldMatch
import io.kotest.property.checkAll
import java.util.UUID

/**
 * UUID 属性测试
 */
class UUIDPropertyTest : StringSpec({
    
    /**
     * Property 2: UUID v4 Format Compliance
     * 对于任意生成的 item ID，ID 应该符合 UUID v4 格式
     * (8-4-4-4-12 十六进制模式，版本 4 指示符)
     */
    "Property 2: Generated UUIDs conform to v4 format" {
        repeat(1000) {
            val uuid = UUID.randomUUID().toString()
            
            // UUID v4 格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
            // 其中 y 是 8, 9, a, 或 b
            uuid shouldMatch Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
        }
    }
    
    "Property 2: UUID has correct length" {
        repeat(100) {
            val uuid = UUID.randomUUID().toString()
            uuid.length shouldBe 36 // 32 hex chars + 4 hyphens
        }
    }
    
    "Property 2: UUID version is 4" {
        repeat(100) {
            val uuid = UUID.randomUUID()
            uuid.version() shouldBe 4
        }
    }
    
    "Property 2: UUID variant is RFC 4122" {
        repeat(100) {
            val uuid = UUID.randomUUID()
            uuid.variant() shouldBe 2 // RFC 4122 variant
        }
    }
    
    "Property 2: Generated UUIDs are unique" {
        val uuids = (1..10000).map { UUID.randomUUID().toString() }
        val uniqueUuids = uuids.toSet()
        
        uniqueUuids.size shouldBe uuids.size
    }
})
