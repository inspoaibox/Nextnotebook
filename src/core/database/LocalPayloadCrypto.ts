import { safeStorage } from 'electron';
import * as crypto from 'crypto';

const ENCRYPTED_PREFIX = 'mcenc:v1:';
const FALLBACK_KEY_SEED = 'mucheng-notes-local-payload-fallback-v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function isLocalPayloadEncrypted(payload: string): boolean {
  return payload.startsWith(ENCRYPTED_PREFIX);
}

function getFallbackKey(): Buffer {
  return crypto.createHash('sha256').update(FALLBACK_KEY_SEED).digest();
}

function isSafeStorageAvailable(): boolean {
  return Boolean(safeStorage?.isEncryptionAvailable?.());
}

function encryptWithFallback(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getFallbackKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return JSON.stringify({
    mode: 'fallback-aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}

function decryptWithFallback(encoded: string): string {
  const data = JSON.parse(encoded) as {
    iv: string;
    authTag: string;
    ciphertext: string;
  };
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getFallbackKey(),
    Buffer.from(data.iv, 'base64'),
    { authTagLength: AUTH_TAG_LENGTH }
  );
  decipher.setAuthTag(Buffer.from(data.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(data.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function encryptLocalPayload(payload: string): string {
  if (isLocalPayloadEncrypted(payload)) {
    return payload;
  }

  if (isSafeStorageAvailable()) {
    const encrypted = safeStorage.encryptString(payload);
    return `${ENCRYPTED_PREFIX}safe:${encrypted.toString('base64')}`;
  }

  return `${ENCRYPTED_PREFIX}fallback:${Buffer.from(encryptWithFallback(payload), 'utf8').toString('base64')}`;
}

export function decryptLocalPayload(payload: string): string {
  if (!isLocalPayloadEncrypted(payload)) {
    return payload;
  }

  const encoded = payload.slice(ENCRYPTED_PREFIX.length);
  const separator = encoded.indexOf(':');
  if (separator <= 0) {
    throw new Error('Invalid encrypted local payload format');
  }

  const mode = encoded.slice(0, separator);
  const data = encoded.slice(separator + 1);

  if (mode === 'safe') {
    if (!isSafeStorageAvailable()) {
      throw new Error('Local payload encryption is unavailable on this system');
    }
    return safeStorage.decryptString(Buffer.from(data, 'base64'));
  }

  if (mode === 'fallback') {
    return decryptWithFallback(Buffer.from(data, 'base64').toString('utf8'));
  }

  throw new Error(`Unsupported encrypted local payload mode: ${mode}`);
}
