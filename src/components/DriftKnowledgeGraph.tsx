/**
 * DriftKnowledgeGraph — bird's-eye view of all drifts in a conversation.
 * Mobile-first: full-screen bottom sheet on small screens, right panel on desktop.
 * Light/dark theme aware via CSS custom properties.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import type { ChatSession, Message } from '@/types/chat'
import { X, ChevronDown, ChevronRight, GitBranch } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  return clean.length > 100 ? clean.slice(0, 100) + '…' : clean
}

function totalMessages(node: TreeNode): number {
  return node.chat.messages.length + node.children.reduce((s, c) => s + totalMessages(c), 0)
}

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
  { accent: '#a855f7', bg: 'rgba(168,85,247,{a})', line: 'rgba(168,85,247,0.3)' },
  { accent: '#6366f1', bg: 'rgba(99,102,241,{a})', line: 'rgba(99,102,241,0.3)' },
  { accent: '#3b82f6', bg: 'rgba(59,130,246,{a})', line: 'rgba(59,130,246,0.3)' },
]
function palette(depth: number) { return PALETTE[Math.min(depth - 1, PALETTE.length - 1)] }
function withAlpha(t: string, a: number) { return t.replace('{a}', String(a)) }

// ── Responsive hook ────────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

// ── Tree card ──────────────────────────────────────────────────────────────────

function TreeCard({
  node, depth, isLast, ancestorLines, activeChatId, onSwitchChat, onOpenDrift,
  collapsed, onToggleCollapse, isMobile,
}: {
  node: TreeNode; depth: number; isLast: boolean; ancestorLines: boolean[]
  activeChatId: string | null; onSwitchChat: (id: string) => void
  onOpenDrift?: (chat: ChatSession) => void
  collapsed: Set<string>; onToggleCollapse: (id: string) => void
  isMobile: boolean
}) {
  const isActive = node.chat.id === activeChatId
  const isCollapsed = collapsed.has(node.chat.id)
  const isDrift = depth > 0
  const p = isDrift ? palette(depth) : null
  const hasChildren = node.children.length > 0

  const title = node.chat.metadata?.selectedText || node.chat.title || 'Untitled'
  const msgCount = node.chat.messages.length
  const preview = lastAiPreview(node.chat)
  const ts = node.chat.createdAt ? timeAgo(node.chat.createdAt) : null

  // Indent per level — tighter on mobile
  const INDENT = isMobile ? 18 : 24

  const cardBg = isActive
    ? withAlpha(p?.bg ?? 'rgba(168,85,247,{a})', 0.1)
    : 'rgb(var(--color-elevated))'

  const borderColor = isActive
    ? (p?.accent ?? '#a855f7') + 'aa'
    : isDrift
      ? (p?.accent ?? '#a855f7') + '35'
      : 'rgb(var(--color-border))'

  const accentLeft = isDrift
    ? (p?.accent ?? '#a855f7') + (isActive ? 'dd' : '66')
    : undefined

  return (
    <div>
      {/* Branch connector */}
      {isDrift && (
        <div className="flex" style={{ height: isMobile ? 28 : 32 }}>
          {Array.from({ length: depth }).map((_, i) => {
            const isThisLevel = i === depth - 1
            const drawLine = isThisLevel ? true : ancestorLines[i]
            return (
              <div key={i} className="flex-shrink-0 relative" style={{ width: INDENT }}>
                {drawLine && (
                  <div
                    className="absolute"
                    style={{
                      left: INDENT / 2 - 0.75,
                      top: 0,
                      bottom: isThisLevel ? '50%' : 0,
                      width: 1.5,
                      background: p?.line,
                      borderRadius: 1,
                    }}
                  />
                )}
                {isThisLevel && (
                  <div
                    className="absolute"
                    style={{
                      left: INDENT / 2,
                      right: 0,
                      top: '50%',
                      height: 1.5,
                      background: p?.line,
                      borderRadius: 1,
                    }}
                  />
                )}
              </div>
            )
          })}
          {/* Phrase pill */}
          {node.phrase && (
            <div className="flex items-end pb-1 flex-1 min-w-0">
              <span
                className="text-[10px] font-semibold rounded-full px-2 py-0.5 truncate"
                style={{
                  color: p ? p.accent + 'dd' : 'rgba(168,85,247,0.86)',
                  background: withAlpha(p?.bg ?? 'rgba(168,85,247,{a})', 0.12),
                  border: `1px solid ${p ? p.accent + '33' : 'rgba(168,85,247,0.2)'}`,
                  maxWidth: isMobile ? 180 : 240,
                }}
              >
                "{node.phrase.length > 28 ? node.phrase.slice(0, 28) + '…' : node.phrase}"
              </span>
            </div>
          )}
        </div>
      )}

      {/* Card row */}
      <div className="flex">
        {/* Ancestor guide lines */}
        {Array.from({ length: depth }).map((_, i) => {
          const drawLine = i === depth - 1 ? !isLast || (hasChildren && !isCollapsed) : ancestorLines[i]
          return (
            <div key={i} className="flex-shrink-0 relative" style={{ width: INDENT }}>
              {drawLine && (
                <div
                  className="absolute"
                  style={{
                    left: INDENT / 2 - 0.75,
                    top: 0,
                    bottom: 0,
                    width: 1.5,
                    background: p?.line,
                    borderRadius: 1,
                  }}
                />
              )}
            </div>
          )
        })}

        {/* Main card */}
        <button
          onClick={() => {
            if (isDrift && onOpenDrift) {
              onOpenDrift(node.chat)
            } else {
              onSwitchChat(node.chat.id)
            }
          }}
          className="flex-1 min-w-0 text-left rounded-2xl transition-all duration-150 active:scale-[0.98]"
          style={{
            background: cardBg,
            border: `1px solid ${borderColor}`,
            borderLeftWidth: isDrift ? 3 : 1,
            borderLeftColor: accentLeft,
            padding: isMobile ? '12px 14px' : '10px 14px',
            marginBottom: isMobile ? 10 : 8,
            boxShadow: isActive
              ? `0 0 0 3px ${p?.accent ?? '#a855f7'}22, 0 2px 12px rgba(0,0,0,0.06)`
              : '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          {/* Top row: badge + msg count + collapse */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              {isDrift ? (
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: p ? p.accent + 'cc' : 'rgba(168,85,247,0.8)' }}
                >
                  ↗ Drift
                </span>
              ) : (
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: 'rgb(var(--color-text-muted))' }}
                >
                  Main Chat
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Message count pill */}
              <span
                className="text-[10px] font-medium rounded-full px-2 py-0.5 tabular-nums"
                style={{
                  background: isDrift
                    ? withAlpha(p?.bg ?? 'rgba(168,85,247,{a})', 0.1)
                    : 'rgba(var(--color-border-raw, 100,100,100), 0.12)',
                  color: isDrift
                    ? (p?.accent ?? '#a855f7') + 'aa'
                    : 'rgb(var(--color-text-muted))',
                  border: `1px solid ${isDrift ? (p?.accent ?? '#a855f7') + '22' : 'rgb(var(--color-border))'}`,
                }}
              >
                {msgCount} {msgCount === 1 ? 'msg' : 'msgs'}
              </span>

              {/* Collapse toggle */}
              {hasChildren && (
                <button
                  onClick={e => { e.stopPropagation(); onToggleCollapse(node.chat.id) }}
                  className="flex items-center justify-center rounded-full transition-all duration-200 flex-shrink-0 active:scale-90"
                  style={{
                    width: isMobile ? 24 : 20,
                    height: isMobile ? 24 : 20,
                    minWidth: isMobile ? 24 : 20,
                    background: withAlpha(p?.bg ?? 'rgba(168,85,247,{a})', 0.12),
                    border: `1px solid ${p?.accent ?? '#a855f7'}33`,
                    color: p?.accent ?? '#a855f7',
                  }}
                  title={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  {isCollapsed
                    ? <ChevronRight className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3" />
                  }
                </button>
              )}
            </div>
          </div>

          {/* Title */}
          <div
            className="font-semibold leading-snug mb-1.5"
            style={{
              fontSize: isMobile ? 15 : 13,
              color: isDrift ? (p?.accent ?? '#a855f7') : 'rgb(var(--color-text-primary))',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            } as React.CSSProperties}
          >
            {title}
          </div>

          {/* Preview */}
          {preview && (
            <div
              className="leading-relaxed mb-2"
              style={{
                fontSize: isMobile ? 12 : 11,
                color: 'rgb(var(--color-text-muted))',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              } as React.CSSProperties}
            >
              {preview}
            </div>
          )}

          {/* Footer row: timestamp + collapsed hint */}
          <div className="flex items-center justify-between gap-2">
            {isCollapsed && hasChildren && (
              <span
                className="text-[10px] font-medium"
                style={{ color: (p?.accent ?? '#a855f7') + 'aa' }}
              >
                {node.children.length} hidden branch{node.children.length !== 1 ? 'es' : ''}
              </span>
            )}
            {!isCollapsed && <span />}
            {ts && (
              <span
                className="text-[10px] tabular-nums flex-shrink-0 ml-auto"
                style={{ color: 'rgb(var(--color-text-muted))', opacity: 0.55 }}
              >
                {ts}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Children */}
      {!isCollapsed && node.children.map((child, i) => (
        <TreeCard
          key={child.chat.id}
          node={child}
          depth={depth + 1}
          isLast={i === node.children.length - 1}
          ancestorLines={[...ancestorLines, !isLast]}
          activeChatId={activeChatId}
          onSwitchChat={onSwitchChat}
          onOpenDrift={onOpenDrift}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          isMobile={isMobile}
        />
      ))}
    </div>
  )
}

