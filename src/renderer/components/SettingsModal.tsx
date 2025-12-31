import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Switch, InputNumber, Input, Button, Space, message, Divider, List, Popconfirm, Tag, Typography, Checkbox } from 'antd';
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
} from '@ant-design/icons';
import { useSettings } from '../contexts/SettingsContext';
import { useAISettings } from '../hooks/useAI';
import { useFeatureSettings } from '../hooks/useFeatureSettings';
import { AIChannel, AIModel, SyncModules, DEFAULT_SYNC_MODULES } from '@shared/types';
import { PRESET_CHANNELS } from '../services/aiApi';

const { Text } = Typography;

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: string;
}

interface SecuritySettings {
  appLockEnabled: boolean;
  autoLockTimeout: number;
  lockPassword: string;
}

// 快捷键配置
const SHORTCUTS = [
  { category: '笔记操作', items: [
    { key: 'Ctrl+N', description: '新建笔记' },
    { key: 'Ctrl+Shift+N', description: '从模板新建' },
    { key: 'Ctrl+S', description: '保存笔记' },
    { key: 'Ctrl+D', description: '删除笔记' },
    { key: 'Ctrl+Shift+D', description: '复制笔记' },
    { key: 'Ctrl+P', description: '星标/取消星标' },
    { key: 'Ctrl+↑', description: '上一篇笔记' },
    { key: 'Ctrl+↓', description: '下一篇笔记' },
  ]},
  { category: '搜索与导航', items: [
    { key: 'Ctrl+F', description: '搜索笔记' },
    { key: 'Ctrl+B', description: '切换侧边栏' },
    { key: 'Esc', description: '退出搜索' },
  ]},
  { category: '同步与设置', items: [
    { key: 'Ctrl+Shift+S', description: '立即同步' },
    { key: 'Ctrl+,', description: '打开设置' },
    { key: 'Ctrl+L', description: '锁定应用' },
  ]},
];

