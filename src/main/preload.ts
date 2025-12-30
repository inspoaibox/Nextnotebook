import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 应用路径
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  
  // 使用系统默认浏览器打开链接
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  
  // 开机启动设置
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('set-auto-launch', enabled),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  
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
  },
  
  // 文件操作
  fs: {
    readFile: (path: string) => ipcRenderer.invoke('fs-read', path),
    writeFile: (path: string, data: string | Buffer) => ipcRenderer.invoke('fs-write', path, data),
    exists: (path: string) => ipcRenderer.invoke('fs-exists', path),
  },
});
