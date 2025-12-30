import { useState, useEffect, useCallback } from 'react';
import { ItemBase, VaultEntryPayload, VaultFolderPayload, VaultEntryType, VaultCustomField, VaultUri, VaultTotp } from '@shared/types';
import { itemsApi } from '../services/itemsApi';

export interface VaultEntry {
  id: string;
  name: string;
  entryType: VaultEntryType;
  folderId: string | null;
  favorite: boolean;
  notes: string;
  username: string;
  password: string;
  totpSecrets: VaultTotp[];
  uris: VaultUri[];
  cardHolderName: string;
  cardNumber: string;
  cardBrand: string;
  cardExpMonth: string;
  cardExpYear: string;
  cardCvv: string;
  identityTitle: string;
  identityFirstName: string;
  identityLastName: string;
  identityEmail: string;
  identityPhone: string;
  identityAddress: string;
  customFields: VaultCustomField[];
  createdAt: number;
  updatedAt: number;
}

export interface VaultFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

function parsePayload<T>(item: ItemBase): T {
  return JSON.parse(item.payload) as T;
}

function itemToEntry(item: ItemBase): VaultEntry {
  const p = parsePayload<VaultEntryPayload>(item);
  return {
    id: item.id,
    name: p.name,
    entryType: p.entry_type,
    folderId: p.folder_id,
    favorite: p.favorite,
    notes: p.notes || '',
    username: p.username || '',
    password: p.password || '',
    totpSecrets: p.totp_secrets || [],
    uris: p.uris || [],
    cardHolderName: p.card_holder_name || '',
    cardNumber: p.card_number || '',
    cardBrand: p.card_brand || '',
    cardExpMonth: p.card_exp_month || '',
    cardExpYear: p.card_exp_year || '',
    cardCvv: p.card_cvv || '',
    identityTitle: p.identity_title || '',
    identityFirstName: p.identity_first_name || '',
    identityLastName: p.identity_last_name || '',
    identityEmail: p.identity_email || '',
    identityPhone: p.identity_phone || '',
    identityAddress: p.identity_address || '',
    customFields: p.custom_fields || [],
    createdAt: item.created_time,
    updatedAt: item.updated_time,
  };
}

function itemToFolder(item: ItemBase): VaultFolder {
  const p = parsePayload<VaultFolderPayload>(item);
  return {
    id: item.id,
    name: p.name,
    parentId: p.parent_id,
    createdAt: item.created_time,
  };
}

// API
const vaultEntriesApi = {
  create: (payload: VaultEntryPayload): Promise<ItemBase> =>
    itemsApi.create('vault_entry', payload),
  getAll: (): Promise<ItemBase[]> =>
    itemsApi.getByType('vault_entry'),
  update: (id: string, payload: Partial<VaultEntryPayload>): Promise<ItemBase | undefined> =>
    itemsApi.update(id, payload),
  delete: (id: string): Promise<boolean> =>
    itemsApi.delete(id),
};

const vaultFoldersApi = {
  create: (payload: VaultFolderPayload): Promise<ItemBase> =>
    itemsApi.create('vault_folder', payload),
  getAll: (): Promise<ItemBase[]> =>
    itemsApi.getByType('vault_folder'),
  update: (id: string, payload: Partial<VaultFolderPayload>): Promise<ItemBase | undefined> =>
    itemsApi.update(id, payload),
  delete: (id: string): Promise<boolean> =>
    itemsApi.delete(id),
};

export function useVaultFolders() {
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFolders = useCallback(async () => {
    try {
      setLoading(true);
      const items = await vaultFoldersApi.getAll();
      if (items) {
        setFolders(items.filter(i => !i.deleted_time).map(itemToFolder));
      }
    } catch (err) {
      console.error('Failed to load vault folders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  const createFolder = useCallback(async (name: string, parentId: string | null = null) => {
    const item = await vaultFoldersApi.create({ name, parent_id: parentId });
    if (item) {
      await loadFolders();
      return itemToFolder(item);
    }
    return null;
  }, [loadFolders]);

  const updateFolder = useCallback(async (id: string, updates: Partial<VaultFolderPayload>) => {
    const item = await vaultFoldersApi.update(id, updates);
    if (item) { await loadFolders(); }
  }, [loadFolders]);

  const deleteFolder = useCallback(async (id: string) => {
    await vaultFoldersApi.delete(id);
    await loadFolders();
  }, [loadFolders]);

  return { folders, loading, createFolder, updateFolder, deleteFolder, refresh: loadFolders };
}

export function useVaultEntries(folderId?: string | null) {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      const items = await vaultEntriesApi.getAll();
      if (items) {
        let list = items.filter(i => !i.deleted_time).map(itemToEntry);
        if (folderId !== undefined) {
          list = list.filter(e => e.folderId === folderId);
        }
        list.sort((a, b) => {
          if (a.favorite && !b.favorite) return -1;
          if (!a.favorite && b.favorite) return 1;
          return a.name.localeCompare(b.name);
        });
        setEntries(list);
      }
    } catch (err) {
      console.error('Failed to load vault entries:', err);
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const createEntry = useCallback(async (data: Partial<VaultEntryPayload>) => {
    const payload: VaultEntryPayload = {
      name: data.name || '',
      entry_type: data.entry_type || 'login',
      folder_id: data.folder_id ?? folderId ?? null,
      favorite: data.favorite || false,
      notes: data.notes || '',
      username: data.username || '',
      password: data.password || '',
      totp_secrets: data.totp_secrets || [],
      uris: data.uris || [],
      card_holder_name: data.card_holder_name || '',
      card_number: data.card_number || '',
      card_brand: data.card_brand || '',
      card_exp_month: data.card_exp_month || '',
      card_exp_year: data.card_exp_year || '',
      card_cvv: data.card_cvv || '',
      identity_title: data.identity_title || '',
      identity_first_name: data.identity_first_name || '',
      identity_last_name: data.identity_last_name || '',
      identity_email: data.identity_email || '',
      identity_phone: data.identity_phone || '',
      identity_address: data.identity_address || '',
      custom_fields: data.custom_fields || [],
    };
    const item = await vaultEntriesApi.create(payload);
    if (item) {
      await loadEntries();
      return itemToEntry(item);
    }
    return null;
  }, [folderId, loadEntries]);

  const updateEntry = useCallback(async (id: string, updates: Partial<VaultEntryPayload>) => {
    const item = await vaultEntriesApi.update(id, updates);
    if (item) { await loadEntries(); return itemToEntry(item); }
    return null;
  }, [loadEntries]);

  const deleteEntry = useCallback(async (id: string) => {
    await vaultEntriesApi.delete(id);
    await loadEntries();
  }, [loadEntries]);

  const toggleFavorite = useCallback(async (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (entry) {
      await updateEntry(id, { favorite: !entry.favorite });
    }
  }, [entries, updateEntry]);

  return { entries, loading, createEntry, updateEntry, deleteEntry, toggleFavorite, refresh: loadEntries };
}

// 生成随机密码
export function generatePassword(length: number = 16, options?: {
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
}): string {
  const opts = { uppercase: true, lowercase: true, numbers: true, symbols: true, ...options };
  let chars = '';
  if (opts.uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (opts.lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
  if (opts.numbers) chars += '0123456789';
  if (opts.symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, x => chars[x % chars.length]).join('');
}

// 生成 TOTP
export function generateTOTP(secret: string): string {
  // 简化实现，实际应使用 otplib 等库
  // 这里返回占位符，实际使用时需要完整实现
  return '------';
}
