/**
 * DriftKnowledgeGraph — mind-map style drift tree.
 * ORIGIN card → Bézier flow connectors → DRIFT branch cards.
 * Hierarchy is visually unambiguous at a glance.
 */
import { useEffect, useState, useCallback } from 'react'
import type { ChatSession, Message } from '@/types/chat'
import { X, ChevronLeft, ChevronDown, MessageSquare } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  chatHistory: ChatSession[]
  activeChatId: string | null
  onClose: () => void
  onSwitchChat: (chatId: string) => void
  onScrollToMessage: (messageId: string) => void
  onOpenDrift?: (chat: ChatSession) => void
  getTempMessages?: (chatId: string) => Message[] | null
}

interface TreeNode {
  chat: ChatSession
  phrase: string | undefined
  children: TreeNode[]
}

// ── Data helpers (unchanged) ───────────────────────────────────────────────────

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
            metadata: {
              isDrift: true,
              parentChatId: parentChat?.id ?? rootId,
              selectedText: driftInfo?.selectedText,
            },
          } as ChatSession
        }
      }
    }
    if (chat) {
      result.push(chat)
      const childIds = new Set<string>()
      allChats.forEach(c => { if (c.metadata?.parentChatId === id) childIds.add(c.id) })
      if (getTempMessages)
        for (const msg of chat.messages)
          if (msg.hasDrift && msg.driftInfos)
            for (const info of msg.driftInfos) childIds.add(info.driftChatId)
      for (const cid of childIds) if (!seen.has(cid)) queue.push(cid)
    }
  }
  return result
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
    return {
      chat, phrase,
      children: (childrenMap.get(id) ?? [])
        .map(c => build(c.id, c.metadata?.selectedText))
        .filter(Boolean) as TreeNode[],
    }
  }
  return build(rootId, undefined)
}

