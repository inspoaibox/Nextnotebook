/**
 * 暮城笔记 - 网页剪藏扩展 Background Service Worker
 */

const API_BASE = 'http://127.0.0.1:27183';
const VAULT_AUTH_STORAGE_KEY = 'muchengVaultAuthToken';
const PASSKEY_ENABLED_STORAGE_KEY = 'muchengPasskeyEnabled';
const VAULT_AUTH_HEADER = 'X-Mucheng-Extension-Token';
const VAULT_EXTENSION_ID_HEADER = 'X-Mucheng-Extension-Id';
const VAULT_PROMPT_TTL = 10 * 60 * 1000;
const VAULT_PENDING_PROMPT_TTL = 2 * 60 * 1000;
const PASSKEY_PAGE_SCRIPT_ID = 'mucheng-passkey-page';
const PASSKEY_BRIDGE_SCRIPT_ID = 'mucheng-passkey-bridge';
const vaultPromptCache = new Map();
const vaultPendingPrompts = new Map();
let vaultPairPromise = null;

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result[key] || ''));
  });
}

function storageGetRaw(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result[key]));
  });
}

function storageSet(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

async function isPasskeyEnabled() {
  return (await storageGetRaw(PASSKEY_ENABLED_STORAGE_KEY)) === true;
}

function registerContentScripts(scripts) {
  return new Promise((resolve, reject) => {
    chrome.scripting.registerContentScripts(scripts, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function getRegisteredContentScripts(ids) {
  return new Promise((resolve, reject) => {
    chrome.scripting.getRegisteredContentScripts({ ids }, (scripts) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(scripts || []);
    });
  });
}

async function unregisterContentScripts(ids) {
  const scripts = await getRegisteredContentScripts(ids);
  const registeredIds = scripts.map(script => script.id).filter(id => ids.includes(id));
  if (registeredIds.length === 0) {
    return;
  }

  return new Promise((resolve, reject) => {
    chrome.scripting.unregisterContentScripts({ ids: registeredIds }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

async function applyPasskeyContentScriptRegistration() {
  const enabled = await isPasskeyEnabled();
  await unregisterContentScripts([PASSKEY_PAGE_SCRIPT_ID, PASSKEY_BRIDGE_SCRIPT_ID]);

  if (!enabled) {
    return false;
  }

  await registerContentScripts([
    {
      id: PASSKEY_BRIDGE_SCRIPT_ID,
      matches: ['http://*/*', 'https://*/*'],
      js: ['passkey-bridge.js'],
      runAt: 'document_start',
      allFrames: true,
      matchAboutBlank: false,
    },
    {
      id: PASSKEY_PAGE_SCRIPT_ID,
      matches: ['http://*/*', 'https://*/*'],
      js: ['passkey-page.js'],
      runAt: 'document_start',
      allFrames: true,
      matchAboutBlank: false,
      world: 'MAIN',
    },
  ]);
  return true;
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function notifyPasskeyStateChanged(enabled) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs
    .filter(tab => typeof tab.id === 'number' && isHttpUrl(tab.url))
    .map(tab => sendMessageToTab(tab.id, { action: 'passkeyConfigChanged', enabled })));
}

async function injectPasskeyScriptsIntoTab(tabId) {
  if (typeof tabId !== 'number') return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !isHttpUrl(tab.url)) return;

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['passkey-bridge.js'],
  });
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['passkey-page.js'],
    world: 'MAIN',
  });
}

async function setPasskeyEnabled(enabled, tabId) {
  const nextEnabled = enabled === true;
  await storageSet(PASSKEY_ENABLED_STORAGE_KEY, nextEnabled);
  await applyPasskeyContentScriptRegistration();
  await notifyPasskeyStateChanged(nextEnabled);
  if (nextEnabled && typeof tabId === 'number') {
    try {
      await injectPasskeyScriptsIntoTab(tabId);
    } catch (error) {
      console.warn('Failed to inject passkey scripts into current tab:', error);
    }
  }
  return nextEnabled;
}

async function pairVaultExtension() {
  const response = await fetch(`${API_BASE}/api/vault/pair`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [VAULT_EXTENSION_ID_HEADER]: chrome.runtime.id,
    },
    body: '{}',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success || !result.token) {
    throw new Error(result.error || '插件配对失败');
  }
  await storageSet(VAULT_AUTH_STORAGE_KEY, result.token);
  return result.token;
}

async function getVaultAuthToken(forcePair = false) {
  if (!forcePair) {
    const stored = await storageGet(VAULT_AUTH_STORAGE_KEY);
    if (stored) return stored;
  }

  if (!vaultPairPromise) {
    vaultPairPromise = pairVaultExtension().finally(() => {
      vaultPairPromise = null;
    });
  }
  return vaultPairPromise;
}

function fetchVaultWithToken(path, options, token) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      [VAULT_AUTH_HEADER]: token,
      [VAULT_EXTENSION_ID_HEADER]: chrome.runtime.id,
    },
  });
}

