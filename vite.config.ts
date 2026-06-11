import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dts from 'vite-plugin-dts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    dts({ insertTypesEntry: true }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
      },
    },
  },
  build: mode === 'lib'
    ? {
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'AiAssistSdk',
          fileName: 'ai-assist-sdk',
          formats: ['umd', 'es'],
        },
        rollupOptions: {
          external: ['react', 'react-dom'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
            },
          },
        },
      }
    : {
        outDir: 'dist',
        sourcemap: true,
      },
}))
