import { app, ipcMain, IpcMainInvokeEvent } from 'electron';
import { DatabaseManager, ItemsManager } from '@core/database';
import { ItemType } from '@shared/types';

let dbManager: DatabaseManager | null = null;
let itemsManager: ItemsManager | null = null;

export function initializeDatabase(): void {
  const userDataPath = app.getPath('userData');
  dbManager = new DatabaseManager(userDataPath);
  dbManager.initialize();
  itemsManager = new ItemsManager(dbManager);

  registerIpcHandlers();
}

export function getItemsManager(): ItemsManager {
  if (!itemsManager) throw new Error('Database not initialized');
  return itemsManager;
}

export function closeDatabase(): void {
  if (dbManager) {
    dbManager.close();
    dbManager = null;
    itemsManager = null;
  }
}

function registerIpcHandlers(): void {
  // 创建 Item
  ipcMain.handle('items:create', (_event: IpcMainInvokeEvent, type: ItemType, payload: object) => {
    return getItemsManager().create(type, payload);
  });

  // 获取单个 Item
  ipcMain.handle('items:getById', (_event: IpcMainInvokeEvent, id: string) => {
    return getItemsManager().getById(id);
  });

  // 获取单个 Item（包括已删除的）
  ipcMain.handle('items:getByIdIncludeDeleted', (_event: IpcMainInvokeEvent, id: string) => {
    return getItemsManager().getByIdIncludeDeleted(id);
  });

  // 获取指定类型的所有 Items
  ipcMain.handle('items:getByType', (_event: IpcMainInvokeEvent, type: ItemType) => {
    return getItemsManager().getByType(type);
  });

  // 更新 Item
  ipcMain.handle('items:update', (_event: IpcMainInvokeEvent, id: string, payload: object) => {
    return getItemsManager().update(id, payload);
  });

  // 软删除 Item
  ipcMain.handle('items:delete', (_event: IpcMainInvokeEvent, id: string) => {
    return getItemsManager().softDelete(id);
  });

  // 永久删除 Item（从回收站彻底删除）
  ipcMain.handle('items:hardDelete', (_event: IpcMainInvokeEvent, id: string) => {
    return getItemsManager().hardDelete(id);
  });

  // 恢复 Item
  ipcMain.handle('items:restore', (_event: IpcMainInvokeEvent, id: string) => {
    return getItemsManager().restore(id);
  });

  // 搜索
  ipcMain.handle('items:search', (_event: IpcMainInvokeEvent, query: string, type?: ItemType) => {
    return getItemsManager().search(query, type);
  });

  // 按文件夹获取笔记
  ipcMain.handle('items:getNotesByFolder', (_event: IpcMainInvokeEvent, folderId: string | null) => {
    return getItemsManager().getNotesByFolder(folderId);
  });

  // 获取置顶笔记
  ipcMain.handle('items:getPinnedNotes', () => {
    return getItemsManager().getPinnedNotes();
  });

  // 获取已删除的 Items
  ipcMain.handle('items:getDeleted', (_event: IpcMainInvokeEvent, type?: ItemType) => {
    return getItemsManager().getDeleted(type);
  });

  // 获取统计信息
  ipcMain.handle('items:getStats', () => {
    return getItemsManager().getStats();
  });
}
