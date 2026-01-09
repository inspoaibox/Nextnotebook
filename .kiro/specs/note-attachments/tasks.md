# 笔记附件功能实现任务

## 任务 1: 创建文件工具函数

**文件:** `src/renderer/utils/fileUtils.ts`

**验收标准:**
- [ ] 实现 `getFileIcon(mimeType, filename)` 返回对应的 Ant Design 图标组件
- [ ] 实现 `formatFileSize(bytes)` 格式化文件大小显示
- [ ] 实现 `isImageFile(filename)` 判断是否为图片文件
- [ ] 实现 `getFileTypeLabel(mimeType, filename)` 返回文件类型标签

---

## 任务 2: 扩展 ResourceManager

**文件:** `src/core/resources/ResourceManager.ts`

**验收标准:**
- [ ] 添加 `openResource(resourceId)` 方法，使用系统默认程序打开文件
- [ ] 添加 `exportResource(resourceId, targetPath)` 方法，导出文件到指定路径
- [ ] 添加 `getResourceInfo(resourceId)` 方法，获取资源元数据
- [ ] 添加更多 MIME 类型映射支持

---

## 任务 3: 添加 IPC 通信接口

**文件:** `src/main/preload.ts`, `src/main/main.ts`

**验收标准:**
- [ ] 在 preload.ts 中暴露 `resource.saveFromFile` API
- [ ] 在 preload.ts 中暴露 `resource.open` API
- [ ] 在 preload.ts 中暴露 `resource.export` API
- [ ] 在 preload.ts 中暴露 `resource.delete` API
- [ ] 在 preload.ts 中暴露 `resource.getInfo` API
- [ ] 在 main.ts 中注册对应的 IPC handlers
- [ ] 更新 `src/renderer/types/electron.d.ts` 类型定义

---

## 任务 4: 创建 AttachmentCard 组件

**文件:** `src/renderer/components/AttachmentCard.tsx`

**验收标准:**
- [ ] 创建 AttachmentCard 组件，显示文件图标、名称、大小
- [ ] 支持点击打开文件
- [ ] 支持右键菜单（打开、另存为、删除）
- [ ] 添加 hover 效果
- [ ] 样式与整体 UI 风格一致

---

## 任务 5: 修改 Editor 组件添加附件功能

**文件:** `src/renderer/components/Editor.tsx`

**验收标准:**
- [ ] 在工具栏添加「添加附件」按钮
- [ ] 实现 `handleInsertAttachment` 方法，打开文件选择器
- [ ] 实现 `addAttachment` 方法，保存文件并插入引用
- [ ] 实现 `insertAttachmentRef` 方法，在光标位置插入附件引用
- [ ] 添加文件大小检查（50MB 限制）
- [ ] 添加 textarea ref 用于获取光标位置

---

## 任务 6: 实现拖拽添加附件

**文件:** `src/renderer/components/Editor.tsx`

**验收标准:**
- [ ] 添加 `isDragging` 状态
- [ ] 实现 `handleDragOver` 方法
- [ ] 实现 `handleDragLeave` 方法
- [ ] 实现 `handleDrop` 方法
- [ ] 图片文件以 Markdown 图片语法插入
- [ ] 其他文件以附件引用形式插入
- [ ] 显示拖拽提示区域

---

## 任务 7: 实现预览模式附件渲染

**文件:** `src/renderer/components/Editor.tsx`

**验收标准:**
- [ ] 定义附件引用正则表达式
- [ ] 实现 `preprocessContent` 方法，将附件引用转换为 HTML 标记
- [ ] 配置 ReactMarkdown 自定义组件渲染 AttachmentCard
- [ ] 安装并配置 `rehype-raw` 插件支持 HTML 渲染
- [ ] 附件卡片点击可打开文件
- [ ] 附件卡片右键显示操作菜单

---

## 任务 8: 实现附件删除功能

**文件:** `src/renderer/components/Editor.tsx`, `src/renderer/components/AttachmentCard.tsx`

**验收标准:**
- [ ] 删除前显示确认对话框
- [ ] 调用 ResourceManager 删除文件和数据库记录
- [ ] 从笔记内容中移除附件引用
- [ ] 显示删除成功提示

---

## 任务 9: Android 端附件显示

**文件:** `android/app/src/main/java/com/mucheng/notes/presentation/screens/notes/NoteDetailScreen.kt`

**验收标准:**
- [ ] 解析笔记内容中的附件引用
- [ ] 创建 AttachmentCard Composable 组件
- [ ] 显示文件图标、名称、大小
- [ ] 支持点击打开文件
- [ ] 支持长按显示操作菜单

---

## 任务 10: Android 端附件操作

**文件:** `android/app/src/main/java/com/mucheng/notes/presentation/viewmodel/NoteDetailViewModel.kt`

**验收标准:**
- [ ] 实现打开附件功能（使用 Intent.ACTION_VIEW）
- [ ] 实现分享附件功能（使用 Intent.ACTION_SEND）
- [ ] 实现删除附件功能
- [ ] 配置 FileProvider 支持文件访问

---

## 任务 11: Android 端添加附件

**文件:** `android/app/src/main/java/com/mucheng/notes/presentation/screens/notes/NoteDetailScreen.kt`

**验收标准:**
- [ ] 添加「添加附件」按钮
- [ ] 实现文件选择器（使用 ActivityResultContracts.GetContent）
- [ ] 保存文件到本地存储
- [ ] 创建资源记录
- [ ] 在笔记内容中插入附件引用

---

## 任务 12: 测试与文档

**验收标准:**
- [ ] 测试桌面端添加各类型附件
- [ ] 测试桌面端拖拽添加附件
- [ ] 测试桌面端打开、导出、删除附件
- [ ] 测试 Android 端附件显示和操作
- [ ] 测试附件同步功能
- [ ] 更新 README 文档说明附件功能
