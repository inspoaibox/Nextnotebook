import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseManager } from './Database';
import { ItemsManager } from './ItemsManager';
import { isLocalPayloadEncrypted } from './LocalPayloadCrypto';
import { ItemBase } from '@shared/types';

describe('ItemsManager local payload encryption', () => {
  let testDir: string;
  let dbManager: DatabaseManager;
  let itemsManager: ItemsManager;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'items-encryption-'));
    dbManager = new DatabaseManager(testDir);
    dbManager.initialize();
    itemsManager = new ItemsManager(dbManager);
  });

  afterEach(() => {
    dbManager.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('stores encrypted payload locally but returns plaintext to callers', () => {
    const item = itemsManager.create('vault_entry', {
      name: 'Example',
      entry_type: 'login',
      folder_id: null,
      favorite: false,
      notes: '',
      username: 'alice',
      password: 'secret-password',
      totp_secrets: [],
      uris: [],
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
    });

    const raw = dbManager.get<ItemBase>('SELECT * FROM items WHERE id = ?', [item.id]);
    expect(raw).toBeDefined();
    expect(raw!.payload).toContain('mcenc:v1:');
    expect(raw!.payload).not.toContain('secret-password');
    expect(isLocalPayloadEncrypted(raw!.payload)).toBe(true);

    const loaded = itemsManager.getById(item.id);
    expect(loaded).toBeDefined();
    expect(loaded!.payload).toContain('secret-password');
    expect(loaded!.content_hash).toBe(item.content_hash);
  });

  it('migrates existing plaintext payloads without changing sync metadata', () => {
    const payload = JSON.stringify({ title: 'Plain note', content: 'visible before migration' });
    const item: ItemBase = {
      id: 'plain-note',
      type: 'note',
      created_time: 1,
      updated_time: 2,
      deleted_time: null,
      payload,
      content_hash: 'stable-hash',
      sync_status: 'clean',
      local_rev: 7,
      remote_rev: 'remote-rev',
      encryption_applied: 0,
      schema_version: 1,
    };

    dbManager.run(
      `INSERT INTO items (id, type, created_time, updated_time, deleted_time, payload,
       content_hash, sync_status, local_rev, remote_rev, encryption_applied, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id, item.type, item.created_time, item.updated_time, item.deleted_time,
        item.payload, item.content_hash, item.sync_status, item.local_rev, item.remote_rev,
        item.encryption_applied, item.schema_version,
      ]
    );

    const migratedManager = new ItemsManager(dbManager);
    const raw = dbManager.get<ItemBase>('SELECT * FROM items WHERE id = ?', [item.id]);
    expect(raw).toBeDefined();
    expect(isLocalPayloadEncrypted(raw!.payload)).toBe(true);
    expect(raw!.content_hash).toBe('stable-hash');
    expect(raw!.sync_status).toBe('clean');
    expect(raw!.local_rev).toBe(7);

    const loaded = migratedManager.getById(item.id);
    expect(loaded!.payload).toBe(payload);
  });

  it('does not double-encrypt incoming remote items', () => {
    const item = itemsManager.create('note', {
      title: 'Sync note',
      content: 'first',
      folder_id: null,
      is_pinned: false,
      is_locked: false,
      lock_password_hash: null,
      tags: [],
    });

    const remote = {
      ...item,
      payload: JSON.stringify({
        title: 'Sync note',
        content: 'from remote',
        folder_id: null,
        is_pinned: false,
        is_locked: false,
        lock_password_hash: null,
        tags: [],
      }),
      remote_rev: 'rev-2',
    } satisfies ItemBase;

    itemsManager.updateFromRemote(remote);
    const raw = dbManager.get<ItemBase>('SELECT * FROM items WHERE id = ?', [item.id]);
    expect(raw).toBeDefined();
    expect(raw!.payload).toContain('mcenc:v1:');

    const loaded = itemsManager.getById(item.id);
    expect(loaded!.payload).toBe(remote.payload);
    expect(loaded!.sync_status).toBe('clean');
  });

  it('keeps resource metadata plaintext while leaving files untouched', () => {
    const resource = itemsManager.create('resource', {
      filename: 'photo.jpg',
      mime_type: 'image/jpeg',
      size: 1024,
      note_id: 'note-id',
      file_hash: 'file-hash',
    });

    const raw = dbManager.get<ItemBase>('SELECT * FROM items WHERE id = ?', [resource.id]);
    expect(raw).toBeDefined();
    expect(isLocalPayloadEncrypted(raw!.payload)).toBe(false);
    expect(raw!.payload).toContain('photo.jpg');
  });
});
