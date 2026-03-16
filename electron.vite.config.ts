import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['node-pty'],
        output: {
          format: 'es'
        }
      }
    }
  },
  preload: {
    build: {
      // Bundle all deps into the preload script so sandbox mode can load it
      externalizeDeps: { exclude: ['@electron-toolkit/preload'] },
      rollupOptions: {
        output: {
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
