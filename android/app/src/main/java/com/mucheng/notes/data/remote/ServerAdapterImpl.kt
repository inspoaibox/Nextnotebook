package com.mucheng.notes.data.remote

import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.domain.model.SyncConfig
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 自建服务器认证响应
 */
@Serializable
data class AuthResponse(
    val success: Boolean = false,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val expiresIn: Int? = null,
    val user: AuthUser? = null,
    val error: AuthError? = null,
    val message: String? = null
)

@Serializable
data class AuthUser(
    val id: String,
    val username: String,
    val role: String
)

@Serializable
data class AuthError(
    val code: String? = null,
    val message: String? = null
)

/**
 * 服务器注册状态
 */
@Serializable
data class RegistrationStatus(
    val status: String = "ok",
    val initialized: Boolean = false,
    val registrationEnabled: Boolean = true,
    val timestamp: Long = 0
)

/**
 * 自建服务器同步适配器实现
 * 与桌面端 ServerAdapter.ts 保持一致
 */
@Singleton
class ServerAdapterImpl @Inject constructor() : WebDAVAdapter {
    
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
        coerceInputValues = true
    }
    
    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }
    
    private var config: SyncConfig? = null
    private var accessToken: String? = null
    private var refreshToken: String? = null
    private var tokenExpires: Long? = null
    
    // Token 刷新回调
    var onTokenRefresh: ((String, String, Int) -> Unit)? = null
    
    // 重新登录回调（当 refresh token 也过期时触发）
    var onReloginRequired: (() -> Unit)? = null
    
    // 保存的登录凭据（用于自动重新登录）
    private var savedCredentials: Triple<String, String, String>? = null
    
    // 并发刷新保护
    private var refreshJob: Deferred<Boolean>? = null
    private val refreshMutex = Mutex()

    /**
     * 初始化服务器连接
     * 会自动检查并刷新即将过期的 token
     */
    suspend fun initialize(syncConfig: SyncConfig) {
        config = syncConfig
        accessToken = syncConfig.serverToken
        refreshToken = syncConfig.serverRefreshToken
        tokenExpires = syncConfig.serverTokenExpires
        
        // 主动检查 token 是否过期或即将过期
        if (accessToken != null && refreshToken != null) {
            val now = System.currentTimeMillis()
            val expires = tokenExpires ?: 0L
            
            if (expires <= now) {
                // Token 已过期，立即刷新
                android.util.Log.i("ServerAdapter", "Token expired, refreshing on init...")
                safeRefreshToken()
            } else if (expires - now < 5 * 60 * 1000) {
                // Token 即将过期（5分钟内），提前刷新
                android.util.Log.i("ServerAdapter", "Token expiring soon, refreshing on init...")
                safeRefreshToken()
            }
        }
    }
    
    /**
     * 保存登录凭据（用于自动重新登录）
     */
    fun saveCredentials(username: String, password: String, syncKey: String) {
        savedCredentials = Triple(username, password, syncKey)
    }
    
    /**
     * 清除保存的凭据
     */
    fun clearCredentials() {
        savedCredentials = null
    }
    
    private fun getConfig(): SyncConfig {
        return config ?: throw IllegalStateException("Server adapter not initialized")
    }
    
    private fun getBaseUrl(): String {
        val cfg = getConfig()
        return cfg.url.trimEnd('/')
    }
    
    /**
     * 登录
     */
    suspend fun login(username: String, password: String, syncKey: String): AuthResponse = withContext(Dispatchers.IO) {
        try {
            val url = "${getBaseUrl()}/api/auth/login"
            val body = json.encodeToString(mapOf(
                "username" to username,
                "password" to password,
                "syncKey" to syncKey
            ))
            
            val request = Request.Builder()
                .url(url)
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()
            
            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: "{}"
            
            android.util.Log.d("ServerAdapter", "Login response: ${response.code} - $responseBody")
            
            if (response.isSuccessful) {
                val authResponse = json.decodeFromString<AuthResponse>(responseBody)
                if (authResponse.accessToken != null) {
                    accessToken = authResponse.accessToken
                    refreshToken = authResponse.refreshToken
                    tokenExpires = System.currentTimeMillis() + (authResponse.expiresIn ?: 3600) * 1000L
                }
                authResponse
            } else {
                try {
                    json.decodeFromString<AuthResponse>(responseBody)
                } catch (e: Exception) {
                    AuthResponse(success = false, message = "登录失败: HTTP ${response.code}")
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("ServerAdapter", "Login failed: ${e.message}")
            AuthResponse(success = false, message = e.message ?: "网络错误")
        }
    }
    
    /**
     * 注册
     */
    suspend fun register(username: String, password: String, syncKey: String): AuthResponse = withContext(Dispatchers.IO) {
        try {
            val url = "${getBaseUrl()}/api/auth/register"
            val body = json.encodeToString(mapOf(
                "username" to username,
                "password" to password,
                "syncKey" to syncKey
            ))
            
            val request = Request.Builder()
                .url(url)
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()
            
            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: "{}"
            
            android.util.Log.d("ServerAdapter", "Register response: ${response.code} - $responseBody")
            
            if (response.isSuccessful) {
                json.decodeFromString<AuthResponse>(responseBody)
            } else {
                try {
                    json.decodeFromString<AuthResponse>(responseBody)
                } catch (e: Exception) {
                    AuthResponse(success = false, message = "注册失败: HTTP ${response.code}")
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("ServerAdapter", "Register failed: ${e.message}")
            AuthResponse(success = false, message = e.message ?: "网络错误")
        }
    }
    
    /**
     * 刷新 Token（内部实现）
     */
    private suspend fun doRefreshAccessToken(): Boolean = withContext(Dispatchers.IO) {
        val currentRefreshToken = refreshToken
        if (currentRefreshToken == null) {
            // 没有 refresh token，尝试自动重新登录
            return@withContext tryAutoRelogin()
        }
        
        try {
            val url = "${getBaseUrl()}/api/auth/refresh"
            val body = json.encodeToString(mapOf("refreshToken" to currentRefreshToken))
            
            val request = Request.Builder()
                .url(url)
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()
            
            val response = client.newCall(request).execute()
            
            if (response.isSuccessful) {
                val responseBody = response.body?.string() ?: "{}"
                val authResponse = json.decodeFromString<AuthResponse>(responseBody)
                
                if (authResponse.accessToken != null) {
                    accessToken = authResponse.accessToken
                    refreshToken = authResponse.refreshToken
                    val expiresIn = authResponse.expiresIn ?: 3600
                    tokenExpires = System.currentTimeMillis() + expiresIn * 1000L
                    
                    // 通知外部保存新 token
                    onTokenRefresh?.invoke(authResponse.accessToken, authResponse.refreshToken ?: "", expiresIn)
                    return@withContext true
                }
            }
            
            // refresh token 无效或过期，尝试自动重新登录
            android.util.Log.w("ServerAdapter", "Refresh token invalid, trying auto relogin...")
            return@withContext tryAutoRelogin()
        } catch (e: Exception) {
            android.util.Log.e("ServerAdapter", "Token refresh failed: ${e.message}")
            // 尝试自动重新登录
            return@withContext tryAutoRelogin()
        }
    }
    
    /**
     * 安全的 token 刷新方法，防止并发刷新
     */
    suspend fun safeRefreshToken(): Boolean {
        return refreshMutex.withLock {
            // 如果已经有刷新请求在进行中，等待它完成
            refreshJob?.let { job ->
                if (job.isActive) {
                    return@withLock job.await()
                }
            }
            
            // 创建新的刷新请求
            val newJob = kotlinx.coroutines.coroutineScope {
                async(Dispatchers.IO) {
                    doRefreshAccessToken()
                }
            }
            refreshJob = newJob
            
            try {
                newJob.await()
            } finally {
                if (refreshJob == newJob) {
                    refreshJob = null
                }
            }
        }
    }
    
    /**
     * 刷新 Token（公开方法，使用并发保护）
     */
    suspend fun refreshAccessToken(): Boolean = safeRefreshToken()
    
    /**
     * 尝试自动重新登录
     */
    private suspend fun tryAutoRelogin(): Boolean {
        val credentials = savedCredentials
        if (credentials == null) {
            // 没有保存的凭据，通知需要重新登录
            android.util.Log.w("ServerAdapter", "No saved credentials, relogin required")
            onReloginRequired?.invoke()
            return false
        }
        
        return try {
            android.util.Log.i("ServerAdapter", "Attempting auto relogin...")
            val (username, password, syncKey) = credentials
            val result = login(username, password, syncKey)
            
            if (result.success) {
                android.util.Log.i("ServerAdapter", "Auto relogin successful")
                true
            } else {
                android.util.Log.e("ServerAdapter", "Auto relogin failed: ${result.message}")
                // 登录失败，通知需要重新登录
                onReloginRequired?.invoke()
                false
            }
        } catch (e: Exception) {
            android.util.Log.e("ServerAdapter", "Auto relogin error: ${e.message}")
            onReloginRequired?.invoke()
            false
        }
    }
    
    /**
     * 登出
     */
    suspend fun logout(): Unit = withContext(Dispatchers.IO) {
        if (accessToken != null) {
            try {
                val url = "${getBaseUrl()}/api/auth/logout"
                val request = Request.Builder()
                    .url(url)
                    .post("{}".toRequestBody("application/json".toMediaType()))
                    .addHeader("Authorization", "Bearer $accessToken")
                    .build()
                
                client.newCall(request).execute()
            } catch (e: Exception) {
                android.util.Log.e("ServerAdapter", "Logout request failed: ${e.message}")
            }
        }
        accessToken = null
        refreshToken = null
        tokenExpires = null
    }
    
    /**
     * 检查是否已登录
     */
    fun isAuthenticated(): Boolean = accessToken != null
    
    /**
     * 检查 token 是否即将过期（5分钟内）
     */
    fun isTokenExpiringSoon(): Boolean {
        val expires = tokenExpires ?: return false
        return expires - System.currentTimeMillis() < 5 * 60 * 1000
    }
    
    /**
     * 获取服务器注册状态
     */
    suspend fun getRegistrationStatus(): RegistrationStatus = withContext(Dispatchers.IO) {
        try {
            val url = "${getBaseUrl()}/api/health/status"
            val request = Request.Builder()
                .url(url)
                .get()
                .build()
            
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                val responseBody = response.body?.string() ?: "{}"
                json.decodeFromString<RegistrationStatus>(responseBody)
            } else {
                RegistrationStatus()
            }
        } catch (e: Exception) {
            android.util.Log.e("ServerAdapter", "Failed to get registration status: ${e.message}")
            RegistrationStatus()
        }
    }

    /**
     * 执行带认证的请求
     */
    private suspend fun <T> request(
        method: String,
        path: String,
        body: String? = null,
        retry: Boolean = true,
        parser: (String) -> T
    ): T? = withContext(Dispatchers.IO) {
        // 检查 token 是否即将过期，提前刷新（使用并发保护）
        if (isTokenExpiringSoon() && refreshToken != null) {
            safeRefreshToken()
        }
        
        val url = "${getBaseUrl()}$path"
        val requestBuilder = Request.Builder().url(url)
        
        // 添加认证头
        val token = accessToken
        if (token != null) {
            requestBuilder.addHeader("Authorization", "Bearer $token")
        } else {
            android.util.Log.w("ServerAdapter", "No access token available for request: $method $path")
        }
        
        // 设置请求方法和 body
        when (method) {
            "GET" -> requestBuilder.get()
            "POST" -> requestBuilder.post((body ?: "{}").toRequestBody("application/json".toMediaType()))
            "PUT" -> requestBuilder.put((body ?: "{}").toRequestBody("application/json".toMediaType()))
            "DELETE" -> requestBuilder.delete()
        }
        
        try {
            android.util.Log.d("ServerAdapter", "Request: $method $url, hasToken=${token != null}")
            val response = client.newCall(requestBuilder.build()).execute()
            
            // 处理 401 错误，尝试刷新 token（使用并发保护）
            if (response.code == 401 && retry && refreshToken != null) {
                android.util.Log.w("ServerAdapter", "Got 401, attempting token refresh")
                val refreshed = safeRefreshToken()
                if (refreshed) {
                    return@withContext request(method, path, body, false, parser)
                }
                android.util.Log.e("ServerAdapter", "Token refresh failed, relogin may be required")
            }
            
            if (response.isSuccessful) {
                val responseBody = response.body?.string() ?: "{}"
                parser(responseBody)
            } else {
                val errorBody = response.body?.string() ?: ""
                android.util.Log.e("ServerAdapter", "Request failed: $method $path -> ${response.code} ${response.message}, body: $errorBody")
                null
            }
        } catch (e: Exception) {
            android.util.Log.e("ServerAdapter", "Request error: $method $path -> ${e.javaClass.simpleName}: ${e.message}")
            null
        }
    }
    
    // ========== WebDAVAdapter 接口实现 ==========
    
    override suspend fun testConnection(): Boolean = withContext(Dispatchers.IO) {
        try {
            val url = "${getBaseUrl()}/api/health"
            val request = Request.Builder()
                .url(url)
                .get()
                .build()
            
            val response = client.newCall(request).execute()
            response.isSuccessful
        } catch (e: Exception) {
            android.util.Log.e("ServerAdapter", "Connection test failed: ${e.message}")
            false
        }
    }
    
    override suspend fun getItem(id: String): ItemEntity? {
        return request("GET", "/api/items/$id") { responseBody ->
            json.decodeFromString<ItemEntity>(responseBody)
        }
    }
    
    override suspend fun putItem(item: ItemEntity): Result<String> = withContext(Dispatchers.IO) {
        try {
            val body = json.encodeToString(item)
            val result = request("PUT", "/api/items/${item.id}", body) { responseBody ->
                @Serializable
                data class PutResult(val remoteRev: String)
                json.decodeFromString<PutResult>(responseBody)
            }
            
            if (result != null) {
                Result.success(result.remoteRev)
            } else {
                Result.failure(Exception("上传项目失败: ${item.id} - 服务器无响应"))
            }
        } catch (e: Exception) {
            android.util.Log.e("ServerAdapter", "Failed to put item ${item.id}: ${e.message}")
            Result.failure(Exception("上传项目失败: ${item.id}: ${e.message}"))
        }
    }
    
    override suspend fun deleteItem(id: String): Boolean {
        return request("DELETE", "/api/items/$id") { true } ?: false
    }
    
    override suspend fun listChanges(cursor: String?, limit: Int): ChangeListResult {
        val params = buildString {
            append("?limit=$limit")
            if (cursor != null) append("&cursor=$cursor")
        }
        
        val result = request("GET", "/api/changes$params") { responseBody ->
            json.decodeFromString<ChangeListResult>(responseBody)
        }
        
        if (result == null) {
            throw Exception("获取变更列表失败 - 请检查网络连接和认证状态")
        }
        
        return result
    }
    
    override suspend fun getSyncCursor(): SyncCursor? {
        return request("GET", "/api/sync/cursor") { responseBody ->
            json.decodeFromString<SyncCursor>(responseBody)
        }
    }
    
    override suspend fun setSyncCursor(cursor: SyncCursor): Boolean {
        val body = json.encodeToString(cursor)
        return request("PUT", "/api/sync/cursor", body) { true } ?: false
    }
    
    override suspend fun uploadResource(resourceId: String, data: ByteArray): Result<String> = withContext(Dispatchers.IO) {
        try {
            val url = "${getBaseUrl()}/api/resources/$resourceId"
            val requestBuilder = Request.Builder()
                .url(url)
                .put(data.toRequestBody("application/octet-stream".toMediaType()))
            
            accessToken?.let {
                requestBuilder.addHeader("Authorization", "Bearer $it")
            }
            
            val response = client.newCall(requestBuilder.build()).execute()
            if (response.isSuccessful) {
                Result.success(System.currentTimeMillis().toString())
            } else {
                Result.failure(Exception("上传失败: ${response.code}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    override suspend fun downloadResource(resourceId: String): Result<ByteArray> = withContext(Dispatchers.IO) {
        try {
            val url = "${getBaseUrl()}/api/resources/$resourceId"
            val requestBuilder = Request.Builder().url(url).get()
            
            accessToken?.let {
                requestBuilder.addHeader("Authorization", "Bearer $it")
            }
            
            val response = client.newCall(requestBuilder.build()).execute()
            if (response.isSuccessful) {
                val data = response.body?.bytes() ?: ByteArray(0)
                Result.success(data)
            } else {
                Result.failure(Exception("下载失败: ${response.code}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    override suspend fun deleteResource(resourceId: String): Boolean {
        return request("DELETE", "/api/resources/$resourceId") { true } ?: false
    }
    
    override suspend fun listResources(): List<String> {
        return request("GET", "/api/resources") { responseBody ->
            @Serializable
            data class ResourceList(val resources: List<String>)
            json.decodeFromString<ResourceList>(responseBody).resources
        } ?: emptyList()
    }
    
    override suspend fun getKeyIdentifier(): String? {
        return request("GET", "/api/meta") { responseBody ->
            @Serializable
            data class Meta(val key_identifier: String? = null)
            json.decodeFromString<Meta>(responseBody).key_identifier
        }
    }
    
    override suspend fun setKeyIdentifier(keyId: String): Boolean {
        val body = json.encodeToString(mapOf("key_identifier" to keyId))
        return request("PUT", "/api/meta", body) { true } ?: false
    }
    
    override suspend fun hasData(): Boolean {
        return request("GET", "/api/items/count") { responseBody ->
            @Serializable
            data class CountResult(val hasData: Boolean = false, val itemCount: Int = 0)
            val result = json.decodeFromString<CountResult>(responseBody)
            result.hasData || result.itemCount > 0
        } ?: false
    }
    
    override suspend fun getKeyFingerprint(): String? {
        return request("GET", "/api/sync/key-fingerprint") { responseBody ->
            @Serializable
            data class FingerprintResult(val fingerprint: String? = null)
            json.decodeFromString<FingerprintResult>(responseBody).fingerprint
        }
    }
    
    override suspend fun saveKeyFingerprint(fingerprint: String): Boolean {
        val body = json.encodeToString(mapOf("fingerprint" to fingerprint))
        return request("PUT", "/api/sync/key-fingerprint", body) { true } ?: false
    }
    
    override suspend fun verifyKeyFingerprint(localFingerprint: String): KeyFingerprintResult {
        val remoteFingerprint = getKeyFingerprint()
        
        if (remoteFingerprint == null) {
            // 远端没有指纹，这是首次同步，保存本地指纹
            saveKeyFingerprint(localFingerprint)
            return KeyFingerprintResult(valid = true, remoteFingerprint = null)
        }
        
        // 验证指纹是否匹配
        val valid = remoteFingerprint == localFingerprint
        return KeyFingerprintResult(valid = valid, remoteFingerprint = remoteFingerprint)
    }
}
