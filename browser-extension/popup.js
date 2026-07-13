/**
 * 暮城笔记 - 网页剪藏扩展 Popup 脚本
 */

const API_BASE = 'http://127.0.0.1:27183';
const VAULT_AUTH_STORAGE_KEY = 'muchengVaultAuthToken';
const VAULT_PASSWORD_GENERATOR_SETTINGS_KEY = 'muchengVaultPasswordGeneratorSettings';
const VAULT_REGISTRATION_SETTINGS_KEY = 'muchengVaultRegistrationSettings';
const VAULT_PASSKEY_ENABLED_STORAGE_KEY = 'muchengPasskeyEnabled';
const VAULT_DEFAULT_PASSWORD_SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?';
const VAULT_AUTH_HEADER = 'X-Mucheng-Extension-Token';
const VAULT_EXTENSION_ID_HEADER = 'X-Mucheng-Extension-Id';
let vaultPairPromise = null;

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result[key] || ''));
  });
}

function storageSet(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response || {});
    });
  });
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

// DOM 元素 - 通用
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('status-text');
const messageEl = document.getElementById('message');
const tabs = document.querySelectorAll('.tab');
const noteForm = document.getElementById('note-form');
const bookmarkForm = document.getElementById('bookmark-form');
const vaultForm = document.getElementById('vault-form');

// DOM 元素 - 笔记
const noteTitleInput = document.getElementById('note-title');
const noteFolderSelect = document.getElementById('note-folder');
const noteBtn = document.getElementById('note-btn');
const notePreviewEl = document.getElementById('note-preview');
const notePreviewContentEl = document.getElementById('note-preview-content');
const downloadImagesGroup = document.getElementById('download-images-group');
const downloadImagesCheckbox = document.getElementById('download-images');
const downloadImagesText = document.getElementById('download-images-text');

// DOM 元素 - 书签
const bookmarkIconImg = document.getElementById('bookmark-icon-img');
const bookmarkIconPlaceholder = document.getElementById('bookmark-icon-placeholder');
const bookmarkDomain = document.getElementById('bookmark-domain');
const bookmarkUrlPreview = document.getElementById('bookmark-url-preview');
const bookmarkNameInput = document.getElementById('bookmark-name');
const bookmarkDescInput = document.getElementById('bookmark-desc');
const bookmarkFolderSelect = document.getElementById('bookmark-folder');
const bookmarkBtn = document.getElementById('bookmark-btn');
const bookmarkAddEntryBtn = document.getElementById('bookmark-add-entry');
const bookmarkAddPanel = document.getElementById('bookmark-add-panel');
const bookmarkAddCancelBtn = document.getElementById('bookmark-add-cancel');
const bookmarkManagerCountEl = document.getElementById('bookmark-manager-count');
const bookmarkFolderListEl = document.getElementById('bookmark-folder-list');
const bookmarkListEl = document.getElementById('bookmark-list');
const bookmarkSearchInput = document.getElementById('bookmark-search');
const bookmarkSearchClearBtn = document.getElementById('bookmark-search-clear');

// DOM 元素 - 密码库
const vaultSiteUrlEl = document.getElementById('vault-site-url');
const vaultListEl = document.getElementById('vault-list');
const vaultAddToggleBtn = document.getElementById('vault-add-toggle');
const vaultCaptureBtn = document.getElementById('vault-capture-btn');
const vaultPasskeyEnabledInput = document.getElementById('vault-passkey-enabled');
const vaultAddPanel = document.getElementById('vault-add-panel');
const vaultAddNameInput = document.getElementById('vault-add-name');
const vaultAddUsernameInput = document.getElementById('vault-add-username');
const vaultAddPasswordInput = document.getElementById('vault-add-password');
const vaultAddPasswordGenerateBtn = document.getElementById('vault-add-password-generate');
const vaultAddPasswordViewBtn = document.getElementById('vault-add-password-view');
const vaultRegisterCountrySelect = document.getElementById('vault-register-country');
const vaultRegisterUsernameInput = document.getElementById('vault-register-username');
const vaultRegisterEmailInput = document.getElementById('vault-register-email');
const vaultRegisterPhoneInput = document.getElementById('vault-register-phone');
const vaultRegisterReadBtn = document.getElementById('vault-register-read');
const vaultRegisterGenerateBtn = document.getElementById('vault-register-generate');
const vaultRegisterGenerateLocalBtn = document.getElementById('vault-register-generate-local');
const vaultRegisterSummaryEl = document.getElementById('vault-register-summary');
const vaultGeneratePasswordBtn = document.getElementById('vault-generate-password');
const vaultPasswordTool = document.getElementById('vault-password-tool');
const vaultPasswordPreviewInput = document.getElementById('vault-password-preview');
const vaultPasswordRefreshBtn = document.getElementById('vault-password-refresh');
const vaultPasswordLengthInput = document.getElementById('vault-password-length');
const vaultPasswordLengthRange = document.getElementById('vault-password-length-range');
const vaultPasswordUppercaseInput = document.getElementById('vault-password-uppercase');
const vaultPasswordLowercaseInput = document.getElementById('vault-password-lowercase');
const vaultPasswordNumbersInput = document.getElementById('vault-password-numbers');
const vaultPasswordSymbolsEnabledInput = document.getElementById('vault-password-symbols-enabled');
const vaultPasswordAvoidConfusingInput = document.getElementById('vault-password-avoid-confusing');
const vaultPasswordSymbolsInput = document.getElementById('vault-password-symbols');
const vaultPasswordCopyBtn = document.getElementById('vault-password-copy');
const vaultPasswordUseBtn = document.getElementById('vault-password-use');
const vaultAddUrlInput = document.getElementById('vault-add-url');
const vaultAddUriNameInput = document.getElementById('vault-add-uri-name');
const vaultAddTotpNameInput = document.getElementById('vault-add-totp-name');
const vaultAddTotpSecretInput = document.getElementById('vault-add-totp-secret');
const vaultAddFolderSelect = document.getElementById('vault-add-folder');
const vaultAddNotesInput = document.getElementById('vault-add-notes');
const vaultAddCancelBtn = document.getElementById('vault-add-cancel');
const vaultAddSaveBtn = document.getElementById('vault-add-save');

// 状态
let pageData = null;
let bookmarkData = null;
let bookmarkFolders = [];
let bookmarkItems = [];
let selectedBookmarkFolderId = 'all';
let expandedBookmarkFolderIds = new Set();
let hasInitializedBookmarkExpansion = false;
let isBookmarkManagerLoading = false;
let bookmarkManagerError = '';
let bookmarkSearchQuery = '';
let currentPageUrl = '';
let vaultEntries = [];
let vaultFolders = [];
let isConnected = false;
let extractedImages = [];
let currentTab = 'vault';
let vaultTotpTimer = null;
let isVaultEntriesLoading = false;
let lastVaultRegistrationProfile = null;
let lastVaultCapturedCredential = null;

