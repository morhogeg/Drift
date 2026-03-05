import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export interface UseAutoScrollReturn {
  /** Attach this ref to the scrollable container element */
  containerRef: RefObject<HTMLDivElement | null>
  /** Attach this ref to an empty div at the end of the message list */
  endRef: RefObject<HTMLDivElement | null>
  /** Whether the user has scrolled up away from the bottom */
  showScrollButton: boolean
  /** Imperatively scroll to the bottom */
  scrollToBottom: () => void
  /** Pass to the container's onScroll handler */
  handleScroll: () => void
}

/**
 * Manages auto-scroll behaviour for a chat message list.
 *
 * - Auto-scrolls when `dependency` changes (new messages / streaming chunks)
 *   UNLESS the user has manually scrolled up.
 * - Shows a "scroll to bottom" button when the user has scrolled up.
 * - Resets the user-scrolled flag when the user scrolls back to the bottom.
 */
export function useAutoScroll(dependency: unknown): UseAutoScrollReturn {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const userHasScrolled = useRef(false)
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)

  /** Returns true when the container is within 100px of the bottom. */
  const isAtBottom = useCallback((): boolean => {
    const el = containerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }, [])

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleScroll = useCallback(() => {
    const atBottom = isAtBottom()
    setShowScrollButton(!atBottom)

    if (!atBottom) {
      userHasScrolled.current = true
    }

    if (atBottom) {
      if (scrollTimeout.current !== null) clearTimeout(scrollTimeout.current)
      scrollTimeout.current = setTimeout(() => {
        userHasScrolled.current = false
        scrollTimeout.current = null
      }, 150)
    }
  }, [isAtBottom])

  // Auto-scroll when dependency changes (messages / streaming text)
  useEffect(() => {
    if (!userHasScrolled.current) {
      scrollToBottom()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependency])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeout.current !== null) clearTimeout(scrollTimeout.current)
    }
  }, [])

  return {
    containerRef,
    endRef,
    showScrollButton,
    scrollToBottom,
    handleScroll,
  }
}
