import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Empty, Tabs, Space, Button, Tooltip, message, Modal, Tag as AntTag, Input, Select, Dropdown, Menu } from 'antd';
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
  OrderedListOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LockOutlined,
  UnlockOutlined,
  RobotOutlined,
  DownloadOutlined,
  ScissorOutlined,
  SelectOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Tag } from '../hooks/useTags';
import MarkdownToolbar from './MarkdownToolbar';
import { useAISettings } from '../hooks/useAI';
import { callAIApi } from '../services/aiApi';

// 资源图片组件 - 处理 resource:// 协议的图片
const ResourceImage: React.FC<{ src?: string; alt?: string; title?: string }> = ({ src, alt, title }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let isMounted = true;
    
    // 重置状态
    setLoading(true);
    setError(false);
    setErrorMsg('');
    setImageSrc(null);
    
    const loadImage = async () => {
      if (!src) {
        setLoading(false);
        setError(true);
        setErrorMsg('图片地址为空');
        return;
      }

      // 检查是否是 resource:// 协议
      if (src.startsWith('resource://')) {
        const resourcePath = src.replace('resource://', '');
        // 解析资源 ID 和扩展名
        const lastDotIndex = resourcePath.lastIndexOf('.');
        const resourceId = lastDotIndex > 0 ? resourcePath.substring(0, lastDotIndex) : resourcePath;
        const ext = lastDotIndex > 0 ? resourcePath.substring(lastDotIndex) : '.png';

        // 检查 electronAPI 是否可用
        if (!window.electronAPI?.resource?.read) {
          if (isMounted) {
            setError(true);
            setErrorMsg('electronAPI 不可用');
            setLoading(false);
          }
          return;
        }

        try {
          // 通过 IPC 读取资源文件
          const base64Data = await window.electronAPI.resource.read(resourceId, ext);
          
          if (!isMounted) return;
          
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
            setErrorMsg(`资源文件不存在: ${resourceId}${ext}`);
          }
        } catch (err: any) {
          if (isMounted) {
            setError(true);
            setErrorMsg(err?.message || '读取资源失败');
          }
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      } else {
        // 普通 URL，直接使用
        if (isMounted) {
          setImageSrc(src);
          setLoading(false);
        }
      }
    };
    
    loadImage();
    
    return () => {
      isMounted = false;
    };
  }, [src]);

  // 图片右键菜单处理 - 必须在所有条件返回之前定义，遵循 React Hooks 规则
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const imgElement = e.currentTarget;
    const imgSrcData = imgElement.src;
    
    // 使用 Dropdown 显示菜单
    const menuContainer = document.createElement('div');
    menuContainer.style.position = 'fixed';
    menuContainer.style.left = `${e.clientX}px`;
    menuContainer.style.top = `${e.clientY}px`;
    menuContainer.style.zIndex = '9999';
    document.body.appendChild(menuContainer);
    
    const closeMenu = () => {
      if (menuContainer.parentNode) {
        document.body.removeChild(menuContainer);
      }
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
    };
    
    // 延迟添加关闭事件，避免立即触发
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
      document.addEventListener('contextmenu', closeMenu);
    }, 0);
    
    // 渲染菜单
    const menuElement = document.createElement('div');
    menuElement.className = 'ant-dropdown ant-dropdown-placement-bottomLeft';
    menuElement.innerHTML = `
      <ul class="ant-dropdown-menu ant-dropdown-menu-root ant-dropdown-menu-vertical" style="min-width: 120px; box-shadow: 0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.08), 0 9px 28px 8px rgba(0,0,0,.05); border-radius: 8px; padding: 4px;">
        <li class="ant-dropdown-menu-item" data-action="copy" style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 14px;">📋</span> 复制图片
        </li>
        <li class="ant-dropdown-menu-item" data-action="save" style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 14px;">💾</span> 另存为...
        </li>
      </ul>
    `;
    menuContainer.appendChild(menuElement);
    
    // 添加菜单项点击事件
    menuElement.querySelectorAll('.ant-dropdown-menu-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        (item as HTMLElement).style.background = '#f5f5f5';
      });
      item.addEventListener('mouseleave', () => {
        (item as HTMLElement).style.background = 'transparent';
      });
      item.addEventListener('click', async () => {
        const action = item.getAttribute('data-action');
        if (action === 'copy') {
          try {
            const response = await fetch(imgSrcData);
            const blob = await response.blob();
            await navigator.clipboard.write([
              new ClipboardItem({ [blob.type]: blob })
            ]);
            message.success('图片已复制到剪贴板');
          } catch (err) {
            message.error('复制图片失败');
          }
        } else if (action === 'save') {
          try {
            const link = document.createElement('a');
            link.href = imgSrcData;
            link.download = alt || 'image.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            message.success('图片已保存');
          } catch (err) {
            message.error('保存图片失败');
          }
        }
        closeMenu();
      });
    });
  }, [alt]);

  // 条件返回必须在所有 hooks 之后
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
        ❌ 图片加载失败: {errorMsg || alt || src}
      </span>
    );
  }

  return (
    <img 
      src={imageSrc} 
      alt={alt || ''} 
      title={title || ''} 
      style={{ maxWidth: '100%', height: 'auto', cursor: 'pointer' }}
      onContextMenu={handleContextMenu}
    />
  );
};

