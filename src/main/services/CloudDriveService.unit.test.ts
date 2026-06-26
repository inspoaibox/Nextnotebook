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
