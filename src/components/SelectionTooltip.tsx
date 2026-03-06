import { useEffect, useState, useRef, useCallback } from 'react'
import { Bookmark, GitBranch } from 'lucide-react'
import { snippetStorage } from '../services/snippetStorage'

interface SelectionTooltipProps {
  onStartDrift: (text: string, messageId: string) => void
  currentChatId?: string
  currentChatTitle?: string
  onSnippetSaved?: () => void
}

interface TooltipState {
  visible: boolean
  x: number
  y: number
  text: string
  messageId: string
  isUserMessage: boolean
  anchorRect: DOMRect
}

/** Minimum selection length to show the tooltip (avoids showing on accidental clicks). */
const MIN_SELECTION_LENGTH = 3
/** Delay before the tooltip appears — avoids flash on quick clicks. */
const SHOW_DELAY_MS = 150

export default function SelectionTooltip({
  onStartDrift,
  currentChatId = '',
  currentChatTitle = 'Chat',
  onSnippetSaved,
}: SelectionTooltipProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const savedDataRef = useRef<{ text: string; messageId: string } | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const showTimerRef = useRef<number | null>(null)
  const isTooltipHoveredRef = useRef(false)
  const lastAnchorRectRef = useRef<DOMRect | null>(null)
  const selectionChangeTimerRef = useRef<number | null>(null)

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
  }, [])

  const clearSelectionChangeTimer = useCallback(() => {
    if (selectionChangeTimerRef.current !== null) {
      window.clearTimeout(selectionChangeTimerRef.current)
      selectionChangeTimerRef.current = null
    }
  }, [])

  const dismissTooltip = useCallback(() => {
    setTooltip(null)
    savedDataRef.current = null
    lastAnchorRectRef.current = null
  }, [])

  /** Clamp tooltip position so it never escapes the viewport. */
  const clampToViewport = useCallback(
    (rawX: number, rawY: number): { x: number; y: number } => {
      // We'll estimate tooltip width ~160px, height ~40px
      const tooltipW = 160
      const tooltipH = 44
      const margin = 8

      const x = Math.min(
        Math.max(rawX, tooltipW / 2 + margin),
        window.innerWidth - tooltipW / 2 - margin,
      )
      const y = Math.max(rawY, tooltipH + margin)

      return { x, y }
    },
    [],
  )

  const within = (rect: DOMRect, x: number, y: number, pad = 8) =>
    x >= rect.left - pad &&
    x <= rect.right + pad &&
    y >= rect.top - pad &&
    y <= rect.bottom + pad

  // --------------------------------------------------------------------------
  // Shared selection → tooltip logic (used by both mouse and touch paths)
  // --------------------------------------------------------------------------

  const tryShowTooltipFromSelection = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return

    const text = selection.toString().trim()
    if (text.length <= MIN_SELECTION_LENGTH) return

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) return
    lastAnchorRectRef.current = rect

    // Find the nearest .ai-message ancestor
    const anchorEl = selection.anchorNode?.parentElement
    const messageEl = anchorEl?.closest('[data-message-id]') ?? null
    if (!messageEl) return

    // Require the selection to be inside an .ai-message element
    if (!anchorEl?.closest('.ai-message')) return

    const msgId = messageEl.getAttribute('data-message-id')
    if (!msgId) return

    const isUserMessage =
      messageEl.className.includes('from-accent-pink') ||
      messageEl.className.includes('from-accent-violet')

    savedDataRef.current = { text, messageId: msgId }

    clearShowTimer()
    showTimerRef.current = window.setTimeout(() => {
      // Position above the selection, centred horizontally
      const rawX = rect.left + rect.width / 2
      const rawY = Math.max(rect.top - 10, 8)
      const { x, y } = clampToViewport(rawX, rawY)

      setTooltip({
        visible: true,
        x,
        y,
        text,
        messageId: msgId,
        isUserMessage,
        anchorRect: rect,
      })
      showTimerRef.current = null
    }, SHOW_DELAY_MS)
  }, [clearShowTimer, clampToViewport])

  // --------------------------------------------------------------------------
  // Touch / iOS events
  // --------------------------------------------------------------------------

  useEffect(() => {
    // touchend: wait for the browser to commit the selection after the finger lifts
    const handleTouchEnd = () => {
      window.setTimeout(() => {
        tryShowTooltipFromSelection()
      }, 350)
    }

    // selectionchange: fires when the user drags iOS selection handles
    const handleSelectionChange = () => {
      clearSelectionChangeTimer()
      selectionChangeTimerRef.current = window.setTimeout(() => {
        tryShowTooltipFromSelection()
        selectionChangeTimerRef.current = null
      }, 300)
    }

    document.addEventListener('touchend', handleTouchEnd, { passive: true })
    document.addEventListener('selectionchange', handleSelectionChange, { passive: true })

    return () => {
      document.removeEventListener('touchend', handleTouchEnd)
      document.removeEventListener('selectionchange', handleSelectionChange)
      clearSelectionChangeTimer()
    }
  }, [tryShowTooltipFromSelection, clearSelectionChangeTimer])

  // --------------------------------------------------------------------------
  // Mouse events
  // --------------------------------------------------------------------------

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Don't process clicks that land on the tooltip itself
      if ((e.target as HTMLElement).closest('.drift-tooltip')) return

      // Cancel any pending show timer from a previous mouseup
      clearShowTimer()

      // Use a small built-in delay to let the browser finalise the selection
      window.setTimeout(() => {
        const selection = window.getSelection()

        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
          // No selection — schedule hide unless tooltip is hovered
          if (!isTooltipHoveredRef.current && tooltip) {
            if (hideTimerRef.current == null) {
              hideTimerRef.current = window.setTimeout(() => {
                dismissTooltip()
                hideTimerRef.current = null
              }, 180)
            }
          }
          return
        }

        const text = selection.toString().trim()

        // Only show for meaningful selections (not accidental single-char clicks)
        if (text.length <= MIN_SELECTION_LENGTH) return

        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        lastAnchorRectRef.current = rect

        // Walk up DOM to find the message element
        let element = selection.anchorNode?.parentElement
        let messageEl: Element | null = null
        while (element && element !== document.body) {
          if (element.hasAttribute('data-message-id')) {
            messageEl = element
            break
          }
          element = element.parentElement
        }
        if (!messageEl) return

        const msgId = messageEl.getAttribute('data-message-id')
        if (!msgId) return

        const isUserMessage =
          messageEl.className.includes('from-accent-pink') ||
          messageEl.className.includes('from-accent-violet')

        // Save for when buttons are clicked (selection may be gone by then)
        savedDataRef.current = { text, messageId: msgId }

        // Apply show delay so tooltip doesn't flash on quick clicks
        showTimerRef.current = window.setTimeout(() => {
          const rawX = rect.left + rect.width / 2
          const rawY = Math.max(rect.top - 10, 8)
          const { x, y } = clampToViewport(rawX, rawY)

          setTooltip({
            visible: true,
            x,
            y,
            text,
            messageId: msgId,
            isUserMessage,
            anchorRect: rect,
          })
          showTimerRef.current = null
        }, SHOW_DELAY_MS)
      }, 10)
    }

    const handleTooltipEnter = () => {
      isTooltipHoveredRef.current = true
      clearHideTimer()
    }

    const handleTooltipLeave = () => {
      isTooltipHoveredRef.current = false
      hideTimerRef.current = window.setTimeout(() => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) {
          dismissTooltip()
        }
        hideTimerRef.current = null
      }, 200)
    }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!tooltip) return
      const tipEl = tooltipRef.current?.getBoundingClientRect()
      const ax = lastAnchorRectRef.current ?? tooltip.anchorRect
      const inside =
        (tipEl && within(tipEl, ev.clientX, ev.clientY, 6)) ||
        (ax && within(ax, ev.clientX, ev.clientY, 10))

      if (inside) {
        clearHideTimer()
      } else if (hideTimerRef.current == null) {
        hideTimerRef.current = window.setTimeout(() => {
          dismissTooltip()
          hideTimerRef.current = null
        }, 220)
      }
    }

    // Keyboard support when tooltip is visible: D = Drift, S = Save
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!tooltip) return
      // Don't intercept if user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return

      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        if (!tooltip.isUserMessage) handleDrift()
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        handleSave()
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('keydown', handleKeyDown)

    const tooltipEl = tooltipRef.current
    if (tooltipEl) {
      tooltipEl.addEventListener('mouseenter', handleTooltipEnter)
      tooltipEl.addEventListener('mouseleave', handleTooltipLeave)
    }

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('keydown', handleKeyDown)
      if (tooltipEl) {
        tooltipEl.removeEventListener('mouseenter', handleTooltipEnter)
        tooltipEl.removeEventListener('mouseleave', handleTooltipLeave)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooltip, clearHideTimer, clearShowTimer, clampToViewport, dismissTooltip])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearHideTimer()
      clearShowTimer()
      clearSelectionChangeTimer()
    }
  }, [clearHideTimer, clearShowTimer, clearSelectionChangeTimer])

  // --------------------------------------------------------------------------
  // Action handlers
  // --------------------------------------------------------------------------

  const handleDrift = () => {
    if (tooltip?.isUserMessage) return

    const data =
      savedDataRef.current ??
      (tooltip ? { text: tooltip.text, messageId: tooltip.messageId } : null)

    if (data) {
      onStartDrift(data.text, data.messageId)
      dismissTooltip()
      window.getSelection()?.removeAllRanges()
    }
  }

  const handleSave = () => {
    const data =
      savedDataRef.current ??
      (tooltip ? { text: tooltip.text, messageId: tooltip.messageId } : null)

    if (data) {
      snippetStorage.createSnippet(data.text, {
        chatId: currentChatId,
        chatTitle: currentChatTitle,
        messageId: data.messageId,
        isFullMessage: false,
        timestamp: new Date(),
      })
      dismissTooltip()
      window.getSelection()?.removeAllRanges()
      onSnippetSaved?.()
    }
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  if (!tooltip?.visible) return null

  return (
    <div
      ref={tooltipRef}
      className="drift-tooltip fixed z-[99999] animate-fade-up"
      style={{
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
        transform: 'translate(-50%, -100%)',
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div className="flex gap-2 bg-dark-elevated/95 backdrop-blur rounded-full p-1.5 border border-dark-border/70 shadow-lg">
        {!tooltip.isUserMessage && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onTouchStart={(e) => {
              e.stopPropagation()
            }}
            onTouchEnd={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleDrift()
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleDrift()
            }}
            title="Drift on selected text (D)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
                       bg-dark-bubble border border-dark-border/60 text-text-secondary
                       hover:border-accent-violet/40 hover:text-text-primary
                       transition-colors duration-150 cursor-pointer"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span className="text-[12px]">Drift</span>
          </button>
        )}

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onTouchStart={(e) => {
            e.stopPropagation()
          }}
          onTouchEnd={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleSave()
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleSave()
          }}
          title="Save selection to snippets (S)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
                     bg-dark-bubble border border-dark-border/60 text-text-secondary
                     hover:border-accent-violet/40 hover:text-text-primary
                     transition-colors duration-150 cursor-pointer"
        >
          <Bookmark className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[12px]">Save</span>
        </button>
      </div>

      {/* Downward arrow */}
      <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-dark-elevated/95 rotate-45 border-r border-b border-dark-border/70" />
    </div>
  )
}
