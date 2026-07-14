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
            .callTimeout(5, TimeUnit.MINUTES)
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

    private fun persistTokenState(
        accessToken: String,
        refreshToken: String?,
        expiresIn: Int
    ) {
        onTokenRefresh?.invoke(accessToken, refreshToken ?: "", expiresIn)
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
                    persistTokenState(authResponse.accessToken, authResponse.refreshToken, expiresIn)
                    return@withContext true
                }
            }

            if (response.code == 401 || response.code == 403) {
                // refresh token 无效或过期，尝试自动重新登录
                android.util.Log.w("ServerAdapter", "Refresh token rejected, trying auto relogin...")
                return@withContext tryAutoRelogin()
            }

            android.util.Log.w(
                "ServerAdapter",
                "Token refresh request failed: HTTP ${response.code} ${response.message}"
            )
            return@withContext false
        } catch (e: Exception) {
            android.util.Log.e("ServerAdapter", "Token refresh failed: ${e.message}")
            return@withContext false
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
            
            if (result.success && result.accessToken != null) {
                persistTokenState(result.accessToken, result.refreshToken, result.expiresIn ?: 3600)
                android.util.Log.i("ServerAdapter", "Auto relogin successful")
                true
            } else {
                android.util.Log.e("ServerAdapter", "Auto relogin failed: ${result.message}")
                if (result.error?.code != null) {
                    // 仅在服务端明确判定认证失效时清理本地登录态
                    onReloginRequired?.invoke()
                }
                false
            }
        } catch (e: Exception) {
            android.util.Log.e("ServerAdapter", "Auto relogin error: ${e.message}")
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
            client.newCall(requestBuilder.build()).execute().use { response ->
                // 处理 401 错误，尝试刷新 token（使用并发保护）
                if (response.code == 401 && retry && refreshToken != null) {
                    android.util.Log.w("ServerAdapter", "Got 401, attempting token refresh")
                    response.close()
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

    override suspend fun getItems(ids: List<String>): Map<String, ItemEntity?> {
        val uniqueIds = ids.distinct().filter { it.isNotBlank() }
        if (uniqueIds.isEmpty()) return emptyMap()

        val body = json.encodeToString(mapOf("ids" to uniqueIds))
        val result = request("POST", "/api/items/batch-get", body) { responseBody ->
            @Serializable
            data class BatchGetResult(val items: List<ItemEntity> = emptyList())
            json.decodeFromString<BatchGetResult>(responseBody).items
        }

        if (result != null) {
            val itemsById = result.associateBy { it.id }
            return uniqueIds.associateWith { id -> itemsById[id] }
        }

        android.util.Log.w("ServerAdapter", "batch-get unavailable, falling back to single item requests")
        return uniqueIds.associateWith { id -> getItem(id) }
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
        return request("POST", "/api/items/$id/soft-delete") { true } ?: false
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
            
            client.newCall(requestBuilder.build()).execute().use { response ->
                if (response.isSuccessful) {
                    Result.success(System.currentTimeMillis().toString())
                } else {
                    Result.failure(Exception("上传失败: ${response.code}"))
                }
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
            
            client.newCall(requestBuilder.build()).execute().use { response ->
                if (response.isSuccessful) {
                    val data = response.body?.bytes() ?: ByteArray(0)
                    Result.success(data)
                } else {
                    Result.failure(Exception("下载失败: ${response.code}"))
                }
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

    // 全量拉取后的最新 change_id
    private var _lastFullPullChangeId: Long? = null

    override suspend fun listAllItems(): List<ItemEntity> {
        return request("GET", "/api/items/all") { responseBody ->
            @Serializable
            data class AllItemsResult(val items: List<ItemEntity>, val latestChangeId: Long = 0)
            val result = json.decodeFromString<AllItemsResult>(responseBody)
            android.util.Log.d("ServerAdapter", "listAllItems: got ${result.items.size} items, latestChangeId=${result.latestChangeId}")
            // 保存 latestChangeId，包括 0（表示 changes 表为空，游标从 0 开始）
            _lastFullPullChangeId = result.latestChangeId  // 不再过滤 0，让 SyncEngine 处理
            result.items
        } ?: emptyList()
    }

    override suspend fun isCursorExpired(cursor: String): Boolean {
        return request("GET", "/api/changes/cursor-check?cursor=${java.net.URLEncoder.encode(cursor, "UTF-8")}") { responseBody ->
            @Serializable
            data class CursorCheckResult(val expired: Boolean = false)
            json.decodeFromString<CursorCheckResult>(responseBody).expired
        } ?: false
    }

    override fun getLastFullPullChangeId(): Long? {
        return _lastFullPullChangeId
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

    // ========== 网盘（cloud_drive）扩展能力实现 ==========
    //
    // 契约与桌面端 ServerAdapter.ts 完全一致：cloud_file / cloud_folder
    // 仅是 ItemEntity.payload 元数据层，二进制 I/O 复用 /api/resources/:id
    // 与 /api/resources/upload/:sessionId/* 两族接口。
    //
    // - JSON 端点走 request<T>()（自带 401 自动刷新）
    // - 二进制端点（getRemoteFileInfo / downloadFileRange / uploadChunk）
    //   手写 OkHttp 请求，并在 401 时走 safeRefreshToken() 重试一次。

    override fun hasRangeDownload(): Boolean = true

    override fun hasChunkedUpload(): Boolean = true

    /**
     * 构造带认证头的请求（用于二进制端点）。
     * 仅完成 header 装配，不执行请求。
     */
    private fun newAuthRequestBuilder(url: String): Request.Builder {
        val builder = Request.Builder().url(url)
        accessToken?.let { builder.addHeader("Authorization", "Bearer $it") }
        return builder
    }

    /**
     * 探测远端文件大小：GET /api/resources/:id，Range: bytes=0-0。
     * 从 Content-Range 头解析 "bytes 0-0/<size>"。
     * 与桌面端 getRemoteFileInfo 行为一致：用 0-0 探测以避免下载正文，
     * 同时消费 body 以释放 socket。
     */
    override suspend fun getRemoteFileInfo(itemId: String): RemoteFileInfo? = withContext(Dispatchers.IO) {
        try {
            val url = "${getBaseUrl()}/api/resources/$itemId"

            suspend fun probe(): RemoteFileInfo? {
                val builder = newAuthRequestBuilder(url)
                    .addHeader("Range", "bytes=0-0")
                    .get()
                client.newCall(builder.build()).execute().use { response ->
                    // 接受 200 或 206；非这两者说明资源不存在或鉴权失败
                    if (response.code != 200 && response.code != 206) {
                        android.util.Log.w("ServerAdapter", "getRemoteFileInfo $itemId -> ${response.code}")
                        return@probe null
                    }
                    // 优先用 Content-Range 解析总大小
                    val contentRange = response.header("Content-Range")
                    val size = contentRange?.let { cr ->
                        // 形如 "bytes 0-0/12345" 或 "bytes 0-0/*"
                        Regex("""/(\d+)""").find(cr)?.groupValues?.get(1)?.toLongOrNull()
                    } ?: response.body?.contentLength()?.takeIf { it > 0 }

                    // 消费 body 释放 socket
                    response.body?.close()

                    if (size == null) {
                        android.util.Log.w("ServerAdapter", "getRemoteFileInfo $itemId: no size in Content-Range/Content-Length")
                        return@probe null
                    }
                    val mime = response.header("Content-Type")?.takeIf { it.isNotBlank() && it != "application/octet-stream" }
                    return@probe RemoteFileInfo(size = size, mimeType = mime)
                }
            }

            var result = probe()
            if (result == null && refreshToken != null) {
                // 401 路径下可能已刷新，再试一次
                if (safeRefreshToken()) {
                    result = probe()
                }
            }
            result
        } catch (e: Exception) {
            android.util.Log.e("ServerAdapter", "getRemoteFileInfo $itemId error: ${e.message}")
            null
        }
    }

    /**
     * Range 下载：GET /api/resources/:id，Range: bytes=start-end。
     * 接受 200（服务端忽略 Range 全量返回）或 206（部分内容）。
     * 与桌面端 downloadFile 行为一致，但返回内存字节（Android 端由
     * CloudDriveDownloadManager 负责把字节写入 SAF DocumentFile）。
     */
    override suspend fun downloadFileRange(itemId: String, start: Long, chunkSize: Long): Result<ByteArray> = withContext(Dispatchers.IO) {
        try {
            val url = "${getBaseUrl()}/api/resources/$itemId"
            val rangeHeader = if (chunkSize <= 0) {
                "bytes=$start-"
            } else {
                val end = start + chunkSize - 1
                "bytes=$start-$end"
            }

            suspend fun fetch(): Pair<Int, ByteArray?> {
                val builder = newAuthRequestBuilder(url)
                    .addHeader("Range", rangeHeader)
                    .get()
                client.newCall(builder.build()).execute().use { response ->
                    if (response.code != 200 && response.code != 206) {
                        android.util.Log.w("ServerAdapter", "downloadFileRange $itemId -> ${response.code}")
                        return@fetch response.code to null
                    }
                    val bytes = response.body?.bytes() ?: ByteArray(0)
                    return@fetch response.code to bytes
                }
            }

            var (code, bytes) = fetch()
            if (bytes == null && code == 401 && refreshToken != null) {
                if (safeRefreshToken()) {
                    val retry = fetch()
                    code = retry.first
                    bytes = retry.second
                }
            }

            if (bytes != null) {
                Result.success(bytes)
            } else {
                Result.failure(Exception("Range 下载失败: HTTP $code"))
            }
        } catch (e: Exception) {
            android.util.Log.e("ServerAdapter", "downloadFileRange $itemId error: ${e.message}")
            Result.failure(e)
        }
    }

    // ---- 分块上传：JSON 端点走 request<T>() ----

    @Serializable
    private data class CreateSessionRequest(
        @kotlinx.serialization.SerialName("item_id")
        val itemId: String,
        @kotlinx.serialization.SerialName("total_size")
        val totalSize: Long,
        @kotlinx.serialization.SerialName("chunk_size")
        val chunkSize: Long,
        val extension: String
    )

    override suspend fun createChunkedUpload(
        itemId: String,
        totalSize: Long,
        chunkSize: Long,
        extension: String
    ): ChunkedUploadSession? {
        val body = json.encodeToString(
            CreateSessionRequest(
                itemId = itemId,
                totalSize = totalSize,
                chunkSize = chunkSize,
                extension = extension
            )
        )
        return request("POST", "/api/resources/upload", body) { responseBody ->
            json.decodeFromString<ChunkedUploadSession>(responseBody)
        }
    }

    /**
     * 上传单个分块：PUT /api/resources/upload/:sessionId/chunk。
     * Body 为原始字节（非 JSON），因此手写请求；401 走 safeRefreshToken 重试一次。
     */
    override suspend fun uploadChunk(
        sessionId: String,
        chunkIndex: Int,
        data: ByteArray
    ): ChunkUploadResult? = withContext(Dispatchers.IO) {
        val url = "${getBaseUrl()}/api/resources/upload/$sessionId/chunk"

        suspend fun push(): Pair<Int, ChunkUploadResult?> {
            val builder = newAuthRequestBuilder(url)
                .addHeader("Content-Type", "application/octet-stream")
                .addHeader("X-Chunk-Index", chunkIndex.toString())
                .put(data.toRequestBody("application/octet-stream".toMediaType()))
            client.newCall(builder.build()).execute().use { response ->
                val respBody = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    android.util.Log.w("ServerAdapter", "uploadChunk session=$sessionId idx=$chunkIndex -> ${response.code}: $respBody")
                    return@push response.code to null
                }
                val parsed = try {
                    json.decodeFromString<ChunkUploadResult>(respBody)
                } catch (e: Exception) {
                    // 服务端未返回标准 body 也视为接受
                    ChunkUploadResult(accepted = true, duplicate = false)
                }
                return@push response.code to parsed
            }
        }

        var (code, result) = push()
        if (result == null && code == 401 && refreshToken != null) {
            if (safeRefreshToken()) {
                val retry = push()
                code = retry.first
                result = retry.second
            }
        }
        result
    }

    override suspend fun completeChunkedUpload(sessionId: String): ChunkedUploadCompleteResult? {
        return request("POST", "/api/resources/upload/$sessionId/complete") { responseBody ->
            json.decodeFromString<ChunkedUploadCompleteResult>(responseBody)
        }
    }

    override suspend fun getUploadStatus(sessionId: String): ChunkedUploadStatus? {
        return request("GET", "/api/resources/upload/$sessionId/status") { responseBody ->
            json.decodeFromString<ChunkedUploadStatus>(responseBody)
        }
    }

    /**
     * 中止上传会话：DELETE /api/resources/upload/:sessionId。
     * 与桌面端一致：失败仅告警不抛错（服务端 TTL 自动回收）。
     */
    override suspend fun abortChunkedUpload(sessionId: String): Boolean {
        return try {
            request("DELETE", "/api/resources/upload/$sessionId") { true } ?: false
        } catch (e: Exception) {
            android.util.Log.w("ServerAdapter", "abortChunkedUpload $sessionId failed (ignored): ${e.message}")
            false
        }
    }
}
