import { useEffect, useRef } from 'react'
import { 
  Edit3, Copy, Trash2, Pin, PinOff, 
  ExternalLink, Star, StarOff, Archive
} from 'lucide-react'

interface ContextMenuItem {
  label: string
  icon: React.ReactNode
  action: () => void
  danger?: boolean
  divider?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let adjustedX = x
      let adjustedY = y

      if (x + rect.width > viewportWidth) {
        adjustedX = x - rect.width
      }

      if (y + rect.height > viewportHeight) {
        adjustedY = y - rect.height
      }

      menuRef.current.style.left = `${adjustedX}px`
      menuRef.current.style.top = `${adjustedY}px`
    }
  }, [x, y])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] bg-dark-elevated/95 backdrop-blur-md 
                 border border-dark-border/50 rounded-lg shadow-2xl 
                 shadow-black/50 py-1 animate-scale-in"
      style={{ left: x, top: y }}
    >
      {items.map((item, index) => (
        <div key={index}>
          {item.divider && index > 0 && (
            <div className="my-1 border-t border-dark-border/30" />
          )}
          <button
            onClick={() => {
              item.action()
              onClose()
            }}
            className={`
              w-full flex items-center gap-3 px-3 py-2 text-sm
              transition-all duration-150
              ${item.danger 
                ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300' 
                : 'text-text-secondary hover:bg-dark-bubble hover:text-text-primary'
              }
            `}
          >
            <span className={`flex-shrink-0 ${item.danger ? 'text-red-400' : 'text-text-muted'}`}>
              {item.icon}
            </span>
            <span className="text-left">{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  )
}