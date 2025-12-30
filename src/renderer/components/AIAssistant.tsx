import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Modal, Input, Button, List, Avatar, Dropdown, Select, Slider, 
  Empty, Spin, message, Tooltip, Popconfirm 
} from 'antd';
import {
  SendOutlined, PlusOutlined, DeleteOutlined, EditOutlined,
  RobotOutlined, UserOutlined, SettingOutlined, MenuOutlined,
} from '@ant-design/icons';
import { useAISettings, useAIConversations, useAIMessages, AIConversation } from '../hooks/useAI';
import { AIChannel, AIModel } from '@shared/types';

const { TextArea } = Input;

interface AIAssistantProps {
  open: boolean;
  onClose: () => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ open, onClose }) => {
  const { settings } = useAISettings();
  const { conversations, createConversation, updateConversation, deleteConversation } = useAIConversations();
  
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  
  // 当前对话设置
  const [currentModel, setCurrentModel] = useState('');
  const [currentTemperature, setCurrentTemperature] = useState(0.7);
  const [currentMaxTokens, setCurrentMaxTokens] = useState(4096);
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState('');
  
  const { messages, loading, streaming, streamingContent, sendMessage } = useAIMessages(selectedConversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);

  // 获取当前选中的对话
  const currentConversation = conversations.find(c => c.id === selectedConversationId);

  // 获取所有可用的渠道和模型
  const enabledChannels = settings.channels.filter(c => c.enabled);
  const allModels = enabledChannels.flatMap(c => c.models.map(m => ({ ...m, channelName: c.name, channel: c })));

  // 初始化默认模型
  useEffect(() => {
    if (!currentModel && allModels.length > 0) {
      setCurrentModel(settings.default_model || allModels[0].id);
    }
  }, [allModels, currentModel, settings.default_model]);

  // 加载对话设置
  useEffect(() => {
    if (currentConversation) {
      setCurrentModel(currentConversation.model || settings.default_model || '');
      setCurrentTemperature(currentConversation.temperature);
      setCurrentMaxTokens(currentConversation.maxTokens);
      setCurrentSystemPrompt(currentConversation.systemPrompt);
    }
  }, [currentConversation, settings.default_model]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // 创建新对话
  const handleNewConversation = async () => {
    const defaultModel = settings.default_model || (allModels[0]?.id || '');
    const conv = await createConversation('新对话', defaultModel, '', 0.7, 4096);
    if (conv) {
      setSelectedConversationId(conv.id);
    }
  };

  // 发送消息
  const handleSend = async () => {
    if (!inputValue.trim()) return;
    if (!selectedConversationId) {
      // 自动创建新对话
      const defaultModel = currentModel || settings.default_model || (allModels[0]?.id || '');
      const conv = await createConversation('新对话', defaultModel, currentSystemPrompt, currentTemperature, currentMaxTokens);
      if (conv) {
        setSelectedConversationId(conv.id);
        // 等待状态更新后发送
        setTimeout(() => handleSendToConversation(conv.id), 100);
      }
      return;
    }
    await handleSendToConversation(selectedConversationId);
  };

  const handleSendToConversation = async (convId: string) => {
    const content = inputValue.trim();
    if (!content) return;

    const modelInfo = allModels.find(m => m.id === currentModel);
    if (!modelInfo) {
      message.error('请先选择模型');
      return;
    }

    setInputValue('');
    
    try {
      await sendMessage(
        content,
        modelInfo.channel,
        currentModel,
        currentSystemPrompt,
        currentTemperature,
        currentMaxTokens
      );
      
      // 更新对话标题（如果是第一条消息）
      if (messages.length === 0) {
        const title = content.slice(0, 20) + (content.length > 20 ? '...' : '');
        await updateConversation(convId, { title });
      }
    } catch (err: any) {
      message.error(err.message || 'AI 请求失败');
    }
  };

  // 删除对话
  const handleDeleteConversation = async (id: string) => {
    await deleteConversation(id);
    if (selectedConversationId === id) {
      setSelectedConversationId(null);
    }
  };

  // 重命名对话
  const handleRename = async (id: string) => {
    if (newTitle.trim()) {
      await updateConversation(id, { title: newTitle.trim() });
    }
    setEditingTitle(null);
    setNewTitle('');
  };

  // 保存对话设置
  const handleSaveSettings = async () => {
    if (selectedConversationId) {
      await updateConversation(selectedConversationId, {
        model: currentModel,
        temperature: currentTemperature,
        max_tokens: currentMaxTokens,
        system_prompt: currentSystemPrompt,
      });
      message.success('设置已保存');
    }
    setShowSettings(false);
  };

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!settings.enabled) {
    return (
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        width={800}
        title="智能助理"
        styles={{ body: { padding: 40, textAlign: 'center' } }}
      >
        <Empty
          description="AI 功能未启用"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <p style={{ color: '#888', marginBottom: 16 }}>请在设置中启用 AI 功能并配置渠道</p>
        </Empty>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      title={null}
      closable={true}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ display: 'flex', height: 600 }}>
        {/* 左侧对话列表 */}
        <div style={{ width: 220, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <Button type="primary" icon={<PlusOutlined />} block onClick={handleNewConversation}>
              新建对话
            </Button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {conversations.length === 0 ? (
              <Empty description="暂无对话" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 40 }} />
            ) : (
              <List
                dataSource={conversations}
                renderItem={(conv) => (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConversationId(conv.id)}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      background: selectedConversationId === conv.id ? '#e6f4ff' : 'transparent',
                      borderLeft: selectedConversationId === conv.id ? '3px solid #1890ff' : '3px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    {editingTitle === conv.id ? (
                      <Input
                        size="small"
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        onBlur={() => handleRename(conv.id)}
                        onPressEnter={() => handleRename(conv.id)}
                        autoFocus
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                          {conv.title}
                        </span>
                        <Dropdown
                          menu={{
                            items: [
                              { key: 'rename', icon: <EditOutlined />, label: '重命名', onClick: () => { setEditingTitle(conv.id); setNewTitle(conv.title); } },
                              { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: () => handleDeleteConversation(conv.id) },
                            ],
                          }}
                          trigger={['click']}
                        >
                          <Button type="text" size="small" icon={<MenuOutlined />} onClick={e => e.stopPropagation()} />
                        </Dropdown>
                      </>
                    )}
                  </div>
                )}
              />
            )}
          </div>
        </div>

        {/* 右侧聊天区域 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* 顶部工具栏 */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <RobotOutlined style={{ fontSize: 20, color: '#1890ff' }} />
            <span style={{ fontWeight: 500 }}>智能助理</span>
            <div style={{ flex: 1 }} />
            <Select
              value={currentModel}
              onChange={setCurrentModel}
              style={{ width: 180 }}
              size="small"
              placeholder="选择模型"
              options={allModels.map(m => ({
                value: m.id,
                label: `${m.name} (${m.channelName})`,
              }))}
            />
            <Tooltip title="对话设置">
              <Button type="text" icon={<SettingOutlined />} onClick={() => setShowSettings(!showSettings)} />
            </Tooltip>
          </div>

          {/* 设置面板 */}
          {showSettings && (
            <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>系统提示词</label>
                <TextArea
                  value={currentSystemPrompt}
                  onChange={e => setCurrentSystemPrompt(e.target.value)}
                  placeholder="设置 AI 的角色和行为..."
                  rows={2}
                />
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>
                    温度 (Temperature): {currentTemperature}
                  </label>
                  <Slider
                    min={0}
                    max={2}
                    step={0.1}
                    value={currentTemperature}
                    onChange={setCurrentTemperature}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>
                    最大输出: {currentMaxTokens}
                  </label>
                  <Slider
                    min={256}
                    max={32000}
                    step={256}
                    value={currentMaxTokens}
                    onChange={setCurrentMaxTokens}
                  />
                </div>
              </div>
              <div style={{ marginTop: 12, textAlign: 'right' }}>
                <Button size="small" onClick={() => setShowSettings(false)} style={{ marginRight: 8 }}>取消</Button>
                <Button size="small" type="primary" onClick={handleSaveSettings}>保存设置</Button>
              </div>
            </div>
          )}

          {/* 消息列表 */}
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            {!selectedConversationId && messages.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 100, color: '#888' }}>
                <RobotOutlined style={{ fontSize: 48, marginBottom: 16, color: '#d9d9d9' }} />
                <p>选择一个对话或创建新对话开始聊天</p>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      marginBottom: 16,
                      flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                    }}
                  >
                    <Avatar
                      icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                      style={{
                        backgroundColor: msg.role === 'user' ? '#1890ff' : '#52c41a',
                        flexShrink: 0,
                      }}
                    />
                    <div
                      style={{
                        maxWidth: '70%',
                        margin: msg.role === 'user' ? '0 12px 0 0' : '0 0 0 12px',
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: msg.role === 'user' ? '#1890ff' : '#f5f5f5',
                        color: msg.role === 'user' ? '#fff' : '#333',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        lineHeight: 1.6,
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {streaming && (
                  <div style={{ display: 'flex', marginBottom: 16 }}>
                    <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#52c41a', flexShrink: 0 }} />
                    <div
                      style={{
                        maxWidth: '70%',
                        margin: '0 0 0 12px',
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: '#f5f5f5',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        lineHeight: 1.6,
                      }}
                    >
                      {streamingContent || <Spin size="small" />}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* 输入区域 */}
          <div style={{ padding: 16, borderTop: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <TextArea
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息，按 Enter 发送，Shift+Enter 换行"
                autoSize={{ minRows: 1, maxRows: 4 }}
                disabled={streaming}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSend}
                loading={streaming}
                disabled={!inputValue.trim() || streaming}
              >
                发送
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AIAssistant;
