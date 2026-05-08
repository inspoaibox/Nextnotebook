import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const SENSITIVE_KEYS = [
  'password',
  'api_key',
  'server_password',
  'server_sync_key',
  'server_token',
  'server_refresh_token',
] as const;

type SyncConfigRecord = Record<string, any>;

function getSyncConfigPath(): string {
  return path.join(app.getPath('userData'), 'sync-config.json');
}

function encryptValue(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return value;
  }

  const encrypted = safeStorage.encryptString(value);
  return `enc:${encrypted.toString('base64')}`;
}

function decryptValue(value: string): string | undefined {
  if (!value.startsWith('enc:')) {
    return value;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[SyncConfigStorage] Encryption unavailable, cannot decrypt stored sync secret');
    return undefined;
  }

  try {
    const encrypted = Buffer.from(value.slice(4), 'base64');
    return safeStorage.decryptString(encrypted);
  } catch (error) {
    console.error('[SyncConfigStorage] Failed to decrypt sync secret:', error);
    return undefined;
  }
}

export function saveSyncConfig(config: SyncConfigRecord): boolean {
  const syncConfigPath = getSyncConfigPath();
  const persistedConfig: SyncConfigRecord = { ...config };

  for (const key of SENSITIVE_KEYS) {
    const value = persistedConfig[key];
    if (typeof value === 'string' && value.length > 0) {
      persistedConfig[key] = encryptValue(value);
    }
  }

  fs.writeFileSync(syncConfigPath, JSON.stringify(persistedConfig, null, 2), 'utf8');
  return true;
}

export function loadSyncConfig(): SyncConfigRecord | null {
  const syncConfigPath = getSyncConfigPath();
  if (!fs.existsSync(syncConfigPath)) {
    return null;
  }

  const content = fs.readFileSync(syncConfigPath, 'utf8');
  const config = JSON.parse(content) as SyncConfigRecord;
  let requiresRewrite = false;

  for (const key of SENSITIVE_KEYS) {
    const value = config[key];
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }

    if (!value.startsWith('enc:')) {
      requiresRewrite = true;
    }

    config[key] = decryptValue(value);
  }

  if (requiresRewrite) {
    try {
      saveSyncConfig(config);
    } catch (error) {
      console.warn('[SyncConfigStorage] Failed to rewrite sync config after secret migration:', error);
    }
  }

  return config;
}
