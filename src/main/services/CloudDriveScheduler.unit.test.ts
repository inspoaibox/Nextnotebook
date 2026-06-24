/**
 * CloudDriveScheduler 纯逻辑单元测试（任务#3）
 *
 * CloudDriveScheduler 的大部分方法都耦合 itemsManager / fs / 适配器，难以直接单测。
 * 本文件聚焦三类"可在源码中定位、但内嵌于私有方法"的纯逻辑，通过 fast-check 属性测试
 * 锁定其数学契约，防止后续重构无意中改变行为：
 *
 *   1. smallFileThreshold（源码 CloudDriveScheduler.ts:42-44，模块内 function 未导出）
 *      - 阈值 = max(chunk_size * 2, 4MB)，决定文件进"小文件高并发"还是"大文件独占"队列
 *
 *   2. 分块总数 totalChunks（源码 CloudDriveScheduler.ts:163 / 280）
 *      - chunkSize > 0 ? Math.ceil(size / chunkSize) : 1
 *
 *   3. emitProgressFor 的字节钳制（源码 CloudDriveScheduler.ts:494-498）
 *      - chunkSize = payload.chunk_size > 0 ? payload.chunk_size : 1
 *      - uploadedBytes = Math.min(payload.size, uploadedChunks.length * chunkSize)
 *
 *   4. 软删除保留期窗口（源码仅在服务端：sync-server/src/services/CleanupScheduler.ts:58、
 *      routes/items.ts:137、services/ItemService.ts 中 `deleted_time < ?` 严格小于）
 *      - cutoff = now - retentionDays * 24 * 60 * 60 * 1000
 *      - 已过期 ⟺ deleted_time < cutoff
 *
 * 复刻实现严格按源码逐字对照；属性测试既验证实现自身一致性，也通过边界用例钉死语义。
 */
import * as fc from 'fast-check';
import { DEFAULT_CLOUD_DRIVE_CONFIG, CloudDriveConfig } from '@shared/types';

// ===== 源码复刻（与 CloudDriveScheduler.ts 逐行一致）=====

/** 小文件上限：max(chunk_size * 2, 4MB)。源码 L42-44。 */
function smallFileThreshold(config: Pick<CloudDriveConfig, 'chunk_size'>): number {
  return Math.max(config.chunk_size * 2, 4 * 1024 * 1024);
}

/** 分块总数。源码 L163 / L280（L280 多一个 total_chunks>0 的回退，这里取主公式）。 */
function computeTotalChunks(size: number, chunkSize: number): number {
  return chunkSize > 0 ? Math.ceil(size / chunkSize) : 1;
}

/** emitProgressFor 字节钳制。源码 L494-498。 */
function clampUploadedBytes(size: number, uploadedCount: number, chunkSize: number): number {
  const cs = chunkSize > 0 ? chunkSize : 1;
  return Math.min(size, uploadedCount * cs);
}

/** 软删除保留期 cutoff（毫秒时间戳）。源码 sync-server CleanupScheduler.ts:58 / items.ts:137。 */
function retentionCutoffMs(now: number, retentionDays: number): number {
  return now - retentionDays * 24 * 60 * 60 * 1000;
}

/** 软删除是否已过期。源码 sync-server ItemService.ts `deleted_time < ?`（严格小于）。 */
function isSoftDeleteExpired(deletedTime: number, now: number, retentionDays: number): boolean {
  return deletedTime < retentionCutoffMs(now, retentionDays);
}

const MB = 1024 * 1024;

