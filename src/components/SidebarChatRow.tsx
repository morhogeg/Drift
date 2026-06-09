/**
 * SidebarChatRow — a single row in the sidebar "previous chats" list.
 *
 * Renders three visually distinct row types so the list reads at a glance:
 *   - 'chat'      → a regular conversation (message bubble icon, primary text)
 *   - 'drift'     → a branched exploration (drift-curl icon, violet quoted term,
 *                   nested under its parent + a "from <parent>" origin caption)
 *   - 'synthesis' → a woven synthesis chat (sparkle icon, violet/pink accent)
 *
 * Purely presentational — all behavior (open, context menu, rename) is passed in.
 */

import { CornerDownRight, MessageSquare, Sparkles, Pin, Star } from 'lucide-react'
import type { ChatSession } from '@/types/chat'
import { getTextDirection, getRTLClassName } from '../utils/rtl'

export type SidebarRowKind = 'chat' | 'drift' | 'synthesis'

interface Props {
  chat: ChatSession
  kind: SidebarRowKind
  /** True when this is a drift nested under a parent chat (renders with indent rail). */
  nested?: boolean
  /** Human-readable title of the parent chat a drift branched from. */
  originTitle?: string
  isActive: boolean
  isPinned: boolean
  isStarred: boolean
  isEditing: boolean
  editingTitle: string
  stripMarkdown: (text: string) => string
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onEditTitleChange: (value: string) => void
  onSaveRename: () => void
  onCancelRename: () => void
}

export function SidebarChatRow({
  chat,
  kind,
  nested = false,
  originTitle,
  isActive,
  isPinned,
  isStarred,
  isEditing,
  editingTitle,
  stripMarkdown,
  onOpen,
  onContextMenu,
  onEditTitleChange,
  onSaveRename,
  onCancelRename,
}: Props) {
  const isDrift = kind === 'drift'
  const isSynthesis = kind === 'synthesis'

  // Active-row accent differs per type so the highlight feels intentional.
  const activeBg = isActive
    ? isDrift
      ? 'bg-accent-violet/[0.10]'
      : isSynthesis
        ? 'bg-gradient-to-r from-accent-pink/[0.10] to-accent-violet/[0.10]'
        : 'bg-dark-elevated/60'
    : 'hover:bg-dark-elevated/40'

  // Strip the surrounding quotes drift titles carry ("Juventus" → Juventus) so we
  // can present the term with our own typographic quotes.
  const driftTerm = chat.metadata?.selectedText?.trim() || chat.title.replace(/^"|"$/g, '')

  return (
    <div
      onClick={onOpen}
      onContextMenu={onContextMenu}
      className={`
        group relative cursor-pointer
        transition-all duration-100 ease-in-out
        ${nested ? 'pl-3 pr-3 py-2' : 'px-3 py-2.5'}
        ${activeBg}
      `}
    >
      {/* Nested drift: a soft violet rail on the left tying it to its parent. */}
      {nested && (
        <span
          aria-hidden
          className="absolute left-[1.05rem] top-0 bottom-0 w-px bg-gradient-to-b from-accent-violet/40 via-accent-violet/20 to-transparent"
        />
      )}

      {/* Active accent bar */}
      {isActive && (
        <span
          aria-hidden
          className={`absolute left-0 top-0 bottom-0 w-[2px] ${
            isSynthesis
              ? 'bg-gradient-to-b from-accent-pink to-accent-violet'
              : isDrift
                ? 'bg-accent-violet/80'
                : 'bg-text-secondary/50'
          }`}
        />
      )}

      {/* Pin indicator */}
      {isPinned && <Pin className="absolute top-2 right-2 w-3 h-3 text-cyan-400 fill-cyan-400" />}
      {/* Star indicator */}
      {isStarred && <Star className="absolute top-2 right-7 w-3 h-3 text-yellow-400 fill-yellow-400" />}

      <div className={`flex items-start gap-2 ${nested ? 'pl-3' : ''}`}>
        {/* Leading type icon */}
        <span className="mt-[3px] shrink-0">
          {isSynthesis ? (
            <Sparkles className="w-3.5 h-3.5 text-accent-pink" />
          ) : isDrift ? (
            <CornerDownRight className="w-3.5 h-3.5 text-accent-violet/80" />
          ) : (
            <MessageSquare className="w-3.5 h-3.5 text-text-muted" />
          )}
        </span>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => onEditTitleChange(e.target.value)}
              onBlur={onSaveRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveRename()
                if (e.key === 'Escape') onCancelRename()
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-dark-bg/50 text-text-primary text-sm font-medium
                       rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-accent-violet"
              autoFocus
            />
          ) : (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                {/* Type label chip — only for the special types, keeps regular chats clean. */}
                {isSynthesis && (
                  <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide
                                   text-accent-pink/90 bg-accent-pink/10 rounded px-1 py-px">
                    Synthesis
                  </span>
                )}
                {isDrift ? (
                  <h3
                    className={`text-[13px] font-medium truncate min-w-0 text-accent-violet/90 ${getRTLClassName(driftTerm)}`}
                    dir={getTextDirection(driftTerm)}
                  >
                    <span className="text-accent-violet/50">&ldquo;</span>
                    {driftTerm}
                    <span className="text-accent-violet/50">&rdquo;</span>
                  </h3>
                ) : (
                  <h3
                    className={`text-[13px] font-medium truncate min-w-0 text-text-primary ${getRTLClassName(chat.title)}`}
                    dir={getTextDirection(chat.title)}
                  >
                    {chat.title}
                  </h3>
                )}
              </div>

              {/* Drift origin caption — surfaces which chat the drift branched from. */}
              {isDrift && originTitle && (
                <p className="flex items-center gap-1 text-[10px] text-text-muted/80 truncate mt-0.5">
                  <span className="text-accent-violet/50 shrink-0">from</span>
                  <span
                    className={`truncate ${getRTLClassName(originTitle)}`}
                    dir={getTextDirection(originTitle)}
                  >
                    {originTitle}
                  </span>
                </p>
              )}

              {/* Preview line */}
              {chat.lastMessage && (
                <p
                  className={`text-[11px] text-text-muted truncate mt-0.5 ${getRTLClassName(chat.lastMessage)}`}
                  dir={getTextDirection(chat.lastMessage)}
                >
                  {stripMarkdown(chat.lastMessage)}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
