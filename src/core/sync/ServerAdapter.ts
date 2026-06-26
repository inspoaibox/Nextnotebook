import {
  StorageAdapter,
  RemoteChange,
  RemoteMeta,
  SyncCursor,
  ServerConfig,
} from './StorageAdapter';
import { ItemBase } from '@shared/types';
import * as http from 'http';
import * as https from 'https';

type RequestInitWithDuplex = RequestInit & { duplex?: 'half' };

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

  // ====== Phase 3：传输鲁棒性（超时 + 重试 + 连接池） ======
  // 默认值与服务端 DEFAULT_CLOUD_DRIVE_CONFIG 对齐；ServerConfig 可覆盖。
  private uploadTimeoutMs: number;
  private uploadRetryCount: number;
  private uploadRetryBackoffBaseMs: number;
  private keepAlive: boolean;
  private maxSockets: number;
  /** 按 baseUrl 协议惰性创建的连接池 Agent（http/https 各一）。 */
  private httpAgent: http.Agent | null = null;
  private httpsAgent: https.Agent | null = null;

  constructor(config: ServerConfig) {
    this.baseUrl = config.url.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.token = config.token;
    // 传输参数：缺失时回退到内置默认（与桌面端 CloudDriveConfig 默认值一致）
    this.uploadTimeoutMs = config.upload_timeout_ms ?? 60000;
    this.uploadRetryCount = config.upload_retry_count ?? 3;
    this.uploadRetryBackoffBaseMs = config.upload_retry_backoff_base_ms ?? 1000;
    this.keepAlive = config.keep_alive ?? true;
    this.maxSockets = config.max_sockets ?? 16;
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

  /**
   * 惰性创建并复用连接池 Agent（keepAlive + maxSockets）。
   * 仅在 Node.js 原生 fetch 下生效（Electron net.fetch 不支持 dispatcher/agent）。
   */
  private getAgent(): http.Agent | https.Agent | undefined {
    if (!this.keepAlive) return undefined;
    const isHttps = this.baseUrl.startsWith('https://');
    if (isHttps) {
      if (!this.httpsAgent) {
        this.httpsAgent = new https.Agent({
          keepAlive: true,
          maxSockets: this.maxSockets,
        });
      }
      return this.httpsAgent;
    }
    if (!this.httpAgent) {
      this.httpAgent = new http.Agent({
        keepAlive: true,
        maxSockets: this.maxSockets,
      });
    }
    return this.httpAgent;
  }

  private withFetchSignal(options: RequestInit, signal: AbortSignal): RequestInitWithDuplex {
    const fetchOpts: RequestInitWithDuplex = { ...options, signal };
    const body = fetchOpts.body;
    if (
      body &&
      typeof ReadableStream !== 'undefined' &&
      body instanceof ReadableStream
    ) {
      fetchOpts.duplex = 'half';
    }
    return fetchOpts;
  }

  private isElectronRuntime(): boolean {
    return typeof process !== 'undefined' && !!process.versions?.electron;
  }

  /**
   * 判断某错误/响应是否"值得重试"（瞬时性故障）：
   *  - 网络层错误（fetch reject）
   *  - 408 / 429 / 5xx
   * 401（鉴权）由调用方经 safeRefreshToken 处理，不算重试。
   */
  private isRetryableStatus(status: number): boolean {
    return status === 408 || status === 429 || (status >= 500 && status <= 599);
  }

  /**
   * 计算指数退避等待时长：base * 2^attempt，封顶 30s。
   * attempt 从 0 起（首次重试 = attempt 0）。
   */
  private backoffDelay(attempt: number): number {
    const raw = this.uploadRetryBackoffBaseMs * Math.pow(2, attempt);
    return Math.min(raw, 30000);
  }

  /**
   * 单次底层 fetch（含超时）。超时通过 AbortController 实现，并把
   * 外部 signal（如 pause/cancel）与超时合并到同一个 abort 信号上。
   *
   * 注意：options 里的 signal 可能为 undefined；这里保证只有当它被 abort
   * 时才标记 externalAbort，超时仅做本次请求的取消。
   */
  private async doFetchOnce(
    url: string,
    options: RequestInit,
    externalSignal?: AbortSignal
  ): Promise<Response> {
    const controller = new AbortController();
    // 合并外部 abort：监听一次，转发到 controller
    const onExternalAbort = () => {
      if (!controller.signal.aborted) controller.abort((externalSignal as any)?.reason);
    };
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort((externalSignal as any)?.reason);
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    // 超时定时器
    let timer: NodeJS.Timeout | undefined;
    if (this.uploadTimeoutMs > 0) {
      timer = setTimeout(() => controller.abort(new Error('request timeout')), this.uploadTimeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
    }

    const isElectron = this.isElectronRuntime();
    const agent = this.getAgent();
    try {
      // 优先 Electron net.fetch（无 dispatcher 概念，忽略 agent）；
      // 否则用 Node 原生 fetch 并经 dispatcher 复用连接池。
      if (isElectron) {
        let electronFetch: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;
        try {
          const { net } = require('electron');
          if (net && net.fetch) {
            electronFetch = net.fetch.bind(net);
          }
        } catch {
          electronFetch = null;
        }
        if (electronFetch) {
          // net.fetch 请求一旦开始，body 可能已被消费。不能在这里 catch 后
          // 再把同一个 body 交给全局 fetch，否则会触发
          // "Response body object should not be disturbed or locked"。
          return await electronFetch(url, this.withFetchSignal(options, controller.signal));
        }
      }
      const fetchOpts: any = this.withFetchSignal(options, controller.signal);
      if (agent) {
        // undici / Node fetch 通过 dispatcher 接收 Agent
        fetchOpts.dispatcher = agent;
      }
      return await fetch(url, fetchOpts);
    } catch (err) {
      // 把 abort 原因外抛，区分"外部取消"与"超时"
      if (controller.signal.aborted) {
        if (externalSignal?.aborted) throw err;
        throw new Error('请求超时或被中止');
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }

  /**
   * 通用的 fetch 方法：在单次请求之上叠加超时 + 指数退避重试 + 连接池。
   *
   * 重试策略：
   *   - 仅对瞬时故障重试：网络错误（reject）、408/429/5xx、超时。
   *   - 总尝试次数 = 1 + uploadRetryCount。
   *   - 每次失败后等待 backoffDelay(attempt) 再重试。
   *   - 401 不在此处理（由调用方 request<T>/uploadChunk 走 token 刷新）。
   *   - 外部 signal 一旦 abort，立即抛出不再重试（响应用户 pause/cancel）。
   *
   * 返回的 Response 是最后一次尝试的结果（成功或不可重试的错误响应）。
   */
  private async doFetch(
    url: string,
    options: RequestInit,
    externalSignal?: AbortSignal,
    bodyFactory?: () => BodyInit,
    maxAttemptsOverride?: number
  ): Promise<Response> {
    const maxAttempts =
      maxAttemptsOverride != null
        ? Math.max(1, maxAttemptsOverride)
        : 1 + Math.max(0, this.uploadRetryCount);
    let lastError: unknown = null;
    let lastResponse: Response | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // 外部取消优先，不浪费重试预算
      if (externalSignal?.aborted) throw new Error('aborted');

      // 流式 body（ReadableStream）只能被消费一次：重试时由 bodyFactory 重新构造，
      // 例如基于同一 Buffer 切片重新生成进度上报流。非流式 body 无需 bodyFactory。
      const attemptOpts = bodyFactory ? { ...options, body: bodyFactory() } : options;

      try {
        const response = await this.doFetchOnce(url, attemptOpts, externalSignal);
        if (response.ok || !this.isRetryableStatus(response.status)) {
          return response; // 成功 或 不可重试错误（4xx 除 408/429）→ 立即返回
        }
        lastResponse = response;
        // 可重试的 HTTP 错误：消费 body 释放连接后进入退避
        try { await response.text(); } catch { /* 忽略 */ }
      } catch (err) {
        // 外部主动取消：不重试，直接抛
        if (externalSignal?.aborted || (err instanceof Error && /aborted/.test(err.message))) {
          throw err;
        }
        lastError = err;
        lastResponse = null;
      }

      // 还有下一次尝试才退避等待
      if (attempt < maxAttempts - 1) {
        const delay = this.backoffDelay(attempt);
        await new Promise<void>(resolve => {
          let retryTimer: NodeJS.Timeout | undefined;
          const cleanup = () => {
            if (retryTimer) clearTimeout(retryTimer);
            if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
          };
          const onAbort = () => {
            cleanup();
            resolve();
          };
          const onTimer = () => {
            cleanup();
            resolve();
          };
          retryTimer = setTimeout(onTimer, delay);
          if (typeof retryTimer.unref === 'function') retryTimer.unref();
          // 等待期间被外部取消：提前唤醒并抛出
          if (externalSignal) {
            externalSignal.addEventListener('abort', onAbort, { once: true });
          }
        });
        if (externalSignal?.aborted) throw new Error('aborted');
      }
    }

    // 所有尝试都失败：优先抛出网络错误，其次构造 Response 不可重试错误
    if (lastResponse) return lastResponse;
    throw lastError instanceof Error
      ? lastError
      : new Error('请求失败（已耗尽重试次数）');
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
    /**
     * 外部取消信号（来自 scheduler 的 pause/cancel）。注意：必须作为 doFetch
     * 的第 3 个参数 externalSignal 传入——doFetchOnce 会用自己的
     * controller.signal 覆盖 options.signal，故 options.signal 无效。
     */
    signal?: AbortSignal;
    /**
     * 字节级进度回调：分块流式发送时按「本次分块已发送字节」触发。
     * 调用方据此把进度换算成整文件 uploaded_bytes 并推送 UI，
     * 使单块小文件也能呈现平滑进度（而非 0%→100% 跳变）。
     * 对齐 downloadFile.onProgress 语义。
     */
    onUploadProgress?: (sentBytes: number) => void;
  }): Promise<{ accepted: boolean; duplicate: boolean }> {
    const path = `/api/resources/upload/${encodeURIComponent(params.sessionId)}/chunk`;
    const headers = {
      ...this.getHeaders(),
      // 原始二进制，不能让 Content-Type 停在 application/json
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(params.data.byteLength),
      'X-Chunk-Index': String(params.chunkIndex),
    };

    // 当调用方需要进度回调时，构造流式 body：按固定 slice 大小从 Buffer 切片推送，
    // 每片发送后回调累计已发送字节。ReadableStream 只能消费一次，故用 bodyFactory
    // 让 doFetch 的重试机制每次重新构造流（基于同一 Buffer，安全）。
    // 无回调时走快速路径，整块直接作为 body（与历史行为一致，省一次包装）。
    //
    // Electron net.fetch 对 ReadableStream 上传 body 不稳定：安装版日志中出现过
    // "Response body object should not be disturbed or locked"。桌面端改走 Buffer body，
    // 成功后按分块粒度回调进度，避免请求 body 被锁死后重试/下一块直接失败。
    const useStream =
      typeof params.onUploadProgress === 'function' &&
      !this.isElectronRuntime();
    const SLICE = 64 * 1024; // 64KB / 片：与底层 socket buffer 量级匹配，回调频次适中
    const buildBody = (): BodyInit => {
      const data = params.data;
      const onProgress = params.onUploadProgress!;
      let offset = 0;
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (cancelled) return;
          if (params.signal?.aborted) {
            cancelled = true;
            controller.error(new Error('aborted'));
            return;
          }
          if (offset >= data.byteLength) {
            cancelled = true;
            controller.close();
            return;
          }

          const end = Math.min(offset + SLICE, data.byteLength);
          // slice 复制底层内存，避免 controller 入队后原 Buffer 被复用
          controller.enqueue(new Uint8Array(data.subarray(offset, end)));
          offset = end;
          try {
            onProgress(offset);
          } catch {
            /* 进度回调失败不影响传输 */
          }
          if (offset >= data.byteLength) {
            cancelled = true;
            controller.close();
          }
        },
        cancel() {
          cancelled = true;
        },
      });
      return stream as unknown as BodyInit;
    };

    const doRequest = (): Promise<Response> =>
      this.doFetch(
        `${this.baseUrl}${path}`,
        {
          method: 'PUT',
          headers,
          // 流式时省略 body（交给 bodyFactory 按尝试次数重建）；快速路径直接放 body
          ...(useStream ? {} : { body: params.data as unknown as BodyInit }),
        },
        params.signal,
        useStream ? buildBody : undefined,
        1,
      );

    let response = await doRequest();

    // 与 request<T> 保持一致的 401 重试语义（doFetch 已处理 408/429/5xx + 超时 + 退避）
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
    if (!useStream && typeof params.onUploadProgress === 'function') {
      try {
        params.onUploadProgress(params.data.byteLength);
      } catch {
        /* 进度回调失败不影响传输 */
      }
    }
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
    try {
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
    } catch (error) {
      // 服务端 /complete 非幂等：拼接分块、改名、删 session 一次性完成。
      // 若本次调用因网络抖动失败，但服务端实际已完成，重试会得到 404（session 已删）。
      // 这里查一次状态：若已 completed，视为成功，避免误判为失败导致重传整个文件。
      try {
        const status = await this.getUploadStatus(sessionId);
        if (status.completed) {
          // session 仍在且标记完成——说明刚好在删除前查到，视为成功。
          // size/sha256 此处拿不到精确值，调用方上传流程本就持有本地 size/sha256，可接受。
          return { success: true, size: 0, sha256: '' };
        }
      } catch {
        /* 查状态也失败：保持原始错误语义 */
      }
      throw error;
    }
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
      this.doFetch(
        `${this.baseUrl}/api/resources/${params.itemId}`,
        {
          method: 'GET',
          headers: { ...this.getHeaders(), Range: rangeHeader },
        },
        params.signal,
      );

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
