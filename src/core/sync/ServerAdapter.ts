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
  userId?: string;
  isAdmin?: boolean;
  initialized?: boolean;
  registrationEnabled?: boolean;
  error?: string;
  message?: string;
}

export class ServerAdapter implements StorageAdapter {
  private baseUrl: string;
  private apiKey?: string;
  private token?: string;
  private refreshToken?: string;
  private tokenExpires?: number;
  private onTokenRefresh?: (token: string, refreshToken: string, expiresIn: number) => void;
  private refreshPromise: Promise<boolean> | null = null;
  // 保存登录凭据用于自动重新登录
  private savedCredentials?: { username: string; password: string; syncKey: string };
  private onReloginRequired?: () => void;

  constructor(config: ServerConfig) {
    this.baseUrl = config.url.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.token = config.token;
  }

  // 设置 token 刷新回调
  setTokenRefreshCallback(callback: (token: string, refreshToken: string, expiresIn: number) => void) {
    this.onTokenRefresh = callback;
  }

  // 设置重新登录回调（当 refresh token 也过期时触发）
  setReloginRequiredCallback(callback: () => void) {
    this.onReloginRequired = callback;
  }

  // 保存登录凭据（用于自动重新登录）
  saveCredentials(username: string, password: string, syncKey: string) {
    this.savedCredentials = { username, password, syncKey };
  }

