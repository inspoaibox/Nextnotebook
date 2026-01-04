import React, { useState } from 'react';
import { Badge, Tooltip, Button, Space, Dropdown, Progress, Modal, Typography, List } from 'antd';
import {
  CloudSyncOutlined,
  CloudOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined,
  DisconnectOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  CloseCircleOutlined,
  UploadOutlined,
  DownloadOutlined,
  LockOutlined,
  KeyOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';

const { Text } = Typography;

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncProgress {
  phase: 'idle' | 'connecting' | 'acquiring-lock' | 'verifying-key' | 'pushing' | 'pulling' | 'committing' | 'done' | 'error';
  message: string;
  current?: number;
  total?: number;
  detail?: string;
}

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
  duration: number;
}

interface SyncStatusBarProps {
  status: SyncStatus;
  lastSyncTime: number | null;
  pendingChanges: number;
  progress?: SyncProgress | null;
  lastResult?: SyncResult | null;
  onSync: () => void;
  onForceResync?: () => void;
  onOpenSettings: () => void;
}

const SyncStatusBar: React.FC<SyncStatusBarProps> = ({
  status,
  lastSyncTime,
  pendingChanges,
  progress,
  lastResult,
  onSync,
  onForceResync,
  onOpenSettings,
}) => {
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const getPhaseIcon = (phase: string) => {
    switch (phase) {
      case 'connecting': return <CloudOutlined />;
      case 'acquiring-lock': return <LockOutlined />;
      case 'verifying-key': return <KeyOutlined />;
      case 'pushing': return <UploadOutlined />;
      case 'pulling': return <DownloadOutlined />;
      case 'committing': return <SaveOutlined />;
      case 'done': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'error': return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default: return <CloudSyncOutlined />;
    }
  };

  const getStatusIcon = () => {
    if (status === 'syncing' && progress) {
      return <CloudSyncOutlined spin style={{ color: '#1890ff' }} />;
    }
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
    if (status === 'syncing' && progress) {
      return progress.message;
    }
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
    {
      key: 'forceResync',
      label: '强制重新同步',
      icon: <CloudUploadOutlined />,
      onClick: onForceResync,
      disabled: status === 'syncing' || status === 'offline' || !onForceResync,
    },
    {
      key: 'detail',
      label: '同步详情',
      icon: <InfoCircleOutlined />,
      onClick: () => setDetailModalOpen(true),
    },
    { type: 'divider' },
    {
      key: 'settings',
      label: '同步设置',
      onClick: onOpenSettings,
    },
  ];

  // 计算进度百分比
  const getProgressPercent = () => {
    if (!progress || !progress.total || progress.total === 0) return 0;
    return Math.round((progress.current || 0) / progress.total * 100);
  };

  // 渲染同步进度条
  const renderProgress = () => {
    if (status !== 'syncing' || !progress) return null;
    
    const percent = getProgressPercent();
    const showProgress = progress.phase === 'pushing' || progress.phase === 'pulling';
    
    return (
      <div style={{ 
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        height: 2,
        background: '#f0f0f0',
        overflow: 'hidden'
      }}>
        {showProgress && progress.total && progress.total > 0 ? (
          <div style={{ 
            width: `${percent}%`, 
            height: '100%', 
            background: '#1890ff',
            transition: 'width 0.3s'
          }} />
        ) : (
          <div style={{ 
            width: '30%', 
            height: '100%', 
            background: '#1890ff',
            animation: 'syncProgress 1s infinite linear'
          }} />
        )}
      </div>
    );
  };

  return (
    <>
      <style>{`
        @keyframes syncProgress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
      
      <Dropdown menu={{ items: menuItems }} trigger={['click']}>
        <Tooltip 
          title={
            <div>
              <div>上次同步: {formatLastSyncTime()}</div>
              {progress?.detail && <div style={{ marginTop: 4, fontSize: 11 }}>{progress.detail}</div>}
            </div>
          }
        >
          <Button 
            type="text" 
            size="small" 
            style={{ 
              padding: '4px 8px', 
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <Space size={4}>
              <Badge count={status === 'syncing' ? 0 : pendingChanges} size="small" offset={[-2, 2]}>
                {getStatusIcon()}
              </Badge>
              <span style={{ fontSize: 12, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getStatusText()}
              </span>
              {status === 'syncing' && progress && progress.total && progress.total > 0 && (
                <span style={{ fontSize: 11, color: '#999' }}>
                  {progress.current}/{progress.total}
                </span>
              )}
            </Space>
            {renderProgress()}
          </Button>
        </Tooltip>
      </Dropdown>

      {/* 同步详情弹窗 */}
      <Modal
        title="同步详情"
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button key="sync" type="primary" onClick={onSync} disabled={status === 'syncing'} icon={<CloudSyncOutlined />}>
            立即同步
          </Button>,
          <Button key="close" onClick={() => setDetailModalOpen(false)}>
            关闭
          </Button>,
        ]}
        width={400}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* 当前状态 */}
          <div>
            <Text type="secondary">当前状态</Text>
            <div style={{ marginTop: 4 }}>
              <Space>
                {getStatusIcon()}
                <Text>{getStatusText()}</Text>
              </Space>
            </div>
          </div>

          {/* 同步进度 */}
          {status === 'syncing' && progress && (
            <div>
              <Text type="secondary">同步进度</Text>
              <div style={{ marginTop: 8 }}>
                <Space style={{ marginBottom: 8 }}>
                  {getPhaseIcon(progress.phase)}
                  <Text>{progress.message}</Text>
                </Space>
                {progress.total && progress.total > 0 && (
                  <Progress 
                    percent={getProgressPercent()} 
                    size="small"
                    format={() => `${progress.current || 0}/${progress.total}`}
                  />
                )}
                {progress.detail && (
                  <Text type="secondary" style={{ fontSize: 12 }}>{progress.detail}</Text>
                )}
              </div>
            </div>
          )}

          {/* 上次同步结果 */}
          {lastResult && (
            <div>
              <Text type="secondary">上次同步结果</Text>
              <div style={{ marginTop: 4 }}>
                <Space direction="vertical" size="small">
                  <Space>
                    {lastResult.success ? (
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    ) : (
                      <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                    )}
                    <Text>{lastResult.success ? '同步成功' : '同步失败'}</Text>
                    <Text type="secondary">({(lastResult.duration / 1000).toFixed(1)}s)</Text>
                  </Space>
                  <Space>
                    <UploadOutlined />
                    <Text>上传 {lastResult.pushed} 项</Text>
                    <DownloadOutlined />
                    <Text>下载 {lastResult.pulled} 项</Text>
                  </Space>
                  {lastResult.conflicts > 0 && (
                    <Text type="warning">⚠️ {lastResult.conflicts} 个冲突</Text>
                  )}
                  {lastResult.errors.length > 0 && (
                    <div>
                      <Text type="danger">错误:</Text>
                      <List
                        size="small"
                        dataSource={lastResult.errors}
                        renderItem={(error) => (
                          <List.Item style={{ padding: '4px 0' }}>
                            <Text type="danger" style={{ fontSize: 12 }}>{error}</Text>
                          </List.Item>
                        )}
                      />
                    </div>
                  )}
                </Space>
              </div>
            </div>
          )}

          {/* 上次同步时间 */}
          <div>
            <Text type="secondary">上次同步时间</Text>
            <div style={{ marginTop: 4 }}>
              <Text>{lastSyncTime ? new Date(lastSyncTime).toLocaleString('zh-CN') : '从未同步'}</Text>
            </div>
          </div>

          {/* 待同步项目 */}
          <div>
            <Text type="secondary">待同步项目</Text>
            <div style={{ marginTop: 4 }}>
              <Text>{pendingChanges} 项</Text>
            </div>
          </div>
        </Space>
      </Modal>
    </>
  );
};

export default SyncStatusBar;
