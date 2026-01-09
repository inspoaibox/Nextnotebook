# Design Document: Sync Key Security

## Overview

本设计文档描述同步密钥安全管理功能的技术实现方案。核心目标是为电脑端和手机端的密钥操作（生成、导出、导入）添加 PIN 码验证保护，防止未授权用户随意操作密钥。

**设计原则：**
- PIN 码验证是操作权限保护，不影响密钥数据本身
- 密钥以 Base64 明文格式导出/导入
- 统一电脑端和手机端的 UI 和流程

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      UI Layer                                │
├─────────────────────────────────────────────────────────────┤
│  Desktop: SettingsModal.tsx (安全设置 Tab)                   │
│  Mobile: SecuritySettingsScreen.kt                           │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ 生成密钥    │  │ 导出密钥    │  │ 导入密钥    │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
│         └────────────────┼────────────────┘                  │
│                          ▼                                   │
│              ┌───────────────────────┐                       │
│              │   PIN 验证对话框      │                       │
│              └───────────┬───────────┘                       │
└──────────────────────────┼──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Security Layer                            │
├─────────────────────────────────────────────────────────────┤
│  Desktop: AppLock.ts                                         │
│  Mobile: AppLockManager.kt                                   │
│                                                              │
│  - verifyPin(pin: string): boolean                          │
│  - isLockEnabled(): boolean                                  │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Crypto Layer                              │
├─────────────────────────────────────────────────────────────┤
│  Desktop: CryptoEngine.ts                                    │
│  Mobile: CryptoEngineImpl.kt                                 │
│                                                              │
│  - generateRandomKey(): Buffer (32 bytes)                   │
│  - getMasterKey(): string (Base64)                          │
│  - setMasterKey(key: Buffer): void                          │
│  - hasMasterKey(): boolean                                   │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Desktop - SettingsModal.tsx 修改

```typescript
// 新增状态
const [showPinVerifyModal, setShowPinVerifyModal] = useState(false);
const [pendingKeyOperation, setPendingKeyOperation] = useState<'generate' | 'export' | 'import' | null>(null);
const [pinInput, setPinInput] = useState('');

// PIN 验证函数
const verifyPinAndProceed = async (pin: string): Promise<boolean> => {
  const isValid = await verifyPassword(pin, securitySettings.lockPassword);
  if (!isValid) {
    message.error('PIN 验证失败，请重试');
    return false;
  }
  return true;
};

// 检查应用锁状态
const checkAppLockEnabled = (): boolean => {
  if (!securitySettings.appLockEnabled || !securitySettings.lockPassword) {
    message.warning('请先启用应用锁定');
    return false;
  }
  return true;
};

// 密钥操作入口（需要 PIN 验证）
const handleKeyOperation = (operation: 'generate' | 'export' | 'import') => {
  if (!checkAppLockEnabled()) return;
  setPendingKeyOperation(operation);
  setShowPinVerifyModal(true);
};

// PIN 验证成功后执行操作
const executeKeyOperation = async () => {
  const isValid = await verifyPinAndProceed(pinInput);
  if (!isValid) return;
  
  setShowPinVerifyModal(false);
  setPinInput('');
  
  switch (pendingKeyOperation) {
    case 'generate':
      await doGenerateKey();
      break;
    case 'export':
      await doExportKey();
      break;
    case 'import':
      setShowImportKeyModal(true);
      break;
  }
  setPendingKeyOperation(null);
};
```

### 2. Mobile - SecuritySettingsScreen.kt 修改

```kotlin
// 新增状态
var showPinVerifyDialog by remember { mutableStateOf(false) }
var pendingKeyOperation by remember { mutableStateOf<String?>(null) }
var pinInput by remember { mutableStateOf("") }

// 密钥操作入口
fun handleKeyOperation(operation: String) {
    if (!viewModel.isAppLockEnabled()) {
        viewModel.showMessage("请先启用应用锁定")
        return
    }
    pendingKeyOperation = operation
    showPinVerifyDialog = true
}

// PIN 验证对话框
if (showPinVerifyDialog) {
    PinVerifyDialog(
        onDismiss = { 
            showPinVerifyDialog = false
            pinInput = ""
        },
        onConfirm = { pin ->
            if (viewModel.verifyPin(pin)) {
                showPinVerifyDialog = false
                when (pendingKeyOperation) {
                    "generate" -> viewModel.generateEncryptionKey()
                    "export" -> viewModel.exportEncryptionKey()
                    "import" -> showImportKeyDialog = true
                }
                pendingKeyOperation = null
            } else {
                viewModel.showMessage("PIN 验证失败，请重试")
            }
        }
    )
}
```

### 3. SettingsViewModel.kt 修改

