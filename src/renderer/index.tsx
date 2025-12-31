import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import './styles/global.css';

// Polyfill for Promise.withResolvers (required by pdfjs-dist 5.x)
if (typeof (Promise as any).withResolvers !== 'function') {
  (Promise as any).withResolvers = function <T>() {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve: resolve!, reject: reject! };
  };
}

// 在 React 渲染前立即应用主题，避免闪烁
(function applyInitialTheme() {
  try {
    const savedSettings = localStorage.getItem('mucheng-settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      const theme = settings.theme;
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      
      const isDark = theme === 'dark' || (theme === 'system' && systemDark);
      if (isDark) {
        document.body.classList.add('dark-mode');
      }
    }
  } catch (e) {
    console.warn('Failed to apply initial theme:', e);
  }
})();

// 主题包装组件
const ThemedApp: React.FC = () => {
  const { isDarkMode } = useSettings();

  // 同步 body class 以支持全局 CSS 深色模式
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  return (
    <StyleProvider hashPriority="high">
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: '#1890ff',
          },
        }}
      >
        <App />
      </ConfigProvider>
    </StyleProvider>
  );
};

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <SettingsProvider>
      <ThemedApp />
    </SettingsProvider>
  </React.StrictMode>
);
