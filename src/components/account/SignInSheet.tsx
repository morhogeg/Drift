/**
 * SignInSheet — the entrance to the optional cloud account.
 *
 * A dark glassmorphic bottom sheet (framer-motion entrance, pink/violet
 * accent) with a single action: Sign in with Apple. Copy makes the promise
 * explicit — backups travel, API keys never leave the device.
 *
 * Only ever mounted from AccountSection, which is itself gated on
 * `isCloudEnabled()`.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Loader2 } from 'lucide-react'
import { AnimatePresence, EASE_OUT_EXPO } from '../motion'
import { signInWithApple } from '../../services/auth'
import { useAuthStore } from '../../store/authStore'

// The Apple brand mark (lucide's "Apple" is a fruit) — single path, currentColor.
function AppleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 814 1000" fill="currentColor" aria-hidden>
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  )
}

interface SignInSheetProps {
  isOpen: boolean
  onClose: () => void
}

export default function SignInSheet({ isOpen, onClose }: SignInSheetProps) {
  const { status, setUser, setStatus, setAuthError, authError } = useAuthStore()
  const [busy, setBusy] = useState(false)

  const handleApple = async () => {
    if (busy) return
    setBusy(true)
    setStatus('signing-in')
    setAuthError(null)
    try {
      const user = await signInWithApple()
      setUser(user) // onAuthChange confirms this; set eagerly for instant UI
      onClose()
    } catch (err) {
      setStatus('signed-out')
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Sign in to Drift"
            className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-2xl border-t border-accent-violet/25 bg-dark-surface/90 overflow-hidden"
            style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.75rem)',
              backdropFilter: 'blur(16px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
          >
            {/* Luminous accent — light from within, not a border */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-pink/70 to-transparent" />
            <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-48 rounded-full bg-accent-violet/20 blur-3xl" />

            {/* Drag handle + close */}
            <div className="w-10 h-1 rounded-full bg-dark-border/80 mx-auto mt-3" />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-white/[0.06] active:scale-90 transition-all"
              aria-label="Close"
            >
              <X className="w-[18px] h-[18px]" />
            </button>

            <div className="px-6 pt-7 pb-2 text-center">
              {/* Glowing orb mark */}
              <div
                className="w-14 h-14 mx-auto mb-5 rounded-full flex items-center justify-center"
                style={{
                  background: 'radial-gradient(circle at 38% 34%, #fff3, #a855f733 30%, #ff006e22 80%)',
                  border: '1px solid rgba(168,85,247,0.4)',
                  boxShadow: '0 0 40px rgba(168,85,247,0.45), inset 0 0 14px rgba(255,255,255,0.18)',
                }}
              >
                <span className="w-3 h-3 rounded-full bg-gradient-to-br from-accent-pink to-accent-violet shadow-[0_0_12px_rgba(255,0,110,0.8)]" />
              </div>

              <h3 className="text-[19px] font-semibold text-text-primary tracking-tight">
                Take your drifts everywhere
              </h3>
              <p className="text-[13px] text-text-secondary mt-2 leading-relaxed max-w-xs mx-auto">
                Back up your chats &amp; drifts across devices.
                <br />
                <span className="text-text-muted">Your API key stays on this device.</span>
              </p>

              <button
                type="button"
                onClick={handleApple}
                disabled={busy}
                className="mt-6 w-full max-w-xs mx-auto flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-white text-black text-[15px] font-semibold active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {busy || status === 'signing-in' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <AppleLogo size={17} />
                )}
                Sign in with Apple
              </button>

              {authError && (
                <p className="mt-3 text-xs text-red-400/90 leading-snug">{authError}</p>
              )}

              <p className="mt-4 text-[11px] text-text-muted/60">
                Optional — Drift works fully offline without an account.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
