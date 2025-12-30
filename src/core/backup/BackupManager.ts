import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DatabaseManager } from '../database/Database';
import { CryptoEngine } from '../crypto/CryptoEngine';

export interface BackupOptions {
  includeResources: boolean;
  encrypt: boolean;
  password?: string;
}

export interface BackupMetadata {
  version: string;
  created_at: number;
  app_version: string;
  encrypted: boolean;
  items_count: number;
  resources_count: number;
  checksum: string;
}

export interface BackupResult {
  success: boolean;
  filePath: string;
  metadata: BackupMetadata;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  itemsRestored: number;
  resourcesRestored: number;
  error?: string;
}

export class BackupManager {
  private dbManager: DatabaseManager;
  private userDataPath: string;
  private cryptoEngine: CryptoEngine;

  constructor(dbManager: DatabaseManager, userDataPath: string) {
    this.dbManager = dbManager;
    this.userDataPath = userDataPath;
    this.cryptoEngine = new CryptoEngine();
  }

  // 创建完整备份
  async createBackup(outputPath: string, options: BackupOptions): Promise<BackupResult> {
    try {
      const timestamp = Date.now();
      const backupData: Record<string, unknown> = {
        metadata: {
          version: '1.0',
          created_at: timestamp,
          app_version: '1.0.0',
          encrypted: options.encrypt,
          items_count: 0,
          resources_count: 0,
          checksum: '',
        },
        items: [],
        resources: [],
      };

      // 导出所有 items
      const items = this.dbManager.query<Record<string, unknown>>('SELECT * FROM items');
      backupData.items = items;
      (backupData.metadata as BackupMetadata).items_count = items.length;

      // 导出资源文件（如果需要）
      if (options.includeResources) {
        const resourcesDir = path.join(this.userDataPath, 'resources');
        if (fs.existsSync(resourcesDir)) {
          const resourceFiles = fs.readdirSync(resourcesDir);
          const resources: Array<{ filename: string; data: string }> = [];

          for (const filename of resourceFiles) {
            const filePath = path.join(resourcesDir, filename);
            const data = fs.readFileSync(filePath);
            resources.push({
              filename,
              data: data.toString('base64'),
            });
          }

          backupData.resources = resources;
          (backupData.metadata as BackupMetadata).resources_count = resources.length;
        }
      }

      // 计算校验和
      const dataStr = JSON.stringify({ items: backupData.items, resources: backupData.resources });
      (backupData.metadata as BackupMetadata).checksum = crypto
        .createHash('sha256')
        .update(dataStr)
        .digest('hex');

      // 序列化
      let outputData = JSON.stringify(backupData, null, 2);

      // 加密（如果需要）
      if (options.encrypt && options.password) {
        const encrypted = this.cryptoEngine.encryptWithPassword(outputData, options.password);
        outputData = JSON.stringify({ encrypted: true, data: encrypted });
      }

      // 写入文件
      const finalPath = outputPath.endsWith('.mcbak') ? outputPath : `${outputPath}.mcbak`;
      fs.writeFileSync(finalPath, outputData, 'utf8');

      return {
        success: true,
        filePath: finalPath,
        metadata: backupData.metadata as BackupMetadata,
      };
    } catch (error) {
      return {
        success: false,
        filePath: '',
        metadata: {} as BackupMetadata,
        error: (error as Error).message,
      };
    }
  }