// 显示消息
function showMessage(text, type = 'success') {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.style.display = 'block';
  setTimeout(() => {
    messageEl.style.display = 'none';
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTotpCode(code) {
  const value = String(code || '').replace(/\s+/g, '');
  if (value.length === 6) {
    return `${value.slice(0, 3)} ${value.slice(3)}`;
  }
  return value || '------';
}

function getVaultTotpRemaining(totp) {
  if (!totp?.expiresAt) {
    return 0;
  }
  return Math.max(0, Math.ceil((totp.expiresAt - Date.now()) / 1000));
}

function normalizeVaultEntryTotps(entry, receivedAt) {
  return {
    ...entry,
    totps: (entry.totps || []).map(totp => ({
      ...totp,
      expiresAt: receivedAt + Math.max(1, Number(totp.remaining || 0)) * 1000,
    })),
  };
}

function stopVaultTotpTimer() {
  if (vaultTotpTimer) {
    clearInterval(vaultTotpTimer);
    vaultTotpTimer = null;
  }
}

function updateVaultTotpDom() {
  const totpEls = vaultListEl ? Array.from(vaultListEl.querySelectorAll('.vault-entry-totp')) : [];
  let hasExpired = false;

  totpEls.forEach((totpEl) => {
    const expiresAt = Number(totpEl.dataset.expiresAt || 0);
    const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    if (remaining <= 0) {
      hasExpired = true;
    }

    const codeEl = totpEl.querySelector('.vault-totp-code');
    const remainingEl = totpEl.querySelector('.vault-totp-remaining');
    if (remainingEl) {
      remainingEl.textContent = `${remaining}s`;
      remainingEl.classList.toggle('is-danger', remaining <= 5);
    }
    if (codeEl) {
      codeEl.classList.toggle('is-danger', remaining <= 5);
    }
  });

  if (hasExpired && !isVaultEntriesLoading && currentTab === 'vault') {
    loadVaultEntries();
  }
}

function syncVaultTotpTimer() {
  const hasTotps = currentTab === 'vault' && vaultEntries.some(entry => (entry.totps || []).length > 0);
  if (!hasTotps) {
    stopVaultTotpTimer();
    return;
  }

  if (!vaultTotpTimer) {
    vaultTotpTimer = setInterval(updateVaultTotpDom, 1000);
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) {
    throw new Error('copy failed');
  }
}

async function copyVaultTotpCode(code, triggerEl) {
  const value = String(code || '').replace(/\s+/g, '');
  if (!value) {
    showMessage('没有可复制的 TOTP 验证码', 'error');
    return;
  }

  try {
    if (triggerEl) {
      triggerEl.disabled = true;
    }
    await copyTextToClipboard(value);
    showMessage('TOTP 验证码已复制', 'success');
  } catch (e) {
    console.error('Copy TOTP failed:', e);
    showMessage('复制失败，请手动复制', 'error');
  } finally {
    if (triggerEl) {
      triggerEl.disabled = false;
    }
  }
}

// 更新连接状态
function updateStatus(connected, text) {
  isConnected = connected;
  statusEl.className = `status ${connected ? 'connected' : 'disconnected'}`;
  statusTextEl.textContent = text;
  statusEl.title = text;
  statusEl.setAttribute('aria-label', text);
  updateButtonStates();
}

// 更新按钮状态
function updateButtonStates() {
  noteBtn.disabled = !isConnected || !pageData;
  bookmarkBtn.disabled = !isConnected || !bookmarkData;
  if (bookmarkAddEntryBtn) {
    bookmarkAddEntryBtn.disabled = !isConnected || !bookmarkData;
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

// 检查应用连接状态
async function checkConnection() {
  try {
    const response = await fetch(`${API_BASE}/api/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.ok) {
      const data = await response.json();
      updateStatus(true, `已连接到 ${data.app}`);
      return true;
    }
  } catch (e) {
    console.error('Connection check failed:', e);
  }
  
  updateStatus(false, '未连接 - 请确保暮城笔记已启动');
  return false;
}

// 加载笔记文件夹列表
async function loadNoteFolders() {
  try {
    const response = await vaultFetch('/api/folders', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.ok) {
      const data = await response.json();
      const folders = data.folders || [];
      
      // 调试日志
      console.log('[Clipper] Loaded note folders:', folders);
      console.log('[Clipper] Folders with parentId:', folders.filter(f => f.parentId !== null));
      
      // 递归构建带缩进的文件夹选项
      const buildOptions = (parentId, level) => {
        const children = folders.filter(f => f.parentId === parentId);
        let html = '';
        for (const folder of children) {
          // 使用空格缩进表示层级
          const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(level);
          const prefix = level > 0 ? '└─ ' : '';
          html += `<option value="${folder.id}">${indent}${prefix}📁 ${folder.name}</option>`;
          html += buildOptions(folder.id, level + 1);
        }
        return html;
      };
      
      noteFolderSelect.innerHTML = '<option value="">📁 根目录</option>' + buildOptions(null, 0);
    }
  } catch (e) {
    console.error('Failed to load note folders:', e);
  }
}

// 加载书签文件夹列表
async function loadBookmarkFolders() {
  try {
    const response = await vaultFetch('/api/bookmark-folders', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.ok) {
      const data = await response.json();
      bookmarkFolders = data.folders || [];
      renderBookmarkFolderSelect();
    }
  } catch (e) {
    console.error('Failed to load bookmark folders:', e);
  }
}

function buildBookmarkFolderOptions(parentId, level) {
  const children = bookmarkFolders.filter(folder => (folder.parentId || null) === parentId);
  let html = '';

  for (const folder of children) {
    const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(level);
    const prefix = level > 0 ? '└─ ' : '';
    html += `<option value="${escapeHtml(folder.id)}">${indent}${prefix}📁 ${escapeHtml(folder.name)}</option>`;
    html += buildBookmarkFolderOptions(folder.id, level + 1);
  }

  return html;
}

function renderBookmarkFolderSelect() {
  if (!bookmarkFolderSelect) return;
  bookmarkFolderSelect.innerHTML = '<option value="">📁 根目录</option>' + buildBookmarkFolderOptions(null, 0);
}

function getBookmarkChildFolders(parentId) {
  return bookmarkFolders
    .filter(folder => (folder.parentId || null) === parentId)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'));
}

function bookmarkFolderHasChildren(folderId) {
  return bookmarkFolders.some(folder => (folder.parentId || null) === folderId);
}

function expandBookmarkAncestors(folderId) {
  if (!folderId || folderId === 'all') return;

  const folderById = new Map(bookmarkFolders.map(folder => [folder.id, folder]));
  let current = folderById.get(folderId);
  while (current?.parentId) {
    expandedBookmarkFolderIds.add(current.parentId);
    current = folderById.get(current.parentId);
  }
}

function syncBookmarkFolderExpansion() {
  const existingIds = new Set(bookmarkFolders.map(folder => folder.id));
  expandedBookmarkFolderIds = new Set(
    Array.from(expandedBookmarkFolderIds).filter(id => existingIds.has(id))
  );

  if (!hasInitializedBookmarkExpansion && bookmarkFolders.length > 0) {
    getBookmarkChildFolders(null).forEach(folder => {
      expandedBookmarkFolderIds.add(folder.id);
    });
    hasInitializedBookmarkExpansion = true;
  }

  if (selectedBookmarkFolderId && selectedBookmarkFolderId !== 'all') {
    expandBookmarkAncestors(selectedBookmarkFolderId);
  }
}

function isBookmarkDescendantOf(folderId, parentId) {
  const folderById = new Map(bookmarkFolders.map(folder => [folder.id, folder]));
  let current = folderById.get(folderId);

  while (current?.parentId) {
    if (current.parentId === parentId) {
      return true;
    }
    current = folderById.get(current.parentId);
  }

  return false;
}

function toggleBookmarkFolder(folderId) {
  if (!folderId || !bookmarkFolderHasChildren(folderId)) return;

  if (expandedBookmarkFolderIds.has(folderId)) {
    expandedBookmarkFolderIds.delete(folderId);
    if (
      selectedBookmarkFolderId &&
      selectedBookmarkFolderId !== 'all' &&
      isBookmarkDescendantOf(selectedBookmarkFolderId, folderId)
    ) {
      selectedBookmarkFolderId = folderId;
    }
  } else {
    expandedBookmarkFolderIds.add(folderId);
  }

  renderBookmarkManager();
}

function getBookmarkDescendantFolderIds(parentId) {
  const result = [parentId];
  const children = bookmarkFolders.filter(folder => (folder.parentId || null) === parentId);

  for (const child of children) {
    result.push(...getBookmarkDescendantFolderIds(child.id));
  }

  return result;
}

function getBookmarksForSelection(folderId) {
  if (folderId === 'all') {
    return [...bookmarkItems];
  }

  if (folderId === null) {
    return bookmarkItems.filter(bookmark => !bookmark.folderId);
  }

  const folderIds = getBookmarkDescendantFolderIds(folderId);
  return bookmarkItems.filter(bookmark => bookmark.folderId && folderIds.includes(bookmark.folderId));
}

function normalizeBookmarkSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function bookmarkMatchesSearch(bookmark, query) {
  if (!query) return true;
  const tags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
  const haystack = [
    bookmark.name,
    bookmark.url,
    bookmark.description,
    getBookmarkDomain(bookmark.url),
    ...tags,
  ].join(' ').toLowerCase();

  return haystack.includes(query);
}

function getVisibleBookmarksForSelection(folderId) {
  const query = normalizeBookmarkSearch(bookmarkSearchQuery);
  return getBookmarksForSelection(folderId)
    .filter(bookmark => bookmarkMatchesSearch(bookmark, query));
}

function syncBookmarkSearchControls() {
  const hasQuery = Boolean(normalizeBookmarkSearch(bookmarkSearchQuery));
  if (bookmarkSearchInput && bookmarkSearchInput.value !== bookmarkSearchQuery) {
    bookmarkSearchInput.value = bookmarkSearchQuery;
  }
  bookmarkSearchClearBtn?.classList.toggle('active', hasQuery);
}

function getBookmarkDomain(url) {
  try {
    return new URL(normalizeBookmarkUrl(url)).hostname;
  } catch {
    return url || '';
  }
}

function normalizeBookmarkUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

function getBookmarkFaviconUrl(url) {
  try {
    const parsed = new URL(normalizeBookmarkUrl(url));
    return `${parsed.protocol}//${parsed.hostname}/favicon.ico`;
  } catch {
    return '';
  }
}

function getBookmarkInitial(name) {
  const value = String(name || '').trim();
  if (!value) return '?';
  const first = value[0];
  if (/[\u4e00-\u9fa5]/.test(first)) return first;
  const letters = value.replace(/[^a-zA-Z]/g, '');
  return (letters.slice(0, 2) || first).toUpperCase();
}

function getBookmarkAvatarColor(key) {
  const colors = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#475569'];
  let hash = 0;
  const value = String(key || '');
  for (let i = 0; i < value.length; i++) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function setBookmarkIconFallback(iconEl, bookmark) {
  iconEl.innerHTML = '';
  iconEl.textContent = getBookmarkInitial(bookmark.name);
  iconEl.style.background = getBookmarkAvatarColor(bookmark.url || bookmark.name);
}

function renderBookmarkIcon(iconEl, bookmark) {
  const customIcon = String(bookmark.icon || '').trim();
  const favicon = getBookmarkFaviconUrl(bookmark.url);
  const iconSrc = customIcon && (/^https?:\/\//i.test(customIcon) || customIcon.startsWith('data:image'))
    ? customIcon
    : favicon;

  iconEl.innerHTML = '';
  iconEl.style.background = '#eef2f8';

  if (!iconSrc) {
    setBookmarkIconFallback(iconEl, bookmark);
    return;
  }

  const img = document.createElement('img');
  img.src = iconSrc;
  img.alt = '';
  img.onerror = () => setBookmarkIconFallback(iconEl, bookmark);
  iconEl.appendChild(img);
}

function openBookmarkFromManager(bookmark) {
  const url = normalizeBookmarkUrl(bookmark.url);
  if (!url) {
    showMessage('书签地址为空', 'error');
    return;
  }

  chrome.tabs.create({ url });
}

function createBookmarkFolderButton(selection, name, level = 0, hasChildren = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = [
    'bookmark-folder-button',
    level > 0 ? 'is-child' : '',
    selectedBookmarkFolderId === selection ? 'active' : '',
  ].filter(Boolean).join(' ');
  button.style.setProperty('--bookmark-folder-level', String(Math.min(level, 4)));

  const isExpanded = typeof selection === 'string' && expandedBookmarkFolderIds.has(selection);

  const toggleEl = document.createElement('span');
  toggleEl.className = `bookmark-folder-toggle${hasChildren ? ' has-children' : ''}`;
  toggleEl.textContent = hasChildren ? (isExpanded ? '▾' : '▸') : '';
  toggleEl.setAttribute('aria-hidden', 'true');

  const nameEl = document.createElement('span');
  nameEl.className = 'bookmark-folder-name';
  nameEl.textContent = name;

  const countEl = document.createElement('span');
  countEl.className = 'bookmark-folder-count';
  countEl.textContent = String(getVisibleBookmarksForSelection(selection).length);

  button.append(toggleEl, nameEl, countEl);
  if (hasChildren) {
    button.setAttribute('aria-expanded', String(isExpanded));
  }

  button.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (hasChildren && target?.closest('.bookmark-folder-toggle')) {
      event.preventDefault();
      toggleBookmarkFolder(selection);
      return;
    }

    selectedBookmarkFolderId = selection;
    if (typeof selection === 'string') {
      expandBookmarkAncestors(selection);
    }
    renderBookmarkManager();
  });
  button.addEventListener('keydown', (event) => {
    if (!hasChildren || typeof selection !== 'string') return;

    if (event.key === 'ArrowRight' && !expandedBookmarkFolderIds.has(selection)) {
      event.preventDefault();
      toggleBookmarkFolder(selection);
    }
    if (event.key === 'ArrowLeft' && expandedBookmarkFolderIds.has(selection)) {
      event.preventDefault();
      toggleBookmarkFolder(selection);
    }
  });

  return button;
}

function renderBookmarkFolders() {
  if (!bookmarkFolderListEl) return;
  bookmarkFolderListEl.innerHTML = '';
  syncBookmarkFolderExpansion();

  bookmarkFolderListEl.appendChild(createBookmarkFolderButton('all', '全部书签'));
  bookmarkFolderListEl.appendChild(createBookmarkFolderButton(null, '未分类'));

  const renderTree = (parentId = null, level = 0) => {
    getBookmarkChildFolders(parentId)
      .forEach((folder) => {
        const hasChildren = bookmarkFolderHasChildren(folder.id);
        const isExpanded = expandedBookmarkFolderIds.has(folder.id);
        bookmarkFolderListEl.appendChild(createBookmarkFolderButton(
          folder.id,
          folder.name,
          level,
          hasChildren,
        ));
        if (hasChildren && isExpanded) {
          renderTree(folder.id, level + 1);
        }
      });
  };

  renderTree();
}

function renderBookmarkItems() {
  if (!bookmarkListEl) return;

  if (!isConnected) {
    bookmarkListEl.innerHTML = '<div class="bookmark-empty">请先启动暮城笔记桌面端</div>';
    if (bookmarkManagerCountEl) bookmarkManagerCountEl.textContent = '未连接';
    return;
  }

  if (isBookmarkManagerLoading) {
    bookmarkListEl.innerHTML = '<div class="bookmark-empty">正在读取书签...</div>';
    if (bookmarkManagerCountEl) bookmarkManagerCountEl.textContent = '正在读取书签...';
    return;
  }

  if (bookmarkManagerError) {
    bookmarkListEl.innerHTML = `<div class="bookmark-empty">${escapeHtml(bookmarkManagerError)}</div>`;
    if (bookmarkManagerCountEl) bookmarkManagerCountEl.textContent = '读取失败';
    return;
  }

  const query = normalizeBookmarkSearch(bookmarkSearchQuery);
  const filtered = getVisibleBookmarksForSelection(selectedBookmarkFolderId)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'));

  if (bookmarkManagerCountEl) {
    bookmarkManagerCountEl.textContent = query
      ? `共 ${bookmarkItems.length} 个，匹配 ${filtered.length} 个`
      : `共 ${bookmarkItems.length} 个，当前 ${filtered.length} 个`;
  }

  if (!filtered.length) {
    bookmarkListEl.innerHTML = query
      ? '<div class="bookmark-empty">没有找到匹配的书签</div>'
      : '<div class="bookmark-empty">当前分类暂无书签</div>';
    return;
  }

  bookmarkListEl.innerHTML = '';
  filtered.forEach(bookmark => {
    const itemEl = document.createElement('div');
    itemEl.className = 'bookmark-item';
    itemEl.tabIndex = 0;
    itemEl.setAttribute('role', 'button');
    itemEl.setAttribute('aria-label', `打开 ${bookmark.name || '未命名书签'}`);

    const iconEl = document.createElement('div');
    iconEl.className = 'bookmark-item-icon';
    renderBookmarkIcon(iconEl, bookmark);

    const mainEl = document.createElement('div');
    mainEl.className = 'bookmark-item-main';

    const nameEl = document.createElement('div');
    nameEl.className = 'bookmark-item-name';
    nameEl.textContent = bookmark.name || '未命名书签';

    const metaEl = document.createElement('div');
    metaEl.className = 'bookmark-item-meta';
    metaEl.textContent = bookmark.description || getBookmarkDomain(bookmark.url);

    const openEl = document.createElement('div');
    openEl.className = 'bookmark-item-open';
    openEl.textContent = '↗';

    mainEl.append(nameEl, metaEl);
    itemEl.append(iconEl, mainEl, openEl);
    itemEl.addEventListener('click', () => openBookmarkFromManager(bookmark));
    itemEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openBookmarkFromManager(bookmark);
      }
    });

    bookmarkListEl.appendChild(itemEl);
  });
}

function renderBookmarkManager() {
  syncBookmarkSearchControls();
  renderBookmarkFolders();
  renderBookmarkItems();
}

async function loadBookmarkManager() {
  if (!isConnected) {
    renderBookmarkManager();
    return;
  }

  isBookmarkManagerLoading = true;
  bookmarkManagerError = '';
  renderBookmarkManager();

  try {
    const response = await vaultFetch('/api/bookmarks', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await response.json();

    if (!response.ok || result.success === false) {
      throw new Error(result.error || '读取书签失败');
    }

    bookmarkFolders = (result.folders || []).map(folder => ({
      ...folder,
      parentId: folder.parentId || null,
    }));
    bookmarkItems = (result.bookmarks || []).map(bookmark => ({
      ...bookmark,
      folderId: bookmark.folderId || null,
      icon: bookmark.icon || null,
      tags: bookmark.tags || [],
    }));
    renderBookmarkFolderSelect();
  } catch (e) {
    console.error('Failed to load bookmarks:', e);
    bookmarkManagerError = '读取书签失败';
  } finally {
    isBookmarkManagerLoading = false;
    renderBookmarkManager();
  }
}

function toggleBookmarkAddPanel(open) {
  if (!bookmarkAddPanel) return;
  const shouldOpen = typeof open === 'boolean' ? open : !bookmarkAddPanel.classList.contains('active');
  bookmarkAddPanel.classList.toggle('active', shouldOpen);

  if (shouldOpen) {
    if (bookmarkData) {
      bookmarkNameInput.value = bookmarkNameInput.value || bookmarkData.name || '';
      bookmarkDescInput.value = bookmarkDescInput.value || bookmarkData.description || '';
    }
    bookmarkNameInput?.focus();
  }
}

// 使用 Turndown 将 HTML 转换为 Markdown
function htmlToMarkdown(html) {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });
  
  if (typeof turndownPluginGfm !== 'undefined') {
    turndownService.use(turndownPluginGfm.gfm);
  }
  
  turndownService.remove(['script', 'style', 'noscript', 'iframe', 'form', 'button', 'input', 'select', 'textarea', 'nav', 'footer', 'aside']);
  
  turndownService.addRule('filterImages', {
    filter: function(node) {
      if (node.nodeName !== 'IMG') return false;
      const src = node.getAttribute('src') || '';
      return src.startsWith('data:') || 
             src.includes('loading') || 
             src.includes('placeholder') ||
             src.includes('lazy') ||
             src.endsWith('.svg');
    },
    replacement: function() {
      return '';
    }
  });
  
  try {
    let markdown = turndownService.turndown(html);
    markdown = markdown
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '');
    return markdown;
  } catch (e) {
    console.error('Turndown conversion failed:', e);
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || '';
  }
}

// 提取 HTML 中的图片 URL
function extractImageUrls(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const images = temp.querySelectorAll('img');
  const urls = [];
  
  images.forEach(img => {
    const src = img.getAttribute('src') || '';
    if (src && 
        !src.startsWith('data:') && 
        !src.includes('loading') && 
        !src.includes('placeholder') &&
        !src.includes('lazy') &&
        !src.endsWith('.svg') &&
        (src.startsWith('http://') || src.startsWith('https://'))) {
      urls.push({
        src: src,
        alt: img.getAttribute('alt') || ''
      });
    }
  });
  
  return urls;
}

// 获取当前页面内容（用于笔记）
async function getPageContent() {
  try {
    const tab = await getActiveTab();
    
    if (!tab || !tab.id) {
      showMessage('无法获取当前页面', 'error');
      return null;
    }
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (typeof Readability !== 'undefined') {
          const documentClone = document.cloneNode(true);
          const reader = new Readability(documentClone);
          const article = reader.parse();
          
          if (article) {
            return {
              title: article.title || document.title,
              content: article.content,
              url: window.location.href,
              excerpt: article.excerpt,
            };
          }
        }
        
        const selection = window.getSelection().toString();
        if (selection) {
          return {
            title: document.title,
            content: `<p>${selection}</p>`,
            url: window.location.href,
            excerpt: selection.substring(0, 200),
          };
        }
        
        const main = document.querySelector('main, article, .content, .post, .entry') || document.body;
        return {
          title: document.title,
          content: main.innerHTML,
          url: window.location.href,
          excerpt: main.textContent?.substring(0, 200) || '',
        };
      },
    });
    
    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
  } catch (e) {
    console.error('Failed to get page content:', e);
    showMessage('获取页面内容失败', 'error');
  }
  
  return null;
}

