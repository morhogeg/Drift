import { useState, useRef, useCallback, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseVoiceInputReturn {
  isListening: boolean
  isSupported: boolean
  startListening: () => void
  stopListening: () => void   // stops AND finalizes — does NOT auto-send
  transcript: string          // accumulated text since last startListening()
  clearTranscript: () => void
  error: string | null
}

// ---------------------------------------------------------------------------
// Detection — evaluated once at module load time
// ---------------------------------------------------------------------------

const SpeechRecognitionAPI: (new () => any) | null =
  (typeof window !== 'undefined' &&
    ((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition)) ||
  null

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useVoiceInput
 *
 * Tap-to-speak voice input with three-tier fallback:
 *   1. webkitSpeechRecognition  (Safari desktop / Chrome)
 *   2. SpeechRecognition        (standard, other browsers)
 *   3. @capacitor-community/speech-recognition  (iOS WKWebView — if installed)
 *
 * The optional `onResult` callback receives each new chunk of text as it
 * arrives (for callers that want to update state immediately), while the
 * `transcript` field on the return value accumulates all text.
 */
export function useVoiceInput(
  onResult?: (text: string) => void,
): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Ref so that the recognition.onend closure always sees the current intent.
  const isListeningRef = useRef(false)
  const recognitionRef = useRef<any>(null)
  const onResultRef = useRef(onResult)

  // Keep the callback ref current without recreating stable functions.
  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  // ------------------------------------------------------------------
  // Path 1 & 2 — Web Speech API (webkitSpeechRecognition / SpeechRecognition)
  // ------------------------------------------------------------------

  const isWebSpeechSupported = !!SpeechRecognitionAPI

  const startListeningWeb = useCallback(() => {
    if (!SpeechRecognitionAPI) return

    setError(null)

    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      let newText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          newText += event.results[i][0].transcript + ' '
        }
      }
      if (newText) {
        setTranscript((prev) => prev + newText)
        onResultRef.current?.(newText)
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return // not a real error
      setError(event.error)
      isListeningRef.current = false
      setIsListening(false)
    }

    recognition.onend = () => {
      // iOS / some browsers auto-stop after silence. Restart if we still want
      // to be listening (tap-to-speak semantics: keep going until stopListening).
      if (isListeningRef.current) {
        try {
          recognition.start()
        } catch {
          // start() throws if already started; safe to ignore
        }
      } else {
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    isListeningRef.current = true
    setIsListening(true)
  }, [])

  const stopListeningWeb = useCallback(() => {
    isListeningRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsListening(false)
  }, [])

  // ------------------------------------------------------------------
  // Path 3 — Capacitor community Speech Recognition (iOS WKWebView)
  // This block is guarded by a dynamic import so the bundle doesn't
  // break if the package is not installed.
  // ------------------------------------------------------------------

  // Determine at startup whether the Capacitor plugin is available.
  // We store the result in a ref so we can use it synchronously in callbacks.
  const capacitorAvailableRef = useRef<boolean | null>(null) // null = not yet checked
  const capacitorPluginRef = useRef<any>(null)

  useEffect(() => {
    if (isWebSpeechSupported) {
      // Web Speech API takes priority — no need to probe Capacitor plugin.
      capacitorAvailableRef.current = false
      return
    }
    // Try to import the Capacitor plugin. If the package isn't installed this
    // will throw a module-not-found error, which we catch and treat as "not available".
    let cancelled = false
    // Dynamic import hidden from TypeScript — only runs if the Capacitor plugin is installed
    const specifier = '@capacitor-community/speech-recognition'
    import(/* @vite-ignore */ specifier as string)
      .then((mod: any) => {
        if (!cancelled) {
          capacitorPluginRef.current = mod.SpeechRecognition
          capacitorAvailableRef.current = true
        }
      })
      .catch(() => {
        if (!cancelled) {
          capacitorAvailableRef.current = false
        }
      })
    return () => {
      cancelled = true
    }
  }, [isWebSpeechSupported])

  const startListeningCapacitor = useCallback(async () => {
    const plugin = capacitorPluginRef.current
    if (!plugin) return
    setError(null)
    try {
      await plugin.requestPermissions()
      await plugin.start({
        language: 'en-US',
        maxResults: 1,
        prompt: 'Speak now',
        partialResults: false,
        popup: false,
      })
      plugin.addListener('partialResults', (data: { matches: string[] }) => {
        const text = data.matches?.[0]
        if (text) {
          setTranscript(text) // plugin replaces, not appends
          onResultRef.current?.(text)
        }
      })
      isListeningRef.current = true
      setIsListening(true)
    } catch (err: any) {
      setError(err?.message ?? 'Speech recognition failed')
    }
  }, [])

  const stopListeningCapacitor = useCallback(async () => {
    isListeningRef.current = false
    const plugin = capacitorPluginRef.current
    if (plugin) {
      try {
        await plugin.stop()
        await plugin.removeAllListeners()
      } catch {
        // ignore
      }
    }
    setIsListening(false)
  }, [])

  // ------------------------------------------------------------------
  // Unified API
  // ------------------------------------------------------------------

  const isSupported =
    isWebSpeechSupported ||
    // Treat as supported optimistically on Capacitor platforms where we
    // couldn't check yet (capacitorAvailableRef.current === null) or
    // where the plugin was found.
    capacitorAvailableRef.current !== false

  const startListening = useCallback(() => {
    if (isWebSpeechSupported) {
      startListeningWeb()
    } else if (capacitorAvailableRef.current) {
      startListeningCapacitor()
    }
  }, [isWebSpeechSupported, startListeningWeb, startListeningCapacitor])

  const stopListening = useCallback(() => {
    if (isWebSpeechSupported) {
      stopListeningWeb()
    } else if (capacitorAvailableRef.current) {
      stopListeningCapacitor()
    }
  }, [isWebSpeechSupported, stopListeningWeb, stopListeningCapacitor])

  const clearTranscript = useCallback(() => setTranscript(''), [])

  // ------------------------------------------------------------------
  // Cleanup on unmount
  // ------------------------------------------------------------------

  useEffect(() => {
    return () => {
      isListeningRef.current = false
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
        recognitionRef.current = null
      }
      if (capacitorPluginRef.current) {
        try { capacitorPluginRef.current.stop() } catch {}
        try { capacitorPluginRef.current.removeAllListeners() } catch {}
      }
    }
  }, [])

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
    transcript,
    clearTranscript,
    error,
  }
}