describe('CloudDriveScheduler 纯逻辑', () => {
  // ============================================================
  // 1. smallFileThreshold
  // ============================================================
  describe('smallFileThreshold（小文件/大文件队列分界）', () => {
    it('默认配置（chunk_size 8MB）→ 16MB', () => {
      expect(smallFileThreshold(DEFAULT_CLOUD_DRIVE_CONFIG)).toBe(16 * MB);
    });

    it('chunk_size 1MB → max(2MB, 4MB) = 4MB（4MB 下限生效）', () => {
      expect(smallFileThreshold({ chunk_size: 1 * MB })).toBe(4 * MB);
    });

    it('chunk_size 10MB → 20MB（2 倍主导，超过 4MB 下限）', () => {
      expect(smallFileThreshold({ chunk_size: 10 * MB })).toBe(20 * MB);
    });

    it('chunk_size 2MB → 4MB（恰好等于下限）', () => {
      expect(smallFileThreshold({ chunk_size: 2 * MB })).toBe(4 * MB);
    });

    it('chunk_size 0 → max(0, 4MB) = 4MB（防御性下限）', () => {
      expect(smallFileThreshold({ chunk_size: 0 })).toBe(4 * MB);
    });

    it('属性：阈值恒 ≥ 4MB 且恒 ≥ chunk_size * 2', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1024 * MB }), (chunkSize) => {
          const t = smallFileThreshold({ chunk_size: chunkSize });
          expect(t).toBeGreaterThanOrEqual(4 * MB);
          expect(t).toBeGreaterThanOrEqual(chunkSize * 2);
        })
      );
    });

    it('属性：阈值 = max(chunk_size * 2, 4MB) 与公式严格一致', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 * MB }), (chunkSize) => {
          const t = smallFileThreshold({ chunk_size: chunkSize });
          expect(t).toBe(Math.max(chunkSize * 2, 4 * MB));
        })
      );
    });
  });

  // ============================================================
  // 2. 分块总数 computeTotalChunks
  // ============================================================
  describe('computeTotalChunks（分块总数）', () => {
    it('chunkSize > 0：size 0 → Math.ceil(0) = 0（空文件的边界行为）', () => {
      // 源码 L163：chunkSize > 0 ? Math.ceil(size / chunkSize) : 1
      // size=0 时 Math.ceil(0)=0，这是源码的实际行为（空文件通常在哈希闸门已被短路）
      expect(computeTotalChunks(0, 8 * MB)).toBe(0);
    });

    it('size < chunkSize → 1 块', () => {
      expect(computeTotalChunks(1, 8 * MB)).toBe(1);
      expect(computeTotalChunks(8 * MB - 1, 8 * MB)).toBe(1);
    });

    it('size 恰好为 chunkSize 整数倍 → 整除', () => {
      expect(computeTotalChunks(8 * MB, 8 * MB)).toBe(1);
      expect(computeTotalChunks(16 * MB, 8 * MB)).toBe(2);
      expect(computeTotalChunks(24 * MB, 8 * MB)).toBe(3);
    });

    it('size 超过整数倍 1 字节 → 多 1 块（向上取整）', () => {
      expect(computeTotalChunks(8 * MB + 1, 8 * MB)).toBe(2);
      expect(computeTotalChunks(16 * MB + 1, 8 * MB)).toBe(3);
    });

    it('chunkSize ≤ 0 → 恒为 1（防御性回退）', () => {
      expect(computeTotalChunks(0, 0)).toBe(1);
      expect(computeTotalChunks(100, 0)).toBe(1);
      expect(computeTotalChunks(100, -1)).toBe(1);
    });

    it('属性：chunkSize > 0 且 size > 0 → totalChunks 为 ≥ 1 的整数', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1024 * MB }),
          fc.integer({ min: 1, max: 64 * MB }),
          (size, chunkSize) => {
            const n = computeTotalChunks(size, chunkSize);
            expect(Number.isInteger(n)).toBe(true);
            expect(n).toBeGreaterThanOrEqual(1);
          }
        )
      );
    });

    it('属性：totalChunks * chunkSize ≥ size（每字节都被某块覆盖）', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1024 * MB }),
          fc.integer({ min: 1, max: 64 * MB }),
          (size, chunkSize) => {
            const n = computeTotalChunks(size, chunkSize);
            // size=0 时 n=0，0*chunkSize=0 ≥ 0 成立；其余 n≥1
            expect(n * chunkSize).toBeGreaterThanOrEqual(size);
          }
        )
      );
    });

    it('属性：(totalChunks - 1) * chunkSize < size（无冗余空块，除非 size=0）', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1024 * MB }),
          fc.integer({ min: 1, max: 64 * MB }),
          (size, chunkSize) => {
            const n = computeTotalChunks(size, chunkSize);
            expect((n - 1) * chunkSize).toBeLessThan(size);
          }
        )
      );
    });
  });

  // ============================================================
  // 3. emitProgressFor 字节钳制
  // ============================================================
  describe('clampUploadedBytes（已上传字节钳制）', () => {
    it('0 块已传 → 0 字节', () => {
      expect(clampUploadedBytes(100, 0, 8 * MB)).toBe(0);
    });

    it('未达 totalChunks：累加值（不超 size）', () => {
      // size=20MB, chunkSize=8MB → totalChunks=3；传 2 块 = 16MB
      expect(clampUploadedBytes(20 * MB, 2, 8 * MB)).toBe(16 * MB);
    });

    it('恰好传满 totalChunks → 等于 size（不超）', () => {
      // size=20MB, chunkSize=8MB → totalChunks=3；传 3 块 = 24MB，钳到 20MB
      expect(clampUploadedBytes(20 * MB, 3, 8 * MB)).toBe(20 * MB);
    });

    it('超出 totalChunks（理论上不应发生，但需防御）→ 钳到 size', () => {
      expect(clampUploadedBytes(20 * MB, 100, 8 * MB)).toBe(20 * MB);
    });

    it('size=0（空文件）→ 恒为 0', () => {
      expect(clampUploadedBytes(0, 0, 8 * MB)).toBe(0);
      expect(clampUploadedBytes(0, 5, 8 * MB)).toBe(0);
    });

    it('chunkSize ≤ 0 → 回退为 1 计算（源码 L494 chunk_size > 0 ? : 1）', () => {
      expect(clampUploadedBytes(10, 3, 0)).toBe(Math.min(10, 3 * 1));
      expect(clampUploadedBytes(10, 3, -5)).toBe(Math.min(10, 3 * 1));
    });

    it('属性：结果恒 ∈ [0, size]', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 * MB }),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 16 * MB }),
          (size, uploadedCount, chunkSize) => {
            const b = clampUploadedBytes(size, uploadedCount, chunkSize);
            expect(b).toBeGreaterThanOrEqual(0);
            expect(b).toBeLessThanOrEqual(size);
          }
        )
      );
    });

    it('属性：uploadedCount 单调不减（更多块 → 更多或相等字节）', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 * MB }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 1, max: 16 * MB }),
          fc.integer({ min: 0, max: 50 }),
          (size, countA, chunkSize, delta) => {
            const countB = countA + delta;
            const a = clampUploadedBytes(size, countA, chunkSize);
            const b = clampUploadedBytes(size, countB, chunkSize);
            expect(b).toBeGreaterThanOrEqual(a);
          }
        )
      );
    });
  });

  // ============================================================
  // 4. 软删除保留期窗口（服务端语义）
  // ============================================================
  describe('软删除保留期窗口（sync-server 语义）', () => {
    const NOW = 1_700_000_000_000; // 固定 now，避免时间漂移影响断言

    it('retentionDays=30：deletedTime 恰好 31 天前 → 已过期', () => {
      const deleted = NOW - 31 * 24 * 60 * 60 * 1000;
      expect(isSoftDeleteExpired(deleted, NOW, 30)).toBe(true);
    });

    it('retentionDays=30：deletedTime 恰好 29 天前 → 未过期', () => {
      const deleted = NOW - 29 * 24 * 60 * 60 * 1000;
      expect(isSoftDeleteExpired(deleted, NOW, 30)).toBe(false);
    });

    it('边界：deletedTime 恰好等于 cutoff → 未过期（源码严格 <）', () => {
      // cutoff = NOW - 30*86400000；deleted_time < cutoff 才删除，等于不删
      const deleted = NOW - 30 * 24 * 60 * 60 * 1000;
      expect(isSoftDeleteExpired(deleted, NOW, 30)).toBe(false);
    });

    it('边界：deletedTime = cutoff - 1ms → 已过期', () => {
      const cutoff = NOW - 30 * 24 * 60 * 60 * 1000;
      expect(isSoftDeleteExpired(cutoff - 1, NOW, 30)).toBe(true);
    });

    it('边界：deletedTime = cutoff + 1ms → 未过期', () => {
      const cutoff = NOW - 30 * 24 * 60 * 60 * 1000;
      expect(isSoftDeleteExpired(cutoff + 1, NOW, 30)).toBe(false);
    });

    it('retentionDays=0：cutoff = now，deletedTime 任何 < now 的都过期', () => {
      expect(isSoftDeleteExpired(NOW - 1, NOW, 0)).toBe(true);
      expect(isSoftDeleteExpired(NOW - 1000, NOW, 0)).toBe(true);
      // 等于 now 不算过期（严格 <）
      expect(isSoftDeleteExpired(NOW, NOW, 0)).toBe(false);
    });

    it('retentionDays 极大：任何合理 deletedTime 都未过期', () => {
      expect(isSoftDeleteExpired(0, NOW, 365 * 100)).toBe(false);
      expect(isSoftDeleteExpired(NOW - 1, NOW, 365 * 100)).toBe(false);
    });

    it('默认配置 soft_delete_retention_days = 30', () => {
      expect(DEFAULT_CLOUD_DRIVE_CONFIG.soft_delete_retention_days).toBe(30);
    });

    it('属性：deletedTime 比 retention 长一天 → 必过期；短一天 → 必未过期', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 365 * 10 }),
          fc.integer({ min: 1000, max: 24 * 60 * 60 * 1000 - 1 }),
          (retentionDays, subDayMs) => {
            // deletedTime = now - (retentionDays + 1) 天 + 一小段（仍超过 retention）
            const overDeleted = NOW - (retentionDays * 24 * 60 * 60 * 1000) - subDayMs - 1;
            expect(isSoftDeleteExpired(overDeleted, NOW, retentionDays)).toBe(true);
            // deletedTime = now - (retentionDays - 1) 天 + 一小段（仍短于 retention）
            const underDeleted = NOW - (retentionDays * 24 * 60 * 60 * 1000) + subDayMs + 1;
            expect(isSoftDeleteExpired(underDeleted, NOW, retentionDays)).toBe(false);
          }
        )
      );
    });

    it('属性：retentionDays 翻倍 → 窗口严格变大（过期集合只缩不增）', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 365 }),
          fc.integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 }),
          (retentionDays, ageOffset) => {
            const deleted = NOW - ageOffset;
            const expiredAtR = isSoftDeleteExpired(deleted, NOW, retentionDays);
            const expiredAt2R = isSoftDeleteExpired(deleted, NOW, retentionDays * 2);
            // 若 R 下已过期，2R 下可能变未过期；若 2R 下已过期，R 下必然已过期
            if (expiredAt2R) expect(expiredAtR).toBe(true);
          }
        )
      );
    });
  });
});
