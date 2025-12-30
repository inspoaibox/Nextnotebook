import React, { useState, useCallback, useEffect } from 'react';
import { 
  Layout, Input, Button, List, Empty, Modal, message, Tooltip, Dropdown, 
  Tag, Form, Select, Tabs, Space, Divider, Popconfirm, Progress
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, KeyOutlined,
  StarOutlined, StarFilled, CopyOutlined, EyeOutlined, EyeInvisibleOutlined,
  FolderOutlined, FolderAddOutlined, GlobalOutlined, UserOutlined,
  CreditCardOutlined, IdcardOutlined, FileTextOutlined, MenuOutlined,
  SearchOutlined, ReloadOutlined, SafetyOutlined,
} from '@ant-design/icons';
import { useVaultEntries, useVaultFolders, VaultEntry, VaultFolder, generatePassword } from '../hooks/useVault';
import { VaultEntryType, VaultUri, VaultCustomField, VaultTotp } from '@shared/types';
import * as OTPAuth from 'otpauth';

const { Sider, Content } = Layout;
const { TextArea } = Input;

// 规范化 URL，自动添加 https:// 前缀
const normalizeUrl = (url: string): string => {
  if (!url) return url;
  const trimmed = url.trim();
  // 如果已经有协议前缀，直接返回
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  // 否则添加 https://
  return `https://${trimmed}`;
};

// 条目类型配置
const ENTRY_TYPE_CONFIG: Record<VaultEntryType, { label: string; icon: React.ReactNode; color: string }> = {
  login: { label: '登录', icon: <KeyOutlined />, color: '#1890ff' },
  card: { label: '银行卡', icon: <CreditCardOutlined />, color: '#52c41a' },
  identity: { label: '身份', icon: <IdcardOutlined />, color: '#722ed1' },
  secure_note: { label: '安全笔记', icon: <FileTextOutlined />, color: '#faad14' },
};

// 密码显示组件
const PasswordField: React.FC<{ value: string; onCopy: () => void }> = ({ value, onCopy }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Input.Password
        value={value}
        visibilityToggle={{ visible, onVisibleChange: setVisible }}
        readOnly
        style={{ flex: 1 }}
      />
      <Tooltip title="复制">
        <Button type="text" icon={<CopyOutlined />} onClick={onCopy} />
      </Tooltip>
    </div>
  );
};

// 解析 otpauth:// URI
const parseOtpAuthUri = (uri: string): { secret: string; name: string; issuer?: string } | null => {
  try {
    const trimmedUri = uri.trim();
    if (!trimmedUri.startsWith('otpauth://')) return null;
    
    const totp = OTPAuth.URI.parse(trimmedUri);
    if (!totp.secret) return null;
    
    return {
      secret: totp.secret.base32,
      name: totp.label || '',
      issuer: totp.issuer,
    };
  } catch (e) {
    console.error('OTPAuth URI parse error:', e);
    return null;
  }
};

// 生成 TOTP 验证码
const generateTotpCode = (secret: string): string | null => {
  try {
    if (!secret) return null;
    // 清理 secret：移除空格，转大写，移除非 Base32 字符
    const cleanSecret = secret.replace(/[\s-]/g, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    if (!cleanSecret || cleanSecret.length < 8) return null;
    
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(cleanSecret),
      digits: 6,
      period: 30,
    });
    return totp.generate();
  } catch (e) {
    console.error('TOTP generation error:', e);
    return null;
  }
};

// 获取 TOTP 剩余时间（秒）
const getTotpRemainingTime = (): number => {
  return 30 - (Math.floor(Date.now() / 1000) % 30);
};

