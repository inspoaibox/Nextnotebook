import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Empty, Tabs, Space, Button, Tooltip, message, Modal, Tag as AntTag, Input, Select, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  EditOutlined,
  EyeOutlined,
  SaveOutlined,
  MoreOutlined,
  StarOutlined,
  StarFilled,
  TagOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  ExportOutlined,
  InfoCircleOutlined,
  UnorderedListOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { Tag } from '../hooks/useTags';

// TOC 项目接口
interface TocItem {
  id: string;
  level: number;
  text: string;
}

// 从 Markdown 内容提取标题
const extractHeadings = (content: string): TocItem[] => {
  const headings: TocItem[] = [];
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      // 生成唯一 ID
      const id = `heading-${index}-${text.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-').toLowerCase()}`;
      headings.push({ id, level, text });
    }
  });
  
  return headings;
};

// TOC 组件
interface TocPanelProps {
  headings: TocItem[];
  onItemClick: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const TocPanel: React.FC<TocPanelProps> = ({ headings, onItemClick, collapsed, onToggle }) => {
  if (headings.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        width: collapsed ? 32 : 200,
        height: '100%',
        background: 'var(--bg-secondary, #fafafa)',
        borderLeft: '1px solid var(--border-color, #f0f0f0)',
        transition: 'width 0.2s ease',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '8px',
          borderBottom: '1px solid var(--border-color, #f0f0f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
        }}
      >
        {!collapsed && (
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary, #888)' }}>
            <UnorderedListOutlined style={{ marginRight: 4 }} />
            目录
          </span>
        )}
        <Tooltip title={collapsed ? '展开目录' : '收起目录'}>
          <Button
            type="text"
            size="small"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={onToggle}
          />
        </Tooltip>
      </div>
      {!collapsed && (
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {headings.map((item) => (
            <div
              key={item.id}
              onClick={() => onItemClick(item.id)}
              style={{
                padding: '4px 12px',
                paddingLeft: 12 + (item.level - 1) * 12,
                fontSize: item.level === 1 ? 13 : 12,
                fontWeight: item.level <= 2 ? 500 : 400,
                color: item.level === 1 ? 'var(--text-primary, #333)' : 'var(--text-secondary, #666)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                borderLeft: item.level === 1 ? '2px solid #1890ff' : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--item-hover-bg, #f5f5f5)';
                e.currentTarget.style.color = '#1890ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = item.level === 1 ? 'var(--text-primary, #333)' : 'var(--text-secondary, #666)';
              }}
              title={item.text}
            >
              {item.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface EditorProps {
  noteId: string | null;
  note?: {
    id: string;
    title: string;
    content: string;
    isPinned: boolean;
    tags: string[];
    createdAt?: number;
    updatedAt?: number;
  } | null;
  onSave?: (id: string, content: string, title: string) => Promise<void>;
  onToggleStar?: (id: string, isStarred: boolean) => Promise<void>;
  onUpdateTags?: (noteId: string, tags: string[]) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onDuplicate?: (id: string) => Promise<void>;
  allTags?: Tag[];
  onCreateTag?: (name: string, color?: string | null) => Promise<Tag | null>;
  isTrashView?: boolean;
}

const Editor: React.FC<EditorProps> = ({ 
  noteId, 
  note, 
  onSave, 
  onToggleStar, 
  onUpdateTags,
  onDelete,
  onDuplicate,
  allTags = [],
  onCreateTag,
  isTrashView = false,
}) => {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [activeTab, setActiveTab] = useState('edit');
  const [isDirty, setIsDirty] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  // 提取标题生成目录
  const headings = useMemo(() => extractHeadings(content), [content]);

  // 点击目录项滚动到对应位置
  const handleTocItemClick = useCallback((id: string) => {
    if (!previewRef.current) return;
    const element = previewRef.current.querySelector(`[data-heading-id="${id}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // 加载笔记内容
  useEffect(() => {
    if (note) {
      setContent(note.content);
      setTitle(note.title);
      setSelectedTags(note.tags || []);
      setIsDirty(false);
    }
  }, [note]);

  // 自动保存（防抖）
  const scheduleAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      if (isDirty && noteId && onSave) {
        await onSave(noteId, content, title);
        setIsDirty(false);
        message.success('已自动保存', 1);
      }
    }, 2000);
  }, [isDirty, noteId, content, title, onSave]);

  useEffect(() => {
    if (isDirty) {
      scheduleAutoSave();
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [isDirty, scheduleAutoSave]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setIsDirty(true);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setIsDirty(true);
  };

  const handleManualSave = async () => {
    if (noteId && onSave) {
      await onSave(noteId, content, title);
      setIsDirty(false);
      message.success('保存成功');
    }
  };

  const handleToggleStar = async () => {
    if (noteId && note && onToggleStar) {
      await onToggleStar(noteId, !note.isPinned);
    }
  };

  const handleOpenTagModal = () => {
    setSelectedTags(note?.tags || []);
    setTagModalOpen(true);
  };

  const handleSaveTags = async () => {
    if (noteId && onUpdateTags) {
      await onUpdateTags(noteId, selectedTags);
    }
    setTagModalOpen(false);
  };

  const handleAddNewTag = async () => {
    if (!newTagName.trim()) return;
    
    if (onCreateTag) {
      const newTag = await onCreateTag(newTagName.trim());
      if (newTag) {
        setSelectedTags([...selectedTags, newTag.id]);
        setNewTagName('');
      }
    }
  };

  const handleRemoveTag = (tagId: string) => {
    setSelectedTags(selectedTags.filter(id => id !== tagId));
  };

  const handleSelectTag = (tagId: string) => {
    if (!selectedTags.includes(tagId)) {
      setSelectedTags([...selectedTags, tagId]);
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: '删除笔记',
      content: '确定要删除这篇笔记吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        if (noteId && onDelete) {
          onDelete(noteId);
        }
      },
    });
  };

  const handleDuplicate = () => {
    if (noteId && onDuplicate) {
      onDuplicate(noteId);
    }
  };

  const handleExport = () => {
    if (!note) return;
    const blob = new Blob([`# ${title}\n\n${content}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || '未命名笔记'}.md`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('导出成功');
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '未知';
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const moreMenuItems: MenuProps['items'] = [
    { key: 'duplicate', icon: <CopyOutlined />, label: '复制笔记', onClick: handleDuplicate },
    { key: 'export', icon: <ExportOutlined />, label: '导出为 Markdown', onClick: handleExport },
    { key: 'info', icon: <InfoCircleOutlined />, label: '笔记信息', onClick: () => setInfoModalOpen(true) },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除笔记', danger: true, onClick: handleDelete },
  ];

  if (!noteId || !note) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Empty description="选择或创建一个笔记开始编辑" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 工具栏 */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <input
          value={title}
          onChange={handleTitleChange}
          style={{
            border: 'none',
            outline: 'none',
            fontSize: 18,
            fontWeight: 600,
            flex: 1,
            marginRight: 16,
          }}
          placeholder="笔记标题"
        />
        <Space>
          {!isTrashView && (
            <>
              <Tooltip title={note.isPinned ? '取消星标' : '添加星标'}>
                <Button
                  icon={note.isPinned ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                  type="text"
                  onClick={handleToggleStar}
                />
              </Tooltip>
              <Tooltip title="标签">
                <Button 
                  icon={<TagOutlined />} 
                  type="text" 
                  onClick={handleOpenTagModal}
                >
                  {note.tags.length > 0 && <span style={{ marginLeft: 4 }}>{note.tags.length}</span>}
                </Button>
              </Tooltip>
              <Tooltip title={isDirty ? '保存 (有未保存更改)' : '保存'}>
                <Button
                  icon={<SaveOutlined />}
                  type={isDirty ? 'primary' : 'text'}
                  onClick={handleManualSave}
                />
              </Tooltip>
            </>
          )}
          <Tooltip title="更多">
            <Dropdown menu={{ items: moreMenuItems }} trigger={['click']}>
              <Button icon={<MoreOutlined />} type="text" />
            </Dropdown>
          </Tooltip>
        </Space>
      </div>

      {/* 编辑/预览切换 */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ padding: '0 16px' }}
        items={[
          { key: 'edit', label: <span><EditOutlined /> 编辑</span> },
          { key: 'preview', label: <span><EyeOutlined /> 预览</span> },
          { key: 'split', label: <span>分屏</span> },
        ]}
      />

      {/* 编辑区域 */}
      <div style={{ flex: 1, padding: '16px', overflow: 'hidden', display: 'flex' }}>
        {activeTab === 'edit' && (
          <textarea
            value={content}
            onChange={handleContentChange}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontFamily: 'Monaco, Consolas, "Courier New", monospace',
              fontSize: 14,
              lineHeight: 1.6,
            }}
            placeholder="开始编写 Markdown..."
          />
        )}
        {activeTab === 'preview' && (
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <div 
              ref={previewRef}
              style={{ 
                width: headings.length > 0 ? 'calc(100% - 200px)' : '100%', 
                height: '100%', 
                overflow: 'auto', 
                lineHeight: 1.8,
                paddingRight: headings.length > 0 && !tocCollapsed ? 16 : 0,
                transition: 'width 0.2s ease',
              }}
            >
              <ReactMarkdown
                components={{
                  h1: ({ children }) => {
                    const text = String(children);
                    const id = headings.find(h => h.text === text && h.level === 1)?.id || '';
                    return <h1 data-heading-id={id}>{children}</h1>;
                  },
                  h2: ({ children }) => {
                    const text = String(children);
                    const id = headings.find(h => h.text === text && h.level === 2)?.id || '';
                    return <h2 data-heading-id={id}>{children}</h2>;
                  },
                  h3: ({ children }) => {
                    const text = String(children);
                    const id = headings.find(h => h.text === text && h.level === 3)?.id || '';
                    return <h3 data-heading-id={id}>{children}</h3>;
                  },
                  h4: ({ children }) => {
                    const text = String(children);
                    const id = headings.find(h => h.text === text && h.level === 4)?.id || '';
                    return <h4 data-heading-id={id}>{children}</h4>;
                  },
                  h5: ({ children }) => {
                    const text = String(children);
                    const id = headings.find(h => h.text === text && h.level === 5)?.id || '';
                    return <h5 data-heading-id={id}>{children}</h5>;
                  },
                  h6: ({ children }) => {
                    const text = String(children);
                    const id = headings.find(h => h.text === text && h.level === 6)?.id || '';
                    return <h6 data-heading-id={id}>{children}</h6>;
                  },
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
            {headings.length > 0 && (
              <TocPanel
                headings={headings}
                onItemClick={handleTocItemClick}
                collapsed={tocCollapsed}
                onToggle={() => setTocCollapsed(!tocCollapsed)}
              />
            )}
          </div>
        )}
        {activeTab === 'split' && (
          <>
            <textarea
              value={content}
              onChange={handleContentChange}
              style={{
                width: '50%',
                height: '100%',
                border: 'none',
                borderRight: '1px solid #f0f0f0',
                outline: 'none',
                resize: 'none',
                fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                fontSize: 14,
                lineHeight: 1.6,
                paddingRight: 16,
              }}
              placeholder="开始编写 Markdown..."
            />
            <div 
              ref={previewRef}
              style={{ width: '50%', height: '100%', overflow: 'auto', paddingLeft: 16, lineHeight: 1.8, position: 'relative' }}
            >
              <ReactMarkdown
                components={{
                  h1: ({ children }) => {
                    const text = String(children);
                    const id = headings.find(h => h.text === text && h.level === 1)?.id || '';
                    return <h1 data-heading-id={id}>{children}</h1>;
                  },
                  h2: ({ children }) => {
                    const text = String(children);
                    const id = headings.find(h => h.text === text && h.level === 2)?.id || '';
                    return <h2 data-heading-id={id}>{children}</h2>;
                  },
                  h3: ({ children }) => {
                    const text = String(children);
                    const id = headings.find(h => h.text === text && h.level === 3)?.id || '';
                    return <h3 data-heading-id={id}>{children}</h3>;
                  },
                  h4: ({ children }) => {
                    const text = String(children);
                    const id = headings.find(h => h.text === text && h.level === 4)?.id || '';
                    return <h4 data-heading-id={id}>{children}</h4>;
                  },
                  h5: ({ children }) => {
                    const text = String(children);
                    const id = headings.find(h => h.text === text && h.level === 5)?.id || '';
                    return <h5 data-heading-id={id}>{children}</h5>;
                  },
                  h6: ({ children }) => {
                    const text = String(children);
                    const id = headings.find(h => h.text === text && h.level === 6)?.id || '';
                    return <h6 data-heading-id={id}>{children}</h6>;
                  },
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </>
        )}
      </div>

      {/* 标签编辑 Modal */}
      <Modal
        title="编辑标签"
        open={tagModalOpen}
        onOk={handleSaveTags}
        onCancel={() => setTagModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>当前标签：</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {selectedTags.length === 0 ? (
              <span style={{ color: '#999' }}>暂无标签</span>
            ) : (
              selectedTags.map(tagId => {
                const tag = allTags.find(t => t.id === tagId);
                return tag ? (
                  <AntTag
                    key={tagId}
                    color={tag.color || 'blue'}
                    closable
                    onClose={() => handleRemoveTag(tagId)}
                  >
                    {tag.name}
                  </AntTag>
                ) : null;
              })
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>选择已有标签：</div>
          <Select
            style={{ width: '100%' }}
            placeholder="选择标签"
            value={undefined}
            onChange={handleSelectTag}
            options={allTags
              .filter(tag => !selectedTags.includes(tag.id))
              .map(tag => ({
                value: tag.id,
                label: (
                  <span>
                    <TagOutlined style={{ color: tag.color || '#1890ff', marginRight: 8 }} />
                    {tag.name}
                  </span>
                ),
              }))}
          />
        </div>

        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>创建新标签：</div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="输入新标签名称"
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onPressEnter={handleAddNewTag}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddNewTag}>
              添加
            </Button>
          </Space.Compact>
        </div>
      </Modal>

      {/* 笔记信息 Modal */}
      <Modal
        title="笔记信息"
        open={infoModalOpen}
        onCancel={() => setInfoModalOpen(false)}
        footer={<Button onClick={() => setInfoModalOpen(false)}>关闭</Button>}
      >
        <div style={{ lineHeight: 2 }}>
          <p><strong>标题：</strong>{title || '无标题'}</p>
          <p><strong>字数：</strong>{content.length} 字</p>
          <p><strong>创建时间：</strong>{formatDate(note?.createdAt)}</p>
          <p><strong>修改时间：</strong>{formatDate(note?.updatedAt)}</p>
          <p><strong>标签数：</strong>{note?.tags?.length || 0}</p>
        </div>
      </Modal>
    </div>
  );
};

export default Editor;
