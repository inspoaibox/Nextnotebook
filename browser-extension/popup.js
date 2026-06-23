/**
 * 暮城笔记 - 网页剪藏扩展 Popup 脚本
 */

const API_BASE = 'http://127.0.0.1:27183';
const VAULT_AUTH_STORAGE_KEY = 'muchengVaultAuthToken';
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

// DOM 元素 - 密码库
const vaultSiteUrlEl = document.getElementById('vault-site-url');
const vaultListEl = document.getElementById('vault-list');
const vaultAddToggleBtn = document.getElementById('vault-add-toggle');
const vaultCaptureBtn = document.getElementById('vault-capture-btn');
const vaultAddPanel = document.getElementById('vault-add-panel');
const vaultAddNameInput = document.getElementById('vault-add-name');
const vaultAddUsernameInput = document.getElementById('vault-add-username');
const vaultAddPasswordInput = document.getElementById('vault-add-password');
const vaultAddUrlInput = document.getElementById('vault-add-url');
const vaultAddUriNameInput = document.getElementById('vault-add-uri-name');
const vaultAddTotpNameInput = document.getElementById('vault-add-totp-name');
const vaultAddTotpSecretInput = document.getElementById('vault-add-totp-secret');
const vaultAddFolderSelect = document.getElementById('vault-add-folder');
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
let currentPageUrl = '';
let vaultEntries = [];
let vaultFolders = [];
let isConnected = false;
let extractedImages = [];
let currentTab = 'note';
let vaultTotpTimer = null;
let isVaultEntriesLoading = false;

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
  countEl.textContent = String(getBookmarksForSelection(selection).length);

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

  const filtered = getBookmarksForSelection(selectedBookmarkFolderId)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'));

  if (bookmarkManagerCountEl) {
    bookmarkManagerCountEl.textContent = `共 ${bookmarkItems.length} 个，当前 ${filtered.length} 个`;
  }

  if (!filtered.length) {
    bookmarkListEl.innerHTML = '<div class="bookmark-empty">当前分类暂无书签</div>';
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
        // 获取网站图标
        const getIcon = () => {
          // 优先获取 apple-touch-icon
          const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
          if (appleIcon) return appleIcon.href;
          
          // 获取 favicon
          const favicon = document.querySelector('link[rel="icon"]') || 
                         document.querySelector('link[rel="shortcut icon"]');
          if (favicon) return favicon.href;
          
          // 默认 favicon 路径
          return window.location.origin + '/favicon.ico';
        };
        
        // 获取网站描述
        const getDescription = () => {
          const metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc) return metaDesc.content;
          
          const ogDesc = document.querySelector('meta[property="og:description"]');
          if (ogDesc) return ogDesc.content;
          
          return '';
        };
        
        // 获取网站名称
        const getName = () => {
          // 优先使用 og:site_name
          const ogSiteName = document.querySelector('meta[property="og:site_name"]');
          if (ogSiteName) return ogSiteName.content;
          
          // 使用 og:title
          const ogTitle = document.querySelector('meta[property="og:title"]');
          if (ogTitle) return ogTitle.content;
          
          // 使用页面标题
          return document.title;
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
    const isVisibleElement = (element) => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const isEditableInput = (element) => {
      if (!element || element.disabled || element.readOnly) return false;
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
    const getVisibleInputs = (root) => Array.from(root.querySelectorAll('input, textarea'))
      .filter(input => isEditableInput(input) && isVisibleElement(input));
    const allInputs = collectRoots(document).flatMap(root => getVisibleInputs(root));
    const passwordInput = allInputs.find(input => input instanceof HTMLInputElement && input.type === 'password' && input.value);
    if (!passwordInput) {
      return { success: false, error: '当前页面没有可读取的密码输入框' };
    }

    const form = passwordInput.form || passwordInput.closest('form');
    const scopeInputs = form ? getVisibleInputs(form) : allInputs;
    const passwordIndex = scopeInputs.indexOf(passwordInput);
    const beforePassword = passwordIndex >= 0 ? scopeInputs.slice(0, passwordIndex).reverse() : scopeInputs;
    const isLikelyUsernameInput = (input) => {
      if (!(input instanceof HTMLInputElement)) return false;
      const type = (input.getAttribute('type') || 'text').toLowerCase();
      if (!['text', 'email', 'tel', 'search', 'number', ''].includes(type)) return false;
      const hint = [input.name, input.id, input.autocomplete, input.placeholder, input.getAttribute('aria-label'), input.getAttribute('title')].join(' ').toLowerCase();
      return /(user|login|email|account|phone|mobile|identifier|customer|client|member|id|用户名|账号|账户|邮箱|手机|客户)/i.test(hint) || type === 'email' || input.autocomplete === 'username';
    };
    const usernameInput = beforePassword.find(isLikelyUsernameInput) ||
      beforePassword.find(input => input instanceof HTMLInputElement && ['text', 'email', 'tel', 'number', ''].includes((input.getAttribute('type') || 'text').toLowerCase()));

    return {
      success: true,
      credential: {
        title: document.title || location.hostname,
        url: window.location.href,
        username: usernameInput?.value || '',
        password: passwordInput.value || '',
      },
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
    vaultAddNameInput.value = credential.title || getDefaultVaultEntryName();
    vaultAddUrlInput.value = credential.url || currentPageUrl || '';
    if (vaultAddUriNameInput) {
      vaultAddUriNameInput.value = getDefaultVaultUriName();
    }
    vaultAddUsernameInput.value = credential.username || '';
    vaultAddPasswordInput.value = credential.password || '';
    showMessage('已读取页面输入', 'success');
  } catch (e) {
    console.error('Capture credential failed:', e);
    toggleVaultAddPanel(true);
    ensureVaultAddDefaults();
    showMessage('读取失败，请手动输入', 'error');
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
    const response = await vaultFetch('/api/bookmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: bookmarkNameInput.value || bookmarkData.name,
        url: bookmarkData.url,
        description: bookmarkDescInput.value || bookmarkData.description,
        icon: bookmarkData.icon,
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
vaultAddToggleBtn?.addEventListener('click', () => toggleVaultAddPanel());
vaultCaptureBtn?.addEventListener('click', fillVaultAddFormFromPage);
vaultAddCancelBtn?.addEventListener('click', () => toggleVaultAddPanel(false));
vaultAddSaveBtn?.addEventListener('click', createVaultEntryFromPopup);
window.addEventListener('unload', stopVaultTotpTimer);

// 启动
init();
