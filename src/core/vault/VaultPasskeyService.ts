import * as crypto from 'crypto';
import { ItemBase, VaultEntryPayload, VaultPasskey, VaultUri } from '@shared/types';
import { ItemsManager } from '../database/ItemsManager';

const PASSKEY_JWK_PREFIX = 'jwk:';
const ES256_ALGORITHM = -7;
const PASSKEY_AAGUID = crypto
  .createHash('sha256')
  .update('mucheng-notes-software-passkey')
  .digest()
  .subarray(0, 16);

type CborValue = number | string | Buffer | CborValue[] | Map<CborValue, CborValue>;

export interface PasskeyCredentialDescriptor {
  id: string;
  type?: string;
  transports?: string[];
}

export interface PasskeyRegistrationRequest {
  origin?: string;
  url?: string;
  title?: string;
  challenge?: string;
  rp?: {
    id?: string;
    name?: string;
  };
  user?: {
    id?: string;
    name?: string;
    displayName?: string;
  };
  pubKeyCredParams?: Array<{
    type?: string;
    alg?: number;
  }>;
  excludeCredentials?: PasskeyCredentialDescriptor[];
  authenticatorSelection?: {
    userVerification?: string;
    residentKey?: string;
    requireResidentKey?: boolean;
  };
  attestation?: string;
}

export interface PasskeyAssertionRequest {
  origin?: string;
  url?: string;
  challenge?: string;
  rpId?: string;
  allowCredentials?: PasskeyCredentialDescriptor[];
  userVerification?: string;
}

export interface PasskeyCredentialResponse {
  id: string;
  rawId: string;
  type: 'public-key';
  authenticatorAttachment: 'platform';
  response: Record<string, string | string[] | null | number>;
  clientExtensionResults: Record<string, unknown>;
}

export interface PasskeyRegistrationResult {
  credential: PasskeyCredentialResponse;
  entry: {
    id: string;
    name: string;
    username: string;
  };
}

export interface PasskeyAssertionResult {
  credential: PasskeyCredentialResponse;
  entry: {
    id: string;
    name: string;
    username: string;
  };
}

export class VaultPasskeyError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly fallbackToNative = false,
  ) {
    super(message);
    this.name = 'VaultPasskeyError';
  }
}

export function toBase64Url(input: Buffer | Uint8Array | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

export function decodeStoredJwk(value: string): crypto.JsonWebKey {
  if (!value) {
    throw new Error('Passkey key material is empty');
  }

  const raw = value.startsWith(PASSKEY_JWK_PREFIX)
    ? fromBase64Url(value.slice(PASSKEY_JWK_PREFIX.length)).toString('utf8')
    : value;
  return JSON.parse(raw) as crypto.JsonWebKey;
}

function encodeStoredJwk(jwk: crypto.JsonWebKey): string {
  return `${PASSKEY_JWK_PREFIX}${toBase64Url(JSON.stringify(jwk))}`;
}

function encodeCborTypeAndLength(majorType: number, length: number): Buffer {
  if (length < 24) {
    return Buffer.from([(majorType << 5) | length]);
  }
  if (length <= 0xff) {
    return Buffer.from([(majorType << 5) | 24, length]);
  }
  if (length <= 0xffff) {
    const buffer = Buffer.alloc(3);
    buffer[0] = (majorType << 5) | 25;
    buffer.writeUInt16BE(length, 1);
    return buffer;
  }
  const buffer = Buffer.alloc(5);
  buffer[0] = (majorType << 5) | 26;
  buffer.writeUInt32BE(length, 1);
  return buffer;
}

function encodeCbor(value: CborValue): Buffer {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error('CBOR only supports integer numbers here');
    }
    return value >= 0
      ? encodeCborTypeAndLength(0, value)
      : encodeCborTypeAndLength(1, -1 - value);
  }

  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([encodeCborTypeAndLength(3, bytes.length), bytes]);
  }

  if (Buffer.isBuffer(value)) {
    return Buffer.concat([encodeCborTypeAndLength(2, value.length), value]);
  }

  if (Array.isArray(value)) {
    return Buffer.concat([
      encodeCborTypeAndLength(4, value.length),
      ...value.map(item => encodeCbor(item)),
    ]);
  }

  if (value instanceof Map) {
    const encodedEntries: Buffer[] = [];
    for (const [key, entryValue] of value.entries()) {
      encodedEntries.push(encodeCbor(key), encodeCbor(entryValue));
    }
    return Buffer.concat([encodeCborTypeAndLength(5, value.size), ...encodedEntries]);
  }

  throw new Error('Unsupported CBOR value');
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, '');
}

