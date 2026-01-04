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
 * 支持 OpenAI、Anthropic 和自定义 API
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
     * 发送聊天请求（流式响应）
     */
    fun streamChat(
        channel: AIChannel,
        model: String,
        messages: List<ChatMessage>,
        temperature: Float = 0.7f,
        maxTokens: Int = 4096
    ): Flow<String> = flow {
        val request = ChatCompletionRequest(
            model = model,
            messages = messages,
            temperature = temperature,
            maxTokens = maxTokens,
            stream = true
        )
        
        val requestBody = json.encodeToString(request)
            .toRequestBody("application/json".toMediaType())
        
        val httpRequest = Request.Builder()
            .url(channel.apiUrl)
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
     * 发送聊天请求（非流式）
     */
    suspend fun chat(
        channel: AIChannel,
        model: String,
        messages: List<ChatMessage>,
        temperature: Float = 0.7f,
        maxTokens: Int = 4096
    ): ChatCompletionResponse {
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
            .url(channel.apiUrl)
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
