import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import './styles/global.css';

// 主题包装组件
const ThemedApp: React.FC = () => {
  const { isDarkMode } = useSettings();

  return (
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
