import { useState, useEffect, useCallback } from 'react';
import { ItemBase, NotePayload } from '@shared/types';
import { notesApi, itemsApi, parsePayload } from '../services/itemsApi';

export interface Note {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  isPinned: boolean;
  isLocked: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

function itemToNote(item: ItemBase): Note {
  const payload = parsePayload<NotePayload>(item);
  return {
    id: item.id,
    title: payload.title,
    content: payload.content,
    folderId: payload.folder_id,
    isPinned: payload.is_pinned,
    isLocked: payload.is_locked,
    tags: payload.tags,
    createdAt: item.created_time,
    updatedAt: item.updated_time,
  };
}

export function useNotes(folderId: string | null) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const items = await notesApi.getByFolder(folderId);
      if (items && Array.isArray(items)) {
        const noteList = items.map(itemToNote);
        // 置顶笔记优先
        noteList.sort((a: Note, b: Note) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return b.updatedAt - a.updatedAt;
        });
        setNotes(noteList);
      } else {
        setNotes([]);
      }
    } catch (err) {
      setError(err as Error);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const createNote = useCallback(async (title: string, content: string = '') => {
    const payload: NotePayload = {
      title,
      content,
      folder_id: folderId,
      is_pinned: false,
      is_locked: false,
      lock_password_hash: null,
      tags: [],
    };
    const item = await notesApi.create(payload);
    if (item) {
      await loadNotes();
      return itemToNote(item);
    }
    return null;
  }, [folderId, loadNotes]);

  const updateNote = useCallback(async (id: string, updates: Partial<NotePayload>) => {
    const note = notes.find(n => n.id === id);
    if (!note) return null;

    const payload: NotePayload = {
      title: updates.title ?? note.title,
      content: updates.content ?? note.content,
      folder_id: updates.folder_id ?? note.folderId,
      is_pinned: updates.is_pinned ?? note.isPinned,
      is_locked: updates.is_locked ?? note.isLocked,
      lock_password_hash: updates.lock_password_hash ?? null,
      tags: updates.tags ?? note.tags,
    };

    const item = await notesApi.update(id, payload);
    if (item) {
      await loadNotes();
      return itemToNote(item);
    }
    return null;
  }, [notes, loadNotes]);

  const deleteNote = useCallback(async (id: string) => {
    const success = await notesApi.delete(id);
    if (success) {
      await loadNotes();
    }
    return success;
  }, [loadNotes]);

  const searchNotes = useCallback(async (query: string) => {
    if (!query.trim()) {
      await loadNotes();
      return;
    }
    const items = await notesApi.search(query);
    if (items) {
      setNotes(items.map(itemToNote));
    }
  }, [loadNotes]);

  return {
    notes,
    loading,
    error,
    createNote,
    updateNote,
    deleteNote,
    searchNotes,
    refresh: loadNotes,
  };
}

export function useNote(noteId: string | null, includeDeleted: boolean = false) {
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!noteId) {
      setNote(null);
      return;
    }

    setLoading(true);
    const fetchNote = includeDeleted 
      ? itemsApi.getByIdIncludeDeleted(noteId)
      : itemsApi.getById(noteId);
    
    fetchNote.then(item => {
      if (item) {
        setNote(itemToNote(item));
      } else {
        setNote(null);
      }
      setLoading(false);
    }).catch(() => {
      setNote(null);
      setLoading(false);
    });
  }, [noteId, includeDeleted]);

  return { note, loading };
}
