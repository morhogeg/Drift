/**
 * GATE D regression sweep — fable/chip-recall
 * Adjacent surfaces: inline suggested-highlight underlines still render (≤1
 * underline per term), a term already drifted from THIS message still gets NO
 * chip at all (explored filter), inline drift links still open the panel, map
 * smoke.
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5199'
const now = new Date().toISOString()
const msg = (id, text, isUser, extra = {}) => ({ id, text, isUser, timestamp: now, ...extra })

const chats = [
  {
    id: 'root-en', title: 'Ancient Rome', createdAt: now, lastMessage: 'reply',
    messages: [
      msg('q1', 'Tell me about ancient Rome', true),
      // 'Julius Caesar' was drifted FROM THIS MESSAGE → no chip for it at all;
      // 'Pax Romana' unexplored → violet chip + inline underline.
      msg('a1', 'Rome rose under Julius Caesar and later flourished in the Pax Romana.', false, {
        hasDrift: true,
        driftInfos: [{ selectedText: 'Julius Caesar', driftChatId: 'drift-a' }],
        suggestedHighlights: ['Julius Caesar', 'Pax Romana'],
      }),
    ],
  },
  {
    id: 'drift-a', title: 'Julius Caesar', createdAt: now, lastMessage: 'Roman general',
    messages: [msg('da-q', 'What is Julius Caesar?', true), msg('da-a', 'A Roman general.', false)],
    metadata: { isDrift: true, parentChatId: 'root-en', sourceMessageId: 'a1', selectedText: 'Julius Caesar' },
  },
]

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

await page.route('**generativelanguage.googleapis.com/**', (route) =>
  route.fulfill({ status: 400, contentType: 'application/json', body: '{}' }))

await page.goto(BASE)
await page.evaluate(() => {
  localStorage.setItem('driftUser', 'Fable')
  localStorage.setItem('drift_onboarded', 'true')
  localStorage.setItem('drift_once_drift-gesture', '1')
  localStorage.setItem('drift_once_lens-bar', '1')
  localStorage.setItem('drift_once_map-spotlight', '1')
})
await page.evaluate(async ({ chats }) => {
  const open = () => new Promise((res, rej) => {
    const req = indexedDB.open('drift-db', 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('drift-chats')) db.createObjectStore('drift-chats', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('drift-embeddings')) db.createObjectStore('drift-embeddings', { keyPath: 'id' })
    }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  const db = await open()
  for (const c of chats) await new Promise((res, rej) => {
    const tx = db.transaction('drift-chats', 'readwrite')
    tx.objectStore('drift-chats').put(c)
    tx.oncomplete = res; tx.onerror = () => rej(tx.error)
  })
  db.close()
}, { chats })

await page.reload()
await page.waitForTimeout(1200)
await page.getByText('Ancient Rome', { exact: true }).first().click()
await page.waitForTimeout(800)

// D1: a term drifted FROM THIS MESSAGE gets no chip at all (explored filter intact)
const caesarChips = await page.locator('button[title*="Julius Caesar"]').filter({ hasText: 'Julius Caesar' }).count()
const paxChip = await page.locator('button[title=\'Drift into "Pax Romana"\']').count()
check('D1: same-message explored term suppressed from chips', caesarChips === 0 && paxChip === 1, `caesarChips=${caesarChips} paxChip=${paxChip}`)

// D2: inline suggested highlight still renders, ≤1 underline per term
const paxMarks = await page.locator('.drift-suggestion', { hasText: 'Pax Romana' }).count()
check('D2: inline suggestion underline renders once', paxMarks === 1, `marks=${paxMarks}`)

// D3: inline drift LINK (explored term) still opens the existing drift panel
await page.locator('button', { hasText: 'Julius Caesar' }).first().click()
await page.waitForTimeout(1200)
const panelQ = await page.getByText('What is Julius Caesar?', { exact: false }).count()
check('D3: inline drift link opens the drift panel', panelQ >= 1, `q=${panelQ}`)
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// D4: map smoke — active tree renders
await page.locator('[title="Drift Map (⌘⌥G)"]').click()
await page.waitForTimeout(1800)
const rootCard = await page.locator('.dkg-card', { hasText: 'Ancient Rome' }).count()
const driftCard = await page.locator('.dkg-card', { hasText: 'What is Julius Caesar' }).count()
check('D4: map renders the active tree', rootCard === 1 && driftCard >= 1, `root=${rootCard} drift=${driftCard}`)

await browser.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
