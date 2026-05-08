import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { AppSettings, SyncConfig, SyncModules, DEFAULT_SYNC_MODULES } from '@shared/types';

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
  sync_path: '/mucheng-notes',
  username: '',
  password: '',
  sync_interval: 5,
  last_sync_time: null,
  sync_cursor: null,
  sync_modules: DEFAULT_SYNC_MODULES,
};

function getSyncConfigBackup(config: SyncConfig): Partial<SyncConfig> {
  return {
    ...config,
    password: undefined,
    api_key: undefined,
    server_password: undefined,
    server_sync_key: undefined,
    server_token: undefined,
    server_refresh_token: undefined,
    server_token_expires: undefined,
  };
}

interface SettingsContextType {
  settings: AppSettings;
  syncConfig: SyncConfig;
  syncConfigLoaded: boolean;
  updateSettings: (updates: Partial<AppSettings>) => void;
  updateSyncConfig: (updates: Partial<SyncConfig>) => void;
  // 独立的同步配置更新方法（参考手机端实现，每个字段独立保存）
  setSyncEnabled: (enabled: boolean) => void;
  setSyncType: (type: 'webdav' | 'server') => void;
  setSyncUrl: (url: string) => void;
  setSyncPath: (path: string) => void;
  setSyncUsername: (username: string) => void;
  setSyncPassword: (password: string) => void;
  setSyncApiKey: (apiKey: string) => void;
  setSyncInterval: (interval: number) => void;
  setSyncModule: (module: keyof SyncModules, enabled: boolean) => void;
  // 服务器认证相关
  setServerAuth: (username: string, password: string, syncKey: string) => void;
  setServerToken: (token: string, refreshToken: string, expiresIn: number) => void;
  clearServerAuth: () => void;
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

  // 同步配置初始化为默认值，然后通过 useEffect 从主进程加载
  const [syncConfig, setSyncConfigState] = useState<SyncConfig>(DEFAULT_SYNC_CONFIG);
  const [syncConfigLoaded, setSyncConfigLoaded] = useState(false);
  const [systemDarkMode, setSystemDarkMode] = useState(false);

  // 使用 ref 来存储最新的配置，避免闭包问题
  const syncConfigRef = useRef<SyncConfig>(DEFAULT_SYNC_CONFIG);

  // 保存同步配置到主进程和 localStorage
  const persistSyncConfig = useCallback(async (newConfig: SyncConfig) => {
    // 更新 ref
    syncConfigRef.current = newConfig;

    // 保存到主进程文件系统
    try {
      const api = (window as any).electronAPI;
      if (api?.saveSyncConfig) {
        await api.saveSyncConfig(newConfig);
      }
    } catch (e) {
      console.error('Failed to save sync config to main process');
    }

    // localStorage 仅保存非敏感字段作为兜底备份
    localStorage.setItem('mucheng-sync-config', JSON.stringify(getSyncConfigBackup(newConfig)));
  }, []);

  // 从主进程加载同步配置
  useEffect(() => {
    const loadSyncConfig = async () => {
      try {
        let savedConfig = null;

        // 先尝试从主进程加载
        const api = (window as any).electronAPI;
        if (api?.loadSyncConfig) {
          savedConfig = await api.loadSyncConfig();
        }

        // 如果主进程配置为空或不完整，尝试从 localStorage 恢复
        if (!savedConfig || (savedConfig.enabled && !savedConfig.url)) {
          const localConfig = localStorage.getItem('mucheng-sync-config');
          if (localConfig) {
            try {
              const parsed = JSON.parse(localConfig);
              if (parsed.url) {
                console.log('[SettingsContext] Recovering config from localStorage:', parsed);
                savedConfig = parsed;
                // 同步回主进程
                if (api?.saveSyncConfig) {
                  await api.saveSyncConfig(savedConfig);
                }
              }
            } catch (e) {
              console.error('Failed to parse localStorage config:', e);
            }
          }
        }

        if (savedConfig) {
          // 深度合并 sync_modules，确保新增的模块字段有默认值
          const mergedSyncModules = {
            ...DEFAULT_SYNC_MODULES,
            ...(savedConfig.sync_modules || {}),
          };
          const mergedConfig = { 
            ...DEFAULT_SYNC_CONFIG, 
            ...savedConfig,
            sync_modules: mergedSyncModules,
          };
          setSyncConfigState(mergedConfig);
          syncConfigRef.current = mergedConfig;
        }
      } catch (e) {
        console.error('Failed to load sync config:', e);
      } finally {
        setSyncConfigLoaded(true);
      }
    };
    loadSyncConfig();

    // 监听 token 刷新事件
    const api = (window as any).electronAPI;
    if (api?.sync?.onTokenRefreshed) {
      api.sync.onTokenRefreshed((data: { token: string; refreshToken: string; expiresIn: number }) => {
        console.log('[SettingsContext] Token refreshed, updating config');
        setSyncConfigState((prev: SyncConfig) => {
          const newConfig = {
            ...prev,
            server_token: data.token,
            server_refresh_token: data.refreshToken,
            server_token_expires: Date.now() + data.expiresIn * 1000,
          };
          persistSyncConfig(newConfig);
          return newConfig;
        });
      });
    }
  }, [persistSyncConfig]);

