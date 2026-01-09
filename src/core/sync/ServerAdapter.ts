import {
  StorageAdapter,
  RemoteChange,
  RemoteMeta,
  SyncCursor,
  ServerConfig,
} from './StorageAdapter';
import { ItemBase } from '@shared/types';

export class ServerAdapter implements StorageAdapter {
  private baseUrl: string;
  private apiKey?: string;
  private token?: string;

  constructor(config: ServerConfig) {
    this.baseUrl = config.url.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.token = config.token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Server request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request<{ status: string }>('GET', '/api/health');
      return true;
    } catch (error) {
      console.error('Server connection test failed:', error);
      return false;
    }
  }

  async getRemoteMeta(): Promise<RemoteMeta> {
    try {
      return await this.request<RemoteMeta>('GET', '/api/meta');
    } catch (error) {
      console.error('Failed to get remote meta:', error);
      return {
        version: '1.0',
        capabilities: ['items', 'resources', 'changes'],
        last_sync_time: null,
      };
    }
  }

  async putRemoteMeta(meta: RemoteMeta): Promise<boolean> {
    try {
      await this.request<void>('PUT', '/api/meta', meta);
      return true;
    } catch (error) {
      console.error('Failed to put remote meta:', error);
      return false;
    }
  }

  async listChanges(cursor: string | null, limit: number = 100): Promise<{
    changes: RemoteChange[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      params.set('limit', limit.toString());

      return await this.request<{
        changes: RemoteChange[];
        nextCursor: string | null;
        hasMore: boolean;
      }>('GET', `/api/changes?${params}`);
    } catch (error) {
      console.error('Failed to list changes:', error);
      return { changes: [], nextCursor: null, hasMore: false };
    }
  }

  async getItem(id: string): Promise<ItemBase | null> {
    try {
      return await this.request<ItemBase>('GET', `/api/items/${id}`);
    } catch (error) {
      console.error(`Failed to get item ${id}:`, error);
      return null;
    }
  }

  async putItem(item: ItemBase): Promise<{ success: boolean; remoteRev: string; error?: string }> {
    try {
      const result = await this.request<{ remoteRev: string }>(
        'PUT',
        `/api/items/${item.id}`,
        item
      );
      return { success: true, remoteRev: result.remoteRev };
    } catch (error) {
      const errorMessage = (error as Error).message || 'Unknown error';
      console.error(`Failed to put item ${item.id}:`, error);
      return { success: false, remoteRev: '', error: errorMessage };
    }
  }

  async deleteItem(id: string): Promise<boolean> {
    try {
      await this.request<void>('DELETE', `/api/items/${id}`);
      return true;
    } catch (error) {
      console.error(`Failed to delete item ${id}:`, error);
      return false;
    }
  }

  async getResource(id: string): Promise<Buffer | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/resources/${id}`, {
        headers: this.getHeaders(),
      });
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error(`Failed to get resource ${id}:`, error);
      return null;
    }
  }

  async putResource(id: string, data: Buffer, mimeType: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/resources/${id}`, {
        method: 'PUT',
        headers: {
          ...this.getHeaders(),
          'Content-Type': mimeType,
        },
        body: data as unknown as BodyInit,
      });
      return response.ok;
    } catch (error) {
      console.error(`Failed to put resource ${id}:`, error);
      return false;
    }
  }

  async deleteResource(id: string): Promise<boolean> {
    try {
      await this.request<void>('DELETE', `/api/resources/${id}`);
      return true;
    } catch (error) {
      console.error(`Failed to delete resource ${id}:`, error);
      return false;
    }
  }

  async getSyncCursor(): Promise<SyncCursor | null> {
    try {
      return await this.request<SyncCursor>('GET', '/api/sync/cursor');
    } catch (error) {
      return null;
    }
  }

  async setSyncCursor(cursor: SyncCursor): Promise<boolean> {
    try {
      await this.request<void>('PUT', '/api/sync/cursor', cursor);
      return true;
    } catch (error) {
      console.error('Failed to set sync cursor:', error);
      return false;
    }
  }

  // 清理过期的变更日志
  async cleanupChangeLogs(beforeTimestamp: number): Promise<number> {
    try {
      const result = await this.request<{ deleted: number }>(
        'DELETE',
        `/api/changes?before=${beforeTimestamp}`
      );
      return result.deleted;
    } catch (error) {
      console.error('Failed to cleanup change logs:', error);
      return 0;
    }
  }

  // 检查远端是否已有数据
  async hasExistingData(): Promise<boolean> {
    try {
      const result = await this.request<{ hasData: boolean; itemCount: number }>(
        'GET',
        '/api/items/count'
      );
      return result.hasData || result.itemCount > 0;
    } catch (error) {
      // 如果接口不存在，回退到检查元数据
      const meta = await this.getRemoteMeta();
      return meta.last_sync_time !== null;
    }
  }

  // 批量操作（服务器特有优化）
  async batchPutItems(items: ItemBase[]): Promise<{ success: boolean; results: Array<{ id: string; remoteRev: string }> }> {
    try {
      return await this.request<{ success: boolean; results: Array<{ id: string; remoteRev: string }> }>(
        'POST',
        '/api/items/batch',
        { items }
      );
    } catch (error) {
      console.error('Failed to batch put items:', error);
      return { success: false, results: [] };
    }
  }

  // 获取服务器状态
  async getServerStatus(): Promise<{
    healthy: boolean;
    version: string;
    storage: { used: number; total: number };
  }> {
    try {
      return await this.request<{
        healthy: boolean;
        version: string;
        storage: { used: number; total: number };
      }>('GET', '/api/status');
    } catch (error) {
      return { healthy: false, version: 'unknown', storage: { used: 0, total: 0 } };
    }
  }

  // 获取远端密钥指纹
  async getKeyFingerprint(): Promise<string | null> {
    try {
      const result = await this.request<{ fingerprint: string | null }>('GET', '/api/sync/key-fingerprint');
      return result.fingerprint;
    } catch (error) {
      console.error('Failed to get key fingerprint:', error);
      return null;
    }
  }

  // 保存密钥指纹
  async saveKeyFingerprint(fingerprint: string): Promise<boolean> {
    try {
      await this.request<void>('PUT', '/api/sync/key-fingerprint', { fingerprint });
      return true;
    } catch (error) {
      console.error('Failed to save key fingerprint:', error);
      return false;
    }
  }

  // 验证密钥指纹
  async verifyKeyFingerprint(localFingerprint: string): Promise<{ valid: boolean; remoteFingerprint: string | null }> {
    const remoteFingerprint = await this.getKeyFingerprint();

    if (remoteFingerprint === null) {
      // 远端没有指纹，这是首次同步，保存本地指纹
      await this.saveKeyFingerprint(localFingerprint);
      return { valid: true, remoteFingerprint: null };
    }

    // 验证指纹是否匹配
    const valid = remoteFingerprint === localFingerprint;
    return { valid, remoteFingerprint };
  }
}

export default ServerAdapter;
