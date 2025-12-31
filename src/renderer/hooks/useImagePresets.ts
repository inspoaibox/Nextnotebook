/**
 * useImagePresets - 图片处理预设管理 Hook
 * 支持内置预设和自定义预设的管理
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { ProcessOptions } from '../services/imageApi';
import { ImageToolType } from './useImageHistory';

// 预设接口
export interface Preset {
  id: string;
  name: string;
  description: string;
  category: 'builtin' | 'custom';
  toolType: ImageToolType;
  options: ProcessOptions;
}

// localStorage 存储键
const STORAGE_KEY = 'image-tool-presets';

// 生成唯一 ID
const generateId = (): string => {
  return `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// 内置预设
export const BUILTIN_PRESETS: Preset[] = [
  // Web 优化
  {
    id: 'web-optimize',
    name: 'Web 优化',
    description: '适合网页使用，平衡质量和文件大小',
    category: 'builtin',
    toolType: 'compress',
    options: {
      format: 'webp',
      quality: 80,
      stripMetadata: true,
    },
  },
  // 高质量 JPEG
  {
    id: 'high-quality-jpeg',
    name: '高质量 JPEG',
    description: '高质量 JPEG 输出，适合打印',
    category: 'builtin',
    toolType: 'compress',
    options: {
      format: 'jpeg',
      quality: 95,
      progressive: true,
    },
  },
  // 社交媒体 - 微信朋友圈
  {
    id: 'wechat-moments',
    name: '微信朋友圈',
    description: '1080×1080 正方形',
    category: 'builtin',
    toolType: 'resize',
    options: {
      resize: { width: 1080, height: 1080, fit: 'cover' },
    },
  },
  // 社交媒体 - 微博
  {
    id: 'weibo',
    name: '微博配图',
    description: '1200×675 横版',
    category: 'builtin',
    toolType: 'resize',
    options: {
      resize: { width: 1200, height: 675, fit: 'cover' },
    },
  },
  // 社交媒体 - 小红书
  {
    id: 'xiaohongshu',
    name: '小红书配图',
    description: '1080×1440 竖版',
    category: 'builtin',
    toolType: 'resize',
    options: {
      resize: { width: 1080, height: 1440, fit: 'cover' },
    },
  },
  // 头像裁剪 - 方形
  {
    id: 'avatar-square',
    name: '方形头像',
    description: '200×200 正方形头像',
    category: 'builtin',
    toolType: 'crop',
    options: {
      resize: { width: 200, height: 200, fit: 'cover' },
    },
  },
  // 头像裁剪 - 圆形（实际是方形，UI 可以显示为圆形）
  {
    id: 'avatar-large',
    name: '大头像',
    description: '400×400 大尺寸头像',
    category: 'builtin',
    toolType: 'crop',
    options: {
      resize: { width: 400, height: 400, fit: 'cover' },
    },
  },
  // 缩略图
  {
    id: 'thumbnail-small',
    name: '小缩略图',
    description: '150×150 小图',
    category: 'builtin',
    toolType: 'resize',
    options: {
      resize: { width: 150, height: 150, fit: 'inside' },
    },
  },
  // 中等缩略图
  {
    id: 'thumbnail-medium',
    name: '中缩略图',
    description: '300×300 中图',
    category: 'builtin',
    toolType: 'resize',
    options: {
      resize: { width: 300, height: 300, fit: 'inside' },
    },
  },
  // 灰度效果
  {
    id: 'grayscale',
    name: '灰度效果',
    description: '转换为黑白图片',
    category: 'builtin',
    toolType: 'color-adjust',
    options: {
      grayscale: true,
    },
  },
  // 高对比度
  {
    id: 'high-contrast',
    name: '高对比度',
    description: '增强对比度和饱和度',
    category: 'builtin',
    toolType: 'color-adjust',
    options: {
      modulate: {
        brightness: 1.1,
        saturation: 1.3,
      },
    },
  },
  // 柔和效果
  {
    id: 'soft-blur',
    name: '柔和效果',
    description: '轻微模糊，柔化图片',
    category: 'builtin',
    toolType: 'filters',
    options: {
      blur: 1.5,
    },
  },
  // 锐化效果
  {
    id: 'sharpen',
    name: '锐化效果',
    description: '增强图片清晰度',
    category: 'builtin',
    toolType: 'filters',
    options: {
      sharpen: { sigma: 1.5 },
    },
  },
];

/**
 * 图片处理预设管理 Hook
 */
