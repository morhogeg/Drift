import { useState, useRef, useCallback } from 'react'

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export function useVoiceInput(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const isSupported = !!SpeechRecognition

  const startListening = useCallback(() => {
    if (!SpeechRecognition) return
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      onResult(transcript)
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [onResult])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  return { isListening, startListening, stopListening, isSupported }
}
