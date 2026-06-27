/**
 * 分块上传端点 HTTP 集成测试。
 *
 * 覆盖 sync-server 的 5 个端点（均挂载在 /api/resources）：
 *   POST   /upload                       创建上传会话
 *   PUT    /upload/:sessionId/chunk      上传单个分块
 *   POST   /upload/:sessionId/complete   完成上传（拼接 + sha256）
 *   GET    /upload/:sessionId/status     查询进度（断点续传）
 *   DELETE /upload/:sessionId            中止上传
 *
 * 隔离策略：
 * - 所有 env 变量（DB 路径 / 上传临时目录 / 资源目录 / JWT 密钥）必须先于 config.ts 被引用。
 *   本文件在导入任何 sync-server 模块之前，先在 process.env 上写入指向临时目录的路径。
 * - 每个 describe 用一个独立子目录；closeDatabase() 在 afterAll/afterEach 关闭句柄。
 * - 模块级 `sessions` Map 会跨请求累积——每个测试用唯一的 item_id / 新会话，互不干扰。
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import type { Express } from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// 临时根目录：所有测试在此下面创建独立子目录，结束统一清理
// ---------------------------------------------------------------------------
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-up-it-'));

// JWT_SECRET / JWT_REFRESH_SECRET 必须 >= 32 字符（见 config.ts getRequiredSecret）
const FIXED_JWT_SECRET = 'integration-test-jwt-secret-aaaaaaaaaaaaaaaa';
const FIXED_JWT_REFRESH_SECRET = 'integration-test-jwt-refresh-secret-aaaaaaaaaa';

/**
 * 把 env 变量写到指定测试子目录，**且必须在 import app 之前调用**。
 * config.ts 在模块加载时读取 process.env，所以晚于 config.ts 的 env 修改无效。
 */
function applyEnvForTest(testDir: string): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = path.join(testDir, 'sync.db');
  process.env.RESOURCES_PATH = path.join(testDir, 'resources');
  process.env.UPLOAD_TEMP_PATH = path.join(testDir, 'uploads');
  process.env.JWT_SECRET = FIXED_JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = FIXED_JWT_REFRESH_SECRET;
  // 拆小硬上限以便用例能在不构造超大 Buffer 的情况下触发 413
  process.env.MAX_CHUNKED_UPLOAD_SIZE = '1048576'; // 1MB
  process.env.MAX_UPLOAD_CHUNK_SIZE = '262144'; // 256KB（单块硬上限）
  process.env.LEGACY_API_KEY_AUTH_ENABLED = 'false';
  process.env.API_RATE_LIMIT = '100000';
  process.env.SYNC_RATE_LIMIT = '100000';
}

// 第一个 describe 共用的环境 —— 在文件顶层应用，使 config.ts 首次加载即拿到正确路径。
applyEnvForTest(path.join(TMP_ROOT, 'main'));

// 现在才引入 app / db / 服务。此时 config 已经读到上面写入的 env。
// 用 require + jest 内的 ts-jest 编译。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app: Express = require('../../../sync-server/src/app').default as Express;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDatabase, closeDatabase } = require('../../../sync-server/src/database');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { tokenService } = require('../../../sync-server/src/services/TokenService');

// ---------------------------------------------------------------------------
// 工具：种子数据
// ---------------------------------------------------------------------------
const TEST_USER_ID = 'user-it-001';
const TEST_USERNAME = 'integration-tester';
const TEST_PASSWORD_HASH = '$2b$10$abcdefghijklmnopqrstuv'; // 占位哈希，登录不走此路径
const TEST_SYNC_KEY_FP = 'fp-it-001';

const USER_ID_OTHER = 'user-it-other';

function seedUser(userId: string, username: string): void {
  const db = getDatabase();
  const now = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO users
       (id, username, password_hash, sync_key_fingerprint, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'user', 'active', ?, ?)`
  ).run(userId, username, TEST_PASSWORD_HASH, `${TEST_SYNC_KEY_FP}-${userId}`, now, now);
}

function seedCloudFileItem(itemId: string, userId: string): void {
  const db = getDatabase();
  const now = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO items
       (id, type, payload, content_hash, remote_rev, deleted_time, created_time, updated_time,
        sync_status, local_rev, encryption_applied, schema_version, user_id)
     VALUES (?, 'cloud_file', '{}', ?, NULL, NULL, ?, ?, 'dirty', 0, 0, 4, ?)`
  ).run(itemId, crypto.createHash('sha256').update(itemId).digest('hex'), now, now, userId);
}

interface MintedToken {
  accessToken: string;
  userId: string;
}

