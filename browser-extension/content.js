/**
 * 暮城笔记 - 网页剪藏扩展 Content Script
 * 
 * 此脚本注入到所有网页中，用于提取页面内容
 * Readability.js 库会在此脚本之前加载
 */

// 监听来自 popup 或 background 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageContent') {
    const content = extractPageContent();
    sendResponse(content);
  }
  return true;
});

/**
 * 提取页面内容
 */
function extractPageContent() {
  try {
    // 优先使用 Readability 提取文章内容
    if (typeof Readability !== 'undefined') {
      const documentClone = document.cloneNode(true);
      const reader = new Readability(documentClone);
      const article = reader.parse();
      
      if (article && article.content) {
        return {
          success: true,
          title: article.title || document.title,
          content: article.content,
          url: window.location.href,
          excerpt: article.excerpt || '',
          byline: article.byline || '',
          siteName: article.siteName || '',
        };
      }
    }
    
    // 检查是否有选中的文本
    const selection = window.getSelection().toString().trim();
    if (selection) {
      return {
        success: true,
        title: document.title,
        content: `<div class="selected-content"><p>${escapeHtml(selection)}</p></div>`,
        url: window.location.href,
        excerpt: selection.substring(0, 200),
        isSelection: true,
      };
    }
    
    // 降级方案：尝试获取主要内容区域
    const mainContent = findMainContent();
    if (mainContent) {
      return {
        success: true,
        title: document.title,
        content: mainContent.innerHTML,
        url: window.location.href,
        excerpt: mainContent.textContent?.substring(0, 200) || '',
      };
    }
    
    // 最后方案：获取整个 body
    return {
      success: true,
      title: document.title,
      content: document.body.innerHTML,
      url: window.location.href,
      excerpt: document.body.textContent?.substring(0, 200) || '',
    };
    
  } catch (error) {
    console.error('Failed to extract page content:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 查找页面主要内容区域
 */
function findMainContent() {
  // 常见的内容容器选择器
  const selectors = [
    'article',
    'main',
    '[role="main"]',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '.post',
    '.article',
    '#content',
    '#main',
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent && element.textContent.trim().length > 100) {
      return element;
    }
  }
  
  return null;
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 通知 background script 内容脚本已加载
chrome.runtime.sendMessage({ action: 'contentScriptReady' });
