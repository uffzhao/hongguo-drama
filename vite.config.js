// 红果短剧 5.4：前端构建配置，运行版本由 package.json 提供。
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'path', 'stream', 'fs', 'os', 'url', 'util', 'events', 'http', 'https'],
      globals: { Buffer: true, global: true, process: true },
      overrides: {
        // crypto 的 createCipheriv 用 crypto-js 实现（支持 ECB 模式，Web Crypto 不支持）
        // fs 在适配器中用 Capacitor Filesystem 覆盖
      },
    }),
    {
      name: 'development-csp',
      apply: 'serve',
      transformIndexHtml: html => html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
        .replace("connect-src 'self'", "connect-src 'self' ws: wss:"),
    },
  ],
  base: './',
  resolve: {
    alias: {
      // 浏览器端 fs 由 capacitor-adapter 提供，不使用 memfs
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist-react',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
