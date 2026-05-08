package com.mucheng.notes.presentation.viewmodel

import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mucheng.notes.data.sync.SyncEngine
import com.mucheng.notes.domain.model.SyncConfig
import com.mucheng.notes.domain.model.SyncModules
import com.mucheng.notes.domain.model.SyncStatus
import com.mucheng.notes.security.AppLockManager
import com.mucheng.notes.security.AuthResult
import com.mucheng.notes.security.BiometricManager
import com.mucheng.notes.security.BiometricManagerImpl
import com.mucheng.notes.security.BiometricStatus
import com.mucheng.notes.security.LockType
import com.mucheng.notes.security.SecureSyncStorage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * 锁定超时选项
 */
enum class LockTimeout(val millis: Long, val label: String) {
    IMMEDIATELY(0, "立即"),
    ONE_MINUTE(60_000, "1 分钟"),
    FIVE_MINUTES(5 * 60_000, "5 分钟"),
    FIFTEEN_MINUTES(15 * 60_000, "15 分钟"),
    THIRTY_MINUTES(30 * 60_000, "30 分钟"),
    ONE_HOUR(60 * 60_000, "1 小时")
}

/**
 * 同步间隔选项
 */
enum class SyncInterval(val minutes: Int, val label: String) {
    MANUAL(0, "手动"),
    ONE_MINUTE(1, "1 分钟"),
    FIVE_MINUTES(5, "5 分钟"),
    FIFTEEN_MINUTES(15, "15 分钟"),
    THIRTY_MINUTES(30, "30 分钟"),
    ONE_HOUR(60, "1 小时")
}

/**
 * 设置 UI 状态
 */
data class SettingsUiState(
    val isLoading: Boolean = true, // 初始为 true，等待加载完成
    val isInitialized: Boolean = false, // 标记是否已完成初始化
    val error: String? = null,
    val message: String? = null,
    
    // 功能模块开关
    val bookmarksEnabled: Boolean = true,
    val todosEnabled: Boolean = true,
    val vaultEnabled: Boolean = true,
    val aiEnabled: Boolean = true,
    val transferEnabled: Boolean = true,
    
    // 同步设置
    val syncEnabled: Boolean = false,
    val syncType: String = "webdav", // "webdav" | "server"
    val webdavUrl: String = "",
    val username: String = "",
    val password: String = "",
    val syncPath: String = "/mucheng-notes",
    val apiKey: String = "", // 用于 server 类型（已废弃）
    val syncInterval: SyncInterval = SyncInterval.FIVE_MINUTES,
    val syncModules: SyncModules = SyncModules(),
    val lastSyncTime: Long? = null,
    val syncStatus: SyncStatus = SyncStatus.IDLE,
    val testingConnection: Boolean = false,
    
    // 自建服务器认证状态
    val serverUsername: String = "",
    val serverPassword: String = "",
    val serverSyncKey: String = "",
    val serverLoggedIn: Boolean = false,
    val serverLoginUser: String? = null,
    val serverLoggingIn: Boolean = false,
    val serverRegistering: Boolean = false,
    val serverToken: String? = null,
    val serverRefreshToken: String? = null,
    val serverTokenExpires: Long? = null,
    
    // 安全设置 - 应用锁
    val appLockEnabled: Boolean = false,
    val biometricEnabled: Boolean = false,
    val biometricAvailable: Boolean = false,
    val lockType: LockType = LockType.NONE,
    val lockTimeout: LockTimeout = LockTimeout.FIVE_MINUTES,
    val showPinDialog: Boolean = false,
    
    // 安全设置 - 密码库锁定（独立于应用锁）
    val vaultLockEnabled: Boolean = false,
    val vaultPasswordSet: Boolean = false,
    val vaultBiometricEnabled: Boolean = false,
    val showVaultPasswordDialog: Boolean = false,
    val vaultPasswordDialogMode: String = "set", // "set" | "change" | "verify"
    
    // 主题设置
    val followSystemTheme: Boolean = true,
    val darkMode: Boolean = false,
    
    // AI 设置
    val aiDefaultChannel: String = "",
    val aiDefaultModel: String = "",
    val aiChannelsJson: String = "" // AI 渠道配置 JSON
)

/**
 * 设置视图模型
 */
