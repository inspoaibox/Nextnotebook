import { useState, useEffect, useCallback } from 'react';
import { ItemBase, AIConversationPayload, AIMessagePayload, AIChannel, AIModel, AISettings } from '@shared/types';
import { aiConversationsApi, aiMessagesApi, aiSettingsApi, callAIApi, ChatMessage } from '../services/aiApi';

export interface AIConversation {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  createdAt: number;
  updatedAt: number;
}

export interface AIMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string;
  tokensUsed?: number;
  createdAt: number;
}

// 解析 payload
function parsePayload<T>(item: ItemBase): T {
  return JSON.parse(item.payload) as T;
}

function itemToConversation(item: ItemBase): AIConversation {
  const payload = parsePayload<AIConversationPayload>(item);
  return {
    id: item.id,
    title: payload.title || '新对话',
    model: payload.model || '',
    systemPrompt: payload.system_prompt || '',
    temperature: payload.temperature ?? 0.7,
    maxTokens: payload.max_tokens ?? 2048,
    createdAt: payload.created_at || item.created_time,
    updatedAt: item.updated_time,
  };
}

function itemToMessage(item: ItemBase): AIMessage {
  const payload = parsePayload<AIMessagePayload>(item);
  return {
    id: item.id,
    conversationId: payload.conversation_id || '',
    role: payload.role || 'user',
    content: payload.content || '',
    model: payload.model || '',
    tokensUsed: payload.tokens_used ?? 0,
    createdAt: payload.created_at || item.created_time,
  };
}

export function useAISettings() {
  const [settings, setSettings] = useState<AISettings>(() => aiSettingsApi.get());

  // 监听 localStorage 变化，同步其他组件的更新
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'mucheng-ai-settings' && e.newValue) {
        try {
          setSettings(JSON.parse(e.newValue));
        } catch { /* ignore */ }
      }
    };

    // 自定义事件监听（同一窗口内的更新）
    const handleCustomEvent = () => {
      setSettings(aiSettingsApi.get());
    };

    // 同步完成后从数据库重新加载 AI 配置
    const handleSyncCompleted = async () => {
      const dbSettings = await aiSettingsApi.loadFromDb();
      if (dbSettings) {
        // 更新 localStorage 和状态
        aiSettingsApi.save(dbSettings);
        setSettings(dbSettings);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('ai-settings-updated', handleCustomEvent);
    window.addEventListener('sync-completed', handleSyncCompleted);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('ai-settings-updated', handleCustomEvent);
      window.removeEventListener('sync-completed', handleSyncCompleted);
    };
  }, []);

  const updateSettings = useCallback((updates: Partial<AISettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      aiSettingsApi.save(newSettings);
      // 触发自定义事件通知其他组件
      window.dispatchEvent(new Event('ai-settings-updated'));
      return newSettings;
    });
  }, []);

  const addChannel = useCallback((channel: AIChannel) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        channels: [...prev.channels, channel],
      };
      aiSettingsApi.save(newSettings);
      window.dispatchEvent(new Event('ai-settings-updated'));
      return newSettings;
    });
  }, []);

  const updateChannel = useCallback((channelId: string, updates: Partial<AIChannel>) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        channels: prev.channels.map(c => c.id === channelId ? { ...c, ...updates } : c),
      };
      aiSettingsApi.save(newSettings);
      window.dispatchEvent(new Event('ai-settings-updated'));
      return newSettings;
    });
  }, []);

  const deleteChannel = useCallback((channelId: string) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        channels: prev.channels.filter(c => c.id !== channelId),
      };
      aiSettingsApi.save(newSettings);
      window.dispatchEvent(new Event('ai-settings-updated'));
      return newSettings;
    });
  }, []);

  const addModelToChannel = useCallback((channelId: string, model: AIModel) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        channels: prev.channels.map(c => 
          c.id === channelId 
            ? { ...c, models: [...c.models, { ...model, channel_id: channelId }] }
            : c
        ),
      };
      aiSettingsApi.save(newSettings);
      window.dispatchEvent(new Event('ai-settings-updated'));
      return newSettings;
    });
  }, []);

  const deleteModelFromChannel = useCallback((channelId: string, modelId: string) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        channels: prev.channels.map(c => 
          c.id === channelId 
            ? { ...c, models: c.models.filter(m => m.id !== modelId) }
            : c
        ),
      };
      aiSettingsApi.save(newSettings);
      window.dispatchEvent(new Event('ai-settings-updated'));
      return newSettings;
    });
  }, []);

  return {
    settings,
    updateSettings,
    addChannel,
    updateChannel,
    deleteChannel,
    addModelToChannel,
    deleteModelFromChannel,
  };
}

