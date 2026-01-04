import { app, BrowserWindow, Menu, ipcMain, shell, Tray, nativeImage, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { initializeDatabase, closeDatabase } from './services/DatabaseService';
import { registerSyncIpcHandlers } from './services/SyncService';
import { imageService, ProcessOptions } from './services/ImageService';
import { pdfService, WatermarkOptions as PDFWatermarkOptions, SecurityOptions as PDFSecurityOptions, ImageToPdfOptions as PDFImageToPdfOptions } from './services/PDFService';
import { ghostscriptService, ToImageOptions as GSToImageOptions, CompressLevel } from './services/GhostscriptService';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === 'development';

// 获取用户设置文件路径
function getSettingsPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'settings.json');
}

// 读取用户主题设置
function getUserTheme(): 'light' | 'dark' | 'system' {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      return settings.theme || 'system';
    }
  } catch (e) {
    console.warn('Failed to read user theme settings:', e);
  }
  return 'system';
}

// 根据主题设置获取背景色
function getBackgroundColor(): string {
  const { nativeTheme } = require('electron');
  const userTheme = getUserTheme();
  
  let isDarkMode = false;
  if (userTheme === 'dark') {
    isDarkMode = true;
  } else if (userTheme === 'system') {
    isDarkMode = nativeTheme.shouldUseDarkColors;
  }
  // userTheme === 'light' 时 isDarkMode 保持 false
  
  return isDarkMode ? '#141414' : '#fafafa';
}

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
    // 生产模式 - 使用 extraResources 中的图标
    const resourcesPath = process.resourcesPath;
    if (process.platform === 'win32') {
      return path.join(resourcesPath, 'icons/icon.ico');
    } else if (process.platform === 'darwin') {
      return path.join(resourcesPath, 'icons/icon.icns');
    } else {
      return path.join(resourcesPath, 'icons/icon.png');
    }
  }
}

