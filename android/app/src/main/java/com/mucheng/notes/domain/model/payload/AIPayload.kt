package com.mucheng.notes.domain.model.payload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * AI 对话 Payload - 与桌面端 AIConversationPayload 完全一致
 */
@Serializable
data class AIConversationPayload(
    val title: String,
    val model: String,
    @SerialName("system_prompt") val systemPrompt: String = "",
    val temperature: Float = 0.7f,
    @SerialName("max_tokens") val maxTokens: Int = 4096,
    @SerialName("created_at") val createdAt: Long
)

/**
 * AI 消息 Payload - 与桌面端 AIMessagePayload 完全一致
 */
@Serializable
data class AIMessagePayload(
    @SerialName("conversation_id") val conversationId: String,
    val role: String, // "user", "assistant", "system"
    val content: String,
    val model: String,
    @SerialName("tokens_used") val tokensUsed: Int? = null,
    @SerialName("created_at") val createdAt: Long
)

/**
 * AI 配置 Payload - 与桌面端 AIConfigPayload 完全一致
 * 注意: 此类型属于 SENSITIVE_TYPES，始终加密
 */
@Serializable
data class AIConfigPayload(
    val enabled: Boolean = true,
    @SerialName("default_channel") val defaultChannel: String = "",
    @SerialName("default_model") val defaultModel: String = "",
    val channels: List<AIChannel> = emptyList()
)

/**
 * AI 渠道配置 - 与桌面端 AIChannel 完全一致
 */
@Serializable
data class AIChannel(
    val id: String,
    val name: String,
    val type: String, // "openai", "anthropic", "custom"
    @SerialName("api_url") val apiUrl: String,
    @SerialName("api_key") val apiKey: String,
    val models: List<AIModel> = emptyList(),
    val enabled: Boolean = true
)

/**
 * AI 模型 - 与桌面端 AIModel 完全一致
 */
@Serializable
data class AIModel(
    val id: String,
    val name: String,
    @SerialName("channel_id") val channelId: String,
    @SerialName("max_tokens") val maxTokens: Int = 4096,
    @SerialName("is_custom") val isCustom: Boolean = false
)
