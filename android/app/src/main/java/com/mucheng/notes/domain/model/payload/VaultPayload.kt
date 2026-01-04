package com.mucheng.notes.domain.model.payload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 密码库条目类型 - 与桌面端 VaultEntryType 完全一致
 */
@Serializable
enum class VaultEntryType {
    @SerialName("login")
    LOGIN,
    
    @SerialName("card")
    CARD,
    
    @SerialName("identity")
    IDENTITY,
    
    @SerialName("secure_note")
    SECURE_NOTE
}

/**
 * TOTP 密钥 - 与桌面端 VaultTotp 完全一致
 */
@Serializable
data class VaultTotp(
    val id: String,
    val name: String,
    val account: String,
    val secret: String
)

/**
 * 关联网站/URI - 与桌面端 VaultUri 完全一致
 */
@Serializable
data class VaultUri(
    val id: String,
    val name: String,
    val uri: String,
    @SerialName("match_type") val matchType: String // "domain", "host", "starts_with", "exact", "regex", "never"
)

/**
 * 自定义字段 - 与桌面端 VaultCustomField 完全一致
 */
@Serializable
data class VaultCustomField(
    val id: String,
    val name: String,
    val value: String,
    val type: String // "text", "hidden", "boolean"
)

/**
 * 密码库条目 Payload - 与桌面端 VaultEntryPayload 完全一致
 */
@Serializable
data class VaultEntryPayload(
    val name: String,
    @SerialName("entry_type") val entryType: VaultEntryType,
    @SerialName("folder_id") val folderId: String? = null,
    val favorite: Boolean = false,
    val notes: String = "",
    // 登录类型字段
    val username: String = "",
    val password: String = "",
    @SerialName("totp_secrets") val totpSecrets: List<VaultTotp> = emptyList(),
    val uris: List<VaultUri> = emptyList(),
    // 银行卡类型字段
    @SerialName("card_holder_name") val cardHolderName: String = "",
    @SerialName("card_number") val cardNumber: String = "",
    @SerialName("card_brand") val cardBrand: String = "",
    @SerialName("card_exp_month") val cardExpMonth: String = "",
    @SerialName("card_exp_year") val cardExpYear: String = "",
    @SerialName("card_cvv") val cardCvv: String = "",
    // 身份类型字段
    @SerialName("identity_title") val identityTitle: String = "",
    @SerialName("identity_first_name") val identityFirstName: String = "",
    @SerialName("identity_last_name") val identityLastName: String = "",
    @SerialName("identity_email") val identityEmail: String = "",
    @SerialName("identity_phone") val identityPhone: String = "",
    @SerialName("identity_address") val identityAddress: String = "",
    // 自定义字段
    @SerialName("custom_fields") val customFields: List<VaultCustomField> = emptyList()
)

/**
 * 密码库文件夹 Payload - 与桌面端 VaultFolderPayload 完全一致
 */
@Serializable
data class VaultFolderPayload(
    val name: String,
    @SerialName("parent_id") val parentId: String? = null
)
