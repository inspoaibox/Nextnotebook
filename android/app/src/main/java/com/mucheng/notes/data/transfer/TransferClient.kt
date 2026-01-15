/**
 * LAN Transfer Assistant - Android 客户端
 * 
 * 使用 Socket.IO 连接到桌面端或中继服务器
 */

package com.mucheng.notes.data.transfer

import android.content.Context
import android.os.Build
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * 连接状态
 */
sealed class ConnectionState {
    object Disconnected : ConnectionState()
    object Connecting : ConnectionState()
    data class Connected(val mode: ConnectionMode) : ConnectionState()
    data class Error(val error: TransferError) : ConnectionState()
}

/**
 * 在线设备
 */
data class OnlineDevice(
    val id: String,
    val name: String,
    val type: DeviceType
)

/**
 * 传输客户端
 */
class TransferClient(
    private val context: Context
) {
    companion object {
        private const val TAG = "TransferClient"
    }

    private var socket: Socket? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // 设备信息
    private val deviceId: String by lazy { getOrCreateDeviceId() }
    private val deviceName: String by lazy { buildDeviceName() }
    
    // 状态流
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()
    
    private val _onlineDevices = MutableStateFlow<List<OnlineDevice>>(emptyList())
    val onlineDevices: StateFlow<List<OnlineDevice>> = _onlineDevices.asStateFlow()
    
    // 事件回调
    private val _messageReceived = MutableSharedFlow<MessageReceivedEvent>()
    val messageReceived: SharedFlow<MessageReceivedEvent> = _messageReceived.asSharedFlow()
    
    private val _fileIncoming = MutableSharedFlow<FileIncomingEvent>()
    val fileIncoming: SharedFlow<FileIncomingEvent> = _fileIncoming.asSharedFlow()
    
    private val _fileChunk = MutableSharedFlow<FileChunkEvent>()
    val fileChunk: SharedFlow<FileChunkEvent> = _fileChunk.asSharedFlow()
    
    private val _fileComplete = MutableSharedFlow<FileCompleteEvent>()
    val fileComplete: SharedFlow<FileCompleteEvent> = _fileComplete.asSharedFlow()
    
    private val _pairRequest = MutableSharedFlow<PairRequestEvent>()
    val pairRequest: SharedFlow<PairRequestEvent> = _pairRequest.asSharedFlow()
    
    private val _pairSuccess = MutableSharedFlow<PairSuccessEvent>()
    val pairSuccess: SharedFlow<PairSuccessEvent> = _pairSuccess.asSharedFlow()

    /**
     * 连接到服务器
     */
    fun connect(serverIp: String, serverPort: Int, mode: ConnectionMode = ConnectionMode.LAN) {
        if (_connectionState.value is ConnectionState.Connected) {
            Log.w(TAG, "Already connected")
            return
        }
        
        _connectionState.value = ConnectionState.Connecting
        
        scope.launch {
            try {
                val url = if (mode == ConnectionMode.LAN) {
                    "http://$serverIp:$serverPort"
                } else {
                    "$serverIp/transfer" // 中继服务器
                }
                
                Log.d(TAG, "Connecting to $url")
                
                val options = IO.Options().apply {
                    forceNew = true
                    reconnection = true
                    reconnectionAttempts = TransferConstants.MAX_RETRY
                    reconnectionDelay = TransferConstants.RETRY_INTERVAL
                    timeout = TransferConstants.SESSION_TIMEOUT
                }
                
                socket = IO.socket(url, options).apply {
                    setupEventListeners(mode)
                    connect()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Connection failed", e)
                _connectionState.value = ConnectionState.Error(
                    TransferError(TransferErrorCode.CONNECTION_FAILED, details = e.message)
                )
            }
        }
    }

    /**
     * 从二维码数据连接
     */
    fun connectFromQRData(qrData: PairingQRData) {
        if (qrData.isExpired()) {
            _connectionState.value = ConnectionState.Error(
                TransferError(TransferErrorCode.QR_CODE_EXPIRED)
            )
            return
        }
        connect(qrData.serverIp, qrData.serverPort, ConnectionMode.LAN)
    }

    /**
     * 智能连接：优先局域网，失败后降级到中继服务器
     */
    fun connectWithFallback(
        lanIp: String,
        lanPort: Int,
        relayServerUrl: String? = null
    ) {
        if (_connectionState.value is ConnectionState.Connected) {
            Log.w(TAG, "Already connected")
            return
        }
        
        _connectionState.value = ConnectionState.Connecting
        
        scope.launch {
            var retryCount = 0
            var connected = false
            
            // 尝试局域网连接
            while (retryCount < TransferConstants.MAX_RETRY && !connected) {
                try {
                    Log.d(TAG, "Attempting LAN connection (attempt ${retryCount + 1})")
                    connectInternal(lanIp, lanPort, ConnectionMode.LAN)
                    
                    // 等待连接结果
                    delay(TransferConstants.RETRY_INTERVAL)
                    
                    if (_connectionState.value is ConnectionState.Connected) {
                        connected = true
                        Log.d(TAG, "LAN connection successful")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "LAN connection attempt ${retryCount + 1} failed: ${e.message}")
                }
                retryCount++
            }
            
            // 如果局域网连接失败，尝试中继服务器
            if (!connected && relayServerUrl != null) {
                Log.d(TAG, "Falling back to relay server")
                retryCount = 0
                
                while (retryCount < TransferConstants.MAX_RETRY && !connected) {
                    try {
                        Log.d(TAG, "Attempting relay connection (attempt ${retryCount + 1})")
                        connectInternal(relayServerUrl, 0, ConnectionMode.RELAY)
                        
                        delay(TransferConstants.RETRY_INTERVAL)
                        
                        if (_connectionState.value is ConnectionState.Connected) {
                            connected = true
                            Log.d(TAG, "Relay connection successful")
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Relay connection attempt ${retryCount + 1} failed: ${e.message}")
                    }
                    retryCount++
                }
            }
            
            if (!connected) {
                _connectionState.value = ConnectionState.Error(
                    TransferError(TransferErrorCode.CONNECTION_FAILED, details = "All connection attempts failed")
                )
            }
        }
    }

    /**
     * 内部连接方法
     */
    private fun connectInternal(serverIp: String, serverPort: Int, mode: ConnectionMode) {
        val url = if (mode == ConnectionMode.LAN) {
            "http://$serverIp:$serverPort"
        } else {
            "$serverIp/transfer"
        }
        
        Log.d(TAG, "Connecting to $url")
        
        val options = IO.Options().apply {
            forceNew = true
            reconnection = false // 手动处理重连
            timeout = TransferConstants.RETRY_INTERVAL
        }
        
        socket?.disconnect()
        socket?.off()
        
        socket = IO.socket(url, options).apply {
            setupEventListeners(mode)
            connect()
        }
    }

    /**
     * 断开连接
     */
    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        _connectionState.value = ConnectionState.Disconnected
        _onlineDevices.value = emptyList()
        Log.d(TAG, "Disconnected")
    }

    /**
     * 发送配对请求
     */
    fun sendPairRequest(targetDeviceId: String) {
        socket?.emit(SocketEvents.PAIR_REQUEST, JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
        })
    }

    /**
     * 接受配对请求
     */
    fun acceptPairRequest(requesterId: String, sessionId: String) {
        socket?.emit(SocketEvents.PAIR_ACCEPT, JSONObject().apply {
            put("requesterId", requesterId)
            put("sessionId", sessionId)
        })
    }

    /**
     * 拒绝配对请求
     */
    fun rejectPairRequest(requesterId: String) {
        socket?.emit(SocketEvents.PAIR_REJECT, JSONObject().apply {
            put("requesterId", requesterId)
        })
    }

    /**
     * 发送文本消息
     */
    fun sendMessage(targetDeviceId: String, sessionId: String, message: TransferMessageData) {
        socket?.emit(SocketEvents.MESSAGE_SEND, JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
            put("sessionId", sessionId)
            put("message", JSONObject().apply {
                put("id", message.id)
                put("type", message.type.value)
                put("content", message.content)
                message.fileId?.let { put("fileId", it) }
            })
        })
    }

    /**
     * 发送消息已读回执
     */
    fun sendMessageRead(targetDeviceId: String, messageIds: List<String>) {
        socket?.emit(SocketEvents.MESSAGE_READ, JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
            put("messageIds", JSONArray(messageIds))
        })
    }

    /**
     * 开始文件传输
     */
    fun startFileTransfer(targetDeviceId: String, fileInfo: FileTransferInfo) {
        socket?.emit(SocketEvents.FILE_START, JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
            put("fileInfo", JSONObject().apply {
                put("id", fileInfo.id)
                put("filename", fileInfo.filename)
                put("fileSize", fileInfo.fileSize)
                put("mimeType", fileInfo.mimeType)
                put("totalChunks", fileInfo.totalChunks)
            })
        })
    }

    /**
     * 发送文件分块
     */
    fun sendFileChunk(targetDeviceId: String, fileId: String, chunkIndex: Int, chunk: ByteArray, totalChunks: Int) {
        socket?.emit(SocketEvents.FILE_CHUNK, JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
            put("fileId", fileId)
            put("chunkIndex", chunkIndex)
            put("chunk", android.util.Base64.encodeToString(chunk, android.util.Base64.NO_WRAP))
            put("totalChunks", totalChunks)
        })
    }

    /**
     * 完成文件传输
     */
    fun completeFileTransfer(targetDeviceId: String, fileId: String, fileHash: String?) {
        socket?.emit(SocketEvents.FILE_COMPLETE, JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
            put("fileId", fileId)
            fileHash?.let { put("fileHash", it) }
        })
    }

    /**
     * 取消文件传输
     */
    fun cancelFileTransfer(targetDeviceId: String, fileId: String) {
        socket?.emit(SocketEvents.FILE_CANCEL, JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
            put("fileId", fileId)
        })
    }

    /**
     * 发送文件（使用 ContentResolver）
     */
    suspend fun sendFileFromUri(
        targetDeviceId: String,
        sessionId: String,
        uri: android.net.Uri,
        onProgress: ((Float) -> Unit)? = null
    ): FileTransferInfo = withContext(Dispatchers.IO) {
        val contentResolver = context.contentResolver
        
        // 获取文件信息
        val cursor = contentResolver.query(uri, null, null, null, null)
        val filename = cursor?.use {
            if (it.moveToFirst()) {
                val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0) it.getString(nameIndex) else "unknown"
            } else "unknown"
        } ?: "unknown"
        
        val fileSize = cursor?.use {
            if (it.moveToFirst()) {
                val sizeIndex = it.getColumnIndex(android.provider.OpenableColumns.SIZE)
                if (sizeIndex >= 0) it.getLong(sizeIndex) else 0L
            } else 0L
        } ?: contentResolver.openInputStream(uri)?.use { it.available().toLong() } ?: 0L
        
        val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
        val fileId = UUID.randomUUID().toString()
        val totalChunks = ((fileSize + TransferConstants.CHUNK_SIZE - 1) / TransferConstants.CHUNK_SIZE).toInt()
        
        val fileInfo = FileTransferInfo(
            id = fileId,
            filename = filename,
            fileSize = fileSize,
            mimeType = mimeType,
            totalChunks = totalChunks
        )
        
        // 发送文件开始事件
        startFileTransfer(targetDeviceId, fileInfo)
        
        // 读取并发送文件分块
        contentResolver.openInputStream(uri)?.use { inputStream ->
            val buffer = ByteArray(TransferConstants.CHUNK_SIZE.toInt())
            var chunkIndex = 0
            var bytesRead: Int
            val messageDigest = java.security.MessageDigest.getInstance("SHA-256")
            
            while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                val chunk = if (bytesRead == buffer.size) buffer else buffer.copyOf(bytesRead)
                messageDigest.update(chunk)
                
                sendFileChunk(targetDeviceId, fileId, chunkIndex, chunk, totalChunks)
                
                chunkIndex++
                val progress = chunkIndex.toFloat() / totalChunks
                onProgress?.invoke(progress)
                
                // 小延迟防止阻塞
                delay(10)
            }
            
            // 计算文件哈希
            val hashBytes = messageDigest.digest()
            val fileHash = hashBytes.joinToString("") { "%02x".format(it) }
            
            // 发送文件完成事件
            completeFileTransfer(targetDeviceId, fileId, fileHash)
        } ?: throw IllegalStateException("Cannot open file: $uri")
        
        fileInfo
    }

    /**
     * 发送心跳
     */
    private fun sendHeartbeat() {
        socket?.emit(SocketEvents.HEARTBEAT)
    }

    // ============================================
    // 事件监听
    // ============================================

    private fun Socket.setupEventListeners(mode: ConnectionMode) {
        on(Socket.EVENT_CONNECT) {
            Log.d(TAG, "Socket connected")
            // 注册设备
            emit(SocketEvents.DEVICE_REGISTER, JSONObject().apply {
                put("deviceId", deviceId)
                put("deviceName", deviceName)
                put("deviceType", DeviceType.ANDROID.value)
            })
            _connectionState.value = ConnectionState.Connected(mode)
            startHeartbeatTimer()
        }

        on(Socket.EVENT_DISCONNECT) {
            Log.d(TAG, "Socket disconnected")
            _connectionState.value = ConnectionState.Disconnected
            _onlineDevices.value = emptyList()
            stopHeartbeatTimer()
        }

        on(Socket.EVENT_CONNECT_ERROR) { args ->
            val error = args.firstOrNull()?.toString() ?: "Unknown error"
            Log.e(TAG, "Connection error: $error")
            _connectionState.value = ConnectionState.Error(
                TransferError(TransferErrorCode.CONNECTION_FAILED, details = error)
            )
        }

        on(SocketEvents.DEVICE_LIST) { args ->
            val devices = parseDeviceList(args.firstOrNull() as? JSONArray)
            _onlineDevices.value = devices
            Log.d(TAG, "Device list updated: ${devices.size} devices")
        }

        on(SocketEvents.DEVICE_ONLINE) { args ->
            val json = args.firstOrNull() as? JSONObject ?: return@on
            val deviceJson = json.optJSONObject("device") ?: return@on
            val device = parseDevice(deviceJson)
            if (device != null) {
                _onlineDevices.value = _onlineDevices.value + device
                Log.d(TAG, "Device online: ${device.name}")
            }
        }

        on(SocketEvents.DEVICE_OFFLINE) { args ->
            val json = args.firstOrNull() as? JSONObject ?: return@on
            val offlineDeviceId = json.optString("deviceId")
            _onlineDevices.value = _onlineDevices.value.filter { it.id != offlineDeviceId }
            Log.d(TAG, "Device offline: $offlineDeviceId")
        }

        on(SocketEvents.PAIR_REQUEST) { args ->
            val json = args.firstOrNull() as? JSONObject ?: return@on
            scope.launch {
                _pairRequest.emit(PairRequestEvent(
                    requesterId = json.optString("requesterId"),
                    requesterName = json.optString("requesterName")
                ))
            }
        }

        on(SocketEvents.PAIR_SUCCESS) { args ->
            val json = args.firstOrNull() as? JSONObject ?: return@on
            scope.launch {
                _pairSuccess.emit(PairSuccessEvent(
                    sessionId = json.optString("sessionId"),
                    peerId = json.optString("peerId"),
                    peerName = json.optString("peerName")
                ))
            }
        }

        on(SocketEvents.MESSAGE_RECEIVE) { args ->
            val json = args.firstOrNull() as? JSONObject ?: return@on
            val messageJson = json.optJSONObject("message") ?: return@on
            scope.launch {
                _messageReceived.emit(MessageReceivedEvent(
                    senderId = json.optString("senderId"),
                    sessionId = json.optString("sessionId"),
                    message = TransferMessageData(
                        id = messageJson.optString("id"),
                        type = MessageType.entries.find { it.value == messageJson.optString("type") } ?: MessageType.TEXT,
                        content = messageJson.optString("content"),
                        fileId = messageJson.optString("fileId").takeIf { it.isNotEmpty() }
                    )
                ))
            }
        }

        on(SocketEvents.MESSAGE_READ) { args ->
            val json = args.firstOrNull() as? JSONObject ?: return@on
            // 处理消息已读回执
            Log.d(TAG, "Message read: ${json.optJSONArray("messageIds")}")
        }

        on(SocketEvents.FILE_INCOMING) { args ->
            val json = args.firstOrNull() as? JSONObject ?: return@on
            val fileInfoJson = json.optJSONObject("fileInfo") ?: return@on
            scope.launch {
                _fileIncoming.emit(FileIncomingEvent(
                    senderId = json.optString("senderId"),
                    fileInfo = FileTransferInfo(
                        id = fileInfoJson.optString("id"),
                        filename = fileInfoJson.optString("filename"),
                        fileSize = fileInfoJson.optLong("fileSize"),
                        mimeType = fileInfoJson.optString("mimeType"),
                        totalChunks = fileInfoJson.optInt("totalChunks")
                    )
                ))
            }
        }

        on(SocketEvents.FILE_CHUNK) { args ->
            val json = args.firstOrNull() as? JSONObject ?: return@on
            scope.launch {
                _fileChunk.emit(FileChunkEvent(
                    senderId = json.optString("senderId"),
                    fileId = json.optString("fileId"),
                    chunkIndex = json.optInt("chunkIndex"),
                    chunk = android.util.Base64.decode(json.optString("chunk"), android.util.Base64.NO_WRAP),
                    totalChunks = json.optInt("totalChunks")
                ))
            }
        }

        on(SocketEvents.FILE_COMPLETE) { args ->
            val json = args.firstOrNull() as? JSONObject ?: return@on
            scope.launch {
                _fileComplete.emit(FileCompleteEvent(
                    senderId = json.optString("senderId"),
                    fileId = json.optString("fileId"),
                    fileHash = json.optString("fileHash").takeIf { it.isNotEmpty() }
                ))
            }
        }

        on(SocketEvents.ERROR) { args ->
            val json = args.firstOrNull() as? JSONObject ?: return@on
            val errorCode = TransferErrorCode.fromCode(json.optString("code"))
            Log.e(TAG, "Server error: ${errorCode.message}")
        }
    }

    // ============================================
    // 心跳定时器
    // ============================================

    private var heartbeatJob: Job? = null

    private fun startHeartbeatTimer() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(TransferConstants.HEARTBEAT_INTERVAL)
                sendHeartbeat()
            }
        }
    }

    private fun stopHeartbeatTimer() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    // ============================================
    // 辅助方法
    // ============================================

    private fun getOrCreateDeviceId(): String {
        val prefs = context.getSharedPreferences("transfer", Context.MODE_PRIVATE)
        var id = prefs.getString("device_id", null)
        if (id == null) {
            id = UUID.randomUUID().toString()
            prefs.edit().putString("device_id", id).apply()
        }
        return id
    }

    private fun buildDeviceName(): String {
        return Build.MODEL ?: "Android Device"
    }

    private fun parseDeviceList(array: JSONArray?): List<OnlineDevice> {
        if (array == null) return emptyList()
        return (0 until array.length()).mapNotNull { i ->
            parseDevice(array.optJSONObject(i))
        }
    }

    private fun parseDevice(json: JSONObject?): OnlineDevice? {
        if (json == null) return null
        return OnlineDevice(
            id = json.optString("id"),
            name = json.optString("name"),
            type = DeviceType.entries.find { it.value == json.optString("type") } ?: DeviceType.DESKTOP
        )
    }

    fun getCurrentDeviceId(): String = deviceId
    fun getCurrentDeviceName(): String = deviceName

    /**
     * 清理资源
     */
    fun destroy() {
        disconnect()
        scope.cancel()
    }
}

// ============================================
// 事件数据类
// ============================================

data class TransferMessageData(
    val id: String,
    val type: MessageType,
    val content: String,
    val fileId: String? = null
)

data class FileTransferInfo(
    val id: String,
    val filename: String,
    val fileSize: Long,
    val mimeType: String,
    val totalChunks: Int
)

data class MessageReceivedEvent(
    val senderId: String,
    val sessionId: String,
    val message: TransferMessageData
)

data class FileIncomingEvent(
    val senderId: String,
    val fileInfo: FileTransferInfo
)

data class FileChunkEvent(
    val senderId: String,
    val fileId: String,
    val chunkIndex: Int,
    val chunk: ByteArray,
    val totalChunks: Int
)

data class FileCompleteEvent(
    val senderId: String,
    val fileId: String,
    val fileHash: String?
)

data class PairRequestEvent(
    val requesterId: String,
    val requesterName: String
)

data class PairSuccessEvent(
    val sessionId: String,
    val peerId: String,
    val peerName: String
)
