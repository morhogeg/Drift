// App Store screenshot capture for Drift.
// Renders the real UI at exact 6.7" dimensions (1290x2796 = 430x932 @3x),
// seeds a compelling branching conversation into IndexedDB, and captures each
// feature state. Run with the dev server up:  node scripts/shots.mjs <port>
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const PORT = process.argv[2] || '5176'
const URL = `http://localhost:${PORT}/`
const OUT = 'screenshots/raw'
mkdirSync(OUT, { recursive: true })

const now = Date.now()
const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString()

// ── Seed: one rich root conversation + a fan of lensed drifts (a knowledge tree)
const ROOT = 'seed-root'
const dRem = 'd-rem', dMem = 'd-mem', dAmy = 'd-amy', dFreud = 'd-freud', dSyn = 'd-syn'

const rootAnswer =
`Dreaming is one of the brain's strangest habits — and we still don't fully know why we do it.

The leading picture: most vivid dreams happen during **REM sleep**, when the brain is almost as active as when you're awake. During this phase the brain appears to be doing essential housekeeping — **memory consolidation**, sorting the day's experiences into long-term storage.

Emotion matters too. The **amygdala**, the brain's emotional core, lights up intensely while you dream, which may be why dreams feel so charged. And long before neuroscience, **Freud's dream theory** argued dreams were disguised wishes — a view modern science largely disputes.`

const driftMsg = (trigger, answer, sel) => ([
  { id: `${sel}-u`, text: trigger, isUser: true, timestamp: iso(20) },
  { id: `${sel}-a`, text: answer, isUser: false, timestamp: iso(19), modelTag: 'Gemini' },
])

const SEED = [
  {
    id: ROOT, title: 'Why do we dream?',
    lastMessage: rootAnswer.slice(0, 90), createdAt: iso(1),
    messages: [
      { id: 'r-u', text: 'Why do we dream?', isUser: true, timestamp: iso(30) },
      {
        id: 'r-a', text: rootAnswer, isUser: false, timestamp: iso(29), modelTag: 'Gemini',
        hasDrift: true,
        driftInfos: [
          { selectedText: 'REM sleep', driftChatId: dRem },
          { selectedText: 'memory consolidation', driftChatId: dMem },
          { selectedText: 'the amygdala', driftChatId: dAmy },
          { selectedText: "Freud's dream theory", driftChatId: dFreud },
        ],
      },
    ],
  },
  {
    id: dRem, title: 'REM sleep', lastMessage: '', createdAt: iso(25),
    metadata: { isDrift: true, parentChatId: ROOT, selectedText: 'REM sleep' },
    messages: driftMsg('Simplify this',
      'Think of REM as the brain’s nightly screening room. Your body goes still, your eyes flick rapidly behind closed lids, and the mind plays back vivid, movie-like dreams — replaying and filing the day while you rest.',
      'rem'),
  },
  {
    id: dMem, title: 'memory consolidation', lastMessage: '', createdAt: iso(24),
    metadata: { isDrift: true, parentChatId: ROOT, selectedText: 'memory consolidation' },
    messages: driftMsg('Deep dive into this',
      'Consolidation moves memories from the fragile hippocampus into durable cortical storage. During sleep the hippocampus "replays" the day at high speed, strengthening the synapses that matter and letting the rest fade — which is why a night’s sleep makes yesterday stick.',
      'mem'),
  },
  {
    id: dAmy, title: 'the amygdala', lastMessage: '', createdAt: iso(23),
    metadata: { isDrift: true, parentChatId: ROOT, selectedText: 'the amygdala' },
    messages: driftMsg('Show me what this connects to',
      'The amygdala sits at the crossroads of fear, memory, and dreaming — linking to the hippocampus, the fight-or-flight response, and even PTSD nightmares.',
      'amy'),
  },
  {
    id: dFreud, title: "Freud's dream theory", lastMessage: '', createdAt: iso(22),
    metadata: { isDrift: true, parentChatId: ROOT, selectedText: "Freud's dream theory" },
    messages: driftMsg('Challenge this',
      'The strongest objection: it’s unfalsifiable. Freud could interpret any dream as a hidden wish, so the theory can never be proven wrong — and modern sleep science finds no evidence dreams are disguised desires.',
      'freud'),
  },
  {
    id: dSyn, title: 'synaptic pruning', lastMessage: '', createdAt: iso(18),
    metadata: { isDrift: true, parentChatId: dMem, selectedText: 'synaptic pruning' },
    messages: driftMsg('Deep dive into this',
      'Sleep may also prune: weak, unused connections are dialed down overnight so the important ones stand out — a nightly noise-reduction pass on the brain.',
      'syn'),
  },
]

