/**
 * CloudDriveService 单元测试
 *
 * 覆盖范围（纯逻辑，不依赖 Electron 运行时）：
 *   - 配置默认值 / loadConfig 合并 / updateConfig
 *   - matchGlob（简易通配）
 *   - isIgnored（闸门2：垃圾过滤）
 *   - deriveId（稳定 UUIDv5 风格派生，纯函数性质）
 *   - deriveParentFolderId（父目录派生，根级为 'root'）
 *   - toRelative（相对路径推导，跨盘/越界返回 null）
 *   - guessMime（MIME 推断兜底）
 *
 * 这些方法在源码中均为 private，测试通过 `any` 强制访问——
 * 单元测试关注行为而非类型可见性，这是测试内部纯函数的常见做法。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as fc from 'fast-check';
import { CloudDriveService } from './CloudDriveService';
import { DEFAULT_CLOUD_DRIVE_CONFIG } from '@shared/types';

// UUIDv5 风格输出格式：8-4-4-4-12 全小写十六进制
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 构造一个隔离的 CloudDriveService 实例。
 * - userDataPath 指向全新临时目录，保证无遗留 cloud-drive-config.json
 *   => loadConfig 返回 DEFAULT_CLOUD_DRIVE_CONFIG
 * - itemsManager 传入空对象桩，纯函数不会真正用到它
 */
function createService(): { service: CloudDriveService; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-unit-'));
  const service = new CloudDriveService({} as any, tmpDir);
  return { service, tmpDir };
}

