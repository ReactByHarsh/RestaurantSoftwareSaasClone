import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

const host = process.env.TAURI_DEV_HOST
const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.TAURI_PLATFORM)

export default defineConfig({
  plugins: [
    react(),
    !isTauriBuild && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'brand-icon-clean.png',
        'icons/icon-16.png',
        'icons/icon-32.png',
        'icons/icon-48.png',
        'icons/apple-touch-icon.png'
      ],
      manifest: {
        name: 'BhojPatra Cloud',
        short_name: 'BhojPatra',
        description: 'Restaurant Management SaaS',
        id: '/',
        start_url: '/app/tables',
        scope: '/',
        theme_color: '#2563EB',
        background_color: '#F8FAFC',
        display: 'standalone',
        display_override: ['standalone', 'window-controls-overlay', 'browser'],
        categories: ['business', 'food', 'productivity'],
        prefer_related_applications: false,
        icons: [
          { src: '/icons/icon-48.png', sizes: '48x48', type: 'image/png' },
          { src: '/icons/icon-72.png', sizes: '72x72', type: 'image/png' },
          { src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' },
          { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png' },
          { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: host || false,
    port: 5173,
    strictPort: Boolean(process.env.TAURI_ENV_PLATFORM),
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 5174,
        }
      : undefined,
  }
})