async function retryVaultFetchWithFreshToken(path, options, previousToken) {
  const storedToken = await storageGet(VAULT_AUTH_STORAGE_KEY);
  if (storedToken && storedToken !== previousToken) {
    try {
      return await fetchVaultWithToken(path, options, storedToken);
    } catch (e) {
      console.warn('[Vault] Stored token retry failed, pairing again:', e);
    }
  }

  const nextToken = await getVaultAuthToken(true);
  return fetchVaultWithToken(path, options, nextToken);
}

async function vaultFetch(path, options = {}, retry = true) {
  const token = await getVaultAuthToken();
  let response;

  try {
    response = await fetchVaultWithToken(path, options, token);
  } catch (e) {
    if (!retry) throw e;
    console.warn('[Vault] Request failed, retrying after pairing:', e);
    return retryVaultFetchWithFreshToken(path, options, token);
  }

  if (response.status === 403 && retry) {
    return retryVaultFetchWithFreshToken(path, options, token);
  }

  return response;
}

// 监听扩展图标点击（可选：直接剪藏而不打开 popup）
chrome.action.onClicked.addListener(async (tab) => {
  // 默认行为是打开 popup，这里可以添加快捷剪藏逻辑
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'contentScriptReady') {
    console.log('Content script ready on:', sender.tab?.url);
    if (sender.tab?.id && (sender.frameId === 0 || sender.frameId === undefined)) {
      showPendingVaultPrompt(sender.tab.id);
    }
  }
  
  if (request.action === 'quickClip') {
    // 快速剪藏功能
    handleQuickClip(request.data).then(sendResponse);
    return true;
  }

  if (request.action === 'vaultCandidateDetected') {
    handleVaultCandidate(request.candidate, sender).then(sendResponse);
    return true;
  }

  if (request.action === 'vaultCreateCredential') {
    handleVaultCreateCredential(request.candidate, sender).then(sendResponse);
    return true;
  }

  if (request.action === 'vaultGetFolders') {
    queryVaultFolders().then(sendResponse);
    return true;
  }

  if (request.action === 'getPasskeyEnabled') {
    isPasskeyEnabled()
      .then(enabled => sendResponse({ success: true, enabled }))
      .catch(e => sendResponse({ success: false, enabled: false, error: e.message }));
    return true;
  }

  if (request.action === 'setPasskeyEnabled') {
    setPasskeyEnabled(request.enabled === true, request.tabId)
      .then(enabled => sendResponse({ success: true, enabled }))
      .catch(e => sendResponse({ success: false, error: e.message || '通行密钥设置失败' }));
    return true;
  }

  if (request.action === 'passkeyCreate') {
    handlePasskeyCreate(request.request, sender).then(sendResponse);
    return true;
  }

  if (request.action === 'passkeyGet') {
    handlePasskeyGet(request.request, sender).then(sendResponse);
    return true;
  }

  if (request.action === 'vaultCredentialPromptDismissed') {
    const key = request.promptKey;
    if (typeof key === 'string') {
      markVaultPrompt(key, 'dismissed');
      clearPendingVaultPrompt(sender.tab?.id, key);
    }
    sendResponse({ success: true });
  }
});

