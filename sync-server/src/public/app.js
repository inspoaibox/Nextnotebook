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
    bookmarks: '书签管理', vault: '保险库', ai: 'AI 助手', resources: '资源文件',
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
