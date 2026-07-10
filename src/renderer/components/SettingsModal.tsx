import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Select,
  Switch,
  InputNumber,
  Input,
  Button,
  Space,
  message,
  Divider,
  Popconfirm,
  Tag,
  Typography,
  Checkbox,
  Radio,
} from 'antd';
import {
  SettingOutlined,
  CloudOutlined,
  LockOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  RobotOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  CopyOutlined,
  ExportOutlined,
  ImportOutlined,
  GithubOutlined,
  FileOutlined,
} from '@ant-design/icons';
import { useSettings } from '../contexts/SettingsContext';
import { useAISettings } from '../hooks/useAI';
import { useFeatureSettings } from '../hooks/useFeatureSettings';
import { AIChannel, AIModel } from '@shared/types';
import { PRESET_CHANNELS } from '../services/aiApi';

const { Text } = Typography;

// 辅助函数：获取 Electron API
const getElectronAPI = () => (window as any).electronAPI;

// 辅助函数：规范化 URL（移除末尾斜杠）
const normalizeUrl = (url: string): string => url.replace(/\/+$/, '');

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: string;
}

interface SecuritySettings {
  appLockEnabled: boolean;
  autoLockTimeout: number;
  lockOnMinimize: boolean;
  lockPassword: string;
}

interface ClipperExtensionAuthStatus {
  bound: boolean;
  paired: boolean;
  origin: string | null;
  extensionId: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  confirmedAt: number | null;
}

// 快捷键配置
const SHORTCUTS = [
  {
    category: '笔记操作',
    items: [
      { key: 'Ctrl+N', description: '新建笔记' },
      { key: 'Ctrl+Shift+N', description: '从模板新建' },
      { key: 'Ctrl+S', description: '保存笔记' },
      { key: 'Ctrl+D', description: '删除笔记' },
      { key: 'Ctrl+Shift+D', description: '复制笔记' },
      { key: 'Ctrl+P', description: '星标/取消星标' },
      { key: 'Ctrl+↑', description: '上一篇笔记' },
      { key: 'Ctrl+↓', description: '下一篇笔记' },
    ],
  },
  {
    category: '搜索与导航',
    items: [
      { key: 'Ctrl+F', description: '搜索笔记' },
      { key: 'Ctrl+B', description: '切换侧边栏' },
      { key: 'Esc', description: '退出搜索' },
    ],
  },
  {
    category: '同步与设置',
    items: [
      { key: 'Ctrl+Shift+S', description: '立即同步' },
      { key: 'Ctrl+,', description: '打开设置' },
      { key: 'Ctrl+L', description: '锁定应用' },
    ],
  },
];