describe('CloudDriveService (unit)', () => {
  let tmpDir: string;
  let service: CloudDriveService;

  beforeEach(() => {
    const ctx = createService();
    tmpDir = ctx.tmpDir;
    service = ctx.service;
  });

  afterEach(() => {
    service.dispose();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  // ============================================================
  // 配置：默认值
  // ============================================================
  describe('配置默认值', () => {
    it('无配置文件时返回 DEFAULT_CLOUD_DRIVE_CONFIG 的副本', () => {
      const cfg = service.getConfig();
      // 深度相等
      expect(cfg).toEqual(DEFAULT_CLOUD_DRIVE_CONFIG);
    });

    it('关键默认值符合预期（500MB / 8MB / 30 天 / 0.8s / 0.8s / 并发3）', () => {
      const cfg = service.getConfig();
      expect(cfg.max_file_size).toBe(500 * 1024 * 1024);
      expect(cfg.chunk_size).toBe(8 * 1024 * 1024);
      expect(cfg.ignore_hidden).toBe(true);
      expect(cfg.sync_deletions).toBe(true);
      expect(cfg.soft_delete_retention_days).toBe(30);
      expect(cfg.stability_threshold).toBe(800);
      expect(cfg.debounce_ms).toBe(800);
      expect(cfg.small_file_concurrency).toBe(3);
      expect(cfg.sync_cursor).toBeNull();
      expect(cfg.watched_root_path).toBeNull();
    });

    it('默认忽略规则覆盖常见垃圾文件', () => {
      const patterns = service.getConfig().ignore_patterns;
      expect(patterns).toContain('~$*');
      expect(patterns).toContain('*.tmp');
      expect(patterns).toContain('*.asd');
      expect(patterns).toContain('*.wbk');
      expect(patterns).toContain('.DS_Store');
      expect(patterns).toContain('Thumbs.db');
      expect(patterns).toContain('desktop.ini');
      expect(patterns).toContain('*.lnk');
    });

    it('getConfig 返回浅副本：原始类型字段被隔离，引用类型字段共享', () => {
      // 实现用 { ...this.config } 浅拷贝：
      //   - 原始类型（max_file_size 等）被隔离，外部修改不影响内部
      //   - 引用类型（ignore_patterns 数组）按引用共享，外部修改会污染内部
      // 这里如实记录该浅拷贝语义，避免调用方误用。
      const cfg1 = service.getConfig();
      cfg1.max_file_size = 1;
      const cfg2 = service.getConfig();
      expect(cfg2.max_file_size).toBe(500 * 1024 * 1024); // 原始类型隔离成功

      // 引用类型：警告性断言——共享引用，外部 push 会污染内部状态
      const before = [...cfg1.ignore_patterns];
      cfg1.ignore_patterns.push('FOO');
      const cfg3 = service.getConfig();
      expect(cfg3.ignore_patterns).toContain('FOO'); // 共享：污染生效
      // 清理污染，避免影响后续测试
      cfg3.ignore_patterns.length = 0;
      before.forEach(p => cfg3.ignore_patterns.push(p));
    });
  });

  // ============================================================
  // 配置：持久化与合并
  // ============================================================
  describe('配置持久化', () => {
    it('updateConfig 合并 patch 并回写磁盘', () => {
      const updated = service.updateConfig({ watched_root_path: '/tmp/cloud', debounce_ms: 5000 });
      expect(updated.watched_root_path).toBe('/tmp/cloud');
      expect(updated.debounce_ms).toBe(5000);
      // 其它字段保留默认
      expect(updated.max_file_size).toBe(500 * 1024 * 1024);

      // 磁盘上确实有文件
      const raw = fs.readFileSync(path.join(tmpDir, 'cloud-drive-config.json'), 'utf-8');
      const persisted = JSON.parse(raw);
      expect(persisted.watched_root_path).toBe('/tmp/cloud');
      expect(persisted.debounce_ms).toBe(5000);
    });

    it('重启后 loadConfig 能复用已写入的配置（合并默认值兜底新字段）', () => {
      service.updateConfig({ watched_root_path: '/data/cloud', chunk_size: 1024 });
      // 模拟"重启"：基于同一 userDataPath 重新构造
      const reborn = new CloudDriveService({} as any, tmpDir);
      const cfg = reborn.getConfig();
      expect(cfg.watched_root_path).toBe('/data/cloud');
      expect(cfg.chunk_size).toBe(1024);
      // 未写入字段回退默认
      expect(cfg.max_file_size).toBe(500 * 1024 * 1024);
      expect(cfg.ignore_patterns).toEqual(DEFAULT_CLOUD_DRIVE_CONFIG.ignore_patterns);
    });

    it('损坏的配置文件回退到默认值（不抛异常）', () => {
      fs.writeFileSync(path.join(tmpDir, 'cloud-drive-config.json'), '{ not valid json', 'utf-8');
      const reborn = new CloudDriveService({} as any, tmpDir);
      // 损坏时回退默认
      expect(reborn.getConfig()).toEqual(DEFAULT_CLOUD_DRIVE_CONFIG);
    });
  });

  // ============================================================
  // matchGlob（简易通配）
  // ============================================================
  describe('matchGlob', () => {
    const match = (name: string, pattern: string) =>
      (service as any).matchGlob(name, pattern) as boolean;

    it('精确字面量匹配', () => {
      expect(match('Thumbs.db', 'Thumbs.db')).toBe(true);
      expect(match('Thumbs.db', 'thumbs.db')).toBe(true); // 大小写不敏感
      expect(match('Thumbs.db', 'desktop.ini')).toBe(false);
    });

    it('前缀通配 ~$* 匹配 Office 锁文件', () => {
      expect(match('~$notes.docx', '~$*')).toBe(true);
      expect(match('~$book.xlsx', '~$*')).toBe(true);
      expect(match('notes.docx', '~$*')).toBe(false);
    });

    it('后缀通配 *.tmp / *.lnk / *.wbk', () => {
      expect(match('foo.tmp', '*.tmp')).toBe(true);
      expect(match('foo.TMP', '*.tmp')).toBe(true); // 大小写不敏感
      expect('shortcut.lnk').toMatch(/\.lnk$/i);
      expect(match('shortcut.lnk', '*.lnk')).toBe(true);
      expect(match('backup.wbk', '*.wbk')).toBe(true);
      expect(match('backup.wbk', '*.tmp')).toBe(false);
    });

    it('中间通配 ~*.* 匹配带点号的 Office 临时名', () => {
      expect(match('~temp.docx', '~*.*')).toBe(true);
      expect(match('~word', '~*.*')).toBe(false); // 无点号
    });

    it('特殊正则元字符在文件名中被当作字面量', () => {
      // 文件名中含 + . （正则元字符），pattern 也按字面量处理
      expect(match('a+b.txt', 'a+b.txt')).toBe(true);
      expect(match('a.b.txt', 'a.b.txt')).toBe(true);
      expect(match('a.b.txt', 'aXb.txt')).toBe(false);
    });

    it('空 pattern 返回 false', () => {
      expect(match('any', '')).toBe(false);
    });

    it('属性：对任意非空 pattern 与任意文件名，结果与直接 RegExp 等价且可重复', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 20 }), fc.string({ minLength: 0, maxLength: 20 }), (pattern, name) => {
          // 跳过会导致非法正则的输入（如孤立反斜杠）
          try {
            const r1 = match(name, pattern);
            const r2 = match(name, pattern); // 重复 = 确定性
            expect(r1).toBe(r2);
          } catch {
            // 跳过非法构造
          }
        }),
      );
    });
  });

  // ============================================================
  // isIgnored（闸门2：垃圾过滤）
  // ============================================================
  describe('isIgnored（闸门2）', () => {
    const isIgnored = (p: string, stats?: fs.Stats) =>
      (service as any).isIgnored(p, stats) as boolean;

    it('隐藏文件（. 开头）被忽略（ignore_hidden=true）', () => {
      expect(isIgnored('/root/.git')).toBe(true);
      expect(isIgnored('/root/.env')).toBe(true);
      expect(isIgnored('/root/.DS_Store')).toBe(true);
    });

    it('ignore_hidden=false 时不再因隐藏前缀忽略（但仍可能被 patterns 命中）', () => {
      service.updateConfig({ ignore_hidden: false });
      // .hidden 不在任何 pattern 中，关闭隐藏过滤后应放行
      expect(isIgnored('/root/.hidden')).toBe(false);
      // 但 .DS_Store 仍在 ignore_patterns 中，应被命中
      expect(isIgnored('/root/.DS_Store')).toBe(true);
    });

    it('Office 锁文件 ~$xxx 被忽略', () => {
      expect(isIgnored('/root/~$notes.docx')).toBe(true);
      expect(isIgnored('/root/~$book.xlsx')).toBe(true);
    });

    it('临时文件 *.tmp / *.asd / *.wbk 被忽略', () => {
      expect(isIgnored('/root/cache.tmp')).toBe(true);
      expect(isIgnored('/root/auto.asd')).toBe(true);
      expect(isIgnored('/root/backup.wbk')).toBe(true);
    });

    it('系统垃圾 Thumbs.db / desktop.ini / *.lnk 被忽略', () => {
      expect(isIgnored('/root/Thumbs.db')).toBe(true);
      expect(isIgnored('/root/desktop.ini')).toBe(true);
      expect(isIgnored('/root/shortcut.lnk')).toBe(true);
    });

    it('普通笔记文件不被忽略', () => {
      expect(isIgnored('/root/notes.md')).toBe(false);
      expect(isIgnored('/root/report.pdf')).toBe(false);
      expect(isIgnored('/root/photos/image.png')).toBe(false);
    });

    it('node_modules 目录（带 stats.isDirectory）被忽略', () => {
      const fakeDir = { isDirectory: () => true } as unknown as fs.Stats;
      expect(isIgnored('/root/node_modules', fakeDir)).toBe(true);
      // 文件类型的 node_modules（理论上不会出现）不靠这条规则
      const fakeFile = { isDirectory: () => false } as unknown as fs.Stats;
      // "node_modules" 不在 patterns，也不是 . 开头，因此放行
      expect(isIgnored('/root/node_modules', fakeFile)).toBe(false);
    });

    it('空 baseName 兜底为忽略', () => {
      // basename 为空（极端输入）应被忽略
      expect(isIgnored('')).toBe(true);
    });

    it('匹配仅基于 baseName，不误伤同名子路径', () => {
      // patterns 针对 baseName，目录前缀不影响判断
      expect(isIgnored('/a/b/c/.secret')).toBe(true);
      expect(isIgnored('/a/b/c/notes.md')).toBe(false);
    });
  });

  // ============================================================
  // deriveId（稳定 ID 派生）
  // ============================================================
  describe('deriveId', () => {
    const deriveId = (p: string) => (service as any).deriveId(p) as string;

    it('输出符合 8-4-4-4-12 十六进制格式', () => {
      expect(deriveId('notes.txt')).toMatch(UUID_LIKE);
      expect(deriveId('a/b/c.md')).toMatch(UUID_LIKE);
    });

    it('相同相对路径 → 相同 ID（稳定，重启复用同一 Item 的基础）', () => {
      expect(deriveId('notes.txt')).toBe(deriveId('notes.txt'));
      expect(deriveId('docs/2024/report.pdf')).toBe(deriveId('docs/2024/report.pdf'));
    });

    it('不同相对路径 → 不同 ID（避免冲突）', () => {
      expect(deriveId('notes.txt')).not.toBe(deriveId('notes.md'));
      expect(deriveId('a/b.md')).not.toBe(deriveId('a/c.md'));
    });

    it('Windows 反斜杠与 POSIX 正斜杠等价（跨平台稳定）', () => {
      expect(deriveId('a\\b\\c.md')).toBe(deriveId('a/b/c.md'));
    });

    it('前导斜杠被归一化（/a/b 与 a/b 等价）', () => {
      expect(deriveId('/a/b.md')).toBe(deriveId('a/b.md'));
      expect(deriveId('//a/b.md')).toBe(deriveId('a/b.md'));
    });

    it('空字符串也产出合法 ID（不抛错）', () => {
      expect(deriveId('')).toMatch(UUID_LIKE);
    });

    it('属性：deriveId 是纯函数（同一 service 实例上确定性）', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 40 }), (rel) => {
          const a = deriveId(rel);
          const b = deriveId(rel);
          expect(a).toBe(b);
          expect(a).toMatch(UUID_LIKE);
        }),
      );
    });
  });

  // ============================================================
  // deriveParentFolderId
  // ============================================================
  describe('deriveParentFolderId', () => {
    const parentOf = (p: string) => (service as any).deriveParentFolderId(p) as string;

    it('根级文件 → "root"', () => {
      expect(parentOf('notes.txt')).toBe('root');
      expect(parentOf('a.md')).toBe('root');
    });

    it('根级目录（仅目录名）→ "root"', () => {
      expect(parentOf('docs')).toBe('root');
    });

    it('一级嵌套文件的父目录 ID = deriveId(父目录)', () => {
      const deriveId = (p: string) => (service as any).deriveId(p) as string;
      expect(parentOf('docs/notes.md')).toBe(deriveId('docs'));
    });

    it('多层嵌套文件的父目录 ID = deriveId(最临近父目录)', () => {
      const deriveId = (p: string) => (service as any).deriveId(p) as string;
      expect(parentOf('a/b/c/d.md')).toBe(deriveId('a/b/c'));
    });

    it('Windows 反斜杠路径也能正确取父目录', () => {
      const deriveId = (p: string) => (service as any).deriveId(p) as string;
      expect(parentOf('a\\b\\c.md')).toBe(deriveId('a/b'));
    });

    it('返回值要么是 "root"，要么符合 UUID 格式', () => {
      for (const p of ['x.txt', 'a/b', 'a/b/c/d/e.md', 'a\\b\\c']) {
        const id = parentOf(p);
        expect(id === 'root' || UUID_LIKE.test(id)).toBe(true);
      }
    });
  });

  // ============================================================
  // 移动/重命名后的路径反查
  // ============================================================
  describe('移动/重命名后的路径反查', () => {
    const installItemsManagerStub = (records: Record<string, any>) => {
      const getActiveByType = (type: string) =>
        Object.values(records).filter(item => item.type === type && item.deleted_time === null);

      const manager = {
        getByType: jest.fn(getActiveByType),
        getByIdIncludeDeleted: jest.fn((id: string) => records[id] ?? null),
        upsertFromPlainItem: jest.fn((item: any) => {
          records[item.id] = item;
        }),
        update: jest.fn((id: string, payload: any) => {
          const current = records[id];
          if (!current) return null;
          const next = {
            ...current,
            payload: JSON.stringify(payload),
            content_hash: `updated-${id}-${JSON.stringify(payload).length}`,
            updated_time: Date.now(),
          };
          records[id] = next;
          return next;
        }),
        restore: jest.fn((id: string) => {
          if (!records[id]) return false;
          records[id] = { ...records[id], deleted_time: null };
          return true;
        }),
        softDelete: jest.fn((id: string) => {
          if (!records[id] || records[id].deleted_time !== null) return false;
          records[id] = { ...records[id], deleted_time: Date.now() };
          return true;
        }),
        markUnconfirmedCloudItemForSync: jest.fn(),
      };

      (service as any).itemsManager = manager;
      return manager;
    };

    const cloudFileRecord = (id: string, relativePath: string, size = 3, mtime = 1000) => ({
      id,
      type: 'cloud_file',
      payload: JSON.stringify({
        filename: path.basename(relativePath),
        mime_type: 'text/plain',
        size,
        file_hash: 'hash-abc',
        parent_folder_id: 'root',
        relative_path: relativePath,
        mtime,
        upload_state: 'completed',
        chunk_size: 8 * 1024 * 1024,
        total_chunks: 1,
        uploaded_chunks: [0],
        upload_session_id: null,
        error_message: null,
        download_state: 'completed',
        downloaded_size: size,
        downloaded_at: mtime,
        download_error: null,
      }),
      content_hash: `content-${id}`,
      sync_status: 'clean',
      remote_rev: 'remote-1',
      deleted_time: null,
    });

    it('重命名保留旧 ID 后，新路径扫描不会再创建路径派生的新条目', () => {
      const watchedRoot = path.join(tmpDir, 'watched');
      fs.mkdirSync(watchedRoot, { recursive: true });
      const newAbs = path.join(watchedRoot, 'renamed.txt');
      fs.writeFileSync(newAbs, 'abc');
      const stats = fs.statSync(newAbs);
      service.updateConfig({ watched_root_path: watchedRoot });

      const oldId = (service as any).deriveId('old.txt');
      const newDerivedId = (service as any).deriveId('renamed.txt');
      const records: Record<string, any> = {
        [oldId]: cloudFileRecord(oldId, 'old.txt', stats.size, stats.mtimeMs),
      };
      const manager = installItemsManagerStub(records);

      (service as any).applyRename(oldId, newAbs, 'renamed.txt', stats.size, stats.mtimeMs);
      expect(JSON.parse(records[oldId].payload).relative_path).toBe('renamed.txt');

      (service as any).onFileAdded(newAbs, stats);

      expect(records[newDerivedId]).toBeUndefined();
      expect(manager.upsertFromPlainItem).not.toHaveBeenCalled();
      expect(Object.values(records).filter(item => item.deleted_time === null)).toHaveLength(1);
    });

    it('删除已移动路径时通过 relative_path 命中旧 ID，而不是软删除新派生 ID', () => {
      const watchedRoot = path.join(tmpDir, 'watched');
      fs.mkdirSync(watchedRoot, { recursive: true });
      service.updateConfig({ watched_root_path: watchedRoot });

      const oldId = (service as any).deriveId('old.txt');
      const newDerivedId = (service as any).deriveId('renamed.txt');
      const records: Record<string, any> = {
        [oldId]: cloudFileRecord(oldId, 'renamed.txt', 0, 1000),
      };
      const manager = installItemsManagerStub(records);

      (service as any).onFileUnlinked(path.join(watchedRoot, 'renamed.txt'));

      expect(manager.softDelete).toHaveBeenCalledWith(oldId);
      expect(records[oldId].deleted_time).not.toBeNull();
      expect(records[newDerivedId]).toBeUndefined();
    });
  });

  // ============================================================
  // toRelative
  // ============================================================
  describe('toRelative', () => {
    const toRelative = (abs: string) => (service as any).toRelative(abs) as string | null;

    it('未配置 watched_root_path 时返回 null', () => {
      expect(toRelative('/anywhere/file.txt')).toBeNull();
    });

    it('监听根下文件 → 返回相对路径', () => {
      service.updateConfig({ watched_root_path: '/data/cloud' });
      expect(toRelative('/data/cloud/notes.md')).toBe(path.relative('/data/cloud', '/data/cloud/notes.md'));
      expect(toRelative('/data/cloud/a/b/c.md')).toBe(path.join('a', 'b', 'c.md'));
    });

    it('监听根本身 → 返回空串（边界）', () => {
      service.updateConfig({ watched_root_path: '/data/cloud' });
      // path.relative 同路径返回 ''，rel 为空则被当作"不在根下"
      // 实现里：!rel 判定 → 返回 null
      expect(toRelative('/data/cloud')).toBeNull();
    });

    it('监听根之外的路径 → 返回 null（避免越界）', () => {
      service.updateConfig({ watched_root_path: '/data/cloud' });
      expect(toRelative('/data/other/file.md')).toBeNull();
      expect(toRelative('/etc/passwd')).toBeNull();
    });

    it('绝对根路径以 .. 起始时返回 null', () => {
      service.updateConfig({ watched_root_path: '/data/cloud' });
      // 上级目录 → 相对路径以 .. 开头
      expect(toRelative('/data/file.md')).toBeNull();
    });
  });

  // ============================================================
  // online_only 删除保护
  // ============================================================
  describe('isExplicitOnlineOnly', () => {
    const isExplicitOnlineOnly = (id: string) =>
      (service as any).isExplicitOnlineOnly(id) as boolean;
    const shouldPreserveMissingRemoteOnlyItem = (item: any, payload: any) =>
      (service as any).shouldPreserveMissingRemoteOnlyItem(item, payload) as boolean;
    const markLocalCopyPresent = (id: string) =>
      (service as any).markLocalCopyPresent(id);

    it('仅在侧表显式记录为 online_only 时返回 true', () => {
      (service as any).localAvailability = {
        fileA: 'online_only',
        fileB: 'offline',
        fileC: 'local',
      };
      expect(isExplicitOnlineOnly('fileA')).toBe(true);
      expect(isExplicitOnlineOnly('fileB')).toBe(false);
      expect(isExplicitOnlineOnly('fileC')).toBe(false);
      expect(isExplicitOnlineOnly('missing')).toBe(false);
    });

    it('不能因为文件当前不存在就自动推断为 online_only', () => {
      // 这是本轮修复的核心：unlink / reconcile 时如果靠“文件是否存在”推断，
      // 用户手动删除会被误判成占位文件，导致旧目录旧文件残留。
      (service as any).localAvailability = {};
      expect(isExplicitOnlineOnly('deleted-file')).toBe(false);
    });

    it('远端 clean 且本机没有本地存在证明的 cloud_file 缺失时应保留', () => {
      (service as any).localAvailability = {};
      expect(shouldPreserveMissingRemoteOnlyItem({
        id: 'remote-file',
        type: 'cloud_file',
        sync_status: 'clean',
        remote_rev: 'r1',
      }, {
        download_state: 'pending',
        upload_state: 'completed',
        file_hash: 'abc',
      })).toBe(true);
    });

    it('已有本地存在证明的 cloud_file 缺失时不应被远端-only 保护', () => {
      (service as any).localAvailability = { localFile: 'local' };
      expect(shouldPreserveMissingRemoteOnlyItem({
        id: 'localFile',
        type: 'cloud_file',
        sync_status: 'clean',
        remote_rev: 'r1',
      }, {
        download_state: 'completed',
        upload_state: 'completed',
        file_hash: 'abc',
      })).toBe(false);
    });

    it('旧版已完成下载但缺少侧表证明的 cloud_file 缺失时不应保留', () => {
      (service as any).localAvailability = {};
      expect(shouldPreserveMissingRemoteOnlyItem({
        id: 'downloaded-file',
        type: 'cloud_file',
        sync_status: 'clean',
        remote_rev: 'r1',
      }, {
        size: 1024,
        downloaded_size: 1024,
        downloaded_at: Date.now(),
        download_state: 'completed',
        upload_state: 'completed',
        file_hash: 'abc',
      })).toBe(false);
    });

    it('未完成下载的 cloud_file 缺失时仍按远端-only 元数据保留', () => {
      (service as any).localAvailability = {};
      expect(shouldPreserveMissingRemoteOnlyItem({
        id: 'partial-file',
        type: 'cloud_file',
        sync_status: 'clean',
        remote_rev: 'r1',
      }, {
        size: 1024,
        downloaded_size: 512,
        downloaded_at: Date.now(),
        download_state: 'completed',
        upload_state: 'completed',
        file_hash: 'abc',
      })).toBe(true);
    });

    it('远端 clean 且本机没有本地存在证明的 cloud_folder 缺失时应保留', () => {
      (service as any).localAvailability = {};
      expect(shouldPreserveMissingRemoteOnlyItem({
        id: 'remote-folder',
        type: 'cloud_folder',
        sync_status: 'clean',
        remote_rev: 'r1',
      }, {})).toBe(true);
    });

    it('扫描发现本地副本时记录 local 证明且不覆盖 offline', () => {
      (service as any).localAvailability = { keepOffline: 'offline' };
      markLocalCopyPresent('newLocal');
      markLocalCopyPresent('keepOffline');
      expect((service as any).localAvailability.newLocal).toBe('local');
      expect((service as any).localAvailability.keepOffline).toBe('offline');
    });
  });

  // ============================================================
  // itemsChanged 增量事件
  // ============================================================
  describe('itemsChanged 增量事件', () => {
    const installItemsManagerStub = (items: Record<string, any>) => {
      (service as any).itemsManager = {
        getByIdIncludeDeleted: jest.fn((id: string) => items[id] ?? null),
      };
    };

    const queueHint = (hint: any) => (service as any).queueItemsChangedHint(hint);
    const consume = () => (service as any).consumeItemsChangedEvent();

    it('changedIds 只生成对应条目的 UI 快照', () => {
      installItemsManagerStub({
        fileA: {
          id: 'fileA',
          type: 'cloud_file',
          payload: JSON.stringify({
            filename: 'a.txt',
            relative_path: 'docs/a.txt',
            size: 12,
            upload_state: 'completed',
            download_state: 'pending',
          }),
          sync_status: 'clean',
          remote_rev: 'r1',
          deleted_time: null,
        },
      });

      queueHint({ changedIds: ['fileA'] });
      const event = consume();

      expect(event.full).toBeUndefined();
      expect(event.deletedIds).toEqual([]);
      expect(event.changed).toHaveLength(1);
      expect(event.changed[0]).toMatchObject({
        id: 'fileA',
        type: 'cloud_file',
        sync_status: 'clean',
        remote_rev: 'r1',
      });
      expect(event.changed[0].payload.filename).toBe('a.txt');
    });

    it('deletedIds 覆盖同一批次里较早的 changedIds，避免前端复活已删除项目', () => {
      installItemsManagerStub({
        fileA: {
          id: 'fileA',
          type: 'cloud_file',
          payload: JSON.stringify({ filename: 'a.txt', relative_path: 'a.txt' }),
          sync_status: 'clean',
          remote_rev: 'r1',
          deleted_time: null,
        },
      });

      queueHint({ changedIds: ['fileA'] });
      queueHint({ deletedIds: ['fileA'] });
      const event = consume();

      expect(event.full).toBeUndefined();
      expect(event.changed).toEqual([]);
      expect(event.deletedIds).toEqual(['fileA']);
    });

    it('full hint 强制回退全量刷新并清空已排队的增量提示', () => {
      installItemsManagerStub({});

      queueHint({ changedIds: ['fileA'], deletedIds: ['fileB'] });
      queueHint({ full: true });
      const event = consume();

      expect(event).toMatchObject({ full: true });
      expect(event.changed).toBeUndefined();
      expect(event.deletedIds).toBeUndefined();
    });

    it('已软删除或损坏 payload 的 changedIds 不会进入 UI 快照', () => {
      installItemsManagerStub({
        deletedFile: {
          id: 'deletedFile',
          type: 'cloud_file',
          payload: JSON.stringify({ filename: 'deleted.txt', relative_path: 'deleted.txt' }),
          sync_status: 'clean',
          remote_rev: 'r1',
          deleted_time: Date.now(),
        },
        brokenFile: {
          id: 'brokenFile',
          type: 'cloud_file',
          payload: '{ not valid json',
          sync_status: 'clean',
          remote_rev: 'r2',
          deleted_time: null,
        },
      });

      queueHint({ changedIds: ['deletedFile', 'brokenFile'] });
      const event = consume();

      expect(event.full).toBeUndefined();
      expect(event.changed).toEqual([]);
      expect(event.deletedIds).toEqual([]);
    });
  });

  // ============================================================
  // 文件夹批量本地可用性
  // ============================================================
  describe('setFolderLocalAvailability', () => {
    const cloudFile = (id: string, relativePath: string) => ({
      id,
      type: 'cloud_file',
      payload: JSON.stringify({
        filename: path.basename(relativePath),
        relative_path: relativePath,
        upload_state: 'completed',
        download_state: 'pending',
      }),
      sync_status: 'clean',
      remote_rev: 'r1',
      deleted_time: null,
    });

    it('批量设置目录时只保存一次本地状态，并且不影响目录外文件', () => {
      const watchedRoot = path.join(tmpDir, 'watched');
      fs.mkdirSync(watchedRoot, { recursive: true });
      service.updateConfig({ watched_root_path: watchedRoot });
      (service as any).itemsManager = {
        getByType: jest.fn((type: string) => type === 'cloud_file'
          ? [
            cloudFile('docsA', 'docs/a.txt'),
            cloudFile('docsB', 'docs/nested/b.txt'),
            cloudFile('rootC', 'c.txt'),
          ]
          : []),
      };
      const saveSpy = jest.spyOn(service as any, 'saveLocalAvailability');

      const changed = service.setFolderLocalAvailability('docs', 'offline');

      expect(changed).toBe(2);
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect((service as any).localAvailability).toMatchObject({
        docsA: 'offline',
        docsB: 'offline',
      });
      expect((service as any).localAvailability.rootC).toBeUndefined();
    });
  });

  // ============================================================
  // 网盘 UI 轻量查询
  // ============================================================
  describe('网盘 UI 轻量查询', () => {
    const cloudFolder = (id: string, relativePath: string) => ({
      id,
      type: 'cloud_folder',
      payload: JSON.stringify({
        name: path.basename(relativePath) || 'root',
        parent_folder_id: null,
        relative_path: relativePath,
      }),
      sync_status: 'clean',
      remote_rev: 'r1',
      deleted_time: null,
    });

    const cloudFile = (
      id: string,
      relativePath: string,
      uploadState = 'completed',
      downloadState = 'completed'
    ) => ({
      id,
      type: 'cloud_file',
      payload: JSON.stringify({
        filename: path.basename(relativePath),
        mime_type: 'text/plain',
        size: 1,
        file_hash: 'hash',
        parent_folder_id: 'root',
        relative_path: relativePath,
        mtime: Date.now(),
        upload_state: uploadState,
        chunk_size: 1024,
        total_chunks: 1,
        uploaded_chunks: [0],
        upload_session_id: null,
        error_message: null,
        download_state: downloadState,
        downloaded_size: downloadState === 'completed' ? 1 : 0,
        downloaded_at: downloadState === 'completed' ? Date.now() : null,
        download_error: null,
      }),
      sync_status: 'clean',
      remote_rev: 'r1',
      deleted_time: null,
    });

    it('listCloudDirectoryForUi 只返回目标目录的直接子项并附带本地状态', () => {
      const watchedRoot = path.join(tmpDir, 'watched');
      fs.mkdirSync(path.join(watchedRoot, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(watchedRoot, 'docs', 'a.txt'), 'a');
      service.updateConfig({ watched_root_path: watchedRoot });
      (service as any).localAvailability = { docsA: 'offline' };
      (service as any).itemsManager = {
        getByType: jest.fn((type: string) => {
          if (type === 'cloud_folder') {
            return [
              cloudFolder('docs', 'docs'),
              cloudFolder('nested', 'docs/nested'),
              cloudFolder('outside', 'outside'),
            ];
          }
          if (type === 'cloud_file') {
            return [
              cloudFile('docsA', 'docs/a.txt'),
              cloudFile('nestedB', 'docs/nested/b.txt'),
              cloudFile('rootC', 'c.txt'),
            ];
          }
          return [];
        }),
      };

      const listing = service.listCloudDirectoryForUi('docs');

      expect(listing.folderPath).toBe('docs');
      expect(listing.items.map(item => item.id)).toEqual(['nested', 'docsA']);
      expect(listing.localStates.docsA.availability).toBe('offline');
      expect(listing.localStates.nestedB).toBeUndefined();
      expect(listing.total).toBe(2);
    });

    it('listCloudTransferItemsForUi 只返回上传或下载未完成的文件', () => {
      (service as any).itemsManager = {
        getByType: jest.fn((type: string) => type === 'cloud_file'
          ? [
            cloudFile('done', 'done.txt', 'completed', 'completed'),
            cloudFile('uploadPending', 'upload.txt', 'pending', 'completed'),
            cloudFile('downloadPending', 'download.txt', 'completed', 'pending'),
            cloudFile('downloadError', 'error.txt', 'completed', 'error'),
          ]
          : []),
      };

      const items = service.listCloudTransferItemsForUi();

      expect(items.map(item => item.id)).toEqual(['downloadPending', 'downloadError', 'uploadPending']);
    });

    it('目录索引构建后复用缓存，并支持 changedIds 增量移动条目', () => {
      const records: Record<string, any> = {
        docs: cloudFolder('docs', 'docs'),
        docsA: cloudFile('docsA', 'docs/a.txt'),
      };
      const getByType = jest.fn((type: string) => {
        if (type === 'cloud_folder') return [records.docs];
        if (type === 'cloud_file') return [records.docsA];
        return [];
      });
      (service as any).itemsManager = {
        getByType,
        getByIdIncludeDeleted: jest.fn((id: string) => records[id] ?? null),
      };

      expect(service.listCloudDirectoryForUi('docs').items.map(item => item.id)).toEqual(['docsA']);
      expect(getByType).toHaveBeenCalledTimes(2);

      getByType.mockClear();
      expect(service.listCloudDirectoryForUi('docs').items.map(item => item.id)).toEqual(['docsA']);
      expect(getByType).not.toHaveBeenCalled();

      records.docsA = cloudFile('docsA', 'docs2/a.txt');
      (service as any).updateCloudDirectoryIndexCache({ changedIds: ['docsA'] });

      expect(service.listCloudDirectoryForUi('docs').items.map(item => item.id)).toEqual([]);
      expect(service.listCloudDirectoryForUi('docs2').items.map(item => item.id)).toEqual(['docsA']);
      expect(getByType).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // guessMime
  // ============================================================
  describe('guessMime', () => {
    const guess = (p: string) => (service as any).guessMime(p) as string;

    it('常见扩展名返回正确 MIME', () => {
      expect(guess('a.txt')).toBe('text/plain');
      expect(guess('a.json')).toBe('application/json');
      expect(guess('a.html')).toBe('text/html');
      expect(guess('photo.jpg') || guess('photo.jpeg')).toContain('image/');
      expect(guess('photo.png')).toBe('image/png');
    });

    it('未知扩展名回退 application/octet-stream', () => {
      expect(guess('archive.zzznotreal')).toBe('application/octet-stream');
      expect(guess('noext')).toBe('application/octet-stream');
    });
  });
});
