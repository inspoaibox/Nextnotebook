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
  LockOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Tag } from '../hooks/useTags';
import MarkdownToolbar from './MarkdownToolbar';

// 资源图片组件 - 处理 resource:// 协议的图片
const ResourceImage: React.FC<{ src?: string; alt?: string; title?: string }> = ({ src, alt, title }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setLoading(false);
      setError(true);
      return;
    }

    // 检查是否是 resource:// 协议
    if (src.startsWith('resource://')) {
      const resourcePath = src.replace('resource://', '');
      // 解析资源 ID 和扩展名
      const lastDotIndex = resourcePath.lastIndexOf('.');
      const resourceId = lastDotIndex > 0 ? resourcePath.substring(0, lastDotIndex) : resourcePath;
      const ext = lastDotIndex > 0 ? resourcePath.substring(lastDotIndex) : '.png';

      // 通过 IPC 读取资源文件
      (window as any).electron.resource.read(resourceId, ext)
        .then((base64Data: string | null) => {
          if (base64Data) {
            // 根据扩展名确定 MIME 类型
            const mimeType = ext === '.png' ? 'image/png' 
              : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
              : ext === '.gif' ? 'image/gif'
              : ext === '.webp' ? 'image/webp'
              : ext === '.svg' ? 'image/svg+xml'
              : 'image/png';
            setImageSrc(`data:${mimeType};base64,${base64Data}`);
            setError(false);
          } else {
            setError(true);
          }
          setLoading(false);
        })
        .catch(() => {
          setError(true);
          setLoading(false);
        });
    } else {
      // 普通 URL，直接使用
      setImageSrc(src);
      setLoading(false);
    }
  }, [src]);

  if (loading) {
    return <span style={{ color: '#999', fontSize: 12 }}>加载图片中...</span>;
  }

  if (error || !imageSrc) {
    return (
      <span style={{ 
        display: 'inline-block', 
        padding: '8px 12px', 
        background: '#fff2f0', 
        border: '1px solid #ffccc7',
        borderRadius: 4,
        color: '#ff4d4f',
        fontSize: 12 
      }}>
        ❌ 图片加载失败: {alt || src}
      </span>
    );
  }

  return (
    <img 
      src={imageSrc} 
      alt={alt || ''} 
      title={title || ''} 
      style={{ maxWidth: '100%', height: 'auto' }}
    />
  );
};

// 资源链接组件 - 处理 resource:// 协议的附件链接
const ResourceLink: React.FC<{ href?: string; children?: React.ReactNode }> = ({ href, children }) => {
  const [downloading, setDownloading] = useState(false);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    if (!href || !href.startsWith('resource://')) {
      return; // 普通链接，使用默认行为
    }
    
    e.preventDefault();
    
    const resourcePath = href.replace('resource://', '');
    const lastDotIndex = resourcePath.lastIndexOf('.');
    const resourceId = lastDotIndex > 0 ? resourcePath.substring(0, lastDotIndex) : resourcePath;
    const ext = lastDotIndex > 0 ? resourcePath.substring(lastDotIndex) : '';
    
    setDownloading(true);
    
    try {
      // 获取资源文件路径
      const filePath = await (window as any).electron.resource.getPath(resourceId, ext);
      
      if (filePath) {
        // 使用系统默认程序打开文件
        const result = await (window as any).electronAPI.openPath(filePath);
        if (result) {
          // openPath 返回错误信息字符串，空字符串表示成功
          message.error(`打开附件失败: ${result}`);
        }
      } else {
        message.error('附件文件不存在');
      }
    } catch (error) {
      console.error('Failed to open attachment:', error);
      message.error('打开附件失败');
    } finally {
      setDownloading(false);
    }
  }, [href]);

  // 如果不是 resource:// 协议，返回普通链接
  if (!href || !href.startsWith('resource://')) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }

  return (
    <a 
      href={href}
      onClick={handleClick}
      style={{ 
        cursor: downloading ? 'wait' : 'pointer',
        color: '#1890ff',
        textDecoration: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        background: '#f5f5f5',
        borderRadius: 4,
        border: '1px solid #d9d9d9',
      }}
      title="点击打开附件"
    >
      {children}
      {downloading && <span style={{ fontSize: 12, color: '#999' }}> (打开中...)</span>}
    </a>
  );
};

