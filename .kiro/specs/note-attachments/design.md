# 笔记附件功能设计文档

## 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                      Editor.tsx                              │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │ Toolbar         │  │ Markdown Editor / Preview       │   │
│  │ [📎 附件按钮]   │  │ ┌─────────────────────────────┐ │   │
│  └─────────────────┘  │ │ 笔记内容...                 │ │   │
│                       │ │ [attachment:xxx](file.pdf)  │ │   │
│                       │ │                             │ │   │
│                       │ │ 预览模式显示附件卡片：      │ │   │
│                       │ │ ┌─────────────────────────┐ │ │   │
│                       │ │ │ 📄 file.pdf    2.5MB    │ │ │   │
│                       │ │ └─────────────────────────┘ │ │   │
│                       │ └─────────────────────────────┘ │   │
│                       └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   ResourceManager                            │
│  - saveResource(buffer, filename, mimeType, noteId)         │
│  - getResourcePath(resourceId, ext)                         │
│  - readResource(resourceId, ext)                            │
│  - deleteResource(resourceId, ext)                          │
│  - openResource(resourceId) [新增]                          │
│  - exportResource(resourceId, targetPath) [新增]            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Database (SQLite)                        │
│  items 表 (type='resource'):                                │
│    id, payload: { filename, mime_type, size, note_id,       │
│                   file_hash }                               │
└─────────────────────────────────────────────────────────────┘
```

## 组件设计

### 1. AttachmentCard 组件

新建 `src/renderer/components/AttachmentCard.tsx`，用于在预览模式显示附件。

```typescript
interface AttachmentCardProps {
  resourceId: string;
  filename: string;
  mimeType: string;
  size: number;
  onOpen: () => void;
  onSaveAs: () => void;
  onDelete: () => void;
}
```

**样式设计：**
```css
.attachment-card {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  margin: 4px 0;
  cursor: pointer;
  user-select: none;
  max-width: 300px;
}

.attachment-card:hover {
  background: #e8e8e8;
  border-color: #1890ff;
}

.attachment-icon {
  font-size: 24px;
  margin-right: 8px;
  flex-shrink: 0;
}

.attachment-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.attachment-name {
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-meta {
  font-size: 12px;
  color: #888;
}
```

### 2. Editor.tsx 修改

**新增工具栏按钮：**
在工具栏区域添加附件按钮，位于保存按钮之前。

**新增状态：**
```typescript
const [isDragging, setIsDragging] = useState(false);
```

**新增方法：**
```typescript
// 处理附件添加
const handleInsertAttachment = async () => {
  const result = await window.electronAPI.dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: '所有文件', extensions: ['*'] }]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    await addAttachment(result.filePaths[0]);
  }
};

// 添加附件到笔记
const addAttachment = async (filePath: string) => {
  const stats = await window.electronAPI.fs.stat(filePath);
  if (stats.size > 50 * 1024 * 1024) {
    message.error('文件大小不能超过 50MB');
    return;
  }
  
  const result = await window.electronAPI.resource.saveFromFile(filePath, noteId);
  insertAttachmentRef(result.id, result.filename);
};

// 插入附件引用到编辑器
const insertAttachmentRef = (resourceId: string, filename: string) => {
  const ref = `[attachment:${resourceId}](${filename})`;
  // 在光标位置插入
  const textarea = textareaRef.current;
  if (textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = content.slice(0, start) + ref + content.slice(end);
    setContent(newContent);
    setIsDirty(true);
  }
};

// 处理拖拽
const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(true);
};

const handleDragLeave = () => {
  setIsDragging(false);
};

const handleDrop = async (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(false);
  
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    for (const file of Array.from(files)) {
      if (isImageFile(file.name)) {
        // 图片以 Markdown 图片语法插入
        await handleImageDrop(file);
      } else {
        // 其他文件以附件形式插入
        await addAttachmentFromFile(file);
      }
    }
  }
};
```

### 3. ReactMarkdown 自定义渲染

在预览模式中，需要自定义渲染附件引用：

```typescript
// 解析附件引用的正则
const ATTACHMENT_REGEX = /\[attachment:([a-f0-9-]+)\]\(([^)]+)\)/g;

// 预处理内容，将附件引用转换为特殊标记
const preprocessContent = (content: string) => {
  return content.replace(ATTACHMENT_REGEX, (match, resourceId, filename) => {
    return `<attachment data-resource-id="${resourceId}" data-filename="${filename}"></attachment>`;
  });
};

// ReactMarkdown 组件配置
<ReactMarkdown
  components={{
    // ... 其他组件
    attachment: ({ node }) => {
      const resourceId = node.properties?.['data-resource-id'];
      const filename = node.properties?.['data-filename'];
      return (
        <AttachmentCard
          resourceId={resourceId}
          filename={filename}
          // ... 其他 props
        />
      );
    },
  }}
  rehypePlugins={[rehypeRaw]}
>
  {preprocessContent(content)}
</ReactMarkdown>
```

### 4. ResourceManager 扩展

在 `src/core/resources/ResourceManager.ts` 中新增方法：

```typescript
// 用系统默认程序打开资源
async openResource(resourceId: string): Promise<void> {
  const item = this.itemsManager.getById(resourceId);
  if (!item) throw new Error('Resource not found');
  
  const payload = JSON.parse(item.payload) as ResourcePayload;
  const ext = this.getExtension(payload.filename);
  const resourcePath = this.getResourcePath(resourceId, ext);
  
  if (!fs.existsSync(resourcePath)) {
    throw new Error('Resource file not found');
  }
  
  const { shell } = require('electron');
  await shell.openPath(resourcePath);
}

