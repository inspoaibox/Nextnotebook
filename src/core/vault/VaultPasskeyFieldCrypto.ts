import * as crypto from 'crypto';
import { ItemBase, VaultEntryPayload, VaultPasskey } from '@shared/types';

const ENCRYPTED_PRIVATE_KEY_PREFIX = 'enc:v1:';
const FIELD_KEY_CONTEXT = 'mucheng-notes-passkey-private-key-v1';

interface EncryptedPrivateKey {
  v: 1;
  alg: 'AES-256-GCM';
  iv: string;
  ciphertext: string;
  authTag: string;
}

function toBase64Url(input: Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function deriveFieldKey(secret: string): Buffer {
  return crypto
    .createHash('sha256')
    .update(FIELD_KEY_CONTEXT, 'utf8')
    .update('\0', 'utf8')
    .update(secret, 'utf8')
    .digest();
}

export function isEncryptedPasskeyPrivateKey(value: string | undefined): boolean {
  return Boolean(value?.startsWith(ENCRYPTED_PRIVATE_KEY_PREFIX));
}

export function encryptPasskeyPrivateKey(privateKey: string, secret: string): string {
  if (!privateKey || isEncryptedPasskeyPrivateKey(privateKey)) {
    return privateKey;
  }

  const key = deriveFieldKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
  const encrypted: EncryptedPrivateKey = {
    v: 1,
    alg: 'AES-256-GCM',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
  return `${ENCRYPTED_PRIVATE_KEY_PREFIX}${toBase64Url(JSON.stringify(encrypted))}`;
}

export function decryptPasskeyPrivateKey(privateKey: string, secret: string): string {
  if (!isEncryptedPasskeyPrivateKey(privateKey)) {
    return privateKey;
  }

  const encoded = privateKey.slice(ENCRYPTED_PRIVATE_KEY_PREFIX.length);
  const encrypted = JSON.parse(fromBase64Url(encoded).toString('utf8')) as EncryptedPrivateKey;
  if (encrypted.v !== 1 || encrypted.alg !== 'AES-256-GCM') {
    throw new Error('Unsupported encrypted passkey private key format');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveFieldKey(secret),
    Buffer.from(encrypted.iv, 'base64'),
    { authTagLength: 16 },
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function transformPasskeys(
  payload: VaultEntryPayload,
  transform: (privateKey: string) => string,
): VaultEntryPayload {
  if (!Array.isArray(payload.passkeys) || payload.passkeys.length === 0) {
    return payload;
  }

  let changed = false;
  const passkeys = payload.passkeys.map((passkey: VaultPasskey) => {
    const nextPrivateKey = transform(passkey.private_key);
    if (nextPrivateKey === passkey.private_key) {
      return passkey;
    }
    changed = true;
    return { ...passkey, private_key: nextPrivateKey };
  });

  return changed ? { ...payload, passkeys } : payload;
}

function hasPasskeyPrivateKey(
  payload: VaultEntryPayload,
  predicate: (privateKey: string) => boolean,
): boolean {
  return payload.entry_type === 'login' &&
    Array.isArray(payload.passkeys) &&
    payload.passkeys.some(passkey => predicate(passkey.private_key));
}

export function vaultItemHasPasskeyPrivateKey(item: ItemBase): boolean {
  if (item.type !== 'vault_entry') {
    return false;
  }
  try {
    const payload = JSON.parse(item.payload) as VaultEntryPayload;
    return hasPasskeyPrivateKey(payload, privateKey => Boolean(privateKey));
  } catch {
    return false;
  }
}

export function vaultItemHasUnprotectedPasskeyPrivateKey(item: ItemBase): boolean {
  if (item.type !== 'vault_entry') {
    return false;
  }
  try {
    const payload = JSON.parse(item.payload) as VaultEntryPayload;
    return hasPasskeyPrivateKey(payload, privateKey =>
      Boolean(privateKey) && !isEncryptedPasskeyPrivateKey(privateKey)
    );
  } catch {
    return false;
  }
}

function transformVaultPayload(
  payloadText: string,
  transform: (privateKey: string) => string,
): string {
  const payload = JSON.parse(payloadText) as VaultEntryPayload;
  if (payload.entry_type !== 'login') {
    return payloadText;
  }
  const transformed = transformPasskeys(payload, transform);
  return transformed === payload ? payloadText : JSON.stringify(transformed);
}

export function protectVaultItemPasskeysForRemote(item: ItemBase, secret?: string | null): ItemBase {
  if (item.type !== 'vault_entry') {
    return item;
  }
  if (!secret) {
    const payload = JSON.parse(item.payload) as VaultEntryPayload;
    if (hasPasskeyPrivateKey(payload, privateKey =>
      Boolean(privateKey) && !isEncryptedPasskeyPrivateKey(privateKey)
    )) {
      throw new Error('Passkey private key sync requires a sync password or sync key');
    }
    return item;
  }
  const payload = transformVaultPayload(item.payload, privateKey =>
    encryptPasskeyPrivateKey(privateKey, secret),
  );
  return payload === item.payload ? item : { ...item, payload };
}

export function restoreVaultItemPasskeysFromRemote(item: ItemBase, secret?: string | null): ItemBase {
  if (item.type !== 'vault_entry') {
    return item;
  }
  if (!secret) {
    const payload = JSON.parse(item.payload) as VaultEntryPayload;
    if (hasPasskeyPrivateKey(payload, privateKey =>
      isEncryptedPasskeyPrivateKey(privateKey)
    )) {
      throw new Error('Encrypted passkey private key sync requires a sync password or sync key');
    }
    return item;
  }
  const payload = transformVaultPayload(item.payload, privateKey =>
    decryptPasskeyPrivateKey(privateKey, secret),
  );
  return payload === item.payload ? item : { ...item, payload };
}
