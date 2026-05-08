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
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket as JavaSocket
import java.util.concurrent.ConcurrentHashMap
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
 * Android 局域网接收端状态
 */
data class LanServerStatus(
    val running: Boolean = false,
    val ip: String? = null,
    val port: Int? = null,
    val qrData: String? = null,
    val connectedDevices: Int = 0
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

    private data class RelayEndpoint(
        val url: String,
        val path: String
    )

    private data class LanPeer(
        val deviceId: String,
        val deviceName: String,
        val deviceType: DeviceType,
        val socket: JavaSocket,
        val writer: BufferedWriter
    )

    private enum class LanTransport {
        SOCKET_IO,
        ANDROID_TCP
    }

    private var socket: Socket? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var serverSocket: ServerSocket? = null
    private var lanServerJob: Job? = null
    private var lanServerQrRefreshJob: Job? = null
    private val lanPeers = ConcurrentHashMap<String, LanPeer>()
    private var socketOnlineDevices: List<OnlineDevice> = emptyList()
    private var currentLanTransport: LanTransport? = null
    
    // 设备信息
    private val deviceId: String by lazy { getOrCreateDeviceId() }
    private val deviceName: String by lazy { buildDeviceName() }
    
    // 状态流
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()
    
    private val _onlineDevices = MutableStateFlow<List<OnlineDevice>>(emptyList())
    val onlineDevices: StateFlow<List<OnlineDevice>> = _onlineDevices.asStateFlow()

    private val _lanServerStatus = MutableStateFlow(LanServerStatus())
    val lanServerStatus: StateFlow<LanServerStatus> = _lanServerStatus.asStateFlow()
    
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
    fun connect(serverIp: String, serverPort: Int, mode: ConnectionMode = ConnectionMode.LAN, relayKey: String? = null) {
        if (_connectionState.value is ConnectionState.Connected) {
            Log.w(TAG, "Already connected")
            return
        }
        
        _connectionState.value = ConnectionState.Connecting
        
        scope.launch {
            try {
                val endpoint = if (mode == ConnectionMode.RELAY) {
                    resolveRelayEndpoint(serverIp)
                } else {
                    null
                }

                val url = if (mode == ConnectionMode.LAN) {
                    "http://$serverIp:$serverPort"
                } else {
                    endpoint?.url ?: serverIp
                }
                
                Log.d(TAG, "Connecting to $url (mode: $mode)")
                
                val options = IO.Options().apply {
                    forceNew = true
                    reconnection = true
                    reconnectionAttempts = TransferConstants.MAX_RETRY
                    reconnectionDelay = TransferConstants.RETRY_INTERVAL
                    timeout = TransferConstants.SESSION_TIMEOUT
                    path = if (mode == ConnectionMode.RELAY) endpoint?.path ?: "/transfer" else "/socket.io"
                    // 中继模式需要密钥认证
                    if (mode == ConnectionMode.RELAY && !relayKey.isNullOrEmpty()) {
                        auth = mapOf("relayKey" to relayKey)
                    }
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
        if (qrData.protocol == TransferConstants.QR_PROTOCOL_ANDROID_TCP) {
            connectToAndroidLanServer(qrData)
            return
        }
        connect(qrData.serverIp, qrData.serverPort, ConnectionMode.LAN)
    }

    /**
     * 启动 Android 局域网接收端，供另一台手机扫码直连
     */
    fun startLanServer() {
        if (_lanServerStatus.value.running) {
            Log.w(TAG, "Android LAN server already running")
            return
        }

        scope.launch {
            try {
                val ip = findLocalIPv4Address()
                if (ip == null) {
                    _connectionState.value = ConnectionState.Error(
                        TransferError(TransferErrorCode.NETWORK_UNAVAILABLE, details = "No local IPv4 address")
                    )
                    return@launch
                }

                val server = openAvailableServerSocket()
                serverSocket = server
                val port = server.localPort
                val qrData = buildAndroidLanQRData(ip, port)

                _lanServerStatus.value = LanServerStatus(
                    running = true,
                    ip = ip,
                    port = port,
                    qrData = qrData,
                    connectedDevices = lanPeers.size
                )

                lanServerJob = launch {
                    acceptLanClients(server)
                }
                startLanServerQrRefresh(ip, port)

                Log.d(TAG, "Android LAN server started at $ip:$port")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start Android LAN server", e)
                _connectionState.value = ConnectionState.Error(
                    TransferError(TransferErrorCode.SERVER_START_FAILED, details = e.message)
                )
                _lanServerStatus.value = LanServerStatus()
            }
        }
    }

    /**
     * 停止 Android 局域网接收端
     */
    fun stopLanServer() {
        lanServerJob?.cancel()
        lanServerJob = null
        lanServerQrRefreshJob?.cancel()
        lanServerQrRefreshJob = null
        runCatching { serverSocket?.close() }
        serverSocket = null
        closeLanPeers()
        _lanServerStatus.value = LanServerStatus()
        if (socket == null) {
            _connectionState.value = ConnectionState.Disconnected
        }
        Log.d(TAG, "Android LAN server stopped")
    }

    /**
     * 连接另一台 Android 的轻量 TCP 接收端
     */
    private fun connectToAndroidLanServer(qrData: PairingQRData) {
        if (_connectionState.value is ConnectionState.Connected) {
            Log.w(TAG, "Already connected")
            return
        }

        _connectionState.value = ConnectionState.Connecting

        scope.launch {
            try {
                val javaSocket = JavaSocket()
                javaSocket.connect(InetSocketAddress(qrData.serverIp, qrData.serverPort), TransferConstants.RETRY_INTERVAL.toInt())
                val writer = BufferedWriter(OutputStreamWriter(javaSocket.getOutputStream(), Charsets.UTF_8))
                val peer = LanPeer(
                    deviceId = qrData.deviceId,
                    deviceName = qrData.deviceName,
                    deviceType = DeviceType.ANDROID,
                    socket = javaSocket,
                    writer = writer
                )

                lanPeers[peer.deviceId] = peer
                currentLanTransport = LanTransport.ANDROID_TCP
                updateLanPeerList()
                _connectionState.value = ConnectionState.Connected(ConnectionMode.LAN)

                sendLanPacket(
                    peer = peer,
                    event = SocketEvents.DEVICE_REGISTER,
                    payload = JSONObject().apply {
                        put("deviceId", deviceId)
                        put("deviceName", deviceName)
                        put("deviceType", DeviceType.ANDROID.value)
                    }
                )

                launch { listenToLanPeer(peer) }
                Log.d(TAG, "Connected to Android LAN server ${qrData.serverIp}:${qrData.serverPort}")
            } catch (e: Exception) {
                Log.e(TAG, "Android LAN connection failed", e)
                _connectionState.value = ConnectionState.Error(
                    TransferError(TransferErrorCode.CONNECTION_FAILED, details = e.message)
                )
            }
        }
    }

    /**
     * 智能连接：优先局域网，失败后降级到中继服务器
     */
    fun connectWithFallback(
        lanIp: String,
        lanPort: Int,
        relayServerUrl: String? = null,
        relayKey: String? = null
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
                    connectInternal(lanIp, lanPort, ConnectionMode.LAN, null)
                    
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
            if (!connected && relayServerUrl != null && !relayKey.isNullOrEmpty()) {
                Log.d(TAG, "Falling back to relay server")
                retryCount = 0
                
                while (retryCount < TransferConstants.MAX_RETRY && !connected) {
                    try {
                        Log.d(TAG, "Attempting relay connection (attempt ${retryCount + 1})")
                        connectInternal(relayServerUrl, 0, ConnectionMode.RELAY, relayKey)
                        
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
     * 连接到中继服务器
     */
    fun connectToRelay(relayServerUrl: String, relayKey: String) {
        if (_connectionState.value is ConnectionState.Connected) {
            Log.w(TAG, "Already connected")
            return
        }
        
        if (relayKey.isEmpty()) {
            _connectionState.value = ConnectionState.Error(
                TransferError(TransferErrorCode.INVALID_RELAY_KEY, details = "中继密钥不能为空")
            )
            return
        }
        
        connect(relayServerUrl, 0, ConnectionMode.RELAY, relayKey)
    }

    /**
     * 内部连接方法
     */
    private fun connectInternal(serverIp: String, serverPort: Int, mode: ConnectionMode, relayKey: String?) {
        val endpoint = if (mode == ConnectionMode.RELAY) {
            resolveRelayEndpoint(serverIp)
        } else {
            null
        }

        val url = if (mode == ConnectionMode.LAN) {
            "http://$serverIp:$serverPort"
        } else {
            endpoint?.url ?: serverIp
        }
        
        Log.d(TAG, "Connecting to $url (mode: $mode)")
        
        val options = IO.Options().apply {
            forceNew = true
            reconnection = false // 手动处理重连
            timeout = TransferConstants.RETRY_INTERVAL
            path = if (mode == ConnectionMode.RELAY) endpoint?.path ?: "/transfer" else "/socket.io"
            // 中继模式需要密钥认证
            if (mode == ConnectionMode.RELAY && !relayKey.isNullOrEmpty()) {
                auth = mapOf("relayKey" to relayKey)
            }
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
        closeLanPeers()
        currentLanTransport = null
        socketOnlineDevices = emptyList()
        _connectionState.value = ConnectionState.Disconnected
        _onlineDevices.value = emptyList()
        Log.d(TAG, "Disconnected")
    }

    /**
     * 发送配对请求
     */
    fun sendPairRequest(targetDeviceId: String) {
        val payload = JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
            put("requesterId", deviceId)
            put("requesterName", deviceName)
        }
        if (sendViaAndroidLan(targetDeviceId, SocketEvents.PAIR_REQUEST, payload)) return
        socket?.emit(SocketEvents.PAIR_REQUEST, payload)
    }

    /**
     * 接受配对请求
     */
    fun acceptPairRequest(requesterId: String, sessionId: String) {
        val payload = JSONObject().apply {
            put("requesterId", requesterId)
            put("sessionId", sessionId)
        }
        val peer = lanPeers[requesterId]
        if (peer != null) {
            sendLanPacket(peer, SocketEvents.PAIR_ACCEPT, payload)
            scope.launch {
                _pairSuccess.emit(PairSuccessEvent(sessionId, peer.deviceId, peer.deviceName))
            }
            return
        }
        socket?.emit(SocketEvents.PAIR_ACCEPT, payload)
    }

    /**
     * 拒绝配对请求
     */
    fun rejectPairRequest(requesterId: String) {
        val payload = JSONObject().apply {
            put("requesterId", requesterId)
        }
        if (sendViaAndroidLan(requesterId, SocketEvents.PAIR_REJECT, payload)) return
        socket?.emit(SocketEvents.PAIR_REJECT, payload)
    }

    /**
     * 发送文本消息
     */
    fun sendMessage(targetDeviceId: String, sessionId: String, message: TransferMessageData) {
        val payload = JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
            put("sessionId", sessionId)
            put("message", JSONObject().apply {
                put("id", message.id)
                put("type", message.type.value)
                put("content", message.content)
                message.fileId?.let { put("fileId", it) }
            })
        }
        if (sendViaAndroidLan(targetDeviceId, SocketEvents.MESSAGE_SEND, payload)) return
        socket?.emit(SocketEvents.MESSAGE_SEND, payload)
    }

    /**
     * 发送消息已读回执
     */
    fun sendMessageRead(targetDeviceId: String, messageIds: List<String>) {
        val payload = JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
            put("messageIds", JSONArray(messageIds))
        }
        if (sendViaAndroidLan(targetDeviceId, SocketEvents.MESSAGE_READ, payload)) return
        socket?.emit(SocketEvents.MESSAGE_READ, payload)
    }

    /**
     * 开始文件传输
     */
    fun startFileTransfer(targetDeviceId: String, sessionId: String, fileInfo: FileTransferInfo) {
        val payload = JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
            put("sessionId", sessionId)
            put("fileInfo", JSONObject().apply {
                put("id", fileInfo.id)
                put("filename", fileInfo.filename)
                put("fileSize", fileInfo.fileSize)
                put("mimeType", fileInfo.mimeType)
                put("totalChunks", fileInfo.totalChunks)
            })
        }
        if (sendViaAndroidLan(targetDeviceId, SocketEvents.FILE_START, payload)) return
        socket?.emit(SocketEvents.FILE_START, payload)
    }

    /**
     * 发送文件分块
     */
    fun sendFileChunk(targetDeviceId: String, sessionId: String, fileId: String, chunkIndex: Int, chunk: ByteArray, totalChunks: Int) {
        val payload = JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
            put("sessionId", sessionId)
            put("fileId", fileId)
            put("chunkIndex", chunkIndex)
            put("chunk", android.util.Base64.encodeToString(chunk, android.util.Base64.NO_WRAP))
            put("totalChunks", totalChunks)
        }
        if (sendViaAndroidLan(targetDeviceId, SocketEvents.FILE_CHUNK, payload)) return
        socket?.emit(SocketEvents.FILE_CHUNK, payload)
    }

    /**
     * 完成文件传输
     */
    fun completeFileTransfer(targetDeviceId: String, sessionId: String, fileId: String, fileHash: String?) {
        val payload = JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
            put("sessionId", sessionId)
            put("fileId", fileId)
            fileHash?.let { put("fileHash", it) }
        }
        if (sendViaAndroidLan(targetDeviceId, SocketEvents.FILE_COMPLETE, payload)) return
        socket?.emit(SocketEvents.FILE_COMPLETE, payload)
    }

    /**
     * 取消文件传输
     */
    fun cancelFileTransfer(targetDeviceId: String, sessionId: String, fileId: String) {
        val payload = JSONObject().apply {
            put("targetDeviceId", targetDeviceId)
            put("sessionId", sessionId)
            put("fileId", fileId)
        }
        if (sendViaAndroidLan(targetDeviceId, SocketEvents.FILE_CANCEL, payload)) return
        socket?.emit(SocketEvents.FILE_CANCEL, payload)
    }

    /**
     * 发送文件（使用 ContentResolver）
     */
    suspend fun sendFileFromUri(
        targetDeviceId: String,
        sessionId: String,
        uri: android.net.Uri,
        fileId: String? = null,
        onProgress: ((Float) -> Unit)? = null
    ): FileTransferInfo = withContext(Dispatchers.IO) {
        val contentResolver = context.contentResolver
        
        // 获取文件信息
        var filename = "unknown"
        var fileSize = 0L
        
        val cursor = contentResolver.query(uri, null, null, null, null)
        cursor?.use {
            if (it.moveToFirst()) {
                val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0) filename = it.getString(nameIndex)
                
                val sizeIndex = it.getColumnIndex(android.provider.OpenableColumns.SIZE)
                if (sizeIndex >= 0) fileSize = it.getLong(sizeIndex)
            }
        }
        
        if (fileSize == 0L) {
            fileSize = contentResolver.openInputStream(uri)?.use { it.available().toLong() } ?: 0L
        }
        
        val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
        val resolvedFileId = fileId ?: UUID.randomUUID().toString()
        val totalChunks = ((fileSize + TransferConstants.CHUNK_SIZE - 1) / TransferConstants.CHUNK_SIZE).toInt()
        
        val fileInfo = FileTransferInfo(
            id = resolvedFileId,
            filename = filename,
            fileSize = fileSize,
            mimeType = mimeType,
            totalChunks = totalChunks
        )
        
        // 发送文件开始事件
        startFileTransfer(targetDeviceId, sessionId, fileInfo)
        
        // 读取并发送文件分块
        contentResolver.openInputStream(uri)?.use { inputStream ->
            val buffer = ByteArray(TransferConstants.CHUNK_SIZE.toInt())
            var chunkIndex = 0
            var bytesRead: Int
            val messageDigest = java.security.MessageDigest.getInstance("SHA-256")
            
            while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                val chunk = if (bytesRead == buffer.size) buffer else buffer.copyOf(bytesRead)
                messageDigest.update(chunk)
                
                sendFileChunk(targetDeviceId, sessionId, resolvedFileId, chunkIndex, chunk, totalChunks)
                
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
            completeFileTransfer(targetDeviceId, sessionId, resolvedFileId, fileHash)
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
            currentLanTransport = LanTransport.SOCKET_IO
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
            currentLanTransport = null
            _connectionState.value = ConnectionState.Disconnected
            socketOnlineDevices = emptyList()
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
            socketOnlineDevices = devices
            updateCombinedOnlineDevices()
            Log.d(TAG, "Device list updated: ${devices.size} devices")
        }

        on(SocketEvents.DEVICE_ONLINE) { args ->
            val json = args.firstOrNull() as? JSONObject ?: return@on
            val deviceJson = json.optJSONObject("device") ?: return@on
            val device = parseDevice(deviceJson)
            if (device != null) {
                socketOnlineDevices = (socketOnlineDevices.filter { it.id != device.id } + device)
                updateCombinedOnlineDevices()
                Log.d(TAG, "Device online: ${device.name}")
            }
        }

        on(SocketEvents.DEVICE_OFFLINE) { args ->
            val json = args.firstOrNull() as? JSONObject ?: return@on
            val offlineDeviceId = json.optString("deviceId")
            socketOnlineDevices = socketOnlineDevices.filter { it.id != offlineDeviceId }
            updateCombinedOnlineDevices()
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
    // Android 局域网 TCP 直连
    // ============================================

    private suspend fun acceptLanClients(server: ServerSocket) {
        while (scope.isActive && !server.isClosed) {
            try {
                val client = server.accept()
                scope.launch { handleIncomingLanSocket(client) }
            } catch (e: Exception) {
                if (scope.isActive && !server.isClosed) {
                    Log.e(TAG, "Failed to accept Android LAN client", e)
                }
            }
        }
    }

    private suspend fun handleIncomingLanSocket(javaSocket: JavaSocket) {
        var peer: LanPeer? = null
        try {
            val reader = BufferedReader(InputStreamReader(javaSocket.getInputStream(), Charsets.UTF_8))
            val writer = BufferedWriter(OutputStreamWriter(javaSocket.getOutputStream(), Charsets.UTF_8))
            val firstLine = reader.readLine() ?: return
            val firstPacket = JSONObject(firstLine)
            if (firstPacket.optString("event") != SocketEvents.DEVICE_REGISTER) {
                Log.w(TAG, "Android LAN client did not register first")
                sendLanError(writer, TransferErrorCode.SESSION_INVALID)
                return
            }

            peer = registerIncomingLanPeer(
                javaSocket = javaSocket,
                writer = writer,
                payload = firstPacket.optJSONObject("payload") ?: JSONObject()
            )

            while (scope.isActive && !javaSocket.isClosed) {
                val line = reader.readLine() ?: break
                handleLanPacket(peer, line)
            }
        } catch (e: Exception) {
            if (scope.isActive) {
                Log.e(TAG, "Android LAN peer connection failed", e)
            }
        } finally {
            peer?.let { removeLanPeer(it.deviceId) } ?: runCatching { javaSocket.close() }
        }
    }

    private suspend fun listenToLanPeer(peer: LanPeer) {
        try {
            val reader = BufferedReader(InputStreamReader(peer.socket.getInputStream(), Charsets.UTF_8))
            while (scope.isActive && !peer.socket.isClosed) {
                val line = reader.readLine() ?: break
                handleLanPacket(peer, line)
            }
        } catch (e: Exception) {
            if (scope.isActive) {
                Log.e(TAG, "Android LAN peer listener failed", e)
            }
        } finally {
            removeLanPeer(peer.deviceId)
        }
    }

    private suspend fun registerIncomingLanPeer(
        javaSocket: JavaSocket,
        writer: BufferedWriter,
        payload: JSONObject
    ): LanPeer {
        val peerId = payload.optString("deviceId")
        if (peerId.isBlank()) {
            sendLanError(writer, TransferErrorCode.SESSION_INVALID)
            throw IllegalArgumentException("Android LAN peer missing deviceId")
        }
        if (peerId == deviceId) {
            sendLanError(writer, TransferErrorCode.DEVICE_ID_CONFLICT)
            throw IllegalArgumentException("Android LAN peer has the same deviceId")
        }
        if (lanPeers.size >= TransferConstants.MAX_CONNECTIONS && !lanPeers.containsKey(peerId)) {
            sendLanError(writer, TransferErrorCode.SERVER_FULL)
            throw IllegalStateException("Android LAN server full")
        }
        lanPeers.remove(peerId)?.let { oldPeer ->
            runCatching { oldPeer.socket.close() }
        }

        val peer = LanPeer(
            deviceId = peerId,
            deviceName = payload.optString("deviceName", "Android Device"),
            deviceType = DeviceType.entries.find { it.value == payload.optString("deviceType") } ?: DeviceType.ANDROID,
            socket = javaSocket,
            writer = writer
        )

        lanPeers[peer.deviceId] = peer
        currentLanTransport = LanTransport.ANDROID_TCP
        updateLanPeerList()
        _connectionState.value = ConnectionState.Connected(ConnectionMode.LAN)

        val sessionId = UUID.randomUUID().toString()
        _pairSuccess.emit(PairSuccessEvent(sessionId, peer.deviceId, peer.deviceName))
        sendLanPacket(
            peer = peer,
            event = SocketEvents.PAIR_SUCCESS,
            payload = JSONObject().apply {
                put("sessionId", sessionId)
                put("peerId", deviceId)
                put("peerName", deviceName)
            }
        )

        Log.d(TAG, "Android LAN peer registered: ${peer.deviceName}")
        return peer
    }

    private suspend fun handleLanPacket(peer: LanPeer, line: String) {
        val packet = JSONObject(line)
        val event = packet.optString("event")
        val payload = packet.optJSONObject("payload") ?: JSONObject()

        when (event) {
            SocketEvents.DEVICE_REGISTER -> Unit
            SocketEvents.PAIR_REQUEST -> {
                _pairRequest.emit(
                    PairRequestEvent(
                        requesterId = payload.optString("requesterId", peer.deviceId),
                        requesterName = payload.optString("requesterName", peer.deviceName)
                    )
                )
            }
            SocketEvents.PAIR_ACCEPT -> {
                val sessionId = payload.optString("sessionId").ifBlank { UUID.randomUUID().toString() }
                _pairSuccess.emit(PairSuccessEvent(sessionId, peer.deviceId, peer.deviceName))
                sendLanPacket(
                    peer = peer,
                    event = SocketEvents.PAIR_SUCCESS,
                    payload = JSONObject().apply {
                        put("sessionId", sessionId)
                        put("peerId", deviceId)
                        put("peerName", deviceName)
                    }
                )
            }
            SocketEvents.PAIR_SUCCESS -> {
                _pairSuccess.emit(
                    PairSuccessEvent(
                        sessionId = payload.optString("sessionId"),
                        peerId = payload.optString("peerId", peer.deviceId),
                        peerName = payload.optString("peerName", peer.deviceName)
                    )
                )
            }
            SocketEvents.PAIR_REJECT -> Log.d(TAG, "Android LAN pair rejected by ${peer.deviceName}")
            SocketEvents.ERROR -> {
                val errorCode = TransferErrorCode.fromCode(payload.optString("code"))
                Log.e(TAG, "Android LAN peer error: ${errorCode.message}")
                _connectionState.value = ConnectionState.Error(
                    TransferError(errorCode, details = payload.optString("message"))
                )
            }
            SocketEvents.MESSAGE_SEND -> handleLanMessageSend(peer, payload)
            SocketEvents.MESSAGE_RECEIVE -> emitLanMessageReceived(peer, payload)
            SocketEvents.MESSAGE_READ -> Log.d(TAG, "Android LAN message read: ${payload.optJSONArray("messageIds")}")
            SocketEvents.FILE_START -> handleLanFileStart(peer, payload)
            SocketEvents.FILE_INCOMING -> emitLanFileIncoming(peer, payload)
            SocketEvents.FILE_CHUNK -> handleLanFileChunk(peer, payload)
            SocketEvents.FILE_COMPLETE -> handleLanFileComplete(peer, payload)
            SocketEvents.FILE_CANCEL -> Log.d(TAG, "Android LAN file cancelled: ${payload.optString("fileId")}")
            SocketEvents.HEARTBEAT -> Unit
            else -> Log.w(TAG, "Unknown Android LAN event: $event")
        }
    }

    private suspend fun handleLanMessageSend(peer: LanPeer, payload: JSONObject) {
        val targetDeviceId = payload.optString("targetDeviceId")
        if (targetDeviceId == deviceId || targetDeviceId.isBlank()) {
            emitLanMessageReceived(
                peer = peer,
                payload = JSONObject().apply {
                    put("senderId", peer.deviceId)
                    put("sessionId", payload.optString("sessionId"))
                    put("message", payload.optJSONObject("message"))
                }
            )
            return
        }

        val targetPeer = lanPeers[targetDeviceId] ?: return
        sendLanPacket(
            peer = targetPeer,
            event = SocketEvents.MESSAGE_RECEIVE,
            payload = JSONObject().apply {
                put("senderId", peer.deviceId)
                put("sessionId", payload.optString("sessionId"))
                put("message", payload.optJSONObject("message"))
            }
        )
    }

    private suspend fun emitLanMessageReceived(peer: LanPeer, payload: JSONObject) {
        val messageJson = payload.optJSONObject("message") ?: return
        _messageReceived.emit(
            MessageReceivedEvent(
                senderId = payload.optString("senderId", peer.deviceId),
                sessionId = payload.optString("sessionId"),
                message = TransferMessageData(
                    id = messageJson.optString("id"),
                    type = MessageType.entries.find { it.value == messageJson.optString("type") } ?: MessageType.TEXT,
                    content = messageJson.optString("content"),
                    fileId = messageJson.optString("fileId").takeIf { it.isNotEmpty() }
                )
            )
        )
    }

    private suspend fun handleLanFileStart(peer: LanPeer, payload: JSONObject) {
        val targetDeviceId = payload.optString("targetDeviceId")
        if (targetDeviceId == deviceId || targetDeviceId.isBlank()) {
            emitLanFileIncoming(
                peer = peer,
                payload = JSONObject().apply {
                    put("senderId", peer.deviceId)
                    put("sessionId", payload.optString("sessionId"))
                    put("fileInfo", payload.optJSONObject("fileInfo"))
                }
            )
            return
        }

        val targetPeer = lanPeers[targetDeviceId] ?: return
        sendLanPacket(
            peer = targetPeer,
            event = SocketEvents.FILE_INCOMING,
            payload = JSONObject().apply {
                put("senderId", peer.deviceId)
                put("sessionId", payload.optString("sessionId"))
                put("fileInfo", payload.optJSONObject("fileInfo"))
            }
        )
    }

    private suspend fun emitLanFileIncoming(peer: LanPeer, payload: JSONObject) {
        val fileInfoJson = payload.optJSONObject("fileInfo") ?: return
        _fileIncoming.emit(
            FileIncomingEvent(
                senderId = payload.optString("senderId", peer.deviceId),
                fileInfo = parseFileInfo(fileInfoJson)
            )
        )
    }

    private suspend fun handleLanFileChunk(peer: LanPeer, payload: JSONObject) {
        val targetDeviceId = payload.optString("targetDeviceId")
        if (targetDeviceId == deviceId || targetDeviceId.isBlank()) {
            _fileChunk.emit(
                FileChunkEvent(
                    senderId = payload.optString("senderId", peer.deviceId),
                    fileId = payload.optString("fileId"),
                    chunkIndex = payload.optInt("chunkIndex"),
                    chunk = android.util.Base64.decode(payload.optString("chunk"), android.util.Base64.NO_WRAP),
                    totalChunks = payload.optInt("totalChunks")
                )
            )
            return
        }

        val targetPeer = lanPeers[targetDeviceId] ?: return
        sendLanPacket(
            peer = targetPeer,
            event = SocketEvents.FILE_CHUNK,
            payload = JSONObject(payload.toString()).apply {
                put("senderId", peer.deviceId)
            }
        )
    }

    private suspend fun handleLanFileComplete(peer: LanPeer, payload: JSONObject) {
        val targetDeviceId = payload.optString("targetDeviceId")
        if (targetDeviceId == deviceId || targetDeviceId.isBlank()) {
            _fileComplete.emit(
                FileCompleteEvent(
                    senderId = payload.optString("senderId", peer.deviceId),
                    fileId = payload.optString("fileId"),
                    fileHash = payload.optString("fileHash").takeIf { it.isNotEmpty() }
                )
            )
            return
        }

        val targetPeer = lanPeers[targetDeviceId] ?: return
        sendLanPacket(
            peer = targetPeer,
            event = SocketEvents.FILE_COMPLETE,
            payload = JSONObject(payload.toString()).apply {
                put("senderId", peer.deviceId)
            }
        )
    }

    private fun parseFileInfo(fileInfoJson: JSONObject): FileTransferInfo {
        return FileTransferInfo(
            id = fileInfoJson.optString("id"),
            filename = fileInfoJson.optString("filename"),
            fileSize = fileInfoJson.optLong("fileSize"),
            mimeType = fileInfoJson.optString("mimeType"),
            totalChunks = fileInfoJson.optInt("totalChunks")
        )
    }

    private fun sendViaAndroidLan(targetDeviceId: String, event: String, payload: JSONObject): Boolean {
        val peer = lanPeers[targetDeviceId] ?: return false
        sendLanPacket(peer, event, payload)
        return true
    }

    private fun sendLanPacket(peer: LanPeer, event: String, payload: JSONObject) {
        try {
            val packet = JSONObject().apply {
                put("event", event)
                put("payload", payload)
            }
            synchronized(peer.writer) {
                peer.writer.write(packet.toString())
                peer.writer.newLine()
                peer.writer.flush()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send Android LAN packet: $event", e)
            removeLanPeer(peer.deviceId)
        }
    }

    private fun sendLanError(writer: BufferedWriter, errorCode: TransferErrorCode) {
        try {
            val packet = JSONObject().apply {
                put("event", SocketEvents.ERROR)
                put("payload", JSONObject().apply {
                    put("code", errorCode.code)
                    put("message", errorCode.message)
                })
            }
            synchronized(writer) {
                writer.write(packet.toString())
                writer.newLine()
                writer.flush()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send Android LAN error", e)
        }
    }

    private fun removeLanPeer(peerId: String) {
        val peer = lanPeers.remove(peerId) ?: return
        runCatching { peer.socket.close() }
        updateLanPeerList()
        if (lanPeers.isEmpty() && currentLanTransport == LanTransport.ANDROID_TCP) {
            currentLanTransport = null
            if (socket == null) {
                _connectionState.value = ConnectionState.Disconnected
            }
        }
        Log.d(TAG, "Android LAN peer removed: ${peer.deviceName}")
    }

    private fun closeLanPeers() {
        val peers = lanPeers.values.toList()
        lanPeers.clear()
        peers.forEach { peer ->
            runCatching { peer.socket.close() }
        }
        updateLanPeerList()
    }

    private fun updateLanPeerList() {
        updateCombinedOnlineDevices()
        _lanServerStatus.update { status ->
            if (status.running) {
                status.copy(connectedDevices = lanPeers.size)
            } else {
                status
            }
        }
    }

    private fun updateCombinedOnlineDevices() {
        val androidLanDevices = lanPeers.values.map { peer ->
            OnlineDevice(
                id = peer.deviceId,
                name = peer.deviceName,
                type = peer.deviceType
            )
        }

        val byId = LinkedHashMap<String, OnlineDevice>()
        socketOnlineDevices.forEach { device ->
            byId[device.id] = device
        }
        androidLanDevices.forEach { device ->
            byId[device.id] = device
        }
        _onlineDevices.value = byId.values.toList()
    }

    private fun openAvailableServerSocket(): ServerSocket {
        for (port in TransferConstants.PORT_RANGE_START..TransferConstants.PORT_RANGE_END) {
            try {
                return ServerSocket(port)
            } catch (_: Exception) {
                // Try the next port in the configured range.
            }
        }
        throw IllegalStateException("No available transfer port")
    }

    private fun startLanServerQrRefresh(ip: String, port: Int) {
        lanServerQrRefreshJob?.cancel()
        lanServerQrRefreshJob = scope.launch {
            while (isActive) {
                delay(TransferConstants.QR_CODE_EXPIRY / 2)
                _lanServerStatus.update { status ->
                    if (status.running && status.ip == ip && status.port == port) {
                        status.copy(qrData = buildAndroidLanQRData(ip, port))
                    } else {
                        status
                    }
                }
            }
        }
    }

    private fun findLocalIPv4Address(): String? {
        val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
        while (interfaces.hasMoreElements()) {
            val networkInterface = interfaces.nextElement()
            if (!networkInterface.isUp || networkInterface.isLoopback) continue

            val addresses = networkInterface.inetAddresses
            while (addresses.hasMoreElements()) {
                val address = addresses.nextElement()
                if (address is Inet4Address && !address.isLoopbackAddress) {
                    val hostAddress = address.hostAddress ?: continue
                    if (hostAddress.startsWith("192.168.") ||
                        hostAddress.startsWith("10.") ||
                        isPrivate172Address(hostAddress)
                    ) {
                        return hostAddress
                    }
                }
            }
        }
        return null
    }

    private fun isPrivate172Address(hostAddress: String): Boolean {
        val parts = hostAddress.split(".")
        if (parts.size < 2 || parts[0] != "172") return false
        val second = parts[1].toIntOrNull() ?: return false
        return second in 16..31
    }

    private fun buildAndroidLanQRData(ip: String, port: Int): String {
        val qrData = PairingQRData.create(
            deviceId = deviceId,
            deviceName = deviceName,
            serverIp = ip,
            serverPort = port,
            platform = DeviceType.ANDROID.value,
            protocol = TransferConstants.QR_PROTOCOL_ANDROID_TCP
        )
        return JSONObject().apply {
            put("deviceId", qrData.deviceId)
            put("deviceName", qrData.deviceName)
            put("serverIp", qrData.serverIp)
            put("serverPort", qrData.serverPort)
            put("timestamp", qrData.timestamp)
            put("expiresAt", qrData.expiresAt)
            put("version", qrData.version)
            put("platform", qrData.platform)
            put("protocol", qrData.protocol)
        }.toString()
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

    private fun resolveRelayEndpoint(serverUrl: String): RelayEndpoint {
        return try {
            val uri = android.net.Uri.parse(serverUrl.trim())
            val path = uri.encodedPath
                ?.takeIf { it.isNotBlank() && it != "/" }
                ?.trimEnd('/')
                ?: "/transfer"
            val baseUrl = uri.buildUpon()
                .path("")
                .query(null)
                .fragment(null)
                .build()
                .toString()
                .trimEnd('/')
            RelayEndpoint(baseUrl, path)
        } catch (e: Exception) {
            RelayEndpoint(serverUrl.trim().trimEnd('/'), "/transfer")
        }
    }

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
