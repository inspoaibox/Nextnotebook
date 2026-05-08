/**
 * LAN Transfer Assistant - 传输面板主组件
 * 
 * 支持两种独立模式：
 * 1. 局域网模式：启动本地服务器，手机扫码连接
 * 2. 中继模式：连接到云端中继服务器，支持跨网络传输
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
  Tabs,
  Input,
  Form,
  Card,
  Alert,
} from 'antd';
import {
  WifiOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  PoweroffOutlined,
  MessageOutlined,
  CloudOutlined,
  DisconnectOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { transferClient, ServerStatus, ConnectedDevice, TransferSession } from '../services/transferClient';
import { DeviceListView, ChatView } from './transfer';
import { useSettings } from '../contexts/SettingsContext';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

// 连接模式
type ConnectionMode = 'lan' | 'relay';

// 中继状态
interface RelayStatus {
  connected: boolean;
  serverUrl: string | null;
  connecting: boolean;
  error: string | null;
}

interface TransferPanelProps {
  visible?: boolean;
}

export const TransferPanel: React.FC<TransferPanelProps> = ({ visible = true }) => {
  const { isDarkMode, syncConfig } = useSettings();

  // 当前模式
  const [activeMode, setActiveMode] = useState<ConnectionMode>('lan');

  // 局域网模式状态
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    running: false,
    port: null,
    ip: null,
    connectedDevices: 0,
    startedAt: null,
  });
  const [isStarting, setIsStarting] = useState(false);

  // 中继模式状态
  const [relayStatus, setRelayStatus] = useState<RelayStatus>({
    connected: false,
    serverUrl: null,
    connecting: false,
    error: null,
  });
  const [relayServerUrl, setRelayServerUrl] = useState('');
  const [relayKey, setRelayKey] = useState('');

  // 设备列表
  const [lanDevices, setLanDevices] = useState<ConnectedDevice[]>([]);
  const [relayDevices, setRelayDevices] = useState<ConnectedDevice[]>([]);

  // 会话
  const [sessions, setSessions] = useState<TransferSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // 二维码
  const [qrData, setQrData] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);

  // 加载状态
  const [loading, setLoading] = useState(true);

  // 初始化 - 从同步配置中加载中继服务器信息
  useEffect(() => {
    if (syncConfig?.url && syncConfig.type === 'server') {
      // 自动填充同步服务器作为中继服务器
      if (!relayServerUrl) {
        setRelayServerUrl(syncConfig.url);
      }
    }
  }, [syncConfig]);

  // 初始化
  useEffect(() => {
    if (!visible) return;

    const init = async () => {
      try {
        setLoading(true);
        console.log('[TransferPanel] Initializing...');

        // 1. 获取局域网服务器状态
        const status = await transferClient.getServerStatus();
        console.log('[TransferPanel] Server status:', status);
        setServerStatus(status);

        if (status.running) {
          // 获取连接的设备
          const devices = await transferClient.getConnectedDevices();
          console.log('[TransferPanel] LAN devices:', devices);
          setLanDevices(devices);

          // 生成二维码
          const qr = await transferClient.generateQRData();
          if (qr) {
            setQrData(JSON.stringify(qr));
          }
        }

        // 2. 获取中继状态
        const transferApi = (window as any).electronAPI?.transfer;
        if (transferApi?.relay) {
          const rStatus = await transferApi.relay.getStatus();
          setRelayStatus(prev => ({
            ...prev,
            connected: rStatus.connected,
            serverUrl: rStatus.serverUrl
          }));

          if (rStatus.connected) {
            // 获取中继设备列表
            try {
              const rDevices = await transferApi.relay.getConnectedDevices();
              console.log('[TransferPanel] Relay devices:', rDevices);
              setRelayDevices(rDevices || []);
            } catch (e) {
              console.warn('Failed to fetch relay devices:', e);
            }
          }
        }

        // 3. 获取历史会话
        const allSessions = await transferClient.getAllSessions();
        console.log('[TransferPanel] Sessions:', allSessions.length);
        setSessions(allSessions);
      } catch (error) {
        console.error('[TransferPanel] Failed to initialize:', error);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [visible]);

  // 事件监听
  useEffect(() => {
    if (!visible) return;

    console.log('[TransferPanel] Setting up event listeners...');

    // ======== LAN 事件 ========
    const unsubLanDeviceConnected = transferClient.onDeviceConnected((device) => {
      console.log('[TransferPanel] LAN Device connected:', device);
      setLanDevices(prev => [...prev.filter(d => d.id !== device.id), device]);
      setServerStatus(prev => ({ ...prev, connectedDevices: prev.connectedDevices + 1 }));
      message.success(`${device.name} (局域网) 已连接`);
    });

    const unsubLanDeviceDisconnected = transferClient.onDeviceDisconnected((deviceId) => {
      console.log('[TransferPanel] LAN Device disconnected:', deviceId);
      setLanDevices(prev => prev.filter(d => d.id !== deviceId));
      setServerStatus(prev => ({ ...prev, connectedDevices: Math.max(0, prev.connectedDevices - 1) }));
    });

    const unsubLanDeviceListUpdated = transferClient.onDeviceListUpdated((devices) => {
      console.log('[TransferPanel] LAN Device list updated:', devices);
      setLanDevices(devices);
      setServerStatus(prev => ({ ...prev, connectedDevices: devices.length }));
    });

    // 监听会话创建事件（设备连接时自动创建的会话）
    const unsubSessionCreated = transferClient.onSessionCreated(async (data: any) => {
      console.log('[TransferPanel] Session created:', data);
      const { sessionId, peerDeviceId, peerDeviceName } = data;
      
      // 重新加载会话列表
      try {
        const allSessions = await transferClient.getAllSessions();
        setSessions(allSessions);
        
        // 自动选中新会话
        const newSession = allSessions.find(s => s.id === sessionId);
        if (newSession) {
          setSelectedSessionId(sessionId);
          console.log('[TransferPanel] Auto-selected new session from device connect:', sessionId);
        }
      } catch (error) {
        console.error('[TransferPanel] Failed to reload sessions after session created:', error);
      }
    });

    // ======== Relay 事件 ========
    const transferApi = (window as any).electronAPI?.transfer;
    let unsubRelayDeviceList = () => { };
    let unsubRelayConnected = () => { };
    let unsubRelayDisconnected = () => { };
    let unsubRelayMessageReceived = () => { };
    let unsubRelayFileIncoming = () => { };
    let unsubRelayFileComplete = () => { };

    if (transferApi?.relay) {
      unsubRelayDeviceList = transferApi.relay.onDeviceList((devices: any[]) => {
        console.log('[TransferPanel] Relay device list updated:', devices);
        setRelayDevices(devices as ConnectedDevice[]); // Cast to ConnectedDevice
      });

      unsubRelayConnected = transferApi.relay.onConnected(() => {
        setRelayStatus(prev => ({ ...prev, connected: true, connecting: false, error: null }));
      });

      unsubRelayDisconnected = transferApi.relay.onDisconnected(() => {
        setRelayStatus(prev => ({ ...prev, connected: false, connecting: false }));
        setRelayDevices([]);
      });

      // 监听中继消息
      unsubRelayMessageReceived = transferApi.relay.onMessageReceived((data: any) => {
        console.log('[TransferPanel] Relay message received:', data);
        // 触发 ChatView 刷新（通过自定义事件）
        window.dispatchEvent(new CustomEvent('transfer:refresh-messages', {
          detail: { sessionId: data.sessionId }
        }));

        // 如果不是当前会话，显示通知
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

      // 监听中继文件传入
      unsubRelayFileIncoming = transferApi.relay.onFileIncoming((data: any) => {
        console.log('[TransferPanel] Relay file incoming:', data);
        const notificationApi = (window as any).electronAPI?.notification;
        if (notificationApi) {
          notificationApi.show({
            title: '收到文件',
            body: data.fileInfo?.filename || '收到新文件',
            tag: `transfer-file-${data.fileInfo?.id}`,
          });
        }
      });

      // 监听中继文件完成
      unsubRelayFileComplete = transferApi.relay.onFileComplete((data: any) => {
        console.log('[TransferPanel] Relay file complete:', data);
        // 刷新文件列表（如果需要）
        message.success(`文件 ${data.filename || '传输'} 已完成`);
      });

      const unsubRelayPairSuccess = transferApi.relay.onPairSuccess?.(async (data: any) => {
        console.log('[TransferPanel] Relay pair success:', data);
        try {
          const allSessions = await transferClient.getAllSessions();
          setSessions(allSessions);
          setSelectedSessionId(data.sessionId);
        } catch (error) {
          console.error('[TransferPanel] Failed to reload sessions after relay pairing:', error);
        }
      }) || (() => { });

      const originalCleanup = unsubRelayFileComplete;
      unsubRelayFileComplete = () => {
        originalCleanup();
        unsubRelayPairSuccess();
      };
    }

    // ======== 通用消息事件 (LAN) ========
    // 监听新消息并显示通知
    const unsubMessageReceived = transferClient.onMessageReceived(async (data: any) => {
      console.log('[TransferPanel] LAN message received:', data);
      
      // 使用 main.ts 返回的桌面端会话 ID
      const desktopSessionId = data.desktopSessionId;
      
      // 查找会话
      let targetSession = sessions.find(s => s.id === desktopSessionId || s.peer_device_id === data.senderId);
      
      if (!targetSession && desktopSessionId) {
        // main.ts 已经创建了会话，从数据库重新加载会话列表
        console.log('[TransferPanel] Reloading sessions after new session created by main process');
        try {
          const allSessions = await transferClient.getAllSessions();
          setSessions(allSessions);
          targetSession = allSessions.find(s => s.id === desktopSessionId);
          
          // 自动选中新会话
          if (targetSession) {
            setSelectedSessionId(desktopSessionId);
            console.log('[TransferPanel] Auto-selected new session:', desktopSessionId);
          }
        } catch (error) {
          console.error('[TransferPanel] Failed to reload sessions:', error);
        }
      }
      
      if (!targetSession) {
        // 如果还是没有会话，尝试手动创建
        console.log('[TransferPanel] Creating new session for device:', data.senderId);
        
        // 先从本地状态查找设备，如果没有则从服务器获取最新设备列表
        let device = lanDevices.find(d => d.id === data.senderId);
        
        if (!device) {
          // 从服务器获取最新的设备列表
          try {
            const connectedDevices = await transferClient.getConnectedDevices();
            device = connectedDevices.find(d => d.id === data.senderId);
            // 更新本地状态
            if (connectedDevices.length > 0) {
              setLanDevices(connectedDevices);
            }
          } catch (e) {
            console.warn('[TransferPanel] Failed to fetch connected devices:', e);
          }
        }
        
        if (device) {
          try {
            // 先保存设备信息
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
            }

            // 创建会话
            const sessionId = transferClient.generateSessionId();
            const newSession: TransferSession = {
              id: sessionId,
              peer_device_id: device.id,
              peer_device_name: device.name,
              connection_type: 'lan',
              started_at: Date.now(),
              ended_at: null,
            };

            await transferClient.createSession(newSession);
            setSessions(prev => [newSession, ...prev]);
            targetSession = newSession;
            
            // 自动选中新会话
            setSelectedSessionId(sessionId);
            
            console.log('[TransferPanel] New session created:', sessionId);
          } catch (error) {
            console.error('[TransferPanel] Failed to create session:', error);
          }
        } else {
          console.warn('[TransferPanel] Device not found for senderId:', data.senderId);
        }
      }
      
      // 如果不是当前选中的会话，显示系统通知
      if (targetSession && targetSession.id !== selectedSessionId) {
        const notificationApi = (window as any).electronAPI?.notification;
        if (notificationApi) {
          notificationApi.show({
            title: `来自 ${targetSession.peer_device_name} 的消息`,
            body: data.message?.content || '收到新消息',
            tag: `transfer-message-${targetSession.id}`,
          });
        }
      }
    });

    const unsubFileIncoming = transferClient.onFileIncoming(async (data: any) => {
      console.log('[TransferPanel] LAN file incoming:', data);
      
      // 使用 main.ts 返回的桌面端会话 ID
      const desktopSessionId = data.desktopSessionId;
      
      // 查找会话
      let targetSession = sessions.find(s => s.id === desktopSessionId || s.peer_device_id === data.senderId);
      
      if (!targetSession && desktopSessionId) {
        // main.ts 已经创建了会话，从数据库重新加载会话列表
        console.log('[TransferPanel] Reloading sessions after new session created for file');
        try {
          const allSessions = await transferClient.getAllSessions();
          setSessions(allSessions);
          targetSession = allSessions.find(s => s.id === desktopSessionId);
          
          // 自动选中新会话
          if (targetSession) {
            setSelectedSessionId(desktopSessionId);
            console.log('[TransferPanel] Auto-selected new session for file:', desktopSessionId);
          }
        } catch (error) {
          console.error('[TransferPanel] Failed to reload sessions:', error);
        }
      }
      
      if (!targetSession) {
        // 如果还是没有会话，尝试手动创建
        console.log('[TransferPanel] Creating new session for file from device:', data.senderId);
        
        // 先从本地状态查找设备，如果没有则从服务器获取最新设备列表
        let device = lanDevices.find(d => d.id === data.senderId);
        
        if (!device) {
          // 从服务器获取最新的设备列表
          try {
            const connectedDevices = await transferClient.getConnectedDevices();
            device = connectedDevices.find(d => d.id === data.senderId);
            // 更新本地状态
            if (connectedDevices.length > 0) {
              setLanDevices(connectedDevices);
            }
          } catch (e) {
            console.warn('[TransferPanel] Failed to fetch connected devices:', e);
          }
        }
        
        if (device) {
          try {
            // 先保存设备信息
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
            }

            // 创建会话
            const sessionId = transferClient.generateSessionId();
            const newSession: TransferSession = {
              id: sessionId,
              peer_device_id: device.id,
              peer_device_name: device.name,
              connection_type: 'lan',
              started_at: Date.now(),
              ended_at: null,
            };

            await transferClient.createSession(newSession);
            setSessions(prev => [newSession, ...prev]);
            targetSession = newSession;
            
            // 自动选中新会话
            setSelectedSessionId(sessionId);
            
            console.log('[TransferPanel] New session created for file:', sessionId);
          } catch (error) {
            console.error('[TransferPanel] Failed to create session:', error);
          }
        } else {
          console.warn('[TransferPanel] Device not found for file senderId:', data.senderId);
        }
      }
      
      if (targetSession && targetSession.id !== selectedSessionId) {
        const notificationApi = (window as any).electronAPI?.notification;
        if (notificationApi) {
          notificationApi.show({
            title: `来自 ${targetSession.peer_device_name} 的文件`,
            body: data.fileInfo?.filename || '收到新文件',
            tag: `transfer-file-${data.fileInfo?.id}`,
          });
        }
      }
    });

    return () => {
      unsubLanDeviceConnected();
      unsubLanDeviceDisconnected();
      unsubLanDeviceListUpdated();
      unsubSessionCreated();
      unsubRelayDeviceList();
      unsubRelayConnected();
      unsubRelayDisconnected();
      unsubRelayMessageReceived();
      unsubRelayFileIncoming();
      unsubRelayFileComplete();
      unsubMessageReceived();
      unsubFileIncoming();
    };
  }, [visible, selectedSessionId, sessions, lanDevices]);

  // ============================================
  // 局域网模式操作
  // ============================================

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
      setLanDevices([]);
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

  // ============================================
  // 中继模式操作
  // ============================================

  // 连接中继服务器
  const handleConnectRelay = useCallback(async () => {
    if (!relayServerUrl || !relayKey) {
      message.warning('请输入服务器地址和中继密钥');
      return;
    }

    try {
      setRelayStatus(prev => ({ ...prev, connecting: true, error: null }));

      const transferApi = (window as any).electronAPI?.transfer;
      if (!transferApi?.relay) {
        throw new Error('中继功能不可用');
      }

      await transferApi.relay.connect(relayServerUrl, relayKey);

      setRelayStatus({
        connected: true,
        serverUrl: relayServerUrl,
        connecting: false,
        error: null,
      });

      message.success('已连接到中继服务器');
    } catch (error: any) {
      setRelayStatus(prev => ({
        ...prev,
        connecting: false,
        error: error.message || '连接失败',
      }));
      message.error(error.message || '连接中继服务器失败');
    }
  }, [relayServerUrl, relayKey]);

  // 断开中继服务器
  const handleDisconnectRelay = useCallback(async () => {
    try {
      const transferApi = (window as any).electronAPI?.transfer;
      if (transferApi?.relay) {
        await transferApi.relay.disconnect();
      }

      setRelayStatus({
        connected: false,
        serverUrl: null,
        connecting: false,
        error: null,
      });
      setRelayDevices([]);

      message.info('已断开中继连接');
    } catch (error: any) {
      message.error(error.message || '断开连接失败');
    }
  }, []);

  // ============================================
  // 共用操作
  // ============================================

  // 选择会话
  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
  }, []);

  // 创建新会话
  const handleCreateSession = useCallback(async (device: ConnectedDevice) => {
    try {
      if (activeMode === 'relay') {
        const transferApi = (window as any).electronAPI?.transfer;
        if (!transferApi?.relay?.sendPairRequest) {
          throw new Error('中继配对功能不可用');
        }
        await transferApi.relay.sendPairRequest(device.id);
        message.loading({ content: `正在与 ${device.name} 建立中继会话...`, key: 'relay-pair' });
        return;
      }

      // 先保存设备信息
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

      // 然后创建会话
      const sessionId = transferClient.generateSessionId();
      const session: TransferSession = {
        id: sessionId,
        peer_device_id: device.id,
        peer_device_name: device.name,
        connection_type: activeMode,
        started_at: Date.now(),
        ended_at: null,
      };

      await transferClient.createSession(session);
      setSessions(prev => [session, ...prev]);
      setSelectedSessionId(sessionId);
    } catch (error) {
      console.error('创建会话失败:', error);
      message.error('创建会话失败');
    }
  }, [activeMode]);

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

  // 获取当前模式是否已连接
  const isConnected = activeMode === 'lan' ? serverStatus.running : relayStatus.connected;

  // 获取当前模式的设备列表
  const currentModeDevices = activeMode === 'lan' ? lanDevices : relayDevices;

  return (
    <Layout style={{ height: '100%', background: 'transparent' }}>
      {/* 左侧面板 */}
      <Sider
        width={320}
        style={{
          background: isDarkMode ? '#1f1f1f' : '#fff',
          borderRight: `1px solid ${isDarkMode ? '#303030' : '#f0f0f0'}`,
        }}
      >
        {/* 模式切换 Tabs */}
        <Tabs
          activeKey={activeMode}
          onChange={(key) => setActiveMode(key as ConnectionMode)}
          centered
          style={{ height: '100%' }}
          items={[
            {
              key: 'lan',
              label: (
                <span>
                  <WifiOutlined /> 局域网
                </span>
              ),
              children: (
                <div style={{ height: 'calc(100vh - 150px)', overflow: 'auto' }}>
                  {/* 局域网模式内容 */}
                  <div style={{ padding: '16px' }}>
                    {/* 服务器状态 */}
                    <Card size="small" style={{ marginBottom: 16 }}>
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
                    </Card>

                    {/* 二维码预览 */}
                    {serverStatus.running && qrData && (
                      <Card size="small" style={{ marginBottom: 16, textAlign: 'center' }}>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                          手机扫码连接
                        </Text>
                        <div style={{
                          padding: 12,
                          background: '#fff',
                          borderRadius: 8,
                          display: 'inline-block',
                        }}>
                          <QRCodeSVG value={qrData} size={140} />
                        </div>
                      </Card>
                    )}
                  </div>

                  {/* 局域网设备列表 */}
                  <DeviceListView
                    connectedDevices={lanDevices}
                    sessions={sessions.filter(s => s.connection_type !== 'relay')}
                    selectedSessionId={selectedSessionId}
                    onSelectSession={handleSelectSession}
                    onCreateSession={handleCreateSession}
                    serverRunning={serverStatus.running}
                  />
                </div>
              ),
            },
            {
              key: 'relay',
              label: (
                <span>
                  <CloudOutlined /> 中继
                </span>
              ),
              children: (
                <div style={{ height: 'calc(100vh - 150px)', overflow: 'auto' }}>
                  {/* 中继模式内容 */}
                  <div style={{ padding: '16px' }}>
                    {/* 连接状态 */}
                    <Card size="small" style={{ marginBottom: 16 }}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Space>
                            <Badge status={relayStatus.connected ? 'success' : 'default'} />
                            <Text strong>中继服务器</Text>
                          </Space>
                          {relayStatus.connected && (
                            <Tooltip title="断开连接">
                              <Button
                                type="text"
                                danger
                                icon={<DisconnectOutlined />}
                                onClick={handleDisconnectRelay}
                                size="small"
                              />
                            </Tooltip>
                          )}
                        </div>

                        {relayStatus.connected && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            <LinkOutlined /> {relayStatus.serverUrl}
                          </Text>
                        )}
                      </Space>
                    </Card>

                    {/* 连接表单 */}
                    {!relayStatus.connected && (
                      <Card size="small" style={{ marginBottom: 16 }}>
                        <Form layout="vertical" size="small">
                          <Form.Item label="服务器地址" style={{ marginBottom: 12 }}>
                            <Input
                              placeholder="https://your-sync-server.com"
                              value={relayServerUrl}
                              onChange={(e) => setRelayServerUrl(e.target.value)}
                            />
                          </Form.Item>
                          <Form.Item label="中继密钥" style={{ marginBottom: 12 }}>
                            <Input.Password
                              placeholder="输入中继服务器配置的密钥"
                              value={relayKey}
                              onChange={(e) => setRelayKey(e.target.value)}
                            />
                          </Form.Item>
                          <Button
                            type="primary"
                            block
                            loading={relayStatus.connecting}
                            onClick={handleConnectRelay}
                            icon={<CloudOutlined />}
                          >
                            连接中继服务器
                          </Button>
                        </Form>

                        {relayStatus.error && (
                          <Alert
                            message={relayStatus.error}
                            type="error"
                            showIcon
                            style={{ marginTop: 12 }}
                          />
                        )}

                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
                          💡 提示：中继模式允许跨局域网传输，需要配置好同步服务器的中继功能。
                        </Text>
                      </Card>
                    )}
                  </div>

                  {/* 中继设备列表 */}
                  <DeviceListView
                    connectedDevices={relayDevices}
                    sessions={sessions.filter(s => s.connection_type === 'relay')}
                    selectedSessionId={selectedSessionId}
                    onSelectSession={handleSelectSession}
                    onCreateSession={handleCreateSession}
                    serverRunning={relayStatus.connected}
                  />
                </div>
              ),
            },
          ]}
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
            {isConnected ? (
              <>
                <MessageOutlined style={{ fontSize: 64, color: isDarkMode ? '#434343' : '#d9d9d9', marginBottom: 16 }} />
                <Title level={4} type="secondary">选择设备开始传输</Title>
                <Text type="secondary">
                  {currentModeDevices.length > 0
                    ? `当前有 ${currentModeDevices.length} 个设备在线`
                    : '等待设备连接...'}
                </Text>
              </>
            ) : (
              <>
                {activeMode === 'lan' ? (
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
                ) : (
                  <>
                    <CloudOutlined style={{ fontSize: 64, color: isDarkMode ? '#434343' : '#d9d9d9', marginBottom: 16 }} />
                    <Title level={4} type="secondary">未连接中继服务器</Title>
                    <Text type="secondary" style={{ marginBottom: 16 }}>
                      连接中继服务器后，可与不同网络的设备进行传输
                    </Text>
                  </>
                )}
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
