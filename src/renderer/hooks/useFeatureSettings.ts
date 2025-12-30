import { useState, useEffect, useCallback } from 'react';
import { FeatureSettings } from '@shared/types';

const FEATURE_SETTINGS_KEY = 'mucheng-feature-settings';

const DEFAULT_SETTINGS: FeatureSettings = {
  ai_enabled: false,
  todo_enabled: true,
  vault_enabled: true,
  bookmark_enabled: true,
};

function getSettings(): FeatureSettings {
  const saved = localStorage.getItem(FEATURE_SETTINGS_KEY);
  if (saved) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch { /* ignore */ }
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: FeatureSettings): void {
  localStorage.setItem(FEATURE_SETTINGS_KEY, JSON.stringify(settings));
  // 触发自定义事件通知其他组件
  window.dispatchEvent(new Event('feature-settings-updated'));
}

export function useFeatureSettings() {
  const [settings, setSettings] = useState<FeatureSettings>(() => getSettings());

  // 监听设置变化
  useEffect(() => {
    const handleUpdate = () => {
      setSettings(getSettings());
    };

    window.addEventListener('feature-settings-updated', handleUpdate);
    window.addEventListener('storage', (e) => {
      if (e.key === FEATURE_SETTINGS_KEY) handleUpdate();
    });

    return () => {
      window.removeEventListener('feature-settings-updated', handleUpdate);
    };
  }, []);

  const updateSettings = useCallback((updates: Partial<FeatureSettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  return {
    settings,
    updateSettings,
  };
}
