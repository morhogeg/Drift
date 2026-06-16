import { useEffect, useRef, useState } from 'react'
import type { AISettings } from '@/components/Settings'
import { checkGeminiConnection } from '@/services/gemini'
import { checkOpenRouterConnection } from '@/services/openrouter'
import { checkOllamaConnection } from '@/services/ollama'

/**
 * Backoff schedule (ms) for the connection poller. The poll delay starts at 5s
 * and grows on each consecutive failure, capped at 2 minutes, then resets to 5s
 * on the first successful check. This keeps a present-but-invalid or
 * rate-limited key (BYOK) from being pinged every 5s indefinitely, which could
 * otherwise get the key/IP rate-limited or locked.
 */
const POLL_BACKOFF_MS = [5000, 10000, 30000, 60000, 120000] as const

/**
 * Polls the active provider's reachability with exponential backoff and on
 * settings change. The first check runs immediately on mount; subsequent checks
 * are scheduled via a self-rescheduling timeout whose delay follows
 * {@link POLL_BACKOFF_MS} (5s → 10s → 30s → 60s → 120s) on consecutive failures
 * and resets to 5s after any successful check. A failure is either a "not
 * connected" result or a thrown error. Editing the key changes `aiSettings`,
 * which remounts the effect and resets the backoff for free.
 *
 * Calls `onCredentialsMissing` when the selected provider has no usable key
 * (so the caller can prompt the user, e.g. open Settings). The callback is held
 * in a ref so changing its identity doesn't restart the polling effect.
 */
export function useConnectionStatus(aiSettings: AISettings, onCredentialsMissing: () => void) {
  const [apiConnected, setApiConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const onMissingRef = useRef(onCredentialsMissing)
  onMissingRef.current = onCredentialsMissing

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let consecutiveFailures = 0

    // Returns true when the provider is reachable, false on a missing key,
    // a "not connected" result, or a thrown error — all of which back off.
    const checkConnection = async (showConnecting = true): Promise<boolean> => {
      if (showConnecting) setIsConnecting(true)
      try {
        const hasGeminiPreset = (aiSettings.modelPresets || []).some((p) => p.provider === 'gemini' && p.enabled)
        if (hasGeminiPreset) {
          const apiKey = import.meta.env.VITE_GEMINI_API_KEY || aiSettings.geminiApiKey
          if (!apiKey?.trim()) {
            onMissingRef.current()
            setApiConnected(false)
            return false
          }
          const connected = await checkGeminiConnection(apiKey, aiSettings.geminiModel)
          setApiConnected(connected)
          return connected
        } else if (aiSettings.useOpenRouter) {
          const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || aiSettings.openRouterApiKey
          if (!apiKey || apiKey.trim() === '') {
            onMissingRef.current()
            setApiConnected(false)
            return false
          }
          const connected = await checkOpenRouterConnection(apiKey, aiSettings.openRouterModel)
          setApiConnected(connected)
          if (!connected && !import.meta.env.VITE_OPENROUTER_API_KEY) {
            onMissingRef.current()
          }
          return connected
        } else {
          const connected = await checkOllamaConnection(aiSettings.ollamaUrl)
          setApiConnected(connected)
          return connected
        }
      } catch (error) {
        console.error('Connection check error:', error)
        setApiConnected(false)
        return false
      } finally {
        if (showConnecting) setIsConnecting(false)
      }
    }

    const scheduleNext = (success: boolean) => {
      if (cancelled) return
      let delay: number
      if (success) {
        consecutiveFailures = 0
        delay = POLL_BACKOFF_MS[0]
      } else {
        delay = POLL_BACKOFF_MS[Math.min(consecutiveFailures, POLL_BACKOFF_MS.length - 1)]
        consecutiveFailures = Math.min(consecutiveFailures + 1, POLL_BACKOFF_MS.length - 1)
      }
      timeoutId = setTimeout(run, delay)
    }

    const run = async () => {
      const success = await checkConnection(false)
      scheduleNext(success)
    }

    // Immediate first check on mount, then self-scheduling backoff loop.
    checkConnection(true).then(scheduleNext)

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [aiSettings])

  return { apiConnected, isConnecting }
}
