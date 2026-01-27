import { ItemBase, AIConversationPayload, AIMessagePayload, AIChannel, AISettings } from '@shared/types';
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
    // 尝试使用优化的查询方法（如果可用）
    const api = (window as any).electronAPI;
    if (api?.items?.getByTypeAndFilter) {
      try {
        // 使用数据库级别的过滤（更高效）
        const items = await api.items.getByTypeAndFilter('ai_message', { conversation_id: conversationId });
        if (items) {
          return items.sort((a: ItemBase, b: ItemBase) => {
            const pa = parsePayload<AIMessagePayload>(a);
            const pb = parsePayload<AIMessagePayload>(b);
            return pa.created_at - pb.created_at;
          });
        }
      } catch {
        // 回退到原始方法
      }
    }
    
    // 原始方法：加载所有消息后过滤
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

// AI 设置存储 - 使用数据库存储以支持同步
const AI_SETTINGS_KEY = 'mucheng-ai-settings';
const AI_CONFIG_ID = 'ai-config-singleton'; // 使用固定 ID 确保只有一条配置记录

export const aiSettingsApi = {
  // 从数据库获取 AI 配置，如果不存在则返回默认值
  get: (): AISettings => {
    // 先尝试从 localStorage 获取（兼容旧数据）
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

  // 保存 AI 配置到 localStorage（同时会通过数据库同步）
  save: (settings: AISettings): void => {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
    // 同时保存到数据库以支持同步
    aiSettingsApi.saveToDb(settings);
  },

  // 保存到数据库
  saveToDb: async (settings: AISettings): Promise<void> => {
    try {
      const api = (window as any).electronAPI;
      if (!api?.items) return;

      // 检查是否已存在配置记录
      const existing = await api.items.getById(AI_CONFIG_ID);
      
      const payload = {
        enabled: settings.enabled,
        default_channel: settings.default_channel,
        default_model: settings.default_model,
        channels: settings.channels,
      };

      if (existing) {
        // 更新现有记录
        await api.items.update(AI_CONFIG_ID, payload);
      } else {
        // 创建新记录（使用固定 ID）
        // 注意：需要通过特殊方式创建带固定 ID 的记录
        await api.items.create('ai_config', { ...payload, _id: AI_CONFIG_ID });
      }
    } catch (err) {
      console.error('Failed to save AI settings to database:', err);
    }
  },

  // 从数据库加载（用于同步后更新本地）
  loadFromDb: async (): Promise<AISettings | null> => {
    try {
      const api = (window as any).electronAPI;
      if (!api?.items) return null;

      const items = await api.items.getByType('ai_config');
      if (items && items.length > 0) {
        const payload = JSON.parse(items[0].payload);
        return {
          enabled: payload.enabled ?? false,
          default_channel: payload.default_channel ?? '',
          default_model: payload.default_model ?? '',
          channels: payload.channels ?? [],
        };
      }
    } catch (err) {
      console.error('Failed to load AI settings from database:', err);
    }
    return null;
  },
};

// AI API 调用
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
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
  let { api_url, api_key, type } = channel;
  
  // Gemini API 使用不同的 URL 和格式
  if (type === 'gemini') {
    return callGeminiApi(api_url, api_key, options, onChunk);
  }
  
  // 自动补全 OpenAI 兼容的 API 地址（用户只需填 https://xxx/v1）
  if ((type === 'openai' || type === 'custom') && !api_url.endsWith('/chat/completions')) {
    api_url = api_url.replace(/\/$/, '') + '/chat/completions';
  }
  
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
    const otherMsgs = options.messages.filter(m => m.role !== 'system').map(msg => {
      // Anthropic 支持多模态内容
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role,
          content: msg.content.map(part => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text };
            } else if (part.type === 'image_url') {
              // Anthropic 使用 image 类型，需要提取 base64 数据
              const base64Data = part.image_url?.url.split(',')[1] || '';
              const mediaType = part.image_url?.url.match(/data:(.*?);/)?.[1] || 'image/jpeg';
              return {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Data,
                },
              };
            }
            return part;
          }),
        };
      }
      return { role: msg.role, content: msg.content };
    });
    body = {
      model: options.model,
      max_tokens: options.max_tokens || 4096,
      messages: otherMsgs,
      ...(systemMsg && { system: typeof systemMsg.content === 'string' ? systemMsg.content : '' }),
      ...(options.temperature !== undefined && { temperature: options.temperature }),
    };
  } else {
    // OpenAI 兼容格式（支持多模态）
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

// Gemini API 调用
async function callGeminiApi(
  baseUrl: string,
  apiKey: string,
  options: ChatCompletionOptions,
  onChunk?: (chunk: string) => void
): Promise<string> {
  // Gemini API URL 格式: {baseUrl}/models/{model}:generateContent?key={apiKey}
  // 或流式: {baseUrl}/models/{model}:streamGenerateContent?key={apiKey}
  const isStream = options.stream && onChunk;
  const endpoint = isStream ? 'streamGenerateContent' : 'generateContent';
  const url = `${baseUrl}/models/${options.model}:${endpoint}?key=${apiKey}`;
  
  // 转换消息格式为 Gemini 格式
  const contents: any[] = [];
  let systemInstruction: string | undefined;
  
  for (const msg of options.messages) {
    if (msg.role === 'system') {
      systemInstruction = typeof msg.content === 'string' ? msg.content : '';
    } else {
      // Gemini 支持多模态内容
      if (Array.isArray(msg.content)) {
        const parts: any[] = [];
        for (const part of msg.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'image_url') {
            // Gemini 使用 inline_data 格式
            const base64Data = part.image_url?.url.split(',')[1] || '';
            const mimeType = part.image_url?.url.match(/data:(.*?);/)?.[1] || 'image/jpeg';
            parts.push({
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            });
          }
        }
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts,
        });
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }
  }
  
  const body: any = {
    contents,
    generationConfig: {
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.max_tokens && { maxOutputTokens: options.max_tokens }),
    },
  };
  
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API 请求失败: ${response.status} - ${error}`);
  }
  
  // 流式响应
  if (isStream && onChunk) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法读取响应流');
    
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Gemini 流式响应是 JSON 数组格式
      // 尝试解析完整的 JSON 对象
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '[' || trimmed === ']' || trimmed === ',') continue;
        
        try {
          // 移除可能的前导逗号
          const jsonStr = trimmed.startsWith(',') ? trimmed.slice(1) : trimmed;
          const json = JSON.parse(jsonStr);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            fullContent += text;
            onChunk(text);
          }
        } catch { /* ignore parse errors */ }
      }
    }
    
    return fullContent;
  }
  
  // 非流式响应
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// 预设渠道模板
export const PRESET_CHANNELS: Partial<AIChannel>[] = [
  {
    name: 'OpenAI',
    type: 'openai',
    api_url: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', channel_id: '', max_tokens: 128000, is_custom: false },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', channel_id: '', max_tokens: 128000, is_custom: false },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', channel_id: '', max_tokens: 128000, is_custom: false },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', channel_id: '', max_tokens: 16385, is_custom: false },
    ],
  },
  {
    name: 'Google Gemini',
    type: 'gemini',
    api_url: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', channel_id: '', max_tokens: 1048576, is_custom: false },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', channel_id: '', max_tokens: 2097152, is_custom: false },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', channel_id: '', max_tokens: 1048576, is_custom: false },
      { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash-8B', channel_id: '', max_tokens: 1048576, is_custom: false },
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
    name: 'DeepSeek',
    type: 'custom',
    api_url: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', channel_id: '', max_tokens: 64000, is_custom: false },
      { id: 'deepseek-coder', name: 'DeepSeek Coder', channel_id: '', max_tokens: 64000, is_custom: false },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', channel_id: '', max_tokens: 64000, is_custom: false },
    ],
  },
  {
    name: '月之暗面 (Moonshot)',
    type: 'custom',
    api_url: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'moonshot-v1-8k', name: 'Moonshot V1 8K', channel_id: '', max_tokens: 8192, is_custom: false },
      { id: 'moonshot-v1-32k', name: 'Moonshot V1 32K', channel_id: '', max_tokens: 32768, is_custom: false },
      { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K', channel_id: '', max_tokens: 131072, is_custom: false },
    ],
  },
  {
    name: '智谱 AI',
    type: 'custom',
    api_url: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4', name: 'GLM-4', channel_id: '', max_tokens: 128000, is_custom: false },
      { id: 'glm-4-flash', name: 'GLM-4 Flash', channel_id: '', max_tokens: 128000, is_custom: false },
      { id: 'glm-3-turbo', name: 'GLM-3 Turbo', channel_id: '', max_tokens: 128000, is_custom: false },
    ],
  },
  {
    name: '通义千问',
    type: 'custom',
    api_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-turbo', name: 'Qwen Turbo', channel_id: '', max_tokens: 8192, is_custom: false },
      { id: 'qwen-plus', name: 'Qwen Plus', channel_id: '', max_tokens: 32768, is_custom: false },
      { id: 'qwen-max', name: 'Qwen Max', channel_id: '', max_tokens: 32768, is_custom: false },
    ],
  },
  {
    name: '自定义 OpenAI 兼容',
    type: 'custom',
    api_url: '',
    models: [],
  },
];
