/**
 * 暮城笔记 - 网页剪藏扩展 Content Script
 * 
 * 此脚本注入到所有网页中，用于提取页面内容
 * Readability.js 库会在此脚本之前加载
 */

// 监听来自 popup 或 background 的消息
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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
    // 检测页面类型
    const pageType = detectPageType();
    
    // 针对不同页面类型使用不同策略
    if (pageType === 'shadow-dom') {
      // Shadow DOM 网站（如亚马逊帮助中心）
      const result = extractFromShadowDOMSite();
      if (result) return result;
    }
    
    // 针对特定平台的提取
    const platformResult = extractFromPlatform(pageType);
    if (platformResult) return platformResult;
    
    // 先尝试直接提取 Shadow DOM 内容（针对亚马逊等网站）
    const shadowContent = extractAllShadowDOMContent();
    if (shadowContent && shadowContent.length > 500) {
      // 创建一个临时文档用于 Readability
      const tempDoc = document.implementation.createHTMLDocument('temp');
      tempDoc.body.innerHTML = shadowContent;
      
      if (typeof Readability !== 'undefined') {
        const reader = new Readability(tempDoc);
        const article = reader.parse();
        
        if (article && article.content) {
          // 清理 Readability 提取的内容
          const tempContainer = document.createElement('div');
          tempContainer.innerHTML = article.content;
          const cleaned = cleanContent(tempContainer);
          
          return {
            success: true,
            title: article.title || document.title,
            content: cleaned.innerHTML,
            url: window.location.href,
            excerpt: article.excerpt || '',
            byline: article.byline || '',
            siteName: article.siteName || '',
          };
        }
      }
      
      // 如果 Readability 失败，直接返回提取的内容
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = shadowContent;
      const cleaned = cleanContent(tempContainer);
      
      return {
        success: true,
        title: document.title,
        content: cleaned.innerHTML,
        url: window.location.href,
        excerpt: tempDoc.body.textContent?.substring(0, 200) || '',
      };
    }
    
    // 优先使用 Readability 提取文章内容
    if (typeof Readability !== 'undefined') {
      const documentClone = document.cloneNode(true);
      const reader = new Readability(documentClone);
      const article = reader.parse();
      
      if (article && article.content) {
        // 清理 Readability 提取的内容
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = article.content;
        const cleaned = cleanContent(tempContainer);
        
        return {
          success: true,
          title: article.title || document.title,
          content: cleaned.innerHTML,
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
    
    // 最后方案：获取整个 body（但要清理）
    const bodyClone = document.body.cloneNode(true);
    const cleaned = cleanContent(bodyClone);
    
    return {
      success: true,
      title: document.title,
      content: cleaned.innerHTML,
      url: window.location.href,
      excerpt: cleaned.textContent?.substring(0, 200) || '',
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
 * 检测页面类型
 */
function detectPageType() {
  const html = document.documentElement.outerHTML;
  const bodyClass = document.body?.className || '';
  const bodyId = document.body?.id || '';
  
  // 检测 CMS 和开源程序
  // WordPress
  if (html.includes('wp-content') || html.includes('wordpress') || 
      bodyClass.includes('wordpress') || document.querySelector('meta[name="generator"][content*="WordPress"]')) {
    return 'wordpress';
  }
  
  // Typecho
  if (html.includes('typecho') || bodyClass.includes('typecho') ||
      document.querySelector('meta[name="generator"][content*="Typecho"]')) {
    return 'typecho';
  }
  
  // Hexo
  if (html.includes('hexo') || document.querySelector('meta[name="generator"][content*="Hexo"]')) {
    return 'hexo';
  }
  
  // Ghost
  if (bodyClass.includes('ghost') || document.querySelector('meta[name="generator"][content*="Ghost"]')) {
    return 'ghost';
  }
  
  // Jekyll
  if (document.querySelector('meta[name="generator"][content*="Jekyll"]')) {
    return 'jekyll';
  }
  
  // Hugo
  if (document.querySelector('meta[name="generator"][content*="Hugo"]')) {
    return 'hugo';
  }
  
  // Drupal
  if (html.includes('drupal') || bodyClass.includes('drupal') ||
      document.querySelector('meta[name="generator"][content*="Drupal"]')) {
    return 'drupal';
  }
  
  // Joomla
  if (html.includes('joomla') || document.querySelector('meta[name="generator"][content*="Joomla"]')) {
    return 'joomla';
  }
  
  // 检测论坛系统
  // Discourse
  if (bodyClass.includes('discourse') || document.querySelector('meta[name="discourse"]') ||
      document.querySelector('[data-discourse]')) {
    return 'discourse';
  }
  
  // Discuz
  if (html.includes('discuz') || bodyClass.includes('discuz') || 
      document.getElementById('discuz_tips')) {
    return 'discuz';
  }
  
  // phpBB
  if (bodyClass.includes('phpbb') || document.querySelector('meta[name="generator"][content*="phpBB"]')) {
    return 'phpbb';
  }
  
  // vBulletin
  if (html.includes('vbulletin') || bodyClass.includes('vbulletin')) {
    return 'vbulletin';
  }
  
  // XenForo
  if (html.includes('xenforo') || bodyClass.includes('xenforo')) {
    return 'xenforo';
  }
  
  // Flarum
  if (bodyId === 'flarum-loading' || document.querySelector('[data-flarum]')) {
    return 'flarum';
  }
  
  // 知乎
  if (window.location.hostname.includes('zhihu.com')) {
    return 'zhihu';
  }
  
  // 简书
  if (window.location.hostname.includes('jianshu.com')) {
    return 'jianshu';
  }
  
  // CSDN
  if (window.location.hostname.includes('csdn.net')) {
    return 'csdn';
  }
  
  // 掘金
  if (window.location.hostname.includes('juejin.cn') || window.location.hostname.includes('juejin.im')) {
    return 'juejin';
  }
  
  // 博客园
  if (window.location.hostname.includes('cnblogs.com')) {
    return 'cnblogs';
  }
  
  // SegmentFault
  if (window.location.hostname.includes('segmentfault.com')) {
    return 'segmentfault';
  }
  
  // Medium
  if (window.location.hostname.includes('medium.com') || bodyClass.includes('medium')) {
    return 'medium';
  }
  
  // Dev.to
  if (window.location.hostname.includes('dev.to')) {
    return 'devto';
  }
  
  // 检查是否有 Shadow DOM
  const hasShadowDOM = document.querySelectorAll('*').length > 0 && 
    Array.from(document.querySelectorAll('*')).some(el => el.shadowRoot);
  
  if (hasShadowDOM) {
    return 'shadow-dom';
  }
  
  // 检查是否是单页应用
  const isSPA = document.querySelector('[id*="app"], [id*="root"], [class*="app"]') !== null;
  if (isSPA) {
    return 'spa';
  }
  
  // 检查是否是博客
  const isBlog = document.querySelector('article, .post, .entry, .blog-post') !== null;
  if (isBlog) {
    return 'blog';
  }
  
  return 'default';
}

/**
 * 从 Shadow DOM 网站提取内容
 */
function extractFromShadowDOMSite() {
  const shadowContent = extractAllShadowDOMContent();
  if (!shadowContent || shadowContent.length < 100) {
    return null;
  }
  
  const tempDoc = document.implementation.createHTMLDocument('temp');
  tempDoc.body.innerHTML = shadowContent;
  
  // 使用智能识别找到主要内容
  const tempBody = tempDoc.body;
  const candidates = [];
  
  tempBody.querySelectorAll('div, section, article').forEach(el => {
    const score = scoreElement(el);
    if (score > 50) {
      candidates.push({ element: el, score });
    }
  });
  
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    const cleaned = cleanContent(candidates[0].element);
    
    return {
      success: true,
      title: document.title,
      content: cleaned.innerHTML,
      url: window.location.href,
      excerpt: cleaned.textContent?.substring(0, 200) || '',
    };
  }
  
  return null;
}

/**
 * 从特定平台提取内容
 */
function extractFromPlatform(platform) {
  const extractors = {
    // WordPress
    wordpress: () => {
      const selectors = [
        '.entry-content', '.post-content', '.article-content',
        'article .content', '.wp-block-post-content',
        '.post-body', '.entry-body'
      ];
      return extractBySelectors(selectors);
    },
    
    // Typecho
    typecho: () => {
      const selectors = ['.post-content', '.entry-content', 'article .content'];
      return extractBySelectors(selectors);
    },
    
    // Hexo
    hexo: () => {
      const selectors = ['.post-body', '.article-entry', '.post-content'];
      return extractBySelectors(selectors);
    },
    
    // Ghost
    ghost: () => {
      const selectors = ['.post-content', '.gh-content', 'article .content'];
      return extractBySelectors(selectors);
    },
    
    // Discourse (论坛)
    discourse: () => {
      const selectors = ['.post-stream', '.topic-body', '.cooked'];
      return extractBySelectors(selectors);
    },
    
    // Discuz (论坛)
    discuz: () => {
      const selectors = [
        '.t_fsz', '.pcb', '.pct', 
        '#postlist .t_f', '.plhin'
      ];
      return extractBySelectors(selectors);
    },
    
    // 知乎
    zhihu: () => {
      const selectors = [
        '.Post-RichTextContainer', '.RichContent-inner',
        '.AnswerItem .RichContent', '.QuestionAnswer-content',
        'article .RichText'
      ];
      return extractBySelectors(selectors);
    },
    
    // 简书
    jianshu: () => {
      const selectors = ['.article', 'article', '.show-content'];
      return extractBySelectors(selectors);
    },
    
    // CSDN
    csdn: () => {
      const selectors = [
        '#article_content', '.article_content',
        '#content_views', '.markdown_views'
      ];
      return extractBySelectors(selectors);
    },
    
    // 掘金
    juejin: () => {
      const selectors = [
        '.article-content', '.markdown-body',
        'article .content'
      ];
      return extractBySelectors(selectors);
    },
    
    // 博客园
    cnblogs: () => {
      const selectors = [
        '#cnblogs_post_body', '.postBody',
        '#post_detail .post'
      ];
      return extractBySelectors(selectors);
    },
    
    // SegmentFault
    segmentfault: () => {
      const selectors = [
        '.article__content', '.article-content',
        'article .content'
      ];
      return extractBySelectors(selectors);
    },
    
    // Medium
    medium: () => {
      const selectors = [
        'article section', '.postArticle-content',
        'article .section-content'
      ];
      return extractBySelectors(selectors);
    },
    
    // Dev.to
    devto: () => {
      const selectors = [
        '#article-body', '.crayons-article__body',
        'article .body'
      ];
      return extractBySelectors(selectors);
    },
  };
  
  const extractor = extractors[platform];
  if (extractor) {
    return extractor();
  }
  
  return null;
}

/**
 * 通过选择器列表提取内容
 */
function extractBySelectors(selectors) {
  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element && element.textContent && element.textContent.trim().length > 100) {
        const cleaned = cleanContent(element);
        return {
          success: true,
          title: document.title,
          content: cleaned.innerHTML,
          url: window.location.href,
          excerpt: cleaned.textContent?.substring(0, 200) || '',
        };
      }
    } catch (e) {
      // 忽略无效选择器
      continue;
    }
  }
  return null;
}

