// App Store screenshot capture for Drift.
// Renders the real UI at exact 6.7" dimensions (1290x2796 = 430x932 @3x),
// seeds a rich branching "Why do we dream?" conversation into IndexedDB, and
// captures: main chat, drift suggestions, lenses, knowledge map, synthesis.
// Run with the dev server up:  node scripts/shots.mjs <port>
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const PORT = process.argv[2] || '5173'
const URL = `http://localhost:${PORT}/`
const OUT = 'screenshots/raw'
mkdirSync(OUT, { recursive: true })

const now = Date.now()
const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString()

const ROOT = 'seed-root'
const rootAnswer =
`Dreaming is one of the brain's strangest habits — and we still don't fully know why we do it.

The leading picture: most vivid dreams happen during **REM sleep**, when the brain is almost as active as when you're awake. During this phase the brain appears to be doing essential housekeeping — **memory consolidation**, sorting the day's experiences into long-term storage.

Emotion matters too. The **amygdala**, the brain's emotional core, lights up intensely while you dream, which may be why dreams feel so charged. And long before neuroscience, **Freud's dream theory** argued dreams were disguised wishes — a view modern science largely disputes.`

const synthText =
`## ✦ Synthesis · 5 drifts

Across these branches, one picture emerges: **dreaming is the brain's overnight editor.** REM sleep opens the studio; *memory consolidation* files the day into long-term storage while *synaptic pruning* clears the noise; and the *amygdala* stamps each memory with emotion — which is why dreams feel so vivid, and why, after trauma, they can curdle into nightmares.

Freud's idea of disguised wishes doesn't survive scrutiny — but his core instinct, that dreams *mean something*, quietly does.

**Next:** Could we learn to consolidate specific memories on purpose while we sleep?`

const TRIGGER = { simplify: 'Simplify this', research: 'Deep dive into this', connect: 'Show me what this connects to', challenge: 'Challenge this' }

// drift chat factory
const drift = (id, parent, sel, lens, answer, minsAgo) => ({
  id, title: sel, lastMessage: answer.slice(0, 80), createdAt: iso(minsAgo),
  metadata: { isDrift: true, parentChatId: parent, selectedText: sel },
  messages: [
    { id: `${id}-u`, text: TRIGGER[lens], isUser: true, timestamp: iso(minsAgo + 0.2) },
    { id: `${id}-a`, text: answer, isUser: false, timestamp: iso(minsAgo), modelTag: 'Gemini' },
  ],
})

const SEED = [
  {
    id: ROOT, title: 'Why do we dream?', lastMessage: '✦ Synthesis · 5 drifts', createdAt: iso(2),
    messages: [
      { id: 'r-u', text: 'Why do we dream?', isUser: true, timestamp: iso(40) },
      {
        id: 'r-a', text: rootAnswer, isUser: false, timestamp: iso(39), modelTag: 'Gemini',
        hasDrift: true,
        driftInfos: [
          { selectedText: 'REM sleep', driftChatId: 'd-rem' },
          { selectedText: 'memory consolidation', driftChatId: 'd-mem' },
          { selectedText: 'the amygdala', driftChatId: 'd-amy' },
          { selectedText: "Freud's dream theory", driftChatId: 'd-freud' },
        ],
      },
      { id: 'synth-1', text: synthText, isUser: false, timestamp: iso(2), modelTag: 'Gemini' },
    ],
  },
  // level 1
  drift('d-rem', ROOT, 'REM sleep', 'simplify',
    'Think of REM as the brain’s nightly screening room — body still, eyes flicking, the mind replaying vivid, movie-like dreams while it files the day.', 30),
  drift('d-mem', ROOT, 'memory consolidation', 'research',
    'Consolidation moves memories from the fragile hippocampus into durable cortical storage, replaying the day at high speed so the important moments stick.', 29),
  drift('d-amy', ROOT, 'the amygdala', 'connect',
    'The amygdala sits at the crossroads of fear, memory and dreaming — linking emotion to everything you store overnight.', 28),
  drift('d-freud', ROOT, "Freud's dream theory", 'challenge',
    'The strongest objection: it’s unfalsifiable. Any dream can be read as a hidden wish, so the theory can never be proven wrong.', 27),
  // level 2
  drift('d-syn', 'd-mem', 'synaptic pruning', 'research',
    'Sleep also prunes: weak, unused connections are dialed down overnight so the signal that matters stands out.', 24),
  drift('d-hip', 'd-mem', 'the hippocampus', 'simplify',
    'The hippocampus is the brain’s short-term scratchpad — it holds today’s memories until sleep copies them somewhere permanent.', 23),
  drift('d-ptsd', 'd-amy', 'PTSD nightmares', 'connect',
    'When the amygdala over-tags a memory with fear, dreams can replay it on a loop — the mechanism behind trauma nightmares.', 22),
  drift('d-fof', 'd-amy', 'fight-or-flight', 'research',
    'The same circuit that floods you with adrenaline in danger quietly tunes which emotional memories survive the night.', 21),
  drift('d-luc', 'd-rem', 'lucid dreaming', 'research',
    'In lucid dreams the prefrontal cortex partly switches back on mid-REM, so you know you’re dreaming — and can sometimes steer it.', 20),
]