// 导出资源到指定路径
async exportResource(resourceId: string, targetPath: string): Promise<void> {
  const item = this.itemsManager.getById(resourceId);
  if (!item) throw new Error('Resource not found');
  
  const payload = JSON.parse(item.payload) as ResourcePayload;
  const ext = this.getExtension(payload.filename);
  const buffer = this.readResource(resourceId, ext);
  
  if (!buffer) {
    throw new Error('Resource file not found');
  }
  
  fs.writeFileSync(targetPath, buffer);
}

// 获取资源信息
getResourceInfo(resourceId: string): ResourcePayload | null {
  const item = this.itemsManager.getById(resourceId);
  if (!item) return null;
  return JSON.parse(item.payload) as ResourcePayload;
}
```

### 5. IPC 通信扩展

在 `src/main/preload.ts` 中添加资源相关 API：

```typescript
resource: {
  saveFromFile: (filePath: string, noteId: string) => 
    ipcRenderer.invoke('resource:saveFromFile', filePath, noteId),
  open: (resourceId: string) => 
    ipcRenderer.invoke('resource:open', resourceId),
  export: (resourceId: string, targetPath: string) => 
    ipcRenderer.invoke('resource:export', resourceId, targetPath),
  delete: (resourceId: string) => 
    ipcRenderer.invoke('resource:delete', resourceId),
  getInfo: (resourceId: string) => 
    ipcRenderer.invoke('resource:getInfo', resourceId),
}
```

### 6. 文件类型工具函数

新建 `src/renderer/utils/fileUtils.ts`：

```typescript
import {
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FilePptOutlined,
  FileZipOutlined,
  FileTextOutlined,
  SoundOutlined,
  VideoCameraOutlined,
  PictureOutlined,
  FileOutlined,
} from '@ant-design/icons';

export const getFileIcon = (mimeType: string, filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  // 根据 MIME 类型判断
  if (mimeType.startsWith('image/')) return PictureOutlined;
  if (mimeType.startsWith('audio/')) return SoundOutlined;
  if (mimeType.startsWith('video/')) return VideoCameraOutlined;
  if (mimeType === 'application/pdf') return FilePdfOutlined;
  
  // 根据扩展名判断
  const extMap: Record<string, any> = {
    'doc': FileWordOutlined,
    'docx': FileWordOutlined,
    'xls': FileExcelOutlined,
    'xlsx': FileExcelOutlined,
    'ppt': FilePptOutlined,
    'pptx': FilePptOutlined,
    'zip': FileZipOutlined,
    'rar': FileZipOutlined,
    '7z': FileZipOutlined,
    'txt': FileTextOutlined,
    'md': FileTextOutlined,
  };
  
  return extMap[ext] || FileOutlined;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const isImageFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
};

export const getFileTypeLabel = (mimeType: string, filename: string): string => {
  const ext = filename.split('.').pop()?.toUpperCase() || '';
  
  const typeMap: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/msword': 'Word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'application/vnd.ms-excel': 'Excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'application/vnd.ms-powerpoint': 'PPT',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPT',
    'application/zip': 'ZIP',
    'application/x-rar-compressed': 'RAR',
    'application/x-7z-compressed': '7Z',
  };
  
  if (mimeType.startsWith('image/')) return '图片';
  if (mimeType.startsWith('audio/')) return '音频';
  if (mimeType.startsWith('video/')) return '视频';
  if (mimeType.startsWith('text/')) return '文本';
  
  return typeMap[mimeType] || ext || '文件';
};
```

## 数据流

### 添加附件流程

```
用户点击附件按钮
       │
       ▼
打开系统文件选择器
       │
       ▼
选择文件 ──────────────────────────────────────┐
       │                                        │
       ▼                                        │
检查文件大小 (< 50MB)                           │
       │                                        │
       ├── 超过限制 ──► 显示错误提示            │
       │                                        │
       ▼                                        │
调用 ResourceManager.saveFromFile()             │
       │                                        │
       ▼                                        │
文件保存到 resources 目录                       │
元数据保存到数据库                              │
       │                                        │
       ▼                                        │
返回 resourceId 和 filename                     │
       │                                        │
       ▼                                        │
在编辑器插入附件引用                            │
[attachment:resourceId](filename)               │
       │                                        │
       ▼                                        │
触发自动保存                                    │
```

### 预览附件流程

```
用户切换到预览模式
       │
       ▼
解析 Markdown 内容
       │
       ▼
识别附件引用语法
[attachment:xxx](filename)
       │
       ▼
渲染 AttachmentCard 组件
       │
       ▼
用户点击附件卡片
       │
       ├── 单击 ──► 调用 ResourceManager.openResource()
       │           用系统默认程序打开
       │
       ├── 右键菜单 ──► 显示操作选项
       │    │
       │    ├── 打开 ──► openResource()
       │    ├── 另存为 ──► exportResource()
       │    └── 删除 ──► deleteResource()
```

## Android 端适配

### 附件显示

在 `NoteDetailScreen.kt` 中解析附件引用并显示：

```kotlin
@Composable
fun AttachmentCard(
    resourceId: String,
    filename: String,
    size: Long,
    onClick: () -> Unit,
    onLongClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .combinedClickable(
                onClick = onClick,
                onLongClick = onLongClick
            )
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = getFileIcon(filename),
                contentDescription = null,
                modifier = Modifier.size(32.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(
                    text = filename,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = formatFileSize(size),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
```

### 附件操作

- 打开：使用 `Intent.ACTION_VIEW` 配合 FileProvider
- 分享：使用 `Intent.ACTION_SEND`
- 删除：调用 ResourceSyncManager 删除
