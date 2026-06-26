// 暮城笔记同步服务器管理界面
const API = '/api';
let token = sessionStorage.getItem('token');
let user = null;
localStorage.removeItem('token');

// API 请求
async function api(path, opt = {}) {
  const headers = { 'Content-Type': 'application/json', ...opt.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + path, { ...opt, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || '请求失败');
  return data;
}

// 渲染函数
function render(html) { document.getElementById('app').innerHTML = html; }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function escapeJsString(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\x3C')
    .replace(/>/g, '\\x3E');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

// 显示消息
function showMsg(msg, type = 'info') {
  const colors = { error: '#dc3545', success: '#28a745', info: '#667eea' };
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;top:20px;right:20px;padding:12px 20px;background:${colors[type]};color:white;border-radius:6px;z-index:9999;`;
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

// 格式化时间
function formatTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN');
}

// 解析 payload
function parsePayload(str) {
  try { return JSON.parse(str); } catch { return {}; }
}


// ========== 页面模板 ==========

// 登录页
function renderLogin(isSetup = false, setupState = {}) {
  const setupTokenRequired = Boolean(setupState.setupTokenRequired);
  const setupBlocked = Boolean(setupState.setupBlocked);
  render(`
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea,#764ba2);padding:20px;">
      <div style="background:white;border-radius:12px;padding:40px;width:100%;max-width:400px;box-shadow:0 10px 40px rgba(0,0,0,0.2);">
        <h1 style="text-align:center;margin-bottom:8px;">🌙 暮城笔记</h1>
        <p style="text-align:center;color:#666;margin-bottom:24px;">${isSetup ? '首次使用，请创建管理员账号' : '同步服务器管理面板'}</p>
        <div id="error" style="display:none;background:#fee;color:#c00;padding:10px;border-radius:6px;margin-bottom:16px;font-size:14px;"></div>
        ${setupBlocked ? `
          <div style="background:#fff3cd;color:#856404;padding:10px;border-radius:6px;margin-bottom:16px;font-size:14px;line-height:1.5;">
            服务器要求初始化令牌，但尚未配置 INITIAL_SETUP_TOKEN。请在服务器环境变量中配置后重启。
          </div>
        ` : ''}
        <form id="loginForm">
          <div style="margin-bottom:16px;">
            <label style="display:block;margin-bottom:6px;font-weight:500;">用户名</label>
            <input type="text" id="username" required style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block;margin-bottom:6px;font-weight:500;">密码</label>
            <input type="password" id="password" required style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
            ${isSetup ? '<small style="color:#666;">至少8个字符</small>' : ''}
          </div>
          <div style="margin-bottom:20px;">
            <label style="display:block;margin-bottom:6px;font-weight:500;">同步密钥</label>
            <input type="password" id="syncKey" required style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
            ${isSetup ? '<small style="color:#666;">至少16个字符，用于数据加密，请牢记</small>' : ''}
          </div>
          ${isSetup && setupTokenRequired ? `
            <div style="margin-bottom:20px;">
              <label style="display:block;margin-bottom:6px;font-weight:500;">初始化令牌</label>
              <input type="password" id="setupToken" ${setupBlocked ? 'disabled' : 'required'} style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
              <small style="color:#666;">服务器 INITIAL_SETUP_TOKEN，用于防止首个管理员被抢注</small>
            </div>
          ` : ''}
          <button type="submit" ${setupBlocked ? 'disabled' : ''} style="width:100%;padding:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;border-radius:6px;font-size:16px;cursor:${setupBlocked ? 'not-allowed' : 'pointer'};opacity:${setupBlocked ? '0.6' : '1'};">
            ${isSetup ? '创建管理员' : '登录'}
          </button>
        </form>
      </div>
    </div>
  `);
  
  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('error');
    errEl.style.display = 'none';
    try {
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const syncKey = document.getElementById('syncKey').value;
      const setupToken = document.getElementById('setupToken')?.value || '';
      
      if (isSetup) {
        await api('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, syncKey, setupToken }) });
        showMsg('管理员创建成功，请登录', 'success');
      }
      
      const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, syncKey }) });
      token = data.accessToken;
      user = data.user;
      sessionStorage.setItem('token', token);
      renderApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  };
}


// 主应用
let currentPage = 'dashboard';
let cloudAutoRefreshTimer = null;

function renderApp() {
  render(`
    <div class="app">
      <div class="sidebar">
        <div class="sidebar-header">
          <h1>🌙 暮城笔记</h1>
          <p>同步服务器</p>
        </div>
        <div class="nav-item ${currentPage === 'dashboard' ? 'active' : ''}" onclick="navigate('dashboard')">
          <span class="icon">📊</span> 仪表盘
        </div>
        <div class="nav-section">数据管理</div>
        <div class="nav-item ${currentPage === 'notes' ? 'active' : ''}" onclick="navigate('notes')">
          <span class="icon">📝</span> 笔记
        </div>
        <div class="nav-item ${currentPage === 'excel_notes' ? 'active' : ''}" onclick="navigate('excel_notes')">
          <span class="icon">📊</span> Excel笔记
        </div>
        <div class="nav-item ${currentPage === 'folders' ? 'active' : ''}" onclick="navigate('folders')">
          <span class="icon">📁</span> 文件夹
        </div>
        <div class="nav-item ${currentPage === 'todos' ? 'active' : ''}" onclick="navigate('todos')">
          <span class="icon">✅</span> 待办事项
        </div>
        <div class="nav-item ${currentPage === 'bookmarks' ? 'active' : ''}" onclick="navigate('bookmarks')">
          <span class="icon">🔖</span> 书签
        </div>
        <div class="nav-item ${currentPage === 'vault' ? 'active' : ''}" onclick="navigate('vault')">
          <span class="icon">🔐</span> 保险库
        </div>
        <div class="nav-item ${currentPage === 'ai' ? 'active' : ''}" onclick="navigate('ai')">
          <span class="icon">🤖</span> AI 助手
        </div>
        <div class="nav-item ${currentPage === 'resources' ? 'active' : ''}" onclick="navigate('resources')">
          <span class="icon">📎</span> 资源文件
        </div>
        <div class="nav-item ${currentPage === 'cloud_drive' ? 'active' : ''}" onclick="navigate('cloud_drive')">
          <span class="icon">☁️</span> 网盘
        </div>
        <div class="nav-section">系统</div>
        <div class="nav-item ${currentPage === 'users' ? 'active' : ''}" onclick="navigate('users')">
          <span class="icon">👥</span> 用户管理
        </div>
        <div class="nav-item ${currentPage === 'settings' ? 'active' : ''}" onclick="navigate('settings')">
          <span class="icon">⚙️</span> 系统设置
        </div>
        <div class="nav-item ${currentPage === 'logs' ? 'active' : ''}" onclick="navigate('logs')">
          <span class="icon">📋</span> 变更日志
        </div>
      </div>
      <div class="main">
        <div class="header">
          <h2 id="pageTitle">仪表盘</h2>
          <div class="user-info">
            <span>👤 ${escapeHtml(user?.username || '')}</span>
            <button class="btn btn-secondary" onclick="logout()">退出</button>
          </div>
        </div>
        <div class="content" id="pageContent"></div>
      </div>
    </div>
  `);
  loadPage(currentPage);
}

function navigate(page) {
  stopCloudAutoRefresh();
  currentPage = page;
  renderApp();
}

async function logout() {
  try {
    if (token) {
      await api('/auth/logout', { method: 'POST' });
    }
  } catch {
    // 本地退出仍然继续，避免网络异常时卡住。
  }
  sessionStorage.removeItem('token');
  localStorage.removeItem('token');
  token = null;
  user = null;
  init();
}


// ========== 页面加载 ==========

async function loadPage(page) {
  const content = document.getElementById('pageContent');
  const title = document.getElementById('pageTitle');
  const titles = {
    dashboard: '仪表盘', notes: '笔记管理', excel_notes: 'Excel笔记', folders: '文件夹', todos: '待办事项',
    bookmarks: '书签管理', vault: '保险库', ai: 'AI 助手', resources: '资源文件', cloud_drive: '网盘',
    users: '用户管理', settings: '系统设置', logs: '变更日志'
  };
  title.textContent = titles[page] || page;
  content.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">加载中...</div>';
  
  try {
    switch (page) {
      case 'dashboard': await loadDashboard(content); break;
      case 'notes': await loadItems(content, 'note', '笔记'); break;
      case 'excel_notes': await loadItems(content, 'excel_note', 'Excel笔记'); break;
      case 'folders': await loadItems(content, 'folder', '文件夹'); break;
      case 'todos': await loadItems(content, 'todo', '待办'); break;
      case 'bookmarks': await loadItems(content, 'bookmark', '书签'); break;
      case 'vault': await loadItems(content, 'vault_entry', '保险库条目'); break;
      case 'ai': await loadAI(content); break;
      case 'resources': await loadItems(content, 'resource', '资源'); break;
      case 'cloud_drive': await loadCloudDrive(content); break;
      case 'users': await loadUsers(content); break;
      case 'settings': await loadSettings(content); break;
      case 'logs': await loadLogs(content); break;
    }
  } catch (err) {
    content.innerHTML = `<div style="color:#dc3545;padding:20px;">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

// 仪表盘
async function loadDashboard(el) {
  const stats = await api('/items/count');
  
  // 获取所有类型
  const allTypes = Object.keys(stats.byType || {});
  
  el.innerHTML = `
    <div class="stats-grid">
      ${allTypes.map(type => {
        const typeArg = escapeAttr(escapeJsString(type));
        return `
        <div class="stat-card" style="cursor:pointer;" onclick="viewTypeItems('${typeArg}')">
          <div class="stat-value">${stats.byType[type] || 0}</div>
          <div class="stat-label">${escapeHtml(type)}</div>
        </div>
      `;
      }).join('')}
      <div class="stat-card">
        <div class="stat-value">${stats.itemCount || 0}</div>
        <div class="stat-label">总计</div>
      </div>
    </div>
    <div class="card" style="margin-top:24px;">
      <div class="card-header">服务器信息</div>
      <div class="card-body">
        <p><strong>状态:</strong> 运行中 ✅</p>
        <p><strong>当前用户:</strong> ${escapeHtml(user?.username)} (${escapeHtml(user?.role)})</p>
        <p><strong>时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
        <p><strong>数据类型:</strong> ${allTypes.map(escapeHtml).join(', ') || '无'}</p>
      </div>
    </div>
  `;
}


// AI 助手数据
async function loadAI(el) {
  // 加载 AI 配置、对话和消息
  const [configData, convData, msgData] = await Promise.all([
    api('/items/list?type=ai_config&limit=10'),
    api('/items/list?type=ai_conversation&limit=50'),
    api('/items/list?type=ai_message&limit=100')
  ]);
  
  const configs = configData.items || [];
  const conversations = convData.items || [];
  const messages = msgData.items || [];
  
  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-value">${configs.length}</div><div class="stat-label">AI 配置</div></div>
      <div class="stat-card"><div class="stat-value">${conversations.length}</div><div class="stat-label">对话</div></div>
      <div class="stat-card"><div class="stat-value">${messages.length}</div><div class="stat-label">消息</div></div>
    </div>
    
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header">AI 对话列表 (${conversations.length})</div>
      <div class="card-body" style="padding:0;">
        ${conversations.length === 0 ? '<p style="padding:20px;color:#666;">暂无对话</p>' : `
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;">
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">ID</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">标题</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">模型</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">更新时间</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">操作</th>
              </tr>
            </thead>
            <tbody>
              ${conversations.map(item => {
                const payload = parsePayload(item.payload);
                const itemArg = escapeAttr(escapeJsString(item.id));
                return `
                  <tr>
                    <td style="padding:12px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:12px;">${escapeHtml(item.id.substring(0, 8))}...</td>
                    <td style="padding:12px;border-bottom:1px solid #e0e0e0;">${escapeHtml(payload.title || '未命名对话')}</td>
                    <td style="padding:12px;border-bottom:1px solid #e0e0e0;font-size:13px;color:#666;">${escapeHtml(payload.model || '-')}</td>
                    <td style="padding:12px;border-bottom:1px solid #e0e0e0;font-size:13px;color:#666;">${formatTime(item.updated_time)}</td>
                    <td style="padding:12px;border-bottom:1px solid #e0e0e0;">
                      <button class="btn btn-sm btn-secondary" onclick="viewItem('${itemArg}')">查看</button>
                      <button class="btn btn-sm btn-danger" onclick="deleteItem('${itemArg}')">删除</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
    
    <div class="card">
      <div class="card-header">最近消息 (${messages.length})</div>
      <div class="card-body" style="padding:0;">
        ${messages.length === 0 ? '<p style="padding:20px;color:#666;">暂无消息</p>' : `
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;">
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">ID</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">角色</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">内容预览</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">时间</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">操作</th>
              </tr>
            </thead>
            <tbody>
              ${messages.slice(0, 20).map(item => {
                const payload = parsePayload(item.payload);
                const roleIcon = payload.role === 'user' ? '👤' : '🤖';
                const content = String(payload.content || '').substring(0, 50);
                const itemArg = escapeAttr(escapeJsString(item.id));
                return `
                  <tr>
                    <td style="padding:12px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:12px;">${escapeHtml(item.id.substring(0, 8))}...</td>
                    <td style="padding:12px;border-bottom:1px solid #e0e0e0;">${roleIcon} ${escapeHtml(payload.role || '-')}</td>
                    <td style="padding:12px;border-bottom:1px solid #e0e0e0;font-size:13px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(content)}${content.length >= 50 ? '...' : ''}</td>
                    <td style="padding:12px;border-bottom:1px solid #e0e0e0;font-size:13px;color:#666;">${formatTime(item.updated_time)}</td>
                    <td style="padding:12px;border-bottom:1px solid #e0e0e0;">
                      <button class="btn btn-sm btn-secondary" onclick="viewItem('${itemArg}')">查看</button>
                      <button class="btn btn-sm btn-danger" onclick="deleteItem('${itemArg}')">删除</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `;
}


// 数据项列表
async function loadItems(el, type, label) {
  const data = await api(`/items/list?type=${encodeURIComponent(type)}&limit=100`);
  const items = data.items || [];
  
  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span>${escapeHtml(label)}列表 (${items.length})</span>
      </div>
      <div class="card-body" style="padding:0;">
        ${items.length === 0 ? '<p style="padding:20px;color:#666;">暂无数据</p>' : `
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;">
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">ID</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">内容</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">更新时间</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">操作</th>
              </tr>
            </thead>
            <tbody id="itemsBody"></tbody>
          </table>
        `}
      </div>
    </div>
  `;
  
  if (items.length > 0) {
    const tbody = document.getElementById('itemsBody');
    items.forEach(item => {
      const payload = parsePayload(item.payload);
      const itemId = String(item.id ?? '');
      const contentPreview = typeof payload.content === 'string' ? payload.content.substring(0, 50) : '';
      const title = payload.title || payload.name || payload.url || contentPreview || itemId.substring(0, 8);
      const itemArg = escapeAttr(escapeJsString(item.id));
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:12px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:12px;">${escapeHtml(itemId.substring(0, 8))}...</td>
        <td style="padding:12px;border-bottom:1px solid #e0e0e0;">${escapeHtml(title)}</td>
        <td style="padding:12px;border-bottom:1px solid #e0e0e0;font-size:13px;color:#666;">${formatTime(item.updated_time)}</td>
        <td style="padding:12px;border-bottom:1px solid #e0e0e0;">
          <button class="btn btn-sm btn-secondary" onclick="viewItem('${itemArg}')">查看</button>
          <button class="btn btn-sm btn-danger" onclick="deleteItem('${itemArg}')">删除</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// 网盘数据 —— 多级目录树浏览
// 当前用户范围：服务端按 JWT user_id 隔离，这里只做客户端路径分组
let cloudDriveState = { currentPath: '', files: [], folders: [], treeExpanded: new Set(['']) };
let cloudLastSignature = '';

async function loadCloudDrive(el) {
  el.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">加载中...</div>';
  try {
    await cloudRefresh();
    cloudLastSignature = cloudBuildSignature();
    cloudRender(el);
    startCloudAutoRefresh();
  } catch (err) {
    el.innerHTML = `<div style="color:#dc3545;padding:20px;">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

async function cloudRefresh() {
  const [fileData, folderData] = await Promise.all([
    cloudFetchAllItems('cloud_file'),
    cloudFetchAllItems('cloud_folder')
  ]);
  cloudDriveState.files = (fileData.items || []).map(normalizeCloudItem);
  cloudDriveState.folders = (folderData.items || []).map(normalizeCloudItem);
  cloudEnsureCurrentPath();
}

async function cloudFetchAllItems(type) {
  const items = [];
  const limit = 500;
  let offset = 0;
  while (true) {
    const data = await api(`/items/list?type=${encodeURIComponent(type)}&limit=${limit}&offset=${offset}`);
    const batch = data.items || [];
    items.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return { items };
}

// 把后端 item 规整成统一结构（路径解析基于 payload.relative_path）
function normalizeCloudItem(item) {
  const payload = parsePayload(item.payload);
  const id = String(item.id ?? '');
  const rawPath = String(payload.relative_path || payload.filename || payload.name || id)
    .replace(/\\/g, '/');
  // 拆分成 segments（去掉空段）
  const segments = String(rawPath || '').split('/').map(s => s.trim()).filter(Boolean);
  const relativePath = segments.join('/');
  return {
    id,
    type: item.type,
    payload,
    name: payload.filename || payload.name || segments[segments.length - 1] || id,
    relativePath,
    segments,
    parentPath: segments.slice(0, -1).join('/'),
    parentFolderId: payload.parent_folder_id ?? null,
    size: Number(payload.size || 0),
    state: payload.upload_state || payload.download_state || '',
    mtime: item.updated_time || payload.mtime || 0,
    extension: payload.filename ? (payload.filename.split('.').pop() || '').toLowerCase() : ''
  };
}

function cloudEnsureCurrentPath() {
  const current = String(cloudDriveState.currentPath || '').split('/').filter(Boolean).join('/');
  if (!current) return;
  if (cloudDriveState.folders.some(folder => folder.relativePath === current)) return;
  const segs = current.split('/').filter(Boolean);
  while (segs.length > 0) {
    segs.pop();
    const parent = segs.join('/');
    if (!parent || cloudDriveState.folders.some(folder => folder.relativePath === parent)) {
      cloudDriveState.currentPath = parent;
      return;
    }
  }
  cloudDriveState.currentPath = '';
}

function cloudBuildSignature() {
  const folders = cloudDriveState.folders
    .map(folder => `${folder.id}:${folder.relativePath}:${folder.mtime}`)
    .sort()
    .join('|');
  const files = cloudDriveState.files
    .map(file => `${file.id}:${file.relativePath}:${file.size}:${file.state}:${file.mtime}`)
    .sort()
    .join('|');
  return `${folders}@@${files}`;
}

function stopCloudAutoRefresh() {
  if (cloudAutoRefreshTimer) {
    clearInterval(cloudAutoRefreshTimer);
    cloudAutoRefreshTimer = null;
  }
}

function startCloudAutoRefresh() {
  stopCloudAutoRefresh();
  cloudAutoRefreshTimer = setInterval(() => {
    void cloudAutoRefreshTick();
  }, 5000);
}

async function cloudAutoRefreshTick() {
  if (currentPage !== 'cloud_drive') return;
  if (document.getElementById('cdModalMask') || document.getElementById('cdOverlay')) return;
  const prev = cloudLastSignature;
  await cloudRefresh();
  const next = cloudBuildSignature();
  if (next === prev) return;
  cloudLastSignature = next;
  const content = document.getElementById('pageContent');
  if (content) {
    cloudRender(content);
  }
}

function cloudRender(el) {
  const { currentPath } = cloudDriveState;
  const list = cloudListAt(currentPath);
  const folders = list.filter(x => x.type === 'cloud_folder').sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const files = list.filter(x => x.type === 'cloud_file').sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const allRows = [...folders, ...files];

  el.innerHTML = `
    <div class="cd-toolbar">
      <div class="cd-breadcrumb">${cloudRenderBreadcrumb(currentPath)}</div>
      <button class="btn btn-sm btn-secondary" onclick="cloudRefreshAndRender()">刷新</button>
      <button class="btn btn-sm btn-secondary" onclick="cloudCreateFolderPrompt()">新建文件夹</button>
      <button class="btn btn-sm btn-primary" onclick="document.getElementById('cdFileInput').click()">上传文件</button>
      <input id="cdFileInput" type="file" multiple style="display:none" onchange="cloudUploadOnChange(this.files)">
    </div>
    <div id="cdDropZone" class="cd-drop">
      拖拽文件到此处上传，或点击右上角"上传文件"
    </div>
    <div id="cdUploadArea"></div>
    <div class="cd-shell">
      <div class="cd-pane">
        <div class="cd-pane-header">
          <div>
            <div class="cd-pane-title">目录树</div>
            <div class="cd-pane-subtitle">显示全部同步路径</div>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="cloudCollapseAll()">收起</button>
        </div>
        <div class="cd-tree">${cloudRenderTree()}</div>
      </div>
      <div class="cd-pane cd-list">
        <div class="cd-pane-header">
          <div>
            <div class="cd-pane-title">${escapeHtml(currentPath || '根目录')}</div>
            <div class="cd-pane-subtitle">${escapeHtml(`${allRows.length} 项`)}</div>
          </div>
        </div>
        <div style="padding:0;">
          ${allRows.length === 0
            ? '<div class="cd-empty">此目录为空</div>'
            : allRows.map(cloudRenderRow).join('')}
        </div>
      </div>
    </div>
  `;
  cloudBindDrop();
}

function cloudRenderBreadcrumb(currentPath) {
  const segs = currentPath ? currentPath.split('/').filter(Boolean) : [];
  let html = `<span class="cd-crumb" onclick="cloudNavigate('')">根目录</span>`;
  let acc = '';
  segs.forEach((seg, i) => {
    acc = acc ? acc + '/' + seg : seg;
    const arg = escapeAttr(escapeJsString(acc));
    html += `<span class="cd-crumb-sep">/</span>`;
    if (i === segs.length - 1) {
      html += `<span class="cd-crumb-current">${escapeHtml(seg)}</span>`;
    } else {
      html += `<span class="cd-crumb" onclick="cloudNavigate('${arg}')">${escapeHtml(seg)}</span>`;
    }
  });
  return html;
}

function cloudRenderRow(item) {
  const isFolder = item.type === 'cloud_folder';
  const icon = isFolder ? '📁' : cloudIconFor(item.extension);
  const arg = escapeAttr(escapeJsString(item.id));
  const nameArg = escapeAttr(escapeJsString(item.name));
  if (isFolder) {
    const pathArg = escapeAttr(escapeJsString(item.relativePath));
    return `
      <div class="cd-row is-folder" ondblclick="cloudNavigate('${pathArg}')" onclick="cloudNavigate('${pathArg}')">
        <span class="cd-row-icon">${icon}</span>
        <span class="cd-row-name is-folder">${escapeHtml(item.name)}</span>
        <span class="cd-row-meta"></span>
        <span class="cd-row-state">${item.state ? escapeHtml(item.state) : ''}</span>
        <span class="cd-row-actions">
          <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();cloudRename('${arg}','${nameArg}',true)">重命名</button>
          <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();cloudMovePrompt('${arg}','${escapeAttr(escapeJsString(item.relativePath))}')">移动</button>
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();cloudDelete('${arg}',true,'${nameArg}')">删除</button>
        </span>
      </div>`;
  }
  return `
    <div class="cd-row">
      <span class="cd-row-icon">${icon}</span>
      <span class="cd-row-name">${escapeHtml(item.name)}</span>
      <span class="cd-row-meta">${escapeHtml(formatFileSize(item.size))}</span>
      <span class="cd-row-state">${item.state ? escapeHtml(item.state) : ''}</span>
      <span class="cd-row-actions">
        <button class="btn btn-sm btn-secondary" onclick="cloudView('${arg}')">查看</button>
        <button class="btn btn-sm btn-secondary" onclick="cloudDownload('${arg}','${nameArg}')">下载</button>
        <button class="btn btn-sm btn-secondary" onclick="cloudRename('${arg}','${nameArg}',false)">重命名</button>
        <button class="btn btn-sm btn-secondary" onclick="cloudMovePrompt('${arg}','${escapeAttr(escapeJsString(item.relativePath))}')">移动</button>
        <button class="btn btn-sm btn-danger" onclick="cloudDelete('${arg}',false,'${nameArg}')">删除</button>
      </span>
    </div>`;
}

function cloudRenderTree() {
  const children = cloudBuildTreeIndex();
  return cloudRenderTreeRoot(children);
}

function cloudBuildTreeIndex() {
  const nodes = new Map();
  for (const folder of cloudDriveState.folders) {
    const path = folder.relativePath || '';
    const parent = folder.parentPath || '';
    if (!nodes.has(parent)) nodes.set(parent, []);
    nodes.get(parent).push(folder);
  }
  for (const list of nodes.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }
  return nodes;
}

function cloudRenderTreeRoot(children) {
  const expanded = cloudDriveState.treeExpanded.has('');
  const rootChildren = children.get('') || [];
  const toggleIcon = rootChildren.length > 0 ? (expanded ? '▾' : '▸') : '•';
  let html = `
    <div class="cd-tree-root ${cloudDriveState.currentPath === '' ? 'is-active' : ''}" onclick="cloudNavigate('')">
      <button class="cd-tree-toggle" onclick="event.stopPropagation();cloudToggleTree('')">${toggleIcon}</button>
      <span class="cd-tree-label">根目录</span>
      <span class="cd-tree-count">${cloudCountDirect('')}</span>
    </div>
  `;
  if (!expanded) return html;
  html += cloudRenderTreeNodeChildren('', 1, children);
  return html;
}

function cloudRenderTreeNodeChildren(path, depth, children) {
  const directChildren = children.get(path) || [];
  let html = '';
  for (const node of directChildren) {
    const nodePath = node.relativePath || '';
    const hasChildren = (children.get(nodePath) || []).length > 0;
    const expanded = cloudDriveState.treeExpanded.has(nodePath);
    html += `
      <div class="cd-tree-node ${cloudDriveState.currentPath === nodePath ? 'is-active' : ''}" style="padding-left:${12 + depth * 14}px">
        <button class="cd-tree-toggle" onclick="cloudToggleTree('${escapeAttr(escapeJsString(nodePath))}')">${hasChildren ? (expanded ? '▾' : '▸') : '•'}</button>
        <span class="cd-tree-label" onclick="cloudNavigate('${escapeAttr(escapeJsString(nodePath))}')">${escapeHtml(node.name)}</span>
        <span class="cd-tree-count">${cloudCountDirect(nodePath)}</span>
      </div>
    `;
    if (hasChildren && expanded) {
      html += cloudRenderTreeNodeChildren(nodePath, depth + 1, children);
    }
  }
  return html;
}

function cloudCountDirect(path) {
  return cloudListAt(path).length;
}

function cloudToggleTree(path) {
  const key = path || '';
  if (cloudDriveState.treeExpanded.has(key)) cloudDriveState.treeExpanded.delete(key);
  else cloudDriveState.treeExpanded.add(key);
  const content = document.getElementById('pageContent');
  cloudRender(content);
}

function cloudCollapseAll() {
  cloudDriveState.treeExpanded = new Set();
  const content = document.getElementById('pageContent');
  cloudRender(content);
}

function cloudExpandAncestors(path) {
  cloudDriveState.treeExpanded.add('');
  const segs = String(path || '').split('/').filter(Boolean);
  let acc = '';
  for (const seg of segs) {
    acc = acc ? `${acc}/${seg}` : seg;
    cloudDriveState.treeExpanded.add(acc);
  }
}

function cloudIconFor(ext) {
  if (!ext) return '📄';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return '🖼️';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return '🎬';
  if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) return '🎵';
  if (['pdf'].includes(ext)) return '📕';
  if (['doc', 'docx'].includes(ext)) return '📘';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📗';
  if (['ppt', 'pptx'].includes(ext)) return '📙';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
  if (['txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'py', 'java', 'go'].includes(ext)) return '📄';
  return '📄';
}

function pathExtensionFromName(name) {
  const value = String(name || '');
  const dot = value.lastIndexOf('.');
  if (dot <= 0 || dot === value.length - 1) return '';
  return value.substring(dot + 1).toLowerCase();
}

function cloudBinaryResourceName(id, payload) {
  const filename = String(payload?.filename || '');
  const ext = pathExtensionFromName(filename);
  return `${id}${ext ? `.${ext}` : ''}`;
}

// 取出指定路径下的直接子项（不递归）
function cloudListAt(path) {
  const norm = (path || '').split('/').filter(Boolean).join('/');
  const atDepth = (norm ? norm.split('/').length : 0);
  const all = [...cloudDriveState.folders, ...cloudDriveState.files];
  return all.filter(item => {
    if (item.segments.length !== atDepth + 1) return false;
    const parent = item.segments.slice(0, -1).join('/');
    return parent === norm;
  });
}

// 导航
function cloudNavigate(path) {
  cloudDriveState.currentPath = path || '';
  cloudExpandAncestors(cloudDriveState.currentPath);
  const content = document.getElementById('pageContent');
  cloudRender(content);
}

async function cloudRefreshAndRender() {
  try {
    await cloudRefresh();
    cloudLastSignature = cloudBuildSignature();
    const content = document.getElementById('pageContent');
    cloudRender(content);
    showMsg('已刷新', 'success');
  } catch (err) {
    showMsg(err.message, 'error');
  }
}

// 拖拽上传
function cloudBindDrop() {
  const zone = document.getElementById('cdDropZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      cloudUploadFiles(e.dataTransfer.files);
    }
  });
}

// 文件选择回调
function cloudUploadOnChange(fileList) {
  cloudUploadFiles(fileList);
  document.getElementById('cdFileInput').value = '';
}

// 上传入口（支持多文件，串行）
async function cloudUploadFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const base = cloudDriveState.currentPath || '';
  for (const file of files) {
    await cloudUploadOne(file, base).catch(err => showMsg(`上传失败: ${file.name} - ${err.message}`, 'error'));
  }
  await cloudRefreshAndRender();
  showMsg(`已上传 ${files.length} 个文件`, 'success');
}

// 单个文件上传：item → upload session → chunks → complete
async function cloudUploadOne(file, base) {
  const itemId = cloudGenId();
  const relativePath = base ? `${base}/${file.name}` : file.name;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const chunkSize = 8 * 1024 * 1024; // 8MB
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
  const now = Date.now();

  // 1) 先建 item
  const payload = {
    filename: file.name,
    mime_type: file.type || 'application/octet-stream',
    size: file.size,
    file_hash: '',
    parent_folder_id: cloudParentFolderId(base, true),
    relative_path: relativePath,
    mtime: now,
    upload_state: 'pending',
    chunk_size: chunkSize,
    total_chunks: totalChunks,
    uploaded_chunks: []
  };
  await cloudPutItem(itemId, 'cloud_file', payload);

  // 2) 建上传会话
  const session = await api('/resources/upload', {
    method: 'POST',
    body: JSON.stringify({ item_id: itemId, total_size: file.size, chunk_size: chunkSize, extension: ext || undefined })
  });
  const sessionId = session.session_id;

  // 3) 分块上传
  const uploaded = session.uploaded_chunks || [];
  for (let i = 0; i < totalChunks; i++) {
    if (uploaded.includes(i)) continue;
    const start = i * chunkSize;
    const blob = file.slice(start, Math.min(start + chunkSize, file.size));
    await cloudUploadChunk(sessionId, i, blob, totalChunks, file.name);
    uploaded.push(i);
    cloudUploadProgress(file.name, i + 1, totalChunks);
  }

  // 4) 完成
  await api(`/resources/upload/${encodeURIComponent(sessionId)}/complete`, { method: 'POST' });
  cloudUploadDone(file.name);
}

function cloudUploadChunk(sessionId, index, blob, totalChunks, label) {
  const headers = { 'Content-Type': 'application/octet-stream', 'X-Chunk-Index': String(index) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${API}/resources/upload/${encodeURIComponent(sessionId)}/chunk`, { method: 'PUT', headers, body: blob })
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || `分块 ${index + 1} 上传失败`);
      return data;
    });
}

function cloudUploadProgress(label, done, total) {
  const area = document.getElementById('cdUploadArea');
  if (!area) return;
  const pct = total > 0 ? Math.round(done / total * 100) : 100;
  const id = 'cdp-' + label.replace(/[^a-z0-9]/gi, '');
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement('div');
    node.id = id;
    node.className = 'cd-progress-wrap';
    node.innerHTML = `
      <div style="font-size:12px;color:#333;margin-bottom:4px;">${escapeHtml(label)}</div>
      <div class="cd-progress"><div class="cd-progress-bar" style="width:0%"></div></div>
      <div class="cd-progress-label"><span class="cd-pct">0%</span><span class="cd-chunk"></span></div>
    `;
    area.appendChild(node);
  }
  node.querySelector('.cd-progress-bar').style.width = pct + '%';
  node.querySelector('.cd-pct').textContent = pct + '%';
  node.querySelector('.cd-chunk').textContent = `${done}/${total} 块`;
}

function cloudUploadDone(label) {
  const id = 'cdp-' + label.replace(/[^a-z0-9]/gi, '');
  const node = document.getElementById(id);
  if (!node) return;
  node.querySelector('.cd-progress-bar').style.width = '100%';
  node.querySelector('.cd-pct').textContent = '完成';
  node.querySelector('.cd-chunk').textContent = '✓';
  setTimeout(() => node && node.remove(), 2000);
}

// 生成 UUID（带扩展后的 item_id 用）
function cloudGenId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function cloudFindFolderByPath(path) {
  const norm = String(path || '').split('/').filter(Boolean).join('/');
  return cloudDriveState.folders.find(folder => folder.relativePath === norm) || null;
}

function cloudParentFolderId(parentPath, isFile) {
  const norm = String(parentPath || '').split('/').filter(Boolean).join('/');
  if (!norm) return isFile ? 'root' : null;
  const folder = cloudFindFolderByPath(norm);
  if (!folder) {
    throw new Error(`目标目录不存在: ${norm}`);
  }
  return folder.id;
}

async function cloudPayloadHash(payloadJson) {
  if (window.crypto && crypto.subtle && typeof TextEncoder !== 'undefined') {
    const data = new TextEncoder().encode(payloadJson);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }
  let hash = 0;
  for (let i = 0; i < payloadJson.length; i++) {
    hash = ((hash << 5) - hash + payloadJson.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(16, '0').substring(0, 16);
}

async function cloudPutItem(id, type, payload) {
  const payloadJson = JSON.stringify(payload);
  const contentHash = await cloudPayloadHash(payloadJson);
  return api(`/items/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ type, payload: payloadJson, content_hash: contentHash })
  });
}

// ========== 网盘操作 ==========

// 查看：弹模态预览
async function cloudView(id) {
  cloudModalOpen('加载中...', '');
  try {
    const item = await api(`/items/${encodeURIComponent(id)}`);
    const payload = parsePayload(item.payload);
    const name = payload.filename || payload.name || id;
    const resName = cloudBinaryResourceName(id, payload);
    const url = `${API}/resources/${encodeURIComponent(resName)}?t=${Date.now()}`;
    const ext = pathExtensionFromName(name);

    const head = `
      <div class="cd-info-table">
        <tr><td>名称</td><td>${escapeHtml(name)}</td></tr>
        <tr><td>路径</td><td>${escapeHtml(payload.relative_path || '-')}</td></tr>
        <tr><td>大小</td><td>${escapeHtml(formatFileSize(Number(payload.size || 0)))}</td></tr>
        <tr><td>状态</td><td>${escapeHtml(payload.upload_state || '-')}</td></tr>
        <tr><td>修改时间</td><td>${formatTime(payload.mtime || item.updated_time)}</td></tr>
        <tr><td>ID</td><td style="font-family:monospace;font-size:11px;">${escapeHtml(id)}</td></tr>
      </div>
    `;

    let preview = '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
      preview = `<img class="cd-preview-img" src="${url}" alt="">`;
    } else if (ext === 'pdf') {
      preview = `<iframe class="cd-preview-iframe" src="${url}"></iframe>`;
    } else if (['mp4', 'webm', 'mov'].includes(ext)) {
      preview = `<video controls style="max-width:100%;max-height:70vh;display:block;margin:0 auto;"><source src="${url}"></video>`;
    } else if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) {
      preview = `<audio controls style="width:100%;"><source src="${url}"></audio>`;
    } else if (['txt', 'md', 'json', 'log', 'csv', 'js', 'ts', 'css', 'html', 'py', 'java', 'go', 'xml'].includes(ext)) {
      const text = await fetch(url).then(r => r.ok ? r.text() : '').catch(() => '');
      preview = `<pre style="white-space:pre-wrap;word-break:break-word;background:#f7f7f7;padding:14px;border-radius:6px;font-size:12px;max-height:60vh;overflow:auto;">${escapeHtml(text.substring(0, 200000))}</pre>`;
    } else {
      preview = `<div class="cd-empty">此类型暂不支持在线预览，请点击下方下载</div>`;
    }

    cloudModalOpen(`查看：${name}`, head + preview, [
      { text: '下载', cls: 'btn-primary', onclick: `cloudDownload('${escapeAttr(escapeJsString(id))}','${escapeAttr(escapeJsString(name))}')` },
      { text: '关闭', cls: 'btn-secondary', onclick: 'cloudModalClose()' }
    ]);
  } catch (err) {
    cloudModalClose();
    showMsg(err.message, 'error');
  }
}

// 下载
async function cloudDownload(id, name) {
  try {
    const item = await api(`/items/${encodeURIComponent(id)}`);
    const payload = parsePayload(item.payload);
    const resName = cloudBinaryResourceName(id, payload);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API}/resources/${encodeURIComponent(resName)}`, { headers });
    if (!res.ok) throw new Error(`下载失败 (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || id;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    showMsg(err.message, 'error');
  }
}

// 重命名（委托服务端原子更新 relative_path 与子树）
async function cloudRename(id, oldName, isFolder) {
  const newName = prompt(`请输入新名称：`, oldName);
  if (!newName || newName === oldName) return;
  cloudShowOverlay('正在重命名...');
  try {
    const item = await api(`/items/${encodeURIComponent(id)}`);
    const payload = parsePayload(item.payload);
    const oldPath = String(payload.relative_path || payload.filename || payload.name || '');
    const segs = oldPath.split('/').filter(Boolean);
    if (segs.length === 0) throw new Error('当前路径无效');
    segs[segs.length - 1] = newName;
    const newPath = segs.join('/');
    const parentPath = newPath.split('/').slice(0, -1).join('/');
    if (isFolder) {
      await api(`/items/${encodeURIComponent(id)}/move`, {
        method: 'POST',
        body: JSON.stringify({
          relative_path: newPath,
          parent_folder_id: cloudParentFolderId(parentPath, false)
        })
      });
    } else {
      await api(`/items/${encodeURIComponent(id)}/move`, {
        method: 'POST',
        body: JSON.stringify({
          relative_path: newPath,
          parent_folder_id: cloudParentFolderId(parentPath, true)
        })
      });
    }
    cloudHideOverlay();
    showMsg('重命名成功', 'success');
    await cloudRefreshAndRender();
  } catch (err) {
    cloudHideOverlay();
    showMsg(err.message, 'error');
  }
}

// 移动
async function cloudMovePrompt(id, currentRelPath) {
  cloudModalOpen('移动到...', `
    <div class="cd-form-group">
      <label>当前路径</label>
      <div style="font-size:13px;color:#666;padding:6px 0;">${escapeHtml(currentRelPath || '(根目录)')}</div>
    </div>
    <div class="cd-form-group">
      <label>目标路径（留空表示根目录，多级用 / 分隔，例如：docs/work）</label>
      <input id="cdMoveTarget" class="cd-input" value="${escapeAttr(currentRelPath.includes('/') ? currentRelPath.split('/').slice(0, -1).join('/') : '')}" placeholder="如 docs/work 或留空">
    </div>
    <div style="font-size:12px;color:#999;">提示：只会移动此项本身；文件夹移动会一并更新内部子项的路径。</div>
  `, [
    { text: '取消', cls: 'btn-secondary', onclick: 'cloudModalClose()' },
    { text: '移动', cls: 'btn-primary', onclick: `cloudMoveDo('${escapeAttr(escapeJsString(id))}','${escapeAttr(escapeJsString(currentRelPath))}')` }
  ]);
}

async function cloudMoveDo(id, oldRelPath) {
  const input = document.getElementById('cdMoveTarget');
  const target = (input ? input.value : '').trim().split('/').map(s => s.trim()).filter(Boolean).join('/');
  cloudModalClose();
  cloudShowOverlay('正在移动...');
  try {
    const item = await api(`/items/${encodeURIComponent(id)}`);
    const payload = parsePayload(item.payload);
    const isFolder = item.type === 'cloud_folder';
    const name = isFolder ? (payload.name || oldRelPath.split('/').pop()) : (payload.filename || oldRelPath.split('/').pop());
    const newRel = target ? `${target}/${name}` : name;
    if (target && !cloudFindFolderByPath(target)) throw new Error(`目标目录不存在: ${target}`);
    await api(`/items/${encodeURIComponent(id)}/move`, {
      method: 'POST',
      body: JSON.stringify({
        relative_path: newRel,
        parent_folder_id: cloudParentFolderId(target, !isFolder ? true : false)
      })
    });
    cloudHideOverlay();
    showMsg('移动成功', 'success');
    await cloudRefreshAndRender();
  } catch (err) {
    cloudHideOverlay();
    showMsg(err.message, 'error');
  }
}

// 删除：文件 = 资源 + item；文件夹 = 递归删除所有子项
async function cloudDelete(id, isFolder, displayName) {
  if (!confirm(`确定删除「${displayName || id}」？${isFolder ? '文件夹内所有内容将被一并删除且不可恢复。' : ''}`)) return;
  cloudShowOverlay('正在删除...');
  try {
    if (isFolder) {
      const folder = [...cloudDriveState.folders, ...cloudDriveState.files].find(x => x.id === id);
      const prefix = folder ? folder.relativePath : '';
      const toDelete = [
        ...cloudDriveState.folders.filter(x => x.id === id || (prefix && (x.relativePath === prefix || x.relativePath.startsWith(prefix + '/')))),
        ...cloudDriveState.files.filter(x => prefix && (x.relativePath === prefix || x.relativePath.startsWith(prefix + '/')))
      ];
      for (const it of toDelete) {
        await cloudDeleteOne(it.id, it.type === 'cloud_folder');
      }
    } else {
      await cloudDeleteOne(id, false);
    }
    cloudHideOverlay();
    showMsg('删除成功', 'success');
    await cloudRefreshAndRender();
  } catch (err) {
    cloudHideOverlay();
    showMsg(err.message, 'error');
  }
}

async function cloudDeleteOne(id, isFolder) {
  if (!isFolder) {
    // 删除二进制资源（允许不存在）
    const item = [...cloudDriveState.files].find(x => x.id === id);
    if (item) {
      const resName = cloudBinaryResourceName(id, item.payload || {});
      try {
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        await fetch(`${API}/resources/${encodeURIComponent(resName)}`, { method: 'DELETE', headers });
      } catch (_) { /* 容错 */ }
    }
  }
  await api(`/items/${encodeURIComponent(id)}/soft-delete`, { method: 'POST' });
}

// 新建文件夹
async function cloudCreateFolderPrompt() {
  const name = prompt('请输入文件夹名称：');
  if (!name) return;
  const base = cloudDriveState.currentPath || '';
  const rel = base ? `${base}/${name}` : name;
  const id = cloudGenId();
  cloudShowOverlay('正在创建文件夹...');
  try {
    const payload = {
      name,
      parent_folder_id: cloudParentFolderId(base, false),
      relative_path: rel
    };
    await cloudPutItem(id, 'cloud_folder', payload);
    cloudHideOverlay();
    showMsg('创建成功', 'success');
    await cloudRefreshAndRender();
  } catch (err) {
    cloudHideOverlay();
    showMsg(err.message, 'error');
  }
}

// ========== 模态/遮罩辅助 ==========

function cloudModalOpen(title, bodyHtml, buttons) {
  cloudModalClose();
  const btns = (buttons || []).map((b, i) => {
    return `<button class="btn ${b.cls || 'btn-secondary'}" data-i="${i}">${escapeHtml(b.text)}</button>`;
  }).join('');
  const mask = document.createElement('div');
  mask.className = 'cd-modal-mask';
  mask.id = 'cdModalMask';
  mask.innerHTML = `
    <div class="cd-modal">
      <div class="cd-modal-header">
        <span>${escapeHtml(title)}</span>
        <button class="cd-modal-close" onclick="cloudModalClose()">×</button>
      </div>
      <div class="cd-modal-body">${bodyHtml}</div>
      ${btns ? `<div class="cd-modal-footer">${btns}</div>` : ''}
    </div>
  `;
  document.body.appendChild(mask);
  // 点击空白关闭
  mask.addEventListener('click', e => { if (e.target === mask) cloudModalClose(); });
  // 绑定按钮
  (buttons || []).forEach((b, i) => {
    const el = mask.querySelector(`.cd-modal-footer button[data-i="${i}"]`);
    if (el && b.onclick) el.setAttribute('onclick', b.onclick);
  });
}

function cloudModalClose() {
  const mask = document.getElementById('cdModalMask');
  if (mask) mask.remove();
}

function cloudShowOverlay(label) {
  cloudHideOverlay();
  const div = document.createElement('div');
  div.className = 'cd-overlay';
  div.id = 'cdOverlay';
  div.innerHTML = `<span style="display:inline-block;width:16px;height:16px;border:2px solid #667eea;border-top-color:transparent;border-radius:50%;animation:cdspin 0.8s linear infinite;"></span> ${escapeHtml(label || '处理中...')}`;
  document.body.appendChild(div);
}

function cloudHideOverlay() {
  const div = document.getElementById('cdOverlay');
  if (div) div.remove();
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// 查看指定类型的数据项
async function viewTypeItems(type) {
  const content = document.getElementById('pageContent');
  const title = document.getElementById('pageTitle');
  title.textContent = `${type} 数据`;
  content.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">加载中...</div>';
  
  try {
    await loadItems(content, type, type);
  } catch (err) {
    content.innerHTML = `<div style="color:#dc3545;padding:20px;">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

async function viewItem(id) {
  try {
    const item = await api(`/items/${encodeURIComponent(id)}`);
    const payload = parsePayload(item.payload);
    alert(JSON.stringify(payload, null, 2));
  } catch (err) {
    showMsg(err.message, 'error');
  }
}

async function deleteItem(id) {
  if (!confirm('确定删除此项？')) return;
  try {
    await api(`/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showMsg('删除成功', 'success');
    loadPage(currentPage);
  } catch (err) {
    showMsg(err.message, 'error');
  }
}


// 用户管理
async function loadUsers(el) {
  const data = await api('/admin/users');
  el.innerHTML = `
    <div class="card">
      <div class="card-header">用户列表</div>
      <div class="card-body" style="padding:0;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f8f9fa;">
              <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">用户名</th>
              <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">角色</th>
              <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">状态</th>
              <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">创建时间</th>
              <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">操作</th>
            </tr>
          </thead>
          <tbody id="usersBody"></tbody>
        </table>
      </div>
    </div>
  `;
  
  const tbody = document.getElementById('usersBody');
  data.users.forEach(u => {
    const userIdArg = escapeAttr(escapeJsString(u.id));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:12px;border-bottom:1px solid #e0e0e0;">${escapeHtml(u.username)}</td>
      <td style="padding:12px;border-bottom:1px solid #e0e0e0;">${u.role === 'admin' ? '管理员' : '用户'}</td>
      <td style="padding:12px;border-bottom:1px solid #e0e0e0;">
        <span style="padding:4px 8px;border-radius:4px;font-size:12px;background:${u.status === 'active' ? '#d4edda' : '#f8d7da'};color:${u.status === 'active' ? '#155724' : '#721c24'};">
          ${u.status === 'active' ? '正常' : '禁用'}
        </span>
      </td>
      <td style="padding:12px;border-bottom:1px solid #e0e0e0;font-size:13px;color:#666;">${formatTime(u.created_at)}</td>
      <td style="padding:12px;border-bottom:1px solid #e0e0e0;">
        ${u.id !== user.id ? `
          ${u.status === 'active' 
            ? `<button class="btn btn-sm btn-secondary" onclick="toggleUser('${userIdArg}', false)">禁用</button>`
            : `<button class="btn btn-sm btn-success" onclick="toggleUser('${userIdArg}', true)">启用</button>`}
          <button class="btn btn-sm btn-danger" onclick="deleteUser('${userIdArg}')">删除</button>
        ` : '<span style="color:#999;">当前用户</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function toggleUser(id, enable) {
  try {
    await api(`/admin/users/${encodeURIComponent(id)}/${enable ? 'enable' : 'disable'}`, { method: 'PUT' });
    showMsg(enable ? '已启用' : '已禁用', 'success');
    loadPage('users');
  } catch (err) { showMsg(err.message, 'error'); }
}

async function deleteUser(id) {
  if (!confirm('确定删除此用户？')) return;
  try {
    await api(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showMsg('删除成功', 'success');
    loadPage('users');
  } catch (err) { showMsg(err.message, 'error'); }
}


// 系统设置
async function loadSettings(el) {
  const data = await api('/admin/settings');
  const rateLimitConfig = await api('/admin/rate-limit/config');
  const blockedIPs = await api('/admin/rate-limit/blocked');
  
  el.innerHTML = `
    <div class="card">
      <div class="card-header">注册设置</div>
      <div class="card-body">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:#f8f9fa;border-radius:6px;">
          <div>
            <strong>开放用户注册</strong>
            <p style="font-size:13px;color:#666;margin-top:4px;">关闭后新用户无法自行注册</p>
          </div>
          <label style="position:relative;width:50px;height:26px;">
            <input type="checkbox" id="regToggle" ${data.settings.registrationEnabled ? 'checked' : ''} 
              onchange="toggleReg(this.checked)" style="opacity:0;width:0;height:0;">
            <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${data.settings.registrationEnabled ? '#667eea' : '#ccc'};border-radius:26px;transition:.3s;">
              <span style="position:absolute;content:'';height:20px;width:20px;left:3px;bottom:3px;background:white;border-radius:50%;transition:.3s;transform:${data.settings.registrationEnabled ? 'translateX(24px)' : 'none'};"></span>
            </span>
          </label>
        </div>
      </div>
    </div>
    
    <div class="card" style="margin-top:20px;">
      <div class="card-header">登录安全设置</div>
      <div class="card-body">
        <div style="display:grid;gap:16px;">
          <div style="display:flex;align-items:center;gap:16px;">
            <label style="min-width:150px;font-weight:500;">最大登录尝试次数</label>
            <input type="number" id="loginMaxAttempts" value="${rateLimitConfig.config.loginMaxAttempts}" 
              min="3" max="100" style="padding:8px;border:1px solid #ddd;border-radius:4px;width:80px;">
            <span style="color:#666;font-size:13px;">次/小时</span>
          </div>
          <div style="display:flex;align-items:center;gap:16px;">
            <label style="min-width:150px;font-weight:500;">锁定时长</label>
            <input type="number" id="blockDurationMinutes" value="${rateLimitConfig.config.blockDurationMinutes}" 
              min="1" max="1440" style="padding:8px;border:1px solid #ddd;border-radius:4px;width:80px;">
            <span style="color:#666;font-size:13px;">分钟</span>
          </div>
          <div>
            <button class="btn btn-primary" onclick="saveRateLimitConfig()">保存设置</button>
          </div>
        </div>
      </div>
    </div>
    
    <div class="card" style="margin-top:20px;">
      <div class="card-header">
        <span>登录锁定管理</span>
        ${blockedIPs.count > 0 ? `<button class="btn btn-sm btn-danger" onclick="clearAllBlocks()">清除所有锁定</button>` : ''}
      </div>
      <div class="card-body">
        ${blockedIPs.count === 0 ? '<p style="color:#666;">当前没有被锁定的 IP</p>' : `
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;">
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">IP 地址</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">尝试次数</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">解锁时间</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">操作</th>
              </tr>
            </thead>
            <tbody>
              ${blockedIPs.blockedIPs.map(b => {
                const ipArg = escapeAttr(escapeJsString(b.ip));
                return `
                <tr>
                  <td style="padding:12px;border-bottom:1px solid #e0e0e0;font-family:monospace;">${escapeHtml(b.ip)}</td>
                  <td style="padding:12px;border-bottom:1px solid #e0e0e0;">${b.count}</td>
                  <td style="padding:12px;border-bottom:1px solid #e0e0e0;font-size:13px;color:#666;">${formatTime(b.blockedUntil)}</td>
                  <td style="padding:12px;border-bottom:1px solid #e0e0e0;">
                    <button class="btn btn-sm btn-secondary" onclick="clearBlock('${ipArg}')">解除锁定</button>
                  </td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `;
}

async function saveRateLimitConfig() {
  try {
    const loginMaxAttempts = parseInt(document.getElementById('loginMaxAttempts').value, 10);
    const blockDurationMinutes = parseInt(document.getElementById('blockDurationMinutes').value, 10);
    await api('/admin/rate-limit/config', { 
      method: 'PUT', 
      body: JSON.stringify({ loginMaxAttempts, blockDurationMinutes }) 
    });
    showMsg('设置已保存', 'success');
  } catch (err) { showMsg(err.message, 'error'); }
}

async function clearBlock(ip) {
  try {
    await api(`/admin/rate-limit/blocked/${encodeURIComponent(ip)}`, { method: 'DELETE' });
    showMsg('已解除锁定', 'success');
    loadPage('settings');
  } catch (err) { showMsg(err.message, 'error'); }
}

async function clearAllBlocks() {
  if (!confirm('确定清除所有登录锁定？')) return;
  try {
    const result = await api('/admin/rate-limit/blocked', { method: 'DELETE' });
    showMsg(`已清除 ${result.clearedCount} 个锁定`, 'success');
    loadPage('settings');
  } catch (err) { showMsg(err.message, 'error'); }
}

async function toggleReg(enabled) {
  try {
    await api('/admin/settings/registration', { method: 'PUT', body: JSON.stringify({ enabled }) });
    showMsg(enabled ? '注册已开启' : '注册已关闭', 'success');
    loadPage('settings');
  } catch (err) { showMsg(err.message, 'error'); }
}

// 变更日志
async function loadLogs(el) {
  const data = await api('/changes?limit=200');
  
  // 统计各类型数量
  const typeCounts = Object.create(null);
  data.changes.forEach(c => {
    typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
  });
  
  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span>变更日志 (共 ${data.changes.length} 条)</span>
        <div style="display:flex;gap:10px;align-items:center;">
          <select id="typeFilter" onchange="filterLogs()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
            <option value="">全部类型</option>
            ${Object.entries(typeCounts).map(([type, count]) => 
              `<option value="${escapeAttr(type)}">${escapeHtml(type)} (${count})</option>`
            ).join('')}
          </select>
          <input type="text" id="searchLogs" placeholder="搜索ID..." onkeyup="filterLogs()" style="padding:6px;border:1px solid #ddd;border-radius:4px;width:150px;">
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        ${data.changes.length === 0 ? '<p style="padding:20px;color:#666;">暂无变更记录</p>' : `
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;">
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">ID</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">类型</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">数据项</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">时间</th>
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e0e0e0;">状态</th>
              </tr>
            </thead>
            <tbody id="logsBody">
              ${data.changes.map(c => {
                const changeItemId = String(c.item_id ?? '');
                return `
                <tr data-type="${escapeAttr(c.type)}" data-id="${escapeAttr(changeItemId)}">
                  <td style="padding:12px;border-bottom:1px solid #e0e0e0;">${escapeHtml(c.change_id)}</td>
                  <td style="padding:12px;border-bottom:1px solid #e0e0e0;"><span style="padding:2px 6px;background:#e0e0e0;border-radius:3px;font-size:12px;">${escapeHtml(c.type)}</span></td>
                  <td style="padding:12px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:12px;">${escapeHtml(changeItemId.substring(0, 8))}...</td>
                  <td style="padding:12px;border-bottom:1px solid #e0e0e0;font-size:13px;color:#666;">${formatTime(c.updated_time)}</td>
                  <td style="padding:12px;border-bottom:1px solid #e0e0e0;">${c.deleted_time ? '🗑️ 删除' : '✏️ 更新'}</td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
    <div style="margin-top:16px;padding:16px;background:#f8f9fa;border-radius:6px;">
      <strong>类型统计：</strong>
      ${Object.entries(typeCounts).map(([type, count]) => 
        `<span style="margin-left:12px;padding:4px 8px;background:#e0e0e0;border-radius:4px;">${escapeHtml(type)}: ${count}</span>`
      ).join('')}
    </div>
  `;
}

function filterLogs() {
  const typeFilter = document.getElementById('typeFilter').value;
  const searchText = document.getElementById('searchLogs').value.toLowerCase();
  const rows = document.querySelectorAll('#logsBody tr');
  
  rows.forEach(row => {
    const type = row.getAttribute('data-type');
    const id = (row.getAttribute('data-id') || '').toLowerCase();
    const typeMatch = !typeFilter || type === typeFilter;
    const searchMatch = !searchText || id.includes(searchText);
    row.style.display = (typeMatch && searchMatch) ? '' : 'none';
  });
}


// ========== 初始化 ==========

async function init() {
  try {
    const status = await api('/health/status');
    
    if (!status.initialized) {
      renderLogin(true, status);
      return;
    }
    
    if (!token) {
      renderLogin(false);
      return;
    }
    
    // 验证 token
    const profile = await api('/user/profile');
    user = profile.user;
    renderApp();
  } catch (err) {
    sessionStorage.removeItem('token');
    localStorage.removeItem('token');
    token = null;
    renderLogin(false);
  }
}

// 启动
init();
