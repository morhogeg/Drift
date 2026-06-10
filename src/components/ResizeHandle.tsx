import { useRef } from 'react'

interface ResizeHandleProps {
  /** Which edge of the parent panel this handle sits on (decides its position). */
  edge: 'left' | 'right'
  /** Fires on every pointer move during a drag, with the pointer's viewport X. */
  onResize: (clientX: number) => void
  onResizeStart?: () => void
  onResizeEnd?: () => void
  className?: string
}

/**
 * A thin vertical drag bar for resizing a panel. Desktop-only (`lg`+) — on mobile
 * the panels are full-screen sheets where dragging columns makes no sense.
 *
 * The handle is position-agnostic about widths: it just reports the pointer's
 * viewport X and lets the parent map that to a clamped width. The parent owns the
 * width state, so the main column (flex-1) reflows automatically.
 */
export default function ResizeHandle({
  edge,
  onResize,
  onResizeStart,
  onResizeEnd,
  className = '',
}: ResizeHandleProps) {
  const dragging = useRef(false)

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* ignore */ }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    onResizeStart?.()
  }

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    onResize(e.clientX)
  }

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    onResizeEnd?.()
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className={`group hidden lg:block absolute top-0 bottom-0 ${edge === 'left' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2'} w-2.5 z-50 cursor-col-resize ${className}`}
      style={{ touchAction: 'none' }}
    >
      {/* Hairline that lights up on hover / while dragging */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-accent-violet/0 group-hover:bg-accent-violet/50 group-active:bg-accent-violet/70 transition-colors duration-150" />
    </div>
  )
}
