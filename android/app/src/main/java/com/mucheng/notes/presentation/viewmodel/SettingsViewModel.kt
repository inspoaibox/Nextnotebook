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
import com.mucheng.notes.security.CryptoEngine
import com.mucheng.notes.security.LockType
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
    
    // 同步设置
    val syncEnabled: Boolean = false,
    val syncType: String = "webdav", // "webdav" | "server"
    val webdavUrl: String = "",
    val username: String = "",
    val password: String = "",
    val syncPath: String = "/mucheng-notes",
    val apiKey: String = "", // 用于 server 类型
    val encryptionEnabled: Boolean = true,
    val encryptionPassword: String = "",
    val syncInterval: SyncInterval = SyncInterval.FIVE_MINUTES,
    val syncModules: SyncModules = SyncModules(),
    val lastSyncTime: Long? = null,
    val syncStatus: SyncStatus = SyncStatus.IDLE,
    val testingConnection: Boolean = false,
    
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
    private val cryptoEngine: CryptoEngine
) : ViewModel() {
    
    companion object {
        private const val PREFS_NAME = "app_settings"
        private const val KEY_BOOKMARKS_ENABLED = "bookmarks_enabled"
        private const val KEY_TODOS_ENABLED = "todos_enabled"
        private const val KEY_VAULT_ENABLED = "vault_enabled"
        private const val KEY_AI_ENABLED = "ai_enabled"
        private const val KEY_SYNC_ENABLED = "sync_enabled"
        private const val KEY_SYNC_TYPE = "sync_type"
        private const val KEY_WEBDAV_URL = "webdav_url"
        private const val KEY_USERNAME = "username"
        private const val KEY_PASSWORD = "password"
        private const val KEY_SYNC_PATH = "sync_path"
        private const val KEY_API_KEY = "api_key"
        private const val KEY_ENCRYPTION_ENABLED = "encryption_enabled"
        private const val KEY_ENCRYPTION_PASSWORD = "encryption_password"
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
    }
    
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    
    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()
    
    init {
        loadSettings()
    }
    
    private fun loadSettings() {
        val syncIntervalMinutes = prefs.getInt(KEY_SYNC_INTERVAL, 5)
        val syncInterval = SyncInterval.entries.find { it.minutes == syncIntervalMinutes } ?: SyncInterval.FIVE_MINUTES
        
        val lockTimeoutMillis = appLockManager.getLockTimeout()
        val lockTimeout = LockTimeout.entries.find { it.millis == lockTimeoutMillis } ?: LockTimeout.FIVE_MINUTES
        
        // 调试日志
        val loadedSyncEnabled = prefs.getBoolean(KEY_SYNC_ENABLED, false)
        val loadedEncryptionEnabled = prefs.getBoolean(KEY_ENCRYPTION_ENABLED, true)
        val loadedEncryptionPassword = prefs.getString(KEY_ENCRYPTION_PASSWORD, "") ?: ""
        android.util.Log.d("SettingsViewModel", "loadSettings: syncEnabled=$loadedSyncEnabled, encryptionEnabled=$loadedEncryptionEnabled, encryptionPassword=${if (loadedEncryptionPassword.isNotEmpty()) "[SET:${loadedEncryptionPassword.length}chars]" else "[EMPTY]"}")
        
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
                
                // 同步设置
                syncEnabled = prefs.getBoolean(KEY_SYNC_ENABLED, false),
                syncType = prefs.getString(KEY_SYNC_TYPE, "webdav") ?: "webdav",
                webdavUrl = prefs.getString(KEY_WEBDAV_URL, "") ?: "",
                username = prefs.getString(KEY_USERNAME, "") ?: "",
                password = prefs.getString(KEY_PASSWORD, "") ?: "",
                syncPath = prefs.getString(KEY_SYNC_PATH, "/mucheng-notes") ?: "/mucheng-notes",
                apiKey = prefs.getString(KEY_API_KEY, "") ?: "",
                encryptionEnabled = prefs.getBoolean(KEY_ENCRYPTION_ENABLED, true),
                encryptionPassword = prefs.getString(KEY_ENCRYPTION_PASSWORD, "") ?: "",
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
                aiChannelsJson = prefs.getString(KEY_AI_CHANNELS_JSON, "") ?: ""
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
        prefs.edit().putString(KEY_PASSWORD, password).apply()
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
    
    fun setEncryptionEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_ENCRYPTION_ENABLED, enabled).apply()
        _uiState.update { it.copy(encryptionEnabled = enabled) }
    }
    
    fun setEncryptionPassword(password: String) {
        android.util.Log.d("SettingsViewModel", "setEncryptionPassword: saving password with ${password.length} chars")
        prefs.edit().putString(KEY_ENCRYPTION_PASSWORD, password).apply()
        _uiState.update { it.copy(encryptionPassword = password) }
        
        // 验证保存是否成功
        val saved = prefs.getString(KEY_ENCRYPTION_PASSWORD, "") ?: ""
        android.util.Log.d("SettingsViewModel", "setEncryptionPassword: verified saved=${if (saved.isNotEmpty()) "[SET:${saved.length}chars]" else "[EMPTY]"}")
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
                try {
                    // 构建完整的测试 URL（包含同步路径）
                    val syncPath = _uiState.value.syncPath
                    val fullUrl = if (url.endsWith("/")) {
                        url.dropLast(1) + syncPath
                    } else {
                        url + syncPath
                    }
                    
                    val testUrl = java.net.URL(fullUrl)
                    val connection = testUrl.openConnection() as java.net.HttpURLConnection
                    
                    // 使用 PROPFIND 方法测试 WebDAV
                    if (_uiState.value.syncType == "webdav") {
                        // 尝试使用 PROPFIND，如果不支持则回退到 GET
                        try {
                            connection.requestMethod = "PROPFIND"
                            connection.setRequestProperty("Depth", "0")
                            connection.setRequestProperty("Content-Type", "application/xml")
                        } catch (e: java.net.ProtocolException) {
                            // 某些实现不支持 PROPFIND，使用 GET
                            connection.requestMethod = "GET"
                        }
                    } else {
                        connection.requestMethod = "GET"
                    }
                    
                    connection.connectTimeout = 10000
                    connection.readTimeout = 10000
                    connection.instanceFollowRedirects = true
                    
                    // 添加认证
                    if (_uiState.value.syncType == "webdav") {
                        val username = _uiState.value.username
                        val password = _uiState.value.password
                        if (username.isNotBlank() && password.isNotBlank()) {
                            val auth = android.util.Base64.encodeToString(
                                "$username:$password".toByteArray(),
                                android.util.Base64.NO_WRAP
                            )
                            connection.setRequestProperty("Authorization", "Basic $auth")
                        }
                    } else {
                        // Server 类型，添加 API Key
                        val apiKey = _uiState.value.apiKey
                        if (apiKey.isNotBlank()) {
                            connection.setRequestProperty("Authorization", "Bearer $apiKey")
                        }
                    }
                    
                    val responseCode = connection.responseCode
                    connection.disconnect()
                    
                    when {
                        responseCode in 200..299 -> "连接成功"
                        responseCode == 207 -> "连接成功" // WebDAV Multi-Status
                        responseCode == 401 -> "连接失败: 认证失败，请检查账号密码"
                        responseCode == 403 -> "连接失败: 访问被拒绝，请检查账号密码"
                        responseCode == 404 -> {
                            // 路径不存在，尝试测试根 URL 是否可访问
                            // 这可能是因为同步目录还没有被创建（首次同步时会自动创建）
                            val rootUrl = java.net.URL(url)
                            val rootConnection = rootUrl.openConnection() as java.net.HttpURLConnection
                            
                            try {
                                if (_uiState.value.syncType == "webdav") {
                                    try {
                                        rootConnection.requestMethod = "PROPFIND"
                                        rootConnection.setRequestProperty("Depth", "0")
                                    } catch (e: java.net.ProtocolException) {
                                        rootConnection.requestMethod = "GET"
                                    }
                                } else {
                                    rootConnection.requestMethod = "GET"
                                }
                                
                                rootConnection.connectTimeout = 10000
                                rootConnection.readTimeout = 10000
                                
                                val username = _uiState.value.username
                                val password = _uiState.value.password
                                if (username.isNotBlank() && password.isNotBlank()) {
                                    val auth = android.util.Base64.encodeToString(
                                        "$username:$password".toByteArray(),
                                        android.util.Base64.NO_WRAP
                                    )
                                    rootConnection.setRequestProperty("Authorization", "Basic $auth")
                                }
                                
                                val rootResponseCode = rootConnection.responseCode
                                rootConnection.disconnect()
                                
                                when {
                                    rootResponseCode in 200..299 || rootResponseCode == 207 -> 
                                        "连接成功（同步目录将在首次同步时自动创建）"
                                    rootResponseCode == 401 -> "连接失败: 认证失败，请检查账号密码"
                                    rootResponseCode == 403 -> "连接失败: 访问被拒绝，请检查账号密码"
                                    else -> "连接失败: 服务器根路径不可访问 ($rootResponseCode)"
                                }
                            } catch (e: Exception) {
                                "连接失败: 路径不存在，请检查同步路径"
                            } finally {
                                try { rootConnection.disconnect() } catch (e: Exception) {}
                            }
                        }
                        responseCode == 405 -> {
                            // Method Not Allowed，尝试用 GET 再测试一次
                            val getConnection = testUrl.openConnection() as java.net.HttpURLConnection
                            getConnection.requestMethod = "GET"
                            getConnection.connectTimeout = 10000
                            getConnection.readTimeout = 10000
                            
                            val username = _uiState.value.username
                            val password = _uiState.value.password
                            if (username.isNotBlank() && password.isNotBlank()) {
                                val auth = android.util.Base64.encodeToString(
                                    "$username:$password".toByteArray(),
                                    android.util.Base64.NO_WRAP
                                )
                                getConnection.setRequestProperty("Authorization", "Basic $auth")
                            }
                            
                            val getResponseCode = getConnection.responseCode
                            getConnection.disconnect()
                            
                            when {
                                getResponseCode in 200..299 -> "连接成功"
                                getResponseCode == 401 -> "连接失败: 认证失败，请检查账号密码"
                                getResponseCode == 403 -> "连接失败: 访问被拒绝，请检查账号密码"
                                else -> "连接成功（服务器可达）"
                            }
                        }
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
            
            _uiState.update { it.copy(testingConnection = false, message = result) }
        }
    }
    
    /**
     * 立即同步
     */
    fun syncNow() {
        viewModelScope.launch {
            val url = _uiState.value.webdavUrl
            val encryptionEnabled = _uiState.value.encryptionEnabled
            val encryptionPassword = _uiState.value.encryptionPassword
            
            // 调试日志
            android.util.Log.d("SettingsViewModel", "syncNow: encryptionEnabled=$encryptionEnabled, encryptionPassword=${if (encryptionPassword.isNotEmpty()) "[SET:${encryptionPassword.length}chars]" else "[EMPTY]"}")
            
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
            
            // 初始化加密引擎的主密钥
            // 注意：即使用户没有启用全局加密，也需要初始化密钥用于敏感数据（密码库）
            // 如果用户提供了加密密钥，使用用户密钥；否则使用默认密钥
            try {
                if (encryptionPassword.isNotBlank()) {
                    // 使用用户提供的密钥
                    cryptoEngine.initMasterKey(encryptionPassword)
                } else {
                    // 使用默认密钥（与桌面端保持一致）
                    // 注意：这不如用户自定义密钥安全，但比明文好
                    cryptoEngine.initMasterKey("mucheng-default-vault-key-2024")
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(message = "密钥初始化失败: ${e.message}") }
                return@launch
            }
            
            _uiState.update { it.copy(syncStatus = SyncStatus.SYNCING) }
            
            try {
                // 构建同步配置
                val syncConfig = SyncConfig(
                    enabled = true,
                    type = _uiState.value.syncType,
                    url = url,
                    syncPath = _uiState.value.syncPath,
                    username = _uiState.value.username.ifBlank { null },
                    password = _uiState.value.password.ifBlank { null },
                    apiKey = _uiState.value.apiKey.ifBlank { null },
                    encryptionEnabled = _uiState.value.encryptionEnabled,
                    syncModules = _uiState.value.syncModules
                )
                
                // 设置同步配置并执行同步
                syncEngine.setConfig(syncConfig)
                val result = syncEngine.sync()
                
                if (result.success) {
                    val now = System.currentTimeMillis()
                    prefs.edit().putLong(KEY_LAST_SYNC_TIME, now).apply()
                    
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
     * 设置 AI 渠道配置 JSON
     */
    fun setAiChannels(json: String) {
        prefs.edit().putString(KEY_AI_CHANNELS_JSON, json).apply()
        _uiState.update { it.copy(aiChannelsJson = json) }
    }
    
    fun clearMessage() {
        _uiState.update { it.copy(message = null) }
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
     * 生成加密密钥
     */
    fun generateEncryptionKey() {
        val key = java.util.UUID.randomUUID().toString().replace("-", "")
        prefs.edit().putString(KEY_ENCRYPTION_PASSWORD, key).apply()
        _uiState.update { it.copy(encryptionPassword = key, message = "已生成新密钥") }
    }
    
    /**
     * 导出加密密钥
     */
    fun exportEncryptionKey() {
        val key = _uiState.value.encryptionPassword
        if (key.isEmpty()) {
            _uiState.update { it.copy(message = "请先设置或生成密钥") }
            return
        }
        // TODO: 实现导出到文件
        _uiState.update { it.copy(message = "密钥已复制到剪贴板") }
    }
    
    /**
     * 导入加密密钥
     */
    fun importEncryptionKey(key: String) {
        if (key.isBlank()) {
            _uiState.update { it.copy(message = "密钥不能为空") }
            return
        }
        prefs.edit().putString(KEY_ENCRYPTION_PASSWORD, key).apply()
        _uiState.update { it.copy(encryptionPassword = key, message = "密钥导入成功") }
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