// TOTP 显示组件
const TotpDisplay: React.FC<{ secret: string; name: string; account?: string; onCopy: (code: string) => void }> = ({ secret, name, account, onCopy }) => {
  const [code, setCode] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(getTotpRemainingTime());

  useEffect(() => {
    const updateCode = () => {
      setCode(generateTotpCode(secret));
      setRemaining(getTotpRemainingTime());
    };
    updateCode();
    const interval = setInterval(updateCode, 1000);
    return () => clearInterval(interval);
  }, [secret]);

  if (!code) {
    return <div style={{ color: '#ff4d4f', fontSize: 12 }}>密钥无效</div>;
  }

  const formattedCode = code.slice(0, 3) + ' ' + code.slice(3);
  const displayName = account ? `${name} (${account})` : (name || '验证码');

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 12,
      padding: '8px 12px',
      background: '#f6ffed',
      borderRadius: 6,
      border: '1px solid #b7eb8f',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>{displayName}</div>
        <div style={{ 
          fontSize: 24, 
          fontWeight: 600, 
          fontFamily: 'monospace',
          color: remaining <= 5 ? '#ff4d4f' : '#52c41a',
          letterSpacing: 2,
        }}>
          {formattedCode}
        </div>
      </div>
      <div style={{ width: 40, textAlign: 'center' }}>
        <Progress 
          type="circle" 
          percent={(remaining / 30) * 100} 
          size={36}
          format={() => remaining}
          strokeColor={remaining <= 5 ? '#ff4d4f' : '#52c41a'}
        />
      </div>
      <Tooltip title="复制验证码">
        <Button type="text" icon={<CopyOutlined />} onClick={() => onCopy(code)} />
      </Tooltip>
    </div>
  );
};

// 条目列表项
const EntryListItem: React.FC<{
  entry: VaultEntry;
  selected: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}> = ({ entry, selected, onSelect, onToggleFavorite, onDelete }) => {
  const config = ENTRY_TYPE_CONFIG[entry.entryType];
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '10px 12px',
        cursor: 'pointer',
        background: selected ? '#e6f4ff' : 'transparent',
        borderLeft: selected ? '3px solid #1890ff' : '3px solid transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span style={{ color: config.color }}>{config.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.name}
        </div>
        {entry.username && (
          <div style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.username}
          </div>
        )}
      </div>
      <Button
        type="text"
        size="small"
        icon={entry.favorite ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
      />
    </div>
  );
};

// URI 编辑组件
const UriEditor: React.FC<{
  uris: VaultUri[];
  onChange: (uris: VaultUri[]) => void;
}> = ({ uris, onChange }) => {
  const addUri = () => {
    onChange([...uris, { id: `uri_${Date.now()}`, name: '', uri: '', match_type: 'domain' }]);
  };
  const updateUri = (id: string, updates: Partial<VaultUri>) => {
    onChange(uris.map(u => u.id === id ? { ...u, ...updates } : u));
  };
  const removeUri = (id: string) => {
    onChange(uris.filter(u => u.id !== id));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#666' }}>关联网站</span>
        <Button type="link" size="small" icon={<PlusOutlined />} onClick={addUri}>添加</Button>
      </div>
      {uris.map((uri, idx) => (
        <div key={uri.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Input
            placeholder="名称"
            value={uri.name}
            onChange={e => updateUri(uri.id, { name: e.target.value })}
            style={{ width: 100 }}
          />
          <Input
            placeholder="网址"
            value={uri.uri}
            onChange={e => updateUri(uri.id, { uri: e.target.value })}
            style={{ flex: 1 }}
          />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeUri(uri.id)} />
        </div>
      ))}
    </div>
  );
};