function mintToken(userId: string): MintedToken {
  const pair = tokenService.generateTokenPair(
    `${TEST_SYNC_KEY_FP}-${userId}`,
    `${TEST_SYNC_KEY_FP}-${userId}`,
    'user',
    'integration-test',
    '127.0.0.1'
  );
  return { accessToken: pair.accessToken, userId };
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** 构造一段确定性的二进制 payload（按 seed 可复现）。 */
function makePayload(seed: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    buf[i] = (seed + i * 31) & 0xff;
  }
  return buf;
}

/** 计算多个分块拼接后的 sha256，用于校验 complete 返回值。 */
function sha256OfChunks(chunks: Buffer[]): string {
  const h = crypto.createHash('sha256');
  for (const c of chunks) h.update(c);
  return h.digest('hex');
}

// ===========================================================================
// describe 1：成功路径——创建会话 → 多分块上传 → 状态查询 → 完成 → 校验 sha256
// ===========================================================================
describe('POST /upload + PUT /chunk + GET /status + POST /complete 全链路', () => {
  const ITEM_ID = 'cf-fullchain-0001';
  let token: MintedToken;

  beforeAll(() => {
    seedUser(TEST_USER_ID, TEST_USERNAME);
    seedCloudFileItem(ITEM_ID, TEST_USER_ID);
    token = mintToken(TEST_USER_ID);
  });

  afterAll(() => {
    closeDatabase();
  });

  it('创建会话返回 total_chunks 与空 uploaded_chunks', async () => {
    const res = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(token.accessToken))
      .send({ item_id: ITEM_ID, total_size: 600, chunk_size: 256, extension: '.bin' });

    expect(res.status).toBe(200);
    expect(res.body.session_id).toMatch(/^[0-9a-f]{32}$/);
    // Math.ceil(600 / 256) = 3
    expect(res.body.total_chunks).toBe(3);
    expect(res.body.chunk_size).toBe(256);
    expect(res.body.uploaded_chunks).toEqual([]);
  });

  it('完整上传 3 个分块后 complete 返回正确 sha256 与 size', async () => {
    // 1. 创建会话
    const create = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(token.accessToken))
      .send({ item_id: ITEM_ID, total_size: 600, chunk_size: 256, extension: '.bin' });
    expect(create.status).toBe(200);
    const sessionId = create.body.session_id as string;

    // 2. 生成 3 个分块：256 + 256 + 88 = 600
    const chunk0 = makePayload(1, 256);
    const chunk1 = makePayload(2, 256);
    const chunk2 = makePayload(3, 88); // 末块不足 256
    const chunks = [chunk0, chunk1, chunk2];

    // 3. 逐块上传
    for (let i = 0; i < chunks.length; i++) {
      const put = await request(app)
        .put(`/api/resources/upload/${sessionId}/chunk`)
        .set(authHeader(token.accessToken))
        .set('X-Chunk-Index', String(i))
        .set('Content-Type', 'application/octet-stream')
        .send(chunks[i]);
      expect(put.status).toBe(200);
      expect(put.body.accepted).toBe(true);
      expect(put.body.duplicate).toBe(false);
    }

    // 4. 状态查询：3/3 completed
    const status = await request(app)
      .get(`/api/resources/upload/${sessionId}/status`)
      .set(authHeader(token.accessToken));
    expect(status.status).toBe(200);
    expect(status.body.total_chunks).toBe(3);
    expect(status.body.uploaded_chunks).toEqual([0, 1, 2]);
    expect(status.body.completed).toBe(true);

    // 5. 完成
    const complete = await request(app)
      .post(`/api/resources/upload/${sessionId}/complete`)
      .set(authHeader(token.accessToken));
    expect(complete.status).toBe(200);
    expect(complete.body.success).toBe(true);
    expect(complete.body.item_id).toBe(ITEM_ID);
    expect(complete.body.size).toBe(600);
    expect(complete.body.sha256).toBe(sha256OfChunks(chunks));
    expect(complete.body.location).toBe(`${ITEM_ID}.bin`);

    const probe = await request(app)
      .get(`/api/resources/${ITEM_ID}`)
      .set(authHeader(token.accessToken))
      .set('Range', 'bytes=0-0');
    expect(probe.status).toBe(206);
    expect(probe.headers['content-range']).toBe('bytes 0-0/600');
    expect(probe.headers['content-type']).toContain('application/octet-stream');
  });

  it('重复上传同一分块返回 duplicate=true（幂等）', async () => {
    const create = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(token.accessToken))
      .send({ item_id: ITEM_ID, total_size: 64, chunk_size: 64 });
    expect(create.status).toBe(200);
    const sessionId = create.body.session_id as string;

    const chunk = makePayload(7, 64);
    const first = await request(app)
      .put(`/api/resources/upload/${sessionId}/chunk`)
      .set(authHeader(token.accessToken))
      .set('X-Chunk-Index', '0')
      .send(chunk);
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);

    const second = await request(app)
      .put(`/api/resources/upload/${sessionId}/chunk`)
      .set(authHeader(token.accessToken))
      .set('X-Chunk-Index', '0')
      .send(chunk);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.accepted).toBe(true);
  });
});

