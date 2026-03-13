/**
 * DriftKnowledgeGraph — right-side panel with full dark canvas showing the
 * active chat and all its drift descendants as a zoomable radial mind map.
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
import type { ChatSession, Message } from '@/types/chat'
import { X } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatNodeData {
  label: string
  isDrift: boolean
  isActive: boolean
  messageCount: number
  depth: number
  selectedText?: string
  sourceMessageId?: string
  sourceMsgPreview?: string
  onScrollToSource?: () => void
  [key: string]: unknown
}

interface Props {
  chatHistory: ChatSession[]
  activeChatId: string | null
  onClose: () => void
  onSwitchChat: (chatId: string) => void
  onScrollToMessage: (messageId: string) => void
  getTempMessages?: (chatId: string) => Message[] | null
}

// ── Custom node component ────────────────────────────────────────────────────

// Invisible handles on all 4 sides so edges exit/enter from the nearest side
const HANDLE_STYLE = { opacity: 0, width: 6, height: 6 }

function ChatNode({ data }: NodeProps) {
  const d = data as ChatNodeData
  const isNestedDrift = d.isDrift && d.depth >= 2

  return (
    <div
      className={`
        rounded-2xl border cursor-pointer select-none transition-all duration-150
        ${d.isActive
          ? 'border-accent-violet shadow-[0_0_0_2px_rgba(168,85,247,0.35),0_0_20px_rgba(168,85,247,0.15)] bg-dark-elevated px-3.5 py-2.5'
          : isNestedDrift
            ? 'border-accent-violet/40 bg-[rgba(168,85,247,0.07)] hover:border-accent-violet/70 hover:bg-[rgba(168,85,247,0.12)] px-3 py-2'
            : d.isDrift
              ? 'border-accent-violet/25 bg-dark-surface hover:border-accent-violet/50 hover:shadow-[0_0_12px_rgba(168,85,247,0.1)] px-3.5 py-2.5'
              : 'border-dark-border/60 bg-dark-elevated hover:border-dark-border px-3.5 py-2.5'
        }
      `}
      style={{ minWidth: isNestedDrift ? 130 : 150, maxWidth: isNestedDrift ? 190 : 210 }}
    >
      {/* Handles on all 4 sides — edge routing picks nearest exit point */}
      <Handle type="source" position={Position.Top}    id="src-top"    style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right}  id="src-right"  style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} id="src-bottom" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Left}   id="src-left"   style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Top}    id="tgt-top"    style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Right}  id="tgt-right"  style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Bottom} id="tgt-bottom" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left}   id="tgt-left"   style={HANDLE_STYLE} />

      {d.isDrift && (
        <div className="text-[8px] font-semibold text-accent-violet/60 uppercase tracking-widest mb-1.5">
          {isNestedDrift ? '↗↗ nested drift' : '↗ drift'}
        </div>
      )}

      <div className={`font-semibold leading-snug ${isNestedDrift ? 'text-[11px] text-accent-violet/75' : `text-[12px] ${d.isDrift ? 'text-accent-violet/90' : 'text-text-primary'}`}`}>
        {d.selectedText || d.label}
      </div>

      {d.sourceMsgPreview && (
        <div className="text-[10px] text-text-muted/70 italic mt-1 leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          &ldquo;{d.sourceMsgPreview}&rdquo;
        </div>
      )}

      <div className="flex items-center justify-between mt-2 gap-1">
        <span className="text-[9px] text-text-muted/50">
          {d.messageCount} {d.messageCount === 1 ? 'msg' : 'msgs'}
        </span>
        {d.isDrift && d.sourceMessageId && d.onScrollToSource && (
          <button
            onClick={(e) => { e.stopPropagation(); (d.onScrollToSource as () => void)() }}
            className="text-[9px] text-accent-violet/50 hover:text-accent-violet transition-colors px-1.5 py-0.5 rounded-md hover:bg-accent-violet/10"
          >
            ↑ source
          </button>
        )}
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

    // Look in persisted history first, then fall back to temp conversations
    let chat = allChats.find(c => c.id === id)
    if (!chat && getTempMessages) {
      const tempMsgs = getTempMessages(id)
      if (tempMsgs) {
        // Synthesise a minimal ChatSession for the temp drift so it renders in the graph.
        const parentChat = allChats.find(c =>
          c.messages.some(m => m.driftInfos?.some(d => d.driftChatId === id))
        )
        const parentTempId = parentChat?.id ?? [...seen].find(sid =>
          getTempMessages(sid)?.some(m => m.driftInfos?.some(d => d.driftChatId === id))
        )
        const driftInfo = parentChat?.messages.flatMap(m => m.driftInfos ?? []).find(d => d.driftChatId === id)
          ?? getTempMessages(parentTempId ?? '')?.flatMap(m => m.driftInfos ?? []).find(d => d.driftChatId === id)
        chat = {
          id,
          title: driftInfo?.selectedText ? `"${driftInfo.selectedText}"` : 'Drift',
          messages: tempMsgs,
          lastMessage: tempMsgs[tempMsgs.length - 1]?.text?.slice(0, 100) ?? '',
          createdAt: new Date(),
          metadata: {
            isDrift: true,
            parentChatId: parentTempId ?? rootId,
            selectedText: driftInfo?.selectedText,
          },
        }
      }
    }

    if (chat) {
      result.push(chat)
      // Enqueue children from persisted history
      allChats.forEach(c => {
        if (c.metadata?.parentChatId === id && !seen.has(c.id)) queue.push(c.id)
      })
      // Also enqueue children recorded in driftInfos within this chat's messages
      const msgsToCheck = chat.messages
      if (getTempMessages) {
        for (const msg of msgsToCheck) {
          if (msg.hasDrift && msg.driftInfos) {
            for (const info of msg.driftInfos) {
              if (!seen.has(info.driftChatId)) queue.push(info.driftChatId)
            }
          }
        }
      }
    }
  }
  return result
}

