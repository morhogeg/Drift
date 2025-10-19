import { useEffect, useRef, useState } from 'react'
import { features } from '../../config/features'
import { getCanonicalEntity, getLatestPriorMention } from '../../services/entities/indexer'
import { beginEntityJump, getNavigationState, jumpToPrior, pushForward } from '../../services/entities/navigation'
import type { EntityID, MessageID, Mention } from '../../types/entities'
import { track } from '../../services/entities/analytics'
import EntityPreviewCard from './EntityPreviewCard'

type Props = { entityId: EntityID; messageId: MessageID; surface: string }

export default function InlineEntityLink({ entityId, messageId, surface }: Props) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [prior, setPrior] = useState<Mention | null>(null)
  const ref = useRef<HTMLSpanElement | null>(null)
  const enterTimer = useRef<number | null>(null)
  const longPressTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => { if (enterTimer.current) window.clearTimeout(enterTimer.current) }
  }, [])

  const onMouseEnter = () => {
    if (features.contextLinks === 'inline-only' || features.contextLinks === 'off') return
    if (enterTimer.current) window.clearTimeout(enterTimer.current)
    enterTimer.current = window.setTimeout(async () => {
      const rect = ref.current?.getBoundingClientRect() || null
      setAnchor(rect)
      const m = getLatestPriorMention(entityId, messageId)
      setPrior(m)
      setOpen(true)
      track('context_link_hover', { entityId, messageId })
    }, 120)
  }
  const onMouseLeave = () => {
    if (enterTimer.current) window.clearTimeout(enterTimer.current)
  }

  const onTouchStart = () => {
    if (features.contextLinks === 'off') return
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current)
    longPressTimer.current = window.setTimeout(() => {
      const rect = ref.current?.getBoundingClientRect() || null
      setAnchor(rect)
      const m = getLatestPriorMention(entityId, messageId)
      setPrior(m)
      setOpen(true)
    }, 450)
  }
  const onTouchEnd = () => { if (longPressTimer.current) window.clearTimeout(longPressTimer.current) }

  const onJumpEarlier = () => {
    beginEntityJump(entityId, messageId)
    const target = jumpToPrior(entityId, messageId)
    if (target) {
      // Let app-level navigator handle scrolling via custom event
      window.dispatchEvent(new CustomEvent('drift:navigate-to-message', { detail: { entityId, from: messageId, to: target } }))
      pushForward(entityId, messageId)
      setOpen(false)
      track('preview_jump_back', { entityId, messageId })
    }
  }

  const onViewAll = () => {
    window.dispatchEvent(new CustomEvent('drift:open-all-mentions', { detail: { entityId } }))
    setOpen(false)
    track('all_mentions_opened', { entityId, messageId })
  }

  const onForward = () => {
    window.dispatchEvent(new CustomEvent('drift:forward-to-origin', { detail: { entityId } }))
  }

  const ent = getCanonicalEntity(entityId)
  const label = ent?.name || surface

  const showUnderline = features.contextLinks !== 'off'

  return (
    <span
      ref={ref}
      role="link"
      tabIndex={0}
      aria-label={`entity link: ${label}, press Enter for mentions`}
      className={showUnderline ? 'cursor-pointer underline decoration-dotted underline-offset-2 decoration-text-muted/60 hover:decoration-text-primary/80 text-text-secondary hover:text-text-primary transition-colors' : ''}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onViewAll}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onKeyDown={(e) => { if (e.key === 'Enter') onViewAll() }}
    >
      {surface}
      {open && anchor && features.contextLinks !== 'inline-only' && (
        <EntityPreviewCard
          entityId={entityId}
          priorMention={prior}
          anchorRect={anchor}
          onJump={onJumpEarlier}
          onViewAll={onViewAll}
          onForward={onForward}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  )
}