// ===========================================================================
// describe 2：断点续传 / 部分上传 → complete 应 409 INCOMPLETE
// ===========================================================================
describe('GET /status 断点续传 + POST /complete 未完成应 409', () => {
  const ITEM_ID = 'cf-resume-0002';
  let token: MintedToken;

  beforeAll(() => {
    seedUser(USER_ID_OTHER, 'other-user');
    seedCloudFileItem(ITEM_ID, USER_ID_OTHER);
    token = mintToken(USER_ID_OTHER);
  });

  afterAll(() => {
    closeDatabase();
  });

  it('上传 1/3 后 status 显示 completed=false；complete 返回 409 INCOMPLETE', async () => {
    const create = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(token.accessToken))
      .send({ item_id: ITEM_ID, total_size: 300, chunk_size: 100 });
    expect(create.status).toBe(200);
    expect(create.body.total_chunks).toBe(3);
    const sessionId = create.body.session_id as string;

    // 仅上传 index=1（乱序，验证 status 排序）
    const put = await request(app)
      .put(`/api/resources/upload/${sessionId}/chunk`)
      .set(authHeader(token.accessToken))
      .set('X-Chunk-Index', '1')
      .send(makePayload(11, 100));
    expect(put.status).toBe(200);

    const status = await request(app)
      .get(`/api/resources/upload/${sessionId}/status`)
      .set(authHeader(token.accessToken));
    expect(status.status).toBe(200);
    expect(status.body.uploaded_chunks).toEqual([1]); // 单元素也算升序
    expect(status.body.completed).toBe(false);

    const complete = await request(app)
      .post(`/api/resources/upload/${sessionId}/complete`)
      .set(authHeader(token.accessToken));
    expect(complete.status).toBe(409);
    expect(complete.body.error.code).toBe('INCOMPLETE');
  });

  it('乱序补齐剩余分块后 status 升序返回 [0,1,2]', async () => {
    const create = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(token.accessToken))
      .send({ item_id: ITEM_ID, total_size: 300, chunk_size: 100 });
    const sessionId = create.body.session_id as string;

    // 故意按 2,0,1 顺序上传
    for (const idx of [2, 0, 1]) {
      const put = await request(app)
        .put(`/api/resources/upload/${sessionId}/chunk`)
        .set(authHeader(token.accessToken))
        .set('X-Chunk-Index', String(idx))
        .send(makePayload(idx + 20, 100));
      expect(put.status).toBe(200);
    }

    const status = await request(app)
      .get(`/api/resources/upload/${sessionId}/status`)
      .set(authHeader(token.accessToken));
    expect(status.body.uploaded_chunks).toEqual([0, 1, 2]);
    expect(status.body.completed).toBe(true);
  });
});

// ===========================================================================
// describe 3：DELETE 中止上传
// ===========================================================================
describe('DELETE /upload/:sessionId 中止会话', () => {
  const ITEM_ID = 'cf-abort-0003';
  let token: MintedToken;

  beforeAll(() => {
    seedUser(TEST_USER_ID, TEST_USERNAME + '-abort');
    seedCloudFileItem(ITEM_ID, TEST_USER_ID);
    token = mintToken(TEST_USER_ID);
  });

  afterAll(() => {
    closeDatabase();
  });

  it('中止后该会话不再可用（status 返回 404）', async () => {
    const create = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(token.accessToken))
      .send({ item_id: ITEM_ID, total_size: 50, chunk_size: 50 });
    const sessionId = create.body.session_id as string;

    const del = await request(app)
      .delete(`/api/resources/upload/${sessionId}`)
      .set(authHeader(token.accessToken));
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);

    const status = await request(app)
      .get(`/api/resources/upload/${sessionId}/status`)
      .set(authHeader(token.accessToken));
    expect(status.status).toBe(404);
  });
});

