/**
 * GATE C verification — fable/map-semantic-edges
 * Seeds IDB with a root chat + 3 drifts (2 semantically related, 1 unrelated)
 * plus cached embedding vectors, then asserts the Drift Map draws exactly one
 * dashed-cyan resonance edge, the legend shows, the filter dims it, and the
 * Hebrew case renders.
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5199'
const SHOT = (n) => `/tmp/fable-map-${n}.png`

// djb2-xor (mirror of embeddingBackfill.hashText)
const hashText = (s) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return `${(h >>> 0).toString(36)}-${s.length.toString(36)}`
}
const buildEmbedText = (term, firstAnswer) =>
  [term, firstAnswer.trim().slice(0, 600)].filter(Boolean).join('\n').trim()

const now = new Date().toISOString()
const msg = (id, text, isUser, extra = {}) => ({ id, text, isUser, timestamp: now, ...extra })

// ── English scenario ─────────────────────────────────────────────────────────
const ansCaesar = 'Julius Caesar was a Roman general and statesman who transformed the Roman Republic.'
const ansAqueduct = 'Roman aqueducts carried water across the empire using gravity alone, a marvel of engineering.'
const ansPhoto = 'Photosynthesis converts light energy into chemical energy in plants.'

const rootEn = {
  id: 'root-en', title: 'Ancient Rome', createdAt: now, lastMessage: 'long reply',
  messages: [
    msg('m-en-1', 'Tell me about ancient Rome', true),
    msg('m-en-2', 'Rome was shaped by figures like Julius Caesar, by Roman aqueducts, and oddly enough not by photosynthesis.', false, {
      hasDrift: true,
      driftInfos: [
        { selectedText: 'Julius Caesar', driftChatId: 'drift-a' },
        { selectedText: 'Roman aqueducts', driftChatId: 'drift-b' },
        { selectedText: 'photosynthesis', driftChatId: 'drift-c' },
      ],
    }),
  ],
}
const driftChat = (id, parent, srcMsg, term, answer) => ({
  id, title: term, createdAt: now, lastMessage: answer.slice(0, 60),
  messages: [msg(`${id}-q`, `What is ${term}?`, true), msg(`${id}-a`, answer, false)],
  metadata: { isDrift: true, parentChatId: parent, sourceMessageId: srcMsg, selectedText: term },
})

// ── Hebrew scenario ──────────────────────────────────────────────────────────
const ansJeru = 'ירושלים היא עיר עתיקה בעלת חשיבות דתית והיסטורית עצומה לשלושת הדתות.'
const ansTemple = 'בית המקדש עמד בירושלים והיה המרכז הדתי של העם היהודי בתקופת בית שני.'
const rootHe = {
  id: 'root-he', title: 'היסטוריה של ירושלים', createdAt: now, lastMessage: 'תשובה',
  messages: [
    msg('m-he-1', 'ספר לי על ההיסטוריה של ירושלים', true),
    msg('m-he-2', 'ירושלים קשורה קשר הדוק לבית המקדש לאורך הדורות.', false, {
      hasDrift: true,
      driftInfos: [
        { selectedText: 'ירושלים', driftChatId: 'drift-he-a' },
        { selectedText: 'בית המקדש', driftChatId: 'drift-he-b' },
      ],
    }),
  ],
}

// Vectors: a↔b related (high cosine), c orthogonal. 8-dim is fine for cosine.
const vecA = [1, 0.9, 0.1, 0, 0, 0, 0, 0]
const vecB = [0.9, 1, 0.05, 0, 0, 0, 0, 0]
const vecC = [0, 0, 0, 0, 1, 0.8, 0.2, 0]
const embRec = (id, term, answer, vec) => ({
  id, vec, text: buildEmbedText(term, answer), hash: hashText(buildEmbedText(term, answer)),
  model: 'gemini-embedding-001', updatedAt: now,
})

const chats = [
  rootEn,
  driftChat('drift-a', 'root-en', 'm-en-2', 'Julius Caesar', ansCaesar),
  driftChat('drift-b', 'root-en', 'm-en-2', 'Roman aqueducts', ansAqueduct),
  driftChat('drift-c', 'root-en', 'm-en-2', 'photosynthesis', ansPhoto),
  rootHe,
  driftChat('drift-he-a', 'root-he', 'm-he-2', 'ירושלים', ansJeru),
  driftChat('drift-he-b', 'root-he', 'm-he-2', 'בית המקדש', ansTemple),
]
const embeddings = [
  embRec('drift-a', 'Julius Caesar', ansCaesar, vecA),
  embRec('drift-b', 'Roman aqueducts', ansAqueduct, vecB),
  embRec('drift-c', 'photosynthesis', ansPhoto, vecC),
  embRec('drift-he-a', 'ירושלים', ansJeru, vecA),
  embRec('drift-he-b', 'בית המקדש', ansTemple, vecB),
]

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

await page.goto(BASE)
// Skip login/onboarding/coachmarks
await page.evaluate(() => {
  localStorage.setItem('driftUser', 'Fable')
  localStorage.setItem('drift_onboarded', 'true')
  localStorage.setItem('drift_once_drift-gesture', '1')
  localStorage.setItem('drift_once_lens-bar', '1')
  localStorage.setItem('drift_once_map-spotlight', '1')
})
// Seed IDB
await page.evaluate(async ({ chats, embeddings }) => {
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
  const put = (store, val) => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(val)
    tx.oncomplete = res; tx.onerror = () => rej(tx.error)
  })
  for (const c of chats) await put('drift-chats', c)
  for (const e of embeddings) await put('drift-embeddings', e)
  db.close()
}, { chats, embeddings })

await page.reload()
await page.waitForTimeout(1200)

// ── English: open the Ancient Rome chat, open the map ───────────────────────
await page.getByText('Ancient Rome', { exact: true }).first().click()
await page.waitForTimeout(600)
await page.locator('[title="Drift Map (⌘⌥G)"]').click()
await page.waitForTimeout(1800)

const resCount = await page.locator('path.dkg-resonance').count()
check('EN: exactly one resonance edge (a↔b, not c)', resCount === 1, `count=${resCount}`)
const legend = await page.getByText('related by meaning', { exact: true }).count()
check('EN: legend visible', legend >= 1, `count=${legend}`)

// ── The actual fix: hovering the arc must surface the custom glass tooltip.
// Compute the arc's geometric midpoint, hover there, and assert the .dkg-restip
// chip appears with both terms AND is fully inside the viewport (the bug was a
// too-thin hit line + a tooltip that overflowed the screen edge).
const mid = await page.evaluate(() => {
  const arc = document.querySelector('path.dkg-resonance')
  if (!arc) return null
  const len = arc.getTotalLength()
  const p = arc.getPointAtLength(len / 2)
  const pt = arc.ownerSVGElement.createSVGPoint(); pt.x = p.x; pt.y = p.y
  const s = pt.matrixTransform(arc.getScreenCTM())
  return { x: Math.round(s.x), y: Math.round(s.y) }
})
check('EN: arc midpoint resolvable', !!mid, mid ? `(${mid.x},${mid.y})` : 'no arc')
if (mid) { await page.mouse.move(mid.x, mid.y); await page.waitForTimeout(300) }
const tipText = await page.locator('.dkg-restip').first().innerText().catch(() => '')
check('EN: hover surfaces the custom tooltip with both terms',
  /Julius Caesar/.test(tipText) && /Roman aqueducts/.test(tipText) && /related by meaning/i.test(tipText),
  JSON.stringify(tipText))
const tipBox = await page.locator('.dkg-restip').first().evaluate((el) => {
  const r = el.getBoundingClientRect()
  return {
    inViewport: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
    w: Math.round(r.width),
    l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom),
  }
}).catch(() => ({ inViewport: false, w: 0 }))
check('EN: tooltip stays on-screen and stays compact (≤260px)', tipBox.inViewport && tipBox.w <= 260, JSON.stringify(tipBox))
// Proximity: the tooltip must hug the cursor (not fly to a corner). Gap from the
// cursor to the nearest tooltip edge should be small.
const gx = mid.x < tipBox.l ? tipBox.l - mid.x : (mid.x > tipBox.r ? mid.x - tipBox.r : 0)
const gy = mid.y < tipBox.t ? tipBox.t - mid.y : (mid.y > tipBox.b ? mid.y - tipBox.b : 0)
const gap = Math.round(Math.hypot(gx, gy))
check('EN: tooltip hugs the cursor (≤40px gap)', gap <= 40, `gap=${gap}px`)
await page.screenshot({ path: SHOT('en-happy') })

// ── Edge case: filter dims the resonance edge ────────────────────────────────
await page.locator('input[placeholder="Filter cards…"]').fill('photosynthesis')
await page.waitForTimeout(600)
const dimOpacity = await page.locator('path.dkg-resonance').first().getAttribute('opacity')
check('EN: filtering to unrelated card dims the edge', dimOpacity === '0', `opacity=${dimOpacity}`)
await page.screenshot({ path: SHOT('en-filtered') })
await page.locator('input[placeholder="Filter cards…"]').fill('')
await page.waitForTimeout(400)

// ── Selection brightens the edge ─────────────────────────────────────────────
await page.locator('.dkg-card', { hasText: 'What is Julius Caesar' }).first().dispatchEvent('pointerup')
await page.waitForTimeout(500)
const litW = await page.locator('path.dkg-resonance').first().getAttribute('stroke-width')
check('EN: selecting an endpoint brightens the edge', litW === '1.8', `stroke-width=${litW}`)

// ── Hebrew case ───────────────────────────────────────────────────────────────
// Close map, reopen sidebar, switch to the Hebrew chat, reopen map
await page.locator('[title="Drift Map (\u2318\u2325G)"]').click()
await page.waitForTimeout(600)
const openSb = page.locator('[title="Open sidebar"]')
if (await openSb.count()) { await openSb.first().click(); await page.waitForTimeout(400) }
await page.getByText('היסטוריה של ירושלים').first().click()
await page.waitForTimeout(600)
await page.locator('[title="Drift Map (\u2318\u2325G)"]').click()
await page.waitForTimeout(1800)
const resHe = await page.locator('path.dkg-resonance').count()
check('HE: resonance edge between Hebrew drifts', resHe === 1, `count=${resHe}`)
const midHe = await page.evaluate(() => {
  const arc = document.querySelector('path.dkg-resonance')
  if (!arc) return null
  const len = arc.getTotalLength()
  const p = arc.getPointAtLength(len / 2)
  const pt = arc.ownerSVGElement.createSVGPoint(); pt.x = p.x; pt.y = p.y
  const s = pt.matrixTransform(arc.getScreenCTM())
  return { x: Math.round(s.x), y: Math.round(s.y) }
})
if (midHe) { await page.mouse.move(midHe.x, midHe.y); await page.waitForTimeout(300) }
const heTip = await page.locator('.dkg-restip').first().innerText().catch(() => '')
check('HE: hover surfaces Hebrew tooltip', /ירושלים/.test(heTip), JSON.stringify(heTip))
await page.screenshot({ path: SHOT('he') })

await browser.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
