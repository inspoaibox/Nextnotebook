import { ItemBase, ItemType, NotePayload, FolderPayload, TagPayload } from '@shared/types';

// 获取 electronAPI（通过 preload 暴露）
const getElectronAPI = () => {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return (window as any).electronAPI;
  }
  return null;
};

// 通用 Items API
export const itemsApi = {
  create: <T extends object>(type: ItemType, payload: T): Promise<ItemBase> => {
    const api = getElectronAPI();
    return api?.items?.create(type, payload) ?? Promise.resolve(null as any);
  },

  getById: (id: string): Promise<ItemBase | undefined> => {
    const api = getElectronAPI();
    return api?.items?.getById(id) ?? Promise.resolve(undefined);
  },

  getByIdIncludeDeleted: (id: string): Promise<ItemBase | undefined> => {
    const api = getElectronAPI();
    return api?.items?.getByIdIncludeDeleted(id) ?? Promise.resolve(undefined);
  },

  getByType: (type: ItemType): Promise<ItemBase[]> => {
    const api = getElectronAPI();
    return api?.items?.getByType(type) ?? Promise.resolve([]);
  },

  update: <T extends object>(id: string, payload: T): Promise<ItemBase | undefined> => {
    const api = getElectronAPI();
    return api?.items?.update(id, payload) ?? Promise.resolve(undefined);
  },

  delete: (id: string): Promise<boolean> => {
    const api = getElectronAPI();
    return api?.items?.delete(id) ?? Promise.resolve(false);
  },

  hardDelete: (id: string): Promise<boolean> => {
    const api = getElectronAPI();
    return api?.items?.hardDelete(id) ?? Promise.resolve(false);
  },

  restore: (id: string): Promise<boolean> => {
    const api = getElectronAPI();
    return api?.items?.restore(id) ?? Promise.resolve(false);
  },

  search: (query: string, type?: ItemType): Promise<ItemBase[]> => {
    const api = getElectronAPI();
    return api?.items?.search(query, type) ?? Promise.resolve([]);
  },

  getDeleted: (type?: ItemType): Promise<ItemBase[]> => {
    const api = getElectronAPI();
    return api?.items?.getDeleted(type) ?? Promise.resolve([]);
  },

  getStats: (): Promise<{ total: number; byType: Record<string, number> }> => {
    const api = getElectronAPI();
    return api?.items?.getStats() ?? Promise.resolve({ total: 0, byType: {} });
  },
};

// 笔记专用 API
export const notesApi = {
  create: (payload: NotePayload): Promise<ItemBase> =>
    itemsApi.create('note', payload),

  getAll: (): Promise<ItemBase[]> =>
    itemsApi.getByType('note'),

  getByFolder: (folderId: string | null): Promise<ItemBase[]> => {
    const api = getElectronAPI();
    return api?.items?.getNotesByFolder(folderId) ?? Promise.resolve([]);
  },

  getPinned: (): Promise<ItemBase[]> => {
    const api = getElectronAPI();
    return api?.items?.getPinnedNotes() ?? Promise.resolve([]);
  },

  update: (id: string, payload: NotePayload): Promise<ItemBase | undefined> =>
    itemsApi.update(id, payload),

  delete: (id: string): Promise<boolean> =>
    itemsApi.delete(id),

  search: (query: string): Promise<ItemBase[]> =>
    itemsApi.search(query, 'note'),
};

// 文件夹专用 API
export const foldersApi = {
  create: (payload: FolderPayload): Promise<ItemBase> =>
    itemsApi.create('folder', payload),

  getAll: (): Promise<ItemBase[]> =>
    itemsApi.getByType('folder'),

  update: (id: string, payload: FolderPayload): Promise<ItemBase | undefined> =>
    itemsApi.update(id, payload),

  delete: (id: string): Promise<boolean> =>
    itemsApi.delete(id),
};

// 标签专用 API
export const tagsApi = {
  create: (payload: TagPayload): Promise<ItemBase> =>
    itemsApi.create('tag', payload),

  getAll: (): Promise<ItemBase[]> =>
    itemsApi.getByType('tag'),

  update: (id: string, payload: TagPayload): Promise<ItemBase | undefined> =>
    itemsApi.update(id, payload),

  delete: (id: string): Promise<boolean> =>
    itemsApi.delete(id),
};

// 解析 payload 的辅助函数
export function parsePayload<T>(item: ItemBase): T {
  return JSON.parse(item.payload) as T;
}
