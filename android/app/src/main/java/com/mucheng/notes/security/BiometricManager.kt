package com.mucheng.notes.security

import androidx.fragment.app.FragmentActivity

/**
 * 生物识别状态
 */
enum class BiometricStatus {
    AVAILABLE,
    NO_HARDWARE,
    HARDWARE_UNAVAILABLE,
    NONE_ENROLLED
}

/**
 * 认证结果
 */
sealed class AuthResult {
    object Success : AuthResult()
    data class Error(val code: Int, val message: String) : AuthResult()
    object Cancelled : AuthResult()
    object Fallback : AuthResult() // 用户选择 PIN/图案
}

/**
 * 生物识别管理器接口
 */
interface BiometricManager {
    
    /**
     * 检查生物识别是否可用
     */
    fun canAuthenticate(): BiometricStatus
    
    /**
     * 执行生物识别认证
     * @param activity FragmentActivity 用于显示 BiometricPrompt
     * @param title 提示标题
     * @param subtitle 提示副标题
     * @param negativeButtonText 取消按钮文本
     */
    suspend fun authenticate(
        activity: FragmentActivity,
        title: String,
        subtitle: String,
        negativeButtonText: String
    ): AuthResult
    
    /**
     * 检查是否启用生物识别
     */
    fun isBiometricEnabled(): Boolean
    
    /**
     * 设置是否启用生物识别
     */
    fun setBiometricEnabled(enabled: Boolean)
}
