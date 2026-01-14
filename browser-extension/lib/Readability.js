/**
 * Readability.js - 简化版
 * 基于 Mozilla Readability 的精简实现
 * 用于从网页中提取主要文章内容
 * 
 * 原始项目: https://github.com/mozilla/readability
 * License: Apache-2.0
 */

var Readability = function(doc, options) {
  this._doc = doc;
  this._options = options || {};
  this._articleTitle = null;
  this._articleByline = null;
  this._articleDir = null;
  this._articleSiteName = null;
  
  // 配置
  this._charThreshold = this._options.charThreshold || 500;
  this._classesToPreserve = this._options.classesToPreserve || [];
  
  // 不太可能是内容的元素
  this.UNLIKELY_CANDIDATES = /banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|foot|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|yom-hierarchical-nav|yom-hierarchical-nav-item/i;
  
  // 可能是内容的元素
  this.MAYBE_CANDIDATES = /and|article|body|column|main|shadow/i;
  
  // 正面指标
  this.POSITIVE = /article|body|content|entry|hentry|h-entry|main|page|pagination|post|text|blog|story/i;
  
  // 负面指标
  this.NEGATIVE = /hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|foot|footer|footnote|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|tool|widget/i;
};

Readability.prototype = {
  /**
   * 解析文档并返回文章内容
   */
  parse: function() {
    // 获取标题
    this._articleTitle = this._getArticleTitle();
    
    // 获取作者
    this._articleByline = this._getArticleByline();
    
    // 获取站点名称
    this._articleSiteName = this._getArticleSiteName();
    
    // 获取文章内容
    var articleContent = this._grabArticle();
    
    if (!articleContent) {
      return null;
    }
    
    // 清理内容
    this._postProcessContent(articleContent);
    
    // 获取摘要
    var excerpt = this._getExcerpt(articleContent);
    
    return {
      title: this._articleTitle,
      byline: this._articleByline,
      content: articleContent.innerHTML,
      textContent: articleContent.textContent,
      length: articleContent.textContent.length,
      excerpt: excerpt,
      siteName: this._articleSiteName,
    };
  },
  
  /**
   * 获取文章标题
   */
  _getArticleTitle: function() {
    var doc = this._doc;
    var curTitle = "";
    var origTitle = "";
    
    try {
      curTitle = origTitle = doc.title.trim();
      
      // 尝试从 meta 标签获取
      var metaTitle = doc.querySelector('meta[property="og:title"]');
      if (metaTitle) {
        curTitle = metaTitle.getAttribute("content");
      }
      
      // 尝试从 h1 获取
      if (!curTitle) {
        var h1 = doc.querySelector("h1");
        if (h1) {
          curTitle = h1.textContent.trim();
        }
      }
    } catch (e) {
      curTitle = origTitle;
    }
    
    return curTitle;
  },
  
  /**
   * 获取作者信息
   */
  _getArticleByline: function() {
    var doc = this._doc;
    
    // 尝试从 meta 标签获取
    var metaAuthor = doc.querySelector('meta[name="author"]');
    if (metaAuthor) {
      return metaAuthor.getAttribute("content");
    }
    
    // 尝试从常见的作者元素获取
    var authorSelectors = [
      '.author',
      '.byline',
      '[rel="author"]',
      '[itemprop="author"]',
    ];
    
    for (var i = 0; i < authorSelectors.length; i++) {
      var author = doc.querySelector(authorSelectors[i]);
      if (author) {
        return author.textContent.trim();
      }
    }
    
    return null;
  },
  
  /**
   * 获取站点名称
   */
  _getArticleSiteName: function() {
    var doc = this._doc;
    
    var metaSiteName = doc.querySelector('meta[property="og:site_name"]');
    if (metaSiteName) {
      return metaSiteName.getAttribute("content");
    }
    
    return null;
  },
  
  /**
   * 获取文章内容
   */
  _grabArticle: function() {
    var doc = this._doc;
    var page = doc.body;
    
    if (!page) {
      return null;
    }
    
    // 尝试使用语义化标签
    var article = doc.querySelector("article");
    if (article && article.textContent.length > this._charThreshold) {
      return article.cloneNode(true);
    }
    
    // 尝试使用 main 标签
    var main = doc.querySelector("main");
    if (main && main.textContent.length > this._charThreshold) {
      return main.cloneNode(true);
    }
    
    // 尝试使用常见的内容容器
    var contentSelectors = [
      '.post-content',
      '.article-content',
      '.entry-content',
      '.content',
      '#content',
      '.post',
      '.article',
    ];
    
    for (var i = 0; i < contentSelectors.length; i++) {
      var content = doc.querySelector(contentSelectors[i]);
      if (content && content.textContent.length > this._charThreshold) {
        return content.cloneNode(true);
      }
    }
    
    // 降级：使用评分算法
    return this._grabArticleByScoring();
  },
  
  /**
   * 使用评分算法获取文章内容
   */
  _grabArticleByScoring: function() {
    var doc = this._doc;
    var candidates = [];
    var elementsToScore = doc.querySelectorAll("p, td, pre");
    
    for (var i = 0; i < elementsToScore.length; i++) {
      var elem = elementsToScore[i];
      var parent = elem.parentNode;
      var grandParent = parent ? parent.parentNode : null;
      var innerText = elem.textContent.trim();
      
      if (innerText.length < 25) {
        continue;
      }
      
      // 初始化父元素分数
      if (!parent.readabilityScore) {
        parent.readabilityScore = this._initializeScore(parent);
        candidates.push(parent);
      }
      
      if (grandParent && !grandParent.readabilityScore) {
        grandParent.readabilityScore = this._initializeScore(grandParent);
        candidates.push(grandParent);
      }
      
      // 计算内容分数
      var contentScore = 1;
      contentScore += innerText.split(',').length;
      contentScore += Math.min(Math.floor(innerText.length / 100), 3);
      
      parent.readabilityScore += contentScore;
      if (grandParent) {
        grandParent.readabilityScore += contentScore / 2;
      }
    }
    
    // 找到最高分的候选元素
    var topCandidate = null;
    for (var j = 0; j < candidates.length; j++) {
      var candidate = candidates[j];
      var score = candidate.readabilityScore * (1 - this._getLinkDensity(candidate));
      candidate.readabilityScore = score;
      
      if (!topCandidate || score > topCandidate.readabilityScore) {
        topCandidate = candidate;
      }
    }
    
    if (topCandidate) {
      return topCandidate.cloneNode(true);
    }
    
    // 最后方案：返回 body
    return doc.body.cloneNode(true);
  },
  
  /**
   * 初始化元素分数
   */
  _initializeScore: function(elem) {
    var score = 0;
    var tagName = elem.tagName.toUpperCase();
    
    switch (tagName) {
      case "DIV":
        score += 5;
        break;
      case "PRE":
      case "TD":
      case "BLOCKQUOTE":
        score += 3;
        break;
      case "ADDRESS":
      case "OL":
      case "UL":
      case "DL":
      case "DD":
      case "DT":
      case "LI":
      case "FORM":
        score -= 3;
        break;
      case "H1":
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6":
      case "TH":
        score -= 5;
        break;
    }
    
    // 根据 class 和 id 调整分数
    var className = elem.className || "";
    var id = elem.id || "";
    
    if (this.POSITIVE.test(className + " " + id)) {
      score += 25;
    }
    if (this.NEGATIVE.test(className + " " + id)) {
      score -= 25;
    }
    
    return score;
  },
  
  /**
   * 计算链接密度
   */
  _getLinkDensity: function(elem) {
    var textLength = elem.textContent.length;
    if (textLength === 0) {
      return 0;
    }
    
    var linkLength = 0;
    var links = elem.querySelectorAll("a");
    for (var i = 0; i < links.length; i++) {
      linkLength += links[i].textContent.length;
    }
    
    return linkLength / textLength;
  },
  
  /**
   * 后处理内容
   */
  _postProcessContent: function(articleContent) {
    // 移除脚本和样式
    var scripts = articleContent.querySelectorAll("script, style, noscript");
    for (var i = scripts.length - 1; i >= 0; i--) {
      scripts[i].parentNode.removeChild(scripts[i]);
    }
    
    // 移除隐藏元素
    var hidden = articleContent.querySelectorAll("[hidden], [style*='display:none'], [style*='display: none']");
    for (var j = hidden.length - 1; j >= 0; j--) {
      hidden[j].parentNode.removeChild(hidden[j]);
    }
    
    // 清理属性
    var allElements = articleContent.querySelectorAll("*");
    for (var k = 0; k < allElements.length; k++) {
      var elem = allElements[k];
      // 保留 href 和 src
      var attrs = elem.attributes;
      for (var l = attrs.length - 1; l >= 0; l--) {
        var attrName = attrs[l].name;
        if (attrName !== "href" && attrName !== "src" && attrName !== "alt") {
          elem.removeAttribute(attrName);
        }
      }
    }
  },
  
  /**
   * 获取摘要
   */
  _getExcerpt: function(articleContent) {
    // 尝试从 meta 获取
    var metaDesc = this._doc.querySelector('meta[name="description"]');
    if (metaDesc) {
      return metaDesc.getAttribute("content");
    }
    
    var metaOgDesc = this._doc.querySelector('meta[property="og:description"]');
    if (metaOgDesc) {
      return metaOgDesc.getAttribute("content");
    }
    
    // 从内容中提取
    var firstP = articleContent.querySelector("p");
    if (firstP) {
      return firstP.textContent.substring(0, 200);
    }
    
    return articleContent.textContent.substring(0, 200);
  },
};

// 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = Readability;
}