// 资源链接组件 - 处理 resource:// 协议的附件链接
const ResourceLink: React.FC<{ href?: string; children?: React.ReactNode }> = ({ href, children }) => {
  const [downloading, setDownloading] = useState(false);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (!href) return;
    
    // 处理 resource:// 协议的附件链接
    if (href.startsWith('resource://')) {
      const resourcePath = href.replace('resource://', '');
      const lastDotIndex = resourcePath.lastIndexOf('.');
      const resourceId = lastDotIndex > 0 ? resourcePath.substring(0, lastDotIndex) : resourcePath;
      const ext = lastDotIndex > 0 ? resourcePath.substring(lastDotIndex) : '';
      
      setDownloading(true);
      
      try {
        // 获取资源文件路径
        const filePath = await window.electronAPI.resource.getPath(resourceId, ext);
        
        if (filePath) {
          // 使用系统默认程序打开文件
          const result = await window.electronAPI.openPath(filePath);
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
      return;
    }
    
    // 处理普通外部链接 - 使用系统默认浏览器打开
    if (href.startsWith('http://') || href.startsWith('https://')) {
      try {
        await window.electronAPI.openExternal(href);
      } catch (error) {
        console.error('Failed to open external link:', error);
        message.error('打开链接失败');
      }
      return;
    }
    
    // 其他协议（如 mailto:, tel: 等）也使用系统默认程序打开
    try {
      await window.electronAPI.openExternal(href);
    } catch (error) {
      console.error('Failed to open link:', error);
    }
  }, [href]);

  // 如果不是 resource:// 协议，返回普通链接样式
  if (!href || !href.startsWith('resource://')) {
    return (
      <a 
        href={href} 
        onClick={handleClick}
        style={{ color: '#1890ff', textDecoration: 'underline', cursor: 'pointer' }}
      >
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
  defaultMode?: 'edit' | 'preview';
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
  defaultMode = 'edit',
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
  
  // AI 撰写相关状态
  const [showAIWriteDialog, setShowAIWriteDialog] = useState(false);
  const [aiWritePrompt, setAiWritePrompt] = useState('');
  const [aiWriteLoading, setAiWriteLoading] = useState(false);
  
  // AI 整理相关状态
  const [showAIOrganizeDialog, setShowAIOrganizeDialog] = useState(false);
  const [aiOrganizeLoading, setAiOrganizeLoading] = useState(false);
  const [aiOrganizeResult, setAiOrganizeResult] = useState('');
  
  // AI 分析相关状态
  const [showAIAnalyzeDialog, setShowAIAnalyzeDialog] = useState(false);
  const [aiAnalyzeLoading, setAiAnalyzeLoading] = useState(false);
  const [aiAnalyzeResult, setAiAnalyzeResult] = useState('');
  
  const { settings: aiSettings } = useAISettings();

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
      // 根据 defaultMode 设置初始显示模式
      setActiveTab(defaultMode);
      // 如果笔记已加密，重置解锁状态
      if (note.isLocked) {
        setIsUnlocked(false);
        setUnlockPassword('');
        setUnlockError('');
      } else {
        setIsUnlocked(true);
      }
    }
  }, [note, defaultMode]);

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

  // AI 撰写功能
  const handleAIWrite = useCallback(async () => {
    if (!aiWritePrompt.trim()) {
      message.warning('请输入撰写需求');
      return;
    }

    // 检查是否有可用的 AI 渠道（有 API Key 的启用渠道）
    const enabledChannels = aiSettings.channels.filter(c => c.enabled && c.api_key);
    if (enabledChannels.length === 0) {
      message.error('请先在设置中配置 AI 渠道和 API Key');
      return;
    }

    // 获取默认模型和渠道
    let targetChannel = enabledChannels[0];
    let targetModel = aiSettings.default_model || '';

    // 查找默认模型所在的渠道
    if (targetModel) {
      for (const channel of enabledChannels) {
        const model = channel.models.find(m => m.id === targetModel);
        if (model) {
          targetChannel = channel;
          break;
        }
      }
    }

    // 如果没有默认模型，使用第一个渠道的第一个模型
    if (!targetModel && targetChannel.models.length > 0) {
      targetModel = targetChannel.models[0].id;
    }

    if (!targetModel) {
      message.error('请先在设置中配置 AI 模型');
      return;
    }

    setAiWriteLoading(true);
    message.loading({ content: 'AI 正在撰写...', key: 'ai-write' });

    try {
      const systemPrompt = '你是一个专业的写作助手。请根据用户的需求撰写内容，输出格式为 Markdown。';
      const response = await callAIApi(targetChannel, {
        model: targetModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: aiWritePrompt },
        ],
        temperature: 0.7,
        max_tokens: 4096,
        stream: false,
      });

      // 将 AI 生成的内容插入到编辑器
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const newContent = content.substring(0, start) + '\n\n' + response + '\n\n' + content.substring(start);
        setContent(newContent);
        setIsDirty(true);
        message.success({ content: 'AI 撰写完成', key: 'ai-write' });
      }

      setShowAIWriteDialog(false);
      setAiWritePrompt('');
    } catch (err: any) {
      message.error({ content: `AI 撰写失败: ${err.message || '未知错误'}`, key: 'ai-write' });
    } finally {
      setAiWriteLoading(false);
    }
  }, [aiWritePrompt, aiSettings, content]);

  // AI 整理功能 - 基于现有笔记内容进行整理和优化
  const handleAIOrganize = useCallback(async () => {
    if (!content.trim()) {
      message.warning('笔记内容为空，无法整理');
      return;
    }

    // 检查是否有可用的 AI 渠道
    const enabledChannels = aiSettings.channels.filter(c => c.enabled && c.api_key);
    if (enabledChannels.length === 0) {
      message.error('请先在设置中配置 AI 渠道和 API Key');
      return;
    }

    // 获取默认模型和渠道
    let targetChannel = enabledChannels[0];
    let targetModel = aiSettings.default_model || '';

    if (targetModel) {
      for (const channel of enabledChannels) {
        const model = channel.models.find(m => m.id === targetModel);
        if (model) {
          targetChannel = channel;
          break;
        }
      }
    }

    if (!targetModel && targetChannel.models.length > 0) {
      targetModel = targetChannel.models[0].id;
    }

    if (!targetModel) {
      message.error('请先在设置中配置 AI 模型');
      return;
    }

    setAiOrganizeLoading(true);
    setAiOrganizeResult('');
    message.loading({ content: 'AI 正在整理笔记...', key: 'ai-organize' });

    try {
      const systemPrompt = `你是一个专业的文档整理助手。请对用户提供的笔记内容进行整理和优化，包括：
1. 优化文章结构，添加合适的标题层级
2. 修正语法和拼写错误
3. 改善段落组织和逻辑流程
4. 保持原有内容的核心意思不变
5. 输出格式为 Markdown

请直接输出整理后的内容，不要添加额外的说明。`;

      const response = await callAIApi(targetChannel, {
        model: targetModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请整理以下笔记内容：\n\n${content}` },
        ],
        temperature: 0.3,
        max_tokens: 8192,
        stream: false,
      });

      setAiOrganizeResult(response);
      message.success({ content: 'AI 整理完成', key: 'ai-organize' });
    } catch (err: any) {
      message.error({ content: `AI 整理失败: ${err.message || '未知错误'}`, key: 'ai-organize' });
    } finally {
      setAiOrganizeLoading(false);
    }
  }, [aiSettings, content]);

  // 应用 AI 整理结果
  const handleApplyOrganize = useCallback(() => {
    if (aiOrganizeResult) {
      setContent(aiOrganizeResult);
      setIsDirty(true);
      setShowAIOrganizeDialog(false);
      setAiOrganizeResult('');
      message.success('已应用整理结果');
    }
  }, [aiOrganizeResult]);

  // AI 分析功能 - 针对现有笔记进行分析总结
  const handleAIAnalyze = useCallback(async () => {
    if (!content.trim()) {
      message.warning('笔记内容为空，无法分析');
      return;
    }

    // 检查是否有可用的 AI 渠道
    const enabledChannels = aiSettings.channels.filter(c => c.enabled && c.api_key);
    if (enabledChannels.length === 0) {
      message.error('请先在设置中配置 AI 渠道和 API Key');
      return;
    }

    // 获取默认模型和渠道
    let targetChannel = enabledChannels[0];
    let targetModel = aiSettings.default_model || '';

    if (targetModel) {
      for (const channel of enabledChannels) {
        const model = channel.models.find(m => m.id === targetModel);
        if (model) {
          targetChannel = channel;
          break;
        }
      }
    }

    if (!targetModel && targetChannel.models.length > 0) {
      targetModel = targetChannel.models[0].id;
    }

    if (!targetModel) {
      message.error('请先在设置中配置 AI 模型');
      return;
    }

    setAiAnalyzeLoading(true);
    setAiAnalyzeResult('');
    message.loading({ content: 'AI 正在分析笔记...', key: 'ai-analyze' });

    try {
      const systemPrompt = `你是一个专业的内容分析助手。请对用户提供的笔记内容进行深入分析，包括：
1. 内容摘要：用 2-3 句话概括主要内容
2. 关键要点：列出 3-5 个核心观点或要点
3. 主题标签：建议 3-5 个相关标签
4. 内容评估：评估内容的完整性、逻辑性
5. 改进建议：提出 2-3 条具体的改进建议

请使用 Markdown 格式输出分析结果。`;

      const response = await callAIApi(targetChannel, {
        model: targetModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请分析以下笔记内容：\n\n标题：${title}\n\n${content}` },
        ],
        temperature: 0.5,
        max_tokens: 4096,
        stream: false,
      });

      setAiAnalyzeResult(response);
      message.success({ content: 'AI 分析完成', key: 'ai-analyze' });
    } catch (err: any) {
      message.error({ content: `AI 分析失败: ${err.message || '未知错误'}`, key: 'ai-analyze' });
    } finally {
      setAiAnalyzeLoading(false);
    }
  }, [aiSettings, content, title]);

  // 将分析结果插入到笔记末尾
  const handleInsertAnalysis = useCallback(() => {
    if (aiAnalyzeResult) {
      const newContent = content + '\n\n---\n\n## AI 分析\n\n' + aiAnalyzeResult;
      setContent(newContent);
      setIsDirty(true);
      setShowAIAnalyzeDialog(false);
      setAiAnalyzeResult('');
      message.success('已将分析结果插入笔记');
    }
  }, [aiAnalyzeResult, content]);

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
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, marginRight: 16, gap: 12 }}>
          <input
            value={title}
            onChange={handleTitleChange}
            style={{
              border: 'none',
              outline: 'none',
              fontSize: 18,
              fontWeight: 600,
              flex: 1,
            }}
            placeholder="笔记标题"
          />
          {note.updatedAt && (
            <span style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {new Date(note.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
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
              <Dropdown
                menu={{
                  items: [
                    { key: 'write', icon: <EditOutlined />, label: 'AI 撰写', onClick: () => setShowAIWriteDialog(true) },
                    { key: 'organize', icon: <OrderedListOutlined />, label: 'AI 整理', onClick: () => { setShowAIOrganizeDialog(true); handleAIOrganize(); } },
                    { key: 'analyze', icon: <FileSearchOutlined />, label: 'AI 分析', onClick: () => { setShowAIAnalyzeDialog(true); handleAIAnalyze(); } },
                  ],
                }}
                trigger={['click']}
              >
                <Tooltip title="AI 功能">
                  <Button icon={<RobotOutlined />} type="text" />
                </Tooltip>
              </Dropdown>
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
                userSelect: 'text', // 允许文本选择
              }}
              onContextMenu={(e) => {
                // 如果点击的是图片，让图片自己处理
                if ((e.target as HTMLElement).tagName === 'IMG') {
                  return;
                }
                
                e.preventDefault();
                
                const selection = window.getSelection();
                const hasSelection = selection && selection.toString().length > 0;
                
                // 创建右键菜单
                const menuContainer = document.createElement('div');
                menuContainer.style.position = 'fixed';
                menuContainer.style.left = `${e.clientX}px`;
                menuContainer.style.top = `${e.clientY}px`;
                menuContainer.style.zIndex = '9999';
                document.body.appendChild(menuContainer);
                
                const closeMenu = () => {
                  if (document.body.contains(menuContainer)) {
                    document.body.removeChild(menuContainer);
                  }
                  document.removeEventListener('click', closeMenu);
                  document.removeEventListener('contextmenu', closeMenu);
                };
                
                setTimeout(() => {
                  document.addEventListener('click', closeMenu);
                  document.addEventListener('contextmenu', closeMenu);
                }, 0);
                
                const menuElement = document.createElement('div');
                menuElement.className = 'ant-dropdown ant-dropdown-placement-bottomLeft';
                menuElement.innerHTML = `
                  <ul class="ant-dropdown-menu ant-dropdown-menu-root ant-dropdown-menu-vertical" style="min-width: 140px; box-shadow: 0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.08), 0 9px 28px 8px rgba(0,0,0,.05); border-radius: 8px; padding: 4px; background: #fff;">
                    <li class="ant-dropdown-menu-item ${!hasSelection ? 'ant-dropdown-menu-item-disabled' : ''}" data-action="copy" style="padding: 8px 12px; cursor: ${hasSelection ? 'pointer' : 'not-allowed'}; display: flex; align-items: center; gap: 8px; color: ${hasSelection ? 'inherit' : '#999'};">
                      <span style="font-size: 14px;">📋</span> 复制
                    </li>
                    <li class="ant-dropdown-menu-item" data-action="selectAll" style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                      <span style="font-size: 14px;">📄</span> 全选
                    </li>
                  </ul>
                `;
                menuContainer.appendChild(menuElement);
                
                menuElement.querySelectorAll('.ant-dropdown-menu-item:not(.ant-dropdown-menu-item-disabled)').forEach(item => {
                  item.addEventListener('mouseenter', () => {
                    (item as HTMLElement).style.background = '#f5f5f5';
                  });
                  item.addEventListener('mouseleave', () => {
                    (item as HTMLElement).style.background = 'transparent';
                  });
                  item.addEventListener('click', async () => {
                    const action = item.getAttribute('data-action');
                    if (action === 'copy' && hasSelection) {
                      try {
                        await navigator.clipboard.writeText(selection!.toString());
                        message.success('已复制到剪贴板');
                      } catch (err) {
                        message.error('复制失败');
                      }
                    } else if (action === 'selectAll') {
                      const range = document.createRange();
                      range.selectNodeContents(previewRef.current!);
                      const sel = window.getSelection();
                      sel?.removeAllRanges();
                      sel?.addRange(range);
                    }
                    closeMenu();
                  });
                });
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                urlTransform={(url) => {
                  // 允许 resource:// 协议
                  if (url.startsWith('resource://')) {
                    return url;
                  }
                  // 其他 URL 使用默认处理
                  return url;
                }}
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
                        wrapLines={true}
                        wrapLongLines={false}
                        lineProps={{
                          style: { display: 'block', userSelect: 'text' }
                        }}
                        customStyle={{
                          margin: 0,
                          padding: '16px',
                          borderRadius: '6px',
                          fontSize: '14px',
                          lineHeight: '1.5',
                        }}
                        codeTagProps={{
                          style: {
                            display: 'block',
                            whiteSpace: 'pre',
                            userSelect: 'text',
                          }
                        }}
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
                  img: ({ node, src, alt, title, ...props }: any) => {
                    // react-markdown v9 中，src 可能在 node.properties 中
                    const imgSrc = src || node?.properties?.src;
                    const imgAlt = alt || node?.properties?.alt;
                    const imgTitle = title || node?.properties?.title;
                    return <ResourceImage src={imgSrc} alt={imgAlt} title={imgTitle} />;
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
                style={{ width: '50%', height: '100%', overflow: 'auto', padding: 16, lineHeight: 1.8, position: 'relative', userSelect: 'text' }}
                onContextMenu={(e) => {
                  // 如果点击的是图片，让图片自己处理
                  if ((e.target as HTMLElement).tagName === 'IMG') {
                    return;
                  }
                  
                  e.preventDefault();
                  
                  const selection = window.getSelection();
                  const hasSelection = selection && selection.toString().length > 0;
                  
                  const menuContainer = document.createElement('div');
                  menuContainer.style.position = 'fixed';
                  menuContainer.style.left = `${e.clientX}px`;
                  menuContainer.style.top = `${e.clientY}px`;
                  menuContainer.style.zIndex = '9999';
                  document.body.appendChild(menuContainer);
                  
                  const closeMenu = () => {
                    if (document.body.contains(menuContainer)) {
                      document.body.removeChild(menuContainer);
                    }
                    document.removeEventListener('click', closeMenu);
                    document.removeEventListener('contextmenu', closeMenu);
                  };
                  
                  setTimeout(() => {
                    document.addEventListener('click', closeMenu);
                    document.addEventListener('contextmenu', closeMenu);
                  }, 0);
                  
                  const menuElement = document.createElement('div');
                  menuElement.innerHTML = `
                    <ul style="min-width: 140px; box-shadow: 0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.08), 0 9px 28px 8px rgba(0,0,0,.05); border-radius: 8px; padding: 4px; background: #fff; list-style: none; margin: 0;">
                      <li data-action="copy" style="padding: 8px 12px; cursor: ${hasSelection ? 'pointer' : 'not-allowed'}; display: flex; align-items: center; gap: 8px; color: ${hasSelection ? 'inherit' : '#999'};">
                        <span>📋</span> 复制
                      </li>
                      <li data-action="selectAll" style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                        <span>📄</span> 全选
                      </li>
                    </ul>
                  `;
                  menuContainer.appendChild(menuElement);
                  
                  menuElement.querySelectorAll('li').forEach(item => {
                    const action = item.getAttribute('data-action');
                    if (action === 'copy' && !hasSelection) return;
                    
                    item.addEventListener('mouseenter', () => {
                      (item as HTMLElement).style.background = '#f5f5f5';
                    });
                    item.addEventListener('mouseleave', () => {
                      (item as HTMLElement).style.background = 'transparent';
                    });
                    item.addEventListener('click', async () => {
                      if (action === 'copy' && hasSelection) {
                        try {
                          await navigator.clipboard.writeText(selection!.toString());
                          message.success('已复制到剪贴板');
                        } catch (err) {
                          message.error('复制失败');
                        }
                      } else if (action === 'selectAll') {
                        const range = document.createRange();
                        range.selectNodeContents(previewRef.current!);
                        const sel = window.getSelection();
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                      }
                      closeMenu();
                    });
                  });
                }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  urlTransform={(url) => {
                    // 允许 resource:// 协议
                    if (url.startsWith('resource://')) {
                      return url;
                    }
                    // 其他 URL 使用默认处理
                    return url;
                  }}
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
                          wrapLines={true}
                          wrapLongLines={false}
                          lineProps={{
                            style: { display: 'block', userSelect: 'text' }
                          }}
                          customStyle={{
                            margin: 0,
                            padding: '16px',
                            borderRadius: '6px',
                            fontSize: '14px',
                            lineHeight: '1.5',
                          }}
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
                    img: ({ node, src, alt, title, ...props }: any) => {
                      // react-markdown v9 中，src 可能在 node.properties 中
                      const imgSrc = src || node?.properties?.src;
                      const imgAlt = alt || node?.properties?.alt;
                      const imgTitle = title || node?.properties?.title;
                      return <ResourceImage src={imgSrc} alt={imgAlt} title={imgTitle} />;
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

      {/* AI 撰写 Modal */}
      <Modal
        title={
          <span>
            <RobotOutlined style={{ marginRight: 8, color: '#1890ff' }} />
            AI 撰写
          </span>
        }
        open={showAIWriteDialog}
        onOk={handleAIWrite}
        onCancel={() => {
          setShowAIWriteDialog(false);
          setAiWritePrompt('');
        }}
        okText="开始撰写"
        cancelText="取消"
        confirmLoading={aiWriteLoading}
        okButtonProps={{ disabled: !aiWritePrompt.trim() || aiWriteLoading }}
      >
        <div>
          <p style={{ color: 'var(--text-secondary, #666)', marginBottom: 16 }}>
            描述你想要撰写的内容，AI 将根据你的需求生成 Markdown 格式的文本并插入到当前光标位置。
          </p>
          <Input.TextArea
            placeholder="例如：写一篇关于 React Hooks 的技术博客，包含 useState 和 useEffect 的使用示例"
            value={aiWritePrompt}
            onChange={(e) => setAiWritePrompt(e.target.value)}
            rows={4}
            disabled={aiWriteLoading}
            onPressEnter={(e) => {
              if (e.ctrlKey || e.metaKey) {
                handleAIWrite();
              }
            }}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
            提示：按 Ctrl+Enter 快速提交
          </div>
        </div>
      </Modal>

      {/* AI 整理 Modal */}
      <Modal
        title={
          <span>
            <OrderedListOutlined style={{ marginRight: 8, color: '#52c41a' }} />
            AI 整理
          </span>
        }
        open={showAIOrganizeDialog}
        onOk={handleApplyOrganize}
        onCancel={() => {
          setShowAIOrganizeDialog(false);
          setAiOrganizeResult('');
        }}
        okText="应用整理结果"
        cancelText="取消"
        confirmLoading={aiOrganizeLoading}
        okButtonProps={{ disabled: !aiOrganizeResult || aiOrganizeLoading }}
        width={800}
      >
        <div>
          <p style={{ color: 'var(--text-secondary, #666)', marginBottom: 16 }}>
            AI 将对当前笔记内容进行整理和优化，包括优化结构、修正错误、改善逻辑等。
          </p>
          {aiOrganizeLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <RobotOutlined style={{ fontSize: 32, color: '#52c41a', marginBottom: 16 }} />
              <p>AI 正在整理笔记内容...</p>
            </div>
          ) : aiOrganizeResult ? (
            <div>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>整理结果预览：</div>
              <div style={{ 
                maxHeight: 400, 
                overflow: 'auto', 
                border: '1px solid #d9d9d9', 
                borderRadius: 6, 
                padding: 16,
                background: '#fafafa'
              }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {aiOrganizeResult}
                </ReactMarkdown>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                点击"应用整理结果"将替换当前笔记内容
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              整理结果将显示在这里
            </div>
          )}
        </div>
      </Modal>

      {/* AI 分析 Modal */}
      <Modal
        title={
          <span>
            <FileSearchOutlined style={{ marginRight: 8, color: '#722ed1' }} />
            AI 分析
          </span>
        }
        open={showAIAnalyzeDialog}
        onOk={handleInsertAnalysis}
        onCancel={() => {
          setShowAIAnalyzeDialog(false);
          setAiAnalyzeResult('');
        }}
        okText="插入到笔记"
        cancelText="关闭"
        confirmLoading={aiAnalyzeLoading}
        okButtonProps={{ disabled: !aiAnalyzeResult || aiAnalyzeLoading }}
        width={700}
      >
        <div>
          <p style={{ color: 'var(--text-secondary, #666)', marginBottom: 16 }}>
            AI 将对当前笔记进行深入分析，包括内容摘要、关键要点、主题标签和改进建议。
          </p>
          {aiAnalyzeLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <RobotOutlined style={{ fontSize: 32, color: '#722ed1', marginBottom: 16 }} />
              <p>AI 正在分析笔记内容...</p>
            </div>
          ) : aiAnalyzeResult ? (
            <div>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>分析结果：</div>
              <div style={{ 
                maxHeight: 400, 
                overflow: 'auto', 
                border: '1px solid #d9d9d9', 
                borderRadius: 6, 
                padding: 16,
                background: '#fafafa'
              }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {aiAnalyzeResult}
                </ReactMarkdown>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                点击"插入到笔记"将分析结果添加到笔记末尾
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              分析结果将显示在这里
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Editor;
