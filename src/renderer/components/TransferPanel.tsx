/**
 * LAN Transfer Assistant - 传输面板主组件
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Layout,
  Button,
  Space,
  Typography,
  Badge,
  Tooltip,
  Spin,
  message,
  Modal,
} from 'antd';
import {
  WifiOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  PoweroffOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { transferClient, ServerStatus, ConnectedDevice, TransferSession } from '../services/transferClient';
import { DeviceListView, ChatView } from './transfer';
import { useSettings } from '../contexts/SettingsContext';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

interface TransferPanelProps {
  visible?: boolean;
}

export const TransferPanel: React.FC<TransferPanelProps> = ({ visible = true }) => {
  const { isDarkMode } = useSettings();
  
  // 服务器状态
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    running: false,
    port: null,
    ip: null,
    connectedDevices: 0,
    startedAt: null,
  });
  const [isStarting, setIsStarting] = useState(false);
  
  // 设备和会话
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const [sessions, setSessions] = useState<TransferSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  
  // 二维码
  const [qrData, setQrData] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  
  // 加载状态
  const [loading, setLoading] = useState(true);

  // 初始化
  useEffect(() => {
    if (!visible) return;
    
    const init = async () => {
      try {
        setLoading(true);
        
        // 获取服务器状态
        const status = await transferClient.getServerStatus();
        setServerStatus(status);
        
        if (status.running) {
          // 获取连接的设备
          const devices = await transferClient.getConnectedDevices();
          setConnectedDevices(devices);
          
          // 生成二维码
          const qr = await transferClient.generateQRData();
          if (qr) {
            setQrData(JSON.stringify(qr));
          }
        }
        
        // 获取历史会话
        const allSessions = await transferClient.getAllSessions();
        setSessions(allSessions);
      } catch (error) {
        console.error('Failed to initialize transfer panel:', error);
      } finally {
        setLoading(false);
      }
    };
    
    init();
  }, [visible]);

  // 事件监听
  useEffect(() => {
    if (!visible) return;
    
    const unsubDeviceConnected = transferClient.onDeviceConnected((device) => {
      setConnectedDevices(prev => [...prev.filter(d => d.id !== device.id), device]);
      message.success(`${device.name} 已连接`);
    });
    
    const unsubDeviceDisconnected = transferClient.onDeviceDisconnected((deviceId) => {
      setConnectedDevices(prev => prev.filter(d => d.id !== deviceId));
    });
    
    const unsubDeviceListUpdated = transferClient.onDeviceListUpdated((devices) => {
      setConnectedDevices(devices);
    });
    
    // 监听新消息并显示通知
    const unsubMessageReceived = transferClient.onMessageReceived((data: any) => {
      // 如果不是当前选中的会话，显示系统通知
      if (data.sessionId !== selectedSessionId) {
        const notificationApi = (window as any).electronAPI?.notification;
        if (notificationApi) {
          notificationApi.show({
            title: '新消息',
            body: data.message?.content || '收到新消息',
            tag: `transfer-message-${data.sessionId}`,
          });
        }
      }
    });
    
    // 监听文件传入并显示通知
    const unsubFileIncoming = transferClient.onFileIncoming((data: any) => {
      if (data.sessionId !== selectedSessionId) {
        const notificationApi = (window as any).electronAPI?.notification;
        if (notificationApi) {
          notificationApi.show({
            title: '收到文件',
            body: data.fileInfo?.filename || '收到新文件',
            tag: `transfer-file-${data.fileInfo?.id}`,
          });
        }
      }
    });
    
    return () => {
      unsubDeviceConnected();
      unsubDeviceDisconnected();
      unsubDeviceListUpdated();
      unsubMessageReceived();
      unsubFileIncoming();
    };
  }, [visible, selectedSessionId]);

  // 启动服务器
  const handleStartServer = useCallback(async () => {
    try {
      setIsStarting(true);
      const status = await transferClient.startServer();
      setServerStatus(status);
      
      // 生成二维码
      const qr = await transferClient.generateQRData();
      if (qr) {
        setQrData(JSON.stringify(qr));
      }
      
      message.success('传输服务已启动');
    } catch (error: any) {
      message.error(error.message || '启动服务失败');
    } finally {
      setIsStarting(false);
    }
  }, []);

  // 停止服务器
  const handleStopServer = useCallback(async () => {
    try {
      await transferClient.stopServer();
      setServerStatus({
        running: false,
        port: null,
        ip: null,
        connectedDevices: 0,
        startedAt: null,
      });
      setConnectedDevices([]);
      setQrData(null);
      message.info('传输服务已停止');
    } catch (error: any) {
      message.error(error.message || '停止服务失败');
    }
  }, []);

  // 刷新二维码
  const handleRefreshQR = useCallback(async () => {
    try {
      const qr = await transferClient.generateQRData();
      if (qr) {
        setQrData(JSON.stringify(qr));
        message.success('二维码已刷新');
      }
    } catch (error) {
      message.error('刷新二维码失败');
    }
  }, []);

  // 选择会话
  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
  }, []);

  // 创建新会话
  const handleCreateSession = useCallback(async (device: ConnectedDevice) => {
    try {
      const sessionId = transferClient.generateSessionId();
      const session: TransferSession = {
        id: sessionId,
        peer_device_id: device.id,
        peer_device_name: device.name,
        connection_type: 'lan',
        started_at: Date.now(),
        ended_at: null,
      };
      
      await transferClient.createSession(session);
      setSessions(prev => [session, ...prev]);
      setSelectedSessionId(sessionId);
      
      // 保存设备信息
      const existingDevice = await transferClient.getDevice(device.id);
      if (!existingDevice) {
        await transferClient.createDevice({
          id: device.id,
          name: device.name,
          type: device.type,
          last_ip: device.ip,
          last_port: null,
          last_seen: Date.now(),
          is_favorite: 0,
        });
      } else {
        await transferClient.updateDevice(device.id, {
          last_seen: Date.now(),
          last_ip: device.ip,
        });
      }
    } catch (error) {
      message.error('创建会话失败');
    }
  }, []);

  if (!visible) return null;

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100%',
        background: isDarkMode ? '#141414' : '#fafafa',
      }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  return (
    <Layout style={{ height: '100%', background: 'transparent' }}>
      {/* 左侧设备列表 */}
      <Sider
        width={280}
        style={{
          background: isDarkMode ? '#1f1f1f' : '#fff',
          borderRight: `1px solid ${isDarkMode ? '#303030' : '#f0f0f0'}`,
        }}
      >
        {/* 服务器状态头部 */}
        <div style={{ padding: '16px', borderBottom: `1px solid ${isDarkMode ? '#303030' : '#f0f0f0'}` }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Badge status={serverStatus.running ? 'success' : 'default'} />
                <Text strong>传输服务</Text>
              </Space>
              {serverStatus.running ? (
                <Tooltip title="停止服务">
                  <Button
                    type="text"
                    danger
                    icon={<PoweroffOutlined />}
                    onClick={handleStopServer}
                    size="small"
                  />
                </Tooltip>
              ) : (
                <Button
                  type="primary"
                  size="small"
                  loading={isStarting}
                  onClick={handleStartServer}
                >
                  启动
                </Button>
              )}
            </div>
            
            {serverStatus.running && (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <WifiOutlined /> {serverStatus.ip}:{serverStatus.port}
                </Text>
                <Space>
                  <Button
                    size="small"
                    icon={<QrcodeOutlined />}
                    onClick={() => setShowQRModal(true)}
                  >
                    显示二维码
                  </Button>
                  <Tooltip title="刷新二维码">
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={handleRefreshQR}
                    />
                  </Tooltip>
                </Space>
              </>
            )}
          </Space>
        </div>

        {/* 设备列表 */}
        <DeviceListView
          connectedDevices={connectedDevices}
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSelectSession={handleSelectSession}
          onCreateSession={handleCreateSession}
          serverRunning={serverStatus.running}
        />
      </Sider>

      {/* 右侧聊天区域 */}
      <Content style={{ background: isDarkMode ? '#141414' : '#fafafa' }}>
        {selectedSession ? (
          <ChatView
            session={selectedSession}
            onClose={() => setSelectedSessionId(null)}
          />
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            padding: 24,
          }}>
            {serverStatus.running ? (
              <>
                <MessageOutlined style={{ fontSize: 64, color: isDarkMode ? '#434343' : '#d9d9d9', marginBottom: 16 }} />
                <Title level={4} type="secondary">选择设备开始传输</Title>
                <Text type="secondary">
                  {connectedDevices.length > 0
                    ? `当前有 ${connectedDevices.length} 个设备在线`
                    : '等待设备连接...'}
                </Text>
                {qrData && (
                  <div style={{ marginTop: 24 }}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8, textAlign: 'center' }}>
                      使用手机扫描二维码连接
                    </Text>
                    <div style={{
                      padding: 16,
                      background: '#fff',
                      borderRadius: 8,
                      display: 'inline-block',
                    }}>
                      <QRCodeSVG value={qrData} size={160} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <WifiOutlined style={{ fontSize: 64, color: isDarkMode ? '#434343' : '#d9d9d9', marginBottom: 16 }} />
                <Title level={4} type="secondary">传输服务未启动</Title>
                <Text type="secondary" style={{ marginBottom: 16 }}>
                  启动服务后，其他设备可以通过扫描二维码连接
                </Text>
                <Button
                  type="primary"
                  size="large"
                  loading={isStarting}
                  onClick={handleStartServer}
                >
                  启动传输服务
                </Button>
              </>
            )}
          </div>
        )}
      </Content>

      {/* 二维码弹窗 */}
      <Modal
        title="扫描二维码连接"
        open={showQRModal}
        onCancel={() => setShowQRModal(false)}
        footer={[
          <Button key="refresh" icon={<ReloadOutlined />} onClick={handleRefreshQR}>
            刷新二维码
          </Button>,
          <Button key="close" type="primary" onClick={() => setShowQRModal(false)}>
            关闭
          </Button>,
        ]}
        centered
      >
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          {qrData ? (
            <>
              <div style={{
                padding: 24,
                background: '#fff',
                borderRadius: 8,
                display: 'inline-block',
                marginBottom: 16,
              }}>
                <QRCodeSVG value={qrData} size={200} />
              </div>
              <div>
                <Text type="secondary">
                  使用暮城笔记 App 扫描此二维码
                </Text>
              </div>
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  服务地址: {serverStatus.ip}:{serverStatus.port}
                </Text>
              </div>
            </>
          ) : (
            <Spin tip="生成二维码中..." />
          )}
        </div>
      </Modal>
    </Layout>
  );
};

export default TransferPanel;
