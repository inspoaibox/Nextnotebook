import React, { useState, useEffect } from 'react';
import {
  Layout, Input, Button, Empty, Modal, message, Tooltip,
  Space, Divider, Popconfirm, Select, Segmented
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, LinkOutlined,
  FolderOutlined, FolderAddOutlined, GlobalOutlined, SearchOutlined,
  AppstoreOutlined, RightOutlined, DownOutlined, UnorderedListOutlined, TableOutlined, CopyOutlined,
} from '@ant-design/icons';
import { useBookmarks, useBookmarkFolders, Bookmark } from '../hooks/useBookmarks';

const { Sider, Content } = Layout;
const { TextArea } = Input;

// 获取网站图标
const getFavicon = (url: string) => {
  try {
    if (!url) return null;
    const { hostname, protocol } = new URL(url);
    // 优先用网站自己的 favicon.ico，比 Google API 更可靠
    return `${protocol}//${hostname}/favicon.ico`;
  } catch {
    return null;
  }
};

// 基于字符串生成稳定的哈希色（同一域名永远同一颜色）
const getHashColor = (str: string): { bg: string; text: string } => {
  const PALETTES = [
    { bg: '#4f86f7', text: '#fff' },
    { bg: '#f7664f', text: '#fff' },
    { bg: '#4fc98a', text: '#fff' },
    { bg: '#f7c44f', text: '#fff' },
    { bg: '#a04ff7', text: '#fff' },
    { bg: '#f74fa0', text: '#fff' },
    { bg: '#4fc9f7', text: '#fff' },
    { bg: '#f7874f', text: '#fff' },
    { bg: '#4ff7c4', text: '#333' },
    { bg: '#7f4ff7', text: '#fff' },
    { bg: '#f74f4f', text: '#fff' },
    { bg: '#4f4ff7', text: '#fff' },
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTES[Math.abs(hash) % PALETTES.length];
};

// 获取显示文字（中文取第一个字，英文取前两个字母大写）
const getInitial = (name: string): string => {
  if (!name) return '?';
  const first = name.trim()[0];
  // 中文字符
  if (/[\u4e00-\u9fa5]/.test(first)) return first;
  // 英文：取前两个字母
  const letters = name.replace(/[^a-zA-Z]/g, '');
  return letters.slice(0, 2).toUpperCase() || first.toUpperCase();
};

// 文字头像组件（favicon 加载失败时的兜底）
const TextAvatar: React.FC<{ name: string; domain: string; size: number }> = ({ name, domain, size }) => {
  const { bg, text } = getHashColor(domain || name);
  const initial = getInitial(name);
  const fontSize = initial.length > 1 ? size * 0.38 : size * 0.46;
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: size * 0.25,
      background: bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: text,
      fontSize,
      fontWeight: 700,
      letterSpacing: initial.length > 1 ? '-0.5px' : 0,
      userSelect: 'none',
      flexShrink: 0,
    }}>
      {initial}
    </div>
  );
};

