import React, { useState, useCallback, useEffect } from 'react';
import { Layout, message, Modal } from 'antd';
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
import { useNotes, useNote } from './hooks/useNotes';
import { useFolders } from './hooks/useFolders';
import { useTags } from './hooks/useTags';
import { useSettings } from './contexts/SettingsContext';
import { useFeatureSettings } from './hooks/useFeatureSettings';
import { itemsApi, notesApi, parsePayload } from './services/itemsApi';
import { syncApi } from './services/syncApi';
import { ItemBase, NotePayload } from '@shared/types';

const { Sider, Content, Footer } = Layout;

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string>('general');
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'offline'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [pendingChanges, setPendingChanges] = useState(0);
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

  const { syncConfig, updateSettings, isDarkMode, settings } = useSettings();
  const { settings: featureSettings } = useFeatureSettings();
  const { notes, createNote, updateNote, deleteNote, searchNotes, refresh } = useNotes(selectedFolderId);
  const { note: currentNote } = useNote(selectedNoteId, selectedView === 'trash');
  const { folders, createFolder, updateFolder, deleteFolder: deleteFolderApi } = useFolders();
  const { tags, createTag, deleteTag: deleteTagApi } = useTags();

  // 监听窗口关闭请求
  useEffect(() => {
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
        const encryptionKey = localStorage.getItem('mucheng-sync-key') || undefined;
        console.log('Initializing sync service...', { 
          enabled: syncConfig.enabled, 
          url: syncConfig.url,
          type: syncConfig.type 
        });
        
        const success = await syncApi.initialize({
          enabled: syncConfig.enabled,
          type: syncConfig.type,
          url: syncConfig.url,
          syncPath: syncConfig.sync_path || '/mucheng-notes',
          username: syncConfig.username,
          password: syncConfig.password,
          apiKey: syncConfig.api_key,
          encryptionEnabled: syncConfig.encryption_enabled,
          encryptionKey,
          syncInterval: syncConfig.sync_interval,
        });
        
        if (success) {
          await syncApi.start();
          setSyncInitialized(true);
          console.log('Sync service initialized successfully');
        } else {
          setSyncInitialized(false);
          console.error('Failed to initialize sync service');
        }
      } catch (error) {
        console.error('Error initializing sync service:', error);
        setSyncInitialized(false);
      }
    };
    initSync();
  }, [syncConfig.enabled, syncConfig.url, syncConfig.type, syncConfig.username, syncConfig.password, syncConfig.sync_path, syncConfig.encryption_enabled, syncConfig.sync_interval, syncConfig.api_key]);

  // 定期更新同步状态
  useEffect(() => {
    if (!syncInitialized) return;

    const updateSyncState = async () => {
      const state = await syncApi.getState();
      if (state) {
        setSyncStatus(state.status);
        setLastSyncTime(state.lastSyncTime);
        setPendingChanges(state.pendingChanges);
      }
    };

    updateSyncState();
    const interval = setInterval(updateSyncState, 5000);
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
      } else {
        // 使用默认的 notes（按文件夹过滤）
        setFilteredNotes(notes);
      }
    };
    loadFilteredNotes();
  }, [selectedView, selectedTagId, notes]);

  const handleSelectView = useCallback((view: 'all' | 'starred' | 'trash') => {
    setSelectedView(view);
    setSelectedFolderId(null);
    setSelectedTagId(null);
    setSelectedNoteId(null);
  }, []);

  const handleSelectFolder = useCallback((folderId: string | null) => {
    setSelectedView(folderId ? 'folder' : 'all');
    setSelectedFolderId(folderId);
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
      setSelectedNoteId(newNote.id);
      message.success('笔记已创建');
    }
  }, [createNote]);

  const handleQuickCreateNote = useCallback(async () => {
    const newNote = await createNote('新建笔记', '');
    if (newNote) {
      setSelectedNoteId(newNote.id);
      message.success('笔记已创建');
    }
  }, [createNote]);

  const handleSaveNote = useCallback(async (id: string, content: string, title: string) => {
    await updateNote(id, { content, title });
    // 通知同步服务有内容变更
    if (syncInitialized) {
      await syncApi.notifyChange();
    }
    setPendingChanges(prev => prev + 1);
  }, [updateNote, syncInitialized]);

  const handleTogglePin = useCallback(async (id: string, isPinned: boolean) => {
    await updateNote(id, { is_pinned: isPinned });
    await refresh();
    message.success(isPinned ? '已置顶' : '已取消置顶');
  }, [updateNote, refresh]);

  const handleDeleteNote = useCallback(async (id: string) => {
    await deleteNote(id);
    if (selectedNoteId === id) {
      setSelectedNoteId(null);
    }
    message.success('笔记已移至回收站');
  }, [deleteNote, selectedNoteId]);

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

  // 移动笔记到文件夹
  const handleMoveToFolder = useCallback(async (noteId: string) => {
    // 简单实现：显示文件夹选择提示
    message.info('请在编辑器中修改笔记的文件夹');
  }, []);

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
        const encryptionKey = localStorage.getItem('mucheng-sync-key') || undefined;
        const success = await syncApi.initialize({
          enabled: syncConfig.enabled,
          type: syncConfig.type,
          url: syncConfig.url,
          syncPath: syncConfig.sync_path || '/mucheng-notes',
          username: syncConfig.username,
          password: syncConfig.password,
          apiKey: syncConfig.api_key,
          encryptionEnabled: syncConfig.encryption_enabled,
          encryptionKey,
          syncInterval: syncConfig.sync_interval,
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
    
    try {
      const result = await syncApi.trigger();
      
      if (result) {
        if (result.success) {
          setSyncStatus('idle');
          setLastSyncTime(Date.now());
          setPendingChanges(0);
          message.success(`同步完成: 上传 ${result.pushed} 项, 下载 ${result.pulled} 项`);
          // 刷新笔记列表
          await refresh();
        } else {
          setSyncStatus('error');
          message.error(`同步失败: ${result.errors.join(', ')}`);
        }
      } else {
        setSyncStatus('error');
        message.error('同步失败');
      }
    } catch (error) {
      setSyncStatus('error');
      message.error('同步出错');
    }
  }, [syncConfig, syncInitialized, refresh]);

  // 选择工具
  const handleSelectTool = useCallback((tool: string | null) => {
    setCurrentTool(tool);
    if (tool) {
      // 切换到工具时清除笔记选择
      setSelectedNoteId(null);
    }
  }, []);

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
        ) : (
          <>
            <Sider width={260} theme={isDarkMode ? 'dark' : 'light'} style={{ borderRight: `1px solid ${isDarkMode ? '#303030' : '#eee'}` }}>
              <NoteList
                notes={filteredNotes}
                selectedNoteId={selectedNoteId}
                onSelectNote={setSelectedNoteId}
                onSearch={searchNotes}
                onDeleteNote={selectedView === 'trash' ? handlePermanentDeleteNote : handleDeleteNote}
                onRestoreNote={selectedView === 'trash' ? handleRestoreNote : undefined}
                onToggleStar={handleTogglePin}
                onDuplicateNote={handleDuplicateNote}
                onMoveToFolder={handleMoveToFolder}
                onCreateNote={handleQuickCreateNote}
                onCreateTemplateNote={handleCreateNote}
                isTrashView={selectedView === 'trash'}
              />
            </Sider>
            <Layout>
              <Content style={{ padding: 0, background: isDarkMode ? '#141414' : '#fff' }}>
                <Editor
                  noteId={selectedNoteId}
                  note={currentNote}
                  onSave={handleSaveNote}
                  onToggleStar={handleTogglePin}
                  onUpdateTags={handleUpdateNoteTags}
                  onDelete={handleDeleteNote}
                  onDuplicate={handleDuplicateNote}
                  allTags={tags}
                  onCreateTag={createTag}
                  isTrashView={selectedView === 'trash'}
                />
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
                  onSync={handleSync}
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
    </Layout>
  );
};

export default App;
