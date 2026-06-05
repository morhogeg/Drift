import { useEffect, useRef, useState } from 'react'
import type { AISettings } from '@/components/Settings'
import { checkGeminiConnection } from '@/services/gemini'
import { checkOpenRouterConnection } from '@/services/openrouter'
import { checkOllamaConnection } from '@/services/ollama'

/**
 * Polls the active provider's reachability every 5s and on settings change.
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
    const checkConnection = async (showConnecting = true) => {
      if (showConnecting) setIsConnecting(true)
      try {
        const hasGeminiPreset = (aiSettings.modelPresets || []).some((p) => p.provider === 'gemini' && p.enabled)
        if (hasGeminiPreset) {
          const apiKey = import.meta.env.VITE_GEMINI_API_KEY || aiSettings.geminiApiKey
          if (!apiKey?.trim()) {
            onMissingRef.current()
            setApiConnected(false)
            setIsConnecting(false)
            return
          }
          setApiConnected(await checkGeminiConnection(apiKey, aiSettings.geminiModel))
        } else if (aiSettings.useOpenRouter) {
          const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || aiSettings.openRouterApiKey
          if (!apiKey || apiKey.trim() === '') {
            onMissingRef.current()
            setApiConnected(false)
            setIsConnecting(false)
            return
          }
          const connected = await checkOpenRouterConnection(apiKey, aiSettings.openRouterModel)
          setApiConnected(connected)
          if (!connected && !import.meta.env.VITE_OPENROUTER_API_KEY) {
            onMissingRef.current()
          }
        } else {
          setApiConnected(await checkOllamaConnection(aiSettings.ollamaUrl))
        }
      } catch (error) {
        console.error('Connection check error:', error)
        setApiConnected(false)
      } finally {
        if (showConnecting) setIsConnecting(false)
      }
    }
    checkConnection(true)
    const interval = setInterval(() => checkConnection(false), 5000)
    return () => clearInterval(interval)
  }, [aiSettings])

  return { apiConnected, isConnecting }
}
