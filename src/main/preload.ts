import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 应用路径
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),
  
  // 使用系统默认浏览器打开链接
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  
  // 开机启动设置
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('set-auto-launch', enabled),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  
  // 主题设置（保存到主进程可读取的文件，用于启动时背景色）
  saveThemeSettings: (settings: { theme: string }) => ipcRenderer.invoke('save-theme-settings', settings),
  
  // 窗口操作
  minimizeToTray: () => ipcRenderer.send('window-minimize-to-tray'),
  quitApp: () => ipcRenderer.send('window-quit'),
  
  // 窗口关闭请求监听
  onWindowCloseRequest: (callback: () => void) => {
    ipcRenderer.on('window-close-request', () => callback());
  },
  
  // 菜单事件监听
  onMenuAction: (callback: (action: string) => void) => {
    // 监听统一的 menu-action 事件
    ipcRenderer.on('menu-action', (_event, action: string) => callback(action));
    
    // 兼容旧的单独事件（菜单栏点击）
    const actions = [
      'new-note', 'quick-new-note', 'new-folder', 'import', 'export', 'find',
      'toggle-sidebar', 'theme-light', 'theme-dark', 'theme-system',
      'sync-now', 'sync-settings', 'open-settings', 'about',
      'save-note', 'delete-note', 'duplicate-note', 'toggle-edit-mode',
      'toggle-star', 'prev-note', 'next-note', 'escape'
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
    getNotesByFolder: (folderId: string | null) => ipcRenderer.invoke('items:getNotesByFolder', folderId),
    getPinnedNotes: () => ipcRenderer.invoke('items:getPinnedNotes'),
    getDeleted: (type?: string) => ipcRenderer.invoke('items:getDeleted', type),
    getStats: () => ipcRenderer.invoke('items:getStats'),
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
    process: (input: string, options: object) => ipcRenderer.invoke('image:process', input, options),
    generatePreview: (input: string, maxSize: number) => ipcRenderer.invoke('image:generatePreview', input, maxSize),
    saveFile: (buffer: string, defaultName: string) => ipcRenderer.invoke('image:saveFile', buffer, defaultName),
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
    removeSecurity: (file: string, password: string) => ipcRenderer.invoke('pdf:removeSecurity', file, password),
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
    saveFile: (buffer: string, defaultName: string) => ipcRenderer.invoke('pdf:saveFile', buffer, defaultName),
  },

  // Data API - 数据导入导出
  data: {
    export: (options: { includeResources: boolean }) => ipcRenderer.invoke('data:export', options),
    import: (options: { mode: 'merge' | 'replace' }) => ipcRenderer.invoke('data:import', options),
    previewImport: () => ipcRenderer.invoke('data:previewImport'),
  },
});
