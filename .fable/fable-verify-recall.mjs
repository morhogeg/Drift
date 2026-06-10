/**
 * GATE C verification — fable/recall-highlights
 * Seeds: chat "Ancient Rome" with a prior drift on "Julius Caesar"; a second
 * chat "Roman Empire" whose AI reply suggests highlights ["Julius Caesar",
 * "Pax Romana"]. Asserts the already-explored term renders as a cyan recall
 * mark whose click REOPENS the prior drift (not a fresh one), the unexplored
 * term renders as a normal violet suggestion, and the Hebrew case works.
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5199'
const now = new Date().toISOString()
const msg = (id, text, isUser, extra = {}) => ({ id, text, isUser, timestamp: now, ...extra })

const ansCaesar = 'Julius Caesar was a Roman general and statesman who transformed the Roman Republic.'

const chats = [
  // Prior exploration lives here
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
  // New chat where the recall should fire
  {
    id: 'chat-2', title: 'Roman Empire', createdAt: now, lastMessage: 'reply',
    messages: [
      msg('m2-1', 'What defined the Roman Empire?', true),
      msg('m2-2', 'The empire was defined by Julius Caesar and later by the Pax Romana era of stability.', false, {
        suggestedHighlights: ['Julius Caesar', 'Pax Romana'],
      }),
    ],
  },
  // Hebrew: prior drift on ירושלים, new chat mentioning it
  {
    id: 'root-he', title: 'היסטוריה', createdAt: now, lastMessage: 'תשובה',
    messages: [
      msg('mh-1', 'ספר לי על ההיסטוריה', true),
      msg('mh-2', 'ההיסטוריה קשורה לירושלים.', false, {
        hasDrift: true,
        driftInfos: [{ selectedText: 'ירושלים', driftChatId: 'drift-he' }],
      }),
    ],
  },
  {
    id: 'drift-he', title: 'ירושלים', createdAt: now, lastMessage: 'עיר עתיקה',
    messages: [msg('dh-q', 'מה זה ירושלים?', true), msg('dh-a', 'ירושלים היא עיר עתיקה בעלת חשיבות עצומה.', false)],
    metadata: { isDrift: true, parentChatId: 'root-he', sourceMessageId: 'mh-2', selectedText: 'ירושלים' },
  },
  {
    id: 'chat-he-2', title: 'מסע לישראל', createdAt: now, lastMessage: 'תשובה',
    messages: [
      msg('mh2-1', 'לאן כדאי לנסוע בישראל?', true),
      msg('mh2-2', 'כדאי מאוד לבקר בעיר ירושלים ובמדבר יהודה.', false, {
        suggestedHighlights: ['ירושלים', 'מדבר יהודה'],
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

// ── English: open "Roman Empire" ─────────────────────────────────────────────
await page.getByText('Roman Empire', { exact: true }).first().click()
await page.waitForTimeout(800)

// C1: explored term renders as recall mark
const recallEl = page.locator('.drift-suggestion-recall', { hasText: 'Julius Caesar' })
const recallCount = await recallEl.count()
check('EN: explored term gets a recall mark', recallCount === 1, `count=${recallCount}`)

// C2: tooltip names the prior exploration
const recallTitle = recallCount ? await recallEl.first().getAttribute('title') : ''
check('EN: recall tooltip names prior drift', /Explored before/.test(recallTitle || '') && /Julius Caesar/.test(recallTitle || ''), recallTitle || '(none)')

// C3: unexplored term renders as a plain violet suggestion (no recall class)
const plain = await page.locator('.drift-suggestion:not(.drift-suggestion-recall)', { hasText: 'Pax Romana' }).count()
const paxRecall = await page.locator('.drift-suggestion-recall', { hasText: 'Pax Romana' }).count()
check('EN: unexplored term stays a normal suggestion', plain === 1 && paxRecall === 0, `plain=${plain} recall=${paxRecall}`)

// C4: ≤1 underline per term still holds
const allCaesar = await page.locator('.drift-suggestion', { hasText: 'Julius Caesar' }).count()
check('EN: still at most one underline for the term', allCaesar === 1, `count=${allCaesar}`)
await page.screenshot({ path: '/tmp/fable-recall-en.png' })

// C5: clicking the recall mark REOPENS the prior drift (its old answer shows)
await recallEl.first().click()
await page.waitForTimeout(1200)
const priorQ = await page.getByText('What is Julius Caesar?', { exact: false }).count()
const priorA = await page.getByText('Roman general and statesman', { exact: false }).count()
check('EN: click reopens the prior drift conversation', priorQ >= 1 && priorA >= 1, `q=${priorQ} a=${priorA}`)
await page.screenshot({ path: '/tmp/fable-recall-en-reopened.png' })

// ── Hebrew ───────────────────────────────────────────────────────────────────
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
const sidebarBtn = page.locator('[title="Open sidebar"]')
if (await sidebarBtn.count()) { await sidebarBtn.click(); await page.waitForTimeout(400) }
await page.getByText('מסע לישראל', { exact: true }).first().click()
await page.waitForTimeout(800)

// C6: Hebrew recall mark on previously explored Hebrew term
const heRecall = page.locator('.drift-suggestion-recall', { hasText: 'ירושלים' })
const heCount = await heRecall.count()
check('HE: Hebrew explored term gets a recall mark', heCount === 1, `count=${heCount}`)
const hePlain = await page.locator('.drift-suggestion:not(.drift-suggestion-recall)', { hasText: 'מדבר יהודה' }).count()
check('HE: Hebrew unexplored term stays normal', hePlain === 1, `count=${hePlain}`)
await page.screenshot({ path: '/tmp/fable-recall-he.png' })

// C7: Hebrew recall click reopens the prior Hebrew drift
if (heCount) {
  await heRecall.first().click()
  await page.waitForTimeout(1200)
  const heQ = await page.getByText('מה זה ירושלים?', { exact: false }).count()
  check('HE: click reopens prior Hebrew drift', heQ >= 1, `q=${heQ}`)
  await page.screenshot({ path: '/tmp/fable-recall-he-reopened.png' })
} else {
  check('HE: click reopens prior Hebrew drift', false, 'skipped — no recall mark')
}

await browser.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
