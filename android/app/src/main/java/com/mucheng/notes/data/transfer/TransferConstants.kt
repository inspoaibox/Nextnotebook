/**
 * LAN Transfer Assistant - Android 常量定义
 * 
 * 与桌面端 constants.ts 保持一致
 */

package com.mucheng.notes.data.transfer

/**
 * 传输配置常量
 */
object TransferConstants {
    // 文件传输
    const val CHUNK_SIZE = 64 * 1024              // 64KB 分块大小
    const val MAX_FILE_SIZE = 100L * 1024 * 1024  // 100MB 最大文件大小
    
    // 时间配置
    const val QR_CODE_EXPIRY = 5 * 60 * 1000L     // 5 分钟二维码过期
    const val SESSION_TIMEOUT = 30 * 60 * 1000L  // 30 分钟会话超时
    const val HEARTBEAT_INTERVAL = 30 * 1000L    // 30 秒心跳间隔
    
    // 重试配置
    const val MAX_RETRY = 3                       // 最大重试次数
    const val RETRY_INTERVAL = 1000L              // 1 秒重试间隔
    const val RETRY_BACKOFF_MULTIPLIER = 2        // 指数退避倍数
    
    // 连接配置
    const val MAX_CONNECTIONS = 10                // 最大同时连接数
    const val PORT_RETRY_ATTEMPTS = 3             // 端口冲突重试次数
    const val PORT_RANGE_START = 45000            // 随机端口范围起始
    const val PORT_RANGE_END = 50000              // 随机端口范围结束
    
    // 临时文件
    const val TEMP_FILE_CLEANUP_DELAY = 5000L     // 5 秒后清理临时文件
    const val TEMP_DIR_NAME = "transfer-temp"     // 临时目录名称
    
    // 数据库
    const val DATABASE_NAME = "transfer.db"       // 独立数据库文件名
    const val SCHEMA_VERSION = 1                  // 数据库 schema 版本
}

/**
 * 错误码枚举
 */
enum class TransferErrorCode(val code: String, val message: String) {
    // 连接错误 (E001-E099)
    CONNECTION_FAILED("E001", "连接失败，请检查网络"),
    CONNECTION_TIMEOUT("E002", "连接超时"),
    PORT_IN_USE("E003", "端口被占用，正在重试..."),
    NETWORK_UNAVAILABLE("E004", "网络不可用"),
    CONNECTION_CLOSED("E005", "连接已关闭"),
    
    // 配对错误 (E100-E199)
    QR_CODE_EXPIRED("E101", "二维码已过期，请重新生成"),
    QR_CODE_INVALID("E102", "无效的二维码"),
    DEVICE_ID_CONFLICT("E103", "设备 ID 冲突"),
    PAIRING_REJECTED("E104", "配对请求被拒绝"),
    PAIRING_TIMEOUT("E105", "配对超时"),
    
    // 传输错误 (E200-E299)
    FILE_TOO_LARGE("E201", "文件超过 100MB 限制"),
    FILE_NOT_FOUND("E202", "文件不存在"),
    FILE_READ_ERROR("E203", "文件读取失败"),
    FILE_WRITE_ERROR("E204", "文件写入失败"),
    DISK_SPACE_INSUFFICIENT("E205", "磁盘空间不足"),
    TRANSFER_INTERRUPTED("E206", "传输中断"),
    CHUNK_INTEGRITY_ERROR("E207", "数据块校验失败"),
    TRANSFER_CANCELLED("E208", "传输已取消"),
    
    // 会话错误 (E300-E399)
    SESSION_NOT_FOUND("E301", "会话不存在"),
    SESSION_EXPIRED("E302", "会话已过期"),
    SESSION_CLOSED("E303", "会话已关闭"),
    SESSION_INVALID("E304", "无效的会话"),
    
    // 服务器错误 (E400-E499)
    SERVER_START_FAILED("E401", "服务器启动失败"),
    SERVER_FULL("E402", "服务器连接数已满"),
    RELAY_SERVER_UNAVAILABLE("E403", "中继服务器不可用"),
    SERVER_ALREADY_RUNNING("E404", "服务器已在运行"),
    SERVER_NOT_RUNNING("E405", "服务器未运行"),
    
