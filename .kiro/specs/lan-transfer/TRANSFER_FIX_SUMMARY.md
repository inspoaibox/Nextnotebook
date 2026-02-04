# 文件传输功能修复总结

## 修复日期: 2026-02-02

## 问题描述

1. **手机端发文字消息，电脑端接收不到**
2. **手机端发文件/照片，手机端看不到发送记录**
3. **电脑端发文件，电脑端显示记录但手机端接收不到**
4. **手机端发文件到电脑端，电脑端显示接收但文件没有实际保存**

## 根本原因分析

### 问题 1: sessionId 不匹配
- 桌面端和手机端各自维护独立的 sessionId
- ChatView 使用 `data.sessionId === session.id` 来过滤消息
- 但手机端发送的 sessionId 是手机端本地的，与桌面端不同
- 导致消息被错误过滤掉

### 问题 2: UI 未刷新
- Android 端保存数据到数据库后，没有手动触发 UI 刷新
- Room 的 Flow 可能没有正确触发更新

### 问题 3: 数据库记录缺失
- 桌面端 `transferClient.sendFile` 只发送文件，没有保存到本地数据库
- 导致发送记录丢失

### 问题 4: 文件数据未保存到本地（新发现）
- `TransferServer.ts`（局域网模式）只是将文件事件转发给渲染进程
- 没有在主进程中实际保存文件数据到本地文件系统
- 对比 `RelayClient.ts`（中继模式）有完整的文件保存逻辑

## 修复内容

### Task 1: 修复桌面端消息接收匹配逻辑
**文件**: `src/renderer/components/transfer/ChatView.tsx`

修改消息接收监听，通过 `senderId` 而不是 `sessionId` 来匹配：
```typescript
// 修改前
if (data.sessionId === session.id) { ... }

// 修改后
if (data.senderId === session.peer_device_id) { ... }
```

### Task 2: 修复桌面端文件接收匹配逻辑
**文件**: `src/renderer/components/transfer/ChatView.tsx`

同样修改文件接收监听，通过 `senderId` 来匹配。

### Task 3: 修复 Android 端发送后 UI 刷新
**文件**: `android/app/src/main/java/com/mucheng/notes/presentation/viewmodel/TransferViewModel.kt`

在 `sendFile()` 和 `sendTextMessage()` 函数中，发送成功后手动调用：
```kotlin
loadSessionFiles(sessionId)
loadSessionMessages(sessionId)
```

### Task 4: 修复桌面端文件发送的数据库保存
**文件**: `src/renderer/services/transferClient.ts`

在 `sendFile()` 函数中添加数据库保存逻辑：
```typescript
// 保存文件记录到本地数据库
await this.createFileTransfer(fileEntity);

// 创建文件消息
await this.createMessage(message);
```

### Task 5: 增强日志输出
**文件**: `src/main/services/TransferServer.ts`

在 `handleMessageSend` 和 `handleFileStart` 中添加详细日志，便于调试。

### Task 6: 修复 Android 端接收消息/文件后的 UI 刷新
**文件**: `android/app/src/main/java/com/mucheng/notes/presentation/viewmodel/TransferViewModel.kt`

在 `handleMessageReceived`、`handleFileIncoming`、`handleFileComplete` 中添加手动刷新：
```kotlin
if (_uiState.value.selectedSessionId == sessionId) {
    loadSessionMessages(sessionId)
    loadSessionFiles(sessionId)
}
```

### Task 7: 修复桌面端局域网模式下文件接收保存（新增）
**文件**: `src/main/services/TransferServer.ts`

在 `TransferServer` 中添加文件保存逻辑，类似于 `RelayClient.ts` 的实现：

1. 添加文件流管理：
```typescript
private fileStreams: Map<string, fs.WriteStream> = new Map();
private fileInfoCache: Map<string, { filename: string; localPath: string; sessionId?: string }> = new Map();
```

