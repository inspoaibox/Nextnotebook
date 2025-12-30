import { useState, useEffect, useCallback } from 'react';
import { ItemBase, FolderPayload } from '@shared/types';
import { foldersApi, parsePayload } from '../services/itemsApi';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  icon: string | null;
  color: string | null;
  createdAt: number;
  updatedAt: number;
}

function itemToFolder(item: ItemBase): Folder {
  const payload = parsePayload<FolderPayload>(item);
  return {
    id: item.id,
    name: payload.name,
    parentId: payload.parent_id,
    icon: payload.icon,
    color: payload.color,
    createdAt: item.created_time,
    updatedAt: item.updated_time,
  };
}

export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFolders = useCallback(async () => {
    try {
      setLoading(true);
      const items = await foldersApi.getAll();
      if (items) {
        setFolders(items.map(itemToFolder));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const createFolder = useCallback(async (name: string, parentId: string | null = null) => {
    const payload: FolderPayload = {
      name,
      parent_id: parentId,
      icon: null,
      color: null,
    };
    const item = await foldersApi.create(payload);
    if (item) {
      await loadFolders();
      return itemToFolder(item);
    }
    return null;
  }, [loadFolders]);

  const updateFolder = useCallback(async (id: string, updates: Partial<FolderPayload>) => {
    const folder = folders.find(f => f.id === id);
    if (!folder) return null;

    const payload: FolderPayload = {
      name: updates.name ?? folder.name,
      parent_id: updates.parent_id ?? folder.parentId,
      icon: updates.icon ?? folder.icon,
      color: updates.color ?? folder.color,
    };

    const item = await foldersApi.update(id, payload);
    if (item) {
      await loadFolders();
      return itemToFolder(item);
    }
    return null;
  }, [folders, loadFolders]);

  const deleteFolder = useCallback(async (id: string) => {
    const success = await foldersApi.delete(id);
    if (success) {
      await loadFolders();
    }
    return success;
  }, [loadFolders]);

  // 构建文件夹树结构
  const folderTree = useCallback(() => {
    const rootFolders = folders.filter((f: Folder) => f.parentId === null);
    const getChildren = (parentId: string): Folder[] => {
      return folders.filter((f: Folder) => f.parentId === parentId);
    };

    const buildTree = (folder: Folder): Folder & { children: (Folder & { children: unknown[] })[] } => ({
      ...folder,
      children: getChildren(folder.id).map(buildTree),
    });

    return rootFolders.map(buildTree);
  }, [folders]);

  return {
    folders,
    folderTree,
    loading,
    createFolder,
    updateFolder,
    deleteFolder,
    refresh: loadFolders,
  };
}
