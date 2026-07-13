import { SyncEngine } from './SyncEngine';
import { ItemBase, SyncModules } from '@shared/types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

const syncModules: SyncModules = {
  notes: true,
  bookmarks: true,
  vault: true,
  diagrams: true,
  todos: true,
  ai: true,
  cloudDrive: true,
};

function cloudFileItem(id: string, patch: Partial<ItemBase> = {}): ItemBase {
  const payload = {
    filename: `${id}.txt`,
    mime_type: 'text/plain',
    size: 12,
    file_hash: 'hash-abc',
    parent_folder_id: 'root',
    relative_path: `${id}.txt`,
    mtime: 1000,
    upload_state: 'completed',
    chunk_size: 8 * 1024 * 1024,
    total_chunks: 1,
    uploaded_chunks: [0],
    upload_session_id: null,
    error_message: null,
    download_state: 'completed',
    downloaded_size: 12,
    downloaded_at: 1000,
    download_error: null,
  };

  return {
    id,
    type: 'cloud_file',
    created_time: 1000,
    updated_time: 2000,
    deleted_time: null,
    payload: JSON.stringify(payload),
    content_hash: `content-${id}`,
    sync_status: 'clean',
    local_rev: 1,
    remote_rev: 'remote-1',
    encryption_applied: 0,
    schema_version: 1,
    ...patch,
  };
}

function cloudFileItemWithPayload(
  id: string,
  payloadPatch: Record<string, unknown>,
  itemPatch: Partial<ItemBase> = {}
): ItemBase {
  const item = cloudFileItem(id, itemPatch);
  item.payload = JSON.stringify({
    ...JSON.parse(item.payload),
    ...payloadPatch,
  });
  return item;
}

function resourceItem(id: string, payloadPatch: Record<string, unknown> = {}, patch: Partial<ItemBase> = {}): ItemBase {
  const payload = {
    filename: `${id}.png`,
    mime_type: 'image/png',
    size: 3,
    note_id: 'note-1',
    file_hash: 'hash-resource',
    ...payloadPatch,
  };

  return {
    id,
    type: 'resource',
    created_time: 1000,
    updated_time: 2000,
    deleted_time: null,
    payload: JSON.stringify(payload),
    content_hash: `content-${id}`,
    sync_status: 'modified',
    local_rev: 1,
    remote_rev: null,
    encryption_applied: 0,
    schema_version: 1,
    ...patch,
  };
}

