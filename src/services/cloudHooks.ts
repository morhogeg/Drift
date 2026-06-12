/**
 * cloudHooks — a tiny, dependency-free change bus between local persistence
 * and the (optional) cloud sync layer.
 *
 * db.ts calls `emitLocalDataChange()` after each successful chat write. When
 * cloud is disabled nothing ever subscribes, so the emit is a no-op function
 * call over an empty Set — zero observable cost, no imports of any cloud code.
 * cloudSync.ts subscribes only after a user signs in.
 */

type Listener = () => void

const listeners = new Set<Listener>()

/** Subscribe to local data changes. Returns an unsubscribe function. */
export function onLocalDataChange(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Notify subscribers (if any) that local chat data changed. */
export function emitLocalDataChange(): void {
  for (const cb of listeners) {
    try {
      cb()
    } catch (err) {
      console.error('[cloudHooks] listener failed:', err)
    }
  }
}
