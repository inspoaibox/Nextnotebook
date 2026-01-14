/**
 * 暮城笔记 - 网页剪藏扩展 Background Service Worker
 */

const API_BASE = 'http://127.0.0.1:27183';

// 监听扩展图标点击（可选：直接剪藏而不打开 popup）
chrome.action.onClicked.addListener(async (tab) => {
  // 默认行为是打开 popup，这里可以添加快捷剪藏逻辑
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'contentScriptReady') {
    console.log('Content script ready on:', sender.tab?.url);
  }
  
  if (request.action === 'quickClip') {
    // 快速剪藏功能
    handleQuickClip(request.data).then(sendResponse);
    return true;
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
    
    const response = await fetch(`${API_BASE}/api/clip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    return await response.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
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
