import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The Rust server (schools/dev.sh starts it on 8090 and sets API_TARGET).
const apiTarget = process.env.API_TARGET ?? 'http://127.0.0.1:8090'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WEB_PORT ?? 5190),
    strictPort: true,
    proxy: { '/api': { target: apiTarget } },
  },
  preview: {
    port: Number(process.env.WEB_PORT ?? 5190),
    strictPort: true,
    proxy: { '/api': { target: apiTarget } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