/**
 * 提取所有 Shadow DOM 的内容
 * 返回合并后的 HTML 字符串
 */
function extractAllShadowDOMContent() {
  const contentParts = [];
  
  // 递归遍历所有元素
  function traverseAndExtract(root) {
    const elements = root.querySelectorAll('*');
    
    for (const element of elements) {
      if (element.shadowRoot) {
        // 提取 Shadow DOM 的 HTML
        const shadowHTML = element.shadowRoot.innerHTML;
        if (shadowHTML && shadowHTML.trim()) {
          contentParts.push(shadowHTML);
        }
        
        // 递归处理嵌套的 Shadow DOM
        traverseAndExtract(element.shadowRoot);
      }
    }
  }
  
  // 从主文档开始遍历
  traverseAndExtract(document);
  
  return contentParts.join('\n');
}

/**
 * 智能识别文章内容区域
 * 使用多种启发式方法评分，找到最可能的内容区域
 */
function findArticleContent() {
  const candidates = [];
  
  // 1. 首先尝试语义化标签
  const semanticSelectors = ['article', 'main', '[role="main"]', '[role="article"]'];
  for (const selector of semanticSelectors) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      if (el.textContent && el.textContent.trim().length > 200) {
        candidates.push({ element: el, score: 100, source: 'semantic' });
      }
    });
  }
  
  // 2. 如果没找到，尝试常见的内容类名
  if (candidates.length === 0) {
    const contentSelectors = [
      // 通用
      '.post-content', '.article-content', '.entry-content', '.content-body',
      '.article-body', '.post-body', '.entry-body', '.main-content',
      '#content', '#main-content', '#article-content', '#post-content',
      '.article', '.post', '.entry', '.blog-post',
      
      // WordPress
      '.entry-content', '.wp-block-post-content', '.post-entry',
      
      // Typecho
      '.post-content', '.entry-content',
      
      // Hexo
      '.post-body', '.article-entry',
      
      // Ghost
      '.post-content', '.gh-content',
      
      // Discourse
      '.post-stream', '.topic-body', '.cooked',
      
      // Discuz
      '.t_fsz', '.pcb', '.pct',
      
      // 知乎
      '.Post-RichTextContainer', '.RichContent-inner',
      
      // 简书
      '.show-content',
      
      // CSDN
      '#article_content', '#content_views', '.markdown_views',
      
      // 掘金
      '.markdown-body',
      
      // 博客园
      '#cnblogs_post_body', '.postBody',
      
      // Medium
      '.postArticle-content',
      
      // 帮助中心
      '#help-content', '.help-content',
    ];
    
    for (const selector of contentSelectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (el.textContent && el.textContent.trim().length > 200) {
          candidates.push({ element: el, score: 80, source: 'class' });
        }
      });
    }
  }
  
  // 3. 如果还是没找到，使用启发式算法评分所有元素
  if (candidates.length === 0) {
    const allElements = document.querySelectorAll('div, section, article');
    allElements.forEach(el => {
      const score = scoreElement(el);
      if (score > 50) {
        candidates.push({ element: el, score, source: 'heuristic' });
      }
    });
  }
  
  // 4. 尝试从 Shadow DOM 中查找
  if (candidates.length === 0) {
    const shadowContent = findContentInShadowDOM();
    if (shadowContent) {
      return shadowContent;
    }
  }
  
  // 按分数排序，返回最高分的元素
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    // 清理内容后返回
    return cleanContent(candidates[0].element);
  }
  
  return null;
}

