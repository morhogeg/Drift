import { useEffect, useRef, useState } from 'react'
import type { Message } from '@/types/chat'

/**
 * One-time "coach mark" hint shown after the first completed AI message, teaching
 * the drift gesture. Auto-dismisses after 6s and persists the dismissal in
 * localStorage so it never reappears on this device.
 */
export function useCoachMark({ isTyping, messages }: { isTyping: boolean; messages: Message[] }) {
  const [coachMarkSeen, setCoachMarkSeen] = useState(
    () => localStorage.getItem('driftCoachMarkSeen') === 'true'
  )
  const [coachMarkActive, setCoachMarkActive] = useState(false)
  const coachMarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismissCoachMark = () => {
    setCoachMarkActive(false)
    setCoachMarkSeen(true)
    localStorage.setItem('driftCoachMarkSeen', 'true')
    if (coachMarkTimerRef.current) clearTimeout(coachMarkTimerRef.current)
  }

  // Show coach mark on first completed AI message
  useEffect(() => {
    if (!isTyping && !coachMarkSeen && messages.some(m => !m.isUser)) {
      setCoachMarkActive(true)
      coachMarkTimerRef.current = setTimeout(() => dismissCoachMark(), 6000)
    }
  }, [isTyping]) // eslint-disable-line react-hooks/exhaustive-deps

  return { coachMarkActive, dismissCoachMark }
}