    // 权限错误 (E500-E599)
    PERMISSION_DENIED("E501", "权限被拒绝"),
    FILE_ACCESS_DENIED("E502", "无法访问文件"),
    CAMERA_PERMISSION_DENIED("E503", "相机权限被拒绝"),
    STORAGE_PERMISSION_DENIED("E504", "存储权限被拒绝"),
    
    // 未知错误
    UNKNOWN_ERROR("E999", "未知错误");
    
    companion object {
        fun fromCode(code: String): TransferErrorCode {
            return entries.find { it.code == code } ?: UNKNOWN_ERROR
        }
    }
}

/**
 * Socket.IO 事件名称
 */
object SocketEvents {
    // 设备相关
    const val DEVICE_REGISTER = "device:register"
    const val DEVICE_LIST = "device:list"
    const val DEVICE_ONLINE = "device:online"
    const val DEVICE_OFFLINE = "device:offline"
    
    // 配对相关
    const val PAIR_REQUEST = "pair:request"
    const val PAIR_ACCEPT = "pair:accept"
    const val PAIR_REJECT = "pair:reject"
    const val PAIR_SUCCESS = "pair:success"
    
    // 消息相关
    const val MESSAGE_SEND = "message:send"
    const val MESSAGE_RECEIVE = "message:receive"
    const val MESSAGE_READ = "message:read"
    
    // 文件传输相关
    const val FILE_START = "file:start"
    const val FILE_CHUNK = "file:chunk"
    const val FILE_COMPLETE = "file:complete"
    const val FILE_INCOMING = "file:incoming"
    const val FILE_PROGRESS = "file:progress"
    const val FILE_CANCEL = "file:cancel"
    const val FILE_ERROR = "file:error"
    
    // 通用
    const val ERROR = "error"
    const val HEARTBEAT = "heartbeat"
    const val DISCONNECT = "disconnect"
}

/**
 * 设备类型
 */
enum class DeviceType(val value: String) {
    DESKTOP("desktop"),
    ANDROID("android")
}

/**
 * 连接模式
 */
enum class ConnectionMode(val value: String) {
    LAN("lan"),
    RELAY("relay")
}

/**
 * 消息类型
 */
enum class MessageType(val value: String) {
    TEXT("text"),
    FILE("file"),
    IMAGE("image")
}

/**
 * 消息方向
 */
enum class MessageDirection(val value: String) {
    SENT("sent"),
    RECEIVED("received")
}

/**
 * 文件传输状态
 */
enum class FileTransferStatus(val value: String) {
    PENDING("pending"),
    TRANSFERRING("transferring"),
    COMPLETED("completed"),
    FAILED("failed"),
    CANCELLED("cancelled")
}

/**
 * 二维码配对数据
 */
data class PairingQRData(
    val deviceId: String,
    val deviceName: String,
    val serverIp: String,
    val serverPort: Int,
    val timestamp: Long,
    val expiresAt: Long,
    val version: String = "1.0"
) {
    /**
     * 检查二维码是否过期
     */
    fun isExpired(): Boolean = System.currentTimeMillis() > expiresAt
    
    companion object {
        /**
         * 创建配对二维码数据
         */
        fun create(
            deviceId: String,
            deviceName: String,
            serverIp: String,
            serverPort: Int
        ): PairingQRData {
            val now = System.currentTimeMillis()
            return PairingQRData(
                deviceId = deviceId,
                deviceName = deviceName,
                serverIp = serverIp,
                serverPort = serverPort,
                timestamp = now,
                expiresAt = now + TransferConstants.QR_CODE_EXPIRY
            )
        }
    }
}

/**
 * 传输错误
 */
data class TransferError(
    val code: TransferErrorCode,
    val message: String = code.message,
    val details: Any? = null,
    val timestamp: Long = System.currentTimeMillis()
)