/**
 * 对元素进行评分，判断是否为主要内容
 */
function scoreElement(element) {
  let score = 0;
  const text = element.textContent || '';
  const textLength = text.trim().length;
  
  // 文本长度评分（主要内容通常有足够的文本）
  if (textLength > 500) score += 30;
  else if (textLength > 200) score += 20;
  else if (textLength > 100) score += 10;
  else return 0; // 文本太短，直接返回
  
  // 段落数量评分（文章通常有多个段落）
  const paragraphs = element.querySelectorAll('p');
  score += Math.min(paragraphs.length * 5, 30);
  
  // 链接密度评分（内容区域链接密度较低）
  const links = element.querySelectorAll('a');
  const linkText = Array.from(links).reduce((sum, link) => sum + (link.textContent?.length || 0), 0);
  const linkDensity = textLength > 0 ? linkText / textLength : 0;
  if (linkDensity < 0.2) score += 20;
  else if (linkDensity < 0.4) score += 10;
  else score -= 20; // 链接密度太高，可能是导航或侧边栏
  
  // 标题评分（文章通常有标题）
  const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (headings.length > 0) score += 15;
  
  // 列表评分（文章可能包含列表）
  const lists = element.querySelectorAll('ul, ol');
  score += Math.min(lists.length * 3, 10);
  
  // 代码块评分（技术文章可能包含代码）
  const codeBlocks = element.querySelectorAll('pre, code');
  if (codeBlocks.length > 0) score += 10;
  
  // 负面评分：导航、侧边栏、页脚、评论、分享等
  const className = element.className || '';
  const id = element.id || '';
  const negativePatterns = [
    'nav', 'sidebar', 'footer', 'header', 'menu', 'widget',
    'comment', 'ad', 'advertisement', 'promo', 'related', 'share',
    'social', 'author', 'meta', 'breadcrumb', 'pagination',
    'toolbar', 'tags', 'category', 'avatar'
  ];
  
  for (const pattern of negativePatterns) {
    if (className.toLowerCase().includes(pattern) || id.toLowerCase().includes(pattern)) {
      score -= 30;
      break;
    }
  }
  
  // 正面评分：内容相关的类名和ID
  const positivePatterns = [
    'content', 'article', 'post', 'entry', 'main', 'body', 'text',
    'wp-posts-content' // WordPress 文章内容
  ];
  
  for (const pattern of positivePatterns) {
    if (className.toLowerCase().includes(pattern) || id.toLowerCase().includes(pattern)) {
      score += 25;
      break;
    }
  }
  
  return score;
}

