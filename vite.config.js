import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]

export default defineConfig({
  base: process.env.NODE_ENV === 'production' && repoName ? `/${repoName}/` : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      manifest: {
        name: 'My Stock Portfolio',
        short_name: 'MyStock',
        description: 'Personal stock value manager with local IndexedDB storage',
        theme_color: '#165dff',
        background_color: '#f7f9fc',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
            src: 'vite.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
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
            urlPattern: /^https:\/\/www\.alphavantage\.co\/.*$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'alphavantage-api-cache',
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24,
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
