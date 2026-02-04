import React, { useState, useCallback, useEffect } from 'react';
import { Layout, message, Modal, Select, Radio, Space, Input, Tag } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import Sidebar from './components/Sidebar';
import NoteList from './components/NoteList';
import Editor from './components/Editor';
import SettingsModal from './components/SettingsModal';
import TemplateSelector from './components/TemplateSelector';
import SyncStatusBar from './components/SyncStatusBar';
import WelcomeGuide from './components/WelcomeGuide';
import AIAssistantPanel from './components/AIAssistantPanel';
import TodoPanel from './components/TodoPanel';
import VaultPanel from './components/VaultPanel';
import VaultLockScreen from './components/VaultLockScreen';
import LockScreen from './components/LockScreen';
import BookmarkPanel from './components/BookmarkPanel';
import ToolboxPanel from './components/ToolboxPanel';
import DiagramPanel from './components/DiagramPanel';
import TransferPanel from './components/TransferPanel';
import ExcelEditorPanel from './components/ExcelEditorPanel';
import { useNotes, useNote } from './hooks/useNotes';
import { useFolders } from './hooks/useFolders';
import { useTags } from './hooks/useTags';
import { useSettings } from './contexts/SettingsContext';
import { useFeatureSettings } from './hooks/useFeatureSettings';
import { itemsApi, notesApi, parsePayload } from './services/itemsApi';
import { syncApi } from './services/syncApi';
import { aiSettingsApi } from './services/aiApi';
import { ItemBase, NotePayload } from '@shared/types';

const { Sider, Content, Footer } = Layout;

// 获取 electronAPI
const getElectronAPI = () => {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return (window as any).electronAPI;
  }
  return null;
};

// 将 ItemBase 转换为 Note 的辅助函数
function itemToNote(item: ItemBase) {
  const payload = parsePayload<NotePayload>(item);
  return {
    id: item.id,
    title: payload.title,
    content: payload.content,
    folderId: payload.folder_id,
    isPinned: payload.is_pinned,
    isLocked: payload.is_locked,
    lockPasswordHash: payload.lock_password_hash,
    tags: payload.tags,
    createdAt: item.created_time,
    updatedAt: item.updated_time,
  };
}

type ViewType = 'all' | 'starred' | 'trash' | 'folder' | 'tag';

