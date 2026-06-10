/**
 * GATE C verification — fable/edit-regenerate
 * All Gemini traffic is intercepted: streamGenerateContent returns a
 * deterministic SSE reply that echoes the last user turn; everything else
 * 400s (silently caught by the app). No real API calls are made.
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5199'
const now = new Date().toISOString()
const msg = (id, text, isUser, extra = {}) => ({ id, text, isUser, timestamp: now, ...extra })

const ansRome = 'Rome was shaped by figures like Julius Caesar.'
const ansEconomy = 'The economy relied on agriculture and trade routes.'
const chats = [
  {
    id: 'root-en', title: 'Tell me about ancient Rome', createdAt: now, lastMessage: ansEconomy,
    messages: [
      msg('q1', 'Tell me about ancient Rome', true),
      msg('a1', ansRome, false, { hasDrift: true, driftInfos: [{ selectedText: 'Julius Caesar', driftChatId: 'drift-a' }] }),
      msg('q2', 'What about its economy?', true),
      msg('a2', ansEconomy, false),
    ],
  },
  {
    id: 'drift-a', title: 'Julius Caesar', createdAt: now, lastMessage: 'Roman general',
    messages: [msg('da-q', 'What is Julius Caesar?', true), msg('da-a', 'A Roman general.', false)],
    metadata: { isDrift: true, parentChatId: 'root-en', sourceMessageId: 'a1', selectedText: 'Julius Caesar' },
  },
  {
    id: 'root-he', title: 'ספר לי על רומא', createdAt: now, lastMessage: 'תשובה',
    messages: [
      msg('hq1', 'ספר לי על רומא', true),
      msg('ha1', 'רומא הייתה אימפריה עצומה.', false),
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

// ── Gemini mock ───────────────────────────────────────────────────────────────
await page.route('**generativelanguage.googleapis.com/**', async (route) => {
  const url = route.request().url()
  if (url.includes('streamGenerateContent')) {
    let lastUser = ''
    try {
      const body = JSON.parse(route.request().postData() || '{}')
      const userTurns = (body.contents || []).filter((c) => c.role === 'user')
      lastUser = userTurns.at(-1)?.parts?.map((p) => p.text).join('') || ''
    } catch {}
    const hebrew = /[֐-׿]/.test(lastUser)
    const replyText = hebrew ? `תשובה מחודשת על: ${lastUser}` : `Regenerated exploration of: ${lastUser}`
    const sse = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: replyText }] } }] })}\n\ndata: [DONE]\n\n`
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

await page.getByText('Tell me about ancient Rome', { exact: true }).first().click()
await page.waitForTimeout(800)

// ── C1: edit affordance appears on hover over a user turn ───────────────────
const q2 = page.locator('[data-message-id="q2"]')
await q2.hover()
await page.waitForTimeout(300)
const editBtn = page.locator('[title="Edit & regenerate"]').last()
const btnVisible = await editBtn.count()
check('C1: edit affordance present on user turn', btnVisible >= 1, `count=${btnVisible}`)

// ── C2: clicking edit opens inline editor pre-filled with the original ──────
await editBtn.click()
await page.waitForTimeout(400)
const ta = page.locator('textarea').filter({ hasText: '' }).nth(0)
const editor = page.locator('[data-message-id="q2"] textarea')
const taVal = await editor.inputValue().catch(() => '(none)')
check('C2: inline editor pre-filled with original text', taVal === 'What about its economy?', `value=${taVal}`)
await page.screenshot({ path: '/tmp/fable-edit-editor.png' })

// ── C3: Escape cancels cleanly ───────────────────────────────────────────────
await editor.press('Escape')
await page.waitForTimeout(300)
const stillOld = await page.getByText('What about its economy?', { exact: true }).count()
const taGone = await page.locator('[data-message-id="q2"] textarea').count()
check('C3: Escape cancels, message unchanged', stillOld >= 1 && taGone === 0, `text=${stillOld} ta=${taGone}`)

// ── C4: edit + regenerate truncates and streams a new reply ─────────────────
await q2.hover()
await page.locator('[title="Edit & regenerate"]').last().click()
await page.waitForTimeout(300)
await page.locator('[data-message-id="q2"] textarea').fill('What about Roman military tactics?')
await page.getByText('Regenerate', { exact: true }).click()
await page.waitForTimeout(2000)
const newQ = await page.getByText('What about Roman military tactics?', { exact: true }).count()
const newA = await page.getByText('Regenerated exploration of: What about Roman military tactics?', { exact: false }).count()
const oldA = await page.getByText('economy relied on agriculture', { exact: false }).locator('visible=true').count()
check('C4: edited turn replaces old + new reply streams in', newQ >= 1 && newA >= 1, `q=${newQ} a=${newA}`)
check('C4b: old downstream reply is discarded', oldA === 0, `oldVisible=${oldA}`)
await page.screenshot({ path: '/tmp/fable-edit-en-happy.png' })

// ── C5: earlier turns + their drift links survive ────────────────────────────
const a1 = await page.getByText('Rome was shaped by figures', { exact: false }).count()
check('C5: earlier reply (with drift link) untouched', a1 >= 1, `count=${a1}`)

// ── C6: truncation persisted (survives reload) ───────────────────────────────
await page.reload()
await page.waitForTimeout(1200)
await page.getByText('Tell me about ancient Rome', { exact: true }).first().click()
await page.waitForTimeout(800)
const persistedQ = await page.getByText('What about Roman military tactics?', { exact: true }).count()
const persistedOld = await page.getByText('What about its economy?', { exact: true }).count()
check('C6: edit persisted after reload', persistedQ >= 1 && persistedOld === 0, `new=${persistedQ} old=${persistedOld}`)

// ── C7: editing the FIRST turn discards a reply that had drift links,
//        but the drift session itself survives ───────────────────────────────
const q1 = page.locator('[data-message-id="q1"]')
await q1.hover()
await page.locator('[title="Edit & regenerate"]').first().click()
await page.waitForTimeout(300)
await page.locator('[data-message-id="q1"] textarea').fill('Give me an overview of the Roman Republic')
await page.getByText('Regenerate', { exact: true }).click()
await page.waitForTimeout(2000)
const goneA1 = await page.getByText('Rome was shaped by figures', { exact: false }).locator('visible=true').count()
const newA1 = await page.getByText('Regenerated exploration of: Give me an overview', { exact: false }).count()
check('C7: first-turn edit regenerates from the top', goneA1 === 0 && newA1 >= 1, `old=${goneA1} new=${newA1}`)

// retitle check: chat was auto-titled from q1, so the title should follow
const sidebarBtn = page.locator('[title="Open sidebar"]')
if (await sidebarBtn.count()) { await sidebarBtn.click(); await page.waitForTimeout(400) }
const retitled = await page.getByText('Give me an overview of the Roman Republic', { exact: false }).count()
check('C7b: auto-title follows the edited first turn', retitled >= 1, `count=${retitled}`)
// The drift session must survive in the store (sidebar nests drifts under
// their root and may render them collapsed, so DOM count is not the truth).
const driftStill = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const req = indexedDB.open('drift-db', 2)
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  const rec = await new Promise((res) => {
    const tx = db.transaction('drift-chats', 'readonly')
    const r = tx.objectStore('drift-chats').get('drift-a')
    r.onsuccess = () => res(r.result)
    r.onerror = () => res(undefined)
  })
  db.close()
  return rec ? { title: rec.title, msgs: rec.messages?.length } : null
})
check('C7c: drift session survives discarded parent reply', !!driftStill && driftStill.msgs === 2, JSON.stringify(driftStill))

// ── C8: Hebrew — RTL editor + Hebrew regeneration ────────────────────────────
await page.getByText('ספר לי על רומא', { exact: true }).first().click()
await page.waitForTimeout(800)
const hq = page.locator('[data-message-id="hq1"]')
await hq.hover()
await page.locator('[title="Edit & regenerate"]').first().click()
await page.waitForTimeout(300)
const heTa = page.locator('[data-message-id="hq1"] textarea')
const heDir = await heTa.getAttribute('dir')
check('HE: editor opens RTL for Hebrew text', heDir === 'rtl', `dir=${heDir}`)
await heTa.fill('מה היו ההישגים של רומא?')
await page.getByText('Regenerate', { exact: true }).click()
await page.waitForTimeout(2000)
const heNewQ = await page.getByText('מה היו ההישגים של רומא?', { exact: true }).count()
const heNewA = await page.getByText('תשובה מחודשת על: מה היו ההישגים של רומא?', { exact: false }).count()
check('HE: Hebrew edit regenerates with Hebrew reply', heNewQ >= 1 && heNewA >= 1, `q=${heNewQ} a=${heNewA}`)
await page.screenshot({ path: '/tmp/fable-edit-he.png' })

await browser.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
