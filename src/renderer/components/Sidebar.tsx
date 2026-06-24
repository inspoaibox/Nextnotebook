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
  NodeIndexOutlined,
  SwapOutlined,
  RightOutlined,
  DownOutlined,
  FileExcelOutlined,
  CloudOutlined,
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
  diagramEnabled?: boolean;
  transferEnabled?: boolean;
  excelEnabled?: boolean;
  cloudDriveEnabled?: boolean;
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
  diagramEnabled,
  transferEnabled,
  excelEnabled,
  cloudDriveEnabled,
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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!selectedFolderId || selectedFolderId === 'uncategorized') {
      return;
    }

    setExpandedFolders(prev => {
      const next = new Set(prev);
      let changed = false;
      let currentId: string | null = selectedFolderId;

      while (currentId) {
        if (!next.has(currentId)) {
          next.add(currentId);
          changed = true;
        }
        const currentFolder = folders.find(folder => folder.id === currentId);
        currentId = currentFolder?.parentId || null;
      }

      return changed ? next : prev;
    });
  }, [folders, selectedFolderId]);

  const expandFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      if (prev.has(folderId)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(folderId);
      return next;
    });
  };

  const handleFolderSelect = (folderId: string) => {
    const hasChildren = folders.some(f => f.parentId === folderId);

    if (hasChildren && selectedFolderId === folderId) {
      setExpandedFolders(prev => {
        const next = new Set(prev);
        if (next.has(folderId)) {
          next.delete(folderId);
        } else {
          next.add(folderId);
        }
        return next;
      });
    } else if (hasChildren) {
      expandFolder(folderId);
    }

    onSelectFolder(folderId);
  };

  // 切换文件夹展开/折叠状态
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
  const buildSubFolderItems = (parentId: string, level: number = 1): MenuProps['items'] => {
    const childFolders = folders.filter(f => f.parentId === parentId);
    
    if (childFolders.length === 0) {
      return [];
    }

    const items: MenuProps['items'] = [];
    // 计算缩进：每级增加 16px
    const indentPadding = level * 16;
    
    childFolders.forEach(folder => {
      const hasChildren = folders.some(f => f.parentId === folder.id);
      const isExpanded = expandedFolders.has(folder.id);
      const isSelected = selectedFolderId === folder.id;

      items.push({
        key: `folder-${folder.id}`,
        label: (
          <Dropdown menu={{ items: getFolderContextMenu(folder) }} trigger={['contextMenu']}>
            <span
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingLeft: indentPadding }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, overflow: 'hidden' }}>
                {isSelected ? <FolderOpenOutlined style={{ color: folder.color || '#1890ff' }} /> : <FolderOutlined style={{ color: folder.color || undefined }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder.name}</span>
              </span>
              {hasChildren && (
                <span 
                  onClick={(e) => toggleFolderExpand(folder.id, e)}
                  style={{ padding: '0 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  {isExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                </span>
              )}
            </span>
          </Dropdown>
        ),
      });

      // 如果展开了，添加子目录
      if (hasChildren && isExpanded) {
        const subItems = buildSubFolderItems(folder.id, level + 1);
        if (subItems) {
          items.push(...subItems);
        }
      }
    });

    return items;
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
    const items: MenuProps['items'] = [];
    
    rootFolders.forEach(folder => {
      const hasChildren = folders.some(f => f.parentId === folder.id);
      const isExpanded = expandedFolders.has(folder.id);
      const isSelected = selectedFolderId === folder.id;

      items.push({
        key: `folder-${folder.id}`,
        icon: isSelected ? <FolderOpenOutlined style={{ color: folder.color || '#1890ff' }} /> : <FolderOutlined style={{ color: folder.color || undefined }} />,
        label: (
          <Dropdown menu={{ items: getFolderContextMenu(folder) }} trigger={['contextMenu']}>
            <span
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder.name}</span>
              {hasChildren && (
                <span 
                  onClick={(e) => toggleFolderExpand(folder.id, e)}
                  style={{ padding: '0 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  {isExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                </span>
              )}
            </span>
          </Dropdown>
        ),
      });

      // 如果展开了，添加子目录
      if (hasChildren && isExpanded) {
        const subItems = buildSubFolderItems(folder.id, 1);
        if (subItems) {
          items.push(...subItems);
        }
      }
    });

    return items;
  };

  // 构建菜单项
  const menuItems: MenuProps['items'] = [
    // 待办事项（固定在顶部）
    ...(todoEnabled ? [{
      key: 'todo',
      icon: <CheckSquareOutlined />,
      label: '待办事项',
    }] : []),
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
    { key: 'template', label: '从模板创建', icon: <FileTextOutlined />, onClick: onCreateNote },
    { key: 'blank', label: '空白笔记', icon: <FileTextOutlined />, onClick: onQuickCreateNote },
    ...(excelEnabled ? [{ 
      key: 'excel', 
      label: 'Excel 笔记', 
      icon: <FileExcelOutlined />,
      onClick: () => onSelectTool?.('excel-create'),
    }] : []),
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    // 处理待办事项菜单点击
    if (key === 'todo') {
      onSelectTool?.('todo');
      return;
    }
    
    // 点击笔记相关菜单时，清除当前工具选择
    if (currentTool) {
      onSelectTool?.(null);
    }
    
    if (key === 'all') {
      onSelectView('all');
      onSelectFolder(null);
    } else if (key === 'uncategorized') {
      // 未分类 - 显示没有文件夹的笔记，使用特殊标识 'uncategorized'
      onSelectFolder('uncategorized');
    } else if (key === 'starred') {
      onSelectView('starred');
    } else if (key === 'trash') {
      onSelectView('trash');
    } else if (key.startsWith('folder-')) {
      const folderId = key.replace('folder-', '');
      handleFolderSelect(folderId);
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
    if (currentTool === 'todo') return ['todo'];
    if (currentTool === 'cloud-drive') return ['cloud-drive'];
    if (selectedView === 'starred') return ['starred'];
    if (selectedView === 'trash') return ['trash'];
    if (selectedFolderId === 'uncategorized') return ['uncategorized'];
    if (selectedFolderId) return [`folder-${selectedFolderId}`];
    return ['all'];
  };

  // 获取所有需要展开的目录 key（标签组）
  const getDefaultOpenKeys = () => {
    const openKeys: string[] = [];
    
    // 展开标签组
    if (tags.length > 0) {
      openKeys.push('tags-group');
    }
    
    return openKeys;
  };


  return (
    <div className="sidebar-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 工具栏区域 - 单行布局 */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color, #f0f0f0)' }}>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
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
          {diagramEnabled && (
            <Tooltip title="脑图">
              <Button
                type={currentTool === 'diagram' ? 'primary' : 'text'}
                icon={<NodeIndexOutlined />}
                size="small"
                onClick={() => onSelectTool?.(currentTool === 'diagram' ? null : 'diagram')}
              />
            </Tooltip>
          )}
          {transferEnabled && (
            <Tooltip title="传输助手">
              <Button
                type={currentTool === 'transfer' ? 'primary' : 'text'}
                icon={<SwapOutlined />}
                size="small"
                onClick={() => onSelectTool?.(currentTool === 'transfer' ? null : 'transfer')}
              />
            </Tooltip>
          )}
          {cloudDriveEnabled && (
            <Tooltip title="网盘">
              <Button
                type={currentTool === 'cloud-drive' ? 'primary' : 'text'}
                icon={<CloudOutlined />}
                size="small"
                onClick={() => onSelectTool?.(currentTool === 'cloud-drive' ? null : 'cloud-drive')}
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
          defaultOpenKeys={getDefaultOpenKeys()}
          onClick={handleMenuClick}
          items={menuItems}
          className="sidebar-menu"
          style={{ background: 'transparent', borderRight: 0 }}
          inlineIndent={16}
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
