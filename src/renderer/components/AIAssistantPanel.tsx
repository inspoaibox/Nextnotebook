import React, { useState, useRef, useEffect } from 'react';
import {
  Input, Button, Select, Slider, Empty, message, Tooltip, Popover, Modal, Form
} from 'antd';
import {
  SendOutlined, PlusOutlined, DeleteOutlined, EditOutlined,
  RobotOutlined, SettingOutlined, FileTextOutlined
} from '@ant-design/icons';
import { useAISettings, useAIConversations, useAIMessages, AIMessage } from '../hooks/useAI';

const { TextArea } = Input;

// 预设系统提示词
const PRESET_PROMPTS = [
  { id: 'default', name: '默认助手', prompt: '你是一个有帮助的AI助手。' },
  { id: 'coder', name: '代码专家', prompt: '你是一个专业的编程助手，擅长多种编程语言。请提供简洁、高效、可维护的代码，并解释关键逻辑。' },
  { id: 'writer', name: '写作助手', prompt: '你是一个专业的写作助手，擅长各类文案、文章的撰写和润色。请注意语言流畅、逻辑清晰、表达准确。' },
  { id: 'translator', name: '翻译专家', prompt: '你是一个专业的翻译助手，精通中英文互译。请提供准确、自然、符合目标语言习惯的翻译。' },
  { id: 'analyst', name: '数据分析师', prompt: '你是一个数据分析专家，擅长数据处理、统计分析和可视化。请提供专业的分析建议和解决方案。' },
  { id: 'teacher', name: '学习导师', prompt: '你是一个耐心的学习导师，善于用简单易懂的方式解释复杂概念。请循序渐进地引导学习。' },
  { id: 'creative', name: '创意顾问', prompt: '你是一个富有创意的顾问，擅长头脑风暴和创意思维。请提供新颖、独特的想法和建议。' },
  { id: 'custom', name: '自定义', prompt: '' },
];

