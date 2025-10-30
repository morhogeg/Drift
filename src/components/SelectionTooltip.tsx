import { useEffect, useState, useRef } from 'react'
import { Bookmark, GitBranch } from 'lucide-react'
import { snippetStorage } from '../services/snippetStorage'

interface SelectionTooltipProps {
  onStartDrift: (text: string, messageId: string) => void
  currentChatId?: string
  currentChatTitle?: string
  onSnippetSaved?: () => void
}

export default function SelectionTooltip({ 
  onStartDrift, 
  currentChatId = '',
  currentChatTitle = 'Chat',
  onSnippetSaved 
}: SelectionTooltipProps) {
  const [tooltip, setTooltip] = useState<{
    visible: boolean
    x: number
    y: number
    text: string
    messageId: string
    isUserMessage: boolean
    anchorRect: DOMRect
  } | null>(null)
  
  const tooltipRef = useRef<HTMLDivElement>(null)
  const savedDataRef = useRef<{ text: string; messageId: string } | null>(null)
  const hideTimerRef = useRef<number | null>(null)

  useEffect(() => {
    let isTooltipHovered = false
    let lastAnchorRect: DOMRect | null = null

    const handleMouseUp = (e: MouseEvent) => {
      // Don't process if clicking on the tooltip
      if ((e.target as HTMLElement).closest('.drift-tooltip')) {
        return
      }

      // Small delay to let selection complete
      setTimeout(() => {
        const selection = window.getSelection()
        
        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
          // If user released outside selection and not hovering tooltip, schedule hide
          if (!isTooltipHovered && tooltip && hideTimerRef.current == null) {
            hideTimerRef.current = window.setTimeout(() => {
              setTooltip(null)
              savedDataRef.current = null
              hideTimerRef.current = null
            }, 180)
          }
          return
        }

        const text = selection.toString().trim()
        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        lastAnchorRect = rect
        
        // Find element with data-message-id
        let element = selection.anchorNode?.parentElement
        let messageEl = null
        
        while (element && element !== document.body) {
          if (element.hasAttribute && element.hasAttribute('data-message-id')) {
            messageEl = element
            break
          }
          element = element.parentElement
        }
        
        if (!messageEl) {
          return
        }
        
        const msgId = messageEl.getAttribute('data-message-id')
        if (!msgId) {
          return
        }

        // Check if selection is inside a user-authored bubble (we still allow Save, but not Drift)
        const isUserMessage = messageEl.className.includes('from-accent-pink') ||
                              messageEl.className.includes('from-accent-violet')

        // Save the data
        savedDataRef.current = { text, messageId: msgId }
        
        // Show tooltip
        setTooltip({
          visible: true,
          x: rect.left + rect.width / 2,
          y: Math.max(rect.top - 10, 8),
          text: text,
          messageId: msgId,
          isUserMessage,
          anchorRect: rect
        })
      }, 10)
    }

    // Track tooltip hover state
    const handleTooltipEnter = () => {
      isTooltipHovered = true
    }
    
    const handleTooltipLeave = () => {
      isTooltipHovered = false
      // Hide after a short delay to allow moving between selection and tooltip
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = window.setTimeout(() => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) {
          setTooltip(null)
          savedDataRef.current = null
        }
        hideTimerRef.current = null
      }, 200)
    }

    const within = (rect: DOMRect, x: number, y: number, pad = 8) => (
      x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad
    )

    const onMouseMove = (ev: MouseEvent) => {
      if (!tooltip) return
      const tip = tooltipRef.current?.getBoundingClientRect()
      const ax = (lastAnchorRect || tooltip.anchorRect)
      const inside = (tip && within(tip, ev.clientX, ev.clientY, 6)) || (ax && within(ax, ev.clientX, ev.clientY, 10))
      if (inside) {
        if (hideTimerRef.current) { window.clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
      } else if (!hideTimerRef.current) {
        hideTimerRef.current = window.setTimeout(() => {
          setTooltip(null)
          savedDataRef.current = null
          hideTimerRef.current = null
        }, 220)
      }
    }

    // Add event listeners
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousemove', onMouseMove)
    
    // Add tooltip hover tracking if tooltip exists
    const tooltipEl = tooltipRef.current
    if (tooltipEl) {
      tooltipEl.addEventListener('mouseenter', handleTooltipEnter)
      tooltipEl.addEventListener('mouseleave', handleTooltipLeave)
    }

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousemove', onMouseMove)
      if (tooltipEl) {
        tooltipEl.removeEventListener('mouseenter', handleTooltipEnter)
        tooltipEl.removeEventListener('mouseleave', handleTooltipLeave)
      }
    }
  }, [tooltip])

  const handleDrift = () => {
    // Use saved data instead of current selection
    const data = savedDataRef.current || (tooltip ? { text: tooltip.text, messageId: tooltip.messageId } : null)
    // Disallow drift for user messages
    if (tooltip?.isUserMessage) {
      return
    }
    
    if (data) {
      console.log('Drift clicked with saved data:', data)
      onStartDrift(data.text, data.messageId)
      
      setTooltip(null)
      savedDataRef.current = null
      window.getSelection()?.removeAllRanges()
    } else {
      console.error('No data available for drift')
    }
  }

  const handleSave = () => {
    // Use saved data instead of current selection
    const data = savedDataRef.current || (tooltip ? { text: tooltip.text, messageId: tooltip.messageId } : null)
    
    if (data) {
      console.log('Save clicked with saved data:', data)
      snippetStorage.createSnippet(
        data.text,
        {
          chatId: currentChatId,
          chatTitle: currentChatTitle,
          messageId: data.messageId,
          isFullMessage: false,
          timestamp: new Date()
        }
      )
      
      setTooltip(null)
      savedDataRef.current = null
      window.getSelection()?.removeAllRanges()
      onSnippetSaved?.()
    }
  }

  if (!tooltip || !tooltip.visible) return null

  return (
    <div
      ref={tooltipRef}
      className="drift-tooltip fixed z-[99999] animate-fade-up"
      style={{
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
        transform: 'translate(-50%, -100%)',
        pointerEvents: 'auto'
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
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleDrift()
            }}
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
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleSave()
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
                     bg-dark-bubble border border-dark-border/60 text-text-secondary
                     hover:border-accent-violet/40 hover:text-text-primary
                     transition-colors duration-150 cursor-pointer"
        >
          <Bookmark className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[12px]">Save</span>
        </button>
      </div>
      
      {/* Arrow */}
      <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-dark-elevated/95 rotate-45 border-r border-b border-dark-border/70" />
    </div>
  )
}
