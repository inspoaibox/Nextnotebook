/**
 * 暮城笔记 - 网页剪藏扩展 Popup 脚本
 */

const API_BASE = 'http://127.0.0.1:27183';

// DOM 元素 - 通用
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('status-text');
const messageEl = document.getElementById('message');
const tabs = document.querySelectorAll('.tab');
const noteForm = document.getElementById('note-form');
const bookmarkForm = document.getElementById('bookmark-form');

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

// 状态
let pageData = null;
let bookmarkData = null;
let isConnected = false;
let extractedImages = [];
let currentTab = 'note';

// 显示消息
function showMessage(text, type = 'success') {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.style.display = 'block';
  setTimeout(() => {
    messageEl.style.display = 'none';
  }, 3000);
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
    const response = await fetch(`${API_BASE}/api/folders`, {
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
    const response = await fetch(`${API_BASE}/api/bookmark-folders`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.ok) {
      const data = await response.json();
      const folders = data.folders || [];
      
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
      
      bookmarkFolderSelect.innerHTML = '<option value="">📁 根目录</option>' + buildOptions(null, 0);
    }
  } catch (e) {
    console.error('Failed to load bookmark folders:', e);
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
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

// 发送笔记剪藏请求
async function clipNote() {
  if (!pageData || !isConnected) return;
  
  noteBtn.disabled = true;
  noteBtn.innerHTML = '<span class="loading">保存中</span>';
  
  try {
    const markdownContent = htmlToMarkdown(pageData.content);
    const contentWithSource = `${markdownContent}\n\n---\n\n> 来源: [${pageData.title}](${pageData.url})`;
    const shouldDownloadImages = downloadImagesCheckbox.checked && extractedImages.length > 0;
    
    const response = await fetch(`${API_BASE}/api/clip`, {
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
    const response = await fetch(`${API_BASE}/api/bookmark`, {
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
      setTimeout(() => window.close(), 1500);
    } else {
      showMessage(result.error || '保存失败', 'error');
    }
  } catch (e) {
    console.error('Save bookmark failed:', e);
    showMessage('保存失败，请检查应用是否运行', 'error');
  } finally {
    bookmarkBtn.disabled = false;
    bookmarkBtn.textContent = '添加书签';
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
  
  updateButtonStates();
}

// 初始化
async function init() {
  // 检查连接
  const connected = await checkConnection();
  
  if (connected) {
    // 加载文件夹
    await Promise.all([loadNoteFolders(), loadBookmarkFolders()]);
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
  
  updateButtonStates();
}

// 事件监听
tabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

noteBtn.addEventListener('click', clipNote);
bookmarkBtn.addEventListener('click', saveBookmark);

// 启动
init();
