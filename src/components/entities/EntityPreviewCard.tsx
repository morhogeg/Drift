import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EntityID, MessageID, Mention } from '../../types/entities'
import { getCanonicalEntity } from '../../services/entities/indexer'
import { getNavigationState } from '../../services/entities/navigation'

type Props = {
  entityId: EntityID
  priorMention: Mention | null
  anchorRect: DOMRect
  onJump: (targetMessageId: MessageID) => void
  onViewAll: () => void
  onForward: () => void
  onClose: () => void
}

export default function EntityPreviewCard({ entityId, priorMention, anchorRect, onJump, onViewAll, onForward, onClose }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ent = getCanonicalEntity(entityId)
  const nav = getNavigationState(entityId)

  useLayoutEffect(() => {
    const margin = 8
    const width = 320
    const height = 160
    // anchorRect is viewport-relative; keep tooltip fixed to viewport without adding window scroll offsets
    let top = anchorRect.bottom + margin
    let left = Math.min(Math.max(anchorRect.left - width / 2, 12), window.innerWidth - width - 12)
    if (top + height > window.innerHeight) {
      top = anchorRect.top - height - margin
    }
    setPos({ top, left })
  }, [anchorRect])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  if (!pos) return null
  return createPortal(
    <div
      className="drift-tooltip fixed z-50 bg-dark-elevated border border-dark-border/60 rounded-xl shadow-xl w-[320px] p-3 text-[13px]"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-labelledby={`entity-${entityId}-label`}
    >
      <div id={`entity-${entityId}-label`} className="text-text-primary font-semibold mb-1 truncate">{ent?.name || priorMention?.surface || 'Entity'}</div>
      <div className="text-text-secondary line-clamp-3 mb-2">
        {priorMention?.snippet || 'No prior mention in this conversation.'}
      </div>
      <div className="flex gap-2">
        <button className="px-2 py-1 rounded bg-accent-violet/15 border border-accent-violet/30 text-accent-violet hover:bg-accent-violet/25" onClick={() => priorMention && onJump(priorMention.messageId)}>Jump to earlier</button>
        {nav.forwardStack.length > 0 && (
          <button className="px-2 py-1 rounded bg-dark-elevated border border-dark-border/60 text-text-secondary hover:border-text-secondary/40" onClick={onForward}>Forward to here</button>
        )}
        <button className="ml-auto px-2 py-1 rounded bg-dark-elevated border border-dark-border/60 text-text-secondary hover:border-text-secondary/40" onClick={onViewAll}>View all</button>
      </div>
    </div>,
    document.body
  )
}