```kotlin
/**
 * 验证 PIN 码
 */
fun verifyPin(pin: String): Boolean {
    return appLockManager.verifyPin(pin)
}

/**
 * 检查应用锁是否启用
 */
fun isAppLockEnabled(): Boolean {
    return appLockManager.isLockEnabled()
}

/**
 * 生成加密密钥（PIN 已验证）
 */
fun generateEncryptionKey(): String? {
    val randomKey = ByteArray(32)
    java.security.SecureRandom().nextBytes(randomKey)
    cryptoEngine.setMasterKey(randomKey)
    
    val keyBase64 = cryptoEngine.exportKey()
    prefs.edit()
        .putString(KEY_ENCRYPTION_PASSWORD, IMPORTED_KEY_PLACEHOLDER)
        .putBoolean(KEY_MASTER_KEY_IMPORTED, true)
        .apply()
    
    _uiState.update { it.copy(
        encryptionPassword = IMPORTED_KEY_PLACEHOLDER,
        message = "密钥已生成，请复制保存"
    )}
    
    return keyBase64
}

/**
 * 导出加密密钥（PIN 已验证）
 */
fun exportEncryptionKey(): String? {
    if (!cryptoEngine.hasMasterKey()) {
        _uiState.update { it.copy(message = "请先生成密钥") }
        return null
    }
    
    val keyBase64 = cryptoEngine.exportKey()
    _uiState.update { it.copy(message = "密钥已导出，请妥善保存") }
    return keyBase64
}

/**
 * 导入加密密钥（PIN 已验证）
 */
fun importEncryptionKey(keyBase64: String): Boolean {
    if (keyBase64.isBlank()) {
        _uiState.update { it.copy(message = "密钥不能为空") }
        return false
    }
    
    return try {
        // 验证 Base64 格式
        val decoded = android.util.Base64.decode(keyBase64, android.util.Base64.DEFAULT)
        if (decoded.size != 32) {
            _uiState.update { it.copy(message = "密钥格式错误") }
            return false
        }
        
        cryptoEngine.importKey(keyBase64)
        prefs.edit()
            .putString(KEY_ENCRYPTION_PASSWORD, IMPORTED_KEY_PLACEHOLDER)
            .putBoolean(KEY_MASTER_KEY_IMPORTED, true)
            .apply()
        
        _uiState.update { it.copy(
            encryptionPassword = IMPORTED_KEY_PLACEHOLDER,
            message = "密钥导入成功"
        )}
        true
    } catch (e: Exception) {
        _uiState.update { it.copy(message = "密钥格式错误") }
        false
    }
}
```

## Data Models

### PIN 验证状态

```typescript
// Desktop
interface PinVerifyState {
  showModal: boolean;
  pendingOperation: 'generate' | 'export' | 'import' | null;
  pinInput: string;
  error: string | null;
}
```

```kotlin
// Mobile
data class PinVerifyState(
    val showDialog: Boolean = false,
    val pendingOperation: String? = null,
    val pinInput: String = "",
    val error: String? = null
)
```

### 密钥格式

密钥以 Base64 编码的 32 字节（256 位）数据存储和传输：

```
Base64 编码示例: "dGhpcyBpcyBhIDMyIGJ5dGUga2V5IGZvciB0ZXN0aW5n"
解码后: 32 bytes (256 bits) 的原始密钥数据
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: PIN Verification Required for Key Operations

*For any* key operation (generate, export, or import), the operation SHALL only proceed after successful PIN verification. Without PIN verification, the operation SHALL be rejected.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**

### Property 2: Incorrect PIN Rejection

*For any* PIN input that does not match the stored App_Lock_PIN, the system SHALL reject the key operation and return an error.

**Validates: Requirements 1.8**

### Property 3: Generated Key Format Validity

*For any* generated sync key, the key SHALL be exactly 256 bits (32 bytes) and SHALL be representable as a valid Base64 string.

**Validates: Requirements 4.1, 2.1**

### Property 4: Import Format Validation

*For any* string input during key import, if the string is not a valid Base64 encoding of exactly 32 bytes, the import SHALL be rejected with "密钥格式错误" error.

**Validates: Requirements 3.2, 3.3**

## Error Handling

| 场景 | 错误消息 | 处理方式 |
|------|----------|----------|
| 应用锁未启用 | "请先启用应用锁定" | 阻止操作，提示用户 |
| PIN 验证失败 | "PIN 验证失败，请重试" | 保持对话框，允许重试 |
| 导出时无密钥 | "请先生成密钥" | 阻止操作，提示用户 |
| 导入格式错误 | "密钥格式错误" | 阻止导入，提示用户 |
| 密钥为空 | "密钥不能为空" | 阻止导入，提示用户 |

## Testing Strategy

### Unit Tests

1. **PIN 验证逻辑测试**
   - 正确 PIN 返回 true
   - 错误 PIN 返回 false
   - 空 PIN 返回 false

2. **密钥格式验证测试**
   - 有效 Base64 + 32 字节 → 通过
   - 无效 Base64 → 拒绝
   - 有效 Base64 但长度不对 → 拒绝

3. **密钥生成测试**
   - 生成的密钥长度为 32 字节
   - 生成的密钥可以编码为 Base64

### Property-Based Tests

使用 fast-check (TypeScript) 和 Kotest (Kotlin) 进行属性测试：

1. **Property 1 测试**: 模拟未验证 PIN 的情况，验证操作被拒绝
2. **Property 2 测试**: 生成随机错误 PIN，验证都被拒绝
3. **Property 3 测试**: 多次生成密钥，验证格式一致性
4. **Property 4 测试**: 生成随机字符串，验证格式验证逻辑

### Integration Tests

1. 完整流程测试：启用应用锁 → 设置 PIN → 生成密钥 → 导出 → 导入
2. 跨平台兼容性：电脑端导出的密钥可以在手机端导入
