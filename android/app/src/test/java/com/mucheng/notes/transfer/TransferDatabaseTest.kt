/**
 * TransferDatabase 单元测试
 */

package com.mucheng.notes.transfer

import com.mucheng.notes.data.local.transfer.*
import com.mucheng.notes.data.transfer.*
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

/**
 * Entity 和常量测试
 * 
 * 注意：Room 数据库的完整测试需要 Android Instrumented Tests
 * 这里测试 Entity 创建和常量定义
 */
class TransferDatabaseTest {

    // ============================================
    // Entity 创建测试
    // ============================================

    @Test
    fun `should create TransferDeviceEntity`() {
        val device = TransferDeviceEntity(
            id = UUID.randomUUID().toString(),
            name = "Test Device",
            type = DeviceType.DESKTOP.value,
            lastIp = "192.168.1.100",
            lastPort = 45678,
            lastSeen = System.currentTimeMillis(),
            isFavorite = false,
            createdAt = System.currentTimeMillis()
        )
        
        assertEquals("Test Device", device.name)
        assertEquals("desktop", device.type)
        assertFalse(device.isFavorite)
    }

    @Test
    fun `should create TransferSessionEntity`() {
        val session = TransferSessionEntity(
            id = UUID.randomUUID().toString(),
            peerDeviceId = UUID.randomUUID().toString(),
            peerDeviceName = "Peer Device",
            connectionType = ConnectionMode.LAN.value,
            startedAt = System.currentTimeMillis(),
            endedAt = null
        )
        
        assertEquals("Peer Device", session.peerDeviceName)
        assertEquals("lan", session.connectionType)
        assertNull(session.endedAt)
    }

    @Test
    fun `should create TransferMessageEntity`() {
        val message = TransferMessageEntity(
            id = UUID.randomUUID().toString(),
            sessionId = UUID.randomUUID().toString(),
            direction = MessageDirection.SENT.value,
            type = MessageType.TEXT.value,
            content = "Hello, World!",
            fileId = null,
            createdAt = System.currentTimeMillis(),
            readAt = null
        )
        
        assertEquals("Hello, World!", message.content)
        assertEquals("sent", message.direction)
        assertEquals("text", message.type)
    }

    @Test
    fun `should create TransferFileEntity`() {
        val file = TransferFileEntity(
            id = UUID.randomUUID().toString(),
            sessionId = UUID.randomUUID().toString(),
            filename = "test.pdf",
            fileSize = 1024 * 1024,
            mimeType = "application/pdf",
            localPath = null,
            direction = MessageDirection.SENT.value,
            status = FileTransferStatus.PENDING.value,
            progress = 0f,
            fileHash = null,
            createdAt = System.currentTimeMillis(),
            completedAt = null
        )
        
        assertEquals("test.pdf", file.filename)
        assertEquals(1024 * 1024, file.fileSize)
        assertEquals("pending", file.status)
        assertEquals(0f, file.progress)
    }

    // ============================================
    // 常量测试
    // ============================================

    @Test
    fun `should have correct transfer constants`() {
        assertEquals(64 * 1024, TransferConstants.CHUNK_SIZE)
        assertEquals(100L * 1024 * 1024, TransferConstants.MAX_FILE_SIZE)
        assertEquals(5 * 60 * 1000L, TransferConstants.QR_CODE_EXPIRY)
        assertEquals(30 * 60 * 1000L, TransferConstants.SESSION_TIMEOUT)
        assertEquals(3, TransferConstants.MAX_RETRY)
    }

    @Test
    fun `should have correct socket events`() {
        assertEquals("device:register", SocketEvents.DEVICE_REGISTER)
        assertEquals("message:send", SocketEvents.MESSAGE_SEND)
        assertEquals("file:chunk", SocketEvents.FILE_CHUNK)
    }

    // ============================================
    // 错误码测试
    // ============================================

    @Test
    fun `should get error code from string`() {
        val error = TransferErrorCode.fromCode("E001")
        assertEquals(TransferErrorCode.CONNECTION_FAILED, error)
        assertEquals("连接失败，请检查网络", error.message)
    }

