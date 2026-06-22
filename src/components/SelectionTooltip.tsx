import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Bookmark, GitBranch, Lightbulb, Telescope, Waypoints, Scale, Aperture, Plus, FlaskConical } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { snippetStorage } from '../services/snippetStorage'
import { customLensStore, type CustomLens } from '../lib/customLenses'
import { useUIStore } from '../store/uiStore'
import type { LensKey } from '../types/chat'

type TemplateType = LensKey

interface SelectionTooltipProps {
  onStartDrift: (text: string, messageId: string, templateType?: TemplateType) => void
  currentChatId?: string
  currentChatTitle?: string
  onSnippetSaved?: () => void
  onFirstSelection?: () => void
}

interface TooltipState {
  visible: boolean
  x: number
  y: number
  /** 'above' anchors the tooltip's bottom edge to y (renders upward); 'below' anchors its top edge. */
  placement: 'above' | 'below'
  text: string
  messageId: string
  isUserMessage: boolean
  anchorRect: DOMRect
}

/** Read an env(safe-area-inset-*) value (px) via a one-off probe element. */
function safeInset(side: 'top' | 'bottom' | 'left' | 'right'): number {
  if (typeof document === 'undefined') return 0
  try {
    const probe = document.createElement('div')
    probe.style.cssText = `position:fixed;left:-9999px;top:-9999px;${side === 'top' || side === 'bottom' ? 'height' : 'width'}:env(safe-area-inset-${side});`
    document.body.appendChild(probe)
    const px = (side === 'top' || side === 'bottom') ? probe.offsetHeight : probe.offsetWidth
    document.body.removeChild(probe)
    return Number.isFinite(px) ? px : 0
  } catch {
    return 0
  }
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
  onFirstSelection,
}: SelectionTooltipProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const savedDataRef = useRef<{ text: string; messageId: string } | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const showTimerRef = useRef<number | null>(null)
  const isTooltipHoveredRef = useRef(false)
  const lastAnchorRectRef = useRef<DOMRect | null>(null)
  const selectionChangeTimerRef = useRef<number | null>(null)
  /** True while a finger is on the screen — suppresses premature dismiss during selection handle dragging. */
  const touchActiveRef = useRef(false)
  /** Timestamp of the last touchend — used to suppress selectionchange-triggered dismiss that fires right after a tap/lift. */
  const lastTouchEndRef = useRef(0)
  /** Ensures onFirstSelection is called at most once. */
  const hasCalledFirstSelection = useRef(false)

  // Detect touch/iOS device
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

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

  /**
   * Position the desktop floating tooltip so it (and every button) stays fully
   * within the viewport. Flips below the selection when there isn't room above,
   * and clamps X so the horizontal edges never overflow. Accounts for safe-area
   * insets so notches/home-indicators don't clip it on mobile web.
   */
  const positionTooltip = useCallback(
    (anchor: DOMRect): { x: number; y: number; placement: 'above' | 'below' } => {
      // Worst-case dimensions for the full tooltip (incl. template row). Using a
      // generous estimate guarantees clamping keeps the whole control on-screen.
      const tooltipW = 300
      const tooltipH = 96
      const gap = 10
      const margin = 8
      const insetT = safeInset('top')
      const insetB = safeInset('bottom')
      const insetL = safeInset('left')
      const insetR = safeInset('right')

      const vw = window.innerWidth
      const vh = window.innerHeight

      // Decide placement: prefer above, flip below if it would overflow the top.
      const spaceAbove = anchor.top - insetT - margin
      const placement: 'above' | 'below' = spaceAbove >= tooltipH + gap ? 'above' : 'below'

      // Anchor Y: for 'above' we anchor the tooltip's BOTTOM edge just above the
      // selection; for 'below' we anchor its TOP edge just below it. The render
      // uses translateY accordingly.
      let y: number
      if (placement === 'above') {
        y = anchor.top - gap
        // Ensure the top of the (upward-growing) tooltip clears the safe inset.
        y = Math.max(y, insetT + margin + tooltipH)
      } else {
        y = anchor.bottom + gap
        // Ensure the bottom edge clears the safe inset.
        y = Math.min(y, vh - insetB - margin - tooltipH)
        y = Math.max(y, insetT + margin)
      }

      // Center horizontally on the selection, then clamp both edges on-screen.
      const rawX = anchor.left + anchor.width / 2
      const minX = insetL + margin + tooltipW / 2
      const maxX = vw - insetR - margin - tooltipW / 2
      const x = maxX >= minX ? Math.min(Math.max(rawX, minX), maxX) : vw / 2

      return { x, y, placement }
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

    if (!hasCalledFirstSelection.current && onFirstSelection) {
      hasCalledFirstSelection.current = true
      onFirstSelection()
    }

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) return
    lastAnchorRectRef.current = rect

    // Find the nearest .ai-message ancestor — check both anchor and focus nodes
    // because on iOS, dragging the end handle moves focusNode while anchorNode stays fixed.
    const anchorEl = selection.anchorNode?.parentElement
    const focusEl = selection.focusNode?.parentElement
    const aiAncestorEl =
      anchorEl?.closest('.ai-message') ?? focusEl?.closest('.ai-message') ?? null
    if (!aiAncestorEl) return

    const messageEl =
      anchorEl?.closest('[data-message-id]') ??
      focusEl?.closest('[data-message-id]') ??
      null
    if (!messageEl) return

    const msgId = messageEl.getAttribute('data-message-id')
    if (!msgId) return

    const isUserMessage =
      messageEl.className.includes('from-accent-pink') ||
      messageEl.className.includes('from-accent-violet')

    savedDataRef.current = { text, messageId: msgId }

    clearShowTimer()
    showTimerRef.current = window.setTimeout(() => {
      if (isTouchDevice) {
        // On touch devices, use a fixed bottom bar — no position calculation needed
        setTooltip({
          visible: true,
          x: 0,
          y: 0,
          placement: 'above',
          text,
          messageId: msgId,
          isUserMessage,
          anchorRect: rect,
        })
      } else {
        const { x, y, placement } = positionTooltip(rect)

        setTooltip({
          visible: true,
          x,
          y,
          placement,
          text,
          messageId: msgId,
          isUserMessage,
          anchorRect: rect,
        })
      }
      showTimerRef.current = null
    }, SHOW_DELAY_MS)
  }, [clearShowTimer, positionTooltip, isTouchDevice])

  // --------------------------------------------------------------------------
  // Touch / iOS events
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!isTouchDevice) return

    const handleTouchStart = () => {
      touchActiveRef.current = true
    }

    // touchend: wait for the browser to commit the selection after the finger lifts.
    // Cancel any pending selectionchange dismiss first so it doesn't race us.
    const handleTouchEnd = () => {
      touchActiveRef.current = false
      lastTouchEndRef.current = Date.now()
      clearSelectionChangeTimer()
      window.setTimeout(() => {
        tryShowTooltipFromSelection()
      }, 300)
    }

    // selectionchange: fires continuously while the user drags iOS selection handles.
    // Only dismiss if: not mid-touch AND enough time has passed since last touchend
    // (to avoid false-dismiss when iOS fires selectionchange right after finger lift).
    const handleSelectionChange = () => {
      clearSelectionChangeTimer()
      selectionChangeTimerRef.current = window.setTimeout(() => {
        // Suppress if a finger is still down or we just lifted within 400ms
        const msSinceTouchEnd = Date.now() - lastTouchEndRef.current
        if (touchActiveRef.current || msSinceTouchEnd < 400) {
          selectionChangeTimerRef.current = null
          return
        }
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
          // User deliberately deselected — hide the bar
          dismissTooltip()
        } else {
          tryShowTooltipFromSelection()
        }
        selectionChangeTimerRef.current = null
      }, 300)
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })
    document.addEventListener('selectionchange', handleSelectionChange, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchend', handleTouchEnd)
      document.removeEventListener('selectionchange', handleSelectionChange)
      clearSelectionChangeTimer()
    }
  }, [tryShowTooltipFromSelection, clearSelectionChangeTimer, dismissTooltip, isTouchDevice])

  // --------------------------------------------------------------------------
  // Mouse events (desktop only)
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (isTouchDevice) return

    const handleMouseUp = (e: MouseEvent) => {
      // Don't process clicks that land on the tooltip itself. Guard non-element
      // targets (e.g. synthetic events dispatched on document) which lack closest().
      const tgt = e.target
      if (tgt instanceof Element && tgt.closest('.drift-tooltip')) return

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
          const { x, y, placement } = positionTooltip(rect)

          setTooltip({
            visible: true,
            x,
            y,
            placement,
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
        return
      }

      // Keep the tooltip alive while a real selection is still active. Dismissing
      // purely on cursor geometry made it flicker shut when the pointer drifted a
      // few px off the selection box — so the menu only goes away once the text is
      // actually deselected (handled on mouseup / click-elsewhere).
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.toString().trim()) {
        clearHideTimer()
        return
      }

      if (hideTimerRef.current == null) {
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
      const tgt = e.target
      if (tgt instanceof HTMLElement) {
        const tag = tgt.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tgt.isContentEditable) return
      }

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
  }, [tooltip, clearHideTimer, clearShowTimer, positionTooltip, dismissTooltip, isTouchDevice])

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

  const handleDrift = (templateType?: TemplateType) => {
    if (tooltip?.isUserMessage) return

    const data =
      savedDataRef.current ??
      (tooltip ? { text: tooltip.text, messageId: tooltip.messageId } : null)

    if (data) {
      onStartDrift(data.text, data.messageId, templateType)
      dismissTooltip()
      window.getSelection()?.removeAllRanges()
    }
  }

  // Each action carries its own signature hue. Connect uses the app's discovery
  // cyan so it matches the Connections page exactly; the others read amber/blue/
  // rose so all four are distinguishable. A divider still splits the menu into
  // the "go deeper" (Simplify, Deep dive) and "push outward" (Connect, Challenge)
  // pairs without relying on color alone.
  const TEMPLATES: Array<{ type: TemplateType; label: string; desc: string; Icon: LucideIcon }> = [
    { type: 'simplify',  label: 'Simplify',  desc: 'Explain it simply',     Icon: Lightbulb },
    { type: 'research',  label: 'Deep dive', desc: 'Facts & background',    Icon: Telescope },
    { type: 'connect',   label: 'Connect',   desc: 'Where does this lead?', Icon: Waypoints },
    { type: 'challenge', label: 'Stress test', desc: 'Pressure-test the claim',  Icon: Scale },
    { type: 'evidence',  label: 'Evidence',  desc: 'Sources & citations',  Icon: FlaskConical },
  ]
  /** Index where the menu splits "understand this" from "push outward / scrutinize". */
  const TEMPLATE_DIVIDER_AT = 2
  /** Per-action tint — icon (rest + hover) and the card's hover border. */
  const ACTION_TINT: Record<string, { icon: string; border: string }> = {
    simplify:  { icon: 'text-amber-400/70 group-hover:text-amber-400',                       border: 'hover:border-amber-400/40' },
    research:  { icon: 'text-blue-400/70 group-hover:text-blue-400',                         border: 'hover:border-blue-400/40' },
    connect:   { icon: 'text-accent-discovery/70 group-hover:text-accent-discovery',          border: 'hover:border-accent-discovery/40' },
    challenge: { icon: 'text-rose-400/70 group-hover:text-rose-400',                         border: 'hover:border-rose-400/40' },
    evidence:  { icon: 'text-violet-400/70 group-hover:text-violet-400',                     border: 'hover:border-violet-400/40' },
  }
  const openLensEditor = useUIStore((s) => s.openCustomLensEditor)
  const lensVersion = useUIStore((s) => s.customLensesVersion)
  // User-defined lenses, appended after the built-ins on both layouts. Re-read when
  // the shared version bumps so a lens created from the inline sheet appears at once.
  const customLenses: CustomLens[] = useMemo(
    () => (tooltip && !tooltip.isUserMessage ? customLensStore.getAll() : []),
    [tooltip, lensVersion],
  )
  const openNewLens = () => { dismissTooltip(); window.getSelection()?.removeAllRanges(); openLensEditor() }

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

  // Touch/iOS: floating pill action bar
  if (isTouchDevice) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: `calc(env(safe-area-inset-bottom) + var(--composer-h, 64px) + 16px)`,
          left: '20px',
          right: '20px',
          zIndex: 99997,
        }}
        className="animate-fade-up"
        onMouseDown={(e) => e.preventDefault()}
      >
        {/* Outer wrapper clips to the rounded-pill shape; the inner row scrolls
            horizontally on narrow phones so no action button is ever clipped. */}
        <div className="rounded-2xl overflow-hidden bg-dark-surface/95 backdrop-blur-2xl border border-dark-border shadow-[0_16px_48px_rgba(0,0,0,0.6),0_4px_16px_rgba(0,0,0,0.4)]">
        <div
          className="flex items-stretch flex-nowrap overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {!tooltip.isUserMessage ? (
            <>
              {/* Primary Drift action — most prominent, pink→violet gradient */}
              <button
                type="button"
                className="flex items-center justify-center gap-1.5 px-3.5 py-3 text-[13px] font-semibold tracking-tight
                           bg-gradient-to-br from-accent-pink to-accent-violet text-white
                           transition-all duration-150 active:opacity-80 flex-shrink-0 whitespace-nowrap"
                onTouchEnd={(e) => { e.preventDefault(); handleDrift() }}
                onClick={() => handleDrift()}
              >
                <GitBranch className="w-[15px] h-[15px]" strokeWidth={2.25} />
                Drift into
              </button>
              {/* Template actions — uniform layout; icon tint + a divider before the
                  'extend' pair groups them into understand vs. push-outward. */}
              {TEMPLATES.map((t, i) => (
                <button
                  key={t.type}
                  type="button"
                  className={`flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-1 py-2 min-w-[64px]
                             text-text-secondary transition-colors duration-150
                             active:bg-black/[0.06] dark:active:bg-white/[0.07] active:text-text-primary whitespace-nowrap
                             ${i === TEMPLATE_DIVIDER_AT ? 'border-l-2 border-dark-border' : 'border-l border-dark-border'}`}
                  onTouchEnd={(e) => { e.preventDefault(); handleDrift(t.type) }}
                  onClick={() => handleDrift(t.type)}
                >
                  <t.Icon className={`w-[17px] h-[17px] ${ACTION_TINT[t.type].icon}`} strokeWidth={1.9} />
                  <span className="text-[11px] font-medium leading-none">{t.label}</span>
                </button>
              ))}
              {customLenses.map((lens, i) => (
                <button
                  key={lens.id}
                  type="button"
                  className={`flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-1 py-2 min-w-[64px]
                             text-text-secondary transition-colors duration-150
                             active:bg-black/[0.06] dark:active:bg-white/[0.07] active:text-text-primary whitespace-nowrap
                             ${i === 0 ? 'border-l-2 border-dark-border' : 'border-l border-dark-border'}`}
                  onTouchEnd={(e) => { e.preventDefault(); handleDrift(lens.id) }}
                  onClick={() => handleDrift(lens.id)}
                >
                  <Aperture className="w-[17px] h-[17px]" strokeWidth={1.9} style={{ color: lens.color }} />
                  <span className="text-[11px] font-medium leading-none max-w-[72px] truncate">{lens.name}</span>
                </button>
              ))}
              <button
                type="button"
                className="flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-1 py-2 min-w-[64px]
                           text-text-muted transition-colors duration-150
                           active:bg-black/[0.06] dark:active:bg-white/[0.07] active:text-text-primary whitespace-nowrap border-l border-dark-border"
                onTouchEnd={(e) => { e.preventDefault(); openNewLens() }}
                onClick={openNewLens}
                aria-label="Create a custom lens"
              >
                <Plus className="w-[17px] h-[17px]" strokeWidth={1.9} />
                <span className="text-[11px] font-medium leading-none">New lens</span>
              </button>
              <button
                type="button"
                className="flex items-center justify-center px-3.5 py-3 text-accent-violet/80 border-l border-dark-border
                           active:text-accent-violet active:bg-black/[0.06] dark:active:bg-white/[0.07] transition-colors duration-150 flex-shrink-0"
                onTouchEnd={(e) => { e.preventDefault(); handleSave() }}
                onClick={handleSave}
                aria-label="Save to snippets"
              >
                <Bookmark className="w-[18px] h-[18px]" strokeWidth={1.9} />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-medium text-text-secondary active:bg-black/[0.06] dark:active:bg-white/[0.07] transition-colors duration-150"
              onTouchEnd={(e) => { e.preventDefault(); handleSave() }}
              onClick={handleSave}
            >
              <Bookmark className="w-4 h-4 text-accent-violet/80" />
              Save
            </button>
          )}
        </div>
        </div>
      </div>
    )
  }

  // Desktop: original floating tooltip above selection
  return (
    <div
      ref={tooltipRef}
      className="drift-tooltip fixed z-[99999] animate-fade-in"
      style={{
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
        transform: tooltip.placement === 'below' ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div className="flex flex-col gap-1 bg-dark-surface/95 backdrop-blur-xl rounded-2xl p-1.5 border border-dark-border/70 shadow-[0_8px_24px_rgba(0,0,0,0.15),0_2px_6px_rgba(0,0,0,0.08)]">
        {/* Main action row */}
        <div className="flex gap-1.5">
          {!tooltip.isUserMessage && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
              onTouchStart={(e) => { e.stopPropagation() }}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleDrift() }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDrift() }}
              title="Drift on selected text (D)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                         text-white bg-gradient-to-r from-accent-pink to-accent-violet
                         shadow-[0_2px_8px_rgba(168,85,247,0.3)]
                         hover:opacity-90 active:scale-95
                         transition-all duration-150 cursor-pointer text-[12px] font-semibold"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Drift into
            </button>
          )}

          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            onTouchStart={(e) => { e.stopPropagation() }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleSave() }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSave() }}
            title="Save selection to snippets (S)"
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                       bg-dark-elevated border border-dark-border/70 text-text-secondary
                       hover:border-accent-violet/40 hover:text-accent-violet active:scale-95
                       transition-all duration-150 cursor-pointer text-[12px] font-medium"
          >
            <Bookmark className="w-3.5 h-3.5 text-accent-violet/70 group-hover:text-accent-violet" />
            Save
          </button>
        </div>

        {/* Lens grid — a tidy 2-column layout: the built-in lenses, then any
            user-defined custom lenses, then a full-width "New lens" action. */}
        {!tooltip.isUserMessage && (
          <div className="grid grid-cols-2 gap-1 w-[300px]">
            {TEMPLATES.map((t) => (
              <button
                key={t.type}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDrift(t.type) }}
                title={t.desc}
                className={`group flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-lg text-left
                           bg-dark-elevated/60 border border-dark-border/50 active:scale-[0.97]
                           transition-all duration-150 cursor-pointer
                           ${ACTION_TINT[t.type].border}`}
              >
                <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-text-secondary group-hover:text-text-primary">
                  <t.Icon className={`w-3.5 h-3.5 shrink-0 ${ACTION_TINT[t.type].icon}`} strokeWidth={1.9} />
                  <span className="truncate">{t.label}</span>
                </span>
                <span className="text-[9.5px] text-text-muted/70 leading-tight">{t.desc}</span>
              </button>
            ))}
            {customLenses.map((lens) => (
              <button
                key={lens.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDrift(lens.id) }}
                title={`Explore through your "${lens.name}" lens`}
                className="group flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-lg text-left
                           bg-dark-elevated/60 border border-dark-border/50 hover:border-text-muted/50 active:scale-[0.97]
                           transition-all duration-150 cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-text-secondary group-hover:text-text-primary min-w-0">
                  <Aperture className="w-3.5 h-3.5 shrink-0" strokeWidth={1.9} style={{ color: lens.color }} />
                  <span className="truncate">{lens.name}</span>
                </span>
                <span className="text-[9.5px] text-text-muted/70 leading-tight">Custom lens</span>
              </button>
            ))}
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); openNewLens() }}
              title="Create your own lens"
              className="col-span-2 group flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg
                         border border-dashed border-dark-border/60 hover:border-accent-violet/40 hover:bg-accent-violet/[0.04] active:scale-[0.98]
                         transition-all duration-150 cursor-pointer text-[11px] font-semibold text-text-muted group-hover:text-accent-violet"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              <span>New lens</span>
            </button>
          </div>
        )}
      </div>

      {/* Arrow — points down when tooltip sits above the selection, up when below */}
      {tooltip.placement === 'below' ? (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-2.5 h-2.5 bg-dark-surface/95 rotate-45 border-l border-t border-dark-border/70" />
      ) : (
        <div className="absolute left-1/2 -translate-x-1/2 top-full w-2.5 h-2.5 bg-dark-surface/95 rotate-45 border-r border-b border-dark-border/70" />
      )}
    </div>
  )
}
