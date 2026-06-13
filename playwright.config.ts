import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

// Port 5199 is the .fable/ convention — deliberately not 5173, so a
// user-running dev instance is never disturbed by test runs.
//
// Browser resolution: this environment's network policy blocks
// `cdn.playwright.dev`, so the exact browser build Playwright wants may be
// undownloadable. If a pre-baked Chromium is present under PLAYWRIGHT_BROWSERS_PATH
// (e.g. /opt/pw-browsers), point at it directly so the suite runs offline.
// Falls back to Playwright's managed browser when no pre-bake is found.
const PREBAKED_CHROME = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].find((p) => existsSync(p))

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1400, height: 950 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: PREBAKED_CHROME ? { executablePath: PREBAKED_CHROME } : {},
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
