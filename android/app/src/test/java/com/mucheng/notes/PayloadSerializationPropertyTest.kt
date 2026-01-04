package com.mucheng.notes

import com.mucheng.notes.domain.model.payload.*
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import io.kotest.property.Arb
import io.kotest.property.arbitrary.*
import io.kotest.property.checkAll
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Payload 序列化属性测试
 */
class PayloadSerializationPropertyTest : StringSpec({
    
    val json = Json { 
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    
    /**
     * Property 3: Payload Serialization Round-Trip
     * 对于任意有效的 payload 对象，序列化为 JSON 后反序列化应该产生等价对象
     */
    "Property 3: NotePayload serialization round-trip" {
        checkAll(
            Arb.string(0, 100),
            Arb.string(0, 500),
            Arb.boolean(),
            Arb.boolean()
        ) { title, content, isPinned, isLocked ->
            val original = NotePayload(
                title = title,
                content = content,
                folderId = null,
                isPinned = isPinned,
                isLocked = isLocked,
                lockPasswordHash = null,
                tags = emptyList()
            )
            
            val serialized = json.encodeToString(original)
            val deserialized = json.decodeFromString<NotePayload>(serialized)
            
            deserialized shouldBe original
        }
    }
    
    "Property 3: TodoPayload serialization round-trip" {
        checkAll(
            Arb.string(0, 100),
            Arb.string(0, 500),
            Arb.boolean(),
            Arb.int(0, 10)
        ) { title, description, completed, priority ->
            val original = TodoPayload(
                title = title,
                description = description,
                quadrant = TodoQuadrant.URGENT_IMPORTANT,
                completed = completed,
                completedAt = null,
                dueDate = null,
                reminderTime = null,
                reminderEnabled = false,
                priority = priority,
                tags = emptyList()
            )
            
            val serialized = json.encodeToString(original)
            val deserialized = json.decodeFromString<TodoPayload>(serialized)
            
            deserialized shouldBe original
        }
    }
    
    "Property 3: BookmarkPayload serialization round-trip" {
        checkAll(
            Arb.string(0, 100),
            Arb.string(0, 200),
            Arb.string(0, 500)
        ) { name, url, description ->
            val original = BookmarkPayload(
                name = name,
                url = url,
                description = description,
                folderId = null,
                icon = null,
                tags = emptyList()
            )
            
            val serialized = json.encodeToString(original)
            val deserialized = json.decodeFromString<BookmarkPayload>(serialized)
            
            deserialized shouldBe original
        }
    }
    
    /**
     * Property 13: JSON Serialization Desktop Compatibility
     * 对于任意 Payload 对象，序列化后的 JSON 字段名应该是 snake_case 格式
     * 与桌面端 JSON 格式完全一致
     */
    "Property 13: NotePayload uses snake_case field names" {
        val payload = NotePayload(
            title = "Test",
            content = "Content",
            folderId = "folder-123",
            isPinned = true,
            isLocked = false,
            lockPasswordHash = null,
            tags = listOf("tag1")
        )
        
        val serialized = json.encodeToString(payload)
        
        // 应该包含 snake_case 字段名
        serialized shouldContain "\"folder_id\""
        serialized shouldContain "\"is_pinned\""
        serialized shouldContain "\"is_locked\""
        serialized shouldContain "\"lock_password_hash\""
        
        // 不应该包含 camelCase 字段名
        serialized shouldNotContain "\"folderId\""
        serialized shouldNotContain "\"isPinned\""
        serialized shouldNotContain "\"isLocked\""
        serialized shouldNotContain "\"lockPasswordHash\""
    }
    
    "Property 13: TodoPayload uses snake_case field names" {
        val payload = TodoPayload(
            title = "Test",
            description = "Desc",
            quadrant = TodoQuadrant.URGENT_IMPORTANT,
            completed = false,
            completedAt = 1234567890L,
            dueDate = 1234567890L,
            reminderTime = 1234567890L,
            reminderEnabled = true,
            priority = 1,
            tags = emptyList()
        )
        
        val serialized = json.encodeToString(payload)
        
        serialized shouldContain "\"completed_at\""
        serialized shouldContain "\"due_date\""
        serialized shouldContain "\"reminder_time\""
        serialized shouldContain "\"reminder_enabled\""
        
        serialized shouldNotContain "\"completedAt\""
        serialized shouldNotContain "\"dueDate\""
        serialized shouldNotContain "\"reminderTime\""
        serialized shouldNotContain "\"reminderEnabled\""
    }
    
    "Property 13: VaultEntryPayload uses snake_case field names" {
        val payload = VaultEntryPayload(
            name = "Test",
            entryType = VaultEntryType.LOGIN,
            folderId = "folder-123",
            totpSecrets = emptyList(),
            customFields = emptyList()
        )
        
        val serialized = json.encodeToString(payload)
        
        serialized shouldContain "\"entry_type\""
        serialized shouldContain "\"folder_id\""
        serialized shouldContain "\"totp_secrets\""
        serialized shouldContain "\"custom_fields\""
        serialized shouldContain "\"card_holder_name\""
        serialized shouldContain "\"card_exp_month\""
        
        serialized shouldNotContain "\"entryType\""
        serialized shouldNotContain "\"totpSecrets\""
        serialized shouldNotContain "\"customFields\""
        serialized shouldNotContain "\"cardHolderName\""
    }
    
    "Property 13: AIPayload uses snake_case field names" {
        val conversation = AIConversationPayload(
            title = "Test",
            model = "gpt-4",
            systemPrompt = "You are helpful",
            maxTokens = 4096,
            createdAt = 1234567890L
        )
        
        val serialized = json.encodeToString(conversation)
        
        serialized shouldContain "\"system_prompt\""
        serialized shouldContain "\"max_tokens\""
        serialized shouldContain "\"created_at\""
        
        serialized shouldNotContain "\"systemPrompt\""
        serialized shouldNotContain "\"maxTokens\""
        serialized shouldNotContain "\"createdAt\""
    }
    
    "Property 13: TodoQuadrant enum uses correct values" {
        val quadrants = listOf(
            TodoQuadrant.URGENT_IMPORTANT to "urgent-important",
            TodoQuadrant.NOT_URGENT_IMPORTANT to "not-urgent-important",
            TodoQuadrant.URGENT_NOT_IMPORTANT to "urgent-not-important",
            TodoQuadrant.NOT_URGENT_NOT_IMPORTANT to "not-urgent-not-important"
        )
        
        for ((quadrant, expected) in quadrants) {
            val payload = TodoPayload(
                title = "Test",
                description = "",
                quadrant = quadrant,
                completed = false,
                completedAt = null,
                dueDate = null,
                reminderTime = null,
                reminderEnabled = false,
                priority = 0,
                tags = emptyList()
            )
            
            val serialized = json.encodeToString(payload)
            serialized shouldContain "\"$expected\""
        }
    }
    
    "Property 13: VaultEntryType enum uses correct values" {
        val types = listOf(
            VaultEntryType.LOGIN to "login",
            VaultEntryType.CARD to "card",
            VaultEntryType.IDENTITY to "identity",
            VaultEntryType.SECURE_NOTE to "secure_note"
        )
        
        for ((type, expected) in types) {
            val payload = VaultEntryPayload(
                name = "Test",
                entryType = type
            )
            
            val serialized = json.encodeToString(payload)
            serialized shouldContain "\"$expected\""
        }
    }
    
    "Property 13: DiagramType enum uses correct values" {
        val types = listOf(
            DiagramType.MINDMAP to "mindmap",
            DiagramType.FLOWCHART to "flowchart",
            DiagramType.WHITEBOARD to "whiteboard"
        )
        
        for ((type, expected) in types) {
            val payload = DiagramPayload(
                name = "Test",
                diagramType = type,
                data = "{}"
            )
            
            val serialized = json.encodeToString(payload)
            serialized shouldContain "\"$expected\""
        }
    }
})
