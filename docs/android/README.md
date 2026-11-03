# 红果短剧 Android 版

## 目标
基于 jackotom/hongguo-drama (v5.4) 的核心逻辑，移植到 Android 平台，复用取源/解密/播放/下载逻辑，UI 按手机屏幕适配。

## 技术路线
- 渲染层：React (复用现有 components) + Capacitor 6 打包到 Android WebView
- 核心逻辑：纯 JS 模块 (hongguo.js / app-source.js / decrypt) 在 WebView / Capacitor 环境运行
- 原生能力：文件系统、网络(CORS绕过)、通知、分享通过 Capacitor 插件桥接
- ffmpeg：mobile-ffmpeg 或 Capacitor 原生插件处理转码/合并

## 开发分支
- `android`：主开发分支
- 特性分支从 `android` 切出，合回 `android`
- 定期从 `upstream/main` 同步上游修复

## 适配要点
- 竖屏优先，短剧原生形态
- 触控优化（按钮尺寸、手势）
- 状态栏/导航栏/刘海屏适配
- 国产 ROM 兼容（小米/华为/OPPO/vivo）
