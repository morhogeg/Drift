/**
 * DriftKnowledgeGraph — right-side panel with full dark canvas showing the
 * active chat and all its drift descendants as a zoomable node graph.
 * Filtered to the current conversation tree only (not entire database).
 */
import { useEffect, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  BackgroundVariant,
  ReactFlowProvider,
  Handle,
  Position,
} from '@xyflow/react'
import type { Node, Edge, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ChatSession } from '@/types/chat'
import { X } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatNodeData {
  label: string
  isDrift: boolean
  isActive: boolean
  messageCount: number
  selectedText?: string
  [key: string]: unknown
}

interface Props {
  chatHistory: ChatSession[]
  activeChatId: string | null
  onClose: () => void
  onSwitchChat: (chatId: string) => void
}

// ── Custom node component ────────────────────────────────────────────────────

function ChatNode({ data }: NodeProps) {
  const d = data as ChatNodeData
  return (
    <div
      className={`
        rounded-xl border px-3 py-2 cursor-pointer select-none transition-all duration-150
        ${d.isActive
          ? 'border-accent-violet shadow-[0_0_0_2px_rgba(168,85,247,0.4)] bg-dark-elevated'
          : d.isDrift
            ? 'border-accent-violet/30 bg-dark-surface border-l-2 border-l-accent-violet'
            : 'border-dark-border/70 bg-dark-elevated hover:border-dark-border'
        }
      `}
      style={{ minWidth: 140, maxWidth: 180 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      {d.isDrift && (
        <div className="text-[9px] font-medium text-accent-violet/70 uppercase tracking-wide mb-1">
          drift
        </div>
      )}

      <div className="text-[12px] font-semibold text-text-primary truncate leading-tight">
        {d.label}
      </div>

      {d.isDrift && d.selectedText && (
        <div className="text-[10px] text-text-muted italic truncate mt-0.5">
          &ldquo;{d.selectedText}&rdquo;
        </div>
      )}

      <div className="text-[9px] text-text-muted/60 mt-1">
        {d.messageCount} {d.messageCount === 1 ? 'msg' : 'msgs'}
      </div>
    </div>
  )
}

const nodeTypes = { chatNode: ChatNode }

// ── Tree helpers ─────────────────────────────────────────────────────────────

function findRootId(chatId: string, allChats: ChatSession[]): string {
  const chat = allChats.find(c => c.id === chatId)
  if (!chat?.metadata?.isDrift || !chat.metadata.parentChatId) return chatId
  return findRootId(chat.metadata.parentChatId, allChats)
}

function collectTree(rootId: string, allChats: ChatSession[]): ChatSession[] {
  const result: ChatSession[] = []
  const queue = [rootId]
  const seen = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const chat = allChats.find(c => c.id === id)
    if (chat) {
      result.push(chat)
      allChats.forEach(c => {
        if (c.metadata?.parentChatId === id && !seen.has(c.id)) queue.push(c.id)
      })
    }
  }
  return result
}

// ── Layout builder ────────────────────────────────────────────────────────────

function buildTree(chats: ChatSession[], rootId: string, activeChatId: string | null) {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const LEVEL_H = 180
  const SIBLING_W = 220

  // BFS level assignment
  const levelMap = new Map<string, number>()
  const queue: string[] = [rootId]
  levelMap.set(rootId, 0)

  while (queue.length) {
    const id = queue.shift()!
    const children = chats.filter(c => c.metadata?.parentChatId === id)
    for (const child of children) {
      if (!levelMap.has(child.id)) {
        levelMap.set(child.id, (levelMap.get(id) ?? 0) + 1)
        queue.push(child.id)
      }
    }
  }

  // Group by level
  const byLevel = new Map<number, string[]>()
  levelMap.forEach((lvl, id) => {
    if (!byLevel.has(lvl)) byLevel.set(lvl, [])
    byLevel.get(lvl)!.push(id)
  })

  const maxPerLevel = Math.max(...[...byLevel.values()].map(v => v.length))
  const totalW = Math.max(maxPerLevel, 1) * SIBLING_W

  byLevel.forEach((ids, lvl) => {
    const count = ids.length
    ids.forEach((id, i) => {
      const x = (i - (count - 1) / 2) * SIBLING_W + totalW / 2
      const y = lvl * LEVEL_H + 30
      const chat = chats.find(c => c.id === id)!
      nodes.push({
        id,
        type: 'chatNode',
        position: { x, y },
        data: {
          label: chat.title || (chat.metadata?.isDrift ? (chat.metadata.selectedText ?? 'Drift') : 'Untitled'),
          isDrift: !!chat.metadata?.isDrift,
          isActive: id === activeChatId,
          messageCount: chat.messages.length,
          selectedText: chat.metadata?.selectedText ?? undefined,
        } satisfies ChatNodeData,
      })

      if (chat.metadata?.parentChatId) {
        const edgeLabel = (chat.metadata.selectedText ?? '').substring(0, 28)
        edges.push({
          id: `e-${chat.metadata.parentChatId}-${id}`,
          source: chat.metadata.parentChatId,
          target: id,
          type: 'smoothstep',
          animated: true,
          label: edgeLabel || undefined,
          labelStyle: { fontSize: 9, fill: 'rgba(168,85,247,0.8)', fontStyle: 'italic' },
          labelBgStyle: { fill: 'rgba(13,13,18,0.9)', stroke: 'rgba(168,85,247,0.2)', strokeWidth: 1 },
          labelBgPadding: [4, 2] as [number, number],
          style: { stroke: 'rgba(168, 85, 247, 0.5)', strokeWidth: 1.5, strokeDasharray: '5,3' },
        })
      }
    })
  })

  return { nodes, edges }
}

// ── Inner component ───────────────────────────────────────────────────────────

function KnowledgeGraphInner({ chatHistory, activeChatId, onClose, onSwitchChat }: Props) {
  const { fitView } = useReactFlow()

  const rootId = activeChatId ? findRootId(activeChatId, chatHistory) : null
  const treeChats = rootId ? collectTree(rootId, chatHistory) : []
  const { nodes: initNodes, edges: initEdges } = rootId && treeChats.length > 1
    ? buildTree(treeChats, rootId, activeChatId)
    : { nodes: [], edges: [] }

  const [nodes, , onNodesChange] = useNodesState(initNodes)
  const [edges, , onEdgesChange] = useEdgesState(initEdges)

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.18, duration: 450 }), 60)
    return () => clearTimeout(t)
  }, [fitView])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onSwitchChat(node.id)
    onClose()
  }, [onSwitchChat, onClose])

  const rootChat = rootId ? chatHistory.find(c => c.id === rootId) : null
  const driftCount = treeChats.filter(c => !!c.metadata?.isDrift).length

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-39 bg-black/20"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 z-40 flex flex-col w-[520px] bg-[#0a0a0f] border-l border-dark-border/50 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border/40 flex-shrink-0 bg-[#0d0d12]/80 backdrop-blur-sm">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-text-primary truncate">
              {rootChat?.title || 'Drift Map'}
            </h2>
            <p className="text-[10px] text-text-muted mt-0.5">
              {driftCount === 0
                ? 'No drifts yet'
                : `${driftCount} drift${driftCount !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 flex-shrink-0 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          {treeChats.length <= 1 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8">
              <div className="w-10 h-10 rounded-full border border-accent-violet/20 flex items-center justify-center">
                <span className="text-accent-violet/50 text-sm">↗</span>
              </div>
              <p className="text-text-muted text-[12px] text-center leading-relaxed">
                Select text in any AI message and tap{' '}
                <span className="text-accent-violet">Drift</span> to start branching
              </p>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              minZoom={0.2}
              maxZoom={2.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color="rgba(255,255,255,0.055)"
              />
            </ReactFlow>
          )}
        </div>
      </div>
    </>
  )
}

// ── Exported component ────────────────────────────────────────────────────────

export default function DriftKnowledgeGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner {...props} />
    </ReactFlowProvider>
  )
}
