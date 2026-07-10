import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 应用路径
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),

  // 使用系统默认浏览器打开链接
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // 使用系统默认程序打开本地文件
  openPath: (filePath: string) => ipcRenderer.invoke('open-path', filePath),

  // 开机启动设置
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('set-auto-launch', enabled),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),

  // 主题设置（保存到主进程可读取的文件，用于启动时背景色）
  saveThemeSettings: (settings: { theme: string }) =>
    ipcRenderer.invoke('save-theme-settings', settings),

  // 同步配置（保存到主进程文件系统，确保持久化）
  saveSyncConfig: (config: object) => ipcRenderer.invoke('save-sync-config', config),
  loadSyncConfig: () => ipcRenderer.invoke('load-sync-config'),

  // 窗口操作
  minimizeToTray: () => ipcRenderer.send('window-minimize-to-tray'),
  quitApp: () => ipcRenderer.send('window-quit'),

  // 窗口关闭请求监听
  onWindowCloseRequest: (callback: () => void) => {
    ipcRenderer.on('window-close-request', () => callback());
  },
  onWindowMinimized: (callback: () => void) => {
    ipcRenderer.on('window-minimized', () => callback());
  },
  triggerMenuAction: (action: string) => {
    ipcRenderer.send('trigger-menu-action', action);
  },

  // 菜单事件监听
  onMenuAction: (callback: (action: string) => void) => {
    // 监听统一的 menu-action 事件
    ipcRenderer.on('menu-action', (_event, action: string) => callback(action));

    // 兼容旧的单独事件（菜单栏点击）
    const actions = [
      'new-note',
      'quick-new-note',
      'new-folder',
      'import',
      'export',
      'find',
      'toggle-sidebar',
      'theme-light',
      'theme-dark',
      'theme-system',
      'sync-now',
      'sync-settings',
      'open-settings',
      'about',
      'save-note',
      'delete-note',
      'duplicate-note',
      'toggle-edit-mode',
      'toggle-star',
      'prev-note',
      'next-note',
      'escape',
    ];
    actions.forEach(action => {
      ipcRenderer.on(action, () => callback(action));
    });
  },

  // Items API
  items: {
    create: (type: string, payload: object) => ipcRenderer.invoke('items:create', type, payload),
    getById: (id: string) => ipcRenderer.invoke('items:getById', id),
    getByIdIncludeDeleted: (id: string) => ipcRenderer.invoke('items:getByIdIncludeDeleted', id),
    getByType: (type: string) => ipcRenderer.invoke('items:getByType', type),
    update: (id: string, payload: object) => ipcRenderer.invoke('items:update', id, payload),
    delete: (id: string) => ipcRenderer.invoke('items:delete', id),
    hardDelete: (id: string) => ipcRenderer.invoke('items:hardDelete', id),
    restore: (id: string) => ipcRenderer.invoke('items:restore', id),
    search: (query: string, type?: string) => ipcRenderer.invoke('items:search', query, type),
    getNotesByFolder: (folderId: string | null) =>
      ipcRenderer.invoke('items:getNotesByFolder', folderId),
    getPinnedNotes: () => ipcRenderer.invoke('items:getPinnedNotes'),
    getDeleted: (type?: string) => ipcRenderer.invoke('items:getDeleted', type),
    getStats: () => ipcRenderer.invoke('items:getStats'),
  },

  noteHistory: {
    saveVersion: (noteId: string, title: string, content: string) =>
      ipcRenderer.invoke('note-history:saveVersion', noteId, title, content),
    getVersions: (noteId: string) => ipcRenderer.invoke('note-history:getVersions', noteId),
    getVersion: (versionId: number) => ipcRenderer.invoke('note-history:getVersion', versionId),
  },

  // Sync API
  sync: {
    initialize: (config: object) => ipcRenderer.invoke('sync:initialize', config),
    start: () => ipcRenderer.invoke('sync:start'),
    stop: () => ipcRenderer.invoke('sync:stop'),
    trigger: () => ipcRenderer.invoke('sync:trigger'),
    getState: () => ipcRenderer.invoke('sync:getState'),
    notifyChange: () => ipcRenderer.invoke('sync:notifyChange'),
    testConnection: (config: object) => ipcRenderer.invoke('sync:testConnection', config),
    forceResync: () => ipcRenderer.invoke('sync:forceResync'),
    resetStatus: () => ipcRenderer.invoke('sync:resetStatus'),
    checkFirstSync: () => ipcRenderer.invoke('sync:checkFirstSync'),
    // 获取本地同步游标（可选指定服务器类型和 URL）
    getLocalCursor: (serverType?: string, serverUrl?: string) =>
      ipcRenderer.invoke('sync:getLocalCursor', serverType, serverUrl),
    // 清除本地同步游标（可选指定服务器类型和 URL）
    clearLocalCursor: (serverType?: string, serverUrl?: string) =>
      ipcRenderer.invoke('sync:clearLocalCursor', serverType, serverUrl),
    // 监听同步时间更新事件
    onLastSyncTimeUpdated: (callback: (lastSyncTime: number) => void) => {
      ipcRenderer.on('sync:lastSyncTimeUpdated', (_event, lastSyncTime: number) =>
        callback(lastSyncTime)
      );
    },
    // 监听 token 刷新事件
    onTokenRefreshed: (
      callback: (data: { token: string; refreshToken: string; expiresIn: number }) => void
    ) => {
      ipcRenderer.on('sync:tokenRefreshed', (_event, data) => callback(data));
    },
    onReloginRequired: (callback: () => void) => {
      ipcRenderer.on('sync:reloginRequired', () => callback());
    },
  },

  // Crypto API
  crypto: {
    generateKey: (exportPassword: string) =>
      ipcRenderer.invoke('crypto:generateKey', exportPassword),
    exportKey: (masterKey: string, exportPassword: string) =>
      ipcRenderer.invoke('crypto:exportKey', masterKey, exportPassword),
    importKey: (encryptedKey: string, importPassword: string) =>
      ipcRenderer.invoke('crypto:importKey', encryptedKey, importPassword),
  },

  // 文件操作
  fs: {
    readFile: (path: string) => ipcRenderer.invoke('fs-read', path),
    writeFile: (path: string, data: string | Buffer) => ipcRenderer.invoke('fs-write', path, data),
    exists: (path: string) => ipcRenderer.invoke('fs-exists', path),
  },

  // Image API - 图片处理
  image: {
    getMetadata: (input: string) => ipcRenderer.invoke('image:getMetadata', input),
    process: (input: string, options: object) =>
      ipcRenderer.invoke('image:process', input, options),
    generatePreview: (input: string, maxSize: number) =>
      ipcRenderer.invoke('image:generatePreview', input, maxSize),
    saveFile: (buffer: string, defaultName: string) =>
      ipcRenderer.invoke('image:saveFile', buffer, defaultName),
  },

  // PDF API - PDF 处理
  pdf: {
    getInfo: (file: string) => ipcRenderer.invoke('pdf:getInfo', file),
    merge: (options: object) => ipcRenderer.invoke('pdf:merge', options),
    split: (options: object) => ipcRenderer.invoke('pdf:split', options),
    toImage: (options: object) => ipcRenderer.invoke('pdf:toImage', options),
    compress: (options: object) => ipcRenderer.invoke('pdf:compress', options),
    addWatermark: (options: object) => ipcRenderer.invoke('pdf:addWatermark', options),
    rotate: (options: object) => ipcRenderer.invoke('pdf:rotate', options),
    reorder: (options: object) => ipcRenderer.invoke('pdf:reorder', options),
    deletePages: (options: object) => ipcRenderer.invoke('pdf:deletePages', options),
    extractPages: (options: object) => ipcRenderer.invoke('pdf:extractPages', options),
    setSecurity: (options: object) => ipcRenderer.invoke('pdf:setSecurity', options),
    removeSecurity: (file: string, password: string) =>
      ipcRenderer.invoke('pdf:removeSecurity', file, password),
    getMetadata: (file: string) => ipcRenderer.invoke('pdf:getMetadata', file),
    setMetadata: (options: object) => ipcRenderer.invoke('pdf:setMetadata', options),
    imagesToPdf: (options: object) => ipcRenderer.invoke('pdf:imagesToPdf', options),
    getFormFields: (file: string) => ipcRenderer.invoke('pdf:getFormFields', file),
    fillForm: (file: string, values: object) => ipcRenderer.invoke('pdf:fillForm', file, values),
    checkGhostscript: () => ipcRenderer.invoke('pdf:checkGhostscript'),
    // Ghostscript 增强功能
    toGrayscale: (file: string) => ipcRenderer.invoke('pdf:toGrayscale', file),
    toPDFA: (options: object) => ipcRenderer.invoke('pdf:toPDFA', options),
    repair: (file: string) => ipcRenderer.invoke('pdf:repair', file),
    convertVersion: (options: object) => ipcRenderer.invoke('pdf:convertVersion', options),
    linearize: (file: string) => ipcRenderer.invoke('pdf:linearize', file),
    saveFile: (buffer: string, defaultName: string) =>
      ipcRenderer.invoke('pdf:saveFile', buffer, defaultName),
  },

  // Data API - 数据导入导出
  data: {
    export: (options: { includeResources: boolean }) => ipcRenderer.invoke('data:export', options),
    import: (options: { mode: 'merge' | 'replace' }) => ipcRenderer.invoke('data:import', options),
    previewImport: () => ipcRenderer.invoke('data:previewImport'),
  },

  // Resource API - 资源文件管理
  resource: {
    // 上传图片（从 base64 或文件路径）
    uploadImage: (noteId: string, data: string, filename: string, mimeType: string) =>
      ipcRenderer.invoke('resource:uploadImage', noteId, data, filename, mimeType),
    // 上传附件
    uploadAttachment: (noteId: string, data: string, filename: string, mimeType: string) =>
      ipcRenderer.invoke('resource:uploadAttachment', noteId, data, filename, mimeType),
    // 获取资源文件路径
    getPath: (resourceId: string, ext: string) =>
      ipcRenderer.invoke('resource:getPath', resourceId, ext),
    // 读取资源文件（返回 base64）
    read: (resourceId: string, ext: string) => ipcRenderer.invoke('resource:read', resourceId, ext),
    // 删除资源
    delete: (resourceId: string, ext: string) =>
      ipcRenderer.invoke('resource:delete', resourceId, ext),
    // 获取笔记的所有资源
    getNoteResources: (noteId: string) => ipcRenderer.invoke('resource:getNoteResources', noteId),
  },

  // Web Clipper API - 网页剪藏
  clipper: {
    // 确认剪藏
    confirm: (data: {
      title: string;
      content: string;
      folderId?: string;
      tags?: string[];
      downloadImages?: boolean;
      images?: { src: string; alt: string }[];
    }) => ipcRenderer.invoke('clipper:confirm', data),
    // 取消剪藏
    cancel: () => ipcRenderer.invoke('clipper:cancel'),
    // 获取待处理的剪藏
    getPending: () => ipcRenderer.invoke('clipper:getPending'),
    // 获取插件授权状态
    getExtensionAuth: () => ipcRenderer.invoke('clipper:getExtensionAuth'),
    // 撤销插件授权
    revokeExtensionAuth: () => ipcRenderer.invoke('clipper:revokeExtensionAuth'),
    // 监听笔记创建成功事件
    onNoteCreated: (callback: (data: { noteId: string }) => void) => {
      ipcRenderer.on('note-created', (_event, data) => callback(data));
    },
  },

  // Transfer API - 局域网传输助手
  transfer: {
    // 服务器管理
    startServer: (port?: number) => ipcRenderer.invoke('transfer:startServer', port),
    stopServer: () => ipcRenderer.invoke('transfer:stopServer'),
    getServerStatus: () => ipcRenderer.invoke('transfer:getServerStatus'),
    getConnectedDevices: () => ipcRenderer.invoke('transfer:getConnectedDevices'),
    generateQRData: () => ipcRenderer.invoke('transfer:generateQRData'),
    getDeviceInfo: () => ipcRenderer.invoke('transfer:getDeviceInfo'),

    // 消息和文件发送
    sendMessage: (targetDeviceId: string, sessionId: string, message: object) =>
      ipcRenderer.invoke('transfer:sendMessage', targetDeviceId, sessionId, message),
    sendFile: (targetDeviceId: string, sessionId: string, filePath: string) =>
      ipcRenderer.invoke('transfer:sendFile', targetDeviceId, sessionId, filePath),
    saveTempFile: (filename: string, base64Data: string) =>
      ipcRenderer.invoke('transfer:saveTempFile', filename, base64Data),
    sendMessageRead: (targetDeviceId: string, messageIds: string[]) =>
      ipcRenderer.invoke('transfer:sendMessageRead', targetDeviceId, messageIds),

    // 数据库操作
    db: {
      // 设备
      createDevice: (device: object) => ipcRenderer.invoke('transfer:db:createDevice', device),
      getDevice: (id: string) => ipcRenderer.invoke('transfer:db:getDevice', id),
      getAllDevices: () => ipcRenderer.invoke('transfer:db:getAllDevices'),
      updateDevice: (id: string, updates: object) =>
        ipcRenderer.invoke('transfer:db:updateDevice', id, updates),
      deleteDevice: (id: string) => ipcRenderer.invoke('transfer:db:deleteDevice', id),
      // 会话
      createSession: (session: object) => ipcRenderer.invoke('transfer:db:createSession', session),
      getSession: (id: string) => ipcRenderer.invoke('transfer:db:getSession', id),
      getAllSessions: () => ipcRenderer.invoke('transfer:db:getAllSessions'),
      getSessionsByDevice: (deviceId: string) =>
        ipcRenderer.invoke('transfer:db:getSessionsByDevice', deviceId),
      endSession: (id: string) => ipcRenderer.invoke('transfer:db:endSession', id),
      deleteSession: (id: string) => ipcRenderer.invoke('transfer:db:deleteSession', id),
      // 消息
      createMessage: (message: object) => ipcRenderer.invoke('transfer:db:createMessage', message),
      getMessage: (id: string) => ipcRenderer.invoke('transfer:db:getMessage', id),
      getMessagesBySession: (sessionId: string, limit?: number, offset?: number) =>
        ipcRenderer.invoke('transfer:db:getMessagesBySession', sessionId, limit, offset),
      markMessageAsRead: (id: string) => ipcRenderer.invoke('transfer:db:markMessageAsRead', id),
      markSessionMessagesAsRead: (sessionId: string) =>
        ipcRenderer.invoke('transfer:db:markSessionMessagesAsRead', sessionId),
      deleteMessage: (id: string) => ipcRenderer.invoke('transfer:db:deleteMessage', id),
      // 文件传输
      createFileTransfer: (file: object) =>
        ipcRenderer.invoke('transfer:db:createFileTransfer', file),
      getFile: (id: string) => ipcRenderer.invoke('transfer:db:getFile', id),
      getFilesBySession: (sessionId: string) =>
        ipcRenderer.invoke('transfer:db:getFilesBySession', sessionId),
      updateFileProgress: (id: string, progress: number) =>
        ipcRenderer.invoke('transfer:db:updateFileProgress', id, progress),
      completeFileTransfer: (id: string, localPath: string, fileHash?: string) =>
        ipcRenderer.invoke('transfer:db:completeFileTransfer', id, localPath, fileHash),
      failFileTransfer: (id: string) => ipcRenderer.invoke('transfer:db:failFileTransfer', id),
      cancelFileTransfer: (id: string) => ipcRenderer.invoke('transfer:db:cancelFileTransfer', id),
      deleteFile: (id: string) => ipcRenderer.invoke('transfer:db:deleteFile', id),
      // 清理和统计
      cleanupOldSessions: (daysOld: number) =>
        ipcRenderer.invoke('transfer:db:cleanupOldSessions', daysOld),
      cleanupFailedTransfers: () => ipcRenderer.invoke('transfer:db:cleanupFailedTransfers'),
      getStats: () => ipcRenderer.invoke('transfer:db:getStats'),
    },

    // 事件监听（返回取消订阅函数）
    onDeviceConnected: (callback: (device: object) => void) => {
      const handler = (_event: any, device: object) => callback(device);
      ipcRenderer.on('transfer:device-connected', handler);
      return () => ipcRenderer.removeListener('transfer:device-connected', handler);
    },
    onDeviceDisconnected: (callback: (deviceId: string) => void) => {
      const handler = (_event: any, deviceId: string) => callback(deviceId);
      ipcRenderer.on('transfer:device-disconnected', handler);
      return () => ipcRenderer.removeListener('transfer:device-disconnected', handler);
    },
    onDeviceListUpdated: (callback: (devices: object[]) => void) => {
      const handler = (_event: any, devices: object[]) => callback(devices);
      ipcRenderer.on('transfer:device-list-updated', handler);
      return () => ipcRenderer.removeListener('transfer:device-list-updated', handler);
    },
    onMessageReceived: (callback: (data: object) => void) => {
      const handler = (_event: any, data: object) => callback(data);
      ipcRenderer.on('transfer:message-received', handler);
      return () => ipcRenderer.removeListener('transfer:message-received', handler);
    },
    onFileIncoming: (callback: (data: object) => void) => {
      const handler = (_event: any, data: object) => callback(data);
      ipcRenderer.on('transfer:file-incoming', handler);
      return () => ipcRenderer.removeListener('transfer:file-incoming', handler);
    },
    onFileChunk: (callback: (data: object) => void) => {
      const handler = (_event: any, data: object) => callback(data);
      ipcRenderer.on('transfer:file-chunk', handler);
      return () => ipcRenderer.removeListener('transfer:file-chunk', handler);
    },
    onFileComplete: (callback: (data: object) => void) => {
      const handler = (_event: any, data: object) => callback(data);
      ipcRenderer.on('transfer:file-complete', handler);
      return () => ipcRenderer.removeListener('transfer:file-complete', handler);
    },
    onSessionCreated: (callback: (data: object) => void) => {
      const handler = (_event: any, data: object) => callback(data);
      ipcRenderer.on('transfer:session-created', handler);
      return () => ipcRenderer.removeListener('transfer:session-created', handler);
    },

    // 中继服务器客户端
    relay: {
      connect: (serverUrl: string, relayKey: string) =>
        ipcRenderer.invoke('transfer:relay:connect', serverUrl, relayKey),
      disconnect: () => ipcRenderer.invoke('transfer:relay:disconnect'),
      getStatus: () => ipcRenderer.invoke('transfer:relay:getStatus'),
      getConnectedDevices: () => ipcRenderer.invoke('transfer:relay:getConnectedDevices'),
      sendMessage: (targetDeviceId: string, sessionId: string, message: object) =>
        ipcRenderer.invoke('transfer:relay:sendMessage', targetDeviceId, sessionId, message),
      sendFile: (targetDeviceId: string, sessionId: string, filePath: string) =>
        ipcRenderer.invoke('transfer:relay:sendFile', targetDeviceId, sessionId, filePath),
      sendPairRequest: (targetDeviceId: string) =>
        ipcRenderer.invoke('transfer:relay:sendPairRequest', targetDeviceId),
      // 中继事件监听
      onConnected: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('transfer:relay:connected', handler);
        return () => ipcRenderer.removeListener('transfer:relay:connected', handler);
      },
      onDisconnected: (callback: (reason: string) => void) => {
        const handler = (_event: any, reason: string) => callback(reason);
        ipcRenderer.on('transfer:relay:disconnected', handler);
        return () => ipcRenderer.removeListener('transfer:relay:disconnected', handler);
      },
      onError: (callback: (error: object) => void) => {
        const handler = (_event: any, error: object) => callback(error);
        ipcRenderer.on('transfer:relay:error', handler);
        return () => ipcRenderer.removeListener('transfer:relay:error', handler);
      },
      onDeviceList: (callback: (devices: object[]) => void) => {
        const handler = (_event: any, devices: object[]) => callback(devices);
        ipcRenderer.on('transfer:relay:device-list', handler);
        return () => ipcRenderer.removeListener('transfer:relay:device-list', handler);
      },
      onMessageReceived: (callback: (data: object) => void) => {
        const handler = (_event: any, data: object) => callback(data);
        ipcRenderer.on('transfer:relay:message-received', handler);
        return () => ipcRenderer.removeListener('transfer:relay:message-received', handler);
      },
      onFileIncoming: (callback: (data: object) => void) => {
        const handler = (_event: any, data: object) => callback(data);
        ipcRenderer.on('transfer:relay:file-incoming', handler);
        return () => ipcRenderer.removeListener('transfer:relay:file-incoming', handler);
      },
      onFileChunk: (callback: (data: object) => void) => {
        const handler = (_event: any, data: object) => callback(data);
        ipcRenderer.on('transfer:relay:file-chunk', handler);
        return () => ipcRenderer.removeListener('transfer:relay:file-chunk', handler);
      },
      onFileComplete: (callback: (data: object) => void) => {
        const handler = (_event: any, data: object) => callback(data);
        ipcRenderer.on('transfer:relay:file-complete', handler);
        return () => ipcRenderer.removeListener('transfer:relay:file-complete', handler);
      },
      onPairSuccess: (callback: (data: object) => void) => {
        const handler = (_event: any, data: object) => callback(data);
        ipcRenderer.on('transfer:relay:pair-success', handler);
        return () => ipcRenderer.removeListener('transfer:relay:pair-success', handler);
      },
    },
  },

  // MCP API
  mcp: {
    startServer: (config: object) => ipcRenderer.invoke('mcp:startServer', config),
    stopServer: (serverId: string) => ipcRenderer.invoke('mcp:stopServer', serverId),
    listTools: (serverId: string) => ipcRenderer.invoke('mcp:listTools', serverId),
    callTool: (serverId: string, toolName: string, args: any) =>
      ipcRenderer.invoke('mcp:callTool', serverId, toolName, args),
  },

  // Notification API - 系统通知
  notification: {
    show: (options: { title: string; body: string; icon?: string; tag?: string }) =>
      ipcRenderer.invoke('notification:show', options),
    // 监听通知点击事件
    onClick: (callback: (tag: string) => void) => {
      ipcRenderer.on('notification:click', (_event, tag) => callback(tag));
    },
  },

  // Cloud Drive API - 网盘同步
  cloudDrive: {
    getConfig: () => ipcRenderer.invoke('cloud-drive:getConfig'),
    isWatching: () => ipcRenderer.invoke('cloud-drive:isWatching'),
    getLocalStates: () => ipcRenderer.invoke('cloud-drive:getLocalStates'),
    openLocalFile: (itemId: string) => ipcRenderer.invoke('cloud-drive:openLocalFile', itemId),
    openLocalDirectory: (folderPath: string) => ipcRenderer.invoke('cloud-drive:openLocalDirectory', folderPath),
    setLocalAvailability: (itemId: string, availability: 'online_only' | 'local' | 'offline') =>
      ipcRenderer.invoke('cloud-drive:setLocalAvailability', itemId, availability),
    setFolderLocalAvailability: (folderPath: string, availability: 'online_only' | 'local' | 'offline') =>
      ipcRenderer.invoke('cloud-drive:setFolderLocalAvailability', folderPath, availability),
    selectWatchedFolder: () => ipcRenderer.invoke('cloud-drive:selectWatchedFolder'),
    startWatching: () => ipcRenderer.invoke('cloud-drive:startWatching'),
    stopWatching: () => ipcRenderer.invoke('cloud-drive:stopWatching'),
    scanNow: () => ipcRenderer.invoke('cloud-drive:scanNow'),
    updateConfig: (patch: object) => ipcRenderer.invoke('cloud-drive:updateConfig', patch),
    // 层7：手动控制
    retryFailed: () => ipcRenderer.invoke('cloud-drive:retryFailed'),
    retryItem: (itemId: string) => ipcRenderer.invoke('cloud-drive:retryItem', itemId),
    pauseItem: (itemId: string) => ipcRenderer.invoke('cloud-drive:pauseItem', itemId),
    resumeItem: (itemId: string) => ipcRenderer.invoke('cloud-drive:resumeItem', itemId),
    cancelUpload: (itemId: string) => ipcRenderer.invoke('cloud-drive:cancelUpload', itemId),
    clearCompleted: () => ipcRenderer.invoke('cloud-drive:clearCompleted'),
    listItems: () => ipcRenderer.invoke('cloud-drive:listItems'),
    // Phase 2：下载控制（与上传侧一一对应，独立队列）
    downloadFile: (itemId: string) => ipcRenderer.invoke('cloud-drive:downloadFile', itemId),
    pauseDownload: (itemId: string) => ipcRenderer.invoke('cloud-drive:pauseDownload', itemId),
    resumeDownload: (itemId: string) => ipcRenderer.invoke('cloud-drive:resumeDownload', itemId),
    cancelDownload: (itemId: string) => ipcRenderer.invoke('cloud-drive:cancelDownload', itemId),
    retryDownload: (itemId: string) => ipcRenderer.invoke('cloud-drive:retryDownload', itemId),
    retryAllDownloads: () => ipcRenderer.invoke('cloud-drive:retryAllDownloads'),
    clearCompletedDownloads: () => ipcRenderer.invoke('cloud-drive:clearCompletedDownloads'),
    // 监听单文件上传进度
    onUploadProgress: (callback: (progress: unknown) => void) => {
      const handler = (_event: unknown, progress: unknown) => callback(progress);
      ipcRenderer.on('cloud-drive:uploadProgress', handler);
      return () => ipcRenderer.removeListener('cloud-drive:uploadProgress', handler);
    },
    // 监听单文件下载进度
    onDownloadProgress: (callback: (progress: unknown) => void) => {
      const handler = (_event: unknown, progress: unknown) => callback(progress);
      ipcRenderer.on('cloud-drive:downloadProgress', handler);
      return () => ipcRenderer.removeListener('cloud-drive:downloadProgress', handler);
    },
    onItemsChanged: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('cloud-drive:itemsChanged', handler);
      return () => ipcRenderer.removeListener('cloud-drive:itemsChanged', handler);
    },
    // 监听监听状态变化
    onWatchingChange: (callback: (watching: boolean) => void) => {
      const handler = (_event: unknown, watching: boolean) => callback(watching);
      ipcRenderer.on('cloud-drive:watchingChange', handler);
      return () => ipcRenderer.removeListener('cloud-drive:watchingChange', handler);
    },
  },
});
