/**
 * DriftKnowledgeGraph — "a map of a mind in motion."
 *
 * A bird's-eye, spatial view of every drift in a conversation, rendered as a
 * living constellation: bioluminescent nodes that glow from within, connected
 * by organically curving rivers of light. The active branch breathes; deeper
 * thoughts recede into a soft depth-of-field haze.
 *
 * Pure SVG + CSS — no WebGL, no heavy deps. Touch-friendly, iOS-first, and
 * equally at home in a narrow mobile bottom sheet or a desktop side panel.
 *
 * The public surface (props, default export) and click-to-open-drift behavior
 * are preserved exactly; only the visual layer was reimagined.
 */
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import type { ChatSession, Message } from '@/types/chat'
import { X, GitBranch, Crosshair, Plus, Minus, Maximize2, Minimize2, Sparkles, Loader2, Search } from 'lucide-react'
import { haptics } from '@/lib/haptics'
import ResizeHandle from './ResizeHandle'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  chatHistory: ChatSession[]
  activeChatId: string | null
  onClose: () => void
  onSwitchChat: (chatId: string) => void
  onScrollToMessage: (messageId: string) => void
  onOpenDrift?: (chat: ChatSession) => void
  getTempMessages?: (chatId: string) => Message[] | null
  /** Weave every drift in the current conversation into one synthesis. */
  onSynthesize?: (rootId: string) => void
  /** True while a synthesis request is in flight. */
  synthesizing?: boolean
  /** Desktop: map covers the whole viewport. */
  fullscreen?: boolean
  /** Desktop: toggle the full-viewport view. */
  onToggleFullscreen?: () => void
  /** Desktop drag-to-resize: explicit panel width (px). */
  width?: number
  /** Desktop drag-to-resize: fires on every pointer move during a drag, with the pointer's viewport X. */
  onResize?: (clientX: number) => void
  onResizeStart?: () => void
  onResizeEnd?: () => void
}

interface TreeNode {
  chat: ChatSession
  phrase: string | undefined
  children: TreeNode[]
  /** Which lens opened this drift — drives the card's lens tag. `undefined` = a
   *  plain free-form drift (no template). Lives on the *parent* message's
   *  driftInfos, so it's resolved during tree construction. */
  lens?: 'simplify' | 'research' | 'connect' | 'challenge'
}

// The user-facing name for each lens. Plain drifts (no templateType) read "Drift".
const LENS_LABELS: Record<NonNullable<TreeNode['lens']>, string> = {
  simplify: 'Simplify',
  research: 'Deep dive',
  connect: 'Connect',
  challenge: 'Challenge',
}
function lensLabel(node: TreeNode): string {
  return node.lens ? LENS_LABELS[node.lens] : 'Drift'
}

// Per-lens accent, kept in sync with the lens chips in DriftPanel (so a Challenge
// reads red here and there alike). Plain drifts use the Drift primary (violet).
const LENS_COLORS: Record<NonNullable<TreeNode['lens']>, string> = {
  simplify: '#f59e0b',  // amber-500
  research: '#3b82f6',  // blue-500
  connect: '#22d3ee',   // accent-discovery (cyan)
  challenge: '#f43f5e', // rose-500
}
const DRIFT_LENS_COLOR = '#a855f7' // accent-violet
function lensColor(node: TreeNode): string {
  return node.lens ? LENS_COLORS[node.lens] : DRIFT_LENS_COLOR
}

/** The lens a drift was opened with, read from its parent message's driftInfos.
 *  Returns undefined for plain drifts (and when the link can't be found). */
function findLensType(driftChatId: string, chats: ChatSession[]): TreeNode['lens'] {
  for (const c of chats) {
    for (const m of c.messages ?? []) {
      const info = m.driftInfos?.find(d => d.driftChatId === driftChatId)
      if (!info) continue
      if (info.templateType) return info.templateType
      // A Connect drift may pre-date persisted templateType — infer it from the
      // cached cards/answers (same fallback App.tsx uses when opening the drift).
      if ((info.connectCards?.length ?? 0) > 0 ||
          (info.connectAnswers && Object.keys(info.connectAnswers).length > 0)) return 'connect'
      return undefined
    }
  }
  return undefined
}

// The lens scaffolding each template injects into the drift's own conversation —
// the system opener and the auto-sent trigger, in every supported language. These
// are the reliable signal for Connect *bridges* (which never get a parent
// driftInfos.templateType) and any drift whose parent link was rebuilt from temp
// chats. Kept in sync with driftPanel.ts DRIFT_LABELS_* / TEMPLATE_TRIGGER_PREFIXES.
const CONNECT_SCAFFOLD_RE = /^(Finding connections for|מחפש קשרים עבור|Show me what this connects to|הראה למה זה מתחבר)/
const SIMPLIFY_SCAFFOLD_RE = /^(Simplify this|הסבר בפשטות)/
const RESEARCH_SCAFFOLD_RE = /^(Deep dive into this|צלילה לעומק)/
const CHALLENGE_SCAFFOLD_RE = /^(Challenge this|ערער על זה)/
const BRIDGE_USER_RE = /(connect(?:s|ed)?\s+to\s+.+|קשור\s+ל-?\s*.+)/i

/** Infer the lens from a drift's own messages — used when the parent driftInfos
 *  don't carry a templateType (notably Connect bridges, "term → concept"). */
function detectLensFromChat(chat: ChatSession): TreeNode['lens'] {
  for (const m of chat.messages ?? []) {
    const t = (m.text ?? '').trim()
    if (!t) continue
    if (CONNECT_SCAFFOLD_RE.test(t)) return 'connect'
    if (m.isUser && BRIDGE_USER_RE.test(t)) return 'connect'   // "How does X connect to Y?"
    if (SIMPLIFY_SCAFFOLD_RE.test(t)) return 'simplify'
    if (RESEARCH_SCAFFOLD_RE.test(t)) return 'research'
    if (CHALLENGE_SCAFFOLD_RE.test(t)) return 'challenge'
  }
  return undefined
}

// ── Data helpers (preserved) ────────────────────────────────────────────────────

function findRootId(chatId: string, allChats: ChatSession[]): string {
  const chat = allChats.find(c => c.id === chatId)
  if (!chat?.metadata?.isDrift || !chat.metadata.parentChatId) return chatId
  return findRootId(chat.metadata.parentChatId, allChats)
}

function collectTree(
  rootId: string,
  allChats: ChatSession[],
  getTempMessages?: (chatId: string) => Message[] | null,
): ChatSession[] {
  const result: ChatSession[] = []
  const queue = [rootId]
  const seen = new Set<string>()

  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)

    let chat = allChats.find(c => c.id === id)

    if (getTempMessages) {
      const tempMsgs = getTempMessages(id)
      if (tempMsgs) {
        if (chat) {
          chat = { ...chat, messages: tempMsgs }
        } else {
          const parentChat = allChats.find(c =>
            c.messages.some(m => m.driftInfos?.some(d => d.driftChatId === id))
          )
          const driftInfo = parentChat?.messages
            .flatMap(m => m.driftInfos ?? [])
            .find(d => d.driftChatId === id)
          chat = {
            id, title: driftInfo?.selectedText ?? 'Drift',
            messages: tempMsgs,
            lastMessage: tempMsgs[tempMsgs.length - 1]?.text?.slice(0, 100) ?? '',
            createdAt: new Date(),
            metadata: { isDrift: true, parentChatId: parentChat?.id ?? rootId, selectedText: driftInfo?.selectedText },
          } as ChatSession
        }
      }
    }

    if (chat) {
      result.push(chat)
      const childIds = new Set<string>()
      allChats.forEach(c => { if (c.metadata?.parentChatId === id) childIds.add(c.id) })
      if (getTempMessages) {
        for (const msg of chat.messages)
          if (msg.hasDrift && msg.driftInfos)
            for (const info of msg.driftInfos) childIds.add(info.driftChatId)
      }
      for (const cid of childIds) if (!seen.has(cid)) queue.push(cid)
    }
  }
  return result
}

// Synthetic root that gathers every conversation into one constellation.
const ALL_ROOT_ID = '__all_explorations__'

/** Build the global forest: one synthetic root whose children are every
 *  top-level conversation (each with its own drift subtree). */
function buildForest(
  allChats: ChatSession[],
  getTempMessages?: (chatId: string) => Message[] | null,
): { tree: TreeNode | null; rootCount: number } {
  const roots = allChats.filter(c => !c.metadata?.isDrift && !c.metadata?.parentChatId)
  const children: TreeNode[] = []
  for (const r of roots) {
    const treeChats = collectTree(r.id, allChats, getTempMessages)
    const sub = buildTree(treeChats, r.id)
    if (!sub) continue
    // Skip empty placeholder chats (no messages, no drifts).
    if (sub.children.length === 0 && sub.chat.messages.length === 0) continue
    children.push(sub)
  }
  if (children.length === 0) return { tree: null, rootCount: 0 }
  const synthetic: ChatSession = {
    id: ALL_ROOT_ID,
    title: 'All explorations',
    messages: [],
    lastMessage: '',
    createdAt: new Date(),
  }
  return { tree: { chat: synthetic, phrase: undefined, children }, rootCount: children.length }
}

// TODO(semantic): draw semantic edges between drifts that are meaning-related
// but have no parent→child link (use embeddingDB vectors + cosineSimilarity
// above SEMANTIC_THRESHOLD). This is purely visual/layout work — out of scope
// for the embeddings pass; the tree below stays strictly parent→child for now.
function buildTree(chats: ChatSession[], rootId: string): TreeNode | null {
  const chatMap = new Map(chats.map(c => [c.id, c]))
  const childrenMap = new Map<string, ChatSession[]>()
  for (const chat of chats) {
    const pid = chat.metadata?.parentChatId
    if (pid && chatMap.has(pid)) {
      if (!childrenMap.has(pid)) childrenMap.set(pid, [])
      childrenMap.get(pid)!.push(chat)
    }
  }
  function build(id: string, phrase: string | undefined): TreeNode | null {
    const chat = chatMap.get(id)
    if (!chat) return null
    const lens = chat.metadata?.isDrift ? (findLensType(id, chats) ?? detectLensFromChat(chat)) : undefined
    return { chat, phrase, lens, children: (childrenMap.get(id) ?? []).map(c => build(c.id, c.metadata?.selectedText)).filter(Boolean) as TreeNode[] }
  }
  return build(rootId, undefined)
}