const BOOKMARK_ICON_INLINE_MAX_BYTES = 120 * 1024;
const BOOKMARK_ICON_FETCH_TIMEOUT_MS = 2500;

function inferBookmarkIconMime(iconUrl, contentType) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (mime.startsWith('image/')) return mime;

  try {
    const path = new URL(iconUrl).pathname.toLowerCase();
    if (path.endsWith('.svg')) return 'image/svg+xml';
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.ico')) return 'image/x-icon';
  } catch {
    // Keep the remote icon when the URL cannot be parsed.
  }

  return '';
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

async function inlineBookmarkIcon(iconUrl) {
  const value = String(iconUrl || '').trim();
  if (!value || value.startsWith('data:image') || value.startsWith('<svg') || !/^https?:\/\//i.test(value)) {
    return value;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOOKMARK_ICON_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(value, {
      cache: 'force-cache',
      credentials: 'omit',
      signal: controller.signal,
    });

    if (!response.ok) return value;

    const mime = inferBookmarkIconMime(value, response.headers.get('content-type'));
    if (!mime) return value;

    if (mime === 'image/svg+xml') {
      const svg = await response.text();
      const text = svg.trim();
      if (!text || new Blob([text]).size > BOOKMARK_ICON_INLINE_MAX_BYTES) return value;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
    }

    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > BOOKMARK_ICON_INLINE_MAX_BYTES) return value;
    return `data:${mime};base64,${arrayBufferToBase64(buffer)}`;
  } catch (e) {
    console.warn('Failed to inline bookmark icon:', e);
    return value;
  } finally {
    clearTimeout(timer);
  }
}

// 获取当前页面书签信息
async function getBookmarkInfo() {
  try {
    const tab = await getActiveTab();
    
    if (!tab || !tab.id) {
      showMessage('无法获取当前页面', 'error');
      return null;
    }
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

        const getMetaContent = (selectors) => {
          for (const selector of selectors) {
            const content = cleanText(document.querySelector(selector)?.getAttribute('content'));
            if (content) return content;
          }
          return '';
        };

        const getElementText = (selectors) => {
          for (const selector of selectors) {
            const text = cleanText(document.querySelector(selector)?.textContent);
            if (text) return text;
          }
          return '';
        };

        // 获取网站图标
        const getIcon = () => {
          // 优先获取 apple-touch-icon
          const appleIcon = document.querySelector('link[rel~="apple-touch-icon"], link[rel~="apple-touch-icon-precomposed"]');
          if (appleIcon?.href) return appleIcon.href;
          
          // 获取 favicon
          const favicon = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"]');
          if (favicon?.href) return favicon.href;
          
          // 默认 favicon 路径
          return window.location.origin + '/favicon.ico';
        };
        
        // 获取网站描述
        const getDescription = () => {
          const metaDescription = getMetaContent([
            'meta[property="og:description"]',
            'meta[name="twitter:description"]',
            'meta[property="twitter:description"]',
            'meta[name="description"]',
          ]);
          if (metaDescription) return metaDescription;

          const paragraph = getElementText([
            'article p',
            'main p',
            '[role="main"] p',
            'p',
          ]);
          return paragraph ? paragraph.substring(0, 200) : '';
        };
        
        // 获取网站名称
        const getName = () => {
          const pageTitle = getMetaContent([
            'meta[property="og:title"]',
            'meta[name="twitter:title"]',
            'meta[property="twitter:title"]',
            'meta[name="title"]',
          ]);
          if (pageTitle) return pageTitle;

          const documentTitle = cleanText(document.title);
          if (documentTitle) return documentTitle;

          const h1Title = getElementText(['h1']);
          if (h1Title) return h1Title;

          const siteName = getMetaContent(['meta[property="og:site_name"]']);
          return siteName || window.location.hostname;
        };
        
        return {
          name: getName(),
          url: window.location.href,
          description: getDescription(),
          icon: getIcon(),
          domain: window.location.hostname,
        };
      },
    });
    
    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
  } catch (e) {
    console.error('Failed to get bookmark info:', e);
    showMessage('获取页面信息失败', 'error');
  }
  
  return null;
}

function renderVaultEntries() {
  if (!vaultListEl) return;

  if (!isConnected) {
    vaultListEl.innerHTML = '<div class="vault-empty">请先启动暮城笔记桌面端</div>';
    stopVaultTotpTimer();
    return;
  }

  if (!currentPageUrl || !/^https?:\/\//i.test(currentPageUrl)) {
    vaultListEl.innerHTML = '<div class="vault-empty">当前页面不支持密码填充</div>';
    stopVaultTotpTimer();
    return;
  }

  if (!vaultEntries.length) {
    vaultListEl.innerHTML = `
      <div class="vault-empty">
        没有找到匹配当前网站的账号<br>
        可以手动添加或先读取页面输入
        <button id="vault-empty-add-btn" class="vault-empty-action" type="button">手动添加账号</button>
      </div>
    `;
    document.getElementById('vault-empty-add-btn')?.addEventListener('click', () => toggleVaultAddPanel(true));
    stopVaultTotpTimer();
    return;
  }

  vaultListEl.innerHTML = '';
  vaultEntries.forEach(entry => {
    const entryEl = document.createElement('div');
    entryEl.className = 'vault-entry';
    entryEl.dataset.id = entry.id;
    entryEl.tabIndex = 0;
    entryEl.setAttribute('role', 'button');
    entryEl.setAttribute('aria-label', `填充 ${entry.name || '未命名登录'} 的账号和密码`);

    const safeName = escapeHtml(entry.name || '未命名登录');
    const safeUsername = escapeHtml(entry.username || '无用户名');
    const firstTotp = (entry.totps || [])[0];
    const remaining = getVaultTotpRemaining(firstTotp);
    const isDanger = remaining <= 5;
    const totpHtml = firstTotp ? `
      <div
        class="vault-entry-totp"
        data-expires-at="${Number(firstTotp.expiresAt || 0)}"
        data-totp-code="${escapeHtml(firstTotp.code || '')}"
        tabindex="0"
        role="button"
        aria-label="填充 ${escapeHtml(firstTotp.name || 'TOTP')} 验证码"
        title="点击填充验证码"
      >
        <div class="vault-totp-top">
          <div class="vault-totp-code${isDanger ? ' is-danger' : ''}">${escapeHtml(formatTotpCode(firstTotp.code))}</div>
          <button
            class="vault-totp-copy"
            type="button"
            title="复制 TOTP 验证码"
            aria-label="复制 TOTP 验证码"
            data-totp-code="${escapeHtml(firstTotp.code || '')}"
          >复制</button>
        </div>
        <div class="vault-totp-meta">
          <span class="vault-totp-name">${escapeHtml(firstTotp.name || 'TOTP')}</span>
          <span class="vault-totp-remaining${isDanger ? ' is-danger' : ''}">${remaining}s</span>
          ${(entry.totps || []).length > 1 ? `<span class="vault-totp-extra">+${(entry.totps || []).length - 1}</span>` : ''}
        </div>
      </div>
    ` : '';
    entryEl.innerHTML = `
      <div class="vault-entry-info">
        <div class="vault-entry-title">
          <span>${safeName}</span>
          ${entry.favorite ? '<span class="vault-favorite">★</span>' : ''}
        </div>
        <div class="vault-entry-user">${safeUsername}</div>
      </div>
      ${totpHtml}
    `;

    const triggerFill = () => {
      if (entryEl.classList.contains('is-filling')) return;
      fillVaultCredential(entry.id);
    };

    entryEl.addEventListener('click', triggerFill);
    entryEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        triggerFill();
      }
    });
    const totpCopyBtn = entryEl.querySelector('.vault-totp-copy');
    totpCopyBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      copyVaultTotpCode(event.currentTarget.dataset.totpCode, event.currentTarget);
    });
    totpCopyBtn?.addEventListener('keydown', (event) => {
      event.stopPropagation();
    });
    const totpEl = entryEl.querySelector('.vault-entry-totp');
    const triggerTotpFill = (event) => {
      event.stopPropagation();
      if (totpEl.classList.contains('is-filling')) return;
      fillVaultTotpCode(totpEl.dataset.totpCode, totpEl);
    };
    totpEl?.addEventListener('click', triggerTotpFill);
    totpEl?.addEventListener('keydown', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.vault-totp-copy')) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        triggerTotpFill(event);
      }
    });
    vaultListEl.appendChild(entryEl);
  });
  syncVaultTotpTimer();
}

function getDefaultVaultEntryName() {
  if (bookmarkData?.name) return bookmarkData.name;
  if (pageData?.title) return pageData.title;

  try {
    return new URL(currentPageUrl).hostname;
  } catch {
    return '网站登录';
  }
}

