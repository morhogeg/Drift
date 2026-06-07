import { useEffect, type RefObject } from 'react'

/**
 * Invokes `onOutside` on a document mousedown that lands outside `ref`'s element,
 * but only while `active`. Used to dismiss popovers / menus on an outside click.
 */
export function useOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onOutside: () => void,
) {
  useEffect(() => {
    if (!active) return
    function onDocClick(e: MouseEvent) {
      const el = ref.current
      if (el && !el.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps
}
