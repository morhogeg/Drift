import type { Page } from '@playwright/test'

/**
 * Shared e2e setup, ported from the proven `.fable/fable-verify-*.mjs` scripts.
 * Two concerns: (1) seed localStorage + IndexedDB so the app boots straight into
 * a usable chat (no onboarding, a configured — fake — Gemini key, fixture chats),
 * and (2) intercept all Gemini traffic with a deterministic SSE mock so no real
 * API calls are made and replies are predictable.
 */

const now = () => new Date().toISOString()

export type Msg = {
  id: string
  text: string
  isUser: boolean
  timestamp: string
  [k: string]: unknown
}

export const msg = (
  id: string,
  text: string,
  isUser: boolean,
  extra: Record<string, unknown> = {},
): Msg => ({ id, text, isUser, timestamp: now(), ...extra })

export type ChatFixture = {
  id: string
  title: string
  createdAt: string
  lastMessage: string
  messages: Msg[]
  metadata?: Record<string, unknown>
}

/**
 * A small default fixture: a root chat whose AI reply carries selectable prose,
 * plus a drift chat hanging off it (used to exercise push-to-main).
 */
export function defaultChats(): ChatFixture[] {
  const ts = now()
  const ansRome =
    'Rome was shaped by figures like Julius Caesar, whose reforms reshaped the Republic.'
  return [
    {
      id: 'root-en',
      title: 'Tell me about ancient Rome',
      createdAt: ts,
      lastMessage: ansRome,
      messages: [
        msg('q1', 'Tell me about ancient Rome', true),
        msg('a1', ansRome, false, {
          hasDrift: true,
          driftInfos: [{ selectedText: 'Julius Caesar', driftChatId: 'drift-a' }],
        }),
      ],
    },
    {
      id: 'drift-a',
      title: 'Julius Caesar',
      createdAt: ts,
      lastMessage: 'A Roman general and statesman.',
      messages: [
        msg('da-q', 'What is Julius Caesar?', true),
        msg('da-a', 'A Roman general and statesman of the late Republic.', false),
      ],
      metadata: {
        isDrift: true,
        parentChatId: 'root-en',
        sourceMessageId: 'a1',
        selectedText: 'Julius Caesar',
      },
    },
  ]
}

/**
 * Intercept every Gemini call. `streamGenerateContent` returns a deterministic
 * SSE reply; the prompt shape is sniffed from `postData()` (mirrors the recipe
 * in REFACTOR_HANDOFF.md): a request for "a raw JSON array" gets a chips array,
 * a "tapped a connection" bridge gets prose, everything else gets main-chat
 * prose echoing the last user turn. All other endpoints (embeddings, etc.) 400
 * silently, exactly as the app tolerates when offline.
 */
export async function mockGemini(page: Page): Promise<void> {
  await page.route('**generativelanguage.googleapis.com/**', async (route) => {
    const url = route.request().url()
    if (!url.includes('streamGenerateContent')) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
      return
    }
    const raw = route.request().postData() || ''
    let lastUser = ''
    try {
      const body = JSON.parse(raw)
      lastUser =
        (body.contents || [])
          .filter((c: { role?: string }) => c.role === 'user')
          .at(-1)
          ?.parts?.map((p: { text?: string }) => p.text)
          .join('') || ''
    } catch {
      /* ignore */
    }

    let text: string
    if (/raw JSON array|JSON array of/i.test(raw)) {
      text = JSON.stringify(['contrast :: rival :: Pompey', 'cause :: rose through :: the legions'])
    } else if (/tapped a connection to explore this bridge/i.test(raw)) {
      text = `Exploring the bridge between those ideas: ${lastUser}`.trim()
    } else {
      text = `Mocked reply about: ${lastUser || 'your question'}`
    }

    const sse =
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n` +
      `data: [DONE]\n\n`
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse })
  })
}

/**
 * Seed localStorage (auth, onboarding flags, a fake Gemini key so the send path
 * clears its `if (!apiKey)` guard) and IndexedDB (`drift-db` → `drift-chats`),
 * then reload so the store hydrates from the seeded data.
 */
export async function seedApp(
  page: Page,
  chats: ChatFixture[] = defaultChats(),
): Promise<void> {
  await mockGemini(page)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('driftUser', 'Fable')
    localStorage.setItem('drift_onboarded', 'true')
    localStorage.setItem('drift_once_drift-gesture', '1')
    localStorage.setItem('drift_once_lens-bar', '1')
    localStorage.setItem('drift_once_map-spotlight', '1')
    // A non-empty (fake, non-secret) Gemini key so the send path clears its
    // `if (!apiKey)` guard and reaches the mocked network call. Any truthy
    // string works — this is not a credential.
    localStorage.setItem(
      'drift_ai_settings',
      JSON.stringify({
        useOpenRouter: false,
        geminiApiKey: 'e2e-fake-not-a-real-key', // gitleaks:allow
        geminiModel: 'gemini-flash-lite-latest',
        modelPresets: [
          {
            id: 'gemini-flash-lite',
            provider: 'gemini',
            label: 'Gemini',
            model: 'gemini-flash-lite-latest',
            enabled: true,
          },
        ],
      }),
    )
  })
  await page.evaluate(async ({ chats }) => {
    // Open at the app's current schema version (4) and create every store in
    // onupgradeneeded so seeding works whether or not the app booted the DB
    // first. Opening at a lower version than the live DB throws VersionError.
    const open = () =>
      new Promise<IDBDatabase>((res, rej) => {
        const req = indexedDB.open('drift-db', 4)
        req.onupgradeneeded = () => {
          const db = req.result
          for (const store of [
            'drift-chats',
            'drift-embeddings',
            'drift-temp-drifts',
            'drift-lens-state',
          ]) {
            if (!db.objectStoreNames.contains(store))
              db.createObjectStore(store, { keyPath: 'id' })
          }
        }
        req.onsuccess = () => res(req.result)
        req.onerror = () => rej(req.error)
      })
    const db = await open()
    for (const c of chats) {
      await new Promise<void>((res, rej) => {
        const tx = db.transaction('drift-chats', 'readwrite')
        tx.objectStore('drift-chats').put(c)
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
    }
    db.close()
  }, { chats })
  await page.reload()
  await page.waitForTimeout(1200)
}

/**
 * Programmatically select `text` inside the message bubble with the given
 * `data-message-id`, then dispatch `mouseup` so SelectionTooltip's desktop
 * handler picks it up (it walks up from the selection's anchor node to the
 * `[data-message-id]` element). Returns false if the text wasn't found.
 */
export async function selectMessageText(
  page: Page,
  messageId: string,
  text: string,
): Promise<boolean> {
  const ok = await page.evaluate(
    ({ messageId, text }) => {
      const host = document.querySelector(`[data-message-id="${messageId}"]`)
      if (!host) return false
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
      let node: Text | null = null
      while (walker.nextNode()) {
        const t = walker.currentNode as Text
        if (t.textContent && t.textContent.includes(text)) {
          node = t
          break
        }
      }
      if (!node || !node.textContent) return false
      const start = node.textContent.indexOf(text)
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + text.length)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      return true
    },
    { messageId, text },
  )
  if (!ok) return false
  // mouseup is what SelectionTooltip listens for on desktop.
  await page.mouse.move(200, 200)
  await page.mouse.up()
  await page.dispatchEvent('body', 'mouseup')
  await page.waitForTimeout(300)
  return true
}

/** Read the persisted snippet array from localStorage. */
export async function readSnippets(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('drift_snippets') || '[]')
    } catch {
      return []
    }
  })
}
