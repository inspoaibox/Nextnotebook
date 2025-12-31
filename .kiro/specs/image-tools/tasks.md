# Implementation Plan: 图片处理工具

## Overview

本任务列表将图片处理工具的实现分解为可执行的编码任务。采用增量开发方式，先搭建核心架构，再逐步实现各个工具功能。

## Tasks

- [x] 1. 项目设置和依赖安装
  - 安装 sharp 依赖: `npm install sharp`
  - 安装 sharp 类型定义: `npm install -D @types/sharp`
  - 验证 sharp 在 Electron 环境中正常工作
  - _Requirements: 10.1_

- [x] 2. 创建 ImageService 核心服务
  - [x] 2.1 创建 `src/main/services/ImageService.ts` 基础结构
    - 定义 ImageMetadata、ProcessOptions、ProcessResult 接口
    - 实现 getMetadata 方法获取图片元数据
    - 实现 generatePreview 方法生成缩略图
    - _Requirements: 8.1, 8.2_
  
  - [x] 2.2 实现格式转换功能
    - 实现 toFormat 方法支持 JPEG、PNG、WebP、AVIF、GIF、TIFF 输出
    - 实现 SVG 输入支持（rasterize）
    - 实现各格式的质量/压缩选项
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  
  - [x] 2.3 编写格式转换属性测试
    - **Property 1: 格式转换往返一致性**
    - **Validates: Requirements 1.1, 1.2**

- [x] 3. 配置 IPC 通道
  - [x] 3.1 扩展 `src/main/preload.ts` 添加 image API
    - 添加 getMetadata、process、generatePreview、saveFile 通道
    - _Requirements: 10.2_
  
  - [x] 3.2 在 `src/main/main.ts` 注册 IPC 处理器
    - 注册 image:getMetadata 处理器
    - 注册 image:process 处理器
    - 注册 image:generatePreview 处理器
    - 注册 image:saveFile 处理器（使用 dialog.showSaveDialog）
    - _Requirements: 10.5_

- [x] 4. 创建渲染进程 API 和类型定义
  - [x] 4.1 创建 `src/renderer/services/imageApi.ts`
    - 封装 IPC 调用
    - 处理 Base64 编解码
    - _Requirements: 10.2_
  
  - [x] 4.2 扩展 `src/renderer/types/electron.d.ts`
    - 添加 image API 类型定义
    - _Requirements: 10.2_

- [x] 5. Checkpoint - 验证基础架构
  - 确保 IPC 通道正常工作
  - 测试图片元数据读取
  - 确保所有测试通过，如有问题请询问用户

- [x] 6. 创建 ImageToolPanel 基础组件
  - [x] 6.1 创建 `src/renderer/components/ImageToolPanel.tsx` 框架
    - 实现工具选择侧边栏
    - 实现图片上传区域（拖拽+点击）
    - 实现预览区域框架
    - 实现加载状态和错误提示
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [x] 6.2 集成到 ToolboxPanel
    - 在 ToolboxPanel 添加 "图片处理" 分类
    - 添加 9 个图片工具菜单项
    - 路由到 ImageToolPanel 组件
    - _Requirements: 10.1, 10.2_

- [x] 7. 实现格式转换工具 UI
  - [x] 7.1 创建 FormatConvertTool 组件
    - 输出格式选择（JPEG/PNG/WebP/AVIF/GIF/TIFF）
    - 各格式参数配置（质量、压缩级别、lossy/lossless）
    - 显示转换前后文件大小对比
    - 下载按钮
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [x] 8. 实现尺寸调整功能
  - [x] 8.1 在 ImageService 添加 resize 处理
    - 实现 resize 方法支持 width、height、fit 选项
    - 实现 extend 方法添加边距
    - 实现 trim 方法自动裁边
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  
  - [x] 8.2 编写尺寸调整属性测试
    - **Property 2: 尺寸调整维度正确性**
    - **Property 3: 宽高比保持**
    - **Validates: Requirements 2.1, 2.2**
  
  - [x] 8.3 创建 ResizeTool 组件
    - 宽高输入框（支持锁定比例）
    - fit 模式选择
    - extend 边距配置
    - trim 开关
    - 实时预览
    - _Requirements: 2.5, 2.7_

- [x] 9. 实现图片裁剪功能
  - [x] 9.1 在 ImageService 添加 extract 处理
    - 实现 extract 方法指定区域裁剪
    - 实现 attention/entropy 智能裁剪
    - _Requirements: 3.1, 3.4, 3.5_
  
  - [x] 9.2 编写裁剪属性测试
    - **Property 4: 裁剪区域正确性**
    - **Validates: Requirements 3.1**
  
  - [x] 9.3 创建 CropTool 组件
    - 可视化裁剪框（可拖拽调整）
    - 裁剪尺寸实时显示
    - 智能裁剪模式选择
    - _Requirements: 3.2, 3.3, 3.6_