export function useAIConversations() {
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    try {
      setLoading(true);
      const items = await aiConversationsApi.getAll();
      if (items && Array.isArray(items)) {
        const list = items.map(itemToConversation);
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        setConversations(list);
      }
    } catch (err) {
      console.error('Failed to load AI conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // 监听同步完成事件，刷新对话列表
  useEffect(() => {
    const handleSyncCompleted = () => {
      loadConversations();
    };
    window.addEventListener('sync-completed', handleSyncCompleted);
    return () => {
      window.removeEventListener('sync-completed', handleSyncCompleted);
    };
  }, [loadConversations]);

  const createConversation = useCallback(async (
    title: string,
    model: string,
    systemPrompt: string = '',
    temperature: number = 0.7,
    maxTokens: number = 4096
  ) => {
    const payload: AIConversationPayload = {
      title,
      model,
      system_prompt: systemPrompt,
      temperature,
      max_tokens: maxTokens,
      created_at: Date.now(),
    };
    const item = await aiConversationsApi.create(payload);
    if (item) {
      await loadConversations();
      return itemToConversation(item);
    }
    return null;
  }, [loadConversations]);

  const updateConversation = useCallback(async (id: string, updates: Partial<AIConversationPayload>) => {
    // 先获取现有数据，然后合并更新（避免部分更新导致数据丢失）
    const existingItems = await aiConversationsApi.getAll();
    const existingItem = existingItems.find(item => item.id === id);
    if (!existingItem) return null;

    const existingPayload = JSON.parse(existingItem.payload) as AIConversationPayload;
    const mergedPayload: AIConversationPayload = {
      ...existingPayload,
      ...updates,
    };

    const item = await aiConversationsApi.update(id, mergedPayload);
    if (item) {
      await loadConversations();
      return itemToConversation(item);
    }
    return null;
  }, [loadConversations]);

  const deleteConversation = useCallback(async (id: string) => {
    // 1. 先删除所有关联的消息（级联删除）
    const messages = await aiMessagesApi.getByConversation(id);
    for (const msg of messages) {
      await aiMessagesApi.delete(msg.id);
    }
    // 2. 再删除对话本身
    const success = await aiConversationsApi.delete(id);
    if (success) {
      await loadConversations();
    }
    return success;
  }, [loadConversations]);

  return {
    conversations,
    loading,
    createConversation,
    updateConversation,
    deleteConversation,
    refresh: loadConversations,
  };
}

export function useAIMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');

  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    try {
      setLoading(true);
      const items = await aiMessagesApi.getByConversation(conversationId);
      if (items) {
        const msgs = items.map(itemToMessage);
        // 按创建时间排序
        msgs.sort((a, b) => a.createdAt - b.createdAt);
        setMessages(msgs);
      }
    } catch (err) {
      console.error('Failed to load AI messages:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // 当 conversationId 改变时，重置 streaming 状态
  useEffect(() => {
    setStreaming(false);
    setStreamingContent('');
  }, [conversationId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const sendMessage = useCallback(async (
    content: string,
    channel: AIChannel,
    model: string,
    systemPrompt: string,
    temperature: number,
    maxTokens: number
  ) => {
    if (!conversationId) return null;

    // 保存用户消息
    const userPayload: AIMessagePayload = {
      conversation_id: conversationId,
      role: 'user',
      content,
      model,
      created_at: Date.now(),
    };
    await aiMessagesApi.create(userPayload);

    // 重新从数据库加载当前对话的消息历史（避免闭包导致使用旧对话的消息）
    const currentMessages = await aiMessagesApi.getByConversation(conversationId);
    const sortedMessages = currentMessages
      .map(itemToMessage)
      .sort((a, b) => a.createdAt - b.createdAt);

    // 构建消息历史
    const chatMessages: ChatMessage[] = [];
    if (systemPrompt) {
      chatMessages.push({ role: 'system', content: systemPrompt });
    }
    // 使用刚从数据库加载的消息，排除刚刚添加的用户消息（它已经在最后添加）
    sortedMessages.forEach(m => {
      chatMessages.push({ role: m.role, content: m.content });
    });

    // 开始流式响应
    setStreaming(true);
    setStreamingContent('');

    try {
      const response = await callAIApi(channel, {
        model,
        messages: chatMessages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }, (chunk) => {
        setStreamingContent(prev => prev + chunk);
      });

      // 保存助手消息
      const assistantPayload: AIMessagePayload = {
        conversation_id: conversationId,
        role: 'assistant',
        content: response,
        model,
        created_at: Date.now(),
      };
      await aiMessagesApi.create(assistantPayload);

      await loadMessages();
      return response;
    } catch (err) {
      console.error('AI API error:', err);
      throw err;
    } finally {
      setStreaming(false);
      setStreamingContent('');
    }
  }, [conversationId, loadMessages]);

  return {
    messages,
    loading,
    streaming,
    streamingContent,
    sendMessage,
    refresh: loadMessages,
  };
}
