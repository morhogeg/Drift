import { useMemo } from 'react'
import { X } from 'lucide-react'
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
  const messagesToCheck = driftChat?.messages ?? getTempMessages?.(driftChatId) ?? []

  if (depth < 4 && messagesToCheck.length > 0) {
    const seen = new Set<string>()
    for (const msg of messagesToCheck) {
      if (msg.hasDrift && msg.driftInfos) {
        for (const info of msg.driftInfos) {
          if (!seen.has(info.driftChatId)) {
            seen.add(info.driftChatId)
            children.push(buildBranchNode(info.selectedText, info.driftChatId, chatHistory, getTempMessages, depth + 1))
          }
        }
      }
    }
  }

  return { selectedText, driftChatId, driftChat, children }
}

function BranchItem({
  branch,
  depth,
  onNavigate,
}: {
  branch: BranchNode
  depth: number
  onNavigate: (chatId: string) => void
}) {
  const accentColor = depth === 1 ? 'text-accent-violet' : 'text-accent-pink'
  const hoverBg = depth === 1 ? 'hover:bg-accent-violet/[0.06]' : 'hover:bg-pink-500/[0.06]'
  const borderColor = depth === 1 ? 'border-accent-violet/25' : 'border-accent-pink/20'

  // Don't show title if it's the same as (or just a quoted form of) the selectedText
  const normalise = (s: string) => s.toLowerCase().replace(/^["'""]|["'""]$/g, '').trim()
  const titleDiffersFromSelection =
    branch.driftChat &&
    normalise(branch.driftChat.title) !== normalise(branch.selectedText) &&
    !branch.driftChat.title.toLowerCase().startsWith('drift:') &&
    !branch.driftChat.title.toLowerCase().startsWith('drift from:')

  return (
    <div>
      <button
        className={`w-full flex items-start gap-2.5 text-left py-1.5 px-2 rounded-lg ${hoverBg} transition-colors group`}
        onClick={() => onNavigate(branch.driftChatId)}
      >
        <span className={`${accentColor} text-[9px] mt-1 shrink-0 opacity-70`}>○</span>
        <div className="min-w-0 flex-1">
          <p className={`text-[12px] font-medium ${accentColor} leading-snug`}>
            {branch.selectedText.length > 55
              ? branch.selectedText.slice(0, 55) + '…'
              : branch.selectedText}
          </p>
          {titleDiffersFromSelection && (
            <p className="text-[11px] text-text-muted truncate mt-0.5 leading-snug">
              {branch.driftChat!.title.length > 48
                ? branch.driftChat!.title.slice(0, 48) + '…'
                : branch.driftChat!.title}
            </p>
          )}
        </div>
      </button>

      {branch.children.length > 0 && (
        <div className={`ml-5 pl-3 border-l ${borderColor} mt-0.5 mb-1`}>
          {branch.children.map((child) => (
            <BranchItem key={child.driftChatId} branch={child} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  )
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
    const seenDriftIds = new Set<string>()
    return messages
      .filter((m) => m.hasDrift && m.driftInfos && m.driftInfos.length > 0)
      .map((m) => ({
        message: m,
        branches: (m.driftInfos ?? [])
          .filter((info) => {
            if (seenDriftIds.has(info.driftChatId)) return false
            seenDriftIds.add(info.driftChatId)
            return true
          })
          .map((info) =>
            buildBranchNode(info.selectedText, info.driftChatId, chatHistory, getTempMessages, 1)
          ),
      }))
      .filter((node) => node.branches.length > 0)
  }, [messages, chatHistory])

  const totalBranches = useMemo(() => {
    let count = 0
    const countBranches = (nodes: BranchNode[]) => {
      for (const n of nodes) {
        count++
        countBranches(n.children)
      }
    }
    for (const node of tree) countBranches(node.branches)
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
          bg-dark-bg border-l border-dark-border/60
          transition-transform duration-300
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-dark-surface/95 backdrop-blur-xl border-b border-dark-border/50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-semibold text-text-primary tracking-tight shrink-0">↗ Drift Map</span>
            {totalBranches > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent-violet/15 text-accent-violet border border-accent-violet/25 shrink-0">
                {totalBranches} {totalBranches === 1 ? 'branch' : 'branches'}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-2 shrink-0 p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
            aria-label="Close drift map"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-3 px-3">
          {tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <span className="text-2xl opacity-20">↗</span>
              <p className="text-[13px] font-medium text-text-secondary">No drifts yet</p>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Select any text from an AI message to start exploring
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tree.map((node) => (
                <div key={node.message.id}>
                  {/* Source message */}
                  <button
                    className="w-full flex items-start gap-2.5 text-left py-1.5 px-2 rounded-lg hover:bg-dark-elevated/50 transition-colors group"
                    onClick={() => onNavigate('', node.message.id)}
                  >
                    <span className="text-text-muted/50 text-[10px] mt-0.5 shrink-0">●</span>
                    <span className="text-[12px] text-text-secondary group-hover:text-text-primary transition-colors leading-snug">
                      {node.message.text.length > 65
                        ? node.message.text.slice(0, 65) + '…'
                        : node.message.text}
                    </span>
                  </button>

                  {/* Branches */}
                  {node.branches.length > 0 && (
                    <div className="ml-5 pl-3 border-l border-dark-border/50 mt-0.5">
                      {node.branches.map((branch) => (
                        <BranchItem
                          key={branch.driftChatId}
                          branch={branch}
                          depth={1}
                          onNavigate={(id) => onNavigate(id)}
                        />
                      ))}
                    </div>
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
