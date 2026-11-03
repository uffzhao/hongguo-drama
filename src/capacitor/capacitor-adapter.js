/**
 * capacitor-adapter.js
 * 在浏览器/Capacitor WebView 中提供 window.electronAPI，
 * 使 React 组件无需大改即可运行。核心逻辑直接调用 src/native 下的模块。
 *
 * 设计原则：
 * 1. 与 preload.js 保持同名同签名的 API
 * 2. 取源/搜索/播放等核心逻辑直接复用 native 模块（纯 JS，浏览器可运行）
 * 3. fs/持久化用 store-browser + Capacitor Filesystem 替代
 * 4. 下载/ffmpeg 等需要原生能力的功能，分阶段接入 Capacitor 插件
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

// 强制 store 模块使用浏览器实现（通过 require 缓存注入）
const storeBrowser = require('./store-browser');
const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === './store' || request.endsWith('/store')) {
    return require.resolve('./store-browser');
  }
  return originalResolve.call(this, request, ...rest);
};

const hongguo = require('../native/hongguo');
const search = require('../native/hongguo-search');
const seriesSearch = require('../native/series-search');
const appSearch = require('../native/hongguo-app-search');
const appNew = require('../native/hongguo-app-new');
const appSource = require('../native/app-source');
const catalog = require('../native/hongguo-app-catalog');
const publicDetails = require('../native/public-details');
const accountSession = require('../native/account-session');
const webLogin = require('../native/account-web-login');
const watchHistory = require('../native/watch-history');
const announcements = require('../native/app-announcements');
const danmaku = require('../native/danmaku');
const episodeComments = require('../native/episode-comments');
const textExport = require('../native/text-export');
const portableData = require('../native/portable-data');
const mediaSources = require('../native/media-sources');
const customSource = require('../native/custom-source');

const store = storeBrowser;

// ===== 事件系统（替代 Electron IPC） =====
const listeners = new Map();
function on(channel, cb) {
  if (!listeners.has(channel)) listeners.set(channel, new Set());
  listeners.get(channel).add(cb);
  return () => listeners.get(channel)?.delete(cb);
}
function emit(channel, ...args) {
  listeners.get(channel)?.forEach(cb => {
    try { cb(...args); } catch (e) { console.error('[adapter emit error]', channel, e); }
  });
}

// store 错误回调
store.setErrorHandler(payload => emit('storage-error', payload));
store.init();

// ===== 播放相关 =====
const PLAYBACK_DIR = 'playback';
const playback = store.getPlayback();

function savePlayback() {
  store.savePlayback(playback);
}

function seriesKey(series) {
  return `${series.source || 'hongguo'}:${series.seriesId}`;
}

// ===== 工具：解密视频 buffer（在线播放） =====
async function decryptForPlay(episodes) {
  if (!Array.isArray(episodes) || episodes.length === 0) return [];
  const results = [];
  for (const ep of episodes) {
    if (!ep) { results.push(null); continue; }
    try {
      if (ep.spade_a) {
        const key = hongguo.deriveKey(ep.spade_a);
        // 若 ep.url 是 buffer 已加载的数据则解密，否则返回原始信息由播放器自行处理
        if (ep._encryptedBuffer) {
          const decrypted = hongguo.decryptMp4Buffer(ep._encryptedBuffer, key);
          results.push({ ...ep, _decryptedBuffer: decrypted, _needsDecrypt: false });
        } else {
          results.push({ ...ep, _decryptKey: key, _needsDecrypt: true });
        }
      } else {
        results.push({ ...ep, _needsDecrypt: false });
      }
    } catch (e) {
      console.error('[playback decrypt]', e);
      results.push({ ...ep, _needsDecrypt: false });
    }
  }
  return results;
}

// ===== 环境信息 =====
function getEnvInfo() {
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  return {
    platform: isAndroid ? 'android' : process.platform,
    arch: 'aarch64',
    isPackaged: true,
    appVersion: '5.4.0-android',
    electronVersion: null,
    chromeVersion: ua.match(/Chrome\/([\d.]+)/)?.[1] || null,
    isMac: false,
    isWindows: false,
    isLinux: false,
    isAndroid,
    supportsHardwareMpegts: false,
  };
}

// ===== window.electronAPI =====
window.electronAPI = {
  // 环境
  getAppInfo: async () => ({ name: '红果短剧', version: '5.4.0-android', isMobile: true, isAndroid: true }),
  getEnvInfo,

  // 事件
  on,
  off: on, // 简化：返回的函数即取消订阅
  removeListener: () => {},

  // 存储错误
  onStorageError: (cb) => on('storage-error', cb),

  // 窗口/布局（Android 默认竖屏，隐藏侧边栏，使用底部导航）
  getWindowLayout: async () => 'portrait',
  setWindowLayout: async () => {},
  getAlwaysOnTop: async () => false,
  setAlwaysOnTop: async () => {},
  onNavigate: () => () => {},
  setProxy: async () => {},
  getProxy: async () => null,
  bossKeyConfig: async () => ({}),

  // ===== 设置 =====
  getSettings: async () => store.getSettings(),
  saveSettings: async (settings) => { store.saveSettings(settings); return true; },

  // ===== 任务/剧集/播放记录 =====
  getTasks: async () => store.getTasks(),
  saveTasks: async (tasks) => { store.saveTasks(tasks); return true; },
  getSeries: async () => store.getSeries(),
  saveSeries: async (list) => { store.saveSeries(list); return true; },
  getPlayback: async () => store.getPlayback(),
  savePlayback: async (map) => { store.savePlayback(map); return true; },
  getMergeTasks: async () => store.getMergeTasks(),
  saveMergeTasks: async (list) => { store.saveMergeTasks(list); return true; },
  getRecentSeries: async () => [],

  // ===== 搜索 =====
  search: async (params) => {
    const { name, page = 1, source } = params || {};
    if (source === 'xifan') {
      const xifan = require('../native/xifan');
      return xifan.search({ name, page });
    }
    if (source === 'hema') {
      const hema = require('../native/hema');
      return hema.search({ name, page });
    }
    // 默认红果：优先 App 搜索，失败回退网页
    try {
      const appResult = await appSearch.searchApp(name, page);
      return appResult;
    } catch (e) {
      return search.searchSeries(name, page);
    }
  },
  searchResolve: async (url) => hongguo.resolveSeriesId(url),
  searchParse: async (text) => {
    if (!text) return null;
    const m = text.match(/(https?:\/\/[^\s]+)/);
    if (m) return hongguo.resolveSeriesId(m[1]);
    return null;
  },

  // ===== 剧集列表 =====
  getEpisodeList: async (series) => {
    if (!series) return { episodes: [] };
    if (series.source === 'xifan') {
      const xifan = require('../native/xifan');
      return xifan.fetchEpisodeList(series);
    }
    if (series.source === 'hema') {
      const hema = require('../native/hema');
      return hema.fetchEpisodeList(series);
    }
    try {
      return await hongguo.fetchEpisodeListFromWeb(series);
    } catch (e) {
      return hongguo.fetchEpisodeList(series);
    }
  },
  getPublicDetails: async (seriesId) => publicDetails.fetchPublicDetails(seriesId),

  // ===== 播放地址 =====
  getPlayUrl: async (series, episodeIndex) => {
    if (!series) return null;
    if (series.source === 'xifan') {
      const xifan = require('../native/xifan');
      return xifan.fetchPlayUrlSingle(series, episodeIndex);
    }
    if (series.source === 'hema') {
      const hema = require('../native/hema');
      return hema.fetchPlayUrlSingle(series, episodeIndex);
    }
    // 优先 App 接口（可选择清晰度），失败回退网页
    try {
      const r = await appNew.fetchPlayUrlSingle(series, episodeIndex);
      return r;
    } catch (e) {
      return hongguo.fetchPlayUrlFromWeb(series, episodeIndex);
    }
  },
  selectSource: async (info) => {
    // info 通常是 app-source 的清晰度选择结果
    return info;
  },

  // ===== 播放（播放列表） =====
  playSeries: async (series, startIndex, episodes) => {
    if (!series) return;
    // 记录最近播放
    playback[seriesKey(series)] = { series, startIndex, time: Date.now() };
    savePlayback();
    // 通知 UI 开始播放
    emit('play-series', { series, startIndex, episodes });
  },
  onPlaySeries: (cb) => on('play-series', cb),

  // ===== 解密（在线播放） =====
  decryptMp4Buffer: async (buffer, key) => hongguo.decryptMp4Buffer(buffer, key),
  deriveKey: async (spadeA) => hongguo.deriveKey(spadeA),

  // ===== 弹幕 / 评论 =====
  getDanmaku: async (params) => danmaku.fetchDanmaku(params),
  getEpisodeComments: async (params) => episodeComments.fetchEpisodeComments(params),

  // ===== 观看历史 =====
  listWatchHistory: async (page) => watchHistory.listHistory(page),
  recordPlayback: async (record) => watchHistory.recordPlayback(record),

  // ===== 公告 =====
  getAnnouncementState: async () => store.getAnnouncementState(),
  saveAnnouncementState: async (patch) => { store.saveAnnouncementState(patch); return true; },

  // ===== 登录 =====
  getLoginStatus: async () => accountSession.getLoginStatus(),
  isLoggedIn: async () => accountSession.isLoggedIn(),
  getToken: async () => accountSession.getToken(),
  webLogin: async () => webLogin.createWebLoginObserver(),
  appLogin: async () => ({ error: 'App 登录暂未支持' }),
  logout: async () => { await accountSession.logout(); return true; },
  getWatchHistory: async () => accountSession.getWatchHistory(),
  onLoginStatus: (cb) => on('login-status', cb),

  // ===== 分类 / 目录 =====
  browseCatalog: async (params) => catalog.browseList(params),
  getCatalogCover: async (id) => catalog.catalogCover(id),

  // ===== 媒体源管理 =====
  getMediaSources: async () => mediaSources.getMediaSources(),
  setBuiltinSourceEnabled: async (id, enabled) => {
    mediaSources.setBuiltinSourceEnabled(id, enabled);
    return true;
  },
  testCustomSource: async (config) => customSource.testCustomSource(config),
  validateCustomSource: async (config) => customSource.validateCustomSource(config),

  // ===== 导出 =====
  exportSeriesText: async (series, episodes, fmt) => textExport.exportSeriesText(series, episodes, fmt),

  // ===== 备份 / 恢复 =====
  exportAllData: async () => portableData.exportAllData(),
  importAllData: async (data) => portableData.importAllData(data),

  // ===== 文件系统（下载相关，MVP 阶段用 Capacitor Filesystem） =====
  selectDownloadDir: async () => {
    // Android: 使用应用专属目录
    return { dir: 'hongguo-downloads', displayName: '内部存储/红果短剧' };
  },
  getFreeDiskSpace: async () => ({ free: 1024 * 1024 * 1024 * 10, total: 1024 * 1024 * 1024 * 64 }), // 占位
  getTaskFiles: async (task) => [],
  openFile: async (filePath) => { /* TODO: Android Intent */ },
  openFolder: async (dirPath) => { /* TODO: Android Intent */ },
  trashFile: async (filePath) => { /* TODO: Filesystem.delete */ return true; },
  showOpenDialog: async (opts) => ({ canceled: true, filePaths: [] }),
  savePlaylistFile: async () => ({ canceled: true }),
  openPlaylistFile: async () => ({ canceled: true, filePaths: [] }),

  // ===== 下载（MVP 阶段返回未实现，后续接入） =====
  downloadEpisodes: async (params) => ({ ok: false, error: '下载功能开发中' }),
  onDownloadProgress: () => () => {},
  onDownloadComplete: () => () => {},
  cancelTask: async (taskId) => true,
  pauseTask: async (taskId) => true,
  resumeTask: async (taskId) => true,

  // ===== 合并（ffmpeg，MVP 阶段未实现） =====
  mergeEpisodes: async () => ({ ok: false, error: '合并功能开发中' }),
  onMergeProgress: () => () => {},
  onMergeComplete: () => () => {},

  // ===== 投屏 =====
  getCastingDevices: async () => [],
  startCasting: async () => ({ ok: false, error: '投屏功能开发中' }),
  stopCasting: async () => true,

  // ===== 更新检查 =====
  checkUpdate: async () => ({ hasUpdate: false }),

  // ===== 杂项 =====
  reload: () => location.reload(),
  quit: () => {},
  loadPlugins: async () => [],
  getLogPath: async () => '',
  getAutoUpdateEnabled: async () => false,
  setAutoUpdateEnabled: async () => {},
  isFullscreen: async () => false,
  setFullscreen: async () => {},
  toggleFullscreen: async () => {},
  getZoomFactor: async () => 1,
  setZoomFactor: async () => {},
  onZoomChange: () => () => {},
  onWindowResize: () => () => {},
  onThemeChange: () => () => {},
};

export default window.electronAPI;
