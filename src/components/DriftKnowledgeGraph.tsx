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
import { X, GitBranch, Maximize2, Sparkles, Loader2 } from 'lucide-react'
import { haptics } from '@/lib/haptics'

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
}

interface TreeNode {
  chat: ChatSession
  phrase: string | undefined
  children: TreeNode[]
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
    return { chat, phrase, children: (childrenMap.get(id) ?? []).map(c => build(c.id, c.metadata?.selectedText)).filter(Boolean) as TreeNode[] }
  }
  return build(rootId, undefined)
}

function lastAiPreview(chat: ChatSession): string | undefined {
  const last = [...chat.messages].reverse().find(m => !m.isUser)
  if (!last?.text) return undefined
  const clean = last.text.replace(/[#*`[\]\n]/g, ' ').replace(/\s+/g, ' ').trim()
  return clean.length > 120 ? clean.slice(0, 120) + '…' : clean
}

function totalMessages(node: TreeNode): number {
  return node.chat.messages.length + node.children.reduce((s, c) => s + totalMessages(c), 0)
}

function collectTopics(node: TreeNode): { phrase: string; chatId: string }[] {
  const here = node.phrase ? [{ phrase: node.phrase, chatId: node.chat.id }] : []
  return [...here, ...node.children.flatMap(collectTopics)]
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
  x: number
  y: number
  parent: Laid | null
  index: number     // sibling index for staggered entrance
  leafCount: number
}

const COL = 168   // horizontal distance between depths
const ROW = 96    // vertical distance between leaves
const PAD_X = 96  // left/right breathing room
const PAD_Y = 70  // top/bottom breathing room

function countLeaves(node: TreeNode): number {
  if (!node.children.length) return 1
  return node.children.reduce((s, c) => s + countLeaves(c), 0)
}

function layoutTree(root: TreeNode): { nodes: Laid[]; width: number; height: number } {
  const nodes: Laid[] = []
  let order = 0
  let maxDepth = 0

  // Recursively place: y is the vertical center of the band this subtree occupies.
  function place(node: TreeNode, depth: number, bandTop: number, parent: Laid | null): Laid {
    maxDepth = Math.max(maxDepth, depth)
    const leaves = countLeaves(node)
    const bandHeight = leaves * ROW
    const y = bandTop + bandHeight / 2
    const laid: Laid = {
      node, depth, x: PAD_X + depth * COL, y: PAD_Y + y,
      parent, index: order++, leafCount: leaves,
    }
    nodes.push(laid)
    let childTop = bandTop
    node.children.forEach((child) => {
      const childLeaves = countLeaves(child)
      place(child, depth + 1, childTop, laid)
      childTop += childLeaves * ROW
    })
    return laid
  }

  place(root, 0, 0, null)
  const totalLeaves = countLeaves(root)
  const width = PAD_X * 2 + maxDepth * COL + 30
  const height = PAD_Y * 2 + totalLeaves * ROW
  return { nodes, width, height }
}

/** Organic S-curve between two points (horizontal-flowing bézier). */
function flowPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = (x2 - x1) * 0.55
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

// ── Node sizing ───────────────────────────────────────────────────────────────

function nodeRadius(laid: Laid): number {
  // Root largest; size also nudged up by how much conversation lives in the node.
  const base = laid.depth === 0 ? 26 : laid.depth === 1 ? 20 : 17
  const msgs = laid.node.chat.messages.length
  return base + Math.min(msgs, 8) * 0.7
}

// ── The living graph (SVG) ───────────────────────────────────────────────────────

function GraphCanvas({
  root, activeChatId, onSwitchChat, onOpenDrift, isMobile, onSelect, selectedId,
}: {
  root: TreeNode
  activeChatId: string | null
  onSwitchChat: (id: string) => void
  onOpenDrift?: (chat: ChatSession) => void
  isMobile: boolean
  onSelect: (id: string) => void
  selectedId: string | null
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
    const s = Math.min(cw / width, ch / height, 1.15)
    setView({
      scale: s,
      x: (cw - width * s) / 2,
      y: (ch - height * s) / 2,
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

  const handleActivate = (laid: Laid) => {
    if (drag.current?.moved) return
    const id = laid.node.chat.id
    if (id === ALL_ROOT_ID) return  // synthetic global root — not navigable
    haptics.selection()
    onSelect(id)
    // A drift opens in the focused panel; a full conversation switches the chat.
    if (laid.node.chat.metadata?.isDrift && onOpenDrift) onOpenDrift(laid.node.chat)
    else onSwitchChat(id)
  }

  // Background drifting motes — decorative, gated on reduced-motion.
  const motes = useMemo(() => {
    if (reduce) return []
    return Array.from({ length: 14 }).map((_, i) => ({
      id: i,
      cx: (i * 137.5) % 100,
      cy: (i * 71.3) % 100,
      r: 0.6 + (i % 3) * 0.5,
      delay: (i % 7) * 1.3,
      dur: 14 + (i % 5) * 4,
    }))
  }, [reduce])

  return (
    <div
      ref={wrapRef}
      className="dkg-canvas relative w-full h-full overflow-hidden touch-none select-none"
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
      {/* Ambient depth gradient + drifting motes behind everything */}
      <div className="dkg-ambient" aria-hidden />
      {!reduce && (
        <svg className="dkg-motes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {motes.map(m => (
            <circle
              key={m.id}
              cx={m.cx} cy={m.cy} r={m.r}
              fill="rgba(168,140,255,0.5)"
              style={{ animation: `dkgMote ${m.dur}s ease-in-out ${m.delay}s infinite` }}
            />
          ))}
        </svg>
      )}

      {/* Refit control */}
      <button
        onClick={(e) => { e.stopPropagation(); fit() }}
        className="dkg-fit absolute z-20 flex items-center justify-center rounded-full active:scale-90"
        style={{ top: 10, right: 10, width: 32, height: 32 }}
        title="Recenter"
        aria-label="Recenter map"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>

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
          {/* One radial gradient per hue — bright core fading to transparent halo */}
          {HUES.map((h, i) => (
            <radialGradient key={`g${i}`} id={`dkg-core-${i}`} cx="38%" cy="34%" r="72%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="22%" stopColor={h.core} stopOpacity="0.98" />
              <stop offset="68%" stopColor={h.halo} stopOpacity="0.92" />
              <stop offset="100%" stopColor={h.rim} stopOpacity="0.78" />
            </radialGradient>
          ))}
          {/* Flowing connector gradients (parent hue → child hue) */}
          {HUES.map((h, i) => {
            const next = hueAt(i + 1)
            return (
              <linearGradient key={`l${i}`} id={`dkg-link-${i}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={h.halo} stopOpacity="0.55" />
                <stop offset="100%" stopColor={next.halo} stopOpacity="0.42" />
              </linearGradient>
            )
          })}
          {/* Soft outer glow */}
          <filter id="dkg-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Depth-of-field blur for deep/unselected nodes */}
          <filter id="dkg-haze" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.1" />
          </filter>
        </defs>

        {/* Connectors first (under nodes) */}
        <g>
          {nodes.map(laid => {
            if (!laid.parent) return null
            const p = laid.parent
            const path = flowPath(p.x, p.y, laid.x, laid.y)
            const onActivePath =
              selectedId === laid.node.chat.id ||
              activeChatId === laid.node.chat.id ||
              selectedId === p.node.chat.id
            return (
              <g key={`edge-${laid.node.chat.id}`}>
                {/* base river */}
                <path
                  d={path}
                  fill="none"
                  stroke={`url(#dkg-link-${Math.min(p.depth, HUES.length - 1)})`}
                  strokeWidth={onActivePath ? 2.6 : 1.6}
                  strokeLinecap="round"
                  opacity={onActivePath ? 0.95 : 0.5}
                />
                {/* flowing pulse of light along the river */}
                {!reduce && (
                  <path
                    d={path}
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

        {/* Nodes */}
        <g>
          {nodes.map(laid => {
            const id = laid.node.chat.id
            const h = hueAt(laid.depth)
            const r = nodeRadius(laid)
            const isActive = id === activeChatId
            const isSelected = id === selectedId
            const focused = isActive || isSelected
            const gi = Math.min(laid.depth, HUES.length - 1)
            const phrase = laid.node.phrase ?? laid.node.chat.title ?? 'Untitled'
            const label = phrase.length > 22 ? phrase.slice(0, 22) + '…' : phrase
            const depthDim = laid.depth >= 2 && !focused

            return (
              <g
                key={id}
                className="dkg-node"
                style={{
                  cursor: 'pointer',
                  animation: reduce ? undefined : `dkgRise 0.6s cubic-bezier(0.16,1,0.3,1) ${0.05 + laid.index * 0.05}s both`,
                }}
                onPointerUp={(e) => { e.stopPropagation(); handleActivate(laid) }}
              >
                {/* wide ambient halo */}
                <circle
                  cx={laid.x} cy={laid.y} r={r * (focused ? 2.5 : 1.95)}
                  fill={h.halo}
                  opacity={focused ? 0.22 : depthDim ? 0.07 : 0.12}
                  style={{ filter: 'blur(7px)' }}
                  className={focused && !reduce ? 'dkg-breathe' : undefined}
                />
                {/* breathing aura ring for the active/selected node */}
                {focused && (
                  <circle
                    cx={laid.x} cy={laid.y} r={r + 6}
                    fill="none"
                    stroke={h.core}
                    strokeWidth={1.5}
                    opacity={0.7}
                    className={reduce ? undefined : 'dkg-ring'}
                  />
                )}
                {/* the glowing orb itself */}
                <circle
                  cx={laid.x} cy={laid.y} r={r}
                  fill={`url(#dkg-core-${gi})`}
                  filter={depthDim ? 'url(#dkg-haze)' : 'url(#dkg-glow)'}
                  opacity={depthDim ? 0.82 : 1}
                  stroke={focused ? '#ffffff' : h.rim}
                  strokeWidth={focused ? 1.2 : 0.6}
                  strokeOpacity={focused ? 0.85 : 0.4}
                />
                {/* inner specular highlight — the "light inside" */}
                <circle
                  cx={laid.x - r * 0.28} cy={laid.y - r * 0.32} r={r * 0.34}
                  fill="#ffffff" opacity={depthDim ? 0.3 : 0.6}
                  style={{ filter: 'blur(1.5px)' }}
                />
                {/* root crown */}
                {laid.depth === 0 && (
                  <circle
                    cx={laid.x} cy={laid.y} r={r + 11}
                    fill="none" stroke={h.core} strokeWidth={0.8}
                    strokeDasharray="2 5" opacity={0.5}
                    className={reduce ? undefined : 'dkg-spin'}
                    style={{ transformOrigin: `${laid.x}px ${laid.y}px` }}
                  />
                )}

                {/* label */}
                <text
                  x={laid.x}
                  y={laid.y + r + (isMobile ? 15 : 16)}
                  textAnchor="middle"
                  className="dkg-label"
                  style={{
                    fontSize: laid.depth === 0 ? 12 : 11,
                    fontWeight: focused ? 700 : 600,
                    fill: focused ? '#ffffff' : h.core,
                    opacity: depthDim ? 0.6 : focused ? 1 : 0.92,
                  }}
                >
                  {label}
                </text>
                {/* depth-0 sublabel: message count */}
                <text
                  x={laid.x}
                  y={laid.y + r + (isMobile ? 28 : 30)}
                  textAnchor="middle"
                  className="dkg-sublabel"
                  style={{
                    fontSize: 9,
                    fill: h.halo,
                    opacity: depthDim ? 0.4 : 0.7,
                  }}
                >
                  {laid.node.chat.messages.length} {laid.node.chat.messages.length === 1 ? 'msg' : 'msgs'}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Selected node detail card — floats over the map */}
      {selectedId && byId.has(selectedId) && (
        <DetailCard
          laid={byId.get(selectedId)!}
          isMobile={isMobile}
          onOpen={() => handleActivate(byId.get(selectedId)!)}
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
  const title = laid.node.chat.metadata?.selectedText || laid.node.chat.title || 'Untitled'
  const preview = lastAiPreview(laid.node.chat)
  const ts = laid.node.chat.createdAt ? timeAgo(laid.node.chat.createdAt) : null
  const msgs = laid.node.chat.messages.length

  return (
    <div
      className="dkg-detail absolute z-30 left-1/2 -translate-x-1/2"
      style={{ bottom: isMobile ? 14 : 16, width: isMobile ? 'calc(100% - 24px)' : 340 }}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
    >
      <div
        className="dkg-detail-inner rounded-2xl overflow-hidden"
        style={{ ['--hue-core' as string]: h.core, ['--hue-halo' as string]: h.halo, ['--hue-rim' as string]: h.rim }}
      >
        <div className="px-4 pt-3 pb-3.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: h.core }}
            >
              {isDrift ? '↗ Drift' : 'Origin'}
            </span>
            <button
              onClick={onDismiss}
              className="flex items-center justify-center rounded-full active:scale-90"
              style={{ width: 22, height: 22, color: 'rgb(var(--color-text-muted))', background: 'rgba(255,255,255,0.06)' }}
              aria-label="Deselect"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div
            className="font-semibold leading-snug mb-1"
            style={{
              fontSize: 14, color: '#fff',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            } as React.CSSProperties}
          >
            {title}
          </div>
          {preview && (
            <div
              className="leading-relaxed mb-3"
              style={{
                fontSize: 11.5, color: 'rgba(255,255,255,0.6)',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
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
            <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
  topics, onJump, isMobile,
}: { topics: { phrase: string; chatId: string }[]; onJump: (id: string) => void; isMobile: boolean }) {
  if (!topics.length) return null
  return (
    <div
      className="flex-shrink-0 flex items-center gap-0"
      style={{ borderBottom: '1px solid rgb(var(--color-border))' }}
    >
      <div
        className="flex-shrink-0 px-3 py-2 text-[9px] font-bold uppercase tracking-widest"
        style={{ color: 'rgb(var(--color-text-muted))' }}
      >
        Explored
      </div>
      <div
        className="flex-1 overflow-x-auto py-2 pr-3 [&::-webkit-scrollbar]:hidden"
        style={{
          display: 'flex', flexWrap: 'nowrap', gap: 6,
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        {topics.map(({ phrase, chatId }, i) => {
          const h = hueAt((i % (HUES.length - 1)) + 1)
          return (
            <button
              key={chatId}
              onClick={() => onJump(chatId)}
              className="dkg-chip flex-shrink-0 font-medium rounded-full active:scale-95"
              style={{
                fontSize: 11, padding: '3px 10px',
                background: `${h.halo}1f`,
                border: `1px solid ${h.halo}40`,
                color: h.core,
                minHeight: isMobile ? 26 : 24,
                boxShadow: `0 0 10px ${h.halo}22`,
              }}
            >
              {phrase.length > 20 ? phrase.slice(0, 20) + '…' : phrase}
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
  onSynthesize, synthesizing,
}: Props) {
  const isMobile = useIsMobile()

  // Scope: just this conversation's tree, or a constellation of everything.
  const [scope, setScope] = useState<'chat' | 'all'>('chat')

  // How many distinct top-level conversations exist (gates the "All" toggle).
  const conversationCount = useMemo(
    () => chatHistory.filter(c => !c.metadata?.isDrift && !c.metadata?.parentChatId && (c.messages.length > 0)).length,
    [chatHistory],
  )

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

  // Selected node in the map (drives the floating detail card).
  const [selectedId, setSelectedId] = useState<string | null>(activeChatId)
  useEffect(() => { setSelectedId(activeChatId) }, [activeChatId])
  const onSelect = useCallback((id: string) => setSelectedId(id || null), [])

  // A small segmented control shared by both layouts.
  const scopeToggle = conversationCount > 1 ? (
    <div className="inline-flex items-center rounded-full p-0.5 bg-white/[0.05] border border-white/[0.08]">
      {(['chat', 'all'] as const).map(s => (
        <button
          key={s}
          onClick={() => { haptics.selection(); setScope(s) }}
          className={`px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide transition-colors ${
            scope === s ? 'bg-accent-violet/30 text-white' : 'text-white/45 hover:text-white/70'
          }`}
        >
          {s === 'chat' ? 'This chat' : 'All'}
        </button>
      ))}
    </div>
  ) : null

  // "Bring it home" — synthesize the current conversation's drifts. Chat scope only.
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

  const { panelRef, onTouchStart, onTouchMove, onTouchEnd } = useDragClose(onClose, isMobile)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const graph = tree ? (
    <GraphCanvas
      root={tree}
      activeChatId={activeChatId}
      onSwitchChat={isMobile ? (id => { onSwitchChat(id); onClose() }) : onSwitchChat}
      onOpenDrift={onOpenDrift ? (chat => { onOpenDrift(chat); if (isMobile) onClose() }) : undefined}
      isMobile={isMobile}
      onSelect={onSelect}
      selectedId={selectedId}
    />
  ) : (
    <EmptyState isMobile={isMobile} />
  )

  // ── Mobile: full-screen bottom sheet ──
  if (isMobile) {
    return (
      <>
        <StyleBlock />
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
          onClick={onClose}
        />
        <div
          ref={panelRef}
          className="dkg-sheet fixed left-0 right-0 bottom-0 z-50 flex flex-col"
          style={{
            height: '88dvh',
            borderRadius: '18px 18px 0 0',
            transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          {/* Drag handle */}
          <div
            className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab active:cursor-grabbing"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <div className="rounded-full" style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.25)' }} />
          </div>

          {/* Header */}
          <div className="px-4 pt-1.5 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid rgb(var(--color-border))' }}>
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
                  style={{ color: '#fff', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}
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
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {scope === 'all' ? `· ${rootCount} ${rootCount === 1 ? 'chat' : 'chats'}` : `· ${msgTotal} msgs`}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {scopeToggle}
                <button
                  onClick={onClose}
                  className="flex items-center justify-center rounded-full active:scale-90"
                  style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}
                  aria-label="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {tree && <TopicsStrip topics={topics} onJump={onSwitchChat} isMobile />}
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
        style={{ width: 'min(520px, 46vw)', borderLeft: '1px solid rgb(var(--color-border))' }}
      >
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
                style={{ color: '#fff', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}
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
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {scope === 'all' ? `· ${rootCount} ${rootCount === 1 ? 'conversation' : 'conversations'}` : `· ${msgTotal} messages`}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {scopeToggle}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg"
                style={{ color: 'rgba(255,255,255,0.6)' }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {tree && <TopicsStrip topics={topics} onJump={onSwitchChat} isMobile={false} />}
        {synthBar}

        <div className="flex-1 relative overflow-hidden">{graph}</div>
      </div>
    </>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ isMobile }: { isMobile: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 px-10 text-center relative">
      <div className="dkg-ambient" aria-hidden />
      <div
        className="dkg-empty-orb flex items-center justify-center rounded-full relative"
        style={{ width: isMobile ? 84 : 64, height: isMobile ? 84 : 64 }}
      >
        <span style={{ fontSize: isMobile ? 30 : 24, color: '#fff', position: 'relative', zIndex: 1 }}>↗</span>
      </div>
      <div className="relative">
        <p className="font-semibold mb-1.5" style={{ fontSize: isMobile ? 16 : 13, color: '#fff' }}>
          No drifts yet
        </p>
        <p className="leading-relaxed" style={{ fontSize: isMobile ? 14 : 11, color: 'rgba(255,255,255,0.55)' }}>
          Select any text in an AI response and tap{' '}
          <span style={{ color: '#c084fc', fontWeight: 600 }}>Drift</span>{' '}
          to open a focused branch. Each branch becomes a glowing node on your map.
        </p>
      </div>
    </div>
  )
}

// ── Scoped styles (local CSS-in-JS — does not touch global tokens) ────────────────

function StyleBlock() {
  return (
    <style>{`
      /* The sheet itself: deep, luminous void rather than flat surface */
      .dkg-sheet {
        background:
          radial-gradient(120% 80% at 50% -10%, rgba(124,58,237,0.16), transparent 60%),
          radial-gradient(90% 60% at 80% 110%, rgba(34,211,238,0.10), transparent 55%),
          rgb(var(--color-surface));
        box-shadow: 0 -6px 40px rgba(0,0,0,0.4), 0 0 80px rgba(124,58,237,0.06) inset;
      }
      :root:not(.dark) .dkg-sheet {
        background:
          radial-gradient(120% 80% at 50% -10%, rgba(124,58,237,0.08), transparent 60%),
          rgb(var(--color-surface));
      }

      /* Canvas backdrop — a starless deep with a faint current of light */
      .dkg-canvas { background: transparent; }
      .dkg-ambient {
        position: absolute; inset: 0; pointer-events: none;
        background:
          radial-gradient(60% 50% at 30% 25%, rgba(124,58,237,0.14), transparent 70%),
          radial-gradient(55% 45% at 75% 80%, rgba(34,211,238,0.10), transparent 70%),
          radial-gradient(40% 35% at 60% 50%, rgba(99,102,241,0.08), transparent 70%);
      }
      .dkg-motes { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0.7; }

      .dkg-label { font-family: Inter, system-ui, sans-serif; pointer-events: none; paint-order: stroke;
        text-shadow: 0 1px 6px rgba(0,0,0,0.6); }
      .dkg-sublabel { font-family: Inter, system-ui, sans-serif; pointer-events: none; }

      .dkg-fit {
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.12);
        color: rgba(255,255,255,0.7);
        backdrop-filter: blur(8px);
      }
      .dkg-fit:hover { background: rgba(255,255,255,0.12); color: #fff; }

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

      .dkg-chip:hover { filter: brightness(1.15); }

      .dkg-empty-orb {
        background: radial-gradient(circle at 38% 34%, #ffffff, #c084fc 30%, #7c3aed 80%);
        box-shadow: 0 0 40px rgba(168,85,247,0.45), inset 0 0 14px rgba(255,255,255,0.4);
        animation: dkgBreathe 4s ease-in-out infinite;
      }

      /* ── Keyframes (gated by media query below for reduced motion) ── */
      @keyframes dkgRise {
        from { opacity: 0; transform: scale(0.6); }
        to   { opacity: 1; transform: scale(1); }
      }
      @keyframes dkgCardIn {
        from { opacity: 0; transform: translate(-50%, 12px); }
        to   { opacity: 1; transform: translate(-50%, 0); }
      }
      .dkg-flow {
        stroke-dasharray: 6 220;
        opacity: 0.85;
        animation: dkgFlow 3.4s linear infinite;
        filter: drop-shadow(0 0 3px currentColor);
      }
      @keyframes dkgFlow {
        from { stroke-dashoffset: 226; }
        to   { stroke-dashoffset: 0; }
      }
      .dkg-breathe { animation: dkgBreathe 4.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
      @keyframes dkgBreathe {
        0%, 100% { transform: scale(1); opacity: var(--o, 0.22); }
        50%      { transform: scale(1.12); opacity: calc(var(--o, 0.22) + 0.08); }
      }
      .dkg-ring { animation: dkgRing 3.2s ease-out infinite; transform-box: fill-box; transform-origin: center; }
      @keyframes dkgRing {
        0%   { transform: scale(0.9); opacity: 0.8; }
        70%  { transform: scale(1.7); opacity: 0; }
        100% { transform: scale(1.7); opacity: 0; }
      }
      .dkg-spin { animation: dkgSpin 28s linear infinite; }
      @keyframes dkgSpin { to { transform: rotate(360deg); } }

      @keyframes dkgMote {
        0%, 100% { transform: translate(0, 0); opacity: 0.2; }
        50%      { transform: translate(2px, -4px); opacity: 0.7; }
      }

      @media (prefers-reduced-motion: reduce) {
        .dkg-flow, .dkg-breathe, .dkg-ring, .dkg-spin, .dkg-empty-orb,
        .dkg-detail-inner, .dkg-node { animation: none !important; }
      }
    `}</style>
  )
}
