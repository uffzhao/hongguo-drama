// 红果短剧 4.8：界面入口；目录双线与验证范围见 docs/release-4.8.md。
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import './mobile.css';
import { initializePosterSize } from './theme';

// Capacitor/Android 环境下初始化 electronAPI 适配层（同步加载，确保 React 渲染前就绪）
// Electron 环境（window.electronAPI 已由 preload.js 注入）跳过
if (typeof window !== 'undefined' && !window.electronAPI) {
  require('./capacitor/capacitor-adapter');
}

initializePosterSize();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
