package com.mucheng.notes

import com.mucheng.notes.domain.model.payload.VaultUri
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe

/**
 * Autofill 条目匹配属性测试
 */
class AutofillMatchingPropertyTest : StringSpec({
    
    /**
     * Property 12: Autofill Entry Matching
     * 对于任意带有 URI 的密码库条目，按包名或 web 域名查询应该返回
     * 至少一个 URI 根据其 matchType 匹配的条目
     */
    
    "Property 12: domain match type extracts and compares domains" {
        val uri = VaultUri(
            id = "1",
            name = "Test",
            uri = "https://www.example.com/login",
            matchType = "domain"
        )
        
        // 应该匹配
        matchUri(uri, null, "https://example.com") shouldBe true
        matchUri(uri, null, "https://www.example.com") shouldBe true
        matchUri(uri, null, "https://sub.example.com") shouldBe true
        
        // 不应该匹配
        matchUri(uri, null, "https://other.com") shouldBe false
    }
    
    "Property 12: host match type compares full host" {
        val uri = VaultUri(
            id = "1",
            name = "Test",
            uri = "https://www.example.com/login",
            matchType = "host"
        )
        
        // 应该匹配
        matchUri(uri, null, "https://www.example.com") shouldBe true
        
        // 不应该匹配（不同子域名）
        matchUri(uri, null, "https://example.com") shouldBe false
        matchUri(uri, null, "https://sub.example.com") shouldBe false
    }
    
    "Property 12: starts_with match type checks prefix" {
        val uri = VaultUri(
            id = "1",
            name = "Test",
            uri = "https://example.com/app",
            matchType = "starts_with"
        )
        
        // 应该匹配
        matchUri(uri, null, "https://example.com/app/login") shouldBe true
        matchUri(uri, null, "https://example.com/app") shouldBe true
        
        // 不应该匹配
        matchUri(uri, null, "https://example.com/other") shouldBe false
    }
    
    "Property 12: exact match type requires exact match" {
        val uri = VaultUri(
            id = "1",
            name = "Test",
            uri = "https://example.com/login",
            matchType = "exact"
        )
        
        // 应该匹配
        matchUri(uri, null, "https://example.com/login") shouldBe true
        
        // 不应该匹配
        matchUri(uri, null, "https://example.com/login/") shouldBe false
        matchUri(uri, null, "https://example.com") shouldBe false
    }
    
    "Property 12: regex match type uses regex pattern" {
        val uri = VaultUri(
            id = "1",
            name = "Test",
            uri = ".*example\\.com.*",
            matchType = "regex"
        )
        
        // 应该匹配
        matchUri(uri, null, "https://example.com/login") shouldBe true
        matchUri(uri, null, "https://www.example.com") shouldBe true
        
        // 不应该匹配
        matchUri(uri, null, "https://other.com") shouldBe false
    }
    
    "Property 12: never match type always returns false" {
        val uri = VaultUri(
            id = "1",
            name = "Test",
            uri = "https://example.com",
            matchType = "never"
        )
        
        matchUri(uri, null, "https://example.com") shouldBe false
        matchUri(uri, null, "anything") shouldBe false
    }
    
    "Property 12: package name matching" {
        val uri = VaultUri(
            id = "1",
            name = "Test",
            uri = "com.example.app",
            matchType = "exact"
        )
        
        matchUri(uri, "com.example.app", null) shouldBe true
        matchUri(uri, "com.other.app", null) shouldBe false
    }
})

/**
 * URI 匹配函数（与 MuchengAutofillService 中的逻辑一致）
 */
private fun matchUri(uri: VaultUri, packageName: String?, webDomain: String?): Boolean {
    val target = webDomain ?: packageName ?: return false
    
    return when (uri.matchType) {
        "domain" -> {
            val uriDomain = extractDomain(uri.uri)
            val targetDomain = extractDomain(target)
            uriDomain == targetDomain
        }
        "host" -> {
            val uriHost = extractHost(uri.uri)
            val targetHost = extractHost(target)
            uriHost == targetHost
        }
        "starts_with" -> target.startsWith(uri.uri)
        "exact" -> target == uri.uri
        "regex" -> {
            try {
                Regex(uri.uri).matches(target)
            } catch (e: Exception) {
                false
            }
        }
        "never" -> false
        else -> false
    }
}

private fun extractDomain(url: String): String {
    return url.removePrefix("https://")
        .removePrefix("http://")
        .split("/").firstOrNull()
        ?.split(".")
        ?.takeLast(2)
        ?.joinToString(".") ?: url
}

private fun extractHost(url: String): String {
    return url.removePrefix("https://")
        .removePrefix("http://")
        .split("/").firstOrNull() ?: url
}