function getDefaultVaultUriName() {
  if (bookmarkData?.domain) return bookmarkData.domain;

  try {
    return new URL(currentPageUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function buildFolderOptions(folders, parentId = null, level = 0) {
  const children = folders.filter(folder => (folder.parentId || null) === parentId);
  let html = '';

  for (const folder of children) {
    const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(level);
    const prefix = level > 0 ? '└─ ' : '';
    html += `<option value="${escapeHtml(folder.id)}">${indent}${prefix}📁 ${escapeHtml(folder.name)}</option>`;
    html += buildFolderOptions(folders, folder.id, level + 1);
  }

  return html;
}

function renderVaultFolderSelect() {
  if (!vaultAddFolderSelect) return;
  vaultAddFolderSelect.innerHTML = '<option value="">未分类</option>' + buildFolderOptions(vaultFolders);
}

async function loadVaultFolders() {
  try {
    const response = await vaultFetch('/api/vault-folders', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await response.json();
    vaultFolders = result.success ? (result.folders || []) : [];
    renderVaultFolderSelect();
  } catch (e) {
    console.error('Failed to load vault folders:', e);
    vaultFolders = [];
    renderVaultFolderSelect();
  }
}

function normalizeVaultUrlInput(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function getSecureRandomIndex(max) {
  if (!Number.isFinite(max) || max <= 0) return 0;
  const cryptoApi = globalThis.crypto || window.crypto;
  if (!cryptoApi?.getRandomValues) {
    return Math.floor(Math.random() * max);
  }

  const limit = Math.floor(0x100000000 / max) * max;
  const values = new Uint32Array(1);
  do {
    cryptoApi.getRandomValues(values);
  } while (values[0] >= limit);

  return values[0] % max;
}

function shuffleVaultPasswordCharacters(characters) {
  const result = [...characters];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = getSecureRandomIndex(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.join('');
}

function getVaultPasswordOptions() {
  const lengthValue = Number(vaultPasswordLengthInput?.value || vaultPasswordLengthRange?.value || 18);
  return {
    length: Math.min(64, Math.max(6, Number.isFinite(lengthValue) ? Math.round(lengthValue) : 18)),
    uppercase: vaultPasswordUppercaseInput?.checked !== false,
    lowercase: vaultPasswordLowercaseInput?.checked !== false,
    numbers: vaultPasswordNumbersInput?.checked !== false,
    symbols: vaultPasswordSymbolsEnabledInput?.checked !== false,
    avoidConfusing: vaultPasswordAvoidConfusingInput?.checked !== false,
    symbolCharacters: vaultPasswordSymbolsInput ? vaultPasswordSymbolsInput.value : VAULT_DEFAULT_PASSWORD_SYMBOLS,
  };
}

function applyVaultPasswordOptions(options) {
  if (!options || typeof options !== 'object') {
    syncVaultPasswordLengthControls(18);
    return;
  }

  syncVaultPasswordLengthControls(options.length);
  if (vaultPasswordUppercaseInput) vaultPasswordUppercaseInput.checked = options.uppercase !== false;
  if (vaultPasswordLowercaseInput) vaultPasswordLowercaseInput.checked = options.lowercase !== false;
  if (vaultPasswordNumbersInput) vaultPasswordNumbersInput.checked = options.numbers !== false;
  if (vaultPasswordSymbolsEnabledInput) vaultPasswordSymbolsEnabledInput.checked = options.symbols !== false;
  if (vaultPasswordAvoidConfusingInput) vaultPasswordAvoidConfusingInput.checked = options.avoidConfusing !== false;
  if (vaultPasswordSymbolsInput) {
    vaultPasswordSymbolsInput.value = typeof options.symbolCharacters === 'string'
      ? options.symbolCharacters
      : VAULT_DEFAULT_PASSWORD_SYMBOLS;
  }
}

async function loadVaultPasswordGeneratorSettings() {
  try {
    const savedOptions = await storageGet(VAULT_PASSWORD_GENERATOR_SETTINGS_KEY);
    if (typeof savedOptions === 'string' && savedOptions) {
      applyVaultPasswordOptions(JSON.parse(savedOptions));
      return;
    }
    applyVaultPasswordOptions(savedOptions);
  } catch (e) {
    console.warn('Failed to load password generator settings:', e);
    applyVaultPasswordOptions(null);
  }
}

function saveVaultPasswordGeneratorSettings() {
  storageSet(VAULT_PASSWORD_GENERATOR_SETTINGS_KEY, getVaultPasswordOptions()).catch((e) => {
    console.warn('Failed to save password generator settings:', e);
  });
}

async function loadVaultPasskeySetting() {
  if (!vaultPasskeyEnabledInput) return;

  try {
    const result = await sendRuntimeMessage({ action: 'getPasskeyEnabled' });
    vaultPasskeyEnabledInput.checked = result?.enabled === true;
  } catch (e) {
    console.warn('Failed to load passkey setting from background:', e);
    const saved = await storageGet(VAULT_PASSKEY_ENABLED_STORAGE_KEY);
    vaultPasskeyEnabledInput.checked = saved === true;
  }
}

async function handleVaultPasskeyToggle() {
  if (!vaultPasskeyEnabledInput) return;

  const enabled = vaultPasskeyEnabledInput.checked;
  vaultPasskeyEnabledInput.disabled = true;

  try {
    const tab = await getActiveTab();
    const result = await sendRuntimeMessage({
      action: 'setPasskeyEnabled',
      enabled,
      tabId: tab?.id,
    });
    if (!result?.success) {
      throw new Error(result?.error || '通行密钥设置失败');
    }
    vaultPasskeyEnabledInput.checked = result.enabled === true;
    showMessage(
      result.enabled ? '通行密钥接管已开启' : '通行密钥接管已关闭',
      'success',
    );
  } catch (e) {
    vaultPasskeyEnabledInput.checked = !enabled;
    showMessage(e.message || '通行密钥设置失败', 'error');
  } finally {
    vaultPasskeyEnabledInput.disabled = false;
  }
}

function normalizeVaultPasswordCharacters(value, avoidConfusing) {
  const confusingCharacters = new Set(['0', 'O', 'o', '1', 'l', 'I']);
  const seen = new Set();
  return [...String(value || '')].filter((character) => {
    if (avoidConfusing && confusingCharacters.has(character)) return false;
    if (seen.has(character)) return false;
    seen.add(character);
    return true;
  }).join('');
}

function getVaultPasswordCharacterGroups(options) {
  const groups = [];

  if (options.uppercase) {
    groups.push(normalizeVaultPasswordCharacters('ABCDEFGHIJKLMNOPQRSTUVWXYZ', options.avoidConfusing));
  }
  if (options.lowercase) {
    groups.push(normalizeVaultPasswordCharacters('abcdefghijklmnopqrstuvwxyz', options.avoidConfusing));
  }
  if (options.numbers) {
    groups.push(normalizeVaultPasswordCharacters('0123456789', options.avoidConfusing));
  }
  if (options.symbols) {
    groups.push(normalizeVaultPasswordCharacters(options.symbolCharacters, false));
  }

  return groups.filter(Boolean);
}

function generateVaultPassword(options = getVaultPasswordOptions()) {
  const groups = getVaultPasswordCharacterGroups(options);
  if (groups.length === 0) {
    return '';
  }

  const allCharacters = groups.join('');
  const characters = groups.map(group => group[getSecureRandomIndex(group.length)]);

  while (characters.length < options.length) {
    characters.push(allCharacters[getSecureRandomIndex(allCharacters.length)]);
  }

  return shuffleVaultPasswordCharacters(characters);
}

function syncVaultPasswordLengthControls(value) {
  const nextValue = Math.min(64, Math.max(6, Math.round(Number(value) || 18)));
  if (vaultPasswordLengthInput) vaultPasswordLengthInput.value = String(nextValue);
  if (vaultPasswordLengthRange) vaultPasswordLengthRange.value = String(nextValue);
  return nextValue;
}

function refreshVaultGeneratedPassword() {
  if (!vaultPasswordPreviewInput) return '';

  syncVaultPasswordLengthControls(vaultPasswordLengthInput?.value || vaultPasswordLengthRange?.value || 18);
  const password = generateVaultPassword();
  vaultPasswordPreviewInput.value = password;
  vaultPasswordPreviewInput.placeholder = password ? '' : '请至少选择一种字符类型';
  vaultPasswordUseBtn?.toggleAttribute('disabled', !password);
  vaultPasswordCopyBtn?.toggleAttribute('disabled', !password);
  return password;
}

function handleVaultPasswordOptionsChange() {
  refreshVaultGeneratedPassword();
  saveVaultPasswordGeneratorSettings();
}

function toggleVaultPasswordTool(open) {
  if (!vaultPasswordTool) return;

  const shouldOpen = typeof open === 'boolean' ? open : !vaultPasswordTool.classList.contains('active');
  vaultPasswordTool.classList.toggle('active', shouldOpen);
  vaultGeneratePasswordBtn?.setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen) {
    const password = refreshVaultGeneratedPassword();
    if (password) {
      vaultPasswordPreviewInput?.focus();
      vaultPasswordPreviewInput?.select();
    }
  }
}

async function copyGeneratedVaultPassword() {
  const password = vaultPasswordPreviewInput?.value || refreshVaultGeneratedPassword();
  if (!password) {
    showMessage('请至少选择一种字符类型', 'error');
    return;
  }

  try {
    await copyTextToClipboard(password);
    showMessage('随机密码已复制', 'success');
  } catch (e) {
    console.error('Copy generated password failed:', e);
    showMessage('复制失败，请手动复制', 'error');
  }
}

function useGeneratedVaultPassword() {
  const password = vaultPasswordPreviewInput?.value || refreshVaultGeneratedPassword();
  if (!password) {
    showMessage('请至少选择一种字符类型', 'error');
    return;
  }

  toggleVaultAddPanel(true);
  if (vaultAddPasswordInput) {
    vaultAddPasswordInput.value = password;
    vaultAddPasswordInput.focus();
    vaultAddPasswordInput.select();
  }
  showMessage('已填入随机密码', 'success');
}

function generateVaultAddPassword() {
  const password = refreshVaultGeneratedPassword();
  if (!password) {
    showMessage('请至少选择一种字符类型', 'error');
    return;
  }

  toggleVaultAddPanel(true);
  if (vaultAddPasswordInput) {
    vaultAddPasswordInput.value = password;
    vaultAddPasswordInput.focus();
    vaultAddPasswordInput.select();
  }
  showMessage('已按生成器配置生成密码', 'success');
}

const VAULT_REGISTRATION_COUNTRIES = {
  en_US: {
    label: '美国',
    aliases: ['United States', 'USA', 'US', '美国'],
    firstNames: ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Emma', 'Olivia', 'Sophia', 'Ava'],
    lastNames: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor'],
    regions: ['CA', 'NY', 'TX', 'WA', 'FL', 'IL', 'MA', 'CO'],
    cities: ['Los Angeles', 'New York', 'Austin', 'Seattle', 'Miami', 'Chicago', 'Boston', 'Denver'],
    streets: ['Main St', 'Oak Ave', 'Pine St', 'Maple Dr', 'Cedar Rd', 'Market St', 'Lake View Dr'],
    domains: ['gmail.com', 'outlook.com', 'proton.me', 'icloud.com'],
  },
  zh_CN: {
    label: '中国',
    aliases: ['China', 'CN', '中国', '中华人民共和国'],
    firstNames: ['伟', '芳', '娜', '敏', '静', '强', '磊', '洋', '勇', '艳', '杰', '娟'],
    lastNames: ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙'],
    regions: ['北京市', '上海市', '广东省', '浙江省', '江苏省', '四川省', '湖北省', '福建省'],
    cities: ['北京', '上海', '广州', '杭州', '南京', '成都', '武汉', '厦门'],
    streets: ['中山路', '人民路', '解放路', '建设路', '长安街', '和平路', '青年路'],
    domains: ['163.com', 'qq.com', 'outlook.com', 'gmail.com'],
  },
  ja: {
    label: '日本',
    aliases: ['Japan', 'JP', '日本'],
    firstNames: ['蓮', '陽翔', '湊', '樹', '結菜', '陽葵', '凛', '美咲'],
    lastNames: ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村'],
    regions: ['東京都', '大阪府', '神奈川県', '愛知県', '北海道', '福岡県'],
    cities: ['東京', '大阪', '横浜', '名古屋', '札幌', '福岡'],
    streets: ['中央通り', '桜町', '青山', '銀座', '本町'],
    domains: ['gmail.com', 'yahoo.co.jp', 'outlook.com'],
  },
  ko: {
    label: '韩国',
    aliases: ['Korea', 'South Korea', 'KR', '韩国', '대한민국'],
    firstNames: ['서준', '도윤', '예준', '시우', '서연', '지우', '하윤', '지민'],
    lastNames: ['김', '이', '박', '최', '정', '강', '조', '윤'],
    regions: ['서울특별시', '부산광역시', '경기도', '인천광역시', '대구광역시'],
    cities: ['서울', '부산', '수원', '인천', '대구'],
    streets: ['중앙로', '강남대로', '세종대로', '테헤란로'],
    domains: ['gmail.com', 'naver.com', 'outlook.com'],
  },
  en_GB: {
    label: '英国',
    aliases: ['United Kingdom', 'UK', 'Great Britain', '英国'],
    firstNames: ['Oliver', 'George', 'Harry', 'Arthur', 'Noah', 'Olivia', 'Amelia', 'Isla', 'Ava'],
    lastNames: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies'],
    regions: ['England', 'Scotland', 'Wales', 'Northern Ireland'],
    cities: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Cardiff'],
    streets: ['High Street', 'Station Road', 'Church Lane', 'Victoria Road', 'Park Road'],
    domains: ['gmail.com', 'outlook.com', 'proton.me'],
  },
  de: {
    label: '德国',
    aliases: ['Germany', 'DE', 'Deutschland', '德国'],
    firstNames: ['Noah', 'Ben', 'Paul', 'Leon', 'Emma', 'Mia', 'Hannah', 'Emilia'],
    lastNames: ['Muller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner'],
    regions: ['Berlin', 'Bayern', 'Hamburg', 'Hessen', 'Sachsen'],
    cities: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Dresden'],
    streets: ['Hauptstrasse', 'Bahnhofstrasse', 'Kirchweg', 'Gartenstrasse'],
    domains: ['gmail.com', 'outlook.com', 'proton.me'],
  },
  fr: {
    label: '法国',
    aliases: ['France', 'FR', '法国'],
    firstNames: ['Leo', 'Gabriel', 'Louis', 'Arthur', 'Emma', 'Louise', 'Jade', 'Alice'],
    lastNames: ['Martin', 'Bernard', 'Thomas', 'Petit', 'Robert', 'Richard', 'Durand'],
    regions: ['Ile-de-France', 'Provence-Alpes-Cote dAzur', 'Occitanie', 'Normandie'],
    cities: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Rouen'],
    streets: ['Rue de la Paix', 'Avenue Victor Hugo', 'Rue Nationale', 'Boulevard Saint-Michel'],
    domains: ['gmail.com', 'outlook.com', 'proton.me'],
  },
  ru: {
    label: '俄罗斯',
    aliases: ['Russia', 'RU', 'Россия', '俄罗斯'],
    firstNames: ['Alexander', 'Dmitry', 'Maxim', 'Ivan', 'Sofia', 'Anastasia', 'Maria', 'Anna'],
    lastNames: ['Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Sokolov', 'Lebedev'],
    regions: ['Moscow', 'Saint Petersburg', 'Tatarstan', 'Novosibirsk Oblast'],
    cities: ['Moscow', 'Saint Petersburg', 'Kazan', 'Novosibirsk', 'Yekaterinburg'],
    streets: ['Tverskaya St', 'Lenina Ave', 'Sovetskaya St', 'Centralnaya St'],
    domains: ['gmail.com', 'outlook.com', 'proton.me'],
  },
};

function pickVaultRegistrationValue(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list[getSecureRandomIndex(list.length)];
}

function getVaultRegistrationCountryCode(value) {
  const input = String(value || '').trim().toLowerCase();
  if (!input) return vaultRegisterCountrySelect?.value || 'en_US';

  for (const [code, config] of Object.entries(VAULT_REGISTRATION_COUNTRIES)) {
    if (code.toLowerCase() === input || config.label.toLowerCase() === input) return code;
    if ((config.aliases || []).some(alias => alias.toLowerCase() === input || input.includes(alias.toLowerCase()))) {
      return code;
    }
  }

  if (/china|cn|中国|中华人民共和国/.test(input)) return 'zh_CN';
  if (/japan|jp|日本/.test(input)) return 'ja';
  if (/korea|kr|韩国|대한민국/.test(input)) return 'ko';
  if (/kingdom|britain|uk|英国/.test(input)) return 'en_GB';
  if (/germany|deutschland|德国/.test(input)) return 'de';
  if (/france|法国/.test(input)) return 'fr';
  if (/russia|россия|俄罗斯/.test(input)) return 'ru';
  return vaultRegisterCountrySelect?.value || 'en_US';
}

function formatVaultRegistrationFullName(firstName, lastName, countryCode) {
  if (['zh_CN', 'ja', 'ko'].includes(countryCode)) {
    return `${lastName || ''}${firstName || ''}`;
  }
  return [firstName, lastName].filter(Boolean).join(' ');
}

function splitVaultRegistrationName(fullName, countryCode) {
  const name = String(fullName || '').trim();
  if (!name) return {};
  if (['zh_CN', 'ja', 'ko'].includes(countryCode) && !/\s/.test(name) && name.length >= 2) {
    return { lastName: name.slice(0, 1), firstName: name.slice(1) };
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      firstName: parts.slice(0, -1).join(' '),
      lastName: parts[parts.length - 1],
    };
  }
  return { firstName: name };
}

function normalizeVaultRegistrationEmailPart(value) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '')
    .replace(/_+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .toLowerCase();
  return normalized || `user${1000 + getSecureRandomIndex(9000)}`;
}

function generateVaultRegistrationEmail(firstName, lastName, countryCode) {
  const config = VAULT_REGISTRATION_COUNTRIES[countryCode] || VAULT_REGISTRATION_COUNTRIES.en_US;
  const domain = pickVaultRegistrationValue(config.domains);
  const suffix = String(100 + getSecureRandomIndex(900));
  const local = normalizeVaultRegistrationEmailPart(
    ['zh_CN', 'ja', 'ko'].includes(countryCode)
      ? `${lastName || 'user'}${firstName || ''}${suffix}`
      : `${firstName || 'user'}.${lastName || suffix}`
  );
  return `${local}@${domain}`;
}

function generateVaultRegistrationUsername(email, firstName, lastName, countryCode) {
  if (email && email.includes('@')) {
    return email.split('@')[0];
  }
  const suffix = String(1000 + getSecureRandomIndex(9000));
  return normalizeVaultRegistrationEmailPart(
    ['zh_CN', 'ja', 'ko'].includes(countryCode)
      ? `${lastName || 'user'}${firstName || ''}${suffix}`
      : `${firstName || 'user'}${lastName || ''}${suffix}`
  );
}

function generateVaultRegistrationPostalCode(countryCode) {
  if (countryCode === 'zh_CN') return String(100000 + getSecureRandomIndex(899999));
  if (countryCode === 'en_US') return String(10000 + getSecureRandomIndex(89999));
  if (countryCode === 'en_GB') return `SW${1 + getSecureRandomIndex(9)}A ${1 + getSecureRandomIndex(9)}AA`;
  return String(10000 + getSecureRandomIndex(89999));
}

function generateVaultRegistrationPhone(countryCode) {
  if (countryCode === 'zh_CN') {
    return `1${3 + getSecureRandomIndex(7)}${String(100000000 + getSecureRandomIndex(900000000)).padStart(9, '0')}`;
  }
  if (countryCode === 'en_US') {
    return `+1 ${200 + getSecureRandomIndex(700)}-${200 + getSecureRandomIndex(700)}-${String(1000 + getSecureRandomIndex(9000))}`;
  }
  if (countryCode === 'en_GB') {
    return `+44 7${String(100000000 + getSecureRandomIndex(900000000)).slice(0, 9)}`;
  }
  return `+${10 + getSecureRandomIndex(80)} ${1000000 + getSecureRandomIndex(9000000)}`;
}

function generateVaultRegistrationAddress(countryCode, region, city, postalCode) {
  const config = VAULT_REGISTRATION_COUNTRIES[countryCode] || VAULT_REGISTRATION_COUNTRIES.en_US;
  const street = pickVaultRegistrationValue(config.streets);
  const number = 10 + getSecureRandomIndex(9900);

  if (countryCode === 'zh_CN') {
    return `${region}${city}${street}${number}号`;
  }
  if (countryCode === 'ja') {
    return `〒${postalCode} ${region}${city}${street}${number}`;
  }
  if (countryCode === 'ko') {
    return `${region} ${city} ${street} ${number}, ${postalCode}`;
  }
  if (['de', 'fr'].includes(countryCode)) {
    return `${street} ${number}, ${postalCode} ${city}`;
  }
  if (countryCode === 'en_GB') {
    return `${number} ${street}, ${city}, ${postalCode}`;
  }
  return `${number} ${street}, ${city}, ${region} ${postalCode}`;
}

const VAULT_REGISTRATION_FIELD_LABELS = {
  username: '用户名',
  email: '邮箱',
  firstName: '名',
  lastName: '姓',
  fullName: '姓名',
  phone: '电话',
  country: '国家/地区',
  region: '地区/省州',
  city: '城市',
  address: '地址',
  postalCode: '邮编',
};

const VAULT_REGISTRATION_PROFILE_ROLES = Object.keys(VAULT_REGISTRATION_FIELD_LABELS);

function getVaultRegistrationExplicitInputs() {
  return {
    username: vaultRegisterUsernameInput?.value.trim() || '',
    email: vaultRegisterEmailInput?.value.trim() || '',
    phone: vaultRegisterPhoneInput?.value.trim() || '',
  };
}

function normalizeVaultRegistrationRoles(captured = {}, options = {}) {
  const roles = new Set();
  const addRole = (role) => {
    if (VAULT_REGISTRATION_PROFILE_ROLES.includes(role)) roles.add(role);
  };
  const addRoles = (value) => {
    if (!value) return;
    const list = Array.isArray(value) ? value : String(value).split(',');
    list.forEach(role => addRole(String(role || '').trim()));
  };

  addRoles(options.requiredRoles || options.roles);
  addRoles(captured.requiredRoles || captured.roles || captured.fieldRoles);
  VAULT_REGISTRATION_PROFILE_ROLES.forEach((role) => {
    if (captured[role]) addRole(role);
  });

  const explicit = getVaultRegistrationExplicitInputs();
  if (!roles.has('username') && !roles.has('email') && !roles.has('phone')) {
    if (explicit.username) {
      roles.add('username');
    } else if (explicit.email) {
      roles.add('email');
    } else if (explicit.phone) {
      roles.add('phone');
    } else {
      roles.add('username');
    }
  }

  return roles;
}

function hasVaultRegistrationRole(profile, role) {
  const roles = Array.isArray(profile?.generatedRoles) ? profile.generatedRoles : null;
  return !roles || roles.includes(role);
}

function normalizeVaultRegistrationComparable(value) {
  return String(value || '').trim().toLowerCase();
}

function shouldShowVaultRegistrationDetail(profile, role) {
  if (!hasVaultRegistrationRole(profile, role)) return false;
  const value = String(profile?.[role] || '').trim();
  if (!value) return false;
  const savedAccount = normalizeVaultRegistrationComparable(profile?.username);
  if (savedAccount && normalizeVaultRegistrationComparable(value) === savedAccount) {
    return false;
  }
  return true;
}

function generateVaultRegistrationProfile(captured = {}, options = {}) {
  const countryCode = getVaultRegistrationCountryCode(captured.country || captured.region);
  const config = VAULT_REGISTRATION_COUNTRIES[countryCode] || VAULT_REGISTRATION_COUNTRIES.en_US;
  const roles = normalizeVaultRegistrationRoles(captured, options);
  const splitName = splitVaultRegistrationName(captured.fullName, countryCode);
  const firstName = captured.firstName || splitName.firstName || pickVaultRegistrationValue(config.firstNames);
  const lastName = captured.lastName || splitName.lastName || pickVaultRegistrationValue(config.lastNames);
  const fullName = captured.fullName || formatVaultRegistrationFullName(firstName, lastName, countryCode);
  const region = captured.region || pickVaultRegistrationValue(config.regions);
  const city = captured.city || pickVaultRegistrationValue(config.cities);
  const postalCode = captured.postalCode || generateVaultRegistrationPostalCode(countryCode);
  const address = captured.address || generateVaultRegistrationAddress(countryCode, region, city, postalCode);
  const explicit = getVaultRegistrationExplicitInputs();
  const needsEmail = roles.has('email');
  const needsPhone = roles.has('phone');
  const email = needsEmail
    ? (explicit.email || captured.email || generateVaultRegistrationEmail(firstName, lastName, countryCode))
    : (explicit.email || captured.email || '');
  const phone = needsPhone
    ? (explicit.phone || captured.phone || generateVaultRegistrationPhone(countryCode))
    : (explicit.phone || captured.phone || '');
  const usernameForField = explicit.username || captured.username || generateVaultRegistrationUsername(email, firstName, lastName, countryCode);
  const username = roles.has('username')
    ? usernameForField
    : (email || phone || usernameForField);
  const password = options.generatePassword
    ? generateVaultPassword()
    : (captured.password || vaultAddPasswordInput?.value || generateVaultPassword());
  const generatedRoles = Array.from(roles);

  return {
    countryCode,
    country: roles.has('country') ? config.label : '',
    countryAliases: config.aliases || [],
    firstName: roles.has('firstName') ? firstName : '',
    lastName: roles.has('lastName') ? lastName : '',
    fullName: roles.has('fullName') ? fullName : '',
    username,
    email: needsEmail ? email : '',
    password,
    phone: needsPhone ? phone : '',
    region: roles.has('region') ? region : '',
    city: roles.has('city') ? city : '',
    postalCode: roles.has('postalCode') ? postalCode : '',
    address: roles.has('address') ? address : '',
    generatedRoles,
  };
}

function formatVaultRegistrationNotes(profile) {
  const lines = [];
  if (shouldShowVaultRegistrationDetail(profile, 'fullName')) lines.push(`姓名: ${profile.fullName}`);
  if (shouldShowVaultRegistrationDetail(profile, 'firstName')) lines.push(`名: ${profile.firstName}`);
  if (shouldShowVaultRegistrationDetail(profile, 'lastName')) lines.push(`姓: ${profile.lastName}`);
  if (shouldShowVaultRegistrationDetail(profile, 'email')) lines.push(`邮箱: ${profile.email}`);
  if (shouldShowVaultRegistrationDetail(profile, 'phone')) lines.push(`电话: ${profile.phone}`);
  if (shouldShowVaultRegistrationDetail(profile, 'country')) lines.push(`国家/地区: ${profile.country}`);
  if (shouldShowVaultRegistrationDetail(profile, 'region')) lines.push(`地区/省州: ${profile.region}`);
  if (shouldShowVaultRegistrationDetail(profile, 'city')) lines.push(`城市: ${profile.city}`);
  if (shouldShowVaultRegistrationDetail(profile, 'address')) lines.push(`地址: ${profile.address}`);
  if (shouldShowVaultRegistrationDetail(profile, 'postalCode')) lines.push(`邮编: ${profile.postalCode}`);
  return lines.join('\n');
}

function renderVaultRegistrationSummary(profile, prefix = '已生成注册资料') {
  if (!vaultRegisterSummaryEl) return;
  if (!profile) {
    vaultRegisterSummaryEl.textContent = '尚未读取注册页';
    return;
  }
  const lines = [`${prefix}`, `保存账号: ${profile.username || '-'}`];
  (profile.generatedRoles || [])
    .filter(role => role !== 'username')
    .forEach((role) => {
      const label = VAULT_REGISTRATION_FIELD_LABELS[role];
      const value = profile[role];
      if (label && shouldShowVaultRegistrationDetail(profile, role)) lines.push(`${label}: ${value}`);
    });
  vaultRegisterSummaryEl.textContent = lines.join('\n');
}

function applyVaultRegistrationProfileToPopup(profile) {
  if (!profile) return;
  lastVaultRegistrationProfile = profile;
  toggleVaultAddPanel(true);
  ensureVaultAddDefaults();

  if (vaultRegisterCountrySelect) vaultRegisterCountrySelect.value = profile.countryCode || 'en_US';
  if (vaultAddUsernameInput) vaultAddUsernameInput.value = profile.username || '';
  if (vaultAddPasswordInput) vaultAddPasswordInput.value = profile.password || '';
  if (vaultAddNotesInput) vaultAddNotesInput.value = formatVaultRegistrationNotes(profile);
  renderVaultRegistrationSummary(profile);
}

async function loadVaultRegistrationSettings() {
  try {
    const settings = await storageGet(VAULT_REGISTRATION_SETTINGS_KEY);
    const parsedSettings = typeof settings === 'string'
      ? (settings ? JSON.parse(settings) : {})
      : settings;
    const country = parsedSettings?.country;
    if (vaultRegisterCountrySelect && VAULT_REGISTRATION_COUNTRIES[country]) {
      vaultRegisterCountrySelect.value = country;
    }
    if (vaultRegisterUsernameInput) vaultRegisterUsernameInput.value = parsedSettings?.username || '';
    if (vaultRegisterEmailInput) vaultRegisterEmailInput.value = parsedSettings?.email || '';
    if (vaultRegisterPhoneInput) vaultRegisterPhoneInput.value = parsedSettings?.phone || '';
  } catch (e) {
    console.warn('Failed to load registration settings:', e);
  }
}

function saveVaultRegistrationSettings() {
  storageSet(VAULT_REGISTRATION_SETTINGS_KEY, {
    country: vaultRegisterCountrySelect?.value || 'en_US',
    username: vaultRegisterUsernameInput?.value.trim() || '',
    email: vaultRegisterEmailInput?.value.trim() || '',
    phone: vaultRegisterPhoneInput?.value.trim() || '',
  }).catch((e) => {
    console.warn('Failed to save registration settings:', e);
  });
}

function toggleVaultAddPasswordVisibility() {
  if (!vaultAddPasswordInput || !vaultAddPasswordViewBtn) return;
  const shouldShow = vaultAddPasswordInput.type === 'password';
  vaultAddPasswordInput.type = shouldShow ? 'text' : 'password';
  vaultAddPasswordViewBtn.textContent = shouldShow ? '隐藏' : '查看';
}

function ensureVaultAddDefaults() {
  if (!vaultAddNameInput || !vaultAddUrlInput) return;

  if (!vaultAddNameInput.value.trim()) {
    vaultAddNameInput.value = getDefaultVaultEntryName();
  }

  if (!vaultAddUrlInput.value.trim()) {
    vaultAddUrlInput.value = currentPageUrl || '';
  }

  if (vaultAddUriNameInput && !vaultAddUriNameInput.value.trim()) {
    vaultAddUriNameInput.value = getDefaultVaultUriName();
  }
}

function toggleVaultAddPanel(open) {
  if (!vaultAddPanel) return;
  const shouldOpen = typeof open === 'boolean' ? open : !vaultAddPanel.classList.contains('active');
  vaultAddPanel.classList.toggle('active', shouldOpen);
  if (shouldOpen) {
    ensureVaultAddDefaults();
    vaultAddUsernameInput?.focus();
  }
}

async function captureCredentialFromPage() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    return { success: false, error: '无法获取当前页面' };
  }

  const extractCredential = () => {
    const FIELD_PATTERNS = [
      ['password', /(new[-_\s]?password|password|passwd|pwd|pass|密码|密碼|设置密码|登录密码)/i],
      ['email', /(e[-_\s]?mail|email|mail address|邮箱|郵箱|电子邮件|電子郵件|邮件地址|郵件地址)/i],
      ['username', /(user[-_\s]?name|username|login|account|userid|user id|member id|nickname|display name|账号|帳號|账户|用戶名|用户名|登录名|登入名|昵称|暱稱)/i],
      ['firstName', /(first[-_\s]?name|given[-_\s]?name|forename|名\b|名字|given)/i],
      ['lastName', /(last[-_\s]?name|family[-_\s]?name|surname|姓\b|姓氏|family)/i],
      ['fullName', /(^|\s)(full[-_\s]?name|name|real[-_\s]?name|姓名|真实姓名|真實姓名|联系人|聯絡人)(\s|$)/i],
      ['phone', /(phone|mobile|tel|telephone|cell|手机号|手機號|手机|手機|电话|電話|联系电话|聯絡電話)/i],
      ['country', /(country|nation|国家|國家|国家\/地区|國家\/地區)/i],
      ['region', /(state|province|region|county|prefecture|area|省|州|地区|地區|区域|區域|都道府县)/i],
      ['city', /(city|town|locality|城市|市区|市|区县|區縣)/i],
      ['address', /(address|street|addr|住址|地址|街道|详细地址|詳細地址)/i],
      ['postalCode', /(zip|postal|postcode|post code|邮编|郵編|邮政编码|郵政編碼)/i],
    ];
    const isVisibleElement = (element) => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const isEditableInput = (element) => {
      if (!element || element.disabled || element.readOnly) return false;
      if (element instanceof HTMLSelectElement) return true;
      if (element instanceof HTMLTextAreaElement) return true;
      if (!(element instanceof HTMLInputElement)) return false;
      const type = (element.getAttribute('type') || 'text').toLowerCase();
      return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
    };
    const collectRoots = (root, roots = []) => {
      roots.push(root);
      const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
      elements.forEach((element) => {
        if (element.shadowRoot) collectRoots(element.shadowRoot, roots);
      });
      return roots;
    };
    const getVisibleFields = (root) => Array.from(root.querySelectorAll('input, textarea, select'))
      .filter(input => isEditableInput(input) && isVisibleElement(input));
    const getFieldType = (field) => {
      if (field instanceof HTMLSelectElement) return 'select';
      if (field instanceof HTMLTextAreaElement) return 'textarea';
      return (field.getAttribute('type') || 'text').toLowerCase();
    };
    const getLabelText = (field) => {
      const labels = Array.from(field.labels || []).map(label => label.textContent || '');
      const id = field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`)?.textContent || '' : '';
      return [...labels, id].join(' ');
    };
    const getFieldHint = (field) => {
      return [
        field.name,
        field.id,
        field.autocomplete,
        field.placeholder,
        field.getAttribute('aria-label'),
        field.getAttribute('title'),
        field.getAttribute('data-testid'),
        getLabelText(field),
        field.getAttribute('aria-describedby') ? document.getElementById(field.getAttribute('aria-describedby'))?.textContent || '' : '',
        field.getAttribute('aria-labelledby') ? document.getElementById(field.getAttribute('aria-labelledby'))?.textContent || '' : '',
      ].join(' ').toLowerCase();
    };
    const classifyField = (field) => {
      const type = getFieldType(field);
      const autocomplete = String(field.autocomplete || '').toLowerCase();
      const hint = getFieldHint(field);
      if (type === 'password') return 'password';
      if (type === 'email' || autocomplete === 'email') return 'email';
      if (type === 'tel') return 'phone';
      if (autocomplete === 'username') return 'username';
      if (autocomplete === 'given-name') return 'firstName';
      if (autocomplete === 'family-name') return 'lastName';
      if (autocomplete === 'name') return 'fullName';
      if (autocomplete === 'country' || autocomplete === 'country-name') return 'country';
      if (autocomplete === 'address-level1') return 'region';
      if (autocomplete === 'address-level2') return 'city';
      if (autocomplete === 'street-address' || autocomplete === 'address-line1') return 'address';
      if (autocomplete === 'postal-code') return 'postalCode';

      const match = FIELD_PATTERNS.find(([, pattern]) => pattern.test(hint));
      return match ? match[0] : '';
    };
    const getFieldValue = (field) => {
      if (field instanceof HTMLSelectElement) {
        return field.selectedOptions?.[0]?.textContent?.trim() || field.value || '';
      }
      return String(field.value || '').trim();
    };

    const allFields = collectRoots(document).flatMap(root => getVisibleFields(root));
    const fields = allFields
      .map((field, index) => ({
        index,
        role: classifyField(field),
        value: getFieldValue(field),
        type: getFieldType(field),
      }))
      .filter(field => field.role);

    const credential = {
      title: document.title || location.hostname,
      url: window.location.href,
      username: '',
      password: '',
      email: '',
      firstName: '',
      lastName: '',
      fullName: '',
      phone: '',
      country: '',
      region: '',
      city: '',
      address: '',
      postalCode: '',
      fieldCount: fields.length,
      requiredRoles: [...new Set(fields.map(field => field.role).filter(role => role && role !== 'password'))],
    };

    for (const field of fields) {
      if (!field.value && field.role !== 'password') continue;
      if (field.role === 'password') {
        if (!credential.password && field.value) credential.password = field.value;
        continue;
      }
      if (!credential[field.role]) {
        credential[field.role] = field.value;
      }
    }

    return {
      success: true,
      credential,
    };
  };

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: extractCredential,
  });

  const frameResults = (results || []).map(result => result.result).filter(Boolean);
  const success = frameResults.find(result => result.success);
  return success || frameResults.find(result => result.error) || { success: false, error: '没有读取到账号密码' };
}

async function fillRegistrationPageFromProfile(profile) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    return { success: false, error: '无法获取当前页面' };
  }

  const fillFrame = (profileData) => {
    const FIELD_PATTERNS = [
      ['password', /(new[-_\s]?password|confirm[-_\s]?password|password|passwd|pwd|pass|密码|密碼|确认密码|確認密碼|设置密码)/i],
      ['email', /(e[-_\s]?mail|email|mail address|邮箱|郵箱|电子邮件|電子郵件|邮件地址|郵件地址)/i],
      ['username', /(user[-_\s]?name|username|login|account|userid|user id|member id|nickname|display name|账号|帳號|账户|用戶名|用户名|登录名|登入名|昵称|暱稱)/i],
      ['firstName', /(first[-_\s]?name|given[-_\s]?name|forename|名\b|名字|given)/i],
      ['lastName', /(last[-_\s]?name|family[-_\s]?name|surname|姓\b|姓氏|family)/i],
      ['fullName', /(^|\s)(full[-_\s]?name|name|real[-_\s]?name|姓名|真实姓名|真實姓名|联系人|聯絡人)(\s|$)/i],
      ['phone', /(phone|mobile|tel|telephone|cell|手机号|手機號|手机|手機|电话|電話|联系电话|聯絡電話)/i],
      ['country', /(country|nation|国家|國家|国家\/地区|國家\/地區)/i],
      ['region', /(state|province|region|county|prefecture|area|省|州|地区|地區|区域|區域|都道府县)/i],
      ['city', /(city|town|locality|城市|市区|市|区县|區縣)/i],
      ['address', /(address|street|addr|住址|地址|街道|详细地址|詳細地址)/i],
      ['postalCode', /(zip|postal|postcode|post code|邮编|郵編|邮政编码|郵政編碼)/i],
    ];
    const isVisibleElement = (element) => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const isEditableInput = (element) => {
      if (!element || element.disabled || element.readOnly) return false;
      if (element instanceof HTMLSelectElement) return true;
      if (element instanceof HTMLTextAreaElement) return true;
      if (!(element instanceof HTMLInputElement)) return false;
      const type = (element.getAttribute('type') || 'text').toLowerCase();
      return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
    };
    const setNativeValue = (element, value) => {
      if (element instanceof HTMLSelectElement) {
        const target = String(value || '').trim().toLowerCase();
        const aliases = (profileData.countryAliases || []).map(alias => String(alias).toLowerCase());
        const option = Array.from(element.options).find((item) => {
          const text = String(item.textContent || '').trim().toLowerCase();
          const optionValue = String(item.value || '').trim().toLowerCase();
          return text === target ||
            optionValue === target ||
            aliases.includes(text) ||
            aliases.includes(optionValue) ||
            (target && (text.includes(target) || target.includes(text)));
        });
        if (option) {
          element.value = option.value;
          element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          return true;
        }
        return false;
      }

      const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
      if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
      } else if (valueSetter) {
        valueSetter.call(element, value);
      } else {
        element.value = value;
      }
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true }));
      return true;
    };
    const collectRoots = (root, roots = []) => {
      roots.push(root);
      const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
      elements.forEach((element) => {
        if (element.shadowRoot) collectRoots(element.shadowRoot, roots);
      });
      return roots;
    };
    const getVisibleFields = (root) => Array.from(root.querySelectorAll('input, textarea, select'))
      .filter(input => isEditableInput(input) && isVisibleElement(input));
    const getFieldType = (field) => {
      if (field instanceof HTMLSelectElement) return 'select';
      if (field instanceof HTMLTextAreaElement) return 'textarea';
      return (field.getAttribute('type') || 'text').toLowerCase();
    };
    const getLabelText = (field) => {
      const labels = Array.from(field.labels || []).map(label => label.textContent || '');
      const id = field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`)?.textContent || '' : '';
      return [...labels, id].join(' ');
    };
    const getFieldHint = (field) => {
      return [
        field.name,
        field.id,
        field.autocomplete,
        field.placeholder,
        field.getAttribute('aria-label'),
        field.getAttribute('title'),
        field.getAttribute('data-testid'),
        getLabelText(field),
        field.getAttribute('aria-describedby') ? document.getElementById(field.getAttribute('aria-describedby'))?.textContent || '' : '',
        field.getAttribute('aria-labelledby') ? document.getElementById(field.getAttribute('aria-labelledby'))?.textContent || '' : '',
      ].join(' ').toLowerCase();
    };
    const classifyField = (field) => {
      const type = getFieldType(field);
      const autocomplete = String(field.autocomplete || '').toLowerCase();
      const hint = getFieldHint(field);
      if (type === 'password') return 'password';
      if (type === 'email' || autocomplete === 'email') return 'email';
      if (type === 'tel') return 'phone';
      if (autocomplete === 'username') return 'username';
      if (autocomplete === 'given-name') return 'firstName';
      if (autocomplete === 'family-name') return 'lastName';
      if (autocomplete === 'name') return 'fullName';
      if (autocomplete === 'country' || autocomplete === 'country-name') return 'country';
      if (autocomplete === 'address-level1') return 'region';
      if (autocomplete === 'address-level2') return 'city';
      if (autocomplete === 'street-address' || autocomplete === 'address-line1') return 'address';
      if (autocomplete === 'postal-code') return 'postalCode';
      const match = FIELD_PATTERNS.find(([, pattern]) => pattern.test(hint));
      return match ? match[0] : '';
    };
    const valueByRole = {
      username: profileData.username,
      password: profileData.password,
      email: profileData.email,
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      fullName: profileData.fullName,
      phone: profileData.phone,
      country: profileData.country,
      region: profileData.region,
      city: profileData.city,
      address: profileData.address,
      postalCode: profileData.postalCode,
    };

    const allFields = collectRoots(document).flatMap(root => getVisibleFields(root));
    const filledRoles = [];
    for (const field of allFields) {
      const role = classifyField(field);
      const value = valueByRole[role];
      if (!role || !value) continue;
      if (role !== 'password' && filledRoles.includes(role)) continue;
      const didFill = setNativeValue(field, value);
      if (didFill) filledRoles.push(role);
    }

    return filledRoles.length > 0
      ? { success: true, filledRoles, frameUrl: window.location.href }
      : { success: false, error: '未找到可填充的注册表单' };
  };

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      args: [profile],
      func: fillFrame,
    });
  } catch (e) {
    console.warn('Fill registration all frames failed, retrying main frame:', e);
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [profile],
      func: fillFrame,
    });
  }

  const frameResults = (results || []).map(result => result.result).filter(Boolean);
  const successes = frameResults.filter(result => result.success);
  if (successes.length > 0) {
    return {
      success: true,
      filledRoles: [...new Set(successes.flatMap(result => result.filledRoles || []))],
    };
  }

  return frameResults.find(result => result.error) || { success: false, error: '未找到可填充的注册表单' };
}

