import { test, expect } from '@playwright/test'
import { seedApp, selectMessageText, readSnippets } from './helpers'

/**
 * Core-flow smoke suite for Drift, adapted from the `.fable/fable-verify-*.mjs`
 * scripts. Exercises the load-bearing journeys: send a message, select text and
 * drift, push a drift back to main, and save a snippet. Gemini is fully mocked
 * (see helpers.ts) so runs are deterministic and offline.
 */

test.describe('Drift smoke', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
    await seedApp(page)
  })

  test('app boots into a seeded chat', async ({ page }) => {
    await page.getByText('Tell me about ancient Rome', { exact: true }).first().click()
    await expect(
      page.getByText('Rome was shaped by figures', { exact: false }).first(),
    ).toBeVisible()
  })

  test('send a message gets a (mocked) streamed reply', async ({ page }) => {
    await page.getByText('Tell me about ancient Rome', { exact: true }).first().click()
    await page.waitForTimeout(500)
    const input = page.locator('textarea[placeholder="Type your message..."]')
    await input.click()
    await input.fill('What about its economy?')
    await input.press('Enter')
    // User turn echoes immediately.
    await expect(
      page.getByText('What about its economy?', { exact: true }).first(),
    ).toBeVisible({ timeout: 5000 })
    // Mocked assistant reply streams in.
    await expect(
      page.getByText('Mocked reply about:', { exact: false }).first(),
    ).toBeVisible({ timeout: 8000 })
  })

  test('select text in an AI reply opens the drift tooltip', async ({ page }) => {
    await page.getByText('Tell me about ancient Rome', { exact: true }).first().click()
    await page.waitForTimeout(500)
    const selected = await selectMessageText(page, 'a1', 'Julius Caesar')
    expect(selected).toBe(true)
    const driftBtn = page.locator('button[title^="Drift on selected text"]')
    await expect(driftBtn.first()).toBeVisible({ timeout: 4000 })
  })

  test('drift into a selection opens the drift panel', async ({ page }) => {
    await page.getByText('Tell me about ancient Rome', { exact: true }).first().click()
    await page.waitForTimeout(500)
    await selectMessageText(page, 'a1', 'Julius Caesar')
    await page.locator('button[title^="Drift on selected text"]').first().click()
    // Drift panel surfaces its dedicated composer.
    await expect(
      page.locator('textarea[placeholder="Explore this drift…"]'),
    ).toBeVisible({ timeout: 5000 })
  })

  test('push a drift back to main chat', async ({ page }) => {
    // Open the existing drift directly via its inline link in the AI reply.
    await page.getByText('Tell me about ancient Rome', { exact: true }).first().click()
    await page.waitForTimeout(500)
    await page.locator('button', { hasText: 'Julius Caesar' }).first().click()
    await page.waitForTimeout(800)
    const pushBtn = page.locator('button[title="Push to main chat"]')
    await expect(pushBtn.first()).toBeVisible({ timeout: 5000 })
    await pushBtn.first().click()
    await page.waitForTimeout(800)
    // After pushing, the button flips to its undo affordance.
    await expect(
      page.locator('button[title="Undo push to main"]').first(),
    ).toBeVisible({ timeout: 5000 })
  })

  test('save a selection as a snippet persists it', async ({ page }) => {
    await page.getByText('Tell me about ancient Rome', { exact: true }).first().click()
    await page.waitForTimeout(500)
    const before = (await readSnippets(page)).length
    await selectMessageText(page, 'a1', 'reshaped the Republic')
    await page.locator('button[title^="Save selection to snippets"]').first().click()
    await page.waitForTimeout(600)
    const after = (await readSnippets(page)).length
    expect(after).toBeGreaterThan(before)
  })
})