- [x] 10. 实现旋转翻转功能
  - [x] 10.1 在 ImageService 添加 rotate/flip/flop 处理
    - 实现 rotate 方法（90/180/270/自定义角度）
    - 实现 flip 方法（垂直翻转）
    - 实现 flop 方法（水平翻转）
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [x] 10.2 编写旋转翻转属性测试
    - **Property 5: 翻转往返一致性**
    - **Property 6: 旋转维度变换**
    - **Validates: Requirements 4.1, 4.3, 4.4**
  
  - [x] 10.3 创建 RotateFlipTool 组件
    - 快捷旋转按钮（90°/180°/270°）
    - 自定义角度输入
    - 水平/垂直翻转按钮
    - 实时预览
    - _Requirements: 4.5_

- [x] 11. Checkpoint - 验证基础图片操作
  - 确保格式转换、尺寸调整、裁剪、旋转翻转功能正常
  - 确保所有测试通过，如有问题请询问用户

- [x] 12. 实现颜色处理功能
  - [x] 12.1 在 ImageService 添加颜色处理
    - 实现 modulate 方法（亮度、饱和度、色调）
    - 实现 grayscale 方法
    - 实现 tint 方法
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 12.2 编写颜色处理属性测试
    - **Property 7: 灰度转换一致性**
    - **Validates: Requirements 5.5**
  
  - [x] 12.3 创建 ColorAdjustTool 组件
    - 亮度滑块 (-100 ~ +100)
    - 对比度滑块 (-100 ~ +100)
    - 饱和度滑块 (-100 ~ +100)
    - 色调滑块 (0 ~ 360)
    - 灰度开关
    - 实时预览
    - _Requirements: 5.6_

- [x] 13. 实现滤镜效果功能
  - [x] 13.1 在 ImageService 添加滤镜处理
    - 实现 blur 方法（高斯模糊）
    - 实现 sharpen 方法（锐化）
    - 实现 median 方法（中值滤波）
    - 实现 gamma 方法（gamma 校正）
    - 实现 negate 方法（反色）
    - 实现 normalise 方法（归一化）
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  
  - [x] 13.2 编写滤镜属性测试
    - **Property 8: Gamma 1.0 恒等性**
    - **Validates: Requirements 6.4**
  
  - [x] 13.3 创建 FiltersTool 组件
    - 模糊强度滑块
    - 锐化参数配置
    - 中值滤波窗口大小
    - Gamma 值滑块
    - 反色/归一化开关
    - 前后对比预览
    - _Requirements: 6.7_

- [x] 14. 实现水印叠加功能
  - [x] 14.1 在 ImageService 添加 composite 处理
    - 实现图片水印叠加
    - 实现位置计算（9 宫格）
    - 实现透明度和混合模式
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 14.2 创建 WatermarkTool 组件
    - 水印图片上传
    - 位置选择（9 宫格）
    - 透明度滑块
    - 尺寸比例调整
    - 混合模式选择
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 15. 实现元数据功能
  - [x] 15.1 完善 ImageService 元数据处理
    - 完善 EXIF 数据解析
    - 实现 ICC 配置文件读取
    - 实现元数据剥离功能
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.6_
  
  - [x] 15.2 编写元数据属性测试
    - **Property 9: 元数据剥离完整性**
    - **Validates: Requirements 8.5**
  
  - [x] 15.3 创建 MetadataTool 组件
    - 基本信息显示（尺寸、格式、色彩空间、文件大小）
    - EXIF 信息展示（相机、日期、GPS、曝光参数）
    - ICC 配置文件信息
    - 元数据剥离按钮
    - _Requirements: 8.2, 8.3, 8.4_

- [x] 16. 实现优化压缩功能
  - [x] 16.1 在 ImageService 添加压缩优化
    - 实现 JPEG 压缩（quality、progressive、mozjpeg）
    - 实现 PNG 压缩（compressionLevel、palette）
    - 实现 WebP 压缩（quality、lossless）
    - 实现 AVIF 压缩（quality、speed、lossless）
    - 实现 Web 优化预设
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.7_
  
  - [x] 16.2 编写压缩属性测试
    - **Property 10: 压缩文件大小减少**
    - **Validates: Requirements 9.1, 9.2, 9.3**
  
  - [x] 16.3 创建 CompressTool 组件
    - 输出格式选择
    - 质量滑块
    - 格式特定选项（progressive、mozjpeg、lossless 等）
    - 压缩前后大小对比
    - 压缩率显示
    - Web 优化一键按钮
    - _Requirements: 9.5, 9.6_

- [x] 17. Final Checkpoint - 完整功能验证
  - 确保所有 9 个工具功能正常
  - 确保所有属性测试通过
  - 验证错误处理和用户提示
  - 确保所有测试通过，如有问题请询问用户

## Notes

- 每个 Checkpoint 用于验证阶段性成果
- Sharp 库在 Electron 中需要 rebuild，安装时注意 `electron-rebuild`
- 图片处理为 CPU 密集型操作，大图片处理时需显示进度
- 属性测试使用 fast-check 库，需要先安装：`npm install -D fast-check`
