package com.mucheng.notes.presentation

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.window.OnBackInvokedDispatcher
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.core.view.WindowCompat
import androidx.navigation.compose.rememberNavController
import com.mucheng.notes.presentation.navigation.MainNavigation
import com.mucheng.notes.presentation.screens.lock.LockScreen
import com.mucheng.notes.presentation.theme.MuchengNotesTheme
import com.mucheng.notes.presentation.viewmodel.SettingsViewModel
import com.mucheng.notes.security.AppLockManager
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * 主 Activity
 * 继承 AppCompatActivity (FragmentActivity 子类) 以支持生物识别
 */
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {
    
    @Inject
    lateinit var appLockManager: AppLockManager
    
    // Activity 级别的 SettingsViewModel，所有子组件共享
    private val settingsViewModel: SettingsViewModel by viewModels()
    private val isLockedState = mutableStateOf(false)
    private val lockSessionState = mutableStateOf(0)
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 启用边缘到边缘显示
        enableEdgeToEdge()
        WindowCompat.setDecorFitsSystemWindows(window, false)
        refreshLockState()
        
        // 启用预测性返回手势 (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT
            ) {
                // 处理返回逻辑
                handleBackPressed()
            }
        }
        
        setContent {
            MuchengNotesTheme {
                MainApp(
                    isLocked = isLockedState.value,
                    lockSessionId = lockSessionState.value,
                    onUnlock = {
                        appLockManager.recordUnlock()
                        isLockedState.value = false
                        updateSecureWindowFlag()
                    },
                    settingsViewModel = settingsViewModel
                )
            }
        }
    }
    
    override fun onStart() {
        super.onStart()
        refreshLockState()
    }

    override fun onResume() {
        super.onResume()
        refreshLockState()
    }
    
    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) {
            appLockManager.recordBackground()
        }
    }
    
    private fun handleBackPressed() {
        if (isLockedState.value) {
            return
        }
        // 自定义返回处理
        finish()
    }

    private fun refreshLockState() {
        val shouldLock = appLockManager.shouldLock()
        if (shouldLock && !isLockedState.value) {
            lockSessionState.value = lockSessionState.value + 1
            isLockedState.value = true
        } else if (!isLockedState.value) {
            isLockedState.value = false
        }
        updateSecureWindowFlag()
    }

    private fun updateSecureWindowFlag() {
        val protectedByAppLock = appLockManager.isLockEnabled() && appLockManager.hasCredentialConfigured()
        if (protectedByAppLock || isLockedState.value) {
            window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            )
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}

@Composable
fun MainApp(
    isLocked: Boolean,
    lockSessionId: Int,
    onUnlock: () -> Unit,
    settingsViewModel: SettingsViewModel
) {
    if (isLocked) {
        LockScreen(
            lockSessionId = lockSessionId,
            onUnlocked = {
                onUnlock()
            }
        )
    } else {
        val navController = rememberNavController()
        // 直接使用 MainNavigation，传入共享的 SettingsViewModel
        MainNavigation(navController = navController, settingsViewModel = settingsViewModel)
    }
}
