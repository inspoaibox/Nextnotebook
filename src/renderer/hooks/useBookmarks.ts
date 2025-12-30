import { useState, useEffect, useCallback } from 'react';
import { ItemBase, BookmarkPayload, BookmarkFolderPayload } from '@shared/types';
import { itemsApi } from '../services/itemsApi';

export interface Bookmark {
  id: string;
  name: string;
  url: string;
  description: string;
  folderId: string | null;
  icon: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

function parsePayload<T>(item: ItemBase): T {
  return JSON.parse(item.payload) as T;
}

function itemToBookmark(item: ItemBase): Bookmark {
  const p = parsePayload<BookmarkPayload>(item);
  return {
    id: item.id,
    name: p.name,
    url: p.url,
    description: p.description || '',
    folderId: p.folder_id,
    icon: p.icon,
    tags: p.tags || [],
    createdAt: item.created_time,
    updatedAt: item.updated_time,
  };
}

function itemToFolder(item: ItemBase): BookmarkFolder {
  const p = parsePayload<BookmarkFolderPayload>(item);
  return {
    id: item.id,
    name: p.name,
    parentId: p.parent_id,
    createdAt: item.created_time,
  };
}

// API
const bookmarksApi = {
  create: (payload: BookmarkPayload): Promise<ItemBase> =>
    itemsApi.create('bookmark', payload),
  getAll: (): Promise<ItemBase[]> =>
    itemsApi.getByType('bookmark'),
  update: (id: string, payload: Partial<BookmarkPayload>): Promise<ItemBase | undefined> =>
    itemsApi.update(id, payload),
  delete: (id: string): Promise<boolean> =>
    itemsApi.delete(id),
};

const bookmarkFoldersApi = {
  create: (payload: BookmarkFolderPayload): Promise<ItemBase> =>
    itemsApi.create('bookmark_folder', payload),
  getAll: (): Promise<ItemBase[]> =>
    itemsApi.getByType('bookmark_folder'),
  update: (id: string, payload: Partial<BookmarkFolderPayload>): Promise<ItemBase | undefined> =>
    itemsApi.update(id, payload),
  delete: (id: string): Promise<boolean> =>
    itemsApi.delete(id),
};

export function useBookmarkFolders() {
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFolders = useCallback(async () => {
    try {
      setLoading(true);
      const items = await bookmarkFoldersApi.getAll();
      if (items) {
        setFolders(items.filter(i => !i.deleted_time).map(itemToFolder));
      }
    } catch (err) {
      console.error('Failed to load bookmark folders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  const createFolder = useCallback(async (name: string, parentId: string | null = null) => {
    const item = await bookmarkFoldersApi.create({ name, parent_id: parentId });
    if (item) {
      await loadFolders();
      return itemToFolder(item);
    }
    return null;
  }, [loadFolders]);

  const updateFolder = useCallback(async (id: string, updates: Partial<BookmarkFolderPayload>) => {
    const item = await bookmarkFoldersApi.update(id, updates);
    if (item) { await loadFolders(); }
  }, [loadFolders]);

  const deleteFolder = useCallback(async (id: string) => {
    await bookmarkFoldersApi.delete(id);
    await loadFolders();
  }, [loadFolders]);

  return { folders, loading, createFolder, updateFolder, deleteFolder, refresh: loadFolders };
}

export function useBookmarks(folderId?: string | null) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBookmarks = useCallback(async () => {
    try {
      setLoading(true);
      const items = await bookmarksApi.getAll();
      if (items) {
        let list = items.filter(i => !i.deleted_time).map(itemToBookmark);
        if (folderId !== undefined) {
          list = list.filter(b => b.folderId === folderId);
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        setBookmarks(list);
      }
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => { loadBookmarks(); }, [loadBookmarks]);

  const createBookmark = useCallback(async (data: Partial<BookmarkPayload>) => {
    const payload: BookmarkPayload = {
      name: data.name || '',
      url: data.url || '',
      description: data.description || '',
      folder_id: data.folder_id ?? folderId ?? null,
      icon: data.icon || null,
      tags: data.tags || [],
    };
    const item = await bookmarksApi.create(payload);
    if (item) {
      await loadBookmarks();
      return itemToBookmark(item);
    }
    return null;
  }, [folderId, loadBookmarks]);

  const updateBookmark = useCallback(async (id: string, updates: Partial<BookmarkPayload>) => {
    const item = await bookmarksApi.update(id, updates);
    if (item) { await loadBookmarks(); return itemToBookmark(item); }
    return null;
  }, [loadBookmarks]);

  const deleteBookmark = useCallback(async (id: string) => {
    await bookmarksApi.delete(id);
    await loadBookmarks();
  }, [loadBookmarks]);

  return { bookmarks, loading, createBookmark, updateBookmark, deleteBookmark, refresh: loadBookmarks };
}
