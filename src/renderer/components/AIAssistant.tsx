import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal, Input, Button, List, Avatar, Dropdown, Select, Slider,
  Empty, Spin, message, Tooltip, Popconfirm, Switch, Upload
} from 'antd';
import {
  SendOutlined, PlusOutlined, DeleteOutlined, EditOutlined,
  RobotOutlined, UserOutlined, SettingOutlined, MenuOutlined,
  CopyOutlined, InfoCircleOutlined, PictureOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import { useAISettings, useAIConversations, useAIMessages } from '../hooks/useAI';
import { validateImage, fileToBase64, compressImage, getImageFromClipboard } from '../utils/imageUtils';

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
  const [selectedImages, setSelectedImages] = useState<string[]>([]); // 选中的图片（base64）

  // 当前对话设置
  const [currentChannelId, setCurrentChannelId] = useState('');
  const [currentModel, setCurrentModel] = useState('');
  const [currentTemperature, setCurrentTemperature] = useState(0.7);
  const [currentMaxTokens, setCurrentMaxTokens] = useState(4096);
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState('');
  const [currentWebSearchEnabled, setCurrentWebSearchEnabled] = useState(false);

  const { messages, streaming, streamingContent, sendMessage, deleteMessage } = useAIMessages(selectedConversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);
  const prevMessagesLengthRef = useRef(0);
  const isUserScrollingRef = useRef(false); // 标记用户是否正在手动滚动

  // 获取当前选中的对话
  const currentConversation = conversations.find(c => c.id === selectedConversationId);

  // 获取所有可用的渠道和模型
  const enabledChannels = settings.channels.filter(c => c.enabled);
  const allModels = enabledChannels.flatMap(c => c.models.map(m => ({ ...m, channelName: c.name, channel: c })));

  // 获取当前选中渠道的模型列表
  const currentChannel = enabledChannels.find(c => c.id === currentChannelId);
  const currentChannelModels = currentChannel?.models || [];

  // 初始化默认渠道和模型
  useEffect(() => {
    if (enabledChannels.length > 0) {
      // 如果没有选中渠道，设置默认渠道
      if (!currentChannelId) {
        const defaultModel = settings.default_model || allModels[0]?.id;
        const modelInfo = allModels.find(m => m.id === defaultModel);
        if (modelInfo) {
          setCurrentChannelId(modelInfo.channel.id);
          setCurrentModel(defaultModel);
        } else if (enabledChannels[0]) {
          setCurrentChannelId(enabledChannels[0].id);
          if (enabledChannels[0].models.length > 0) {
            setCurrentModel(enabledChannels[0].models[0].id);
          }
        }
      }
    }
  }, [enabledChannels, allModels, currentChannelId, settings.default_model]);

  // 加载对话设置
  useEffect(() => {
    if (currentConversation) {
      const convModel = currentConversation.model || settings.default_model || '';
      const modelInfo = allModels.find(m => m.id === convModel);
      if (modelInfo) {
        setCurrentChannelId(modelInfo.channel.id);
      }
      setCurrentModel(convModel);
      setCurrentTemperature(currentConversation.temperature);
      setCurrentMaxTokens(currentConversation.maxTokens);
      setCurrentSystemPrompt(currentConversation.systemPrompt);
      setCurrentWebSearchEnabled(currentConversation.webSearchEnabled);
    }
  }, [currentConversation, settings.default_model, allModels]);

  // 切换渠道时自动选择该渠道的第一个模型
  const handleChannelChange = useCallback((channelId: string) => {
    setCurrentChannelId(channelId);
    const channel = enabledChannels.find(c => c.id === channelId);
    if (channel && channel.models.length > 0) {
      const newModel = channel.models[0].id;
      setCurrentModel(newModel);
      // 保存到对话
      if (selectedConversationId) {
        updateConversation(selectedConversationId, { model: newModel });
      }
    }
  }, [enabledChannels, selectedConversationId, updateConversation]);

  // 切换模型时自动保存到对话
  const handleModelChange = useCallback(async (newModel: string) => {
    setCurrentModel(newModel);
    if (selectedConversationId) {
      await updateConversation(selectedConversationId, { model: newModel });
    }
  }, [selectedConversationId, updateConversation]);

  // 滚动到底部 - 只在发送新消息或流式输出时自动滚动
  useEffect(() => {
    // 检测是否有新消息（用户发送或 AI 回复完成）
    const hasNewMessage = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    // 只在以下情况自动滚动：
    // 1. 有新消息且用户没有在手动滚动查看历史记录
    // 2. 正在流式输出且用户没有在手动滚动
    if (!isUserScrollingRef.current && (hasNewMessage || streaming)) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent, streaming]);

  // 监听滚动事件，判断用户是否在查看历史记录
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // 如果用户滚动到接近底部（距离底部 100px 以内），认为用户不再查看历史记录
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    // 更新用户滚动状态
    isUserScrollingRef.current = !isNearBottom;
  }, []);

  // 创建新对话
  const handleNewConversation = async () => {
    const defaultModel = settings.default_model || (allModels[0]?.id || '');
    const conv = await createConversation('新对话', defaultModel, '', 0.7, 4096, false);
    if (conv) {
      setSelectedConversationId(conv.id);
    }
  };

  // 发送消息
  const handleSend = async () => {
    if (!inputValue.trim() && selectedImages.length === 0) return;

    const content = inputValue.trim();
    const images = [...selectedImages];

    if (!currentChannel) {
      message.error('请先选择渠道');
      return;
    }
    const modelInfo = currentChannelModels.find(m => m.id === currentModel);
    if (!modelInfo) {
      message.error('请先选择模型');
      return;
    }

    // 立即清空输入框和图片，提升响应感
    setInputValue('');
    setSelectedImages([]);
    isUserScrollingRef.current = false; // 发送消息时重置滚动状态，确保能看到新消息

    if (!selectedConversationId) {
      // 自动创建新对话
      const defaultModel = currentModel || settings.default_model || (allModels[0]?.id || '');
      const conv = await createConversation('新对话', defaultModel, currentSystemPrompt, currentTemperature, currentMaxTokens, currentWebSearchEnabled);
      if (conv) {
        setSelectedConversationId(conv.id);
        // 等待状态更新后发送（使用 requestAnimationFrame 确保 UI 更新）
        requestAnimationFrame(() => {
          handleSendToConversation(conv.id, content, currentChannel, images);
        });
      }
      return;
    }
    await handleSendToConversation(selectedConversationId, content, currentChannel, images);
  };

  const handleSendToConversation = async (convId: string, content: string, channel: any, images: string[] = []) => {
    if (!content && images.length === 0) return;

    try {
      await sendMessage(
        content,
        channel,
        currentModel,
        currentSystemPrompt,
        currentTemperature,
        currentMaxTokens,
        images
      );

      // 更新对话标题（如果是第一条消息）- 后台执行，不阻塞
      if (messages.length === 0) {
        const title = content.slice(0, 20) + (content.length > 20 ? '...' : '') || '图片对话';
        updateConversation(convId, { title }).catch(console.error);
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
        web_search_enabled: currentWebSearchEnabled,
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

  // 复制消息内容
  const handleCopyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      message.success('已复制到剪贴板');
    } catch (err) {
      message.error('复制失败');
    }
  };

  // 删除消息
  const handleDeleteMessage = async (messageId: string) => {
    const success = await deleteMessage(messageId);
    if (success) {
      message.success('消息已删除');
    } else {
      message.error('删除失败');
    }
  };

  // 处理图片上传
  const handleImageUpload = async (file: File) => {
    const validation = validateImage(file);
    if (!validation.valid) {
      message.error(validation.error);
      return false;
    }

    try {
      message.loading({ content: '处理图片中...', key: 'image-upload' });
      let base64 = await fileToBase64(file);

      // 压缩图片
      base64 = await compressImage(base64);

      setSelectedImages(prev => [...prev, base64]);
      message.success({ content: '图片已添加', key: 'image-upload' });
    } catch (error) {
      message.error({ content: '图片处理失败', key: 'image-upload' });
    }

    return false; // 阻止默认上传行为
  };

  // 处理粘贴图片
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    try {
      const file = await getImageFromClipboard(e);
      if (file) {
        e.preventDefault();
        console.log('检测到粘贴图片:', file.name);
        await handleImageUpload(file);
      }
    } catch (error) {
      console.error('粘贴图片失败:', error);
    }
  };

  // 删除选中的图片
  const handleRemoveImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
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
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RobotOutlined style={{ fontSize: 20, color: '#1890ff' }} />
            <span style={{ fontWeight: 500 }}>智能助理</span>
            <div style={{ flex: 1 }} />
            {/* 渠道选择 */}
            <Select
              value={currentChannelId}
              onChange={handleChannelChange}
              style={{ width: 140 }}
              size="small"
              placeholder="选择渠道"
              popupMatchSelectWidth={false}
              getPopupContainer={(trigger) => trigger.parentElement || document.body}
              options={enabledChannels.map(channel => ({
                value: channel.id,
                label: channel.name,
              }))}
            />
            {/* 模型选择 */}
            <Select
              value={currentModel}
              onChange={handleModelChange}
              style={{ width: 180 }}
              size="small"
              placeholder="选择模型"
              showSearch
              popupMatchSelectWidth={false}
              getPopupContainer={(trigger) => trigger.parentElement || document.body}
              filterOption={(input, option: any) => {
                if (!option) return false;
                const searchText = input.toLowerCase();
                const label = String(option.label || '').toLowerCase();
                const value = String(option.value || '').toLowerCase();
                return label.includes(searchText) || value.includes(searchText);
              }}
              options={currentChannelModels.map(m => ({
                value: m.id,
                label: m.name,
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
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Switch
                  checked={currentWebSearchEnabled}
                  onChange={setCurrentWebSearchEnabled}
                />
                <label style={{ fontSize: 12, color: '#666', cursor: 'pointer' }} onClick={() => setCurrentWebSearchEnabled(!currentWebSearchEnabled)}>
                  启用联网搜索
                </label>
                <Tooltip title="开启后，AI 可以搜索互联网获取最新信息">
                  <InfoCircleOutlined style={{ fontSize: 12, color: '#999' }} />
                </Tooltip>
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
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            style={{ flex: 1, overflow: 'auto', padding: 16 }}
          >
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
                      position: 'relative',
                    }}
                    className="message-item"
                  >
                    <Avatar
                      icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                      style={{
                        backgroundColor: msg.role === 'user' ? '#1890ff' : '#52c41a',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      maxWidth: '70%',
                      margin: msg.role === 'user' ? '0 12px 0 0' : '0 0 0 12px',
                    }}>
                      {/* 图片预览 */}
                      {msg.images && msg.images.length > 0 && (
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8,
                          marginBottom: 8,
                        }}>
                          {msg.images.map((img, idx) => (
                            <img
                              key={idx}
                              src={img}
                              alt={`image-${idx}`}
                              style={{
                                maxWidth: 200,
                                maxHeight: 200,
                                borderRadius: 8,
                                objectFit: 'cover',
                                cursor: 'pointer',
                              }}
                              onClick={() => {
                                // 点击图片放大查看
                                const win = window.open();
                                if (win) {
                                  win.document.write(`<img src="${img}" style="max-width:100%;max-height:100%;" />`);
                                }
                              }}
                            />
                          ))}
                        </div>
                      )}
                      <div
                        style={{
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
                      {/* 操作按钮 */}
                      <div style={{
                        display: 'flex',
                        gap: 4,
                        marginTop: 4,
                        alignItems: 'center',
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      }}>
                        <Tooltip title="复制">
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => handleCopyMessage(msg.content)}
                            style={{
                              fontSize: 12,
                              color: '#999',
                              padding: '0 4px',
                              height: 20,
                            }}
                          />
                        </Tooltip>
                        <Popconfirm
                          title="确定删除这条消息吗？"
                          onConfirm={() => handleDeleteMessage(msg.id)}
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                        >
                          <Tooltip title="删除">
                            <Button
                              type="text"
                              size="small"
                              icon={<DeleteOutlined />}
                              style={{
                                fontSize: 12,
                                color: '#999',
                                padding: '0 4px',
                                height: 20,
                              }}
                            />
                          </Tooltip>
                        </Popconfirm>
                      </div>
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
            {/* 图片预览区域 */}
            {selectedImages.length > 0 && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 12,
                padding: 8,
                background: '#fafafa',
                borderRadius: 8,
              }}>
                {selectedImages.map((img, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <img
                      src={img}
                      alt={`preview-${idx}`}
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 8,
                        objectFit: 'cover',
                        border: '1px solid #d9d9d9',
                      }}
                    />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<CloseCircleOutlined />}
                      onClick={() => handleRemoveImage(idx)}
                      style={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        background: '#fff',
                        borderRadius: '50%',
                        padding: 0,
                        width: 20,
                        height: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={handleImageUpload}
                multiple
              >
                <Tooltip title="上传图片">
                  <Button
                    icon={<PictureOutlined />}
                    disabled={streaming}
                    style={{ height: 32 }}
                  />
                </Tooltip>
              </Upload>
              <div style={{ flex: 1 }}>
                <TextArea
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder="输入消息，按 Enter 发送，Shift+Enter 换行，支持粘贴图片"
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  disabled={streaming}
                />
              </div>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSend}
                loading={streaming}
                disabled={(!inputValue.trim() && selectedImages.length === 0) || streaming}
                style={{ height: 32 }}
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