// 渲染自定义图标（支持 URL、base64、SVG 代码）
const renderCustomIcon = (icon: string | null | undefined, fallbackUrl: string, name: string = '', size: number = 28) => {
  const domain = getDomain(fallbackUrl);

  if (!icon) {
    const favicon = getFavicon(fallbackUrl);
    if (!favicon) return <TextAvatar name={name} domain={domain} size={size} />;
    return (
      <FaviconWithFallback src={favicon} name={name} domain={domain} size={size} />
    );
  }

  const trimmed = icon.trim();

  if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml')) {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        dangerouslySetInnerHTML={{ __html: trimmed.replace(/width="[^"]*"/, `width="${size}"`).replace(/height="[^"]*"/, `height="${size}"`) }}
      />
    );
  }

  if (trimmed.startsWith('data:image')) {
    return (
      <img src={trimmed} alt="" style={{ width: size, height: size, objectFit: 'contain' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }

  return (
    <img src={trimmed} alt="" style={{ width: size, height: size, objectFit: 'contain' }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
};

// Favicon 加载失败时自动降级为文字头像
// Google Favicon API 即使域名无效也会返回默认图标（不触发onError）
// 通过检测图片 naturalWidth <= 16 来判断是否是无效的默认图标
const FaviconWithFallback: React.FC<{ src: string; name: string; domain: string; size: number }> = ({ src, name, domain, size }) => {
  const [failed, setFailed] = React.useState(false);
  if (failed) return <TextAvatar name={name} domain={domain} size={size} />;
  return (
    <img
      src={src}
      alt=""
      style={{ width: size, height: size, objectFit: 'contain' }}
      onError={() => setFailed(true)}
      onLoad={(e) => {
        const img = e.target as HTMLImageElement;
        // Google 返回默认地球图标时 naturalWidth === 16（低分辨率默认图）
        if (img.naturalWidth <= 16 && img.naturalHeight <= 16) {
          setFailed(true);
        }
      }}
    />
  );
};

// 安全获取域名
const getDomain = (url: string) => {
  try {
    if (!url) return '';
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

// 规范化 URL，自动添加 https:// 前缀
const normalizeUrl = (url: string): string => {
  if (!url) return url;
  const trimmed = url.trim();
  // 如果已经有协议前缀，直接返回
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  // 否则添加 https://
  return `https://${trimmed}`;
};

// 使用系统默认浏览器打开链接
const openInBrowser = async (url: string) => {
  const api = (window as any).electronAPI;
  if (api?.openExternal) {
    await api.openExternal(normalizeUrl(url));
  }
};

// 注入样式
const styles = `
  .nav-site-container {
    background: #f7f8fa !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }
  
  .nav-sider {
    background: linear-gradient(180deg, #fafbfd 0%, #f3f5f9 100%) !important;
    border-right: 1px solid #e7ecf4 !important;
    box-shadow: inset -1px 0 0 rgba(255,255,255,0.8) !important;
    backdrop-filter: blur(10px) !important;
  }

  .nav-sidebar-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 8px 6px 10px;
  }

  .nav-sidebar-header {
    margin: 0 4px 6px;
    padding: 6px 8px;
    border-radius: 0;
    background: transparent;
    border: 0;
    box-shadow: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .nav-sidebar-header--collapsed {
    padding: 10px 0;
    display: flex;
    justify-content: center;
  }

  .nav-sidebar-header-mark {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: linear-gradient(135deg, #1677ff 0%, #36cfc9 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .nav-sidebar-title {
    font-size: 13px;
    font-weight: 700;
    color: #1c2740;
    letter-spacing: -0.2px;
    line-height: 1.1;
    white-space: nowrap;
  }

  .nav-sidebar-subtitle {
    display: none;
  }

  .nav-sidebar-scroll {
    flex: 1;
    overflow: auto;
    padding: 0 0 8px;
  }

  .nav-sidebar-panel {
    margin: 0 4px 8px;
    padding: 2px 0 4px;
    border-radius: 0;
    background: transparent;
    border: 0;
    box-shadow: none;
  }

  .nav-sidebar-section {
    margin-bottom: 14px;
  }

  .nav-sidebar-section-label {
    padding: 6px 14px 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    gap: 8px;
  }

  .nav-sidebar-section-label span {
    font-size: 10px;
    color: #93a0b5;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    flex-shrink: 0;
  }

  .nav-sidebar-section-label::after {
    content: '';
    height: 1px;
    flex: 1;
    background: linear-gradient(90deg, rgba(147,160,181,0.2) 0%, rgba(147,160,181,0.04) 100%);
  }

  .nav-sidebar-add-btn {
    color: #9aa7bc !important;
    width: 22px !important;
    height: 22px !important;
    border-radius: 999px !important;
  }

  .nav-sidebar-add-btn:hover {
    background: rgba(37,99,235,0.08) !important;
    color: #2563eb !important;
  }

  /* 顶部固定项（全部/未分类） */
  .nav-folder-item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 2px 8px;
    padding: 7px 8px;
    border-radius: 8px;
    border: 1px solid transparent;
    color: #5c6780;
    white-space: nowrap;
    overflow: hidden;
    font-size: 13px;
    transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
  }
  
  .nav-folder-item:hover {
    background: rgba(22,119,255,0.06);
    border-color: transparent;
    color: #14213d;
    transform: none;
  }
  
  .nav-folder-item.selected {
    background: rgba(22,119,255,0.1);
    border-color: transparent;
    color: #1d4ed8;
    box-shadow: none;
    position: relative;
  }

  .nav-folder-item.selected::before {
    content: '';
    position: absolute;
    left: 0;
    top: 10px;
    bottom: 10px;
    width: 3px;
    border-radius: 0 999px 999px 0;
    background: linear-gradient(180deg, #60a5fa 0%, #2563eb 100%);
  }

  .nav-folder-item__icon {
    width: 24px;
    height: 24px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #eef2f8;
    color: #8191a8;
    flex-shrink: 0;
    transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
    box-shadow: none;
  }

  .nav-folder-item.selected .nav-folder-item__icon {
    background: rgba(37,99,235,0.12);
    color: #2563eb;
    transform: scale(1.03);
  }

  .nav-folder-item__label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
    letter-spacing: -0.1px;
  }

  .nav-folder-item__meta {
    display: none;
  }

  .nav-folder-item.selected .nav-folder-item__meta {
    background: rgba(37,99,235,0.12);
    color: #1d4ed8;
  }

  /* 主菜单节点 hover */
  .nav-folder-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 2px 8px;
    padding: 7px 8px;
    border-radius: 8px;
    border: 1px solid transparent;
    transition: background 0.16s ease, color 0.16s ease;
  }

  .nav-folder-row:hover {
    background: rgba(22,119,255,0.06);
    border-color: transparent;
  }

  .nav-folder-row.is-selected {
    background: rgba(22,119,255,0.1);
    border-color: transparent;
    position: relative;
  }

  .nav-folder-row.is-selected::before {
    content: '';
    position: absolute;
    left: 0;
    top: 9px;
    bottom: 9px;
    width: 3px;
    border-radius: 0 999px 999px 0;
    background: linear-gradient(180deg, #60a5fa 0%, #2563eb 100%);
  }

  .nav-folder-row.is-child {
    padding-left: 28px;
  }

  .nav-folder-chevron {
    width: 16px;
    height: 16px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #8b99ad;
    background: rgba(148,163,184,0.1);
    flex-shrink: 0;
    font-size: 9px;
    transition: background 0.16s ease, color 0.16s ease;
  }

  .nav-folder-chevron--trailing {
    margin-left: auto;
  }

  .nav-folder-row.is-selected .nav-folder-chevron {
    background: rgba(37,99,235,0.12);
    color: #2563eb;
  }

  .nav-folder-root-badge {
    width: 18px;
    height: 18px;
    border-radius: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: #d48806;
    flex-shrink: 0;
  }

  .nav-folder-dot {
    display: none;
  }

  .nav-folder-row.is-selected .nav-folder-dot {
    background: #2563eb;
    box-shadow: 0 0 0 4px rgba(37,99,235,0.14);
  }

  .nav-folder-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #334155;
  }

  .nav-folder-row.is-root .nav-folder-name {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.1px;
  }

  .nav-folder-row.is-child .nav-folder-name {
    font-size: 12px;
    font-weight: 400;
    color: #5f6b81;
  }

  .nav-folder-row.is-selected .nav-folder-name {
    color: #1d4ed8;
  }

  .nav-folder-count {
    display: none;
  }

  .folder-tree-container {
    padding-bottom: 6px;
  }

  /* 垂直卡片 */
  .nav-card {
    background: #fff;
    border-radius: 10px;
    border: 1px solid #ebebeb;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
    cursor: pointer;
  }
  
  .nav-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(0,0,0,0.08);
    border-color: #c9d9ff;
  }

  .nav-card-icon {
    transition: transform 0.2s ease;
  }
  
  .nav-card:hover .nav-card-icon {
    transform: scale(1.08);
  }

  .nav-card-actions {
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .nav-card:hover .nav-card-actions {
    opacity: 1;
  }
  
  .bookmark-toolbar {
    background: #f5f6fa;
    position: sticky;
    top: 0;
    z-index: 100;
    border-bottom: 1px solid #ebebeb !important;
  }

  .nav-section-title {
    font-size: 11px;
    font-weight: 600;
    color: #bbb;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .nav-section-divider {
    height: 1px;
    background: #f0f0f0;
    margin-bottom: 14px;
  }

  /* 列表行 */
  .nav-list-row:hover {
    background: #f8faff !important;
    border-color: rgba(22,119,255,0.15) !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }

  .nav-list-row .nav-card-actions {
    opacity: 0;
    transition: opacity 0.18s ease;
  }

  .nav-list-row:hover .nav-card-actions {
    opacity: 1;
  }

  /* 搜索框 */
  .bookmark-search .ant-input {
    background: transparent !important;
  }
`;

// 书签卡片组件 - 垂直大图标样式
const BookmarkCard: React.FC<{
  bookmark: Bookmark;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
}> = ({ bookmark, onEdit, onDelete }) => {
  return (
    <div
      onClick={() => openInBrowser(bookmark.url)}
      className="nav-card"
      style={{ padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', minHeight: 120 }}
    >
      {/* 大图标 */}
      <div className="nav-card-icon" style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: 'linear-gradient(145deg, #f8faff, #eef2ff)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
        flexShrink: 0,
        border: '1px solid rgba(0,0,0,0.05)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        {renderCustomIcon(bookmark.icon, bookmark.url, bookmark.name)}
      </div>

      {/* 名称 */}
      <div style={{
        fontWeight: 600,
        fontSize: 13,
        color: '#1a1a2e',
        marginBottom: 4,
        width: '100%',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        lineHeight: 1.4,
      }}>
        {bookmark.name}
      </div>

      {/* 域名/描述 */}
      <div style={{
        fontSize: 11,
        color: '#aaa',
        width: '100%',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        lineHeight: 1.5,
        minHeight: '2.2em',
        wordBreak: 'break-all',
      }}>
        {bookmark.description || getDomain(bookmark.url)}
      </div>

      {/* 操作按钮 - 悬浮显示在右上角 */}
      <div
        className="nav-card-actions"
        style={{
          position: 'absolute',
          right: 3,
          top: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          background: 'rgba(255,255,255,0.96)',
          borderRadius: 6,
          padding: '1px 3px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <Tooltip title="编辑">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined style={{ fontSize: 11 }} />}
            onClick={() => onEdit(bookmark)}
            style={{ color: '#888', width: 20, height: 20, padding: 0, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          />
        </Tooltip>
        <Tooltip title="复制链接">
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined style={{ fontSize: 11 }} />}
            onClick={() => { navigator.clipboard.writeText(bookmark.url); message.success('链接已复制'); }}
            style={{ color: '#888', width: 20, height: 20, padding: 0, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          />
        </Tooltip>
        <Popconfirm
          title="删除此书签？"
          onConfirm={() => onDelete(bookmark.id)}
          placement="topRight"
          okText="删除"
          cancelText="取消"
        >
          <Tooltip title="删除">
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined style={{ fontSize: 11 }} />}
              style={{ color: '#ff4d4f', width: 20, height: 20, padding: 0, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            />
          </Tooltip>
        </Popconfirm>
      </div>
    </div>
  );
};

// 书签列表行组件 - 图标左，内容右（横向卡片，自适应宽度）
const BookmarkListRow: React.FC<{
  bookmark: Bookmark;
  density: number;
  minWidth: number;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
}> = ({ bookmark, density: _density, minWidth: _minWidth, onEdit, onDelete }) => {
  const iconSize = 36;
  const padding = '10px 12px';

  return (
    <div
      onClick={() => openInBrowser(bookmark.url)}
      className="nav-card"
      style={{
        padding,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        textAlign: 'left',
        minHeight: 'unset',
        boxSizing: 'border-box' as const,
      }}
    >
      {/* 图标 */}
      <div className="nav-card-icon" style={{
        width: iconSize,
        height: iconSize,
        borderRadius: 10,
        background: 'linear-gradient(145deg, #f8faff, #eef2ff)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: '1px solid rgba(0,0,0,0.05)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        {renderCustomIcon(bookmark.icon, bookmark.url, bookmark.name, Math.round(iconSize * 0.6))}
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600,
          fontSize: 13,
          color: '#1a1a2e',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.4,
        }}>
          {bookmark.name}
        </div>
        <div style={{
          fontSize: 11,
          color: '#aaa',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          lineHeight: 1.4,
          wordBreak: 'break-all',
        }}>
          {bookmark.description || getDomain(bookmark.url)}
        </div>
      </div>

      {/* 操作按钮 */}
      <div
        className="nav-card-actions"
        style={{
          position: 'absolute',
          right: 3,
          top: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          background: 'rgba(255,255,255,0.96)',
          borderRadius: 6,
          padding: '1px 3px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <Tooltip title="编辑">
          <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 11 }} />}
            onClick={() => onEdit(bookmark)}
            style={{ color: '#888', width: 20, height: 20, padding: 0, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
        </Tooltip>
        <Tooltip title="复制链接">
          <Button type="text" size="small" icon={<CopyOutlined style={{ fontSize: 11 }} />}
            onClick={() => { navigator.clipboard.writeText(bookmark.url); message.success('链接已复制'); }}
            style={{ color: '#888', width: 20, height: 20, padding: 0, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
        </Tooltip>
        <Popconfirm title="删除此书签？" onConfirm={() => onDelete(bookmark.id)}
          placement="topRight" okText="删除" cancelText="取消">
          <Tooltip title="删除">
            <Button type="text" size="small" icon={<DeleteOutlined style={{ fontSize: 11 }} />}
              style={{ color: '#ff4d4f', width: 20, height: 20, padding: 0, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
          </Tooltip>
        </Popconfirm>
      </div>
    </div>
  );
};

const BookmarkPanel: React.FC = () => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [formIcon, setFormIcon] = useState('');
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [columns, setColumns] = useState<number>(() => {
    const saved = localStorage.getItem('bookmark-columns');
    return saved ? parseInt(saved) : 3;
  });
  const [layout, setLayout] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('bookmark-layout') as 'grid' | 'list') || 'grid';
  });
  // 文件夹展开状态
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // 切换文件夹展开状态
  const toggleFolderExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // 处理文件夹点击 - 聚合逻辑
  const handleFolderClick = (folder: { id: string, parentId: string | null }) => {
    if (folder.parentId) {
      // 是子文件夹：跳转到父文件夹页面并滚动
      setSelectedFolderId(folder.parentId);
      setScrollTarget(folder.id);
    } else {
      // 是根文件夹：进入并切换展开状态
      setSelectedFolderId(folder.id);
      setScrollTarget(null);
      if (hasChildren(folder.id)) {
        setExpandedFolders(prev => {
          const next = new Set(prev);
          if (next.has(folder.id)) {
            next.delete(folder.id);
          } else {
            next.add(folder.id);
          }
          return next;
        });
      }
    }
  };

  // 检查文件夹是否有子文件夹
  const hasChildren = (folderId: string) => {
    return folders.some(f => f.parentId === folderId);
  };

  // 表单状态
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formFolderId, setFormFolderId] = useState<string | null>(null);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    folderId: string | null;
  }>({ visible: false, x: 0, y: 0, folderId: null });

  // 重命名状态
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState('');

  const { folders, createFolder, updateFolder, deleteFolder } = useBookmarkFolders();

  const { bookmarks, createBookmark, updateBookmark, deleteBookmark, loading: bookmarksLoading } = useBookmarks(
    selectedFolderId === 'all' ? undefined : selectedFolderId,
    folders  // 传入 folders 以支持递归获取子文件夹书签
  );

  // 关闭右键菜单
  useEffect(() => {
    const handleClick = () => setContextMenu({ ...contextMenu, visible: false });
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // 处理文件夹右键点击
  const handleFolderContextMenu = (e: React.MouseEvent, folderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      folderId
    });
  };

  // 开始重命名
  const startRename = (folder: { id: string, name: string }) => {
    setRenamingFolderId(folder.id);
    setRenamingName(folder.name);
    setContextMenu({ ...contextMenu, visible: false });
  };

  // 提交重命名
  const submitRename = async () => {
    if (renamingFolderId && renamingName.trim()) {
      await updateFolder(renamingFolderId, { name: renamingName.trim() });
      message.success('重命名成功');
    }
    setRenamingFolderId(null);
  };

  // 排序文件夹 (字母顺序)
  const sortedFolders = React.useMemo(() => {
    return [...folders].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }, [folders]);

  const rootFolderCount = React.useMemo(() => {
    return sortedFolders.filter(folder => folder.parentId === null).length;
  }, [sortedFolders]);

  // 构建文件夹树
  const buildFolderTree = (parentId: string | null = null, level: number = 0): React.ReactNode[] => {
    const childFolders = sortedFolders.filter(f => f.parentId === parentId);

    return childFolders.flatMap(folder => {
      const isExpanded = expandedFolders.has(folder.id);
      const hasChildFolders = hasChildren(folder.id);
      const isRenaming = renamingFolderId === folder.id;
      const isSelected = selectedFolderId === folder.id || scrollTarget === folder.id;

      return [
        <div
          key={folder.id}
          onClick={() => !isRenaming && handleFolderClick(folder)}
          onContextMenu={(e) => handleFolderContextMenu(e, folder.id)}
          style={{
            cursor: 'pointer',
            userSelect: 'none' as const,
            position: 'relative',
          }}
        >
          {level === 0 ? (
            <div
              className={`nav-folder-row is-root${isSelected ? ' is-selected' : ''}`}
            >
              {!collapsed && (
                <span className="nav-folder-root-badge">
                  <FolderOutlined style={{ fontSize: 13 }} />
                </span>
              )}
              {isRenaming && !collapsed ? (
                <Input value={renamingName} onChange={e => setRenamingName(e.target.value)}
                  onBlur={submitRename} onPressEnter={submitRename} autoFocus size="small"
                  onClick={e => e.stopPropagation()} style={{ flex: 1, height: 22, fontSize: 13 }} />
              ) : !collapsed && (
                <span className="nav-folder-name">
                  {folder.name}
                </span>
              )}
              {!collapsed && hasChildFolders && (
                <span
                  onClick={(e) => toggleFolderExpand(folder.id, e)}
                  className="nav-folder-chevron nav-folder-chevron--trailing"
                >
                  {isExpanded ? <DownOutlined /> : <RightOutlined />}
                </span>
              )}
            </div>
          ) : (
            <div
              className={`nav-folder-row is-child${isSelected ? ' is-selected' : ''}`}
              style={{ marginLeft: collapsed ? 0 : Math.max(0, (level - 1) * 14) }}
            >
              {!collapsed && (
                <span className="nav-folder-root-badge">
                  <FolderOutlined style={{ fontSize: 12 }} />
                </span>
              )}
              {isRenaming && !collapsed ? (
                <Input value={renamingName} onChange={e => setRenamingName(e.target.value)}
                  onBlur={submitRename} onPressEnter={submitRename} autoFocus size="small"
                  onClick={e => e.stopPropagation()} style={{ flex: 1, height: 20, fontSize: 12 }} />
              ) : !collapsed && (
                <span className="nav-folder-name">
                  {folder.name}
                </span>
              )}
              {!collapsed && hasChildFolders && (
                <span
                  onClick={(e) => toggleFolderExpand(folder.id, e)}
                  className="nav-folder-chevron nav-folder-chevron--trailing"
                >
                  {isExpanded ? <DownOutlined /> : <RightOutlined />}
                </span>
              )}
            </div>
          )}
        </div>,
        ...(isExpanded ? buildFolderTree(folder.id, level + 1) : []),
      ];
    });
  };

  // 过滤书签
  const filteredBookmarks = searchQuery
    ? bookmarks.filter(b =>
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : bookmarks;

  // 当前选中的文件夹信息
  const currentFolder = folders.find(f => f.id === selectedFolderId);
  // 当前文件夹的直接子文件夹
  const subFolders = currentFolder
    ? folders.filter(f => f.parentId === currentFolder.id)
    : [];

  // 滚动到锚点
  React.useEffect(() => {
    if (scrollTarget && !bookmarksLoading) {
      setTimeout(() => {
        const el = document.getElementById(`folder-section-${scrollTarget}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [scrollTarget, bookmarks, bookmarksLoading]);

  // 聚合/分组书签逻辑
  const groupedBookmarks = React.useMemo(() => {
    // 只有在 "所有书签" 或 "有子文件夹的文件夹" 时才分组
    const shouldGroup = selectedFolderId === 'all' || subFolders.length > 0;
    if (!shouldGroup) return null;

    if (selectedFolderId === 'all') {
      // "全部书签" 视图：按层级结构分组
      // 返回一个树形结构，包含文件夹信息和书签
      type FolderGroup = {
        folder: { id: string; name: string; parentId: string | null } | null;
        bookmarks: Bookmark[];
        children: FolderGroup[];
      };

      // 构建文件夹树
      const buildFolderGroups = (parentId: string | null): FolderGroup[] => {
        const childFolders = folders.filter(f => f.parentId === parentId);
        return childFolders.map(folder => ({
          folder,
          bookmarks: filteredBookmarks.filter(b => b.folderId === folder.id),
          children: buildFolderGroups(folder.id),
        }));
      };

      // 未分类书签
      const uncategorizedBookmarks = filteredBookmarks.filter(b => !b.folderId);
      
      return {
        type: 'tree' as const,
        uncategorized: uncategorizedBookmarks,
        tree: buildFolderGroups(null),
      };
    } else {
      // 特定文件夹的聚合视图
      const groups: Record<string, Bookmark[]> = {};
      groups['root'] = []; // 直接属于该文件夹的书签
      subFolders.forEach(sf => groups[sf.id] = []);

      filteredBookmarks.forEach(b => {
        if (b.folderId === selectedFolderId) {
          groups['root'].push(b);
        } else {
          // 查找该书签属于哪个直接子文件夹（处理多级嵌套）
          let curr = folders.find(f => f.id === b.folderId);
          let targetSubFolderId = null;

          // 向上追溯，直到找到 parentId 为 selectedFolderId 的节点
          while (curr && curr.parentId !== selectedFolderId && curr.id !== selectedFolderId) {
            const parent = folders.find(f => f.id === curr?.parentId);
            if (!parent) break;
            curr = parent;
          }

          if (curr && curr.parentId === selectedFolderId) {
            targetSubFolderId = curr.id;
          }

          if (targetSubFolderId && groups[targetSubFolderId]) {
            groups[targetSubFolderId].push(b);
          } else {
            groups['root'].push(b);
          }
        }
      });
      return { type: 'flat' as const, groups };
    }
  }, [selectedFolderId, filteredBookmarks, folders, subFolders]);

  const handleCreateBookmark = () => {
    setEditingBookmark(null);
    setFormName('');
    setFormUrl('');
    setFormDescription('');
    setFormIcon('');
    // 如果当前是通过子分类滚动定位的，优先用子分类 ID；否则用当前选中的文件夹
    const defaultFolderId = scrollTarget || (selectedFolderId === 'all' ? null : selectedFolderId);
    setFormFolderId(defaultFolderId);
    setEditModalOpen(true);
  };

  const handleEditBookmark = (bookmark: Bookmark) => {
    setEditingBookmark(bookmark);
    setFormName(bookmark.name);
    setFormUrl(bookmark.url);
    setFormDescription(bookmark.description);
    setFormIcon(bookmark.icon || '');
    setFormFolderId(bookmark.folderId);
    setEditModalOpen(true);
  };

  const handleSaveBookmark = async () => {
    if (!formName.trim() || !formUrl.trim()) {
      message.warning('请填写名称和网址');
      return;
    }

    let url = formUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const data = {
      name: formName.trim(),
      url,
      description: formDescription.trim(),
      folder_id: formFolderId,
      icon: formIcon.trim() || null,
    };

    if (editingBookmark) {
      await updateBookmark(editingBookmark.id, data);
      message.success('书签已更新');
    } else {
      await createBookmark(data);
      message.success('书签已创建');
    }
    setEditModalOpen(false);
  };

  const handleDeleteBookmark = async (id: string) => {
    await deleteBookmark(id);
    message.success('书签已删除');
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      message.warning('请输入文件夹名称');
      return;
    }
    await createFolder(newFolderName.trim(), newFolderParentId);
    setNewFolderName('');
    setNewFolderParentId(null);
    setFolderModalOpen(false);
    message.success('文件夹已创建');
  };

  // 切换列数
  const handleColumnsChange = (value: number) => {
    setColumns(value);
    localStorage.setItem('bookmark-columns', String(value));
  };

  // 切换布局
  const handleLayoutChange = (value: 'grid' | 'list') => {
    setLayout(value);
    localStorage.setItem('bookmark-layout', value);
  };

  // 根据列数计算网格样式
  const getGridStyle = () => {
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: 10,
    };
  };

  // 渲染书签网格或列表
  const renderBookmarkGrid = (items: Bookmark[]) => {
    if (layout === 'list') {
      // 左右布局：和上下一样用 grid 固定列数，只是卡片方向不同
      return (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 8,
        }}>
          {items.map(bookmark => (
            <BookmarkListRow
              key={bookmark.id}
              bookmark={bookmark}
              density={columns}
              minWidth={0}
              onEdit={handleEditBookmark}
              onDelete={handleDeleteBookmark}
            />
          ))}
        </div>
      );
    }
    // 网格模式：图标上，内容下，固定列数
    return (
      <div style={getGridStyle()}>
        {items.map(bookmark => (
          <BookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            onEdit={handleEditBookmark}
            onDelete={handleDeleteBookmark}
          />
        ))}
      </div>
    );
  };

  return (
    <Layout style={{ height: '100%' }} className="nav-site-container">
      <style>{styles}</style>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div style={{
          position: 'fixed',
          top: contextMenu.y,
          left: contextMenu.x,
          background: '#fff',
          borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          zIndex: 1000,
          padding: '4px 0',
          minWidth: 120,
          border: '1px solid #eee'
        }}>
          {contextMenu.folderId ? (
            <>
              <div
                className="context-menu-item"
                onClick={() => {
                  setNewFolderParentId(contextMenu.folderId);
                  setFolderModalOpen(true);
                  setContextMenu({ ...contextMenu, visible: false });
                }}
                style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 13, color: '#333' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                <FolderAddOutlined style={{ marginRight: 8 }} />新建子文件夹
              </div>
              <div
                className="context-menu-item"
                onClick={() => {
                  const folder = folders.find(f => f.id === contextMenu.folderId);
                  if (folder) startRename(folder);
                }}
                style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 13, color: '#333' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                <EditOutlined style={{ marginRight: 8 }} />重命名
              </div>
              <div
                className="context-menu-item"
                onClick={() => {
                  setFormFolderId(contextMenu.folderId);
                  handleCreateBookmark();
                  setContextMenu({ ...contextMenu, visible: false });
                }}
                style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 13, color: '#333' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                <PlusOutlined style={{ marginRight: 8 }} />新建书签
              </div>
              <Divider style={{ margin: '4px 0' }} />
              <Popconfirm
                title="确定删除此文件夹？"
                description="文件夹内的书签也会被删除"
                onConfirm={async () => {
                  const folderIdToDelete = contextMenu.folderId;
                  setContextMenu({ ...contextMenu, visible: false });
                  if (folderIdToDelete) {
                    await deleteFolder(folderIdToDelete);
                    message.success('文件夹已删除');
                  }
                }}
                placement="rightTop"
                okType="danger"
                getPopupContainer={(trigger) => trigger.parentElement || document.body}
              >
                <div
                  className="context-menu-item"
                  style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 13, color: '#ff4d4f' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fff1f0'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  onClick={(e) => e.stopPropagation()}
                >
                  <DeleteOutlined style={{ marginRight: 8 }} />删除文件夹
                </div>
              </Popconfirm>
            </>
          ) : (
            // Root context menu
            <div
              className="context-menu-item"
              onClick={() => {
                setNewFolderParentId(null);
                setFolderModalOpen(true);
                setContextMenu({ ...contextMenu, visible: false });
              }}
              style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 13, color: '#333' }}
            >
              <FolderAddOutlined style={{ marginRight: 8 }} />新建文件夹
            </div>
          )}
        </div>
      )}

      {/* 左侧文件夹列表 */}
      <Sider
        width={220}
        className="nav-sider"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        collapsedWidth={60}
        onContextMenu={(e) => handleFolderContextMenu(e, null)} // Root context menu
      >
        <div className="nav-sidebar-shell">
          {/* Logo / Header */}
          <div className={`nav-sidebar-header${collapsed ? ' nav-sidebar-header--collapsed' : ''}`}>
            <div className="nav-sidebar-header-mark">
              <GlobalOutlined style={{ fontSize: 13, color: '#fff' }} />
            </div>
            {!collapsed && (
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="nav-sidebar-title">书签导航</div>
                <div className="nav-sidebar-subtitle">总览、分类与待整理入口</div>
              </div>
            )}
          </div>

          <div className="nav-sidebar-scroll">
            <div className="nav-sidebar-panel">
              {!collapsed && (
                <div className="nav-sidebar-section-label">
                  <span>快捷入口</span>
                </div>
              )}

              {/* 全部书签 */}
              <div
                onClick={() => setSelectedFolderId('all')}
                style={{ cursor: 'pointer', userSelect: 'none' as const, justifyContent: collapsed ? 'center' : 'flex-start' }}
                className={`nav-folder-item${selectedFolderId === 'all' ? ' selected' : ''}`}
              >
                <span className="nav-folder-item__icon">
                  <AppstoreOutlined style={{ fontSize: 14 }} />
                </span>
                {!collapsed && (
                  <>
                    <span className="nav-folder-item__label">全部书签</span>
                    <span className="nav-folder-item__meta">总览</span>
                  </>
                )}
              </div>
              {/* 未分类 */}
              <div
                onClick={() => setSelectedFolderId(null)}
                style={{ cursor: 'pointer', userSelect: 'none' as const, justifyContent: collapsed ? 'center' : 'flex-start' }}
                className={`nav-folder-item${selectedFolderId === null ? ' selected' : ''}`}
              >
                <span className="nav-folder-item__icon">
                  <FolderOutlined style={{ fontSize: 14 }} />
                </span>
                {!collapsed && (
                  <>
                    <span className="nav-folder-item__label">未分类</span>
                    <span className="nav-folder-item__meta">待整理</span>
                  </>
                )}
              </div>
            </div>

            <div className="nav-sidebar-panel">
              {/* FOLDERS 标签 */}
              {!collapsed && (
                <div className="nav-sidebar-section-label">
                  <span>分类目录 {rootFolderCount > 0 ? `(${rootFolderCount})` : ''}</span>
                  <Tooltip title="新建文件夹">
                    <Button
                      type="text"
                      size="small"
                      icon={<PlusOutlined style={{ fontSize: 11 }} />}
                      onClick={() => { setNewFolderParentId(null); setFolderModalOpen(true); }}
                      className="nav-sidebar-add-btn"
                    />
                  </Tooltip>
                </div>
              )}

              <div className="folder-tree-container">
                {buildFolderTree(null)}
              </div>
            </div>
          </div>
        </div>
      </Sider>

      {/* 右侧书签内容 */}
      <Content className="bookmark-content" style={{ display: 'flex', flexDirection: 'column', background: 'transparent' }}>
        {/* 工具栏 */}
        <div className="bookmark-toolbar" style={{
          padding: '10px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}>
          {/* 左侧：面包屑 + 搜索 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            {/* 面包屑导航 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#888', flexShrink: 0 }}>
              <span
                style={{ cursor: 'pointer', color: selectedFolderId === 'all' ? '#1677ff' : '#888' }}
                onClick={() => setSelectedFolderId('all')}
              >
                全部书签
              </span>
              {currentFolder && (
                <>
                  <RightOutlined style={{ fontSize: 10, color: '#ccc' }} />
                  <span style={{ color: '#333', fontWeight: 500 }}>{currentFolder.name}</span>
                </>
              )}
              {selectedFolderId === null && (
                <>
                  <RightOutlined style={{ fontSize: 10, color: '#ccc' }} />
                  <span style={{ color: '#333', fontWeight: 500 }}>未分类</span>
                </>
              )}
            </div>

            <Input
              className="bookmark-search"
              placeholder="搜索书签..."
              prefix={<SearchOutlined style={{ color: '#bbb', fontSize: 14 }} />}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              allowClear
              bordered={false}
              style={{
                maxWidth: 260,
                background: 'rgba(0,0,0,0.05)',
                borderRadius: 20,
                padding: '6px 14px',
              }}
            />
          </div>

          <Space size={12}>
            {/* 布局切换 */}
            <Segmented
              value={layout}
              onChange={(v) => handleLayoutChange(v as 'grid' | 'list')}
              options={[
                { value: 'grid', icon: <TableOutlined />, label: '上下' },
                { value: 'list', icon: <UnorderedListOutlined />, label: '左右' },
              ]}
              size="small"
            />
            {/* 紧密度（网格/列表通用） */}
            <Segmented
              value={columns}
              onChange={(v) => handleColumnsChange(v as number)}
              options={[
                { value: 3, label: '3个' },
                { value: 4, label: '4个' },
                { value: 5, label: '5个' },
                { value: 6, label: '6个' },
              ]}
              size="small"
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreateBookmark}
              shape="round"
              size="middle"
              style={{ boxShadow: '0 4px 12px rgba(22,119,255,0.28)', paddingLeft: 18, paddingRight: 18 }}
            >
              添加书签
            </Button>
          </Space>
        </div>

        {/* 书签内容区 */}
        {/* 书签内容区 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {filteredBookmarks.length === 0 ? (
            <div style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999',
              gap: 12,
            }}>
              <div style={{
                width: 72, height: 72,
                borderRadius: 20,
                background: 'linear-gradient(145deg, #f0f4ff, #e8f0fe)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(22,119,255,0.1)',
              }}>
                <GlobalOutlined style={{ fontSize: 32, color: '#93b4f5' }} />
              </div>
              <div style={{ fontSize: 15, color: '#bbb', fontWeight: 500 }}>还没有书签</div>
              <div style={{ fontSize: 13, color: '#ccc' }}>右键文件夹或点击下方按钮添加</div>
              <Button type="primary" ghost shape="round" onClick={handleCreateBookmark} style={{ marginTop: 4 }}>
                立即添加
              </Button>
            </div>
          ) : groupedBookmarks ? (
            // 分组显示
            <div>
              {groupedBookmarks.type === 'tree' ? (
                // "所有书签" 视图：按层级结构显示
                <>
                  {/* 未分类书签 */}
                  {groupedBookmarks.uncategorized.length > 0 && (
                    <div style={{ marginBottom: 32 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#888',
                        marginBottom: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                      }} className="nav-section-title">
                        未分类
                        <span style={{
                          fontSize: 11,
                          color: '#bbb',
                          background: 'rgba(0,0,0,0.05)',
                          padding: '1px 7px',
                          borderRadius: 10,
                          fontWeight: 400,
                          textTransform: 'none',
                          letterSpacing: 0,
                        }}>{groupedBookmarks.uncategorized.length}</span>
                      </div>
                      <div className="nav-section-divider" />
                      {renderBookmarkGrid(groupedBookmarks.uncategorized)}
                    </div>
                  )}
                  
                  {/* 递归渲染文件夹树 */}
                  {(() => {
                    type FolderGroup = {
                      folder: { id: string; name: string; parentId: string | null } | null;
                      bookmarks: Bookmark[];
                      children: FolderGroup[];
                    };
                    
                    const renderFolderTree = (groups: FolderGroup[], level: number = 0): React.ReactNode => {
                      return groups.map(group => {
                        if (!group.folder) return null;
                        const totalBookmarks = group.bookmarks.length + 
                          group.children.reduce((sum, child) => {
                            const countAll = (g: FolderGroup): number => 
                              g.bookmarks.length + g.children.reduce((s, c) => s + countAll(c), 0);
                            return sum + countAll(child);
                          }, 0);
                        
                        if (totalBookmarks === 0) return null;
                        
                        return (
                          <div key={group.folder.id} style={{ marginBottom: level === 0 ? 32 : 24 }}>
                            <div style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: level === 0 ? '#666' : '#888',
                              marginBottom: 12,
                              paddingLeft: level * 24,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              textTransform: 'uppercase',
                              letterSpacing: 0.8,
                            }} className="nav-section-title">
                              <FolderOutlined style={{ color: '#ffc66d', fontSize: 14 }} />
                              {group.folder.name}
                              <span style={{
                                fontSize: 11,
                                color: '#bbb',
                                background: 'rgba(0,0,0,0.05)',
                                padding: '1px 7px',
                                borderRadius: 10,
                                fontWeight: 400,
                                textTransform: 'none',
                                letterSpacing: 0,
                              }}>{totalBookmarks}</span>
                            </div>
                            {level === 0 && <div className="nav-section-divider" style={{ paddingLeft: level * 24 }} />}
                            
                            {/* 该文件夹直接的书签 */}
                            {group.bookmarks.length > 0 && (
                              <div style={{ paddingLeft: level * 24, marginBottom: group.children.length > 0 ? 16 : 0 }}>
                                {renderBookmarkGrid(group.bookmarks)}
                              </div>
                            )}
                            
                            {/* 子文件夹 */}
                            {group.children.length > 0 && renderFolderTree(group.children, level + 1)}
                          </div>
                        );
                      });
                    };
                    
                    return renderFolderTree(groupedBookmarks.tree);
                  })()}
                </>
              ) : (
                // 一级目录聚合视图：显示本级书签 + 按二级目录分组
                <>
                  {/* 本级书签（直接属于该文件夹的） */}
                  {groupedBookmarks.groups['root'] && groupedBookmarks.groups['root'].length > 0 && (
                    <div style={{ marginBottom: 32 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#666',
                        marginBottom: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                      }}>
                        {currentFolder?.name || '通用'}
                        <span style={{
                          fontSize: 11, color: '#bbb', background: 'rgba(0,0,0,0.05)',
                          padding: '1px 7px', borderRadius: 10, fontWeight: 400,
                          textTransform: 'none', letterSpacing: 0,
                        }}>{groupedBookmarks.groups['root'].length}</span>
                      </div>
                      <div className="nav-section-divider" />
                      {renderBookmarkGrid(groupedBookmarks.groups['root'])}
                    </div>
                  )}

                  {/* 二级目录书签 - 按子文件夹分组显示 */}
                  {subFolders.map(sf => {
                    const items = groupedBookmarks.groups[sf.id] || [];
                    if (items.length === 0) return null;
                    return (
                      <div
                        key={sf.id}
                        id={`folder-section-${sf.id}`}
                        style={{ marginBottom: 32, scrollMarginTop: 80, transition: 'background 0.5s' }}
                      >
                        <div style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#666',
                          marginBottom: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          textTransform: 'uppercase',
                          letterSpacing: 0.8,
                        }}>
                          <FolderOutlined style={{ color: '#ffc66d', fontSize: 14 }} />
                          {sf.name}
                          <span style={{
                            fontSize: 11, color: '#bbb', background: 'rgba(0,0,0,0.05)',
                            padding: '1px 7px', borderRadius: 10, fontWeight: 400,
                            textTransform: 'none', letterSpacing: 0,
                          }}>{items.length}</span>
                        </div>
                        <div className="nav-section-divider" />
                        {renderBookmarkGrid(items)}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          ) : (
            // 单文件夹显示（没有子文件夹的情况）
            renderBookmarkGrid(filteredBookmarks)
          )}
        </div>
      </Content>

      {/* 编辑书签弹窗 */}
      <Modal
        title={editingBookmark ? '编辑书签' : '添加书签'}
        open={editModalOpen}
        onOk={handleSaveBookmark}
        onCancel={() => setEditModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={480}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#333', fontWeight: 500 }}>
            名称 <span style={{ color: '#ff4d4f' }}>*</span>
          </label>
          <Input
            placeholder="输入书签名称"
            value={formName}
            onChange={e => setFormName(e.target.value)}
            autoFocus
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#333', fontWeight: 500 }}>
            网址 <span style={{ color: '#ff4d4f' }}>*</span>
          </label>
          <Input
            placeholder="https://example.com"
            value={formUrl}
            onChange={e => setFormUrl(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#333', fontWeight: 500 }}>描述</label>
          <TextArea
            placeholder="添加书签描述（可选）"
            value={formDescription}
            onChange={e => setFormDescription(e.target.value)}
            rows={2}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#333', fontWeight: 500 }}>自定义图标</label>
          <TextArea
            placeholder="支持：图片URL、base64编码（data:image/...）、SVG代码（<svg>...</svg>）"
            value={formIcon}
            onChange={e => setFormIcon(e.target.value)}
            rows={2}
          />
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
            留空则自动获取网站图标
          </div>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#333', fontWeight: 500 }}>文件夹</label>
          <Select
            value={formFolderId || undefined}
            onChange={v => setFormFolderId(v || null)}
            placeholder="选择文件夹（可选）"
            allowClear
            style={{ width: '100%' }}
          >
            {(() => {
              // 构建层级文件夹选项
              const buildFolderOptions = (parentId: string | null = null, level: number = 0): React.ReactNode[] => {
                const childFolders = folders.filter(f => f.parentId === parentId);
                return childFolders.flatMap(folder => [
                  <Select.Option key={folder.id} value={folder.id}>
                    <span style={{ paddingLeft: level * 16 }}>
                      {'└─ '.repeat(level > 0 ? 1 : 0)}{folder.name}
                    </span>
                  </Select.Option>,
                  ...buildFolderOptions(folder.id, level + 1),
                ]);
              };
              return buildFolderOptions(null);
            })()}
          </Select>
        </div>
      </Modal>

      {/* 新建文件夹弹窗 */}
      <Modal
        title={newFolderParentId ? "新建子文件夹" : "新建文件夹"}
        open={folderModalOpen}
        onOk={handleCreateFolder}
        onCancel={() => { setFolderModalOpen(false); setNewFolderName(''); setNewFolderParentId(null); }}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="输入文件夹名称"
          value={newFolderName}
          onChange={e => setNewFolderName(e.target.value)}
          onPressEnter={handleCreateFolder}
          autoFocus
        />
      </Modal>
    </Layout>
  );
};

export default BookmarkPanel;
