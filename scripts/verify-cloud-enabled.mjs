/**
 * Smoke check for the cloud-ENABLED build: the Account section renders in
 * Settings and the Apple sign-in sheet opens. Run against a build made with
 * (dummy or real) Firebase env, e.g.:
 *
 *   VITE_FIREBASE_API_KEY=demo VITE_FIREBASE_AUTH_DOMAIN=demo.firebaseapp.com \
 *   VITE_FIREBASE_PROJECT_ID=demo VITE_FIREBASE_STORAGE_BUCKET=demo.appspot.com \
 *   VITE_FIREBASE_MESSAGING_SENDER_ID=1 VITE_FIREBASE_APP_ID=demo \
 *   npm run build && node scripts/verify-cloud-enabled.mjs
 *
 * (Actual sign-in needs a real Firebase project + Apple provider — owner setup.)
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 4174
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
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })

  // Dismiss first-run onboarding/welcome dialogs, then open Settings.
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
  await page.locator('[aria-label="Settings"]').first().click({ timeout: 10_000 })
  await page.waitForTimeout(1000)

  // Account section renders above Models, signed-out state.
  if (!(await page.getByText(/^Account$/).first().isVisible().catch(() => false)))
    fail('Account section header missing')
  if (!(await page.getByText('Your API key stays on this device').first().isVisible().catch(() => false)))
    fail('Signed-out copy missing')

  // Sign-in sheet opens with the Apple button.
  await page.getByRole('button', { name: /^Sign in$/ }).first().click()
  await page.waitForTimeout(800)
  if (!(await page.getByRole('button', { name: /sign in with apple/i }).isVisible().catch(() => false)))
    fail('Sign-in sheet did not open / Apple button missing')

  await page.screenshot({ path: '/tmp/drift-account-ui.png' })
  console.log('✅ Cloud enabled: Account section renders, sign-in sheet opens (screenshot: /tmp/drift-account-ui.png)')
  await browser.close()
  preview.kill()
  process.exit(0)
} catch (err) {
  fail(err.message)
}