2. 在 `handleFileStart` 中创建写入流：
```typescript
const downloadPath = app.getPath('downloads');
const targetDir = path.join(downloadPath, 'NextNotebook');
const stream = fs.createWriteStream(targetPath);
this.fileStreams.set(fileInfo.id, stream);
```

3. 在 `handleFileChunk` 中写入文件数据：
```typescript
const buffer = Buffer.from(chunk, 'base64');
stream.write(buffer);
```

4. 在 `handleFileComplete` 中关闭流并返回本地路径：
```typescript
stream.end();
this.emit('file:complete', { senderId, fileId, fileHash, localPath, filename });
```

5. 在 `handleFileCancel` 中清理未完成的文件

6. 在 `stop()` 中清理所有未完成的文件流

**文件**: `src/renderer/components/transfer/ChatView.tsx`

更新 `onFileComplete` 处理，使用服务器返回的本地路径：
```typescript
local_path: data.localPath || f.local_path
transferClient.completeFileTransfer(data.fileId, data.localPath || '', data.fileHash);
```

---

## 中继服务器功能修复 (2026-02-02 续)

### 问题描述

中继模式下，桌面端发送消息和文件使用了错误的 API，导致消息无法通过中继服务器转发。

### 根本原因分析

1. **ChatView 中继模式消息发送使用了错误的 API**
   - `ChatView.tsx` 中发送消息时调用的是 `transferClient.sendTextMessage()`
   - 这个方法内部调用的是 `transferApi.sendMessage()`，这是局域网模式的 API
   - 在中继模式下，应该使用 `transferApi.relay.sendMessage()`

2. **ChatView 中继模式文件发送使用了错误的 API**
   - 同样，文件发送也使用了局域网模式的 API `transferClient.sendFile()`
   - 应该使用 `transferApi.relay.sendFile()`

3. **Android 端会话创建时 connectionType 硬编码**
   - `TransferViewModel.kt` 的 `findOrCreateSessionForDevice` 方法中
   - 创建新会话时 `connectionType` 被硬编码为 `ConnectionMode.LAN.value`
   - 应该根据当前连接状态动态确定

### 修复内容

#### Task 8: 修复桌面端中继模式消息发送
**文件**: `src/renderer/components/transfer/ChatView.tsx`

根据会话的 `connection_type` 选择正确的 API：
```typescript
if (session.connection_type === 'relay') {
  // 中继模式：使用 relay API
  await transferApi.relay.sendMessage(
    session.peer_device_id,
    session.id,
    { id: newMessage.id, type: 'text', content: newMessage.content }
  );
} else {
  // 局域网模式：使用原有 API
  await transferClient.sendTextMessage(...);
}
```

#### Task 9: 修复桌面端中继模式文件发送
**文件**: `src/renderer/components/transfer/ChatView.tsx`

同样根据 `connection_type` 选择正确的 API：
```typescript
if (session.connection_type === 'relay') {
  result = await transferApi.relay.sendFile(
    session.peer_device_id,
    session.id,
    filePath
  );
  // 中继模式下需要手动保存文件记录到数据库
  await transferClient.createFileTransfer(newFile);
  await transferClient.createMessage(fileMessage);
} else {
  result = await transferClient.sendFile(...);
}
```

#### Task 10: 修复 Android 端会话创建时的连接类型
**文件**: `android/app/src/main/java/com/mucheng/notes/presentation/viewmodel/TransferViewModel.kt`

在 `findOrCreateSessionForDevice` 中根据当前连接状态确定连接类型：
```kotlin
val currentConnectionType = when (val state = _uiState.value.connectionState) {
    is ConnectionState.Connected -> state.mode.value
    else -> ConnectionMode.LAN.value
}
```

## 测试清单

