import React, { useState } from 'react';
import { Input, List, Typography, Tag, Empty, Dropdown, Button } from 'antd';
import { 
  SearchOutlined, 
  PushpinOutlined, 
  LockOutlined, 
  MoreOutlined, 
  DeleteOutlined, 
  UndoOutlined,
  StarOutlined,
  StarFilled,
  CopyOutlined,
  FolderOutlined,
  PlusOutlined,
  FileAddOutlined,
  SnippetsOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Note } from '../hooks/useNotes';

const { Search } = Input;
const { Text, Paragraph } = Typography;

interface NoteListProps {
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onSearch?: (query: string) => void;
  onDeleteNote?: (noteId: string) => void;
  onRestoreNote?: (noteId: string) => void;
  onToggleStar?: (noteId: string, isStarred: boolean) => void;
  onDuplicateNote?: (noteId: string) => void;
  onMoveToFolder?: (noteId: string) => void;
  onCreateNote?: () => void;
  onCreateTemplateNote?: () => void;
  isTrashView?: boolean;
}

const NoteList: React.FC<NoteListProps> = ({
  notes,
  selectedNoteId,
  onSelectNote,
  onSearch,
  onDeleteNote,
  onRestoreNote,
  onToggleStar,
  onDuplicateNote,
  onMoveToFolder,
  onCreateNote,
  onCreateTemplateNote,
  isTrashView = false,
}) => {
  const [searchText, setSearchText] = useState('');

  const handleSearch = (value: string) => {
    setSearchText(value);
    onSearch?.(value);
  };

  const sortedNotes = [...notes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN');
  };

  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;
    try {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('(' + escaped + ')', 'gi');
      const parts = text.split(regex);
      return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <span key={i} style={{ backgroundColor: '#fff566', padding: '0 2px' }}>{part}</span>
          : part
      );
    } catch {
      return text;
    }
  };

  // 右键菜单项
  const getContextMenuItems = (note: Note): MenuProps['items'] => {
    if (isTrashView) {
      return [
        { key: 'restore', icon: <UndoOutlined />, label: '恢复', onClick: () => onRestoreNote?.(note.id) },
        { type: 'divider' },
        { key: 'delete', icon: <DeleteOutlined />, label: '永久删除', danger: true, onClick: () => onDeleteNote?.(note.id) },
      ];
    }
    return [
      { 
        key: 'star', 
        icon: note.isPinned ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />, 
        label: note.isPinned ? '取消星标' : '添加星标',
        onClick: () => onToggleStar?.(note.id, !note.isPinned),
      },
      { type: 'divider' },
      { key: 'duplicate', icon: <CopyOutlined />, label: '复制笔记', onClick: () => onDuplicateNote?.(note.id) },
      { key: 'move', icon: <FolderOutlined />, label: '移动到文件夹', onClick: () => onMoveToFolder?.(note.id) },
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: () => onDeleteNote?.(note.id) },
    ];
  };

  // 下拉菜单项（更多按钮）
  const getDropdownItems = (note: Note): MenuProps['items'] => {
    if (isTrashView) {
      return [
        { key: 'restore', icon: <UndoOutlined />, label: '恢复', onClick: () => onRestoreNote?.(note.id) },
        { key: 'delete', icon: <DeleteOutlined />, label: '永久删除', danger: true, onClick: () => onDeleteNote?.(note.id) },
      ];
    }
    return [
      { 
        key: 'star', 
        icon: note.isPinned ? <StarFilled /> : <StarOutlined />, 
        label: note.isPinned ? '取消星标' : '添加星标',
        onClick: () => onToggleStar?.(note.id, !note.isPinned),
      },
      { key: 'duplicate', icon: <CopyOutlined />, label: '复制', onClick: () => onDuplicateNote?.(note.id) },
      { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: () => onDeleteNote?.(note.id) },
    ];
  };

  // 列表空白区域右键菜单
  const listContextMenuItems: MenuProps['items'] = [
    { key: 'new', icon: <FileAddOutlined />, label: '新建笔记', onClick: () => onCreateNote?.() },
    { key: 'new-template', icon: <SnippetsOutlined />, label: '从模板新建', onClick: () => onCreateTemplateNote?.() },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Search
          placeholder="搜索笔记..."
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          value={searchText}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearch(e.target.value)}
          allowClear
          size="small"
          style={{ borderRadius: 6, flex: 1 }}
        />
        {!isTrashView && (
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            size="small" 
            onClick={onCreateNote}
            title="新建笔记"
          />
        )}
      </div>
      <Dropdown menu={{ items: listContextMenuItems }} trigger={['contextMenu']} disabled={isTrashView}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {sortedNotes.length === 0 ? (
            <Empty description={isTrashView ? "回收站为空" : "暂无笔记，右键新建"} style={{ marginTop: 40 }} />
          ) : (
            <List
              dataSource={sortedNotes}
              split={false}
              renderItem={(note: Note) => (
                <div onContextMenu={(e) => e.stopPropagation()}>
                  <Dropdown menu={{ items: getContextMenuItems(note) }} trigger={['contextMenu']}>
                    <List.Item
                      className="note-list-item"
                      onClick={() => onSelectNote(note.id)}
                      style={{
                        padding: '10px 12px',
                        margin: '2px 6px',
                        cursor: 'pointer',
                        background: selectedNoteId === note.id ? '#e6f4ff' : 'transparent',
                        borderRadius: 6,
                        border: 'none',
                      }}
                    >
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {note.isPinned && <StarFilled style={{ color: '#faad14', fontSize: 12 }} />}
                          {note.isLocked && <LockOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />}
                          <Text strong ellipsis style={{ flex: 1, fontSize: 13 }}>
                            {searchText ? highlightText(note.title || '无标题', searchText) : (note.title || '无标题')}
                          </Text>
                          <Dropdown menu={{ items: getDropdownItems(note) }} trigger={['click']}>
                            <Button type="text" size="small" icon={<MoreOutlined />} onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{ opacity: 0.5 }} />
                          </Dropdown>
                        </div>
                        <Paragraph ellipsis={{ rows: 1 }} style={{ margin: '4px 0 6px', color: '#8c8c8c', fontSize: 12, lineHeight: 1.4 }}>
                          {searchText ? highlightText(note.content.substring(0, 80) || '空笔记', searchText) : (note.content.substring(0, 80) || '空笔记')}
                        </Paragraph>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>{formatDate(note.updatedAt)}</Text>
                          <div>
                            {note.tags.slice(0, 2).map((tag: string) => (
                              <Tag key={tag} style={{ fontSize: 10, marginRight: 2, padding: '0 4px', lineHeight: '16px' }}>{tag}</Tag>
                            ))}
                          </div>
                        </div>
                      </div>
                    </List.Item>
                  </Dropdown>
                </div>
              )}
            />
          )}
        </div>
      </Dropdown>
    </div>
  );
};

export default NoteList;
