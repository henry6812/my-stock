import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]

export default defineConfig({
  base: process.env.NODE_ENV === 'production' && repoName ? `/${repoName}/` : '/',
  // NOTE: A manualChunks vendor split was tried here and reverted — splitting
  // React into its own chunk broke init order (antd's chunk ran
  // React.createContext before React was ready → blank page). If revisiting
  // code-splitting, verify the built bundle in a browser (npm run preview),
  // and keep React + its dependents together.
  plugins: [
    react(),
    VitePWA({
      // 'prompt' so a new deploy never reloads the page under an open form;
      // main.jsx asks the user before activating the waiting worker.
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '我的資產',
        short_name: '我的資產',
        description: '個人資產管理：台股、美股、銀行現金、支出與預算，可跨裝置同步',
        lang: 'zh-Hant-TW',
        theme_color: '#F2F3F5',
        background_color: '#F2F3F5',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Bundle is currently ~2.2MB; increase precache limit above default 2MB.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/openapi\.twse\.com\.tw\/.*$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'twse-api-cache',
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24,
              },
            },
          },
          {
            // TW fundamentals snapshots (public/data/tw_*.json): fresh when
            // online, last copy when offline. Not precached (globPatterns
            // excludes json).
            urlPattern: /\/data\/tw_(eps|pe)_history\.json$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tw-fundamentals',
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 14,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
