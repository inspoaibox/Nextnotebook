package com.mucheng.notes.security

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.experimental.and

/**
 * TOTP 代码数据
 */
data class TOTPCode(
    val code: String,
    val remainingSeconds: Int
)

/**
 * TOTP 生成器接口
 */
interface TOTPGenerator {
    
    /**
     * 生成 TOTP 代码
     * @param secret Base32 编码的密钥
     * @param time 时间戳（毫秒），默认当前时间
     * @return 6 位数字代码
     */
    fun generateCode(secret: String, time: Long = System.currentTimeMillis()): String
    
    /**
     * 获取当前周期剩余秒数
     */
    fun getRemainingSeconds(): Int
    
    /**
     * 观察 TOTP 代码变化
     * @param secret Base32 编码的密钥
     * @return 持续发射 TOTPCode 的 Flow
     */
    fun observeCode(secret: String): Flow<TOTPCode>
}

/**
 * TOTP 生成器实现
 * 遵循 RFC 6238 标准
 */
@Singleton
class TOTPGeneratorImpl @Inject constructor() : TOTPGenerator {
    
    companion object {
        private const val TIME_STEP = 30L // 30 秒
        private const val CODE_DIGITS = 6
        private const val HMAC_ALGORITHM = "HmacSHA1"
        
        // Base32 字符集
        private const val BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    }
    
    override fun generateCode(secret: String, time: Long): String {
        // 验证密钥是否有效
        val cleanSecret = secret.uppercase().replace(" ", "").replace("-", "")
        if (cleanSecret.isEmpty()) {
            return "------"
        }
        
        // 验证是否为有效的 Base32 字符
        if (!cleanSecret.all { it in BASE32_CHARS || it == '=' }) {
            return "------"
        }
        
        return try {
            val key = base32Decode(cleanSecret)
            if (key.isEmpty()) {
                return "------"
            }
            
            val counter = time / 1000 / TIME_STEP
            
            val counterBytes = ByteArray(8)
            var value = counter
            for (i in 7 downTo 0) {
                counterBytes[i] = (value and 0xFF).toByte()
                value = value shr 8
            }
            
            val mac = Mac.getInstance(HMAC_ALGORITHM)
            mac.init(SecretKeySpec(key, HMAC_ALGORITHM))
            val hash = mac.doFinal(counterBytes)
            
            val offset = (hash[hash.size - 1] and 0x0F).toInt()
            val binary = ((hash[offset].toInt() and 0x7F) shl 24) or
                    ((hash[offset + 1].toInt() and 0xFF) shl 16) or
                    ((hash[offset + 2].toInt() and 0xFF) shl 8) or
                    (hash[offset + 3].toInt() and 0xFF)
            
            val otp = binary % Math.pow(10.0, CODE_DIGITS.toDouble()).toInt()
            otp.toString().padStart(CODE_DIGITS, '0')
        } catch (e: Exception) {
            // 任何异常都返回占位符，避免崩溃
            "------"
        }
    }
    
    override fun getRemainingSeconds(): Int {
        val currentSecond = (System.currentTimeMillis() / 1000) % TIME_STEP
        return (TIME_STEP - currentSecond).toInt()
    }
    
    override fun observeCode(secret: String): Flow<TOTPCode> = flow {
        // 如果密钥为空或无效，不启动 Flow
        val cleanSecret = secret.uppercase().replace(" ", "").replace("-", "")
        if (cleanSecret.isEmpty()) {
            emit(TOTPCode("------", 30))
            return@flow
        }
        
        while (true) {
            try {
                val code = generateCode(secret)
                val remaining = getRemainingSeconds()
                emit(TOTPCode(code, remaining))
            } catch (e: Exception) {
                emit(TOTPCode("------", 30))
            }
            
            // 等待到下一秒
            delay(1000)
        }
    }
    
    /**
     * Base32 解码
     */
    private fun base32Decode(input: String): ByteArray {
        val cleanInput = input.replace("=", "")
        val output = ByteArray(cleanInput.length * 5 / 8)
        
        var buffer = 0
        var bitsLeft = 0
        var outputIndex = 0
        
        for (char in cleanInput) {
            val value = BASE32_CHARS.indexOf(char)
            if (value < 0) continue
            
            buffer = (buffer shl 5) or value
            bitsLeft += 5
            
            if (bitsLeft >= 8) {
                bitsLeft -= 8
                output[outputIndex++] = (buffer shr bitsLeft).toByte()
            }
        }
        
        return output.copyOf(outputIndex)
    }
}
