type Props = {
  /** The earlier message that originally listed this item (cross-reference target). */
  toMessageId: string
  /** The message this clickable term is rendered in — the drift's source/parent. */
  fromMessageId?: string
  anchorId: string
  surface: string
}

export default function InlineListLink({ toMessageId, fromMessageId, anchorId, surface }: Props) {
  const onClick = () => {
    // Bug 8: a clickable AI term opens a focused drift on that term, recorded on
    // the map exactly like a text-selection drift. We dispatch the drift-start
    // event (App routes it through the canonical drift path → driftInfos + a
    // registered drift session → a node/edge with full lineage). If no host is
    // listening (e.g. the term isn't drift-eligible), fall back to navigating to
    // the original list item so the link never feels dead.
    const term = surface.trim()
    const source = fromMessageId || toMessageId
    if (term && source) {
      window.dispatchEvent(
        new CustomEvent('drift:start-from-term', { detail: { term, messageId: source } }),
      )
      return
    }
    window.dispatchEvent(
      new CustomEvent('drift:navigate-to-message', { detail: { to: toMessageId, anchor: anchorId } }),
    )
  }
  return (
    <span
      role="link"
      tabIndex={0}
      dir="auto"
      aria-label={`Drift into "${surface}"`}
      className="cursor-pointer underline decoration-dotted underline-offset-2 decoration-text-muted/60 hover:decoration-text-primary/80 text-text-secondary hover:text-text-primary transition-colors"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
    >
      {surface}
    </span>
  )
}
