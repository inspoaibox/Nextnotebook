package com.mucheng.notes.security

import okhttp3.CertificatePinner
import okhttp3.ConnectionSpec
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 网络安全管理器接口
 */
interface NetworkSecurityManager {
    /**
     * 获取安全的 OkHttpClient
     */
    fun getSecureOkHttpClient(): OkHttpClient
    
    /**
     * 获取证书固定配置
     */
    fun getCertificatePinner(): CertificatePinner
}

/**
 * 网络安全管理器实现
 * 提供 Certificate Pinning 和安全的 HTTP 客户端
 */
@Singleton
class NetworkSecurityManagerImpl @Inject constructor() : NetworkSecurityManager {
    
    companion object {
        // OpenAI API 证书指纹 (需要定期更新)
        private const val OPENAI_PIN_1 = "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
        private const val OPENAI_PIN_2 = "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
        
        // Anthropic API 证书指纹
        private const val ANTHROPIC_PIN_1 = "sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC="
        private const val ANTHROPIC_PIN_2 = "sha256/DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD="
    }
    
    private val _certificatePinner: CertificatePinner by lazy {
        CertificatePinner.Builder()
            // OpenAI
            .add("api.openai.com", OPENAI_PIN_1)
            .add("api.openai.com", OPENAI_PIN_2)
            // Anthropic
            .add("api.anthropic.com", ANTHROPIC_PIN_1)
            .add("api.anthropic.com", ANTHROPIC_PIN_2)
            .build()
    }
    
    private val secureClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            // 证书固定
            .certificatePinner(_certificatePinner)
            // 仅使用现代 TLS
            .connectionSpecs(listOf(ConnectionSpec.MODERN_TLS))
            // 超时设置
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            // 禁用重定向（安全考虑）
            .followRedirects(false)
            .followSslRedirects(false)
            .build()
    }
    
    override fun getSecureOkHttpClient(): OkHttpClient = secureClient
    
    override fun getCertificatePinner(): CertificatePinner = _certificatePinner
    
    /**
     * 创建自定义证书固定的客户端
     * 用于用户自定义的 API 端点
     */
    fun createClientWithCustomPins(pins: Map<String, List<String>>): OkHttpClient {
        val pinnerBuilder = CertificatePinner.Builder()
        
        for ((host, pinList) in pins) {
            for (pin in pinList) {
                pinnerBuilder.add(host, pin)
            }
        }
        
        return OkHttpClient.Builder()
            .certificatePinner(pinnerBuilder.build())
            .connectionSpecs(listOf(ConnectionSpec.MODERN_TLS))
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }
    
    /**
     * 创建不带证书固定的客户端（用于用户自定义服务器）
     * 注意：仅在用户明确选择时使用
     */
    fun createClientWithoutPinning(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectionSpecs(listOf(ConnectionSpec.MODERN_TLS, ConnectionSpec.COMPATIBLE_TLS))
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }
}
