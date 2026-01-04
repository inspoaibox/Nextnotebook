package com.mucheng.notes.presentation.viewmodel

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.payload.VaultEntryPayload
import com.mucheng.notes.domain.model.payload.VaultEntryType
import com.mucheng.notes.domain.model.payload.VaultFolderPayload
import com.mucheng.notes.domain.repository.ItemRepository
import com.mucheng.notes.security.AuthResult
import com.mucheng.notes.security.BiometricManager
import com.mucheng.notes.security.BiometricStatus
import com.mucheng.notes.security.CryptoEngine
import com.mucheng.notes.security.SecurityUtils
import com.mucheng.notes.security.TOTPCode
import com.mucheng.notes.security.TOTPGenerator
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject

/**
 * 密码库 UI 状态
 */
data class VaultUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val isUnlocked: Boolean = false,
    val requiresAuth: Boolean = true,
    val vaultLockEnabled: Boolean = false,
    val vaultBiometricEnabled: Boolean = false,
    val biometricAvailable: Boolean = false,
    val selectedFolderId: String? = null,
    val searchQuery: String = "",
    val copiedMessage: String? = null,
    val showPasswordFor: String? = null  // 当前显示密码的条目 ID
)

/**
 * 密码库视图模型
 * 
 * 支持主密码和生物识别认证
 */
