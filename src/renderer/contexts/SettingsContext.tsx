import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AppSettings, SyncConfig } from '@shared/types';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'zh-CN',
  font_size: 14,
  auto_save: true,
  auto_save_interval: 30,
  show_line_numbers: true,
  spell_check: false,
};

const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  type: 'webdav',
  url: '',
  sync_path: '/mucheng-notes',  // 默认同步目录
  username: '',
  password: '',
  encryption_enabled: false,
  sync_interval: 5,
  last_sync_time: null,
  sync_cursor: null,
};

interface SettingsContextType {
  settings: AppSettings;
  syncConfig: SyncConfig;
  updateSettings: (updates: Partial<AppSettings>) => void;
  updateSyncConfig: (updates: Partial<SyncConfig>) => void;
  resetSettings: () => void;
  isDarkMode: boolean;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(DEFAULT_SYNC_CONFIG);
  const [systemDarkMode, setSystemDarkMode] = useState(false);

  // 监听系统主题变化
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDarkMode(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setSystemDarkMode(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // 从本地存储加载设置
  useEffect(() => {
    const savedSettings = localStorage.getItem('mucheng-settings');
    if (savedSettings) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }

    const savedSyncConfig = localStorage.getItem('mucheng-sync-config');
    if (savedSyncConfig) {
      try {
        setSyncConfig({ ...DEFAULT_SYNC_CONFIG, ...JSON.parse(savedSyncConfig) });
      } catch (e) {
        console.error('Failed to load sync config:', e);
      }
    }
  }, []);

  // 保存设置到本地存储
  const saveSettings = useCallback((newSettings: AppSettings) => {
    localStorage.setItem('mucheng-settings', JSON.stringify(newSettings));
  }, []);

  const saveSyncConfig = useCallback((newConfig: SyncConfig) => {
    // 不保存敏感信息到 localStorage
    const safeConfig = { ...newConfig, password: undefined, api_key: undefined };
    localStorage.setItem('mucheng-sync-config', JSON.stringify(safeConfig));
  }, []);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev: AppSettings) => {
      const newSettings = { ...prev, ...updates };
      saveSettings(newSettings);
      return newSettings;
    });
  }, [saveSettings]);

  const updateSyncConfig = useCallback((updates: Partial<SyncConfig>) => {
    setSyncConfig((prev: SyncConfig) => {
      const newConfig = { ...prev, ...updates };
      saveSyncConfig(newConfig);
      return newConfig;
    });
  }, [saveSyncConfig]);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
  }, [saveSettings]);

  // 计算是否为深色模式
  const isDarkMode = settings.theme === 'dark' || (settings.theme === 'system' && systemDarkMode);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        syncConfig,
        updateSettings,
        updateSyncConfig,
        resetSettings,
        isDarkMode,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