async function fillVaultAddFormFromPage() {
  try {
    const result = await captureCredentialFromPage();
    toggleVaultAddPanel(true);

    if (!result.success || !result.credential) {
      ensureVaultAddDefaults();
      showMessage(result.error || '没有读取到账号密码，请手动输入', 'error');
      return;
    }

    const credential = result.credential;
    lastVaultCapturedCredential = credential;
    const profile = generateVaultRegistrationProfile(credential);
    vaultAddNameInput.value = credential.title || getDefaultVaultEntryName();
    vaultAddUrlInput.value = credential.url || currentPageUrl || '';
    if (vaultAddUriNameInput) {
      vaultAddUriNameInput.value = getDefaultVaultUriName();
    }
    applyVaultRegistrationProfileToPopup(profile);
    showMessage('已读取页面输入并生成缺失资料', 'success');
  } catch (e) {
    console.error('Capture credential failed:', e);
    toggleVaultAddPanel(true);
    ensureVaultAddDefaults();
    showMessage('读取失败，请手动输入', 'error');
  }
}

async function generateVaultRegistrationForPopup(fillPage = false) {
  try {
    toggleVaultAddPanel(true);
    ensureVaultAddDefaults();

    let captured = {};
    const captureResult = await captureCredentialFromPage();
    if (captureResult.success && captureResult.credential) {
      captured = captureResult.credential;
      lastVaultCapturedCredential = captured;
    }

    const profile = generateVaultRegistrationProfile(captured, { generatePassword: true });
    applyVaultRegistrationProfileToPopup(profile);
    saveVaultRegistrationSettings();

    if (!fillPage) {
      showMessage('已生成注册资料', 'success');
      return;
    }

    const fillResult = await fillRegistrationPageFromProfile(profile);
    if (fillResult.success) {
      showMessage(`已填入注册页 ${fillResult.filledRoles?.length || 0} 个字段`, 'success');
    } else {
      showMessage(fillResult.error || '未找到可填充的注册表单', 'error');
    }
  } catch (e) {
    console.error('Generate registration profile failed:', e);
    showMessage('生成注册资料失败', 'error');
  }
}