/**
 * 清理提取的内容，移除无关元素
 */
function cleanContent(element) {
  if (!element) return element;
  
  // 克隆元素以避免修改原始 DOM
  const cleaned = element.cloneNode(true);
  
  // 要移除的选择器
  const removeSelectors = [
    // 导航和菜单
    'nav', 'header', 'footer', '.navigation', '.menu', '#menu',
    // 侧边栏和小工具
    'aside', '.sidebar', '.widget', '#sidebar',
    // 评论
    '.comments', '#comments', '.comment-list', '.comment-form',
    // 分享按钮
    '.share', '.social-share', '.share-buttons', '.social-buttons',
    '[class*="share"]', '[id*="share"]',
    // 广告
    '.ad', '.ads', '.advertisement', '[class*="advert"]',
    // 相关文章
    '.related', '.related-posts', '.more-posts',
    // 作者信息（通常在文章外）
    '.author-box', '.author-info', '.author-bio', '[class*="author"]',
    // 面包屑导航
    '.breadcrumb', '.breadcrumbs', '[class*="breadcrumb"]',
    // 标签和分类（通常在文章外）
    '.post-tags', '.post-categories', '.tags', '.categories',
    '[class*="tag"]', '[class*="categor"]',
    // 工具栏和按钮
    '.toolbar', '.enlighter-toolbar', '.code-toolbar',
    // 其他无关元素
    '.pagination', '.pager', 'script', 'style', 'iframe', 'noscript',
    // WordPress 特定
    '.wp-block-buttons', '.sharedaddy', '.jp-relatedposts',
    // 版权和页脚信息
    '.copyright', '.footer-info', '[class*="copyright"]',
    // 点赞、收藏等互动按钮
    '.like', '.favorite', '.bookmark', '[class*="like"]',
  ];
  
  removeSelectors.forEach(selector => {
    try {
      const elements = cleaned.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    } catch (e) {
      // 忽略无效选择器
    }
  });
  
  // 移除包含特定文本的元素（如版权声明）
  const textPatternsToRemove = [
    /^©\s*版权声明/i,
    /^THE\s+END$/i,
    /^喜欢就支持一下吧/i,
    /^点赞\d+$/i,
  ];
  
  const allTextElements = cleaned.querySelectorAll('p, div, span');
  allTextElements.forEach(el => {
    const text = el.textContent?.trim() || '';
    for (const pattern of textPatternsToRemove) {
      if (pattern.test(text) && text.length < 50) {
        el.remove();
        break;
      }
    }
  });
  
  // 移除重复的代码块（保留第一个）
  const codeBlocks = cleaned.querySelectorAll('pre');
  const seenCode = new Set();
  codeBlocks.forEach(pre => {
    const code = pre.textContent?.trim();
    if (code && seenCode.has(code)) {
      pre.remove();
    } else if (code) {
      seenCode.add(code);
    }
  });
  
  // 清理代码块内的工具栏元素
  cleaned.querySelectorAll('pre').forEach(pre => {
    // 移除代码高亮工具栏
    pre.querySelectorAll('.enlighter-toolbar, .code-toolbar, [class*="toolbar"]').forEach(el => el.remove());
    // 移除按钮
    pre.querySelectorAll('button, .btn, [class*="button"]').forEach(el => el.remove());
  });
  
  // 移除空元素（但保留媒体元素）
  const allElements = cleaned.querySelectorAll('*');
  allElements.forEach(el => {
    const hasText = el.textContent?.trim();
    const hasMedia = el.querySelector('img, video, audio, iframe, svg, canvas');
    const isMedia = ['IMG', 'VIDEO', 'AUDIO', 'IFRAME', 'SVG', 'CANVAS'].includes(el.tagName);
    
    if (!hasText && !hasMedia && !isMedia) {
      el.remove();
    }
  });
  
  // 移除过多的空行
  let html = cleaned.innerHTML;
  html = html.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>'); // 最多保留两个连续的 br
  html = html.replace(/(<p>\s*<\/p>\s*){2,}/gi, ''); // 移除连续的空段落
  cleaned.innerHTML = html;
  
  return cleaned;
}