export function useImagePresets() {
  // 自定义预设
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);

  // 从 localStorage 加载自定义预设
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCustomPresets(parsed);
        }
      }
    } catch (error) {
      console.error('Failed to load custom presets:', error);
    }
  }, []);

  // 保存自定义预设到 localStorage
  const saveToStorage = useCallback((presets: Preset[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    } catch (error) {
      console.error('Failed to save custom presets:', error);
    }
  }, []);

  /**
   * 获取指定工具类型的所有预设
   */
  const getPresets = useCallback((toolType: ImageToolType): Preset[] => {
    const builtinForTool = BUILTIN_PRESETS.filter(p => p.toolType === toolType);
    const customForTool = customPresets.filter(p => p.toolType === toolType);
    return [...builtinForTool, ...customForTool];
  }, [customPresets]);

  /**
   * 获取所有预设
   */
  const allPresets = useMemo(() => {
    return [...BUILTIN_PRESETS, ...customPresets];
  }, [customPresets]);

  /**
   * 应用预设，返回预设的选项
   */
  const applyPreset = useCallback((preset: Preset): ProcessOptions => {
    return { ...preset.options };
  }, []);

  /**
   * 保存当前设置为自定义预设
   */
  const saveCustomPreset = useCallback((
    name: string,
    description: string,
    toolType: ImageToolType,
    options: ProcessOptions
  ): Preset => {
    const newPreset: Preset = {
      id: generateId(),
      name,
      description,
      category: 'custom',
      toolType,
      options: { ...options },
    };

    const updatedPresets = [...customPresets, newPreset];
    setCustomPresets(updatedPresets);
    saveToStorage(updatedPresets);

    return newPreset;
  }, [customPresets, saveToStorage]);

  /**
   * 删除自定义预设
   */
  const deleteCustomPreset = useCallback((id: string): boolean => {
    const preset = customPresets.find(p => p.id === id);
    if (!preset) {
      return false;
    }

    const updatedPresets = customPresets.filter(p => p.id !== id);
    setCustomPresets(updatedPresets);
    saveToStorage(updatedPresets);

    return true;
  }, [customPresets, saveToStorage]);

  /**
   * 更新自定义预设
   */
  const updateCustomPreset = useCallback((
    id: string,
    updates: Partial<Omit<Preset, 'id' | 'category'>>
  ): boolean => {
    const index = customPresets.findIndex(p => p.id === id);
    if (index === -1) {
      return false;
    }

    const updatedPresets = [...customPresets];
    updatedPresets[index] = {
      ...updatedPresets[index],
      ...updates,
    };

    setCustomPresets(updatedPresets);
    saveToStorage(updatedPresets);

    return true;
  }, [customPresets, saveToStorage]);

  /**
   * 根据 ID 获取预设
   */
  const getPresetById = useCallback((id: string): Preset | undefined => {
    return allPresets.find(p => p.id === id);
  }, [allPresets]);

  /**
   * 清空所有自定义预设
   */
  const clearCustomPresets = useCallback(() => {
    setCustomPresets([]);
    saveToStorage([]);
  }, [saveToStorage]);

  return {
    // 状态
    builtinPresets: BUILTIN_PRESETS,
    customPresets,
    allPresets,

    // 方法
    getPresets,
    applyPreset,
    saveCustomPreset,
    deleteCustomPreset,
    updateCustomPreset,
    getPresetById,
    clearCustomPresets,
  };
}

export default useImagePresets;
