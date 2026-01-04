package com.mucheng.notes.integration

import com.mucheng.notes.domain.model.payload.*
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Payload 兼容性集成测试
 * 
 * 验证所有 Payload 类型的 JSON 序列化格式与桌面端完全一致
 */
class PayloadCompatibilityTest : StringSpec({
    
    val json = Json { 
        ignoreUnknownKeys = true 
        encodeDefaults = true
    }
    
    /**
     * 测试 NotePayload 字段名
     */
    "NotePayload field names are snake_case" {
        val payload = NotePayload(
            title = "Test",
            content = "Content",
            folderId = "folder-123",
            isPinned = true,
            isLocked = false,
            lockPasswordHash = null,
            tags = listOf("tag1")
        )
        
        val jsonStr = json.encodeToString(payload)
        
        jsonStr shouldContain "\"folder_id\""
        jsonStr shouldContain "\"is_pinned\""
        jsonStr shouldContain "\"is_locked\""
        jsonStr shouldContain "\"lock_password_hash\""
        
        jsonStr shouldNotContain "\"folderId\""
        jsonStr shouldNotContain "\"isPinned\""
        jsonStr shouldNotContain "\"isLocked\""
        jsonStr shouldNotContain "\"lockPasswordHash\""
    }
    
    /**
     * 测试 TodoPayload 字段名和枚举值
     */
    "TodoPayload field names and enum values are correct" {
        val payload = TodoPayload(
            title = "Task",
            description = "Description",
            quadrant = TodoQuadrant.URGENT_IMPORTANT,
            completed = false,
            completedAt = null,
            dueDate = 1704067200000,
            reminderTime = null,
            reminderEnabled = false,
            priority = 1,
            tags = emptyList()
        )
        
        val jsonStr = json.encodeToString(payload)
        
        // 字段名
        jsonStr shouldContain "\"completed_at\""
        jsonStr shouldContain "\"due_date\""
        jsonStr shouldContain "\"reminder_time\""
        jsonStr shouldContain "\"reminder_enabled\""
        
        // 枚举值
        jsonStr shouldContain "\"urgent-important\""
    }
    
    /**
     * 测试 TodoQuadrant 所有枚举值
     */
    "TodoQuadrant enum values match desktop" {
        val quadrants = mapOf(
            TodoQuadrant.URGENT_IMPORTANT to "urgent-important",
            TodoQuadrant.NOT_URGENT_IMPORTANT to "not-urgent-important",
            TodoQuadrant.URGENT_NOT_IMPORTANT to "urgent-not-important",
            TodoQuadrant.NOT_URGENT_NOT_IMPORTANT to "not-urgent-not-important"
        )
        
        quadrants.forEach { (quadrant, expected) ->
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
            
            val jsonStr = json.encodeToString(payload)
            jsonStr shouldContain "\"$expected\""
        }
    }
    
    /**
     * 测试 VaultEntryPayload 字段名
     */
    "VaultEntryPayload field names are snake_case" {
        val payload = VaultEntryPayload(
            name = "Login",
            entryType = VaultEntryType.LOGIN,
            folderId = null,
            favorite = false,
            notes = "",
            username = "user",
            password = "pass",
            totpSecrets = emptyList(),
            uris = emptyList(),
            cardHolderName = "",
            cardNumber = "",
            cardBrand = "",
            cardExpMonth = "",
            cardExpYear = "",
            cardCvv = "",
            identityTitle = "",
            identityFirstName = "",
            identityLastName = "",
            identityEmail = "",
            identityPhone = "",
            identityAddress = "",
            customFields = emptyList()
        )
        
        val jsonStr = json.encodeToString(payload)
        
        jsonStr shouldContain "\"entry_type\""
        jsonStr shouldContain "\"folder_id\""
        jsonStr shouldContain "\"totp_secrets\""
        jsonStr shouldContain "\"card_holder_name\""
        jsonStr shouldContain "\"card_number\""
        jsonStr shouldContain "\"card_brand\""
        jsonStr shouldContain "\"card_exp_month\""
        jsonStr shouldContain "\"card_exp_year\""
        jsonStr shouldContain "\"card_cvv\""
        jsonStr shouldContain "\"identity_title\""
        jsonStr shouldContain "\"identity_first_name\""
        jsonStr shouldContain "\"identity_last_name\""
        jsonStr shouldContain "\"identity_email\""
        jsonStr shouldContain "\"identity_phone\""
        jsonStr shouldContain "\"identity_address\""
        jsonStr shouldContain "\"custom_fields\""
    }
    
    /**
     * 测试 VaultEntryType 枚举值
     */
    "VaultEntryType enum values match desktop" {
        val types = mapOf(
            VaultEntryType.LOGIN to "login",
            VaultEntryType.CARD to "card",
            VaultEntryType.IDENTITY to "identity",
            VaultEntryType.SECURE_NOTE to "secure_note"
        )
        
        types.forEach { (type, expected) ->
            val payload = VaultEntryPayload(
                name = "Test",
                entryType = type,
                folderId = null,
                favorite = false,
                notes = "",
                username = "",
                password = "",
                totpSecrets = emptyList(),
                uris = emptyList(),
                cardHolderName = "",
                cardNumber = "",
                cardBrand = "",
                cardExpMonth = "",
                cardExpYear = "",
                cardCvv = "",
                identityTitle = "",
                identityFirstName = "",
                identityLastName = "",
                identityEmail = "",
                identityPhone = "",
                identityAddress = "",
                customFields = emptyList()
            )
            
            val jsonStr = json.encodeToString(payload)
            jsonStr shouldContain "\"$expected\""
        }
    }
    
    /**
     * 测试 BookmarkPayload 字段名
     */
    "BookmarkPayload field names are snake_case" {
        val payload = BookmarkPayload(
            name = "Google",
            url = "https://google.com",
            description = "Search engine",
            folderId = null,
            icon = null,
            tags = emptyList()
        )
        
        val jsonStr = json.encodeToString(payload)
        
        jsonStr shouldContain "\"folder_id\""
        jsonStr shouldNotContain "\"folderId\""
    }
    
    /**
     * 测试 AIConversationPayload 字段名
     */
    "AIConversationPayload field names are snake_case" {
        val payload = AIConversationPayload(
            title = "Chat",
            model = "gpt-4",
            systemPrompt = "You are helpful",
            temperature = 0.7f,
            maxTokens = 4096,
            createdAt = System.currentTimeMillis()
        )
        
        val jsonStr = json.encodeToString(payload)
        
        jsonStr shouldContain "\"system_prompt\""
        jsonStr shouldContain "\"max_tokens\""
        jsonStr shouldContain "\"created_at\""
        
        jsonStr shouldNotContain "\"systemPrompt\""
        jsonStr shouldNotContain "\"maxTokens\""
        jsonStr shouldNotContain "\"createdAt\""
    }
    
    /**
     * 测试 AIMessagePayload 字段名
     */
    "AIMessagePayload field names are snake_case" {
        val payload = AIMessagePayload(
            conversationId = "conv-123",
            role = "user",
            content = "Hello",
            model = "gpt-4",
            tokensUsed = 10,
            createdAt = System.currentTimeMillis()
        )
        
        val jsonStr = json.encodeToString(payload)
        
        jsonStr shouldContain "\"conversation_id\""
        jsonStr shouldContain "\"tokens_used\""
        jsonStr shouldContain "\"created_at\""
    }
    
    /**
     * 测试 AIConfigPayload 字段名
     */
    "AIConfigPayload field names are snake_case" {
        val payload = AIConfigPayload(
            enabled = true,
            defaultChannel = "openai",
            defaultModel = "gpt-4",
            channels = emptyList()
        )
        
        val jsonStr = json.encodeToString(payload)
        
        jsonStr shouldContain "\"default_channel\""
        jsonStr shouldContain "\"default_model\""
    }
    
    /**
     * 测试 AIChannel 字段名
     */
    "AIChannel field names are snake_case" {
        val channel = AIChannel(
            id = "ch-1",
            name = "OpenAI",
            type = "openai",
            apiUrl = "https://api.openai.com",
            apiKey = "sk-xxx",
            models = emptyList(),
            enabled = true
        )
        
        val jsonStr = json.encodeToString(channel)
        
        jsonStr shouldContain "\"api_url\""
        jsonStr shouldContain "\"api_key\""
    }
    
    /**
     * 测试 ResourcePayload 字段名（不含 local_path）
     */
    "ResourcePayload field names are snake_case and no local_path" {
        val payload = ResourcePayload(
            filename = "image.png",
            mimeType = "image/png",
            size = 1024,
            noteId = "note-123",
            fileHash = "abc123"
        )
        
        val jsonStr = json.encodeToString(payload)
        
        jsonStr shouldContain "\"mime_type\""
        jsonStr shouldContain "\"note_id\""
        jsonStr shouldContain "\"file_hash\""
        
        // 不应包含 local_path
        jsonStr shouldNotContain "\"local_path\""
        jsonStr shouldNotContain "\"localPath\""
    }
    
    /**
     * 测试 DiagramPayload 字段名和枚举值
     */
    "DiagramPayload field names and enum values are correct" {
        val payload = DiagramPayload(
            name = "My Diagram",
            diagramType = DiagramType.MINDMAP,
            data = "{}",
            folderId = null,
            thumbnail = null
        )
        
        val jsonStr = json.encodeToString(payload)
        
        jsonStr shouldContain "\"diagram_type\""
        jsonStr shouldContain "\"folder_id\""
        jsonStr shouldContain "\"mindmap\""
    }
    
    /**
     * 测试 DiagramType 所有枚举值
     */
    "DiagramType enum values match desktop" {
        val types = mapOf(
            DiagramType.MINDMAP to "mindmap",
            DiagramType.FLOWCHART to "flowchart",
            DiagramType.WHITEBOARD to "whiteboard"
        )
        
        types.forEach { (type, expected) ->
            val payload = DiagramPayload(
                name = "Test",
                diagramType = type,
                data = "{}",
                folderId = null,
                thumbnail = null
            )
            
            val jsonStr = json.encodeToString(payload)
            jsonStr shouldContain "\"$expected\""
        }
    }
    
    /**
     * 测试 FolderPayload 字段名
     */
    "FolderPayload field names are snake_case" {
        val payload = FolderPayload(
            name = "My Folder",
            parentId = null,
            icon = "📁",
            color = "#FF0000"
        )
        
        val jsonStr = json.encodeToString(payload)
        
        jsonStr shouldContain "\"parent_id\""
        jsonStr shouldNotContain "\"parentId\""
    }
    
    /**
     * 测试 VaultUri 字段名
     */
    "VaultUri field names are snake_case" {
        val uri = VaultUri(
            id = "uri-1",
            name = "Main",
            uri = "https://example.com",
            matchType = "domain"
        )
        
        val jsonStr = json.encodeToString(uri)
        
        jsonStr shouldContain "\"match_type\""
        jsonStr shouldNotContain "\"matchType\""
    }
})
