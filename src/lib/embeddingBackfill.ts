/**
 * embeddingBackfill — keeps the IDB vector cache (embeddingDB) in sync with the
 * set of drifts, lazily and in the background.
 *
 * The lifecycle: App diffs every drift in chatHistory against the cache and
 * batch-embeds any whose embed-text is missing or stale (hash changed). This is
 * fire-and-forget, debounced, never blocks UI, and silently no-ops without a
 * Gemini key (Demo / offline). An in-memory cache avoids re-reading IDB on
 * every pass.
 *
 * Pure-ish: depends on embeddings.ts (network) + db.ts (IDB) only.
 */

import type { ChatSession } from '../types/chat'
import { embedTexts, EMBEDDING_MODEL } from '../services/embeddings'
import { embeddingDB, type DBEmbedding } from '../services/db'
import { normalizeTerm } from './termIndex'

/** A drift selected for (re)embedding: its id, the text to embed, and its hash. */
interface PendingEmbed {
  id: string
  text: string
  hash: string
}

/**
 * Cheap, stable, non-cryptographic string hash (djb2 xor variant). Used only to
 * detect when a drift's embed-text changed so we re-embed; not security-sensitive.
 */
function hashText(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i)
  }
  // include length to further reduce collisions, base36 for compactness
  return `${(h >>> 0).toString(36)}-${s.length.toString(36)}`
}

/**
 * Build the text we embed for a drift: its drifted term/selectedText plus a
 * short snippet of its first AI answer (or its title as a fallback). This is
 * what gives "PSG" → "Paris Saint-Germain" its meaning: the answer body carries
 * the semantic context the bare term lacks.
 */
export function buildEmbedText(chat: ChatSession): string {
  const term = chat.metadata?.selectedText || chat.title || ''
  const firstAnswer = chat.messages?.find((m) => !m.isUser && m.text?.trim())?.text ?? ''
  const snippet = firstAnswer.trim().slice(0, 600)
  return [term, snippet].filter(Boolean).join('\n').trim()
}

/** True if a chat is a drift we should index. */
function isIndexableDrift(chat: ChatSession): boolean {
  return !!chat.metadata?.isDrift && !!(chat.metadata.selectedText || chat.title)
}

/**
 * In-memory mirror of embeddingDB so the backfill doesn't hit IDB every pass.
 * Loaded lazily on first run.
 */
const memCache = new Map<string, DBEmbedding>()
let memLoaded = false
let running = false

async function ensureLoaded(): Promise<void> {
  if (memLoaded) return
  const all = await embeddingDB.getAll()
  for (const rec of all) memCache.set(rec.id, rec)
  memLoaded = true
}

/**
 * Read-side helper for the recall/search consumers: the cached candidate
 * vectors for a set of drift ids (or all of them). Loads the in-memory cache on
 * first use. Returns [] gracefully on any failure.
 */
export async function getCachedVectors(
  ids?: string[],
): Promise<Array<{ driftChatId: string; vec: number[] }>> {
  try {
    await ensureLoaded()
  } catch {
    return []
  }
  const out: Array<{ driftChatId: string; vec: number[] }> = []
  const wanted = ids ? new Set(ids) : null
  for (const rec of memCache.values()) {
    if (wanted && !wanted.has(rec.id)) continue
    if (rec.vec?.length) out.push({ driftChatId: rec.id, vec: rec.vec })
  }
  return out
}

/**
 * Diff drifts against the cache and embed the stale/missing ones. Fire-and-forget:
 * resolves to the number embedded (0 when nothing to do or no key). Never throws.
 *
 * @param chats   current chatHistory
 * @param apiKey  Gemini key — empty/absent ⇒ no-op (graceful degradation)
 */
export async function runEmbeddingBackfill(
  chats: ChatSession[],
  apiKey: string,
): Promise<number> {
  if (!apiKey?.trim()) return 0 // no key / Demo / offline ⇒ lexical-only
  if (running) return 0 // single-flight: don't stack passes
  running = true

  try {
    await ensureLoaded()

    const drifts = chats.filter(isIndexableDrift)
    const liveIds = new Set(drifts.map((c) => c.id))

    // Prune cache entries for drifts that no longer exist.
    for (const id of [...memCache.keys()]) {
      if (!liveIds.has(id)) {
        memCache.delete(id)
        embeddingDB.delete(id).catch(() => {})
      }
    }

    const pending: PendingEmbed[] = []
    for (const chat of drifts) {
      const text = buildEmbedText(chat)
      if (!text || !normalizeTerm(text)) continue
      const hash = hashText(text)
      const existing = memCache.get(chat.id)
      if (existing && existing.hash === hash && existing.model === EMBEDDING_MODEL) {
        continue // up-to-date
      }
      pending.push({ id: chat.id, text, hash })
    }

    if (pending.length === 0) return 0

    const vecs = await embedTexts(pending.map((p) => p.text), apiKey)
    // embedTexts returns [] on any error — fall back silently.
    if (vecs.length !== pending.length) return 0

    const now = new Date().toISOString()
    let written = 0
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i]
      const rec: DBEmbedding = {
        id: p.id,
        vec: vecs[i],
        text: p.text,
        hash: p.hash,
        model: EMBEDDING_MODEL,
        updatedAt: now,
      }
      memCache.set(p.id, rec)
      embeddingDB.put(rec).catch(() => {})
      written++
    }
    return written
  } catch {
    return 0
  } finally {
    running = false
  }
}
