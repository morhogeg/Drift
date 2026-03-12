/**
 * DriftKnowledgeGraph — right-side panel showing the active chat and all its
 * drift descendants as a zoomable tree. Only shows the current conversation tree,
 * not the entire database.
 */
import { useEffect, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
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
          ? 'border-accent-violet shadow-[0_0_0_2px_rgba(168,85,247,0.35)] bg-dark-elevated'
          : d.isDrift
            ? 'border-accent-violet/30 bg-dark-surface'
            : 'border-dark-border/70 bg-dark-elevated hover:border-dark-border'
        }
      `}
      style={{ minWidth: 130, maxWidth: 170 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      {d.isDrift && (
        <div className="text-[9px] font-medium text-accent-violet/70 uppercase tracking-wide mb-0.5">
          drift
        </div>
      )}

      <div className="text-[11px] font-semibold text-text-primary truncate leading-tight">
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

/** Walk up parent chain to find the ultimate root of this conversation tree. */
function findRootId(chatId: string, allChats: ChatSession[]): string {
  const chat = allChats.find(c => c.id === chatId)
  if (!chat?.metadata?.isDrift || !chat.metadata.parentChatId) return chatId
  return findRootId(chat.metadata.parentChatId, allChats)
}

/** Collect all chats in the tree rooted at rootId (BFS). */
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

  const LEVEL_H = 160
  const SIBLING_W = 185

  // BFS to assign levels
  const levelMap = new Map<string, number>()
  const queue: string[] = [rootId]
  levelMap.set(rootId, 0)
  const childrenMap = new Map<string, string[]>()

  while (queue.length) {
    const id = queue.shift()!
    const children = chats.filter(c => c.metadata?.parentChatId === id).map(c => c.id)
    childrenMap.set(id, children)
    for (const cid of children) {
      if (!levelMap.has(cid)) {
        levelMap.set(cid, (levelMap.get(id) ?? 0) + 1)
        queue.push(cid)
      }
    }
  }

  // Group by level
  const byLevel = new Map<number, string[]>()
  levelMap.forEach((lvl, id) => {
    if (!byLevel.has(lvl)) byLevel.set(lvl, [])
    byLevel.get(lvl)!.push(id)
  })

  const maxLevel = Math.max(...byLevel.keys())
  const maxPerLevel = Math.max(...[...byLevel.values()].map(v => v.length))
  const totalW = maxPerLevel * SIBLING_W

  // Position nodes
  byLevel.forEach((ids, lvl) => {
    const count = ids.length
    ids.forEach((id, i) => {
      const x = (i - (count - 1) / 2) * SIBLING_W + totalW / 2
      const y = lvl * LEVEL_H + 20
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
        const edgeLabel = (chat.metadata.selectedText ?? '').substring(0, 24)
        edges.push({
          id: `e-${chat.metadata.parentChatId}-${id}`,
          source: chat.metadata.parentChatId,
          target: id,
          type: 'smoothstep',
          animated: true,
          label: edgeLabel || undefined,
          labelStyle: { fontSize: 9, fill: 'rgba(168,85,247,0.8)', fontStyle: 'italic' },
          labelBgStyle: { fill: 'rgba(13,13,18,0.9)', stroke: 'rgba(168,85,247,0.2)', strokeWidth: 1 },
          labelBgPadding: [3, 2] as [number, number],
          style: { stroke: 'rgba(168, 85, 247, 0.5)', strokeWidth: 1.5, strokeDasharray: '5,3' },
        })
      }
    })
  })

  void maxLevel // suppress unused warning

  return { nodes, edges }
}

// ── Inner component (needs ReactFlowProvider context) ─────────────────────────

function KnowledgeGraphInner({ chatHistory, activeChatId, onClose, onSwitchChat }: Props) {
  const { fitView } = useReactFlow()

  const rootId = activeChatId ? findRootId(activeChatId, chatHistory) : null
  const treeChats = rootId ? collectTree(rootId, chatHistory) : []
  const { nodes: initNodes, edges: initEdges } = rootId
    ? buildTree(treeChats, rootId, activeChatId)
    : { nodes: [], edges: [] }

  const [nodes, , onNodesChange] = useNodesState(initNodes)
  const [edges, , onEdgesChange] = useEdgesState(initEdges)

  // Fit view on mount
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 60)
    return () => clearTimeout(t)
  }, [fitView])

  // Close on Escape
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
    <div className="fixed top-0 right-0 bottom-0 z-40 flex flex-col w-[340px] bg-dark-bg border-l border-dark-border/60 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-dark-border/50 flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-text-primary truncate">
            {rootChat?.title || 'Drift Map'}
          </h2>
          <p className="text-[10px] text-text-muted mt-0.5">
            {driftCount} drift{driftCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-2 flex-shrink-0 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        {treeChats.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted text-[13px]">
            No drifts yet
          </div>
        ) : treeChats.length === 1 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6">
            <div className="w-8 h-8 rounded-full border border-accent-violet/30 flex items-center justify-center">
              <span className="text-accent-violet/60 text-xs">↗</span>
            </div>
            <p className="text-text-muted text-[12px] text-center">
              Select text in any AI message and tap <span className="text-accent-violet">Drift</span> to start exploring
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
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={18}
              size={1}
              color="rgba(255,255,255,0.05)"
            />
            <Controls
              style={{
                background: 'rgba(26,26,26,0.9)',
                border: '1px solid rgba(51,51,51,0.8)',
                borderRadius: 8,
              }}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}

// ── Exported component (wraps with ReactFlowProvider) ─────────────────────────

export default function DriftKnowledgeGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner {...props} />
    </ReactFlowProvider>
  )
}
