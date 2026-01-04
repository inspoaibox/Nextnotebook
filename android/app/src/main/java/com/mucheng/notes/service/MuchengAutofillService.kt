package com.mucheng.notes.service

import android.app.assist.AssistStructure
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import androidx.annotation.RequiresApi
import com.mucheng.notes.R
import com.mucheng.notes.data.local.AppDatabase
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.payload.VaultEntryPayload
import com.mucheng.notes.domain.model.payload.VaultUri
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

/**
 * 暮城笔记自动填充服务
 * 提供密码库条目的自动填充功能
 */
@RequiresApi(Build.VERSION_CODES.O)
class MuchengAutofillService : AutofillService() {
    
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { ignoreUnknownKeys = true }
    
    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        val structure = request.fillContexts.lastOrNull()?.structure ?: run {
            callback.onSuccess(null)
            return
        }
        
        // 解析请求获取包名或域名
        val parsedInfo = parseStructure(structure)
        if (parsedInfo.usernameId == null && parsedInfo.passwordId == null) {
            callback.onSuccess(null)
            return
        }
        
        serviceScope.launch {
            try {
                // 查询匹配的密码库条目
                val entries = findMatchingEntries(parsedInfo.packageName, parsedInfo.webDomain)
                
                if (entries.isEmpty()) {
                    callback.onSuccess(null)
                    return@launch
                }
                
                // 构建填充响应
                val responseBuilder = FillResponse.Builder()
                
                for (entry in entries.take(5)) { // 最多显示5个
                    val dataset = buildDataset(entry, parsedInfo)
                    if (dataset != null) {
                        responseBuilder.addDataset(dataset)
                    }
                }
                
                callback.onSuccess(responseBuilder.build())
            } catch (e: Exception) {
                callback.onFailure("自动填充失败: ${e.message}")
            }
        }
    }
    
    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        // TODO: 实现保存新凭据到密码库
        callback.onSuccess()
    }
    
    /**
     * 解析 AssistStructure 获取填充信息
     */
    private fun parseStructure(structure: AssistStructure): ParsedStructure {
        var usernameId: AutofillId? = null
        var passwordId: AutofillId? = null
        var packageName: String? = null
        var webDomain: String? = null
        
        for (i in 0 until structure.windowNodeCount) {
            val windowNode = structure.getWindowNodeAt(i)
            val rootNode = windowNode.rootViewNode
            
            parseNode(rootNode) { node ->
                val autofillHints = node.autofillHints
                val autofillId = node.autofillId
                
                if (autofillId != null && autofillHints != null) {
                    for (hint in autofillHints) {
                        when (hint) {
                            android.view.View.AUTOFILL_HINT_USERNAME,
                            android.view.View.AUTOFILL_HINT_EMAIL_ADDRESS -> {
                                usernameId = autofillId
                            }
                            android.view.View.AUTOFILL_HINT_PASSWORD -> {
                                passwordId = autofillId
                            }
                        }
                    }
                }
                
                // 获取 web 域名
                node.webDomain?.let { webDomain = it }
            }
            
            packageName = structure.activityComponent?.packageName
        }
        
        return ParsedStructure(
            usernameId = usernameId,
            passwordId = passwordId,
            packageName = packageName,
            webDomain = webDomain
        )
    }
    
    private fun parseNode(
        node: AssistStructure.ViewNode,
        callback: (AssistStructure.ViewNode) -> Unit
    ) {
        callback(node)
        for (i in 0 until node.childCount) {
            parseNode(node.getChildAt(i), callback)
        }
    }
    
    /**
     * 查找匹配的密码库条目
     */
    private suspend fun findMatchingEntries(
        packageName: String?,
        webDomain: String?
    ): List<VaultEntryPayload> {
        if (packageName == null && webDomain == null) return emptyList()
        
        // TODO: 从数据库获取密码库条目并匹配
        // 这里需要注入 ItemRepository，暂时返回空列表
        return emptyList()
    }
    
    /**
     * 检查 URI 是否匹配
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
    
    /**
     * 构建数据集
     */
    private fun buildDataset(
        entry: VaultEntryPayload,
        parsedInfo: ParsedStructure
    ): Dataset? {
        val presentation = RemoteViews(packageName, R.layout.autofill_item).apply {
            setTextViewText(R.id.autofill_title, entry.name)
            setTextViewText(R.id.autofill_subtitle, entry.username)
        }
        
        val datasetBuilder = Dataset.Builder(presentation)
        
        parsedInfo.usernameId?.let { id ->
            datasetBuilder.setValue(id, AutofillValue.forText(entry.username))
        }
        
        parsedInfo.passwordId?.let { id ->
            datasetBuilder.setValue(id, AutofillValue.forText(entry.password))
        }
        
        return try {
            datasetBuilder.build()
        } catch (e: Exception) {
            null
        }
    }
    
    private data class ParsedStructure(
        val usernameId: AutofillId?,
        val passwordId: AutofillId?,
        val packageName: String?,
        val webDomain: String?
    )
}