describe('SyncEngine cloud drive metadata backfill', () => {
  it('从 /api/items/all 补齐本地缺失的 cloud_file，并标记待下载', async () => {
    const remoteItem = cloudFileItem('mobile-file');
    const adapter = {
      listAllItems: jest.fn().mockResolvedValue([remoteItem]),
    };
    const itemsManager = {
      getByIdIncludeDeleted: jest.fn().mockReturnValue(undefined),
      createWithId: jest.fn(),
      upsertFromPlainItem: jest.fn(),
      updateFromRemote: jest.fn(),
      markDeletedFromRemote: jest.fn(),
    };
    const onCloudFileChanged = jest.fn();
    const onCloudItemsChanged = jest.fn();

    const engine = new SyncEngine(adapter as any, itemsManager as any, {
      syncModules,
      serverIdentifier: { type: 'server', url: 'http://server.test' },
      onCloudFileChanged,
      onCloudItemsChanged,
    });

    const result = await (engine as any).backfillCloudDriveMetadata();

    expect(result).toEqual({ count: 1, errors: [] });
    expect(itemsManager.createWithId).toHaveBeenCalledTimes(1);
    const created = itemsManager.createWithId.mock.calls[0][0] as ItemBase;
    expect(JSON.parse(created.payload).download_state).toBe('pending');
    expect(itemsManager.updateFromRemote).not.toHaveBeenCalled();
    expect(onCloudFileChanged).toHaveBeenCalledWith('mobile-file');
    expect(onCloudItemsChanged).toHaveBeenCalledTimes(1);
  });

  it('不覆盖本地 modified 的 cloud_file', async () => {
    const remoteItem = cloudFileItem('local-edit');
    const adapter = {
      listAllItems: jest.fn().mockResolvedValue([remoteItem]),
    };
    const itemsManager = {
      getByIdIncludeDeleted: jest.fn().mockReturnValue(cloudFileItem('local-edit', {
        sync_status: 'modified',
        content_hash: 'local-hash',
      })),
      createWithId: jest.fn(),
      upsertFromPlainItem: jest.fn(),
      updateFromRemote: jest.fn(),
      markDeletedFromRemote: jest.fn(),
    };

    const engine = new SyncEngine(adapter as any, itemsManager as any, {
      syncModules,
      serverIdentifier: { type: 'server', url: 'http://server.test' },
    });

    const result = await (engine as any).backfillCloudDriveMetadata();

    expect(result).toEqual({ count: 0, errors: [] });
    expect(itemsManager.createWithId).not.toHaveBeenCalled();
    expect(itemsManager.updateFromRemote).not.toHaveBeenCalled();
  });

  it('cloud_file 真实 file_hash 相同时不创建冲突副本', async () => {
    const localItem = cloudFileItem('same-file', {
      sync_status: 'modified',
      content_hash: 'local-metadata-hash',
    });
    const remoteItem = cloudFileItem('same-file', {
      content_hash: 'remote-metadata-hash',
      remote_rev: 'remote-2',
    });
    const adapter = {
      getItem: jest.fn().mockResolvedValue(remoteItem),
    };
    const itemsManager = {
      updateFromRemote: jest.fn(),
      create: jest.fn(),
    };
    const onCloudFileConflict = jest.fn();
    const engine = new SyncEngine(adapter as any, itemsManager as any, {
      syncModules,
      onCloudFileConflict,
    });

    const result = await (engine as any).handleConflict(localItem, {
      item_id: 'same-file',
      type: 'cloud_file',
    });

    expect(result).toEqual({ success: true, conflict: false });
    expect(itemsManager.updateFromRemote).toHaveBeenCalledTimes(1);
    expect(itemsManager.create).not.toHaveBeenCalled();
    expect(onCloudFileConflict).not.toHaveBeenCalled();
  });

  it('remote-wins 的 cloud_file 冲突会标记原记录待下载并通知调度', async () => {
    const localItem = cloudFileItemWithPayload('remote-wins-file', {
      file_hash: 'local-hash',
    }, {
      sync_status: 'modified',
      content_hash: 'local-metadata-hash',
    });
    const remoteItem = cloudFileItemWithPayload('remote-wins-file', {
      file_hash: 'remote-hash',
      download_state: 'completed',
      download_error: 'old-error',
    }, {
      content_hash: 'remote-metadata-hash',
      remote_rev: 'remote-2',
    });
    const adapter = {
      getItem: jest.fn().mockResolvedValue(remoteItem),
    };
    const itemsManager = {
      updateFromRemote: jest.fn(),
      create: jest.fn(),
    };
    const onCloudFileChanged = jest.fn();
    const onCloudItemsChanged = jest.fn();
    const engine = new SyncEngine(adapter as any, itemsManager as any, {
      syncModules,
      conflictStrategy: 'remote-wins',
      onCloudFileChanged,
      onCloudItemsChanged,
    });

    const result = await (engine as any).handleConflict(localItem, {
      item_id: 'remote-wins-file',
      type: 'cloud_file',
    });
    (engine as any).flushCloudChangeCallbacks();

    expect(result).toEqual({ success: true, conflict: true });
    expect(itemsManager.create).not.toHaveBeenCalled();
    expect(itemsManager.updateFromRemote).toHaveBeenCalledTimes(1);
    const stored = itemsManager.updateFromRemote.mock.calls[0][0] as ItemBase;
    const storedPayload = JSON.parse(stored.payload);
    expect(storedPayload.file_hash).toBe('remote-hash');
    expect(storedPayload.download_state).toBe('pending');
    expect(storedPayload.download_error).toBeNull();
    expect(onCloudFileChanged).toHaveBeenCalledWith('remote-wins-file');
    expect(onCloudItemsChanged).toHaveBeenCalledWith({
      changedIds: ['remote-wins-file'],
      deletedIds: [],
    });
  });

  it('create-copy 的 cloud_file 冲突会保存本地副本，并让原记录重新下载远端版本', async () => {
    const localItem = cloudFileItemWithPayload('copy-file', {
      file_hash: 'local-hash',
      relative_path: 'docs/copy-file.txt',
      filename: 'copy-file.txt',
    }, {
      sync_status: 'modified',
      content_hash: 'local-metadata-hash',
    });
    const remoteItem = cloudFileItemWithPayload('copy-file', {
      file_hash: 'remote-hash',
      download_state: 'completed',
    }, {
      content_hash: 'remote-metadata-hash',
      remote_rev: 'remote-2',
    });
    const adapter = {
      getItem: jest.fn().mockResolvedValue(remoteItem),
    };
    const itemsManager = {
      updateFromRemote: jest.fn(),
      create: jest.fn(),
    };
    const onCloudFileChanged = jest.fn();
    const onCloudItemsChanged = jest.fn();
    const onCloudFileConflict = jest.fn();
    const engine = new SyncEngine(adapter as any, itemsManager as any, {
      syncModules,
      conflictStrategy: 'create-copy',
      onCloudFileChanged,
      onCloudItemsChanged,
      onCloudFileConflict,
    });

    const result = await (engine as any).handleConflict(localItem, {
      item_id: 'copy-file',
      type: 'cloud_file',
    });
    (engine as any).flushCloudChangeCallbacks();

    expect(result).toEqual({ success: true, conflict: true });
    expect(itemsManager.create).toHaveBeenCalledTimes(1);
    const conflictPayload = itemsManager.create.mock.calls[0][1];
    expect(conflictPayload.is_conflict).toBe(true);
    expect(conflictPayload.relative_path).toBe('docs/copy-file (冲突副本).txt');
    expect(onCloudFileConflict).toHaveBeenCalledWith(
      'copy-file',
      'docs/copy-file (冲突副本).txt'
    );

    expect(itemsManager.updateFromRemote).toHaveBeenCalledTimes(1);
    const stored = itemsManager.updateFromRemote.mock.calls[0][0] as ItemBase;
    expect(JSON.parse(stored.payload).download_state).toBe('pending');
    expect(onCloudFileChanged).toHaveBeenCalledWith('copy-file');
    expect(onCloudItemsChanged).toHaveBeenCalledWith({
      changedIds: ['copy-file'],
      deletedIds: [],
    });
  });

  it('resource 上传使用 MIME 扩展名，不被 filename 查询串带偏', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-resource-upload-'));
    try {
      const data = Buffer.from('webp-data');
      const fileHash = crypto.createHash('sha256').update(data).digest('hex');
      const item = resourceItem('resource-query-name', {
        filename: 'image:q75.awebp?rk3s=f64ab15b&x-signature=abc',
        mime_type: 'image/webp',
        size: data.length,
        file_hash: fileHash,
      });
      fs.writeFileSync(path.join(tmpDir, 'resource-query-name.webp'), data);

      const adapter = {
        putItem: jest.fn().mockResolvedValue({ success: true, remoteRev: 'remote-1' }),
        putResource: jest.fn().mockResolvedValue(true),
      };
      const itemsManager = {
        getByType: jest.fn().mockReturnValue([]),
        getPendingSync: jest.fn().mockReturnValue([item]),
        markSynced: jest.fn(),
      };
      const engine = new SyncEngine(adapter as any, itemsManager as any, {
        syncModules,
        resourcesDir: tmpDir,
      });

      const result = await (engine as any).pushChanges();

      expect(result).toEqual({ count: 1, errors: [] });
      expect(adapter.putResource).toHaveBeenCalledTimes(1);
      expect(adapter.putResource.mock.calls[0][0]).toBe('resource-query-name.webp');
      expect(adapter.putResource.mock.calls[0][1]).toEqual(data);
      expect(itemsManager.markSynced).toHaveBeenCalledWith('resource-query-name', 'remote-1');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('resource 冲突副本会复制原二进制文件到新 item id', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-resource-conflict-'));
    try {
      const data = Buffer.from('resource-conflict-data');
      const fileHash = crypto.createHash('sha256').update(data).digest('hex');
      const source = resourceItem('source-resource', {
        filename: 'remote-image.awebp?x-signature=abc',
        mime_type: 'image/webp',
        size: data.length,
        file_hash: fileHash,
      }, {
        sync_status: 'modified',
      });
      const conflict = resourceItem('conflict-resource', {
        filename: 'remote-image.awebp?x-signature=abc',
        mime_type: 'image/webp',
        size: data.length,
        file_hash: fileHash,
        is_conflict: true,
      });
      fs.writeFileSync(path.join(tmpDir, 'source-resource.webp'), data);

      const engine = new SyncEngine({} as any, {} as any, {
        syncModules,
        resourcesDir: tmpDir,
      });

      (engine as any).copyResourceFileForConflictCopy(
        source,
        conflict,
        JSON.parse(conflict.payload)
      );

      expect(fs.readFileSync(path.join(tmpDir, 'conflict-resource.webp'))).toEqual(data);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
