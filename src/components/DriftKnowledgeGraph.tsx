/**
 * DriftKnowledgeGraph — full-screen zoomable/pannable canvas showing all chats
 * and their drift relationships as connected nodes.
 *
 * Root chats are arranged in a grid; drift chats hang off their parent with
 * animated violet edges labelled with the selected text that triggered the drift.
 */
import { useEffect, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
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
  lastMessage?: string
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

      {!d.isDrift && d.lastMessage && (
        <div className="text-[10px] text-text-muted truncate mt-0.5">
          {d.lastMessage}
        </div>
      )}

      <div className="text-[9px] text-text-muted/60 mt-1">
        {d.messageCount} {d.messageCount === 1 ? 'msg' : 'msgs'}
      </div>
    </div>
  )
}

const nodeTypes = { chatNode: ChatNode }

// ── Layout builder ───────────────────────────────────────────────────────────

function buildLayout(chats: ChatSession[], activeChatId: string | null) {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const rootChats = chats.filter(c => !c.metadata?.isDrift)
  const driftChats = chats.filter(c => c.metadata?.isDrift)

  const COLS = 3
  const H_GAP = 260
  const V_GAP = 200

  // Position root chats in a grid
  rootChats.forEach((chat, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    nodes.push({
      id: chat.id,
      type: 'chatNode',
      position: { x: col * H_GAP + 60, y: row * V_GAP + 60 },
      data: {
        label: chat.title || 'Untitled',
        isDrift: false,
        isActive: chat.id === activeChatId,
        messageCount: chat.messages.length,
        lastMessage: chat.lastMessage ?? undefined,
      } satisfies ChatNodeData,
    })
  })

  // Build parent→children map for drift offset calculation
  const parentChildMap = new Map<string, string[]>()
  driftChats.forEach(drift => {
    const parentId = drift.metadata?.parentChatId
    if (parentId) {
      if (!parentChildMap.has(parentId)) parentChildMap.set(parentId, [])
      parentChildMap.get(parentId)!.push(drift.id)
    }
  })

  // Position drift chats relative to their parent
  driftChats.forEach(drift => {
    const parentId = drift.metadata?.parentChatId
    const parentNode = nodes.find(n => n.id === parentId)
    const siblings = parentChildMap.get(parentId ?? '') ?? []
    const sibIdx = siblings.indexOf(drift.id)

    const pos = parentNode
      ? {
          x: parentNode.position.x + 180 + sibIdx * 20,
          y: parentNode.position.y + 160 + sibIdx * 150,
        }
      : { x: 900, y: 60 + nodes.length * 150 }

    nodes.push({
      id: drift.id,
      type: 'chatNode',
      position: pos,
      data: {
        label: drift.title || drift.metadata?.selectedText || 'Drift',
        isDrift: true,
        isActive: drift.id === activeChatId,
        messageCount: drift.messages.length,
        selectedText: drift.metadata?.selectedText ?? undefined,
      } satisfies ChatNodeData,
    })

    if (parentId && nodes.find(n => n.id === parentId)) {
      const edgeLabel = (drift.metadata?.selectedText ?? '').substring(0, 28)
      edges.push({
        id: `e-${parentId}-${drift.id}`,
        source: parentId,
        target: drift.id,
        type: 'smoothstep',
        animated: true,
        label: edgeLabel || undefined,
        labelStyle: { fontSize: 9, fill: 'rgba(168,85,247,0.8)', fontStyle: 'italic' },
        labelBgStyle: { fill: 'rgba(13,13,18,0.85)', stroke: 'rgba(168,85,247,0.2)', strokeWidth: 1 },
        labelBgPadding: [4, 2] as [number, number],
        style: { stroke: 'rgba(168, 85, 247, 0.5)', strokeWidth: 1.5, strokeDasharray: '5,3' },
      })
    }
  })

  return { nodes, edges }
}

// ── Inner component (needs ReactFlowProvider context) ─────────────────────────

function KnowledgeGraphInner({ chatHistory, activeChatId, onClose, onSwitchChat }: Props) {
  const { fitView } = useReactFlow()
  const { nodes: initNodes, edges: initEdges } = buildLayout(chatHistory, activeChatId)
  const [nodes, , onNodesChange] = useNodesState(initNodes)
  const [edges, , onEdgesChange] = useEdgesState(initEdges)

  // Fit view on mount
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
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
  }, [onSwitchChat])

  const rootCount = chatHistory.filter(c => !c.metadata?.isDrift).length
  const driftCount = chatHistory.filter(c => c.metadata?.isDrift).length

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a]/98">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border/50 flex-shrink-0">
        <div>
          <h2 className="text-[14px] font-semibold text-text-primary">Knowledge Graph</h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            {rootCount} chat{rootCount !== 1 ? 's' : ''} &middot; {driftCount} drift{driftCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        {chatHistory.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted text-[14px]">
            No chats yet
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
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="rgba(255,255,255,0.06)"
            />
            <Controls
              style={{
                background: 'rgba(26,26,26,0.9)',
                border: '1px solid rgba(51,51,51,0.8)',
                borderRadius: 8,
              }}
            />
            <MiniMap
              nodeColor={(node) => {
                const d = node.data as ChatNodeData
                if (d.isActive) return 'rgba(168,85,247,0.9)'
                if (d.isDrift) return 'rgba(168,85,247,0.4)'
                return 'rgba(80,80,100,0.8)'
              }}
              maskColor="rgba(0,0,0,0.5)"
              style={{ background: 'rgba(17,17,17,0.9)', border: '1px solid rgba(51,51,51,0.8)', borderRadius: 8 }}
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