function cardPreview(chat: ChatSession): string | undefined {
  const lastAi = [...chat.messages].reverse().find(m => !m.isUser)
  const text = lastAi?.text
  if (text) {
    const c = text.replace(/[#*`[\]\n]/g, ' ').replace(/\s+/g, ' ').trim()
    return c.length > 110 ? c.slice(0, 110) + '…' : c
  }
  return undefined
}

function totalMessages(node: TreeNode): number {
  return node.chat.messages.length + node.children.reduce((s, c) => s + totalMessages(c), 0)
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Color system ───────────────────────────────────────────────────────────────

interface NodeCol {
  accent: string
  accentDim: string
  glowBright: string
  bg: string
  bgHover: string
  bgActive: string
  border: string
  borderActive: string
  meta: string
  labelBg: string
}

// Root: warm amber/white — the origin
const ROOT_COL: NodeCol = {
  accent:       '#FFD166',
  accentDim:    'rgba(255,209,102,0.45)',
  glowBright:   'rgba(255,209,102,0.5)',
  bg:           'rgba(255,255,255,0.04)',
  bgHover:      'rgba(255,255,255,0.06)',
  bgActive:     'rgba(255,209,102,0.07)',
  border:       'rgba(255,255,255,0.1)',
  borderActive: 'rgba(255,209,102,0.4)',
  meta:         'rgba(255,255,255,0.35)',
  labelBg:      'rgba(255,209,102,0.12)',
}

const BRANCH_COLS: NodeCol[] = [
  // depth 1 — electric blue
  {
    accent:       '#5B9CF6',
    accentDim:    'rgba(91,156,246,0.45)',
    glowBright:   'rgba(91,156,246,0.5)',
    bg:           'rgba(91,156,246,0.05)',
    bgHover:      'rgba(91,156,246,0.08)',
    bgActive:     'rgba(91,156,246,0.1)',
    border:       'rgba(91,156,246,0.18)',
    borderActive: 'rgba(91,156,246,0.45)',
    meta:         'rgba(91,156,246,0.5)',
    labelBg:      'rgba(91,156,246,0.12)',
  },
  // depth 2 — violet
  {
    accent:       '#A78BFA',
    accentDim:    'rgba(167,139,250,0.45)',
    glowBright:   'rgba(167,139,250,0.5)',
    bg:           'rgba(167,139,250,0.05)',
    bgHover:      'rgba(167,139,250,0.08)',
    bgActive:     'rgba(167,139,250,0.1)',
    border:       'rgba(167,139,250,0.18)',
    borderActive: 'rgba(167,139,250,0.45)',
    meta:         'rgba(167,139,250,0.5)',
    labelBg:      'rgba(167,139,250,0.12)',
  },
  // depth 3+ — teal
  {
    accent:       '#34D399',
    accentDim:    'rgba(52,211,153,0.45)',
    glowBright:   'rgba(52,211,153,0.5)',
    bg:           'rgba(52,211,153,0.05)',
    bgHover:      'rgba(52,211,153,0.08)',
    bgActive:     'rgba(52,211,153,0.1)',
    border:       'rgba(52,211,153,0.18)',
    borderActive: 'rgba(52,211,153,0.45)',
    meta:         'rgba(52,211,153,0.5)',
    labelBg:      'rgba(52,211,153,0.12)',
  },
]

function nCol(depth: number): NodeCol {
  return depth === 0 ? ROOT_COL : BRANCH_COLS[Math.min(depth - 1, BRANCH_COLS.length - 1)]
}

// ── CSS ────────────────────────────────────────────────────────────────────────

const INJECTED_CSS = `
  @keyframes dkg-in {
    from { opacity: 0; transform: scale(0.94) translateY(6px); }
    to   { opacity: 1; transform: scale(1)    translateY(0); }
  }
  @keyframes dkg-screen {
    from { opacity: 0; transform: scale(0.985); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes dkg-pulse {
    0%, 100% { opacity: 0.35; }
    50%       { opacity: 0.85; }
  }
  @keyframes dkg-dot {
    0%, 100% { transform: scale(1);    opacity: 1; }
    50%       { transform: scale(1.8); opacity: 0.5; }
  }
  @keyframes dkg-draw {
    from { stroke-dashoffset: 160; opacity: 0; }
    50%  { opacity: 1; }
    to   { stroke-dashoffset: 0; }
  }
  @keyframes dkg-glow {
    0%, 100% { opacity: 0.5; }
    50%       { opacity: 1; }
  }

  .dkg-screen { animation: dkg-screen 0.22s cubic-bezier(.2,0,.0,1) both; }
  .dkg-node   { animation: dkg-in 0.36s cubic-bezier(.34,1.46,.64,1) both; }
  .dkg-pulse  { animation: dkg-pulse 2.5s ease-in-out infinite; }
  .dkg-dot    { animation: dkg-dot 2.2s ease-in-out infinite; }
  .dkg-path   { animation: dkg-draw 0.6s ease-out both; stroke-dasharray: 160; }
  .dkg-glow   { animation: dkg-glow 3s ease-in-out infinite; }

  .dkg-card {
    transition: transform .18s cubic-bezier(.34,1.2,.64,1), box-shadow .18s ease, background .18s ease;
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }
  .dkg-card:hover  { transform: scale(1.012); }
  .dkg-card:active { transform: scale(0.975) !important; transition: transform .07s ease !important; }
`

function useCSS() {
  useEffect(() => {
    const id = 'dkg-styles-v5'
    if (document.getElementById(id)) return
    const el = document.createElement('style')
    el.id = id; el.textContent = INJECTED_CSS
    document.head.appendChild(el)
    return () => el.remove()
  }, [])
}

// ── FlowConnector ──────────────────────────────────────────────────────────────
// Draws a junction dot on the rail + a Bézier arc leading into the child card.

function FlowConnector({ color, delay = 0 }: { color: string; delay?: number }) {
  return (
    <svg
      width="38" height="46"
      style={{
        position: 'absolute', left: -38, top: 0,
        overflow: 'visible', pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      {/* Outer glow ring on junction */}
      <circle cx="2" cy="22" r="7.5" fill={color} opacity="0.12" className="dkg-glow" style={{ animationDelay: `${delay}s` }} />
      {/* Junction dot */}
      <circle cx="2" cy="22" r="4.5" fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      {/* Bézier arc: from junction down-then-right to card left edge */}
      <path
        d="M 2 22 C 2 22 18 22 38 22"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeOpacity="0.55"
        strokeLinecap="round"
        strokeDasharray="160"
        className="dkg-path"
        style={{ animationDelay: `${delay}s` }}
      />
      {/* Tiny arrowhead at card entry */}
      <path
        d="M 32 18 L 38 22 L 32 26"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeOpacity="0.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── RootCard ───────────────────────────────────────────────────────────────────

function RootCard({
  node, isActive, onTap, hasChildren, isCollapsed, onToggle, delay,
}: {
  node: TreeNode; isActive: boolean; onTap: () => void
  hasChildren: boolean; isCollapsed: boolean; onToggle: () => void; delay: number
}) {
  const col = ROOT_COL
  const title = node.chat.title || 'Untitled'
  const preview = cardPreview(node.chat)
  const n = node.chat.messages.length
  const ts = node.chat.createdAt ? timeAgo(node.chat.createdAt) : null

  return (
    <button
      className="dkg-card dkg-node"
      onClick={onTap}
      style={{
        animationDelay: `${delay}s`,
        width: '100%', textAlign: 'left', cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
        borderRadius: 20,
        padding: '16px 16px 14px 18px',
        background: isActive ? col.bgActive : col.bg,
        backdropFilter: 'blur(20px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
        boxShadow: isActive
          ? `0 0 0 1.5px ${col.borderActive}, 0 0 40px ${col.glowBright}, 0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)`
          : `0 0 0 1px ${col.border}, 0 4px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)`,
      } as React.CSSProperties}
    >
      {/* Full top gradient shimmer — identifies this as origin */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, rgba(255,209,102,0.7) 0%, rgba(255,209,102,0.35) 50%, rgba(255,255,255,0.1) 100%)',
      }} />

      {/* Collapse toggle */}
      {hasChildren && (
        <button
          onClick={e => { e.stopPropagation(); onToggle() }}
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 26, height: 26, borderRadius: 8, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.07)',
            boxShadow: '0 0 0 0.5px rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          <ChevronDown style={{
            width: 12, height: 12,
            transform: isCollapsed ? 'rotate(-90deg)' : 'none',
            transition: 'transform .22s ease',
          }} />
        </button>
      )}

      {/* "ORIGIN" micro-label */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        marginBottom: 9,
        fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        color: 'rgba(255,209,102,0.7)',
        background: 'rgba(255,209,102,0.1)',
        borderRadius: 5, padding: '2px 7px',
      }}>
        ● Origin conversation
      </div>

      {/* Title */}
      <div style={{
        fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em',
        lineHeight: 1.35, color: 'rgba(255,255,255,0.95)',
        marginBottom: preview ? 9 : 12,
        paddingRight: hasChildren ? 40 : 6,
        display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
      } as React.CSSProperties}>
        {title}
      </div>

      {/* Preview */}
      {preview && (
        <div style={{
          fontSize: 13, lineHeight: 1.65,
          color: 'rgba(255,255,255,0.4)',
          marginBottom: 12,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        } as React.CSSProperties}>
          {preview}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isActive && (
            <div className="dkg-dot" style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: col.accent, boxShadow: `0 0 8px ${col.accent}`,
            }} />
          )}
          <MessageSquare style={{ width: 11, height: 11, color: col.meta }} />
          <span style={{
            fontSize: 12, color: col.meta,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {n} {n === 1 ? 'message' : 'messages'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isCollapsed && hasChildren && (
            <span style={{
              fontSize: 10.5, fontWeight: 600, borderRadius: 20,
              padding: '2px 8px',
              background: 'rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.45)',
              boxShadow: '0 0 0 0.5px rgba(255,255,255,0.1)',
            }}>
              {node.children.length} {node.children.length === 1 ? 'drift' : 'drifts'} hidden
            </span>
          )}
          {ts && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>{ts}</span>}
        </div>
      </div>
    </button>
  )
}

// ── BranchCard ─────────────────────────────────────────────────────────────────

function BranchCard({
  node, depth, isActive, onTap, hasChildren, isCollapsed, onToggle, delay,
}: {
  node: TreeNode; depth: number; isActive: boolean; onTap: () => void
  hasChildren: boolean; isCollapsed: boolean; onToggle: () => void; delay: number
}) {
  const col = nCol(depth)
  const driftText = node.chat.metadata?.selectedText || node.chat.title || 'Untitled'
  const preview = cardPreview(node.chat)
  const isWaiting = !preview
  const n = node.chat.messages.length
  const ts = node.chat.createdAt ? timeAgo(node.chat.createdAt) : null

  return (
    <button
      className="dkg-card dkg-node"
      onClick={onTap}
      style={{
        animationDelay: `${delay}s`,
        width: '100%', textAlign: 'left', cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
        borderRadius: 16,
        padding: '13px 14px 12px 18px',
        background: isActive ? col.bgActive : col.bg,
        backdropFilter: 'blur(20px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
        boxShadow: isActive
          ? `0 0 0 1.5px ${col.borderActive}, 0 0 28px ${col.glowBright}, 0 6px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)`
          : `0 0 0 1px ${col.border}, 0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)`,
      } as React.CSSProperties}
    >
      {/* Left accent bar — colored by depth, this is the "branch" signal */}
      <div style={{
        position: 'absolute', left: 0, top: 10, bottom: 10,
        width: 3, borderRadius: 2,
        background: col.accent,
        boxShadow: `0 0 12px ${col.accent}80, 0 0 4px ${col.accent}`,
        opacity: isActive ? 1 : 0.65,
        transition: 'opacity .2s',
      }} />

      {/* Collapse toggle */}
      {hasChildren && (
        <button
          onClick={e => { e.stopPropagation(); onToggle() }}
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 24, height: 24, borderRadius: 7, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: col.bg,
            boxShadow: `0 0 0 0.5px ${col.border}`,
            color: col.accentDim,
          }}
        >
          <ChevronDown style={{
            width: 11, height: 11,
            transform: isCollapsed ? 'rotate(-90deg)' : 'none',
            transition: 'transform .22s ease',
          }} />
        </button>
      )}

      {/* "DRIFT ↗" micro-label */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        marginBottom: 8,
        fontSize: 9.5, fontWeight: 700, letterSpacing: '0.11em',
        textTransform: 'uppercase' as const,
        color: col.accent,
        background: col.labelBg,
        borderRadius: 5, padding: '2px 7px',
      }}>
        ↗ Drift branch
        {depth > 1 && (
          <span style={{ opacity: 0.6 }}>· depth {depth}</span>
        )}
      </div>

      {/* Drift topic (selected text) — the main identity of this branch */}
      <div style={{
        fontSize: 16, fontWeight: 700, letterSpacing: '-0.018em',
        lineHeight: 1.35, color: 'rgba(255,255,255,0.95)',
        marginBottom: 8,
        paddingRight: hasChildren ? 36 : 4,
        display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
      } as React.CSSProperties}>
        {driftText}
      </div>

      {/* AI response preview / waiting pulse */}
      {isWaiting ? (
        <div className="dkg-pulse" style={{
          fontSize: 12.5, lineHeight: 1.55, fontStyle: 'italic',
          color: col.accentDim, marginBottom: 10,
        }}>
          Waiting for response…
        </div>
      ) : (
        <div style={{
          fontSize: 13, lineHeight: 1.6,
          color: 'rgba(255,255,255,0.38)',
          marginBottom: 10,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        } as React.CSSProperties}>
          {preview}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 9, borderTop: `1px solid rgba(255,255,255,0.06)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isActive && (
            <div className="dkg-dot" style={{
              width: 5.5, height: 5.5, borderRadius: '50%', flexShrink: 0,
              background: col.accent, boxShadow: `0 0 7px ${col.accent}`,
              marginRight: 2,
            }} />
          )}
          <MessageSquare style={{ width: 10, height: 10, color: col.meta }} />
          <span style={{
            fontSize: 11.5, color: 'rgba(255,255,255,0.35)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {n} {n === 1 ? 'msg' : 'msgs'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isCollapsed && hasChildren && (
            <span style={{
              fontSize: 10, fontWeight: 600, borderRadius: 20,
              padding: '2px 7px',
              background: col.labelBg, color: col.accent,
              boxShadow: `0 0 0 0.5px ${col.border}`,
            }}>
              +{node.children.length}
            </span>
          )}
          {ts && <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.22)' }}>{ts}</span>}
        </div>
      </div>
    </button>
  )
}

// ── NodeTree — recursive ───────────────────────────────────────────────────────

function NodeTree({
  node, depth, activeChatId, onSwitchChat, onOpenDrift,
  collapsed, onToggle, delay,
}: {
  node: TreeNode; depth: number; activeChatId: string | null
  onSwitchChat: (id: string) => void
  onOpenDrift?: (chat: ChatSession) => void
  collapsed: Set<string>; onToggle: (id: string) => void
  delay: number
}) {
  const isActive = node.chat.id === activeChatId
  const isCollapsed = collapsed.has(node.chat.id)
  const hasChildren = node.children.length > 0
  const isRoot = depth === 0
  const childCol = nCol(depth + 1)

  const handleTap = () => {
    if (!isRoot && onOpenDrift) onOpenDrift(node.chat)
    else onSwitchChat(node.chat.id)
  }

  return (
    <div>
      {isRoot ? (
        <RootCard
          node={node} isActive={isActive} onTap={handleTap}
          hasChildren={hasChildren} isCollapsed={isCollapsed}
          onToggle={() => onToggle(node.chat.id)} delay={delay}
        />
      ) : (
        <BranchCard
          node={node} depth={depth} isActive={isActive} onTap={handleTap}
          hasChildren={hasChildren} isCollapsed={isCollapsed}
          onToggle={() => onToggle(node.chat.id)} delay={delay}
        />
      )}

      {hasChildren && !isCollapsed && (
        <>
          {/* Vertical stem from card to children */}
          <div style={{ marginLeft: 3, height: 24, position: 'relative' }}>
            <svg width="4" height="24" style={{ overflow: 'visible' }} aria-hidden="true">
              <line
                x1="2" y1="0" x2="2" y2="24"
                stroke={childCol.accent}
                strokeWidth="2"
                strokeOpacity="0.4"
                strokeLinecap="round"
                strokeDasharray="160"
                className="dkg-path"
                style={{ animationDelay: `${delay + 0.08}s` }}
              />
            </svg>
          </div>

          {/* Children with glowing vertical rail */}
          <div style={{ position: 'relative', marginLeft: 3, paddingLeft: 38 }}>
            {/* Glowing rail line */}
            <div style={{
              position: 'absolute',
              left: 1, top: 0, bottom: 16,
              width: 2,
              background: `linear-gradient(to bottom, ${childCol.accent}70 0%, ${childCol.accent}20 85%, transparent 100%)`,
              boxShadow: `0 0 12px 2px ${childCol.accent}25`,
              borderRadius: 2,
            }} />

            {node.children.map((child, i) => (
              <div
                key={child.chat.id}
                style={{ position: 'relative', marginTop: i === 0 ? 0 : 16 }}
              >
                <FlowConnector
                  color={childCol.accent}
                  delay={delay + (i + 1) * 0.07}
                />
                <NodeTree
                  node={child} depth={depth + 1}
                  activeChatId={activeChatId}
                  onSwitchChat={onSwitchChat} onOpenDrift={onOpenDrift}
                  collapsed={collapsed} onToggle={onToggle}
                  delay={delay + (i + 1) * 0.08}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── NavBar ─────────────────────────────────────────────────────────────────────

function NavBar({
  onClose, driftCount, msgTotal, isMobile,
}: {
  onClose: () => void; driftCount: number; msgTotal: number; isMobile: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: isMobile ? '0 14px' : '0 16px',
      height: isMobile ? 56 : 52,
      flexShrink: 0,
      borderBottom: '1px solid rgba(255,255,255,0.055)',
      background: 'rgba(13,13,16,0.8)',
      backdropFilter: 'blur(24px) saturate(1.5)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
    } as React.CSSProperties}>
      <button
        onClick={onClose}
        className="dkg-card"
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          height: 34, paddingLeft: 9, paddingRight: 13,
          borderRadius: 12, cursor: 'pointer',
          background: 'rgba(255,255,255,0.07)',
          boxShadow: '0 0 0 0.5px rgba(255,255,255,0.11)',
          color: 'rgba(255,255,255,0.7)',
        }}
      >
        <ChevronLeft style={{ width: 14, height: 14 }} />
        <span style={{ fontSize: 14, fontWeight: 500 }}>Back</span>
      </button>

      <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700,
          letterSpacing: '0.2em',
          textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.5)',
          marginBottom: 2,
        }}>
          Drift Tree
        </div>
        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.28)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          padding: '0 8px',
        }}>
          {driftCount} {driftCount === 1 ? 'branch' : 'branches'} · {msgTotal} msgs
        </div>
      </div>

      <button
        onClick={onClose}
        className="dkg-card"
        style={{
          width: 34, height: 34, borderRadius: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.07)',
          boxShadow: '0 0 0 0.5px rgba(255,255,255,0.11)',
          color: 'rgba(255,255,255,0.48)',
        }}
      >
        <X style={{ width: 14, height: 14 }} />
      </button>
    </div>
  )
}

// ── EmptyState ─────────────────────────────────────────────────────────────────

function EmptyState({ isMobile }: { isMobile: boolean }) {
  const sz = isMobile ? 72 : 60
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '55vh', padding: '48px 32px', textAlign: 'center', gap: 20,
    }}>
      {/* Tree icon */}
      <div style={{
        width: sz, height: sz, borderRadius: isMobile ? 24 : 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(91,156,246,0.06)',
        boxShadow: '0 0 0 0.5px rgba(91,156,246,0.14), 0 0 40px rgba(91,156,246,0.07)',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="rgba(91,156,246,0.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="4"  r="2" />
          <circle cx="5"  cy="20" r="2" />
          <circle cx="19" cy="20" r="2" />
          <line x1="12" y1="6"  x2="5"  y2="18" />
          <line x1="12" y1="6"  x2="19" y2="18" />
        </svg>
      </div>
      <div>
        <p style={{
          fontSize: isMobile ? 16 : 14.5, fontWeight: 700,
          color: 'rgba(255,255,255,0.72)', marginBottom: 8,
        }}>
          No drifts yet
        </p>
        <p style={{
          fontSize: isMobile ? 14 : 13, lineHeight: 1.75,
          color: 'rgba(255,255,255,0.3)', maxWidth: 260,
        }}>
          Select any text in an AI response and tap{' '}
          <span style={{ color: '#5B9CF6', fontWeight: 600 }}>Drift</span>{' '}
          to branch into a focused exploration. The tree appears here.
        </p>
      </div>
    </div>
  )
}

// ── useIsMobile ────────────────────────────────────────────────────────────────

function useIsMobile() {
  const [v, set] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const h = () => set(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return v
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function DriftKnowledgeGraph({
  chatHistory, activeChatId, onClose, onSwitchChat, onOpenDrift, getTempMessages,
}: Props) {
  useCSS()
  const isMobile = useIsMobile()

  const rootId = activeChatId ? findRootId(activeChatId, chatHistory) : null
  const treeChats = rootId ? collectTree(rootId, chatHistory, getTempMessages) : []
  const tree = rootId && treeChats.length > 1 ? buildTree(treeChats, rootId) : null

  const rootChat = rootId ? chatHistory.find(c => c.id === rootId) : null
  const driftCount = treeChats.filter(c => !!c.metadata?.isDrift).length
  const msgTotal = tree ? totalMessages(tree) : 0

  // Suppress unused warning — rootChat used only for driftCount calculation above
  void rootChat

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const onToggle = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const go = (id: string) => { onSwitchChat(id); onClose() }
  const open = onOpenDrift ? (chat: ChatSession) => { onOpenDrift(chat); onClose() } : undefined

  const content = !tree
    ? <EmptyState isMobile={isMobile} />
    : (
      <NodeTree
        node={tree} depth={0} activeChatId={activeChatId}
        onSwitchChat={go} onOpenDrift={open}
        collapsed={collapsed} onToggle={onToggle} delay={0.04}
      />
    )

  // Warm near-black background, blue-violet radial glow at top
  const bg = [
    'radial-gradient(ellipse at 30% 0%, rgba(91,156,246,0.08) 0%, transparent 55%)',
    'radial-gradient(ellipse at 80% 15%, rgba(167,139,250,0.05) 0%, transparent 45%)',
    '#0D0D10',
  ].join(', ')

  const inner = (
    <>
      <NavBar onClose={onClose} driftCount={driftCount} msgTotal={msgTotal} isMobile={isMobile} />
      <div
        className="flex-1 overflow-y-auto"
        style={{
          padding: isMobile ? '20px 14px 56px' : '18px 14px 40px',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        {content}
      </div>
    </>
  )

  if (isMobile) {
    return (
      <div className="dkg-screen fixed inset-0 z-50 flex flex-col" style={{ background: bg }}>
        {inner}
      </div>
    )
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(5px)' }}
        onClick={onClose}
      />
      <div
        className="dkg-screen fixed top-0 right-0 bottom-0 z-50 flex flex-col"
        style={{
          width: 'min(500px, 42vw)',
          background: bg,
          borderLeft: '1px solid rgba(255,255,255,0.055)',
          boxShadow: '-24px 0 64px rgba(0,0,0,0.55)',
        }}
      >
        {inner}
      </div>
    </>
  )
}