@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val appLockManager: AppLockManager,
    private val biometricManager: BiometricManager,
    private val syncEngine: SyncEngine,
    private val itemRepository: com.mucheng.notes.domain.repository.ItemRepository
) : ViewModel() {
    
    companion object {
        private const val PREFS_NAME = "app_settings"
        private const val KEY_BOOKMARKS_ENABLED = "bookmarks_enabled"
        private const val KEY_TODOS_ENABLED = "todos_enabled"
        private const val KEY_VAULT_ENABLED = "vault_enabled"
        private const val KEY_AI_ENABLED = "ai_enabled"
        private const val KEY_TRANSFER_ENABLED = "transfer_enabled"
        private const val KEY_SYNC_ENABLED = "sync_enabled"
        private const val KEY_SYNC_TYPE = "sync_type"
        private const val KEY_WEBDAV_URL = "webdav_url"
        private const val KEY_USERNAME = "username"
        private const val KEY_PASSWORD = "password"
        private const val KEY_SYNC_PATH = "sync_path"
        private const val KEY_API_KEY = "api_key"
        private const val KEY_SYNC_INTERVAL = "sync_interval"
        private const val KEY_LAST_SYNC_TIME = "last_sync_time"
        private const val KEY_SYNC_NOTES = "sync_notes"
        private const val KEY_SYNC_BOOKMARKS = "sync_bookmarks"
        private const val KEY_SYNC_VAULT = "sync_vault"
        private const val KEY_SYNC_DIAGRAMS = "sync_diagrams"
        private const val KEY_SYNC_TODOS = "sync_todos"
        private const val KEY_SYNC_AI = "sync_ai"
        private const val KEY_LOCK_TIMEOUT = "lock_timeout"
        private const val KEY_FOLLOW_SYSTEM_THEME = "follow_system_theme"
        private const val KEY_DARK_MODE = "dark_mode"
        private const val KEY_AI_DEFAULT_CHANNEL = "ai_default_channel"
        private const val KEY_AI_DEFAULT_MODEL = "ai_default_model"
        private const val KEY_AI_CHANNELS_JSON = "ai_channels_json"
        private const val KEY_VAULT_PASSWORD = "vault_password"
        private const val KEY_VAULT_LOCK_ENABLED = "vault_lock_enabled"
        private const val KEY_VAULT_BIOMETRIC_ENABLED = "vault_biometric_enabled"
        
        // 自建服务器认证
        private const val KEY_SERVER_USERNAME = "server_username"
        private const val KEY_SERVER_PASSWORD = "server_password"
        private const val KEY_SERVER_SYNC_KEY = "server_sync_key"
        private const val KEY_SERVER_TOKEN = "server_token"
        private const val KEY_SERVER_REFRESH_TOKEN = "server_refresh_token"
        private const val KEY_SERVER_TOKEN_EXPIRES = "server_token_expires"
    }
    
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // 监听 SharedPreferences 变化，当 ai_channels_json 被外部（如同步）写入时自动更新 UI 状态
    private val prefsListener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        if (key == KEY_AI_CHANNELS_JSON || key == KEY_AI_DEFAULT_CHANNEL || key == KEY_AI_DEFAULT_MODEL) {
            reloadAiConfigFromPrefs()
        }
    }

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        loadSettings()
        prefs.registerOnSharedPreferenceChangeListener(prefsListener)
    }

    override fun onCleared() {
        super.onCleared()
        prefs.unregisterOnSharedPreferenceChangeListener(prefsListener)
    }
    
    private fun loadSettings() {
        val syncIntervalMinutes = prefs.getInt(KEY_SYNC_INTERVAL, 5)
        val syncInterval = SyncInterval.entries.find { it.minutes == syncIntervalMinutes } ?: SyncInterval.FIVE_MINUTES
        
        val lockTimeoutMillis = appLockManager.getLockTimeout()
        val lockTimeout = LockTimeout.entries.find { it.millis == lockTimeoutMillis } ?: LockTimeout.FIVE_MINUTES
        
        // 调试日志
        val loadedSyncEnabled = prefs.getBoolean(KEY_SYNC_ENABLED, false)
        android.util.Log.d("SettingsViewModel", "loadSettings: syncEnabled=$loadedSyncEnabled")
        
        _uiState.update { state ->
            state.copy(
                // 标记加载完成
                isLoading = false,
                isInitialized = true,
                
                // 功能模块
                bookmarksEnabled = prefs.getBoolean(KEY_BOOKMARKS_ENABLED, true),
                todosEnabled = prefs.getBoolean(KEY_TODOS_ENABLED, true),
                vaultEnabled = prefs.getBoolean(KEY_VAULT_ENABLED, true),
                aiEnabled = prefs.getBoolean(KEY_AI_ENABLED, true),
                transferEnabled = prefs.getBoolean(KEY_TRANSFER_ENABLED, true),
                
                // 同步设置
                syncEnabled = prefs.getBoolean(KEY_SYNC_ENABLED, false),
                syncType = prefs.getString(KEY_SYNC_TYPE, "webdav") ?: "webdav",
                webdavUrl = prefs.getString(KEY_WEBDAV_URL, "") ?: "",
                username = prefs.getString(KEY_USERNAME, "") ?: "",
                password = SecureSyncStorage.getString(context, KEY_PASSWORD) ?: "",
                syncPath = prefs.getString(KEY_SYNC_PATH, "/mucheng-notes") ?: "/mucheng-notes",
                apiKey = prefs.getString(KEY_API_KEY, "") ?: "",
                syncInterval = syncInterval,
                lastSyncTime = prefs.getLong(KEY_LAST_SYNC_TIME, 0).takeIf { it > 0 },
                syncModules = SyncModules(
                    notes = prefs.getBoolean(KEY_SYNC_NOTES, true),
                    bookmarks = prefs.getBoolean(KEY_SYNC_BOOKMARKS, true),
                    vault = prefs.getBoolean(KEY_SYNC_VAULT, true),
                    diagrams = prefs.getBoolean(KEY_SYNC_DIAGRAMS, true),
                    todos = prefs.getBoolean(KEY_SYNC_TODOS, true),
                    ai = prefs.getBoolean(KEY_SYNC_AI, true)
                ),
                
                // 安全设置 - 应用锁
                appLockEnabled = appLockManager.isLockEnabled(),
                biometricEnabled = biometricManager.isBiometricEnabled(),
                biometricAvailable = biometricManager.canAuthenticate() == BiometricStatus.AVAILABLE,
                lockType = appLockManager.getLockType(),
                lockTimeout = lockTimeout,
                
                // 安全设置 - 密码库锁定
                vaultLockEnabled = prefs.getBoolean(KEY_VAULT_LOCK_ENABLED, false),
                vaultPasswordSet = prefs.getString(KEY_VAULT_PASSWORD, null) != null,
                vaultBiometricEnabled = prefs.getBoolean(KEY_VAULT_BIOMETRIC_ENABLED, false),
                
                // 主题设置
                followSystemTheme = prefs.getBoolean(KEY_FOLLOW_SYSTEM_THEME, true),
                darkMode = prefs.getBoolean(KEY_DARK_MODE, false),
                
                // AI 设置
                aiDefaultChannel = prefs.getString(KEY_AI_DEFAULT_CHANNEL, "") ?: "",
                aiDefaultModel = prefs.getString(KEY_AI_DEFAULT_MODEL, "") ?: "",
                aiChannelsJson = prefs.getString(KEY_AI_CHANNELS_JSON, "") ?: "",
                
                // 自建服务器认证
                serverUsername = prefs.getString(KEY_SERVER_USERNAME, "") ?: "",
                serverPassword = SecureSyncStorage.getString(context, KEY_SERVER_PASSWORD) ?: "",
                serverSyncKey = SecureSyncStorage.getString(context, KEY_SERVER_SYNC_KEY) ?: "",
                serverToken = SecureSyncStorage.getString(context, KEY_SERVER_TOKEN),
                serverRefreshToken = SecureSyncStorage.getString(context, KEY_SERVER_REFRESH_TOKEN),
                serverTokenExpires = SecureSyncStorage.getLong(context, KEY_SERVER_TOKEN_EXPIRES)?.takeIf { it > 0 },
                serverLoggedIn = SecureSyncStorage.getString(context, KEY_SERVER_TOKEN) != null,
                serverLoginUser = prefs.getString(KEY_SERVER_USERNAME, null)
            )
        }
    }
    
    // 功能模块开关
    fun setBookmarksEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_BOOKMARKS_ENABLED, enabled).apply()
        _uiState.update { it.copy(bookmarksEnabled = enabled) }
    }
    
    fun setTodosEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_TODOS_ENABLED, enabled).apply()
        _uiState.update { it.copy(todosEnabled = enabled) }
    }
    
    fun setVaultEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_VAULT_ENABLED, enabled).apply()
        _uiState.update { it.copy(vaultEnabled = enabled) }
    }
    
    fun setAiEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_AI_ENABLED, enabled).apply()
        _uiState.update { it.copy(aiEnabled = enabled) }
    }
    
    fun setTransferEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_TRANSFER_ENABLED, enabled).apply()
        _uiState.update { it.copy(transferEnabled = enabled) }
    }
    
    // 同步设置
    fun setSyncEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_SYNC_ENABLED, enabled).apply()
        _uiState.update { it.copy(syncEnabled = enabled) }
    }
    
    fun setSyncType(type: String) {
        prefs.edit().putString(KEY_SYNC_TYPE, type).apply()
        _uiState.update { it.copy(syncType = type) }
    }
    
    fun setWebdavUrl(url: String) {
        prefs.edit().putString(KEY_WEBDAV_URL, url).apply()
        _uiState.update { it.copy(webdavUrl = url) }
    }
    
    fun setUsername(username: String) {
        prefs.edit().putString(KEY_USERNAME, username).apply()
        _uiState.update { it.copy(username = username) }
    }
    
    fun setPassword(password: String) {
        SecureSyncStorage.putString(context, KEY_PASSWORD, password)
        _uiState.update { it.copy(password = password) }
    }
    
    fun setSyncPath(path: String) {
        prefs.edit().putString(KEY_SYNC_PATH, path).apply()
        _uiState.update { it.copy(syncPath = path) }
    }
    
    fun setApiKey(apiKey: String) {
        prefs.edit().putString(KEY_API_KEY, apiKey).apply()
        _uiState.update { it.copy(apiKey = apiKey) }
    }
    
    // 自建服务器认证方法
    fun setServerUsername(username: String) {
        prefs.edit().putString(KEY_SERVER_USERNAME, username).apply()
        _uiState.update { it.copy(serverUsername = username) }
    }
    
    fun setServerPassword(password: String) {
        SecureSyncStorage.putString(context, KEY_SERVER_PASSWORD, password)
        _uiState.update { it.copy(serverPassword = password) }
    }
    
    fun setServerSyncKey(syncKey: String) {
        SecureSyncStorage.putString(context, KEY_SERVER_SYNC_KEY, syncKey)
        _uiState.update { it.copy(serverSyncKey = syncKey) }
    }
    
    /**
     * 服务器登录
     */
    fun serverLogin() {
        viewModelScope.launch {
            val url = _uiState.value.webdavUrl
            val username = _uiState.value.serverUsername
            val password = _uiState.value.serverPassword
            val syncKey = _uiState.value.serverSyncKey
            
            if (url.isBlank()) {
                _uiState.update { it.copy(message = "请输入服务器地址") }
                return@launch
            }
            if (username.isBlank() || password.isBlank() || syncKey.isBlank()) {
                _uiState.update { it.copy(message = "请填写用户名、密码和同步密钥") }
                return@launch
            }
            
            _uiState.update { it.copy(serverLoggingIn = true) }
            
            val result = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                val adapter = com.mucheng.notes.data.remote.ServerAdapterImpl()
                adapter.initialize(com.mucheng.notes.domain.model.SyncConfig(url = url))
                adapter.login(username, password, syncKey)
            }
            
            if (result.success && result.accessToken != null) {
                prefs.edit()
                    .putString(KEY_SERVER_USERNAME, username)
                    .apply()

                val expiresAt = System.currentTimeMillis() + (result.expiresIn ?: 3600) * 1000L
                SecureSyncStorage.putString(context, KEY_SERVER_TOKEN, result.accessToken)
                SecureSyncStorage.putString(context, KEY_SERVER_REFRESH_TOKEN, result.refreshToken)
                SecureSyncStorage.putLong(context, KEY_SERVER_TOKEN_EXPIRES, expiresAt)
                SecureSyncStorage.putString(context, KEY_SERVER_PASSWORD, password)
                SecureSyncStorage.putString(context, KEY_SERVER_SYNC_KEY, syncKey)
                
                _uiState.update { it.copy(
                    serverLoggingIn = false,
                    serverLoggedIn = true,
                    serverLoginUser = result.user?.username ?: username,
                    serverToken = result.accessToken,
                    serverRefreshToken = result.refreshToken,
                    serverTokenExpires = expiresAt,
                    message = "登录成功"
                ) }
            } else {
                _uiState.update { it.copy(
                    serverLoggingIn = false,
                    message = result.error?.message ?: result.message ?: "登录失败"
                ) }
            }
        }
    }
    
    /**
     * 服务器注册
     */
    fun serverRegister() {
        viewModelScope.launch {
            val url = _uiState.value.webdavUrl
            val username = _uiState.value.serverUsername
            val password = _uiState.value.serverPassword
            val syncKey = _uiState.value.serverSyncKey
            
            if (url.isBlank()) {
                _uiState.update { it.copy(message = "请输入服务器地址") }
                return@launch
            }
            if (username.isBlank() || password.isBlank() || syncKey.isBlank()) {
                _uiState.update { it.copy(message = "请填写用户名、密码和同步密钥") }
                return@launch
            }
            
            _uiState.update { it.copy(serverRegistering = true) }
            
            val result = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                val adapter = com.mucheng.notes.data.remote.ServerAdapterImpl()
                adapter.initialize(com.mucheng.notes.domain.model.SyncConfig(url = url))
                adapter.register(username, password, syncKey)
            }
            
            if (result.success) {
                _uiState.update { it.copy(
                    serverRegistering = false,
                    message = "注册成功，请登录"
                ) }
            } else {
                _uiState.update { it.copy(
                    serverRegistering = false,
                    message = result.error?.message ?: result.message ?: "注册失败"
                ) }
            }
        }
    }
    
    /**
     * 服务器登出
     */
    fun serverLogout() {
        viewModelScope.launch {
            val url = _uiState.value.webdavUrl
            val token = _uiState.value.serverToken
            
            if (token != null) {
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    val adapter = com.mucheng.notes.data.remote.ServerAdapterImpl()
                    adapter.initialize(com.mucheng.notes.domain.model.SyncConfig(
                        url = url,
                        serverToken = token
                    ))
                    adapter.logout()
                }
            }
            
            // 清除本地 token 和保存的凭据
            prefs.edit()
                .remove(KEY_SERVER_USERNAME)
                .apply()
            SecureSyncStorage.remove(
                context,
                KEY_SERVER_TOKEN,
                KEY_SERVER_REFRESH_TOKEN,
                KEY_SERVER_TOKEN_EXPIRES,
                KEY_SERVER_PASSWORD,
                KEY_SERVER_SYNC_KEY
            )
            
            _uiState.update { it.copy(
                serverLoggedIn = false,
                serverLoginUser = null,
                serverToken = null,
                serverRefreshToken = null,
                serverTokenExpires = null,
                message = "已登出"
            ) }
        }
    }
    
    fun setSyncInterval(interval: SyncInterval) {
        prefs.edit().putInt(KEY_SYNC_INTERVAL, interval.minutes).apply()
        _uiState.update { it.copy(syncInterval = interval) }
    }
    
    fun setSyncModule(module: String, enabled: Boolean) {
        val key = when (module) {
            "notes" -> KEY_SYNC_NOTES
            "bookmarks" -> KEY_SYNC_BOOKMARKS
            "vault" -> KEY_SYNC_VAULT
            "diagrams" -> KEY_SYNC_DIAGRAMS
            "todos" -> KEY_SYNC_TODOS
            "ai" -> KEY_SYNC_AI
            else -> return
        }
        prefs.edit().putBoolean(key, enabled).apply()
        _uiState.update { state ->
            val modules = state.syncModules
            val newModules = when (module) {
                "notes" -> modules.copy(notes = enabled)
                "bookmarks" -> modules.copy(bookmarks = enabled)
                "vault" -> modules.copy(vault = enabled)
                "diagrams" -> modules.copy(diagrams = enabled)
                "todos" -> modules.copy(todos = enabled)
                "ai" -> modules.copy(ai = enabled)
                else -> modules
            }
            state.copy(syncModules = newModules)
        }
    }
    
    /**
     * 测试连接
     * 使用 Sardine 库（与实际同步相同）来测试 WebDAV 连接
     */
    fun testConnection() {
        viewModelScope.launch {
            val url = _uiState.value.webdavUrl
            
            // 验证 URL 是否有效
            if (url.isBlank()) {
                _uiState.update { it.copy(message = "请输入服务器地址") }
                return@launch
            }
            
            // 验证 URL 格式
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                _uiState.update { it.copy(message = "服务器地址必须以 http:// 或 https:// 开头") }
                return@launch
            }
            
            _uiState.update { it.copy(testingConnection = true, message = null) }
            
            // 在 IO 线程执行网络请求
            val result = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                if (_uiState.value.syncType == "webdav") {
                    // 使用 Sardine 库测试 WebDAV 连接（与实际同步使用相同的库）
                    testWebDAVConnectionWithSardine()
                } else {
                    // Server 类型使用 HTTP 测试
                    testServerConnection()
                }
            }
            
            _uiState.update { it.copy(testingConnection = false, message = result) }
        }
    }
    
    /**
     * 使用 Sardine 库测试 WebDAV 连接
     */
    private fun testWebDAVConnectionWithSardine(): String {
        val url = _uiState.value.webdavUrl
        val syncPath = _uiState.value.syncPath
        val username = _uiState.value.username
        val password = _uiState.value.password
        
        return try {
            // 创建 Sardine 客户端
            val sardine = com.thegrizzlylabs.sardineandroid.impl.OkHttpSardine()
            if (username.isNotBlank() && password.isNotBlank()) {
                sardine.setCredentials(username, password)
            }
            
            // 规范化 URL（移除末尾斜杠）
            val baseUrl = if (url.endsWith("/")) url.dropLast(1) else url
            val fullPath = "$baseUrl$syncPath"
            
            android.util.Log.d("SettingsViewModel", "Testing WebDAV connection to: $fullPath")
            android.util.Log.d("SettingsViewModel", "Username: $username, Password length: ${password.length}")
            
            // 第一步：尝试访问根 URL 验证认证
            try {
                val rootExists = sardine.exists(baseUrl)
                android.util.Log.d("SettingsViewModel", "Root URL accessible: $rootExists")
            } catch (e: com.thegrizzlylabs.sardineandroid.impl.SardineException) {
                android.util.Log.e("SettingsViewModel", "Root access failed: ${e.statusCode} - ${e.message}")
                return when (e.statusCode) {
                    401 -> "连接失败: 认证失败，请检查账号密码"
                    403 -> "连接失败: 访问被拒绝，请检查账号密码"
                    else -> "连接失败: HTTP ${e.statusCode}"
                }
            } catch (e: Exception) {
                android.util.Log.e("SettingsViewModel", "Root access error: ${e.javaClass.simpleName} - ${e.message}")
                // 继续尝试完整路径
            }
            
            // 第二步：检查同步目录是否存在
            try {
                val pathExists = sardine.exists(fullPath)
                android.util.Log.d("SettingsViewModel", "Sync path exists: $pathExists")
                
                if (pathExists) {
                    "连接成功"
                } else {
                    // 目录不存在，尝试创建
                    try {
                        sardine.createDirectory(fullPath)
                        android.util.Log.d("SettingsViewModel", "Created sync directory")
                        "连接成功（已创建同步目录）"
                    } catch (createError: Exception) {
                        android.util.Log.w("SettingsViewModel", "Failed to create directory: ${createError.message}")
                        // 创建失败可能是因为父目录不存在，但认证是成功的
                        "连接成功（同步目录将在首次同步时自动创建）"
                    }
                }
            } catch (e: com.thegrizzlylabs.sardineandroid.impl.SardineException) {
                android.util.Log.e("SettingsViewModel", "Path check failed: ${e.statusCode} - ${e.message}")
                when (e.statusCode) {
                    401 -> "连接失败: 认证失败，请检查账号密码"
                    403 -> "连接失败: 访问被拒绝，请检查账号密码"
                    404 -> "连接成功（同步目录将在首次同步时自动创建）"
                    else -> "连接失败: HTTP ${e.statusCode}"
                }
            }
        } catch (e: java.net.UnknownHostException) {
            android.util.Log.e("SettingsViewModel", "Unknown host: ${e.message}")
            "无法解析主机名，请检查网络连接"
        } catch (e: java.net.ConnectException) {
            android.util.Log.e("SettingsViewModel", "Connection refused: ${e.message}")
            "连接被拒绝，请检查服务器地址和端口"
        } catch (e: java.net.SocketTimeoutException) {
            android.util.Log.e("SettingsViewModel", "Timeout: ${e.message}")
            "连接超时，请检查网络连接"
        } catch (e: javax.net.ssl.SSLException) {
            android.util.Log.e("SettingsViewModel", "SSL error: ${e.message}")
            "SSL/TLS 错误: ${e.message ?: "证书验证失败"}"
        } catch (e: java.io.IOException) {
            android.util.Log.e("SettingsViewModel", "IO error: ${e.message}")
            "网络错误: ${e.message ?: "IO 异常"}"
        } catch (e: Exception) {
            android.util.Log.e("SettingsViewModel", "Unexpected error: ${e.javaClass.simpleName} - ${e.message}")
            e.printStackTrace()
            "连接失败: ${e.javaClass.simpleName} - ${e.message ?: "未知错误"}"
        }
    }
    
    /**
     * 测试 Server 类型连接
     */
    private fun testServerConnection(): String {
        val url = _uiState.value.webdavUrl
        
        return try {
            // 测试 /api/health 端点
            val healthUrl = if (url.endsWith("/")) {
                url.dropLast(1) + "/api/health"
            } else {
                url + "/api/health"
            }
            
            val testUrl = java.net.URL(healthUrl)
            val connection = testUrl.openConnection() as java.net.HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.instanceFollowRedirects = true
            
            // 如果已登录，添加认证头
            val token = _uiState.value.serverToken
            if (!token.isNullOrBlank()) {
                connection.setRequestProperty("Authorization", "Bearer $token")
            }
            
            val responseCode = connection.responseCode
            connection.disconnect()
            
            when {
                responseCode in 200..299 -> "连接成功"
                responseCode == 401 -> "连接成功（需要登录）"
                responseCode == 403 -> "连接失败: 访问被拒绝"
                responseCode >= 500 -> "连接失败: 服务器错误 ($responseCode)"
                else -> "连接失败: HTTP $responseCode"
            }
        } catch (e: java.net.MalformedURLException) {
            "无效的 URL 格式"
        } catch (e: java.net.UnknownHostException) {
            "无法解析主机名，请检查网络连接"
        } catch (e: java.net.ConnectException) {
            "连接被拒绝，请检查服务器地址和端口"
        } catch (e: java.net.SocketTimeoutException) {
            "连接超时，请检查网络连接"
        } catch (e: javax.net.ssl.SSLException) {
            "SSL/TLS 错误: ${e.message ?: "证书验证失败"}"
        } catch (e: java.io.IOException) {
            "网络错误: ${e.message ?: "IO 异常"}"
        } catch (e: Exception) {
            "连接失败: ${e.javaClass.simpleName} - ${e.message ?: "未知错误"}"
        }
    }

    /**
     * 立即同步
     */
    fun syncNow() {
        viewModelScope.launch {
            val url = _uiState.value.webdavUrl

            // 验证同步配置
            if (!_uiState.value.syncEnabled) {
                _uiState.update { it.copy(message = "请先启用同步") }
                return@launch
            }

            if (url.isBlank()) {
                _uiState.update { it.copy(message = "请先配置服务器地址") }
                return@launch
            }

            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                _uiState.update { it.copy(message = "服务器地址格式无效") }
                return@launch
            }
            
            // 自建服务器需要先登录
            if (_uiState.value.syncType == "server" && !_uiState.value.serverLoggedIn) {
                _uiState.update { it.copy(message = "请先登录服务器") }
                return@launch
            }
            
            _uiState.update { it.copy(syncStatus = SyncStatus.SYNCING) }
            
            try {
                // 构建同步配置（明文同步）
                val syncConfig = SyncConfig(
                    enabled = true,
                    type = _uiState.value.syncType,
                    url = url,
                    syncPath = _uiState.value.syncPath,
                    username = _uiState.value.username.ifBlank { null },
                    password = _uiState.value.password.ifBlank { null },
                    apiKey = _uiState.value.apiKey.ifBlank { null },
                    syncModules = _uiState.value.syncModules,
                    // 自建服务器认证信息
                    serverUsername = _uiState.value.serverUsername.ifBlank { null },
                    serverPassword = _uiState.value.serverPassword.ifBlank { null },
                    serverSyncKey = _uiState.value.serverSyncKey.ifBlank { null },
                    serverToken = _uiState.value.serverToken,
                    serverRefreshToken = _uiState.value.serverRefreshToken,
                    serverTokenExpires = _uiState.value.serverTokenExpires
                )
                
                // 设置同步配置并执行同步
                syncEngine.setConfig(syncConfig)
                val result = syncEngine.sync()
                
                if (result.success) {
                    val now = System.currentTimeMillis()
                    prefs.edit().putLong(KEY_LAST_SYNC_TIME, now).apply()
                    
                    // 同步成功后重新加载 AI 配置
                    loadAiConfigFromDb()
                    
                    val message = buildString {
                        append("同步成功")
                        if (result.pushed > 0 || result.pulled > 0) {
                            append(" (上传 ${result.pushed}, 下载 ${result.pulled}")
                            if (result.conflicts > 0) {
                                append(", ${result.conflicts} 个冲突")
                            }
                            append(")")
                        }
                    }
                    
                    _uiState.update { it.copy(
                        syncStatus = SyncStatus.SUCCESS, 
                        lastSyncTime = now, 
                        message = message
                    ) }
                } else {
                    _uiState.update { it.copy(
                        syncStatus = SyncStatus.FAILED, 
                        message = result.error ?: "同步失败"
                    ) }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(
                    syncStatus = SyncStatus.FAILED, 
                    message = "同步失败: ${e.message}"
                ) }
            }
        }
    }
    
    // 安全设置
    fun setAppLockEnabled(enabled: Boolean) {
        if (enabled && appLockManager.getLockType() == LockType.NONE) {
            // 需要先设置 PIN
            _uiState.update { it.copy(showPinDialog = true) }
        } else {
            appLockManager.setLockEnabled(enabled)
            _uiState.update { it.copy(appLockEnabled = enabled) }
        }
    }
    
    fun setBiometricEnabled(enabled: Boolean) {
        biometricManager.setBiometricEnabled(enabled)
        _uiState.update { it.copy(biometricEnabled = enabled) }
    }
    
    fun setLockType(type: LockType) {
        appLockManager.setLockType(type)
        _uiState.update { it.copy(lockType = type) }
    }
    
    fun setLockTimeout(timeout: LockTimeout) {
        appLockManager.setLockTimeout(timeout.millis)
        _uiState.update { it.copy(lockTimeout = timeout) }
    }
    
    fun setPin(pin: String) {
        appLockManager.setPin(pin)
        appLockManager.setLockType(LockType.PIN)
        appLockManager.setLockEnabled(true)
        _uiState.update { it.copy(
            showPinDialog = false,
            appLockEnabled = true,
            lockType = LockType.PIN
        ) }
    }
    
    fun dismissPinDialog() {
        _uiState.update { it.copy(showPinDialog = false) }
    }
    
    // 主题设置
    fun setFollowSystemTheme(follow: Boolean) {
        prefs.edit().putBoolean(KEY_FOLLOW_SYSTEM_THEME, follow).apply()
        _uiState.update { it.copy(followSystemTheme = follow) }
    }
    
    fun setDarkMode(dark: Boolean) {
        prefs.edit().putBoolean(KEY_DARK_MODE, dark).apply()
        _uiState.update { it.copy(darkMode = dark) }
    }
    
    // AI 设置
    fun setAiDefaultChannel(channel: String) {
        prefs.edit().putString(KEY_AI_DEFAULT_CHANNEL, channel).apply()
        _uiState.update { it.copy(aiDefaultChannel = channel) }
    }
    
    fun setAiDefaultModel(model: String) {
        prefs.edit().putString(KEY_AI_DEFAULT_MODEL, model).apply()
        _uiState.update { it.copy(aiDefaultModel = model) }
    }
    
    /**
     * 从 SharedPreferences 重新加载 AI 配置到 UI 状态
     * 由 prefsListener 自动调用，也可手动调用
     */
    fun reloadAiConfigFromPrefs() {
        val channelsJson = prefs.getString(KEY_AI_CHANNELS_JSON, "") ?: ""
        val defaultChannel = prefs.getString(KEY_AI_DEFAULT_CHANNEL, "") ?: ""
        val defaultModel = prefs.getString(KEY_AI_DEFAULT_MODEL, "") ?: ""
        _uiState.update { it.copy(
            aiChannelsJson = channelsJson,
            aiDefaultChannel = defaultChannel,
            aiDefaultModel = defaultModel
        )}
        android.util.Log.d("SettingsViewModel", "AI config reloaded from prefs, channels json length: ${channelsJson.length}")
    }

    /**
     * 设置 AI 渠道配置 JSON
     * 同时保存到 SharedPreferences 和数据库（用于同步）
     */
    fun setAiChannels(json: String) {
        prefs.edit().putString(KEY_AI_CHANNELS_JSON, json).apply()
        _uiState.update { it.copy(aiChannelsJson = json) }
        
        // 同时保存到数据库以支持同步
        viewModelScope.launch {
            saveAiConfigToDb()
        }
    }
    
    /**
     * 保存 AI 配置到数据库（用于同步）
     */
    private suspend fun saveAiConfigToDb() {
        try {
            val aiConfigJson = kotlinx.serialization.json.Json { 
                ignoreUnknownKeys = true 
                encodeDefaults = true
            }
            
            val payload = com.mucheng.notes.domain.model.payload.AIConfigPayload(
                enabled = _uiState.value.aiEnabled,
                defaultChannel = _uiState.value.aiDefaultChannel,
                defaultModel = _uiState.value.aiDefaultModel,
                channels = if (_uiState.value.aiChannelsJson.isNotBlank()) {
                    try {
                        aiConfigJson.decodeFromString<List<com.mucheng.notes.domain.model.payload.AIChannel>>(_uiState.value.aiChannelsJson)
                    } catch (e: Exception) {
                        android.util.Log.e("SettingsViewModel", "Failed to parse AI channels: ${e.message}")
                        emptyList()
                    }
                } else {
                    emptyList()
                }
            )
            
            val payloadString = aiConfigJson.encodeToString(com.mucheng.notes.domain.model.payload.AIConfigPayload.serializer(), payload)
            
            // 使用固定 ID 确保只有一条配置记录
            val configId = "ai-config-singleton"
            val existing = itemRepository.getById(configId)
            
            if (existing != null) {
                itemRepository.update(configId, payloadString)
            } else {
                itemRepository.createWithId(configId, com.mucheng.notes.domain.model.ItemType.AI_CONFIG, payloadString)
            }
            
            android.util.Log.d("SettingsViewModel", "AI config saved to database for sync")
        } catch (e: Exception) {
            android.util.Log.e("SettingsViewModel", "Failed to save AI config to database: ${e.message}")
        }
    }
    
    /**
     * 从数据库加载 AI 配置（同步后调用）
     * 注意：只加载 AI 渠道配置，不覆盖功能模块开关（aiEnabled）
     * 功能模块开关是本地设置，不应该被同步数据覆盖
     */
    suspend fun loadAiConfigFromDb() {
        try {
            val aiConfigJson = kotlinx.serialization.json.Json { 
                ignoreUnknownKeys = true 
                encodeDefaults = true
            }
            
            val items = itemRepository.getByTypeOnce(com.mucheng.notes.domain.model.ItemType.AI_CONFIG)
            if (items.isNotEmpty()) {
                val payload = aiConfigJson.decodeFromString<com.mucheng.notes.domain.model.payload.AIConfigPayload>(items[0].payload)
                
                // 更新 SharedPreferences（不更新 aiEnabled，保持本地设置）
                val channelsJsonStr = aiConfigJson.encodeToString(
                    kotlinx.serialization.builtins.ListSerializer(com.mucheng.notes.domain.model.payload.AIChannel.serializer()),
                    payload.channels
                )
                prefs.edit()
                    // 不覆盖 KEY_AI_ENABLED，保持用户本地设置
                    .putString(KEY_AI_DEFAULT_CHANNEL, payload.defaultChannel)
                    .putString(KEY_AI_DEFAULT_MODEL, payload.defaultModel)
                    .putString(KEY_AI_CHANNELS_JSON, channelsJsonStr)
                    .apply()
                
                // 更新 UI 状态（不更新 aiEnabled）
                _uiState.update { it.copy(
                    aiDefaultChannel = payload.defaultChannel,
                    aiDefaultModel = payload.defaultModel,
                    aiChannelsJson = channelsJsonStr
                )}
                
                android.util.Log.d("SettingsViewModel", "AI config loaded from database: ${payload.channels.size} channels")
            }
        } catch (e: Exception) {
            android.util.Log.e("SettingsViewModel", "Failed to load AI config from database: ${e.message}")
        }
    }
    
    fun clearMessage() {
        _uiState.update { it.copy(message = null) }
    }
    
    /**
     * 检查应用锁是否启用
     */
    fun isAppLockEnabled(): Boolean {
        return appLockManager.isLockEnabled() && appLockManager.getLockType() != LockType.NONE
    }
    
    /**
     * 验证 PIN 码
     * @param pin 用户输入的 PIN 码
     * @return 验证是否成功
     */
    suspend fun verifyPin(pin: String): Boolean {
        return appLockManager.verifyPin(pin)
    }
    
    /**
     * 检查功能是否启用
     */
    fun isFeatureEnabled(feature: String): Boolean {
        return when (feature) {
            "bookmarks" -> _uiState.value.bookmarksEnabled
            "todos" -> _uiState.value.todosEnabled
            "vault" -> _uiState.value.vaultEnabled
            "ai" -> _uiState.value.aiEnabled
            else -> true
        }
    }
    
    /**
     * 显示消息
     */
    fun showMessage(msg: String) {
        _uiState.update { it.copy(message = msg) }
    }
    
    /**
     * 显示修改 PIN 对话框
     */
    fun showChangePinDialog() {
        _uiState.update { it.copy(showPinDialog = true) }
    }
    
    /**
     * 显示密码库密码设置对话框
     */
    fun showVaultPasswordDialog() {
        val mode = if (_uiState.value.vaultPasswordSet) "change" else "set"
        _uiState.update { it.copy(showVaultPasswordDialog = true, vaultPasswordDialogMode = mode) }
    }
    
    /**
     * 关闭密码库密码对话框
     */
    fun dismissVaultPasswordDialog() {
        _uiState.update { it.copy(showVaultPasswordDialog = false) }
    }
    
    /**
     * 设置密码库密码
     */
    fun setVaultPassword(password: String) {
        // 使用 SHA-256 哈希存储密码
        val hashedPassword = hashPassword(password)
        prefs.edit()
            .putString(KEY_VAULT_PASSWORD, hashedPassword)
            .putBoolean(KEY_VAULT_LOCK_ENABLED, true)
            .apply()
        _uiState.update { it.copy(
            vaultPasswordSet = true,
            vaultLockEnabled = true,
            showVaultPasswordDialog = false,
            message = "密码库密码已设置"
        ) }
    }
    
    /**
     * 验证密码库密码
     */
    fun verifyVaultPassword(password: String): Boolean {
        val storedHash = prefs.getString(KEY_VAULT_PASSWORD, null) ?: return false
        val inputHash = hashPassword(password)
        return storedHash == inputHash
    }
    
    /**
     * 设置密码库锁定开关
     */
    fun setVaultLockEnabled(enabled: Boolean) {
        if (enabled && !_uiState.value.vaultPasswordSet) {
            // 需要先设置密码
            showVaultPasswordDialog()
        } else {
            prefs.edit().putBoolean(KEY_VAULT_LOCK_ENABLED, enabled).apply()
            _uiState.update { it.copy(vaultLockEnabled = enabled) }
        }
    }
    
    /**
     * 设置密码库生物识别
     */
    fun setVaultBiometricEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_VAULT_BIOMETRIC_ENABLED, enabled).apply()
        _uiState.update { it.copy(vaultBiometricEnabled = enabled) }
    }
    
    /**
     * 验证密码库生物识别并启用
     */
    fun authenticateVaultBiometricAndEnable(
        activity: androidx.fragment.app.FragmentActivity,
        onResult: (Boolean, String?) -> Unit
    ) {
        if (!_uiState.value.vaultPasswordSet) {
            onResult(false, "请先设置密码库密码")
            return
        }
        
        if (biometricManager is BiometricManagerImpl) {
            (biometricManager as BiometricManagerImpl).authenticateFromActivity(
                activity = activity,
                title = "验证身份",
                subtitle = "请验证以启用密码库生物识别",
                negativeButtonText = "取消"
            ) { result ->
                when (result) {
                    is AuthResult.Success -> {
                        setVaultBiometricEnabled(true)
                        onResult(true, "密码库生物识别已启用")
                    }
                    is AuthResult.Error -> {
                        onResult(false, "验证失败: ${result.message}")
                    }
                    is AuthResult.Cancelled,
                    is AuthResult.Fallback -> {
                        onResult(false, null)
                    }
                }
            }
        } else {
            onResult(false, "生物识别不可用")
        }
    }
    
    /**
     * 哈希密码
     */
    private fun hashPassword(password: String): String {
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(password.toByteArray(Charsets.UTF_8))
        return hashBytes.joinToString("") { "%02x".format(it) }
    }
    
    /**
     * 移除密码库密码
     */
    fun removeVaultPassword() {
        prefs.edit()
            .remove(KEY_VAULT_PASSWORD)
            .putBoolean(KEY_VAULT_LOCK_ENABLED, false)
            .putBoolean(KEY_VAULT_BIOMETRIC_ENABLED, false)
            .apply()
        _uiState.update { it.copy(
            vaultPasswordSet = false,
            vaultLockEnabled = false,
            vaultBiometricEnabled = false,
            message = "已移除密码库密码"
        ) }
    }
    
    /**
     * 验证生物识别并启用
     * 需要从 Activity 调用
     */
    fun authenticateBiometricAndEnable(
        activity: androidx.fragment.app.FragmentActivity,
        onResult: (Boolean, String?) -> Unit
    ) {
        if (biometricManager is BiometricManagerImpl) {
            (biometricManager as BiometricManagerImpl).authenticateFromActivity(
                activity = activity,
                title = "验证身份",
                subtitle = "请验证以启用生物识别",
                negativeButtonText = "取消"
            ) { result ->
                when (result) {
                    is com.mucheng.notes.security.AuthResult.Success -> {
                        setBiometricEnabled(true)
                        onResult(true, "生物识别已启用")
                    }
                    is com.mucheng.notes.security.AuthResult.Error -> {
                        onResult(false, "验证失败: ${result.message}")
                    }
                    is com.mucheng.notes.security.AuthResult.Cancelled,
                    is com.mucheng.notes.security.AuthResult.Fallback -> {
                        onResult(false, null)
                    }
                }
            }
        } else {
            onResult(false, "生物识别不可用")
        }
    }
}
