/**
 * LAN Transfer Assistant - 设备列表组件
 */

import React, { useState, useMemo } from 'react';
import { List, Avatar, Badge, Typography, Space, Button, Tooltip, Empty, Tabs, Tag } from 'antd';
import {
  DesktopOutlined,
  MobileOutlined,
  StarOutlined,
  StarFilled,
  MessageOutlined,
  ClockCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { ConnectedDevice, TransferSession } from '../../services/transferClient';
import { useSettings } from '../../contexts/SettingsContext';

const { Text } = Typography;

interface DeviceListViewProps {
  connectedDevices: ConnectedDevice[];
  sessions: TransferSession[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: (device: ConnectedDevice) => void;
  serverRunning: boolean;
}

export const DeviceListView: React.FC<DeviceListViewProps> = ({
  connectedDevices,
  sessions,
  selectedSessionId,
  onSelectSession,
  onCreateSession,
  serverRunning,
}) => {
  const { isDarkMode } = useSettings();
  const [activeTab, setActiveTab] = useState<'online' | 'history'>('online');

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;

    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // 获取设备图标
  const getDeviceIcon = (type: 'desktop' | 'android') => {
    return type === 'desktop' ? <DesktopOutlined /> : <MobileOutlined />;
  };

  // 按设备分组的会话
  const sessionsByDevice = useMemo(() => {
    const map = new Map<string, TransferSession[]>();
    sessions.forEach(session => {
      const existing = map.get(session.peer_device_id) || [];
      existing.push(session);
      map.set(session.peer_device_id, existing);
    });
    return map;
  }, [sessions]);

  // 渲染在线设备列表
  const renderOnlineDevices = () => {
    if (!serverRunning) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="服务未启动"
          style={{ marginTop: 48 }}
        />
      );
    }

    if (connectedDevices.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无在线设备"
          style={{ marginTop: 48 }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            等待其他设备扫码连接
          </Text>
        </Empty>
      );
    }

    return (
      <List
        dataSource={connectedDevices}
        renderItem={device => {
          // 查找与该设备的现有会话
          const deviceSessions = sessionsByDevice.get(device.id) || [];
          const activeSession = deviceSessions.find(s => !s.ended_at);

          return (
            <List.Item
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                background:
                  activeSession?.id === selectedSessionId
                    ? isDarkMode
                      ? '#177ddc20'
                      : '#e6f7ff'
                    : 'transparent',
                borderBottom: `1px solid ${isDarkMode ? '#303030' : '#f0f0f0'}`,
              }}
              onClick={() => {
                if (activeSession) {
                  onSelectSession(activeSession.id);
                } else {
                  onCreateSession(device);
                }
              }}
            >
              <List.Item.Meta
                avatar={
                  <Badge dot status="success" offset={[-4, 28]}>
                    <Avatar
                      icon={getDeviceIcon(device.type)}
                      style={{
                        background: device.type === 'desktop' ? '#1890ff' : '#52c41a',
                      }}
                    />
                  </Badge>
                }
                title={
                  <Space>
                    <Text strong>{device.name}</Text>
                    <Tag
                      color={device.type === 'desktop' ? 'blue' : 'green'}
                      style={{ fontSize: 10 }}
                    >
                      {device.type === 'desktop' ? '桌面' : '手机'}
                    </Tag>
                  </Space>
                }
                description={
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {device.ip}
                  </Text>
                }
              />
              <Tooltip title={activeSession ? '继续聊天' : '开始聊天'}>
                <Button type="text" icon={<MessageOutlined />} size="small" />
              </Tooltip>
            </List.Item>
          );
        }}
      />
    );
  };

  // 渲染历史会话列表
  const renderHistorySessions = () => {
    const endedSessions = sessions;

    if (endedSessions.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无历史记录"
          style={{ marginTop: 48 }}
        />
      );
    }

    return (
      <List
        dataSource={endedSessions}
        renderItem={session => (
          <List.Item
            style={{
              padding: '12px 16px',
              cursor: 'pointer',
              background:
                session.id === selectedSessionId
                  ? isDarkMode
                    ? '#177ddc20'
                    : '#e6f7ff'
                  : 'transparent',
              borderBottom: `1px solid ${isDarkMode ? '#303030' : '#f0f0f0'}`,
            }}
            onClick={() => onSelectSession(session.id)}
          >
            <List.Item.Meta
              avatar={<Avatar icon={<UserOutlined />} />}
              title={session.peer_device_name}
              description={
                <Space size={4}>
                  <ClockCircleOutlined style={{ fontSize: 10 }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatTime(session.started_at)}
                  </Text>
                  <Tag style={{ fontSize: 10, marginLeft: 4 }}>
                    {session.connection_type === 'lan' ? '局域网' : '中继'}
                  </Tag>
                </Space>
              }
            />
          </List.Item>
        )}
      />
    );
  };

  return (
    <div
      style={{
        height: 'calc(100% - 140px)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key as 'online' | 'history')}
        centered
        size="small"
        style={{ marginBottom: 0 }}
        items={[
          {
            key: 'online',
            label: (
              <Space size={4}>
                <Badge count={connectedDevices.length} size="small" offset={[8, 0]}>
                  <span>在线</span>
                </Badge>
              </Space>
            ),
          },
          {
            key: 'history',
            label: '历史',
          },
        ]}
      />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'online' ? renderOnlineDevices() : renderHistorySessions()}
      </div>
    </div>
  );
};

export default DeviceListView;