async function createVaultEntryFromPopup() {
  if (!isConnected) {
    showMessage('请先启动暮城笔记桌面端', 'error');
    return;
  }

  const payload = {
    title: vaultAddNameInput.value.trim() || getDefaultVaultEntryName(),
    username: vaultAddUsernameInput.value.trim(),
    password: vaultAddPasswordInput.value,
    notes: vaultAddNotesInput?.value.trim() || '',
    url: normalizeVaultUrlInput(vaultAddUrlInput.value || currentPageUrl),
    folderId: vaultAddFolderSelect?.value || null,
    uriName: vaultAddUriNameInput?.value.trim() || getDefaultVaultUriName(),
    totpName: vaultAddTotpNameInput?.value.trim() || '',
    totpSecret: vaultAddTotpSecretInput?.value.trim() || '',
  };

  if (!payload.username || !payload.password || !payload.url) {
    showMessage('请填写用户名、密码和关联网站', 'error');
    return;
  }

  vaultAddSaveBtn.disabled = true;
  vaultAddSaveBtn.textContent = '保存中';

  try {
    const response = await vaultFetch('/api/vault/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!result.success) {
      showMessage(result.error || '保存失败', 'error');
      return;
    }

    showMessage('已保存到密码库', 'success');
    vaultAddPanel.classList.remove('active');
    vaultAddUsernameInput.value = '';
    vaultAddPasswordInput.value = '';
    if (vaultAddNotesInput) vaultAddNotesInput.value = '';
    lastVaultRegistrationProfile = null;
    lastVaultCapturedCredential = null;
    renderVaultRegistrationSummary(null);
    if (vaultAddTotpNameInput) vaultAddTotpNameInput.value = '';
    if (vaultAddTotpSecretInput) vaultAddTotpSecretInput.value = '';
    await loadVaultEntries();
  } catch (e) {
    console.error('Create vault entry failed:', e);
    showMessage('保存失败，请检查应用是否运行', 'error');
  } finally {
    vaultAddSaveBtn.disabled = false;
    vaultAddSaveBtn.textContent = '保存';
  }
}

