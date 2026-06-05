import { useEffect, useRef } from 'react'

interface Shortcuts {
  /** ⌘/Ctrl + Alt + N */
  onNewChat: () => void
  /** ⌘/Ctrl + Alt + G */
  onToggleMap: () => void
  /** ⌘/Ctrl + K */
  onToggleSearch: () => void
}

/**
 * Global app keyboard shortcuts. Handlers are held in a ref so the listener
 * binds exactly once yet always invokes the latest closures (no stale state,
 * no churn re-binding the listener every render).
 */
export function useKeyboardShortcuts(handlers: Shortcuts) {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'n') {
        e.preventDefault()
        ref.current.onNewChat()
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'g') {
        e.preventDefault()
        ref.current.onToggleMap()
      }
      // ⌘K / Ctrl-K — full-text search across all chats and drifts.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        ref.current.onToggleSearch()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