// 检查应用连接状态
async function checkConnection() {
  try {
    const response = await fetch(`${API_BASE}/api/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}

// 快速剪藏处理
async function handleQuickClip(data) {
  try {
    const connected = await checkConnection();
    if (!connected) {
      return { success: false, error: '暮城笔记未运行' };
    }
    
    const response = await vaultFetch('/api/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    return await response.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function isHttpUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

function normalizeVaultCandidate(rawCandidate, sender) {
  const rawUrl = rawCandidate?.url || sender.tab?.url || '';
  if (!isHttpUrl(rawUrl)) return null;

  const username = String(rawCandidate?.username || '').trim();
  const password = String(rawCandidate?.password || '');
  if (!username || !password) return null;

  return {
    url: rawUrl,
    title: String(rawCandidate?.title || sender.tab?.title || '').trim(),
    username,
    password,
    folderId: rawCandidate?.folderId || null,
    uriName: String(rawCandidate?.uriName || '').trim(),
    totpName: String(rawCandidate?.totpName || '').trim(),
    totpSecret: String(rawCandidate?.totpSecret || '').trim(),
    totpAccount: String(rawCandidate?.totpAccount || '').trim(),
    folders: rawCandidate?.folders || [],
  };
}

function getVaultPromptKey(candidate, tabId) {
  let origin = candidate.url;
  try {
    origin = new URL(candidate.url).origin;
  } catch {
    // Keep original URL as a fallback key.
  }

  return [
    tabId || 'unknown-tab',
    origin,
    candidate.username.trim().toLowerCase(),
    candidate.password,
  ].join('|');
}

function pruneVaultPromptCache() {
  const now = Date.now();
  for (const [key, value] of vaultPromptCache.entries()) {
    if (value.expiresAt <= now) {
      vaultPromptCache.delete(key);
    }
  }
}

function isVaultPromptSuppressed(key) {
  pruneVaultPromptCache();
  return vaultPromptCache.has(key);
}

function markVaultPrompt(key, state) {
  vaultPromptCache.set(key, {
    state,
    expiresAt: Date.now() + VAULT_PROMPT_TTL,
  });
}

function storePendingVaultPrompt(tabId, candidate) {
  if (!tabId) return;
  vaultPendingPrompts.set(tabId, {
    candidate,
    expiresAt: Date.now() + VAULT_PENDING_PROMPT_TTL,
  });
}

function getPendingVaultPrompt(tabId) {
  if (!tabId) return null;
  const pending = vaultPendingPrompts.get(tabId);
  if (!pending) return null;
  if (pending.expiresAt <= Date.now()) {
    vaultPendingPrompts.delete(tabId);
    return null;
  }
  return pending.candidate;
}

function clearPendingVaultPrompt(tabId, promptKey) {
  if (!tabId) return;
  const pending = vaultPendingPrompts.get(tabId);
  if (!pending) return;
  if (!promptKey || pending.candidate?.promptKey === promptKey) {
    vaultPendingPrompts.delete(tabId);
  }
}

async function deliverVaultPrompt(tabId, candidate) {
  await chrome.tabs.sendMessage(
    tabId,
    { action: 'showVaultSavePrompt', candidate },
    { frameId: 0 }
  );
}

async function showPendingVaultPrompt(tabId) {
  const candidate = getPendingVaultPrompt(tabId);
  if (!candidate) return;

  try {
    await deliverVaultPrompt(tabId, candidate);
  } catch (e) {
    console.debug('Pending vault prompt delivery skipped:', e);
  }
}

async function queryVaultEntries(url) {
  const response = await vaultFetch('/api/vault/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return response.json();
}

async function queryVaultFolders() {
  try {
    const response = await vaultFetch('/api/vault-folders', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error('[Vault] Query folders failed with status:', response.status);
      return { success: false, folders: [], error: `HTTP ${response.status}` };
    }

    const result = await response.json();
    console.log('[Vault] Query folders result:', result);
    return result;
  } catch (e) {
    console.error('[Vault] Query folders exception:', e);
    return { success: false, folders: [], error: e.message };
  }
}

async function handleVaultCandidate(rawCandidate, sender) {
  try {
    const candidate = normalizeVaultCandidate(rawCandidate, sender);
    if (!candidate || !sender.tab?.id) {
      return { success: false, shouldPrompt: false, reason: 'invalid-candidate' };
    }

    const promptKey = getVaultPromptKey(candidate, sender.tab.id);
    if (isVaultPromptSuppressed(promptKey)) {
      return { success: true, shouldPrompt: false, reason: 'suppressed' };
    }

    const connected = await checkConnection();
    if (!connected) {
      return { success: false, shouldPrompt: false, reason: 'app-not-running' };
    }

    const existing = await queryVaultEntries(candidate.url);
    const existingEntries = existing.success ? (existing.entries || []) : [];
    const usernameExists = existingEntries.some(entry =>
      String(entry.username || '').trim().toLowerCase() === candidate.username.trim().toLowerCase()
    );

    if (usernameExists) {
      markVaultPrompt(promptKey, 'exists');
      return { success: true, shouldPrompt: false, reason: 'exists' };
    }

    let folders = [];
    try {
      console.log('[Vault] Loading folders for prompt...');
      const folderResult = await queryVaultFolders();
      console.log('[Vault] Folder query result:', folderResult);

      if (folderResult.success && Array.isArray(folderResult.folders)) {
        folders = folderResult.folders;
        console.log('[Vault] Loaded folders for prompt:', folders.length, folders);
      } else {
        console.error('[Vault] Failed to load folders:', folderResult.error || 'Unknown error');
      }
    } catch (e) {
      console.error('[Vault] Load vault folders exception:', e);
    }

    markVaultPrompt(promptKey, 'pending');
    const promptCandidate = { ...candidate, promptKey, folders };
    console.log('[Vault] Prepared prompt candidate with folders:', promptCandidate.folders?.length || 0, 'folders:', promptCandidate.folders);
    storePendingVaultPrompt(sender.tab.id, promptCandidate);

    try {
      await deliverVaultPrompt(sender.tab.id, promptCandidate);
      return { success: true, shouldPrompt: true };
    } catch (e) {
      console.warn('Show vault prompt in top frame failed:', e);
      return { success: true, shouldPrompt: true, showLocally: true, candidate: promptCandidate };
    }
  } catch (e) {
    console.error('Vault candidate handling failed:', e);
    return { success: false, shouldPrompt: false, error: e.message };
  }
}

async function handleVaultCreateCredential(rawCandidate, sender) {
  try {
    const candidate = normalizeVaultCandidate(rawCandidate, sender);
    if (!candidate) {
      return { success: false, error: '缺少网址、用户名或密码' };
    }

    const response = await vaultFetch('/api/vault/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidate),
    });
    const result = await response.json();

    if (result.success) {
      const promptKey = rawCandidate?.promptKey || getVaultPromptKey(candidate, sender.tab?.id);
      markVaultPrompt(promptKey, 'saved');
      clearPendingVaultPrompt(sender.tab?.id, promptKey);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '暮城笔记',
        message: '账号密码已保存到密码库',
      });
    }

    return result;
  } catch (e) {
    console.error('Vault credential create failed:', e);
    return { success: false, error: e.message || '保存失败' };
  }
}

async function postPasskeyRequest(path, request) {
  const response = await vaultFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request || {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok && !result.error) {
    result.error = `HTTP ${response.status}`;
  }
  return result;
}

async function handlePasskeyCreate(request, sender) {
  try {
    if (!(await isPasskeyEnabled())) {
      return { success: false, fallbackToNative: true, error: '暮城笔记通行密钥功能已关闭' };
    }

    const connected = await checkConnection();
    if (!connected) {
      return { success: false, fallbackToNative: true, error: '暮城笔记未运行' };
    }

    const payload = {
      ...(request || {}),
      url: request?.url || sender.tab?.url || '',
      title: request?.title || sender.tab?.title || '',
    };

    return await postPasskeyRequest('/api/vault/passkey/register', payload);
  } catch (e) {
    console.error('Passkey create failed:', e);
    return { success: false, fallbackToNative: true, error: e.message || '通行密钥创建失败' };
  }
}

async function handlePasskeyGet(request, sender) {
  try {
    if (!(await isPasskeyEnabled())) {
      return { success: false, fallbackToNative: true, error: '暮城笔记通行密钥功能已关闭' };
    }

    const connected = await checkConnection();
    if (!connected) {
      return { success: false, fallbackToNative: true, error: '暮城笔记未运行' };
    }

    const payload = {
      ...(request || {}),
      url: request?.url || sender.tab?.url || '',
      title: request?.title || sender.tab?.title || '',
    };

    return await postPasskeyRequest('/api/vault/passkey/assert', payload);
  } catch (e) {
    console.error('Passkey assertion failed:', e);
    return { success: false, fallbackToNative: true, error: e.message || '通行密钥验证失败' };
  }
}

chrome.runtime.onStartup?.addListener(() => {
  applyPasskeyContentScriptRegistration().catch((error) => {
    console.warn('Failed to apply passkey content script registration on startup:', error);
  });
});

applyPasskeyContentScriptRegistration().catch((error) => {
  console.warn('Failed to apply passkey content script registration:', error);
});

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  applyPasskeyContentScriptRegistration().catch((error) => {
    console.warn('Failed to apply passkey content script registration on install:', error);
  });

  chrome.contextMenus.create({
    id: 'clip-selection',
    title: '保存选中内容到暮城笔记',
    contexts: ['selection'],
  });
  
  chrome.contextMenus.create({
    id: 'clip-page',
    title: '保存整个页面到暮城笔记',
    contexts: ['page'],
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  
  if (info.menuItemId === 'clip-selection' && info.selectionText) {
    // 剪藏选中文本
    const data = {
      title: tab.title || '未命名',
      content: `<p>${info.selectionText}</p>`,
      url: tab.url || '',
    };
    
    const result = await handleQuickClip(data);
    if (result.success) {
      // 显示通知
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '暮城笔记',
        message: '已发送到暮城笔记，请在应用中确认',
      });
    }
  }
  
  if (info.menuItemId === 'clip-page') {
    // 剪藏整个页面 - 通过 popup 处理
    chrome.action.openPopup();
  }
});
