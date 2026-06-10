/**
 * GATE C verification — fable/connect-seeding
 * Opens an existing drift ("Caesar"), switches to the Connect lens (mocked
 * Gemini returns the connect-card JSON), and asserts the user's own prior
 * drift ("Julius Caesar", lexically related, different chat) appears as a
 * violet "You explored" edge whose click reopens that prior drift. Hebrew
 * case mirrors it.
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
      msg('a1', 'Rome was shaped by Caesar above all.', false, {
        hasDrift: true, driftInfos: [{ selectedText: 'Caesar', driftChatId: 'drift-cur' }],
      }),
    ],
  },
  {
    id: 'drift-cur', title: 'Caesar', createdAt: now, lastMessage: 'A Roman leader.',
    messages: [msg('dc-q', 'What is Caesar?', true), msg('dc-a', 'A Roman leader.', false)],
    metadata: { isDrift: true, parentChatId: 'root-en', sourceMessageId: 'a1', selectedText: 'Caesar' },
  },
  // The user's prior exploration, in a DIFFERENT chat, lexically related
  // ("julius caesar" contains "caesar")
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
      msg('ha', 'ההיסטוריה של ירושלים העתיקה מרתקת.', false, {
        hasDrift: true, driftInfos: [{ selectedText: 'ירושלים העתיקה', driftChatId: 'drift-he-cur' }],
      }),
    ],
  },
  {
    id: 'drift-he-cur', title: 'ירושלים העתיקה', createdAt: now, lastMessage: 'עיר עתיקה',
    messages: [msg('dhc-q', 'מה זה ירושלים העתיקה?', true), msg('dhc-a', 'אזור היסטורי.', false)],
    metadata: { isDrift: true, parentChatId: 'root-he', sourceMessageId: 'ha', selectedText: 'ירושלים העתיקה' },
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

// Gemini mock: connect prompts get the connect-card JSON; everything else 400s.
await page.route('**generativelanguage.googleapis.com/**', async (route) => {
  const url = route.request().url()
  if (url.includes('streamGenerateContent')) {
    let lastUser = ''
    try {
      const body = JSON.parse(route.request().postData() || '{}')
      lastUser = (body.contents || []).filter((c) => c.role === 'user').at(-1)?.parts?.map((p) => p.text).join('') || ''
    } catch {}
    const hebrew = /[֐-׿]/.test(lastUser)
    const cards = hebrew
      ? ['contrast :: עיר מול אימפריה :: רומא העתיקה', 'cause :: התפתחה סביב :: דרכי מסחר']
      : ['contrast :: political rival :: Pompey', 'cause :: rose through :: the Roman legions']
    const text = JSON.stringify(cards)
    const sse = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\ndata: [DONE]\n\n`
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse })
  } else {
    await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
  }
})

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

// ── EN: open the drift, switch to Connect lens ───────────────────────────────
await page.getByText('Ancient Rome', { exact: true }).first().click()
await page.waitForTimeout(800)
// inline drift link "Caesar" in the AI reply opens the existing drift
await page.locator('button', { hasText: 'Caesar' }).first().click()
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Connect', exact: true }).click()
await page.waitForTimeout(2500)

// C1: personal "You explored" edge appears with the prior term
const youExplored = await page.getByText('You explored', { exact: true }).count()
const personalTerm = await page.locator('button', { hasText: 'Julius Caesar' }).filter({ hasText: 'You explored' }).count()
check('EN: personal "You explored" edge appears', youExplored === 1 && personalTerm === 1, `label=${youExplored} card=${personalTerm}`)

// C2: AI edges still render alongside
const aiEdge = await page.getByText('Pompey', { exact: false }).count()
const aiEdge2 = await page.getByText('the Roman legions', { exact: false }).count()
check('EN: AI bridge edges render alongside', aiEdge >= 1 && aiEdge2 >= 1, `pompey=${aiEdge} legions=${aiEdge2}`)
await page.screenshot({ path: '/tmp/fable-connect-en.png' })

// C3: clicking the personal edge reopens the prior drift conversation
await page.locator('button', { hasText: 'You explored' }).first().click()
await page.waitForTimeout(1200)
const priorQ = await page.getByText('What is Julius Caesar?', { exact: false }).count()
const priorA = await page.getByText('Roman general and statesman of the late Republic', { exact: false }).count()
check('EN: personal edge reopens the prior drift', priorQ >= 1 && priorA >= 1, `q=${priorQ} a=${priorA}`)
await page.screenshot({ path: '/tmp/fable-connect-en-reopened.png' })

// ── HE: same flow in Hebrew ──────────────────────────────────────────────────
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
const sidebarBtn = page.locator('[title="Open sidebar"]')
if (await sidebarBtn.count()) { await sidebarBtn.click(); await page.waitForTimeout(400) }
await page.getByText('היסטוריה', { exact: true }).first().click()
await page.waitForTimeout(800)
await page.locator('button', { hasText: 'ירושלים העתיקה' }).first().click()
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Connect', exact: true }).click()
await page.waitForTimeout(2500)

const heYou = await page.getByText('You explored', { exact: true }).count()
const heCard = await page.locator('button', { hasText: 'ירושלים' }).filter({ hasText: 'You explored' }).count()
check('HE: personal edge appears for Hebrew prior drift', heYou === 1 && heCard === 1, `label=${heYou} card=${heCard}`)
const heAi = await page.getByText('רומא העתיקה', { exact: false }).count()
check('HE: Hebrew AI edges render', heAi >= 1, `count=${heAi}`)
// RTL: the connect hub container should be dir=rtl
const hubDir = await page.locator('div[dir="rtl"]', { has: page.getByText('You explored', { exact: true }) }).count()
check('HE: connect map renders RTL', hubDir >= 1, `rtlContainers=${hubDir}`)
await page.screenshot({ path: '/tmp/fable-connect-he.png' })

await page.locator('button', { hasText: 'You explored' }).first().click()
await page.waitForTimeout(1200)
const hePriorA = await page.getByText('עיר הבירה של ישראל', { exact: false }).count()
check('HE: Hebrew personal edge reopens prior drift', hePriorA >= 1, `a=${hePriorA}`)

await browser.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