// ── Topics strip ──────────────────────────────────────────────────────────────

function TopicsStrip({
  topics, onJump, isMobile,
}: { topics: { phrase: string; chatId: string }[]; onJump: (id: string) => void; isMobile: boolean }) {
  if (!topics.length) return null
  return (
    <div
      className="flex-shrink-0 flex items-center gap-0"
      style={{ borderBottom: '1px solid rgb(var(--color-border))' }}
    >
      {/* Label */}
      <div
        className="flex-shrink-0 px-4 py-3 text-[10px] font-bold uppercase tracking-widest"
        style={{ color: 'rgb(var(--color-text-muted))' }}
      >
        Explored
      </div>

      {/* Scrollable chips */}
      <div
        className="flex-1 overflow-x-auto py-3 pr-4 [&::-webkit-scrollbar]:hidden"
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          gap: 6,
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        {topics.map(({ phrase, chatId }, i) => {
          const p = palette((i % PALETTE.length) + 1)
          return (
            <button
              key={chatId}
              onClick={() => onJump(chatId)}
              className="flex-shrink-0 font-medium rounded-full transition-all duration-150 active:scale-95"
              style={{
                fontSize: isMobile ? 12 : 11,
                padding: isMobile ? '5px 12px' : '3px 10px',
                background: withAlpha(p.bg, 0.12),
                border: `1px solid ${p.accent}33`,
                color: p.accent + 'dd',
                minHeight: isMobile ? 30 : 24,
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

// ── Drag-to-close for mobile bottom sheet ─────────────────────────────────────

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
}: Props) {
  const isMobile = useIsMobile()

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

  const { panelRef, onTouchStart, onTouchMove, onTouchEnd } = useDragClose(onClose, isMobile)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── Mobile: full-screen bottom sheet ──
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
          onClick={onClose}
        />

        {/* Panel */}
        <div
          ref={panelRef}
          className="fixed left-0 right-0 bottom-0 z-50 flex flex-col"
          style={{
            height: '92dvh',
            background: 'rgb(var(--color-surface))',
            borderRadius: '20px 20px 0 0',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
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
            <div
              className="rounded-full"
              style={{ width: 36, height: 4, background: 'rgb(var(--color-border))' }}
            />
          </div>

          {/* Header */}
          <div
            className="px-5 pt-2 pb-4 flex-shrink-0"
            style={{ borderBottom: '1px solid rgb(var(--color-border))' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <GitBranch className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(168,85,247,0.7)' }} />
                  <span
                    className="text-[11px] font-bold uppercase tracking-widest"
                    style={{ color: 'rgba(168,85,247,0.7)' }}
                  >
                    Drift Tree
                  </span>
                </div>
                <h2
                  className="text-[17px] font-bold leading-snug"
                  style={{
                    color: 'rgb(var(--color-text-primary))',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  } as React.CSSProperties}
                >
                  {rootChat?.title || 'Untitled'}
                </h2>
                {driftCount > 0 && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className="inline-flex items-center gap-1 text-[12px] font-semibold rounded-full px-3 py-1"
                      style={{ background: 'rgba(168,85,247,0.12)', color: 'rgba(168,85,247,0.9)', border: '1px solid rgba(168,85,247,0.2)' }}
                    >
                      ↗ {driftCount} {driftCount === 1 ? 'drift' : 'drifts'}
                    </span>
                    <span className="text-[12px]" style={{ color: 'rgb(var(--color-text-muted))' }}>
                      {msgTotal} messages total
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 flex items-center justify-center rounded-full transition-all active:scale-90"
                style={{
                  width: 36, height: 36,
                  background: 'rgb(var(--color-elevated))',
                  border: '1px solid rgb(var(--color-border))',
                  color: 'rgb(var(--color-text-muted))',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Topics strip */}
          {tree && <TopicsStrip topics={topics} onJump={onSwitchChat} isMobile={isMobile} />}

          {/* Tree */}
          <div className="flex-1 overflow-y-auto px-4 py-4" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
            {!tree ? (
              <EmptyState isMobile />
            ) : (
              <TreeCard
                node={tree}
                depth={0}
                isLast={true}
                ancestorLines={[]}
                activeChatId={activeChatId}
                onSwitchChat={id => { onSwitchChat(id); onClose() }}
                onOpenDrift={onOpenDrift ? chat => { onOpenDrift(chat); onClose() } : undefined}
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                isMobile={isMobile}
              />
            )}
          </div>
        </div>
      </>
    )
  }

  // ── Desktop: right panel ──
  return (
    <>
      <div
        className="fixed top-0 right-0 bottom-0 z-40 flex flex-col shadow-2xl"
        style={{
          width: 'min(480px, 42vw)',
          background: 'rgb(var(--color-surface))',
          borderLeft: '1px solid rgb(var(--color-border))',
        }}
      >
        {/* Header */}
        <div
          className="px-5 pt-4 pb-3.5 flex-shrink-0"
          style={{ borderBottom: '1px solid rgb(var(--color-border))' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1">
                <GitBranch className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(168,85,247,0.6)' }} />
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(168,85,247,0.6)' }}>
                  Drift Tree
                </span>
              </div>
              <h2
                className="text-[14px] font-semibold leading-snug"
                style={{
                  color: 'rgb(var(--color-text-primary))',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                } as React.CSSProperties}
              >
                {rootChat?.title || 'Untitled'}
              </h2>
              {driftCount > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5"
                    style={{ background: 'rgba(168,85,247,0.1)', color: 'rgba(168,85,247,0.85)', border: '1px solid rgba(168,85,247,0.18)' }}
                  >
                    ↗ {driftCount} {driftCount === 1 ? 'drift' : 'drifts'}
                  </span>
                  <span className="text-[10px]" style={{ color: 'rgb(var(--color-text-muted))' }}>
                    · {msgTotal} messages
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
              style={{ color: 'rgb(var(--color-text-muted))' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Topics strip */}
        {tree && <TopicsStrip topics={topics} onJump={onSwitchChat} isMobile={false} />}

        {/* Tree */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {!tree ? (
            <EmptyState isMobile={false} />
          ) : (
            <TreeCard
              node={tree}
              depth={0}
              isLast={true}
              ancestorLines={[]}
              activeChatId={activeChatId}
              onSwitchChat={onSwitchChat}
              onOpenDrift={onOpenDrift}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
              isMobile={false}
            />
          )}
        </div>
      </div>
    </>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ isMobile }: { isMobile: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 px-10 text-center">
      <div
        className="flex items-center justify-center rounded-3xl"
        style={{
          width: isMobile ? 72 : 56,
          height: isMobile ? 72 : 56,
          background: 'rgba(168,85,247,0.08)',
          border: '1px solid rgba(168,85,247,0.2)',
        }}
      >
        <span style={{ fontSize: isMobile ? 30 : 24, color: 'rgba(168,85,247,0.6)' }}>↗</span>
      </div>
      <div>
        <p
          className="font-semibold mb-1.5"
          style={{ fontSize: isMobile ? 16 : 13, color: 'rgb(var(--color-text-primary))' }}
        >
          No drifts yet
        </p>
        <p
          className="leading-relaxed"
          style={{ fontSize: isMobile ? 14 : 11, color: 'rgb(var(--color-text-muted))' }}
        >
          Select any text in an AI response and tap{' '}
          <span style={{ color: '#a855f7', fontWeight: 600 }}>Drift</span>{' '}
          to open a focused branch conversation.
        </p>
      </div>
    </div>
  )
}