// ===========================================================================
// describe 4：鉴权与归属校验
// ===========================================================================
describe('鉴权 / 归属校验', () => {
  const ITEM_ID_OWNED = 'cf-auth-owned-0004';
  const ITEM_ID_FOREIGN = 'cf-auth-foreign-0005';
  let ownerToken: MintedToken;
  let otherToken: MintedToken;

  beforeAll(() => {
    seedUser(TEST_USER_ID, TEST_USERNAME + '-auth-a');
    seedUser(USER_ID_OTHER, TEST_USERNAME + '-auth-b');
    seedCloudFileItem(ITEM_ID_OWNED, TEST_USER_ID);
    seedCloudFileItem(ITEM_ID_FOREIGN, USER_ID_OTHER);
    ownerToken = mintToken(TEST_USER_ID);
    otherToken = mintToken(USER_ID_OTHER);
  });

  afterAll(() => {
    closeDatabase();
  });

  it('无 Authorization 头 → 401', async () => {
    const res = await request(app)
      .post('/api/resources/upload')
      .send({ item_id: ITEM_ID_OWNED, total_size: 10, chunk_size: 10 });
    expect(res.status).toBe(401);
  });

  it('Bearer 为无效 JWT → 401', async () => {
    const res = await request(app)
      .post('/api/resources/upload')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .send({ item_id: ITEM_ID_OWNED, total_size: 10, chunk_size: 10 });
    expect(res.status).toBe(401);
  });

  it('上传他人 item → 404（canAccessItem 校验归属）', async () => {
    const res = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(ownerToken.accessToken))
      .send({ item_id: ITEM_ID_FOREIGN, total_size: 10, chunk_size: 10 });
    expect(res.status).toBe(404);
  });

  it('创建会话后由另一用户 PUT 分块 → 403', async () => {
    const create = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(ownerToken.accessToken))
      .send({ item_id: ITEM_ID_OWNED, total_size: 10, chunk_size: 10 });
    const sessionId = create.body.session_id as string;

    const put = await request(app)
      .put(`/api/resources/upload/${sessionId}/chunk`)
      .set(authHeader(otherToken.accessToken))
      .set('X-Chunk-Index', '0')
      .send(makePayload(99, 10));
    expect(put.status).toBe(403);
  });
});

// ===========================================================================
// describe 5：参数校验 / 大小限制
// ===========================================================================
describe('参数校验 / 大小限制', () => {
  const ITEM_ID_VALID = 'cf-valid-0006';
  let token: MintedToken;

  beforeAll(() => {
    seedUser(TEST_USER_ID, TEST_USERNAME + '-val');
    seedCloudFileItem(ITEM_ID_VALID, TEST_USER_ID);
    token = mintToken(TEST_USER_ID);
  });

  afterAll(() => {
    closeDatabase();
  });

  it('非法 item_id（含路径分隔）→ 400', async () => {
    const res = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(token.accessToken))
      .send({ item_id: '../etc/passwd', total_size: 10, chunk_size: 10 });
    expect(res.status).toBe(400);
  });

  it('total_size <= 0 → 400', async () => {
    const res = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(token.accessToken))
      .send({ item_id: ITEM_ID_VALID, total_size: 0, chunk_size: 10 });
    expect(res.status).toBe(400);
  });

  it('chunk_size <= 0 → 400', async () => {
    const res = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(token.accessToken))
      .send({ item_id: ITEM_ID_VALID, total_size: 10, chunk_size: 0 });
    expect(res.status).toBe(400);
  });

  it('total_size 超服务端硬上限 → 413 FILE_TOO_LARGE', async () => {
    // MAX_CHUNKED_UPLOAD_SIZE=1048576
    const res = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(token.accessToken))
      .send({ item_id: ITEM_ID_VALID, total_size: 2_000_000, chunk_size: 1024 });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('chunk_size 超单块上限 → 下调到服务端上限并返回实际分块', async () => {
    // MAX_UPLOAD_CHUNK_SIZE=262144
    const res = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(token.accessToken))
      .send({ item_id: ITEM_ID_VALID, total_size: 100_000, chunk_size: 500_000 });
    expect(res.status).toBe(200);
    expect(res.body.chunk_size).toBe(262144);
    expect(res.body.total_chunks).toBe(1);
  });

  it('X-Chunk-Index 越界（>= total_chunks）→ 400', async () => {
    const create = await request(app)
      .post('/api/resources/upload')
      .set(authHeader(token.accessToken))
      .send({ item_id: ITEM_ID_VALID, total_size: 20, chunk_size: 10 });
    expect(create.body.total_chunks).toBe(2);
    const sessionId = create.body.session_id as string;

    const put = await request(app)
      .put(`/api/resources/upload/${sessionId}/chunk`)
      .set(authHeader(token.accessToken))
      .set('X-Chunk-Index', '5')
      .send(makePayload(5, 10));
    expect(put.status).toBe(400);
  });

  it('未知 sessionId 查询 → 404', async () => {
    const res = await request(app)
      .get('/api/resources/upload/0123456789abcdef0123456789abcdef/status')
      .set(authHeader(token.accessToken));
    expect(res.status).toBe(404);
  });

  it('sessionId 格式非法（太短）→ 400', async () => {
    const res = await request(app)
      .get('/api/resources/upload/short/status')
      .set(authHeader(token.accessToken));
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 全局清理：所有 describe 跑完后再保险关一次库 + 删临时根目录
// ===========================================================================
afterAll(() => {
  try {
    closeDatabase();
  } catch {
    /* 可能已被某个 describe 的 afterAll 关闭，忽略 */
  }
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});
