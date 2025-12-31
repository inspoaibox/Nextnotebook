# Implementation Plan: 图片工具优化扩展

## Overview

本任务列表将图片工具优化扩展的实现分解为可执行的编码任务。采用增量开发方式，先实现核心基础设施（历史管理、预设管理），再逐步添加交互增强功能。

## Tasks

- [x] 1. 创建 HistoryManager 处理历史管理器
  - [x] 1.1 创建 `src/renderer/hooks/useImageHistory.ts`
    - 定义 HistoryState 接口
    - 实现 push、undo、redo、clear 方法
    - 实现 canUndo、canRedo 状态
    - 限制最大历史记录为 20 条
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_
  
  - [x] 1.2 编写历史管理属性测试
    - **Property 10: 历史记录**
    - **Property 11: 历史撤销/重做往返**
    - **Property 12: 历史限制执行**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.5**

- [x] 2. 创建 PresetManager 预设管理器
  - [x] 2.1 创建 `src/renderer/hooks/useImagePresets.ts`
    - 定义 Preset 接口
    - 实现内置预设（Web优化、社交媒体尺寸、头像裁剪、缩略图）
    - 实现自定义预设的保存/删除（localStorage）
    - 实现 applyPreset 方法
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 2.2 编写预设管理属性测试
    - **Property 9: 预设应用完整性**
    - **Validates: Requirements 6.2**

- [x] 3. Checkpoint - 验证基础设施
  - 确保历史管理和预设管理功能正常
  - 确保所有测试通过，如有问题请询问用户

- [x] 4. 实现快捷键支持
  - [x] 4.1 创建 `src/renderer/hooks/useImageKeyboard.ts`
    - 实现 Ctrl+Z 撤销
    - 实现 Ctrl+Y / Ctrl+Shift+Z 重做
    - 实现 Ctrl+S 保存
    - 实现 Escape 重置
    - 添加快捷键帮助提示
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 4.2 集成快捷键到 ImageToolPanel
    - 在 ImageToolPanel 中使用 useImageKeyboard hook
    - 添加快捷键帮助按钮和 Tooltip
    - _Requirements: 8.5_

- [x] 5. 实现设置持久化
  - [x] 5.1 创建 `src/renderer/hooks/useImageSettings.ts`
    - 定义 UserSettings 接口
    - 实现设置的保存/加载（localStorage）
    - 记住每个工具的最后使用设置
    - 记住实时预览开关状态
    - _Requirements: 9.5_
  
  - [x] 5.2 编写设置持久化属性测试
    - **Property 13: 设置持久化**
    - **Validates: Requirements 9.5**

- [x] 6. 实现实时预览功能
  - [x] 6.1 更新 ImageToolPanel 添加实时预览
    - 添加实时预览开关
    - 实现防抖处理（300ms）
    - 实现低分辨率预览（最大 800px）
    - 添加加载指示器
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [x] 6.2 编写实时预览属性测试
    - **Property 3: 防抖防止过多请求**
    - **Property 4: 预览使用低分辨率**
    - **Validates: Requirements 2.3, 2.4**

- [x] 7. Checkpoint - 验证交互基础功能
  - 确保快捷键、设置持久化、实时预览功能正常
  - 确保所有测试通过，如有问题请询问用户

- [x] 8. 实现可视化裁剪框
  - [x] 8.1 创建 `src/renderer/components/CropBox.tsx`
    - 实现可拖拽的裁剪框覆盖层
    - 实现边缘拖拽调整大小
    - 实现中心拖拽移动位置
    - 实现边界约束
    - 显示尺寸标签
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_
  
  - [x] 8.2 编写裁剪框属性测试
    - **Property 1: 裁剪框边界约束**
    - **Property 2: 裁剪框状态同步**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.6**
  
  - [x] 8.3 集成 CropBox 到 CropTool
    - 在 CropTool 组件中使用 CropBox
    - 实现输入框与裁剪框的双向同步
    - _Requirements: 1.4_