const App: React.FC = () => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<ViewType>('all');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isNewNote, setIsNewNote] = useState(false); // 标记是否是新建的笔记
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string>('general');
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'offline'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [syncProgress, setSyncProgress] = useState<any>(null);
  const [lastSyncResult, setLastSyncResult] = useState<any>(null);
  const [filteredNotes, setFilteredNotes] = useState<any[]>([]);
  const [syncInitialized, setSyncInitialized] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    return !localStorage.getItem('mucheng-welcome-shown');
  });
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState(false);

  // 使用 ref 保存最新的回调函数和状态
  const callbacksRef = React.useRef<{
    handleQuickCreateNote: () => void;
    handleSync: () => void;
    handleDeleteNote: (id: string) => void;
    handleDuplicateNote: (id: string) => void;
    handleTogglePin: (id: string, isPinned: boolean) => void;
    updateSettings: (updates: any) => void;
  }>();

  const stateRef = React.useRef<{
    currentTool: string | null;
    selectedNoteId: string | null;
    selectedView: string;
    currentNote: any;
    filteredNotes: any[];
  }>();

  const { syncConfig, updateSettings, updateSyncConfig, isDarkMode, settings } = useSettings();
  const { settings: featureSettings } = useFeatureSettings();
  const { notes, createNote, updateNote, deleteNote, searchNotes, refresh } = useNotes(selectedFolderId);
  const { note: currentNote } = useNote(selectedNoteId, selectedView === 'trash');
  const { folders, createFolder, updateFolder, deleteFolder: deleteFolderApi } = useFolders();
  const { tags, createTag, deleteTag: deleteTagApi } = useTags();

  // 监听窗口关闭请求
  useEffect(() => {
    // Start MCP servers
    const startMcpServers = async () => {
      try {
        const aiSettings = await aiSettingsApi.loadFromDb();
        if (aiSettings && aiSettings.mcp_servers) {
          for (const server of aiSettings.mcp_servers) {
            if (server.enabled) {
              await window.electronAPI.mcp.startServer(server);
            }
          }
        }
      } catch (err) {
        console.error('Failed to start MCP servers:', err);
      }
    };
    startMcpServers();

    const api = (window as any).electronAPI;
    if (api?.onWindowCloseRequest) {
      api.onWindowCloseRequest(() => {
        // 从 localStorage 读取最新设置
        const savedSettings = localStorage.getItem('mucheng-settings');
        let closeToTray = false;
        if (savedSettings) {
          try {
            const parsed = JSON.parse(savedSettings);
            closeToTray = parsed.close_to_tray || false;
          } catch { /* ignore */ }
        }

        if (closeToTray) {
          // 最小化到托盘
          api.minimizeToTray?.();
        } else {
          // 退出应用
          api.quitApp?.();
        }
      });
    }
  }, []);

  // 监听菜单/快捷键事件
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.onMenuAction) {
      api.onMenuAction((action: string) => {
        const state = stateRef.current;
        const callbacks = callbacksRef.current;

        switch (action) {
          case 'new-note':
            if (!state?.currentTool) {
              setTemplateSelectorOpen(true);
            }
            break;
          case 'quick-new-note':
            if (!state?.currentTool) {
              callbacks?.handleQuickCreateNote();
            }
            break;
          case 'new-folder':
            message.info('请在侧边栏中点击笔记目录旁的 + 按钮创建目录');
            break;
          case 'find':
            setSearchFocused(true);
            break;
          case 'toggle-sidebar':
            // 侧边栏不再支持收缩
            break;
          case 'save-note':
            // 触发保存当前笔记（编辑器会自动保存）
            message.success('笔记已保存');
            break;
          case 'sync-now':
            callbacks?.handleSync();
            break;
          case 'open-settings':
          case 'sync-settings':
            setSettingsOpen(true);
            break;
          case 'delete-note':
            if (state?.selectedNoteId && !state?.currentTool && state?.selectedView !== 'trash') {
              Modal.confirm({
                title: '删除笔记',
                content: '确定要删除这篇笔记吗？',
                okText: '删除',
                okType: 'danger',
                cancelText: '取消',
                onOk: () => callbacks?.handleDeleteNote(state.selectedNoteId!),
              });
            }
            break;
          case 'duplicate-note':
            if (state?.selectedNoteId && !state?.currentTool) {
              callbacks?.handleDuplicateNote(state.selectedNoteId);
            }
            break;
          case 'toggle-edit-mode':
            // 编辑器内部处理
            break;
          case 'toggle-star':
            if (state?.selectedNoteId && state?.currentNote && !state?.currentTool) {
              callbacks?.handleTogglePin(state.selectedNoteId, !state.currentNote.isPinned);
            }
            break;
          case 'prev-note':
            if (!state?.currentTool && state?.filteredNotes && state.filteredNotes.length > 0) {
              const currentIndex = state.filteredNotes.findIndex((n: any) => n.id === state.selectedNoteId);
              if (currentIndex > 0) {
                setSelectedNoteId(state.filteredNotes[currentIndex - 1].id);
              }
            }
            break;
          case 'next-note':
            if (!state?.currentTool && state?.filteredNotes && state.filteredNotes.length > 0) {
              const currentIndex = state.filteredNotes.findIndex((n: any) => n.id === state.selectedNoteId);
              if (currentIndex < state.filteredNotes.length - 1) {
                setSelectedNoteId(state.filteredNotes[currentIndex + 1].id);
              }
            }
            break;
          case 'escape':
            setSearchFocused(false);
            break;
          case 'theme-light':
            callbacks?.updateSettings({ theme: 'light' });
            message.success('已切换到浅色主题');
            break;
          case 'theme-dark':
            callbacks?.updateSettings({ theme: 'dark' });
            message.success('已切换到深色主题');
            break;
          case 'theme-system':
            callbacks?.updateSettings({ theme: 'system' });
            message.success('已切换到跟随系统');
            break;
          case 'lock-app':
            const securitySettings = localStorage.getItem('mucheng-security');
            if (securitySettings) {
              try {
                const settings = JSON.parse(securitySettings);
                if (settings.appLockEnabled && settings.lockPassword) {
                  setIsAppLocked(true);
                  setVaultUnlocked(false);
                  message.info('应用已锁定');
                } else {
                  message.warning('请先在设置中启用应用锁定');
                }
              } catch {
                message.warning('请先在设置中启用应用锁定');
              }
            } else {
              message.warning('请先在设置中启用应用锁定');
            }
            break;
          // 设置菜单
          case 'settings-general':
            setSettingsTab('general');
            setSettingsOpen(true);
            break;
          case 'settings-features':
            setSettingsTab('features');
            setSettingsOpen(true);
            break;
          case 'settings-sync':
            setSettingsTab('sync');
            setSettingsOpen(true);
            break;
          case 'settings-security':
            setSettingsTab('security');
            setSettingsOpen(true);
            break;
          case 'settings-ai':
            setSettingsTab('ai');
            setSettingsOpen(true);
            break;
          case 'settings-data':
            setSettingsTab('data');
            setSettingsOpen(true);
            break;
          case 'settings-shortcuts':
            setSettingsTab('shortcuts');
            setSettingsOpen(true);
            break;
          case 'settings-about':
            setSettingsTab('about');
            setSettingsOpen(true);
            break;
        }
      });
    }
  }, []);

  // 初始化同步服务
  useEffect(() => {
    const initSync = async () => {
      // 如果同步未启用或没有 URL，重置状态
      if (!syncConfig.enabled || !syncConfig.url) {
        setSyncInitialized(false);
        return;
      }

      try {
        const success = await syncApi.initialize({
          enabled: syncConfig.enabled,
          type: syncConfig.type,
          url: syncConfig.url,
          syncPath: syncConfig.sync_path || '/mucheng-notes',
          username: syncConfig.username,
          password: syncConfig.password,
          apiKey: syncConfig.api_key,
          // 服务器认证信息
          serverToken: syncConfig.server_token,
          serverRefreshToken: syncConfig.server_refresh_token,
          serverTokenExpires: syncConfig.server_token_expires,
          syncInterval: syncConfig.sync_interval,
          syncModules: syncConfig.sync_modules,
          lastSyncTime: syncConfig.last_sync_time,  // 传递上次同步时间
        });

        if (success) {
          await syncApi.start();
          setSyncInitialized(true);
          // 从配置加载上次同步时间
          if (syncConfig.last_sync_time) {
            setLastSyncTime(syncConfig.last_sync_time);
          }
        } else {
          setSyncInitialized(false);
          setSyncStatus('error');
          // 不显示错误消息，因为这可能只是暂时的网络问题
          // 用户可以稍后手动点击同步按钮重试
        }
      } catch (error) {
        console.error('Error initializing sync service');
        setSyncInitialized(false);
        setSyncStatus('error');
      }
    };
    initSync();
  }, [syncConfig.enabled, syncConfig.url, syncConfig.type, syncConfig.username, syncConfig.password, syncConfig.sync_path, syncConfig.sync_interval, syncConfig.api_key, syncConfig.sync_modules, syncConfig.server_token]);

  // 监听同步时间更新事件，持久化到配置
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.sync?.onLastSyncTimeUpdated) {
      api.sync.onLastSyncTimeUpdated((lastSyncTime: number) => {
        setLastSyncTime(lastSyncTime);
        // 持久化到 syncConfig
        updateSyncConfig({ last_sync_time: lastSyncTime });
      });
    }
  }, [updateSyncConfig]);

  // 定期更新同步状态
  useEffect(() => {
    if (!syncInitialized) return;

    const updateSyncState = async () => {
      const state = await syncApi.getState();
      if (state) {
        setSyncStatus(state.status);
        setLastSyncTime(state.lastSyncTime);
        setPendingChanges(state.pendingChanges);
        // 只有在同步中才显示进度，否则清除进度
        if (state.status === 'syncing') {
          setSyncProgress(state.progress);
        } else {
          setSyncProgress(null);
        }
        if (state.lastSyncResult) {
          setLastSyncResult(state.lastSyncResult);
        }
      }
    };

    updateSyncState();
    const interval = setInterval(updateSyncState, 1000);  // 更频繁更新以显示进度
    return () => clearInterval(interval);
  }, [syncInitialized]);

  // 根据视图加载笔记
  useEffect(() => {
    const loadFilteredNotes = async () => {
      if (selectedView === 'starred') {
        // 加载星标笔记
        const pinnedItems = await notesApi.getPinned();
        if (pinnedItems) {
          setFilteredNotes(pinnedItems.map(itemToNote));
        }
      } else if (selectedView === 'trash') {
        // 加载回收站笔记
        const deletedItems = await itemsApi.getDeleted('note');
        if (deletedItems) {
          setFilteredNotes(deletedItems.map(itemToNote));
        }
      } else if (selectedView === 'tag' && selectedTagId) {
        // 加载指定标签的笔记
        const allNotes = await notesApi.getAll();
        if (allNotes) {
          const taggedNotes = allNotes
            .map(itemToNote)
            .filter(note => note.tags.includes(selectedTagId));
          setFilteredNotes(taggedNotes);
        }
      } else if (selectedFolderId === 'uncategorized') {
        // 加载未分类笔记（没有文件夹的笔记）
        const allNotes = await notesApi.getAll();
        if (allNotes) {
          const uncategorizedNotes = allNotes
            .map(itemToNote)
            .filter(note => !note.folderId);
          // 置顶笔记优先
          uncategorizedNotes.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return b.updatedAt - a.updatedAt;
          });
          setFilteredNotes(uncategorizedNotes);
        }
      } else {
        // 使用默认的 notes（按文件夹过滤）
        setFilteredNotes(notes);
      }
    };
    loadFilteredNotes();
  }, [selectedView, selectedTagId, selectedFolderId, notes]);

  const handleSelectView = useCallback((view: 'all' | 'starred' | 'trash') => {
    setSelectedView(view);
    setSelectedFolderId(null);
    setSelectedTagId(null);
    setSelectedNoteId(null);
  }, []);

  const handleSelectFolder = useCallback((folderId: string | null) => {
    if (folderId === 'uncategorized') {
      setSelectedView('all');
      setSelectedFolderId('uncategorized');
    } else {
      setSelectedView(folderId ? 'folder' : 'all');
      setSelectedFolderId(folderId);
    }
    setSelectedTagId(null);
    setSelectedNoteId(null);
  }, []);

  const handleSelectTag = useCallback((tagId: string) => {
    setSelectedView('tag');
    setSelectedTagId(tagId);
    setSelectedFolderId(null);
    setSelectedNoteId(null);
  }, []);

  const handleCreateFolder = useCallback(async (name: string, parentId?: string | null) => {
    await createFolder(name, parentId || null);
  }, [createFolder]);

  const handleCreateNote = useCallback(async () => {
    setTemplateSelectorOpen(true);
  }, []);

  const handleTemplateSelect = useCallback(async (title: string, content: string) => {
    const newNote = await createNote(title, content);
    if (newNote) {
      setIsNewNote(true); // 标记为新建笔记，使用编辑模式
      setSelectedNoteId(newNote.id);
      message.success('笔记已创建');
    }
  }, [createNote]);

  const handleQuickCreateNote = useCallback(async () => {
    const newNote = await createNote('新建笔记', '');
    if (newNote) {
      setIsNewNote(true); // 标记为新建笔记，使用编辑模式
      setSelectedNoteId(newNote.id);
      message.success('笔记已创建');
    }
  }, [createNote]);

  // 选择笔记（从列表点击）- 历史笔记默认预览模式
  const handleSelectNote = useCallback((noteId: string) => {
    setIsNewNote(false); // 打开历史笔记，使用预览模式
    setSelectedNoteId(noteId);
  }, []);

  const handleSaveNote = useCallback(async (id: string, content: string, title: string) => {
    await updateNote(id, { content, title });
    // 通知同步服务有内容变更
    if (syncInitialized) {
      await syncApi.notifyChange();
    }
    setPendingChanges(prev => prev + 1);
  }, [updateNote, syncInitialized]);

  // 处理图片上传
  const handleUploadImage = useCallback(async (file: File): Promise<string | null> => {
    if (!selectedNoteId) return null;

    try {
      // 读取文件为 base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 上传到资源管理器
      const url = await window.electronAPI.resource.uploadImage(
        selectedNoteId,
        base64,
        file.name,
        file.type
      );

      // 通知同步服务有内容变更
      if (syncInitialized) {
        await syncApi.notifyChange();
      }

      return url;
    } catch (error) {
      console.error('Upload image failed:', error);
      return null;
    }
  }, [selectedNoteId, syncInitialized]);

  // 处理附件上传
  const handleUploadAttachment = useCallback(async (file: File): Promise<{ url: string; name: string } | null> => {
    if (!selectedNoteId) return null;

    try {
      // 读取文件为 base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 上传到资源管理器
      const result = await window.electronAPI.resource.uploadAttachment(
        selectedNoteId,
        base64,
        file.name,
        file.type || 'application/octet-stream'
      );

      // 通知同步服务有内容变更
      if (syncInitialized) {
        await syncApi.notifyChange();
      }

      return result;
    } catch (error) {
      console.error('Upload attachment failed:', error);
      return null;
    }
  }, [selectedNoteId, syncInitialized]);

  const handleTogglePin = useCallback(async (id: string, isPinned: boolean) => {
    await updateNote(id, { is_pinned: isPinned });
    await refresh();
    message.success(isPinned ? '已置顶' : '已取消置顶');
  }, [updateNote, refresh]);

  const handleDeleteNote = useCallback(async (id: string) => {
    // 检查笔记是否加密
    const note = filteredNotes.find(n => n.id === id);
    if (note?.isLocked) {
      // 获取完整笔记信息
      const noteItem = await itemsApi.getById(id);
      if (!noteItem) return;

      const payload = parsePayload<NotePayload>(noteItem);
      const storedHash = payload.lock_password_hash;

      let password = '';
      Modal.confirm({
        title: '删除加密笔记',
        content: (
          <div>
            <p style={{ marginBottom: 8, color: '#666' }}>此笔记已加密，删除前需要验证密码：</p>
            <input
              type="password"
              placeholder="输入笔记密码"
              style={{ width: '100%', padding: '8px', border: '1px solid #d9d9d9', borderRadius: 4 }}
              onChange={(e) => { password = e.target.value; }}
            />
          </div>
        ),
        okText: '确认删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          if (!password) {
            message.error('请输入密码');
            return Promise.reject();
          }
          const inputHash = await computePasswordHash(password);

          if (inputHash !== storedHash) {
            message.error('密码错误');
            return Promise.reject();
          }

          await deleteNote(id);
          if (selectedNoteId === id) {
            setSelectedNoteId(null);
          }
          message.success('笔记已移至回收站');
        },
      });
      return;
    }

    // 非加密笔记直接删除
    await deleteNote(id);
    if (selectedNoteId === id) {
      setSelectedNoteId(null);
    }
    message.success('笔记已移至回收站');
  }, [deleteNote, selectedNoteId, filteredNotes]);

  // 永久删除笔记（从回收站彻底删除）
  const handlePermanentDeleteNote = useCallback(async (id: string) => {
    const success = await itemsApi.hardDelete(id);
    if (success) {
      // 刷新回收站视图
      const deletedItems = await itemsApi.getDeleted('note');
      if (deletedItems) {
        setFilteredNotes(deletedItems.map(itemToNote));
      }
      if (selectedNoteId === id) {
        setSelectedNoteId(null);
      }
      message.success('笔记已永久删除');
    }
  }, [selectedNoteId]);

  const handleRestoreNote = useCallback(async (id: string) => {
    const success = await itemsApi.restore(id);
    if (success) {
      // 刷新回收站视图
      const deletedItems = await itemsApi.getDeleted('note');
      if (deletedItems) {
        setFilteredNotes(deletedItems.map(itemToNote));
      }
      message.success('笔记已恢复');
    }
  }, []);

  const handleUpdateNoteTags = useCallback(async (noteId: string, newTags: string[]) => {
    await updateNote(noteId, { tags: newTags });
    message.success('标签已更新');
  }, [updateNote]);

  // 复制笔记
  const handleDuplicateNote = useCallback(async (noteId: string) => {
    const note = filteredNotes.find(n => n.id === noteId);
    if (note) {
      const newNote = await createNote(`${note.title} (副本)`, note.content);
      if (newNote) {
        message.success('笔记已复制');
      }
    }
  }, [filteredNotes, createNote]);

  // 移动/复制笔记到文件夹的状态
  const [moveNoteModalOpen, setMoveNoteModalOpen] = useState(false);
  const [moveNoteId, setMoveNoteId] = useState<string | null>(null);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState<'move' | 'copy'>('move');

  // 移动笔记到文件夹
  const handleMoveToFolder = useCallback(async (noteId: string) => {
    setMoveNoteId(noteId);
    setMoveTargetFolderId(null);
    setMoveMode('move');
    setMoveNoteModalOpen(true);
  }, []);

  // 执行移动/复制操作
  const handleConfirmMoveNote = useCallback(async () => {
    if (!moveNoteId) return;

    try {
      if (moveMode === 'move') {
        // 移动：更新笔记的 folder_id
        await updateNote(moveNoteId, { folder_id: moveTargetFolderId });
        message.success('笔记已移动');
      } else {
        // 复制：创建新笔记
        const noteToClone = notes.find(n => n.id === moveNoteId) || currentNote;
        if (noteToClone) {
          // 使用 notesApi 直接创建，可以指定 folder_id
          await notesApi.create({
            title: noteToClone.title + ' (副本)',
            content: noteToClone.content,
            folder_id: moveTargetFolderId,
            is_pinned: false,
            is_locked: false,
            lock_password_hash: null,
            tags: noteToClone.tags || [],
          });
          message.success('笔记已复制');
        }
      }
      await refresh();
    } catch (err) {
      message.error('操作失败');
    }

    setMoveNoteModalOpen(false);
    setMoveNoteId(null);
  }, [moveNoteId, moveTargetFolderId, moveMode, updateNote, notes, currentNote, refresh]);

  // 计算密码哈希（纯 SHA-256，与 Android 端保持一致）
  const computePasswordHash = async (password: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // 锁定笔记（从 Editor 组件调用）
  const handleLockNoteFromEditor = useCallback(async (noteId: string, passwordHash: string) => {
    await updateNote(noteId, { is_locked: true, lock_password_hash: passwordHash });
    await refresh();
  }, [updateNote, refresh]);

  // 解锁笔记（从 Editor 组件调用，移除加密）
  const handleUnlockNoteFromEditor = useCallback(async (noteId: string) => {
    await updateNote(noteId, { is_locked: false, lock_password_hash: null });
    await refresh();
  }, [updateNote, refresh]);

  // 锁定笔记（从 NoteList 调用）
  const handleLockNote = useCallback(async (noteId: string) => {
    // 弹出密码输入框
    let password = '';
    Modal.confirm({
      title: '锁定笔记',
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>请设置笔记密码：</p>
          <input
            type="password"
            placeholder="输入密码"
            style={{ width: '100%', padding: '8px', border: '1px solid #d9d9d9', borderRadius: 4 }}
            onChange={(e) => { password = e.target.value; }}
          />
        </div>
      ),
      okText: '锁定',
      cancelText: '取消',
      onOk: async () => {
        if (!password || password.length < 4) {
          message.error('密码至少 4 位');
          return Promise.reject();
        }
        // 计算密码哈希（纯 SHA-256，与 Android 端保持一致）
        const passwordHash = await computePasswordHash(password);

        await updateNote(noteId, { is_locked: true, lock_password_hash: passwordHash });
        await refresh();
        message.success('笔记已锁定');
      },
    });
  }, [updateNote, refresh]);

  // 解锁笔记（从 NoteList 调用）
  const handleUnlockNote = useCallback(async (noteId: string) => {
    // 获取笔记的密码哈希
    const note = filteredNotes.find(n => n.id === noteId);
    if (!note) return;

    // 从数据库获取完整笔记信息
    const noteItem = await itemsApi.getById(noteId);
    if (!noteItem) return;

    const payload = parsePayload<NotePayload>(noteItem);
    const storedHash = payload.lock_password_hash;

    let password = '';
    Modal.confirm({
      title: '解锁笔记',
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>请输入笔记密码：</p>
          <input
            type="password"
            placeholder="输入密码"
            style={{ width: '100%', padding: '8px', border: '1px solid #d9d9d9', borderRadius: 4 }}
            onChange={(e) => { password = e.target.value; }}
          />
        </div>
      ),
      okText: '解锁',
      cancelText: '取消',
      onOk: async () => {
        if (!password) {
          message.error('请输入密码');
          return Promise.reject();
        }
        // 计算密码哈希（纯 SHA-256，与 Android 端保持一致）
        const inputHash = await computePasswordHash(password);

        if (inputHash !== storedHash) {
          message.error('密码错误');
          return Promise.reject();
        }

        await updateNote(noteId, { is_locked: false, lock_password_hash: null });
        await refresh();
        message.success('笔记已解锁');
      },
    });
  }, [filteredNotes, updateNote, refresh]);

  // 删除文件夹
  const handleDeleteFolder = useCallback(async (folderId: string) => {
    const success = await deleteFolderApi(folderId);
    if (success) {
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
        setSelectedView('all');
      }
      message.success('文件夹已删除');
    }
  }, [deleteFolderApi, selectedFolderId]);

  // 重命名文件夹
  const handleRenameFolder = useCallback(async (folderId: string, newName: string) => {
    const success = await updateFolder(folderId, { name: newName });
    if (success) {
      message.success('文件夹已重命名');
    }
  }, [updateFolder]);

  // 删除标签
  const handleDeleteTag = useCallback(async (tagId: string) => {
    const success = await deleteTagApi(tagId);
    if (success) {
      if (selectedTagId === tagId) {
        setSelectedTagId(null);
        setSelectedView('all');
      }
      message.success('标签已删除');
    }
  }, [deleteTagApi, selectedTagId]);

  const handleSync = useCallback(async () => {
    if (!syncConfig.enabled) {
      message.warning('请先在设置中配置同步');
      return;
    }

    // 如果同步服务未初始化，尝试重新初始化
    if (!syncInitialized) {
      message.loading({ content: '正在初始化同步服务...', key: 'sync-init' });
      try {
        const success = await syncApi.initialize({
          enabled: syncConfig.enabled,
          type: syncConfig.type,
          url: syncConfig.url,
          syncPath: syncConfig.sync_path || '/mucheng-notes',
          username: syncConfig.username,
          password: syncConfig.password,
          apiKey: syncConfig.api_key,
          syncInterval: syncConfig.sync_interval,
          syncModules: syncConfig.sync_modules,
        });

        if (success) {
          await syncApi.start();
          setSyncInitialized(true);
          message.destroy('sync-init');
        } else {
          message.error({ content: '同步服务初始化失败，请检查配置', key: 'sync-init' });
          return;
        }
      } catch (error) {
        message.error({ content: '同步服务初始化出错', key: 'sync-init' });
        return;
      }
    }

    setSyncStatus('syncing');
    setSyncProgress({ phase: 'connecting', message: '正在连接服务器...' });

    try {
      const result = await syncApi.trigger();

      if (result) {
        setLastSyncResult(result);  // 立即更新结果
        if (result.success) {
          setSyncStatus('idle');
          setSyncProgress(null);  // 清除进度
          setLastSyncTime(Date.now());
          setPendingChanges(0);
          message.success(`同步完成: 上传 ${result.pushed} 项, 下载 ${result.pulled} 项`);
          // 刷新笔记列表
          await refresh();
          // 触发全局同步完成事件，通知其他组件刷新数据
          window.dispatchEvent(new Event('sync-completed'));
        } else {
          setSyncStatus('error');
          setSyncProgress(null);  // 清除进度
          // 检查是否是密钥不匹配错误
          const keyMismatchError = result.errors.find(e => e.includes('key mismatch'));
          // 检查是否是 token 过期错误
          const tokenExpiredError = result.errors.find(e =>
            e.includes('登录已过期') ||
            e.includes('访问令牌无效') ||
            e.includes('Token refresh failed')
          );
          if (keyMismatchError) {
            message.error({
              content: '同步密钥不匹配，请导入正确的同步密钥后重试',
              duration: 5,
            });
          } else if (tokenExpiredError) {
            message.error({
              content: '登录已过期，请在设置中重新登录同步服务器',
              duration: 5,
            });
          } else {
            message.error(`同步失败: ${result.errors.join(', ')}`);
          }
        }
      } else {
        setSyncStatus('error');
        setSyncProgress(null);  // 清除进度
        message.error('同步失败');
      }
    } catch (error) {
      setSyncStatus('error');
      setSyncProgress(null);  // 清除进度
      message.error('同步出错');
    }
  }, [syncConfig, syncInitialized, refresh]);

  // 强制重新同步
  const handleForceResync = useCallback(async () => {
    if (!syncConfig.enabled) {
      message.warning('请先在设置中配置同步');
      return;
    }

    Modal.confirm({
      title: '强制重新同步',
      content: '这将标记所有本地数据为待同步状态，然后执行同步。确定要继续吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          message.loading({ content: '正在标记数据...', key: 'force-resync' });
          const result = await syncApi.forceResync();

          if (result.success) {
            message.success({ content: `已标记 ${result.count} 项数据，开始同步...`, key: 'force-resync' });
            // 更新待同步数量
            setPendingChanges(result.count);
            // 触发同步
            await handleSync();
          } else {
            message.error({ content: result.error || '标记失败', key: 'force-resync' });
          }
        } catch (error) {
          message.error({ content: '操作失败', key: 'force-resync' });
        }
      },
    });
  }, [syncConfig, handleSync]);

  // 选择工具
  const handleSelectTool = useCallback(async (tool: string | null) => {
    // 处理 Excel 笔记创建
    if (tool === 'excel-create') {
      // 创建新的 Excel 笔记
      try {
        const api = getElectronAPI();
        if (api?.items?.create) {
          const payload = {
            title: '新建 Excel 笔记',
            folder_id: selectedFolderId === 'uncategorized' ? null : selectedFolderId,
            is_pinned: false,
            is_locked: false,
            lock_password_hash: null,
            tags: [],
            sheets: [{
              id: crypto.randomUUID(),
              name: 'Sheet1',
              rows: [],
              column_widths: {},
              row_heights: {},
              frozen_rows: 0,
              frozen_columns: 0,
            }],
            active_sheet_index: 0,
          };
          const newNote = await api.items.create('excel_note', payload);
          if (newNote) {
            setSelectedNoteId(newNote.id);
            setCurrentTool(null);
            await refresh();
            message.success('Excel 笔记已创建');
          }
        }
      } catch (err) {
        console.error('Failed to create Excel note:', err);
        message.error('创建 Excel 笔记失败');
      }
      return;
    }
    
    setCurrentTool(tool);
    if (tool) {
      // 切换到工具时清除笔记选择
      setSelectedNoteId(null);
    }
  }, [selectedFolderId, refresh]);

  // 锁定应用
  const handleLockApp = useCallback(() => {
    const securitySettings = localStorage.getItem('mucheng-security');
    if (securitySettings) {
      try {
        const settings = JSON.parse(securitySettings);
        if (settings.appLockEnabled && settings.lockPassword) {
          setIsAppLocked(true);
          setVaultUnlocked(false); // 同时锁定密码库
          message.info('应用已锁定');
        } else {
          message.warning('请先在设置中启用应用锁定');
        }
      } catch {
        message.warning('请先在设置中启用应用锁定');
      }
    } else {
      message.warning('请先在设置中启用应用锁定');
    }
  }, []);

  // 解锁应用
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  // 密码哈希函数
  const hashPassword = async (password: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'mucheng-salt-2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleUnlockApp = useCallback(async (password: string): Promise<boolean> => {
    const securitySettings = localStorage.getItem('mucheng-security');
    if (securitySettings) {
      try {
        const settings = JSON.parse(securitySettings);
        const hashedInput = await hashPassword(password);
        if (hashedInput === settings.lockPassword) {
          setIsAppLocked(false);
          setFailedAttempts(0);
          return true;
        }
      } catch { /* ignore */ }
    }

    const newAttempts = failedAttempts + 1;
    setFailedAttempts(newAttempts);

    // 5次失败后锁定30秒
    if (newAttempts >= 5) {
      setLockedUntil(Date.now() + 30000);
      setTimeout(() => {
        setLockedUntil(null);
        setFailedAttempts(0);
      }, 30000);
    }

    return false;
  }, [failedAttempts]);

  // 启动时检查是否需要锁定
  useEffect(() => {
    const securitySettings = localStorage.getItem('mucheng-security');
    if (securitySettings) {
      try {
        const settings = JSON.parse(securitySettings);
        if (settings.appLockEnabled && settings.lockPassword) {
          setIsAppLocked(true);
        }
      } catch { /* ignore */ }
    }
  }, []);

  // 更新 ref 以保持最新的回调函数
  React.useEffect(() => {
    callbacksRef.current = {
      handleQuickCreateNote,
      handleSync,
      handleDeleteNote,
      handleDuplicateNote,
      handleTogglePin,
      updateSettings,
    };
  }, [handleQuickCreateNote, handleSync, handleDeleteNote, handleDuplicateNote, handleTogglePin, updateSettings]);

  // 更新 ref 以保持最新的状态
  React.useEffect(() => {
    stateRef.current = {
      currentTool,
      selectedNoteId,
      selectedView,
      currentNote,
      filteredNotes,
    };
  }, [currentTool, selectedNoteId, selectedView, currentNote, filteredNotes]);

  // 监听 Web Clipper 笔记创建事件
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.clipper?.onNoteCreated) {
      api.clipper.onNoteCreated(async (data: { noteId: string }) => {
        message.success('网页已保存到笔记');
        await refresh();
        // 选中新创建的笔记
        if (data.noteId) {
          setSelectedNoteId(data.noteId);
          setCurrentTool(null);
          setSelectedView('all');
        }
      });
    }
  }, [refresh]);

  // 如果应用被锁定，显示锁定界面
  if (isAppLocked) {
    return (
      <LockScreen
        onUnlock={handleUnlockApp}
        failedAttempts={failedAttempts}
        lockedUntil={lockedUntil}
      />
    );
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider
        width={180}
        theme={isDarkMode ? 'dark' : 'light'}
        style={{ borderRight: `1px solid ${isDarkMode ? '#303030' : '#eee'}`, background: isDarkMode ? '#141414' : '#fafafa' }}
      >
        <Sidebar
          selectedFolderId={selectedFolderId}
          selectedView={selectedView}
          folders={folders}
          tags={tags}
          aiEnabled={featureSettings.ai_enabled}
          todoEnabled={featureSettings.todo_enabled}
          vaultEnabled={featureSettings.vault_enabled}
          bookmarkEnabled={featureSettings.bookmark_enabled}
          toolboxEnabled={featureSettings.toolbox_enabled}
          diagramEnabled={featureSettings.diagram_enabled}
          transferEnabled={featureSettings.transfer_enabled}
          excelEnabled={featureSettings.excel_enabled}
          currentTool={currentTool}
          onSelectFolder={handleSelectFolder}
          onSelectView={handleSelectView}
          onSelectTag={handleSelectTag}
          onSelectTool={handleSelectTool}
          onCreateNote={handleCreateNote}
          onQuickCreateNote={handleQuickCreateNote}
          onCreateFolder={handleCreateFolder}
          onDeleteFolder={handleDeleteFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteTag={handleDeleteTag}
          onOpenSettings={() => setSettingsOpen(true)}
          onSync={handleSync}
          syncStatus={syncStatus}
        />
      </Sider>
      <Layout>
        {/* 根据当前工具显示不同内容 */}
        {currentTool === 'ai' ? (
          <AIAssistantPanel />
        ) : currentTool === 'todo' ? (
          <Content style={{ background: isDarkMode ? '#141414' : '#fff' }}>
            <TodoPanel />
          </Content>
        ) : currentTool === 'vault' ? (
          (() => {
            const hasVaultPassword = !!localStorage.getItem('mucheng-vault-password');
            if (hasVaultPassword && !vaultUnlocked) {
              return (
                <VaultLockScreen
                  hasPassword={true}
                  onUnlock={() => setVaultUnlocked(true)}
                  onSetPassword={() => setSettingsOpen(true)}
                />
              );
            }
            return <VaultPanel />;
          })()
        ) : currentTool === 'bookmark' ? (
          <BookmarkPanel />
        ) : currentTool === 'toolbox' ? (
          <Content style={{ background: isDarkMode ? '#141414' : '#fff' }}>
            <ToolboxPanel />
          </Content>
        ) : currentTool === 'diagram' ? (
          <Content style={{ background: isDarkMode ? '#141414' : '#fff' }}>
            <DiagramPanel />
          </Content>
        ) : currentTool === 'transfer' ? (
          <Content style={{ background: isDarkMode ? '#141414' : '#fff', padding: 0 }}>
            <TransferPanel visible={currentTool === 'transfer'} />
          </Content>
        ) : (
          <>
            <Sider width={260} theme={isDarkMode ? 'dark' : 'light'} style={{ borderRight: `1px solid ${isDarkMode ? '#303030' : '#eee'}` }}>
              <NoteList
                notes={filteredNotes}
                selectedNoteId={selectedNoteId}
                onSelectNote={handleSelectNote}
                onSearch={searchNotes}
                onDeleteNote={selectedView === 'trash' ? handlePermanentDeleteNote : handleDeleteNote}
                onRestoreNote={selectedView === 'trash' ? handleRestoreNote : undefined}
                onToggleStar={handleTogglePin}
                onDuplicateNote={handleDuplicateNote}
                onMoveToFolder={handleMoveToFolder}
                onLockNote={handleLockNote}
                onUnlockNote={handleUnlockNote}
                onCreateNote={handleQuickCreateNote}
                onCreateTemplateNote={handleCreateNote}
                isTrashView={selectedView === 'trash'}
              />
            </Sider>
            <Layout>
              <Content style={{ padding: 0, background: isDarkMode ? '#141414' : '#fff' }}>
                {/* 根据笔记类型显示不同编辑器 */}
                {currentNote?.type === 'excel_note' ? (
                  <ExcelEditorPanel noteId={selectedNoteId} />
                ) : (
                  <Editor
                    noteId={selectedNoteId}
                    note={currentNote}
                    onSave={handleSaveNote}
                    onToggleStar={handleTogglePin}
                    onUpdateTags={handleUpdateNoteTags}
                    onDelete={handleDeleteNote}
                    onDuplicate={handleDuplicateNote}
                    onLockNote={handleLockNoteFromEditor}
                    onUnlockNote={handleUnlockNoteFromEditor}
                    onUploadImage={handleUploadImage}
                    onUploadAttachment={handleUploadAttachment}
                    allTags={tags}
                    onCreateTag={createTag}
                    isTrashView={selectedView === 'trash'}
                    defaultMode={isNewNote ? 'edit' : 'preview'}
                  />
                )}
              </Content>
              <Footer style={{
                padding: '4px 16px',
                background: isDarkMode ? '#1f1f1f' : '#fafafa',
                borderTop: `1px solid ${isDarkMode ? '#303030' : '#f0f0f0'}`,
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
              }}>
                <SyncStatusBar
                  status={syncStatus}
                  lastSyncTime={lastSyncTime}
                  pendingChanges={pendingChanges}
                  progress={syncProgress}
                  lastResult={lastSyncResult}
                  onSync={handleSync}
                  onForceResync={handleForceResync}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              </Footer>
            </Layout>
          </>
        )}
      </Layout>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} defaultTab={settingsTab} />
      <TemplateSelector
        open={templateSelectorOpen}
        onClose={() => setTemplateSelectorOpen(false)}
        onSelect={handleTemplateSelect}
      />
      <WelcomeGuide open={welcomeOpen} onClose={() => setWelcomeOpen(false)} />

      {/* 移动/复制笔记到文件夹 Modal */}
      <Modal
        title="移动/复制笔记"
        open={moveNoteModalOpen}
        onOk={handleConfirmMoveNote}
        onCancel={() => setMoveNoteModalOpen(false)}
        okText={moveMode === 'move' ? '移动' : '复制'}
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>操作类型</div>
            <Radio.Group value={moveMode} onChange={(e) => setMoveMode(e.target.value)}>
              <Radio value="move">移动（原位置删除）</Radio>
              <Radio value="copy">复制（保留原笔记）</Radio>
            </Radio.Group>
          </div>
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>目标文件夹</div>
            <Select
              style={{ width: '100%' }}
              placeholder="选择目标文件夹"
              value={moveTargetFolderId}
              onChange={setMoveTargetFolderId}
              allowClear
              options={(() => {
                // 构建带层级的文件夹选项
                const buildFolderOptions = (parentId: string | null, level: number): { value: string | null; label: string }[] => {
                  const children = folders.filter(f => f.parentId === parentId);
                  const result: { value: string | null; label: string }[] = [];
                  for (const folder of children) {
                    const indent = '　'.repeat(level); // 使用全角空格缩进
                    const prefix = level > 0 ? '└ ' : '';
                    result.push({
                      value: folder.id,
                      label: `${indent}${prefix}📁 ${folder.name}`
                    });
                    // 递归添加子文件夹
                    result.push(...buildFolderOptions(folder.id, level + 1));
                  }
                  return result;
                };
                return [
                  { value: null, label: '📁 根目录（无文件夹）' },
                  ...buildFolderOptions(null, 0)
                ];
              })()}
            />
          </div>
        </Space>
      </Modal>

    </Layout>
  );
};

export default App;
