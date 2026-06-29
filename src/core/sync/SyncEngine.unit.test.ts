import { SyncEngine } from './SyncEngine';
import { ItemBase, SyncModules } from '@shared/types';

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
    expect(itemsManager.createWithId).toHaveBeenCalledWith(remoteItem);
    expect(itemsManager.updateFromRemote).toHaveBeenCalledTimes(1);
    const updated = itemsManager.updateFromRemote.mock.calls[0][0] as ItemBase;
    expect(JSON.parse(updated.payload).download_state).toBe('pending');
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
});
