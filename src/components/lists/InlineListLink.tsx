type Props = { toMessageId: string; anchorId: string; surface: string }

export default function InlineListLink({ toMessageId, anchorId, surface }: Props) {
  const onClick = () => {
    window.dispatchEvent(new CustomEvent('drift:navigate-to-message', { detail: { to: toMessageId, anchor: anchorId } }))
  }
  return (
    <span
      role="link"
      tabIndex={0}
      aria-label={`list link to original item`}
      className="cursor-pointer underline decoration-dotted underline-offset-2 decoration-text-muted/60 hover:decoration-text-primary/80 text-text-secondary hover:text-text-primary transition-colors"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
    >
      {surface}
    </span>
  )
}