async function loadVaultEntries() {
  if (!isConnected || !currentPageUrl) {
    renderVaultEntries();
    return;
  }

  isVaultEntriesLoading = true;
  try {
    vaultListEl.innerHTML = '<div class="vault-empty">正在查找匹配的账号...</div>';
    const response = await vaultFetch('/api/vault/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: currentPageUrl }),
    });
    const result = await response.json();
    const receivedAt = Date.now();
    vaultEntries = result.success ? (result.entries || []).map(entry => normalizeVaultEntryTotps(entry, receivedAt)) : [];
    renderVaultEntries();
  } catch (e) {
    console.error('Failed to load vault entries:', e);
    vaultEntries = [];
    stopVaultTotpTimer();
    vaultListEl.innerHTML = '<div class="vault-empty">读取密码库失败</div>';
  } finally {
    isVaultEntriesLoading = false;
  }
}

async function fillVaultTotpCode(code, triggerEl) {
  const totpCode = String(code || '').replace(/\s+/g, '').trim();
  if (!totpCode) {
    showMessage('验证码为空', 'error');
    return;
  }

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      showMessage('无法获取当前页面', 'error');
      return;
    }

    if (triggerEl) {
      triggerEl.classList.add('is-filling');
      triggerEl.setAttribute('aria-disabled', 'true');
    }

    const result = await fillTotpByInjection(tab.id, totpCode);
    if (result?.success) {
      showMessage('已填充验证码', 'success');
      setTimeout(() => window.close(), 650);
    } else {
      showMessage(result?.error || '未找到验证码输入框', 'error');
    }
  } catch (e) {
    console.error('Fill TOTP failed:', e);
    showMessage('验证码填充失败，请手动复制', 'error');
  } finally {
    if (triggerEl) {
      triggerEl.classList.remove('is-filling');
      triggerEl.removeAttribute('aria-disabled');
    }
  }
}

async function fillTotpByInjection(tabId, code) {
  const fillFrame = (totpCode) => {
    const code = String(totpCode || '').replace(/\s+/g, '').trim();
    if (!code) {
      return { success: false, error: '验证码为空' };
    }

    function isVisibleElement(element) {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function isEditableInput(element) {
      if (!element || element.disabled || element.readOnly) return false;
      if (element instanceof HTMLTextAreaElement) return true;
      if (!(element instanceof HTMLInputElement)) return false;

      const type = (element.getAttribute('type') || 'text').toLowerCase();
      return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
    }

    function setNativeValue(element, value) {
      const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;

      if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
      } else if (valueSetter) {
        valueSetter.call(element, value);
      } else {
        element.value = value;
      }

      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true }));
    }

    function collectRoots(root, roots = []) {
      roots.push(root);
      const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
      elements.forEach((element) => {
        if (element.shadowRoot) {
          collectRoots(element.shadowRoot, roots);
        }
      });
      return roots;
    }

    function getVisibleInputs(root) {
      return Array.from(root.querySelectorAll('input, textarea'))
        .filter(input => isEditableInput(input) && isVisibleElement(input));
    }

    function getAllVisibleInputs() {
      return collectRoots(document).flatMap(root => getVisibleInputs(root));
    }

    function getInputOwnHint(input) {
      const labels = Array.from(input.labels || []).map(label => label.textContent || '');
      return [
        input.name,
        input.id,
        input.autocomplete,
        input.inputMode,
        input.placeholder,
        input.getAttribute('aria-label'),
        input.getAttribute('title'),
        input.getAttribute('data-testid'),
        ...labels,
      ].join(' ').toLowerCase();
    }

    function getInputHint(input) {
      const parent = input.closest('label, .form-group, .field, .input, div, section, form');
      return [
        getInputOwnHint(input),
        parent?.textContent?.slice(0, 240),
      ].join(' ').toLowerCase();
    }

    function getInputType(input) {
      return input instanceof HTMLInputElement
        ? (input.getAttribute('type') || 'text').toLowerCase()
        : 'textarea';
    }

    function isPasswordLikeInput(input) {
      const hint = getInputOwnHint(input);
      return getInputType(input) === 'password' || /(pass|password|密码|密碼)/i.test(hint);
    }

    function isUsernameLikeInput(input) {
      const hint = getInputOwnHint(input);
      return /(user|username|login|email|account|phone|mobile|identifier|用户名|账号|账户|郵箱|邮箱|手機|手机)/i.test(hint);
    }

    function isTotpHint(input) {
      const hint = getInputHint(input);
      return /(otp|totp|mfa|2fa|2-factor|two[-\s]?factor|one[-\s]?time|verification|verify|authenticator|security\s*code|login\s*code|code|token|验证码|驗證碼|动态码|動態碼|校验码|校驗碼|安全码|安全碼|二步|两步|兩步|双重|雙重|身份验证|身份驗證|一次性|口令)/i.test(hint);
    }

    function canHoldFullCode(input) {
      if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return false;
      const maxLength = input instanceof HTMLInputElement ? input.maxLength : -1;
      return maxLength < 0 || maxLength === 0 || maxLength >= code.length;
    }

    function isNumericCodeCandidate(input, hasPasswordInput) {
      if (!(input instanceof HTMLInputElement) || hasPasswordInput) return false;
      if (isPasswordLikeInput(input) || isUsernameLikeInput(input)) return false;

      const type = getInputType(input);
      if (!['text', 'tel', 'number', 'search', ''].includes(type)) return false;

      const maxLength = input.maxLength;
      const numericMode = ['numeric', 'decimal'].includes((input.inputMode || '').toLowerCase());
      const codeLength = maxLength >= 4 && maxLength <= 8;
      return (numericMode || type === 'tel' || type === 'number' || codeLength) && canHoldFullCode(input);
    }

    function fillOneInput(input) {
      input.focus();
      setNativeValue(input, code);
      return {
        success: true,
        filledTotp: true,
        pageType: 'totp',
        frameUrl: window.location.href,
      };
    }

    function fillSplitInputs(inputs) {
      const targetInputs = inputs.slice(0, code.length);
      targetInputs.forEach((input, index) => {
        input.focus();
        setNativeValue(input, code[index] || '');
      });
      targetInputs[targetInputs.length - 1]?.focus();
      return {
        success: true,
        filledTotp: true,
        pageType: 'totp-split',
        frameUrl: window.location.href,
      };
    }

    const inputs = getAllVisibleInputs();
    const hasPasswordInput = inputs.some(isPasswordLikeInput);
    const explicitTotpInputs = inputs.filter(input =>
      isTotpHint(input) && !isPasswordLikeInput(input)
    );

    const explicitSingle = explicitTotpInputs.find(input => canHoldFullCode(input));
    if (explicitSingle) {
      return fillOneInput(explicitSingle);
    }

    const explicitSplit = explicitTotpInputs
      .filter(input => input instanceof HTMLInputElement && input.maxLength === 1);
    if (explicitSplit.length >= code.length) {
      return fillSplitInputs(explicitSplit);
    }

    const singleCharInputs = inputs.filter(input => {
      if (!(input instanceof HTMLInputElement)) return false;
      if (isPasswordLikeInput(input) || isUsernameLikeInput(input)) return false;
      const type = getInputType(input);
      return ['text', 'tel', 'number', 'search', ''].includes(type) && input.maxLength === 1;
    });
    if (!hasPasswordInput && singleCharInputs.length >= code.length) {
      return fillSplitInputs(singleCharInputs);
    }

    const numericCandidate = inputs.find(input => isNumericCodeCandidate(input, hasPasswordInput));
    if (numericCandidate) {
      return fillOneInput(numericCandidate);
    }

    return { success: false, error: '未找到验证码输入框' };
  };

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      args: [code],
      func: fillFrame,
    });
  } catch (e) {
    console.warn('Fill TOTP all frames failed, retrying main frame:', e);
    results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [code],
      func: fillFrame,
    });
  }

  const frameResults = (results || []).map(result => result.result).filter(Boolean);
  const success = frameResults.find(result => result.success);
  if (success) {
    return success;
  }

  const firstError = frameResults.find(result => result.error)?.error;
  return { success: false, error: firstError || '未找到验证码输入框' };
}

async function fillVaultCredential(entryId) {
  const selectedButton = vaultListEl
    ? Array.from(vaultListEl.querySelectorAll('.vault-entry')).find(button => button.dataset.id === entryId)
    : null;

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      showMessage('无法获取当前页面', 'error');
      return;
    }

    const response = await vaultFetch('/api/vault/credential', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entryId, url: currentPageUrl }),
    });
    const result = await response.json();

    if (!result.success || !result.credential) {
      showMessage(result.error || '获取凭据失败', 'error');
      return;
    }

    if (selectedButton) {
      selectedButton.setAttribute('aria-disabled', 'true');
      selectedButton.classList.add('is-filling');
    }
    showMessage('正在填充账号和密码...', 'success');

    const fillResult = await fillCredentialByInjection(tab.id, result.credential);

    if (fillResult?.success) {
      const message = fillResult.filledPassword
        ? (fillResult.filledUsername ? '已填充账号和密码' : '已填充密码')
        : '已填充账号';
      showMessage(message, 'success');
      setTimeout(() => window.close(), 800);
    } else {
      showMessage(fillResult?.error || '未找到可填充的登录表单', 'error');
      if (selectedButton) {
        selectedButton.removeAttribute('aria-disabled');
        selectedButton.classList.remove('is-filling');
      }
    }
  } catch (e) {
    console.error('Fill credential failed:', e);
    showMessage('填充失败，请刷新页面后重试', 'error');
    if (selectedButton) {
      selectedButton.removeAttribute('aria-disabled');
      selectedButton.classList.remove('is-filling');
    }
  }
}

