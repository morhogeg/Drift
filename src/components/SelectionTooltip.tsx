import { useEffect, useState, useRef } from 'react'
import { Bookmark } from 'lucide-react'
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
  } | null>(null)
  
  const tooltipRef = useRef<HTMLDivElement>(null)
  const savedDataRef = useRef<{ text: string; messageId: string } | null>(null)

  useEffect(() => {
    let isTooltipHovered = false

    const handleMouseUp = (e: MouseEvent) => {
      // Don't process if clicking on the tooltip
      if ((e.target as HTMLElement).closest('.drift-tooltip')) {
        return
      }

      // Small delay to let selection complete
      setTimeout(() => {
        const selection = window.getSelection()
        
        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
          // Only hide if not hovering tooltip
          if (!isTooltipHovered && tooltip) {
            setTimeout(() => {
              if (!isTooltipHovered) {
                setTooltip(null)
                savedDataRef.current = null
              }
            }, 200)
          }
          return
        }

        const text = selection.toString().trim()
        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        
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

        // Check if user message
        const isUserMessage = messageEl.className.includes('from-accent-pink') || 
                              messageEl.className.includes('from-accent-violet')
        
        if (isUserMessage) {
          return
        }

        // Save the data
        savedDataRef.current = { text, messageId: msgId }
        
        // Show tooltip
        setTooltip({
          visible: true,
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
          text: text,
          messageId: msgId
        })
      }, 10)
    }

    // Track tooltip hover state
    const handleTooltipEnter = () => {
      isTooltipHovered = true
    }
    
    const handleTooltipLeave = () => {
      isTooltipHovered = false
      // Hide after a delay if no selection
      setTimeout(() => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) {
          setTooltip(null)
          savedDataRef.current = null
        }
      }, 200)
    }

    // Add event listeners
    document.addEventListener('mouseup', handleMouseUp)
    
    // Add tooltip hover tracking if tooltip exists
    const tooltipEl = tooltipRef.current
    if (tooltipEl) {
      tooltipEl.addEventListener('mouseenter', handleTooltipEnter)
      tooltipEl.addEventListener('mouseleave', handleTooltipLeave)
    }

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      if (tooltipEl) {
        tooltipEl.removeEventListener('mouseenter', handleTooltipEnter)
        tooltipEl.removeEventListener('mouseleave', handleTooltipLeave)
      }
    }
  }, [tooltip])

  const handleDrift = () => {
    // Use saved data instead of current selection
    const data = savedDataRef.current || (tooltip ? { text: tooltip.text, messageId: tooltip.messageId } : null)
    
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
      <div className="flex gap-2 bg-dark-elevated/95 backdrop-blur rounded-full p-1 border border-dark-border shadow-2xl">
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
          className="
            flex items-center gap-1.5 px-3 py-1.5
            bg-gradient-to-r from-accent-pink to-accent-violet
            text-white text-sm font-medium
            rounded-full shadow-lg shadow-accent-pink/30
            hover:scale-105 active:scale-95
            transition-all duration-200
            border border-white/20
            cursor-pointer
          "
        >
          <span className="text-base">🌀</span>
          <span>Drift</span>
        </button>
        
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
          className="
            flex items-center gap-1.5 px-3 py-1.5
            bg-gradient-to-r from-cyan-500 to-teal-500
            text-white text-sm font-medium
            rounded-full shadow-lg shadow-cyan-500/30
            hover:scale-105 active:scale-95
            transition-all duration-200
            border border-white/20
            cursor-pointer
          "
        >
          <Bookmark className="w-3.5 h-3.5" />
          <span>Save</span>
        </button>
      </div>
      
      {/* Arrow */}
      <div className="
        absolute left-1/2 -translate-x-1/2 top-full
        w-0 h-0 
        border-l-[6px] border-l-transparent
        border-r-[6px] border-r-transparent
        border-t-[6px] border-t-accent-violet
      " />
    </div>
  )
}