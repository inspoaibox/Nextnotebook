package com.mucheng.notes.data.remote

import com.mucheng.notes.domain.model.payload.AIChannel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * AI API 请求消息
 */
@Serializable
data class ChatMessage(
    val role: String,
    val content: String
)

/**
 * OpenAI 格式请求
 */
@Serializable
data class ChatCompletionRequest(
    val model: String,
    val messages: List<ChatMessage>,
    val temperature: Float = 0.7f,
    @SerialName("max_tokens") val maxTokens: Int = 4096,
    val stream: Boolean = true
)

/**
 * OpenAI 格式响应
 */
@Serializable
data class ChatCompletionResponse(
    val id: String? = null,
    val choices: List<Choice>? = null,
    val usage: Usage? = null
)

@Serializable
data class Choice(
    val index: Int = 0,
    val delta: Delta? = null,
    val message: ChatMessage? = null,
    @SerialName("finish_reason") val finishReason: String? = null
)

@Serializable
data class Delta(
    val role: String? = null,
    val content: String? = null
)

@Serializable
data class Usage(
    @SerialName("prompt_tokens") val promptTokens: Int = 0,
    @SerialName("completion_tokens") val completionTokens: Int = 0,
    @SerialName("total_tokens") val totalTokens: Int = 0
)

/**
 * AI API 客户端
 * 支持 OpenAI、Anthropic、Gemini 和自定义 API
 */
@Singleton
class AIApiClient @Inject constructor() {
    
