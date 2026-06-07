/**
 * termIndex — a lightweight cross-drift concept index.
 *
 * The data model links drifts only parent→child. This derives the *lateral*
 * link the intelligence layer needs: "this term has been explored before, over
 * there." It reads what's already persisted (no schema change, no migration):
 *   - every drift ChatSession carries `metadata.selectedText` (the drifted term)
 *   - every message carries `driftInfos[].selectedText` → `driftChatId`
 *
 * Build it once per render from `chatHistory` (cheap; memoize at the call site)
 * and query it when a user marks a term to surface where else it lives.
 */

import type { ChatSession } from '../types/chat'

/** One place a term was explored. */
export interface TermOccurrence {
  /** The drift conversation this term opened (navigation target). */
  driftChatId: string
  /** Human-readable label for the drift (its title, or the term itself). */
  chatTitle: string
  /** The original-cased term as the user selected it. */
  term: string
  templateType?: 'simplify' | 'research' | 'connect' | 'challenge'
  /** Chat the drift descends from, for orientation ("in: <parent>"). */
  parentChatId?: string
}

export type TermIndex = Map<string, TermOccurrence[]>

/**
 * Normalize a term for matching: lowercase, trim, collapse whitespace, strip
 * surrounding punctuation. Intentionally simple — fuzzy/semantic matching is a
 * separate Gemini pass layered on top by the intelligence service.
 */
export function normalizeTerm(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’“”]/g, "'") // smart quotes → plain
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ') // drop punctuation, keep letters/digits/hyphen
    .replace(/\s+/g, ' ')
    .trim()
}

function addOccurrence(index: TermIndex, key: string, occ: TermOccurrence): void {
  if (!key) return
  const list = index.get(key)
  if (!list) {
    index.set(key, [occ])
    return
  }
  // De-dupe by driftChatId so the same drift isn't listed twice.
  if (!list.some((o) => o.driftChatId === occ.driftChatId)) list.push(occ)
}

/** Build the full index from all chats + drifts. */
export function buildTermIndex(chats: ChatSession[]): TermIndex {
  const index: TermIndex = new Map()

  for (const chat of chats) {
    // 1) Drift sessions: the session's own selectedText is its defining term.
    const meta = chat.metadata
    if (meta?.isDrift && meta.selectedText) {
      addOccurrence(index, normalizeTerm(meta.selectedText), {
        driftChatId: chat.id,
        chatTitle: chat.title || meta.selectedText,
        term: meta.selectedText,
        parentChatId: meta.parentChatId,
      })
    }

    // 2) driftInfos on messages: terms drifted from this chat's messages.
    for (const msg of chat.messages) {
      if (!msg.driftInfos) continue
      for (const info of msg.driftInfos) {
        if (!info.selectedText || !info.driftChatId) continue
        addOccurrence(index, normalizeTerm(info.selectedText), {
          driftChatId: info.driftChatId,
          chatTitle: info.selectedText,
          term: info.selectedText,
          templateType: info.templateType,
          parentChatId: chat.id,
        })
      }
    }
  }

  return index;
}

/**
 * Find prior explorations of `term`, excluding the current drift chat.
 * Matches on normalized exact equality first, then falls back to substring
 * containment in either direction (so "Caesar" finds "Julius Caesar").
 */
export function findRelatedDrifts(
  index: TermIndex,
  term: string,
  excludeDriftChatId?: string,
): TermOccurrence[] {
  const key = normalizeTerm(term)
  if (!key) return []

  const seen = new Set<string>()
  const out: TermOccurrence[] = []

  const push = (occ: TermOccurrence) => {
    if (occ.driftChatId === excludeDriftChatId) return
    if (seen.has(occ.driftChatId)) return
    seen.add(occ.driftChatId)
    out.push(occ)
  }

  // Exact normalized matches first (highest confidence).
  for (const occ of index.get(key) ?? []) push(occ)

  // Then containment matches, for multi-word overlap.
  for (const [otherKey, occs] of index) {
    if (otherKey === key) continue
    if (otherKey.includes(key) || key.includes(otherKey)) {
      for (const occ of occs) push(occ)
    }
  }

  return out
}
