// Tiny UUID-like generator (no external deps)
function safeUuid() {
  const rnd = () => Math.random().toString(16).slice(2, 10)
  return `ent-${rnd()}-${rnd()}`
}

import { fuzzySimilar } from '../../lib/fuzzy/fuzzyMatch'
import type {
  ChatMessage,
  ConversationEntityIndex,
  EntityCandidate,
  CanonicalEntity,
  Mention,
  MessageID,
  EntityID,
  EntityType,
} from '../../types/entities'

// Minimal IndexedDB substitute for MVP (localStorage-based). Swappable later.
const STORAGE_KEY = 'drift_conversation_entity_index'

let CEI: ConversationEntityIndex = {
  entities: {},
  mentionsByEntity: {},
  mentionsByMessage: {},
}

let conversationIdGlobal: string | null = null
let persistCounter = 0

const stoplist = new Set<string>([
  // Common low-value entities to avoid over-linking
  'today', 'yesterday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
])

const allowTypePriority: EntityType[] = ['person', 'book', 'work', 'org', 'law', 'case', 'topic', 'other']

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’']/g, '') // remove possessive markers
    .replace(/[^\p{L}\p{N}\s.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferType(surface: string): EntityType {
  // Simplified inference
  if (/\b(inc\.|corp\.|llc|gmbh|ltd|university|institute|foundation)\b/i.test(surface)) return 'org'
  if (/\b(v\.|vs\.|case|no\.|\d{3,}-\d{2,})\b/i.test(surface)) return 'case'
  if (/\b(ust\.|cfr|§|article|act|law)\b/i.test(surface)) return 'law'
  if (/\b(book|paper|essay|novel|thesis)\b/i.test(surface)) return 'work'
  if (/^[A-Z][a-z]+\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?(?:'s)?$/.test(surface)) return 'person'
  // Title Case multi-token
  if (/^(?:[A-Z][\p{L}\d'’-]+\s+){1,5}[A-Z][\p{L}\d'’-]+$/.test(surface)) return 'topic'
  return 'other'
}

function makeSnippet(text: string, start: number, end: number): string {
  const pad = 80
  const s = Math.max(0, start - pad)
  const e = Math.min(text.length, end + pad)
  const snippet = text.slice(s, e)
  return snippet.length > 240 ? snippet.slice(0, 237) + '…' : snippet
}

function uniquePush(arr: string[], val: string) {
  const v = val.trim()
  if (!v) return
  if (!arr.includes(v)) arr.push(v)
}

function extractAuthorFromContext(text: string, start: number, end: number): { fullName: string; surname: string } | null {
  // Look ahead for "by Firstname Lastname" within a small window
  const window = 120
  const after = text.slice(end, Math.min(text.length, end + window))
  const before = text.slice(Math.max(0, start - window), start)
  const aheadMatch = after.match(/\bby\s+([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,3})\b/u)
  let full: string | null = null
  if (aheadMatch) full = aheadMatch[1]
  if (!full) {
    // Try patterns like "Firstname Lastname's <work>"
    const backMatch = before.match(/([A-Z][\p{L}'’-]+\s+[A-Z][\p{L}'’-]+)\s*['’]s\s*$/u)
    if (backMatch) full = backMatch[1]
  }
  if (!full) return null
  const tokens = full.split(/\s+/)
  const surname = tokens[tokens.length - 1]
  return { fullName: full, surname }
}

export async function initializeCEI(conversationId: string): Promise<void> {
  conversationIdGlobal = conversationId
  await hydrateCEI()
}

export async function persistCEI(): Promise<void> {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${conversationIdGlobal}`, JSON.stringify(CEI))
  } catch {}
}

export async function hydrateCEI(): Promise<void> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${conversationIdGlobal}`)
    if (raw) CEI = JSON.parse(raw)
  } catch {}
}

export async function clearCEI(): Promise<void> {
  CEI = { entities: {}, mentionsByEntity: {}, mentionsByMessage: {} }
  try { localStorage.removeItem(`${STORAGE_KEY}:${conversationIdGlobal}`) } catch {}
}

// Fast-pass detection: regex + prior trie (simplified via names lists)
export async function detectEntities(text: string, messageId?: MessageID): Promise<EntityCandidate[]> {
  const candidates: EntityCandidate[] = []
  if (!text || stoplist.has(text.toLowerCase())) return candidates

  // Strip markdown while retaining a mapping from clean indices -> original indices
  function stripWithMap(src: string): { clean: string; mapToOriginal: (i: number) => number } {
    const cleanChars: string[] = []
    const map: number[] = []
    const n = src.length
    let i = 0
    while (i < n) {
      const ch = src[i]
      // Links: [text](url) -> keep text
      if (ch === '[') {
        const r = src.indexOf(']', i + 1)
        if (r !== -1 && r + 1 < n && src[r + 1] === '(') {
          // push the inside text mapping
          for (let k = i + 1; k < r; k++) { cleanChars.push(src[k]); map.push(k) }
          // skip to the matching ) if exists
          let j = r + 2
          let depth = 1
          while (j < n && depth > 0) {
            if (src[j] === '(') depth++
            else if (src[j] === ')') depth--
            j++
          }
          i = j
          continue
        }
      }
      // Emphasis/strong/code markers: skip markers, keep content
      if (ch === '*' || ch === '_' || ch === '`') { i++; continue }
      // Otherwise copy char
      cleanChars.push(ch)
      map.push(i)
      i++
    }
    const clean = cleanChars.join('')
    const mapToOriginal = (idx: number) => (idx < 0 || idx >= map.length) ? -1 : map[idx]
    return { clean, mapToOriginal }
  }

  const { clean, mapToOriginal } = stripWithMap(text)

  // Patterns: Title Case names, possessives, ISBN/case IDs, and Title — Author forms
  const patterns: Array<{ re: RegExp; type?: EntityType; score: number; mapper?: (m: RegExpExecArray) => Array<{ surface: string; type?: EntityType }> }> = [
    { re: /\b(?:Justice|Judge|Prof\.|Dr\.)\s+[A-Z][\p{L}'’-]+\s+[A-Z][\p{L}'’-]+\b/gu, type: 'person', score: 0.95 },
    { re: /\b[A-Z][\p{L}'’-]+\s+[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)?(?:'s)?\b/gu, type: 'person', score: 0.9 },
    // Possessive references like "Shirer's book"
    { re: /\b([A-Z][\p{L}'’]+)[’']s\s+(book|paper|novel|essay|work)\b/gu, type: 'work', score: 0.92 },
    // Title by Author
    { re: /\b((?:[A-Z][\p{L}\d'’-]+\s+){1,8}[A-Z][\p{L}\d'’-]+)\s+by\s+([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,3})\b/gu, score: 0.96, mapper: (m) => [{ surface: m[1], type: 'work' }, { surface: m[2], type: 'person' }] },
    // Title — Author (em/en dash or hyphen)
    { re: /\b((?:[A-Z][\p{L}\d'’-]+\s+){1,8}[A-Z][\p{L}\d'’-]+)\s+[—–-]\s+([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,3})\b/gu, score: 0.95, mapper: (m) => [{ surface: m[1], type: 'work' }, { surface: m[2], type: 'person' }] },
    // Generic Title Case (fallback)
    { re: /\b([A-Z][\p{L}\d'’-]+\s+){1,6}[A-Z][\p{L}\d'’-]+\b/gu, score: 0.75 },
    { re: /\bISBN\s?:?\s?(97[89][- ]?\d{1,5}[- ]?\d{1,7}[- ]?\d{1,7}[- ]?[\dX])\b/gi, type: 'book', score: 0.92 },
    { re: /\b\d{3,}-\d{2,}\b/g, type: 'case', score: 0.8 },
  ]

  for (const { re, type, score, mapper } of patterns) {
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(clean)) !== null) {
      const items = mapper ? mapper(m) : [{ surface: m[0], type }]
      for (const item of items) {
        const surface = item.surface
        if (!surface || surface.trim().length < 2) continue
        const inferredType = item.type || type || inferType(surface)
        if (stoplist.has(surface.toLowerCase())) continue
        // Compute start based on clean index mapping
        let startClean = -1
        // Prefer the position within the current match window
        const searchFrom = m.index
        const pos = clean.indexOf(surface, searchFrom)
        if (pos !== -1) startClean = pos
        else startClean = clean.indexOf(surface)
        const start = mapToOriginal(startClean)
        if (start === -1) continue
        const endClean = startClean + surface.length - 1
        const endOrigIdx = mapToOriginal(endClean)
        const end = (endOrigIdx === -1 ? start + surface.length : endOrigIdx + 1)
        candidates.push({
          surface,
          start,
          end,
          type: inferredType,
          messageId: messageId || '',
          confidence: score,
        })
      }
    }
  }

  // Merge overlapping by preferring longer/higher score
  candidates.sort((a, b) => a.start - b.start || b.surface.length - a.surface.length)
  const filtered: EntityCandidate[] = []
  let lastEnd = -1
  for (const c of candidates) {
    if (c.start < lastEnd) continue
    filtered.push(c)
    lastEnd = c.end
  }
  return filtered
}

function getAllEntities(): CanonicalEntity[] {
  return Object.values(CEI.entities)
}

function canonicalMatch(surface: string, type: EntityType): EntityID | null {
  const norm = normalizeName(surface)
  for (const ent of getAllEntities()) {
    if (ent.type !== type) continue
    const names = [ent.name, ...ent.altNames]
    for (const n of names) {
      if (normalizeName(n) === norm) return ent.id
    }
  }
  // Fuzzy fallback
  let best: { id: EntityID; score: number } | null = null
  for (const ent of getAllEntities()) {
    if (ent.type !== type) continue
    const names = [ent.name, ...ent.altNames]
    for (const n of names) {
      const sim = fuzzySimilar(surface, n)
      if (!best || sim > best.score) best = { id: ent.id, score: sim }
    }
  }
  if (best && best.score >= 0.82) return best.id
  return null
}

export async function resolveCandidates(cands: EntityCandidate[]): Promise<Array<{ candidate: EntityCandidate, entityId: EntityID }>> {
  const out: Array<{ candidate: EntityCandidate, entityId: EntityID }> = []
  for (const c of cands) {
    const existing = canonicalMatch(c.surface, c.type)
    if (existing) {
      out.push({ candidate: c, entityId: existing })
    } else {
      const id: EntityID = safeUuid()
      const ent: CanonicalEntity = { id, name: c.surface, altNames: [c.surface.replace(/'s$/,'')], type: c.type }
      CEI.entities[id] = ent
      CEI.mentionsByEntity[id] = CEI.mentionsByEntity[id] || []
      out.push({ candidate: c, entityId: id })
    }
  }
  return out
}

export async function indexMessage(msg: ChatMessage): Promise<void> {
  // Skip if already indexed with identical mentions
  const already = CEI.mentionsByMessage[msg.id]
  if (already && already.length) return

  const candidates = await detectEntities(msg.text, msg.id)
  const resolved = await resolveCandidates(candidates)
  const mentions: Mention[] = []
  for (const { candidate, entityId } of resolved) {
    // Only link high-value types first; throttle later in renderer
    if (!allowTypePriority.includes(candidate.type)) continue
    // Heuristic: enrich canonical entities with altNames for fuzzy references
    const ent = CEI.entities[entityId]
    if (ent) {
      if (ent.type === 'person') {
        // Add surname and possessive variations
        const parts = ent.name.split(/\s+/)
        const last = parts[parts.length - 1]
        if (last && /[A-Za-z]/.test(last)) {
          uniquePush(ent.altNames, last)
          uniquePush(ent.altNames, `${last}'s`)
        }
      }
      if (ent.type === 'work') {
        // Add variations like "Shirer's book" based on nearby author pattern
        const author = extractAuthorFromContext(msg.text, candidate.start, candidate.end)
        if (author) {
          const { fullName, surname } = author
          const variants = [
            `${surname}'s book`, `${surname} book`, `${surname}'s novel`, `${surname} novel`,
            `${fullName}'s book`, `${fullName} book`,
          ]
          for (const v of variants) uniquePush(ent.altNames, v)
        }
      }
    }
    const mention: Mention = {
      entityId,
      messageId: msg.id,
      surface: candidate.surface,
      start: candidate.start,
      end: candidate.end,
      createdAt: msg.createdAt,
      snippet: makeSnippet(msg.text, candidate.start, candidate.end),
    }
    mentions.push(mention)
    // Update by-entity
    const arr = CEI.mentionsByEntity[entityId] || []
    arr.push(mention)
    arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    CEI.mentionsByEntity[entityId] = arr
  }
  CEI.mentionsByMessage[msg.id] = mentions.sort((a, b) => a.start - b.start)

  // Post-index enrichment: infer author-work association within the same message
  try {
    const persons = mentions.filter(m => (CEI.entities[m.entityId]?.type === 'person'))
    const works = mentions.filter(m => (CEI.entities[m.entityId]?.type === 'work' || CEI.entities[m.entityId]?.type === 'book'))
    for (const w of works) {
      let nearest: typeof persons[number] | null = null
      let bestDist = Infinity
      for (const p of persons) {
        const dist = Math.abs(p.start - w.start)
        if (dist < bestDist) { bestDist = dist; nearest = p }
      }
      if (nearest && bestDist <= 140) {
        const entWork = CEI.entities[w.entityId]
        const entPerson = CEI.entities[nearest.entityId]
        if (entWork && entPerson) {
          const full = entPerson.name
          const surname = full.split(/\s+/).pop() || full
          const variants = [
            `${surname}'s book`, `${surname} book`, `${surname}'s work`, `${surname} work`, `${surname}'s novel`, `${surname} novel`,
            `${full}'s book`, `${full} book`, `${full}'s work`, `${full} work`,
          ]
          for (const v of variants) uniquePush(entWork.altNames, v)
        }
      }
    }
  } catch {}

  // Persist periodically
  if (++persistCounter % 10 === 0) await persistCEI()
}

export function getLatestPriorMention(entityId: EntityID, currentMessageId: MessageID): Mention | null {
  const arr = CEI.mentionsByEntity[entityId] || []
  if (!arr.length) return null
  const currentMentions = CEI.mentionsByMessage[currentMessageId]
  const currentCreated = currentMentions && currentMentions.length ? currentMentions[0].createdAt : null
  if (currentCreated) {
    const prior = [...arr].filter(m => m.createdAt < currentCreated).sort((a, b) => a.createdAt > b.createdAt ? -1 : 1)[0]
    if (prior) return prior
  }
  // Fallback by messageId lexicographic (best-effort)
  const idx = arr
    .map((m, i) => ({ i, m }))
    .filter(x => x.m.messageId < currentMessageId)
    .map(x => x.i)
    .pop()
  if (idx !== undefined) return arr[idx]
  // Fallback: latest any
  return arr[arr.length - 1] || null
}

export function getAllMentions(entityId: EntityID): Mention[] {
  return (CEI.mentionsByEntity[entityId] || []).slice()
}

export function getCanonicalEntity(entityId: EntityID): CanonicalEntity | null {
  return CEI.entities[entityId] || null
}

export function getMentionsByMessage(messageId: MessageID): Mention[] {
  return CEI.mentionsByMessage[messageId] || []
}

// Helper for integrations
export function getCEI(): ConversationEntityIndex { return CEI }

// Match any already-known entity names/altNames within an arbitrary text.
// This is a safety net so later messages link even if detection misses them.
export function matchKnownEntitiesInText(text: string): Array<{ entityId: EntityID, surface: string, start: number, end: number }> {
  const results: Array<{ entityId: EntityID, surface: string, start: number, end: number }> = []
  if (!text) return results
  // Build candidates list of unique names sorted by length desc
  const entries: Array<{ entityId: EntityID; name: string }> = []
  for (const ent of Object.values(CEI.entities)) {
    const all = new Set<string>([ent.name, ...ent.altNames])
    for (const n of all) {
      const nn = n.trim()
      if (nn.length >= 3) entries.push({ entityId: ent.id, name: nn })
    }
  }
  entries.sort((a, b) => b.name.length - a.name.length)
  const used: Array<{ s: number; e: number }> = []
  const canPlace = (s: number, e: number) => used.every(u => e <= u.s || s >= u.e)
  const lower = text.toLowerCase()
  for (const { entityId, name } of entries) {
    let from = 0
    const needle = name.toLowerCase()
    while (from < lower.length) {
      const idx = lower.indexOf(needle, from)
      if (idx === -1) break
      const s = idx, e = idx + needle.length
      if (canPlace(s, e)) {
        results.push({ entityId, surface: text.slice(s, e), start: s, end: e })
        used.push({ s, e })
      }
      from = idx + needle.length
      if (results.length > 12) break
    }
    if (results.length > 12) break
  }
  // Sort left-to-right
  results.sort((a, b) => a.start - b.start)
  return results
}