function normalizeUrlForMatch(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

function isSameOrSubdomain(candidateHost: string, targetHost: string): boolean {
  const candidate = normalizeHostname(candidateHost);
  const target = normalizeHostname(targetHost);
  return target === candidate || target.endsWith(`.${candidate}`);
}

function isIpAddress(hostname: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':');
}

function parseHttpUrl(value: string | undefined, fieldName: string): URL {
  if (!value) {
    throw new VaultPasskeyError(`${fieldName} 不能为空`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new VaultPasskeyError(`${fieldName} 无效`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new VaultPasskeyError(`${fieldName} 只支持 http/https 页面`);
  }

  return parsed;
}

function normalizeRpId(rpId: string | undefined, originUrl: URL): string {
  const candidate = (rpId || originUrl.hostname).trim().toLowerCase();
  if (
    !candidate ||
    candidate.includes('/') ||
    candidate.includes(':') ||
    candidate.startsWith('.') ||
    candidate.endsWith('.')
  ) {
    throw new VaultPasskeyError('rpId 无效');
  }

  const originHost = originUrl.hostname.toLowerCase();
  const valid = isIpAddress(originHost)
    ? candidate === originHost
    : originHost === candidate || originHost.endsWith(`.${candidate}`);

  if (!valid) {
    throw new VaultPasskeyError('rpId 与当前网页来源不匹配');
  }

  return candidate;
}

function decodeRequiredBuffer(value: string | undefined, fieldName: string): Buffer {
  if (!value) {
    throw new VaultPasskeyError(`${fieldName} 不能为空`);
  }

  const decoded = fromBase64Url(value);
  if (decoded.length === 0) {
    throw new VaultPasskeyError(`${fieldName} 无效`);
  }
  return decoded;
}

function buildClientDataJSON(type: 'webauthn.create' | 'webauthn.get', challenge: string, origin: string): Buffer {
  return Buffer.from(JSON.stringify({
    type,
    challenge,
    origin,
    crossOrigin: false,
  }), 'utf8');
}

function getAuthenticatorFlags(includeAttestedCredentialData: boolean): number {
  const userPresent = 0x01;
  const userVerified = 0x04;
  const backupEligible = 0x08;
  const backupState = 0x10;
  const attestedCredentialData = includeAttestedCredentialData ? 0x40 : 0x00;
  return userPresent | userVerified | backupEligible | backupState | attestedCredentialData;
}

function buildAuthenticatorData(
  rpId: string,
  signCount: number,
  attestedCredential?: {
    credentialId: Buffer;
    cosePublicKey: Buffer;
  },
): Buffer {
  const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
  const flags = Buffer.from([getAuthenticatorFlags(Boolean(attestedCredential))]);
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(Math.max(0, signCount), 0);

  if (!attestedCredential) {
    return Buffer.concat([rpIdHash, flags, counter]);
  }

  const credentialIdLength = Buffer.alloc(2);
  credentialIdLength.writeUInt16BE(attestedCredential.credentialId.length, 0);

  return Buffer.concat([
    rpIdHash,
    flags,
    counter,
    PASSKEY_AAGUID,
    credentialIdLength,
    attestedCredential.credentialId,
    attestedCredential.cosePublicKey,
  ]);
}

function jwkCoordinateToBuffer(value: string | undefined, name: string): Buffer {
  const decoded = value ? fromBase64Url(value) : Buffer.alloc(0);
  if (decoded.length !== 32) {
    throw new Error(`Invalid ${name} coordinate for P-256 public key`);
  }
  return decoded;
}

function buildCosePublicKey(publicJwk: crypto.JsonWebKey): Buffer {
  return encodeCbor(new Map<CborValue, CborValue>([
    [1, 2],
    [3, ES256_ALGORITHM],
    [-1, 1],
    [-2, jwkCoordinateToBuffer(publicJwk.x, 'x')],
    [-3, jwkCoordinateToBuffer(publicJwk.y, 'y')],
  ]));
}

function buildAttestationObject(authData: Buffer): Buffer {
  return encodeCbor(new Map<CborValue, CborValue>([
    ['fmt', 'none'],
    ['attStmt', new Map<CborValue, CborValue>()],
    ['authData', authData],
  ]));
}

function signAssertion(privateJwk: crypto.JsonWebKey, authenticatorData: Buffer, clientDataJSON: Buffer): Buffer {
  const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
  const signedBytes = Buffer.concat([authenticatorData, clientDataHash]);
  const signer = crypto.createSign('SHA256');
  signer.update(signedBytes);
  signer.end();
  return signer.sign({ key: privateJwk, format: 'jwk' });
}

function doesVaultUriMatch(uri: VaultUri, pageUrl: URL): boolean {
  if (uri.match_type === 'never') return false;

  const targetUrl = normalizeUrlForMatch(uri.uri);
  if (!targetUrl) return false;

  const pageHref = pageUrl.href.toLowerCase();
  const targetHref = targetUrl.href.toLowerCase();

  switch (uri.match_type) {
    case 'exact':
      return pageHref === targetHref;
    case 'host':
      return normalizeHostname(pageUrl.hostname) === normalizeHostname(targetUrl.hostname);
    case 'starts_with':
      return pageHref.startsWith(targetHref);
    case 'regex':
      try {
        return new RegExp(uri.uri).test(pageUrl.href);
      } catch {
        return false;
      }
    case 'domain':
    default:
      return isSameOrSubdomain(targetUrl.hostname, pageUrl.hostname);
  }
}

function createEmptyLoginPayload(
  rpId: string,
  rpName: string,
  username: string,
  pageUrl: URL,
  title?: string,
): VaultEntryPayload {
  const now = Date.now();
  const name = (title || '').trim() || rpName || rpId || 'Passkey 登录';
  return {
    name,
    entry_type: 'login',
    folder_id: null,
    favorite: false,
    notes: '',
    username,
    password: '',
    totp_secrets: [],
    uris: [{
      id: `uri_${now}`,
      name: rpId,
      uri: pageUrl.href,
      match_type: 'domain',
    }],
    passkeys: [],
    card_holder_name: '',
    card_number: '',
    card_brand: '',
    card_exp_month: '',
    card_exp_year: '',
    card_cvv: '',
    identity_title: '',
    identity_first_name: '',
    identity_last_name: '',
    identity_email: '',
    identity_phone: '',
    identity_address: '',
    custom_fields: [],
  };
}

function createPasskey(
  rpId: string,
  rpName: string,
  credentialId: Buffer,
  userId: string,
  userName: string,
  userDisplayName: string,
  publicJwk: crypto.JsonWebKey,
  privateJwk: crypto.JsonWebKey,
): VaultPasskey {
  const now = Date.now();
  return {
    id: `passkey_${now}_${crypto.randomBytes(4).toString('hex')}`,
    credential_type: 'public-key',
    rp_id: rpId,
    rp_name: rpName,
    credential_id: toBase64Url(credentialId),
    user_id: userId,
    user_name: userName,
    user_display_name: userDisplayName,
    public_key: encodeStoredJwk(publicJwk),
    private_key: encodeStoredJwk(privateJwk),
    sign_count: 0,
    algorithm: 'ES256',
    transports: ['internal'],
    backup_eligible: true,
    backup_state: true,
    created_at: now,
    last_used_at: null,
  };
}

export class VaultPasskeyService {
  constructor(private readonly itemsManager: ItemsManager) {}

  register(request: PasskeyRegistrationRequest): PasskeyRegistrationResult {
    const originUrl = parseHttpUrl(request.origin, 'origin');
    const pageUrl = request.url ? parseHttpUrl(request.url, 'url') : originUrl;
    const rpId = normalizeRpId(request.rp?.id, originUrl);
    const rpName = (request.rp?.name || rpId).trim() || rpId;
    const challenge = request.challenge || '';
    decodeRequiredBuffer(challenge, 'challenge');

    const supportsEs256 = !request.pubKeyCredParams?.length ||
      request.pubKeyCredParams.some(param => param.type === 'public-key' && param.alg === ES256_ALGORITHM);
    if (!supportsEs256) {
      throw new VaultPasskeyError('当前只支持 ES256 passkey', 422, true);
    }

    const userId = request.user?.id || '';
    decodeRequiredBuffer(userId, 'user.id');
    const userName = (request.user?.name || request.user?.displayName || '').trim();
    const userDisplayName = (request.user?.displayName || userName).trim();
    if (!userName && !userDisplayName) {
      throw new VaultPasskeyError('user.name 不能为空');
    }

    const excludeIds = new Set((request.excludeCredentials || [])
      .filter(credential => (credential.type || 'public-key') === 'public-key')
      .map(credential => credential.id));
    const existingForRp = this.getVaultEntriesForRp(rpId, pageUrl);
    const excluded = existingForRp.some(({ payload }) =>
      (payload.passkeys || []).some(passkey => excludeIds.has(passkey.credential_id))
    );
    if (excluded) {
      throw new VaultPasskeyError('该网站已存在可用的通行密钥', 409, false);
    }

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicJwk = publicKey.export({ format: 'jwk' });
    const privateJwk = privateKey.export({ format: 'jwk' });
    const credentialId = crypto.randomBytes(32);
    const passkey = createPasskey(
      rpId,
      rpName,
      credentialId,
      userId,
      userName || userDisplayName,
      userDisplayName || userName,
      publicJwk,
      privateJwk,
    );

    const target = this.findRegistrationTarget(existingForRp, userName, userId);
    const entry = target
      ? this.appendPasskeyToEntry(target.item, target.payload, passkey)
      : this.createPasskeyEntry(rpId, rpName, passkey.user_name, pageUrl, request.title, passkey);
    const payload = JSON.parse(entry.payload) as VaultEntryPayload;

    const cosePublicKey = buildCosePublicKey(publicJwk);
    const authenticatorData = buildAuthenticatorData(rpId, 0, {
      credentialId,
      cosePublicKey,
    });
    const attestationObject = buildAttestationObject(authenticatorData);
    const clientDataJSON = buildClientDataJSON('webauthn.create', challenge, originUrl.origin);

    return {
      credential: {
        id: passkey.credential_id,
        rawId: passkey.credential_id,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        response: {
          clientDataJSON: toBase64Url(clientDataJSON),
          attestationObject: toBase64Url(attestationObject),
          transports: passkey.transports,
          publicKeyAlgorithm: ES256_ALGORITHM,
        },
        clientExtensionResults: {},
      },
      entry: {
        id: entry.id,
        name: payload.name,
        username: payload.username,
      },
    };
  }

  assert(request: PasskeyAssertionRequest): PasskeyAssertionResult {
    const originUrl = parseHttpUrl(request.origin, 'origin');
    const pageUrl = request.url ? parseHttpUrl(request.url, 'url') : originUrl;
    const rpId = normalizeRpId(request.rpId, originUrl);
    const challenge = request.challenge || '';
    decodeRequiredBuffer(challenge, 'challenge');

    const allowIds = (request.allowCredentials || [])
      .filter(credential => (credential.type || 'public-key') === 'public-key')
      .map(credential => credential.id);
    const allowIdSet = new Set(allowIds);
    const candidates = this.getPasskeyCandidates(rpId, pageUrl)
      .filter(candidate => allowIds.length === 0 || allowIdSet.has(candidate.passkey.credential_id));

    if (candidates.length === 0) {
      throw new VaultPasskeyError('未找到匹配当前网站的通行密钥', 404, true);
    }

    const candidate = this.pickAssertionCandidate(candidates, allowIds);
    const nextSignCount = Math.max(0, candidate.passkey.sign_count || 0) + 1;
    const clientDataJSON = buildClientDataJSON('webauthn.get', challenge, originUrl.origin);
    const authenticatorData = buildAuthenticatorData(rpId, nextSignCount);
    const privateJwk = decodeStoredJwk(candidate.passkey.private_key);
    const signature = signAssertion(privateJwk, authenticatorData, clientDataJSON);

    const updatedPasskey: VaultPasskey = {
      ...candidate.passkey,
      sign_count: nextSignCount,
      last_used_at: Date.now(),
    };
    const updatedEntry = this.replacePasskey(candidate.item, candidate.payload, updatedPasskey);
    const payload = JSON.parse(updatedEntry.payload) as VaultEntryPayload;

    return {
      credential: {
        id: updatedPasskey.credential_id,
        rawId: updatedPasskey.credential_id,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        response: {
          authenticatorData: toBase64Url(authenticatorData),
          clientDataJSON: toBase64Url(clientDataJSON),
          signature: toBase64Url(signature),
          userHandle: updatedPasskey.user_id || null,
        },
        clientExtensionResults: {},
      },
      entry: {
        id: updatedEntry.id,
        name: payload.name,
        username: payload.username,
      },
    };
  }

  private getVaultEntriesForRp(
    rpId: string,
    pageUrl: URL,
  ): Array<{ item: ItemBase; payload: VaultEntryPayload }> {
    return this.itemsManager
      .getByType('vault_entry')
      .filter(item => !item.deleted_time)
      .map(item => {
        try {
          const payload = JSON.parse(item.payload) as VaultEntryPayload;
          if (payload.entry_type !== 'login') return null;
          const passkeyMatch = (payload.passkeys || []).some(passkey => passkey.rp_id === rpId);
          const uriMatch = (payload.uris || []).some(uri => doesVaultUriMatch(uri, pageUrl));
          return passkeyMatch || uriMatch ? { item, payload } : null;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is { item: ItemBase; payload: VaultEntryPayload } => Boolean(entry));
  }

  private findRegistrationTarget(
    entries: Array<{ item: ItemBase; payload: VaultEntryPayload }>,
    userName: string,
    userId: string,
  ): { item: ItemBase; payload: VaultEntryPayload } | null {
    const normalizedUserName = userName.trim().toLowerCase();
    return entries.find(({ payload }) =>
      normalizedUserName && payload.username.trim().toLowerCase() === normalizedUserName
    ) || entries.find(({ payload }) =>
      (payload.passkeys || []).some(passkey => passkey.user_id === userId)
    ) || null;
  }

  private appendPasskeyToEntry(item: ItemBase, payload: VaultEntryPayload, passkey: VaultPasskey): ItemBase {
    const updated = this.itemsManager.update(item.id, {
      passkeys: [...(payload.passkeys || []), passkey],
    });
    if (!updated) {
      throw new VaultPasskeyError('保存通行密钥失败', 500);
    }
    return updated;
  }

  private createPasskeyEntry(
    rpId: string,
    rpName: string,
    username: string,
    pageUrl: URL,
    title: string | undefined,
    passkey: VaultPasskey,
  ): ItemBase {
    const payload = createEmptyLoginPayload(rpId, rpName, username, pageUrl, title);
    payload.passkeys = [passkey];
    return this.itemsManager.create('vault_entry', payload);
  }

  private getPasskeyCandidates(rpId: string, pageUrl: URL): Array<{
    item: ItemBase;
    payload: VaultEntryPayload;
    passkey: VaultPasskey;
  }> {
    return this.getVaultEntriesForRp(rpId, pageUrl)
      .flatMap(({ item, payload }) =>
        (payload.passkeys || [])
          .filter(passkey => passkey.rp_id === rpId && passkey.credential_type === 'public-key')
          .map(passkey => ({ item, payload, passkey }))
      )
      .sort((a, b) => {
        const aUsed = a.passkey.last_used_at || a.passkey.created_at || a.item.updated_time;
        const bUsed = b.passkey.last_used_at || b.passkey.created_at || b.item.updated_time;
        return bUsed - aUsed;
      });
  }

  private pickAssertionCandidate(
    candidates: Array<{ item: ItemBase; payload: VaultEntryPayload; passkey: VaultPasskey }>,
    allowIds: string[],
  ): { item: ItemBase; payload: VaultEntryPayload; passkey: VaultPasskey } {
    if (allowIds.length === 0) {
      return candidates[0];
    }

    for (const id of allowIds) {
      const candidate = candidates.find(entry => entry.passkey.credential_id === id);
      if (candidate) {
        return candidate;
      }
    }
    return candidates[0];
  }

  private replacePasskey(item: ItemBase, payload: VaultEntryPayload, passkey: VaultPasskey): ItemBase {
    const updated = this.itemsManager.update(item.id, {
      passkeys: (payload.passkeys || []).map(existing =>
        existing.id === passkey.id ? passkey : existing
      ),
    });
    if (!updated) {
      throw new VaultPasskeyError('更新通行密钥使用状态失败', 500);
    }
    return updated;
  }
}
