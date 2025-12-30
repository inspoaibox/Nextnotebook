import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { ALL_SCHEMAS, SCHEMA_VERSION } from './schema';

export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(userDataPath: string) {
    this.dbPath = path.join(userDataPath, 'mucheng-notes.db');
  }

  initialize(): void {
    // 确保目录存在
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.initializeSchema();
  }

  private initializeSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    // 检查 schema 版本
    const versionTable = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
      .get();

    if (!versionTable) {
      // 首次初始化，执行所有 schema
      this.db.transaction(() => {
        for (const sql of ALL_SCHEMAS) {
          this.db!.exec(sql);
        }
        this.db!.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
          SCHEMA_VERSION,
          Date.now()
        );
      })();
    } else {
      // 检查是否需要升级
      const currentVersion = this.db
        .prepare('SELECT MAX(version) as version FROM schema_version')
        .get() as { version: number } | undefined;

      if (!currentVersion || currentVersion.version < SCHEMA_VERSION) {
        this.migrateSchema(currentVersion?.version || 0);
      }
    }
  }

  private migrateSchema(fromVersion: number): void {
    // 预留 schema 升级逻辑
    console.log(`Migrating schema from version ${fromVersion} to ${SCHEMA_VERSION}`);
    // 根据版本号执行相应的迁移脚本
  }

  getDatabase(): Database.Database {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // 通用查询方法
  query<T>(sql: string, params: unknown[] = []): T[] {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare(sql).all(...params) as T[];
  }

  run(sql: string, params: unknown[] = []): Database.RunResult {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare(sql).run(...params);
  }

  get<T>(sql: string, params: unknown[] = []): T | undefined {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  // 事务支持
  transaction<T>(fn: () => T): T {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.transaction(fn)();
  }
}

export default DatabaseManager;
