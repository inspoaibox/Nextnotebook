import { useState, useEffect, useCallback } from 'react';
import { ItemBase, TagPayload } from '@shared/types';
import { tagsApi, parsePayload } from '../services/itemsApi';

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdAt: number;
  updatedAt: number;
}

function itemToTag(item: ItemBase): Tag {
  const payload = parsePayload<TagPayload>(item);
  return {
    id: item.id,
    name: payload.name,
    color: payload.color,
    createdAt: item.created_time,
    updatedAt: item.updated_time,
  };
}

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTags = useCallback(async () => {
    try {
      setLoading(true);
      const items = await tagsApi.getAll();
      if (items) {
        setTags(items.map(itemToTag));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const createTag = useCallback(async (name: string, color: string | null = null) => {
    // 检查是否已存在同名标签
    const existing = tags.find((t: Tag) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      return existing;
    }

    const payload: TagPayload = { name, color };
    const item = await tagsApi.create(payload);
    if (item) {
      await loadTags();
      return itemToTag(item);
    }
    return null;
  }, [tags, loadTags]);

  const updateTag = useCallback(async (id: string, updates: Partial<TagPayload>) => {
    const tag = tags.find((t: Tag) => t.id === id);
    if (!tag) return null;

    const payload: TagPayload = {
      name: updates.name ?? tag.name,
      color: updates.color ?? tag.color,
    };

    const item = await tagsApi.update(id, payload);
    if (item) {
      await loadTags();
      return itemToTag(item);
    }
    return null;
  }, [tags, loadTags]);

  const deleteTag = useCallback(async (id: string) => {
    const success = await tagsApi.delete(id);
    if (success) {
      await loadTags();
    }
    return success;
  }, [loadTags]);

  const getTagByName = useCallback((name: string) => {
    return tags.find((t: Tag) => t.name.toLowerCase() === name.toLowerCase());
  }, [tags]);

  return {
    tags,
    loading,
    createTag,
    updateTag,
    deleteTag,
    getTagByName,
    refresh: loadTags,
  };
}