const seedScript = (chats) => {
  localStorage.setItem('drift_onboarded', 'true')
  localStorage.setItem('driftUser', 'Mor')
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
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('captured', name) }
  const dismiss = async () => {
    for (const label of ['Skip', 'Dismiss tip']) {
      const b = page.locator(`button:has-text("${label}")`).first()
      if (await b.count().catch(() => 0)) { await b.click({ force: true }).catch(() => {}); await page.waitForTimeout(300) }
    }
  }

  await page.goto(URL)
  await page.evaluate(seedScript, SEED).catch((e) => console.log('seed err', e))

  // Fresh reload + open the seeded conversation. Done before each shot so panel/
  // map/scroll state never leaks between captures.
  const openChat = async () => {
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(2200)
    await dismiss()
    try {
      await page.locator('[title="Open sidebar"], [aria-label="Open sidebar"]').first().click({ timeout: 5000 })
      await page.waitForTimeout(900)
      await page.getByText('Why do we dream?', { exact: true }).first().click({ timeout: 5000 })
      await page.waitForTimeout(1500)
    } catch (e) { console.log('open chat fail', e.message) }
    await page.mouse.wheel(0, -3000); await page.waitForTimeout(400)
  }
  const dragSelect = async (phrase) => {
    const b = await page.evaluate((phrase) => {
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node
      while ((node = tw.nextNode())) {
        const i = node.textContent.indexOf(phrase)
        if (i >= 0 && node.parentElement?.offsetParent) {
          const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + phrase.length)
          const bb = r.getBoundingClientRect(); return { x: bb.x, y: bb.y, w: bb.width, h: bb.height }
        }
      }
      return null
    }, phrase)
    if (!b) return false
    const cy = b.y + b.h / 2
    await page.mouse.move(b.x + 1, cy); await page.mouse.down()
    await page.mouse.move(b.x + b.w - 1, cy, { steps: 10 }); await page.mouse.up()
    await page.waitForTimeout(900); return true
  }

  // 1 — Main chat
  await openChat()
  await shot('1-main')

  // 2 — Tap "Drift into" -> blank drift with AI-suggested questions
  await openChat()
  try {
    await dragSelect('essential housekeeping')
    await page.locator('button:has-text("Drift into")').first().click({ timeout: 4000 })
    await page.waitForTimeout(6000) // let AI suggestions stream in
    await shot('2-suggest')
  } catch (e) { console.log('shot2 fail', e.message) }

  // 3 — Drift panel: lenses in action (open seeded "Deep dive" drift via inline term)
  await openChat()
  try {
    await page.locator('button:has-text("memory consolidation")').first().click({ timeout: 5000 })
    await page.waitForTimeout(2200)
    await shot('3-lenses')
  } catch (e) { console.log('shot3 fail', e.message) }

  // 4 — Knowledge map (richer tree)
  await openChat()
  try {
    const pill = page.locator('[title^="Drift Map"]').first()
    try { await pill.click({ timeout: 2500 }) } catch { await page.keyboard.press('Meta+Alt+g') }
    await page.waitForTimeout(2500)
    // Zoom out so the whole branched tree (root + 2 levels) fits in frame.
    const zo = page.locator('[aria-label="Zoom out"], [title="Zoom out"]').first()
    for (let k = 0; k < 3; k++) { await zo.click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(400) }
    await page.waitForTimeout(800)
    await shot('4-map')
  } catch (e) { console.log('shot4 fail', e.message) }

  // 5 — Synthesis: scroll to the woven summary at the bottom of the chat
  await openChat()
  try {
    for (let k = 0; k < 7; k++) { await page.mouse.wheel(0, 1400); await page.waitForTimeout(220) }
    await page.waitForTimeout(600)
    await shot('5-synthesis')
  } catch (e) { console.log('shot5 fail', e.message) }

  await browser.close()
  console.log('done')
}
run().catch((e) => { console.error(e); process.exit(1) })
