import { ItemBase, ItemType, AIConversationPayload, AIMessagePayload, AIChannel, AISettings } from '@shared/types';
import { itemsApi } from './itemsApi';

// 解析 payload 的辅助函数
export function parsePayload<T>(item: ItemBase): T {
  return JSON.parse(item.payload) as T;
}

// AI 对话 API
export const aiConversationsApi = {
  create: (payload: AIConversationPayload): Promise<ItemBase> =>
    itemsApi.create('ai_conversation', payload),

  getAll: (): Promise<ItemBase[]> =>
    itemsApi.getByType('ai_conversation'),

  update: (id: string, payload: Partial<AIConversationPayload>): Promise<ItemBase | undefined> =>
    itemsApi.update(id, payload),

  delete: (id: string): Promise<boolean> =>
    itemsApi.delete(id),
};

// AI 消息 API
export const aiMessagesApi = {
  create: (payload: AIMessagePayload): Promise<ItemBase> =>
    itemsApi.create('ai_message', payload),

  getByConversation: async (conversationId: string): Promise<ItemBase[]> => {
    const allMessages = await itemsApi.getByType('ai_message');
    return allMessages.filter(item => {
      const payload = parsePayload<AIMessagePayload>(item);
      return payload.conversation_id === conversationId;
    }).sort((a, b) => {
      const pa = parsePayload<AIMessagePayload>(a);
      const pb = parsePayload<AIMessagePayload>(b);
      return pa.created_at - pb.created_at;
    });
  },

  delete: (id: string): Promise<boolean> =>
    itemsApi.delete(id),
};

// AI 设置存储
const AI_SETTINGS_KEY = 'mucheng-ai-settings';

export const aiSettingsApi = {
  get: (): AISettings => {
    const saved = localStorage.getItem(AI_SETTINGS_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch { /* ignore */ }
    }
    return {
      enabled: false,
      default_channel: '',
      default_model: '',
      channels: [],
    };
  },

  save: (settings: AISettings): void => {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  },
};

// AI API 调用
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export async function callAIApi(
  channel: AIChannel,
  options: ChatCompletionOptions,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const { api_url, api_key, type } = channel;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 根据渠道类型设置认证头
  if (type === 'openai' || type === 'custom') {
    headers['Authorization'] = `Bearer ${api_key}`;
  } else if (type === 'anthropic') {
    headers['x-api-key'] = api_key;
    headers['anthropic-version'] = '2023-06-01';
  }

  // 构建请求体
  let body: any;
  if (type === 'anthropic') {
    // Anthropic API 格式
    const systemMsg = options.messages.find(m => m.role === 'system');
    const otherMsgs = options.messages.filter(m => m.role !== 'system');
    body = {
      model: options.model,
      max_tokens: options.max_tokens || 4096,
      messages: otherMsgs,
      ...(systemMsg && { system: systemMsg.content }),
      ...(options.temperature !== undefined && { temperature: options.temperature }),
    };
  } else {
    // OpenAI 兼容格式
    body = {
      model: options.model,
      messages: options.messages,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.max_tokens && { max_tokens: options.max_tokens }),
      stream: options.stream || false,
    };
  }

  // 流式响应处理
  if (options.stream && onChunk) {
    const response = await fetch(api_url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, stream: true }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 请求失败: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法读取响应流');

    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

      for (const line of lines) {
        const data = line.replace('data:', '').trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          let content = '';
          
          if (type === 'anthropic') {
            content = json.delta?.text || '';
          } else {
            content = json.choices?.[0]?.delta?.content || '';
          }

          if (content) {
            fullContent += content;
            onChunk(content);
          }
        } catch { /* ignore parse errors */ }
      }
    }

    return fullContent;
  }

  // 非流式响应
  const response = await fetch(api_url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API 请求失败: ${response.status} - ${error}`);
  }

  const data = await response.json();

  if (type === 'anthropic') {
    return data.content?.[0]?.text || '';
  }
  return data.choices?.[0]?.message?.content || '';
}

// 预设渠道模板
export const PRESET_CHANNELS: Partial<AIChannel>[] = [
  {
    name: 'OpenAI',
    type: 'openai',
    api_url: 'https://api.openai.com/v1/chat/completions',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', channel_id: '', max_tokens: 128000, is_custom: false },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', channel_id: '', max_tokens: 128000, is_custom: false },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', channel_id: '', max_tokens: 128000, is_custom: false },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', channel_id: '', max_tokens: 16385, is_custom: false },
    ],
  },
  {
    name: 'Anthropic',
    type: 'anthropic',
    api_url: 'https://api.anthropic.com/v1/messages',
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', channel_id: '', max_tokens: 200000, is_custom: false },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', channel_id: '', max_tokens: 200000, is_custom: false },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', channel_id: '', max_tokens: 200000, is_custom: false },
    ],
  },
  {
    name: '自定义 OpenAI 兼容',
    type: 'custom',
    api_url: '',
    models: [],
  },
];
