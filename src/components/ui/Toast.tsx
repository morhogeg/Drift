import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useToastState, type ToastItem, type ToastType } from '../../hooks/useToast'

// ---------------------------------------------------------------------------
// Per-toast config
// ---------------------------------------------------------------------------
interface ToastConfig {
  icon: ReactNode
  barColor: string
  borderColor: string
  iconColor: string
}

function getConfig(type: ToastType): ToastConfig {
  switch (type) {
    case 'success':
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        barColor: 'bg-green-500',
        borderColor: 'border-green-500/30',
        iconColor: 'text-green-400',
      }
    case 'error':
      return {
        icon: <XCircle className="w-4 h-4" />,
        barColor: 'bg-accent-pink',
        borderColor: 'border-accent-pink/30',
        iconColor: 'text-accent-pink',
      }
    case 'warning':
      return {
        icon: <AlertTriangle className="w-4 h-4" />,
        barColor: 'bg-yellow-500',
        borderColor: 'border-yellow-500/30',
        iconColor: 'text-yellow-400',
      }
    case 'info':
    default:
      return {
        icon: <Info className="w-4 h-4" />,
        barColor: 'bg-accent-violet',
        borderColor: 'border-accent-violet/30',
        iconColor: 'text-accent-violet',
      }
  }
}

// ---------------------------------------------------------------------------
// Single toast item
// ---------------------------------------------------------------------------
interface SingleToastProps {
  toast: ToastItem
  onRemove: (id: string) => void
}

function SingleToast({ toast, onRemove }: SingleToastProps) {
  const config = getConfig(toast.type)
  // Controls the CSS-driven enter/exit animation
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting'>('entering')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Enter animation
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setPhase('visible')
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  // Auto-dismiss
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      handleDismiss()
    }, toast.duration)
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.duration])

  const handleDismiss = () => {
    setPhase('exiting')
    setTimeout(() => onRemove(toast.id), 300)
  }

  const translateY =
    phase === 'entering' ? 'translate-y-4 opacity-0' :
    phase === 'exiting'  ? 'translate-y-4 opacity-0' :
    'translate-y-0 opacity-100'

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={`
        relative flex items-start gap-3 w-80 max-w-[calc(100vw-2rem)]
        bg-dark-surface/95 backdrop-blur-sm
        border ${config.borderColor}
        rounded-xl shadow-2xl shadow-black/50
        px-4 py-3 overflow-hidden
        transition-all duration-300 ease-out
        ${translateY}
      `}
    >
      {/* Progress bar */}
      <div
        className={`absolute bottom-0 left-0 h-[2px] ${config.barColor} opacity-70`}
        style={{
          animation: `toast-progress ${toast.duration}ms linear forwards`,
        }}
      />

      {/* Icon */}
      <span className={`shrink-0 mt-0.5 ${config.iconColor}`}>
        {config.icon}
      </span>

      {/* Message */}
      <p className="flex-1 text-sm text-text-primary leading-snug break-words">
        {toast.message}
      </p>

      {/* Close button */}
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 -mt-0.5 -mr-1 p-1 rounded-md text-text-muted hover:text-text-primary
                   hover:bg-dark-elevated/60 transition-colors cursor-pointer"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Container — place once in App.tsx
// ---------------------------------------------------------------------------
export function ToastContainer() {
  const { toasts, remove } = useToastState()

  return (
    <>
      {/* Keyframe for progress bar — injected once */}
      <style>{`
        @keyframes toast-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>

      <div
        className="fixed bottom-6 right-6 z-[99998] flex flex-col-reverse gap-2 pointer-events-none"
        aria-label="Notifications"
      >
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <SingleToast toast={t} onRemove={remove} />
          </div>
        ))}
      </div>
    </>
  )
}
