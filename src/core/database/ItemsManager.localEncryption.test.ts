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

  it('marks unconfirmed cloud items for sync without touching confirmed or non-cloud items', () => {
    const cloudFolder: ItemBase = {
      id: 'cloud-folder-missing-rev',
      type: 'cloud_folder',
      created_time: 1,
      updated_time: 1,
      deleted_time: null,
      payload: JSON.stringify({ name: 'Important', parent_folder_id: 'root', relative_path: 'Important' }),
      content_hash: 'folder-hash',
      sync_status: 'clean',
      local_rev: 3,
      remote_rev: null,
      encryption_applied: 0,
      schema_version: 1,
    };
    const confirmedCloudFile: ItemBase = {
      ...cloudFolder,
      id: 'confirmed-cloud-file',
      type: 'cloud_file',
      payload: JSON.stringify({ filename: 'done.xlsx', parent_folder_id: 'root', relative_path: 'done.xlsx' }),
      content_hash: 'file-hash',
      local_rev: 4,
      remote_rev: 'remote-rev',
    };
    const noteWithoutRemoteRev: ItemBase = {
      ...cloudFolder,
      id: 'note-without-remote-rev',
      type: 'note',
      payload: JSON.stringify({ title: 'Local note', content: '' }),
      content_hash: 'note-hash',
      local_rev: 5,
    };

    for (const item of [cloudFolder, confirmedCloudFile, noteWithoutRemoteRev]) {
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
    }

    expect(itemsManager.markUnconfirmedCloudItemsForSync()).toBe(1);

    const repaired = dbManager.get<ItemBase>('SELECT * FROM items WHERE id = ?', [cloudFolder.id]);
    const confirmed = dbManager.get<ItemBase>('SELECT * FROM items WHERE id = ?', [confirmedCloudFile.id]);
    const note = dbManager.get<ItemBase>('SELECT * FROM items WHERE id = ?', [noteWithoutRemoteRev.id]);

    expect(repaired!.sync_status).toBe('modified');
    expect(repaired!.local_rev).toBe(4);
    expect(repaired!.remote_rev).toBeNull();
    expect(confirmed!.sync_status).toBe('clean');
    expect(confirmed!.local_rev).toBe(4);
    expect(note!.sync_status).toBe('clean');
    expect(note!.local_rev).toBe(5);
  });

  it('marks one unconfirmed cloud item by id', () => {
    const cloudFolder: ItemBase = {
      id: 'single-cloud-folder-missing-rev',
      type: 'cloud_folder',
      created_time: 1,
      updated_time: 1,
      deleted_time: null,
      payload: JSON.stringify({ name: 'Important', parent_folder_id: 'root', relative_path: 'Important' }),
      content_hash: 'folder-hash',
      sync_status: 'clean',
      local_rev: 1,
      remote_rev: null,
      encryption_applied: 0,
      schema_version: 1,
    };

    dbManager.run(
      `INSERT INTO items (id, type, created_time, updated_time, deleted_time, payload,
       content_hash, sync_status, local_rev, remote_rev, encryption_applied, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cloudFolder.id, cloudFolder.type, cloudFolder.created_time, cloudFolder.updated_time,
        cloudFolder.deleted_time, cloudFolder.payload, cloudFolder.content_hash, cloudFolder.sync_status,
        cloudFolder.local_rev, cloudFolder.remote_rev, cloudFolder.encryption_applied, cloudFolder.schema_version,
      ]
    );

    expect(itemsManager.markUnconfirmedCloudItemForSync(cloudFolder.id)).toBe(true);
    expect(itemsManager.markUnconfirmedCloudItemForSync(cloudFolder.id)).toBe(false);

    const repaired = dbManager.get<ItemBase>('SELECT * FROM items WHERE id = ?', [cloudFolder.id]);
    expect(repaired!.sync_status).toBe('modified');
    expect(repaired!.local_rev).toBe(2);
  });
});