function createWindow(): void {
  // 获取用户主题对应的背景色
  const backgroundColor = getBackgroundColor();
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '暮城笔记',
    icon: getIconPath(),
    show: false, // 先隐藏窗口
    backgroundColor: backgroundColor, // 使用用户主题对应的背景色
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 窗口准备好后再显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
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

  // 窗口关闭按钮处理
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      // 通知渲染进程检查设置
      mainWindow?.webContents.send('window-close-request');
    }
  });

  // 注册窗口级别的快捷键（通过 before-input-event）
  // 这些快捷键只在窗口获得焦点时生效，不会影响其他应用
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    
    const isMod = input.control || input.meta;
    const isShift = input.shift;
    
    // Ctrl+N: 新建空白笔记
    if (isMod && !isShift && input.key === 'n') {
      sendToRenderer('menu-action', 'quick-new-note');
      event.preventDefault();
    }
    // Ctrl+Shift+N: 从模板新建笔记
    else if (isMod && isShift && input.key === 'N') {
      sendToRenderer('menu-action', 'new-note');
      event.preventDefault();
    }
    // Ctrl+F: 搜索
    else if (isMod && !isShift && input.key === 'f') {
      sendToRenderer('menu-action', 'find');
      event.preventDefault();
    }
    // Ctrl+S: 保存/同步
    else if (isMod && !isShift && input.key === 's') {
      sendToRenderer('menu-action', 'save-note');
      event.preventDefault();
    }
    // Ctrl+Shift+S: 立即同步
    else if (isMod && isShift && input.key === 'S') {
      sendToRenderer('menu-action', 'sync-now');
      event.preventDefault();
    }
    // Ctrl+,: 打开设置
    else if (isMod && !isShift && input.key === ',') {
      sendToRenderer('menu-action', 'open-settings');
      event.preventDefault();
    }
    // Ctrl+D: 删除当前笔记
    else if (isMod && !isShift && input.key === 'd') {
      sendToRenderer('menu-action', 'delete-note');
      event.preventDefault();
    }
    // Ctrl+Shift+D: 复制当前笔记
    else if (isMod && isShift && input.key === 'D') {
      sendToRenderer('menu-action', 'duplicate-note');
      event.preventDefault();
    }
    // Ctrl+E: 切换编辑/预览模式
    else if (isMod && !isShift && input.key === 'e') {
      sendToRenderer('menu-action', 'toggle-edit-mode');
      event.preventDefault();
    }
    // Ctrl+P: 星标/取消星标
    else if (isMod && !isShift && input.key === 'p') {
      sendToRenderer('menu-action', 'toggle-star');
      event.preventDefault();
    }
    // Ctrl+上箭头: 上一篇笔记
    else if (isMod && !isShift && input.key === 'ArrowUp') {
      sendToRenderer('menu-action', 'prev-note');
      event.preventDefault();
    }
    // Ctrl+下箭头: 下一篇笔记
    else if (isMod && !isShift && input.key === 'ArrowDown') {
      sendToRenderer('menu-action', 'next-note');
      event.preventDefault();
    }
    // Escape: 退出搜索/关闭弹窗
    else if (!isMod && !isShift && input.key === 'Escape') {
      sendToRenderer('menu-action', 'escape');
      event.preventDefault();
    }
    // Ctrl+L: 锁定应用
    else if (isMod && !isShift && input.key === 'l') {
      sendToRenderer('menu-action', 'lock-app');
      event.preventDefault();
    }
  });

  createMenu();
  createTray();
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
      label: '设置',
      submenu: [
        { label: '通用设置', click: () => sendToRenderer('menu-action', 'settings-general') },
        { label: '功能开关', click: () => sendToRenderer('menu-action', 'settings-features') },
        { label: '同步设置', click: () => sendToRenderer('menu-action', 'settings-sync') },
        { label: '安全设置', click: () => sendToRenderer('menu-action', 'settings-security') },
        { label: 'AI 设置', click: () => sendToRenderer('menu-action', 'settings-ai') },
        { label: '数据', click: () => sendToRenderer('menu-action', 'settings-data') },
        { label: '快捷键', click: () => sendToRenderer('menu-action', 'settings-shortcuts') },
        { type: 'separator' },
        { label: '关于', click: () => sendToRenderer('menu-action', 'settings-about') },
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
        { label: '浅色主题', click: () => sendToRenderer('menu-action', 'theme-light') },
        { label: '深色主题', click: () => sendToRenderer('menu-action', 'theme-dark') },
        { label: '跟随系统', click: () => sendToRenderer('menu-action', 'theme-system') },
        { type: 'separator' },
        { label: '锁定应用', accelerator: 'CmdOrCtrl+L', click: () => sendToRenderer('menu-action', 'lock-app') },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
      ],
    },
    {
      label: '同步',
      submenu: [
        { label: '立即同步', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendToRenderer('menu-action', 'sync-now') },
        { label: '同步设置', click: () => sendToRenderer('menu-action', 'settings-sync') },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于暮城笔记', click: () => sendToRenderer('menu-action', 'settings-about') },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args);
}

// 创建系统托盘
function createTray(): void {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '显示主窗口', 
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: 'separator' },
    { 
      label: '退出', 
      click: () => {
        isQuitting = true;
        app.quit();
      }
    },
  ]);
  
  tray.setToolTip('暮城笔记');
  tray.setContextMenu(contextMenu);
  
  // 点击托盘图标显示窗口
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

app.whenReady().then(() => {
  initializeDatabase();
  registerSyncIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
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

// 获取应用路径信息
ipcMain.handle('get-app-paths', () => {
  return {
    // 安装目录（可执行文件所在目录）
    installPath: isDev ? process.cwd() : path.dirname(app.getPath('exe')),
    // 可执行文件路径
    exePath: app.getPath('exe'),
    // 用户数据目录（数据库、配置等）
    userDataPath: app.getPath('userData'),
    // 日志目录
    logsPath: app.getPath('logs'),
    // 临时目录
    tempPath: app.getPath('temp'),
    // 应用版本
    appVersion: app.getVersion(),
    // 是否开发模式
    isDev: isDev,
  };
});

// 开机启动设置
ipcMain.handle('set-auto-launch', (_event, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,
  });
  return true;
});

ipcMain.handle('get-auto-launch', () => {
  const settings = app.getLoginItemSettings();
  return settings.openAtLogin;
});

// 保存主题设置（用于启动时背景色）
ipcMain.handle('save-theme-settings', (_event, settings: { theme: string }) => {
  try {
    const settingsPath = getSettingsPath();
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to save theme settings:', e);
    return false;
  }
});

