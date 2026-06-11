import { defineConfig } from 'vitest/config'
import path from 'path'

// Vitest reuses the app's `@/` alias so unit tests import modules the same way
// the app does. Pure-logic tests run in the fast Node environment (no DOM).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
