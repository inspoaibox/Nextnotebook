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
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
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
                // TODO: 显示配对请求对话框
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
                transferClient.connectFromQRData(data)
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
    fun connectToRelay(serverUrl: String) {
        transferClient.connect(serverUrl, 0, ConnectionMode.RELAY)
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
                version = json.optString("version", "1.0")
            )
        } catch (e: Exception) {
            null
        }
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

    /**
     * 创建新会话
     */
    fun createSession(device: OnlineDevice): String {
        val sessionId = UUID.randomUUID().toString()
        val session = TransferSessionEntity(
            id = sessionId,
            peerDeviceId = device.id,
            peerDeviceName = device.name,
            connectionType = ConnectionMode.LAN.value,
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
        viewModelScope.launch {
            messageDao.observeMessagesBySession(sessionId).collect { messages ->
                _uiState.update { it.copy(messages = messages) }
            }
        }
    }

    /**
     * 发送文本消息
     */
    fun sendTextMessage(content: String) {
        val sessionId = _uiState.value.selectedSessionId ?: return
        val session = _uiState.value.sessions.find { it.id == sessionId } ?: return
        
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
        
        viewModelScope.launch {
            // 保存到本地
            messageDao.insert(message)
            
            // 发送到对方
            transferClient.sendMessage(
                targetDeviceId = session.peerDeviceId,
                sessionId = sessionId,
                message = TransferMessageData(
                    id = messageId,
                    type = MessageType.TEXT,
                    content = content
                )
            )
        }
    }

    /**
     * 发送文件
     */
    fun sendFile(uri: android.net.Uri) {
        val sessionId = _uiState.value.selectedSessionId ?: return
        val session = _uiState.value.sessions.find { it.id == sessionId } ?: return
        
        viewModelScope.launch {
            try {
                val sentFileInfo = transferClient.sendFileFromUri(
                    targetDeviceId = session.peerDeviceId,
                    sessionId = sessionId,
                    uri = uri,
                    onProgress = { progress ->
                        // 更新进度 - 使用局部变量
                    }
                )
                
                // 保存文件记录到本地
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
                    type = MessageType.FILE.value,
                    content = sentFileInfo.filename,
                    fileId = sentFileInfo.id,
                    createdAt = System.currentTimeMillis(),
                    readAt = null
                )
                messageDao.insert(message)
                
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
            val message = TransferMessageEntity(
                id = event.message.id,
                sessionId = event.sessionId,
                direction = MessageDirection.RECEIVED.value,
                type = event.message.type.value,
                content = event.message.content,
                fileId = event.message.fileId,
                createdAt = System.currentTimeMillis(),
                readAt = if (_uiState.value.selectedSessionId == event.sessionId) System.currentTimeMillis() else null
            )
            messageDao.insert(message)
            
            // 如果当前会话是这个会话，标记为已读
            if (_uiState.value.selectedSessionId == event.sessionId) {
                transferClient.sendMessageRead(event.senderId, listOf(event.message.id))
            } else {
                // 显示通知
                val device = deviceDao.getById(event.senderId)
                val senderName = device?.name ?: "未知设备"
                TransferNotificationService.showMessageNotification(
                    context = getApplication(),
                    senderName = senderName,
                    messageContent = event.message.content,
                    sessionId = event.sessionId
                )
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
        viewModelScope.launch {
            fileDao.getFilesBySession(sessionId).collect { files ->
                _uiState.update { it.copy(files = files) }
            }
        }
    }

    /**
     * 处理文件传入
     */
    private fun handleFileIncoming(event: FileIncomingEvent) {
        viewModelScope.launch {
            // 查找或创建会话
            val sessionId = findOrCreateSessionForDevice(event.senderId)
            
            val file = TransferFileEntity(
                id = event.fileInfo.id,
                sessionId = sessionId,
                filename = event.fileInfo.filename,
                fileSize = event.fileInfo.fileSize,
                mimeType = event.fileInfo.mimeType,
                localPath = null,
                direction = MessageDirection.RECEIVED.value,
                status = FileTransferStatus.PENDING.value,
                progress = 0f,
                fileHash = null,
                createdAt = System.currentTimeMillis(),
                completedAt = null
            )
            fileDao.insert(file)
        }
    }

    /**
     * 处理文件分块
     */
    private fun handleFileChunk(event: FileChunkEvent) {
        viewModelScope.launch {
            val progress = (event.chunkIndex.toFloat() / event.totalChunks) * 100
            fileDao.updateProgress(event.fileId, progress)
            
            // TODO: 写入临时文件
        }
    }

    /**
     * 处理文件完成
     */
    private fun handleFileComplete(event: FileCompleteEvent) {
        viewModelScope.launch {
            // TODO: 组装完整文件并保存
            fileDao.completeTransfer(
                id = event.fileId,
                localPath = "", // TODO: 实际保存路径
                fileHash = event.fileHash,
                completedAt = System.currentTimeMillis()
            )
        }
    }

    /**
     * 查找或创建设备的会话
     */
    private suspend fun findOrCreateSessionForDevice(deviceId: String): String {
        val existingSession = _uiState.value.sessions.find { 
            it.peerDeviceId == deviceId && it.endedAt == null 
        }
        if (existingSession != null) {
            return existingSession.id
        }
        
        // 创建新会话
        val device = _uiState.value.onlineDevices.find { it.id == deviceId }
        return if (device != null) {
            createSession(device)
        } else {
            // 设备不在线，创建临时会话
            val sessionId = UUID.randomUUID().toString()
            val session = TransferSessionEntity(
                id = sessionId,
                peerDeviceId = deviceId,
                peerDeviceName = "Unknown Device",
                connectionType = ConnectionMode.LAN.value,
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
            // 保存设备信息
            val existingDevice = deviceDao.getById(event.peerId)
            if (existingDevice == null) {
                deviceDao.insert(TransferDeviceEntity(
                    id = event.peerId,
                    name = event.peerName,
                    type = DeviceType.DESKTOP.value,
                    lastIp = null,
                    lastPort = null,
                    lastSeen = System.currentTimeMillis(),
                    isFavorite = false,
                    createdAt = System.currentTimeMillis()
                ))
            }
            
            // 创建会话
            val session = TransferSessionEntity(
                id = event.sessionId,
                peerDeviceId = event.peerId,
                peerDeviceName = event.peerName,
                connectionType = ConnectionMode.LAN.value,
                startedAt = System.currentTimeMillis(),
                endedAt = null
            )
            sessionDao.insert(session)
            
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

    // ============================================
    // 清理
    // ============================================

    override fun onCleared() {
        super.onCleared()
        transferClient.destroy()
    }
}
