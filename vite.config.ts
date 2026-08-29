import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const desktop = mode === 'desktop'
  const host = process.env.TAURI_DEV_HOST

  return {
    clearScreen: false,
    plugins: [
      react(),
      {
        name: 'qa-flow-desktop-entry',
        transformIndexHtml: {
          order: 'pre',
          handler(html: string) {
            return desktop
              ? html.replace('/src/main.tsx', '/src/main.desktop.tsx')
              : html
          },
        },
      },
    ],
    resolve: {
      alias: desktop
        ? [{ find: '../../utils/generatePdfReport', replacement: fileURLToPath(new URL('./src/platform/desktop/generatePdfReport.desktop.ts', import.meta.url)) }]
        : [],
    },
    build: {
      outDir: desktop ? 'dist-desktop' : 'dist',
    },
    server: {
      host: host || '127.0.0.1',
      port: desktop ? 1420 : 5173,
      strictPort: true,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
  }
})
