import React, { useState } from 'react';
import { Menu, Button, Dropdown, Input, Modal, message, Tooltip } from 'antd';
import {
  FileTextOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  FolderAddOutlined,
  TagOutlined,
  StarOutlined,
  DeleteOutlined,
  PlusOutlined,
  SettingOutlined,
  EditOutlined,
  RobotOutlined,
  AppstoreOutlined,
  CheckSquareOutlined,
  SafetyOutlined,
  LinkOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Folder } from '../hooks/useFolders';
import { Tag } from '../hooks/useTags';

interface SidebarProps {
  selectedFolderId: string | null;
  selectedView: 'all' | 'starred' | 'trash' | 'folder' | 'tag';
  folders: Folder[];
  tags: Tag[];
  aiEnabled?: boolean;
  todoEnabled?: boolean;
  vaultEnabled?: boolean;
  bookmarkEnabled?: boolean;
  toolboxEnabled?: boolean;
  currentTool?: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onSelectView: (view: 'all' | 'starred' | 'trash') => void;
  onSelectTag: (tagId: string) => void;
  onSelectTool?: (tool: string | null) => void;
  onCreateNote?: () => void;
  onQuickCreateNote?: () => void;
  onCreateFolder?: (name: string, parentId?: string | null) => Promise<void>;
  onDeleteFolder?: (folderId: string) => Promise<void>;
  onRenameFolder?: (folderId: string, newName: string) => Promise<void>;
  onDeleteTag?: (tagId: string) => Promise<void>;
  onOpenSettings?: () => void;
  onSync?: () => void;
  syncStatus?: 'idle' | 'syncing' | 'error' | 'offline';
}