type TabKey = 'general' | 'features' | 'sync' | 'security' | 'ai' | 'data' | 'shortcuts' | 'about';

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose, defaultTab }) => {
  const { settings, syncConfig, updateSettings, updateSyncConfig, resetSettings } = useSettings();
  const { settings: aiSettings, updateSettings: updateAISettings, addChannel, updateChannel, deleteChannel, addModelToChannel, deleteModelFromChannel } = useAISettings();
  const { settings: featureSettings, updateSettings: updateFeatureSettings } = useFeatureSettings();
  const [form] = Form.useForm();
  const [syncForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab as TabKey || 'general');
  
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
  
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>(() => {
    const saved = localStorage.getItem('mucheng-security');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return { appLockEnabled: false, autoLockTimeout: 5, lockPassword: '' };
  });
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [passwordInputMode, setPasswordInputMode] = useState<'set' | 'change' | 'remove'>('set');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // 密码库锁定设置
  const [vaultPassword, setVaultPassword] = useState(() => localStorage.getItem('mucheng-vault-password') || '');
  const [showVaultPasswordInput, setShowVaultPasswordInput] = useState(false);
  const [vaultPasswordMode, setVaultPasswordMode] = useState<'set' | 'change' | 'remove'>('set');
  const [oldVaultPassword, setOldVaultPassword] = useState('');
  const [newVaultPassword, setNewVaultPassword] = useState('');
  const [confirmVaultPassword, setConfirmVaultPassword] = useState('');

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

  useEffect(() => {
    if (open) {
      form.setFieldsValue(settings);
      // 设置同步表单初始值
      syncForm.setFieldsValue({
        enabled: syncConfig.enabled ?? false,
        type: syncConfig.type || 'webdav',
        url: syncConfig.url || '',
        sync_path: syncConfig.sync_path || '/mucheng-notes',
        username: syncConfig.username || '',
        password: syncConfig.password || '',
        encryption_enabled: syncConfig.encryption_enabled ?? false,
        sync_interval: syncConfig.sync_interval || 5,
        sync_modules: syncConfig.sync_modules || DEFAULT_SYNC_MODULES,
      });
    }
  }, [open, settings, syncConfig, form, syncForm]);

  const generateSyncKey = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  };

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

  const handleSaveSyncConfig = () => {
    // 获取表单所有字段值
    const values = syncForm.getFieldsValue(true);
    
    // 保存配置
    const configToSave = {
      enabled: values.enabled ?? false,
      type: values.type || 'webdav',
      url: values.url || '',
      sync_path: values.sync_path || '/mucheng-notes',
      username: values.username || '',
      password: values.password || '',
      encryption_enabled: values.encryption_enabled ?? false,
      sync_interval: values.sync_interval || 5,
      sync_modules: values.sync_modules || DEFAULT_SYNC_MODULES,
    };
    
    updateSyncConfig(configToSave);
    
    if (configToSave.encryption_enabled && !localStorage.getItem('mucheng-sync-key')) {
      localStorage.setItem('mucheng-sync-key', generateSyncKey());
      setHasSyncKey(true);
      message.info('已自动生成同步密钥');
    }
    message.success('同步设置已保存');
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
      const newSettings = { ...securitySettings, appLockEnabled: true, lockPassword: hashedPassword };
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

  const handleExportKey = () => {
    let key = localStorage.getItem('mucheng-sync-key');
    if (!key) {
      key = generateSyncKey();
      localStorage.setItem('mucheng-sync-key', key);
      setHasSyncKey(true);
    }
    const blob = new Blob([JSON.stringify({ key, created: Date.now() })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mucheng-sync-key.json';
    a.click();
    message.success('密钥已导出');
  };

  const handleImportKey = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        localStorage.setItem('mucheng-sync-key', data.key || data);
        setHasSyncKey(true);
        message.success('密钥已导入');
      } catch {
        message.error('导入失败');
      }
    };
    input.click();
  };

  const handleTestConnection = async () => {
    // 获取表单所有字段值
    const values = syncForm.getFieldsValue(true);
    
    const url = values.url;
    if (!url) { 
      message.error('请填写服务器地址'); 
      return; 
    }
    
    message.loading({ content: '测试中...', key: 'test' });
    try {
      const api = (window as any).electronAPI;
      if (api?.sync?.testConnection) {
        const encryptionKey = localStorage.getItem('mucheng-sync-key') || undefined;
        const success = await api.sync.testConnection({
          enabled: true,
          type: values.type || 'webdav',
          url: url,
          syncPath: values.sync_path || '/mucheng-notes',
          username: values.username || '',
          password: values.password || '',
          encryptionEnabled: false,
          encryptionKey,
          syncInterval: 5,
        });
        if (success) {
          message.success({ content: '连接成功', key: 'test' });
        } else {
          message.error({ content: '连接失败，请检查配置', key: 'test' });
        }
      } else {
        message.error({ content: '测试功能不可用', key: 'test' });
      }
    } catch (e) {
      console.error('Connection test failed:', e);
      message.error({ content: '连接失败', key: 'test' });
    }
  };

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
      type: newChannelForm.type as 'openai' | 'anthropic' | 'custom',
      api_url: newChannelForm.api_url!,
      api_key: newChannelForm.api_key!,
      models: newChannelForm.models || [],
      enabled: true,
    };
    addChannel(channel);
    setShowAddChannel(false);
    setNewChannelForm({ name: '', type: 'openai', api_url: '', api_key: '', models: [], enabled: true });
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
      type: editChannelForm.type as 'openai' | 'anthropic' | 'custom',
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
      // 从 api_url 提取基础 URL（移除 /chat/completions 或 /messages 等路径）
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
          'Authorization': `Bearer ${channel.api_key}`,
        },
      });
      if (!response.ok) throw new Error('获取失败');
      const data = await response.json();
      const models: AIModel[] = (data.data || []).map((m: any) => ({
        id: m.id,
        name: m.id,
        channel_id: channel.id,
        max_tokens: 4096,
        is_custom: false,
      }));
      // 更新渠道的模型列表
      updateChannel(channel.id, { models });
      message.success({ content: `已获取 ${models.length} 个模型`, key: 'refresh-models' });
    } catch (err) {
      message.error({ content: '获取模型列表失败', key: 'refresh-models' });
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
            <Form form={form} layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} labelAlign="left">
              <Form.Item name="theme" label="主题模式">
                <Select style={{ width: 200 }} options={[
                  { value: 'light', label: '浅色模式' },
                  { value: 'dark', label: '深色模式' },
                  { value: 'system', label: '跟随系统' },
                ]} />
              </Form.Item>
              <Form.Item name="language" label="界面语言">
                <Select style={{ width: 200 }} options={[
                  { value: 'zh-CN', label: '简体中文' },
                  { value: 'en-US', label: 'English' },
                ]} />
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
              <Form.Item name="show_line_numbers" label="显示行号" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Divider style={{ margin: '16px 0' }} />
              <Form.Item name="auto_launch" label="开机自启动" valuePropName="checked" tooltip="开启后系统启动时自动运行暮城笔记">
                <Switch />
              </Form.Item>
              <Form.Item name="close_to_tray" label="关闭到托盘" valuePropName="checked" tooltip="开启后点击关闭按钮将最小化到系统托盘而非退出">
                <Switch />
              </Form.Item>
              <Divider style={{ margin: '16px 0' }} />
              <Form.Item wrapperCol={{ offset: 6 }}>
                <Space>
                  <Button type="primary" onClick={handleSaveSettings}>保存设置</Button>
                  <Button onClick={() => { resetSettings(); form.setFieldsValue(settings); }}>恢复默认</Button>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>智能助理 (AI)</span>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>接入 AI 模型进行对话</p>
                </div>
                <Switch 
                  checked={featureSettings.ai_enabled} 
                  onChange={(checked) => updateFeatureSettings({ ai_enabled: checked })} 
                />
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>待办事项</span>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>四象限待办管理，支持提醒</p>
                </div>
                <Switch 
                  checked={featureSettings.todo_enabled} 
                  onChange={(checked) => updateFeatureSettings({ todo_enabled: checked })} 
                />
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>密码库</span>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>安全存储密码、银行卡等敏感信息</p>
                </div>
                <Switch 
                  checked={featureSettings.vault_enabled} 
                  onChange={(checked) => updateFeatureSettings({ vault_enabled: checked })} 
                />
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>书签</span>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>收藏常用网址，支持多级目录</p>
                </div>
                <Switch 
                  checked={featureSettings.bookmark_enabled} 
                  onChange={(checked) => updateFeatureSettings({ bookmark_enabled: checked })} 
                />
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>工具箱</span>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>常用工具集合，包含编码转换、二维码生成等</p>
                </div>
                <Switch 
                  checked={featureSettings.toolbox_enabled} 
                  onChange={(checked) => updateFeatureSettings({ toolbox_enabled: checked })} 
                />
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>脑图</span>
                  <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>脑图、流程图、白板，支持同步</p>
                </div>
                <Switch 
                  checked={featureSettings.diagram_enabled} 
                  onChange={(checked) => updateFeatureSettings({ diagram_enabled: checked })} 
                />
              </div>
            </div>
          </div>
        );

      case 'sync':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>同步设置</h3>
            <Form form={syncForm} layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} labelAlign="left" preserve={true}>
              <Form.Item name="enabled" label="启用同步" valuePropName="checked">
                <Switch />
              </Form.Item>
              
              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.enabled !== cur.enabled}>
                {({ getFieldValue }) => {
                  const enabled = getFieldValue('enabled');
                  return (
                    <>
                      <Form.Item name="type" label="同步方式" hidden={!enabled}>
                        <Select style={{ width: 200 }} options={[
                          { value: 'webdav', label: 'WebDAV' },
                          { value: 'server', label: '自建服务器' },
                        ]} />
                      </Form.Item>
                      <Form.Item name="url" label="服务器地址" rules={[{ required: enabled, message: '请填写服务器地址' }]} hidden={!enabled}>
                        <Input placeholder="https://example.com/dav" />
                      </Form.Item>
                      <Form.Item 
                        name="sync_path" 
                        label="同步目录" 
                        tooltip="数据将同步到此目录下，避免与其他数据混淆"
                        hidden={!enabled}
                      >
                        <Input placeholder="/mucheng-notes" />
                      </Form.Item>
                      <Form.Item name="username" label="用户名" hidden={!enabled}>
                        <Input placeholder="可选" style={{ width: 200 }} />
                      </Form.Item>
                      <Form.Item name="password" label="密码" hidden={!enabled}>
                        <Input.Password placeholder="可选" style={{ width: 200 }} />
                      </Form.Item>
                      {enabled && <Divider style={{ margin: '16px 0' }} />}
                      <Form.Item name="encryption_enabled" label="端到端加密" valuePropName="checked" hidden={!enabled}>
                        <Switch />
                      </Form.Item>
                      <Form.Item name="sync_interval" label="同步间隔" hidden={!enabled}>
                        <InputNumber min={1} max={60} addonAfter="分钟" style={{ width: 120 }} />
                      </Form.Item>
                      {enabled && <Divider style={{ margin: '16px 0' }} />}
                      {enabled && (
                        <Form.Item label="同步模块" tooltip="选择需要同步的数据模块">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <Form.Item name={['sync_modules', 'notes']} valuePropName="checked" noStyle>
                              <Checkbox>笔记（含文件夹、标签、附件）</Checkbox>
                            </Form.Item>
                            <Form.Item name={['sync_modules', 'bookmarks']} valuePropName="checked" noStyle>
                              <Checkbox>书签</Checkbox>
                            </Form.Item>
                            <Form.Item name={['sync_modules', 'vault']} valuePropName="checked" noStyle>
                              <Checkbox>密码库</Checkbox>
                            </Form.Item>
                            <Form.Item name={['sync_modules', 'diagrams']} valuePropName="checked" noStyle>
                              <Checkbox>脑图 / 流程图 / 白板</Checkbox>
                            </Form.Item>
                            <Form.Item name={['sync_modules', 'todos']} valuePropName="checked" noStyle>
                              <Checkbox>待办事项</Checkbox>
                            </Form.Item>
                            <Form.Item name={['sync_modules', 'ai']} valuePropName="checked" noStyle>
                              <Checkbox>AI 助手（配置与对话）</Checkbox>
                            </Form.Item>
                          </div>
                        </Form.Item>
                      )}
                      {enabled && <Divider style={{ margin: '16px 0' }} />}
                      <Form.Item wrapperCol={{ offset: 6 }}>
                        <Space>
                          <Button type="primary" onClick={handleSaveSyncConfig}>保存设置</Button>
                          {enabled && <Button onClick={handleTestConnection}>测试连接</Button>}
                        </Space>
                      </Form.Item>
                    </>
                  );
                }}
              </Form.Item>
            </Form>
          </div>
        );

      case 'security':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>安全设置</h3>
            
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 500 }}>应用锁定</span>
                <Switch checked={securitySettings.appLockEnabled} onChange={handleToggleAppLock} />
              </div>
              <p style={{ color: '#888', fontSize: 13, margin: 0 }}>启用后每次打开应用需要输入密码</p>
            </div>

            {showPasswordInput && (
              <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 24 }}>
                <p style={{ margin: '0 0 12px', fontWeight: 500 }}>
                  {passwordInputMode === 'set' ? '设置锁定密码' : 
                   passwordInputMode === 'change' ? '修改锁定密码' : '验证密码以移除锁定'}
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
                      placeholder={passwordInputMode === 'change' ? '输入新密码（至少4位）' : '输入密码（至少4位）'}
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
                  <Button size="small" onClick={() => { 
                    setShowPasswordInput(false); 
                    setOldPassword('');
                    setNewPassword(''); 
                    setConfirmPassword(''); 
                  }}>取消</Button>
                </Space>
              </div>
            )}

            {securitySettings.appLockEnabled && !showPasswordInput && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
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
                <Space>
                  <Button size="small" onClick={() => {
                    setPasswordInputMode('change');
                    setShowPasswordInput(true);
                  }}>修改密码</Button>
                  <Button danger size="small" onClick={() => {
                    setPasswordInputMode('remove');
                    setShowPasswordInput(true);
                  }}>移除锁定</Button>
                </Space>
              </>
            )}

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 500 }}>同步加密密钥</span>
                {hasSyncKey && <span style={{ color: '#52c41a', fontSize: 12 }}><CheckCircleOutlined /> 已配置</span>}
              </div>
              <p style={{ color: '#888', fontSize: 13, margin: '0 0 12px' }}>用于加密同步数据，请妥善备份</p>
              <Space>
                <Button size="small" onClick={handleExportKey}>导出密钥</Button>
                <Button size="small" onClick={handleImportKey}>导入密钥</Button>
                <Button size="small" onClick={() => { 
                  localStorage.setItem('mucheng-sync-key', generateSyncKey()); 
                  setHasSyncKey(true);
                  message.success('已生成新密钥'); 
                }}>
                  {hasSyncKey ? '重新生成' : '生成密钥'}
                </Button>
              </Space>
            </div>

            <Divider style={{ margin: '24px 0' }} />

            {/* 密码库锁定 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 500 }}>密码库锁定</span>
                {vaultPassword && <span style={{ color: '#52c41a', fontSize: 12 }}><CheckCircleOutlined /> 已设置</span>}
              </div>
              <p style={{ color: '#888', fontSize: 13, margin: '0 0 12px' }}>
                为密码库设置独立密码，每次访问密码库需要验证
              </p>
              
              {showVaultPasswordInput ? (
                <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                  <p style={{ margin: '0 0 12px', fontWeight: 500 }}>
                    {vaultPasswordMode === 'set' ? '设置密码库密码' : 
                     vaultPasswordMode === 'change' ? '修改密码库密码' : '验证密码以移除'}
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
                        placeholder={vaultPasswordMode === 'change' ? '输入新密码（至少4位）' : '输入密码（至少4位）'}
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
                    <Button type="primary" size="small" onClick={async () => {
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
                    }}>
                      {vaultPasswordMode === 'remove' ? '确认移除' : '确定'}
                    </Button>
                    <Button size="small" onClick={() => { 
                      setShowVaultPasswordInput(false); 
                      setOldVaultPassword('');
                      setNewVaultPassword(''); 
                      setConfirmVaultPassword(''); 
                    }}>取消</Button>
                  </Space>
                </div>
              ) : (
                <Space>
                  {vaultPassword ? (
                    <>
                      <Button size="small" onClick={() => {
                        setVaultPasswordMode('change');
                        setShowVaultPasswordInput(true);
                      }}>修改密码</Button>
                      <Button danger size="small" onClick={() => {
                        setVaultPasswordMode('remove');
                        setShowVaultPasswordInput(true);
                      }}>移除密码</Button>
                    </>
                  ) : (
                    <Button size="small" onClick={() => {
                      setVaultPasswordMode('set');
                      setShowVaultPasswordInput(true);
                    }}>设置密码</Button>
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

            {/* 渠道列表 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 500 }}>AI 渠道</span>
                <Button size="small" icon={<PlusOutlined />} onClick={() => setShowAddChannel(true)}>
                  添加渠道
                </Button>
              </div>

              {/* 预设渠道快捷添加 */}
              {aiSettings.channels.length === 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>快速添加预设渠道：</p>
                  <Space>
                    {PRESET_CHANNELS.map((preset, idx) => (
                      <Button key={idx} size="small" onClick={() => handleAddPresetChannel(preset)}>
                        {preset.name}
                      </Button>
                    ))}
                  </Space>
                </div>
              )}

              {/* 渠道列表 */}
              {aiSettings.channels.map((channel) => (
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{channel.name}</span>
                      <Tag style={{ marginLeft: 8 }} color={channel.type === 'openai' ? 'green' : channel.type === 'anthropic' ? 'orange' : 'blue'}>
                        {channel.type}
                      </Tag>
                    </div>
                    <Space>
                      <Switch 
                        size="small" 
                        checked={channel.enabled} 
                        onChange={(checked) => updateChannel(channel.id, { enabled: checked })}
                      />
                      <Button 
                        type="text" 
                        size="small" 
                        icon={<EditOutlined />} 
                        onClick={() => handleEditChannel(channel)}
                      />
                      <Popconfirm title="确定删除此渠道？" onConfirm={() => deleteChannel(channel.id)}>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>
                  <p style={{ fontSize: 12, color: '#888', margin: '0 0 8px' }}>{channel.api_url}</p>
                  
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
                              'Authorization': `Bearer ${channel.api_key}`,
                            },
                          });
                          if (response.ok) {
                            message.success({ content: '连接成功', key: 'test-ai' });
                          } else {
                            message.error({ content: `连接失败: ${response.status}`, key: 'test-ai' });
                          }
                        } catch (err) {
                          message.error({ content: '连接失败，请检查网络或 API 地址', key: 'test-ai' });
                        }
                      }}
                      style={{ padding: 0, height: 'auto', fontSize: 12 }}
                    >
                      测试连接
                    </Button>
                  </div>
                  
                  {/* 模型列表 */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
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
                      {channel.models.map((model) => (
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
                          <Button size="small" type="primary" onClick={() => handleAddModel(channel.id)}>添加</Button>
                          <Button size="small" onClick={() => setShowAddModel(null)}>取消</Button>
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
              <div style={{ border: '1px solid #1890ff', borderRadius: 8, padding: 16, marginBottom: 16, background: '#f6ffed' }}>
                <h4 style={{ margin: '0 0 12px' }}>添加新渠道</h4>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Input 
                    placeholder="渠道名称" 
                    value={newChannelForm.name}
                    onChange={e => setNewChannelForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <Select
                    value={newChannelForm.type}
                    onChange={v => setNewChannelForm(prev => ({ ...prev, type: v }))}
                    style={{ width: '100%' }}
                    options={[
                      { value: 'openai', label: 'OpenAI 兼容' },
                      { value: 'anthropic', label: 'Anthropic' },
                      { value: 'custom', label: '自定义' },
                    ]}
                  />
                  <Input 
                    placeholder="API 地址" 
                    value={newChannelForm.api_url}
                    onChange={e => setNewChannelForm(prev => ({ ...prev, api_url: e.target.value }))}
                  />
                  <Input.Password 
                    placeholder="API Key" 
                    value={newChannelForm.api_key}
                    onChange={e => setNewChannelForm(prev => ({ ...prev, api_key: e.target.value }))}
                  />
                  <Space>
                    <Button type="primary" onClick={handleAddChannel}>添加</Button>
                    <Button onClick={() => { setShowAddChannel(false); setNewChannelForm({ name: '', type: 'openai', api_url: '', api_key: '', models: [], enabled: true }); }}>取消</Button>
                  </Space>
                </Space>
              </div>
            )}

            {/* 编辑渠道表单 */}
            {showEditChannel && editingChannel && (
              <div style={{ border: '1px solid #faad14', borderRadius: 8, padding: 16, marginBottom: 16, background: '#fffbe6' }}>
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
                      { value: 'anthropic', label: 'Anthropic' },
                      { value: 'custom', label: '自定义' },
                    ]}
                  />
                  <Input 
                    placeholder="API 地址" 
                    value={editChannelForm.api_url}
                    onChange={e => setEditChannelForm(prev => ({ ...prev, api_url: e.target.value }))}
                  />
                  <Input.Password 
                    placeholder="API Key（留空则不修改）" 
                    value={editChannelForm.api_key}
                    onChange={e => setEditChannelForm(prev => ({ ...prev, api_key: e.target.value }))}
                  />
                  <Space>
                    <Button type="primary" onClick={handleSaveEditChannel}>保存</Button>
                    <Button onClick={() => { setShowEditChannel(false); setEditingChannel(null); setEditChannelForm({}); }}>取消</Button>
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
                    onChange={(v) => updateAISettings({ default_model: v })}
                    style={{ width: '100%' }}
                    placeholder="选择默认模型"
                    options={aiSettings.channels
                      .filter(c => c.enabled)
                      .flatMap(c => c.models.map(m => ({
                        value: m.id,
                        label: `${m.name} (${c.name})`,
                      })))
                    }
                  />
                </div>
              </>
            )}
          </div>
        );

      case 'data':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>数据</h3>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>
              查看应用的安装目录和数据存储位置
            </p>

            {appPaths ? (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <FolderOpenOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                    <span style={{ fontWeight: 500 }}>安装目录</span>
                  </div>
                  <div style={{ 
                    background: '#f5f5f5', 
                    padding: '8px 12px', 
                    borderRadius: 6, 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <Text style={{ fontSize: 13, wordBreak: 'break-all' }}>{appPaths.installPath}</Text>
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
                  <div style={{ 
                    background: '#f5f5f5', 
                    padding: '8px 12px', 
                    borderRadius: 6, 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <Text style={{ fontSize: 13, wordBreak: 'break-all' }}>{appPaths.userDataPath}</Text>
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
                  <div style={{ 
                    background: '#f5f5f5', 
                    padding: '8px 12px', 
                    borderRadius: 6, 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <Text style={{ fontSize: 13, wordBreak: 'break-all' }}>{appPaths.logsPath}</Text>
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
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                加载中...
              </div>
            )}
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
                      <Text keyboard style={{ fontFamily: 'monospace' }}>{shortcut.key}</Text>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Divider />
            <p style={{ color: '#888', fontSize: 12 }}>
              提示：Mac 用户请将 Ctrl 替换为 Cmd
            </p>
          </div>
        );

      case 'about':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 500 }}>关于暮城笔记</h3>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>暮城笔记</h2>
              <p style={{ color: '#888', margin: '0 0 24px' }}>版本 1.0.0</p>
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
        <div className="settings-menu" style={{ width: 160, borderRight: '1px solid var(--border-color, #f0f0f0)', padding: '20px 0' }}>
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
    </Modal>
  );
};

export default SettingsModal;