  // 从备份恢复
  async restoreBackup(backupPath: string, password?: string): Promise<RestoreResult> {
    try {
      // 读取备份文件
      let content = fs.readFileSync(backupPath, 'utf8');
      let backupData: Record<string, unknown>;

      // 检查是否加密
      const parsed = JSON.parse(content);
      if (parsed.encrypted) {
        if (!password) {
          return { success: false, itemsRestored: 0, resourcesRestored: 0, error: 'Password required for encrypted backup' };
        }
        const decrypted = this.cryptoEngine.decryptWithPassword(parsed.data, password);
        backupData = JSON.parse(decrypted);
      } else {
        backupData = parsed;
      }

      // 验证校验和
      const dataStr = JSON.stringify({ items: backupData.items, resources: backupData.resources });
      const checksum = crypto.createHash('sha256').update(dataStr).digest('hex');
      if (checksum !== (backupData.metadata as BackupMetadata).checksum) {
        return { success: false, itemsRestored: 0, resourcesRestored: 0, error: 'Backup checksum verification failed' };
      }

      // 恢复 items
      const items = backupData.items as Array<Record<string, unknown>>;
      let itemsRestored = 0;

      this.dbManager.transaction(() => {
        for (const item of items) {
          // 检查是否已存在
          const existing = this.dbManager.get<{ id: string }>('SELECT id FROM items WHERE id = ?', [item.id]);
          if (existing) {
            // 更新
            this.dbManager.run(
              `UPDATE items SET type = ?, created_time = ?, updated_time = ?, deleted_time = ?,
               payload = ?, content_hash = ?, sync_status = ?, local_rev = ?, remote_rev = ?,
               encryption_applied = ?, schema_version = ? WHERE id = ?`,
              [
                item.type, item.created_time, item.updated_time, item.deleted_time,
                item.payload, item.content_hash, item.sync_status, item.local_rev, item.remote_rev,
                item.encryption_applied, item.schema_version, item.id,
              ]
            );
          } else {
            // 插入
            this.dbManager.run(
              `INSERT INTO items (id, type, created_time, updated_time, deleted_time, payload,
               content_hash, sync_status, local_rev, remote_rev, encryption_applied, schema_version)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                item.id, item.type, item.created_time, item.updated_time, item.deleted_time,
                item.payload, item.content_hash, item.sync_status, item.local_rev, item.remote_rev,
                item.encryption_applied, item.schema_version,
              ]
            );
          }
          itemsRestored++;
        }
      });

      // 恢复资源文件
      const resources = backupData.resources as Array<{ filename: string; data: string }>;
      let resourcesRestored = 0;

      if (resources && resources.length > 0) {
        const resourcesDir = path.join(this.userDataPath, 'resources');
        if (!fs.existsSync(resourcesDir)) {
          fs.mkdirSync(resourcesDir, { recursive: true });
        }

        for (const resource of resources) {
          const filePath = path.join(resourcesDir, resource.filename);
          const data = Buffer.from(resource.data, 'base64');
          fs.writeFileSync(filePath, data);
          resourcesRestored++;
        }
      }

      return { success: true, itemsRestored, resourcesRestored };
    } catch (error) {
      return {
        success: false,
        itemsRestored: 0,
        resourcesRestored: 0,
        error: (error as Error).message,
      };
    }
  }

  // 验证备份文件
  async verifyBackup(backupPath: string, password?: string): Promise<{ valid: boolean; metadata?: BackupMetadata; error?: string }> {
    try {
      let content = fs.readFileSync(backupPath, 'utf8');
      const parsed = JSON.parse(content);

      if (parsed.encrypted) {
        if (!password) {
          return { valid: false, error: 'Password required for encrypted backup' };
        }
        const decrypted = this.cryptoEngine.decryptWithPassword(parsed.data, password);
        const backupData = JSON.parse(decrypted);

        // 验证校验和
        const dataStr = JSON.stringify({ items: backupData.items, resources: backupData.resources });
        const checksum = crypto.createHash('sha256').update(dataStr).digest('hex');

        if (checksum !== backupData.metadata.checksum) {
          return { valid: false, error: 'Checksum verification failed' };
        }

        return { valid: true, metadata: backupData.metadata };
      } else {
        const dataStr = JSON.stringify({ items: parsed.items, resources: parsed.resources });
        const checksum = crypto.createHash('sha256').update(dataStr).digest('hex');

        if (checksum !== parsed.metadata.checksum) {
          return { valid: false, error: 'Checksum verification failed' };
        }

        return { valid: true, metadata: parsed.metadata };
      }
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }

  // 列出可用备份
  listBackups(backupDir: string): Array<{ filename: string; path: string; size: number; modified: Date }> {
    if (!fs.existsSync(backupDir)) {
      return [];
    }

    const files = fs.readdirSync(backupDir);
    return files
      .filter(f => f.endsWith('.mcbak'))
      .map(filename => {
        const filePath = path.join(backupDir, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
        };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }

  // 自动备份（增量）
  async createIncrementalBackup(backupDir: string): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.mcbak`;
    const outputPath = path.join(backupDir, filename);

    return this.createBackup(outputPath, {
      includeResources: true,
      encrypt: false,
    });
  }

  // 清理旧备份
  cleanOldBackups(backupDir: string, keepCount: number = 10): number {
    const backups = this.listBackups(backupDir);
    let deleted = 0;

    if (backups.length > keepCount) {
      const toDelete = backups.slice(keepCount);
      for (const backup of toDelete) {
        fs.unlinkSync(backup.path);
        deleted++;
      }
    }

    return deleted;
  }
}

export default BackupManager;