// 窗口操作
ipcMain.on('window-minimize-to-tray', () => {
  mainWindow?.hide();
});

ipcMain.on('window-quit', () => {
  isQuitting = true;
  app.quit();
});

// 在 before-quit 事件中设置退出标志
app.on('before-quit', () => {
  isQuitting = true;
});

// ============ Image API IPC Handlers ============

// 获取图片元数据
ipcMain.handle('image:getMetadata', async (_event, input: string) => {
  try {
    return await imageService.getMetadata(input);
  } catch (error) {
    console.error('image:getMetadata error:', error);
    throw error;
  }
});

// 处理图片
ipcMain.handle('image:process', async (_event, input: string, options: ProcessOptions) => {
  try {
    return await imageService.process(input, options);
  } catch (error) {
    console.error('image:process error:', error);
    throw error;
  }
});

// 生成预览
ipcMain.handle('image:generatePreview', async (_event, input: string, maxSize: number) => {
  try {
    return await imageService.generatePreview(input, maxSize);
  } catch (error) {
    console.error('image:generatePreview error:', error);
    throw error;
  }
});

// 保存文件
ipcMain.handle('image:saveFile', async (_event, buffer: string, defaultName: string) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'tiff'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    
    if (result.canceled || !result.filePath) {
      return false;
    }
    
    const data = Buffer.from(buffer, 'base64');
    fs.writeFileSync(result.filePath, data);
    return true;
  } catch (error) {
    console.error('image:saveFile error:', error);
    throw error;
  }
});

// ============ PDF API IPC Handlers ============

// 辅助函数：Base64 转 Buffer
function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

// 辅助函数：Buffer 转 Base64
function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

// 获取 PDF 信息
ipcMain.handle('pdf:getInfo', async (_event, file: string) => {
  try {
    const buffer = base64ToBuffer(file);
    return await pdfService.getInfo(buffer);
  } catch (error) {
    console.error('pdf:getInfo error:', error);
    throw error;
  }
});

// 合并 PDF
ipcMain.handle('pdf:merge', async (_event, options: { files: string[]; pageSelections?: { fileIndex: number; pages: number[] }[] }) => {
  try {
    const buffers = options.files.map(f => base64ToBuffer(f));
    const result = await pdfService.merge(buffers, options.pageSelections);
    return bufferToBase64(result);
  } catch (error) {
    console.error('pdf:merge error:', error);
    throw error;
  }
});

// 拆分 PDF
ipcMain.handle('pdf:split', async (_event, options: { file: string; ranges: string }) => {
  try {
    const buffer = base64ToBuffer(options.file);
    const results = await pdfService.split(buffer, options.ranges);
    return results.map(r => bufferToBase64(r));
  } catch (error) {
    console.error('pdf:split error:', error);
    throw error;
  }
});

// PDF 转图片
ipcMain.handle('pdf:toImage', async (_event, options: { file: string; pages?: number[]; format: 'png' | 'jpg'; dpi: number }) => {
  try {
    const buffer = base64ToBuffer(options.file);
    const gsOptions: GSToImageOptions = {
      format: options.format,
      dpi: options.dpi,
      pages: options.pages,
    };
    const results = await ghostscriptService.toImage(buffer, gsOptions);
    return results.map(r => bufferToBase64(r));
  } catch (error) {
    console.error('pdf:toImage error:', error);
    throw error;
  }
});

// 压缩 PDF
ipcMain.handle('pdf:compress', async (_event, options: { file: string; level: CompressLevel }) => {
  try {
    const buffer = base64ToBuffer(options.file);
    const result = await ghostscriptService.compress(buffer, options.level);
    return {
      data: bufferToBase64(result.data),
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      ratio: result.ratio,
    };
  } catch (error) {
    console.error('pdf:compress error:', error);
    throw error;
  }
});