- [x] 9. 实现处理前后对比视图
  - [x] 9.1 创建 `src/renderer/components/ComparisonView.tsx`
    - 实现滑块分割视图
    - 支持水平和垂直对比模式
    - 实现滑块拖拽交互
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 9.2 编写对比视图属性测试
    - **Property 5: 对比滑块比例显示**
    - **Validates: Requirements 3.2**
  
  - [x] 9.3 集成 ComparisonView 到 ImagePreview
    - 在 ImagePreview 组件中添加对比模式切换
    - 添加对比模式按钮
    - _Requirements: 3.5_

- [x] 10. Checkpoint - 验证可视化交互功能
  - 确保裁剪框和对比视图功能正常
  - 确保所有测试通过，如有问题请询问用户

- [x] 11. 实现文字水印功能
  - [x] 11.1 扩展 ImageService 添加文字水印
    - 在 `src/main/services/ImageService.ts` 添加 textWatermark 处理
    - 使用 sharp 的 composite 和 SVG 文本渲染
    - 支持字体、大小、颜色、透明度配置
    - 支持 9 宫格定位
    - _Requirements: 5.1, 5.2, 5.3, 5.5_
  
  - [x] 11.2 编写文字水印属性测试
    - **Property 8: 文字水印渲染**
    - **Validates: Requirements 5.1, 5.3, 5.5**
  
  - [x] 11.3 更新 WatermarkTool 添加文字水印 UI
    - 添加文字/图片水印切换
    - 添加文字输入框（支持多行）
    - 添加字体、大小、颜色、透明度配置
    - _Requirements: 5.2, 5.4_

- [ ] 12. 实现批量处理功能
  - [ ] 12.1 创建 `src/renderer/hooks/useBatchProcessor.ts`
    - 定义 BatchItem 接口
    - 实现文件添加/移除
    - 实现批量处理逻辑
    - 实现进度跟踪
    - 实现错误处理（继续处理其他图片）
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_
  
  - [ ] 12.2 编写批量处理属性测试
    - **Property 6: 批量处理应用相同设置**
    - **Property 7: 批量错误处理继续处理**
    - **Validates: Requirements 4.2, 4.5**
  
  - [ ] 12.3 创建 `src/renderer/components/BatchProcessPanel.tsx`
    - 实现多文件上传区域
    - 实现文件列表显示（带状态）
    - 实现进度条显示
    - 实现处理结果汇总
    - _Requirements: 4.3, 4.6_
  
  - [ ] 12.4 实现 ZIP 下载功能
    - 安装 jszip 依赖
    - 实现批量结果打包下载
    - _Requirements: 4.4_

- [ ] 13. 集成所有功能到 ImageToolPanel
  - [ ] 13.1 更新 ImageToolPanel 主组件
    - 集成 useImageHistory hook
    - 集成 useImagePresets hook
    - 集成 useImageKeyboard hook
    - 集成 useImageSettings hook
    - 添加批量处理模式切换
    - _Requirements: 7.4, 9.1, 9.2_
  
  - [ ] 13.2 添加预设选择 UI
    - 在各工具组件中添加预设下拉菜单
    - 添加保存当前设置为预设的按钮
    - _Requirements: 6.3, 6.5_

- [ ] 14. 交互优化
  - [ ] 14.1 添加进度指示器
    - 处理超过 500ms 显示进度条
    - 添加操作完成通知
    - _Requirements: 9.1, 9.2_
  
  - [ ] 14.2 添加工具提示
    - 为所有工具选项添加 Tooltip
    - 添加快捷键提示
    - _Requirements: 9.4_
  
  - [ ] 14.3 实现水印拖拽定位
    - 支持在预览图上拖拽水印位置
    - _Requirements: 9.3_

- [ ] 15. Final Checkpoint - 完整功能验证
  - 确保所有优化扩展功能正常工作
  - 确保所有属性测试通过
  - 验证错误处理和用户提示
  - 确保所有测试通过，如有问题请询问用户

## Notes

- 每个 Checkpoint 用于验证阶段性成果
- 属性测试使用 fast-check 库
- 批量处理需要安装 jszip: `npm install jszip`
- 文字水印使用 SVG 渲染后合成到图片
- 所有设置持久化使用 localStorage