// 计算密码哈希（使用 Web Crypto API，与 Android 端保持一致，使用 SHA-256）
const computePasswordHash = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// TOC 项目接口
interface TocItem {
  id: string;
  level: number;
  text: string;
}

// 从 Markdown 内容提取标题（过滤代码块中的内容）
const extractHeadings = (content: string): TocItem[] => {
  const headings: TocItem[] = [];
  const lines = content.split('\n');
  
  let inCodeBlock = false;
  
  lines.forEach((line, index) => {
    // 检测代码块的开始和结束（支持 ``` 和 ~~~）
    if (line.trim().startsWith('```') || line.trim().startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
      return;
    }
    
    // 如果在代码块内，跳过
    if (inCodeBlock) {
      return;
    }
    
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
    isLocked: boolean;
    lockPasswordHash: string | null;
    tags: string[];
    createdAt?: number;
    updatedAt?: number;
  } | null;
  onSave?: (id: string, content: string, title: string) => Promise<void>;
  onToggleStar?: (id: string, isStarred: boolean) => Promise<void>;
  onUpdateTags?: (noteId: string, tags: string[]) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onDuplicate?: (id: string) => Promise<void>;
  onLockNote?: (id: string, passwordHash: string) => Promise<void>;
  onUnlockNote?: (id: string) => Promise<void>;
  onUploadImage?: (file: File) => Promise<string | null>;
  onUploadAttachment?: (file: File) => Promise<{ url: string; name: string } | null>;
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
  onLockNote,
  onUnlockNote,
  onUploadImage,
  onUploadAttachment,
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  
  // 笔记加密相关状态
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [showLockDialog, setShowLockDialog] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const [lockPasswordConfirm, setLockPasswordConfirm] = useState('');
  const [lockError, setLockError] = useState('');
  // 删除加密笔记验证状态
  const [showDeletePasswordDialog, setShowDeletePasswordDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');

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
      // 如果笔记已加密，重置解锁状态
      if (note.isLocked) {
        setIsUnlocked(false);
        setUnlockPassword('');
        setUnlockError('');
      } else {
        setIsUnlocked(true);
      }
    }
  }, [note]);

  // 验证密码并解锁笔记
  const handleUnlock = useCallback(async () => {
    if (!note || !note.lockPasswordHash) return;
    
    const inputHash = await computePasswordHash(unlockPassword);
    if (inputHash === note.lockPasswordHash) {
      setIsUnlocked(true);
      setUnlockError('');
      setUnlockPassword('');
    } else {
      setUnlockError('密码错误，请重试');
    }
  }, [note, unlockPassword]);

  // 锁定笔记
  const handleLockNote = useCallback(async () => {
    if (!noteId || !onLockNote) return;
    
    if (lockPassword.length < 4) {
      setLockError('密码至少 4 位');
      return;
    }
    if (lockPassword !== lockPasswordConfirm) {
      setLockError('两次密码不一致');
      return;
    }
    
    const passwordHash = await computePasswordHash(lockPassword);
    await onLockNote(noteId, passwordHash);
    setShowLockDialog(false);
    setLockPassword('');
    setLockPasswordConfirm('');
    setLockError('');
    message.success('笔记已加密');
  }, [noteId, onLockNote, lockPassword, lockPasswordConfirm]);

  // 解除笔记锁定
  const handleRemoveLock = useCallback(async () => {
    if (!noteId || !onUnlockNote) return;
    await onUnlockNote(noteId);
    setIsUnlocked(true);
    message.success('已解除加密');
  }, [noteId, onUnlockNote]);

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

  // 处理粘贴事件（支持图片粘贴）
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items || !onUploadImage) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          setUploading(true);
          message.loading({ content: '正在上传图片...', key: 'upload' });
          try {
            const url = await onUploadImage(file);
            if (url) {
              const textarea = textareaRef.current;
              if (textarea) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const imageMarkdown = `![图片](${url})`;
                const newContent = content.substring(0, start) + imageMarkdown + content.substring(end);
                setContent(newContent);
                setIsDirty(true);
                message.success({ content: '图片上传成功', key: 'upload' });
                // 设置光标位置
                setTimeout(() => {
                  textarea.focus();
                  const newPos = start + imageMarkdown.length;
                  textarea.setSelectionRange(newPos, newPos);
                }, 0);
              }
            } else {
              message.error({ content: '图片上传失败', key: 'upload' });
            }
          } catch (err) {
            message.error({ content: '图片上传失败', key: 'upload' });
          } finally {
            setUploading(false);
          }
        }
        return;
      }
    }
  }, [content, onUploadImage]);

  // 手动保存函数（需要在 handleKeyDown 之前定义）
  const handleManualSave = useCallback(async () => {
    if (noteId && onSave) {
      await onSave(noteId, content, title);
      setIsDirty(false);
      message.success('保存成功');
    }
  }, [noteId, onSave, content, title]);

  // 处理键盘快捷键
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { ctrlKey, metaKey, key, shiftKey } = e;
    const isModKey = ctrlKey || metaKey;

    if (isModKey) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = content.substring(start, end);

      const wrapText = (before: string, after: string) => {
        e.preventDefault();
        const newContent = content.substring(0, start) + before + selectedText + after + content.substring(end);
        setContent(newContent);
        setIsDirty(true);
        setTimeout(() => {
          textarea.focus();
          if (selectedText) {
            textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
          } else {
            textarea.setSelectionRange(start + before.length, start + before.length);
          }
        }, 0);
      };

      switch (key.toLowerCase()) {
        case 'b': // 粗体
          wrapText('**', '**');
          break;
        case 'i': // 斜体
          wrapText('*', '*');
          break;
        case 'k': // 链接
          e.preventDefault();
          const linkText = selectedText || '链接文本';
          const newContent = content.substring(0, start) + `[${linkText}](url)` + content.substring(end);
          setContent(newContent);
          setIsDirty(true);
          setTimeout(() => {
            textarea.focus();
            // 选中 url 部分
            const urlStart = start + linkText.length + 3;
            textarea.setSelectionRange(urlStart, urlStart + 3);
          }, 0);
          break;
        case 's': // 保存
          if (!shiftKey) {
            e.preventDefault();
            handleManualSave();
          }
          break;
      }
    }

    // Tab 键插入空格
    if (key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const spaces = '  '; // 2 空格
      const newContent = content.substring(0, start) + spaces + content.substring(end);
      setContent(newContent);
      setIsDirty(true);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + spaces.length, start + spaces.length);
      }, 0);
    }
  }, [content, handleManualSave]);

  // 处理图片上传按钮点击
  const handleInsertImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && onUploadImage) {
        setUploading(true);
        message.loading({ content: '正在上传图片...', key: 'upload' });
        try {
          const url = await onUploadImage(file);
          if (url) {
            const textarea = textareaRef.current;
            if (textarea) {
              const start = textarea.selectionStart;
              const imageMarkdown = `![${file.name}](${url})`;
              const newContent = content.substring(0, start) + imageMarkdown + content.substring(start);
              setContent(newContent);
              setIsDirty(true);
              message.success({ content: '图片上传成功', key: 'upload' });
            }
          } else {
            message.error({ content: '图片上传失败', key: 'upload' });
          }
        } catch (err) {
          message.error({ content: '图片上传失败', key: 'upload' });
        } finally {
          setUploading(false);
        }
      }
    };
    input.click();
  }, [content, onUploadImage]);

  // 处理附件上传按钮点击
  const handleInsertAttachment = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && onUploadAttachment) {
        setUploading(true);
        message.loading({ content: '正在上传附件...', key: 'upload' });
        try {
          const result = await onUploadAttachment(file);
          if (result) {
            const textarea = textareaRef.current;
            if (textarea) {
              const start = textarea.selectionStart;
              const attachmentMarkdown = `[📎 ${result.name}](${result.url})`;
              const newContent = content.substring(0, start) + attachmentMarkdown + content.substring(start);
              setContent(newContent);
              setIsDirty(true);
              message.success({ content: '附件上传成功', key: 'upload' });
            }
          } else {
            message.error({ content: '附件上传失败', key: 'upload' });
          }
        } catch (err) {
          message.error({ content: '附件上传失败', key: 'upload' });
        } finally {
          setUploading(false);
        }
      }
    };
    input.click();
  }, [content, onUploadAttachment]);

  // 切换全屏
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setIsDirty(true);
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
    // 如果笔记已加密且未解锁，需要先验证密码
    if (note?.isLocked && !isUnlocked) {
      setShowDeletePasswordDialog(true);
      setDeletePassword('');
      setDeletePasswordError('');
      return;
    }
    
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

  // 验证密码后删除加密笔记
  const handleDeleteWithPassword = useCallback(async () => {
    if (!note || !note.lockPasswordHash) return;
    
    const inputHash = await computePasswordHash(deletePassword);
    if (inputHash === note.lockPasswordHash) {
      setShowDeletePasswordDialog(false);
      setDeletePassword('');
      setDeletePasswordError('');
      // 密码验证通过，执行删除
      if (noteId && onDelete) {
        await onDelete(noteId);
      }
    } else {
      setDeletePasswordError('密码错误，请重试');
    }
  }, [note, deletePassword, noteId, onDelete]);

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
    note?.isLocked 
      ? { key: 'unlock', icon: <UnlockOutlined />, label: '解除加密', onClick: handleRemoveLock }
      : { key: 'lock', icon: <LockOutlined />, label: '加密笔记', onClick: () => setShowLockDialog(true) },
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

  // 如果笔记已加密且未解锁，显示密码验证界面
  if (note.isLocked && !isUnlocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
        {/* 模糊背景 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--bg-primary, #fff)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* 工具栏（只显示标题） */}
          <div
            style={{
              padding: '8px 16px',
              borderBottom: '1px solid var(--border-color, #f0f0f0)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LockOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
              <span style={{ fontSize: 18, fontWeight: 600 }}>{note.title || '加密笔记'}</span>
            </div>
          </div>
          
          {/* 密码验证区域 */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.05) 100%)',
            }}
          >
            <div
              style={{
                background: 'var(--bg-primary, #fff)',
                borderRadius: 12,
                padding: 32,
                boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
                width: 360,
                textAlign: 'center',
              }}
            >
              <LockOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>此笔记已加密</h3>
              <p style={{ margin: '0 0 24px', color: 'var(--text-secondary, #666)', fontSize: 14 }}>
                请输入密码以查看内容
              </p>
              
              <Input.Password
                placeholder="输入密码"
                value={unlockPassword}
                onChange={(e) => {
                  setUnlockPassword(e.target.value);
                  setUnlockError('');
                }}
                onPressEnter={handleUnlock}
                style={{ marginBottom: 12 }}
                size="large"
                status={unlockError ? 'error' : undefined}
              />
              
              {unlockError && (
                <div style={{ color: '#ff4d4f', fontSize: 13, marginBottom: 12 }}>
                  {unlockError}
                </div>
              )}
              
              <Button
                type="primary"
                size="large"
                block
                onClick={handleUnlock}
                disabled={!unlockPassword}
              >
                解锁
              </Button>
            </div>
          </div>
        </div>
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
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'edit' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Markdown 工具栏 */}
            <MarkdownToolbar
              textareaRef={textareaRef}
              content={content}
              onContentChange={(newContent) => {
                setContent(newContent);
                setIsDirty(true);
              }}
              onInsertImage={onUploadImage ? handleInsertImage : undefined}
              onInsertAttachment={onUploadAttachment ? handleInsertAttachment : undefined}
              isFullscreen={isFullscreen}
              onToggleFullscreen={toggleFullscreen}
              disabled={uploading}
            />
            {/* 编辑器 */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1,
                width: '100%',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                fontSize: 14,
                lineHeight: 1.6,
                padding: 16,
                background: 'var(--bg-primary, #fff)',
              }}
              placeholder="开始编写 Markdown...&#10;&#10;提示：&#10;• Ctrl+B 粗体&#10;• Ctrl+I 斜体&#10;• Ctrl+K 链接&#10;• Ctrl+S 保存&#10;• 直接粘贴图片自动上传"
            />
          </div>
        )}
        {activeTab === 'preview' && (
          <div style={{ width: '100%', height: '100%', position: 'relative', padding: 16 }}>
            <div 
              ref={previewRef}
              className="markdown-preview"
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
                remarkPlugins={[remarkGfm]}
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
                  code: ({ node, inline, className, children, ...props }: any) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                  // 任务列表支持
                  input: ({ type, checked, ...props }: any) => {
                    if (type === 'checkbox') {
                      return <input type="checkbox" checked={checked} disabled style={{ marginRight: 8 }} />;
                    }
                    return <input type={type} {...props} />;
                  },
                  // 图片处理 - 支持 resource:// 协议
                  img: ({ src, alt, title, ...props }: any) => {
                    return <ResourceImage src={src} alt={alt} title={title} />;
                  },
                  // 链接处理 - 支持 resource:// 协议的附件
                  a: ({ href, children, ...props }: any) => {
                    return <ResourceLink href={href}>{children}</ResourceLink>;
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
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 分屏模式工具栏 */}
            <MarkdownToolbar
              textareaRef={textareaRef}
              content={content}
              onContentChange={(newContent) => {
                setContent(newContent);
                setIsDirty(true);
              }}
              onInsertImage={onUploadImage ? handleInsertImage : undefined}
              onInsertAttachment={onUploadAttachment ? handleInsertAttachment : undefined}
              isFullscreen={isFullscreen}
              onToggleFullscreen={toggleFullscreen}
              disabled={uploading}
            />
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                style={{
                  width: '50%',
                  height: '100%',
                  border: 'none',
                  borderRight: '1px solid var(--border-color, #f0f0f0)',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                  fontSize: 14,
                  lineHeight: 1.6,
                  padding: 16,
                  background: 'var(--bg-primary, #fff)',
                }}
                placeholder="开始编写 Markdown..."
              />
              <div 
                ref={previewRef}
                className="markdown-preview"
                style={{ width: '50%', height: '100%', overflow: 'auto', padding: 16, lineHeight: 1.8, position: 'relative' }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
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
                    code: ({ node, inline, className, children, ...props }: any) => {
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                    input: ({ type, checked, ...props }: any) => {
                      if (type === 'checkbox') {
                        return <input type="checkbox" checked={checked} disabled style={{ marginRight: 8 }} />;
                      }
                      return <input type={type} {...props} />;
                    },
                    // 图片处理 - 支持 resource:// 协议
                    img: ({ src, alt, title, ...props }: any) => {
                      return <ResourceImage src={src} alt={alt} title={title} />;
                    },
                    // 链接处理 - 支持 resource:// 协议的附件
                    a: ({ href, children, ...props }: any) => {
                      return <ResourceLink href={href}>{children}</ResourceLink>;
                    },
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
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
          <p><strong>加密状态：</strong>{note?.isLocked ? '已加密' : '未加密'}</p>
        </div>
      </Modal>

      {/* 加密笔记 Modal */}
      <Modal
        title="加密笔记"
        open={showLockDialog}
        onOk={handleLockNote}
        onCancel={() => {
          setShowLockDialog(false);
          setLockPassword('');
          setLockPasswordConfirm('');
          setLockError('');
        }}
        okText="加密"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <p style={{ color: 'var(--text-secondary, #666)', marginBottom: 16 }}>
            设置密码后，每次查看此笔记都需要输入密码。请牢记密码，忘记密码将无法恢复。
          </p>
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>设置密码：</div>
            <Input.Password
              placeholder="至少 4 位"
              value={lockPassword}
              onChange={(e) => {
                setLockPassword(e.target.value);
                setLockError('');
              }}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>确认密码：</div>
            <Input.Password
              placeholder="再次输入密码"
              value={lockPasswordConfirm}
              onChange={(e) => {
                setLockPasswordConfirm(e.target.value);
                setLockError('');
              }}
            />
          </div>
          {lockError && (
            <div style={{ color: '#ff4d4f', fontSize: 13, marginTop: 8 }}>
              {lockError}
            </div>
          )}
        </div>
      </Modal>

      {/* 删除加密笔记密码验证 Modal */}
      <Modal
        title="删除加密笔记"
        open={showDeletePasswordDialog}
        onOk={handleDeleteWithPassword}
        onCancel={() => {
          setShowDeletePasswordDialog(false);
          setDeletePassword('');
          setDeletePasswordError('');
        }}
        okText="确认删除"
        okType="danger"
        cancelText="取消"
      >
        <div>
          <p style={{ color: 'var(--text-secondary, #666)', marginBottom: 16 }}>
            此笔记已加密，删除前需要验证密码。
          </p>
          <div style={{ marginBottom: 4, fontWeight: 500 }}>输入密码：</div>
          <Input.Password
            placeholder="请输入笔记密码"
            value={deletePassword}
            onChange={(e) => {
              setDeletePassword(e.target.value);
              setDeletePasswordError('');
            }}
            onPressEnter={handleDeleteWithPassword}
          />
          {deletePasswordError && (
            <div style={{ color: '#ff4d4f', fontSize: 13, marginTop: 8 }}>
              {deletePasswordError}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Editor;
