import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Content-Security-Policy, injected at BUILD time only (the React dev
// preamble and Vite HMR need inline scripts/websockets that a strict CSP
// would block). Notes:
//  - style-src 'unsafe-inline': Vite inlines CSS chunks' <style> in some
//    paths and inline style attributes are used throughout the UI.
//  - connect-src allows any https origin (user-configured AI providers,
//    Firebase) plus localhost over http/ws for Ollama; non-localhost http
//    is blocked.
//  - For web hosting, mirror this as a real CSP header (stronger than meta):
//    same value, plus frame-ancestors 'none'.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https: ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'drift-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cspPlugin()],
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
