/**
 * useImageSettings - 图片处理设置持久化 Hook
 * 记住用户的设置偏好
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { ProcessOptions } from '../services/imageApi';
import { ImageToolType } from './useImageHistory';

// 用户设置接口
export interface UserSettings {
  // 实时预览开关
  realTimePreview: boolean;
  // 最后使用的工具
  lastUsedTool: ImageToolType;
  // 每个工具的最后使用设置
  toolSettings: Partial<Record<ImageToolType, Partial<ProcessOptions>>>;
}

// 默认设置
const DEFAULT_SETTINGS: UserSettings = {
  realTimePreview: true,
  lastUsedTool: 'format-convert',
  toolSettings: {},
};

// localStorage 存储键
const STORAGE_KEY = 'image-tool-settings';

/**
 * 从 localStorage 加载设置
 */
function loadSettings(): UserSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
    }
  } catch (error) {
    console.error('Failed to load image settings:', error);
  }
  return DEFAULT_SETTINGS;
}

/**
 * 保存设置到 localStorage
 */
function saveSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save image settings:', error);
  }
}

/**
 * 图片处理设置持久化 Hook
 */
export function useImageSettings() {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());

  // 保存设置变更
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  /**
   * 更新实时预览开关
   */
  const setRealTimePreview = useCallback((enabled: boolean) => {
    setSettings(prev => ({
      ...prev,
      realTimePreview: enabled,
    }));
  }, []);

  /**
   * 更新最后使用的工具
   */
  const setLastUsedTool = useCallback((tool: ImageToolType) => {
    setSettings(prev => ({
      ...prev,
      lastUsedTool: tool,
    }));
  }, []);

  /**
   * 获取指定工具的设置
   */
  const getToolSettings = useCallback((toolType: ImageToolType): Partial<ProcessOptions> => {
    return settings.toolSettings[toolType] || {};
  }, [settings.toolSettings]);

  /**
   * 保存指定工具的设置
   */
  const saveToolSettings = useCallback((toolType: ImageToolType, options: Partial<ProcessOptions>) => {
    setSettings(prev => ({
      ...prev,
      toolSettings: {
        ...prev.toolSettings,
        [toolType]: {
          ...prev.toolSettings[toolType],
          ...options,
        },
      },
    }));
  }, []);

  /**
   * 清除指定工具的设置
   */
  const clearToolSettings = useCallback((toolType: ImageToolType) => {
    setSettings(prev => {
      const newToolSettings = { ...prev.toolSettings };
      delete newToolSettings[toolType];
      return {
        ...prev,
        toolSettings: newToolSettings,
      };
    });
  }, []);

  /**
   * 重置所有设置为默认值
   */
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  /**
   * 获取所有设置
   */
  const allSettings = useMemo(() => settings, [settings]);

  return {
    // 状态
    realTimePreview: settings.realTimePreview,
    lastUsedTool: settings.lastUsedTool,
    allSettings,

    // 方法
    setRealTimePreview,
    setLastUsedTool,
    getToolSettings,
    saveToolSettings,
    clearToolSettings,
    resetSettings,
  };
}

export default useImageSettings;
