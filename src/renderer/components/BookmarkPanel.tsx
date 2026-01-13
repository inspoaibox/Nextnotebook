import React, { useState, useEffect } from 'react';
import {
  Layout, Input, Button, Empty, Modal, message, Tooltip,
  Space, Divider, Popconfirm, Select, Segmented
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, LinkOutlined,
  FolderOutlined, FolderAddOutlined, GlobalOutlined, SearchOutlined,
  AppstoreOutlined, RightOutlined, DownOutlined,
} from '@ant-design/icons';
import { useBookmarks, useBookmarkFolders, Bookmark } from '../hooks/useBookmarks';

const { Sider, Content } = Layout;
const { TextArea } = Input;

// 获取网站图标
const getFavicon = (url: string) => {
  try {
    if (!url) return null;
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return null;
  }
};

// 渲染自定义图标（支持 URL、base64、SVG 代码）
const renderCustomIcon = (icon: string | null | undefined, fallbackUrl: string) => {
  if (!icon) {
    // 使用 favicon
    const favicon = getFavicon(fallbackUrl);
    return favicon ? (
      <img
        src={favicon}
        alt=""
        style={{ width: 18, height: 18, objectFit: 'contain' }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
          (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style="font-size:16px;opacity:0.6">🌍</span>';
        }}
      />
    ) : <span style={{ fontSize: 16, opacity: 0.6 }}>🌍</span>;
  }

  const trimmed = icon.trim();

  // SVG 代码（以 <svg 开头）
  if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml')) {
    return (
      <div
        style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        dangerouslySetInnerHTML={{ __html: trimmed.replace(/width="[^"]*"/, 'width="18"').replace(/height="[^"]*"/, 'height="18"') }}
      />
    );
  }

  // base64 编码（data:image 开头）
  if (trimmed.startsWith('data:image')) {
    return (
      <img
        src={trimmed}
        alt=""
        style={{ width: 18, height: 18, objectFit: 'contain' }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
          (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style="font-size:16px;opacity:0.6">🌍</span>';
        }}
      />
    );
  }

  // 普通 URL
  return (
    <img
      src={trimmed}
      alt=""
      style={{ width: 18, height: 18, objectFit: 'contain' }}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
        (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style="font-size:16px;opacity:0.6">🌍</span>';
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
    background: #f5f7fa !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }
  
  .nav-sider {
    background: #fff !important;
    border-right: 1px solid rgba(0,0,0,0.03) !important;
  }

  /* Compact Folder Items */
  .nav-folder-item {
    transition: all 0.2s ease;
    border-radius: 4px;
    margin: 1px 4px;
    color: #555;
    white-space: nowrap;
    overflow: hidden;
  }
  
  .nav-folder-item:hover {
    background: rgba(0,0,0,0.03);
    color: #333;
  }
  
  .nav-folder-item.selected {
    background: #e6f7ff;
    color: #1890ff;
    font-weight: 600;
  }

  /* Compact Card */
  .nav-card {
    background: #fff;
    border-radius: 8px;
    border: 1px solid #f0f0f0;
    box-shadow: 0 1px 2px rgba(0,0,0,0.02);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }
  
  .nav-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    border-color: rgba(24, 144, 255, 0.2);
    z-index: 10;
  }

  .nav-card-icon {
    transition: transform 0.3s ease;
  }
  
  .nav-card:hover .nav-card-icon {
    transform: scale(1.05);
  }

  .nav-card-actions {
    opacity: 0;
    transition: opacity 0.2s ease;
    background: linear-gradient(90deg, transparent, #fff 30%);
  }

  .nav-card:hover .nav-card-actions {
    opacity: 1;
  }
  
  .bookmark-toolbar {
    background: rgba(255,255,255,0.9);
    backdrop-filter: blur(8px);
    position: sticky;
    top: 0;
    z-index: 100;
  }
`;

// 书签卡片组件
const BookmarkCard: React.FC<{
  bookmark: Bookmark;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
}> = ({ bookmark, onEdit, onDelete }) => {
  return (
    <div
      onClick={() => openInBrowser(bookmark.url)}
      className="nav-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '16px',
        cursor: 'pointer',
        height: '100%',
      }}
    >
      {/* 图标 */}
      <div className="nav-card-icon" style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        background: '#f7f9fc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
        flexShrink: 0,
        border: '1px solid rgba(0,0,0,0.04)',
      }}>
        {renderCustomIcon(bookmark.icon, bookmark.url)}
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{
          fontWeight: 600,
          fontSize: 15,
          color: '#262626',
          marginBottom: 4,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {bookmark.name}
        </div>
        <div style={{
          fontSize: 12,
          color: '#8c8c8c',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {bookmark.description || getDomain(bookmark.url)}
        </div>
      </div>

      {/* 操作按钮 - 悬浮显示 */}
      <div
        className="nav-card-actions"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          paddingRight: 8,
          paddingLeft: 24,
        }}
        onClick={e => e.stopPropagation()}
      >
        <Tooltip title="编辑">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit(bookmark)}
            style={{ color: '#666' }}
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
              icon={<DeleteOutlined />}
              style={{ color: '#ff4d4f' }}
            />
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
  // 文件夹展开状态（默认全部折叠）
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
      // 是根文件夹：直接进入
      setSelectedFolderId(folder.id);
      setScrollTarget(null);
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
    return [...folders].sort((a, b) => a.name.localeCompare(b.name));
  }, [folders]);

  // 构建文件夹树
  const buildFolderTree = (parentId: string | null = null, level: number = 0): React.ReactNode[] => {
    const childFolders = sortedFolders.filter(f => f.parentId === parentId);

    return childFolders.flatMap(folder => {
      const isExpanded = expandedFolders.has(folder.id);
      const hasChildFolders = hasChildren(folder.id);
      const indent = level * 16;
      const isRenaming = renamingFolderId === folder.id;

      return [
        <div
          key={folder.id}
          onClick={() => !isRenaming && handleFolderClick(folder)}
          onContextMenu={(e) => handleFolderContextMenu(e, folder.id)}
          className={`nav-folder-item ${selectedFolderId === folder.id || scrollTarget === folder.id ? 'selected' : ''}`}
          style={{
            padding: '8px 10px',
            paddingLeft: collapsed ? 10 : 10 + indent,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative' // For context menu positioning rely on fixed/absolute global
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <FolderOutlined style={{
              color: selectedFolderId === folder.id || scrollTarget === folder.id ? '#1890ff' : '#ffc66d',
              fontSize: 16,
              flexShrink: 0,
            }} />

            {isRenaming && !collapsed ? (
              <Input
                value={renamingName}
                onChange={e => setRenamingName(e.target.value)}
                onBlur={submitRename}
                onPressEnter={submitRename}
                autoFocus
                size="small"
                onClick={e => e.stopPropagation()}
                style={{ flex: 1, height: 24, fontSize: 13 }}
              />
            ) : (
              !collapsed && (
                <span style={{
                  fontWeight: selectedFolderId === folder.id || scrollTarget === folder.id ? 500 : 400,
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  userSelect: 'none'
                }}>
                  {folder.name}
                </span>
              )
            )}

            {/* 展开/折叠按钮 */}
            {!collapsed && hasChildFolders ? (
              <span
                onClick={(e) => toggleFolderExpand(folder.id, e)}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  width: 16,
                  justifyContent: 'center',
                  color: '#999',
                  fontSize: 10,
                  flexShrink: 0,
                }}
              >
                {isExpanded ? <DownOutlined /> : <RightOutlined />}
              </span>
            ) : null}
          </div>

          {!collapsed && !isRenaming && (
            <Space size={0} className="folder-actions" style={{ opacity: selectedFolderId === folder.id ? 1 : 0.4, flexShrink: 0 }}>
              {/* Actions are now mainly in context menu, but keep hover optional if desired. Removing to clean up UI as requested context menu focus */}
            </Space>
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
    setFormFolderId(selectedFolderId === 'all' ? null : selectedFolderId);
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

  // 根据列数计算网格样式
  const getGridStyle = () => {
    const minWidth = columns === 2 ? '400px' : columns === 4 ? '220px' : '280px';
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: 12,
    };
  };

  // 渲染书签网格
  const renderBookmarkGrid = (items: Bookmark[]) => (
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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Logo / Header */}
          <div style={{
            padding: collapsed ? '16px 0' : '16px 16px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
          }}>
            <div style={{
              width: 28, height: 28,
              background: 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)',
              borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(24, 144, 255, 0.2)'
            }}>
              <GlobalOutlined style={{ fontSize: 16, color: '#fff' }} />
            </div>
            {!collapsed && <span style={{ fontWeight: 700, fontSize: 15, color: '#333', letterSpacing: 0.5 }}>书签导航</span>}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '0 4px 10px' }}>
            <div
              onClick={() => setSelectedFolderId('all')}
              className={`nav-folder-item ${selectedFolderId === 'all' ? 'selected' : ''}`}
              style={{
                padding: '8px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 10,
              }}
            >
              <AppstoreOutlined style={{ color: selectedFolderId === 'all' ? '#1890ff' : '#bbb', fontSize: 16 }} />
              {!collapsed && <span>全部书签</span>}
            </div>
            <div
              onClick={() => setSelectedFolderId(null)}
              className={`nav-folder-item ${selectedFolderId === null ? 'selected' : ''}`}
              style={{
                padding: '8px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 10,
              }}
            >
              <FolderOutlined style={{ color: selectedFolderId === null ? '#1890ff' : '#bbb', fontSize: 16 }} />
              {!collapsed && <span>未分类</span>}
            </div>

            <Divider style={{ margin: '8px 6px', borderColor: 'rgba(0,0,0,0.04)' }} />

            {!collapsed && (
              <div style={{ padding: '0 8px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Folders</span>
                <Tooltip title="新建文件夹">
                  <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => { setNewFolderParentId(null); setFolderModalOpen(true); }} style={{ color: '#888' }} />
                </Tooltip>
              </div>
            )}

            <div className="folder-tree-container">
              {buildFolderTree(null)}
            </div>
          </div>
        </div>
      </Sider>

      {/* 右侧书签内容 */}
      <Content className="bookmark-content" style={{ display: 'flex', flexDirection: 'column', background: 'transparent' }}>
        {/* 工具栏 */}
        <div className="bookmark-toolbar" style={{
          padding: '10px 20px',
          borderBottom: '1px solid rgba(0,0,0,0.03)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Input
            placeholder="搜索您的书签..."
            prefix={<SearchOutlined style={{ color: '#bbb', fontSize: 16, marginRight: 4 }} />}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            allowClear
            bordered={false}
            style={{
              width: 320,
              background: '#f0f2f5',
              padding: '8px 16px',
              borderRadius: 20
            }}
          />

          <Space size={16}>
            <Segmented
              value={columns}
              onChange={(v) => handleColumnsChange(v as number)}
              options={[
                { value: 2, icon: <AppstoreOutlined />, label: '宽屏' },
                { value: 3, icon: <AppstoreOutlined />, label: '标准' },
                { value: 4, icon: <AppstoreOutlined />, label: '紧凑' },
              ]}
              size="middle"
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreateBookmark}
              shape="round"
              size="middle"
              style={{ boxShadow: '0 4px 10px rgba(24, 144, 255, 0.3)', paddingLeft: 20, paddingRight: 20 }}
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
              color: '#999'
            }}>
              <Empty
                description={false}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
              <div style={{ marginTop: 16 }}>还没有书签，去添加一个吧</div>
              <Button type="dashed" onClick={handleCreateBookmark} style={{ marginTop: 16 }}>
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
                        fontSize: 18,
                        fontWeight: 600,
                        color: '#333',
                        marginBottom: 16,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }} className="nav-section-title">
                        未分类
                        <span style={{
                          fontSize: 13,
                          color: '#bbb',
                          background: '#f5f5f5',
                          padding: '1px 8px',
                          borderRadius: 10,
                          fontWeight: 400
                        }}>{groupedBookmarks.uncategorized.length}</span>
                      </div>
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
                              fontSize: level === 0 ? 18 : 16,
                              fontWeight: 600,
                              color: level === 0 ? '#333' : '#555',
                              marginBottom: 16,
                              paddingLeft: level * 24,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              borderBottom: level === 0 ? '1px solid #f0f0f0' : 'none',
                              paddingBottom: level === 0 ? 8 : 0,
                            }} className="nav-section-title">
                              <FolderOutlined style={{ color: '#ffc66d', fontSize: level === 0 ? 18 : 16 }} />
                              {group.folder.name}
                              <span style={{
                                fontSize: 12,
                                color: '#bbb',
                                background: '#f5f5f5',
                                padding: '1px 8px',
                                borderRadius: 10,
                                fontWeight: 400
                              }}>{totalBookmarks}</span>
                            </div>
                            
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
                        fontSize: 18,
                        fontWeight: 600,
                        color: '#333',
                        marginBottom: 16,
                        paddingBottom: 8,
                        borderBottom: '1px solid #f0f0f0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}>
                        {currentFolder?.name || '通用'}
                        <span style={{
                          fontSize: 12, color: '#bbb', background: '#f5f5f5',
                          padding: '2px 8px', borderRadius: 10, fontWeight: 400
                        }}>{groupedBookmarks.groups['root'].length}</span>
                      </div>
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
                          fontSize: 18,
                          fontWeight: 600,
                          color: '#333',
                          marginBottom: 16,
                          paddingBottom: 8,
                          borderBottom: '1px solid #f0f0f0',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8
                        }}>
                          {sf.name}
                          <span style={{
                            fontSize: 12, color: '#bbb', background: '#f5f5f5',
                            padding: '2px 8px', borderRadius: 10, fontWeight: 400
                          }}>{items.length}</span>
                        </div>
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
