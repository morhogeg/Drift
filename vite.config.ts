import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy, stable vendor deps into separate cacheable chunks
        // so they don't bloat the main entry chunk on first paint.
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // React core (kept together since react-dom depends on react/scheduler)
          if (
            /node_modules\/(react|react-dom|scheduler)\//.test(id) ||
            id.includes('node_modules/react/jsx-runtime') ||
            id.includes('node_modules/react/jsx-dev-runtime')
          ) {
            return 'react-vendor'
          }

          // Animation
          if (id.includes('node_modules/framer-motion')) {
            return 'framer-motion'
          }

          // Flow / graph rendering (large)
          if (id.includes('node_modules/@xyflow')) {
            return 'xyflow'
          }

          // Markdown + syntax highlighting stack (large)
          if (
            id.includes('node_modules/react-markdown') ||
            id.includes('node_modules/react-syntax-highlighter') ||
            id.includes('node_modules/highlight.js') ||
            id.includes('node_modules/lowlight') ||
            id.includes('node_modules/refractor') ||
            id.includes('node_modules/prismjs') ||
            /node_modules\/(remark|rehype|mdast|hast|micromark|unist|unified|vfile)/.test(id)
          ) {
            return 'markdown'
          }

          // State management + storage
          if (
            id.includes('node_modules/zustand') ||
            id.includes('node_modules/idb')
          ) {
            return 'state-vendor'
          }

          // Icons
          if (id.includes('node_modules/lucide-react')) {
            return 'icons'
          }
        },
      },
    },
  },
})
