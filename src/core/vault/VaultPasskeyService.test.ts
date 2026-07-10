import * as crypto from 'crypto';
import { ItemsManager } from '../database/ItemsManager';
import {
  decodeStoredJwk,
  fromBase64Url,
  toBase64Url,
  VaultPasskeyService,
} from './VaultPasskeyService';
import { ItemBase, ItemType, VaultEntryPayload } from '@shared/types';

class InMemoryItemsManager {
  private readonly items: ItemBase[] = [];

  create<T extends object>(type: ItemType, payload: T): ItemBase {
    const now = Date.now();
    const payloadString = JSON.stringify(payload);
    const item: ItemBase = {
      id: crypto.randomUUID(),
      type,
      created_time: now,
      updated_time: now,
      deleted_time: null,
      payload: payloadString,
      content_hash: crypto.createHash('sha256').update(payloadString).digest('hex').substring(0, 16),
      sync_status: 'modified',
      local_rev: 1,
      remote_rev: null,
      encryption_applied: 0,
      schema_version: 1,
    };
    this.items.push(item);
    return item;
  }

  getById(id: string): ItemBase | undefined {
    return this.items.find(item => item.id === id && !item.deleted_time);
  }

  getByType(type: ItemType): ItemBase[] {
    return this.items
      .filter(item => item.type === type && !item.deleted_time)
      .sort((a, b) => b.updated_time - a.updated_time);
  }

  update<T extends object>(id: string, payload: T): ItemBase | undefined {
    const item = this.getById(id);
    if (!item) return undefined;

    const nextPayload = {
      ...JSON.parse(item.payload),
      ...payload,
    };
    const payloadString = JSON.stringify(nextPayload);
    item.payload = payloadString;
    item.content_hash = crypto.createHash('sha256').update(payloadString).digest('hex').substring(0, 16);
    item.updated_time = Date.now();
    item.local_rev += 1;
    item.sync_status = 'modified';
    return item;
  }
}

describe('VaultPasskeyService', () => {
  let itemsManager: InMemoryItemsManager;
  let service: VaultPasskeyService;

  beforeEach(() => {
    itemsManager = new InMemoryItemsManager();
    service = new VaultPasskeyService(itemsManager as unknown as ItemsManager);
  });

  it('creates a synced vault passkey and signs an assertion with the stored key', () => {
    const userId = toBase64Url('user-123');
    const registerResult = service.register({
      origin: 'https://login.example.com',
      url: 'https://login.example.com/register',
      title: 'Example',
      challenge: toBase64Url('register-challenge'),
      rp: {
        id: 'example.com',
        name: 'Example',
      },
      user: {
        id: userId,
        name: 'alice@example.com',
        displayName: 'Alice',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    });

    const createdEntry = itemsManager.getById(registerResult.entry.id);
    expect(createdEntry).toBeDefined();
    const createdPayload = JSON.parse(createdEntry!.payload) as VaultEntryPayload;
    expect(createdPayload.passkeys).toHaveLength(1);
    expect(createdPayload.passkeys[0].rp_id).toBe('example.com');
    expect(createdPayload.passkeys[0].user_name).toBe('alice@example.com');
    expect(createdPayload.passkeys[0].private_key).toContain('jwk:');
    expect(registerResult.credential.response.attestationObject).toEqual(expect.any(String));

    const assertionResult = service.assert({
      origin: 'https://login.example.com',
      url: 'https://login.example.com/login',
      challenge: toBase64Url('assertion-challenge'),
      rpId: 'example.com',
      allowCredentials: [{
        type: 'public-key',
        id: registerResult.credential.id,
      }],
    });

    const updatedEntry = itemsManager.getById(registerResult.entry.id);
    expect(updatedEntry).toBeDefined();
    const updatedPayload = JSON.parse(updatedEntry!.payload) as VaultEntryPayload;
    const updatedPasskey = updatedPayload.passkeys[0];
    expect(updatedPasskey.sign_count).toBe(1);
    expect(updatedPasskey.last_used_at).toEqual(expect.any(Number));

    const authenticatorData = fromBase64Url(String(assertionResult.credential.response.authenticatorData));
    const clientDataJSON = fromBase64Url(String(assertionResult.credential.response.clientDataJSON));
    const signature = fromBase64Url(String(assertionResult.credential.response.signature));
    const signedBytes = Buffer.concat([
      authenticatorData,
      crypto.createHash('sha256').update(clientDataJSON).digest(),
    ]);

    const verifier = crypto.createVerify('SHA256');
    verifier.update(signedBytes);
    verifier.end();
    const publicJwk = decodeStoredJwk(updatedPasskey.public_key);
    expect(verifier.verify({ key: publicJwk, format: 'jwk' }, signature)).toBe(true);

    const clientData = JSON.parse(clientDataJSON.toString('utf8'));
    expect(clientData).toMatchObject({
      type: 'webauthn.get',
      challenge: toBase64Url('assertion-challenge'),
      origin: 'https://login.example.com',
      crossOrigin: false,
    });
  });

  it('appends a passkey to an existing matching login item', () => {
    const existing = itemsManager.create('vault_entry', {
      name: 'Existing Example Login',
      entry_type: 'login',
      folder_id: null,
      favorite: false,
      notes: '',
      username: 'alice@example.com',
      password: 'already-saved',
      totp_secrets: [],
      uris: [{
        id: 'uri_1',
        name: 'example.com',
        uri: 'https://example.com',
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
    });

    const result = service.register({
      origin: 'https://login.example.com',
      url: 'https://login.example.com/register',
      challenge: toBase64Url('register-existing'),
      rp: {
        id: 'example.com',
        name: 'Example',
      },
      user: {
        id: toBase64Url('user-456'),
        name: 'alice@example.com',
        displayName: 'Alice',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    });

    expect(result.entry.id).toBe(existing.id);
    const payload = JSON.parse(itemsManager.getById(existing.id)!.payload) as VaultEntryPayload;
    expect(payload.password).toBe('already-saved');
    expect(payload.passkeys).toHaveLength(1);
  });
});
