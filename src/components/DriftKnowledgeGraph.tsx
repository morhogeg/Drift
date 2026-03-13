/**
 * DriftKnowledgeGraph — bird's-eye view of all drifts in a conversation.
 * Features: topics overview, timestamps, collapsible branches.
 * Light/dark theme aware via CSS custom properties.
 */
import { useEffect, useState, useCallback } from 'react'
import type { ChatSession, Message } from '@/types/chat'
import { X, ChevronRight } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  chatHistory: ChatSession[]
  activeChatId: string | null
  onClose: () => void
  onSwitchChat: (chatId: string) => void
  onScrollToMessage: (messageId: string) => void
  getTempMessages?: (chatId: string) => Message[] | null
}

interface TreeNode {
  chat: ChatSession
  phrase: string | undefined
  children: TreeNode[]
}

// ── Data helpers ──────────────────────────────────────────────────────────────

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

/** Collect every { phrase, chatId } in DFS order (skips root which has no phrase). */
function collectTopics(node: TreeNode): { phrase: string; chatId: string }[] {
  const here = node.phrase ? [{ phrase: node.phrase, chatId: node.chat.id }] : []
  return [...here, ...node.children.flatMap(collectTopics)]
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Depth palette ─────────────────────────────────────────────────────────────

const PALETTE = [
  { accent: '#a855f7', bg: 'rgba(168,85,247,{a})', line: 'rgba(168,85,247,0.22)' },
  { accent: '#6366f1', bg: 'rgba(99,102,241,{a})',  line: 'rgba(99,102,241,0.22)'  },
  { accent: '#3b82f6', bg: 'rgba(59,130,246,{a})',  line: 'rgba(59,130,246,0.22)'  },
]
function palette(depth: number) { return PALETTE[Math.min(depth - 1, PALETTE.length - 1)] }
function withAlpha(t: string, a: number) { return t.replace('{a}', String(a)) }

const INDENT = 24

// ── Tree row ──────────────────────────────────────────────────────────────────

function TreeRow({
  node, depth, isLast, ancestorLines, activeChatId, onSwitchChat,
  collapsed, onToggleCollapse,
}: {
  node: TreeNode; depth: number; isLast: boolean; ancestorLines: boolean[]
  activeChatId: string | null; onSwitchChat: (id: string) => void
  collapsed: Set<string>; onToggleCollapse: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const isActive = node.chat.id === activeChatId
  const isCollapsed = collapsed.has(node.chat.id)
  const isDrift = depth > 0
  const p = isDrift ? palette(depth) : null
  const hasChildren = node.children.length > 0

  const title = node.chat.metadata?.selectedText || node.chat.title || 'Untitled'
  const msgCount = node.chat.messages.length
  const preview = lastAiPreview(node.chat)
  const ts = node.chat.createdAt ? timeAgo(node.chat.createdAt) : null

  const cardBg = isActive
    ? withAlpha(p?.bg ?? 'rgba(168,85,247,{a})', 0.09)
    : 'rgb(var(--color-elevated))'
  const cardBorder = isActive
    ? (p?.accent ?? '#a855f7') + '80'
    : isDrift
      ? (p?.accent ?? '#a855f7') + '28'
      : 'rgb(var(--color-border))'
  const titleColor = isDrift ? (p?.accent ?? '#a855f7') : 'rgb(var(--color-text-primary))'

  return (
    <div>
      {/* Connector */}
      {isDrift && (
        <div className="flex" style={{ height: 30 }}>
          {Array.from({ length: depth }).map((_, i) => {
            const isThisLevel = i === depth - 1
            const drawLine = isThisLevel ? true : ancestorLines[i]
            return (
              <div key={i} className="flex-shrink-0 relative" style={{ width: INDENT }}>
                {drawLine && (
                  <div className="absolute" style={{ left: INDENT / 2 - 0.5, top: 0, bottom: isThisLevel ? '50%' : 0, width: 1, background: p?.line }} />
                )}
                {isThisLevel && (
                  <div className="absolute" style={{ left: INDENT / 2, right: 0, top: '50%', height: 1, background: p?.line }} />
                )}
              </div>
            )
          })}
          {node.phrase && (
            <div className="flex items-end pb-1 flex-1 min-w-0">
              <span
                className="text-[9px] font-medium rounded-md px-1.5 py-0.5 truncate"
                style={{ color: p ? p.accent + 'bb' : 'rgba(168,85,247,0.73)', background: withAlpha(p?.bg ?? 'rgba(168,85,247,{a})', 0.1), maxWidth: 270 }}
              >
                &ldquo;{node.phrase.length > 40 ? node.phrase.slice(0, 40) + '…' : node.phrase}&rdquo;
              </span>
            </div>
          )}
        </div>
      )}

      {/* Card row */}
      <div className="flex">
        {Array.from({ length: depth }).map((_, i) => {
          const drawLine = i === depth - 1 ? !isLast || (hasChildren && !isCollapsed) : ancestorLines[i]
          return (
            <div key={i} className="flex-shrink-0 relative" style={{ width: INDENT }}>
              {drawLine && <div className="absolute" style={{ left: INDENT / 2 - 0.5, top: 0, bottom: 0, width: 1, background: p?.line }} />}
            </div>
          )
        })}

        <button
          onClick={() => onSwitchChat(node.chat.id)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="flex-1 min-w-0 text-left rounded-xl px-4 py-3 mb-1.5 transition-all duration-150"
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            borderLeftWidth: isDrift ? 3 : 1,
            borderLeftColor: isDrift ? (p?.accent ?? '#a855f7') + (isActive ? 'cc' : '55') : undefined,
            boxShadow: isActive ? `0 0 0 3px ${p?.accent ?? '#a855f7'}1a` : hovered ? '0 1px 6px rgba(0,0,0,0.06)' : 'none',
          }}
        >
          {/* Top row */}
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {isDrift ? (
                <span className="text-[8.5px] font-semibold uppercase tracking-widest flex-shrink-0" style={{ color: p ? p.accent + '88' : 'rgba(168,85,247,0.53)' }}>
                  ↗ drift
                </span>
              ) : (
                <span className="text-[8.5px] font-semibold uppercase tracking-widest flex-shrink-0" style={{ color: 'rgb(var(--color-text-muted))' }}>
                  main chat
                </span>
              )}
              {/* Timestamp */}
              {ts && (
                <span className="text-[9px]" style={{ color: 'rgb(var(--color-text-muted))', opacity: 0.6 }}>
                  · {ts}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] tabular-nums" style={{ color: 'rgb(var(--color-text-muted))' }}>
                {msgCount} {msgCount === 1 ? 'msg' : 'msgs'}
              </span>
              {/* Collapse toggle */}
              {hasChildren && (
                <button
                  onClick={e => { e.stopPropagation(); onToggleCollapse(node.chat.id) }}
                  className="flex items-center justify-center rounded-md transition-all duration-200 flex-shrink-0"
                  style={{
                    width: 18, height: 18,
                    background: hovered ? withAlpha(p?.bg ?? 'rgba(168,85,247,{a})', 0.12) : 'transparent',
                    color: p?.accent ?? '#a855f7',
                    opacity: 0.7,
                  }}
                  title={isCollapsed ? 'Expand branches' : 'Collapse branches'}
                >
                  <ChevronRight
                    className="w-3 h-3 transition-transform duration-200"
                    style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
                  />
                </button>
              )}
            </div>
          </div>

          {/* Title */}
          <div
            className="font-semibold text-[13px] leading-snug mb-1.5"
            style={{
              color: titleColor,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            } as React.CSSProperties}
          >
            {title}
          </div>

          {/* Preview */}
          {preview && (
            <div
              className="text-[11px] leading-relaxed"
              style={{
                color: 'rgb(var(--color-text-muted))',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              } as React.CSSProperties}
            >
              {preview}
            </div>
          )}

          {/* Collapsed summary */}
          {isCollapsed && hasChildren && (
            <div className="mt-2 text-[9px] font-medium" style={{ color: (p?.accent ?? '#a855f7') + '99' }}>
              {node.children.length} hidden branch{node.children.length !== 1 ? 'es' : ''}
            </div>
          )}
        </button>
      </div>

      {/* Children (unless collapsed) */}
      {!isCollapsed && node.children.map((child, i) => (
        <TreeRow
          key={child.chat.id}
          node={child}
          depth={depth + 1}
          isLast={i === node.children.length - 1}
          ancestorLines={[...ancestorLines, !isLast]}
          activeChatId={activeChatId}
          onSwitchChat={onSwitchChat}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
        />
      ))}
    </div>
  )
}

// ── Topics strip ──────────────────────────────────────────────────────────────

function TopicsStrip({ topics, onJump }: { topics: { phrase: string; chatId: string }[]; onJump: (id: string) => void }) {
  if (!topics.length) return null
  return (
    <div
      className="px-4 py-2.5 flex-shrink-0 flex flex-wrap gap-1.5"
      style={{ borderBottom: '1px solid rgb(var(--color-border))' }}
    >
      <span className="text-[9px] font-semibold uppercase tracking-widest self-center mr-0.5" style={{ color: 'rgb(var(--color-text-muted))' }}>
        Explored
      </span>
      {topics.map(({ phrase, chatId }, i) => {
        const p = palette((i % PALETTE.length) + 1)
        return (
          <button
            key={chatId}
            onClick={() => onJump(chatId)}
            className="text-[10px] font-medium rounded-full px-2.5 py-0.5 transition-all duration-150 hover:opacity-90 active:scale-95"
            style={{
              background: withAlpha(p.bg, 0.12),
              border: `1px solid ${p.accent}33`,
              color: p.accent + 'cc',
            }}
          >
            {phrase.length > 22 ? phrase.slice(0, 22) + '…' : phrase}
          </button>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DriftKnowledgeGraph({
  chatHistory, activeChatId, onClose, onSwitchChat, getTempMessages,
}: Props) {
  const rootId = activeChatId ? findRootId(activeChatId, chatHistory) : null
  const treeChats = rootId ? collectTree(rootId, chatHistory, getTempMessages) : []
  const tree = rootId && treeChats.length > 1 ? buildTree(treeChats, rootId) : null

  const rootChat = rootId ? chatHistory.find(c => c.id === rootId) : null
  const driftCount = treeChats.filter(c => !!c.metadata?.isDrift).length
  const msgTotal = tree ? totalMessages(tree) : 0
  const topics = tree ? collectTopics(tree) : []

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const onToggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-39 bg-black/[0.15]" onClick={onClose} />

      <div
        className="fixed top-0 right-0 bottom-0 z-40 flex flex-col shadow-2xl"
        style={{ width: 'min(560px, 44vw)', background: 'rgb(var(--color-surface))', borderLeft: '1px solid rgb(var(--color-border))' }}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3.5 flex-shrink-0" style={{ borderBottom: '1px solid rgb(var(--color-border))' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(168,85,247,0.6)' }}>
                Drift Tree
              </div>
              <h2
                className="text-[14px] font-semibold leading-snug"
                style={{ color: 'rgb(var(--color-text-primary))', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}
              >
                {rootChat?.title || 'Untitled'}
              </h2>
              {driftCount > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5"
                    style={{ background: 'rgba(168,85,247,0.1)', color: 'rgba(168,85,247,0.8)' }}
                  >
                    ↗ {driftCount} {driftCount === 1 ? 'drift' : 'drifts'}
                  </span>
                  <span className="text-[10px]" style={{ color: 'rgb(var(--color-text-muted))' }}>
                    · {msgTotal} messages across all branches
                  </span>
                </div>
              )}
            </div>
            <button onClick={onClose} className="flex-shrink-0 p-1.5 rounded-lg transition-colors mt-0.5" style={{ color: 'rgb(var(--color-text-muted))' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Topics strip */}
        {tree && <TopicsStrip topics={topics} onJump={onSwitchChat} />}

        {/* Tree */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {!tree ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 px-10 text-center">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.18)' }}
              >
                <span style={{ fontSize: 22, color: 'rgba(168,85,247,0.55)' }}>↗</span>
              </div>
              <div>
                <p className="text-[13px] font-semibold mb-1" style={{ color: 'rgb(var(--color-text-primary))' }}>No drifts yet</p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgb(var(--color-text-muted))' }}>
                  Select any text in an AI response and tap{' '}
                  <span style={{ color: '#a855f7', fontWeight: 600 }}>Drift</span>{' '}
                  to open a focused branch conversation.
                </p>
              </div>
            </div>
          ) : (
            <TreeRow
              node={tree}
              depth={0}
              isLast={true}
              ancestorLines={[]}
              activeChatId={activeChatId}
              onSwitchChat={onSwitchChat}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
            />
          )}
        </div>
      </div>
    </>
  )
}
