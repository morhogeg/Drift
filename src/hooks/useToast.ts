import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  duration: number
}

type ToastListener = (toasts: ToastItem[]) => void

// ---------------------------------------------------------------------------
// Internal event emitter — singleton so any module can call toast.*
// ---------------------------------------------------------------------------
class ToastEmitter {
  private listeners: ToastListener[] = []
  private toasts: ToastItem[] = []
  private idCounter = 0

  subscribe(fn: ToastListener): () => void {
    this.listeners.push(fn)
    // Fire immediately so newly-mounted component syncs state
    fn([...this.toasts])
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn)
    }
  }

  private emit() {
    const snapshot = [...this.toasts]
    this.listeners.forEach(fn => fn(snapshot))
  }

  add(type: ToastType, message: string): string {
    const id = `toast-${++this.idCounter}-${Date.now()}`
    const duration = type === 'error' ? 6000 : 4000
    const item: ToastItem = { id, type, message, duration }

    // Cap at 4 visible toasts — remove oldest first
    if (this.toasts.length >= 4) {
      this.toasts = this.toasts.slice(-3)
    }

    this.toasts = [...this.toasts, item]
    this.emit()
    return id
  }

  remove(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id)
    this.emit()
  }

  success(message: string) { return this.add('success', message) }
  error(message: string)   { return this.add('error', message) }
  info(message: string)    { return this.add('info', message) }
  warning(message: string) { return this.add('warning', message) }
}

// Export the singleton so non-React code (services) can call it directly
export const toast = new ToastEmitter()

// ---------------------------------------------------------------------------
// React hook — used inside components
// ---------------------------------------------------------------------------
export interface ToastControls {
  success: (message: string) => string
  error: (message: string) => string
  info: (message: string) => string
  warning: (message: string) => string
}

export function useToast(): ToastControls {
  return {
    success: (msg: string) => toast.success(msg),
    error:   (msg: string) => toast.error(msg),
    info:    (msg: string) => toast.info(msg),
    warning: (msg: string) => toast.warning(msg),
  }
}

// ---------------------------------------------------------------------------
// Internal hook used by ToastContainer to subscribe to the emitter
// ---------------------------------------------------------------------------
export function useToastState(): {
  toasts: ToastItem[]
  remove: (id: string) => void
} {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const setToastsRef = useRef(setToasts)
  setToastsRef.current = setToasts

  useEffect(() => {
    const unsubscribe = toast.subscribe(items => {
      setToastsRef.current([...items])
    })
    return unsubscribe
  }, [])

  const remove = useCallback((id: string) => {
    toast.remove(id)
  }, [])

  return { toasts, remove }
}
