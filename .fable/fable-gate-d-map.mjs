/**
 * GATE D regression sweep — fable/map-semantic-edges
 * Confirms pre-existing map surfaces still work with resonance edges present:
 * lineage rivers, cards, filter, detail inspector, and "Open this drift" →
 * DriftPanel handoff.
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5199'

const hashText = (s) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return `${(h >>> 0).toString(36)}-${s.length.toString(36)}`
}
const buildEmbedText = (term, firstAnswer) =>
  [term, firstAnswer.trim().slice(0, 600)].filter(Boolean).join('\n').trim()

const now = new Date().toISOString()
const msg = (id, text, isUser, extra = {}) => ({ id, text, isUser, timestamp: now, ...extra })

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
]
const embeddings = [
  embRec('drift-a', 'Julius Caesar', ansCaesar, vecA),
  embRec('drift-b', 'Roman aqueducts', ansAqueduct, vecB),
  embRec('drift-c', 'photosynthesis', ansPhoto, vecC),
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

await page.getByText('Ancient Rome', { exact: true }).first().click()
await page.waitForTimeout(600)

// D1: main chat still renders the AI reply with inline drift links
const reply = await page.getByText('Rome was shaped by figures', { exact: false }).count()
check('D1: main chat renders AI reply with drift message', reply >= 1, `count=${reply}`)

await page.locator('[title="Drift Map (⌘⌥G)"]').click()
await page.waitForTimeout(1800)

// D2: all 4 cards render (root + 3 drifts)
const cards = await page.locator('.dkg-card').count()
check('D2: map renders root + 3 drift cards', cards === 4, `count=${cards}`)

// D3: lineage rivers unaffected — 3 parent→child ribbons
const rivers = await page.locator('path[fill^="url(#dkg-link"]').count()
check('D3: 3 lineage rivers still render', rivers === 3, `count=${rivers}`)

// D4: filter still works on cards
await page.locator('input[placeholder="Filter cards…"]').fill('aqueducts')
await page.waitForTimeout(600)
const stillCards = await page.locator('.dkg-card').count()
check('D4: filter keeps all cards mounted (dim, not remove)', stillCards === 4, `count=${stillCards}`)
await page.locator('input[placeholder="Filter cards…"]').fill('')
await page.waitForTimeout(400)

// D5: selecting a card opens the detail inspector
await page.locator('.dkg-card', { hasText: 'What is Julius Caesar' }).first().dispatchEvent('pointerup')
await page.waitForTimeout(600)
const detail = await page.locator('.dkg-detail').count()
const openBtn = await page.getByText('Open this drift', { exact: true }).count()
check('D5: detail inspector opens with "Open this drift"', detail === 1 && openBtn === 1, `detail=${detail} btn=${openBtn}`)

// D6: "Open this drift" hands off to the DriftPanel
await page.getByText('Open this drift', { exact: true }).click()
await page.waitForTimeout(1200)
const panelQ = await page.getByText('What is Julius Caesar?', { exact: false }).count()
const panelA = await page.getByText('Roman general and statesman', { exact: false }).count()
check('D6: DriftPanel opens with the drift conversation', panelQ >= 1 && panelA >= 1, `q=${panelQ} a=${panelA}`)
await page.screenshot({ path: '/tmp/fable-map-gate-d-panel.png' })

await browser.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
