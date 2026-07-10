/**
 * Web Clipper 服务
 * 提供本地 HTTP 服务，接收浏览器扩展发送的网页剪藏请求
 */

import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as OTPAuth from 'otpauth';
import { BrowserWindow, ipcMain, app, safeStorage, dialog } from 'electron';
import { ItemsManager } from '../../core/database/ItemsManager';
import {
  PasskeyAssertionRequest,
  PasskeyRegistrationRequest,
  VaultPasskeyError,
  VaultPasskeyService,
} from '../../core/vault/VaultPasskeyService';
import { ItemBase, VaultEntryPayload, VaultFolderPayload, VaultTotp, VaultUri } from '@shared/types';

const CLIPPER_PORT = 27183;
const CLIPPER_HOST = '127.0.0.1';
const VAULT_AUTH_HEADER = 'x-mucheng-extension-token';
const VAULT_EXTENSION_ID_HEADER = 'x-mucheng-extension-id';

export interface ClipImage {
  src: string;
  alt: string;
}

export interface ClipRequest {
  title: string;
  content: string;
  url: string;
  folderId?: string | null;
  tags?: string[];
  format?: 'html' | 'markdown';
  images?: ClipImage[];
  downloadImages?: boolean;
}

export interface ClipResponse {
  success: boolean;
  noteId?: string;
  error?: string;
}

interface VaultEntrySummary {
  id: string;
  name: string;
  username: string;
  uri: string;
  matchType: VaultUri['match_type'];
  updatedAt: number;
  favorite: boolean;
  totps: VaultTotpSummary[];
}

interface VaultTotpSummary {
  id: string;
  name: string;
  account: string;
  code: string;
  remaining: number;
  period: number;
}

interface VaultFolderSummary {
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: number;
}

interface BookmarkSummary {
  id: string;
  name: string;
  url: string;
  description: string;
  folderId: string | null;
  icon: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

interface BookmarkFolderSummary {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface VaultCapturedCredential {
  url?: string;
  title?: string;
  username?: string;
  password?: string;
  notes?: string;
  folderId?: string | null;
  uriName?: string;
  totpSecret?: string;
  totpName?: string;
  totpAccount?: string;
}

interface ClipperAuthConfig {
  vaultExtensionOrigin?: string;
  vaultToken?: string;
  createdAt?: number;
  updatedAt?: number;
  confirmedAt?: number;
}

interface ClipperExtensionAuthStatus {
  bound: boolean;
  paired: boolean;
  origin: string | null;
  extensionId: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  confirmedAt: number | null;
}

const parseRequestUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const normalizeHostname = (hostname: string): string =>
  hostname.trim().toLowerCase().replace(/^www\./, '');

const normalizeUrlForMatch = (value: string): URL | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return parseRequestUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
};

const isSameOrSubdomain = (candidateHost: string, targetHost: string): boolean => {
  const candidate = normalizeHostname(candidateHost);
  const target = normalizeHostname(targetHost);
  return target === candidate || target.endsWith(`.${candidate}`);
};

const isExtensionOrigin = (origin?: string): boolean =>
  Boolean(origin && /^(chrome-extension|moz-extension|safari-web-extension):\/\/[a-z0-9-]+$/i.test(origin));

const isExtensionId = (value?: string): boolean =>
  Boolean(value && /^[a-z0-9-]+$/i.test(value));

const getExtensionIdFromOrigin = (origin?: string): string | null => {
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    return parsed.hostname || null;
  } catch {
    return null;
  }
};

const encryptSecret = (value: string): string => {
  if (!safeStorage.isEncryptionAvailable()) {
    return value;
  }

  const encrypted = safeStorage.encryptString(value);
  return `enc:${encrypted.toString('base64')}`;
};

const decryptSecret = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (!value.startsWith('enc:')) {
    return value;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[Clipper] safeStorage unavailable, cannot decrypt extension token');
    return undefined;
  }

  try {
    return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
  } catch (error) {
    console.error('[Clipper] Failed to decrypt extension token:', error);
    return undefined;
  }
};

export class ClipperService {
  private server: http.Server | null = null;
  private itemsManager: ItemsManager | null = null;
  private mainWindow: BrowserWindow | null = null;
  private pendingClip: ClipRequest | null = null;
  private authConfig: ClipperAuthConfig | null = null;
  private pendingPairConfirmations = new Map<string, Promise<boolean>>();

  constructor() {
    this.setupIpcHandlers();
  }

  /**
   * 设置 ItemsManager 引用
   */
  setItemsManager(manager: ItemsManager) {
    this.itemsManager = manager;
  }

