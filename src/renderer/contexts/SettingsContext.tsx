import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AppSettings, SyncConfig, DEFAULT_SYNC_MODULES } from '@shared/types';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'zh-CN',
  font_size: 14,
  auto_save: true,
  auto_save_interval: 30,
  show_line_numbers: true,
  spell_check: false,
  auto_launch: false,
  close_to_tray: false,
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
  sync_modules: DEFAULT_SYNC_MODULES,
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
  // 调试：在组件挂载时打印 localStorage 状态
  console.log('[SettingsProvider] Component mounting...');
  console.log('[SettingsProvider] localStorage keys:', Object.keys(localStorage));
  console.log('[SettingsProvider] mucheng-sync-config raw:', localStorage.getItem('mucheng-sync-config'));
  
  // 使用惰性初始化，在组件首次渲染时就从 localStorage 读取配置
  const [settings, setSettings] = useState<AppSettings>(() => {
    const savedSettings = localStorage.getItem('mucheng-settings');
    if (savedSettings) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
    return DEFAULT_SETTINGS;
  });
  
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => {
    const savedSyncConfig = localStorage.getItem('mucheng-sync-config');
    console.log('[SettingsContext] Initial load sync config from localStorage:', savedSyncConfig);
    if (savedSyncConfig) {
      try {
        const parsed = JSON.parse(savedSyncConfig);
        console.log('[SettingsContext] Initial parsed sync config:', parsed);
        return { ...DEFAULT_SYNC_CONFIG, ...parsed };
      } catch (e) {
        console.error('Failed to load sync config:', e);
      }
    }
    return DEFAULT_SYNC_CONFIG;
  });
  
  const [systemDarkMode, setSystemDarkMode] = useState(false);

  // 监听系统主题变化
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDarkMode(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setSystemDarkMode(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // 从本地存储加载设置 - 仅用于同步主题到主进程
  useEffect(() => {
    // 同步主题设置到主进程（确保下次启动时背景色正确）
    const api = (window as any).electronAPI;
    if (api?.saveThemeSettings) {
      api.saveThemeSettings({ theme: settings.theme }).catch(() => {});
    }
  }, [settings.theme]);

  // 保存设置到本地存储
  const saveSettings = useCallback(async (newSettings: AppSettings) => {
    localStorage.setItem('mucheng-settings', JSON.stringify(newSettings));
    
    // 同时保存主题设置到主进程可读取的文件（用于启动时背景色）
    try {
      const api = (window as any).electronAPI;
      if (api?.saveThemeSettings) {
        await api.saveThemeSettings({ theme: newSettings.theme });
      }
    } catch (e) {
      console.warn('Failed to save theme to main process:', e);
    }
  }, []);

  const saveSyncConfig = useCallback((newConfig: SyncConfig) => {
    // 保存完整配置到 localStorage（包括密码）
    // 注意：在生产环境中应该使用更安全的存储方式如 keytar
    console.log('[SettingsContext] Saving sync config to localStorage:', newConfig);
    const jsonStr = JSON.stringify(newConfig);
    localStorage.setItem('mucheng-sync-config', jsonStr);
    
    // 立即验证保存是否成功
    const saved = localStorage.getItem('mucheng-sync-config');
    console.log('[SettingsContext] Verification - saved value:', saved);
    console.log('[SettingsContext] Verification - match:', saved === jsonStr);
    
    // 列出所有 localStorage keys
    console.log('[SettingsContext] All localStorage keys:', Object.keys(localStorage));
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
