package com.mucheng.notes.presentation.viewmodel

import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mucheng.notes.security.AppLockManager
import com.mucheng.notes.security.AuthResult
import com.mucheng.notes.security.BiometricManager
import com.mucheng.notes.security.BiometricStatus
import com.mucheng.notes.security.LockType
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * 锁屏界面状态
 */
data class LockScreenUiState(
    val lockType: LockType = LockType.PIN,
    val enteredPin: String = "",
    val error: String? = null,
    val isUnlocked: Boolean = false,
    val biometricAvailable: Boolean = false,
    val attempts: Int = 0,
    val pinLength: Int = 4
)

/**
 * 锁屏 ViewModel
 */
@HiltViewModel
class LockScreenViewModel @Inject constructor(
    private val appLockManager: AppLockManager,
    private val biometricManager: BiometricManager
) : ViewModel() {
    
    companion object {
        private const val MAX_ATTEMPTS = 5
        private const val MIN_PIN_LENGTH = 4
        private const val MAX_PIN_LENGTH = 6
    }
    
    private val _uiState = MutableStateFlow(LockScreenUiState())
    val uiState: StateFlow<LockScreenUiState> = _uiState.asStateFlow()
    
    private var activity: FragmentActivity? = null
    private var pinLength: Int = MIN_PIN_LENGTH
    
    init {
        initializeLockScreen()
    }
    
    /**
     * 设置 Activity（用于生物识别）
     */
    fun setActivity(activity: FragmentActivity) {
        this.activity = activity
        // 如果启用了生物识别且可用，自动触发
        val biometricEnabled = biometricManager.isBiometricEnabled()
        val biometricAvailable = biometricManager.canAuthenticate() == BiometricStatus.AVAILABLE
        if (biometricEnabled && biometricAvailable) {
            // 延迟一点触发，确保 UI 已经准备好
            viewModelScope.launch {
                kotlinx.coroutines.delay(300)
                authenticateWithBiometric()
            }
        }
    }
    
    /**
     * 初始化锁屏
     */
    private fun initializeLockScreen() {
        val lockType = appLockManager.getLockType()
        val biometricAvailable = biometricManager.canAuthenticate() == BiometricStatus.AVAILABLE
        val biometricEnabled = biometricManager.isBiometricEnabled()
        
        // 获取存储的 PIN 长度
        pinLength = appLockManager.getPinLength()
        
        _uiState.update {
            it.copy(
                lockType = if (biometricEnabled && biometricAvailable) LockType.BIOMETRIC else lockType,
                biometricAvailable = biometricAvailable && biometricEnabled,
                pinLength = pinLength
            )
        }
    }
    
    /**
     * PIN 码输入变化
     */
    fun onPinChange(pin: String) {
        _uiState.update { it.copy(enteredPin = pin, error = null) }
        
        // 当输入达到存储的 PIN 长度时验证
        if (pin.length == pinLength) {
            verifyPin(pin)
        }
    }
    
    /**
     * 验证 PIN 码
     */
    private fun verifyPin(pin: String) {
        viewModelScope.launch {
            val isValid = appLockManager.verifyPin(pin)
            
            if (isValid) {
                appLockManager.recordUnlock()
                _uiState.update { it.copy(isUnlocked = true) }
            } else {
                val newAttempts = _uiState.value.attempts + 1
                _uiState.update {
                    it.copy(
                        enteredPin = "",
                        error = if (newAttempts >= MAX_ATTEMPTS) {
                            "尝试次数过多，请稍后再试"
                        } else {
                            "PIN 码错误，还剩 ${MAX_ATTEMPTS - newAttempts} 次机会"
                        },
                        attempts = newAttempts
                    )
                }
            }
        }
    }
    
    /**
     * 图案输入完成
     */
    fun onPatternComplete(pattern: List<Int>) {
        viewModelScope.launch {
            val isValid = appLockManager.verifyPattern(pattern)
            
            if (isValid) {
                appLockManager.recordUnlock()
                _uiState.update { it.copy(isUnlocked = true) }
            } else {
                val newAttempts = _uiState.value.attempts + 1
                _uiState.update {
                    it.copy(
                        error = if (newAttempts >= MAX_ATTEMPTS) {
                            "尝试次数过多，请稍后再试"
                        } else {
                            "图案错误，还剩 ${MAX_ATTEMPTS - newAttempts} 次机会"
                        },
                        attempts = newAttempts
                    )
                }
            }
        }
    }
    
    /**
     * 使用生物识别认证
     */
    fun authenticateWithBiometric() {
        val currentActivity = activity ?: return
        
        viewModelScope.launch {
            val result = biometricManager.authenticate(
                activity = currentActivity,
                title = "身份验证",
                subtitle = "使用指纹或面部解锁",
                negativeButtonText = "使用密码"
            )
            
            when (result) {
                is AuthResult.Success -> {
                    appLockManager.recordUnlock()
                    _uiState.update { it.copy(isUnlocked = true) }
                }
                is AuthResult.Error -> {
                    _uiState.update { it.copy(error = result.message) }
                }
                is AuthResult.Cancelled -> {
                    // 用户取消，不做处理
                }
                is AuthResult.Fallback -> {
                    // 用户选择使用密码
                    switchToPinMode()
                }
            }
        }
    }
    
    /**
     * 切换到 PIN 模式
     */
    fun switchToPinMode() {
        _uiState.update {
            it.copy(
                lockType = LockType.PIN,
                enteredPin = "",
                error = null
            )
        }
    }
    
    /**
     * 清除错误
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