  // 监听系统主题变化
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDarkMode(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setSystemDarkMode(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // 同步主题设置到主进程
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.saveThemeSettings) {
      api.saveThemeSettings({ theme: settings.theme }).catch(() => {});
    }
  }, [settings.theme]);

  // 保存应用设置
  const saveSettings = useCallback(async (newSettings: AppSettings) => {
    localStorage.setItem('mucheng-settings', JSON.stringify(newSettings));
    try {
      const api = (window as any).electronAPI;
      if (api?.saveThemeSettings) {
        await api.saveThemeSettings({ theme: newSettings.theme });
      }
    } catch (e) {
      console.warn('Failed to save theme to main process:', e);
    }
  }, []);

  const updateSettings = useCallback(
    (updates: Partial<AppSettings>) => {
      setSettings((prev: AppSettings) => {
        const newSettings = { ...prev, ...updates };
        saveSettings(newSettings);
        return newSettings;
      });
    },
    [saveSettings]
  );

  // 通用的同步配置更新方法
  const updateSyncConfig = useCallback(
    (updates: Partial<SyncConfig>) => {
      setSyncConfigState((prev: SyncConfig) => {
        const newConfig = { ...prev, ...updates };
        // 始终保存配置（移除 syncConfigLoaded 检查，避免配置丢失）
        persistSyncConfig(newConfig);
        return newConfig;
      });
    },
    [persistSyncConfig]
  );

  // ========== 独立的同步配置更新方法（参考手机端实现） ==========

  const setSyncEnabled = useCallback(
    (enabled: boolean) => {
      updateSyncConfig({ enabled });
    },
    [updateSyncConfig]
  );

  const setSyncType = useCallback(
    (type: 'webdav' | 'server') => {
      updateSyncConfig({ type });
    },
    [updateSyncConfig]
  );

  const setSyncUrl = useCallback(
    (url: string) => {
      updateSyncConfig({ url });
    },
    [updateSyncConfig]
  );

  const setSyncPath = useCallback(
    (path: string) => {
      updateSyncConfig({ sync_path: path });
    },
    [updateSyncConfig]
  );

  const setSyncUsername = useCallback(
    (username: string) => {
      updateSyncConfig({ username });
    },
    [updateSyncConfig]
  );

  const setSyncPassword = useCallback(
    (password: string) => {
      updateSyncConfig({ password });
    },
    [updateSyncConfig]
  );

  const setSyncApiKey = useCallback(
    (apiKey: string) => {
      updateSyncConfig({ api_key: apiKey });
    },
    [updateSyncConfig]
  );

  const setSyncInterval = useCallback(
    (interval: number) => {
      updateSyncConfig({ sync_interval: interval });
    },
    [updateSyncConfig]
  );

  const setSyncModule = useCallback(
    (module: keyof SyncModules, enabled: boolean) => {
      setSyncConfigState((prev: SyncConfig) => {
        const newModules = { ...prev.sync_modules, [module]: enabled };
        const newConfig = { ...prev, sync_modules: newModules };
        persistSyncConfig(newConfig);
        return newConfig;
      });
    },
    [persistSyncConfig]
  );

  // 服务器认证相关方法
  const setServerAuth = useCallback(
    (username: string, password: string, syncKey: string) => {
      updateSyncConfig({
        server_username: username,
        server_password: password,
        server_sync_key: syncKey,
      });
    },
    [updateSyncConfig]
  );

  const setServerToken = useCallback(
    (token: string, refreshToken: string, expiresIn: number) => {
      updateSyncConfig({
        server_token: token,
        server_refresh_token: refreshToken,
        server_token_expires: Date.now() + expiresIn * 1000,
      });
    },
    [updateSyncConfig]
  );

  const clearServerAuth = useCallback(() => {
    updateSyncConfig({
      server_username: undefined,
      server_password: undefined,
      server_sync_key: undefined,
      server_token: undefined,
      server_refresh_token: undefined,
      server_token_expires: undefined,
    });
  }, [updateSyncConfig]);

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
        syncConfigLoaded,
        updateSettings,
        updateSyncConfig,
        setSyncEnabled,
        setSyncType,
        setSyncUrl,
        setSyncPath,
        setSyncUsername,
        setSyncPassword,
        setSyncApiKey,
        setSyncInterval,
        setSyncModule,
        setServerAuth,
        setServerToken,
        clearServerAuth,
        resetSettings,
        isDarkMode,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
