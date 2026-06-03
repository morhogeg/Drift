/**
 * onceFlags — one-time UI flags (coachmarks / first-run hints) persisted in
 * localStorage. Teaches Drift's invisible affordances exactly once, then never
 * nags again. Safe on web + Capacitor (localStorage is available in both); any
 * storage failure degrades to "already seen" so a hint never gets stuck open.
 */
import { useCallback, useState } from 'react'

const PREFIX = 'drift:seen:'

export function hasSeen(key: string): boolean {
  try {
    return localStorage.getItem(PREFIX + key) === '1'
  } catch {
    return true
  }
}

export function markSeen(key: string): void {
  try {
    localStorage.setItem(PREFIX + key, '1')
  } catch {
    /* ignore — non-persistent is fine */
  }
}

/** React hook: `[seen, markSeen]`. Reactive so dismissing hides the hint immediately. */
export function useOnceFlag(key: string): [boolean, () => void] {
  const [seen, setSeen] = useState(() => hasSeen(key))
  const mark = useCallback(() => {
    markSeen(key)
    setSeen(true)
  }, [key])
  return [seen, mark]
}
