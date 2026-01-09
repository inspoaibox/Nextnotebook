# Implementation Plan: Sync Key Security

## Overview

本实现计划将为电脑端和手机端的同步密钥操作添加 PIN 码验证保护。实现分为电脑端和手机端两部分，每部分包含 UI 修改和逻辑修改。

## Tasks

- [-] 1. 电脑端 PIN 验证对话框组件
  - [x] 1.1 在 SettingsModal.tsx 中添加 PIN 验证状态管理
    - 添加 showPinVerifyModal, pendingKeyOperation, pinInput 状态
    - 添加 verifyPinAndProceed 函数
    - 添加 checkAppLockEnabled 函数
    - _Requirements: 1.1, 1.2, 1.3, 1.7_

  - [x] 1.2 创建 PIN 验证对话框 UI
    - 使用 Ant Design Modal 组件
    - 包含 PIN 输入框和确认/取消按钮
    - 显示错误提示
    - _Requirements: 1.8, 6.1_

  - [ ] 1.3 编写 PIN 验证逻辑单元测试
    - 测试正确 PIN 返回 true
    - 测试错误 PIN 返回 false
    - _Requirements: 1.8_

- [-] 2. 电脑端密钥操作流程修改
  - [x] 2.1 修改密钥生成流程
    - handleGenerateKey 改为先触发 PIN 验证
    - PIN 验证通过后执行 doGenerateKey
    - 移除原有的密码输入框（不再需要）
    - _Requirements: 1.1, 4.1, 4.2, 4.3, 4.4_

  - [x] 2.2 修改密钥导出流程
    - handleExportKey 改为先触发 PIN 验证
    - PIN 验证通过后执行 doExportKey
    - 直接导出 Base64 格式密钥到剪贴板
    - 移除原有的密码输入框
    - _Requirements: 1.2, 2.1, 2.2, 2.3, 2.4_

  - [x] 2.3 修改密钥导入流程
    - handleImportKey 改为先触发 PIN 验证
    - PIN 验证通过后显示导入对话框
    - 导入时验证 Base64 格式
    - 移除原有的密码输入框
    - _Requirements: 1.3, 3.1, 3.2, 3.3, 3.4_

  - [ ] 2.4 编写密钥格式验证属性测试
    - **Property 3: Generated Key Format Validity**
    - **Property 4: Import Format Validation**
    - **Validates: Requirements 4.1, 2.1, 3.2, 3.3**

- [x] 3. Checkpoint - 电脑端测试
  - 确保所有测试通过，验证电脑端功能正常

- [x] 4. 手机端 SettingsViewModel 修改
  - [x] 4.1 添加 PIN 验证方法
    - 添加 verifyPin(pin: String): Boolean 方法
    - 添加 isAppLockEnabled(): Boolean 方法
    - _Requirements: 1.4, 1.5, 1.6, 1.7_

  - [x] 4.2 修改密钥生成方法
    - 移除 generateEncryptionKey 中的 PIN 参数
    - 假设调用前已完成 PIN 验证
    - _Requirements: 4.1, 4.2_

  - [x] 4.3 修改密钥导出方法
    - exportEncryptionKey 直接返回 Base64 密钥
    - 假设调用前已完成 PIN 验证
    - _Requirements: 2.1, 2.2_

  - [x] 4.4 修改密钥导入方法
    - importEncryptionKey 添加 Base64 格式验证
    - 验证解码后长度为 32 字节
    - _Requirements: 3.2, 3.3, 3.4_

  - [ ] 4.5 编写 ViewModel 单元测试
    - 测试 verifyPin 方法
    - 测试密钥格式验证
    - _Requirements: 1.8, 3.3_

- [x] 5. 手机端 SecuritySettingsScreen 修改
  - [x] 5.1 添加密钥管理 UI 到安全设置页面
    - 从 SyncSettingsScreen 移动密钥管理相关 UI
    - 添加"同步加密密钥"区块
    - 添加三个按钮：生成、导出、导入
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 5.2 添加 PIN 验证对话框
    - 创建 PinVerifyDialog Composable
    - 包含 PIN 输入和确认/取消按钮
    - _Requirements: 1.8, 6.1_

  - [x] 5.3 实现密钥操作流程
    - 点击按钮 → 检查应用锁 → 显示 PIN 验证 → 执行操作
    - 添加 pendingKeyOperation 状态管理
    - _Requirements: 1.4, 1.5, 1.6_

- [x] 6. 手机端 SyncSettingsScreen 清理
  - [x] 6.1 移除密钥管理相关 UI
    - 移除生成、导出、导入密钥按钮
    - 移除相关对话框
    - 保留加密开关和密钥状态显示
    - _Requirements: 5.2_

- [ ] 7. Checkpoint - 手机端测试
  - 确保所有测试通过，验证手机端功能正常

- [ ] 8. 集成测试
  - [ ] 8.1 编写跨平台兼容性测试
    - 电脑端导出的密钥可以在手机端导入
    - 手机端导出的密钥可以在电脑端导入
    - _Requirements: 2.1, 3.4_

- [ ] 9. Final Checkpoint
  - 确保所有测试通过，ask the user if questions arise

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