/**
 * 在 Shadow DOM 中查找内容
 */
function findContentInShadowDOM() {
  const elementsWithShadow = document.querySelectorAll('*');
  let bestCandidate = null;
  let bestScore = 0;
  
  for (const element of elementsWithShadow) {
    if (element.shadowRoot) {
      // 在 Shadow DOM 中查找内容
      const shadowElements = element.shadowRoot.querySelectorAll('*');
      
      for (const shadowEl of shadowElements) {
        const score = scoreElement(shadowEl);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = shadowEl;
        }
      }
      
      // 递归查找嵌套的 Shadow DOM
      const nestedContent = findContentInNestedShadowDOM(element.shadowRoot);
      if (nestedContent && nestedContent.score > bestScore) {
        bestScore = nestedContent.score;
        bestCandidate = nestedContent.element;
      }
    }
  }
  
  if (bestCandidate && bestScore > 50) {
    const container = document.createElement('div');
    container.innerHTML = bestCandidate.innerHTML;
    return cleanContent(container);
  }
  
  return null;
}

/**
 * 在嵌套的 Shadow DOM 中查找内容
 */
function findContentInNestedShadowDOM(shadowRoot) {
  const elementsWithShadow = shadowRoot.querySelectorAll('*');
  let bestCandidate = null;
  let bestScore = 0;
  
  for (const element of elementsWithShadow) {
    if (element.shadowRoot) {
      const shadowElements = element.shadowRoot.querySelectorAll('*');
      
      for (const shadowEl of shadowElements) {
        const score = scoreElement(shadowEl);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = shadowEl;
        }
      }
      
      // 继续递归
      const nestedContent = findContentInNestedShadowDOM(element.shadowRoot);
      if (nestedContent && nestedContent.score > bestScore) {
        bestScore = nestedContent.score;
        bestCandidate = nestedContent.element;
      }
    }
  }
  
  return bestCandidate ? { element: bestCandidate, score: bestScore } : null;
}

/**
 * 查找页面主要内容区域
 */
function findMainContent() {
  // 使用智能识别算法
  const articleContent = findArticleContent();
  if (articleContent) {
    return articleContent;
  }
  
  // 如果智能识别失败，尝试从所有 Shadow DOM 中提取
  const shadowHTML = extractAllShadowDOMContent();
  if (shadowHTML && shadowHTML.length > 100) {
    const container = document.createElement('div');
    container.innerHTML = shadowHTML;
    return container;
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
