/**
 * GATE D regression sweep — fable/connect-seeding
 * Adjacent surfaces: AI bridge edge still opens a focused thread; back returns
 * to the chips view with personal + AI edges intact (visited persistence);
 * same-term drifts elsewhere do NOT appear as personal edges (lens-sibling
 * filter); the Drift lens conversation view is unaffected; map smoke.
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
  // Genuinely related prior exploration (different term, contains "caesar")
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
  // SAME normalized term ("Caesar") in another chat — must be filtered out of
  // personal edges (it's a same-term thread, the sibling strip's territory)
  {
    id: 'root-3', title: 'Salad history', createdAt: now, lastMessage: 'reply',
    messages: [
      msg('r3-q', 'Where does the salad name come from?', true),
      msg('r3-a', 'It is named for Caesar, the restaurateur.', false, {
        hasDrift: true, driftInfos: [{ selectedText: 'Caesar', driftChatId: 'drift-same-term' }],
      }),
    ],
  },
  {
    id: 'drift-same-term', title: 'Caesar', createdAt: now, lastMessage: 'A restaurateur.',
    messages: [msg('ds-q', 'What is Caesar?', true), msg('ds-a', 'A restaurateur in Tijuana.', false)],
    metadata: { isDrift: true, parentChatId: 'root-3', sourceMessageId: 'r3-a', selectedText: 'Caesar' },
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

// Gemini mock: bridge prompts (mention a card concept) get prose; the initial
// connect prompt gets the card JSON; everything else 400s.
await page.route('**generativelanguage.googleapis.com/**', async (route) => {
  const url = route.request().url()
  if (url.includes('streamGenerateContent')) {
    let lastUser = ''
    try {
      const body = JSON.parse(route.request().postData() || '{}')
      lastUser = (body.contents || []).filter((c) => c.role === 'user').at(-1)?.parts?.map((p) => p.text).join('') || ''
    } catch {}
    const text = lastUser.includes('Pompey')
      ? 'Caesar and Pompey began as allies in the First Triumvirate before becoming rivals.'
      : JSON.stringify(['contrast :: political rival :: Pompey', 'cause :: rose through :: the Roman legions'])
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

await page.getByText('Ancient Rome', { exact: true }).first().click()
await page.waitForTimeout(800)
await page.locator('button', { hasText: 'Caesar' }).first().click()
await page.waitForTimeout(1000)

// D1: Drift lens (default conversation view) unaffected by the new code path
const driftQ = await page.getByText('What is Caesar?', { exact: false }).count()
const driftA = await page.getByText('A Roman leader.', { exact: false }).count()
check('D1: Drift lens conversation view intact', driftQ >= 1 && driftA >= 1, `q=${driftQ} a=${driftA}`)

await page.getByRole('button', { name: 'Connect', exact: true }).click()
await page.waitForTimeout(2500)

// D2: same-term drift elsewhere is NOT a personal edge (only Julius Caesar is).
// Scoped to the personal-edge buttons themselves — bare getByText('restaurateur')
// false-positives on the sidebar's lastMessage preview row.
const personalBtns = page.locator('button', { hasText: 'You explored' })
const youExplored = await personalBtns.count()
const isJulius = await personalBtns.filter({ hasText: 'Julius Caesar' }).count()
check('D2: same-term drift excluded from personal edges', youExplored === 1 && isJulius === 1, `personalEdges=${youExplored} julius=${isJulius}`)

// D3: AI bridge edge still opens a focused thread
await page.locator('button', { hasText: 'Pompey' }).first().click()
await page.waitForTimeout(2500)
const bridgeReply = await page.getByText('First Triumvirate', { exact: false }).count()
check('D3: AI bridge edge opens a focused thread', bridgeReply >= 1, `reply=${bridgeReply}`)
await page.screenshot({ path: '/tmp/fable-connect-gate-d-bridge.png' })

// D4: back returns to the chips view with personal + AI edges intact
await page.locator('[title="Back to suggestions"]').click()
await page.waitForTimeout(1000)
const backYou = await page.getByText('You explored', { exact: true }).count()
const backAi = await page.getByText('Pompey', { exact: false }).count()
check('D4: back to chips — personal + AI edges intact', backYou === 1 && backAi >= 1, `you=${backYou} ai=${backAi}`)
await page.screenshot({ path: '/tmp/fable-connect-gate-d-back.png' })

// D5: map smoke — the map is scoped to the ACTIVE chat's tree (root + its
// drifts; a persisted connect bridge thread may add a node), so assert the
// root and the drift are present rather than a global count.
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
await page.locator('[title="Drift Map (⌘⌥G)"]').click()
await page.waitForTimeout(1800)
const rootCard = await page.locator('.dkg-card', { hasText: 'Ancient Rome' }).count()
const driftCard = await page.locator('.dkg-card', { hasText: 'What is Caesar' }).count()
check('D5: map renders the active tree (root + drift)', rootCard === 1 && driftCard >= 1, `root=${rootCard} drift=${driftCard}`)

await browser.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
