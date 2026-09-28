import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Dedicated test config so the PWA/service-worker plugin from vite.config.js
// is not pulled into the test run. Vitest prefers this file over vite.config.js.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    css: false,
  },
})