  // 清除保存的凭据
  clearCredentials() {
    this.savedCredentials = undefined;
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
      
      const token = data.accessToken || data.token;

      if (response.ok) {
        if (token) {
          this.token = token;
          this.refreshToken = data.refreshToken;
          this.tokenExpires = Date.now() + (data.expiresIn || 3600) * 1000;
        }

        return {
          success: true,
          token,
          refreshToken: data.refreshToken,
          expiresIn: data.expiresIn,
          user: data.user,
          userId: data.userId,
          isAdmin: data.isAdmin,
          message: data.message,
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
      // 没有 refresh token，尝试自动重新登录
      return this.tryAutoRelogin();
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
      
      // refresh token 无效或过期，尝试自动重新登录
      console.log('[ServerAdapter] Refresh token invalid, trying auto relogin...');
      return this.tryAutoRelogin();
    } catch (error) {
      console.error('Token refresh failed:', error);
      // 尝试自动重新登录
      return this.tryAutoRelogin();
    }
  }

  // 尝试自动重新登录
  private async tryAutoRelogin(): Promise<boolean> {
    if (!this.savedCredentials) {
      // 没有保存的凭据，通知需要重新登录
      if (this.onReloginRequired) {
        this.onReloginRequired();
      }
      return false;
    }

    try {
      console.log('[ServerAdapter] Attempting auto relogin...');
      const { username, password, syncKey } = this.savedCredentials;
      const result = await this.login(username, password, syncKey);
      
      if (result.success) {
        console.log('[ServerAdapter] Auto relogin successful');
        return true;
      }
      
      console.error('[ServerAdapter] Auto relogin failed:', result.error);
      // 登录失败，通知需要重新登录
      if (this.onReloginRequired) {
        this.onReloginRequired();
      }
      return false;
    } catch (error) {
      console.error('[ServerAdapter] Auto relogin error:', error);
      if (this.onReloginRequired) {
        this.onReloginRequired();
      }
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
      const response = await this.doFetch(`${this.baseUrl}/api/health/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        return {
          registrationOpen: data.registrationEnabled ?? data.registrationOpen ?? true,
          hasUsers: data.initialized ?? data.hasUsers ?? false,
        };
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

  // 安全的 token 刷新方法，防止并发刷新
  private async safeRefreshToken(): Promise<boolean> {
    // 如果已经有刷新请求在进行中，等待它完成
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // 创建新的刷新请求
    this.refreshPromise = this.refreshAccessToken().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retry = true
  ): Promise<T> {
    // 检查 token 是否即将过期，提前刷新（使用锁防止并发刷新）
    if (this.isTokenExpiringSoon() && this.refreshToken) {
      await this.safeRefreshToken();
    }

    const url = `${this.baseUrl}${path}`;
    const response = await this.doFetch(url, {
      method,
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    // 处理 401 错误，尝试刷新 token
    if (response.status === 401 && retry && this.refreshToken) {
      const refreshed = await this.safeRefreshToken();
      if (refreshed) {
        return this.request<T>(method, path, body, false);
      }
      // 刷新失败，抛出更明确的错误
      throw new Error('Token refresh failed: 登录已过期，请重新登录');
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

  // ============ 分块上传（大文件 / 断点续传）============
  // 对应服务端 sync-server/src/routes/resourceUpload.ts 的 5 个端点。
  // JSON 控制类端点用 request<T>()（自带 token 自动刷新 + 401 重试）；
  // 分块 PUT 用 doFetch() 直接传原始二进制，手动做一次 401 刷新重试。

  hasChunkedUpload(): boolean {
    return true;
  }

  async createChunkedUpload(params: {
    itemId: string;
    totalSize: number;
    chunkSize: number;
    extension?: string;
  }): Promise<{ sessionId: string; chunkSize: number; totalChunks: number }> {
    return this.request<{
      session_id: string;
      chunk_size: number;
      total_chunks: number;
    }>('POST', '/api/resources/upload', {
      item_id: params.itemId,
      total_size: params.totalSize,
      chunk_size: params.chunkSize,
      extension: params.extension,
    }).then((r) => ({
      sessionId: r.session_id,
      chunkSize: r.chunk_size,
      totalChunks: r.total_chunks,
    }));
  }

  async uploadChunk(params: {
    sessionId: string;
    chunkIndex: number;
    data: Buffer;
  }): Promise<{ accepted: boolean; duplicate: boolean }> {
    const path = `/api/resources/upload/${encodeURIComponent(params.sessionId)}/chunk`;
    const doRequest = (): Promise<Response> =>
      this.doFetch(`${this.baseUrl}${path}`, {
        method: 'PUT',
        headers: {
          ...this.getHeaders(),
          // 原始二进制，不能让 Content-Type 停在 application/json
          'Content-Type': 'application/octet-stream',
          'X-Chunk-Index': String(params.chunkIndex),
        },
        body: params.data as unknown as BodyInit,
      });

    let response = await doRequest();

    // 与 request<T> 保持一致的 401 重试语义
    if (response.status === 401 && this.refreshToken) {
      const refreshed = await this.safeRefreshToken();
      if (refreshed) {
        response = await doRequest();
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        errorData.error?.message || errorData.message || `${response.status} ${response.statusText}`;
      throw new Error(`Upload chunk ${params.chunkIndex} failed: ${errorMessage}`);
    }

    const result = await response.json();
    return {
      accepted: result.accepted === true,
      duplicate: result.duplicate === true,
    };
  }

  async completeChunkedUpload(sessionId: string): Promise<{
    success: boolean;
    size: number;
    sha256: string;
    location?: string;
  }> {
    const path = `/api/resources/upload/${encodeURIComponent(sessionId)}/complete`;
    const result = await this.request<{
      success: boolean;
      item_id: string;
      location?: string;
      size: number;
      sha256: string;
    }>('POST', path);
    return {
      success: result.success === true,
      size: result.size,
      sha256: result.sha256,
      location: result.location,
    };
  }

  async getUploadStatus(sessionId: string): Promise<{
    totalChunks: number;
    chunkSize: number;
    totalSize: number;
    uploadedChunks: number[];
    completed: boolean;
  }> {
    const path = `/api/resources/upload/${encodeURIComponent(sessionId)}/status`;
    const result = await this.request<{
      total_chunks: number;
      chunk_size: number;
      total_size: number;
      uploaded_chunks: number[];
      completed: boolean;
    }>('GET', path);
    return {
      totalChunks: result.total_chunks,
      chunkSize: result.chunk_size,
      totalSize: result.total_size,
      uploadedChunks: result.uploaded_chunks || [],
      completed: result.completed === true,
    };
  }

  async abortChunkedUpload(sessionId: string): Promise<void> {
    try {
      await this.request<void>(
        'DELETE',
        `/api/resources/upload/${encodeURIComponent(sessionId)}`
      );
    } catch (error) {
      // 中止失败不抛，记录即可，服务端会按 TTL 自动回收
      console.warn(`[ServerAdapter] abortChunkedUpload(${sessionId}) failed:`, error);
    }
  }

  /**
   * 非分块流式上传（走标准 PUT /api/resources/:id）。
   * 当 CloudDriveScheduler 检测到分块能力不可用、或文件很小（< chunkSize）
   * 时使用。body 直接是 Buffer，由 Electron net.fetch 流式发送。
   */
  async streamUploadFile(params: {
    itemId: string;
    filePath: string;
    size: number;
    extension?: string;
    mimeType?: string;
  }): Promise<{ success: boolean; size: number; sha256: string }> {
    const crypto = await import('crypto');
    const fs = await import('fs');
    const data = fs.readFileSync(params.filePath);
    const ok = await this.putResource(params.itemId, data, params.mimeType || 'application/octet-stream');
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    return { success: ok, size: data.length, sha256 };
  }

  // ============ Range/206 下载（大文件 / 断点续传）============
  // 对应服务端 sync-server/src/routes/resources.ts 的 GET /api/resources/:id
  // （已支持 Accept-Ranges + Content-Range + 206 Partial Content）。
  // 与分块上传对称：JSON 用 request<T>()，二进制 Range GET 用 doFetch() 手动 401 重试。

  hasRangeDownload(): boolean {
    return true;
  }

  /**
   * 用 Range: bytes=0-0 探测远端文件元信息（size 从 Content-Range 解析）。
   * 返回 null 表示文件不存在或不可达。
   */
  async getRemoteFileInfo(itemId: string): Promise<{ size: number; mtime: number | null; mimeType: string | null } | null> {
    const doRequest = (): Promise<Response> =>
      this.doFetch(`${this.baseUrl}/api/resources/${itemId}`, {
        method: 'GET',
        headers: { ...this.getHeaders(), Range: 'bytes=0-0' },
      });

    try {
      let response = await doRequest();
      // 与 uploadChunk 保持一致的 401 刷新重试语义
      if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.safeRefreshToken();
        if (refreshed) {
          response = await doRequest();
        }
      }
      if (!response.ok && response.status !== 206) return null;

      const contentRange = response.headers.get('content-range') || '';
      // 格式: "bytes 0-0/12345"
      const match = contentRange.match(/\/(\d+)/);
      const size = match
        ? parseInt(match[1], 10)
        : parseInt(response.headers.get('content-length') || '0', 10);
      const mimeType = response.headers.get('content-type');
      // 消费 body 防止 socket 泄漏
      await response.arrayBuffer().catch(() => {});
      return { size, mtime: null, mimeType };
    } catch (error) {
      console.error(`[ServerAdapter] getRemoteFileInfo(${itemId}) failed:`, error);
      return null;
    }
  }

  /**
   * 按 Range 下载一段字节并写入 destPath。
   * - start === 0：覆盖写（flags: 'w'），用于新下载或重新开始。
   * - start  > 0：追加写（flags: 'a'），用于断点续传，调用方需保证文件已存在 start 字节。
   * - chunkSize === 0：下载 start 起到文件末尾的全部剩余字节。
   * 失败抛错；成功返回本次写入字节数。
   */
  async downloadFile(params: {
    itemId: string;
    start: number;
    chunkSize: number;
    destPath: string;
    signal?: AbortSignal;
    onProgress?: (receivedBytes: number) => void;
  }): Promise<{ bytesWritten: number }> {
    const fs = await import('fs');
    const end = params.chunkSize > 0 ? params.start + params.chunkSize - 1 : undefined;
    const rangeHeader =
      end !== undefined ? `bytes=${params.start}-${end}` : `bytes=${params.start}-`;

    const doRequest = (): Promise<Response> =>
      this.doFetch(`${this.baseUrl}/api/resources/${params.itemId}`, {
        method: 'GET',
        headers: { ...this.getHeaders(), Range: rangeHeader },
        signal: params.signal,
      });

    let response = await doRequest();
    // 401 刷新重试
    if (response.status === 401 && this.refreshToken) {
      const refreshed = await this.safeRefreshToken();
      if (refreshed) {
        response = await doRequest();
      }
    }
    // 200（服务端不支持 Range 时整文件）或 206 都可接受
    if (!response.ok && response.status !== 206) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        errorData?.error?.message || errorData?.message || `${response.status} ${response.statusText}`;
      throw new Error(`Download ${params.itemId} @${params.start} failed: ${errorMessage}`);
    }

    // start===0 覆盖；否则追加续传
    const fileStream = fs.createWriteStream(params.destPath, {
      flags: params.start > 0 ? 'a' : 'w',
    });

    const reader = response.body?.getReader();
    if (!reader) {
      fileStream.end();
      throw new Error(`Download ${params.itemId}: empty response body`);
    }

    let written = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        // 用回调串行写入，避免反压导致内存堆积
        await new Promise<void>((resolve, reject) => {
          fileStream.write(chunk, (err) => (err ? reject(err) : resolve()));
        });
        written += chunk.byteLength;
        params.onProgress?.(chunk.byteLength);
      }
      await new Promise<void>((resolve, reject) => {
        fileStream.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
      });
    } catch (err) {
      // 中途失败要主动销毁流，确保 fd 释放
      fileStream.destroy();
      // 尝试取消 reader，避免悬挂的 socket
      await reader.cancel().catch(() => {});
      throw err;
    }

    return { bytesWritten: written };
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

  // 检查游标是否已过期（游标对应的变更记录已被清理）
  async isCursorExpired(cursor: string): Promise<boolean> {
    try {
      const result = await this.request<{ expired: boolean }>(
        'GET',
        `/api/changes/cursor-check?cursor=${encodeURIComponent(cursor)}`
      );
      return result.expired;
    } catch (error) {
      console.error('[ServerAdapter] isCursorExpired check failed:', error);
      return false;
    }
  }

  // 全量拉取所有 item（新客户端首次同步使用，绕过变更日志）
  async listAllItems(): Promise<ItemBase[]> {
    try {
      const result = await this.request<{ items: ItemBase[]; latestChangeId?: number }>('GET', '/api/items/all');
      console.log(`[ServerAdapter] listAllItems: got ${result.items?.length ?? 0} items, latestChangeId: ${result.latestChangeId}`);
      // 保存 latestChangeId 供 SyncEngine 使用（注意：0 也是有效值，表示 changes 表为空）
      this._lastFullPullChangeId = result.latestChangeId ?? null;
      return result.items || [];
    } catch (error) {
      console.error('[ServerAdapter] listAllItems failed:', error);
      return [];
    }
  }

  // 全量拉取后的最新 change_id
  _lastFullPullChangeId: number | null = null;

  getLastFullPullChangeId(): number | null {
    return this._lastFullPullChangeId;
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
