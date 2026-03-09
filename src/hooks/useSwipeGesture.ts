import { useRef, useCallback } from 'react'

interface SwipeGestureOptions {
  /** Minimum horizontal distance (px) to trigger a swipe. Default: 50 */
  minDistance?: number
  /**
   * Maximum ratio of vertical / horizontal movement allowed.
   * Keeps swipes from firing when the user is scrolling vertically.
   * Default: 0.5  (vertical must be less than half the horizontal distance)
   */
  maxVerticalRatio?: number
  /**
   * CSS selector for elements that should suppress the swipe gesture.
   * If the touch starts inside a matching element the gesture is ignored.
   * Default: '.multi-model-carousel'
   */
  excludeSelector?: string
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

/**
 * useSwipeGesture — attaches touch handlers that call `onSwipeLeft` or
 * `onSwipeRight` when the user performs a qualifying horizontal swipe.
 *
 * Excluded areas (e.g. horizontal scroll carousels) are detected via
 * `excludeSelector` so those elements keep their own scroll behaviour.
 */
export function useSwipeGesture(
  onSwipeLeft?: () => void,
  onSwipeRight?: () => void,
  options: SwipeGestureOptions = {},
): SwipeHandlers {
  const {
    minDistance = 50,
    maxVerticalRatio = 0.5,
    excludeSelector = '.multi-model-carousel',
  } = options

  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Ignore if the touch originates inside an excluded element
    if (excludeSelector) {
      const target = e.target as Element
      if (target.closest(excludeSelector)) {
        startX.current = null
        startY.current = null
        return
      }
    }

    const touch = e.touches[0]
    startX.current = touch.clientX
    startY.current = touch.clientY
  }, [excludeSelector])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null) return

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - startX.current
    const deltaY = touch.clientY - startY.current

    startX.current = null
    startY.current = null

    const absDeltaX = Math.abs(deltaX)
    const absDeltaY = Math.abs(deltaY)

    // Must exceed minimum horizontal distance
    if (absDeltaX < minDistance) return

    // Vertical movement must be small relative to horizontal (not a scroll)
    if (absDeltaY / absDeltaX > maxVerticalRatio) return

    if (deltaX < 0) {
      // Swiped left
      onSwipeLeft?.()
    } else {
      // Swiped right
      onSwipeRight?.()
    }
  }, [minDistance, maxVerticalRatio, onSwipeLeft, onSwipeRight])

  return { onTouchStart, onTouchEnd }
}
