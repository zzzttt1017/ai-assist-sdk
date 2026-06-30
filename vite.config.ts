import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import dts from 'vite-plugin-dts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    vue(),
    dts({
      insertTypesEntry: true,
      include: [
        'src/core/**/*.ts',
        'src/react/**/*.ts',
        'src/react/**/*.tsx',
        'src/vue/**/*.ts',
        'src/index.ts',
        'src/vite-env.d.ts',
      ],
      exclude: [
        'src/vue/**/*.vue',
      ],
      entryRoot: 'src',
      outDir: 'dist',
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // 运行时编译内联 template 需要带编译器的 Vue 构建
      vue: 'vue/dist/vue.esm-bundler.js',
    },
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
      },
    },
  },
  server: {
    proxy: {
      '/API': {
        target: 'https://goon.csci.com.hk/fis-api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/API/, ''),
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
          })
        },
      },
    },
  },
  build: mode === 'lib'
    ? {
        lib: {
          entry: {
            index: resolve(__dirname, 'src/index.ts'),
            'react/index': resolve(__dirname, 'src/react/index.ts'),
            'vue/index': resolve(__dirname, 'src/vue/index.ts'),
          },
          formats: ['es'],
        },
        rollupOptions: {
          external: ['react', 'react-dom', 'vue', 'antd', '@ant-design/icons', '@ant-design/icons-vue', 'react-markdown', 'remark-gfm', 'rehype-highlight'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              vue: 'Vue',
              antd: 'antd',
              '@ant-design/icons': 'antdIcons',
              '@ant-design/icons-vue': 'antdIconsVue',
              'react-markdown': 'ReactMarkdown',
              'remark-gfm': 'remarkGfm',
              'rehype-highlight': 'rehypeHighlight',
            },
            entryFileNames: '[name].mjs',
            chunkFileNames: 'chunks/[name]-[hash].mjs',
          },
        },
        cssCodeSplit: false,
      }
    : {
        outDir: 'dist',
        sourcemap: true,
      },
}))
