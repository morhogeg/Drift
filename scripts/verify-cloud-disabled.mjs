/**
 * Acceptance check: with blank VITE_FIREBASE_* env, the cloud feature is
 * invisible and inert — no Account section in Settings, no Firebase chunk
 * fetched, no requests to any google/firebase host.
 *
 * Usage: npm run build && node scripts/verify-cloud-disabled.mjs
 * (Serves ./dist with `vite preview` and drives it with Playwright.)
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 4173
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})

const fail = (msg) => {
  console.error(`❌ ${msg}`)
  preview.kill()
  process.exit(1)
}

try {
  await new Promise((r) => setTimeout(r, 2000))
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Skip the first-run onboarding dialog and local login screen — both
  // intercept all pointer events.
  await page.addInitScript(() => {
    localStorage.setItem('drift_onboarded', 'true')
    localStorage.setItem('driftUser', 'CloudCheck')
  })

  const requests = []
  page.on('request', (req) => requests.push(req.url()))

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })

  // Dismiss first-run onboarding/welcome dialogs if present, then open Settings.
  const enter = page.getByRole('button', { name: /enter drift/i }).first()
  if (await enter.isVisible().catch(() => false)) {
    await enter.click()
    await page.waitForTimeout(800)
  }
  for (let i = 0; i < 5; i++) {
    const dialog = page.locator('[role="dialog"]').last()
    if (!(await dialog.isVisible().catch(() => false))) break
    const btn = dialog.locator('button').last()
    if (await btn.isVisible().catch(() => false)) await btn.click()
    else break
    await page.waitForTimeout(800)
  }
  // With no API key configured the Settings panel auto-opens on first run;
  // only click the header button if it isn't already showing.
  const settingsOpen = await page.getByText('MODELS').first().isVisible().catch(() => false)
  if (!settingsOpen) {
    await page.locator('[aria-label="Settings"]').first().click({ timeout: 10_000 })
  }
  await page.waitForTimeout(1000)

  // 1. No Account section / sign-in UI.
  const accountVisible = await page.getByText('Sign in with Apple').isVisible().catch(() => false)
  const accountHeader = await page.getByText(/^Account$/).isVisible().catch(() => false)
  if (accountVisible || accountHeader) fail('Account UI rendered with cloud disabled')

  // 2. No Firebase network traffic, no cloud chunks fetched. (Google Fonts and
  // the pre-existing Gemini connection check are unrelated and allowed.)
  const cloudReqs = requests.filter((u) =>
    /firebase|firestore\.googleapis|identitytoolkit|securetoken|AccountSection|cloudSync|SignInSheet/i.test(u)
  )
  if (cloudReqs.length) fail(`Cloud-related requests fired:\n  ${cloudReqs.join('\n  ')}`)

  console.log(`✅ Cloud disabled: no Account UI, no Firebase init, no cloud requests (${requests.length} requests inspected)`)
  await browser.close()
  preview.kill()
  process.exit(0)
} catch (err) {
  fail(err.message)
}
