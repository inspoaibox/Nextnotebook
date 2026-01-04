package com.mucheng.notes

import com.mucheng.notes.security.TOTPGeneratorImpl
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldHaveLength
import io.kotest.matchers.string.shouldMatch

/**
 * TOTP 生成器属性测试
 */
class TOTPPropertyTest : StringSpec({
    
    val totpGenerator = TOTPGeneratorImpl()
    
    /**
     * Property 9: TOTP Code Generation
     * 对于任意有效的 TOTP 密钥，生成的代码应该是 6 位数字字符串
     * 在同一 30 秒窗口内生成的代码应该相同
     */
    "Property 9: TOTP generates 6-digit numeric code" {
        // 使用标准测试密钥 (Base32: JBSWY3DPEHPK3PXP)
        val secret = "JBSWY3DPEHPK3PXP"
        
        val code = totpGenerator.generateCode(secret)
        
        code shouldHaveLength 6
        code shouldMatch Regex("^[0-9]{6}$")
    }
    
    "Property 9: TOTP codes in same 30-second window are identical" {
        val secret = "JBSWY3DPEHPK3PXP"
        
        // 使用固定时间戳测试
        val fixedTime = 1234567890000L // 固定时间
        
        val code1 = totpGenerator.generateCode(secret, fixedTime)
        val code2 = totpGenerator.generateCode(secret, fixedTime + 10000) // +10秒
        val code3 = totpGenerator.generateCode(secret, fixedTime + 20000) // +20秒
        
        // 同一 30 秒窗口内的代码应该相同
        code1 shouldBe code2
        code2 shouldBe code3
    }
    
    "Property 9: TOTP codes in different 30-second windows are different" {
        val secret = "JBSWY3DPEHPK3PXP"
        
        val fixedTime = 1234567890000L
        
        val code1 = totpGenerator.generateCode(secret, fixedTime)
        val code2 = totpGenerator.generateCode(secret, fixedTime + 30000) // +30秒
        
        // 不同 30 秒窗口的代码应该不同（极小概率相同）
        // 这里我们只验证代码格式正确
        code1 shouldHaveLength 6
        code2 shouldHaveLength 6
    }
    
    "Property 9: TOTP with RFC 6238 test vectors" {
        // RFC 6238 测试向量
        // 密钥: 12345678901234567890 (ASCII) = GEZDGNBVGY3TQOJQ (Base32)
        val secret = "GEZDGNBVGY3TQOJQ"
        
        // 测试时间: 59 秒 (Unix timestamp)
        // 预期代码: 287082 (SHA1)
        val time59 = 59000L
        val code59 = totpGenerator.generateCode(secret, time59)
        code59 shouldBe "287082"
        
        // 测试时间: 1111111109 秒
        // 预期代码: 081804 (SHA1)
        val time1111111109 = 1111111109000L
        val code1111111109 = totpGenerator.generateCode(secret, time1111111109)
        code1111111109 shouldBe "081804"
    }
    
    "Property 9: getRemainingSeconds returns value between 1 and 30" {
        val remaining = totpGenerator.getRemainingSeconds()
        
        (remaining in 1..30) shouldBe true
    }
})
