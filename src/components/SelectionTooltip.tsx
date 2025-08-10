import { useEffect, useState } from 'react'
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
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isVisible, setIsVisible] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const [messageId, setMessageId] = useState('')

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setIsVisible(false)
        return
      }

      const text = selection.toString().trim()
      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      
      // Check if selection is within an AI message
      let element = selection.anchorNode?.parentElement
      let foundMessageEl = null
      
      while (element && element !== document.body) {
        if (element.classList?.contains('ai-message')) {
          foundMessageEl = element
          break
        }
        element = element.parentElement
      }
      
      if (!foundMessageEl) {
        setIsVisible(false)
        return
      }
      
      const msgId = foundMessageEl.getAttribute('data-message-id')
      if (!msgId) {
        setIsVisible(false)
        return
      }

      setSelectedText(text)
      setMessageId(msgId)
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10
      })
      setIsVisible(true)
    }

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.drift-tooltip')) {
        // Small delay to allow text selection to complete
        setTimeout(handleSelection, 10)
      }
    }

    document.addEventListener('mouseup', handleClick)
    document.addEventListener('selectionchange', handleSelection)

    return () => {
      document.removeEventListener('mouseup', handleClick)
      document.removeEventListener('selectionchange', handleSelection)
    }
  }, [])

  const handleStartDrift = () => {
    onStartDrift(selectedText, messageId)
    setIsVisible(false)
    window.getSelection()?.removeAllRanges()
  }

  const handleSaveSnippet = () => {
    snippetStorage.createSnippet(
      selectedText,
      {
        chatId: currentChatId,
        chatTitle: currentChatTitle,
        messageId: messageId,
        isFullMessage: false,
        timestamp: new Date()
      }
    )
    
    setIsVisible(false)
    window.getSelection()?.removeAllRanges()
    onSnippetSaved?.()
  }

  if (!isVisible) return null

  return (
    <div
      className="drift-tooltip fixed z-40 animate-fade-up"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)'
      }}
    >
      <div className="flex gap-2">
        <button
          onClick={handleStartDrift}
          className="
            flex items-center gap-1.5 px-3 py-1.5
            bg-gradient-to-r from-accent-pink to-accent-violet
            text-white text-sm font-medium
            rounded-full shadow-lg shadow-accent-pink/30
            hover:scale-105 active:scale-95
            transition-all duration-200
            border border-white/20
          "
        >
          <span className="text-base">🌀</span>
          <span>Drift</span>
        </button>
        
        <button
          onClick={handleSaveSnippet}
          className="
            flex items-center gap-1.5 px-3 py-1.5
            bg-gradient-to-r from-cyan-500 to-teal-500
            text-white text-sm font-medium
            rounded-full shadow-lg shadow-cyan-500/30
            hover:scale-105 active:scale-95
            transition-all duration-200
            border border-white/20
          "
        >
          <Bookmark className="w-3.5 h-3.5" />
          <span>Save</span>
        </button>
      </div>
      
      {/* Arrow pointing down */}
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