/**
 * LAN Transfer Assistant - 聊天视图组件
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layout,
  Input,
  Button,
  Space,
  Typography,
  Avatar,
  Upload,
  Progress,
  Tooltip,
  message,
  Spin,
} from 'antd';
import {
  SendOutlined,
  PaperClipOutlined,
  FileOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileZipOutlined,
  CloseOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  UserOutlined,
  DesktopOutlined,
} from '@ant-design/icons';
import { transferClient, TransferSession, TransferMessage, TransferFile } from '../../services/transferClient';
import { useSettings } from '../../contexts/SettingsContext';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;
const { TextArea } = Input;

interface ChatViewProps {
  session: TransferSession;
  onClose: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({ session, onClose }) => {
  const { isDarkMode } = useSettings();
  const [messages, setMessages] = useState<TransferMessage[]>([]);
  const [files, setFiles] = useState<TransferFile[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 加载消息和文件
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [msgs, fls] = await Promise.all([
          transferClient.getMessagesBySession(session.id),
          transferClient.getFilesBySession(session.id),
        ]);
        setMessages(msgs);
        setFiles(fls);

        // 标记消息为已读
        await transferClient.markSessionMessagesAsRead(session.id);
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [session.id]);

  // 监听新消息
  useEffect(() => {
    const unsubMessage = transferClient.onMessageReceived((data) => {
      if (data.sessionId === session.id) {
        const newMessage: TransferMessage = {
          id: transferClient.generateMessageId(),
          session_id: session.id,
          direction: 'received',
          type: data.message.type || 'text',
          content: data.message.content,
          file_id: data.message.fileId || null,
          created_at: Date.now(),
          read_at: Date.now(),
        };
        setMessages(prev => [...prev, newMessage]);

        // 保存到数据库
        transferClient.createMessage(newMessage);
      }
    });

    const unsubFileIncoming = transferClient.onFileIncoming((data) => {
      if (data.sessionId === session.id) {
        const newFile: TransferFile = {
          id: data.fileInfo.id,
          session_id: session.id,
          filename: data.fileInfo.filename,
          file_size: data.fileInfo.fileSize,
          mime_type: data.fileInfo.mimeType,
          local_path: null,
          direction: 'received',
          status: 'pending',
          progress: 0,
          file_hash: null,
          created_at: Date.now(),
          completed_at: null,
        };
        setFiles(prev => [...prev, newFile]);
        transferClient.createFileTransfer(newFile);
      }
    });

    const unsubFileChunk = transferClient.onFileChunk((data) => {
      setFiles(prev => prev.map(f =>
        f.id === data.fileId
          ? { ...f, progress: (data.chunkIndex / data.totalChunks) * 100, status: 'transferring' }
          : f
      ));
    });

    const unsubFileComplete = transferClient.onFileComplete((data) => {
      setFiles(prev => prev.map(f =>
        f.id === data.fileId
          ? { ...f, progress: 100, status: 'completed', completed_at: Date.now() }
          : f
      ));
    });

    // 监听来自中继模式的消息刷新事件
    const handleRelayRefresh = async (event: Event) => {
      const customEvent = event as CustomEvent<{ sessionId: string }>;
      if (customEvent.detail.sessionId === session.id) {
        // 重新加载消息
        try {
          const msgs = await transferClient.getMessagesBySession(session.id);
          setMessages(msgs);
        } catch (error) {
          console.error('Failed to refresh messages:', error);
        }
      }
    };
    window.addEventListener('transfer:refresh-messages', handleRelayRefresh);

    return () => {
      unsubMessage();
      unsubFileIncoming();
      unsubFileChunk();
      unsubFileComplete();
      window.removeEventListener('transfer:refresh-messages', handleRelayRefresh);
    };
  }, [session.id]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, files]);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!inputValue.trim()) return;

    try {
      setSending(true);

      const newMessage: TransferMessage = {
        id: transferClient.generateMessageId(),
        session_id: session.id,
        direction: 'sent',
        type: 'text',
        content: inputValue.trim(),
        file_id: null,
        created_at: Date.now(),
        read_at: null,
      };

      // 先添加到本地
      setMessages(prev => [...prev, newMessage]);
      setInputValue('');

      // 保存到数据库
      await transferClient.createMessage(newMessage);

      // 通过 Socket.IO 发送到对方
      await transferClient.sendTextMessage(
        session.peer_device_id,
        session.id,
        newMessage.content
      );

    } catch (error) {
      message.error('发送失败');
    } finally {
      setSending(false);
    }
  }, [inputValue, session.id, session.peer_device_id]);

  // 处理按键
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 获取文件图标
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <FileImageOutlined />;
    if (mimeType === 'application/pdf') return <FilePdfOutlined />;
    if (mimeType.includes('zip') || mimeType.includes('rar')) return <FileZipOutlined />;
    return <FileOutlined />;
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  // 渲染消息项
  const renderMessageItem = (msg: TransferMessage) => {
    const isSent = msg.direction === 'sent';

    return (
      <div
        key={msg.id}
        style={{
          display: 'flex',
          justifyContent: isSent ? 'flex-end' : 'flex-start',
          marginBottom: 12,
          padding: '0 16px',
        }}
      >
        {!isSent && (
          <Avatar
            size="small"
            icon={<UserOutlined />}
            style={{ marginRight: 8, flexShrink: 0 }}
          />
        )}
        <div
          style={{
            maxWidth: '70%',
            padding: '8px 12px',
            borderRadius: isSent ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
            background: isSent
              ? '#1890ff'
              : (isDarkMode ? '#303030' : '#f0f0f0'),
            color: isSent ? '#fff' : undefined,
          }}
        >
          <Text style={{ color: isSent ? '#fff' : undefined, whiteSpace: 'pre-wrap' }}>
            {msg.content}
          </Text>
          <div style={{ textAlign: 'right', marginTop: 4 }}>
            <Text
              style={{
                fontSize: 10,
                color: isSent ? 'rgba(255,255,255,0.7)' : undefined,
              }}
              type={isSent ? undefined : 'secondary'}
            >
              {formatTime(msg.created_at)}
              {isSent && msg.read_at && (
                <CheckCircleOutlined style={{ marginLeft: 4 }} />
              )}
            </Text>
          </div>
        </div>
        {isSent && (
          <Avatar
            size="small"
            icon={<DesktopOutlined />}
            style={{ marginLeft: 8, flexShrink: 0, background: '#1890ff' }}
          />
        )}
      </div>
    );
  };

  // 渲染文件项
  const renderFileItem = (file: TransferFile) => {
    const isSent = file.direction === 'sent';

    return (
      <div
        key={file.id}
        style={{
          display: 'flex',
          justifyContent: isSent ? 'flex-end' : 'flex-start',
          marginBottom: 12,
          padding: '0 16px',
        }}
      >
        {!isSent && (
          <Avatar
            size="small"
            icon={<UserOutlined />}
            style={{ marginRight: 8, flexShrink: 0 }}
          />
        )}
        <div
          style={{
            maxWidth: '70%',
            padding: '12px',
            borderRadius: 8,
            background: isDarkMode ? '#303030' : '#f5f5f5',
            border: `1px solid ${isDarkMode ? '#434343' : '#e8e8e8'}`,
          }}
        >
          <Space>
            <Avatar
              shape="square"
              size={40}
              icon={getFileIcon(file.mime_type)}
              style={{ background: '#1890ff' }}
            />
            <div>
              <Text strong ellipsis style={{ maxWidth: 150, display: 'block' }}>
                {file.filename}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {transferClient.formatFileSize(file.file_size)}
              </Text>
            </div>
          </Space>

          {file.status === 'transferring' && (
            <Progress
              percent={Math.round(file.progress)}
              size="small"
              style={{ marginTop: 8 }}
            />
          )}

          {file.status === 'completed' && file.direction === 'received' && (
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              style={{ marginTop: 4, padding: 0 }}
            >
              打开文件
            </Button>
          )}

          {file.status === 'pending' && file.direction === 'received' && (
            <Button
              type="primary"
              size="small"
              style={{ marginTop: 8 }}
            >
              接收文件
            </Button>
          )}

          <div style={{ textAlign: 'right', marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 10 }}>
              {formatTime(file.created_at)}
            </Text>
          </div>
        </div>
        {isSent && (
          <Avatar
            size="small"
            icon={<DesktopOutlined />}
            style={{ marginLeft: 8, flexShrink: 0, background: '#1890ff' }}
          />
        )}
      </div>
    );
  };

  // 合并消息和文件并按时间排序
  const allItems = [...messages, ...files].sort((a, b) => a.created_at - b.created_at);

  return (
    <Layout style={{ height: '100%', background: 'transparent' }}>
      {/* 头部 */}
      <Header
        style={{
          background: isDarkMode ? '#1f1f1f' : '#fff',
          padding: '0 16px',
          height: 56,
          lineHeight: '56px',
          borderBottom: `1px solid ${isDarkMode ? '#303030' : '#f0f0f0'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Space>
          <Avatar icon={<UserOutlined />} />
          <div>
            <Text strong>{session.peer_device_name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {session.connection_type === 'lan' ? '局域网连接' : '中继连接'}
            </Text>
          </div>
        </Space>
        <Tooltip title="关闭">
          <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
        </Tooltip>
      </Header>

      {/* 消息列表 */}
      <Content
        style={{
          overflow: 'auto',
          padding: '16px 0',
          background: isDarkMode ? '#141414' : '#fafafa',
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin tip="加载消息中..." />
          </div>
        ) : allItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Text type="secondary">暂无消息，发送第一条消息吧</Text>
          </div>
        ) : (
          <>
            {allItems.map(item =>
              'content' in item
                ? renderMessageItem(item as TransferMessage)
                : renderFileItem(item as TransferFile)
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </Content>

      {/* 输入区域 */}
      <Footer
        style={{
          background: isDarkMode ? '#1f1f1f' : '#fff',
          padding: '12px 16px',
          borderTop: `1px solid ${isDarkMode ? '#303030' : '#f0f0f0'}`,
        }}
      >
        <Space.Compact style={{ width: '100%' }}>
          <Upload
            showUploadList={false}
            beforeUpload={async (file) => {
              try {
                // 获取文件路径（Electron 环境下可以直接获取）
                const filePath = (file as any).path;
                if (!filePath) {
                  message.error('无法获取文件路径');
                  return false;
                }

                console.log('[ChatView] Sending file:', filePath);

                // 发送文件
                const result = await transferClient.sendFile(
                  session.peer_device_id,
                  session.id,
                  filePath
                );

                console.log('[ChatView] File sent:', result);

                // 创建文件记录并添加到列表
                const newFile: TransferFile = {
                  id: result.id,
                  session_id: session.id,
                  filename: result.filename,
                  file_size: result.fileSize,
                  mime_type: result.mimeType,
                  local_path: filePath,
                  direction: 'sent',
                  status: 'completed',
                  progress: 100,
                  file_hash: null,
                  created_at: Date.now(),
                  completed_at: Date.now(),
                };

                // 保存到数据库
                await transferClient.createFileTransfer(newFile);

                // 更新 UI
                setFiles(prev => [...prev, newFile]);

                message.success(`文件 ${result.filename} 已发送`);
              } catch (error: any) {
                console.error('[ChatView] Failed to send file:', error);
                message.error(error.message || '文件发送失败');
              }
              return false; // 阻止默认上传行为
            }}
          >
            <Button icon={<PaperClipOutlined />} />
          </Upload>
          <TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ flex: 1 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={sending}
            disabled={!inputValue.trim()}
          />
        </Space.Compact>
      </Footer>
    </Layout>
  );
};

export default ChatView;