const seedScript = (chats) => {
  localStorage.setItem('drift_onboarded', 'true') // skip first-run onboarding carousel
  localStorage.setItem('driftUser', 'Mor')        // bypass the local "Enter Drift" gate
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('drift-db', 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('drift-chats')) db.createObjectStore('drift-chats', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('drift-embeddings')) db.createObjectStore('drift-embeddings', { keyPath: 'id' })
    }
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('drift-chats', 'readwrite')
      for (const c of chats) tx.objectStore('drift-chats').put(c)
      tx.oncomplete = () => resolve('ok')
      tx.onerror = () => reject(tx.error)
    }
    req.onerror = () => reject(req.error)
  })
}

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()

  // Seed BEFORE the app loads, on a blank same-origin page.
  await page.goto(URL)
  await page.evaluate(seedScript, SEED).catch((e) => console.log('seed err', e))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)

  const shot = async (name) => {
    await page.screenshot({ path: `${OUT}/${name}.png` })
    console.log('captured', name)
  }

  // Dismiss any onboarding carousel / tip overlays that still slipped through.
  for (const label of ['Skip', 'Dismiss tip']) {
    const b = page.locator(`button:has-text("${label}")`).first()
    if (await b.count().catch(() => 0)) { await b.click({ force: true }).catch(() => {}); await page.waitForTimeout(400) }
  }
  await page.waitForTimeout(800)

  // Open the seeded conversation (the app boots into an empty "New Chat").
  try {
    const card = page.getByRole('button', { name: /Why do we dream/ }).first()
    await card.click({ timeout: 4000 })
    await page.waitForTimeout(1600)
  } catch (e) { console.log('open chat fail', e.message) }

  // 1 — Main chat
  await shot('1-main')

  // 2 — Highlight -> drift: real mouse drag over prose to raise the SelectionTooltip
  const rangeBox = (phrase) => page.evaluate((phrase) => {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node
    while ((node = tw.nextNode())) {
      const i = node.textContent.indexOf(phrase)
      if (i >= 0 && node.parentElement?.offsetParent) {
        const r = document.createRange()
        r.setStart(node, i); r.setEnd(node, i + phrase.length)
        const b = r.getBoundingClientRect()
        return { x: b.x, y: b.y, w: b.width, h: b.height }
      }
    }
    return null
  }, phrase)
  try {
    const b = await rangeBox('almost as active as when')
    if (b) {
      const cy = b.y + b.h / 2
      await page.mouse.move(b.x + 1, cy)
      await page.mouse.down()
      await page.mouse.move(b.x + b.w - 1, cy, { steps: 10 })
      await page.mouse.up()
      await page.waitForTimeout(1100)
    }
    await shot('2-highlight')
    console.log('selection raised:', !!b)
  } catch (e) { console.log('shot2 fail', e.message) }

  // 3 — Drift panel: click the inline (explored) drift link to open the seeded drift
  try {
    await page.mouse.click(5, 5) // clear selection/tooltip
    await page.waitForTimeout(300)
    const link = page.locator('button:has-text("memory consolidation")').first()
    await link.click({ timeout: 5000 })
    await page.waitForTimeout(2800)
    await shot('3-drift-panel')
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(700)
  } catch (e) { console.log('shot3 fail', e.message) }

  // 4 — Knowledge tree (Drift Map). Click the header "Map" pill; fall back to ⌘⌥G.
  try {
    await page.mouse.click(5, 5)
    await page.waitForTimeout(300)
    const pill = page.locator('[title^="Drift Map"]').first()
    try { await pill.scrollIntoViewIfNeeded({ timeout: 1500 }); await pill.click({ timeout: 2500 }) }
    catch { await page.keyboard.press('Meta+Alt+g') }
    await page.waitForTimeout(2800)
    await shot('4-map')
    await page.locator('[aria-label="Close"], [title="Close"]').first().click({ timeout: 1500 }).catch(() => page.keyboard.press('Escape'))
    await page.waitForTimeout(700)
  } catch (e) { console.log('shot4 fail', e.message) }

  // 5 — Settings (BYOK / privacy). The hamburger lives on the home screen, so
  // reload to home first (flags persist, so no login/onboarding reappears).
  try {
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(2200)
    await page.locator('[title="Open sidebar"], [aria-label="Open sidebar"]').first().click({ timeout: 4000 })
    await page.waitForTimeout(1000)
    await page.locator('[title="Settings"], [aria-label="Settings"]').first().click({ timeout: 4000 })
    await page.waitForTimeout(1700)
    await shot('5-settings')
  } catch (e) { console.log('shot5 fail', e.message) }

  // Diagnostics: dump header button titles so we can fix selectors if needed.
  const titles = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[title],button')).slice(0, 40).map(
      el => el.getAttribute('title') || el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 20)
    ).filter(Boolean)
  )
  console.log('UI controls:', JSON.stringify(titles))

  await browser.close()
  console.log('done')
}
run().catch((e) => { console.error(e); process.exit(1) })
