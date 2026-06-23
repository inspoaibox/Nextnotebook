# 密码库分组获取问题调试

## 问题描述
用户反馈：插件检测到当前页面有新的密码添加的弹窗时，保存到密码库的时候，底部的分组只有一个"未分类"，没有完整获取分组数据。

## 数据流向分析

### 1. 后端 API
- **路径**: `/api/vault-folders`
- **方法**: GET
- **认证**: 需要 `X-Mucheng-Extension-Token` header
- **实现位置**: `src/main/services/ClipperService.ts` 第 277-914 行
- **返回格式**:
  ```json
  {
    "success": true,
    "folders": [
      {
        "id": "folder-id",
        "name": "分组名称",
        "parentId": "parent-id-or-null",
        "updatedAt": 1234567890
      }
    ]
  }
  ```

### 2. 插件后台脚本 (background.js)
- **函数**: `queryVaultFolders()` - 第 262 行
  - 调用 `/api/vault-folders` API
  - 使用 `vaultFetch` 进行认证
  - 返回 JSON 结果

- **函数**: `handleVaultCandidate()` - 第 270 行
  - 当检测到密码候选时被调用
  - 在第 298-304 行获取分组数据
  - 在第 307 行将分组添加到 `candidate` 对象
  - 在第 313 行通过消息传递给 content script

### 3. 插件内容脚本 (content.js)
- **消息监听**: 第 20-22 行
  - 监听 `showVaultSavePrompt` 消息
  - 接收 `request.candidate` 数据

- **函数**: `showVaultSavePrompt(candidate)` - 第 365 行
  - 接收 candidate 对象（包含 folders 数组）
  - 在第 551 行调用 `createVaultPromptSelect` 创建分组下拉框

- **函数**: `createVaultPromptSelect(label, folders, selectedId)` - 第 326 行
  - 递归构建层级分组选项
  - 如果 `folders` 为空或 undefined，只显示"未分类"

## 已添加的调试日志

### background.js
1. 第 262 行：`queryVaultFolders` 函数
   - 记录 API 响应状态
   - 记录返回的结果
   - 记录异常信息

2. 第 298 行：`handleVaultCandidate` 函数
   - 记录开始加载分组
   - 记录分组查询结果
   - 记录加载成功/失败
   - 记录最终传递给弹窗的 folders 数量

### content.js
1. 第 368 行：`showVaultSavePrompt` 函数
   - 记录接收到的 folders 数量和内容

2. 第 339 行：`createVaultPromptSelect` 函数
   - 记录传入的 folders 数量和内容

## 问题可能原因

### 1. API 认证失败
- **可能性**: 中等
- **检查方式**: 查看控制台是否有 403 错误
- **解决方案**: 确保 `/api/vault-folders` 在 `isVaultPath` 中 ✓ 已确认在白名单

### 2. API 返回数据格式不对
- **可能性**: 低
- **检查方式**: 查看日志中的返回数据
- **解决方案**: 已添加详细日志

### 3. 异步时序问题
- **可能性**: 中等
- **检查方式**: 查看日志顺序
- **解决方案**: 已经使用 await 等待异步完成

### 4. 消息传递丢失数据
- **可能性**: 低
- **检查方式**: 对比 background 和 content 的日志
- **解决方案**: Chrome 消息传递会自动序列化对象

### 5. 数据库中没有分组
- **可能性**: 高
- **检查方式**: 查看返回的 folders 数组是否为空
- **解决方案**: 如果确实没有分组，这是正常行为

## 测试步骤

1. **重新加载插件**
   ```
   chrome://extensions/ → 重新加载
   ```

2. **打开测试页面**
   - 访问任意有登录表单的网站

3. **输入账号密码**
   - 输入用户名
   - 输入密码
   - 点击登录按钮或按 Enter

4. **查看控制台日志**
   - 右键点击页面 → 检查
   - 切换到 Console 标签
   - 查找以 `[Vault]` 开头的日志

5. **检查日志内容**
   - `[Vault] Loading folders for prompt...` - 开始加载
   - `[Vault] Folder query result: {...}` - API 返回结果
   - `[Vault] Loaded folders for prompt: N [...]` - 加载的分组数量和内容
   - `[Vault] Prepared prompt candidate with folders: N` - 传递的分组数量
   - `[Vault] showVaultSavePrompt received candidate with folders: N` - content script 接收的分组数量
   - `[Vault] createVaultPromptSelect received folders: N` - 构建下拉框时的分组数量

## 预期结果

### 如果有分组数据
- 所有日志中的分组数量应该一致且 > 0
- 弹窗中的分组下拉框应该显示所有分组

### 如果没有分组数据
- 所有日志中的分组数量应该为 0
- 这是正常行为，需要先在主应用中创建分组

## 下一步

根据控制台日志确定：
1. API 是否成功返回数据
2. 数据是否正确传递到 content script
3. 如果数据传递正确但下拉框仍然只显示"未分类"，检查 DOM 构建逻辑
