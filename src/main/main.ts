import { app, BrowserWindow, Menu, ipcMain, globalShortcut, shell } from 'electron';
import * as path from 'path';
import { initializeDatabase, closeDatabase } from './services/DatabaseService';
import { registerSyncIpcHandlers } from './services/SyncService';

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development';

// 获取应用图标路径
function getIconPath(): string {
  if (isDev) {
    // 开发模式下使用项目根目录的图标
    if (process.platform === 'win32') {
      return path.join(__dirname, '../../icons/icon.ico');
    } else if (process.platform === 'darwin') {
      return path.join(__dirname, '../../icons/icon.icns');
    } else {
      return path.join(__dirname, '../../icons/icon.png');
    }
  } else {
    // 生产模式
    if (process.platform === 'win32') {
      return path.join(__dirname, '../../icons/icon.ico');
    } else if (process.platform === 'darwin') {
      return path.join(__dirname, '../../icons/icon.icns');
    } else {
      return path.join(__dirname, '../../icons/icon.png');
    }
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '暮城笔记',
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    // 开发模式下打开开发者工具
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 注册全局快捷键
  registerShortcuts();

  createMenu();
}

function registerShortcuts(): void {
  // Ctrl+N: 新建空白笔记
  globalShortcut.register('CommandOrControl+N', () => {
    sendToRenderer('menu-action', 'quick-new-note');
  });

  // Ctrl+Shift+N: 从模板新建笔记
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    sendToRenderer('menu-action', 'new-note');
  });

  // Ctrl+F: 搜索
  globalShortcut.register('CommandOrControl+F', () => {
    sendToRenderer('menu-action', 'find');
  });

  // Ctrl+B: 切换侧边栏
  globalShortcut.register('CommandOrControl+B', () => {
    sendToRenderer('menu-action', 'toggle-sidebar');
  });

  // Ctrl+S: 保存/同步
  globalShortcut.register('CommandOrControl+S', () => {
    sendToRenderer('menu-action', 'save-note');
  });

  // Ctrl+Shift+S: 立即同步
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    sendToRenderer('menu-action', 'sync-now');
  });

  // Ctrl+,: 打开设置
  globalShortcut.register('CommandOrControl+,', () => {
    sendToRenderer('menu-action', 'open-settings');
  });

  // Ctrl+D: 删除当前笔记
  globalShortcut.register('CommandOrControl+D', () => {
    sendToRenderer('menu-action', 'delete-note');
  });

  // Ctrl+Shift+D: 复制当前笔记
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    sendToRenderer('menu-action', 'duplicate-note');
  });

  // Ctrl+E: 切换编辑/预览模式
  globalShortcut.register('CommandOrControl+E', () => {
    sendToRenderer('menu-action', 'toggle-edit-mode');
  });

  // Ctrl+P: 星标/取消星标
  globalShortcut.register('CommandOrControl+P', () => {
    sendToRenderer('menu-action', 'toggle-star');
  });

  // Ctrl+上箭头: 上一篇笔记
  globalShortcut.register('CommandOrControl+Up', () => {
    sendToRenderer('menu-action', 'prev-note');
  });

  // Ctrl+下箭头: 下一篇笔记
  globalShortcut.register('CommandOrControl+Down', () => {
    sendToRenderer('menu-action', 'next-note');
  });

  // Escape: 退出搜索/关闭弹窗
  globalShortcut.register('Escape', () => {
    sendToRenderer('menu-action', 'escape');
  });
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建笔记', accelerator: 'CmdOrCtrl+N', click: () => sendToRenderer('menu-action', 'quick-new-note') },
        { label: '从模板新建', accelerator: 'CmdOrCtrl+Shift+N', click: () => sendToRenderer('menu-action', 'new-note') },
        { label: '新建目录', click: () => sendToRenderer('menu-action', 'new-folder') },
        { type: 'separator' },
        { label: '导入', click: () => sendToRenderer('import') },
        { label: '导出', click: () => sendToRenderer('export') },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { type: 'separator' },
        { label: '查找', accelerator: 'CmdOrCtrl+F', click: () => sendToRenderer('find') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '切换侧边栏', accelerator: 'CmdOrCtrl+B', click: () => sendToRenderer('toggle-sidebar') },
        { type: 'separator' },
        { label: '浅色主题', click: () => sendToRenderer('theme-light') },
        { label: '深色主题', click: () => sendToRenderer('theme-dark') },
        { label: '跟随系统', click: () => sendToRenderer('theme-system') },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
      ],
    },
    {
      label: '同步',
      submenu: [
        { label: '立即同步', accelerator: 'CmdOrCtrl+S', click: () => sendToRenderer('sync-now') },
        { label: '同步设置', click: () => sendToRenderer('sync-settings') },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于暮城笔记', click: () => sendToRenderer('about') },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args);
}

app.whenReady().then(() => {
  initializeDatabase();
  registerSyncIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  // 注销所有快捷键
  globalShortcut.unregisterAll();
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('get-app-path', () => app.getPath('userData'));
ipcMain.handle('open-external', (_event, url: string) => shell.openExternal(url));
