package com.mucheng.notes.security

/**
 * 锁定类型
 */
enum class LockType {
    NONE,
    PIN,
    PATTERN,
    BIOMETRIC
}

/**
 * 应用锁管理器接口
 */
interface AppLockManager {
    
    /**
     * 检查是否启用锁定
     */
    fun isLockEnabled(): Boolean
    
    /**
     * 设置是否启用锁定
     */
    fun setLockEnabled(enabled: Boolean)
    
    /**
     * 获取锁定类型
     */
    fun getLockType(): LockType
    
    /**
     * 设置锁定类型
     */
    fun setLockType(type: LockType)
    
    /**
     * 验证 PIN
     */
    suspend fun verifyPin(pin: String): Boolean
    
    /**
     * 验证图案
     */
    suspend fun verifyPattern(pattern: List<Int>): Boolean
    
    /**
     * 设置 PIN
     */
    fun setPin(pin: String)
    
    /**
     * 获取 PIN 长度
     */
    fun getPinLength(): Int
    
    /**
     * 设置图案
     */
    fun setPattern(pattern: List<Int>)
    
    /**
     * 检查是否应该锁定（基于超时）
     */
    fun shouldLock(): Boolean
    
    /**
     * 记录解锁时间
     */
    fun recordUnlock()
    
    /**
     * 获取锁定超时时间（毫秒）
     */
    fun getLockTimeout(): Long
    
    /**
     * 设置锁定超时时间（毫秒）
     */
    fun setLockTimeout(timeout: Long)
}