type TabKey = 'general' | 'features' | 'sync' | 'security' | 'ai' | 'data' | 'shortcuts' | 'about';

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose, defaultTab }) => {
  const {
    settings,
    syncConfig,
    updateSettings,
    setSyncEnabled,
    setSyncType,
    setSyncUrl,
    setSyncPath,
    setSyncUsername,
    setSyncPassword,
    setSyncApiKey,
    setSyncInterval,
    setSyncModule,
    setServerAuth,
    setServerToken,
    clearServerAuth,
    resetSettings,
  } = useSettings();
  const {
    settings: aiSettings,
    updateSettings: updateAISettings,
    addChannel,
    updateChannel,
    deleteChannel,
    addModelToChannel,
    deleteModelFromChannel,
    addMcpServer,
    updateMcpServer,
    deleteMcpServer,
  } = useAISettings();
  const { settings: featureSettings, updateSettings: updateFeatureSettings } = useFeatureSettings();
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState<TabKey>((defaultTab as TabKey) || 'general');

  // 当 defaultTab 变化时更新 activeTab
  useEffect(() => {
    if (defaultTab && open) {
      setActiveTab(defaultTab as TabKey);
    }
  }, [defaultTab, open]);

  // AI 设置状态
  const [editingChannel, setEditingChannel] = useState<AIChannel | null>(null);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [showEditChannel, setShowEditChannel] = useState(false);
  const [newChannelForm, setNewChannelForm] = useState<Partial<AIChannel>>({
    name: '',
    type: 'openai',
    api_url: '',
    api_key: '',
    models: [],
    enabled: true,
  });
  const [editChannelForm, setEditChannelForm] = useState<Partial<AIChannel>>({});
  const [showAddModel, setShowAddModel] = useState<string | null>(null);
  const [newModelName, setNewModelName] = useState('');
  const [newModelId, setNewModelId] = useState('');

  // MCP 设置状态
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [editingMcpServer, setEditingMcpServer] = useState<any | null>(null);
  const [mcpServerForm, setMcpServerForm] = useState({
    name: '',
    command: '',
    args: '',
    env: '{}',
  });

  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>(() => {
    const saved = localStorage.getItem('mucheng-security');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        /* ignore */
      }
    }
    return { appLockEnabled: false, autoLockTimeout: 5, lockOnMinimize: false, lockPassword: '' };
  });
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [passwordInputMode, setPasswordInputMode] = useState<'set' | 'change' | 'remove'>('set');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 密码库锁定设置
  const [vaultPassword, setVaultPassword] = useState(
    () => localStorage.getItem('mucheng-vault-password') || ''
  );
  const [showVaultPasswordInput, setShowVaultPasswordInput] = useState(false);
  const [vaultPasswordMode, setVaultPasswordMode] = useState<'set' | 'change' | 'remove'>('set');
  const [oldVaultPassword, setOldVaultPassword] = useState('');
  const [newVaultPassword, setNewVaultPassword] = useState('');
  const [confirmVaultPassword, setConfirmVaultPassword] = useState('');
  const [clipperAuth, setClipperAuth] = useState<ClipperExtensionAuthStatus | null>(null);
  const [clipperAuthLoading, setClipperAuthLoading] = useState(false);

  // 同步密钥状态
  const [hasSyncKey, setHasSyncKey] = useState(() => !!localStorage.getItem('mucheng-sync-key'));

  // 数据路径信息
  const [appPaths, setAppPaths] = useState<{
    installPath: string;
    exePath: string;
    userDataPath: string;
    logsPath: string;
    tempPath: string;
    appVersion: string;
    isDev: boolean;
  } | null>(null);

  // 导入导出状态
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [includeResources, setIncludeResources] = useState(true);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');

  // 服务器认证状态
  const [serverUsername, setServerUsername] = useState('');
  const [serverPassword, setServerPassword] = useState('');
  const [serverSyncKey, setServerSyncKey] = useState('');
  const [serverAuthLoading, setServerAuthLoading] = useState(false);

  const handleLockNow = () => {
    const api = (window as any).electronAPI;
    api?.triggerMenuAction?.('lock-app');
  };

  const formatSecurityTime = (value: number | null) => {
    if (!value) return '未记录';
    return new Date(value).toLocaleString();
  };

  const loadClipperAuth = async () => {
    const api = getElectronAPI();
    if (!api?.clipper?.getExtensionAuth) return;

    setClipperAuthLoading(true);
    try {
      const status = await api.clipper.getExtensionAuth();
      setClipperAuth(status);
    } catch (error) {
      message.error(`读取插件授权失败: ${(error as Error).message}`);
    } finally {
      setClipperAuthLoading(false);
    }
  };

  const handleRevokeClipperAuth = async () => {
    const api = getElectronAPI();
    if (!api?.clipper?.revokeExtensionAuth) {
      message.error('插件授权管理不可用');
      return;
    }

    try {
      const result = await api.clipper.revokeExtensionAuth();
      if (result?.success) {
        message.success('已撤销浏览器插件授权');
        await loadClipperAuth();
      } else {
        message.error(result?.error || '撤销授权失败');
      }
    } catch (error) {
      message.error(`撤销授权失败: ${(error as Error).message}`);
    }
  };

  const [serverLoggedIn, setServerLoggedIn] = useState(false);
  const [serverUserInfo, setServerUserInfo] = useState<{ username: string; role: string } | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    filePath: string;
    version: string;
    exportTime: number;
    appVersion: string;
    itemsCount: number;
    resourcesCount: number;
    typeCounts: Record<string, number>;
  } | null>(null);

  // 加载应用路径信息
  useEffect(() => {
    if (open && activeTab === 'data') {
      const loadPaths = async () => {
        const api = (window as any).electronAPI;
        if (api?.getAppPaths) {
          const paths = await api.getAppPaths();
          setAppPaths(paths);
        }
      };
      loadPaths();
    }
  }, [open, activeTab]);

  useEffect(() => {
    if (open && activeTab === 'security') {
      loadClipperAuth();
    }
  }, [open, activeTab]);

  // 导出数据
  const handleExportData = async () => {
    setExportLoading(true);
    try {
      const api = (window as any).electronAPI;
      if (api?.data?.export) {
        const result = await api.data.export({ includeResources });
        if (result.success) {
          message.success(
            `导出成功！共导出 ${result.itemsCount} 条数据${includeResources ? `，${result.resourcesCount} 个附件` : ''}`
          );
        } else if (result.error !== '已取消') {
          message.error(`导出失败: ${result.error}`);
        }
      } else {
        message.error('导出功能不可用');
      }
    } catch (error) {
      message.error(`导出失败: ${(error as Error).message}`);
    } finally {
      setExportLoading(false);
    }
  };

  // 预览导入文件
  const handlePreviewImport = async () => {
    try {
      const api = (window as any).electronAPI;
      if (api?.data?.previewImport) {
        const result = await api.data.previewImport();
        if (result.success) {
          setImportPreview({
            filePath: result.filePath,
            version: result.version,
            exportTime: result.exportTime,
            appVersion: result.appVersion,
            itemsCount: result.itemsCount,
            resourcesCount: result.resourcesCount,
            typeCounts: result.typeCounts,
          });
          setShowImportConfirm(true);
        } else if (result.error !== '已取消') {
          message.error(`读取文件失败: ${result.error}`);
        }
      } else {
        message.error('导入功能不可用');
      }
    } catch (error) {
      message.error(`读取文件失败: ${(error as Error).message}`);
    }
  };

  // 执行导入
  const handleImportData = async () => {
    setImportLoading(true);
    setShowImportConfirm(false);
    try {
      const api = (window as any).electronAPI;
      if (api?.data?.import) {
        const result = await api.data.import({ mode: importMode });
        if (result.success) {
          const msg =
            importMode === 'merge'
              ? `导入成功！新增 ${result.itemsImported} 条数据，跳过 ${result.itemsSkipped} 条已存在数据，导入 ${result.resourcesImported} 个附件`
              : `导入成功！共导入 ${result.itemsImported} 条数据，${result.resourcesImported} 个附件`;
          message.success(msg);
          // 如果导入了 AI 设置，清除 localStorage 旧值，重载后会从数据库重新读取
          if (result.aiSettingsImported) {
            localStorage.removeItem('mucheng-ai-settings');
          }
          // 刷新页面以显示新数据
          window.location.reload();
        } else if (result.error !== '已取消') {
          message.error(`导入失败: ${result.error}`);
        }
      }
    } catch (error) {
      message.error(`导入失败: ${(error as Error).message}`);
    } finally {
      setImportLoading(false);
      setImportPreview(null);
    }
  };

  // 获取类型的中文名称
  const getTypeName = (type: string): string => {
    const typeNames: Record<string, string> = {
      note: '笔记',
      folder: '文件夹',
      tag: '标签',
      resource: '附件',
      bookmark: '书签',
      bookmark_folder: '书签文件夹',
      vault_entry: '密码条目',
      vault_folder: '密码文件夹',
      todo: '待办事项',
      diagram: '图表',
      ai_config: 'AI 配置',
      ai_conversation: 'AI 对话',
      ai_message: 'AI 消息',
    };
    return typeNames[type] || type;
  };

  // 简单的密码哈希函数（使用 SHA-256）
  const hashPassword = async (password: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'mucheng-salt-2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // 验证密码
  const verifyPassword = async (input: string, stored: string): Promise<boolean> => {
    const hashed = await hashPassword(input);
    return hashed === stored;
  };

  // 检查应用锁是否启用
  const checkAppLockEnabled = (): boolean => {
    if (!securitySettings.appLockEnabled || !securitySettings.lockPassword) {
      message.warning('请先启用应用锁定');
      return false;
    }
    return true;
  };

  // 触发密钥操作（需要 PIN 验证）
  const handleKeyOperation = (operation: 'generate' | 'export' | 'import') => {
    if (!checkAppLockEnabled()) return;
    setPendingKeyOperation(operation);
    setPinInput('');
    setPinError('');
    setShowPinVerifyModal(true);
  };

  // PIN 验证成功后执行操作
  const executeKeyOperation = async () => {
    if (!pinInput) {
      setPinError('请输入 PIN 码');
      return;
    }

    const isValid = await verifyPassword(pinInput, securitySettings.lockPassword);
    if (!isValid) {
      setPinError('PIN 验证失败，请重试');
      return;
    }

    setShowPinVerifyModal(false);
    setPinInput('');
    setPinError('');

    switch (pendingKeyOperation) {
      case 'generate':
        doGenerateKey();
        break;
      case 'export':
        doExportKey();
        break;
      case 'import':
        setShowImportKeyModal(true);
        break;
    }
    setPendingKeyOperation(null);
  };

  // 实际执行生成密钥
  const doGenerateKey = async () => {
    try {
      const api = getElectronAPI();
      if (!api?.crypto) {
        message.error('加密功能不可用');
        return;
      }

      // 直接生成随机密钥
      const result = await api.crypto.generateKey('');
      if (!result.success) {
        message.error(`生成失败: ${result.error}`);
        return;
      }

      // 保存密钥
      const importResult = await api.crypto.importKey(result.encryptedKey, '');
      if (!importResult.success) {
        message.error('生成失败');
        return;
      }

      localStorage.setItem('mucheng-sync-key', importResult.masterKey);
      setHasSyncKey(true);

      // 复制 Base64 密钥到剪贴板
      await navigator.clipboard.writeText(result.encryptedKey);
      message.success('密钥已生成并复制到剪贴板，请妥善保存');
    } catch (error) {
      message.error('生成失败');
      console.error('Generate key error:', error);
    }
  };

  // 实际执行导出密钥
  const doExportKey = async () => {
    try {
      const key = localStorage.getItem('mucheng-sync-key');
      if (!key) {
        message.error('请先生成密钥');
        return;
      }

      const api = getElectronAPI();
      if (!api?.crypto) {
        message.error('加密功能不可用');
        return;
      }

      // 直接导出 Base64 密钥（不加密）
      const result = await api.crypto.exportKey(key, '');
      if (!result.success) {
        message.error(`导出失败: ${result.error}`);
        return;
      }

      // 复制到剪贴板
      await navigator.clipboard.writeText(result.encryptedKey);
      message.success('密钥已复制到剪贴板，请妥善保存');
    } catch (error) {
      message.error('导出失败');
      console.error('Export key error:', error);
    }
  };

  // 实际执行导入密钥
  const doImportKey = async () => {
    if (!importKeyText) {
      message.error('请输入密钥');
      return;
    }

    try {
      const api = getElectronAPI();
      if (!api?.crypto) {
        message.error('加密功能不可用');
        return;
      }

      // 直接导入 Base64 密钥（不解密）
      const result = await api.crypto.importKey(importKeyText, '');
      if (!result.success) {
        message.error(`导入失败: ${result.error}`);
        return;
      }

      localStorage.setItem('mucheng-sync-key', result.masterKey);
      setHasSyncKey(true);
      message.success('密钥导入成功');
      setShowImportKeyModal(false);
      setImportKeyText('');
    } catch (error) {
      message.error('导入失败：密钥格式错误');
      console.error('Import key error:', error);
    }
  };

  useEffect(() => {
    if (open) {
      form.setFieldsValue(settings);
    }
  }, [open, settings, form]);

  const handleSaveSettings = async () => {
    const values = form.getFieldsValue();
    updateSettings(values);

    // 同步开机启动设置到系统
    try {
      const api = (window as any).electronAPI;
      if (api?.setAutoLaunch) {
        await api.setAutoLaunch(values.auto_launch || false);
      }
    } catch (e) {
      console.error('设置开机启动失败:', e);
    }

    message.success('设置已保存');
  };

  const handleSaveSecuritySettings = async () => {
    if (passwordInputMode === 'set') {
      // 设置新密码
      if (!newPassword || newPassword.length < 4) {
        message.error('密码至少需要4位');
        return;
      }
      if (newPassword !== confirmPassword) {
        message.error('两次密码不一致');
        return;
      }
      const hashedPassword = await hashPassword(newPassword);
      const newSettings = {
        ...securitySettings,
        appLockEnabled: true,
        lockPassword: hashedPassword,
      };
      setSecuritySettings(newSettings);
      localStorage.setItem('mucheng-security', JSON.stringify(newSettings));
      message.success('密码已设置');
    } else if (passwordInputMode === 'change') {
      // 修改密码 - 需要验证旧密码
      if (!oldPassword) {
        message.error('请输入当前密码');
        return;
      }
      const isValid = await verifyPassword(oldPassword, securitySettings.lockPassword);
      if (!isValid) {
        message.error('当前密码错误');
        return;
      }
      if (!newPassword || newPassword.length < 4) {
        message.error('新密码至少需要4位');
        return;
      }
      if (newPassword !== confirmPassword) {
        message.error('两次密码不一致');
        return;
      }
      const hashedPassword = await hashPassword(newPassword);
      const newSettings = { ...securitySettings, lockPassword: hashedPassword };
      setSecuritySettings(newSettings);
      localStorage.setItem('mucheng-security', JSON.stringify(newSettings));
      message.success('密码已修改');
    } else if (passwordInputMode === 'remove') {
      // 移除密码 - 需要验证当前密码
      if (!oldPassword) {
        message.error('请输入当前密码');
        return;
      }
      const isValid = await verifyPassword(oldPassword, securitySettings.lockPassword);
      if (!isValid) {
        message.error('密码错误');
        return;
      }
      const newSettings = { ...securitySettings, appLockEnabled: false, lockPassword: '' };
      setSecuritySettings(newSettings);
      localStorage.setItem('mucheng-security', JSON.stringify(newSettings));
      message.success('已移除应用锁定');
    }

    setShowPasswordInput(false);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleToggleAppLock = (enabled: boolean) => {
    if (enabled && !securitySettings.lockPassword) {
      // 启用锁定 - 设置新密码
      setPasswordInputMode('set');
      setShowPasswordInput(true);
    } else if (!enabled && securitySettings.lockPassword) {
      // 禁用锁定 - 需要验证密码
      setPasswordInputMode('remove');
      setShowPasswordInput(true);
    } else {
      const newSettings = { ...securitySettings, appLockEnabled: enabled };
      setSecuritySettings(newSettings);
      localStorage.setItem('mucheng-security', JSON.stringify(newSettings));
    }
  };

  // 密钥导入状态
  const [showImportKeyModal, setShowImportKeyModal] = useState(false);
  const [importKeyText, setImportKeyText] = useState('');

  // PIN 验证状态（用于密钥操作保护）
  const [showPinVerifyModal, setShowPinVerifyModal] = useState(false);
  const [pendingKeyOperation, setPendingKeyOperation] = useState<
    'generate' | 'export' | 'import' | null
  >(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const handleTestConnection = async () => {
    console.log('[SettingsModal] handleTestConnection called');
    console.log('[SettingsModal] Current syncConfig:', syncConfig);

    const url = syncConfig.url || '';
    const syncPath = syncConfig.sync_path || '/mucheng-notes';
    const type = syncConfig.type || 'webdav';

    // 根据同步类型获取不同的认证信息
    const username = type === 'server' ? syncConfig.server_username : syncConfig.username;
    const password = type === 'server' ? syncConfig.server_password : syncConfig.password;

    console.log('[SettingsModal] Values for test:', {
      url,
      username,
      syncPath,
      type,
      passwordLength: password?.length || 0,
      hasServerToken: !!syncConfig.server_token,
    });

    if (!url) {
      message.error('请填写服务器地址');
      return;
    }

    // WebDAV 需要用户名
    if (type === 'webdav' && !username) {
      message.error('请填写用户名');
      return;
    }

    // 自建服务器需要先登录
    if (type === 'server' && !syncConfig.server_token) {
      message.error('请先登录服务器');
      return;
    }

    message.loading({ content: '测试中...', key: 'test', duration: 0 });

    const startTime = Date.now();
    try {
      const api = (window as any).electronAPI;

      if (api?.sync?.testConnection) {
        const testConfig = {
          enabled: true,
          type: type,
          url: url,
          syncPath: syncPath,
          username: username || '',
          password: password || '',
          syncInterval: syncConfig.sync_interval || 5,
          // 服务器认证信息
          serverToken: syncConfig.server_token,
          serverRefreshToken: syncConfig.server_refresh_token,
          serverTokenExpires: syncConfig.server_token_expires,
        };
        console.log('[SettingsModal] Calling testConnection with config:', {
          ...testConfig,
          password: '***',
          serverToken: testConfig.serverToken ? '***' : undefined,
        });

        const success = await api.sync.testConnection(testConfig);
        const duration = Date.now() - startTime;
        console.log('[SettingsModal] testConnection result:', success, `(${duration}ms)`);

        if (success) {
          message.success({ content: `连接成功 (${duration}ms)`, key: 'test' });
        } else {
          message.error({ content: `连接失败 (${duration}ms)，请检查配置`, key: 'test' });
        }
      } else {
        console.error('[SettingsModal] testConnection API not available');
        message.error({ content: '测试功能不可用', key: 'test' });
      }
    } catch (e) {
      const duration = Date.now() - startTime;
      console.error('[SettingsModal] Connection test exception:', e);
      const errorMsg = e instanceof Error ? e.message : String(e);
      message.error({ content: `连接失败 (${duration}ms): ${errorMsg}`, key: 'test' });
    }
  };

  // 服务器认证处理
  const handleServerLogin = async () => {
    if (!syncConfig.url) {
      message.error('请先填写服务器地址');
      return;
    }
    if (!serverUsername || !serverPassword || !serverSyncKey) {
      message.error('请填写用户名、密码和同步密钥');
      return;
    }

    setServerAuthLoading(true);
    try {
      const baseUrl = normalizeUrl(syncConfig.url);
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: serverUsername,
          password: serverPassword,
          syncKey: serverSyncKey,
        }),
      });

      const data = await response.json();
      // 服务器返回 accessToken，兼容两种字段名
      const token = data.accessToken || data.token;

      if (response.ok && token) {
        // 保存认证信息
        setServerAuth(serverUsername, serverPassword, serverSyncKey);
        setServerToken(token, data.refreshToken, data.expiresIn || 3600);
        setServerLoggedIn(true);
        setServerUserInfo({ username: data.user?.username || serverUsername, role: data.user?.role || 'user' });
        message.success('登录成功');
        // 清空输入
        setServerPassword('');
        setServerSyncKey('');
      } else {
        message.error(data.error?.message || data.message || '登录失败');
      }
    } catch (error) {
      console.error('Login failed:', error);
      message.error('登录失败：网络错误');
    } finally {
      setServerAuthLoading(false);
    }
  };

  const handleServerLogout = async () => {
    if (syncConfig.server_token) {
      try {
        const baseUrl = normalizeUrl(syncConfig.url);
        await fetch(`${baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${syncConfig.server_token}`,
          },
        });
      } catch (error) {
        console.error('Logout request failed:', error);
      }
    }
    clearServerAuth();
    setServerLoggedIn(false);
    setServerUserInfo(null);
    setServerUsername('');
    message.success('已退出登录');
  };

  // 初始化服务器登录状态
  useEffect(() => {
    if (syncConfig.type === 'server' && syncConfig.server_token) {
      setServerLoggedIn(true);
      setServerUsername(syncConfig.server_username || '');
    }
  }, [syncConfig.type, syncConfig.server_token, syncConfig.url]);

  const menuItems = [
    { key: 'general', icon: <SettingOutlined />, label: '通用设置' },
    { key: 'features', icon: <AppstoreOutlined />, label: '功能开关' },
    { key: 'sync', icon: <CloudOutlined />, label: '同步设置' },
    { key: 'security', icon: <LockOutlined />, label: '安全设置' },
    { key: 'ai', icon: <RobotOutlined />, label: 'AI 设置' },
    { key: 'data', icon: <DatabaseOutlined />, label: '数据' },
    { key: 'shortcuts', icon: <ThunderboltOutlined />, label: '快捷键' },
    { key: 'about', icon: <InfoCircleOutlined />, label: '关于' },
  ];

  // 添加渠道
  const handleAddChannel = () => {
    if (!newChannelForm.name || !newChannelForm.api_url || !newChannelForm.api_key) {
      message.error('请填写完整信息');
      return;
    }
    const channel: AIChannel = {
      id: `channel_${Date.now()}`,
      name: newChannelForm.name!,
      type: newChannelForm.type as 'openai' | 'anthropic' | 'gemini' | 'custom',
      api_url: newChannelForm.api_url!,
      api_key: newChannelForm.api_key!,
      models: newChannelForm.models || [],
      enabled: true,
    };
    addChannel(channel);
    setShowAddChannel(false);
    setNewChannelForm({
      name: '',
      type: 'openai',
      api_url: '',
      api_key: '',
      models: [],
      enabled: true,
    });
    message.success('渠道已添加');
  };

  // 从预设添加渠道
  const handleAddPresetChannel = (preset: Partial<AIChannel>) => {
    setNewChannelForm({
      ...preset,
      api_key: '',
      enabled: true,
    });
    setShowAddChannel(true);
  };

  // 编辑渠道
  const handleEditChannel = (channel: AIChannel) => {
    setEditingChannel(channel);
    setEditChannelForm({
      name: channel.name,
      type: channel.type,
      api_url: channel.api_url,
      api_key: channel.api_key,
    });
    setShowEditChannel(true);
  };

  // 保存编辑的渠道
  const handleSaveEditChannel = () => {
    if (!editingChannel) return;
    if (!editChannelForm.name || !editChannelForm.api_url) {
      message.error('请填写完整信息');
      return;
    }
    updateChannel(editingChannel.id, {
      name: editChannelForm.name,
      type: editChannelForm.type as 'openai' | 'anthropic' | 'gemini' | 'custom',
      api_url: editChannelForm.api_url,
      api_key: editChannelForm.api_key,
    });
    setShowEditChannel(false);
    setEditingChannel(null);
    setEditChannelForm({});
    message.success('渠道已更新');
  };

  // 刷新渠道模型列表
  const handleRefreshModels = async (channel: AIChannel) => {
    message.loading({ content: '获取模型列表...', key: 'refresh-models' });
    try {
      let models: AIModel[] = [];

      // Gemini API 使用不同的格式
      if (channel.type === 'gemini') {
        // Gemini API: {baseUrl}/models?key={apiKey}
        let baseUrl = channel.api_url;
        if (baseUrl.endsWith('/')) {
          baseUrl = baseUrl.slice(0, -1);
        }

        const response = await fetch(`${baseUrl}/models?key=${channel.api_key}`);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`获取失败: ${response.status} - ${errorText}`);
        }
        const data = await response.json();

        // Gemini 返回格式: { models: [{ name: "models/gemini-1.5-flash", ... }] }
        models = (data.models || [])
          .filter((m: any) => m.name && m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => ({
            id: m.name.replace('models/', ''), // "models/gemini-1.5-flash" -> "gemini-1.5-flash"
            name: m.displayName || m.name.replace('models/', ''),
            channel_id: channel.id,
            max_tokens: m.inputTokenLimit || 1048576,
            is_custom: false,
          }));
      } else {
        // OpenAI 兼容 API
        let baseUrl = channel.api_url;
        if (baseUrl.endsWith('/chat/completions')) {
          baseUrl = baseUrl.replace('/chat/completions', '');
        } else if (baseUrl.endsWith('/messages')) {
          baseUrl = baseUrl.replace('/messages', '');
        } else if (baseUrl.endsWith('/')) {
          baseUrl = baseUrl.slice(0, -1);
        }

        const response = await fetch(`${baseUrl}/models`, {
          headers: {
            Authorization: `Bearer ${channel.api_key}`,
          },
        });
        if (!response.ok) throw new Error('获取失败');
        const data = await response.json();
        models = (data.data || []).map((m: any) => ({
          id: m.id,
          name: m.id,
          channel_id: channel.id,
          max_tokens: 4096,
          is_custom: false,
        }));
      }

      // 更新渠道的模型列表
      updateChannel(channel.id, { models });
      message.success({ content: `已获取 ${models.length} 个模型`, key: 'refresh-models' });
    } catch (err: any) {
      console.error('获取模型列表失败:', err);
      message.error({ content: `获取模型列表失败: ${err.message || '未知错误'}`, key: 'refresh-models' });
    }
  };

  // 添加自定义模型
  const handleAddModel = (channelId: string) => {
    if (!newModelName || !newModelId) {
      message.error('请填写模型名称和 ID');
      return;
    }
    const model: AIModel = {
      id: newModelId,
      name: newModelName,
      channel_id: channelId,
      max_tokens: 4096,
      is_custom: true,
    };
    addModelToChannel(channelId, model);
    setShowAddModel(null);
    setNewModelName('');
    setNewModelId('');
    message.success('模型已添加');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>通用设置</h3>
            <Form
              form={form}
              layout="horizontal"
              labelCol={{ span: 6 }}
              wrapperCol={{ span: 18 }}
              labelAlign="left"
            >
              <Form.Item name="theme" label="主题模式">
                <Select
                  style={{ width: 200 }}
                  options={[
                    { value: 'light', label: '浅色模式' },
                    { value: 'dark', label: '深色模式' },
                    { value: 'system', label: '跟随系统' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="language" label="界面语言">
                <Select
                  style={{ width: 200 }}
                  options={[
                    { value: 'zh-CN', label: '简体中文' },
                    { value: 'en-US', label: 'English' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="font_size" label="编辑器字号">
                <InputNumber min={12} max={24} addonAfter="px" style={{ width: 120 }} />
              </Form.Item>
              <Divider style={{ margin: '16px 0' }} />
              <Form.Item name="auto_save" label="自动保存" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="auto_save_interval" label="保存间隔">
                <InputNumber min={10} max={300} addonAfter="秒" style={{ width: 120 }} />
              </Form.Item>
              <Form.Item
                name="note_history_enabled"
                label="笔记历史"
                valuePropName="checked"
                tooltip="开启后，每次保存普通笔记时记录一个可查看的历史快照"
              >
                <Switch />
              </Form.Item>
              <Form.Item name="show_line_numbers" label="显示行号" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Divider style={{ margin: '16px 0' }} />
              <Form.Item
                name="auto_launch"
                label="开机自启动"
                valuePropName="checked"
                tooltip="开启后系统启动时自动运行暮城笔记"
              >
                <Switch />
              </Form.Item>
              <Form.Item
                name="close_to_tray"
                label="关闭到托盘"
                valuePropName="checked"
                tooltip="开启后点击关闭按钮将最小化到系统托盘而非退出"
              >
                <Switch />
              </Form.Item>
              <Divider style={{ margin: '16px 0' }} />
              <Form.Item wrapperCol={{ offset: 6 }}>
                <Space>
                  <Button type="primary" onClick={handleSaveSettings}>
                    保存设置
                  </Button>
                  <Button
                    onClick={() => {
                      resetSettings();
                      form.setFieldsValue(settings);
                    }}
                  >
                    恢复默认
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </div>
        );

      case 'features':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>功能开关</h3>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>
              启用或禁用应用功能，禁用后对应的入口按钮将不显示
            </p>

            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>智能助理 (AI)</span>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>
                    接入 AI 模型进行对话
                  </p>
                </div>
                <Switch
                  checked={featureSettings.ai_enabled}
                  onChange={checked => updateFeatureSettings({ ai_enabled: checked })}
                />
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>待办事项</span>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>
                    四象限待办管理，支持提醒
                  </p>
                </div>
                <Switch
                  checked={featureSettings.todo_enabled}
                  onChange={checked => updateFeatureSettings({ todo_enabled: checked })}
                />
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>密码库</span>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>
                    安全存储密码、银行卡等敏感信息
                  </p>
                </div>
                <Switch
                  checked={featureSettings.vault_enabled}
                  onChange={checked => updateFeatureSettings({ vault_enabled: checked })}
                />
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>书签</span>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>
                    收藏常用网址，支持多级目录
                  </p>
                </div>
                <Switch
                  checked={featureSettings.bookmark_enabled}
                  onChange={checked => updateFeatureSettings({ bookmark_enabled: checked })}
                />
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>工具箱</span>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>
                    常用工具集合，包含编码转换、二维码生成等
                  </p>
                </div>
                <Switch
                  checked={featureSettings.toolbox_enabled}
                  onChange={checked => updateFeatureSettings({ toolbox_enabled: checked })}
                />
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>脑图</span>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>
                    脑图、流程图、白板，支持同步
                  </p>
                </div>
                <Switch
                  checked={featureSettings.diagram_enabled}
                  onChange={checked => updateFeatureSettings({ diagram_enabled: checked })}
                />
              </div>

              {/* Excel 笔记 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>Excel 笔记</div>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>
                    电子表格笔记，支持公式计算、导入导出
                  </p>
                </div>
                <Switch
                  checked={featureSettings.excel_enabled}
                  onChange={checked => updateFeatureSettings({ excel_enabled: checked })}
                />
              </div>

              {/* 网盘 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>网盘</div>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>
                    监听本地文件夹并同步到云端，支持分块上传与断点续传
                  </p>
                </div>
                <Switch
                  checked={featureSettings.cloud_drive_enabled}
                  onChange={checked => updateFeatureSettings({ cloud_drive_enabled: checked })}
                />
              </div>
            </div>
          </div>
        );

      case 'sync':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>同步设置</h3>
            <Form
              layout="horizontal"
              labelCol={{ span: 6 }}
              wrapperCol={{ span: 18 }}
              labelAlign="left"
            >
              <Form.Item label="启用同步">
                <Switch
                  checked={syncConfig.enabled}
                  onChange={checked => setSyncEnabled(checked)}
                />
              </Form.Item>

              {syncConfig.enabled && (
                <>
                  <Form.Item label="同步方式">
                    <Select
                      style={{ width: 200 }}
                      value={syncConfig.type || 'webdav'}
                      onChange={value => setSyncType(value)}
                      options={[
                        { value: 'webdav', label: 'WebDAV' },
                        { value: 'server', label: '自建服务器' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item label="服务器地址">
                    <Input
                      placeholder="https://example.com/dav"
                      value={syncConfig.url || ''}
                      onChange={e => setSyncUrl(e.target.value)}
                    />
                  </Form.Item>
                  <Form.Item label="同步目录" tooltip="数据将同步到此目录下，避免与其他数据混淆">
                    <Input
                      placeholder="/mucheng-notes"
                      value={syncConfig.sync_path || '/mucheng-notes'}
                      onChange={e => setSyncPath(e.target.value)}
                    />
                  </Form.Item>
                  {syncConfig.type === 'webdav' ? (
                    <>
                      <Form.Item label="用户名">
                        <Input
                          placeholder="可选"
                          style={{ width: 200 }}
                          value={syncConfig.username || ''}
                          onChange={e => setSyncUsername(e.target.value)}
                        />
                      </Form.Item>
                      <Form.Item label="密码">
                        <Input.Password
                          placeholder="可选"
                          style={{ width: 200 }}
                          value={syncConfig.password || ''}
                          onChange={e => setSyncPassword(e.target.value)}
                        />
                      </Form.Item>
                    </>
                  ) : (
                    <>
                      {serverLoggedIn ? (
                        <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                              <span style={{ fontWeight: 500 }}>已登录</span>
                              <span style={{ marginLeft: 12, color: '#666' }}>
                                用户: {syncConfig.server_username || serverUsername}
                                {serverUserInfo?.role === 'admin' && <Tag color="gold" style={{ marginLeft: 8 }}>管理员</Tag>}
                              </span>
                            </div>
                            <Button size="small" onClick={handleServerLogout}>退出登录</Button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ background: '#fafafa', border: '1px solid #d9d9d9', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                          <Form.Item label="用户名" style={{ marginBottom: 12 }}>
                            <Input
                              placeholder="输入用户名"
                              style={{ width: 250 }}
                              value={serverUsername}
                              onChange={e => setServerUsername(e.target.value)}
                              autoComplete="username"
                            />
                          </Form.Item>
                          <Form.Item label="密码" style={{ marginBottom: 12 }}>
                            <Input.Password
                              placeholder="输入密码"
                              style={{ width: 250 }}
                              value={serverPassword}
                              onChange={e => setServerPassword(e.target.value)}
                              autoComplete="current-password"
                            />
                          </Form.Item>
                          <Form.Item
                            label="同步密钥"
                            tooltip="用于加密同步数据，请妥善保管。不同设备需使用相同密钥才能同步。"
                            style={{ marginBottom: 12 }}
                          >
                            <Input.Password
                              placeholder="输入同步密钥"
                              style={{ width: 250 }}
                              value={serverSyncKey}
                              onChange={e => setServerSyncKey(e.target.value)}
                              autoComplete="off"
                            />
                          </Form.Item>
                          <Form.Item style={{ marginBottom: 0 }}>
                            <Button
                              type="primary"
                              loading={serverAuthLoading}
                              onClick={handleServerLogin}
                            >
                              登录
                            </Button>
                          </Form.Item>
                        </div>
                      )}
                    </>
                  )}
                  <Divider style={{ margin: '16px 0' }} />
                  <Form.Item label="同步间隔">
                    <Select
                      style={{ width: 120 }}
                      value={syncConfig.sync_interval || 5}
                      onChange={value => setSyncInterval(value)}
                      options={[
                        { value: 1, label: '1 分钟' },
                        { value: 5, label: '5 分钟' },
                        { value: 15, label: '15 分钟' },
                        { value: 30, label: '30 分钟' },
                        { value: 60, label: '1 小时' },
                      ]}
                    />
                  </Form.Item>
                  <Divider style={{ margin: '16px 0' }} />
                  <Form.Item label="同步模块" tooltip="选择需要同步的数据模块">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Checkbox
                        checked={syncConfig.sync_modules?.notes ?? true}
                        onChange={e => setSyncModule('notes', e.target.checked)}
                      >
                        笔记（含文件夹、标签、附件）
                      </Checkbox>
                      <Checkbox
                        checked={syncConfig.sync_modules?.bookmarks ?? true}
                        onChange={e => setSyncModule('bookmarks', e.target.checked)}
                      >
                        书签
                      </Checkbox>
                      <Checkbox
                        checked={syncConfig.sync_modules?.vault ?? true}
                        onChange={e => setSyncModule('vault', e.target.checked)}
                      >
                        密码库
                      </Checkbox>
                      <Checkbox
                        checked={syncConfig.sync_modules?.diagrams ?? true}
                        onChange={e => setSyncModule('diagrams', e.target.checked)}
                      >
                        脑图 / 流程图 / 白板
                      </Checkbox>
                      <Checkbox
                        checked={syncConfig.sync_modules?.todos ?? true}
                        onChange={e => setSyncModule('todos', e.target.checked)}
                      >
                        待办事项
                      </Checkbox>
                      <Checkbox
                        checked={syncConfig.sync_modules?.ai ?? true}
                        onChange={e => setSyncModule('ai', e.target.checked)}
                      >
                        AI 助手（配置与对话）
                      </Checkbox>
                    </div>
                  </Form.Item>
                  <Divider style={{ margin: '16px 0' }} />
                </>
              )}
              <Form.Item wrapperCol={{ offset: syncConfig.enabled ? 6 : 0 }}>
                <Space>
                  {syncConfig.enabled && <Button onClick={handleTestConnection}>测试连接</Button>}
                </Space>
              </Form.Item>
            </Form>
          </div>
        );

      case 'security':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>安全设置</h3>

            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <span style={{ fontWeight: 500 }}>应用锁定</span>
                <Switch checked={securitySettings.appLockEnabled} onChange={handleToggleAppLock} />
              </div>
              <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
                启用后每次打开应用需要输入密码
              </p>
            </div>

            {showPasswordInput && (
              <div
                style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 24 }}
              >
                <p style={{ margin: '0 0 12px', fontWeight: 500 }}>
                  {passwordInputMode === 'set'
                    ? '设置锁定密码'
                    : passwordInputMode === 'change'
                      ? '修改锁定密码'
                      : '验证密码以移除锁定'}
                </p>
                {(passwordInputMode === 'change' || passwordInputMode === 'remove') && (
                  <Input.Password
                    placeholder="输入当前密码"
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    style={{ marginBottom: 12 }}
                  />
                )}
                {passwordInputMode !== 'remove' && (
                  <>
                    <Input.Password
                      placeholder={
                        passwordInputMode === 'change'
                          ? '输入新密码（至少4位）'
                          : '输入密码（至少4位）'
                      }
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      style={{ marginBottom: 12 }}
                    />
                    <Input.Password
                      placeholder="确认密码"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      style={{ marginBottom: 12 }}
                    />
                  </>
                )}
                <Space>
                  <Button type="primary" size="small" onClick={handleSaveSecuritySettings}>
                    {passwordInputMode === 'remove' ? '确认移除' : '确定'}
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setShowPasswordInput(false);
                      setOldPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                  >
                    取消
                  </Button>
                </Space>
              </div>
            )}

            {securitySettings.appLockEnabled && !showPasswordInput && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>自动锁定时间</span>
                    <Select
                      value={securitySettings.autoLockTimeout}
                      onChange={v => {
                        const s = { ...securitySettings, autoLockTimeout: v };
                        setSecuritySettings(s);
                        localStorage.setItem('mucheng-security', JSON.stringify(s));
                      }}
                      style={{ width: 120 }}
                      options={[
                        { value: 1, label: '1 分钟' },
                        { value: 5, label: '5 分钟' },
                        { value: 15, label: '15 分钟' },
                        { value: 30, label: '30 分钟' },
                        { value: 0, label: '从不' },
                      ]}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>最小化后自动锁定</span>
                    <Switch
                      checked={securitySettings.lockOnMinimize}
                      onChange={checked => {
                        const s = { ...securitySettings, lockOnMinimize: checked };
                        setSecuritySettings(s);
                        localStorage.setItem('mucheng-security', JSON.stringify(s));
                      }}
                    />
                  </div>
                  <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
                    窗口最小化到任务栏或托盘时立即锁定应用
                  </p>
                </div>
                <Space>
                  <Button type="primary" size="small" onClick={handleLockNow}>
                    立即锁定
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setPasswordInputMode('change');
                      setShowPasswordInput(true);
                    }}
                  >
                    修改密码
                  </Button>
                  <Button
                    danger
                    size="small"
                    onClick={() => {
                      setPasswordInputMode('remove');
                      setShowPasswordInput(true);
                    }}
                  >
                    移除锁定
                  </Button>
                </Space>
              </>
            )}

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <span style={{ fontWeight: 500 }}>浏览器插件授权</span>
                <Space>
                  <Button size="small" onClick={loadClipperAuth} loading={clipperAuthLoading}>
                    刷新
                  </Button>
                  {clipperAuth?.bound && (
                    <Popconfirm
                      title="撤销浏览器插件授权？"
                      description="撤销后，插件需要重新经过桌面端确认才能连接。"
                      okText="撤销"
                      cancelText="取消"
                      onConfirm={handleRevokeClipperAuth}
                    >
                      <Button danger size="small">
                        撤销授权
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              </div>

              <div
                style={{
                  background: '#f5f5f5',
                  borderRadius: 8,
                  padding: 16,
                  color: '#555',
                  fontSize: 13,
                }}
              >
                {clipperAuth?.bound ? (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <Tag color={clipperAuth.paired ? 'green' : 'orange'} style={{ marginRight: 8 }}>
                        {clipperAuth.paired ? '已授权' : '待确认'}
                      </Tag>
                      <Text code copyable>
                        {clipperAuth.extensionId || clipperAuth.origin}
                      </Text>
                    </div>
                    <div style={{ marginBottom: 4 }}>
                      来源：<Text code>{clipperAuth.origin}</Text>
                    </div>
                    <div style={{ color: '#888' }}>
                      确认时间：{clipperAuth.confirmedAt ? formatSecurityTime(clipperAuth.confirmedAt) : '未确认'}
                    </div>
                    {!clipperAuth.paired && (
                      <div style={{ color: '#fa8c16', marginTop: 8 }}>
                        此绑定缺少桌面端确认，插件下次连接时会弹窗确认。
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Tag style={{ marginRight: 8 }}>未授权</Tag>
                    <span>插件首次连接时会在桌面端弹窗确认。</span>
                  </>
                )}
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            {/* 密码库锁定 */}
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <span style={{ fontWeight: 500 }}>密码库锁定</span>
                {vaultPassword && (
                  <span style={{ color: '#52c41a', fontSize: 12 }}>
                    <CheckCircleOutlined /> 已设置
                  </span>
                )}
              </div>
              <p style={{ color: '#888', fontSize: 13, margin: '0 0 12px' }}>
                为密码库设置独立密码，每次访问密码库需要验证
              </p>

              {showVaultPasswordInput ? (
                <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                  <p style={{ margin: '0 0 12px', fontWeight: 500 }}>
                    {vaultPasswordMode === 'set'
                      ? '设置密码库密码'
                      : vaultPasswordMode === 'change'
                        ? '修改密码库密码'
                        : '验证密码以移除'}
                  </p>
                  {(vaultPasswordMode === 'change' || vaultPasswordMode === 'remove') && (
                    <Input.Password
                      placeholder="输入当前密码"
                      value={oldVaultPassword}
                      onChange={e => setOldVaultPassword(e.target.value)}
                      style={{ marginBottom: 12 }}
                    />
                  )}
                  {vaultPasswordMode !== 'remove' && (
                    <>
                      <Input.Password
                        placeholder={
                          vaultPasswordMode === 'change'
                            ? '输入新密码（至少4位）'
                            : '输入密码（至少4位）'
                        }
                        value={newVaultPassword}
                        onChange={e => setNewVaultPassword(e.target.value)}
                        style={{ marginBottom: 12 }}
                      />
                      <Input.Password
                        placeholder="确认密码"
                        value={confirmVaultPassword}
                        onChange={e => setConfirmVaultPassword(e.target.value)}
                        style={{ marginBottom: 12 }}
                      />
                    </>
                  )}
                  <Space>
                    <Button
                      type="primary"
                      size="small"
                      onClick={async () => {
                        if (vaultPasswordMode === 'set') {
                          if (!newVaultPassword || newVaultPassword.length < 4) {
                            message.error('密码至少需要4位');
                            return;
                          }
                          if (newVaultPassword !== confirmVaultPassword) {
                            message.error('两次密码不一致');
                            return;
                          }
                          const hashed = await hashPassword(newVaultPassword);
                          localStorage.setItem('mucheng-vault-password', hashed);
                          setVaultPassword(hashed);
                          message.success('密码库密码已设置');
                        } else if (vaultPasswordMode === 'change') {
                          if (!oldVaultPassword) {
                            message.error('请输入当前密码');
                            return;
                          }
                          const isValid = await verifyPassword(oldVaultPassword, vaultPassword);
                          if (!isValid) {
                            message.error('当前密码错误');
                            return;
                          }
                          if (!newVaultPassword || newVaultPassword.length < 4) {
                            message.error('新密码至少需要4位');
                            return;
                          }
                          if (newVaultPassword !== confirmVaultPassword) {
                            message.error('两次密码不一致');
                            return;
                          }
                          const hashed = await hashPassword(newVaultPassword);
                          localStorage.setItem('mucheng-vault-password', hashed);
                          setVaultPassword(hashed);
                          message.success('密码库密码已修改');
                        } else if (vaultPasswordMode === 'remove') {
                          if (!oldVaultPassword) {
                            message.error('请输入当前密码');
                            return;
                          }
                          const isValid = await verifyPassword(oldVaultPassword, vaultPassword);
                          if (!isValid) {
                            message.error('密码错误');
                            return;
                          }
                          localStorage.removeItem('mucheng-vault-password');
                          setVaultPassword('');
                          message.success('已移除密码库密码');
                        }
                        setShowVaultPasswordInput(false);
                        setOldVaultPassword('');
                        setNewVaultPassword('');
                        setConfirmVaultPassword('');
                      }}
                    >
                      {vaultPasswordMode === 'remove' ? '确认移除' : '确定'}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setShowVaultPasswordInput(false);
                        setOldVaultPassword('');
                        setNewVaultPassword('');
                        setConfirmVaultPassword('');
                      }}
                    >
                      取消
                    </Button>
                  </Space>
                </div>
              ) : (
                <Space>
                  {vaultPassword ? (
                    <>
                      <Button
                        size="small"
                        onClick={() => {
                          setVaultPasswordMode('change');
                          setShowVaultPasswordInput(true);
                        }}
                      >
                        修改密码
                      </Button>
                      <Button
                        danger
                        size="small"
                        onClick={() => {
                          setVaultPasswordMode('remove');
                          setShowVaultPasswordInput(true);
                        }}
                      >
                        移除密码
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="small"
                      onClick={() => {
                        setVaultPasswordMode('set');
                        setShowVaultPasswordInput(true);
                      }}
                    >
                      设置密码
                    </Button>
                  )}
                </Space>
              )}
            </div>
          </div>
        );

      case 'ai':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>AI 设置</h3>

            {/* MCP 工具服务 */}
            <div style={{ marginBottom: 24, border: '1px solid #d9d9d9', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>MCP 工具服务</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    Model Context Protocol (MCP) 允许 AI 连接外部工具和数据
                  </div>
                </div>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditingMcpServer(null);
                    setMcpServerForm({
                      name: '',
                      command: '',
                      args: '',
                      env: '{}',
                    });
                    setShowMcpModal(true);
                  }}
                >
                  添加服务
                </Button>
              </div>

              {(!aiSettings.mcp_servers || aiSettings.mcp_servers.length === 0) ? (
                <div style={{ textAlign: 'center', color: '#999', padding: '12px 0', fontSize: 13, background: '#fafafa', borderRadius: 6 }}>
                  暂无 MCP 服务，添加后 AI 可调用本地工具
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {aiSettings.mcp_servers.map(server => (
                    <div
                      key={server.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: '#fafafa',
                        borderRadius: 6,
                        border: '1px solid #f0f0f0'
                      }}
                    >
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {server.name}
                          <Tag color={server.enabled ? 'green' : 'default'} style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>
                            {server.enabled ? '已启用' : '已禁用'}
                          </Tag>
                        </div>
                        <div style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 4 }}>
                          <span style={{ fontFamily: 'monospace', background: '#eee', padding: '0 4px', borderRadius: 2 }}>{server.command}</span>
                          <span style={{ marginLeft: 4 }}>{server.args.join(' ')}</span>
                        </div>
                      </div>
                      <Space>
                        <Switch
                          size="small"
                          checked={server.enabled}
                          onChange={async (checked) => {
                            updateMcpServer(server.id, { enabled: checked });
                            try {
                              if (checked) {
                                await window.electronAPI.mcp.startServer({ ...server, enabled: true });
                                message.success('MCP 服务已启动');
                              } else {
                                await window.electronAPI.mcp.stopServer(server.id);
                                message.success('MCP 服务已停止');
                              }
                            } catch (e) {
                              message.error('操作失败: ' + e);
                            }
                          }}
                        />
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setEditingMcpServer(server);
                            setMcpServerForm({
                              name: server.name,
                              command: server.command,
                              args: server.args.join(' '),
                              env: JSON.stringify(server.env || {}, null, 2),
                            });
                            setShowMcpModal(true);
                          }}
                        />
                        <Popconfirm
                          title="删除此 MCP 服务？"
                          onConfirm={async () => {
                            deleteMcpServer(server.id);
                            await window.electronAPI.mcp.stopServer(server.id);
                          }}
                        >
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Space>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Divider style={{ margin: '16px 0' }} />

            {/* 渠道列表 */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <span style={{ fontWeight: 500 }}>AI 渠道</span>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => setShowAddChannel(true)}
                >
                  添加渠道
                </Button>
              </div>

              {/* 渠道列表 */}
              {aiSettings.channels.map(channel => (
                <div
                  key={channel.id}
                  style={{
                    border: '1px solid #f0f0f0',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 12,
                    background: channel.enabled ? '#fff' : '#fafafa',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 500 }}>{channel.name}</span>
                      <Tag
                        style={{ marginLeft: 8 }}
                        color={
                          channel.type === 'openai'
                            ? 'green'
                            : channel.type === 'anthropic'
                              ? 'orange'
                              : channel.type === 'gemini'
                                ? 'blue'
                                : 'default'
                        }
                      >
                        {channel.type}
                      </Tag>
                    </div>
                    <Space>
                      <Switch
                        size="small"
                        checked={channel.enabled}
                        onChange={checked => updateChannel(channel.id, { enabled: checked })}
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEditChannel(channel)}
                      />
                      <Popconfirm
                        title="确定删除此渠道？"
                        onConfirm={() => deleteChannel(channel.id)}
                      >
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>
                  <p style={{ fontSize: 12, color: '#888', margin: '0 0 8px' }}>
                    {channel.api_url}
                  </p>

                  {/* 测试连接按钮 */}
                  <div style={{ marginBottom: 8 }}>
                    <Button
                      type="link"
                      size="small"
                      onClick={async () => {
                        message.loading({ content: '测试连接中...', key: 'test-ai' });
                        try {
                          // 从 api_url 提取基础 URL
                          let baseUrl = channel.api_url;
                          if (baseUrl.endsWith('/chat/completions')) {
                            baseUrl = baseUrl.replace('/chat/completions', '');
                          } else if (baseUrl.endsWith('/messages')) {
                            baseUrl = baseUrl.replace('/messages', '');
                          } else if (baseUrl.endsWith('/')) {
                            baseUrl = baseUrl.slice(0, -1);
                          }

                          const response = await fetch(`${baseUrl}/models`, {
                            headers: {
                              Authorization: `Bearer ${channel.api_key}`,
                            },
                          });
                          if (response.ok) {
                            message.success({ content: '连接成功', key: 'test-ai' });
                          } else {
                            message.error({
                              content: `连接失败: ${response.status}`,
                              key: 'test-ai',
                            });
                          }
                        } catch (err) {
                          message.error({
                            content: '连接失败，请检查网络或 API 地址',
                            key: 'test-ai',
                          });
                        }
                      }}
                      style={{ padding: 0, height: 'auto', fontSize: 12 }}
                    >
                      测试连接
                    </Button>
                  </div>

                  {/* 模型列表 */}
                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontSize: 12, color: '#666' }}>可用模型：</span>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => handleRefreshModels(channel)}
                        style={{ padding: 0, height: 'auto', fontSize: 12 }}
                      >
                        刷新模型列表
                      </Button>
                    </div>
                    <Space wrap size={4}>
                      {channel.models.map(model => (
                        <Tag
                          key={model.id}
                          closable={model.is_custom}
                          onClose={() => deleteModelFromChannel(channel.id, model.id)}
                        >
                          {model.name}
                        </Tag>
                      ))}
                      {showAddModel === channel.id ? (
                        <Space size={4}>
                          <Input
                            size="small"
                            placeholder="模型ID"
                            value={newModelId}
                            onChange={e => setNewModelId(e.target.value)}
                            style={{ width: 100 }}
                          />
                          <Input
                            size="small"
                            placeholder="显示名称"
                            value={newModelName}
                            onChange={e => setNewModelName(e.target.value)}
                            style={{ width: 80 }}
                          />
                          <Button
                            size="small"
                            type="primary"
                            onClick={() => handleAddModel(channel.id)}
                          >
                            添加
                          </Button>
                          <Button size="small" onClick={() => setShowAddModel(null)}>
                            取消
                          </Button>
                        </Space>
                      ) : (
                        <Tag
                          style={{ cursor: 'pointer', borderStyle: 'dashed' }}
                          onClick={() => setShowAddModel(channel.id)}
                        >
                          <PlusOutlined /> 添加模型
                        </Tag>
                      )}
                    </Space>
                  </div>
                </div>
              ))}
            </div>

            {/* 添加渠道表单 */}
            {showAddChannel && (
              <div
                style={{
                  border: '1px solid #1890ff',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16,
                  background: '#f6ffed',
                }}
              >
                <h4 style={{ margin: '0 0 12px' }}>添加新渠道</h4>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Select
                    placeholder="选择预设渠道"
                    style={{ width: '100%' }}
                    onChange={(v) => {
                      const preset = PRESET_CHANNELS.find(p => p.name === v);
                      if (preset) {
                        setNewChannelForm(prev => ({
                          ...prev,
                          name: preset.name || '',
                          type: preset.type || 'custom',
                          api_url: preset.api_url || '',
                          models: preset.models || [],
                        }));
                      }
                    }}
                    options={PRESET_CHANNELS.map(p => ({ value: p.name, label: p.name }))}
                  />
                  <Input
                    placeholder="渠道名称"
                    value={newChannelForm.name}
                    onChange={e => setNewChannelForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <Input
                    placeholder="API 地址"
                    value={newChannelForm.api_url}
                    onChange={e =>
                      setNewChannelForm(prev => ({ ...prev, api_url: e.target.value }))
                    }
                  />
                  <Input.Password
                    placeholder="API Key"
                    value={newChannelForm.api_key}
                    onChange={e =>
                      setNewChannelForm(prev => ({ ...prev, api_key: e.target.value }))
                    }
                  />
                  <Space>
                    <Button type="primary" onClick={handleAddChannel}>
                      添加
                    </Button>
                    <Button
                      onClick={() => {
                        setShowAddChannel(false);
                        setNewChannelForm({
                          name: '',
                          type: 'openai',
                          api_url: '',
                          api_key: '',
                          models: [],
                          enabled: true,
                        });
                      }}
                    >
                      取消
                    </Button>
                  </Space>
                </Space>
              </div>
            )}

            {/* 编辑渠道表单 */}
            {showEditChannel && editingChannel && (
              <div
                style={{
                  border: '1px solid #faad14',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16,
                  background: '#fffbe6',
                }}
              >
                <h4 style={{ margin: '0 0 12px' }}>编辑渠道: {editingChannel.name}</h4>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Input
                    placeholder="渠道名称"
                    value={editChannelForm.name}
                    onChange={e => setEditChannelForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <Select
                    value={editChannelForm.type}
                    onChange={v => setEditChannelForm(prev => ({ ...prev, type: v }))}
                    style={{ width: '100%' }}
                    options={[
                      { value: 'openai', label: 'OpenAI 兼容' },
                      { value: 'gemini', label: 'Google Gemini' },
                      { value: 'anthropic', label: 'Anthropic' },
                      { value: 'custom', label: '自定义' },
                    ]}
                  />
                  <Input
                    placeholder="API 地址"
                    value={editChannelForm.api_url}
                    onChange={e =>
                      setEditChannelForm(prev => ({ ...prev, api_url: e.target.value }))
                    }
                  />
                  <Input.Password
                    placeholder="API Key（留空则不修改）"
                    value={editChannelForm.api_key}
                    onChange={e =>
                      setEditChannelForm(prev => ({ ...prev, api_key: e.target.value }))
                    }
                  />
                  <Space>
                    <Button type="primary" onClick={handleSaveEditChannel}>
                      保存
                    </Button>
                    <Button
                      onClick={() => {
                        setShowEditChannel(false);
                        setEditingChannel(null);
                        setEditChannelForm({});
                      }}
                    >
                      取消
                    </Button>
                  </Space>
                </Space>
              </div>
            )}

            {/* 默认模型设置 */}
            {aiSettings.channels.length > 0 && (
              <>
                <Divider style={{ margin: '16px 0' }} />
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontWeight: 500 }}>默认模型</span>
                  </div>
                  <Select
                    value={aiSettings.default_model}
                    onChange={v => updateAISettings({ default_model: v })}
                    style={{ width: '100%' }}
                    placeholder="选择默认模型"
                    options={aiSettings.channels
                      .filter(c => c.enabled)
                      .flatMap(c =>
                        c.models.map(m => ({
                          value: m.id,
                          label: `${m.name} (${c.name})`,
                          key: `${c.id}-${m.id}`, // 添加唯一 key 避免重复
                        }))
                      )
                      .filter((option, index, self) =>
                        // 去重：保留第一个出现的模型 ID
                        index === self.findIndex(o => o.value === option.value)
                      )}
                  />
                </div>
              </>
            )}

            {/* MCP 添加/编辑弹窗 */}
            <Modal
              title={editingMcpServer ? '编辑 MCP 服务' : '添加 MCP 服务'}
              open={showMcpModal}
              onCancel={() => setShowMcpModal(false)}
              onOk={async () => {
                if (!mcpServerForm.name || !mcpServerForm.command) {
                  message.error('请填写名称和命令');
                  return;
                }

                let env = {};
                try {
                  env = JSON.parse(mcpServerForm.env || '{}');
                } catch (e) {
                  message.error('环境变量必须是有效的 JSON 格式');
                  return;
                }

                const args = mcpServerForm.args ? mcpServerForm.args.split(' ').filter(a => a.trim()) : [];

                if (editingMcpServer) {
                  const updatedConfig = {
                    ...editingMcpServer,
                    name: mcpServerForm.name,
                    command: mcpServerForm.command,
                    args,
                    env,
                  };

                  updateMcpServer(editingMcpServer.id, {
                    name: mcpServerForm.name,
                    command: mcpServerForm.command,
                    args,
                    env,
                  });

                  // If enabled, restart it
                  if (editingMcpServer.enabled) {
                    try {
                      await window.electronAPI.mcp.stopServer(editingMcpServer.id);
                      await window.electronAPI.mcp.startServer(updatedConfig);
                      message.success('MCP 服务已更新并重启');
                    } catch (e) {
                      message.error('服务重启失败');
                    }
                  } else {
                    message.success('MCP 服务已更新');
                  }
                } else {
                  const newConfig = {
                    id: `mcp_${Date.now()}`,
                    name: mcpServerForm.name,
                    command: mcpServerForm.command,
                    args,
                    env,
                    enabled: true,
                  };
                  addMcpServer(newConfig);
                  try {
                    await window.electronAPI.mcp.startServer(newConfig);
                    message.success('MCP 服务已添加并启动');
                  } catch (e) {
                    message.error('服务启动失败');
                  }
                }
                setShowMcpModal(false);
              }}
            >
              <Form layout="vertical">
                <Form.Item label="名称" required tooltip="给这个工具服务起个名字，例如 '本地文件助手'">
                  <Input
                    placeholder="E.g. Filesystem"
                    value={mcpServerForm.name}
                    onChange={e => setMcpServerForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </Form.Item>
                <Form.Item label="命令" required tooltip="可执行文件的名称或路径，例如 'npx', 'python', 'docker'">
                  <Input
                    placeholder="E.g. npx"
                    value={mcpServerForm.command}
                    onChange={e => setMcpServerForm(prev => ({ ...prev, command: e.target.value }))}
                  />
                </Form.Item>
                <Form.Item label="参数" tooltip="命令行参数，用空格分隔。例如 '-y @modelcontextprotocol/server-filesystem ./src'">
                  <Input
                    placeholder="E.g. -y @modelcontextprotocol/server-filesystem /path/to/allow"
                    value={mcpServerForm.args}
                    onChange={e => setMcpServerForm(prev => ({ ...prev, args: e.target.value }))}
                  />
                </Form.Item>
                <Form.Item label="环境变量 (JSON)" tooltip='可选。JSON 对象格式，例如 {"Node_ENV": "development"}'>
                  <Input.TextArea
                    placeholder="{}"
                    rows={4}
                    value={mcpServerForm.env}
                    onChange={e => setMcpServerForm(prev => ({ ...prev, env: e.target.value }))}
                  />
                </Form.Item>
              </Form>
            </Modal>
          </div>
        );

      case 'data':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>数据</h3>

            {/* 导入导出区域 */}
            <div style={{ marginBottom: 24 }}>
              <div
                style={{ fontWeight: 500, marginBottom: 12, display: 'flex', alignItems: 'center' }}
              >
                <DatabaseOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                数据导入导出
              </div>
              <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
                导出数据可用于备份或迁移到其他设备，导入数据可恢复之前的备份
              </p>

              <div
                style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginBottom: 16 }}
              >
                <div style={{ marginBottom: 12 }}>
                  <Checkbox
                    checked={includeResources}
                    onChange={e => setIncludeResources(e.target.checked)}
                  >
                    包含附件资源（图片、文件等）
                  </Checkbox>
                </div>
                <Space>
                  <Button
                    type="primary"
                    icon={<ExportOutlined />}
                    loading={exportLoading}
                    onClick={handleExportData}
                  >
                    导出数据
                  </Button>
                  <Button
                    icon={<ImportOutlined />}
                    loading={importLoading}
                    onClick={handlePreviewImport}
                  >
                    导入数据
                  </Button>
                </Space>
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            {/* 数据路径信息 */}
            <div
              style={{ fontWeight: 500, marginBottom: 12, display: 'flex', alignItems: 'center' }}
            >
              <FolderOpenOutlined style={{ marginRight: 8, color: '#52c41a' }} />
              数据存储位置
            </div>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
              查看应用的安装目录和数据存储位置
            </p>

            {appPaths ? (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <FolderOpenOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                    <span style={{ fontWeight: 500 }}>安装目录</span>
                  </div>
                  <div
                    style={{
                      background: '#f5f5f5',
                      padding: '8px 12px',
                      borderRadius: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 13, wordBreak: 'break-all' }}>
                      {appPaths.installPath}
                    </Text>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        navigator.clipboard.writeText(appPaths.installPath);
                        message.success('已复制到剪贴板');
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <DatabaseOutlined style={{ marginRight: 8, color: '#52c41a' }} />
                    <span style={{ fontWeight: 500 }}>数据目录</span>
                  </div>
                  <div
                    style={{
                      background: '#f5f5f5',
                      padding: '8px 12px',
                      borderRadius: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 13, wordBreak: 'break-all' }}>
                      {appPaths.userDataPath}
                    </Text>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        navigator.clipboard.writeText(appPaths.userDataPath);
                        message.success('已复制到剪贴板');
                      }}
                    />
                  </div>
                  <p style={{ color: '#888', fontSize: 12, margin: '8px 0 0' }}>
                    数据库、配置文件等存储在此目录
                  </p>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <FolderOpenOutlined style={{ marginRight: 8, color: '#faad14' }} />
                    <span style={{ fontWeight: 500 }}>日志目录</span>
                  </div>
                  <div
                    style={{
                      background: '#f5f5f5',
                      padding: '8px 12px',
                      borderRadius: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 13, wordBreak: 'break-all' }}>
                      {appPaths.logsPath}
                    </Text>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        navigator.clipboard.writeText(appPaths.logsPath);
                        message.success('已复制到剪贴板');
                      }}
                    />
                  </div>
                </div>

                <Divider style={{ margin: '16px 0' }} />

                <div style={{ marginBottom: 16 }}>
                  <Space>
                    <Button
                      onClick={async () => {
                        const api = (window as any).electronAPI;
                        if (api?.openExternal) {
                          // 在文件管理器中打开数据目录
                          await api.openExternal(`file://${appPaths.userDataPath}`);
                        }
                      }}
                    >
                      打开数据目录
                    </Button>
                    <Button
                      onClick={async () => {
                        const api = (window as any).electronAPI;
                        if (api?.openExternal) {
                          await api.openExternal(`file://${appPaths.installPath}`);
                        }
                      }}
                    >
                      打开安装目录
                    </Button>
                  </Space>
                </div>

                <Divider style={{ margin: '16px 0' }} />

                <div style={{ color: '#888', fontSize: 12 }}>
                  <p style={{ margin: '0 0 4px' }}>应用版本: {appPaths.appVersion}</p>
                  <p style={{ margin: 0 }}>运行模式: {appPaths.isDev ? '开发模式' : '生产模式'}</p>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>加载中...</div>
            )}

            {/* 导入确认对话框 */}
            <Modal
              title="确认导入数据"
              open={showImportConfirm}
              onCancel={() => {
                setShowImportConfirm(false);
                setImportPreview(null);
              }}
              onOk={handleImportData}
              okText="开始导入"
              cancelText="取消"
              confirmLoading={importLoading}
            >
              {importPreview && (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                      <FileOutlined style={{ marginRight: 8 }} />
                      <Text strong>文件信息</Text>
                    </div>
                    <div
                      style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 13 }}
                    >
                      <p style={{ margin: '0 0 4px' }}>
                        导出时间: {new Date(importPreview.exportTime).toLocaleString()}
                      </p>
                      <p style={{ margin: '0 0 4px' }}>导出版本: {importPreview.appVersion}</p>
                      <p style={{ margin: '0 0 4px' }}>数据条数: {importPreview.itemsCount}</p>
                      <p style={{ margin: 0 }}>附件数量: {importPreview.resourcesCount}</p>
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <Text strong>数据类型统计</Text>
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {Object.entries(importPreview.typeCounts).map(([type, count]) => (
                        <Tag key={type}>
                          {getTypeName(type)}: {count}
                        </Tag>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Text strong>导入模式</Text>
                    <Radio.Group
                      value={importMode}
                      onChange={e => setImportMode(e.target.value)}
                      style={{ marginTop: 8, display: 'block' }}
                    >
                      <Radio value="merge" style={{ display: 'block', marginBottom: 8 }}>
                        <span style={{ fontWeight: 500 }}>合并</span>
                        <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>
                          保留现有数据，仅导入新数据或更新较旧的数据
                        </span>
                      </Radio>
                      <Radio value="replace" style={{ display: 'block' }}>
                        <span style={{ fontWeight: 500, color: '#ff4d4f' }}>替换</span>
                        <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>
                          清空现有数据，完全使用导入的数据（谨慎操作）
                        </span>
                      </Radio>
                    </Radio.Group>
                  </div>

                  {importMode === 'replace' && (
                    <div
                      style={{
                        marginTop: 16,
                        padding: 12,
                        background: '#fff2f0',
                        border: '1px solid #ffccc7',
                        borderRadius: 6,
                      }}
                    >
                      <Text type="danger" strong>
                        ⚠️ 警告
                      </Text>
                      <p style={{ margin: '8px 0 0', color: '#ff4d4f', fontSize: 13 }}>
                        替换模式将删除所有现有数据，此操作不可撤销！建议先导出当前数据作为备份。
                      </p>
                    </div>
                  )}
                </div>
              )}
            </Modal>
          </div>
        );

      case 'shortcuts':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>快捷键</h3>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>
              使用快捷键可以更高效地操作暮城笔记
            </p>
            {SHORTCUTS.map((group, groupIndex) => (
              <div key={groupIndex} style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 500, marginBottom: 12, color: '#1890ff' }}>
                  {group.category}
                </div>
                <div style={{ background: '#fafafa', borderRadius: 8, padding: '4px 0' }}>
                  {group.items.map((shortcut, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 16px',
                        borderBottom: index < group.items.length - 1 ? '1px solid #f0f0f0' : 'none',
                      }}
                    >
                      <Text>{shortcut.description}</Text>
                      <Text keyboard style={{ fontFamily: 'monospace' }}>
                        {shortcut.key}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Divider />
            <p style={{ color: '#888', fontSize: 12 }}>提示：Mac 用户请将 Ctrl 替换为 Cmd</p>
          </div>
        );

      case 'about':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>关于暮城笔记</h3>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>暮城笔记</h2>
              <p style={{ color: '#888', margin: '0 0 12px' }}>版本 1.0.0</p>
              <Button
                type="link"
                icon={<GithubOutlined />}
                onClick={() => {
                  const api = (window as any).electronAPI;
                  if (api?.openExternal) {
                    api.openExternal('https://github.com/inspoaibox/Nextnotebook');
                  }
                }}
                style={{ fontSize: 14, padding: 0 }}
              >
                开源地址
              </Button>
            </div>
            <Divider />
            <div style={{ color: '#666', lineHeight: 2 }}>
              <p style={{ fontWeight: 500, marginBottom: 8 }}>功能特性</p>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                <li>本地优先，数据安全</li>
                <li>端到端加密同步</li>
                <li>Markdown 编辑与预览</li>
                <li>多级文件夹管理</li>
                <li>灵活的标签系统</li>
                <li>WebDAV 云同步</li>
              </ul>
            </div>
          </div>
        );
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={700}
      title={null}
      closable={true}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ display: 'flex', minHeight: 480 }}>
        {/* 左侧菜单 */}
        <div
          className="settings-menu"
          style={{
            width: 160,
            borderRight: '1px solid var(--border-color, #f0f0f0)',
            padding: '20px 0',
          }}
        >
          {menuItems.map(item => (
            <div
              key={item.key}
              onClick={() => setActiveTab(item.key as TabKey)}
              className={`settings-menu-item ${activeTab === item.key ? 'active' : ''}`}
              style={{
                padding: '10px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
                borderRight: activeTab === item.key ? '2px solid #1890ff' : '2px solid transparent',
                transition: 'all 0.2s',
              }}
            >
              {item.icon}
              {item.label}
            </div>
          ))}
        </div>
        {/* 右侧内容 */}
        <div className="settings-content" style={{ flex: 1, padding: 24, overflow: 'auto' }}>
          {renderContent()}
        </div>
      </div>

      {/* PIN 验证对话框 */}
      <Modal
        title="验证 PIN 码"
        open={showPinVerifyModal}
        onOk={executeKeyOperation}
        onCancel={() => {
          setShowPinVerifyModal(false);
          setPinInput('');
          setPinError('');
          setPendingKeyOperation(null);
        }}
        okText="确认"
      >
        <p style={{ marginBottom: 12, color: '#666' }}>请输入应用锁定 PIN 码以继续操作。</p>
        <Input.Password
          placeholder="输入 PIN 码"
          value={pinInput}
          onChange={e => {
            setPinInput(e.target.value);
            setPinError('');
          }}
          onPressEnter={executeKeyOperation}
          status={pinError ? 'error' : undefined}
        />
        {pinError && (
          <p style={{ color: '#ff4d4f', fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            {pinError}
          </p>
        )}
      </Modal>

      {/* 导入密钥对话框 */}
      <Modal
        title="导入密钥"
        open={showImportKeyModal}
        onOk={doImportKey}
        onCancel={() => {
          setShowImportKeyModal(false);
          setImportKeyText('');
        }}
        okText="导入"
      >
        <p style={{ marginBottom: 12, color: '#666' }}>请粘贴从其他设备导出的 Base64 格式密钥。</p>
        <Input.TextArea
          placeholder="粘贴密钥..."
          value={importKeyText}
          onChange={e => setImportKeyText(e.target.value)}
          rows={4}
        />
      </Modal>
    </Modal>
  );
};

export default SettingsModal;