// ── Radial layout builder ─────────────────────────────────────────────────────

/** Pick which handle side to exit/enter based on the child's angle from parent center */
function directionHandles(angle: number): { sourceHandle: string; targetHandle: string } {
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  if (a < Math.PI * 0.25 || a >= Math.PI * 1.75) return { sourceHandle: 'src-right', targetHandle: 'tgt-left' }
  if (a < Math.PI * 0.75) return { sourceHandle: 'src-bottom', targetHandle: 'tgt-top' }
  if (a < Math.PI * 1.25) return { sourceHandle: 'src-left', targetHandle: 'tgt-right' }
  return { sourceHandle: 'src-top', targetHandle: 'tgt-bottom' }
}

function buildRadialTree(
  chats: ChatSession[],
  rootId: string,
  activeChatId: string | null,
  allChats: ChatSession[],
  onScrollToMessage: (id: string) => void,
) {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const childrenMap = new Map<string, string[]>()
  for (const chat of chats) {
    if (chat.metadata?.parentChatId) {
      const p = chat.metadata.parentChatId
      if (!childrenMap.has(p)) childrenMap.set(p, [])
      childrenMap.get(p)!.push(chat.id)
    }
  }

  const RADII = [0, 260, 470, 660]
  const NODE_W = 180
  const NODE_H = 80

  // Track each node's angle so edges know which side to connect from
  const nodeAngle = new Map<string, number>()

  function place(id: string, angleStart: number, angleEnd: number, level: number) {
    const chat = chats.find(c => c.id === id)
    if (!chat) return

    const angle = level === 0 ? 0 : (angleStart + angleEnd) / 2
    nodeAngle.set(id, angle)

    const r = RADII[Math.min(level, RADII.length - 1)]
    const x = Math.cos(angle) * r - NODE_W / 2
    const y = Math.sin(angle) * r - NODE_H / 2

    let sourceMsgPreview: string | undefined
    if (chat.metadata?.parentChatId && chat.metadata?.sourceMessageId) {
      const parentChat = allChats.find(c => c.id === chat.metadata!.parentChatId)
      const srcMsg = parentChat?.messages.find(m => m.id === chat.metadata!.sourceMessageId)
      if (srcMsg) {
        const clean = srcMsg.text.replace(/[#*`[\]]/g, '').replace(/\n+/g, ' ').trim()
        sourceMsgPreview = clean.length > 55 ? clean.slice(0, 55) + '…' : clean
      }
    }

    const sourceMessageId = chat.metadata?.sourceMessageId
    nodes.push({
      id,
      type: 'chatNode',
      position: { x, y },
      data: {
        label: chat.title || (chat.metadata?.isDrift ? (chat.metadata.selectedText ?? 'Drift') : 'Untitled'),
        isDrift: !!chat.metadata?.isDrift,
        isActive: id === activeChatId,
        messageCount: chat.messages.length,
        depth: level,
        selectedText: chat.metadata?.selectedText,
        sourceMessageId,
        sourceMsgPreview,
        onScrollToSource: sourceMessageId ? () => onScrollToMessage(sourceMessageId) : undefined,
      } as ChatNodeData,
    })

    if (chat.metadata?.parentChatId) {
      // Edge exits the parent from the side closest to this child
      const { sourceHandle, targetHandle } = directionHandles(angle)
      const isNestedEdge = level >= 2
      // Show the selected phrase on the edge so hierarchy is immediately clear
      const edgeLabel = chat.metadata?.selectedText
        ? (chat.metadata.selectedText.length > 28 ? chat.metadata.selectedText.slice(0, 28) + '…' : chat.metadata.selectedText)
        : undefined
      edges.push({
        id: `e-${chat.metadata.parentChatId}-${id}`,
        source: chat.metadata.parentChatId,
        target: id,
        sourceHandle,
        targetHandle,
        type: 'default',
        label: edgeLabel,
        labelStyle: { fill: 'rgba(168,85,247,0.7)', fontSize: 9, fontWeight: 500 },
        labelBgStyle: { fill: 'rgba(10,10,10,0.75)' },
        labelBgPadding: [4, 3] as [number, number],
        style: {
          stroke: isNestedEdge ? 'rgba(168,85,247,0.75)' : 'rgba(168,85,247,0.4)',
          strokeWidth: isNestedEdge ? 2 : 1.5,
        },
        markerEnd: { type: 'arrowclosed' as const, color: isNestedEdge ? 'rgba(168,85,247,0.8)' : 'rgba(168,85,247,0.45)', width: 12, height: 12 },
      })
    }

    const children = childrenMap.get(id) || []
    if (!children.length) return

    const totalArc = level === 0 ? Math.PI * 2 : Math.PI * 1.2
    const midAngle = angle
    const arcStart = level === 0 ? 0 : midAngle - totalArc / 2
    const step = totalArc / children.length
    children.forEach((childId, i) => {
      place(childId, arcStart + i * step, arcStart + (i + 1) * step, level + 1)
    })
  }

  place(rootId, 0, Math.PI * 2, 0)
  return { nodes, edges }
}

// ── Inner component ───────────────────────────────────────────────────────────

function KnowledgeGraphInner({ chatHistory, activeChatId, onClose, onSwitchChat, onScrollToMessage, getTempMessages }: Props) {
  const { fitView } = useReactFlow()

  const rootId = activeChatId ? findRootId(activeChatId, chatHistory) : null
  const treeChats = rootId ? collectTree(rootId, chatHistory, getTempMessages) : []
  const hasTree = !!(rootId && treeChats.length > 1)

  const { nodes: initNodes, edges: initEdges } = hasTree
    ? buildRadialTree(treeChats, rootId!, activeChatId, chatHistory, onScrollToMessage)
    : { nodes: [], edges: [] }

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)

  // Rebuild graph whenever chat tree or active chat changes (fixes stale state bug)
  useEffect(() => {
    const rId = activeChatId ? findRootId(activeChatId, chatHistory) : null
    const tree = rId ? collectTree(rId, chatHistory, getTempMessages) : []
    if (rId && tree.length > 1) {
      const { nodes: n, edges: e } = buildRadialTree(tree, rId, activeChatId, chatHistory, onScrollToMessage)
      setNodes(n)
      setEdges(e)
      setTimeout(() => fitView({ padding: 0.18, duration: 350 }), 60)
    } else {
      setNodes([])
      setEdges([])
    }
  }, [chatHistory, activeChatId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initial fitView on mount
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.18, duration: 450 }), 60)
    return () => clearTimeout(t)
  }, [fitView])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Keep graph open when switching chats — lets users navigate the tree visually
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onSwitchChat(node.id)
  }, [onSwitchChat])

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
      <div className="fixed top-0 right-0 bottom-0 z-40 flex flex-col w-[520px] bg-dark-bg border-l border-dark-border/50 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border/40 flex-shrink-0 bg-dark-surface/80 backdrop-blur-sm">
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
