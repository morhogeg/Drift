// Lightweight utilities for message navigation by messageId

export function navigateToMessage(messageId: string, anchorId?: string): boolean {
  const selectors = [
    `[data-message-id="${messageId}"]`,
    `[data-message-id="msg-${messageId}"]`,
  ]
  let el: HTMLElement | null = null
  for (const s of selectors) { el = document.querySelector(s) as HTMLElement | null; if (el) break }
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('highlight-message')
  // Focus management
  el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
  setTimeout(() => { el?.classList.remove('highlight-message') }, 1200)
  if (anchorId) {
    // Try to highlight a specific list item anchor inside the message after a short delay
    setTimeout(() => {
      const target = document.getElementById(anchorId)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        target.classList.add('highlight-message')
        setTimeout(() => target.classList.remove('highlight-message'), 1200)
      }
    }, 350)
  }
  return true
}

export function registerGlobalNavigationHandlers() {
  const onNavigate = (e: Event) => {
    const detail = (e as CustomEvent).detail || {}
    if (!detail?.to) return
    navigateToMessage(detail.to, detail.anchor)
  }
  window.addEventListener('drift:navigate-to-message', onNavigate as EventListener)
  return () => window.removeEventListener('drift:navigate-to-message', onNavigate as EventListener)
}
