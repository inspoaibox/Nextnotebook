import { useState, useEffect, useCallback, useRef } from 'react';
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
  isOptimistic?: boolean; // 乐观更新标记
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
  
  // 对话列表缓存
  const conversationsCache = useRef<AIConversation[] | null>(null);

  const loadConversations = useCallback(async () => {
    // 先使用缓存快速显示
    if (conversationsCache.current && conversationsCache.current.length > 0) {
      setConversations(conversationsCache.current);
      setLoading(false);
      // 后台静默刷新
      aiConversationsApi.getAll().then(items => {
        if (items && Array.isArray(items)) {
          const list = items.map(itemToConversation);
          list.sort((a, b) => b.updatedAt - a.updatedAt);
          conversationsCache.current = list;
          setConversations(list);
        }
      }).catch(console.error);
      return;
    }
    
    try {
      setLoading(true);
      const items = await aiConversationsApi.getAll();
      if (items && Array.isArray(items)) {
        const list = items.map(itemToConversation);
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        conversationsCache.current = list;
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
      conversationsCache.current = null; // 清除缓存
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
    const now = Date.now();
    const tempId = `temp-conv-${now}`;
    
    // 乐观更新：立即在 UI 显示新对话
    const optimisticConv: AIConversation = {
      id: tempId,
      title,
      model,
      systemPrompt,
      temperature,
      maxTokens,
      createdAt: now,
      updatedAt: now,
    };
    
    setConversations(prev => {
      const updated = [optimisticConv, ...prev];
      conversationsCache.current = updated;
      return updated;
    });
    
    // 后台保存到数据库
    const payload: AIConversationPayload = {
      title,
      model,
      system_prompt: systemPrompt,
      temperature,
      max_tokens: maxTokens,
      created_at: now,
    };
    
    try {
      const item = await aiConversationsApi.create(payload);
      if (item) {
        const realConv = itemToConversation(item);
        // 替换乐观对话为真实对话
        setConversations(prev => {
          const updated = prev.map(c => c.id === tempId ? realConv : c);
          conversationsCache.current = updated;
          return updated;
        });
        return realConv;
      }
    } catch (err) {
      // 失败时移除乐观对话
      setConversations(prev => {
        const updated = prev.filter(c => c.id !== tempId);
        conversationsCache.current = updated;
        return updated;
      });
      console.error('Failed to create conversation:', err);
    }
    return null;
  }, []);

  const updateConversation = useCallback(async (id: string, updates: Partial<AIConversationPayload>) => {
    // 乐观更新
    setConversations(prev => {
      const updated = prev.map(c => {
        if (c.id === id) {
          return {
            ...c,
            title: updates.title ?? c.title,
            model: updates.model ?? c.model,
            systemPrompt: updates.system_prompt ?? c.systemPrompt,
            temperature: updates.temperature ?? c.temperature,
            maxTokens: updates.max_tokens ?? c.maxTokens,
            updatedAt: Date.now(),
          };
        }
        return c;
      });
      conversationsCache.current = updated;
      return updated;
    });
    
    // 后台保存
    try {
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
        return itemToConversation(item);
      }
    } catch (err) {
      console.error('Failed to update conversation:', err);
      // 失败时重新加载
      loadConversations();
    }
    return null;
  }, [loadConversations]);

  const deleteConversation = useCallback(async (id: string) => {
    // 乐观更新：立即从 UI 移除
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id);
      conversationsCache.current = updated;
      return updated;
    });
    
    // 后台删除
    try {
      // 1. 先删除所有关联的消息（级联删除）
      const messages = await aiMessagesApi.getByConversation(id);
      for (const msg of messages) {
        await aiMessagesApi.delete(msg.id);
      }
      // 2. 再删除对话本身
      await aiConversationsApi.delete(id);
      return true;
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      // 失败时重新加载
      loadConversations();
      return false;
    }
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
  
  // 消息缓存，避免频繁从数据库加载
  const messagesCache = useRef<Map<string, AIMessage[]>>(new Map());
  // 流式响应防抖
  const streamBufferRef = useRef('');
  const streamUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    
    // 先检查缓存
    const cached = messagesCache.current.get(conversationId);
    if (cached && cached.length > 0) {
      setMessages(cached);
      // 后台静默刷新
      aiMessagesApi.getByConversation(conversationId).then(items => {
        if (items) {
          const msgs = items.map(itemToMessage);
          msgs.sort((a, b) => a.createdAt - b.createdAt);
          messagesCache.current.set(conversationId, msgs);
          setMessages(msgs);
        }
      }).catch(console.error);
      return;
    }
    
    try {
      setLoading(true);
      const items = await aiMessagesApi.getByConversation(conversationId);
      if (items) {
        const msgs = items.map(itemToMessage);
        msgs.sort((a, b) => a.createdAt - b.createdAt);
        messagesCache.current.set(conversationId, msgs);
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
    streamBufferRef.current = '';
    if (streamUpdateTimerRef.current) {
      clearTimeout(streamUpdateTimerRef.current);
      streamUpdateTimerRef.current = null;
    }
  }, [conversationId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // 防抖更新流式内容（每 50ms 更新一次 UI，减少重渲染）
  const updateStreamingContent = useCallback((chunk: string) => {
    streamBufferRef.current += chunk;
    
    if (!streamUpdateTimerRef.current) {
      streamUpdateTimerRef.current = setTimeout(() => {
        setStreamingContent(streamBufferRef.current);
        streamUpdateTimerRef.current = null;
      }, 50);
    }
  }, []);

  const sendMessage = useCallback(async (
    content: string,
    channel: AIChannel,
    model: string,
    systemPrompt: string,
    temperature: number,
    maxTokens: number
  ) => {
    if (!conversationId) return null;

    const now = Date.now();
    const tempUserId = `temp-user-${now}`;
    
    // 1. 乐观更新：立即在 UI 显示用户消息
    const optimisticUserMsg: AIMessage = {
      id: tempUserId,
      conversationId,
      role: 'user',
      content,
      model,
      createdAt: now,
      isOptimistic: true,
    };
    
    setMessages(prev => {
      const updated = [...prev, optimisticUserMsg];
      messagesCache.current.set(conversationId, updated);
      return updated;
    });

    // 2. 并行：保存用户消息到数据库（不阻塞 API 请求）
    const userPayload: AIMessagePayload = {
      conversation_id: conversationId,
      role: 'user',
      content,
      model,
      created_at: now,
    };
    const saveUserMsgPromise = aiMessagesApi.create(userPayload);

    // 3. 构建消息历史（使用当前内存中的消息，不重新从数据库加载）
    const chatMessages: ChatMessage[] = [];
    if (systemPrompt) {
      chatMessages.push({ role: 'system', content: systemPrompt });
    }
    // 使用当前消息列表（不包括刚添加的乐观消息，因为它已经在 content 中）
    // 过滤掉空内容的消息（某些 API 如月之暗面不允许空的 assistant 消息）
    messages.forEach(m => {
      // 跳过空内容的消息
      if (!m.content || m.content.trim() === '') {
        return;
      }
      chatMessages.push({ role: m.role, content: m.content });
    });
    // 添加当前用户消息
    chatMessages.push({ role: 'user', content });

    // 4. 开始流式响应
    setStreaming(true);
    setStreamingContent('');
    streamBufferRef.current = '';

    try {
      const response = await callAIApi(channel, {
        model,
        messages: chatMessages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }, updateStreamingContent);

      // 确保最后一次更新
      if (streamUpdateTimerRef.current) {
        clearTimeout(streamUpdateTimerRef.current);
        streamUpdateTimerRef.current = null;
      }
      setStreamingContent(streamBufferRef.current);

      // 5. 等待用户消息保存完成
      const savedUserMsg = await saveUserMsgPromise;

      // 6. 保存助手消息（只有非空内容才保存）
      let savedAssistantMsg = null;
      if (response && response.trim()) {
        const assistantPayload: AIMessagePayload = {
          conversation_id: conversationId,
          role: 'assistant',
          content: response,
          model,
          created_at: Date.now(),
        };
        savedAssistantMsg = await aiMessagesApi.create(assistantPayload);
      }

      // 7. 更新消息列表（替换乐观消息为真实消息）
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== tempUserId);
        const newMsgs = [
          ...filtered,
          savedUserMsg ? itemToMessage(savedUserMsg) : optimisticUserMsg,
        ];
        // 只有非空响应才添加助手消息
        if (response && response.trim()) {
          newMsgs.push(
            savedAssistantMsg ? itemToMessage(savedAssistantMsg) : {
              id: `temp-assistant-${Date.now()}`,
              conversationId,
              role: 'assistant' as const,
              content: response,
              model,
              createdAt: Date.now(),
            }
          );
        }
        messagesCache.current.set(conversationId, newMsgs);
        return newMsgs;
      });

      return response;
    } catch (err) {
      // 发生错误时，移除乐观消息
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== tempUserId);
        messagesCache.current.set(conversationId, filtered);
        return filtered;
      });
      console.error('AI API error:', err);
      throw err;
    } finally {
      setStreaming(false);
      setStreamingContent('');
      streamBufferRef.current = '';
    }
  }, [conversationId, messages, updateStreamingContent]);

  // 清除缓存（用于同步后刷新）
  const clearCache = useCallback(() => {
    messagesCache.current.clear();
  }, []);

  return {
    messages,
    loading,
    streaming,
    streamingContent,
    sendMessage,
    refresh: loadMessages,
    clearCache,
  };
}