    private val json = Json { 
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    
    /**
     * 规范化 API URL，自动补全 /chat/completions
     */
    private fun normalizeApiUrl(url: String): String {
        var normalized = url.trim()
        // 移除末尾斜杠
        if (normalized.endsWith("/")) {
            normalized = normalized.dropLast(1)
        }
        // 如果 URL 不包含 /chat/completions，自动补全（修复：使用 contains 而非 endsWith）
        if (!normalized.contains("/chat/completions")) {
            normalized = "$normalized/chat/completions"
        }
        return normalized
    }
    
    /**
     * 发送聊天请求（流式响应）
     */
    fun streamChat(
        channel: AIChannel,
        model: String,
        messages: List<ChatMessage>,
        temperature: Float = 0.7f,
        maxTokens: Int = 4096
    ): Flow<String> = flow {
        // Gemini API 使用不同的格式
        if (channel.type.equals("gemini", ignoreCase = true)) {
            streamGeminiChat(channel, model, messages, temperature, maxTokens).collect { emit(it) }
            return@flow
        }
        
        // Anthropic API 处理
        if (channel.type.equals("anthropic", ignoreCase = true)) {
            streamAnthropicChat(channel, model, messages, temperature, maxTokens).collect { emit(it) }
            return@flow
        }
        
        // 自动补全 API URL (OpenAI 兼容)
        val apiUrl = normalizeApiUrl(channel.apiUrl)
        
        val request = ChatCompletionRequest(
            model = model,
            messages = messages,
            temperature = temperature,
            maxTokens = maxTokens,
            stream = true
        )
        // ... (existing OpenAI logic) ...
        val requestBody = json.encodeToString(request)
            .toRequestBody("application/json".toMediaType())
        
        val httpRequest = Request.Builder()
            .url(apiUrl)
            .addHeader("Authorization", "Bearer ${channel.apiKey}")
            .addHeader("Content-Type", "application/json")
            .post(requestBody)
            .build()
        
        val response = httpClient.newCall(httpRequest).execute()
        
        if (!response.isSuccessful) {
            throw IOException("API 请求失败: ${response.code}")
        }
        
        val source = response.body?.source() ?: throw IOException("响应体为空")
        
        while (!source.exhausted()) {
            val line = source.readUtf8Line() ?: break
            
            if (line.startsWith("data: ")) {
                val data = line.removePrefix("data: ").trim()
                
                if (data == "[DONE]") break
                
                try {
                    val chunk = json.decodeFromString<ChatCompletionResponse>(data)
                    val content = chunk.choices?.firstOrNull()?.delta?.content
                    if (!content.isNullOrEmpty()) {
                        emit(content)
                    }
                } catch (e: Exception) {
                    // 忽略解析错误
                }
            }
        }
    }.flowOn(Dispatchers.IO)

    /**
     * Anthropic API 流式聊天
     */
    private fun streamAnthropicChat(
        channel: AIChannel,
        model: String,
        messages: List<ChatMessage>,
        temperature: Float,
        maxTokens: Int
    ): Flow<String> = flow {
        val apiUrl = channel.apiUrl.ifBlank { "https://api.anthropic.com/v1/messages" }
        
        // 提取 system prompt
        val systemMsg = messages.find { it.role == "system" }
        val otherMsgs = messages.filter { it.role != "system" }
        
        val bodyMap = mutableMapOf<String, Any>(
            "model" to model,
            "messages" to otherMsgs,
            "max_tokens" to maxTokens,
            "temperature" to temperature,
            "stream" to true
        )
        if (systemMsg != null) {
            bodyMap["system"] = systemMsg.content
        }
        
        val requestBody = json.encodeToString(JsonObject.serializer(), buildJsonObject {
            put("model", model)
            put("max_tokens", maxTokens)
            put("temperature", temperature)
            put("stream", true)
            systemMsg?.let { put("system", it.content) }
            put("messages", buildJsonArray {
                otherMsgs.forEach { msg ->
                    add(buildJsonObject {
                        put("role", msg.role)
                        put("content", msg.content)
                    })
                }
            })
        }).toRequestBody("application/json".toMediaType())
        
        val httpRequest = Request.Builder()
            .url(apiUrl)
            .addHeader("x-api-key", channel.apiKey)
            .addHeader("anthropic-version", "2023-06-01")
            .addHeader("Content-Type", "application/json")
            .post(requestBody)
            .build()
            
        val response = httpClient.newCall(httpRequest).execute()
        if (!response.isSuccessful) {
             val errorBody = response.body?.string() ?: ""
             throw IOException("Anthropic API 请求失败: ${response.code} - $errorBody")
        }
        
        val source = response.body?.source() ?: throw IOException("响应体为空")
        
        while (!source.exhausted()) {
            val line = source.readUtf8Line() ?: break
            
            if (line.startsWith("event: content_block_delta")) {
                // The next line should be data: ...
                val dataLine = source.readUtf8Line() ?: break
                if (dataLine.startsWith("data: ")) {
                    val data = dataLine.removePrefix("data: ").trim()
                    try {
                        val jsonElement = json.parseToJsonElement(data)
                        val text = jsonElement.jsonObject["delta"]?.jsonObject?.get("text")?.jsonPrimitive?.content
                        if (!text.isNullOrEmpty()) {
                            emit(text)
                        }
                    } catch (e: Exception) { }
                }
            }
        }
    }.flowOn(Dispatchers.IO)

    
    /**
     * Gemini API 流式聊天
     */
    private fun streamGeminiChat(
        channel: AIChannel,
        model: String,
        messages: List<ChatMessage>,
        temperature: Float,
        maxTokens: Int
    ): Flow<String> = flow {
        // Gemini API URL: {baseUrl}/models/{model}:streamGenerateContent?key={apiKey}
        val url = "${channel.apiUrl}/models/$model:streamGenerateContent?key=${channel.apiKey}"
        
        // 转换消息格式
        val contents = mutableListOf<JsonObject>()
        var systemInstruction: String? = null
        
        for (msg in messages) {
            if (msg.role == "system") {
                systemInstruction = msg.content
            } else {
                contents.add(buildJsonObject {
                    put("role", if (msg.role == "assistant") "model" else "user")
                    put("parts", buildJsonArray {
                        add(buildJsonObject { put("text", msg.content) })
                    })
                })
            }
        }
        
        val body = buildJsonObject {
            put("contents", JsonArray(contents))
            put("generationConfig", buildJsonObject {
                put("temperature", temperature)
                put("maxOutputTokens", maxTokens)
            })
            systemInstruction?.let {
                put("systemInstruction", buildJsonObject {
                    put("parts", buildJsonArray {
                        add(buildJsonObject { put("text", it) })
                    })
                })
            }
        }
        
        val requestBody = body.toString().toRequestBody("application/json".toMediaType())
        
        val httpRequest = Request.Builder()
            .url(url)
            .addHeader("Content-Type", "application/json")
            .post(requestBody)
            .build()
        
        val response = httpClient.newCall(httpRequest).execute()
        
        if (!response.isSuccessful) {
            val errorBody = response.body?.string() ?: ""
            throw IOException("Gemini API 请求失败: ${response.code} - $errorBody")
        }
        
        val source = response.body?.source() ?: throw IOException("响应体为空")
        val buffer = StringBuilder()
        
        while (!source.exhausted()) {
            val line = source.readUtf8Line() ?: break
            val trimmed = line.trim()
            
            if (trimmed.isEmpty() || trimmed == "[" || trimmed == "]" || trimmed == ",") continue
            
            try {
                val jsonStr = if (trimmed.startsWith(",")) trimmed.substring(1) else trimmed
                val jsonElement = json.parseToJsonElement(jsonStr)
                val text = jsonElement.jsonObject["candidates"]
                    ?.jsonArray?.firstOrNull()
                    ?.jsonObject?.get("content")
                    ?.jsonObject?.get("parts")
                    ?.jsonArray?.firstOrNull()
                    ?.jsonObject?.get("text")
                    ?.jsonPrimitive?.content
                
                if (!text.isNullOrEmpty()) {
                    emit(text)
                }
            } catch (e: Exception) {
                // 忽略解析错误
            }
        }
    }.flowOn(Dispatchers.IO)
    
    /**
     * 发送聊天请求（非流式）
     */
    suspend fun chat(
        channel: AIChannel,
        model: String,
        messages: List<ChatMessage>,
        temperature: Float = 0.7f,
        maxTokens: Int = 4096
    ): ChatCompletionResponse {
        // 自动补全 API URL
        val apiUrl = normalizeApiUrl(channel.apiUrl)
        
        val request = ChatCompletionRequest(
            model = model,
            messages = messages,
            temperature = temperature,
            maxTokens = maxTokens,
            stream = false
        )
        
        val requestBody = json.encodeToString(request)
            .toRequestBody("application/json".toMediaType())
        
        val httpRequest = Request.Builder()
            .url(apiUrl)
            .addHeader("Authorization", "Bearer ${channel.apiKey}")
            .addHeader("Content-Type", "application/json")
            .post(requestBody)
            .build()
        
        val response = httpClient.newCall(httpRequest).execute()
        
        if (!response.isSuccessful) {
            throw IOException("API 请求失败: ${response.code}")
        }
        
        val responseBody = response.body?.string() ?: throw IOException("响应体为空")
        return json.decodeFromString(responseBody)
    }
}