  /**
   * 设置主窗口引用
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  /**
   * 启动 HTTP 服务
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        resolve();
        return;
      }

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`Clipper port ${CLIPPER_PORT} is in use, trying next port...`);
          // 端口被占用时尝试下一个端口
          this.server?.listen(CLIPPER_PORT + 1, CLIPPER_HOST);
        } else {
          reject(err);
        }
      });

      this.server.listen(CLIPPER_PORT, CLIPPER_HOST, () => {
        console.log(`Web Clipper service started on http://${CLIPPER_HOST}:${CLIPPER_PORT}`);
        resolve();
      });
    });
  }

  /**
   * 停止 HTTP 服务
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          console.log('Web Clipper service stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 处理 HTTP 请求
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = req.url || '';
    this.setCorsHeaders(req, res, url);

    // 处理预检请求
    if (req.method === 'OPTIONS') {
      this.handleOptionsRequest(req, res, url);
      return;
    }

    // 健康检查端点
    if (req.method === 'GET' && url === '/api/status') {
      this.handleStatus(res);
      return;
    }

    if (this.isVaultPath(url) && !this.isVaultPairPath(url) && !this.isVaultRequestAllowed(req)) {
      this.rejectVaultRequest(res);
      return;
    }

    // 获取文件夹列表
    if (req.method === 'GET' && url === '/api/folders') {
      this.handleGetFolders(res);
      return;
    }

    // 剪藏端点
    if (req.method === 'POST' && url === '/api/clip') {
      this.handleClip(req, res);
      return;
    }

    // 获取书签文件夹列表
    if (req.method === 'GET' && url === '/api/bookmark-folders') {
      this.handleGetBookmarkFolders(res);
      return;
    }

    // 获取书签管理数据
    if (req.method === 'GET' && url === '/api/bookmarks') {
      this.handleGetBookmarks(res);
      return;
    }

    // 保存书签端点
    if (req.method === 'POST' && url === '/api/bookmark') {
      this.handleSaveBookmark(req, res);
      return;
    }

    // 密码库候选项查询端点
    if (req.method === 'POST' && url === '/api/vault/query') {
      this.handleVaultQuery(req, res);
      return;
    }

    // 密码库插件配对端点
    if (req.method === 'POST' && url === '/api/vault/pair') {
      void this.handleVaultPair(req, res);
      return;
    }

    // 密码库凭据获取端点
    if (req.method === 'POST' && url === '/api/vault/credential') {
      this.handleVaultCredential(req, res);
      return;
    }

    // 密码库文件夹列表端点
    if (req.method === 'GET' && url === '/api/vault-folders') {
      this.handleGetVaultFolders(req, res);
      return;
    }

    // 密码库新增条目端点
    if (req.method === 'POST' && url === '/api/vault/create') {
      this.handleVaultCreate(req, res);
      return;
    }

    // 通行密钥注册端点
    if (req.method === 'POST' && url === '/api/vault/passkey/register') {
      this.handleVaultPasskeyRegister(req, res);
      return;
    }

    // 通行密钥登录签名端点
    if (req.method === 'POST' && url === '/api/vault/passkey/assert') {
      this.handleVaultPasskeyAssert(req, res);
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private readJsonBody<T = any>(req: http.IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk.toString();
        if (body.length > 1024 * 1024) {
          req.destroy();
          reject(new Error('Request body too large'));
        }
      });

      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch {
          reject(new Error('无效的请求数据'));
        }
      });

      req.on('error', reject);
    });
  }

  private getAuthConfigPath(): string {
    return path.join(app.getPath('userData'), 'clipper-auth.json');
  }

  private loadAuthConfig(): ClipperAuthConfig {
    if (this.authConfig) {
      return this.authConfig;
    }

    const configPath = this.getAuthConfigPath();
    if (!fs.existsSync(configPath)) {
      this.authConfig = {};
      return this.authConfig;
    }

    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as ClipperAuthConfig;
      this.authConfig = {
        ...raw,
        vaultToken: decryptSecret(raw.vaultToken),
      };
      return this.authConfig;
    } catch (error) {
      console.error('[Clipper] Failed to load extension auth config:', error);
      this.authConfig = {};
      return this.authConfig;
    }
  }

  private saveAuthConfig(config: ClipperAuthConfig) {
    this.authConfig = config;
    const persisted: ClipperAuthConfig = {
      ...config,
      vaultToken: config.vaultToken ? encryptSecret(config.vaultToken) : undefined,
    };
    fs.writeFileSync(this.getAuthConfigPath(), JSON.stringify(persisted, null, 2), 'utf8');
  }

  private getRequestOrigin(req: http.IncomingMessage): string {
    return typeof req.headers.origin === 'string' ? req.headers.origin : '';
  }

  private getRequestVaultOrigin(req: http.IncomingMessage): string {
    const origin = this.getRequestOrigin(req);
    if (isExtensionOrigin(origin)) {
      return origin;
    }

    const extensionIdHeader = req.headers[VAULT_EXTENSION_ID_HEADER];
    const extensionId = Array.isArray(extensionIdHeader)
      ? (extensionIdHeader[0] || '')
      : (extensionIdHeader || '');

    return isExtensionId(extensionId) ? `chrome-extension://${extensionId.toLowerCase()}` : '';
  }

  private getRequestToken(req: http.IncomingMessage): string {
    const header = req.headers[VAULT_AUTH_HEADER];
    return Array.isArray(header) ? (header[0] || '') : (header || '');
  }

  private isVaultPath(url: string): boolean {
    return url === '/api/folders' ||
      url === '/api/clip' ||
      url === '/api/bookmark-folders' ||
      url === '/api/bookmarks' ||
      url === '/api/bookmark' ||
      url === '/api/vault/pair' ||
      url === '/api/vault/query' ||
      url === '/api/vault/credential' ||
      url === '/api/vault/create' ||
      url === '/api/vault/passkey/register' ||
      url === '/api/vault/passkey/assert' ||
      url === '/api/vault-folders';
  }

  private isVaultPairPath(url: string): boolean {
    return url === '/api/vault/pair';
  }

  private setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse, url: string) {
    const origin = this.getRequestOrigin(req);
    if (this.isVaultPath(url)) {
      const config = this.loadAuthConfig();
      const allowPairOrigin =
        this.isVaultPairPath(url) &&
        origin &&
        isExtensionOrigin(origin) &&
        (!config.vaultExtensionOrigin || config.vaultExtensionOrigin === origin);
      const allowBoundOrigin =
        origin &&
        isExtensionOrigin(origin) &&
        (!config.vaultExtensionOrigin || config.vaultExtensionOrigin === origin);

      if (allowPairOrigin || allowBoundOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', `Content-Type, ${VAULT_AUTH_HEADER}, ${VAULT_EXTENSION_ID_HEADER}`);
  }

  private handleOptionsRequest(req: http.IncomingMessage, res: http.ServerResponse, url: string) {
    const allowPairRequest = this.isVaultPairPath(url) && this.isVaultOriginAllowed(req);
    if (this.isVaultPath(url) && !allowPairRequest && !this.isVaultOriginAllowed(req)) {
      this.rejectVaultRequest(res);
      return;
    }

    res.writeHead(204);
    res.end();
  }

  private isVaultOriginAllowed(req: http.IncomingMessage): boolean {
    const origin = this.getRequestVaultOrigin(req);
    if (!isExtensionOrigin(origin)) {
      return false;
    }

    const config = this.loadAuthConfig();
    return !config.vaultExtensionOrigin || config.vaultExtensionOrigin === origin;
  }

  private isVaultRequestAllowed(req: http.IncomingMessage): boolean {
    if (!this.isVaultOriginAllowed(req)) {
      return false;
    }

    const config = this.loadAuthConfig();
    if (!config.vaultToken || !config.confirmedAt) {
      return false;
    }

    const token = this.getRequestToken(req);
    if (!token) {
      return false;
    }

    const expected = Buffer.from(config.vaultToken, 'utf8');
    const received = Buffer.from(token, 'utf8');
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }

  private rejectVaultRequest(res: http.ServerResponse) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Forbidden' }));
  }

  private async confirmExtensionPairing(origin: string): Promise<boolean> {
    const pending = this.pendingPairConfirmations.get(origin);
    if (pending) {
      return pending;
    }

    const confirmation = this.showExtensionPairingDialog(origin)
      .finally(() => {
        this.pendingPairConfirmations.delete(origin);
      });
    this.pendingPairConfirmations.set(origin, confirmation);
    return confirmation;
  }

  private async showExtensionPairingDialog(origin: string): Promise<boolean> {
    const extensionId = getExtensionIdFromOrigin(origin) || origin;

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.focus();
    }

    const options = {
      type: 'question' as const,
      buttons: ['允许连接', '拒绝'],
      defaultId: 1,
      cancelId: 1,
      title: '浏览器插件授权',
      message: '是否允许此浏览器插件连接暮城笔记？',
      detail: [
        `插件来源：${origin}`,
        `插件 ID：${extensionId}`,
        '',
        '允许后，插件可以保存笔记、读取和管理书签，并按当前网站匹配密码库条目用于填充。',
      ].join('\n'),
    };
    const parentWindow = this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null;
    const result = parentWindow
      ? await dialog.showMessageBox(parentWindow, options)
      : await dialog.showMessageBox(options);

    return result.response === 0;
  }

  private getExtensionAuthStatus(): ClipperExtensionAuthStatus {
    const config = this.loadAuthConfig();
    return {
      bound: Boolean(config.vaultExtensionOrigin || config.vaultToken),
      paired: Boolean(config.vaultExtensionOrigin && config.vaultToken && config.confirmedAt),
      origin: config.vaultExtensionOrigin || null,
      extensionId: getExtensionIdFromOrigin(config.vaultExtensionOrigin) || null,
      createdAt: config.createdAt || null,
      updatedAt: config.updatedAt || null,
      confirmedAt: config.confirmedAt || null,
    };
  }

  private revokeExtensionAuth() {
    this.saveAuthConfig({});
  }

  private async handleVaultPair(req: http.IncomingMessage, res: http.ServerResponse) {
    const origin = this.getRequestVaultOrigin(req);
    if (!isExtensionOrigin(origin)) {
      this.rejectVaultRequest(res);
      return;
    }

    let config = this.loadAuthConfig();
    if (config.vaultExtensionOrigin && config.vaultExtensionOrigin !== origin) {
      this.rejectVaultRequest(res);
      return;
    }

    const requiresConfirmation = !config.vaultToken || !config.vaultExtensionOrigin || !config.confirmedAt;
    if (requiresConfirmation) {
      const approved = await this.confirmExtensionPairing(origin);
      if (!approved) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '插件授权已拒绝' }));
        return;
      }

      config = this.loadAuthConfig();
      if (config.vaultExtensionOrigin && config.vaultExtensionOrigin !== origin) {
        this.rejectVaultRequest(res);
        return;
      }
    }

    const now = Date.now();
    const token = config.vaultToken && config.confirmedAt
      ? config.vaultToken
      : crypto.randomBytes(32).toString('hex');

    this.saveAuthConfig({
      ...config,
      vaultExtensionOrigin: origin,
      vaultToken: token,
      createdAt: config.createdAt || now,
      updatedAt: now,
      confirmedAt: config.confirmedAt || now,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      token,
      origin,
    }));
  }

  /**
   * 处理状态检查
   */
  private handleStatus(res: http.ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      app: '暮城笔记',
      version: '1.0.0',
    }));
  }

  /**
   * 获取文件夹列表
   */
  private async handleGetFolders(res: http.ServerResponse) {
    try {
      if (!this.itemsManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service not ready' }));
        return;
      }

      const folders = this.itemsManager.getByType('folder');
      const folderList = folders
        .filter(f => !f.deleted_time)
        .map(f => {
          const payload = JSON.parse(f.payload);
          console.log(`[Clipper] Folder: ${payload.name}, parent_id: ${payload.parent_id}`);
          return {
            id: f.id,
            name: payload.name || '未命名文件夹',
            // 笔记文件夹使用 parent_id（下划线格式）
            parentId: payload.parent_id || null,
          };
        });

      console.log(`[Clipper] Returning ${folderList.length} folders`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ folders: folderList }));
    } catch (err: any) {
      console.error('[Clipper] Error getting folders:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  /**
   * 获取书签文件夹列表
   */
  private async handleGetBookmarkFolders(res: http.ServerResponse) {
    try {
      if (!this.itemsManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service not ready' }));
        return;
      }

      const folderList = this.getBookmarkFolderSummaries();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ folders: folderList }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  private getBookmarkFolderSummaries(): BookmarkFolderSummary[] {
    if (!this.itemsManager) return [];

    return this.itemsManager
      .getByType('bookmark_folder')
      .filter(item => !item.deleted_time)
      .map(item => {
        const payload = JSON.parse(item.payload);
        return {
          id: item.id,
          name: payload.name || '未命名文件夹',
          parentId: payload.parent_id || null,
          createdAt: item.created_time,
          updatedAt: item.updated_time,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  private getBookmarkSummaries(): BookmarkSummary[] {
    if (!this.itemsManager) return [];

    return this.itemsManager
      .getByType('bookmark')
      .filter(item => !item.deleted_time)
      .map(item => {
        const payload = JSON.parse(item.payload);
        return {
          id: item.id,
          name: payload.name || '未命名书签',
          url: payload.url || '',
          description: payload.description || '',
          folderId: payload.folder_id || null,
          icon: payload.icon || null,
          tags: payload.tags || [],
          createdAt: item.created_time,
          updatedAt: item.updated_time,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  private handleGetBookmarks(res: http.ServerResponse) {
    try {
      if (!this.itemsManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Service not ready' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        folders: this.getBookmarkFolderSummaries(),
        bookmarks: this.getBookmarkSummaries(),
      }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  private doesVaultUriMatch(uri: VaultUri, pageUrl: URL): boolean {
    if (uri.match_type === 'never') {
      return false;
    }

    const targetUrl = normalizeUrlForMatch(uri.uri);
    if (!targetUrl) {
      return false;
    }

    const pageHref = pageUrl.href.toLowerCase();
    const targetHref = targetUrl.href.toLowerCase();
    const pageHost = pageUrl.hostname;
    const targetHost = targetUrl.hostname;

    switch (uri.match_type) {
      case 'exact':
        return pageHref === targetHref;
      case 'host':
        return normalizeHostname(pageHost) === normalizeHostname(targetHost);
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
        return isSameOrSubdomain(targetHost, pageHost);
    }
  }

  private doesVaultUriExclude(uri: VaultUri, pageUrl: URL): boolean {
    if (uri.match_type !== 'never') {
      return false;
    }

    const targetUrl = normalizeUrlForMatch(uri.uri);
    if (!targetUrl) {
      return false;
    }

    const pageHref = pageUrl.href.toLowerCase();
    const targetHref = targetUrl.href.toLowerCase();

    return (
      pageHref === targetHref ||
      pageHref.startsWith(targetHref) ||
      normalizeHostname(pageUrl.hostname) === normalizeHostname(targetUrl.hostname) ||
      isSameOrSubdomain(targetUrl.hostname, pageUrl.hostname)
    );
  }

  private getMatchingVaultUri(payload: VaultEntryPayload, pageUrl: URL): VaultUri | null {
    const uris = payload.uris || [];
    const excluded = uris.some(uri => this.doesVaultUriExclude(uri, pageUrl));
    if (excluded) {
      return null;
    }

    return uris.find(uri => this.doesVaultUriMatch(uri, pageUrl)) || null;
  }

  private getMatchingVaultEntries(pageUrl: URL): Array<{ item: ItemBase; payload: VaultEntryPayload; matchedUri: VaultUri }> {
    if (!this.itemsManager) return [];

    return this.itemsManager
      .getByType('vault_entry')
      .filter(item => !item.deleted_time)
      .map(item => {
        try {
          const payload = JSON.parse(item.payload) as VaultEntryPayload;
          const matchedUri = payload.entry_type === 'login' ? this.getMatchingVaultUri(payload, pageUrl) : null;
          return matchedUri ? { item, payload, matchedUri } : null;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is { item: ItemBase; payload: VaultEntryPayload; matchedUri: VaultUri } => Boolean(entry))
      .filter(({ payload }) => Boolean(payload.password))
      .sort((a, b) => {
        if (a.payload.favorite && !b.payload.favorite) return -1;
        if (!a.payload.favorite && b.payload.favorite) return 1;
        return b.item.updated_time - a.item.updated_time;
      });
  }

  private hasSameVaultCredential(pageUrl: URL, username: string): boolean {
    const normalizedUsername = username.trim().toLowerCase();
    return this.getMatchingVaultEntries(pageUrl).some(({ payload }) =>
      payload.username.trim().toLowerCase() === normalizedUsername
    );
  }

  private getValidVaultFolderId(folderId?: string | null): string | null {
    if (!folderId) {
      return null;
    }

    const exists = this.itemsManager
      ?.getByType('vault_folder')
      .some(item => item.id === folderId && !item.deleted_time);

    return exists ? folderId : null;
  }

  private cleanTotpSecret(secret: string): string {
    return secret.replace(/[\s-]/g, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  }

  private parseTotpInput(value?: string): { secret: string; name: string; account: string } | null {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith('otpauth://')) {
      try {
        const totp = OTPAuth.URI.parse(trimmed) as any;
        if (!totp.secret?.base32) {
          return null;
        }

        const label = typeof totp.label === 'string' ? totp.label : '';
        const issuer = typeof totp.issuer === 'string' ? totp.issuer : '';
        const colonIndex = label.indexOf(':');
        const labelName = colonIndex > 0 ? label.substring(0, colonIndex) : '';
        const account = colonIndex >= 0 ? label.substring(colonIndex + 1) : label;
        const secret = this.cleanTotpSecret(totp.secret.base32);

        return secret.length >= 8 ? {
          secret,
          name: issuer || labelName,
          account,
        } : null;
      } catch {
        return null;
      }
    }

    const secret = this.cleanTotpSecret(trimmed);
    return secret.length >= 8 ? { secret, name: '', account: '' } : null;
  }

  private buildVaultTotpSecret(
    data: { totpSecret?: string; totpName?: string; totpAccount?: string; username: string },
    entryName: string,
  ): VaultTotp | null {
    const parsed = this.parseTotpInput(data.totpSecret);
    if (!parsed) {
      return null;
    }

    return {
      id: `totp_${Date.now()}`,
      name: (data.totpName || '').trim() || parsed.name || entryName || '验证码',
      account: (data.totpAccount || '').trim() || parsed.account || data.username.trim(),
      secret: parsed.secret,
    };
  }

  private getTotpRemainingTime(period = 30): number {
    const seconds = Math.floor(Date.now() / 1000);
    return period - (seconds % period);
  }

  private generateVaultTotpCode(secret: string, period = 30): string | null {
    try {
      const cleanSecret = this.cleanTotpSecret(secret);
      if (!cleanSecret || cleanSecret.length < 8) {
        return null;
      }

      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(cleanSecret),
        digits: 6,
        period,
      });
      return totp.generate();
    } catch (error) {
      console.warn('[Clipper] Failed to generate TOTP code:', error);
      return null;
    }
  }

  private getVaultTotpSummaries(payload: VaultEntryPayload): VaultTotpSummary[] {
    const period = 30;
    return (payload.totp_secrets || [])
      .map((totp) => {
        const code = this.generateVaultTotpCode(totp.secret, period);
        if (!code) {
          return null;
        }

        return {
          id: totp.id,
          name: totp.name || '验证码',
          account: totp.account || payload.username || '',
          code,
          remaining: this.getTotpRemainingTime(period),
          period,
        };
      })
      .filter((totp): totp is VaultTotpSummary => Boolean(totp));
  }

  private buildVaultPayload(
    data: {
      url: string;
      title: string;
      username: string;
      password: string;
      notes?: string;
      folderId?: string | null;
      uriName?: string;
      totpSecret?: string;
      totpName?: string;
      totpAccount?: string;
    },
    pageUrl: URL,
  ): VaultEntryPayload {
    const now = Date.now();
    const name = data.title.trim() || normalizeHostname(pageUrl.hostname) || '网站登录';
    const totpSecret = this.buildVaultTotpSecret(data, name);

    return {
      name,
      entry_type: 'login',
      folder_id: this.getValidVaultFolderId(data.folderId),
      favorite: false,
      notes: (data.notes || '').trim(),
      username: data.username.trim(),
      password: data.password,
      totp_secrets: totpSecret ? [totpSecret] : [],
      uris: [{
        id: `uri_${now}`,
        name: (data.uriName || '').trim() || normalizeHostname(pageUrl.hostname),
        uri: data.url,
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

  private handleVaultQuery(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.isVaultRequestAllowed(req)) {
      this.rejectVaultRequest(res);
      return;
    }

    this.readJsonBody<{ url?: string }>(req)
      .then((data) => {
        if (!this.itemsManager) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Service not ready' }));
          return;
        }

        const pageUrl = data.url ? parseRequestUrl(data.url) : null;
        if (!pageUrl || !['http:', 'https:'].includes(pageUrl.protocol)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '无效的网址' }));
          return;
        }

        const entries: VaultEntrySummary[] = this.getMatchingVaultEntries(pageUrl).map(({ item, payload, matchedUri }) => ({
          id: item.id,
          name: payload.name || '未命名登录',
          username: payload.username || '',
          uri: matchedUri.uri,
          matchType: matchedUri.match_type,
          updatedAt: item.updated_time,
          favorite: Boolean(payload.favorite),
          totps: this.getVaultTotpSummaries(payload),
        }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, entries }));
      })
      .catch((err: Error) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
  }

  private handleVaultCredential(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.isVaultRequestAllowed(req)) {
      this.rejectVaultRequest(res);
      return;
    }

    this.readJsonBody<{ id?: string; url?: string }>(req)
      .then((data) => {
        if (!this.itemsManager) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Service not ready' }));
          return;
        }

        const pageUrl = data.url ? parseRequestUrl(data.url) : null;
        if (!data.id || !pageUrl || !['http:', 'https:'].includes(pageUrl.protocol)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '缺少必要字段' }));
          return;
        }

        const match = this.getMatchingVaultEntries(pageUrl).find(({ item }) => item.id === data.id);
        if (!match) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '该凭据不匹配当前网站' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          credential: {
            id: match.item.id,
            name: match.payload.name || '未命名登录',
            username: match.payload.username || '',
            password: match.payload.password || '',
          },
        }));
      })
      .catch((err: Error) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
  }

  private handleGetVaultFolders(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.isVaultRequestAllowed(req)) {
      this.rejectVaultRequest(res);
      return;
    }

    try {
      if (!this.itemsManager) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Service not ready' }));
        return;
      }

      const folders: VaultFolderSummary[] = this.itemsManager
        .getByType('vault_folder')
        .filter(item => !item.deleted_time)
        .map(item => {
          const payload = JSON.parse(item.payload) as VaultFolderPayload;
          return {
            id: item.id,
            name: payload.name || '未命名分组',
            parentId: payload.parent_id || null,
            updatedAt: item.updated_time,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, folders }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  private handleVaultCreate(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.isVaultRequestAllowed(req)) {
      this.rejectVaultRequest(res);
      return;
    }

    this.readJsonBody<VaultCapturedCredential>(req)
      .then((data) => {
        if (!this.itemsManager) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Service not ready' }));
          return;
        }

        const pageUrl = data.url ? parseRequestUrl(data.url) : null;
        const username = (data.username || '').trim();
        const password = data.password || '';
        const folderId = data.folderId || null;

        if (!pageUrl || !['http:', 'https:'].includes(pageUrl.protocol) || !username || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '缺少网址、用户名或密码' }));
          return;
        }

        if (folderId && !this.getValidVaultFolderId(folderId)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '选择的分组不存在' }));
          return;
        }

        if ((data.totpSecret || '').trim() && !this.parseTotpInput(data.totpSecret)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOTP 密钥无效' }));
          return;
        }

        if (this.hasSameVaultCredential(pageUrl, username)) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '密码库中已存在该网站的相同账号' }));
          return;
        }

        const payload = this.buildVaultPayload({
          url: data.url || '',
          title: data.title || '',
          username,
          password,
          notes: data.notes || '',
          folderId,
          uriName: data.uriName || '',
          totpSecret: data.totpSecret || '',
          totpName: data.totpName || '',
          totpAccount: data.totpAccount || '',
        }, pageUrl);
        const item = this.itemsManager.create('vault_entry', payload);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          entry: {
            id: item.id,
            name: payload.name,
            username: payload.username,
            uri: payload.uris[0]?.uri || pageUrl.origin,
          },
        }));
      })
      .catch((err: Error) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
  }

  private handleVaultPasskeyRegister(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.isVaultRequestAllowed(req)) {
      this.rejectVaultRequest(res);
      return;
    }

    this.readJsonBody<PasskeyRegistrationRequest>(req)
      .then((data) => {
        if (!this.itemsManager) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Service not ready' }));
          return;
        }

        const result = new VaultPasskeyService(this.itemsManager).register(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...result }));
      })
      .catch((err: Error) => {
        const statusCode = err instanceof VaultPasskeyError ? err.statusCode : 400;
        const fallbackToNative = err instanceof VaultPasskeyError ? err.fallbackToNative : false;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: err.message,
          fallbackToNative,
        }));
      });
  }

  private handleVaultPasskeyAssert(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.isVaultRequestAllowed(req)) {
      this.rejectVaultRequest(res);
      return;
    }

    this.readJsonBody<PasskeyAssertionRequest>(req)
      .then((data) => {
        if (!this.itemsManager) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Service not ready' }));
          return;
        }

        const result = new VaultPasskeyService(this.itemsManager).assert(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...result }));
      })
      .catch((err: Error) => {
        const statusCode = err instanceof VaultPasskeyError ? err.statusCode : 400;
        const fallbackToNative = err instanceof VaultPasskeyError ? err.fallbackToNative : false;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: err.message,
          fallbackToNative,
        }));
      });
  }

  /**
   * 处理保存书签请求
   */
  private handleSaveBookmark(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);

        // 验证必要字段
        if (!data.name || !data.url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '缺少必要字段' }));
          return;
        }

        if (!this.itemsManager) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Service not ready' }));
          return;
        }

        // 创建书签
        const payload = {
          name: data.name,
          url: data.url,
          description: data.description || '',
          folder_id: data.folderId || null,
          icon: data.icon || null,
          tags: data.tags || [],
        };

        const bookmark = this.itemsManager.create('bookmark', payload);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, bookmarkId: bookmark.id }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '无效的请求数据' }));
      }
    });
  }

  /**
   * 处理剪藏请求
   */
  private handleClip(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const clipData: ClipRequest = JSON.parse(body);

        // 验证必要字段
        if (!clipData.title || !clipData.content) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '缺少必要字段' }));
          return;
        }

        if (!this.itemsManager) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Service not ready' }));
          return;
        }

        // 直接创建笔记
        const payload = {
          title: clipData.title,
          content: clipData.content,
          folder_id: clipData.folderId || null,
          is_pinned: false,
          is_locked: false,
          lock_password_hash: null,
          tags: clipData.tags || [],
        };

        const note = this.itemsManager.create('note', payload);

        // 如果需要下载图片
        if (clipData.downloadImages && clipData.images && clipData.images.length > 0) {
          const processedContent = await this.processImages(clipData.content, clipData.images, note.id);
          this.itemsManager.update(note.id, { content: processedContent });
        }

        // 聚焦窗口并通知保存成功
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          if (this.mainWindow.isMinimized()) {
            this.mainWindow.restore();
          }
          this.mainWindow.focus();
          // 通知渲染进程刷新笔记列表
          this.mainWindow.webContents.send('note-created', { noteId: note.id });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, noteId: note.id, message: '笔记已保存' }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '无效的请求数据' }));
      }
    });
  }

  /**
   * 下载图片并保存到本地资源目录
   */
  private async downloadImage(imageUrl: string, noteId: string): Promise<{ localUrl: string; resourceId: string } | null> {
    return new Promise((resolve) => {
      try {
        const protocol = imageUrl.startsWith('https') ? https : http;
        
        const request = protocol.get(imageUrl, { timeout: 10000 }, (response) => {
          // 处理重定向
          if (response.statusCode === 301 || response.statusCode === 302) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              this.downloadImage(redirectUrl, noteId).then(resolve);
              return;
            }
          }
          
          if (response.statusCode !== 200) {
            console.log(`Failed to download image: ${imageUrl}, status: ${response.statusCode}`);
            resolve(null);
            return;
          }

          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            try {
              const buffer = Buffer.concat(chunks);
              
              // 检查文件大小（限制 10MB）
              if (buffer.length > 10 * 1024 * 1024) {
                console.log(`Image too large: ${imageUrl}`);
                resolve(null);
                return;
              }

              // 获取文件扩展名
              const contentType = response.headers['content-type'] || '';
              let ext = '.jpg';
              if (contentType.includes('png')) ext = '.png';
              else if (contentType.includes('gif')) ext = '.gif';
              else if (contentType.includes('webp')) ext = '.webp';
              else if (contentType.includes('svg')) ext = '.svg';
              
              // 从 URL 获取扩展名作为备选
              const urlExt = path.extname(new URL(imageUrl).pathname).toLowerCase();
              if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(urlExt)) {
                ext = urlExt === '.jpeg' ? '.jpg' : urlExt;
              }

              // 生成资源 ID
              const resourceId = crypto.randomUUID();
              const filename = `${resourceId}${ext}`;
              
              // 保存到资源目录
              const resourcesDir = path.join(app.getPath('userData'), 'resources');
              if (!fs.existsSync(resourcesDir)) {
                fs.mkdirSync(resourcesDir, { recursive: true });
              }
              
              const resourcePath = path.join(resourcesDir, filename);
              fs.writeFileSync(resourcePath, buffer);

              // 创建资源记录
              if (this.itemsManager) {
                const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
                const payload = {
                  _id: resourceId,
                  filename: path.basename(imageUrl) || filename,
                  mime_type: contentType || `image/${ext.slice(1)}`,
                  size: buffer.length,
                  note_id: noteId,
                  file_hash: fileHash,
                };
                this.itemsManager.create('resource', payload);
              }

              const localUrl = `resource://${resourceId}${ext}`;
              console.log(`Downloaded image: ${imageUrl} -> ${localUrl}`);
              resolve({ localUrl, resourceId });
            } catch (err) {
              console.error('Failed to save image:', err);
              resolve(null);
            }
          });
          response.on('error', () => resolve(null));
        });

        request.on('error', () => resolve(null));
        request.on('timeout', () => {
          request.destroy();
          resolve(null);
        });
      } catch (err) {
        console.error('Download image error:', err);
        resolve(null);
      }
    });
  }

  /**
   * 处理内容中的图片，下载并替换为本地资源
   */
  private async processImages(content: string, images: ClipImage[], noteId: string): Promise<string> {
    let processedContent = content;
    
    for (const image of images) {
      try {
        const result = await this.downloadImage(image.src, noteId);
        if (result) {
          // 替换 Markdown 中的图片 URL
          // 匹配 ![alt](url) 格式
          const escapedSrc = image.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedSrc}\\)`, 'g');
          processedContent = processedContent.replace(regex, `![$1](${result.localUrl})`);
        }
      } catch (err) {
        console.error(`Failed to process image: ${image.src}`, err);
      }
    }
    
    return processedContent;
  }

  /**
   * 设置 IPC 处理器
   */
  private setupIpcHandlers() {
    // 确认剪藏（支持下载图片）
    ipcMain.handle('clipper:confirm', async (_, data: { 
      title: string; 
      content: string; 
      folderId?: string; 
      tags?: string[];
      downloadImages?: boolean;
      images?: ClipImage[];
    }) => {
      try {
        if (!this.itemsManager) {
          return { success: false, error: 'Service not ready' };
        }

        // 先创建笔记获取 ID
        const payload = {
          title: data.title,
          content: data.content,
          folder_id: data.folderId || null,
          is_pinned: false,
          is_locked: false,
          lock_password_hash: null,
          tags: data.tags || [],
        };

        const note = this.itemsManager.create('note', payload);
        
        // 如果需要下载图片
        if (data.downloadImages && data.images && data.images.length > 0) {
          const processedContent = await this.processImages(data.content, data.images, note.id);
          // 更新笔记内容
          this.itemsManager.update(note.id, { content: processedContent });
        }

        this.pendingClip = null;

        return { success: true, noteId: note.id };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    // 取消剪藏
    ipcMain.handle('clipper:cancel', async () => {
      this.pendingClip = null;
      return { success: true };
    });

    // 获取待处理的剪藏
    ipcMain.handle('clipper:getPending', async () => {
      return this.pendingClip;
    });

    ipcMain.handle('clipper:getExtensionAuth', async () => {
      return this.getExtensionAuthStatus();
    });

    ipcMain.handle('clipper:revokeExtensionAuth', async () => {
      this.revokeExtensionAuth();
      return { success: true };
    });
  }

  /**
   * 获取服务端口
   */
  getPort(): number {
    return CLIPPER_PORT;
  }
}

// 单例
export const clipperService = new ClipperService();
