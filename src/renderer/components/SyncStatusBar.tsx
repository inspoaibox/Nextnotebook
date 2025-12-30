import React from 'react';
import { Badge, Tooltip, Button, Space, Dropdown } from 'antd';
import {
  CloudSyncOutlined,
  CloudOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined,
  DisconnectOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

interface SyncStatusBarProps {
  status: SyncStatus;
  lastSyncTime: number | null;
  pendingChanges: number;
  onSync: () => void;
  onOpenSettings: () => void;
}

const SyncStatusBar: React.FC<SyncStatusBarProps> = ({
  status,
  lastSyncTime,
  pendingChanges,
  onSync,
  onOpenSettings,
}) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'syncing':
        return <CloudSyncOutlined spin style={{ color: '#1890ff' }} />;
      case 'error':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'offline':
        return <DisconnectOutlined style={{ color: '#999' }} />;
      default:
        return pendingChanges > 0 
          ? <CloudUploadOutlined style={{ color: '#faad14' }} />
          : <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'syncing':
        return '同步中...';
      case 'error':
        return '同步失败';
      case 'offline':
        return '离线';
      default:
        if (pendingChanges > 0) {
          return `${pendingChanges} 项待同步`;
        }
        return '已同步';
    }
  };

  const formatLastSyncTime = () => {
    if (!lastSyncTime) return '从未同步';
    const now = Date.now();
    const diff = now - lastSyncTime;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return new Date(lastSyncTime).toLocaleDateString('zh-CN');
  };

  const menuItems: MenuProps['items'] = [
    {
      key: 'sync',
      label: '立即同步',
      icon: <CloudSyncOutlined />,
      onClick: onSync,
      disabled: status === 'syncing' || status === 'offline',
    },
    { type: 'divider' },
    {
      key: 'settings',
      label: '同步设置',
      onClick: onOpenSettings,
    },
  ];

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['click']}>
      <Tooltip title={`上次同步: ${formatLastSyncTime()}`}>
        <Button type="text" size="small" style={{ padding: '4px 8px' }}>
          <Space size={4}>
            <Badge count={pendingChanges} size="small" offset={[-2, 2]}>
              {getStatusIcon()}
            </Badge>
            <span style={{ fontSize: 12 }}>{getStatusText()}</span>
          </Space>
        </Button>
      </Tooltip>
    </Dropdown>
  );
};

export default SyncStatusBar;