    @Test
    fun `should return UNKNOWN_ERROR for invalid code`() {
        val error = TransferErrorCode.fromCode("INVALID")
        assertEquals(TransferErrorCode.UNKNOWN_ERROR, error)
    }

    @Test
    fun `should have all error codes with messages`() {
        TransferErrorCode.entries.forEach { errorCode ->
            assertNotNull(errorCode.code)
            assertNotNull(errorCode.message)
            assertTrue(errorCode.code.isNotEmpty())
            assertTrue(errorCode.message.isNotEmpty())
        }
    }

    // ============================================
    // 二维码数据测试
    // ============================================

    @Test
    fun `should create PairingQRData`() {
        val qrData = PairingQRData.create(
            deviceId = "device-123",
            deviceName = "My Desktop",
            serverIp = "192.168.1.100",
            serverPort = 45678
        )
        
        assertEquals("device-123", qrData.deviceId)
        assertEquals("My Desktop", qrData.deviceName)
        assertEquals("192.168.1.100", qrData.serverIp)
        assertEquals(45678, qrData.serverPort)
        assertEquals("1.0", qrData.version)
        assertTrue(qrData.expiresAt > qrData.timestamp)
    }

    @Test
    fun `should detect expired QR code`() {
        val expiredQRData = PairingQRData(
            deviceId = "device-123",
            deviceName = "My Desktop",
            serverIp = "192.168.1.100",
            serverPort = 45678,
            timestamp = System.currentTimeMillis() - 10 * 60 * 1000, // 10 minutes ago
            expiresAt = System.currentTimeMillis() - 5 * 60 * 1000   // Expired 5 minutes ago
        )
        
        assertTrue(expiredQRData.isExpired())
    }

    @Test
    fun `should detect valid QR code`() {
        val validQRData = PairingQRData.create(
            deviceId = "device-123",
            deviceName = "My Desktop",
            serverIp = "192.168.1.100",
            serverPort = 45678
        )
        
        assertFalse(validQRData.isExpired())
    }

    // ============================================
    // 枚举测试
    // ============================================

    @Test
    fun `should have correct DeviceType values`() {
        assertEquals("desktop", DeviceType.DESKTOP.value)
        assertEquals("android", DeviceType.ANDROID.value)
    }

    @Test
    fun `should have correct ConnectionMode values`() {
        assertEquals("lan", ConnectionMode.LAN.value)
        assertEquals("relay", ConnectionMode.RELAY.value)
    }

    @Test
    fun `should have correct MessageType values`() {
        assertEquals("text", MessageType.TEXT.value)
        assertEquals("file", MessageType.FILE.value)
        assertEquals("image", MessageType.IMAGE.value)
    }

    @Test
    fun `should have correct FileTransferStatus values`() {
        assertEquals("pending", FileTransferStatus.PENDING.value)
        assertEquals("transferring", FileTransferStatus.TRANSFERRING.value)
        assertEquals("completed", FileTransferStatus.COMPLETED.value)
        assertEquals("failed", FileTransferStatus.FAILED.value)
        assertEquals("cancelled", FileTransferStatus.CANCELLED.value)
    }

    // ============================================
    // TransferError 测试
    // ============================================

    @Test
    fun `should create TransferError`() {
        val error = TransferError(
            code = TransferErrorCode.FILE_TOO_LARGE,
            details = mapOf("fileSize" to 200 * 1024 * 1024)
        )
        
        assertEquals(TransferErrorCode.FILE_TOO_LARGE, error.code)
        assertEquals("文件超过 100MB 限制", error.message)
        assertNotNull(error.details)
        assertTrue(error.timestamp > 0)
    }

    @Test
    fun `should create TransferError with custom message`() {
        val error = TransferError(
            code = TransferErrorCode.UNKNOWN_ERROR,
            message = "Custom error message"
        )
        
        assertEquals("Custom error message", error.message)
    }
}