function lastAiPreview(chat: ChatSession): string | undefined {
  const last = [...(chat.messages ?? [])].reverse().find(m => !m.isUser)
  if (!last?.text) return undefined
  const clean = last.text.replace(/[#*`[\]\n]/g, ' ').replace(/\s+/g, ' ').trim()
  // Give the detail card a generous snippet; the card line-clamps it cleanly.
  if (clean.length <= 360) return clean
  const cut = clean.slice(0, 360)
  const sp = cut.lastIndexOf(' ')
  return (sp > 280 ? cut.slice(0, sp) : cut).trim() + '…'
}

function totalMessages(node: TreeNode): number {
  return node.chat.messages.length + node.children.reduce((s, c) => s + totalMessages(c), 0)
}

// A node counts as "alive" if it was touched recently — its last message (or, for
// empty placeholders, its creation) lands inside this window. Drives a soft pulse
// so the map shows where thought is still warm.
const ALIVE_WINDOW_MS = 30 * 60 * 1000
function lastActivity(chat: ChatSession): number {
  let t = chat.createdAt ? new Date(chat.createdAt).getTime() : 0
  for (const m of chat.messages ?? []) {
    const mt = m.timestamp ? new Date(m.timestamp).getTime() : 0
    if (mt > t) t = mt
  }
  return t
}

/** Max nesting depth of a tree (origin = 0) — feeds the session header. */
function treeDepth(node: TreeNode): number {
  if (!node.children.length) return 0
  return 1 + Math.max(...node.children.map(treeDepth))
}

function collectTopics(node: TreeNode): { phrase: string; chatId: string }[] {
  // Use the meaningful topic (connection / question / answer gist), not the bare
  // selected term — otherwise N lenses on one term all read "Barcelona".
  const here = node.phrase ? [{ phrase: nodeTopic(node.chat), chatId: node.chat.id }] : []
  return [...here, ...node.children.flatMap(collectTopics)]
}

// The auto-generated lens openers — these aren't real questions, so they never
// make a good node label.
const TEMPLATE_OPENER_RE = /^(show me what this connects to|simplify this|deep dive into this|what would you like to know about|finding connections for)/i

function clipLabel(s: string, n: number): string {
  const t = s.trim()
  return t.length > n ? t.slice(0, n).trim() + '…' : t
}

/** A short human topic pulled from an AI answer: first clause, markdown stripped.
 *  Returns '' for JSON/structured payloads (e.g. Connect cards) so callers fall back. */
function answerGist(text: string, max = 38): string {
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  if (!clean || clean.startsWith('[') || clean.startsWith('{')) return ''
  const prose = clean.replace(/[#*`_>[\]]/g, '').replace(/\s+/g, ' ').trim()
  if (!prose) return ''
  // First sentence-ish chunk (no regex lookbehind — must stay iOS 15 safe).
  const chunk = prose.split(/[.!?\n]/)[0] || prose
  return clipLabel(chunk, max)
}

// Leading filler that would make a gist start mid-thought — stripped so the
// subtitle is a clean, standalone statement (English + Hebrew openers).
const EN_FILLER_RE = /^(and|but|so|or|yet|well|now|also|actually|basically|essentially|in fact|however|moreover|furthermore|therefore|thus|then|first|firstly|indeed|right|okay|ok|yes|no|sure)\b[,:\s-]*/i
const HE_FILLER_RE = /^(אז|ובכן|למעשה|בעצם|אבל|וגם|כלומר|הנה|כן|לא|אוקיי)\b[,:\s-]*/

/** Split prose into sentences without lookbehind (must stay iOS-15 safe). A
 *  terminator only ends a sentence when followed by whitespace/end, so decimals
 *  ("3.5") and abbreviations ("U.S.") don't split. */
function splitSentences(prose: string): string[] {
  const out: string[] = []
  let buf = ''
  for (let i = 0; i < prose.length; i++) {
    const ch = prose[i]
    buf += ch
    if (ch === '.' || ch === '!' || ch === '?' || ch === '׃') {
      const next = prose[i + 1]
      if (next === undefined || next === ' ' || next === '\n') { out.push(buf.trim()); buf = '' }
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** Distil raw AI text into a subtitle: prefer the first *complete* sentence that
 *  fits the budget (so it's a standalone thought, not a fragment), leading filler
 *  removed, only clause/word-cut as a last resort, capitalized for Latin scripts
 *  (Hebrew/Arabic have no case). Returns '' when nothing clean is possible. */
function cleanGist(text: string, maxLen = 160): string {
  let clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  if (!clean || clean[0] === '[' || clean[0] === '{') return ''
  clean = clean
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')        // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')      // links → text
    .replace(/[#*`_>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return ''
  const letters = (x: string) => x.replace(/[^\p{L}\p{N}]/gu, '').length
  const sentences = splitSentences(clean)
    .map(x => x.replace(EN_FILLER_RE, '').replace(HE_FILLER_RE, '').trim())
    .filter(x => letters(x) >= 14)
  // The ideal subtitle is a complete, *declarative* sentence that already fits — no
  // truncation, and not a rhetorical question restating the prompt.
  const fits = sentences.filter(x => x.length <= maxLen)
  let s = (fits.find(x => !/[?؟]\s*$/.test(x)) || fits[0] || sentences[0] || clean).trim()
  if (!s) return ''
  if (s.length > maxLen) {
    const slice = s.slice(0, maxLen)
    const clause = Math.max(
      slice.lastIndexOf(', '), slice.lastIndexOf('; '),
      slice.lastIndexOf(' — '), slice.lastIndexOf(' – '), slice.lastIndexOf(': '),
    )
    if (clause >= 34) s = slice.slice(0, clause).trim()
    else { const sp = slice.lastIndexOf(' '); s = (sp >= 34 ? slice.slice(0, sp) : slice).trim() + '…' }
  } else {
    s = s.replace(/\.$/, '')   // subtitles read cleaner without a trailing period
  }
  if (/[a-z]/.test(s[0])) s = s[0].toUpperCase() + s.slice(1)
  return s
}

/** The essence of what a node *found* — a clean subtitle from its first real AI
 *  answer. Shown under the orb so each node reads as question (above) → answer (here). */
function nodeAnswerGist(chat: ChatSession): string {
  for (const m of chat.messages ?? []) {
    if (m.isUser || m.id?.startsWith('drift-system-')) continue
    const raw = (m.text ?? '').trim()
    if (!raw || TEMPLATE_OPENER_RE.test(raw)) continue
    const g = cleanGist(raw)
    if (g) return g
  }
  return ''
}

/** Reading-direction arrow between a "source → target" pair. Points LEFT for RTL
 *  scripts (Hebrew/Arabic) so the flow still reads source→target once the run is
 *  laid out right-to-left; otherwise the usual right arrow. */
function dirArrow(sample: string): string {
  return /[֐-׿؀-ۿ܀-߿]/.test(sample) ? '←' : '→'
}

/** A meaningful label for a drift node. Priority: the Connect bridge it explored
 *  ("Barcelona → Cruyff"), then a genuine user question, then the gist of the first
 *  real answer (so Simplify/Deep-dive lenses on one term stay distinct & informative),
 *  and only the bare term as a last resort. */
function nodeTopic(chat: ChatSession, clip: number | null = 32): string {
  const term = (chat.metadata?.selectedText || chat.title || 'Drift').replace(/^["']|["']$/g, '').trim()
  const msgs = chat.messages ?? []
  const fit = (s: string) => (clip == null ? s.trim() : clipLabel(s, clip))

  // 1) Connect bridge: a user "…connect to Y" → "term → Y".
  for (const m of msgs) {
    if (!m.isUser) continue
    const bridge = m.text.trim().match(/connect(?:s|ed)?\s+to\s+(.+?)[?.]?$/i)
      || m.text.trim().match(/קשור\s+ל-?\s*(.+?)[?.]?$/)
    if (bridge?.[1]) return `${term} ${dirArrow(term + bridge[1])} ${bridge[1].trim()}`
  }
  // 2) A genuine user follow-up question (not a template opener).
  for (const m of msgs) {
    if (!m.isUser) continue
    const t = m.text.trim()
    if (t && !TEMPLATE_OPENER_RE.test(t)) return fit(t)
  }
  // 3) Template-lens drift (only the bare term distinguishes it) → surface the
  //    gist of the first real answer so the node says what it actually explored.
  for (const m of msgs) {
    if (m.isUser || m.id?.startsWith('drift-system-')) continue
    if (m.text && TEMPLATE_OPENER_RE.test(m.text.trim())) continue
    const gist = answerGist(m.text ?? '', clip == null ? 160 : 38)
    if (gist) return gist
    break
  }
  return term
}

/** A node's own short label (origin term for the root, explored topic for drifts). */
function nodeOwnLabel(node: TreeNode): string {
  if (node.chat.id === ALL_ROOT_ID) return node.chat.title || 'All explorations'
  if (node.chat.metadata?.isDrift) return nodeTopic(node.chat)
  return (node.chat.title || 'Untitled').trim()
}

/**
 * Bug 7: the lineage (breadcrumb) of origin terms leading to a node, oldest→newest.
 * Walks the laid-out parent chain so a leaf question carries its whole chain
 * (e.g. ["Messi", "PSG", "how many goals…"]). The synthetic global root is
 * skipped. Returns just the node's own label when it has no meaningful ancestry.
 */
function lineageChain(laid: Laid): string[] {
  const chain: string[] = []
  let cur: Laid | null = laid
  while (cur) {
    if (cur.node.chat.id !== ALL_ROOT_ID) chain.unshift(nodeOwnLabel(cur.node))
    cur = cur.parent
  }
  return chain.length ? chain : [nodeOwnLabel(laid.node)]
}

/** RTL-safe breadcrumb string. `dir="auto"` on the host element keeps Hebrew/
 *  Arabic chains correctly ordered; the arrow renders fine in both directions. */
function lineageLabel(laid: Laid): string {
  const chain = lineageChain(laid)
  return chain.join(`  ${dirArrow(chain.join(' '))}  `)
}

/** Number duplicate phrases so chips are distinguishable: "guitarist", "guitarist 2" */
function disambiguateTopics(raw: { phrase: string; chatId: string }[]): { phrase: string; chatId: string }[] {
  const counts = new Map<string, number>()
  raw.forEach(({ phrase }) => counts.set(phrase, (counts.get(phrase) ?? 0) + 1))
  const seen = new Map<string, number>()
  return raw.map(({ phrase, chatId }) => {
    if ((counts.get(phrase) ?? 1) <= 1) return { phrase, chatId }
    const n = (seen.get(phrase) ?? 0) + 1
    seen.set(phrase, n)
    return { phrase: `${phrase} ${n}`, chatId }
  })
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Luminosity palette ──────────────────────────────────────────────────────────
// A descent into deeper waters: violet surface → indigo → cyan discovery depths.
// Each depth has a core (bright center of the glow) and a halo (outer light).

interface Hue { core: string; halo: string; rim: string }
const HUES: Hue[] = [
  { core: '#c084fc', halo: '#a855f7', rim: '#7c3aed' }, // root / surface — violet
  { core: '#a5b4fc', halo: '#6366f1', rim: '#4f46e5' }, // depth 1 — indigo
  { core: '#7dd3fc', halo: '#38bdf8', rim: '#0ea5e9' }, // depth 2 — sky
  { core: '#67e8f9', halo: '#22d3ee', rim: '#06b6d4' }, // depth 3+ — discovery cyan
]
function hueAt(depth: number): Hue { return HUES[Math.min(depth, HUES.length - 1)] }

// ── Responsive hook (preserved) ──────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

// ── Spatial layout ───────────────────────────────────────────────────────────────
// A tidy-tree layout flowing left→right (depth = x, siblings spread on y).
// Each subtree owns a vertical band sized by its leaf count, so branches never
// overlap and the whole thing reads like tributaries of a river.

interface Laid {
  node: TreeNode
  depth: number
  x: number              // card CENTRE (canvas units) — the connector port is its edge
  y: number
  parent: Laid | null
  index: number          // traversal order for staggered entrance
  trigger: string        // the question/term that opened this node (root: its title)
  gist: string           // the answer essence (subtitle)
  cardW: number
  cardH: number
}

// ── Layout geometry (canvas units → scales uniformly with the map, so non-overlap
//    proven at the fit zoom holds at every zoom). Nodes are CARDS, not orbs. ──
const CARD_W = 252        // drift card width
const CARD_W_ROOT = 276   // origin card a touch larger
const COL = 322           // distance between depth columns (> card width + connector gap)
const PAD_X = 140         // ≥ CARD_W_ROOT/2 so the (wider) root never clips at the left edge
const PAD_Y = 70
const ROW_GAP = 30        // vertical breathing room between cards
// The smallest the fit-to-view will zoom: below this, card text stops being
// readable, so we keep cards at least this big and let the user pan a large map.
const MIN_FIT_SCALE = 0.7

// Card height is BOUNDED (CSS line-clamps the text), so reserving the bound keeps
// bands disjoint by construction. Heights here mirror the CSS in StyleBlock().
const CARD_PAD_Y = 13     // top/pad bottom inside the card
const TITLE_LH = 20       // title line-height
const GIST_LH = 17        // subtitle line-height
const META_H = 16         // meta row height
const GAP_TITLE_GIST = 6
const GAP_GIST_META = 7
const MAX_TITLE_LINES = 3
const MAX_GIST_LINES = 2
// Conservative chars-per-line estimates: deliberately LOW so the estimated line
// count is always ≥ the browser's actual wrap (even for wide Hebrew glyphs). That
// keeps each reserved band ≥ the rendered card height → non-overlap stays guaranteed,
// while CSS still hard-clamps to the MAX_*_LINES caps.
const CPL_TITLE = 20
const CPL_GIST = 26

function estLines(len: number, cpl: number, max: number): number {
  return Math.min(max, Math.max(1, Math.ceil(len / cpl)))
}

const CTX_H = 17          // parent-context line (gives each card its "from where")

function cardHeight(trigger: string, gist: string, hasCtx: boolean): number {
  const tLines = estLines(trigger.length, CPL_TITLE, MAX_TITLE_LINES)
  const gLines = gist ? estLines(gist.length, CPL_GIST, MAX_GIST_LINES) : 0
  return CARD_PAD_Y * 2
    + (hasCtx ? CTX_H : 0)
    + tLines * TITLE_LH
    + (gLines ? GAP_TITLE_GIST + gLines * GIST_LH : 0)
    + GAP_GIST_META + META_H
}

interface Measure { trigger: string; gist: string; cardW: number; cardH: number }

/** A node's card content + reserved size. Single source of truth: layout sizes bands
 *  from this; the renderer draws the card from this. */
function measureNode(node: TreeNode, depth: number): Measure {
  const isRoot = depth === 0
  const trigger = isRoot
    ? (node.chat.title || 'Untitled').replace(/^["']|["']$/g, '').trim()
    : nodeTopic(node.chat, null)   // full, unclipped question / "term → term" bridge
  const gist = nodeAnswerGist(node.chat)
  return { trigger, gist, cardW: isRoot ? CARD_W_ROOT : CARD_W, cardH: cardHeight(trigger, gist, !isRoot) }
}

/**
 * Layered left→right layout with guaranteed non-overlap. Each card reserves a vertical
 * band = its (bounded) height + gap; sibling bands are disjoint and depth columns are
 * separated horizontally by COL > card width — so no two cards can ever overlap, at any
 * node count or zoom. Depth = x: a narrow-deep session reads as a long rightward chain,
 * a wide one as a tall fan.
 */
function layoutTree(root: TreeNode): { nodes: Laid[]; width: number; height: number } {
  const nodes: Laid[] = []
  let order = 0
  let maxDepth = 0

  const meas = new Map<TreeNode, Measure>()
  const sub = new Map<TreeNode, number>()
  function prepare(node: TreeNode, depth: number) {
    meas.set(node, measureNode(node, depth))
    node.children.forEach(c => prepare(c, depth + 1))
  }
  function subtreeHeight(node: TreeNode): number {
    const cached = sub.get(node)
    if (cached != null) return cached
    const own = meas.get(node)!.cardH + ROW_GAP
    const h = node.children.length
      ? Math.max(own, node.children.reduce((s, c) => s + subtreeHeight(c), 0))
      : own
    sub.set(node, h)
    return h
  }
  prepare(root, 0)

  function place(node: TreeNode, depth: number, bandTop: number, parent: Laid | null) {
    maxDepth = Math.max(maxDepth, depth)
    const m = meas.get(node)!
    const h = subtreeHeight(node)
    // Card centred in its band; cardH ≤ band → fully contained → never overlaps a sibling.
    const laid: Laid = {
      node, depth, x: PAD_X + depth * COL, y: PAD_Y + bandTop + h / 2,
      parent, index: order++,
      trigger: m.trigger, gist: m.gist, cardW: m.cardW, cardH: m.cardH,
    }
    nodes.push(laid)
    const childrenH = node.children.reduce((s, c) => s + subtreeHeight(c), 0)
    let childTop = bandTop + Math.max(0, (h - childrenH) / 2)
    node.children.forEach((child) => {
      place(child, depth + 1, childTop, laid)
      childTop += subtreeHeight(child)
    })
  }
  place(root, 0, 0, null)

  const width = PAD_X * 2 + maxDepth * COL + CARD_W
  const height = PAD_Y * 2 + subtreeHeight(root)
  return { nodes, width, height }
}

/** Organic S-curve between two points (horizontal-flowing bézier). */
function flowPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = (x2 - x1) * 0.62
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

/**
 * A tapered ribbon between two points — thick at the origin (parent), thin at the
 * terminus (child) — so the *direction of drift* reads at a glance and the width
 * can encode how explored a branch is. Connections flow left→right, so we offset
 * the two edges vertically and mirror the `flowPath` control points to keep the
 * same organic curve. Returns a closed, fillable path.
 */
function ribbonPath(
  x1: number, y1: number, x2: number, y2: number, wStart: number, wEnd: number,
): string {
  const dx = (x2 - x1) * 0.62
  const s = wStart / 2, e = wEnd / 2
  return (
    `M ${x1} ${y1 - s} ` +
    `C ${x1 + dx} ${y1 - s}, ${x2 - dx} ${y2 - e}, ${x2} ${y2 - e} ` +
    `L ${x2} ${y2 + e} ` +
    `C ${x2 - dx} ${y2 + e}, ${x1 + dx} ${y1 + s}, ${x1} ${y1 + s} Z`
  )
}

// ── The living graph (SVG) ───────────────────────────────────────────────────────

function GraphCanvas({
  root, activeChatId, onSwitchChat, onOpenDrift, isMobile, onSelect, selectedId, expanded,
}: {
  root: TreeNode
  activeChatId: string | null
  onSwitchChat: (id: string) => void
  onOpenDrift?: (chat: ChatSession) => void
  isMobile: boolean
  onSelect: (id: string) => void
  selectedId: string | null
  expanded?: boolean
}) {
  const { nodes, width, height } = useMemo(() => layoutTree(root), [root])
  const reduce = useMemo(prefersReducedMotion, [])

  // Pan + zoom: contain-to-fit on mount, then free drag/pinch.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const fitDone = useRef(false)

  const fit = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const cw = el.clientWidth, ch = el.clientHeight
    if (!cw || !ch) return
    // Prefer LEGIBLE cards over cramming the whole map into a narrow panel: never
    // shrink below a floor — a map larger than the viewport is fine to pan. Cap
    // zoom-in so a tiny map doesn't balloon.
    const raw = Math.min(cw / width, ch / height)
    const s = Math.min(1.3, Math.max(raw, MIN_FIT_SCALE))
    const sw = width * s, sh = height * s
    setView({
      scale: s,
      // Overflow horizontally → anchor the origin near the left edge (so the root
      // is always the visible starting point); otherwise centre.
      x: sw <= cw ? (cw - sw) / 2 : 24 - (PAD_X - CARD_W_ROOT / 2) * s,
      // Overflow vertically → keep the tree's vertical centre centred; else centre.
      y: (ch - sh) / 2,
    })
  }, [width, height])

  useEffect(() => {
    fitDone.current = false
  }, [width, height])

  useEffect(() => {
    if (fitDone.current) return
    fit()
    fitDone.current = true
  }, [fit])

  // Re-fit after the host panel finishes widening/narrowing (expand toggle), so the
  // map uses the new canvas size instead of staying scaled to the old width.
  const didExpandMount = useRef(false)
  useEffect(() => {
    if (!didExpandMount.current) { didExpandMount.current = true; return }
    const t = setTimeout(() => fit(), 320)
    return () => clearTimeout(t)
  }, [expanded, fit])

  // ── Drag to pan ──
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)
  const pinch = useRef<{ dist: number; scale: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    if (pinch.current) return
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    // Self-heal: if the mouse button isn't actually held (a pointerup was
    // swallowed somewhere), stop panning instead of dragging the map around a
    // free-moving cursor.
    if (e.pointerType === 'mouse' && e.buttons === 0) { drag.current = null; return }
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true
    setView(v => ({ ...v, x: drag.current!.vx + dx, y: drag.current!.vy + dy }))
  }
  const onPointerUp = () => { drag.current = null }

  const onWheel = (e: React.WheelEvent) => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    setView(v => {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const ns = Math.max(0.4, Math.min(2.4, v.scale * factor))
      const k = ns / v.scale
      return { scale: ns, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
    })
  }

  // Button zoom — steps the scale around the canvas centre (same clamps as wheel),
  // for when the map outgrows the viewport and pinch/wheel aren't handy.
  const zoomBy = useCallback((factor: number) => {
    const el = wrapRef.current
    if (!el) return
    const px = el.clientWidth / 2, py = el.clientHeight / 2
    setView(v => {
      const ns = Math.max(0.4, Math.min(2.4, v.scale * factor))
      const k = ns / v.scale
      return { scale: ns, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
    })
  }, [])

  // Touch pinch (two-finger) — simple distance-based zoom around midpoint.
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      pinch.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale: view.scale }
      drag.current = null
    }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      const el = wrapRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const px = (a.clientX + b.clientX) / 2 - rect.left
      const py = (a.clientY + b.clientY) / 2 - rect.top
      const ns = Math.max(0.4, Math.min(2.4, pinch.current.scale * (dist / pinch.current.dist)))
      setView(v => {
        const k = ns / v.scale
        return { scale: ns, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
      })
    }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinch.current = null
  }

  const byId = useMemo(() => new Map(nodes.map(n => [n.node.chat.id, n])), [nodes])

  // Tapping a node only previews it — selects + centers so the detail card shows.
  // Users glance between nodes; opening fully is a deliberate second tap.
  const handleSelect = (laid: Laid) => {
    if (drag.current?.moved) return
    const id = laid.node.chat.id
    if (id === ALL_ROOT_ID) return  // synthetic global root — not navigable
    haptics.selection()
    onSelect(id)
    // Panning is handled by the selection effect below — it runs AFTER the detail
    // panel has docked (shrinking the canvas), so it nudges only if truly needed.
  }

  // Fully open: a drift opens in the focused panel; a conversation switches the chat.
  const handleOpen = (laid: Laid) => {
    const id = laid.node.chat.id
    if (id === ALL_ROOT_ID) return
    haptics.selection()
    if (laid.node.chat.metadata?.isDrift && onOpenDrift) onOpenDrift(laid.node.chat)
    else onSwitchChat(id)
  }

  // ── Search / filter ──────────────────────────────────────────────────────────
  // Live text filter over the map: a query dims every card whose text doesn't match
  // (and the connectors leading to it), leaving only the matches lit. Matches stay
  // fully interactive; non-matches are dimmed and click-through-disabled so you only
  // act on hits. Enter jumps to the first match; narrowing to a single hit focuses it.
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()
  // Search the card's full meaningful text — the question/bridge label, the answer
  // gist, the drifted term, and the title — not just one field.
  const haystack = (laid: Laid) => [
    laid.trigger, laid.gist,
    laid.node.chat.metadata?.selectedText, laid.node.chat.title, laid.node.phrase,
  ].filter(Boolean).join('  ').toLowerCase()
  const isMatch = useCallback(
    (laid: Laid) => !q || haystack(laid).includes(q),
    [q],
  )
  const matches = useMemo(
    () => q ? nodes.filter(n => n.node.chat.id !== ALL_ROOT_ID && isMatch(n)) : [],
    [q, nodes, isMatch],
  )

  // Pan the view ONLY when the card isn't comfortably inside the canvas — tapping a
  // card that's already visible must not jolt the map. Also rescues a card that the
  // docked detail panel (which shrinks this canvas) would otherwise hide. Nudges the
  // minimum distance to bring the card within a margin; keeps zoom untouched.
  const ensureVisible = useCallback((laid: Laid) => {
    const el = wrapRef.current
    if (!el) return
    const cw = el.clientWidth, ch = el.clientHeight
    setView(v => {
      const s = v.scale
      const left = v.x + (laid.x - laid.cardW / 2) * s
      const right = v.x + (laid.x + laid.cardW / 2) * s
      const top = v.y + (laid.y - laid.cardH / 2) * s
      const bottom = v.y + (laid.y + laid.cardH / 2) * s
      const M = 28   // comfortable margin from each viewport edge
      let nx = v.x, ny = v.y
      if (right - left < cw) {
        if (left < M) nx += M - left
        else if (right > cw - M) nx -= right - (cw - M)
      } else nx += cw / 2 - (left + right) / 2   // card wider than view → centre it
      if (bottom - top < ch) {
        if (top < M) ny += M - top
        else if (bottom > ch - M) ny -= bottom - (ch - M)
      } else ny += ch / 2 - (top + bottom) / 2
      if (Math.abs(nx - v.x) < 0.5 && Math.abs(ny - v.y) < 0.5) return v   // already in view
      return { ...v, x: nx, y: ny }
    })
  }, [])

  // Centre on whatever node becomes selected from *outside* the canvas — tapping an
  // Explored chip, keyboard nav, or an external select. Node taps already centre via
  // handleSelect; this unifies every path so a chip and a tap behave identically.
  // The initial mount is skipped so this never fights the contain-to-fit on open.
  // A brief pulse draws the eye to the card a selection landed on — so tapping an
  // Explored chip visibly highlights the matching square(s).
  const [pulseId, setPulseId] = useState<string | null>(null)
  const didCenterMount = useRef(false)
  const prevHadSelection = useRef(false)
  useEffect(() => {
    if (!didCenterMount.current) { didCenterMount.current = true; prevHadSelection.current = !!selectedId; return }
    const hasSel = !!selectedId && byId.has(selectedId)
    const toggled = (!!selectedId) !== prevHadSelection.current
    prevHadSelection.current = !!selectedId
    const timers: ReturnType<typeof setTimeout>[] = []
    if (toggled) {
      // The docked inspector just opened/closed → the canvas resized. Re-fit so the
      // whole map stays in the (now smaller/larger) space and no card is hidden
      // behind the inspector. Wait a frame for the flex layout to settle.
      timers.push(setTimeout(() => fit(), 80))
    } else if (hasSel) {
      ensureVisible(byId.get(selectedId)!)
    }
    if (hasSel) {
      setPulseId(selectedId)
      timers.push(setTimeout(() => setPulseId(null), 1150))
    }
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // ── Keyboard navigation: arrows walk node→node, Enter/Space opens ─────────────
  useEffect(() => {
    const move = (dir: 'left' | 'right' | 'up' | 'down') => {
      const cur = selectedId ? byId.get(selectedId) : null
      if (!cur) {
        const first = nodes.find(n => n.node.chat.id !== ALL_ROOT_ID)
        if (first) { haptics.selection(); onSelect(first.node.chat.id) }
        return
      }
      let best: Laid | null = null
      let bestScore = Infinity
      for (const n of nodes) {
        if (n === cur || n.node.chat.id === ALL_ROOT_ID) continue
        const dx = n.x - cur.x, dy = n.y - cur.y
        let ok = false, along = 0, perp = 0
        if (dir === 'right') { ok = dx > 1; along = dx; perp = Math.abs(dy) }
        else if (dir === 'left') { ok = dx < -1; along = -dx; perp = Math.abs(dy) }
        else if (dir === 'down') { ok = dy > 1; along = dy; perp = Math.abs(dx) }
        else { ok = dy < -1; along = -dy; perp = Math.abs(dx) }
        if (!ok) continue
        const score = along + perp * 2.5   // prefer aligned, nearby nodes
        if (score < bestScore) { bestScore = score; best = n }
      }
      if (best) { haptics.selection(); onSelect(best.node.chat.id) }
    }

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); move('right'); break
        case 'ArrowLeft': e.preventDefault(); move('left'); break
        case 'ArrowUp': e.preventDefault(); move('up'); break
        case 'ArrowDown': e.preventDefault(); move('down'); break
        case 'Enter':
        case ' ': {
          const cur = selectedId ? byId.get(selectedId) : null
          if (cur) { e.preventDefault(); handleOpen(cur) }
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, nodes, byId, ensureVisible])

  // Enter in the filter box selects the first match (the effect then brings it into view).
  const jumpToFirstMatch = () => {
    const hit = matches[0]
    if (hit) { haptics.selection(); onSelect(hit.node.chat.id) }
  }

  // As the query narrows to exactly one card, gently bring it into view (no-op if it
  // already is) — so finishing a search lands you on the result without an extra tap.
  useEffect(() => {
    if (q && matches.length === 1) ensureVisible(matches[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, matches.length])

  return (
    <div className="w-full h-full flex flex-col min-h-0">
    <div
      ref={wrapRef}
      className="dkg-canvas relative flex-1 min-h-0 overflow-hidden touch-none select-none"
      style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Ambient depth gradient — calm, restrained (no drifting specks) */}
      <div className="dkg-ambient" aria-hidden />

      {/* Filter box — type to spotlight matching cards (others dim); Enter jumps to
          the first match; a live count shows how many cards match. Fixed-height pill
          aligned with the recenter button; dir="auto" for Hebrew/Arabic queries. */}
      <div
        className="dkg-search absolute z-20 flex items-center gap-2"
        style={{ top: 10, left: 10, height: 34 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'rgb(var(--color-text-muted))' }} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); jumpToFirstMatch() } }}
          placeholder="Filter cards…"
          dir="auto"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="bg-transparent text-[13px] focus:outline-none w-[112px]"
          style={{ color: 'rgb(var(--color-text-primary))' }}
        />
        {q && (
          <span
            className="flex-shrink-0 text-[11px] font-semibold tabular-nums"
            style={{ color: matches.length ? 'rgb(var(--color-text-secondary))' : '#f0a5a5' }}
          >
            {matches.length || 'no'} {matches.length === 1 ? 'hit' : 'hits'}
          </span>
        )}
        {filter && (
          <button
            onClick={() => setFilter('')}
            className="flex-shrink-0 -ml-0.5 flex items-center justify-center w-5 h-5 rounded-full text-white/55 hover:text-white hover:bg-white/10"
            aria-label="Clear filter"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Zoom + recenter controls — subtle by default, brighten on hover. */}
      <div
        className="absolute z-20 flex flex-col gap-1"
        style={{ top: 10, right: 10 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => { e.stopPropagation(); zoomBy(1.25) }}
          className="dkg-fit flex items-center justify-center rounded-full active:scale-90"
          style={{ width: 28, height: 28 }}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); zoomBy(1 / 1.25) }}
          className="dkg-fit flex items-center justify-center rounded-full active:scale-90"
          style={{ width: 28, height: 28 }}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); fit() }}
          className="dkg-fit flex items-center justify-center rounded-full active:scale-90 mt-0.5"
          style={{ width: 28, height: 28 }}
          title="Fit to view"
          aria-label="Fit map to view"
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>
      </div>

      <svg
        className="absolute top-0 left-0"
        width={width}
        height={height}
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: '0 0',
          willChange: 'transform',
          overflow: 'visible',
        }}
      >
        <defs>
          {/* Flowing connector gradients (parent hue → child hue) */}
          {HUES.map((h, i) => {
            const next = hueAt(i + 1)
            return (
              <linearGradient key={`l${i}`} id={`dkg-link-${i}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={h.halo} stopOpacity="0.7" />
                <stop offset="100%" stopColor={next.halo} stopOpacity="0.42" />
              </linearGradient>
            )
          })}
        </defs>

        {/* Connectors first (under nodes) — tapered rivers of light.
            Thick at the parent, thin at the child (direction of drift), with the
            origin width weighted by how much conversation lives in the child branch
            ("heavier = more explored"). A flowing pulse rides the centreline. */}
        <g>
          {nodes.map(laid => {
            if (!laid.parent) return null
            const p = laid.parent
            // Rivers connect card PORTS: parent's right edge → child's left edge.
            const px = p.x + p.cardW / 2, py = p.y
            const cx = laid.x - laid.cardW / 2, cy = laid.y
            const centre = flowPath(px, py, cx, cy)
            const onActivePath =
              selectedId === laid.node.chat.id ||
              activeChatId === laid.node.chat.id ||
              selectedId === p.node.chat.id
            // Origin width grows with the child's conversation volume; terminus stays slim.
            const vol = Math.min(laid.node.chat.messages.length, 10)
            const wStart = (onActivePath ? 5.5 : 3.6) + vol * 0.7
            const wEnd = onActivePath ? 2 : 1.3
            const ribbon = ribbonPath(px, py, cx, cy, wStart, wEnd)
            // A filtered-out child fades its connector to match the dimmed card.
            const dim = !!q && !isMatch(laid)
            return (
              <g key={`edge-${laid.node.chat.id}`} opacity={dim ? 0 : 1} style={{ transition: 'opacity 0.3s ease' }}>
                {/* tapered base river */}
                <path
                  d={ribbon}
                  fill={`url(#dkg-link-${Math.min(p.depth, HUES.length - 1)})`}
                  stroke="none"
                  opacity={onActivePath ? 0.95 : 0.62}
                />
                {/* flowing pulse of light along the centreline */}
                {!reduce && (
                  <path
                    d={centre}
                    fill="none"
                    stroke={hueAt(laid.depth).core}
                    strokeWidth={onActivePath ? 2.4 : 1.4}
                    strokeLinecap="round"
                    className="dkg-flow"
                    style={{ animationDelay: `${(laid.index % 6) * 0.5}s` }}
                  />
                )}
              </g>
            )
          })}
        </g>

      </svg>

      {/* ── Card layer ──────────────────────────────────────────────────────────
          Nodes are native-HTML cards (correct bidi/RTL + real wrapping), placed in a
          layer that shares the SVG's transform so they scale 1:1 with the map. Because
          everything scales uniformly and each card sits inside its own disjoint band,
          cards can never overlap — at any node count or zoom. */}
      <div
        className="absolute top-0 left-0"
        style={{
          width, height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
      >
        {nodes.map(laid => {
          const id = laid.node.chat.id
          const h = hueAt(laid.depth)
          const focused = id === activeChatId || id === selectedId
          const filteredOut = !!q && !isMatch(laid)
          const alive = !reduce && !focused && (Date.now() - lastActivity(laid.node.chat) < ALIVE_WINDOW_MS)
          const isRoot = laid.depth === 0
          const msgs = laid.node.chat.messages.length
          const ts = laid.node.chat.createdAt ? timeAgo(laid.node.chat.createdAt) : null
          const lod = view.scale < 0.58   // zoomed far out → title only (keeps wide maps clean)
          // The term that *initiated* this drift (the highlighted text) — the card's
          // subject. Shown as a pill so "מתי העיר נוסדה?" reads as "[ירושלים] · when
          // was the city founded?". Hidden when redundant with the title.
          const selRaw = laid.node.chat.metadata?.selectedText?.replace(/^["']|["']$/g, '').trim()
          const selTerm = selRaw && !isRoot && !laid.trigger.includes(selRaw) ? selRaw : ''
          return (
            <div
              key={id}
              className={`dkg-card${isRoot ? ' dkg-card-root' : ''}${focused ? ' is-focused' : ''}${alive ? ' is-alive' : ''}`}
              style={{
                position: 'absolute',
                left: laid.x - laid.cardW / 2,
                top: laid.y - laid.cardH / 2,
                width: laid.cardW,
                minHeight: laid.cardH,
                ['--hue-core' as string]: h.core,
                ['--hue-halo' as string]: h.halo,
                ['--hue-rim' as string]: h.rim,
                opacity: filteredOut ? 0 : 1,
                // Dimmed (non-matching) cards are click-through-disabled so a filter
                // lets you act only on the cards you're actually looking for.
                pointerEvents: filteredOut ? 'none' : 'auto',
                animation: reduce ? undefined : `dkgCardRise 0.5s cubic-bezier(0.16,1,0.3,1) ${0.04 + laid.index * 0.045}s both`,
              }}
              title={lineageLabel(laid)}
              onPointerUp={(e) => { e.stopPropagation(); handleSelect(laid); drag.current = null }}
            >
              {id === pulseId && <span className="dkg-card-pulse" aria-hidden />}
              {selTerm && (
                <div className="dkg-card-term" dir="auto" title={selTerm}>{selTerm}</div>
              )}
              <div className="dkg-card-title" dir="auto">{laid.trigger}</div>
              {!lod && laid.gist && <div className="dkg-card-gist" dir="auto">{laid.gist}</div>}
              {/* The lens tag is ALWAYS shown (even zoomed-out) so every card is
                  identifiable at a glance; the msg-count/time only when zoomed in. */}
              <div className="dkg-card-meta">
                <span
                  className="dkg-card-orb"
                  aria-hidden
                  style={isRoot ? undefined : ({ ['--hue-core' as string]: lensColor(laid.node), ['--hue-rim' as string]: lensColor(laid.node), ['--hue-halo' as string]: lensColor(laid.node) })}
                />
                <span
                  className="dkg-card-eyebrow"
                  style={isRoot ? undefined : { color: lensColor(laid.node) }}
                >{isRoot ? 'Origin' : `↗ ${lensLabel(laid.node)}`}</span>
                {!lod && (
                  <span className="tabular-nums" style={{ opacity: 0.75 }}>
                    · {msgs} {msgs === 1 ? 'msg' : 'msgs'}{ts ? ` · ${ts}` : ''}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>

    {/* Selected node detail — a DOCKED inspector below the map. It occupies its own
        space (the canvas above shrinks to fit), so it never covers the cards you're
        exploring. */}
    {selectedId && byId.has(selectedId) && (
      <DetailCard
        laid={byId.get(selectedId)!}
        isMobile={isMobile}
        onOpen={() => handleOpen(byId.get(selectedId)!)}
        onDismiss={() => onSelect('')}
      />
    )}
    </div>
  )
}

// ── Floating detail card for the selected node ───────────────────────────────────

function DetailCard({
  laid, isMobile, onOpen, onDismiss,
}: { laid: Laid; isMobile: boolean; onOpen: () => void; onDismiss: () => void }) {
  const h = hueAt(laid.depth)
  const isDrift = laid.depth > 0
  const title = isDrift ? nodeTopic(laid.node.chat, null) : (laid.node.chat.title || 'Untitled')
  // Bug 7: ancestry leading to this node, minus the node itself (shown as title).
  const lineage = lineageChain(laid)
  const trail = lineage.slice(0, -1)
  const trailArrow = dirArrow(trail.join(' '))
  const preview = lastAiPreview(laid.node.chat)
  const ts = laid.node.chat.createdAt ? timeAgo(laid.node.chat.createdAt) : null
  const msgs = laid.node.chat.messages.length
  const selRaw = laid.node.chat.metadata?.selectedText?.replace(/^["']|["']$/g, '').trim()
  const selTerm = selRaw && isDrift && !title.includes(selRaw) ? selRaw : ''

  return (
    <div
      className="dkg-detail flex-shrink-0"
      style={{
        borderTop: '1px solid rgb(var(--color-border))',
        padding: isMobile ? '10px 12px calc(env(safe-area-inset-bottom) + 12px)' : '12px 16px',
        maxHeight: '40%',
        overflowY: 'auto',
      }}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
    >
      <div
        className="dkg-detail-inner rounded-2xl overflow-hidden"
        style={{ ['--hue-core' as string]: h.core, ['--hue-halo' as string]: h.halo, ['--hue-rim' as string]: h.rim, maxWidth: isMobile ? '100%' : 580, margin: '0 auto' }}
      >
        <div className="px-4 pt-3 pb-3.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: isDrift ? lensColor(laid.node) : h.core }}
            >
              {isDrift ? `↗ ${lensLabel(laid.node)}` : 'Origin'}
            </span>
            <button
              onClick={onDismiss}
              className="flex items-center justify-center rounded-full active:scale-90"
              style={{ width: 22, height: 22, color: 'rgb(var(--color-text-muted))', background: 'rgb(var(--color-elevated))' }}
              aria-label="Deselect"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {trail.length > 0 && (
            <div
              dir="auto"
              className="leading-snug mb-1"
              style={{
                fontSize: 10.5, color: 'rgb(var(--color-text-muted))', fontWeight: 600,
                // No clamp: the source trail wraps freely across as many rows as it
                // needs, so the full lineage stays readable (no "…" mid-question).
                overflowWrap: 'anywhere',
              } as React.CSSProperties}
            >
              {trail.map((step, i) => (
                <span key={i}>
                  <span style={{ color: i === trail.length - 1 ? h.core : 'rgb(var(--color-text-muted))' }}>{step}</span>
                  <span style={{ opacity: 0.5, padding: '0 4px' }}>{trailArrow}</span>
                </span>
              ))}
            </div>
          )}
          {selTerm && (
            <div dir="auto" className="dkg-card-term" style={{ marginBottom: 6 }} title={selTerm}>{selTerm}</div>
          )}
          <div
            dir="auto"
            className="font-semibold leading-snug mb-1.5"
            style={{
              fontSize: 15, color: 'rgb(var(--color-text-primary))',
              display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            } as React.CSSProperties}
          >
            {title}
          </div>
          {preview && (
            <div
              dir="auto"
              className="leading-relaxed mb-3"
              style={{
                fontSize: 12.5, color: 'rgb(var(--color-text-secondary))',
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              } as React.CSSProperties}
            >
              {preview}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpen}
              className="dkg-open-btn flex-1 rounded-xl text-[12px] font-semibold py-2 active:scale-[0.98]"
            >
              {isDrift ? 'Open this drift' : 'Go to chat'}
            </button>
            <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: 'rgb(var(--color-text-muted))' }}>
              {msgs} {msgs === 1 ? 'msg' : 'msgs'}{ts ? ` · ${ts}` : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Topics strip (refined for the luminous palette) ──────────────────────────────

function TopicsStrip({
  topics, onJump, isMobile, activeId,
}: { topics: { phrase: string; chatId: string }[]; onJump: (id: string) => void; isMobile: boolean; activeId: string | null }) {
  // The chips row is horizontally scrollable. Three input paths, since the scrollbar
  // is hidden: a vertical wheel scrolls it sideways; a click-drag pans it (desktop);
  // and touch keeps native momentum scroll. A drag past a small threshold suppresses
  // the chip's click so panning never accidentally jumps the map.
  const stripRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; left: number } | null>(null)
  const movedRef = useRef(false)
  const onWheel = useCallback((e: React.WheelEvent) => {
    const el = stripRef.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY
  }, [])
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return   // native momentum scroll handles touch
    const el = stripRef.current
    if (!el) return
    dragRef.current = { x: e.clientX, left: el.scrollLeft }
    movedRef.current = false
    el.setPointerCapture?.(e.pointerId)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const el = stripRef.current, d = dragRef.current
    if (!el || !d) return
    if (e.buttons === 0) { dragRef.current = null; return }
    const dx = e.clientX - d.x
    if (Math.abs(dx) > 4) movedRef.current = true
    el.scrollLeft = d.left - dx
  }, [])
  const onPointerUp = useCallback(() => { dragRef.current = null }, [])
  if (!topics.length) return null
  return (
    <div
      className="flex-shrink-0 flex items-center gap-0"
      style={{ borderBottom: '1px solid rgb(var(--color-border))' }}
    >
      <div
        className="flex-shrink-0 pl-3 pr-1 py-2 text-[9px] font-bold uppercase tracking-widest"
        style={{ color: 'rgb(var(--color-text-muted))' }}
      >
        Explored
      </div>
      <div
        ref={stripRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex-1 min-w-0 overflow-x-auto py-2 [&::-webkit-scrollbar]:hidden"
        style={{
          display: 'flex', flexWrap: 'nowrap', gap: 6,
          // Generous side padding so the first/last chips are never glued to the
          // edge, plus a fade mask so it's clear the row scrolls (no hard clip).
          paddingLeft: 8, paddingRight: 16, cursor: 'grab',
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0, #000 14px, #000 calc(100% - 22px), transparent 100%)',
          maskImage: 'linear-gradient(to right, transparent 0, #000 14px, #000 calc(100% - 22px), transparent 100%)',
        } as React.CSSProperties}
      >
        {topics.map(({ phrase, chatId }, i) => {
          const h = hueAt((i % (HUES.length - 1)) + 1)
          const active = chatId === activeId
          return (
            <button
              key={chatId}
              onClick={() => { if (movedRef.current) { movedRef.current = false; return } onJump(chatId) }}
              dir="auto"
              data-active={active || undefined}
              className="dkg-chip flex-shrink-0 font-medium rounded-full active:scale-95"
              style={{
                fontSize: 11, padding: '3px 11px',
                minHeight: isMobile ? 26 : 24,
                whiteSpace: 'nowrap',
                // Hues flow to the CSS so the chip can recolor per theme (bright text
                // on dark, deep-rim text on light) instead of one washed-out value.
                ['--chip-core' as string]: h.core,
                ['--chip-halo' as string]: h.halo,
                ['--chip-rim' as string]: h.rim,
              } as React.CSSProperties}
            >
              {phrase.length > 40 ? phrase.slice(0, 40) + '…' : phrase}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Drag-to-close for mobile bottom sheet (preserved) ─────────────────────────────

function useDragClose(onClose: () => void, enabled: boolean) {
  const startY = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragY = useRef(0)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return
    startY.current = e.touches[0].clientY
    dragY.current = 0
  }, [enabled])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled || startY.current === null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0) {
      dragY.current = dy
      if (panelRef.current) {
        panelRef.current.style.transform = `translateY(${Math.min(dy, 200)}px)`
        panelRef.current.style.transition = 'none'
      }
    }
  }, [enabled])

  const onTouchEnd = useCallback(() => {
    if (!enabled) return
    if (dragY.current > 80) {
      onClose()
    } else if (panelRef.current) {
      panelRef.current.style.transform = ''
      panelRef.current.style.transition = ''
    }
    startY.current = null
    dragY.current = 0
  }, [enabled, onClose])

  return { panelRef, onTouchStart, onTouchMove, onTouchEnd }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DriftKnowledgeGraph({
  chatHistory, activeChatId, onClose, onSwitchChat, onOpenDrift, getTempMessages,
  onSynthesize, synthesizing, fullscreen, onToggleFullscreen, width, onResize,
  onResizeStart, onResizeEnd,
}: Props) {
  const isMobile = useIsMobile()
  // True while the user is dragging the resize handle — suppresses the width
  // CSS transition so the panel tracks the pointer instead of easing behind it.
  const [isResizing, setIsResizing] = useState(false)

  // The map always shows just the current conversation's tree.
  const [scope] = useState<'chat' | 'all'>('chat')

  const rootId = activeChatId ? findRootId(activeChatId, chatHistory) : null
  const treeChats = rootId ? collectTree(rootId, chatHistory, getTempMessages) : []
  const chatTree = rootId && treeChats.length > 1 ? buildTree(treeChats, rootId) : null

  const { tree: forestTree, rootCount } = useMemo(
    () => scope === 'all' ? buildForest(chatHistory, getTempMessages) : { tree: null, rootCount: 0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, chatHistory],
  )

  const tree = scope === 'all' ? forestTree : chatTree

  const rootChat = rootId ? chatHistory.find(c => c.id === rootId) : null
  const driftCount = scope === 'all'
    ? (tree ? collectTopics(tree).length : 0)
    : treeChats.filter(c => !!c.metadata?.isDrift).length
  const msgTotal = tree ? totalMessages(tree) : 0
  const topics = tree ? disambiguateTopics(collectTopics(tree)) : []
  const depth = tree ? treeDepth(tree) : 0
  const originDate = rootChat?.createdAt ? timeAgo(rootChat.createdAt) : null

  // Selected node in the map (drives the floating detail card).
  // Start with NO selection so the map is the hero on open (the active node still
  // highlights via activeChatId). The docked inspector appears only when a card is
  // tapped — keeping the full canvas free for exploration until then.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const onSelect = useCallback((id: string) => setSelectedId(id || null), [])

  // Synthesize the current conversation's drifts. Chat scope only.
  const synthBar = scope === 'chat' && rootId && driftCount >= 2 && onSynthesize ? (
    <div className="px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgb(var(--color-border))' }}>
      <button
        onClick={() => onSynthesize(rootId)}
        disabled={synthesizing}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12.5px] font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-70"
        style={{
          background: 'linear-gradient(135deg, rgba(168,85,247,0.9), rgba(34,211,238,0.85))',
          boxShadow: '0 4px 16px rgba(124,58,237,0.28)',
        }}
        title="Weave these drifts into one synthesis on your chat"
      >
        {synthesizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {synthesizing ? 'Synthesizing…' : `Synthesize ${driftCount} drifts`}
      </button>
    </div>
  ) : null

  const { panelRef } = useDragClose(onClose, isMobile)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const graph = tree ? (
    <GraphCanvas
      root={tree}
      activeChatId={activeChatId}
      onSwitchChat={(id) => { onSwitchChat(id); onClose() }}
      onOpenDrift={onOpenDrift ? (chat => { onOpenDrift(chat); onClose() }) : undefined}
      isMobile={isMobile}
      onSelect={onSelect}
      selectedId={selectedId}
      expanded={fullscreen}
    />
  ) : (
    <EmptyState isMobile={isMobile} />
  )

  // ── Mobile: full-screen view ──
  if (isMobile) {
    return (
      <>
        <StyleBlock />
        <div
          ref={panelRef}
          className="dkg-sheet fixed inset-0 z-50 flex flex-col"
        >
          {/* Header */}
          <div className="px-4 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid rgb(var(--color-border))', paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <GitBranch className="w-3 h-3 flex-shrink-0" style={{ color: '#c084fc' }} />
                  <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#c084fc' }}>
                    Drift Map
                  </span>
                </div>
                <h2
                  className="text-[15px] font-bold leading-snug"
                  style={{ color: 'rgb(var(--color-text-primary))', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}
                >
                  {scope === 'all' ? 'All explorations' : (rootChat?.title || 'Untitled')}
                </h2>
                {driftCount > 0 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5"
                      style={{ background: 'rgba(168,85,247,0.16)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,0.3)' }}
                    >
                      ↗ {driftCount} {driftCount === 1 ? 'drift' : 'drifts'}
                    </span>
                    <span className="text-[10px]" style={{ color: 'rgb(var(--color-text-muted))' }}>
                      {scope === 'all'
                        ? `· ${rootCount} ${rootCount === 1 ? 'chat' : 'chats'}`
                        : `· ${msgTotal} msgs${depth ? ` · ${depth} deep` : ''}${originDate ? ` · ${originDate}` : ''}`}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={onClose}
                  className="flex items-center justify-center rounded-full active:scale-90"
                  style={{ width: 30, height: 30, background: 'rgb(var(--color-elevated))', border: '1px solid rgb(var(--color-border))', color: 'rgb(var(--color-text-secondary))' }}
                  aria-label="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {tree && <TopicsStrip topics={topics} onJump={onSelect} isMobile activeId={selectedId} />}
          {synthBar}

          <div className="flex-1 relative overflow-hidden">{graph}</div>
        </div>
      </>
    )
  }

  // ── Desktop: right panel ──
  return (
    <>
      <StyleBlock />
      <div
        className="dkg-sheet fixed top-0 right-0 bottom-0 z-40 flex flex-col"
        style={{
          width: fullscreen ? '100vw' : (width ?? 'min(680px, 56vw)'),
          left: fullscreen ? 0 : undefined,
          borderLeft: '1px solid rgb(var(--color-border))',
          transition: isResizing ? 'none' : 'width 0.3s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Drag to resize (desktop) — hidden in full-screen */}
        {onResize && !fullscreen && (
          <ResizeHandle
            edge="left"
            onResize={onResize}
            onResizeStart={() => { setIsResizing(true); onResizeStart?.() }}
            onResizeEnd={() => { setIsResizing(false); onResizeEnd?.() }}
          />
        )}
        {/* Header */}
        <div className="px-5 pt-4 pb-3.5 flex-shrink-0" style={{ borderBottom: '1px solid rgb(var(--color-border))' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1">
                <GitBranch className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#c084fc' }} />
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#c084fc' }}>
                  Drift Map
                </span>
              </div>
              <h2
                className="text-[14px] font-semibold leading-snug"
                style={{ color: 'rgb(var(--color-text-primary))', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}
              >
                {scope === 'all' ? 'All explorations' : (rootChat?.title || 'Untitled')}
              </h2>
              {driftCount > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5"
                    style={{ background: 'rgba(168,85,247,0.16)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,0.3)' }}
                  >
                    ↗ {driftCount} {driftCount === 1 ? 'drift' : 'drifts'}
                  </span>
                  <span className="text-[10px]" style={{ color: 'rgb(var(--color-text-muted))' }}>
                    {scope === 'all'
                      ? `· ${rootCount} ${rootCount === 1 ? 'conversation' : 'conversations'}`
                      : `· ${msgTotal} messages${depth ? ` · ${depth} ${depth === 1 ? 'level' : 'levels'} deep` : ''}${originDate ? ` · started ${originDate}` : ''}`}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {onToggleFullscreen && (
                <button
                  onClick={onToggleFullscreen}
                  className="p-1.5 rounded-lg hover:bg-white/10"
                  style={{ color: 'rgb(var(--color-text-secondary))' }}
                  title={fullscreen ? 'Exit full screen' : 'Full screen'}
                  aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
                >
                  {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/10"
                style={{ color: 'rgb(var(--color-text-secondary))' }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {tree && <TopicsStrip topics={topics} onJump={onSelect} isMobile={false} activeId={selectedId} />}
        {synthBar}

        <div className="flex-1 relative overflow-hidden">{graph}</div>
      </div>
    </>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ isMobile }: { isMobile: boolean }) {
  // A faint "ghost" constellation: an origin fanning into branches and one deeper
  // node — so a new user *sees* what the map will become before they have any drifts.
  const ghost = [
    { x: 52, y: 90, r: 13, gi: 0 },   // origin
    { x: 158, y: 52, r: 9, gi: 1 },   // child
    { x: 158, y: 128, r: 9, gi: 1 },  // child
    { x: 256, y: 110, r: 7, gi: 2 },  // grandchild
  ]
  const ghostEdges = [
    { a: 0, b: 1, ws: 9, we: 2.5 },
    { a: 0, b: 2, ws: 12, we: 2.5 },
    { a: 2, b: 3, ws: 7, we: 2 },
  ]
  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 px-10 text-center relative">
      <div className="dkg-ambient" aria-hidden />

      <svg
        className="dkg-ghost"
        viewBox="0 0 300 180"
        aria-hidden
        style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -62%)', width: 'min(82%, 360px)', opacity: 0.5, pointerEvents: 'none' }}
      >
        <defs>
          {HUES.slice(0, 3).map((h, i) => (
            <radialGradient key={i} id={`dkg-ghost-${i}`} cx="38%" cy="34%" r="72%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
              <stop offset="40%" stopColor={h.core} stopOpacity="0.55" />
              <stop offset="100%" stopColor={h.rim} stopOpacity="0.18" />
            </radialGradient>
          ))}
        </defs>
        {ghostEdges.map((e, i) => (
          <path
            key={i}
            d={ribbonPath(ghost[e.a].x, ghost[e.a].y, ghost[e.b].x, ghost[e.b].y, e.ws, e.we)}
            fill={hueAt(ghost[e.a].gi).halo}
            opacity={0.22}
          />
        ))}
        {ghost.map((g, i) => (
          <circle
            key={i}
            cx={g.x} cy={g.y} r={g.r}
            fill={`url(#dkg-ghost-${Math.min(g.gi, 2)})`}
            className="dkg-ghost-orb"
            style={{ animationDelay: `${i * 0.5}s`, transformOrigin: `${g.x}px ${g.y}px` }}
          />
        ))}
      </svg>

      <div
        className="dkg-empty-orb flex items-center justify-center rounded-full relative"
        style={{ width: isMobile ? 84 : 64, height: isMobile ? 84 : 64, zIndex: 1 }}
      >
        <span style={{ fontSize: isMobile ? 30 : 24, color: '#fff', position: 'relative', zIndex: 1 }}>↗</span>
      </div>
      <div className="relative" style={{ zIndex: 1 }}>
        <p className="font-semibold mb-1.5" style={{ fontSize: isMobile ? 16 : 13, color: 'rgb(var(--color-text-primary))' }}>
          No drifts yet
        </p>
        <p className="leading-relaxed" style={{ fontSize: isMobile ? 14 : 11, color: 'rgb(var(--color-text-muted))' }}>
          Select any text in an AI response and tap{' '}
          <span style={{ color: '#c084fc', fontWeight: 600 }}>Drift</span>{' '}
          to open a focused branch. Each branch becomes a glowing node on your map —
          fanning out from this conversation like the ghosted shape above.
        </p>
      </div>
    </div>
  )
}

// ── Scoped styles (local CSS-in-JS — does not touch global tokens) ────────────────

function StyleBlock() {
  return (
    <style>{`
      /* The sheet: a calm, deep navy-violet space (refined — not a busy nebula) */
      .dkg-sheet {
        background:
          radial-gradient(130% 90% at 50% -20%, rgba(99,82,180,0.12), transparent 62%),
          radial-gradient(90% 70% at 85% 115%, rgba(34,211,238,0.06), transparent 60%),
          rgb(var(--color-surface));
        box-shadow: 0 -6px 40px rgba(0,0,0,0.4) inset;
      }
      :root:not(.dark) .dkg-sheet {
        background:
          radial-gradient(120% 80% at 50% -10%, rgba(124,58,237,0.06), transparent 60%),
          rgb(var(--color-surface));
      }

      /* Canvas backdrop — a quiet deep with one soft current of light */
      .dkg-canvas { background: transparent; }
      .dkg-ambient {
        position: absolute; inset: 0; pointer-events: none;
        background:
          radial-gradient(55% 50% at 32% 30%, rgba(124,58,237,0.10), transparent 72%),
          radial-gradient(50% 45% at 78% 78%, rgba(34,211,238,0.06), transparent 72%);
      }

      /* ── Node cards — the legible hero; luminosity is an accent, not the whole node ── */
      .dkg-card {
        box-sizing: border-box;
        display: flex; flex-direction: column; justify-content: center;
        padding: 13px 15px;
        border-radius: 16px;
        font-family: Inter, system-ui, sans-serif;
        background: linear-gradient(180deg, rgba(28,27,42,0.82), rgba(17,16,27,0.86));
        border: 1px solid color-mix(in srgb, var(--hue-halo) 28%, transparent);
        box-shadow:
          0 6px 22px rgba(0,0,0,0.42),
          0 0 22px color-mix(in srgb, var(--hue-halo) 12%, transparent),
          inset 0 1px 0 rgba(255,255,255,0.05);
        backdrop-filter: blur(14px) saturate(1.15);
        -webkit-backdrop-filter: blur(14px) saturate(1.15);
        cursor: pointer;
        transition: transform 0.16s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s ease, border-color 0.2s ease, opacity 0.3s ease;
        will-change: transform;
      }
      .dkg-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 30px rgba(0,0,0,0.5), 0 0 28px color-mix(in srgb, var(--hue-halo) 22%, transparent);
      }
      .dkg-card.is-focused {
        border-color: color-mix(in srgb, var(--hue-core) 72%, transparent);
        box-shadow:
          0 14px 36px rgba(0,0,0,0.55),
          0 0 0 1px color-mix(in srgb, var(--hue-core) 55%, transparent),
          0 0 34px color-mix(in srgb, var(--hue-halo) 34%, transparent);
      }
      .dkg-card-root {
        background: linear-gradient(180deg, rgba(42,33,62,0.9), rgba(22,18,34,0.9));
        border-color: color-mix(in srgb, var(--hue-core) 44%, transparent);
      }
      /* the term that initiated the drift — a tinted pill, the card's subject */
      .dkg-card-term {
        align-self: flex-start; max-width: 100%;
        margin-bottom: 5px; padding: 2px 9px; border-radius: 999px;
        font-size: 10.5px; font-weight: 700; line-height: 15px;
        color: color-mix(in srgb, var(--hue-core) 90%, white);
        background: color-mix(in srgb, var(--hue-halo) 16%, transparent);
        border: 1px solid color-mix(in srgb, var(--hue-halo) 38%, transparent);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .dkg-card-title {
        font-size: 14.5px; font-weight: 650; line-height: 20px; color: #fff;
        display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3;
        overflow: hidden; overflow-wrap: anywhere;
      }
      .dkg-card-root .dkg-card-title { font-size: 15.5px; }
      .dkg-card-gist {
        margin-top: 6px;
        font-size: 12px; line-height: 17px; color: rgba(255,255,255,0.6);
        display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
        overflow: hidden; overflow-wrap: anywhere;
      }
      .dkg-card-meta {
        margin-top: 7px; display: flex; align-items: center; gap: 6px;
        font-size: 10.5px; font-weight: 600; color: rgba(255,255,255,0.42);
      }
      .dkg-card-eyebrow {
        text-transform: uppercase; letter-spacing: 0.08em;
        color: color-mix(in srgb, var(--hue-core) 88%, white);
        opacity: 0.9;
      }
      .dkg-card-orb {
        flex: 0 0 auto; width: 8px; height: 8px; border-radius: 999px;
        background: radial-gradient(circle at 35% 30%, #fff, var(--hue-core) 45%, var(--hue-rim) 100%);
        box-shadow: 0 0 9px color-mix(in srgb, var(--hue-halo) 75%, transparent);
      }
      .dkg-card-root .dkg-card-orb { width: 9px; height: 9px; }
      .dkg-card.is-alive::after {
        content: ''; position: absolute; inset: -1px; border-radius: 17px; pointer-events: none;
        border: 1px solid color-mix(in srgb, var(--hue-core) 55%, transparent);
        animation: dkgCardAlive 2.8s ease-in-out infinite;
      }
      /* Transient highlight ring — fires when a chip / keyboard select lands here. */
      .dkg-card-pulse {
        position: absolute; inset: -2px; border-radius: 18px; pointer-events: none;
        border: 2px solid color-mix(in srgb, var(--hue-core) 75%, transparent);
        animation: dkgCardPulse 1.1s cubic-bezier(0.16,1,0.3,1) forwards;
      }
      @keyframes dkgCardPulse {
        0%   { opacity: 0.95; transform: scale(1); }
        70%  { opacity: 0.5; }
        100% { opacity: 0; transform: scale(1.07); }
      }

      /* ── Light theme: the map becomes a bright, airy space — cards turn light with
            dark text, accents shift to the deeper rim hue for contrast on white. ── */
      :root:not(.dark) .dkg-card {
        background: linear-gradient(180deg, rgba(255,255,255,0.97), rgba(248,247,252,0.98));
        border-color: color-mix(in srgb, var(--hue-rim) 32%, transparent);
        box-shadow:
          0 6px 20px rgba(40,30,80,0.10),
          0 0 18px color-mix(in srgb, var(--hue-halo) 14%, transparent),
          inset 0 1px 0 rgba(255,255,255,0.7);
      }
      :root:not(.dark) .dkg-card:hover {
        box-shadow: 0 12px 28px rgba(40,30,80,0.16), 0 0 26px color-mix(in srgb, var(--hue-halo) 24%, transparent);
      }
      :root:not(.dark) .dkg-card.is-focused {
        border-color: color-mix(in srgb, var(--hue-rim) 62%, transparent);
        box-shadow:
          0 14px 32px rgba(40,30,80,0.18),
          0 0 0 1px color-mix(in srgb, var(--hue-rim) 55%, transparent),
          0 0 30px color-mix(in srgb, var(--hue-halo) 28%, transparent);
      }
      :root:not(.dark) .dkg-card-root {
        background: linear-gradient(180deg, rgba(250,248,255,0.98), rgba(242,238,251,0.98));
        border-color: color-mix(in srgb, var(--hue-rim) 48%, transparent);
      }
      :root:not(.dark) .dkg-card-title { color: rgb(var(--color-text-primary)); }
      :root:not(.dark) .dkg-card-gist  { color: rgb(var(--color-text-secondary)); }
      :root:not(.dark) .dkg-card-meta  { color: rgb(var(--color-text-muted)); }
      :root:not(.dark) .dkg-card-eyebrow { color: color-mix(in srgb, var(--hue-rim) 82%, black); opacity: 1; }
      :root:not(.dark) .dkg-card-term {
        color: color-mix(in srgb, var(--hue-rim) 80%, black);
        background: color-mix(in srgb, var(--hue-halo) 14%, white);
        border-color: color-mix(in srgb, var(--hue-rim) 30%, transparent);
      }

      .dkg-fit {
        background: transparent;
        border: 1px solid rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.4);
      }
      .dkg-fit:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.85); }

      .dkg-search {
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 999px;
        padding: 0 12px;
        backdrop-filter: blur(8px);
      }
      .dkg-search:focus-within { border-color: rgba(168,85,247,0.5); background: rgba(255,255,255,0.1); }
      .dkg-search input::placeholder { color: rgba(255,255,255,0.4); }

      /* Light theme: dark-tinted glass pills with dark icons (the canvas is bright). */
      :root:not(.dark) .dkg-search {
        background: rgba(28,22,55,0.04);
        border-color: rgba(28,22,55,0.1);
      }
      :root:not(.dark) .dkg-fit {
        background: transparent;
        border-color: rgba(28,22,55,0.09);
        color: rgb(var(--color-text-muted));
      }
      :root:not(.dark) .dkg-fit:hover { background: rgba(28,22,55,0.06); color: rgb(var(--color-text-secondary)); }
      :root:not(.dark) .dkg-search:focus-within { background: rgba(28,22,55,0.04); border-color: rgba(168,85,247,0.5); }
      :root:not(.dark) .dkg-search input::placeholder { color: rgb(var(--color-text-muted)); }

      /* Detail card — glass over the void */
      .dkg-detail-inner {
        background: linear-gradient(180deg, rgba(30,28,46,0.92), rgba(18,16,28,0.94));
        border: 1px solid var(--hue-halo, #a855f7);
        border-color: color-mix(in srgb, var(--hue-halo, #a855f7) 45%, transparent);
        box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 28px color-mix(in srgb, var(--hue-halo, #a855f7) 22%, transparent);
        backdrop-filter: blur(16px) saturate(1.2);
        animation: dkgCardIn 0.34s cubic-bezier(0.16,1,0.3,1);
      }
      :root:not(.dark) .dkg-detail-inner {
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,246,255,0.97));
      }
      .dkg-detail-inner .font-semibold { color: #fff; }
      :root:not(.dark) .dkg-detail-inner .font-semibold,
      :root:not(.dark) .dkg-detail-inner .leading-relaxed { color: rgb(var(--color-text-primary)) !important; }

      .dkg-open-btn {
        color: #fff;
        background: linear-gradient(135deg, var(--hue-halo, #a855f7), var(--hue-rim, #7c3aed));
        box-shadow: 0 4px 16px color-mix(in srgb, var(--hue-halo, #a855f7) 40%, transparent);
        border: none;
      }
      .dkg-open-btn:hover { filter: brightness(1.08); }

      /* Explored chips — calm by default: neutral text + a hairline border and only
         a whisper of the per-lens hue. The hue comes forward only on the active chip
         (and a touch on hover), so the bar reads quiet, not like a row of neon. */
      .dkg-chip {
        color: rgb(var(--color-text-secondary));
        background: color-mix(in srgb, var(--chip-halo) 6%, transparent);
        border: 1px solid rgb(var(--color-border));
      }
      .dkg-chip[data-active] {
        color: #fff;
        background: color-mix(in srgb, var(--chip-halo) 28%, transparent);
        border-color: color-mix(in srgb, var(--chip-core) 55%, transparent);
      }
      :root:not(.dark) .dkg-chip {
        color: rgb(var(--color-text-secondary));
        background: color-mix(in srgb, var(--chip-halo) 6%, white);
        border-color: rgb(var(--color-border));
      }
      :root:not(.dark) .dkg-chip[data-active] {
        color: #fff;
        background: var(--chip-rim);
        border-color: var(--chip-rim);
      }
      .dkg-chip:hover {
        color: rgb(var(--color-text-primary));
        border-color: color-mix(in srgb, var(--chip-core) 45%, transparent);
      }

      .dkg-empty-orb {
        background: radial-gradient(circle at 38% 34%, #ffffff, #c084fc 30%, #7c3aed 80%);
        box-shadow: 0 0 40px rgba(168,85,247,0.45), inset 0 0 14px rgba(255,255,255,0.4);
        animation: dkgBreathe 4s ease-in-out infinite;
      }
      .dkg-ghost-orb { animation: dkgGhost 5s ease-in-out infinite; }
      @keyframes dkgGhost {
        0%, 100% { opacity: 0.55; transform: scale(1); }
        50%      { opacity: 0.9; transform: scale(1.06); }
      }

      /* ── Keyframes (gated by media query below for reduced motion) ── */
      @keyframes dkgCardRise {
        from { opacity: 0; transform: translateY(10px) scale(0.965); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes dkgCardAlive {
        0%, 100% { opacity: 0; }
        50%      { opacity: 0.6; }
      }
      @keyframes dkgCardIn {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .dkg-flow {
        stroke-dasharray: 6 240;
        opacity: 0.7;
        animation: dkgFlow 3.8s linear infinite;
        filter: drop-shadow(0 0 2px currentColor);
      }
      @keyframes dkgFlow {
        from { stroke-dashoffset: 246; }
        to   { stroke-dashoffset: 0; }
      }

      @media (prefers-reduced-motion: reduce) {
        .dkg-flow, .dkg-card, .dkg-card.is-alive::after, .dkg-empty-orb,
        .dkg-ghost-orb, .dkg-detail-inner { animation: none !important; }
      }
    `}</style>
  )
}
