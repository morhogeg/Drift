import { useEffect, useState } from 'react'

/**
 * Tracks the iOS soft keyboard via Capacitor's Keyboard plugin. Sets a CSS
 * custom property `--kb-h` (keyboard height) so the composer can lift instantly,
 * and returns whether the keyboard is currently visible (used to suppress the
 * safe-area padding while it's up). No-ops on web / non-Capacitor environments.
 */
export function useKeyboardVisibility(): boolean {
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  useEffect(() => {
    let cleanupFns: Array<() => void> = []
    const setup = async () => {
      try {
        const { Keyboard } = await import('@capacitor/keyboard')
        const show = await Keyboard.addListener('keyboardWillShow', (info) => {
          document.documentElement.style.setProperty('--kb-h', `${info.keyboardHeight}px`)
          setKeyboardVisible(true)
          // Scroll to bottom so the last message stays visible
          setTimeout(() => {
            const c = document.querySelector('.chat-messages-container')
            if (c) c.scrollTop = c.scrollHeight
          }, 50)
        })
        const hide = await Keyboard.addListener('keyboardWillHide', () => {
          document.documentElement.style.setProperty('--kb-h', '0px')
          setKeyboardVisible(false)
        })
        cleanupFns = [() => show.remove(), () => hide.remove()]
      } catch {
        // Not running in Capacitor (web dev) — no-op
      }
    }
    setup()
    return () => cleanupFns.forEach(fn => fn())
  }, [])

  return keyboardVisible
}