### 局域网模式
- [ ] 手机端发送文字消息，电脑端能正确接收并显示
- [ ] 手机端发送文件/照片，手机端能看到发送记录
- [ ] 电脑端发送文字消息，手机端能正确接收并显示
- [ ] 电脑端发送文件，手机端能正确接收并显示
- [ ] 手机端发送文件，电脑端能正确接收并保存到本地
- [ ] 双向文件传输完成后，两端都能看到完整记录
- [ ] 文件保存到 Downloads/NextNotebook 目录

### 中继模式
- [ ] 电脑端连接中继服务器成功
- [ ] 手机端连接中继服务器成功
- [ ] 电脑端能看到手机端在线
- [ ] 手机端能看到电脑端在线
- [ ] 电脑端发送文字消息，手机端能正确接收
- [ ] 手机端发送文字消息，电脑端能正确接收
- [ ] 电脑端发送文件，手机端能正确接收
- [ ] 手机端发送文件，电脑端能正确接收
- [ ] 会话的 connection_type 正确标记为 'relay'

## 修改的文件列表

1. `src/renderer/components/transfer/ChatView.tsx`
2. `src/renderer/services/transferClient.ts`
3. `src/main/services/TransferServer.ts`
4. `android/app/src/main/java/com/mucheng/notes/presentation/viewmodel/TransferViewModel.kt`

---

## 代码审查发现的潜在问题

### 问题 1: RelayClient 文件接收时 chunk 解码问题 ✅ 已修复
**文件**: `src/main/services/RelayClient.ts`
**位置**: `FILE_CHUNK` 事件处理

**问题**: 中继服务器转发的 chunk 是 base64 编码的字符串，但原代码没有指定 `'base64'` 编码参数。

**修复**: 添加 `'base64'` 编码参数：
```typescript
const chunk = Buffer.isBuffer(data.chunk) 
  ? data.chunk 
  : Buffer.from(data.chunk, 'base64');
```

### 问题 2: RelayClient 文件完成时缺少 localPath 传递 ✅ 已修复
**文件**: `src/main/services/RelayClient.ts`
**位置**: `FILE_COMPLETE` 事件处理

**问题**: `emit('file:complete', data)` 没有包含 `localPath`，导致前端无法获取文件保存路径。

**修复**: 在 emit 时添加 localPath 和 filename：
```typescript
this.emit('file:complete', { 
  ...data, 
  localPath: fileRecord?.local_path,
  filename: fileRecord?.filename 
});
```

### 问题 3: relay.ts 中 handleFileCancel 参数未使用 ✅ 已修复
**文件**: `sync-server/src/transfer/relay.ts`

**修复**: 将 `socket` 参数改为 `_socket` 表示有意不使用

---

## 可扩展功能建议

### 1. 传输进度显示优化
- 当前文件传输进度更新频率较低
- 建议添加实时进度条显示
- 可以在 `FILE_CHUNK` 事件中计算并显示百分比

### 2. 断点续传支持
- 当前文件传输中断后需要重新开始
- 可以记录已传输的 chunk 索引
- 支持从断点处继续传输

### 3. 多文件批量传输
- 当前只支持单文件传输
- 可以添加文件队列管理
- 支持选择多个文件一次性发送

### 4. 传输速度显示
- 显示实时传输速度 (KB/s, MB/s)
- 显示预计剩余时间

### 5. 文件预览功能
- 图片文件支持缩略图预览
- 文本文件支持内容预览
- 视频文件支持封面预览

### 6. 传输历史搜索
- 支持按文件名搜索
- 支持按日期范围筛选
- 支持按设备筛选

### 7. 自动重连机制
- 网络断开后自动尝试重连
- 可配置重连次数和间隔
- 重连成功后恢复未完成的传输

### 8. 文件加密传输
- 支持端到端加密
- 使用 AES 加密文件内容
- 密钥通过安全通道交换

### 9. 剪贴板同步
- 支持文本剪贴板同步
- 支持图片剪贴板同步
- 可配置自动同步或手动同步

### 10. 通知增强
- 传输完成桌面通知
- 传输失败通知
- 新消息通知（带预览）
