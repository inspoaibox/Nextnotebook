import {
  StorageAdapter,
  RemoteChange,
  RemoteMeta,
  SyncCursor,
  ServerConfig,
} from './StorageAdapter';
import { ItemBase } from '@shared/types';

// 认证响应类型
interface AuthResponse {
  success: boolean;
  token?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: {
    id: number;
    username: string;
    role: string;
  };
  error?: string;
}

export class ServerAdapter implements StorageAdapter {
  private baseUrl: string;
  private apiKey?: string;
  private token?: string;
  private refreshToken?: string;
  private tokenExpires?: number;
  private onTokenRefresh?: (token: string, refreshToken: string, expiresIn: number) => void;

  constructor(config: ServerConfig) {
    this.baseUrl = config.url.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.token = config.token;
  }

  // 设置 token 刷新回调
  setTokenRefreshCallback(callback: (token: string, refreshToken: string, expiresIn: number) => void) {
    this.onTokenRefresh = callback;
  }

  // 设置认证信息
  setAuth(token: string, refreshToken?: string, tokenExpires?: number) {
    this.token = token;
    this.refreshToken = refreshToken;
    this.tokenExpires = tokenExpires;
  }

  // 登录
  async login(username: string, password: string, syncKey: string): Promise<AuthResponse> {
    try {
      const response = await this.doFetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, syncKey }),
      });

      const data = await response.json();
      
      // 服务器返回 accessToken，兼容两种字段名
      const token = data.accessToken || data.token;
      
      if (response.ok && token) {
        this.token = token;
        this.refreshToken = data.refreshToken;
        this.tokenExpires = Date.now() + (data.expiresIn || 3600) * 1000;
        return {
          success: true,
          token: token,
          refreshToken: data.refreshToken,
          expiresIn: data.expiresIn,
          user: data.user,
        };
      }
      
      return {
        success: false,
        error: data.error?.message || data.message || '登录失败',
      };
    } catch (error) {
      console.error('Login failed:', error);
      return {
        success: false,
        error: (error as Error).message || '网络错误',
      };
    }
  }

  // 注册
  async register(username: string, password: string, syncKey: string): Promise<AuthResponse> {
    try {
      const response = await this.doFetch(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, syncKey }),
      });

      const data = await response.json();
      
      if (response.ok && data.token) {
        this.token = data.token;
        this.refreshToken = data.refreshToken;
        this.tokenExpires = Date.now() + (data.expiresIn || 3600) * 1000;
        return {
          success: true,
          token: data.token,
          refreshToken: data.refreshToken,
          expiresIn: data.expiresIn,
          user: data.user,
        };
      }
      
      return {
        success: false,
        error: data.error?.message || data.message || '注册失败',
      };
    } catch (error) {
      console.error('Register failed:', error);
      return {
        success: false,
        error: (error as Error).message || '网络错误',
      };
    }
  }

  // 刷新 token
  async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) {
      return false;
    }

    try {
      const response = await this.doFetch(`${this.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        // 服务器返回 accessToken，兼容两种字段名
        const token = data.accessToken || data.token;
        this.token = token;
        this.refreshToken = data.refreshToken;
        this.tokenExpires = Date.now() + (data.expiresIn || 3600) * 1000;
        
        // 通知外部保存新 token
        if (this.onTokenRefresh) {
          this.onTokenRefresh(token, data.refreshToken, data.expiresIn);
        }
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  // 登出
  async logout(): Promise<void> {
    if (this.token) {
      try {
        await this.doFetch(`${this.baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: this.getHeaders(),
        });
      } catch (error) {
        console.error('Logout request failed:', error);
      }
    }
    this.token = undefined;
    this.refreshToken = undefined;
    this.tokenExpires = undefined;
  }

  // 检查是否已登录
  isAuthenticated(): boolean {
    return !!this.token;
  }

  // 检查 token 是否即将过期（5分钟内）
  isTokenExpiringSoon(): boolean {
    if (!this.tokenExpires) return false;
    return this.tokenExpires - Date.now() < 5 * 60 * 1000;
  }

  // 获取服务器注册状态
  async getRegistrationStatus(): Promise<{ registrationOpen: boolean; hasUsers: boolean }> {
    try {
      const response = await this.doFetch(`${this.baseUrl}/api/auth/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        return await response.json();
      }
      return { registrationOpen: true, hasUsers: false };
    } catch (error) {
      console.error('Failed to get registration status:', error);
      return { registrationOpen: true, hasUsers: false };
    }
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

  // 通用的 fetch 方法，支持 Electron 主进程
  private async doFetch(url: string, options: RequestInit): Promise<Response> {
    // 检查是否在 Electron 主进程中
    if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
      try {
        const { net } = require('electron');
        if (net && net.fetch) {
          return await net.fetch(url, options);
        }
      } catch (e) {
        // 回退到全局 fetch
      }
    }
    return await fetch(url, options);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retry = true
  ): Promise<T> {
    // 检查 token 是否即将过期，提前刷新
    if (this.isTokenExpiringSoon() && this.refreshToken) {
      await this.refreshAccessToken();
    }

    const url = `${this.baseUrl}${path}`;
    const response = await this.doFetch(url, {
      method,
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    // 处理 401 错误，尝试刷新 token
    if (response.status === 401 && retry && this.refreshToken) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return this.request<T>(method, path, body, false);
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || errorData.message || `${response.status} ${response.statusText}`;
      throw new Error(`Server request failed: ${errorMessage}`);
    }

    return response.json();
  }

  async testConnection(): Promise<boolean> {
    try {
      console.log('[ServerAdapter] testConnection called, baseUrl:', this.baseUrl);
      
      const url = `${this.baseUrl}/api/health`;
      console.log('[ServerAdapter] Fetching:', url);
      
      // 设置超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      try {
        // 尝试使用 Electron 的 net 模块（主进程）或全局 fetch（渲染进程）
        let response: Response;
        
        // 检查是否在 Electron 主进程中
        if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
          // 在 Electron 环境中，使用 Node.js 的 http/https 模块
          const { net } = require('electron');
          if (net && net.fetch) {
            console.log('[ServerAdapter] Using Electron net.fetch');
            response = await net.fetch(url, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
            });
          } else {
            // 回退到全局 fetch
            console.log('[ServerAdapter] Using global fetch');
            response = await fetch(url, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
            });
          }
        } else {
          // 非 Electron 环境，使用全局 fetch
          console.log('[ServerAdapter] Using global fetch (non-Electron)');
          response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
          });
        }
        
        clearTimeout(timeoutId);
        console.log('[ServerAdapter] Response status:', response.status, response.statusText);
        
        if (!response.ok) {
          console.error('[ServerAdapter] Server health check failed:', response.status, response.statusText);
          return false;
        }
        
        const data = await response.json();
        console.log('[ServerAdapter] Health check response:', data);
        return data.status === 'ok';
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error) {
      console.error('[ServerAdapter] Server connection test failed:', error);
      if (error instanceof Error) {
        console.error('[ServerAdapter] Error name:', error.name);
        console.error('[ServerAdapter] Error message:', error.message);
        if (error.name === 'AbortError') {
          console.error('[ServerAdapter] Request timed out');
        }
      }
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
      const response = await this.doFetch(`${this.baseUrl}/api/resources/${id}`, {
        method: 'GET',
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
      const response = await this.doFetch(`${this.baseUrl}/api/resources/${id}`, {
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
