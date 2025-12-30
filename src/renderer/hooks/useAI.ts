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
    title: payload.title,
    model: payload.model,
    systemPrompt: payload.system_prompt,
    temperature: payload.temperature,
    maxTokens: payload.max_tokens,
    createdAt: payload.created_at,
    updatedAt: item.updated_time,
  };
}

function itemToMessage(item: ItemBase): AIMessage {
  const payload = parsePayload<AIMessagePayload>(item);
  return {
    id: item.id,
    conversationId: payload.conversation_id,
    role: payload.role,
    content: payload.content,
    model: payload.model,
    tokensUsed: payload.tokens_used,
    createdAt: payload.created_at,
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

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('ai-settings-updated', handleCustomEvent);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('ai-settings-updated', handleCustomEvent);
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
    const item = await aiConversationsApi.update(id, updates);
    if (item) {
      await loadConversations();
      return itemToConversation(item);
    }
    return null;
  }, [loadConversations]);

  const deleteConversation = useCallback(async (id: string) => {
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
        setMessages(items.map(itemToMessage));
      }
    } catch (err) {
      console.error('Failed to load AI messages:', err);
    } finally {
      setLoading(false);
    }
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

    // 构建消息历史
    const chatMessages: ChatMessage[] = [];
    if (systemPrompt) {
      chatMessages.push({ role: 'system', content: systemPrompt });
    }
    messages.forEach(m => {
      chatMessages.push({ role: m.role, content: m.content });
    });
    chatMessages.push({ role: 'user', content });

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
  }, [conversationId, messages, loadMessages]);

  return {
    messages,
    loading,
    streaming,
    streamingContent,
    sendMessage,
    refresh: loadMessages,
  };
}
