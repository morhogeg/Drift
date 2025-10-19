type MessageID = string

export type ListItem = {
  itemIndex: number
  surface: string
  anchorId: string
}

type ListRecord = {
  messageId: MessageID
  items: ListItem[]
  createdAt: number
}

// In-memory list index (per session). Simple and resettable on reload.
const listIndex: Map<MessageID, ListRecord> = new Map()

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

export function getAnchorId(messageId: MessageID, itemIndex: number): string {
  return `list-${messageId}-${itemIndex}`
}

export function indexListMessage(messageId: MessageID, text: string): void {
  if (!text) return
  // Parse markdown lists: lines starting with -, *, +, or numbered lists `1. `
  const lines = text.split(/\n+/)
  const items: ListItem[] = []
  let idx = 0
  for (const raw of lines) {
    const mBul = raw.match(/^\s*[-*+]\s+(.*)$/)
    const mNum = raw.match(/^\s*\d+\.\s+(.*)$/)
    const content = mBul?.[1] || mNum?.[1]
    if (!content) continue
    const surface = stripMarkdownLinks(content).trim()
    if (!surface) continue
    const item: ListItem = { itemIndex: idx, surface, anchorId: getAnchorId(messageId, idx) }
    items.push(item)
    idx++
  }
  if (items.length) {
    listIndex.set(messageId, { messageId, items, createdAt: Date.now() })
  }
}

export function getListForMessage(messageId: MessageID): ListRecord | null {
  return listIndex.get(messageId) || null
}

export function getRecentLists(limit = 20): ListRecord[] {
  return Array.from(listIndex.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
}

const ORDINALS: Record<string, number> = {
  'first': 0, '1st': 0, 'one': 0,
  'second': 1, '2nd': 1, 'two': 1,
  'third': 2, '3rd': 2, 'three': 2,
  'fourth': 3, '4th': 3, 'four': 3,
  'fifth': 4, '5th': 4, 'five': 4,
}

export function matchListItemsInText(text: string): Array<{ messageId: MessageID, anchorId: string, surface: string, start: number, end: number }> {
  const results: Array<{ messageId: MessageID, anchorId: string, surface: string, start: number, end: number }> = []
  if (!text) return results
  const lower = text.toLowerCase()

  // 1) Explicit name matches against recent lists
  const lists = getRecentLists()
  for (const rec of lists) {
    for (const it of rec.items) {
      const name = normalize(it.surface)
      if (!name || name.length < 3) continue
      const needle = name
      // Find normalized match by scanning plain text (lowercase) on raw text; do a simple non-normalized search too
      let from = 0
      while (from < lower.length) {
        const idx = lower.indexOf(needle, from)
        if (idx === -1) break
        const end = idx + needle.length
        results.push({ messageId: rec.messageId, anchorId: it.anchorId, surface: text.slice(idx, end), start: idx, end })
        from = end
        if (results.length > 8) break
      }
      if (results.length > 8) break
    }
    if (results.length > 8) break
  }

  // 2) Ordinals: "the third one/book/recommendation/title"
  const ordRe = /\bthe\s+(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|one|two|three|four|five)\s+(one|book|title|recommendation|item)\b/gi
  let m: RegExpExecArray | null
  while ((m = ordRe.exec(text)) !== null) {
    const word = m[1].toLowerCase()
    const idxN = ORDINALS[word]
    if (idxN == null) continue
    const rec = lists[0] // most recent list context
    if (!rec || idxN >= rec.items.length) continue
    const it = rec.items[idxN]
    results.push({ messageId: rec.messageId, anchorId: it.anchorId, surface: m[0], start: m.index, end: m.index + m[0].length })
    if (results.length > 12) break
  }

  // De-overlap and sort
  const kept: typeof results = []
  results.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
  let lastEnd = -1
  for (const r of results) {
    if (r.start < lastEnd) continue
    kept.push(r)
    lastEnd = r.end
  }
  return kept
}

