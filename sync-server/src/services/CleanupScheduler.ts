import { config } from '../config';
import { ItemService } from './ItemService';
import { ChangeService } from './ChangeService';
import { log } from '../middleware/logger';

export class CleanupScheduler {
  private itemService: ItemService;
  private changeService: ChangeService;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.itemService = new ItemService();
    this.changeService = new ChangeService();
  }

  // 启动定时清理任务
  start(): void {
    // 每 24 小时执行一次清理
    const interval = 24 * 60 * 60 * 1000;
    
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, interval);

    // 启动时也执行一次
    this.runCleanup();
    
    log('info', 'Cleanup scheduler started');
  }

  // 停止定时任务
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      log('info', 'Cleanup scheduler stopped');
    }
  }

  // 执行清理
  private runCleanup(): void {
    const now = Date.now();

    try {
      // 清理变更日志（默认 7 天前）
      const changeLogRetention = config.changeLogRetentionDays * 24 * 60 * 60 * 1000;
      const changesBefore = now - changeLogRetention;
      const deletedChanges = this.changeService.cleanupBefore(changesBefore);
      
      if (deletedChanges > 0) {
        log('info', 'Cleaned up change logs', { deleted: deletedChanges });
      }

      // 清理软删除数据（30 天前）
      const softDeleteRetention = 30 * 24 * 60 * 60 * 1000;
      const itemsBefore = now - softDeleteRetention;
      const deletedItems = this.itemService.cleanupSoftDeleted(itemsBefore);
      
      if (deletedItems > 0) {
        log('info', 'Cleaned up soft-deleted items', { deleted: deletedItems });
      }
    } catch (error) {
      log('error', 'Cleanup failed', { error: (error as Error).message });
    }
  }
}
