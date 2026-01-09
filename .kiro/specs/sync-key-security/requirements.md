# Requirements Document

## Introduction

本文档定义了同步密钥安全管理功能的需求。当前电脑端和手机端在同步密钥的生成、导出、导入操作上存在安全漏洞：操作时没有进行身份验证，任何人都可以随意操作密钥，可能导致同步数据被破坏或泄露。本功能旨在统一两端的密钥管理方式，确保所有密钥操作都需要通过应用锁 PIN 码验证后才能执行。

**核心设计原则：**
- PIN 码验证是操作权限保护，不影响密钥数据本身
- 密钥以 Base64 明文格式导出/导入，便于跨设备传输
- 必须先启用应用锁并设置 PIN 码，才能进行密钥管理操作

## Glossary

- **Sync_Key**: 同步加密密钥，用于端到端加密同步数据的 AES-256 密钥
- **App_Lock_PIN**: 应用锁定 PIN 码，用于保护应用访问的 4-6 位数字密码
- **Desktop_Client**: 电脑端应用（Electron）
- **Mobile_Client**: 手机端应用（Android）
- **Key_Export**: 将同步密钥导出为 Base64 格式的操作
- **Key_Import**: 从 Base64 格式导入同步密钥的操作
- **Key_Generation**: 生成新的同步密钥的操作
- **CryptoEngine**: 加密引擎，负责密钥管理和数据加密解密

## Requirements

### Requirement 1: 密钥操作前置 PIN 验证

**User Story:** As a user, I want all sync key operations to require PIN verification, so that unauthorized users cannot tamper with my encryption keys.

#### Acceptance Criteria

1. WHEN a user attempts to generate a new sync key, THE Desktop_Client SHALL require App_Lock_PIN verification before proceeding
2. WHEN a user attempts to export the sync key, THE Desktop_Client SHALL require App_Lock_PIN verification before proceeding
3. WHEN a user attempts to import a sync key, THE Desktop_Client SHALL require App_Lock_PIN verification before proceeding
4. WHEN a user attempts to generate a new sync key, THE Mobile_Client SHALL require App_Lock_PIN verification before proceeding
5. WHEN a user attempts to export the sync key, THE Mobile_Client SHALL require App_Lock_PIN verification before proceeding
6. WHEN a user attempts to import a sync key, THE Mobile_Client SHALL require App_Lock_PIN verification before proceeding
7. IF App_Lock is not enabled, THEN THE System SHALL prompt the user to set up App_Lock_PIN before allowing key operations
8. IF PIN verification fails, THEN THE System SHALL reject the key operation and display an error message

### Requirement 2: 密钥导出功能

**User Story:** As a user, I want to export my sync key to transfer it to other devices, so that I can use the same encryption key across all my devices.

#### Acceptance Criteria

1. WHEN PIN verification succeeds, THE System SHALL export the sync key in Base64 format
2. WHEN the export is complete, THE System SHALL copy the key to clipboard
3. WHEN the export is complete, THE System SHALL display "密钥已导出，请妥善保存"
4. IF no sync key exists, THEN THE System SHALL display "请先生成密钥"

### Requirement 3: 密钥导入功能

**User Story:** As a user, I want to import a sync key from another device, so that I can decrypt synced data on this device.

#### Acceptance Criteria

1. WHEN PIN verification succeeds, THE System SHALL allow the user to paste or input the key
2. WHEN importing a sync key, THE System SHALL validate the Base64 format
3. IF the key format is invalid, THEN THE System SHALL reject the import and display "密钥格式错误"
4. WHEN import is successful, THE System SHALL store the key and display "密钥导入成功"

### Requirement 4: 密钥生成功能

**User Story:** As a user, I want to generate a new sync key, so that I can enable encrypted sync for my data.

#### Acceptance Criteria

1. WHEN PIN verification succeeds, THE System SHALL generate a cryptographically secure 256-bit random key
2. WHEN generation is complete, THE System SHALL store the key locally
3. WHEN generation is complete, THE System SHALL copy the key (Base64 format) to clipboard
4. WHEN generation is complete, THE System SHALL display "密钥已生成，请复制保存"
5. THE System SHALL display a warning that generating a new key will invalidate existing synced data if keys don't match

### Requirement 5: 统一的用户界面

**User Story:** As a user, I want consistent key management UI across desktop and mobile, so that I have the same experience on all devices.

#### Acceptance Criteria

1. THE Desktop_Client security settings SHALL display sync key management in the "安全设置" section
2. THE Mobile_Client security settings SHALL display sync key management in the "安全设置" section (not "同步设置")
3. WHEN App_Lock is not enabled, THE System SHALL display a prompt to enable App_Lock before showing key management options
4. THE key management UI SHALL include three buttons: "生成密钥", "导出密钥", "导入密钥"
5. WHEN a key is configured, THE System SHALL display a "已配置" indicator with a checkmark icon

### Requirement 6: 错误处理与用户反馈

**User Story:** As a user, I want clear error messages when key operations fail, so that I can understand and resolve issues.

#### Acceptance Criteria

1. IF PIN verification fails, THEN THE System SHALL display "PIN 验证失败，请重试"
2. IF App_Lock is not enabled, THEN THE System SHALL display "请先启用应用锁定"
3. IF key format is invalid during import, THEN THE System SHALL display "密钥格式错误"
4. IF no key exists during export, THEN THE System SHALL display "请先生成密钥"
5. WHEN key operation succeeds, THE System SHALL display appropriate success message