const AIAssistantPanel: React.FC = () => {
  const { settings } = useAISettings();
  const { conversations, createConversation, deleteConversation, updateConversation } = useAIConversations();

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const { messages, streaming, streamingContent, sendMessage } = useAIMessages(currentConversationId);

  const [inputValue, setInputValue] = useState('');
  const [localMessages, setLocalMessages] = useState<AIMessage[]>([]);
  const [sending, setSending] = useState(false);

  // 新建对话弹窗状态
  const [newConvModalVisible, setNewConvModalVisible] = useState(false);
  const [newConvForm] = Form.useForm();

  // UI状态
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 获取所有可用模型
  const allModels = settings.channels.flatMap(c =>
    c.models.map(m => ({ ...m, channelName: c.name, channel: c }))
  );

  // 当前对话
  const currentConversation = conversations.find(c => c.id === currentConversationId);

  // 当前对话的设置（从对话中读取，或使用默认值）
  const currentModel = currentConversation?.model || (allModels.length > 0 ? allModels[0].id : '');
  const currentTemperature = currentConversation?.temperature ?? 0.7;
  const currentMaxTokens = currentConversation?.maxTokens ?? 4096;
  const currentSystemPrompt = currentConversation?.systemPrompt || '你是一个有帮助的AI助手。';

  // 合并本地消息和服务器消息
  const displayMessages = [...messages, ...localMessages].sort((a, b) => a.createdAt - b.createdAt);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages, streamingContent, sending]);

  // 清除本地消息当服务器消息更新
  useEffect(() => {
    if (messages.length > 0) {
      setLocalMessages([]);
    }
  }, [messages]);

  // 打开新建对话弹窗
  const handleOpenNewConvModal = () => {
    const defaultModel = allModels.length > 0 ? allModels[0].id : '';
    // 先重置表单，确保清除之前的状态
    newConvForm.resetFields();
    // 使用 setTimeout 确保重置完成后再设置新值
    setTimeout(() => {
      newConvForm.setFieldsValue({
        title: '新对话',
        model: defaultModel,
        temperature: 0.7,
        maxTokens: 4096,
        presetPrompt: 'default',
        systemPrompt: PRESET_PROMPTS[0].prompt,
      });
    }, 0);
    setNewConvModalVisible(true);
  };

  // 创建新对话
  const handleCreateConversation = async () => {
    try {
      const values = await newConvForm.validateFields();
      if (!values.model) {
        message.error('请先在设置中配置AI渠道和模型');
        return;
      }
      const conv = await createConversation(
        values.title,
        values.model,
        values.systemPrompt,
        values.temperature,
        values.maxTokens
      );
      if (conv) {
        setCurrentConversationId(conv.id);
        setLocalMessages([]);
        setNewConvModalVisible(false);
        message.success('对话创建成功');
      } else {
        message.error('创建对话失败');
      }
    } catch (err) {
      console.error('Create conversation error:', err);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || sending) return;

    if (!currentConversationId) {
      message.warning('请先创建或选择一个对话');
      handleOpenNewConvModal();
      return;
    }

    const modelInfo = allModels.find(m => m.id === currentModel);
    if (!modelInfo) {
      message.error('当前对话的模型不可用，请检查AI渠道设置');
      return;
    }

    const userMsg: AIMessage = {
      id: `local-${Date.now()}`,
      conversationId: currentConversationId,
      role: 'user',
      content: inputValue,
      model: currentModel,
      createdAt: Date.now(),
    };
    setLocalMessages(prev => [...prev, userMsg]);

    const content = inputValue;
    setInputValue('');
    setSending(true);

    try {
      await sendMessage(content, modelInfo.channel, currentModel, currentSystemPrompt, currentTemperature, currentMaxTokens);
    } catch (err: any) {
      message.error(err.message || 'AI请求失败');
    } finally {
      setSending(false);
    }
  };

  const handleSelectConversation = (id: string) => {
    // 切换对话时重置所有状态
    setSending(false);
    setCurrentConversationId(id);
    setLocalMessages([]);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConversation(id);
    if (currentConversationId === id) {
      setCurrentConversationId(null);
      setLocalMessages([]);
    }
  };

  // 更新当前对话的模型
  const handleModelChange = (modelId: string) => {
    if (currentConversationId) {
      updateConversation(currentConversationId, { model: modelId });
    }
  };

  // 更新当前对话的温度
  const handleTemperatureChange = (value: number) => {
    if (currentConversationId) {
      updateConversation(currentConversationId, { temperature: value });
    }
  };

  // 更新当前对话的最大Token
  const handleMaxTokensChange = (value: number) => {
    if (currentConversationId) {
      updateConversation(currentConversationId, { max_tokens: value });
    }
  };

  // 更新当前对话的系统提示词
  const handleSystemPromptChange = (prompt: string) => {
    if (currentConversationId) {
      updateConversation(currentConversationId, { system_prompt: prompt });
    }
  };

  // 获取当前预设ID
  const getCurrentPresetId = () => {
    const preset = PRESET_PROMPTS.find(p => p.prompt === currentSystemPrompt);
    return preset ? preset.id : 'custom';
  };

  // 模型选择弹出内容
  const modelPopoverContent = (
    <div style={{ width: 280 }}>
      <div style={{ marginBottom: 8, fontWeight: 500, color: '#666' }}>选择模型</div>
      {!currentConversationId ? (
        <div style={{ color: '#999', fontSize: 12 }}>请先创建或选择对话</div>
      ) : (
        <Select
          style={{ width: '100%' }}
          value={currentModel}
          onChange={handleModelChange}
          placeholder="选择模型"
          options={allModels.map(m => ({ value: m.id, label: `${m.name} (${m.channelName})` }))}
        />
      )}
    </div>
  );

  // 参数设置弹出内容
  const settingsPopoverContent = (
    <div style={{ width: 280 }}>
      {!currentConversationId ? (
        <div style={{ color: '#999', fontSize: 12 }}>请先创建或选择对话</div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 4, color: '#666', fontSize: 12 }}>温度: {currentTemperature}</div>
            <Slider
              min={0} max={2} step={0.1}
              value={currentTemperature}
              onChangeComplete={handleTemperatureChange}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, color: '#666', fontSize: 12 }}>最大Token: {currentMaxTokens}</div>
            <Slider
              min={256} max={32768} step={256}
              value={currentMaxTokens}
              onChangeComplete={handleMaxTokensChange}
            />
          </div>
        </>
      )}
    </div>
  );

  // 系统提示词弹出内容
  const promptPopoverContent = (
    <div style={{ width: 280 }}>
      <div style={{ marginBottom: 8, fontWeight: 500, color: '#666' }}>系统提示词</div>
      {!currentConversationId ? (
        <div style={{ color: '#999', fontSize: 12 }}>请先创建或选择对话</div>
      ) : (
        <>
          <Select
            style={{ width: '100%', marginBottom: 8 }}
            value={getCurrentPresetId()}
            onChange={(presetId) => {
              const preset = PRESET_PROMPTS.find(p => p.id === presetId);
              if (preset && presetId !== 'custom') {
                handleSystemPromptChange(preset.prompt);
              }
            }}
            options={PRESET_PROMPTS.map(p => ({ value: p.id, label: p.name }))}
          />
          <TextArea
            rows={3}
            value={currentSystemPrompt}
            onChange={e => handleSystemPromptChange(e.target.value)}
            placeholder="输入系统提示词..."
            style={{ fontSize: 12 }}
          />
        </>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', background: '#f5f5f5' }}>
      {/* 左侧对话列表 */}
      <div style={{
        width: 220,
        background: '#fff',
        borderRight: '1px solid #e8e8e8',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ padding: '12px', borderBottom: '1px solid #f0f0f0' }}>
          <Button type="primary" block icon={<PlusOutlined />} onClick={handleOpenNewConvModal}>
            新建对话
          </Button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
          {conversations.length === 0 ? (
            <Empty description="暂无对话" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 40 }} />
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                style={{
                  padding: '10px 12px',
                  marginBottom: 4,
                  background: conv.id === currentConversationId ? '#e6f7ff' : 'transparent',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => {
                  if (conv.id !== currentConversationId) {
                    (e.currentTarget as HTMLDivElement).style.background = '#f5f5f5';
                  }
                }}
                onMouseLeave={e => {
                  if (conv.id !== currentConversationId) {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  }
                }}
              >
                {editingTitle === conv.id ? (
                  <Input
                    size="small"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onBlur={async () => {
                      if (newTitle.trim()) await updateConversation(conv.id, { title: newTitle });
                      setEditingTitle(null);
                    }}
                    onPressEnter={async () => {
                      if (newTitle.trim()) await updateConversation(conv.id, { title: newTitle });
                      setEditingTitle(null);
                    }}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                ) : (
                  <>
                    <span style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: 13,
                    }}>
                      {conv.title}
                    </span>
                    <div style={{ display: 'flex', gap: 2, opacity: 0.6 }}>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined style={{ fontSize: 12 }} />}
                        onClick={e => { e.stopPropagation(); setEditingTitle(conv.id); setNewTitle(conv.title); }}
                        style={{ padding: '0 4px', height: 20 }}
                      />
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                        onClick={e => handleDeleteConversation(conv.id, e)}
                        style={{ padding: '0 4px', height: 20 }}
                      />
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧对话区域 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 顶部标题栏 */}
        <div style={{
          padding: '12px 16px',
          background: '#fff',
          borderBottom: '1px solid #e8e8e8',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <RobotOutlined style={{ fontSize: 18, color: '#1890ff' }} />
          <span style={{ fontWeight: 500 }}>
            {currentConversation?.title || '请选择或创建对话'}
          </span>
          {currentConversation && (
            <span style={{ fontSize: 11, color: '#999', marginLeft: 8 }}>
              模型: {allModels.find(m => m.id === currentModel)?.name || currentModel}
            </span>
          )}
        </div>

        {/* 消息列表 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {!currentConversationId ? (
            <Empty 
              description="请先创建或选择一个对话" 
              style={{ marginTop: 60 }}
            >
              <Button type="primary" onClick={handleOpenNewConvModal}>新建对话</Button>
            </Empty>
          ) : displayMessages.length === 0 && !streaming && !sending ? (
            <Empty description="开始新对话" style={{ marginTop: 60 }} />
          ) : (
            <>
              {displayMessages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {/* 流式响应 */}
              {streaming && streamingContent && (
                <MessageBubble
                  message={{
                    id: 'streaming',
                    conversationId: currentConversationId || '',
                    role: 'assistant',
                    content: streamingContent,
                    model: currentModel,
                    createdAt: Date.now(),
                  }}
                />
              )}
              {/* 等待AI回复的提示 */}
              {sending && !streamingContent && (
                <MessageBubble
                  message={{
                    id: 'loading-placeholder',
                    conversationId: currentConversationId || '',
                    role: 'assistant',
                    content: 'AI 正在思考...',
                    model: currentModel,
                    createdAt: Date.now(),
                  }}
                />
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* 输入区域 */}
        <div style={{ background: '#fff', borderTop: '1px solid #e8e8e8', padding: '12px 16px' }}>
          {/* 工具栏 */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 4 }}>
            <Popover content={modelPopoverContent} trigger="click" placement="topLeft">
              <Tooltip title="选择模型">
                <Button type="text" size="small" style={{ color: currentConversationId ? '#666' : '#ccc' }}>
                  @{allModels.find(m => m.id === currentModel)?.name || '模型'}
                </Button>
              </Tooltip>
            </Popover>
            <Popover content={settingsPopoverContent} trigger="click" placement="top">
              <Tooltip title="参数设置">
                <Button type="text" size="small" icon={<SettingOutlined />} style={{ color: currentConversationId ? '#666' : '#ccc' }} />
              </Tooltip>
            </Popover>
            <Popover content={promptPopoverContent} trigger="click" placement="top">
              <Tooltip title="系统提示词">
                <Button type="text" size="small" icon={<FileTextOutlined />} style={{ color: currentConversationId ? '#666' : '#ccc' }} />
              </Tooltip>
            </Popover>
          </div>

          {/* 输入框 */}
          <div style={{ display: 'flex', gap: 8 }}>
            <TextArea
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onPressEnter={e => {
                if (!e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={currentConversationId ? "输入消息，Enter发送，Shift+Enter换行" : "请先创建或选择对话"}
              autoSize={{ minRows: 1, maxRows: 4 }}
              style={{ flex: 1, resize: 'none' }}
              disabled={sending || streaming || !currentConversationId}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={sending || streaming}
              disabled={!inputValue.trim() || !currentConversationId}
            />
          </div>
        </div>
      </div>

      {/* 新建对话弹窗 */}
      <Modal
        title="新建对话"
        open={newConvModalVisible}
        onOk={handleCreateConversation}
        onCancel={() => setNewConvModalVisible(false)}
        okText="创建"
        cancelText="取消"
        width={500}
        destroyOnClose
      >
        <Form form={newConvForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="title"
            label="对话名称"
            rules={[{ required: true, message: '请输入对话名称' }]}
          >
            <Input placeholder="输入对话名称" />
          </Form.Item>

          <Form.Item
            name="model"
            label="选择模型"
            rules={[{ required: true, message: '请选择模型' }]}
          >
            <Select
              placeholder="选择模型"
              options={allModels.map(m => ({ value: m.id, label: `${m.name} (${m.channelName})` }))}
              notFoundContent={<span style={{ color: '#999' }}>请先在设置中配置AI渠道</span>}
            />
          </Form.Item>

          <Form.Item name="presetPrompt" label="预设提示词">
            <Select
              options={PRESET_PROMPTS.map(p => ({ value: p.id, label: p.name }))}
              onChange={(presetId) => {
                const preset = PRESET_PROMPTS.find(p => p.id === presetId);
                if (preset) {
                  newConvForm.setFieldValue('systemPrompt', preset.prompt);
                }
              }}
            />
          </Form.Item>

          <Form.Item name="systemPrompt" label="系统提示词">
            <TextArea rows={3} placeholder="输入系统提示词..." />
          </Form.Item>

          <Form.Item name="temperature" label={`温度 (${newConvForm.getFieldValue('temperature') || 0.7})`}>
            <Slider min={0} max={2} step={0.1} />
          </Form.Item>

          <Form.Item name="maxTokens" label={`最大Token (${newConvForm.getFieldValue('maxTokens') || 4096})`}>
            <Slider min={256} max={32768} step={256} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

// 消息气泡组件
const MessageBubble: React.FC<{ message: AIMessage }> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12,
    }}>
      <div style={{
        maxWidth: '85%',
        padding: '10px 14px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background: isUser ? '#1890ff' : '#fff',
        color: isUser ? '#fff' : '#333',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.5,
      }}>
        {!isUser && (
          <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <RobotOutlined style={{ fontSize: 12, color: '#1890ff' }} />
            <span style={{ fontSize: 11, color: '#999' }}>AI</span>
          </div>
        )}
        {message.content}
      </div>
    </div>
  );
};

export default AIAssistantPanel;
