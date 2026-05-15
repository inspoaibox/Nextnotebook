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
  SearchOutlined, ReloadOutlined, SafetyOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useVaultEntries, useVaultFolders, VaultEntry, VaultFolder, generatePassword } from '../hooks/useVault';
import GeneratorView from './GeneratorView';
import { VaultEntryType, VaultUri, VaultCustomField, VaultTotp } from '@shared/types';
import * as OTPAuth from 'otpauth';

const { Sider, Content } = Layout;
const { TextArea } = Input;

// 注入样式
const styles = `
  .vault-panel {
    background: #f0f2f5 !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }

  .vault-sider-light {
    background: #fff !important;
    border-right: 1px solid rgba(0,0,0,0.06) !important;
  }

  /* Compact Sidebar Items */
  .vault-nav-item {
    padding: 6px 12px;
    margin: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    color: #4b5563;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
  }

  .vault-nav-item:hover {
    background: rgba(0,0,0,0.04);
    color: #111827;
  }

  .vault-nav-item.selected {
    background: #e6f7ff;
    color: #096dd9;
  }

  /* Compact Entry List */
  .vault-entry-card {
    padding: 10px 12px;
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
  }

  .vault-entry-card:hover {
    background: #fafafa;
  }

  .vault-entry-card.selected {
    background: #e6f7ff;
    border-right: 3px solid #1890ff;
  }

  /* Compact Detail View */
  .vault-detail-header {
    background: #fff;
    padding: 16px 24px;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 72px;
    height: auto;
    box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  }

  .vault-detail-body {
    padding: 20px 24px;
    max-width: 1200px;
    margin: 0 auto;
  }
  
  .vault-detail-section {
    background: #fff;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    padding: 16px 20px;
    margin-bottom: 16px;
  }
  
  .vault-row {
     display: flex;
     gap: 24px;
     margin-bottom: 12px;
  }
  
  .vault-col {
     flex: 1;
     min-width: 0;
  }

  .vault-field-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: #6b7280;
    margin-bottom: 4px;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }
  
  .secure-input-wrapper {
    background: #f9fafb;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    display: flex;
    align-items: center;
    padding: 0 4px 0 8px;
    height: 32px;
    transition: all 0.2s;
  }
  
  .secure-input-wrapper:focus-within {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
    background: #fff;
  }
  
  .secure-input-wrapper input {
    font-size: 13px; 
  }
`;

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

const normalizeSearchText = (value: string | number | null | undefined): string =>
  String(value ?? '').trim().toLowerCase();

const getVaultEntrySearchFields = (entry: VaultEntry, folders: VaultFolder[]): string[] => {
  const folderName = folders.find(folder => folder.id === entry.folderId)?.name || '';

  return [
    entry.name,
    ENTRY_TYPE_CONFIG[entry.entryType].label,
    folderName,
    entry.username,
    entry.notes,
    ...entry.uris.flatMap(uri => [uri.name, uri.uri, uri.match_type]),
    ...entry.totpSecrets.flatMap(totp => [totp.name, totp.account]),
    entry.cardHolderName,
    entry.cardNumber,
    entry.cardBrand,
    entry.cardExpMonth,
    entry.cardExpYear,
    entry.identityTitle,
    entry.identityFirstName,
    entry.identityLastName,
    entry.identityEmail,
    entry.identityPhone,
    entry.identityAddress,
    ...entry.customFields.flatMap(field => [
      field.name,
      field.type === 'hidden' ? '' : field.value,
    ]),
  ];
};

const matchesVaultEntrySearch = (
  entry: VaultEntry,
  query: string,
  folders: VaultFolder[]
): boolean => {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const fields = getVaultEntrySearchFields(entry, folders)
    .map(normalizeSearchText)
    .filter(Boolean);

  return terms.every(term => fields.some(field => field.includes(term)));
};

