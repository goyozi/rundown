import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: ['@xterm/headless', '@xterm/addon-serialize'] },
      rollupOptions: {
        external: ['node-pty'],
        output: {
          format: 'es'
        }
      }
    },
    resolve: {
      alias: {
        '@xterm/headless': resolve(
          __dirname,
          'node_modules/@xterm/headless/lib-headless/xterm-headless.mjs'
        ),
        '@xterm/addon-serialize': resolve(
          __dirname,
          'node_modules/@xterm/addon-serialize/lib/addon-serialize.mjs'
        )
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
