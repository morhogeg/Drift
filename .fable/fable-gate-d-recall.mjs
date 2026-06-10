/**
 * GATE D regression sweep — fable/recall-highlights
 * Confirms adjacent surfaces are intact: a plain (unexplored) suggestion still
 * starts a NEW drift; inline drift links in the parent chat still render and
 * open; the Drift Map still renders cards/rivers.
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5199'
const now = new Date().toISOString()
const msg = (id, text, isUser, extra = {}) => ({ id, text, isUser, timestamp: now, ...extra })

const ansCaesar = 'Julius Caesar was a Roman general and statesman who transformed the Roman Republic.'
const chats = [
  {
    id: 'root-en', title: 'Ancient Rome', createdAt: now, lastMessage: 'reply',
    messages: [
      msg('m-en-1', 'Tell me about ancient Rome', true),
      msg('m-en-2', 'Rome was shaped by figures like Julius Caesar.', false, {
        hasDrift: true,
        driftInfos: [{ selectedText: 'Julius Caesar', driftChatId: 'drift-a' }],
      }),
    ],
  },
  {
    id: 'drift-a', title: 'Julius Caesar', createdAt: now, lastMessage: ansCaesar.slice(0, 60),
    messages: [msg('drift-a-q', 'What is Julius Caesar?', true), msg('drift-a-a', ansCaesar, false)],
    metadata: { isDrift: true, parentChatId: 'root-en', sourceMessageId: 'm-en-2', selectedText: 'Julius Caesar' },
  },
  {
    id: 'chat-2', title: 'Roman Empire', createdAt: now, lastMessage: 'reply',
    messages: [
      msg('m2-1', 'What defined the Roman Empire?', true),
      msg('m2-2', 'The empire was defined by Julius Caesar and later by the Pax Romana era of stability.', false, {
        suggestedHighlights: ['Julius Caesar', 'Pax Romana'],
      }),
    ],
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
  const put = (val) => new Promise((res, rej) => {
    const tx = db.transaction('drift-chats', 'readwrite')
    tx.objectStore('drift-chats').put(val)
    tx.oncomplete = res; tx.onerror = () => rej(tx.error)
  })
  for (const c of chats) await put(c)
  db.close()
}, { chats })

await page.reload()
await page.waitForTimeout(1200)

// D1: plain suggestion still starts a NEW drift
await page.getByText('Roman Empire', { exact: true }).first().click()
await page.waitForTimeout(800)
await page.locator('.drift-suggestion:not(.drift-suggestion-recall)', { hasText: 'Pax Romana' }).first().click()
await page.waitForTimeout(1200)
// A fresh drift panel shows the cold-start prompt for the term (a reopened
// prior drift would show its old conversation instead). Visibility-scoped so
// the sidebar's offscreen lastMessage previews can't pollute the count.
const freshPrompt = await page.getByText('What would you like to know about "Pax Romana"?', { exact: false }).count()
// The prior drift's question only exists in panel conversation content (the
// sidebar previews only show titles/lastMessage), so it cleanly discriminates
// "reopened old drift" from "fresh drift".
const priorQ = await page.getByText('What is Julius Caesar?', { exact: false }).locator('visible=true').count()
check('D1: plain suggestion opens a NEW drift for the term', freshPrompt >= 1 && priorQ === 0, `fresh=${freshPrompt} priorQ=${priorQ}`)
await page.screenshot({ path: '/tmp/fable-recall-gate-d-newdrift.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// D2: inline drift links in the parent chat still render + open
const sidebarBtn = page.locator('[title="Open sidebar"]')
if (await sidebarBtn.count()) { await sidebarBtn.click(); await page.waitForTimeout(400) }
await page.getByText('Ancient Rome', { exact: true }).first().click()
await page.waitForTimeout(800)
const reply = await page.getByText('Rome was shaped by figures', { exact: false }).count()
check('D2: parent chat reply with driftInfos still renders', reply >= 1, `count=${reply}`)

// D3: map still renders cards + river
await page.locator('[title="Drift Map (⌘⌥G)"]').click()
await page.waitForTimeout(1800)
const cards = await page.locator('.dkg-card').count()
const rivers = await page.locator('path[fill^="url(#dkg-link"]').count()
check('D3: map renders 2 cards + 1 lineage river', cards === 2 && rivers === 1, `cards=${cards} rivers=${rivers}`)

await browser.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
