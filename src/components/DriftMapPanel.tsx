import { useMemo } from 'react'
import type { Message, ChatSession } from '@/types/chat'

interface DriftMapPanelProps {
  open: boolean
  onClose: () => void
  messages: Message[]
  chatHistory: ChatSession[]
  onNavigate: (chatId: string, messageId?: string) => void
  getTempMessages?: (chatId: string) => Message[] | null
}

interface BranchNode {
  selectedText: string
  driftChatId: string
  driftChat: ChatSession | undefined
  children: BranchNode[]
}

interface MessageNode {
  message: Message
  branches: BranchNode[]
}

function buildBranchNode(
  selectedText: string,
  driftChatId: string,
  chatHistory: ChatSession[],
  getTempMessages: ((chatId: string) => Message[] | null) | undefined,
  depth: number
): BranchNode {
  const driftChat = chatHistory.find((s) => s.id === driftChatId)
  const children: BranchNode[] = []

  // Look in chatHistory first, then fall back to in-memory temp conversations
  const messagesToCheck = driftChat?.messages ?? getTempMessages?.(driftChatId) ?? []

  if (depth < 3 && messagesToCheck.length > 0) {
    for (const msg of messagesToCheck) {
      if (msg.hasDrift && msg.driftInfos) {
        for (const info of msg.driftInfos) {
          children.push(buildBranchNode(info.selectedText, info.driftChatId, chatHistory, getTempMessages, depth + 1))
        }
      }
    }
  }

  return { selectedText, driftChatId, driftChat, children }
}

export default function DriftMapPanel({
  open,
  onClose,
  messages,
  chatHistory,
  onNavigate,
  getTempMessages,
}: DriftMapPanelProps) {
  const tree = useMemo<MessageNode[]>(() => {
    return messages
      .filter((m) => m.hasDrift && m.driftInfos && m.driftInfos.length > 0)
      .map((m) => ({
        message: m,
        branches: (m.driftInfos ?? []).map((info) =>
          buildBranchNode(info.selectedText, info.driftChatId, chatHistory, getTempMessages, 1)
        ),
      }))
  }, [messages, chatHistory])

  const totalBranches = useMemo(() => {
    let count = 0
    const countBranches = (nodes: BranchNode[]) => {
      for (const n of nodes) {
        count++
        countBranches(n.children)
      }
    }
    for (const node of tree) {
      countBranches(node.branches)
    }
    return count
  }, [tree])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 z-50 flex flex-col
          bg-dark-bg border-l border-dark-border
          transition-transform duration-300
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-dark-surface/95 backdrop-blur-xl border-b border-dark-border/60 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary tracking-tight">↗ Drift Map</span>
            {totalBranches > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent-violet/20 text-accent-violet border border-accent-violet/30">
                {totalBranches} {totalBranches === 1 ? 'branch' : 'branches'}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-lg leading-none"
            aria-label="Close drift map"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <span className="text-2xl opacity-30">↗</span>
              <p className="text-sm font-medium text-text-secondary">No drifts yet</p>
              <p className="text-xs text-text-muted leading-relaxed">
                Select any text from an AI message to start exploring
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {tree.map((node, nodeIdx) => (
                <div key={node.message.id}>
                  {/* Message node (spine) */}
                  <button
                    className="w-full flex items-start gap-2 text-left py-1.5 px-1 rounded hover:bg-dark-elevated/40 transition-colors group"
                    onClick={() => onNavigate('', node.message.id)}
                  >
                    <span className="text-text-muted text-[10px] mt-0.5 shrink-0">●</span>
                    <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors leading-relaxed truncate">
                      {node.message.text.slice(0, 60)}
                      {node.message.text.length > 60 ? '…' : ''}
                    </span>
                  </button>

                  {/* Branch nodes */}
                  {node.branches.length > 0 && (
                    <div className="ml-[7px] border-l-2 border-dark-border/40">
                      {node.branches.map((branch) => (
                        <div key={branch.driftChatId} className="ml-6">
                          <button
                            className="w-full flex items-start gap-2 text-left py-1.5 px-1 rounded hover:bg-accent-violet/[0.06] transition-colors group"
                            onClick={() => onNavigate(branch.driftChatId)}
                          >
                            <span className="text-accent-violet text-[10px] mt-0.5 shrink-0">○</span>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-accent-violet truncate">
                                {branch.selectedText.slice(0, 60)}
                                {branch.selectedText.length > 60 ? '…' : ''}
                              </p>
                              {branch.driftChat && (
                                <p className="text-[11px] text-text-muted truncate mt-0.5">
                                  {branch.driftChat.title.slice(0, 50)}
                                  {branch.driftChat.title.length > 50 ? '…' : ''}
                                </p>
                              )}
                            </div>
                          </button>

                          {/* Sub-branch nodes */}
                          {branch.children.length > 0 && (
                            <div className="ml-[7px] border-l-2 border-accent-violet/20">
                              {branch.children.map((sub) => (
                                <div key={sub.driftChatId} className="ml-12">
                                  <button
                                    className="w-full flex items-start gap-2 text-left py-1.5 px-1 rounded hover:bg-pink-500/[0.06] transition-colors group"
                                    onClick={() => onNavigate(sub.driftChatId)}
                                  >
                                    <span className="text-accent-pink text-[9px] mt-0.5 shrink-0">○</span>
                                    <div className="min-w-0">
                                      <p className="text-[11px] font-medium text-accent-pink truncate">
                                        {sub.selectedText.slice(0, 60)}
                                        {sub.selectedText.length > 60 ? '…' : ''}
                                      </p>
                                      {sub.driftChat && (
                                        <p className="text-[10px] text-text-muted truncate mt-0.5">
                                          {sub.driftChat.title.slice(0, 50)}
                                          {sub.driftChat.title.length > 50 ? '…' : ''}
                                        </p>
                                      )}
                                    </div>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Connector line between message nodes */}
                  {nodeIdx < tree.length - 1 && (
                    <div className="ml-[7px] border-l-2 border-dark-border/40 h-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
