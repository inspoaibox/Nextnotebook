package com.mucheng.notes.presentation

import android.os.Build
import android.os.Bundle
import android.window.OnBackInvokedDispatcher
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 启用边缘到边缘显示
        enableEdgeToEdge()
        WindowCompat.setDecorFitsSystemWindows(window, false)
        
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
                    shouldShowLockScreen = appLockManager.shouldLock(),
                    onUnlock = { appLockManager.recordUnlock() },
                    settingsViewModel = settingsViewModel
                )
            }
        }
    }
    
    override fun onResume() {
        super.onResume()
        // 检查是否需要锁定
        if (appLockManager.shouldLock()) {
            // 显示锁屏
        }
    }
    
    override fun onPause() {
        super.onPause()
        // 记录暂停时间用于超时检测
    }
    
    private fun handleBackPressed() {
        // 自定义返回处理
        finish()
    }
}

@Composable
fun MainApp(
    shouldShowLockScreen: Boolean,
    onUnlock: () -> Unit,
    settingsViewModel: SettingsViewModel
) {
    var isLocked by remember { mutableStateOf(shouldShowLockScreen) }
    
    if (isLocked) {
        LockScreen(onUnlocked = { 
            isLocked = false
            onUnlock() 
        })
    } else {
        val navController = rememberNavController()
        // 直接使用 MainNavigation，传入共享的 SettingsViewModel
        MainNavigation(navController = navController, settingsViewModel = settingsViewModel)
    }
}
