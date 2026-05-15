/**
 * LAN Transfer Assistant - Android ViewModel
 */

package com.mucheng.notes.presentation.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.mucheng.notes.data.local.transfer.*
import com.mucheng.notes.data.transfer.*
import com.mucheng.notes.service.TransferNotificationService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.util.UUID
import javax.inject.Inject

/**
 * UI 状态
 */
data class TransferUiState(
    val connectionState: ConnectionState = ConnectionState.Disconnected,
    val onlineDevices: List<OnlineDevice> = emptyList(),
    val sessions: List<TransferSessionEntity> = emptyList(),
    val selectedSessionId: String? = null,
    val messages: List<TransferMessageEntity> = emptyList(),
    val files: List<TransferFileEntity> = emptyList(),
    val lanServerStatus: LanServerStatus = LanServerStatus(),
    val unreadCount: Int = 0,
    val isScanning: Boolean = false,
    val scanError: String? = null
)

@HiltViewModel
class TransferViewModel @Inject constructor(
    application: Application
) : AndroidViewModel(application) {

    private val transferClient = TransferClient(application)
    private val database = TransferDatabase.getInstance(application)
    
    private val deviceDao = database.deviceDao()
    private val sessionDao = database.sessionDao()
    private val messageDao = database.messageDao()
    private val fileDao = database.fileDao()
    
    // 文件写入流管理
    private val fileStreams = mutableMapOf<String, OutputStream>()
    private val filePaths = mutableMapOf<String, String>()
    private val pendingMediaUris = mutableMapOf<String, android.net.Uri>()
    
    private var messageCollectionJob: Job? = null
    private var fileCollectionJob: Job? = null
    private val sessionMutex = Mutex()

    private val _uiState = MutableStateFlow(TransferUiState())
    val uiState: StateFlow<TransferUiState> = _uiState.asStateFlow()

    init {
        // 监听连接状态
        viewModelScope.launch {
            transferClient.connectionState.collect { state ->
                _uiState.update { it.copy(connectionState = state) }
            }
        }

        // 监听在线设备
        viewModelScope.launch {
            transferClient.onlineDevices.collect { devices ->
                _uiState.update { it.copy(onlineDevices = devices) }
            }
        }

        // 监听 Android 本机局域网接收端状态
        viewModelScope.launch {
            transferClient.lanServerStatus.collect { status ->
                _uiState.update { it.copy(lanServerStatus = status) }
            }
        }

        // 监听消息接收
        viewModelScope.launch {
            transferClient.messageReceived.collect { event ->
                handleMessageReceived(event)
            }
        }

        // 监听文件传入
        viewModelScope.launch {
            transferClient.fileIncoming.collect { event ->
                handleFileIncoming(event)
            }
        }

        // 监听文件分块
        viewModelScope.launch {
            transferClient.fileChunk.collect { event ->
                handleFileChunk(event)
            }
        }

        // 监听文件完成
        viewModelScope.launch {
            transferClient.fileComplete.collect { event ->
                handleFileComplete(event)
            }
        }

        // 监听配对请求
        viewModelScope.launch {
            transferClient.pairRequest.collect { event ->
                val sessionId = UUID.randomUUID().toString()
                transferClient.acceptPairRequest(event.requesterId, sessionId)
                android.util.Log.d("TransferViewModel", "Auto accepted pair from ${event.requesterName}")
            }
        }

        // 监听配对成功
        viewModelScope.launch {
            transferClient.pairSuccess.collect { event ->
                handlePairSuccess(event)
            }
        }

        // 加载历史会话
        loadSessions()
    }

    // ============================================
    // 连接管理
    // ============================================

    /**
     * 从二维码连接
     */
    fun connectFromQRCode(qrData: String) {
        try {
            val data = parseQRCode(qrData)
            if (data != null) {
                if (data.protocol == TransferConstants.QR_PROTOCOL_ANDROID_TCP) {
                    transferClient.connectFromQRData(data)
                    return
                }

                val prefs = getApplication<Application>()
                    .getSharedPreferences("transfer_relay", android.content.Context.MODE_PRIVATE)
                val relayServerUrl = prefs.getString("server_url", "") ?: ""
                val relayKey = prefs.getString("relay_key", "") ?: ""
                transferClient.connectWithFallback(
                    lanIp = data.serverIp,
                    lanPort = data.serverPort,
                    relayServerUrl = relayServerUrl.takeIf { it.isNotBlank() },
                    relayKey = relayKey.takeIf { it.isNotBlank() }
                )
            } else {
                _uiState.update { it.copy(scanError = "无效的二维码") }
            }
        } catch (e: Exception) {
            _uiState.update { it.copy(scanError = e.message) }
        }
    }

    /**
     * 连接到中继服务器
     */
    fun connectToRelay(serverUrl: String, relayKey: String) {
        transferClient.connectToRelay(serverUrl, relayKey)
    }

    /**
     * 断开连接
     */
    fun disconnect() {
        transferClient.disconnect()
    }

    /**
     * 解析二维码数据
     */
    private fun parseQRCode(qrData: String): PairingQRData? {
        return try {
            val json = org.json.JSONObject(qrData)
            PairingQRData(
                deviceId = json.getString("deviceId"),
                deviceName = json.getString("deviceName"),
                serverIp = json.getString("serverIp"),
                serverPort = json.getInt("serverPort"),
                timestamp = json.getLong("timestamp"),
                expiresAt = json.getLong("expiresAt"),
                version = json.optString("version", "1.0"),
                platform = json.optString("platform", DeviceType.DESKTOP.value),
                protocol = json.optString("protocol", TransferConstants.QR_PROTOCOL_SOCKET_IO)
            )
        } catch (e: Exception) {
            null
        }
    }

    /**
     * 启动本机 Android 局域网接收端
     */
    fun startLanServer() {
        transferClient.startLanServer()
    }

    /**
     * 停止本机 Android 局域网接收端
     */
    fun stopLanServer() {
        transferClient.stopLanServer()
    }

    // ============================================
    // 会话管理
    // ============================================

    /**
     * 加载会话列表
     */
    private fun loadSessions() {
        viewModelScope.launch {
            sessionDao.getAllSessions().collect { sessions ->
                _uiState.update { it.copy(sessions = sessions) }
            }
        }
    }

    /**
     * 选择会话
     */
    fun selectSession(sessionId: String) {
        _uiState.update { it.copy(selectedSessionId = sessionId) }
        loadSessionMessages(sessionId)
        loadSessionFiles(sessionId)
        markSessionAsRead(sessionId)
    }
    
    fun deselectSession() {
        messageCollectionJob?.cancel()
        fileCollectionJob?.cancel()
        messageCollectionJob = null
        fileCollectionJob = null
        _uiState.update { it.copy(selectedSessionId = null, messages = emptyList(), files = emptyList()) }
    }

    /**
     * 创建新会话
     */
    fun createSession(device: OnlineDevice): String {
        val currentConnectionType = when (val state = _uiState.value.connectionState) {
            is ConnectionState.Connected -> state.mode.value
            else -> ConnectionMode.LAN.value
        }

        if (currentConnectionType == ConnectionMode.RELAY.value) {
            transferClient.sendPairRequest(device.id)
            return ""
        }

        val sessionId = UUID.randomUUID().toString()

        val session = TransferSessionEntity(
            id = sessionId,
            peerDeviceId = device.id,
            peerDeviceName = device.name,
            connectionType = currentConnectionType,
            startedAt = System.currentTimeMillis(),
            endedAt = null
        )
        
        viewModelScope.launch {
            // 保存设备信息
            val existingDevice = deviceDao.getById(device.id)
            if (existingDevice == null) {
                deviceDao.insert(TransferDeviceEntity(
                    id = device.id,
                    name = device.name,
                    type = device.type.value,
                    lastIp = null,
                    lastPort = null,
                    lastSeen = System.currentTimeMillis(),
                    isFavorite = false,
                    createdAt = System.currentTimeMillis()
                ))
            } else {
                deviceDao.updateLastSeen(device.id, System.currentTimeMillis(), null, null)
            }
            
            // 保存会话
            sessionDao.insert(session)
        }
        
        selectSession(sessionId)
        return sessionId
    }

    /**
     * 结束会话
     */
    fun endSession(sessionId: String) {
        viewModelScope.launch {
            sessionDao.endSession(sessionId, System.currentTimeMillis())
        }
    }

    /**
     * 删除会话
     */
    fun deleteSession(sessionId: String) {
        viewModelScope.launch {
            sessionDao.deleteById(sessionId)
            if (_uiState.value.selectedSessionId == sessionId) {
                _uiState.update { it.copy(selectedSessionId = null, messages = emptyList(), files = emptyList()) }
            }
        }
    }

    // ============================================
    // 消息管理
    // ============================================

    /**
     * 加载会话消息
     */
    private fun loadSessionMessages(sessionId: String) {
        messageCollectionJob?.cancel()
        messageCollectionJob = viewModelScope.launch {
            messageDao.observeMessagesBySession(sessionId).collect { messages ->
                _uiState.update { it.copy(messages = messages) }
            }
        }
    }

    /**
     * 发送文本消息
     */
    fun sendTextMessage(content: String) {
        val sessionId = _uiState.value.selectedSessionId ?: run {
            android.util.Log.e("TransferViewModel", "No selected session")
            return
        }
        
        // 先从 UI state 查找会话，如果没有则从数据库查找
        var session = _uiState.value.sessions.find { it.id == sessionId }
        
        viewModelScope.launch {
            // 如果 UI state 中没有会话，尝试从数据库获取
            if (session == null) {
                session = sessionDao.getById(sessionId)
                android.util.Log.d("TransferViewModel", "Session not in UI state, fetched from DB: ${session != null}")
            }
            
            if (session == null) {
                android.util.Log.e("TransferViewModel", "Session not found: $sessionId")
                return@launch
            }
            
            android.util.Log.d("TransferViewModel", "Sending message to device: ${session!!.peerDeviceId}, session: $sessionId")
            
            val messageId = UUID.randomUUID().toString()
            val message = TransferMessageEntity(
                id = messageId,
                sessionId = sessionId,
                direction = MessageDirection.SENT.value,
                type = MessageType.TEXT.value,
                content = content,
                fileId = null,
                createdAt = System.currentTimeMillis(),
                readAt = null
            )
            
            // 保存到本地
            messageDao.insert(message)
            
            // 发送到对方
            android.util.Log.d("TransferViewModel", "Calling transferClient.sendMessage with targetDeviceId=${session!!.peerDeviceId}")
            transferClient.sendMessage(
                targetDeviceId = session!!.peerDeviceId,
                sessionId = sessionId,
                message = TransferMessageData(
                    id = messageId,
                    type = MessageType.TEXT,
                    content = content
                )
            )
            
            // 手动刷新消息列表（确保 UI 更新）
            loadSessionMessages(sessionId)
        }
    }

    /**
     * 发送文件
     */
    fun sendFile(uri: android.net.Uri) {
        val sessionId = _uiState.value.selectedSessionId ?: return
        
        viewModelScope.launch {
            // 先从 UI state 查找会话，如果没有则从数据库查找
            var session = _uiState.value.sessions.find { it.id == sessionId }
            
            if (session == null) {
                session = sessionDao.getById(sessionId)
                android.util.Log.d("TransferViewModel", "sendFile: Session not in UI state, fetched from DB: ${session != null}")
            }
            
            if (session == null) {
                android.util.Log.e("TransferViewModel", "sendFile: Session not found: $sessionId")
                return@launch
            }
            
            try {
                val preFileId = UUID.randomUUID().toString()
                val contentResolver = getApplication<Application>().contentResolver
                val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
                val messageType = if (isImageFile("", mimeType, uri.toString())) MessageType.IMAGE else MessageType.FILE

                val sentFileInfo = transferClient.sendFileFromUri(
                    targetDeviceId = session!!.peerDeviceId,
                    sessionId = sessionId,
                    uri = uri,
                    fileId = preFileId,
                    onProgress = { progress ->
                        viewModelScope.launch {
                            fileDao.updateProgress(preFileId, progress * 100)
                        }
                    }
                )
                
                val fileEntity = TransferFileEntity(
                    id = sentFileInfo.id,
                    sessionId = sessionId,
                    filename = sentFileInfo.filename,
                    fileSize = sentFileInfo.fileSize,
                    mimeType = sentFileInfo.mimeType,
                    localPath = uri.toString(),
                    direction = MessageDirection.SENT.value,
                    status = FileTransferStatus.COMPLETED.value,
                    progress = 100f,
                    fileHash = null,
                    createdAt = System.currentTimeMillis(),
                    completedAt = System.currentTimeMillis()
                )
                fileDao.insert(fileEntity)
                
                // 创建文件消息
                val messageId = UUID.randomUUID().toString()
                val message = TransferMessageEntity(
                    id = messageId,
                    sessionId = sessionId,
                    direction = MessageDirection.SENT.value,
                    type = messageType.value,
                    content = sentFileInfo.filename,
                    fileId = sentFileInfo.id,
                    createdAt = System.currentTimeMillis(),
                    readAt = null
                )
                messageDao.insert(message)
                
                // 手动刷新 UI（确保 Flow 更新）
                loadSessionFiles(sessionId)
                loadSessionMessages(sessionId)
                
            } catch (e: Exception) {
                android.util.Log.e("TransferViewModel", "Failed to send file", e)
            }
        }
    }

    /**
     * 处理接收到的消息
     */
    private fun handleMessageReceived(event: MessageReceivedEvent) {
        viewModelScope.launch {
            try {
                android.util.Log.d("TransferViewModel", "handleMessageReceived: senderId=${event.senderId}, sessionId=${event.sessionId}")
                android.util.Log.d("TransferViewModel", "handleMessageReceived: message=${event.message}")
                
                // 先通过发送者设备 ID 查找或创建本地会话
                // 注意：不能直接使用桌面端发来的 sessionId，因为那是桌面端的会话 ID，本地可能不存在
                val localSessionId = findOrCreateSessionForDevice(event.senderId)
                android.util.Log.d("TransferViewModel", "handleMessageReceived: localSessionId=$localSessionId")
                
                val message = TransferMessageEntity(
                    id = event.message.id,
                    sessionId = localSessionId,  // 使用本地会话 ID
                    direction = MessageDirection.RECEIVED.value,
                    type = event.message.type.value,
                    content = event.message.content,
                    fileId = event.message.fileId,
                    createdAt = System.currentTimeMillis(),
                    readAt = if (_uiState.value.selectedSessionId == localSessionId) System.currentTimeMillis() else null
                )
                messageDao.insert(message)
                
                // 手动刷新消息列表（确保 UI 更新）
                if (_uiState.value.selectedSessionId == localSessionId) {
                    loadSessionMessages(localSessionId)
                }
                
                // 如果当前会话是这个会话，标记为已读
                if (_uiState.value.selectedSessionId == localSessionId) {
                    transferClient.sendMessageRead(event.senderId, listOf(event.message.id))
                } else {
                    // 显示通知
                    val device = deviceDao.getById(event.senderId)
                    val senderName = device?.name ?: "未知设备"
                    TransferNotificationService.showMessageNotification(
                        context = getApplication(),
                        senderName = senderName,
                        messageContent = event.message.content,
                        sessionId = localSessionId
                    )
                }
            } catch (e: Exception) {
                android.util.Log.e("TransferViewModel", "Failed to handle message received", e)
            }
        }
    }

    /**
     * 标记会话消息为已读
     */
    private fun markSessionAsRead(sessionId: String) {
        viewModelScope.launch {
            val count = messageDao.markSessionMessagesAsRead(sessionId, System.currentTimeMillis())
            if (count > 0) {
                val session = _uiState.value.sessions.find { it.id == sessionId }
                if (session != null) {
                    // 发送已读回执
                    val unreadMessages = messageDao.getMessagesBySession(sessionId)
                        .filter { it.direction == MessageDirection.RECEIVED.value && it.readAt != null }
                        .map { it.id }
                    if (unreadMessages.isNotEmpty()) {
                        transferClient.sendMessageRead(session.peerDeviceId, unreadMessages)
                    }
                }
            }
        }
    }

    // ============================================
    // 文件传输
    // ============================================

    /**
     * 加载会话文件
     */
    private fun loadSessionFiles(sessionId: String) {
        fileCollectionJob?.cancel()
        fileCollectionJob = viewModelScope.launch {
            fileDao.getFilesBySession(sessionId).collect { files ->
                _uiState.update { it.copy(files = files) }
            }
        }
    }

    /**
     * 处理文件传入
     */
    /**
     * 处理文件传入
     */
    private fun handleFileIncoming(event: FileIncomingEvent) {
        viewModelScope.launch {
            try {
                android.util.Log.d("TransferViewModel", "handleFileIncoming: senderId=${event.senderId}")
                android.util.Log.d("TransferViewModel", "handleFileIncoming: fileInfo=${event.fileInfo}")
                
                // 查找或创建会话
                val sessionId = findOrCreateSessionForDevice(event.senderId)
                android.util.Log.d("TransferViewModel", "handleFileIncoming: sessionId=$sessionId")
                
                // 接收文件优先保存到系统下载目录，便于预览、打开和定位。
                val target = createIncomingFileTarget(getApplication(), event.fileInfo)

                fileStreams[event.fileInfo.id] = target.outputStream
                filePaths[event.fileInfo.id] = target.localPath
                target.contentUri?.let { pendingMediaUris[event.fileInfo.id] = it }
                
                val fileEntity = TransferFileEntity(
                    id = event.fileInfo.id,
                    sessionId = sessionId,
                    filename = event.fileInfo.filename,
                    fileSize = event.fileInfo.fileSize,
                    mimeType = event.fileInfo.mimeType,
                    localPath = target.localPath,
                    direction = MessageDirection.RECEIVED.value,
                    status = FileTransferStatus.TRANSFERRING.value,
                    progress = 0f,
                    fileHash = null,
                    createdAt = System.currentTimeMillis(),
                    completedAt = null
                )
                fileDao.insert(fileEntity)
                
                // 手动刷新文件列表（确保 UI 更新）
                if (_uiState.value.selectedSessionId == sessionId) {
                    loadSessionFiles(sessionId)
                }
            } catch (e: Exception) {
                android.util.Log.e("TransferViewModel", "Failed to init incoming file", e)
                cleanupPendingMediaUri(event.fileInfo.id)
            }
        }
    }

    /**
     * 处理文件分块
     */
    private fun handleFileChunk(event: FileChunkEvent) {
        viewModelScope.launch {
            try {
                // 写入文件
                val stream = fileStreams[event.fileId]
                if (stream != null) {
                    withContext(Dispatchers.IO) {
                        stream.write(event.chunk)
                    }
                }
                
                val progress = ((event.chunkIndex + 1).toFloat() / event.totalChunks) * 100
                // 为减少数据库压力，可以节流更新，这里简化
                fileDao.updateProgress(event.fileId, progress)
            } catch (e: Exception) {
                android.util.Log.e("TransferViewModel", "Failed to write chunk", e)
            }
        }
    }

    /**
     * 处理文件完成
     */
    private fun handleFileComplete(event: FileCompleteEvent) {
        viewModelScope.launch {
            try {
                android.util.Log.d("TransferViewModel", "handleFileComplete: fileId=${event.fileId}, hash=${event.fileHash}")

                val stream = fileStreams[event.fileId]
                if (stream != null) {
                    withContext(Dispatchers.IO) {
                        stream.flush()
                        stream.close()
                    }
                    fileStreams.remove(event.fileId)
                }
                finalizePendingMediaUri(event.fileId)

                val localPath = filePaths.remove(event.fileId)
                fileDao.completeTransfer(
                    id = event.fileId,
                    localPath = localPath ?: "",
                    fileHash = event.fileHash,
                    completedAt = System.currentTimeMillis()
                )

                val fileEntity = fileDao.getById(event.fileId)
                if (fileEntity != null) {
                    val sessionId = findOrCreateSessionForDevice(event.senderId)
                    val messageId = UUID.randomUUID().toString()
                    val messageType = if (isImageFile(fileEntity.filename, fileEntity.mimeType, fileEntity.localPath)) {
                        MessageType.IMAGE.value
                    } else {
                        MessageType.FILE.value
                    }
                    messageDao.insert(TransferMessageEntity(
                        id = messageId,
                        sessionId = sessionId,
                        direction = MessageDirection.RECEIVED.value,
                        type = messageType,
                        content = fileEntity.filename,
                        fileId = fileEntity.id,
                        createdAt = System.currentTimeMillis(),
                        readAt = null
                    ))
                    android.util.Log.d("TransferViewModel", "Created file message: ${fileEntity.filename}")
                }
            } catch (e: Exception) {
                android.util.Log.e("TransferViewModel", "Failed to complete file", e)
                cleanupPendingMediaUri(event.fileId)
            }
        }
    }

    /**
     * 查找或创建设备的会话
     */
    private data class IncomingFileTarget(
        val outputStream: OutputStream,
        val localPath: String,
        val contentUri: android.net.Uri? = null
    )

    private fun createIncomingFileTarget(
        context: android.content.Context,
        fileInfo: FileTransferInfo
    ): IncomingFileTarget {
        val resolver = context.contentResolver
        val mimeType = resolveMimeType(fileInfo.filename, fileInfo.mimeType, null)
        val safeName = sanitizeFilename(fileInfo.filename)

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            val values = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Downloads.DISPLAY_NAME, safeName)
                put(android.provider.MediaStore.Downloads.MIME_TYPE, mimeType)
                put(android.provider.MediaStore.Downloads.RELATIVE_PATH, "Download/Mucheng")
                put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("无法创建下载文件")
            val output = resolver.openOutputStream(uri)
                ?: throw IllegalStateException("无法写入下载文件")
            return IncomingFileTarget(
                outputStream = output,
                localPath = uri.toString(),
                contentUri = uri
            )
        }

        val downloadsDir = File(
            android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS),
            "Mucheng"
        )
        if (!downloadsDir.exists()) downloadsDir.mkdirs()

        var file = File(downloadsDir, safeName)
        val ext = file.extension.takeIf { it.isNotBlank() }?.let { ".$it" } ?: ""
        val baseName = file.name.removeSuffix(ext)
        var counter = 1
        while (file.exists()) {
            file = File(downloadsDir, "${baseName}_${counter}${ext}")
            counter++
        }

        return IncomingFileTarget(
            outputStream = FileOutputStream(file),
            localPath = file.absolutePath,
            contentUri = null
        )
    }

    private fun finalizePendingMediaUri(fileId: String) {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) return
        val uri = pendingMediaUris.remove(fileId) ?: return
        runCatching {
            val values = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
            }
            getApplication<Application>().contentResolver.update(uri, values, null, null)
        }.onFailure {
            android.util.Log.w("TransferViewModel", "Failed to publish received file: $uri", it)
        }
    }

    private fun cleanupPendingMediaUri(fileId: String) {
        val uri = pendingMediaUris.remove(fileId) ?: return
        runCatching {
            getApplication<Application>().contentResolver.delete(uri, null, null)
        }.onFailure {
            android.util.Log.w("TransferViewModel", "Failed to delete incomplete received file: $uri", it)
        }
    }

    private fun sanitizeFilename(filename: String): String {
        val name = filename.ifBlank { "received-${System.currentTimeMillis()}" }
        return name.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").take(180)
    }

    private suspend fun findOrCreateSessionForDevice(deviceId: String): String = sessionMutex.withLock {
        // 先检查是否有活跃的会话
        val existingSession = _uiState.value.sessions.find { 
            it.peerDeviceId == deviceId && it.endedAt == null 
        }
        if (existingSession != null) {
            return existingSession.id
        }
        
        // 也从数据库中查找活跃会话（UI state 可能未更新）
        val dbSession = sessionDao.getActiveSessionByDevice(deviceId)
        if (dbSession != null) {
            return dbSession.id
        }
        
        // 创建新会话
        val device = _uiState.value.onlineDevices.find { it.id == deviceId }
        
        // 根据当前连接状态确定连接类型
        val currentConnectionType = when (val state = _uiState.value.connectionState) {
            is ConnectionState.Connected -> state.mode.value
            else -> ConnectionMode.LAN.value
        }
        
        return if (device != null) {
            createSession(device)
        } else {
            // 设备不在线，尝试从数据库获取设备信息
            val dbDevice = deviceDao.getById(deviceId)
            val deviceName = dbDevice?.name ?: "未知设备"
            
            // 如果数据库中也没有设备记录，先创建设备记录
            if (dbDevice == null) {
                deviceDao.insert(TransferDeviceEntity(
                    id = deviceId,
                    name = deviceName,
                    type = (device?.type ?: DeviceType.DESKTOP).value,
                    lastIp = null,
                    lastPort = null,
                    lastSeen = System.currentTimeMillis(),
                    isFavorite = false,
                    createdAt = System.currentTimeMillis()
                ))
            }
            
            // 创建会话（使用当前连接类型）
            val sessionId = UUID.randomUUID().toString()
            val session = TransferSessionEntity(
                id = sessionId,
                peerDeviceId = deviceId,
                peerDeviceName = deviceName,
                connectionType = currentConnectionType,
                startedAt = System.currentTimeMillis(),
                endedAt = null
            )
            sessionDao.insert(session)
            sessionId
        }
    }

    // ============================================
    // 配对处理
    // ============================================

    /**
     * 处理配对成功
     */
    private fun handlePairSuccess(event: PairSuccessEvent) {
        viewModelScope.launch {
            android.util.Log.d("TransferViewModel", "handlePairSuccess: sessionId=${event.sessionId}, peerId=${event.peerId}, peerName=${event.peerName}")
            val peerType = _uiState.value.onlineDevices.find { it.id == event.peerId }?.type ?: DeviceType.DESKTOP

            // 保存设备信息
            val existingDevice = deviceDao.getById(event.peerId)
            if (existingDevice == null) {
                deviceDao.insert(TransferDeviceEntity(
                    id = event.peerId,
                    name = event.peerName,
                    type = peerType.value,
                    lastIp = null,
                    lastPort = null,
                    lastSeen = System.currentTimeMillis(),
                    isFavorite = false,
                    createdAt = System.currentTimeMillis()
                ))
                android.util.Log.d("TransferViewModel", "handlePairSuccess: Created new device record")
            }
            
            // 检查是否已存在相同的会话
            val existingSession = sessionDao.getById(event.sessionId)
            if (existingSession != null) {
                android.util.Log.d("TransferViewModel", "handlePairSuccess: Session already exists, selecting it")
                selectSession(event.sessionId)
                return@launch
            }
            
            // 创建会话
            val connectionType = when (val state = _uiState.value.connectionState) {
                is ConnectionState.Connected -> state.mode.value
                else -> ConnectionMode.LAN.value
            }
            val session = TransferSessionEntity(
                id = event.sessionId,
                peerDeviceId = event.peerId,
                peerDeviceName = event.peerName,
                connectionType = connectionType,
                startedAt = System.currentTimeMillis(),
                endedAt = null
            )
            sessionDao.insert(session)
            android.util.Log.d("TransferViewModel", "handlePairSuccess: Created new session")
            
            // 等待一小段时间让 Flow 更新
            kotlinx.coroutines.delay(100)
            
            selectSession(event.sessionId)
        }
    }

    // ============================================
    // 扫码相关
    // ============================================

    fun setScanning(scanning: Boolean) {
        _uiState.update { it.copy(isScanning = scanning, scanError = null) }
    }

    fun clearScanError() {
        _uiState.update { it.copy(scanError = null) }
    }

    fun openFile(fileId: String) {
        viewModelScope.launch {
            val context = getApplication<Application>()
            val file = fileDao.getById(fileId) ?: run {
                android.widget.Toast.makeText(context, "文件记录不存在", android.widget.Toast.LENGTH_SHORT).show()
                return@launch
            }
            val localPath = file.localPath ?: run {
                android.widget.Toast.makeText(context, "文件路径不存在", android.widget.Toast.LENGTH_SHORT).show()
                return@launch
            }

            try {
                val openMimeType = resolveMimeType(file.filename, file.mimeType, localPath)
                if (localPath.startsWith("content://")) {
                    val uri = android.net.Uri.parse(localPath)
                    openUriWithMime(context, uri, openMimeType, isApkFile(file.filename, file.mimeType, localPath))
                    return@launch
                }

                val javaFile = java.io.File(localPath)
                if (!javaFile.exists()) {
                    android.widget.Toast.makeText(context, "文件不存在", android.widget.Toast.LENGTH_SHORT).show()
                    return@launch
                }

                val uri = androidx.core.content.FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    javaFile
                )
                openUriWithMime(context, uri, openMimeType, isApkFile(file.filename, file.mimeType, localPath))
            } catch (e: Exception) {
                android.util.Log.e("TransferViewModel", "Failed to open file", e)
                android.widget.Toast.makeText(context, "打开失败：${e.message ?: "未知错误"}", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun isImageFile(filename: String, mimeType: String?, localPath: String? = null): Boolean {
        if (mimeType?.startsWith("image/") == true) return true
        val candidate = listOf(filename, localPath.orEmpty()).firstOrNull { it.isNotBlank() }?.lowercase() ?: return false
        return candidate.endsWith(".png") ||
            candidate.endsWith(".jpg") ||
            candidate.endsWith(".jpeg") ||
            candidate.endsWith(".gif") ||
            candidate.endsWith(".webp") ||
            candidate.endsWith(".bmp") ||
            candidate.endsWith(".heic") ||
            candidate.endsWith(".heif")
    }

    private fun isApkFile(filename: String, mimeType: String?, localPath: String? = null): Boolean {
        if (mimeType == "application/vnd.android.package-archive") return true
        return listOf(filename, localPath.orEmpty()).any { it.lowercase().endsWith(".apk") }
    }

    private fun resolveMimeType(filename: String, mimeType: String?, localPath: String? = null): String {
        if (isApkFile(filename, mimeType, localPath)) {
            return "application/vnd.android.package-archive"
        }
        if (!mimeType.isNullOrBlank() && mimeType != "application/octet-stream") {
            return mimeType
        }

        val candidate = listOf(filename, localPath.orEmpty()).firstOrNull { it.isNotBlank() }?.lowercase().orEmpty()
        return when {
            candidate.endsWith(".jpg") || candidate.endsWith(".jpeg") -> "image/jpeg"
            candidate.endsWith(".png") -> "image/png"
            candidate.endsWith(".gif") -> "image/gif"
            candidate.endsWith(".webp") -> "image/webp"
            candidate.endsWith(".pdf") -> "application/pdf"
            candidate.endsWith(".txt") -> "text/plain"
            candidate.endsWith(".zip") -> "application/zip"
            candidate.endsWith(".apk") -> "application/vnd.android.package-archive"
            else -> mimeType?.takeIf { it.isNotBlank() } ?: "application/octet-stream"
        }
    }

    private fun startChooserFromApplication(
        context: android.content.Context,
        intent: android.content.Intent,
        title: String
    ) {
        val chooser = android.content.Intent.createChooser(intent, title).apply {
            addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            context.startActivity(chooser)
        } catch (e: android.content.ActivityNotFoundException) {
            android.widget.Toast.makeText(context, "没有可打开此文件的应用", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    private fun openUriWithMime(
        context: android.content.Context,
        uri: android.net.Uri,
        mimeType: String,
        isApk: Boolean
    ) {
        val intent = if (isApk) {
            android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                putExtra(android.content.Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
                addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        } else {
            android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mimeType)
                addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }

        try {
            if (isApk) {
                context.startActivity(intent)
            } else {
                startChooserFromApplication(context, intent, "打开文件")
            }
        } catch (e: android.content.ActivityNotFoundException) {
            android.widget.Toast.makeText(context, "没有可打开此文件的应用", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    fun openFileFolder(fileId: String) {
        viewModelScope.launch {
            val context = getApplication<Application>()
            val file = fileDao.getById(fileId) ?: run {
                android.widget.Toast.makeText(context, "文件记录不存在", android.widget.Toast.LENGTH_SHORT).show()
                return@launch
            }
            val localPath = file.localPath ?: run {
                android.widget.Toast.makeText(context, "文件路径不存在", android.widget.Toast.LENGTH_SHORT).show()
                return@launch
            }

            try {
                if (localPath.startsWith("content://")) {
                    openDownloadsLocation(context)
                    return@launch
                }

                val javaFile = java.io.File(localPath)
                val parent = javaFile.parentFile

                if (parent != null && parent.exists()) {
                    if (!openDirectoryLocation(context, parent)) {
                        openDownloadsLocation(context)
                    }
                } else {
                    openDownloadsLocation(context)
                }
            } catch (e: Exception) {
                android.util.Log.e("TransferViewModel", "Failed to open folder", e)
                android.widget.Toast.makeText(context, "打开文件夹失败：${e.message ?: "未知错误"}", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun openDirectoryLocation(context: android.content.Context, directory: File): Boolean {
        val contentUri = runCatching {
            androidx.core.content.FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                directory
            )
        }.getOrNull()
        val fileUri = android.net.Uri.fromFile(directory)
        val intents = listOfNotNull(
            contentUri?.let { uri ->
                android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "resource/folder")
                    addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            },
            contentUri?.let { uri ->
                android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "vnd.android.document/directory")
                    addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            },
            android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                setDataAndType(fileUri, "resource/folder")
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            },
            android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                data = fileUri
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        )

        for (intent in intents) {
            val opened = runCatching {
                context.startActivity(intent)
                true
            }.getOrDefault(false)
            if (opened) return true
        }
        return false
    }

    private fun openDownloadsLocation(context: android.content.Context) {
        val intent = android.content.Intent(android.app.DownloadManager.ACTION_VIEW_DOWNLOADS).apply {
            addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(intent)
        } catch (e: android.content.ActivityNotFoundException) {
            android.widget.Toast.makeText(context, "系统没有可打开下载目录的文件管理器", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    // ============================================
    // 清理
    // ============================================

    override fun onCleared() {
        super.onCleared()
        transferClient.destroy()
    }
}