// 密码显示组件
const PasswordField: React.FC<{ value: string; onCopy: () => void }> = ({ value, onCopy }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
      <Input
        type={visible ? 'text' : 'password'}
        value={value}
        readOnly
        bordered={false}
        style={{ flex: 1, fontSize: 13, padding: 0 }}
      />
      <Space size={4}>
        <Tooltip title={visible ? '隐藏' : '显示'}>
          <Button
            type="text"
            icon={visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => setVisible(!visible)}
            style={{ color: '#6b7280' }}
          />
        </Tooltip>
        <Tooltip title="复制">
          <Button type="text" icon={<CopyOutlined />} onClick={onCopy} style={{ color: '#6b7280' }} />
        </Tooltip>
      </Space>
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
      className={`vault-entry-card ${selected ? 'selected' : ''}`}
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid #f0f0f0',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: selected ? '#e6f7ff' : undefined,
        borderRight: selected ? '3px solid #1890ff' : undefined,
      }}
    >
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        background: selected ? '#fff' : '#f3f4f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        color: config.color,
        border: '1px solid rgba(0,0,0,0.05)',
        flexShrink: 0,
        marginTop: 2
      }}>
        {config.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 名称区域 - 允许换行显示完整内容 */}
        <div style={{
          fontWeight: 500,
          fontSize: 13,
          color: '#1f2937',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: 4
        }}>
          {entry.name}
        </div>
        {/* 用户名/类型 和 时间 - 固定在底部一行 */}
        <div style={{
          fontSize: 11,
          color: '#9ca3af',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          lineHeight: 1.2
        }}>
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            marginRight: 8
          }}>
            {entry.username || config.label}
          </span>
          <span style={{ whiteSpace: 'nowrap', flexShrink: 0, color: '#bfbfbf', fontSize: 10 }}>
            {entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : ''}
          </span>
        </div>
      </div>
      <Button
        type="text"
        size="small"
        icon={entry.favorite ? <StarFilled style={{ color: '#fbbf24' }} /> : <StarOutlined style={{ color: '#d1d5db' }} />}
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        style={{ flexShrink: 0, marginTop: 2 }}
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
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>('all');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<VaultEntry | null>(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [viewMode, setViewMode] = useState<'normal' | 'generator'>('normal');

  // 文件夹右键菜单状态
  const [folderContextMenu, setFolderContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    folderId: string | null;
  }>({ visible: false, x: 0, y: 0, folderId: null });

  // 文件夹重命名状态
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingFolderName, setRenamingFolderName] = useState('');

  const { folders, createFolder, updateFolder, deleteFolder } = useVaultFolders();
  const { entries, createEntry, updateEntry, deleteEntry, toggleFavorite, refresh } = useVaultEntries(
    selectedFolderId === 'all' ? undefined : selectedFolderId
  );

  // 获取所有条目（用于检查文件夹是否为空）
  const { entries: allEntries } = useVaultEntries(undefined);

  // 表单状态
  const [form] = Form.useForm();

  const selectedEntry = entries.find(e => e.id === selectedEntryId);

  // 关闭文件夹右键菜单
  React.useEffect(() => {
    const handleClick = () => setFolderContextMenu(prev => ({ ...prev, visible: false }));
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // 处理文件夹右键点击
  const handleFolderContextMenu = (e: React.MouseEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      folderId
    });
  };

  // 开始重命名文件夹
  const startRenameFolder = (folder: VaultFolder) => {
    setRenamingFolderId(folder.id);
    setRenamingFolderName(folder.name);
    setFolderContextMenu(prev => ({ ...prev, visible: false }));
  };

  // 提交重命名
  const submitRenameFolder = async () => {
    if (renamingFolderId && renamingFolderName.trim()) {
      await updateFolder(renamingFolderId, { name: renamingFolderName.trim() });
      message.success('重命名成功');
    }
    setRenamingFolderId(null);
  };

  // 检查文件夹是否有条目
  const folderHasEntries = (folderId: string): boolean => {
    return allEntries.some(entry => entry.folderId === folderId);
  };

  // 删除文件夹（带验证）
  const handleDeleteFolder = async (folderId: string) => {
    if (folderHasEntries(folderId)) {
      message.error('该文件夹下还有密码凭据，请先移动或删除这些凭据');
      return;
    }
    await deleteFolder(folderId);
    if (selectedFolderId === folderId) {
      setSelectedFolderId(null);
    }
    message.success('文件夹已删除');
    setFolderContextMenu(prev => ({ ...prev, visible: false }));
  };

  // 过滤条目
  const filteredEntries = entries.filter(entry =>
    matchesVaultEntrySearch(entry, searchQuery, folders)
  );

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

  const handleDuplicateEntry = (entry: VaultEntry) => {
    // 复制当前条目数据，标题加"(副本)"，打开新建编辑框
    setEditingEntry(null);
    form.setFieldsValue({
      name: `${entry.name} (副本)`,
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
    <Layout style={{ height: '100%' }} className="vault-panel">
      {/* 左侧文件夹列表 */}
      <Sider width={240} className="vault-sider-light" style={{ borderRight: '1px solid rgba(0,0,0,0.06)' }}>
        <style>{styles}</style>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <div style={{
            padding: '24px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <div style={{
              width: 32, height: 32,
              background: '#096dd9',
              borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(9, 109, 217, 0.2)'
            }}>
              <SafetyOutlined style={{ fontSize: 18, color: '#fff' }} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 16, color: '#111827', letterSpacing: -0.5 }}>安全保险箱</span>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
            <div style={{ padding: '0 12px 8px', fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5 }}>
              DASHBOARD
            </div>
            <div
              onClick={() => { setSelectedFolderId('all'); setSelectedEntryId(null); setViewMode('normal'); }}
              className={`vault-nav-item ${selectedFolderId === 'all' && viewMode === 'normal' ? 'selected' : ''}`}
            >
              <GlobalOutlined />
              <span>所有项目</span>
            </div>
            <div
              onClick={() => { setSelectedFolderId(null); setSelectedEntryId(null); setViewMode('normal'); }}
              className={`vault-nav-item ${selectedFolderId === null && viewMode === 'normal' ? 'selected' : ''}`}
            >
              <FolderOutlined />
              <span>未分类</span>
            </div>
            <div
              onClick={() => { setViewMode('generator'); setSelectedEntryId(null); }}
              className={`vault-nav-item ${viewMode === 'generator' ? 'selected' : ''}`}
            >
              <ThunderboltOutlined />
              <span>密码生成器</span>
            </div>

            <Divider style={{ margin: '16px 12px', borderColor: '#f3f4f6' }} />

            <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5 }}>FOLDERS</span>
              <Tooltip title="新建文件夹">
                <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => setFolderModalOpen(true)} style={{ color: '#6b7280' }} />
              </Tooltip>
            </div>
            {folders.map(folder => {
              const isRenaming = renamingFolderId === folder.id;
              return (
                <div
                  key={folder.id}
                  onClick={() => {
                    if (!isRenaming) {
                      setSelectedFolderId(folder.id);
                      setSelectedEntryId(null);
                      setViewMode('normal');
                    }
                  }}
                  onContextMenu={(e) => handleFolderContextMenu(e, folder.id)}
                  className={`vault-nav-item ${selectedFolderId === folder.id && viewMode === 'normal' ? 'selected' : ''}`}
                >
                  <FolderOutlined style={{ color: selectedFolderId === folder.id ? '#096dd9' : '#d1d5db' }} />
                  {isRenaming ? (
                    <Input
                      value={renamingFolderName}
                      onChange={e => setRenamingFolderName(e.target.value)}
                      onBlur={submitRenameFolder}
                      onPressEnter={submitRenameFolder}
                      autoFocus
                      size="small"
                      onClick={e => e.stopPropagation()}
                      style={{ flex: 1, height: 24, fontSize: 13 }}
                    />
                  ) : (
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder.name}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Sider>

      {/* 文件夹右键菜单 */}
      {folderContextMenu.visible && folderContextMenu.folderId && (
        <div style={{
          position: 'fixed',
          top: folderContextMenu.y,
          left: folderContextMenu.x,
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 3px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          padding: '4px 0',
          minWidth: 140,
          border: '1px solid #e5e7eb'
        }}>
          <div
            onClick={() => {
              const folder = folders.find(f => f.id === folderContextMenu.folderId);
              if (folder) startRenameFolder(folder);
            }}
            style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 13, color: '#333', display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
          >
            <EditOutlined /> 重命名
          </div>
          <div
            onClick={(e) => {
              e.stopPropagation();
              const folderId = folderContextMenu.folderId;
              if (folderId) {
                handleDeleteFolder(folderId);
              }
            }}
            style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 13, color: '#ff4d4f', display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fff1f0')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
          >
            <DeleteOutlined /> 删除文件夹
          </div>
        </div>
      )}

      {/* 生成器视图或普通视图 */}
      {viewMode === 'generator' ? (
        <GeneratorView
          folders={folders}
          onBack={() => setViewMode('normal')}
          onImport={async (payload) => {
            await createEntry(payload);
          }}
          onCreateFolder={createFolder}
        />
      ) : (
        <>
          {/* 中间条目列表 */}
          {/* 中间条目列表 */}
          <Sider width={260} theme="light" style={{ borderRight: '1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
                <Input
                  placeholder="搜索保险箱..."
                  prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  allowClear
                  bordered={false}
                  style={{ background: '#f5f7f9', padding: '8px 12px', borderRadius: 8 }}
                />
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {filteredEntries.length === 0 ? (
                  <Empty description={false} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 60, opacity: 0.5 }} />
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
              <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f0f0' }}>
                <Button type="primary" icon={<PlusOutlined />} block onClick={handleCreateEntry} style={{ borderRadius: 6 }}>
                  新建条目
                </Button>
              </div>
            </div>
          </Sider>

          {/* 右侧详情 - 紧凑型展示 */}
          <Content className="vault-detail-content" style={{ overflow: 'auto', background: '#f5f7fa' }}>
            {selectedEntry ? (
              <div>
                <div className="vault-detail-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 48, height: 48,
                      borderRadius: 12,
                      background: '#f9fafb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 24,
                      color: ENTRY_TYPE_CONFIG[selectedEntry.entryType].color,
                      border: '1px solid #e5e7eb',
                    }}>
                      {ENTRY_TYPE_CONFIG[selectedEntry.entryType].icon}
                    </div>
                    <div>
                      <h2 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700, color: '#111827' }}>
                        {selectedEntry.name}
                      </h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag color={ENTRY_TYPE_CONFIG[selectedEntry.entryType].color} style={{ border: 'none', padding: '0 6px', height: 20, lineHeight: '20px', borderRadius: 10, fontSize: 11 }}>
                          {ENTRY_TYPE_CONFIG[selectedEntry.entryType].label}
                        </Tag>
                        {selectedEntry.updatedAt && (
                          <span style={{ fontSize: 12, color: '#9ca3af' }}>{new Date(selectedEntry.updatedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Space size={8}>
                    <Button icon={<EditOutlined />} onClick={() => handleEditEntry(selectedEntry)}>编辑</Button>
                    <Button icon={<CopyOutlined />} onClick={() => handleDuplicateEntry(selectedEntry)}>复制</Button>
                    <Popconfirm title="确定删除？" onConfirm={() => handleDeleteEntry(selectedEntry.id)}>
                      <Button danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>

                <div className="vault-detail-body">
                  {selectedEntry.entryType === 'login' && (
                    <>
                      <div className="vault-detail-section">
                        <div className="vault-row">
                          <div className="vault-col">
                            <div className="vault-field-label">用户名</div>
                            <div className="secure-input-wrapper">
                              <Input
                                value={selectedEntry.username}
                                readOnly
                                bordered={false}
                                style={{ flex: 1, fontSize: 13, padding: 0 }}
                              />
                              <Tooltip title="复制">
                                <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(selectedEntry.username, '用户名')} style={{ width: 24, height: 24 }} />
                              </Tooltip>
                            </div>
                          </div>
                          <div className="vault-col">
                            <div className="vault-field-label">密码</div>
                            <div className="secure-input-wrapper">
                              <PasswordField value={selectedEntry.password} onCopy={() => copyToClipboard(selectedEntry.password, '密码')} />
                            </div>
                          </div>
                        </div>
                      </div>

                      {selectedEntry.uris.length > 0 && (
                        <div className="vault-detail-section">
                          <div className="vault-field-label" style={{ marginBottom: 8 }}>关联网站</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {selectedEntry.uris.map(uri => {
                              const url = normalizeUrl(uri.uri);
                              const handleOpenUrl = (e: React.MouseEvent) => {
                                e.preventDefault();
                                window.electronAPI?.openExternal(url);
                              };
                              let hostname = url;
                              try { hostname = new URL(url).hostname; } catch { }
                              return (
                                <div key={uri.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f9fafb', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                                  <GlobalOutlined style={{ color: '#096dd9', fontSize: 15, flexShrink: 0 }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                      {uri.name || hostname}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#999', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginTop: 1 }}>
                                      {uri.uri}
                                    </div>
                                  </div>
                                  <Button type="text" size="small" icon={<GlobalOutlined />} onClick={handleOpenUrl} title="打开网站" style={{ flexShrink: 0 }} />
                                  <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(uri.uri, '链接')} title="复制链接" style={{ flexShrink: 0 }} />
                                  <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditEntry(selectedEntry)} title="修改" style={{ flexShrink: 0 }} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {selectedEntry.totpSecrets && selectedEntry.totpSecrets.length > 0 && (
                        <div className="vault-detail-section" style={{ borderLeft: '4px solid #1890ff' }}>
                          <div className="vault-field-label" style={{ marginBottom: 10 }}>两步验证 (TOTP)</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                            {selectedEntry.totpSecrets.map(totp => (
                              <TotpDisplay
                                key={totp.id}
                                secret={totp.secret}
                                name={totp.name}
                                account={totp.account}
                                onCopy={(code) => copyToClipboard(code, `验证码`)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {selectedEntry.entryType === 'card' && (
                    <div className="vault-detail-section">
                      <div className="vault-row">
                        <div className="vault-col">
                          <div className="vault-field-label">持卡人</div>
                          <div className="secure-input-wrapper">
                            <Input value={selectedEntry.cardHolderName} readOnly bordered={false} style={{ fontSize: 13, padding: 0 }} />
                          </div>
                        </div>
                        <div className="vault-col" style={{ flex: 2 }}>
                          <div className="vault-field-label">卡号</div>
                          <div className="secure-input-wrapper">
                            <PasswordField value={selectedEntry.cardNumber} onCopy={() => copyToClipboard(selectedEntry.cardNumber, '卡号')} />
                          </div>
                        </div>
                      </div>
                      <div className="vault-row">
                        <div className="vault-col">
                          <div className="vault-field-label">有效期</div>
                          <div className="secure-input-wrapper">
                            <Input value={`${selectedEntry.cardExpMonth}/${selectedEntry.cardExpYear}`} readOnly bordered={false} style={{ fontSize: 13, padding: 0 }} />
                          </div>
                        </div>
                        <div className="vault-col">
                          <div className="vault-field-label">CVV</div>
                          <div className="secure-input-wrapper">
                            <PasswordField value={selectedEntry.cardCvv} onCopy={() => copyToClipboard(selectedEntry.cardCvv, 'CVV')} />
                          </div>
                        </div>
                        <div className="vault-col" />
                      </div>
                    </div>
                  )}

                  {selectedEntry.customFields.length > 0 && (
                    <div className="vault-detail-section">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 24px' }}>
                        {selectedEntry.customFields.map(field => (
                          <div key={field.id}>
                            <div className="vault-field-label">{field.name}</div>
                            {field.type === 'hidden' ? (
                              <div className="secure-input-wrapper">
                                <PasswordField value={field.value} onCopy={() => copyToClipboard(field.value, field.name)} />
                              </div>
                            ) : (
                              <div className="secure-input-wrapper">
                                <Input value={field.value} readOnly bordered={false} style={{ flex: 1, fontSize: 13, padding: 0 }} />
                                <Tooltip title="复制"><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(field.value, field.name)} /></Tooltip>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedEntry.notes && (
                    <div className="vault-detail-section">
                      <div className="vault-field-label">备注</div>
                      <div style={{ whiteSpace: 'pre-wrap', color: '#4b5563', lineHeight: 1.5, background: '#f9fafb', padding: 12, borderRadius: 6, fontSize: 13 }}>{selectedEntry.notes}</div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', color: '#9ca3af' }}>
                <SafetyOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }} />
                <div style={{ fontSize: 14 }}>选择一个项目查看详情</div>
              </div>
            )}
          </Content>
        </>
      )}

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
