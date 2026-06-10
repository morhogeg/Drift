/**
 * GATE C verification — fable/chip-recall
 * "Drift into" chips below AI replies become recall-aware: a chip whose term
 * was already drifted on (in any chat) renders cyan and REOPENS that prior
 * drift; unexplored terms keep the violet new-exploration chip. EN + HE.
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
      msg('a1', 'Rome rose under Julius Caesar and later flourished in the Pax Romana.', false, {
        suggestedHighlights: ['Julius Caesar', 'Pax Romana'],
      }),
    ],
  },
  // Prior exploration of "Julius Caesar" in a DIFFERENT chat → recall chip
  {
    id: 'root-2', title: 'Roman biographies', createdAt: now, lastMessage: 'reply',
    messages: [
      msg('r2-q', 'Who shaped the Republic?', true),
      msg('r2-a', 'Above all, Julius Caesar.', false, {
        hasDrift: true, driftInfos: [{ selectedText: 'Julius Caesar', driftChatId: 'drift-prior' }],
      }),
    ],
  },
  {
    id: 'drift-prior', title: 'Julius Caesar', createdAt: now, lastMessage: 'Roman general and statesman',
    messages: [msg('dp-q', 'What is Julius Caesar?', true), msg('dp-a', 'A Roman general and statesman of the late Republic.', false)],
    metadata: { isDrift: true, parentChatId: 'root-2', sourceMessageId: 'r2-a', selectedText: 'Julius Caesar' },
  },
  // Hebrew mirror
  {
    id: 'root-he', title: 'היסטוריה', createdAt: now, lastMessage: 'תשובה',
    messages: [
      msg('hq', 'ספר לי על ההיסטוריה', true),
      msg('ha', 'ההיסטוריה של ירושלים ושל יפו מרתקת.', false, {
        suggestedHighlights: ['ירושלים', 'יפו'],
      }),
    ],
  },
  {
    id: 'root-he-2', title: 'מסעות', createdAt: now, lastMessage: 'תשובה',
    messages: [
      msg('h2q', 'לאן לנסוע?', true),
      msg('h2a', 'מומלץ לבקר בירושלים.', false, {
        hasDrift: true, driftInfos: [{ selectedText: 'ירושלים', driftChatId: 'drift-he-prior' }],
      }),
    ],
  },
  {
    id: 'drift-he-prior', title: 'ירושלים', createdAt: now, lastMessage: 'עיר הבירה',
    messages: [msg('dhp-q', 'מה זה ירושלים?', true), msg('dhp-a', 'עיר הבירה של ישראל, עתיקה וקדושה.', false)],
    metadata: { isDrift: true, parentChatId: 'root-he-2', sourceMessageId: 'h2a', selectedText: 'ירושלים' },
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

// All Gemini endpoints 400 (silently caught) — this feature is fully offline.
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

// ── EN ───────────────────────────────────────────────────────────────────────
await page.getByText('Ancient Rome', { exact: true }).first().click()
await page.waitForTimeout(800)

// C1: explored term renders as a cyan recall chip (title says reopen)
const recallChip = page.locator('button[title*="Explored before"]', { hasText: 'Julius Caesar' })
const recallCount = await recallChip.count()
check('EN: explored term renders as recall chip', recallCount === 1, `count=${recallCount}`)

// C2: unexplored term keeps the violet new-exploration chip
const newChip = page.locator('button[title=\'Drift into "Pax Romana"\']')
const newCount = await newChip.count()
const paxNotRecall = await page.locator('button[title*="Explored before"]', { hasText: 'Pax Romana' }).count()
check('EN: unexplored term keeps new-exploration chip', newCount === 1 && paxNotRecall === 0, `new=${newCount} wrongRecall=${paxNotRecall}`)
await page.screenshot({ path: '/tmp/fable-chips-en.png' })

// C3: clicking the recall chip REOPENS the prior drift (its conversation shows)
await recallChip.click()
await page.waitForTimeout(1200)
const priorQ = await page.getByText('What is Julius Caesar?', { exact: false }).count()
const priorA = await page.getByText('Roman general and statesman of the late Republic', { exact: false }).count()
check('EN: recall chip reopens the prior drift', priorQ >= 1 && priorA >= 1, `q=${priorQ} a=${priorA}`)
await page.screenshot({ path: '/tmp/fable-chips-en-reopened.png' })

// C4 (edge): the violet chip still starts a NEW drift (cold-start prompt, no
// prior conversation content)
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
await newChip.click()
await page.waitForTimeout(1200)
const coldStart = await page.getByText('What would you like to know about "Pax Romana"?', { exact: false }).count()
const noPrior = await page.getByText('What is Julius Caesar?', { exact: false }).count()
check('EN: violet chip still starts a NEW drift', coldStart >= 1 && noPrior === 0, `cold=${coldStart} leak=${noPrior}`)

// ── HE ───────────────────────────────────────────────────────────────────────
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
const sidebarBtn = page.locator('[title="Open sidebar"]')
if (await sidebarBtn.count()) { await sidebarBtn.click(); await page.waitForTimeout(400) }
await page.getByText('היסטוריה', { exact: true }).first().click()
await page.waitForTimeout(800)

// C5: Hebrew explored term → recall chip, rendered RTL
const heRecall = page.locator('button[title*="Explored before"]', { hasText: 'ירושלים' })
const heRecallCount = await heRecall.count()
const heRtl = await page.locator('button[title*="Explored before"][dir="rtl"]').count()
const heNew = await page.locator('button[title=\'Drift into "יפו"\']').count()
check('HE: explored Hebrew term renders recall chip (RTL)', heRecallCount === 1 && heRtl === 1 && heNew === 1, `recall=${heRecallCount} rtl=${heRtl} new=${heNew}`)
await page.screenshot({ path: '/tmp/fable-chips-he.png' })

// C6: Hebrew recall chip reopens the prior Hebrew drift
await heRecall.click()
await page.waitForTimeout(1200)
const hePriorA = await page.getByText('עיר הבירה של ישראל', { exact: false }).count()
check('HE: Hebrew recall chip reopens prior drift', hePriorA >= 1, `a=${hePriorA}`)
await page.screenshot({ path: '/tmp/fable-chips-he-reopened.png' })

await browser.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