// TOTP 编辑组件
const TotpEditor: React.FC<{
  totps: VaultTotp[];
  onChange: (totps: VaultTotp[]) => void;
}> = ({ totps, onChange }) => {
  const addTotp = () => {
    onChange([...totps, { id: `totp_${Date.now()}`, name: '', account: '', secret: '' }]);
  };
  const updateTotp = (id: string, updates: Partial<VaultTotp>) => {
    onChange(totps.map(t => t.id === id ? { ...t, ...updates } : t));
  };
  const removeTotp = (id: string) => {
    onChange(totps.filter(t => t.id !== id));
  };

  // 处理输入变化，自动解析 otpauth:// URI
  const handleSecretChange = (id: string, value: string) => {
    const trimmedValue = value.trim();
    if (trimmedValue.startsWith('otpauth://')) {
      const parsed = parseOtpAuthUri(trimmedValue);
      if (parsed) {
        // 从 otpauth://totp/GitHub:aorxuck41 格式中提取
        // issuer = GitHub, name/label = GitHub:aorxuck41 或 aorxuck41
        const currentTotp = totps.find(t => t.id === id);
        
        // 提取服务名称（issuer）
        const serviceName = parsed.issuer || '';
        
        // 提取账户名（从 label 中提取，格式可能是 "issuer:account" 或 "account"）
        let accountName = '';
        if (parsed.name) {
          // 如果 label 包含冒号，取冒号后面的部分作为账户名
          const colonIndex = parsed.name.indexOf(':');
          accountName = colonIndex >= 0 ? parsed.name.substring(colonIndex + 1) : parsed.name;
        }
        
        updateTotp(id, { 
          secret: parsed.secret, 
          name: currentTotp?.name || serviceName,
          account: currentTotp?.account || accountName,
        });
        message.success('已自动解析 TOTP URI');
        return;
      }
    }
    updateTotp(id, { secret: value });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#666' }}>TOTP 密钥（支持粘贴 otpauth:// 链接）</span>
        <Button type="link" size="small" icon={<PlusOutlined />} onClick={addTotp}>添加</Button>
      </div>
      {totps.map((totp) => (
        <div key={totp.id} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <Input
              placeholder="服务名称"
              value={totp.name}
              onChange={e => updateTotp(totp.id, { name: e.target.value })}
              style={{ width: 100 }}
            />
            <Input
              placeholder="账户"
              value={totp.account || ''}
              onChange={e => updateTotp(totp.id, { account: e.target.value })}
              style={{ width: 120 }}
            />
            <Input
              placeholder="密钥或 otpauth:// 链接"
              value={totp.secret}
              onChange={e => handleSecretChange(totp.id, e.target.value)}
              style={{ flex: 1 }}
            />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeTotp(totp.id)} />
          </div>
          {/* 实时预览验证码 */}
          {totp.secret && (
            <div style={{ marginLeft: 228 }}>
              <TotpPreview secret={totp.secret} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// TOTP 预览组件（编辑时显示）
const TotpPreview: React.FC<{ secret: string }> = ({ secret }) => {
  const [code, setCode] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(getTotpRemainingTime());

  useEffect(() => {
    const updateCode = () => {
      setCode(generateTotpCode(secret));
      setRemaining(getTotpRemainingTime());
    };
    updateCode();
    const interval = setInterval(updateCode, 1000);
    return () => clearInterval(interval);
  }, [secret]);

  if (!code) {
    return <span style={{ fontSize: 11, color: '#ff4d4f' }}>密钥格式无效</span>;
  }

  return (
    <span style={{ fontSize: 12, color: '#52c41a', fontFamily: 'monospace' }}>
      验证码: {code.slice(0, 3)} {code.slice(3)} ({remaining}s)
    </span>
  );
};

// 自定义字段编辑组件
const CustomFieldEditor: React.FC<{
  fields: VaultCustomField[];
  onChange: (fields: VaultCustomField[]) => void;
}> = ({ fields, onChange }) => {
  const addField = () => {
    onChange([...fields, { id: `field_${Date.now()}`, name: '', value: '', type: 'text' }]);
  };
  const updateField = (id: string, updates: Partial<VaultCustomField>) => {
    onChange(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  };
  const removeField = (id: string) => {
    onChange(fields.filter(f => f.id !== id));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#666' }}>自定义字段</span>
        <Button type="link" size="small" icon={<PlusOutlined />} onClick={addField}>添加</Button>
      </div>
      {fields.map((field) => (
        <div key={field.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Input
            placeholder="字段名"
            value={field.name}
            onChange={e => updateField(field.id, { name: e.target.value })}
            style={{ width: 100 }}
          />
          <Select
            value={field.type}
            onChange={v => updateField(field.id, { type: v })}
            style={{ width: 80 }}
            options={[
              { value: 'text', label: '文本' },
              { value: 'hidden', label: '隐藏' },
            ]}
          />
          {field.type === 'hidden' ? (
            <Input.Password
              placeholder="值"
              value={field.value}
              onChange={e => updateField(field.id, { value: e.target.value })}
              style={{ flex: 1 }}
            />
          ) : (
            <Input
              placeholder="值"
              value={field.value}
              onChange={e => updateField(field.id, { value: e.target.value })}
              style={{ flex: 1 }}
            />
          )}
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeField(field.id)} />
        </div>
      ))}
    </div>
  );
};

const VaultPanel: React.FC = () => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<VaultEntry | null>(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const { folders, createFolder, deleteFolder } = useVaultFolders();
  const { entries, createEntry, updateEntry, deleteEntry, toggleFavorite, refresh } = useVaultEntries(
    selectedFolderId === 'all' ? undefined : selectedFolderId
  );

  // 表单状态
  const [form] = Form.useForm();

  const selectedEntry = entries.find(e => e.id === selectedEntryId);

  // 过滤条目
  const filteredEntries = searchQuery
    ? entries.filter(e => 
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.username.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : entries;

  const handleCreateEntry = () => {
    setEditingEntry(null);
    form.resetFields();
    form.setFieldsValue({
      entry_type: 'login',
      folder_id: selectedFolderId,
      uris: [],
      totp_secrets: [],
      custom_fields: [],
    });
    setEditModalOpen(true);
  };

  const handleEditEntry = (entry: VaultEntry) => {
    setEditingEntry(entry);
    form.setFieldsValue({
      name: entry.name,
      entry_type: entry.entryType,
      folder_id: entry.folderId,
      username: entry.username,
      password: entry.password,
      totp_secrets: entry.totpSecrets,
      uris: entry.uris,
      notes: entry.notes,
      card_holder_name: entry.cardHolderName,
      card_number: entry.cardNumber,
      card_brand: entry.cardBrand,
      card_exp_month: entry.cardExpMonth,
      card_exp_year: entry.cardExpYear,
      card_cvv: entry.cardCvv,
      identity_title: entry.identityTitle,
      identity_first_name: entry.identityFirstName,
      identity_last_name: entry.identityLastName,
      identity_email: entry.identityEmail,
      identity_phone: entry.identityPhone,
      identity_address: entry.identityAddress,
      custom_fields: entry.customFields,
    });
    setEditModalOpen(true);
  };

  const handleSaveEntry = async () => {
    try {
      const values = await form.validateFields();
      if (editingEntry) {
        await updateEntry(editingEntry.id, values);
        message.success('已更新');
      } else {
        await createEntry(values);
        message.success('已创建');
      }
      setEditModalOpen(false);
    } catch (err) {
      // validation error
    }
  };

  const handleDeleteEntry = async (id: string) => {
    await deleteEntry(id);
    if (selectedEntryId === id) setSelectedEntryId(null);
    message.success('已删除');
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      message.warning('请输入文件夹名称');
      return;
    }
    await createFolder(newFolderName.trim());
    setNewFolderName('');
    setFolderModalOpen(false);
    message.success('文件夹已创建');
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    message.success(`${label}已复制`);
  };

  const handleGeneratePassword = () => {
    const pwd = generatePassword(16);
    form.setFieldValue('password', pwd);
  };

  const entryType = Form.useWatch('entry_type', form);
  const urisValue = Form.useWatch('uris', form);
  const totpSecretsValue = Form.useWatch('totp_secrets', form);
  const customFieldsValue = Form.useWatch('custom_fields', form);

  return (
    <Layout style={{ height: '100%' }}>
      {/* 左侧文件夹列表 */}
      <Sider width={180} theme="light" style={{ borderRight: '1px solid #f0f0f0', background: '#fafafa' }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: '12px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyOutlined style={{ fontSize: 16, color: '#1890ff' }} />
            <span style={{ fontWeight: 500 }}>密码库</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div
              onClick={() => { setSelectedFolderId('all'); setSelectedEntryId(null); }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                background: selectedFolderId === 'all' ? '#e6f4ff' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <GlobalOutlined />
              <span>所有项目</span>
            </div>
            <div
              onClick={() => { setSelectedFolderId(null); setSelectedEntryId(null); }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                background: selectedFolderId === null ? '#e6f4ff' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <FolderOutlined />
              <span>未分类</span>
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ padding: '4px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#888' }}>文件夹</span>
              <Button type="text" size="small" icon={<FolderAddOutlined />} onClick={() => setFolderModalOpen(true)} />
            </div>
            {folders.map(folder => (
              <div
                key={folder.id}
                onClick={() => { setSelectedFolderId(folder.id); setSelectedEntryId(null); }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: selectedFolderId === folder.id ? '#e6f4ff' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FolderOutlined />
                  <span>{folder.name}</span>
                </div>
                <Popconfirm title="删除此文件夹？" onConfirm={() => deleteFolder(folder.id)}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={e => e.stopPropagation()} />
                </Popconfirm>
              </div>
            ))}
          </div>
        </div>
      </Sider>

      {/* 中间条目列表 */}
      <Sider width={260} theme="light" style={{ borderRight: '1px solid #f0f0f0', background: '#fff' }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <Input
              placeholder="搜索..."
              prefix={<SearchOutlined />}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              allowClear
            />
          </div>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <Button type="primary" icon={<PlusOutlined />} block size="small" onClick={handleCreateEntry}>
              新建条目
            </Button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {filteredEntries.length === 0 ? (
              <Empty description="暂无条目" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 40 }} />
            ) : (
              filteredEntries.map(entry => (
                <EntryListItem
                  key={entry.id}
                  entry={entry}
                  selected={selectedEntryId === entry.id}
                  onSelect={() => setSelectedEntryId(entry.id)}
                  onToggleFavorite={() => toggleFavorite(entry.id)}
                  onDelete={() => handleDeleteEntry(entry.id)}
                />
              ))
            )}
          </div>
        </div>
      </Sider>

      {/* 右侧详情 */}
      <Content style={{ background: '#fff', overflow: 'auto' }}>
        {selectedEntry ? (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>{selectedEntry.name}</h2>
                <Tag color={ENTRY_TYPE_CONFIG[selectedEntry.entryType].color} style={{ marginTop: 8 }}>
                  {ENTRY_TYPE_CONFIG[selectedEntry.entryType].label}
                </Tag>
              </div>
              <Space>
                <Button icon={<EditOutlined />} onClick={() => handleEditEntry(selectedEntry)}>编辑</Button>
                <Popconfirm title="确定删除？" onConfirm={() => handleDeleteEntry(selectedEntry.id)}>
                  <Button danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            </div>

            {selectedEntry.entryType === 'login' && (
              <>
                {selectedEntry.uris.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: '#888' }}>网站</label>
                    {selectedEntry.uris.map(uri => (
                      <div key={uri.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <GlobalOutlined />
                        <a href={normalizeUrl(uri.uri)} target="_blank" rel="noopener noreferrer">{uri.name || uri.uri}</a>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, color: '#888' }}>用户名</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Input value={selectedEntry.username} readOnly style={{ flex: 1 }} />
                    <Tooltip title="复制"><Button type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(selectedEntry.username, '用户名')} /></Tooltip>
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, color: '#888' }}>密码</label>
                  <PasswordField value={selectedEntry.password} onCopy={() => copyToClipboard(selectedEntry.password, '密码')} />
                </div>
                {selectedEntry.totpSecrets && selectedEntry.totpSecrets.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8 }}>TOTP 验证码</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {selectedEntry.totpSecrets.map(totp => (
                        <TotpDisplay 
                          key={totp.id} 
                          secret={totp.secret} 
                          name={totp.name}
                          account={totp.account}
                          onCopy={(code) => copyToClipboard(code, `验证码 (${totp.name || '未命名'})`)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {selectedEntry.entryType === 'card' && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, color: '#888' }}>持卡人</label>
                  <Input value={selectedEntry.cardHolderName} readOnly />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, color: '#888' }}>卡号</label>
                  <PasswordField value={selectedEntry.cardNumber} onCopy={() => copyToClipboard(selectedEntry.cardNumber, '卡号')} />
                </div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: '#888' }}>有效期</label>
                    <Input value={`${selectedEntry.cardExpMonth}/${selectedEntry.cardExpYear}`} readOnly />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: '#888' }}>CVV</label>
                    <PasswordField value={selectedEntry.cardCvv} onCopy={() => copyToClipboard(selectedEntry.cardCvv, 'CVV')} />
                  </div>
                </div>
              </>
            )}

            {selectedEntry.customFields.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Divider>自定义字段</Divider>
                {selectedEntry.customFields.map(field => (
                  <div key={field.id} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: '#888' }}>{field.name}</label>
                    {field.type === 'hidden' ? (
                      <PasswordField value={field.value} onCopy={() => copyToClipboard(field.value, field.name)} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Input value={field.value} readOnly style={{ flex: 1 }} />
                        <Tooltip title="复制"><Button type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(field.value, field.name)} /></Tooltip>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {selectedEntry.notes && (
              <div>
                <Divider>备注</Divider>
                <div style={{ whiteSpace: 'pre-wrap', color: '#666' }}>{selectedEntry.notes}</div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Empty description="选择一个条目查看详情" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        )}
      </Content>

      {/* 编辑弹窗 */}
      <Modal
        title={editingEntry ? '编辑条目' : '新建条目'}
        open={editModalOpen}
        onOk={handleSaveEntry}
        onCancel={() => setEditModalOpen(false)}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="entry_type" label="类型">
            <Select options={Object.entries(ENTRY_TYPE_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))} />
          </Form.Item>
          <Form.Item name="folder_id" label="文件夹">
            <Select allowClear placeholder="未分类" options={folders.map(f => ({ value: f.id, label: f.name }))} />
          </Form.Item>

          {entryType === 'login' && (
            <>
              <Form.Item name="username" label="用户名">
                <Input prefix={<UserOutlined />} />
              </Form.Item>
              <Form.Item name="password" label="密码">
                <Input.Password addonAfter={<Button type="link" size="small" onClick={handleGeneratePassword}>生成</Button>} />
              </Form.Item>
              <Form.Item name="totp_secrets" label="TOTP 密钥">
                <TotpEditor totps={totpSecretsValue || []} onChange={v => form.setFieldValue('totp_secrets', v)} />
              </Form.Item>
              <Form.Item name="uris" label="关联网站">
                <UriEditor uris={urisValue || []} onChange={v => form.setFieldValue('uris', v)} />
              </Form.Item>
            </>
          )}

          {entryType === 'card' && (
            <>
              <Form.Item name="card_holder_name" label="持卡人">
                <Input />
              </Form.Item>
              <Form.Item name="card_number" label="卡号">
                <Input />
              </Form.Item>
              <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item name="card_exp_month" label="月" style={{ flex: 1 }}>
                  <Input placeholder="MM" />
                </Form.Item>
                <Form.Item name="card_exp_year" label="年" style={{ flex: 1 }}>
                  <Input placeholder="YYYY" />
                </Form.Item>
                <Form.Item name="card_cvv" label="CVV" style={{ flex: 1 }}>
                  <Input.Password />
                </Form.Item>
              </div>
            </>
          )}

          {entryType === 'identity' && (
            <>
              <Form.Item name="identity_first_name" label="名">
                <Input />
              </Form.Item>
              <Form.Item name="identity_last_name" label="姓">
                <Input />
              </Form.Item>
              <Form.Item name="identity_email" label="邮箱">
                <Input />
              </Form.Item>
              <Form.Item name="identity_phone" label="电话">
                <Input />
              </Form.Item>
              <Form.Item name="identity_address" label="地址">
                <TextArea rows={2} />
              </Form.Item>
            </>
          )}

          <Form.Item name="custom_fields" label="自定义字段">
            <CustomFieldEditor fields={customFieldsValue || []} onChange={v => form.setFieldValue('custom_fields', v)} />
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新建文件夹弹窗 */}
      <Modal
        title="新建文件夹"
        open={folderModalOpen}
        onOk={handleCreateFolder}
        onCancel={() => { setFolderModalOpen(false); setNewFolderName(''); }}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="文件夹名称"
          value={newFolderName}
          onChange={e => setNewFolderName(e.target.value)}
          onPressEnter={handleCreateFolder}
          autoFocus
        />
      </Modal>
    </Layout>
  );
};

export default VaultPanel;
