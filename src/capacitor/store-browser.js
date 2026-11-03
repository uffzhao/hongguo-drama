/**
 * store-browser.js - 浏览器/Capacitor 持久化模块
 * 用 localStorage 替代 Node fs，保持与 store.js 相同的 API 接口。
 * 数据结构：{ settings, tasks, series, playback, mergeTasks, announcement }
 */
const STORAGE_KEY = 'hongguo-store';
let cache = null;
let errorHandler = null;

function loadCache() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch (e) {
    cache = {};
    try { errorHandler?.({ error: '读取本地数据失败' }); } catch {}
  }
  if (!Array.isArray(cache.tasks)) cache.tasks = [];
  if (!cache.settings || typeof cache.settings !== 'object') cache.settings = {};
  if (!Array.isArray(cache.series)) cache.series = [];
  if (!cache.playback || typeof cache.playback !== 'object') cache.playback = {};
  if (!Array.isArray(cache.mergeTasks)) cache.mergeTasks = [];
  return cache;
}

function flush() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache || {}));
  } catch (e) {
    try { errorHandler?.({ error: '保存失败，请检查存储权限' }); } catch {}
    throw e;
  }
}

module.exports = {
  setErrorHandler: (handler) => { errorHandler = handler; },
  init: () => { cache = null; loadCache(); },
  getSettings: () => loadCache().settings,
  saveSettings: (settings) => { loadCache().settings = settings || {}; flush(); },
  getAnnouncementState: () => {
    const s = loadCache().announcement;
    return s && typeof s === 'object' && !Array.isArray(s) ? JSON.parse(JSON.stringify(s)) : {};
  },
  saveAnnouncementState: (patch) => {
    loadCache().announcement = { ...(loadCache().announcement || {}), ...patch };
    flush();
  },
  getTasks: () => loadCache().tasks,
  saveTasks: (tasks) => { loadCache().tasks = tasks || []; flush(); },
  getSeries: () => {
    const c = loadCache();
    if (!Array.isArray(c.series)) c.series = [];
    return c.series;
  },
  saveSeries: (list) => { loadCache().series = list || []; flush(); },
  getPlayback: () => {
    const c = loadCache();
    if (!c.playback || typeof c.playback !== 'object') c.playback = {};
    return c.playback;
  },
  savePlayback: (map) => { loadCache().playback = map || {}; flush(); },
  getMergeTasks: () => {
    const c = loadCache();
    if (!Array.isArray(c.mergeTasks)) c.mergeTasks = [];
    return c.mergeTasks;
  },
  saveMergeTasks: (list) => { loadCache().mergeTasks = list || []; flush(); },
};
