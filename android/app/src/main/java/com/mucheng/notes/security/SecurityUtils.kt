package com.mucheng.notes.security

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.core.content.getSystemService

/**
 * 安全工具类
 * 
 * 提供安全相关的工具方法：
 * - FLAG_SECURE 防截图
 * - 剪贴板安全管理
 * - 敏感数据清理
 */
object SecurityUtils {
    
    private const val CLIPBOARD_CLEAR_DELAY = 30_000L // 30 秒
    
    /**
     * 启用 FLAG_SECURE 防截图
     * 用于密码库等敏感界面
     */
    fun enableSecureMode(activity: Activity) {
        activity.window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
    }
    
    /**
     * 禁用 FLAG_SECURE
     */
    fun disableSecureMode(activity: Activity) {
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }
    
    /**
     * 安全复制到剪贴板
     * 30 秒后自动清除
     * 
     * @param context Context
     * @param label 剪贴板标签
     * @param text 要复制的文本
     * @param isSensitive 是否为敏感数据（密码等）
     */
    fun copyToClipboard(
        context: Context,
        label: String,
        text: String,
        isSensitive: Boolean = false
    ) {
        val clipboardManager = context.getSystemService<ClipboardManager>() ?: return
        
        val clipData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isSensitive) {
            // Android 7.0+ 支持敏感数据标记
            ClipData.newPlainText(label, text).apply {
                description.extras = android.os.PersistableBundle().apply {
                    putBoolean("android.content.extra.IS_SENSITIVE", true)
                }
            }
        } else {
            ClipData.newPlainText(label, text)
        }
        
        clipboardManager.setPrimaryClip(clipData)
        
        // 30 秒后自动清除敏感数据
        if (isSensitive) {
            Handler(Looper.getMainLooper()).postDelayed({
                clearClipboard(context)
            }, CLIPBOARD_CLEAR_DELAY)
        }
    }
    
    /**
     * 清除剪贴板
     */
    fun clearClipboard(context: Context) {
        val clipboardManager = context.getSystemService<ClipboardManager>() ?: return
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            clipboardManager.clearPrimaryClip()
        } else {
            // 旧版本通过设置空内容清除
            clipboardManager.setPrimaryClip(ClipData.newPlainText("", ""))
        }
    }
    
    /**
     * 安全清除字符串
     * 用于清除内存中的敏感数据
     */
    fun secureWipe(data: CharArray) {
        data.fill('\u0000')
    }
    
    /**
     * 安全清除字节数组
     */
    fun secureWipe(data: ByteArray) {
        data.fill(0)
    }
    
    /**
     * 检查是否在安全环境中运行
     * 检测 root、模拟器等
     */
    fun isSecureEnvironment(): Boolean {
        return !isRooted() && !isEmulator()
    }
    
    /**
     * 检测设备是否 root
     */
    private fun isRooted(): Boolean {
        val paths = arrayOf(
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su"
        )
        
        return paths.any { java.io.File(it).exists() }
    }
    
    /**
     * 检测是否在模拟器中运行
     */
    private fun isEmulator(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic")
                || Build.FINGERPRINT.startsWith("unknown")
                || Build.MODEL.contains("google_sdk")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK built for x86")
                || Build.MANUFACTURER.contains("Genymotion")
                || (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
                || "google_sdk" == Build.PRODUCT)
    }
}
