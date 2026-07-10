import { ItemBase, VaultEntryPayload } from '@shared/types';
import {
  protectVaultItemPasskeysForRemote,
  restoreVaultItemPasskeysFromRemote,
  vaultItemHasUnprotectedPasskeyPrivateKey,
} from './VaultPasskeyFieldCrypto';

function createVaultItem(privateKey: string): ItemBase {
  const payload: VaultEntryPayload = {
    name: 'Example',
    entry_type: 'login',
    folder_id: null,
    favorite: false,
    notes: '',
    username: 'user@example.com',
    password: '',
    totp_secrets: [],
    uris: [],
    passkeys: [
      {
        id: 'passkey-1',
        credential_type: 'public-key',
        rp_id: 'example.com',
        rp_name: 'Example',
        credential_id: 'credential-id',
        user_id: 'user-id',
        user_name: 'user@example.com',
        user_display_name: 'Example User',
        public_key: 'public-key',
        private_key: privateKey,
        sign_count: 1,
        algorithm: 'ES256',
        transports: ['internal'],
        backup_eligible: false,
        backup_state: false,
        created_at: 1000,
        last_used_at: null,
      },
    ],
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

  return {
    id: 'item-1',
    type: 'vault_entry',
    created_time: 1000,
    updated_time: 1000,
    deleted_time: null,
    payload: JSON.stringify(payload),
    content_hash: 'hash',
    sync_status: 'modified',
    local_rev: 1,
    remote_rev: null,
    encryption_applied: 0,
    schema_version: 1,
  };
}

describe('VaultPasskeyFieldCrypto', () => {
  it('encrypts passkey private keys before remote sync and restores them locally', () => {
    const localItem = createVaultItem('jwk:private-key-material');
    const remoteItem = protectVaultItemPasskeysForRemote(localItem, 'sync-secret');
    const remotePayload = JSON.parse(remoteItem.payload) as VaultEntryPayload;

    expect(vaultItemHasUnprotectedPasskeyPrivateKey(localItem)).toBe(true);
    expect(vaultItemHasUnprotectedPasskeyPrivateKey(remoteItem)).toBe(false);
    expect(remotePayload.passkeys[0].private_key).toMatch(/^enc:v1:/);
    expect(remotePayload.passkeys[0].private_key).not.toContain('private-key-material');

    const restoredItem = restoreVaultItemPasskeysFromRemote(remoteItem, 'sync-secret');
    const restoredPayload = JSON.parse(restoredItem.payload) as VaultEntryPayload;
    expect(restoredPayload.passkeys[0].private_key).toBe('jwk:private-key-material');
  });

  it('does not upload plaintext passkey private keys when no sync secret is available', () => {
    const localItem = createVaultItem('jwk:private-key-material');

    expect(() => protectVaultItemPasskeysForRemote(localItem, null)).toThrow(
      /sync password or sync key/,
    );
  });
});
