import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 使用相对 base，便于直接部署到 GitHub Pages 子路径（如 user.github.io/repo）。
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'follow咪 · 健身跟练打卡',
        short_name: 'follow咪',
        description:
          'follow咪 —— 本地优先的健身跟练打卡应用：视频跟练、周期任务、猫爪打卡日历与身体数据趋势。',
        theme_color: '#7E9142',
        background_color: '#FDFBF2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        // 仅缓存应用外壳（JS/CSS/HTML/图标），视频 Blob 存于 IndexedDB，无需预缓存。
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