@HiltViewModel
class VaultViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val itemRepository: ItemRepository,
    private val totpGenerator: TOTPGenerator,
    private val biometricManager: BiometricManager,
    private val cryptoEngine: CryptoEngine
) : ViewModel() {
    
    companion object {
        private const val PREFS_NAME = "app_settings"
        private const val KEY_VAULT_PASSWORD = "vault_password"
        private const val KEY_VAULT_LOCK_ENABLED = "vault_lock_enabled"
        private const val KEY_VAULT_BIOMETRIC_ENABLED = "vault_biometric_enabled"
    }
    
    private val json = Json { 
        ignoreUnknownKeys = true 
        isLenient = true
        coerceInputValues = true  // 将 null 转换为默认值
    }
    private val clipboardManager = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    
    private val _uiState = MutableStateFlow(VaultUiState())
    val uiState: StateFlow<VaultUiState> = _uiState.asStateFlow()
    
    private val _selectedFolderId = MutableStateFlow<String?>(null)
    val selectedFolderId: StateFlow<String?> = _selectedFolderId.asStateFlow()
    
    private var activity: FragmentActivity? = null
    
    init {
        loadVaultLockSettings()
    }
    
    /**
     * 加载密码库锁定设置
     */
    private fun loadVaultLockSettings() {
        val vaultLockEnabled = prefs.getBoolean(KEY_VAULT_LOCK_ENABLED, false)
        val vaultPasswordSet = prefs.getString(KEY_VAULT_PASSWORD, null) != null
        val vaultBiometricEnabled = prefs.getBoolean(KEY_VAULT_BIOMETRIC_ENABLED, false)
        val biometricAvailable = biometricManager.canAuthenticate() == BiometricStatus.AVAILABLE
        
        // 如果启用了密码库锁定且设置了密码，则需要验证
        val requiresAuth = vaultLockEnabled && vaultPasswordSet
        
        _uiState.update { it.copy(
            vaultLockEnabled = vaultLockEnabled,
            vaultBiometricEnabled = vaultBiometricEnabled,
            biometricAvailable = biometricAvailable,
            requiresAuth = requiresAuth,
            isUnlocked = !requiresAuth  // 如果不需要验证，直接解锁
        ) }
    }
    
    /**
     * 刷新密码库锁定设置（从设置页面返回时调用）
     */
    fun refreshLockSettings() {
        loadVaultLockSettings()
    }
    
    /**
     * 设置 Activity（用于生物识别）
     */
    fun setActivity(activity: FragmentActivity) {
        this.activity = activity
    }
    
    /**
     * 密码库条目列表（实时流）
     */
    val entries: StateFlow<List<VaultEntryItem>> = itemRepository.getByType(ItemType.VAULT_ENTRY)
        .map { items -> items.map { it.toVaultEntryItem() } }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    /**
     * 密码库文件夹列表（实时流）
     */
    val folders: StateFlow<List<VaultFolderItem>> = itemRepository.getByType(ItemType.VAULT_FOLDER)
        .map { items -> items.map { it.toVaultFolderItem() } }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    
    /**
     * 使用密码解锁密码库
     */
    fun unlockWithPassword(password: String): Boolean {
        val storedHash = prefs.getString(KEY_VAULT_PASSWORD, null)
        if (storedHash == null) {
            _uiState.update { it.copy(error = "密码库密码未设置") }
            return false
        }
        
        val inputHash = hashPassword(password)
        if (inputHash == storedHash) {
            _uiState.update { it.copy(isUnlocked = true, requiresAuth = false, error = null) }
            return true
        }
        
        _uiState.update { it.copy(error = "密码错误") }
        return false
    }
    
    /**
     * 哈希密码
     */
    private fun hashPassword(password: String): String {
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(password.toByteArray(Charsets.UTF_8))
        return hashBytes.joinToString("") { "%02x".format(it) }
    }
    
    /**
     * 使用生物识别解锁密码库
     */
    fun unlockWithBiometric() {
        val currentActivity = activity ?: run {
            _uiState.update { it.copy(error = "无法获取 Activity") }
            return
        }
        
        if (!_uiState.value.vaultBiometricEnabled) {
            _uiState.update { it.copy(error = "密码库生物识别未启用") }
            return
        }
        
        viewModelScope.launch {
            val result = biometricManager.authenticate(
                activity = currentActivity,
                title = "访问密码库",
                subtitle = "请验证身份以访问密码库",
                negativeButtonText = "使用密码"
            )
            
            when (result) {
                is AuthResult.Success -> {
                    _uiState.update { it.copy(isUnlocked = true, requiresAuth = false, error = null) }
                }
                is AuthResult.Error -> {
                    _uiState.update { it.copy(error = result.message) }
                }
                is AuthResult.Cancelled -> {
                    // 用户取消
                }
                is AuthResult.Fallback -> {
                    // 用户选择使用密码，不做处理
                }
            }
        }
    }
    
    /**
     * 解锁密码库（兼容旧接口）
     */
    fun unlock() {
        _uiState.update { it.copy(isUnlocked = true, requiresAuth = false) }
    }
    
    /**
     * 锁定密码库
     */
    fun lock() {
        _uiState.update { 
            it.copy(
                isUnlocked = false, 
                requiresAuth = true,
                showPasswordFor = null
            ) 
        }
    }
    
    /**
     * 查看密码前的二次认证
     */
    fun requestViewPassword(entryId: String) {
        val currentActivity = activity
        
        if (_uiState.value.biometricAvailable && currentActivity != null) {
            viewModelScope.launch {
                val result = biometricManager.authenticate(
                    activity = currentActivity,
                    title = "查看密码",
                    subtitle = "请验证身份以查看密码",
                    negativeButtonText = "取消"
                )
                
                when (result) {
                    is AuthResult.Success -> {
                        _uiState.update { it.copy(showPasswordFor = entryId) }
                        // 30秒后自动隐藏
                        delay(30_000)
                        _uiState.update { it.copy(showPasswordFor = null) }
                    }
                    else -> {
                        // 认证失败或取消
                    }
                }
            }
        } else {
            // 没有生物识别，直接显示
            _uiState.update { it.copy(showPasswordFor = entryId) }
            viewModelScope.launch {
                delay(30_000)
                _uiState.update { it.copy(showPasswordFor = null) }
            }
        }
    }
    
    /**
     * 隐藏密码
     */
    fun hidePassword() {
        _uiState.update { it.copy(showPasswordFor = null) }
    }
    
    /**
     * 创建登录条目
     */
    fun createLoginEntry(
        name: String,
        username: String,
        password: String,
        uris: List<String> = emptyList(),
        folderId: String? = null
    ) {
        viewModelScope.launch {
            val payload = VaultEntryPayload(
                name = name,
                entryType = VaultEntryType.LOGIN,
                folderId = folderId,
                username = username,
                password = password,
                uris = uris.mapIndexed { index, uri ->
                    com.mucheng.notes.domain.model.payload.VaultUri(
                        id = java.util.UUID.randomUUID().toString(),
                        name = "URI ${index + 1}",
                        uri = uri,
                        matchType = "domain"
                    )
                }
            )
            itemRepository.create(ItemType.VAULT_ENTRY, json.encodeToString(payload))
        }
    }
    
    /**
     * 删除条目
     */
    fun deleteEntry(id: String) {
        viewModelScope.launch {
            itemRepository.softDelete(id)
        }
    }
    
    /**
     * 复制到剪贴板（30秒后自动清除）
     * 使用 SecurityUtils 进行安全复制
     */
    fun copyToClipboard(text: String, label: String = "密码", isSensitive: Boolean = true) {
        viewModelScope.launch {
            SecurityUtils.copyToClipboard(context, label, text, isSensitive)
            
            _uiState.update { it.copy(copiedMessage = "已复制到剪贴板") }
            
            if (isSensitive) {
                // 30秒后显示清除消息
                delay(30_000)
                _uiState.update { it.copy(copiedMessage = "剪贴板已清除") }
            }
            
            delay(2_000)
            _uiState.update { it.copy(copiedMessage = null) }
        }
    }
    
    /**
     * 清除剪贴板
     */
    private fun clearClipboard() {
        SecurityUtils.clearClipboard(context)
    }
    
    /**
     * 清除错误
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
    
    /**
     * 生成 TOTP 代码
     */
    fun generateTotpCode(secret: String): String {
        return totpGenerator.generateCode(secret)
    }
    
    /**
     * 观察 TOTP 代码
     */
    fun observeTotpCode(secret: String) = totpGenerator.observeCode(secret)
    
    /**
     * 选择文件夹
     */
    fun selectFolder(folderId: String?) {
        _selectedFolderId.value = folderId
        _uiState.value = _uiState.value.copy(selectedFolderId = folderId)
    }
    
    /**
     * 搜索
     */
    fun search(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
    }
    
    /**
     * 创建文件夹
     */
    fun createFolder(parentId: String?) {
        viewModelScope.launch {
            val payload = VaultFolderPayload(name = "新建文件夹", parentId = parentId)
            itemRepository.create(ItemType.VAULT_FOLDER, json.encodeToString(payload))
        }
    }
    
    /**
     * 创建文件夹（带名称）
     */
    fun createFolder(name: String, parentId: String?) {
        viewModelScope.launch {
            val payload = VaultFolderPayload(name = name, parentId = parentId)
            itemRepository.create(ItemType.VAULT_FOLDER, json.encodeToString(payload))
        }
    }
    
    /**
     * 创建完整的密码库条目
     */
    fun createEntry(
        name: String,
        entryType: VaultEntryType,
        folderId: String? = null,
        favorite: Boolean = false,
        notes: String = "",
        // 登录类型字段
        username: String = "",
        password: String = "",
        totpSecrets: List<com.mucheng.notes.domain.model.payload.VaultTotp> = emptyList(),
        uris: List<com.mucheng.notes.domain.model.payload.VaultUri> = emptyList(),
        // 银行卡类型字段
        cardHolderName: String = "",
        cardNumber: String = "",
        cardBrand: String = "",
        cardExpMonth: String = "",
        cardExpYear: String = "",
        cardCvv: String = "",
        // 身份类型字段
        identityTitle: String = "",
        identityFirstName: String = "",
        identityLastName: String = "",
        identityEmail: String = "",
        identityPhone: String = "",
        identityAddress: String = "",
        // 自定义字段
        customFields: List<com.mucheng.notes.domain.model.payload.VaultCustomField> = emptyList()
    ) {
        viewModelScope.launch {
            val payload = VaultEntryPayload(
                name = name,
                entryType = entryType,
                folderId = folderId,
                favorite = favorite,
                notes = notes,
                username = username,
                password = password,
                totpSecrets = totpSecrets,
                uris = uris,
                cardHolderName = cardHolderName,
                cardNumber = cardNumber,
                cardBrand = cardBrand,
                cardExpMonth = cardExpMonth,
                cardExpYear = cardExpYear,
                cardCvv = cardCvv,
                identityTitle = identityTitle,
                identityFirstName = identityFirstName,
                identityLastName = identityLastName,
                identityEmail = identityEmail,
                identityPhone = identityPhone,
                identityAddress = identityAddress,
                customFields = customFields
            )
            itemRepository.create(ItemType.VAULT_ENTRY, json.encodeToString(payload))
        }
    }
    
    /**
     * 更新密码库条目
     */
    fun updateEntry(
        id: String,
        name: String,
        entryType: VaultEntryType,
        folderId: String? = null,
        favorite: Boolean = false,
        notes: String = "",
        username: String = "",
        password: String = "",
        totpSecrets: List<com.mucheng.notes.domain.model.payload.VaultTotp> = emptyList(),
        uris: List<com.mucheng.notes.domain.model.payload.VaultUri> = emptyList(),
        cardHolderName: String = "",
        cardNumber: String = "",
        cardBrand: String = "",
        cardExpMonth: String = "",
        cardExpYear: String = "",
        cardCvv: String = "",
        identityTitle: String = "",
        identityFirstName: String = "",
        identityLastName: String = "",
        identityEmail: String = "",
        identityPhone: String = "",
        identityAddress: String = "",
        customFields: List<com.mucheng.notes.domain.model.payload.VaultCustomField> = emptyList()
    ) {
        viewModelScope.launch {
            val payload = VaultEntryPayload(
                name = name,
                entryType = entryType,
                folderId = folderId,
                favorite = favorite,
                notes = notes,
                username = username,
                password = password,
                totpSecrets = totpSecrets,
                uris = uris,
                cardHolderName = cardHolderName,
                cardNumber = cardNumber,
                cardBrand = cardBrand,
                cardExpMonth = cardExpMonth,
                cardExpYear = cardExpYear,
                cardCvv = cardCvv,
                identityTitle = identityTitle,
                identityFirstName = identityFirstName,
                identityLastName = identityLastName,
                identityEmail = identityEmail,
                identityPhone = identityPhone,
                identityAddress = identityAddress,
                customFields = customFields
            )
            itemRepository.update(id, json.encodeToString(payload))
        }
    }
    
    /**
     * 切换收藏状态
     */
    fun toggleFavorite(id: String) {
        viewModelScope.launch {
            val existing = itemRepository.getById(id) ?: return@launch
            val oldPayload = json.decodeFromString<VaultEntryPayload>(existing.payload)
            val newPayload = oldPayload.copy(favorite = !oldPayload.favorite)
            itemRepository.update(id, json.encodeToString(newPayload))
        }
    }
    
    /**
     * 生成随机密码
     */
    fun generatePassword(
        length: Int = 16,
        includeUppercase: Boolean = true,
        includeLowercase: Boolean = true,
        includeNumbers: Boolean = true,
        includeSymbols: Boolean = true
    ): String {
        val chars = StringBuilder()
        if (includeUppercase) chars.append("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        if (includeLowercase) chars.append("abcdefghijklmnopqrstuvwxyz")
        if (includeNumbers) chars.append("0123456789")
        if (includeSymbols) chars.append("!@#\$%^&*()_+-=[]{}|;:,.<>?")
        
        if (chars.isEmpty()) chars.append("abcdefghijklmnopqrstuvwxyz")
        
        val random = java.security.SecureRandom()
        return (1..length)
            .map { chars[random.nextInt(chars.length)] }
            .joinToString("")
    }
    
    private fun ItemEntity.toVaultEntryItem(): VaultEntryItem {
        android.util.Log.d("VaultViewModel", "toVaultEntryItem: id=${this.id}, type=${this.type}")
        android.util.Log.d("VaultViewModel", "toVaultEntryItem: payload=${this.payload}")
        return try {
            val payload = json.decodeFromString<VaultEntryPayload>(this.payload)
            android.util.Log.d("VaultViewModel", "toVaultEntryItem: parsed successfully, name=${payload.name}")
            VaultEntryItem(
                id = this.id,
                name = payload.name,
                entryType = payload.entryType,
                folderId = payload.folderId,
                favorite = payload.favorite,
                username = payload.username,
                password = payload.password,
                totpSecrets = payload.totpSecrets,
                uris = payload.uris,
                updatedTime = this.updatedTime
            )
        } catch (e: Exception) {
            android.util.Log.e("VaultViewModel", "Failed to parse vault entry payload: ${e.message}")
            android.util.Log.e("VaultViewModel", "Payload content: ${this.payload}")
            e.printStackTrace()
            // 返回一个默认的条目，避免崩溃
            VaultEntryItem(
                id = this.id,
                name = "解析错误",
                entryType = VaultEntryType.LOGIN,
                folderId = null,
                favorite = false,
                username = "",
                password = "",
                totpSecrets = emptyList(),
                uris = emptyList(),
                updatedTime = this.updatedTime
            )
        }
    }
    
    private fun ItemEntity.toVaultFolderItem(): VaultFolderItem {
        return try {
            val payload = json.decodeFromString<VaultFolderPayload>(this.payload)
            VaultFolderItem(
                id = this.id,
                name = payload.name,
                parentId = payload.parentId
            )
        } catch (e: Exception) {
            android.util.Log.e("VaultViewModel", "Failed to parse vault folder payload: ${e.message}, payload: ${this.payload}")
            // 返回一个默认的文件夹，避免崩溃
            VaultFolderItem(
                id = this.id,
                name = "解析错误",
                parentId = null
            )
        }
    }
}

/**
 * 密码库条目展示模型
 */
data class VaultEntryItem(
    val id: String,
    val name: String,
    val entryType: VaultEntryType,
    val folderId: String?,
    val favorite: Boolean,
    val username: String,
    val password: String,
    val totpSecrets: List<com.mucheng.notes.domain.model.payload.VaultTotp>,
    val uris: List<com.mucheng.notes.domain.model.payload.VaultUri>,
    val updatedTime: Long
)

/**
 * 密码库文件夹展示模型
 */
data class VaultFolderItem(
    val id: String,
    val name: String,
    val parentId: String?
)
