# Implementation Plan: Vault Data Generator

## Overview

本实现计划将密码/资料生成器功能集成到现有的密码库面板中。使用 @faker-js/faker 库生成本地化的虚假用户资料，支持自定义密码选项和批量生成，并可将生成的数据导入到密码库。

## Tasks

- [x] 1. 安装依赖并创建类型定义
  - 安装 @faker-js/faker 包
  - 在 src/shared/types/index.ts 中添加 GeneratorOptions、GeneratedProfile、CountryCode 等类型定义
  - _Requirements: 2.1-2.7, 3.1-3.3, 7.1_

- [x] 2. 实现 FakerGenerator 服务
  - [x] 2.1 创建 src/renderer/services/fakerGenerator.ts
    - 实现 COUNTRY_CONFIG 配置映射
    - 实现 generateProfile 函数，根据配置生成单个 profile
    - 实现 generateBatch 函数，批量生成 profiles
    - 支持所有 8 个国家/地区的 locale
    - _Requirements: 4.1-4.8, 7.1-7.2_

  - [x] 2.2 编写 FakerGenerator 属性测试
    - **Property 1: Profile always contains username and valid password**
    - **Validates: Requirements 2.3, 4.3**

  - [x] 2.3 编写可选字段属性测试
    - **Property 2: Optional fields inclusion**
    - **Validates: Requirements 3.3**

  - [x] 2.4 编写批量生成属性测试
    - **Property 3: Batch generation quantity**
    - **Validates: Requirements 5.6**

- [x] 3. 实现 useGenerator Hook
  - [x] 3.1 创建 src/renderer/hooks/useGenerator.ts
    - 管理生成配置状态（国家、性别、数量、密码选项、可选字段）
    - 实现 generate 函数调用 FakerGenerator
    - 管理生成结果状态
    - 实现 clearProfiles 函数
    - _Requirements: 2.1-2.7, 3.1-3.3, 4.1_

- [x] 4. Checkpoint - 确保生成逻辑正确
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 实现 GeneratorConfig 组件
  - [x] 5.1 创建 src/renderer/components/GeneratorConfig.tsx
    - 国家选择器（Select 组件，默认美国）
    - 性别选择器（Radio 组件，默认随机）
    - 数量输入（InputNumber 组件，范围 1-100，默认 1）
    - 密码设置区域：长度滑块、字符类型复选框
    - 可选字段复选框组（姓名、地址、电话、邮箱、工作单位）
    - 生成按钮
    - _Requirements: 1.4, 2.1-2.7, 3.1-3.2_

- [x] 6. 实现 GeneratorResults 组件
  - [x] 6.1 创建 src/renderer/components/GeneratorResults.tsx
    - 实现紧凑视图（Table 组件）
    - 实现展开视图（Card 组件）
    - 视图模式切换按钮
    - 每个字段的复制按钮
    - 复制全部按钮
    - 单条导入按钮
    - 批量导入按钮（多条时显示）
    - _Requirements: 5.1-5.10_

- [x] 7. 实现 ImportModal 组件
  - [x] 7.1 创建 src/renderer/components/ImportModal.tsx
    - 文件夹选择下拉框
    - 新建文件夹选项
    - 确认/取消按钮
    - 支持单条和批量导入模式
    - _Requirements: 6.1-6.8_

  - [x] 7.2 编写导入字段映射属性测试
    - **Property 4: Import field mapping**
    - **Validates: Requirements 6.4, 6.5**

  - [x] 7.3 编写批量导入属性测试
    - **Property 5: Batch import creates correct entries**
    - **Validates: Requirements 6.8**

- [x] 8. 实现 GeneratorView 组件
  - [x] 8.1 创建 src/renderer/components/GeneratorView.tsx
    - 整合 GeneratorConfig 和 GeneratorResults
    - 左侧配置区域，右侧结果区域
    - 返回密码库按钮
    - 处理导入逻辑
    - _Requirements: 1.1-1.4_

- [x] 9. 集成到 VaultPanel
  - [x] 9.1 修改 src/renderer/components/VaultPanel.tsx
    - 添加视图模式状态（normal/generator）
    - 在文件夹侧边栏底部添加"生成器"按钮
    - 根据视图模式渲染 GeneratorView 或原有内容
    - _Requirements: 1.1-1.3_

- [x] 10. Checkpoint - 功能集成测试
  - TypeScript 编译通过
  - 所有 19 个属性测试通过
  - 如有问题请询问用户

- [ ] 11. 输入验证和错误处理
  - [ ] 11.1 添加输入验证逻辑
    - 数量范围验证（1-100）
    - 密码长度范围验证（8-64）
    - 至少一种字符类型验证
    - _Requirements: 8.1-8.3_

  - [ ] 11.2 编写无效数量拒绝属性测试
    - **Property 6: Invalid quantity rejection**
    - **Validates: Requirements 8.3**

- [ ] 12. 最终 Checkpoint
  - 确保所有测试通过，如有问题请询问用户

## Notes

- All tasks including property tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