// 添加水印
ipcMain.handle('pdf:addWatermark', async (_event, options: {
  file: string;
  type: 'text' | 'image';
  text?: string;
  imageData?: string;
  fontSize?: number;
  color?: string;
  opacity: number;
  rotation: number;
  position: 'center' | 'tile' | { x: number; y: number };
  pages?: number[];
}) => {
  try {
    const buffer = base64ToBuffer(options.file);
    const watermarkOptions: PDFWatermarkOptions = {
      type: options.type,
      text: options.text,
      imageData: options.imageData ? base64ToBuffer(options.imageData) : undefined,
      fontSize: options.fontSize,
      color: options.color,
      opacity: options.opacity,
      rotation: options.rotation,
      position: options.position,
      pages: options.pages,
    };
    const result = await pdfService.addWatermark(buffer, watermarkOptions);
    return bufferToBase64(result);
  } catch (error) {
    console.error('pdf:addWatermark error:', error);
    throw error;
  }
});

// 旋转页面
ipcMain.handle('pdf:rotate', async (_event, options: { file: string; pages: number[]; angle: number }) => {
  try {
    const buffer = base64ToBuffer(options.file);
    const result = await pdfService.rotate(buffer, options.pages, options.angle);
    return bufferToBase64(result);
  } catch (error) {
    console.error('pdf:rotate error:', error);
    throw error;
  }
});

// 重排页面
ipcMain.handle('pdf:reorder', async (_event, options: { file: string; newOrder: number[] }) => {
  try {
    const buffer = base64ToBuffer(options.file);
    const result = await pdfService.reorder(buffer, options.newOrder);
    return bufferToBase64(result);
  } catch (error) {
    console.error('pdf:reorder error:', error);
    throw error;
  }
});

// 删除页面
ipcMain.handle('pdf:deletePages', async (_event, options: { file: string; pages: number[] }) => {
  try {
    const buffer = base64ToBuffer(options.file);
    const result = await pdfService.deletePages(buffer, options.pages);
    return bufferToBase64(result);
  } catch (error) {
    console.error('pdf:deletePages error:', error);
    throw error;
  }
});

// 提取页面
ipcMain.handle('pdf:extractPages', async (_event, options: { file: string; pages: number[] }) => {
  try {
    const buffer = base64ToBuffer(options.file);
    const result = await pdfService.extractPages(buffer, options.pages);
    return bufferToBase64(result);
  } catch (error) {
    console.error('pdf:extractPages error:', error);
    throw error;
  }
});

// 设置安全选项
ipcMain.handle('pdf:setSecurity', async (_event, options: {
  file: string;
  userPassword?: string;
  ownerPassword?: string;
  permissions?: { printing: boolean; copying: boolean; modifying: boolean };
}) => {
  try {
    const buffer = base64ToBuffer(options.file);
    const securityOptions: PDFSecurityOptions = {
      userPassword: options.userPassword,
      ownerPassword: options.ownerPassword,
      permissions: options.permissions,
    };
    const result = await pdfService.setSecurity(buffer, securityOptions);
    return bufferToBase64(result);
  } catch (error) {
    console.error('pdf:setSecurity error:', error);
    throw error;
  }
});

// 移除安全选项
ipcMain.handle('pdf:removeSecurity', async (_event, file: string, password: string) => {
  try {
    const buffer = base64ToBuffer(file);
    const result = await pdfService.removeSecurity(buffer, password);
    return bufferToBase64(result);
  } catch (error) {
    console.error('pdf:removeSecurity error:', error);
    throw error;
  }
});

// 获取元数据
ipcMain.handle('pdf:getMetadata', async (_event, file: string) => {
  try {
    const buffer = base64ToBuffer(file);
    return await pdfService.getMetadata(buffer);
  } catch (error) {
    console.error('pdf:getMetadata error:', error);
    throw error;
  }
});

// 设置元数据
ipcMain.handle('pdf:setMetadata', async (_event, options: {
  file: string;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
}) => {
  try {
    const buffer = base64ToBuffer(options.file);
    const result = await pdfService.setMetadata(buffer, {
      title: options.title,
      author: options.author,
      subject: options.subject,
      keywords: options.keywords,
    });
    return bufferToBase64(result);
  } catch (error) {
    console.error('pdf:setMetadata error:', error);
    throw error;
  }
});

