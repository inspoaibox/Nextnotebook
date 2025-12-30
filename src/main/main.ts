import { app, BrowserWindow, Menu, ipcMain, globalShortcut, shell } from 'electron';
import * as path from 'path';
import { initializeDatabase, closeDatabase } from './services/DatabaseService';
import { registerSyncIpcHandlers } from './services/SyncService';

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '暮城笔记',
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
  // Ctrl+N: 新建笔记
  globalShortcut.register('CommandOrControl+N', () => {
    sendToRenderer('new-note');
  });

  // Ctrl+Shift+N: 新建文件夹
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    sendToRenderer('new-folder');
  });

  // Ctrl+F: 搜索
  globalShortcut.register('CommandOrControl+F', () => {
    sendToRenderer('find');
  });

  // Ctrl+B: 切换侧边栏
  globalShortcut.register('CommandOrControl+B', () => {
    sendToRenderer('toggle-sidebar');
  });

  // Ctrl+S: 同步
  globalShortcut.register('CommandOrControl+S', () => {
    sendToRenderer('sync-now');
  });

  // Ctrl+,: 打开设置
  globalShortcut.register('CommandOrControl+,', () => {
    sendToRenderer('open-settings');
  });
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建笔记', accelerator: 'CmdOrCtrl+N', click: () => sendToRenderer('new-note') },
        { label: '新建文件夹', click: () => sendToRenderer('new-folder') },
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
