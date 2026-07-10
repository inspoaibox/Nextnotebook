import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import type { Express } from 'express';
import request from 'supertest';

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-passkey-it-'));
const API_KEY = 'passkey-sync-test-key';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(TMP_ROOT, 'sync.db');
process.env.RESOURCES_PATH = path.join(TMP_ROOT, 'resources');
process.env.UPLOAD_TEMP_PATH = path.join(TMP_ROOT, 'uploads');
process.env.JWT_SECRET = 'passkey-integration-test-jwt-secret-aaaaaaaa';
process.env.JWT_REFRESH_SECRET = 'passkey-integration-test-jwt-refresh-secret-aaaa';
process.env.LEGACY_API_KEY_AUTH_ENABLED = 'true';
process.env.API_KEYS = API_KEY;
process.env.API_RATE_LIMIT = '100000';
process.env.SYNC_RATE_LIMIT = '100000';

// config.ts reads process.env during module load, so require sync-server only after env setup.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app: Express = require('../../../sync-server/src/app').default as Express;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { closeDatabase } = require('../../../sync-server/src/database');

function authHeader(): Record<string, string> {
  return { 'X-API-Key': API_KEY };
}

function contentHash(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

describe('sync-server vault passkey payload compatibility', () => {
  afterAll(() => {
    closeDatabase();
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it('preserves passkeys inside vault_entry payload across put/get/full-pull', async () => {
    const now = Date.now();
    const payloadObject = {
      name: 'Example Passkey Login',
      entry_type: 'login',
      folder_id: null,
      favorite: false,
      notes: '',
      username: 'user@example.com',
      password: '',
      totp_secrets: [],
      uris: [
        {
          id: 'uri-1',
          uri: 'https://example.com',
          match_type: 'domain',
        },
      ],
      passkeys: [
        {
          id: 'pk-1',
          credential_type: 'public-key',
          rp_id: 'example.com',
          rp_name: 'Example',
          credential_id: 'credential-id-base64url',
          user_id: 'user-handle-base64url',
          user_name: 'user@example.com',
          user_display_name: 'Example User',
          public_key: 'public-key-cose-base64url',
          private_key: 'encrypted-private-key',
          sign_count: 7,
          algorithm: 'ES256',
          transports: ['internal', 'hybrid'],
          backup_eligible: true,
          backup_state: true,
          created_at: now,
          last_used_at: null,
        },
      ],
      card_holder_name: '',
      card_number: '',
      card_brand: '',
      card_exp_month: '',
      card_exp_year: '',
      card_cvv: '',
      identity_title: '',
      identity_first_name: '',
      identity_last_name: '',
      identity_email: '',
      identity_phone: '',
      identity_address: '',
      custom_fields: [],
    };
    const payload = JSON.stringify(payloadObject);
    const itemId = 'vault-passkey-roundtrip';

    const putRes = await request(app)
      .put(`/api/items/${itemId}`)
      .set(authHeader())
      .send({
        type: 'vault_entry',
        payload,
        content_hash: contentHash(payload),
        created_time: now,
        updated_time: now,
        deleted_time: null,
        sync_status: 'dirty',
        local_rev: 1,
        remote_rev: null,
        encryption_applied: 0,
        schema_version: 1,
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.remoteRev).toBeTruthy();

    const getRes = await request(app)
      .get(`/api/items/${itemId}`)
      .set(authHeader());

    expect(getRes.status).toBe(200);
    expect(JSON.parse(getRes.body.payload).passkeys).toEqual(payloadObject.passkeys);

    const allRes = await request(app)
      .get('/api/items/all')
      .set(authHeader());

    expect(allRes.status).toBe(200);
    const pulledItem = allRes.body.items.find((item: { id: string }) => item.id === itemId);
    expect(pulledItem).toBeTruthy();
    expect(JSON.parse(pulledItem.payload).passkeys).toEqual(payloadObject.passkeys);
  });
});
