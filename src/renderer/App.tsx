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
import BookmarkPanel from './components/BookmarkPanel';
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

  const { syncConfig } = useSettings();
  const { settings: featureSettings } = useFeatureSettings();
  const { notes, createNote, updateNote, deleteNote, searchNotes, refresh } = useNotes(selectedFolderId);
  const { note: currentNote } = useNote(selectedNoteId, selectedView === 'trash');
  const { folders, createFolder, updateFolder, deleteFolder: deleteFolderApi } = useFolders();
  const { tags, createTag, deleteTag: deleteTagApi } = useTags();

  // 监听菜单/快捷键事件
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.onMenuAction) {
      api.onMenuAction((action: string) => {
        switch (action) {
          case 'new-note':
            if (!currentTool) {
              setTemplateSelectorOpen(true);
            }
            break;
          case 'quick-new-note':
            if (!currentTool) {
              handleQuickCreateNote();
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
            handleSync();
            break;
          case 'open-settings':
          case 'sync-settings':
            setSettingsOpen(true);
            break;
          case 'delete-note':
            if (selectedNoteId && !currentTool && selectedView !== 'trash') {
              Modal.confirm({
                title: '删除笔记',
                content: '确定要删除这篇笔记吗？',
                okText: '删除',
                okType: 'danger',
                cancelText: '取消',
                onOk: () => handleDeleteNote(selectedNoteId),
              });
            }
            break;
          case 'duplicate-note':
            if (selectedNoteId && !currentTool) {
              handleDuplicateNote(selectedNoteId);
            }
            break;
          case 'toggle-edit-mode':
            // 编辑器内部处理
            break;
          case 'toggle-star':
            if (selectedNoteId && currentNote && !currentTool) {
              handleTogglePin(selectedNoteId, !currentNote.isPinned);
            }
            break;
          case 'prev-note':
            if (!currentTool && filteredNotes.length > 0) {
              const currentIndex = filteredNotes.findIndex(n => n.id === selectedNoteId);
              if (currentIndex > 0) {
                setSelectedNoteId(filteredNotes[currentIndex - 1].id);
              }
            }
            break;
          case 'next-note':
            if (!currentTool && filteredNotes.length > 0) {
              const currentIndex = filteredNotes.findIndex(n => n.id === selectedNoteId);
              if (currentIndex < filteredNotes.length - 1) {
                setSelectedNoteId(filteredNotes[currentIndex + 1].id);
              }
            }
            break;
          case 'escape':
            setSearchFocused(false);
            break;
          case 'theme-light':
          case 'theme-dark':
          case 'theme-system':
            break;
        }
      });
    }
  }, []);

  // 初始化同步服务
  useEffect(() => {
    const initSync = async () => {
      if (syncConfig.enabled && syncConfig.url) {
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
        }
      }
    };
    initSync();
  }, [syncConfig]);

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

    if (!syncInitialized) {
      message.warning('同步服务未初始化');
      return;
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
  }, [syncConfig.enabled, syncInitialized, refresh]);

  // 选择工具
  const handleSelectTool = useCallback((tool: string | null) => {
    setCurrentTool(tool);
    if (tool) {
      // 切换到工具时清除笔记选择
      setSelectedNoteId(null);
    }
  }, []);

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider
        width={180}
        theme="light"
        style={{ borderRight: '1px solid #eee', background: '#fafafa' }}
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
        />
      </Sider>
      <Layout>
        {/* 根据当前工具显示不同内容 */}
        {currentTool === 'ai' ? (
          <AIAssistantPanel />
        ) : currentTool === 'todo' ? (
          <Content style={{ background: '#fff' }}>
            <TodoPanel />
          </Content>
        ) : currentTool === 'vault' ? (
          <VaultPanel />
        ) : currentTool === 'bookmark' ? (
          <BookmarkPanel />
        ) : (
          <>
            <Sider width={260} theme="light" style={{ borderRight: '1px solid #eee' }}>
              <NoteList
                notes={filteredNotes}
                selectedNoteId={selectedNoteId}
                onSelectNote={setSelectedNoteId}
                onSearch={searchNotes}
                onDeleteNote={handleDeleteNote}
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
              <Content style={{ padding: 0, background: '#fff' }}>
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
                background: '#fafafa', 
                borderTop: '1px solid #f0f0f0',
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

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