async function fillCredentialByInjection(tabId, credential) {
  const fillFrame = (credentialData) => {
    function isVisibleElement(element) {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function isEditableInput(element) {
      if (!element || element.disabled || element.readOnly) return false;
      if (element instanceof HTMLTextAreaElement) return true;
      if (!(element instanceof HTMLInputElement)) return false;

      const type = (element.getAttribute('type') || 'text').toLowerCase();
      return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
    }

    function setNativeValue(element, value) {
      const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;

      if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
      } else if (valueSetter) {
        valueSetter.call(element, value);
      } else {
        element.value = value;
      }

      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true }));
    }

    function collectRoots(root, roots = []) {
      roots.push(root);
      const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
      elements.forEach((element) => {
        if (element.shadowRoot) {
          collectRoots(element.shadowRoot, roots);
        }
      });
      return roots;
    }

    function getVisibleInputs(root) {
      return Array.from(root.querySelectorAll('input, textarea'))
        .filter(input => isEditableInput(input) && isVisibleElement(input));
    }

    function getAllVisibleInputs() {
      return collectRoots(document).flatMap(root => getVisibleInputs(root));
    }

    function isLikelyUsernameInput(input) {
      if (!(input instanceof HTMLInputElement)) return false;

      const type = (input.getAttribute('type') || 'text').toLowerCase();
      if (!['text', 'email', 'tel', 'search', 'number', ''].includes(type)) return false;

      const hint = [
        input.name,
        input.id,
        input.autocomplete,
        input.placeholder,
        input.getAttribute('aria-label'),
        input.getAttribute('title'),
      ].join(' ').toLowerCase();

      return (
        /(user|login|email|account|phone|mobile|identifier|customer|client|member|id|用户名|账号|账户|邮箱|手机|客户)/i.test(hint) ||
        type === 'email' ||
        input.autocomplete === 'username'
      );
    }

    function findUsernameInput(passwordInput, allInputs) {
      const form = passwordInput.form || passwordInput.closest('form');
      const scopeInputs = form ? getVisibleInputs(form) : allInputs;
      const passwordIndex = scopeInputs.indexOf(passwordInput);
      const beforePassword = passwordIndex >= 0 ? scopeInputs.slice(0, passwordIndex).reverse() : scopeInputs;

      return (
        beforePassword.find(isLikelyUsernameInput) ||
        beforePassword.find(input => input instanceof HTMLInputElement && ['text', 'email', 'tel', 'number', ''].includes((input.getAttribute('type') || 'text').toLowerCase())) ||
        null
      );
    }

    function findStandaloneUsernameInput(allInputs) {
      return (
        allInputs.find(isLikelyUsernameInput) ||
        allInputs.find(input => input instanceof HTMLInputElement && ['text', 'email', 'tel', 'number', ''].includes((input.getAttribute('type') || 'text').toLowerCase())) ||
        null
      );
    }

    if (!credentialData || typeof credentialData !== 'object') {
      return { success: false, error: '凭据为空' };
    }

    const allInputs = getAllVisibleInputs();
    const passwordInput = allInputs.find(input => input instanceof HTMLInputElement && input.type === 'password');
    if (!passwordInput) {
      const usernameInput = findStandaloneUsernameInput(allInputs);
      if (!usernameInput) {
        return { success: false, error: '未找到账号或密码输入框' };
      }
      if (!credentialData.username) {
        return { success: false, error: '该条目没有保存用户名' };
      }

      usernameInput.focus();
      setNativeValue(usernameInput, credentialData.username);

      return {
        success: true,
        filledUsername: true,
        filledPassword: false,
        pageType: 'username',
        frameUrl: window.location.href,
      };
    }

    if (!credentialData.password) {
      return { success: false, error: '该条目没有保存密码' };
    }

    const usernameInput = findUsernameInput(passwordInput, allInputs);

    if (usernameInput && credentialData.username) {
      usernameInput.focus();
      setNativeValue(usernameInput, credentialData.username);
    }

    passwordInput.focus();
    setNativeValue(passwordInput, credentialData.password);

    return {
      success: true,
      filledUsername: Boolean(usernameInput && credentialData.username),
      filledPassword: true,
      pageType: 'password',
      frameUrl: window.location.href,
    };
  };

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      args: [credential],
      func: fillFrame,
    });
  } catch (e) {
    console.warn('Fill all frames failed, retrying main frame:', e);
    results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [credential],
      func: fillFrame,
    });
  }

  const frameResults = (results || []).map(result => result.result).filter(Boolean);
  const success = frameResults.find(result => result.success);
  if (success) {
    return success;
  }

  const firstError = frameResults.find(result => result.error)?.error;
  return { success: false, error: firstError || '未找到可填充的登录表单' };
}

// 发送笔记剪藏请求
async function clipNote() {
  if (!pageData || !isConnected) return;

  noteBtn.disabled = true;
  noteBtn.innerHTML = '<span class="loading">保存中</span>';

  try {
    const markdownContent = htmlToMarkdown(pageData.content);
    const contentWithSource = `${markdownContent}\n\n---\n\n> 来源: [${pageData.title}](${pageData.url})`;
    const shouldDownloadImages = downloadImagesCheckbox.checked && extractedImages.length > 0;

    const response = await vaultFetch('/api/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: noteTitleInput.value || pageData.title,
        content: contentWithSource,
        url: pageData.url,
        folderId: noteFolderSelect.value || null,
        format: 'markdown',
        images: extractedImages,
        downloadImages: shouldDownloadImages,
      }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      showMessage('已发送到暮城笔记，请在应用中确认', 'success');
      setTimeout(() => window.close(), 1500);
    } else {
      showMessage(result.error || '保存失败', 'error');
    }
  } catch (e) {
    console.error('Clip failed:', e);
    showMessage('保存失败，请检查应用是否运行', 'error');
  } finally {
    noteBtn.disabled = false;
    noteBtn.textContent = '保存到笔记';
  }
}

// 发送书签保存请求
async function saveBookmark() {
  if (!bookmarkData || !isConnected) return;
  
  bookmarkBtn.disabled = true;
  bookmarkBtn.innerHTML = '<span class="loading">保存中</span>';
  
  try {
    const bookmarkName = String(bookmarkNameInput.value || '').trim() || bookmarkData.name;
    const bookmarkDescription = String(bookmarkDescInput.value || '').trim() || bookmarkData.description;
    const bookmarkIcon = await inlineBookmarkIcon(bookmarkData.icon);
    bookmarkData.icon = bookmarkIcon;

    const response = await vaultFetch('/api/bookmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: bookmarkName,
        url: bookmarkData.url,
        description: bookmarkDescription,
        icon: bookmarkIcon || null,
        folderId: bookmarkFolderSelect.value || null,
      }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      showMessage('书签已保存', 'success');
      toggleBookmarkAddPanel(false);
      await loadBookmarkManager();
    } else {
      showMessage(result.error || '保存失败', 'error');
    }
  } catch (e) {
    console.error('Save bookmark failed:', e);
    showMessage('保存失败，请检查应用是否运行', 'error');
  } finally {
    bookmarkBtn.disabled = false;
    bookmarkBtn.textContent = '添加书签';
    updateButtonStates();
  }
}

// 切换 Tab
function switchTab(tabName) {
  currentTab = tabName;
  
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  noteForm.classList.toggle('active', tabName === 'note');
  bookmarkForm.classList.toggle('active', tabName === 'bookmark');
  vaultForm.classList.toggle('active', tabName === 'vault');
  
  updateButtonStates();
  if (tabName === 'vault') {
    ensureVaultAddDefaults();
    loadVaultEntries();
  } else if (tabName === 'bookmark') {
    stopVaultTotpTimer();
    loadBookmarkManager();
  } else {
    stopVaultTotpTimer();
  }
}

// 初始化
async function init() {
  await loadVaultPasswordGeneratorSettings();
  await loadVaultRegistrationSettings();
  await loadVaultPasskeySetting();

  const tab = await getActiveTab();
  currentPageUrl = tab?.url || '';
  if (vaultSiteUrlEl) {
    try {
      vaultSiteUrlEl.textContent = new URL(currentPageUrl).hostname;
    } catch {
      vaultSiteUrlEl.textContent = currentPageUrl || '当前页面';
    }
  }

  // 检查连接
  const connected = await checkConnection();
  
  if (connected) {
    // 加载文件夹
    await Promise.all([loadNoteFolders(), loadBookmarkManager(), loadVaultFolders()]);
  }
  
  // 获取页面内容（笔记）
  pageData = await getPageContent();
  
  if (pageData) {
    noteTitleInput.value = pageData.title;
    notePreviewContentEl.textContent = pageData.excerpt || '无预览内容';
    notePreviewEl.style.display = 'block';
    
    extractedImages = extractImageUrls(pageData.content);
    
    if (extractedImages.length > 0) {
      downloadImagesGroup.style.display = 'block';
      downloadImagesText.textContent = `下载图片到本地（${extractedImages.length} 张）`;
    }
  }
  
  // 获取书签信息
  bookmarkData = await getBookmarkInfo();
  
  if (bookmarkData) {
    bookmarkData.icon = await inlineBookmarkIcon(bookmarkData.icon);
    bookmarkNameInput.value = bookmarkData.name;
    bookmarkDescInput.value = bookmarkData.description;
    bookmarkDomain.textContent = bookmarkData.domain;
    bookmarkUrlPreview.textContent = bookmarkData.url;
    
    // 显示图标
    if (bookmarkData.icon) {
      bookmarkIconImg.src = bookmarkData.icon;
      bookmarkIconImg.style.display = 'block';
      bookmarkIconPlaceholder.style.display = 'none';
      
      // 图标加载失败时显示占位符
      bookmarkIconImg.onerror = () => {
        bookmarkIconImg.style.display = 'none';
        bookmarkIconPlaceholder.style.display = 'flex';
      };
    }
  }
  
  await loadVaultEntries();
  updateButtonStates();
}

// 事件监听
tabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

noteBtn.addEventListener('click', clipNote);
bookmarkBtn.addEventListener('click', saveBookmark);
bookmarkAddEntryBtn?.addEventListener('click', () => toggleBookmarkAddPanel());
bookmarkAddCancelBtn?.addEventListener('click', () => toggleBookmarkAddPanel(false));
bookmarkSearchInput?.addEventListener('input', () => {
  bookmarkSearchQuery = bookmarkSearchInput.value;
  renderBookmarkManager();
});
bookmarkSearchClearBtn?.addEventListener('click', () => {
  bookmarkSearchQuery = '';
  renderBookmarkManager();
  bookmarkSearchInput?.focus();
});
vaultAddToggleBtn?.addEventListener('click', () => toggleVaultAddPanel());
vaultCaptureBtn?.addEventListener('click', fillVaultAddFormFromPage);
vaultPasskeyEnabledInput?.addEventListener('change', handleVaultPasskeyToggle);
vaultGeneratePasswordBtn?.addEventListener('click', () => toggleVaultPasswordTool());
vaultPasswordRefreshBtn?.addEventListener('click', () => {
  refreshVaultGeneratedPassword();
  vaultPasswordPreviewInput?.focus();
  vaultPasswordPreviewInput?.select();
});
vaultPasswordLengthInput?.addEventListener('input', () => {
  syncVaultPasswordLengthControls(vaultPasswordLengthInput.value);
  handleVaultPasswordOptionsChange();
});
vaultPasswordLengthRange?.addEventListener('input', () => {
  syncVaultPasswordLengthControls(vaultPasswordLengthRange.value);
  handleVaultPasswordOptionsChange();
});
[
  vaultPasswordUppercaseInput,
  vaultPasswordLowercaseInput,
  vaultPasswordNumbersInput,
  vaultPasswordSymbolsEnabledInput,
  vaultPasswordAvoidConfusingInput,
  vaultPasswordSymbolsInput,
].forEach((input) => input?.addEventListener('input', handleVaultPasswordOptionsChange));
vaultPasswordCopyBtn?.addEventListener('click', copyGeneratedVaultPassword);
vaultPasswordUseBtn?.addEventListener('click', useGeneratedVaultPassword);
vaultAddPasswordGenerateBtn?.addEventListener('click', generateVaultAddPassword);
vaultAddPasswordViewBtn?.addEventListener('click', toggleVaultAddPasswordVisibility);
vaultRegisterCountrySelect?.addEventListener('change', () => {
  saveVaultRegistrationSettings();
  if (lastVaultRegistrationProfile) {
    const profile = generateVaultRegistrationProfile({
      ...(lastVaultCapturedCredential || {}),
      country: vaultRegisterCountrySelect.value,
    }, { generatePassword: true });
    applyVaultRegistrationProfileToPopup(profile);
  }
});
vaultRegisterUsernameInput?.addEventListener('input', saveVaultRegistrationSettings);
vaultRegisterEmailInput?.addEventListener('input', saveVaultRegistrationSettings);
vaultRegisterPhoneInput?.addEventListener('input', saveVaultRegistrationSettings);
vaultRegisterReadBtn?.addEventListener('click', fillVaultAddFormFromPage);
vaultRegisterGenerateLocalBtn?.addEventListener('click', () => generateVaultRegistrationForPopup(false));
vaultRegisterGenerateBtn?.addEventListener('click', () => generateVaultRegistrationForPopup(true));
vaultAddCancelBtn?.addEventListener('click', () => toggleVaultAddPanel(false));
vaultAddSaveBtn?.addEventListener('click', createVaultEntryFromPopup);
window.addEventListener('unload', stopVaultTotpTimer);

// 启动
init();