const Sidebar: React.FC<SidebarProps> = ({
  selectedFolderId,
  selectedView,
  folders,
  tags,
  aiEnabled,
  todoEnabled,
  vaultEnabled,
  bookmarkEnabled,
  toolboxEnabled,
  currentTool,
  onSelectFolder,
  onSelectView,
  onSelectTag,
  onSelectTool,
  onCreateNote,
  onQuickCreateNote,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onDeleteTag,
  onOpenSettings,
  onSync,
  syncStatus,
}) => {
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [renameFolderModalOpen, setRenameFolderModalOpen] = useState(false);
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');

  // 目录右键菜单
  const getFolderContextMenu = (folder: Folder): MenuProps['items'] => [
    {
      key: 'newSubfolder',
      icon: <FolderAddOutlined />,
      label: '新建子目录',
      onClick: (e) => {
        e.domEvent.stopPropagation();
        setNewFolderParentId(folder.id);
        setNewFolderModalOpen(true);
      },
    },
    { 
      key: 'rename', 
      icon: <EditOutlined />, 
      label: '重命名',
      onClick: (e) => {
        e.domEvent.stopPropagation();
        setRenameFolderId(folder.id);
        setRenameFolderName(folder.name);
        setRenameFolderModalOpen(true);
      },
    },
    { type: 'divider' },
    { 
      key: 'delete', 
      icon: <DeleteOutlined />, 
      label: '删除',
      danger: true,
      onClick: (e) => {
        e.domEvent.stopPropagation();
        Modal.confirm({
          title: '删除目录',
          content: `确定要删除目录 "${folder.name}" 吗？目录内的笔记不会被删除。`,
          okText: '删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: () => onDeleteFolder?.(folder.id),
        });
      },
    },
  ];

  // 标签右键菜单
  const getTagContextMenu = (tag: Tag): MenuProps['items'] => [
    { 
      key: 'delete', 
      icon: <DeleteOutlined />, 
      label: '删除标签',
      danger: true,
      onClick: (e) => {
        e.domEvent.stopPropagation();
        Modal.confirm({
          title: '删除标签',
          content: `确定要删除标签 "${tag.name}" 吗？`,
          okText: '删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: () => onDeleteTag?.(tag.id),
        });
      },
    },
  ];

  // 递归构建子目录
  const buildSubFolderItems = (parentId: string): MenuProps['items'] => {
    const childFolders = folders.filter(f => f.parentId === parentId);
    
    if (childFolders.length === 0) {
      return undefined;
    }

    return childFolders.map(folder => {
      const subFolders = buildSubFolderItems(folder.id);
      const isSelected = selectedFolderId === folder.id;

      return {
        key: `folder-${folder.id}`,
        icon: isSelected ? <FolderOpenOutlined style={{ color: folder.color || '#1890ff' }} /> : <FolderOutlined style={{ color: folder.color || undefined }} />,
        label: (
          <Dropdown menu={{ items: getFolderContextMenu(folder) }} trigger={['contextMenu']}>
            <span style={{ display: 'block' }}>{folder.name}</span>
          </Dropdown>
        ),
        children: subFolders,
      };
    });
  };

  // 获取一级目录
  const rootFolders = folders.filter(f => f.parentId === null);

  // 构建标签子菜单
  const tagChildren = tags.map(tag => ({
    key: `tag-${tag.id}`,
    icon: <TagOutlined style={{ color: tag.color || '#1890ff' }} />,
    label: (
      <Dropdown menu={{ items: getTagContextMenu(tag) }} trigger={['contextMenu']}>
        <span style={{ display: 'block' }}>{tag.name}</span>
      </Dropdown>
    ),
  }));

  // 构建一级目录列表
  const buildRootFolderItems = (): MenuProps['items'] => {
    return rootFolders.map(folder => {
      const subFolders = buildSubFolderItems(folder.id);
      const isSelected = selectedFolderId === folder.id;

      return {
        key: `folder-${folder.id}`,
        icon: isSelected ? <FolderOpenOutlined style={{ color: folder.color || '#1890ff' }} /> : <FolderOutlined style={{ color: folder.color || undefined }} />,
        label: (
          <Dropdown menu={{ items: getFolderContextMenu(folder) }} trigger={['contextMenu']}>
            <span style={{ display: 'block' }}>{folder.name}</span>
          </Dropdown>
        ),
        children: subFolders,
      };
    });
  };

  // 构建菜单项
  const menuItems: MenuProps['items'] = [
    // 所有笔记（带添加目录按钮）
    { 
      key: 'all', 
      icon: <FileTextOutlined />, 
      label: (
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span>所有笔记</span>
          <FolderAddOutlined 
            onClick={(e) => {
              e.stopPropagation();
              setNewFolderParentId(null);
              setNewFolderModalOpen(true);
            }}
            style={{ cursor: 'pointer', color: '#1890ff' }}
            title="添加目录"
          />
        </span>
      ),
    },
    // 未分类
    {
      key: 'uncategorized',
      icon: <FolderOutlined style={{ color: '#999' }} />,
      label: '未分类',
    },
    // 一级目录
    ...(buildRootFolderItems() || []),
    { type: 'divider' },
    // 星标笔记
    { key: 'starred', icon: <StarOutlined />, label: '星标笔记' },
    // 标签
    { 
      key: 'tags-group', 
      icon: <TagOutlined />, 
      label: '标签',
      children: tagChildren.length > 0 ? tagChildren : [
        { key: 'no-tags', label: '暂无标签', disabled: true }
      ],
    },
    { type: 'divider' },
    // 回收站
    { key: 'trash', icon: <DeleteOutlined />, label: '回收站' },
  ];

  const createMenuItems: MenuProps['items'] = [
    { key: 'template', label: '从模板创建', onClick: onCreateNote },
    { key: 'blank', label: '空白笔记', onClick: onQuickCreateNote },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    // 点击笔记相关菜单时，清除当前工具选择
    if (currentTool) {
      onSelectTool?.(null);
    }
    
    if (key === 'all') {
      onSelectView('all');
      onSelectFolder(null);
    } else if (key === 'uncategorized') {
      // 未分类 - 显示没有文件夹的笔记
      onSelectView('all');
      onSelectFolder(null);
    } else if (key === 'starred') {
      onSelectView('starred');
    } else if (key === 'trash') {
      onSelectView('trash');
    } else if (key.startsWith('folder-')) {
      const folderId = key.replace('folder-', '');
      onSelectFolder(folderId);
    } else if (key.startsWith('tag-')) {
      const tagId = key.replace('tag-', '');
      onSelectTag(tagId);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      message.warning('请输入目录名称');
      return;
    }
    if (onCreateFolder) {
      await onCreateFolder(newFolderName.trim(), newFolderParentId);
      setNewFolderName('');
      setNewFolderParentId(null);
      setNewFolderModalOpen(false);
      message.success('目录已创建');
    }
  };

  const handleRenameFolder = async () => {
    if (!renameFolderName.trim()) {
      message.warning('请输入目录名称');
      return;
    }
    if (onRenameFolder && renameFolderId) {
      await onRenameFolder(renameFolderId, renameFolderName.trim());
      setRenameFolderName('');
      setRenameFolderId(null);
      setRenameFolderModalOpen(false);
      message.success('目录已重命名');
    }
  };

  // 计算选中的 key
  const getSelectedKeys = () => {
    if (selectedView === 'starred') return ['starred'];
    if (selectedView === 'trash') return ['trash'];
    if (selectedFolderId) return [`folder-${selectedFolderId}`];
    return ['all'];
  };


  return (
    <div className="sidebar-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 工具栏区域 - 单行布局 */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color, #f0f0f0)' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {aiEnabled && (
            <Tooltip title="智能助理">
              <Button
                type={currentTool === 'ai' ? 'primary' : 'text'}
                icon={<RobotOutlined />}
                size="small"
                onClick={() => onSelectTool?.(currentTool === 'ai' ? null : 'ai')}
              />
            </Tooltip>
          )}
          {todoEnabled && (
            <Tooltip title="待办事项">
              <Button
                type={currentTool === 'todo' ? 'primary' : 'text'}
                icon={<CheckSquareOutlined />}
                size="small"
                onClick={() => onSelectTool?.(currentTool === 'todo' ? null : 'todo')}
              />
            </Tooltip>
          )}
          {vaultEnabled && (
            <Tooltip title="密码库">
              <Button
                type={currentTool === 'vault' ? 'primary' : 'text'}
                icon={<SafetyOutlined />}
                size="small"
                onClick={() => onSelectTool?.(currentTool === 'vault' ? null : 'vault')}
              />
            </Tooltip>
          )}
          {bookmarkEnabled && (
            <Tooltip title="书签">
              <Button
                type={currentTool === 'bookmark' ? 'primary' : 'text'}
                icon={<LinkOutlined />}
                size="small"
                onClick={() => onSelectTool?.(currentTool === 'bookmark' ? null : 'bookmark')}
              />
            </Tooltip>
          )}
          {toolboxEnabled && (
            <Tooltip title="工具箱">
              <Button
                type={currentTool === 'toolbox' ? 'primary' : 'text'}
                icon={<AppstoreOutlined />}
                size="small"
                onClick={() => onSelectTool?.(currentTool === 'toolbox' ? null : 'toolbox')}
              />
            </Tooltip>
          )}
        </div>
      </div>
      
      {/* 新建笔记按钮 */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
        <Dropdown menu={{ items: createMenuItems }} trigger={['click']}>
          <Button type="primary" icon={<PlusOutlined />} size="small" style={{ width: '100%' }}>
            新建笔记
          </Button>
        </Dropdown>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Menu
          mode="inline"
          selectedKeys={getSelectedKeys()}
          onClick={handleMenuClick}
          items={menuItems}
          className="sidebar-menu"
          style={{ background: 'transparent', borderRight: 0 }}
        />
      </div>
      
      <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
        <Tooltip title="设置">
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={onOpenSettings}
            size="small"
            style={{ color: '#666' }}
          />
        </Tooltip>
        <Tooltip title={syncStatus === 'syncing' ? '同步中...' : '立即同步'}>
          <Button
            type="text"
            icon={<SyncOutlined spin={syncStatus === 'syncing'} />}
            onClick={onSync}
            size="small"
            style={{ color: syncStatus === 'error' ? '#ff4d4f' : '#666' }}
            disabled={syncStatus === 'syncing'}
          />
        </Tooltip>
      </div>

      <Modal
        title={newFolderParentId ? "新建子目录" : "新建目录"}
        open={newFolderModalOpen}
        onOk={handleCreateFolder}
        onCancel={() => {
          setNewFolderModalOpen(false);
          setNewFolderName('');
          setNewFolderParentId(null);
        }}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="目录名称"
          value={newFolderName}
          onChange={e => setNewFolderName(e.target.value)}
          onPressEnter={handleCreateFolder}
          autoFocus
        />
      </Modal>

      <Modal
        title="重命名目录"
        open={renameFolderModalOpen}
        onOk={handleRenameFolder}
        onCancel={() => {
          setRenameFolderModalOpen(false);
          setRenameFolderName('');
          setRenameFolderId(null);
        }}
        okText="确定"
        cancelText="取消"
      >
        <Input
          placeholder="目录名称"
          value={renameFolderName}
          onChange={e => setRenameFolderName(e.target.value)}
          onPressEnter={handleRenameFolder}
          autoFocus
        />
      </Modal>
    </div>
  );
};

export default Sidebar;
