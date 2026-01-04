import { app, ipcMain, IpcMainInvokeEvent, dialog } from 'electron';
import { DatabaseManager, ItemsManager } from '@core/database';
import { ItemType } from '@shared/types';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

let dbManager: DatabaseManager | null = null;
let itemsManager: ItemsManager | null = null;

// 导出数据格式版本
const EXPORT_VERSION = '1.0';

interface ExportData {
  version: string;
  exportTime: number;
  appVersion: string;
  checksum: string;
  items: Array<{
    id: string;
    type: string;
    created_time: number;
    updated_time: number;
    deleted_time: number | null;
    payload: string;
    content_hash: string;
    sync_status: string;
    local_rev: number;
    remote_rev: string | null;
    encryption_applied: number;
    schema_version: number;
  }>;
  resources: Array<{
    filename: string;
    data: string; // base64
  }>;
}

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

  // 导出数据
  ipcMain.handle('data:export', async (_event: IpcMainInvokeEvent, options: { includeResources: boolean }) => {
    try {
      // 弹出保存对话框
      const result = await dialog.showSaveDialog({
        title: '导出数据',
        defaultPath: `mucheng-notes-backup-${new Date().toISOString().slice(0, 10)}.mcdata`,
        filters: [
          { name: '暮城笔记数据', extensions: ['mcdata'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: '已取消' };
      }

      const userDataPath = app.getPath('userData');
      
      // 获取所有数据
      const items = dbManager!.query<any>('SELECT * FROM items');
      
      // 准备导出数据
      const exportData: ExportData = {
        version: EXPORT_VERSION,
        exportTime: Date.now(),
        appVersion: app.getVersion(),
        checksum: '',
        items: items,
        resources: []
      };

      // 导出资源文件
      if (options.includeResources) {
        const resourcesDir = path.join(userDataPath, 'resources');
        if (fs.existsSync(resourcesDir)) {
          const files = fs.readdirSync(resourcesDir);
          for (const filename of files) {
            const filePath = path.join(resourcesDir, filename);
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
              const data = fs.readFileSync(filePath);
              exportData.resources.push({
                filename,
                data: data.toString('base64')
              });
            }
          }
        }
      }

      // 计算校验和
      const dataStr = JSON.stringify({ items: exportData.items, resources: exportData.resources });
      exportData.checksum = crypto.createHash('sha256').update(dataStr).digest('hex');

      // 写入文件
      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf8');

      return {
        success: true,
        filePath: result.filePath,
        itemsCount: items.length,
        resourcesCount: exportData.resources.length
      };
    } catch (error) {
      console.error('Export failed:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 导入数据
  ipcMain.handle('data:import', async (_event: IpcMainInvokeEvent, options: { mode: 'merge' | 'replace' }) => {
    try {
      // 弹出打开对话框
      const result = await dialog.showOpenDialog({
        title: '导入数据',
        filters: [
          { name: '暮城笔记数据', extensions: ['mcdata', 'mcbak'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '已取消' };
      }

      const filePath = result.filePaths[0];
      const content = fs.readFileSync(filePath, 'utf8');
      const importData: ExportData = JSON.parse(content);

      // 验证数据格式
      if (!importData.version || !importData.items) {
        return { success: false, error: '无效的数据文件格式' };
      }

      // 验证校验和
      const dataStr = JSON.stringify({ items: importData.items, resources: importData.resources || [] });
      const checksum = crypto.createHash('sha256').update(dataStr).digest('hex');
      if (importData.checksum && checksum !== importData.checksum) {
        return { success: false, error: '数据校验失败，文件可能已损坏' };
      }

      const userDataPath = app.getPath('userData');
      let itemsImported = 0;
      let itemsSkipped = 0;
      let resourcesImported = 0;

      // 如果是替换模式，先清空现有数据
      if (options.mode === 'replace') {
        dbManager!.run('DELETE FROM items');
        // 清空资源目录
        const resourcesDir = path.join(userDataPath, 'resources');
        if (fs.existsSync(resourcesDir)) {
          const files = fs.readdirSync(resourcesDir);
          for (const file of files) {
            fs.unlinkSync(path.join(resourcesDir, file));
          }
        }
      }

      // 导入数据
      dbManager!.transaction(() => {
        for (const item of importData.items) {
          if (options.mode === 'merge') {
            // 合并模式：检查是否已存在
            const existing = dbManager!.get<{ id: string }>('SELECT id FROM items WHERE id = ?', [item.id]);
            if (existing) {
              // 比较更新时间，保留较新的
              const existingItem = dbManager!.get<{ updated_time: number }>('SELECT updated_time FROM items WHERE id = ?', [item.id]);
              if (existingItem && existingItem.updated_time >= item.updated_time) {
                itemsSkipped++;
                continue;
              }
            }
          }

          // 插入或更新
          dbManager!.run(
            `INSERT OR REPLACE INTO items (id, type, created_time, updated_time, deleted_time, payload,
             content_hash, sync_status, local_rev, remote_rev, encryption_applied, schema_version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id, item.type, item.created_time, item.updated_time, item.deleted_time,
              item.payload, item.content_hash, 'modified', item.local_rev || 1, item.remote_rev,
              item.encryption_applied || 0, item.schema_version || 1
            ]
          );
          itemsImported++;
        }
      });

      // 导入资源文件
      if (importData.resources && importData.resources.length > 0) {
        const resourcesDir = path.join(userDataPath, 'resources');
        if (!fs.existsSync(resourcesDir)) {
          fs.mkdirSync(resourcesDir, { recursive: true });
        }

        for (const resource of importData.resources) {
          const destPath = path.join(resourcesDir, resource.filename);
          // 合并模式下，如果文件已存在则跳过
          if (options.mode === 'merge' && fs.existsSync(destPath)) {
            continue;
          }
          const data = Buffer.from(resource.data, 'base64');
          fs.writeFileSync(destPath, data);
          resourcesImported++;
        }
      }

      return {
        success: true,
        itemsImported,
        itemsSkipped,
        resourcesImported,
        totalItems: importData.items.length,
        totalResources: importData.resources?.length || 0
      };
    } catch (error) {
      console.error('Import failed:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取导入文件预览信息
  ipcMain.handle('data:previewImport', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: '选择要导入的数据文件',
        filters: [
          { name: '暮城笔记数据', extensions: ['mcdata', 'mcbak'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '已取消' };
      }

      const filePath = result.filePaths[0];
      const content = fs.readFileSync(filePath, 'utf8');
      const importData: ExportData = JSON.parse(content);

      // 统计各类型数量
      const typeCounts: Record<string, number> = {};
      for (const item of importData.items) {
        typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
      }

      return {
        success: true,
        filePath,
        version: importData.version,
        exportTime: importData.exportTime,
        appVersion: importData.appVersion,
        itemsCount: importData.items.length,
        resourcesCount: importData.resources?.length || 0,
        typeCounts
      };
    } catch (error) {
      console.error('Preview import failed:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