// 图片转 PDF
ipcMain.handle('pdf:imagesToPdf', async (_event, options: {
  images: string[];
  pageSize: 'fit' | 'a4' | 'letter';
  placement: 'center' | 'stretch' | 'fit';
}) => {
  try {
    const buffers = options.images.map(img => base64ToBuffer(img));
    const pdfOptions: PDFImageToPdfOptions = {
      pageSize: options.pageSize,
      placement: options.placement,
    };
    const result = await pdfService.imagesToPdf(buffers, pdfOptions);
    return bufferToBase64(result);
  } catch (error) {
    console.error('pdf:imagesToPdf error:', error);
    throw error;
  }
});

// 获取表单字段
ipcMain.handle('pdf:getFormFields', async (_event, file: string) => {
  try {
    const buffer = base64ToBuffer(file);
    return await pdfService.getFormFields(buffer);
  } catch (error) {
    console.error('pdf:getFormFields error:', error);
    throw error;
  }
});

// 填写表单
ipcMain.handle('pdf:fillForm', async (_event, file: string, values: Record<string, any>) => {
  try {
    const buffer = base64ToBuffer(file);
    const result = await pdfService.fillForm(buffer, values);
    return bufferToBase64(result);
  } catch (error) {
    console.error('pdf:fillForm error:', error);
    throw error;
  }
});

// 检查 Ghostscript 可用性
ipcMain.handle('pdf:checkGhostscript', async () => {
  try {
    return ghostscriptService.checkAvailability();
  } catch (error) {
    console.error('pdf:checkGhostscript error:', error);
    throw error;
  }
});

// PDF 转灰度
ipcMain.handle('pdf:toGrayscale', async (_event, file: string) => {
  try {
    const buffer = base64ToBuffer(file);
    const result = await ghostscriptService.toGrayscale(buffer);
    return {
      data: bufferToBase64(result.data),
      originalSize: result.originalSize,
      convertedSize: result.convertedSize,
    };
  } catch (error) {
    console.error('pdf:toGrayscale error:', error);
    throw error;
  }
});

// PDF/A 转换
ipcMain.handle('pdf:toPDFA', async (_event, options: { file: string; level: '1b' | '2b' | '3b' }) => {
  try {
    const buffer = base64ToBuffer(options.file);
    const result = await ghostscriptService.toPDFA(buffer, options.level);
    return {
      data: bufferToBase64(result.data),
      originalSize: result.originalSize,
      convertedSize: result.convertedSize,
    };
  } catch (error) {
    console.error('pdf:toPDFA error:', error);
    throw error;
  }
});

// PDF 修复
ipcMain.handle('pdf:repair', async (_event, file: string) => {
  try {
    const buffer = base64ToBuffer(file);
    const result = await ghostscriptService.repair(buffer);
    return {
      data: bufferToBase64(result.data),
      originalSize: result.originalSize,
      convertedSize: result.convertedSize,
    };
  } catch (error) {
    console.error('pdf:repair error:', error);
    throw error;
  }
});

// PDF 版本转换
ipcMain.handle('pdf:convertVersion', async (_event, options: { file: string; version: '1.4' | '1.5' | '1.6' | '1.7' | '2.0' }) => {
  try {
    const buffer = base64ToBuffer(options.file);
    const result = await ghostscriptService.convertVersion(buffer, options.version);
    return {
      data: bufferToBase64(result.data),
      originalSize: result.originalSize,
      convertedSize: result.convertedSize,
    };
  } catch (error) {
    console.error('pdf:convertVersion error:', error);
    throw error;
  }
});

// PDF 线性化（Web 优化）
ipcMain.handle('pdf:linearize', async (_event, file: string) => {
  try {
    const buffer = base64ToBuffer(file);
    const result = await ghostscriptService.linearize(buffer);
    return {
      data: bufferToBase64(result.data),
      originalSize: result.originalSize,
      convertedSize: result.convertedSize,
    };
  } catch (error) {
    console.error('pdf:linearize error:', error);
    throw error;
  }
});

// 保存 PDF 文件
ipcMain.handle('pdf:saveFile', async (_event, buffer: string, defaultName: string) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
      filters: [
        { name: 'PDF 文件', extensions: ['pdf'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    
    if (result.canceled || !result.filePath) {
      return false;
    }
    
    const data = base64ToBuffer(buffer);
    fs.writeFileSync(result.filePath, data);
    return true;
  } catch (error) {
    console.error('pdf:saveFile error:', error);
    throw error;
  }
});
