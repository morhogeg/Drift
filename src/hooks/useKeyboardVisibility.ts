import { useEffect, useState } from 'react'

/**
 * Tracks the soft keyboard and sets a CSS custom property `--kb-h` (keyboard
 * height) so the composer can lift instantly, returning whether the keyboard is
 * currently visible (used to suppress the safe-area padding while it's up).
 *
 * Prefers Capacitor's Keyboard plugin (native iOS). On web / installed PWA
 * (Mobile Safari) where the plugin's import no-ops, falls back to
 * `window.visualViewport` so the composer still lifts above the keyboard.
 */
export function useKeyboardVisibility(): boolean {
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  useEffect(() => {
    let cleanupFns: Array<() => void> = []
    // Becomes true once the native Capacitor plugin is driving --kb-h, so the
    // visualViewport fallback never double-drives the same CSS variable.
    let capacitorActive = false

    const scrollMessagesToBottom = () => {
      setTimeout(() => {
        const c = document.querySelector('.chat-messages-container')
        if (c) c.scrollTop = c.scrollHeight
      }, 50)
    }

    // visualViewport fallback for web / PWA. Returns a cleanup fn (or undefined
    // if the environment doesn't support it).
    const setupVisualViewportFallback = (): (() => void) | undefined => {
      if (typeof window === 'undefined') return undefined
      const vv = window.visualViewport
      if (!vv) return undefined

      let wasVisible = false
      const update = () => {
        // If the native plugin took over, stop driving --kb-h from here.
        if (capacitorActive) return
        const height = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        document.documentElement.style.setProperty('--kb-h', `${height}px`)
        const visible = height > 80
        if (visible !== wasVisible) {
          wasVisible = visible
          setKeyboardVisible(visible)
          // Mirror the Capacitor path: keep the last message visible on show.
          if (visible) scrollMessagesToBottom()
        }
      }

      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
      update()

      return () => {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      }
    }

    const setup = async () => {
      // Install the fallback first so web works immediately; it self-disables
      // if/when the Capacitor plugin becomes active.
      const fallbackCleanup = setupVisualViewportFallback()
      if (fallbackCleanup) cleanupFns.push(fallbackCleanup)

      try {
        const { Keyboard } = await import('@capacitor/keyboard')
        const show = await Keyboard.addListener('keyboardWillShow', (info) => {
          capacitorActive = true
          document.documentElement.style.setProperty('--kb-h', `${info.keyboardHeight}px`)
          setKeyboardVisible(true)
          // Scroll to bottom so the last message stays visible
          scrollMessagesToBottom()
        })
        const hide = await Keyboard.addListener('keyboardWillHide', () => {
          capacitorActive = true
          document.documentElement.style.setProperty('--kb-h', '0px')
          setKeyboardVisible(false)
        })
        cleanupFns.push(() => show.remove(), () => hide.remove())
      } catch {
        // Not running in Capacitor (web dev) — visualViewport fallback handles it.
      }
    }
    setup()
    return () => cleanupFns.forEach(fn => fn())
  }, [])

  return keyboardVisible
}
