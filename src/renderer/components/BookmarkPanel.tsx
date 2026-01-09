import React, { useState } from 'react';
import { 
  Layout, Input, Button, Empty, Modal, message, Tooltip, 
  Space, Divider, Popconfirm, Select, Segmented
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, LinkOutlined,
  FolderOutlined, FolderAddOutlined, GlobalOutlined, SearchOutlined,
  AppstoreOutlined,
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

// 书签卡片组件
const BookmarkCard: React.FC<{
  bookmark: Bookmark;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
}> = ({ bookmark, onEdit, onDelete }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => openInBrowser(bookmark.url)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="bookmark-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 0.2s',
        border: '1px solid var(--border-color, #e8e8e8)',
        position: 'relative',
      }}
    >
      {/* 图标 */}
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        background: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        flexShrink: 0,
      }}>
        <img 
          src={getFavicon(bookmark.url) || ''} 
          alt="" 
          style={{ width: 24, height: 24, objectFit: 'contain' }}
          onError={(e) => { 
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style="font-size:18px;color:#1890ff">🔗</span>';
          }}
        />
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ 
          fontWeight: 500, 
          fontSize: 14,
          color: '#333',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {bookmark.name}
        </div>
        <div style={{ 
          fontSize: 12, 
          color: '#999',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginTop: 2,
        }}>
          {bookmark.description || getDomain(bookmark.url)}
        </div>
      </div>

      {/* 操作按钮 */}
      {hovered && (
        <div 
          style={{ 
            display: 'flex', 
            gap: 4,
            marginLeft: 8,
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
            placement="left"
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
      )}
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
  const [columns, setColumns] = useState<number>(() => {
    const saved = localStorage.getItem('bookmark-columns');
    return saved ? parseInt(saved) : 3;
  });

  // 表单状态
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formFolderId, setFormFolderId] = useState<string | null>(null);

  const { folders, createFolder, deleteFolder } = useBookmarkFolders();
  const { bookmarks, createBookmark, updateBookmark, deleteBookmark } = useBookmarks(
    selectedFolderId === 'all' ? undefined : selectedFolderId,
    folders  // 传入 folders 以支持递归获取子文件夹书签
  );

  // 过滤书签
  const filteredBookmarks = searchQuery
    ? bookmarks.filter(b => 
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : bookmarks;

  // 按文件夹分组书签（仅在"所有书签"视图时）
  const groupedBookmarks = selectedFolderId === 'all' 
    ? (() => {
        const groups: { [key: string]: Bookmark[] } = { '未分类': [] };
        folders.forEach(f => { groups[f.name] = []; });
        filteredBookmarks.forEach(b => {
          const folder = folders.find(f => f.id === b.folderId);
          const groupName = folder ? folder.name : '未分类';
          if (!groups[groupName]) groups[groupName] = [];
          groups[groupName].push(b);
        });
        return groups;
      })()
    : null;

  // 构建文件夹树
  const buildFolderTree = (parentId: string | null = null, level: number = 0): React.ReactNode[] => {
    const childFolders = folders.filter(f => f.parentId === parentId);
    return childFolders.flatMap(folder => [
      <div
        key={folder.id}
        onClick={() => setSelectedFolderId(folder.id)}
        className={`bookmark-folder-item ${selectedFolderId === folder.id ? 'selected' : ''}`}
        style={{
          padding: '8px 12px',
          paddingLeft: 12 + level * 16,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: 4,
          margin: '2px 8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderOutlined style={{ color: '#faad14' }} />
          <span style={{ fontSize: 13 }}>{folder.name}</span>
        </div>
        <Space size={0}>
          <Tooltip title="添加子文件夹">
            <Button 
              type="text" 
              size="small" 
              icon={<FolderAddOutlined />} 
              onClick={e => { e.stopPropagation(); setNewFolderParentId(folder.id); setFolderModalOpen(true); }} 
            />
          </Tooltip>
          <Popconfirm title="删除此文件夹？" onConfirm={() => deleteFolder(folder.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={e => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      </div>,
      ...buildFolderTree(folder.id, level + 1),
    ]);
  };

  const handleCreateBookmark = () => {
    setEditingBookmark(null);
    setFormName('');
    setFormUrl('');
    setFormDescription('');
    setFormFolderId(selectedFolderId === 'all' ? null : selectedFolderId);
    setEditModalOpen(true);
  };

  const handleEditBookmark = (bookmark: Bookmark) => {
    setEditingBookmark(bookmark);
    setFormName(bookmark.name);
    setFormUrl(bookmark.url);
    setFormDescription(bookmark.description);
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
    <Layout style={{ height: '100%' }} className="bookmark-panel">
      {/* 左侧文件夹列表 */}
      <Sider width={260} theme="light" className="bookmark-folder-sider" style={{ borderRight: '1px solid var(--border-color, #f0f0f0)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: '12px', borderBottom: '1px solid var(--border-color, #f0f0f0)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <LinkOutlined style={{ fontSize: 16, color: '#1890ff' }} />
            <span style={{ fontWeight: 500 }}>书签收藏</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', paddingTop: 8 }}>
            <div
              onClick={() => setSelectedFolderId('all')}
              className={`bookmark-folder-item ${selectedFolderId === 'all' ? 'selected' : ''}`}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 4,
                margin: '2px 8px',
              }}
            >
              <GlobalOutlined style={{ color: '#1890ff' }} />
              <span>所有书签</span>
            </div>
            <div
              onClick={() => setSelectedFolderId(null)}
              className={`bookmark-folder-item ${selectedFolderId === null ? 'selected' : ''}`}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 4,
                margin: '2px 8px',
              }}
            >
              <FolderOutlined style={{ color: '#999' }} />
              <span>未分类</span>
            </div>
            <Divider style={{ margin: '12px 0 8px' }} />
            <div style={{ padding: '4px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary, #888)', fontWeight: 500 }}>分类文件夹</span>
              <Tooltip title="新建文件夹">
                <Button type="text" size="small" icon={<FolderAddOutlined />} onClick={() => { setNewFolderParentId(null); setFolderModalOpen(true); }} />
              </Tooltip>
            </div>
            {buildFolderTree(null)}
          </div>
        </div>
      </Sider>

      {/* 右侧书签内容 */}
      <Content className="bookmark-content" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* 工具栏 */}
        <div className="bookmark-toolbar" style={{ 
          padding: '12px 20px', 
          borderBottom: '1px solid var(--border-color, #f0f0f0)', 
          display: 'flex', 
          gap: 12, 
          alignItems: 'center',
        }}>
          <Input
            placeholder="搜索书签..."
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          <Tooltip title="布局列数">
            <Segmented
              value={columns}
              onChange={(v) => handleColumnsChange(v as number)}
              options={[
                { value: 2, icon: <AppstoreOutlined />, label: '2列' },
                { value: 3, icon: <AppstoreOutlined />, label: '3列' },
                { value: 4, icon: <AppstoreOutlined />, label: '4列' },
              ]}
              size="small"
            />
          </Tooltip>
          <div style={{ flex: 1 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateBookmark}>
            添加书签
          </Button>
        </div>

        {/* 书签内容区 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {filteredBookmarks.length === 0 ? (
            <Empty 
              description="暂无书签，点击上方按钮添加" 
              image={Empty.PRESENTED_IMAGE_SIMPLE} 
              style={{ marginTop: 80 }} 
            />
          ) : selectedFolderId === 'all' && groupedBookmarks ? (
            // 分组显示
            <div>
              {Object.entries(groupedBookmarks).map(([groupName, items]) => 
                items.length > 0 && (
                  <div key={groupName} style={{ marginBottom: 24 }}>
                    <div style={{ 
                      fontSize: 14, 
                      fontWeight: 500, 
                      color: '#666', 
                      marginBottom: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <FolderOutlined style={{ color: groupName === '未分类' ? '#999' : '#faad14' }} />
                      {groupName}
                      <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>({items.length})</span>
                    </div>
                    {renderBookmarkGrid(items)}
                  </div>
                )
              )}
            </div>
          ) : (
            // 单文件夹显示
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
