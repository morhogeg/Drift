import type { MutableRefObject } from 'react'
import { useChatStore } from '@/store/chatStore'
import { useModelStore, DEFAULT_TARGET } from '@/store/modelStore'
import { haptics } from '@/lib/haptics'
import { toast } from '@/hooks/useToast'
import { sendMessageToOpenRouter, type ChatMessage as OpenRouterMessage, OPENROUTER_MODELS } from '@/services/openrouter'
import { sendMessageToOllama, type ChatMessage as OllamaMessage } from '@/services/ollama'
import { sendMessageToGemini, getSuggestedHighlights } from '@/services/gemini'
import { getFreeExample } from '@/lib/freeExamples'
import type { AISettings } from '@/components/Settings'
import type { Message } from '@/types/chat'

interface MessageStreamDeps {
  /** Current AI provider settings (API keys, model presets, selected model). */
  aiSettings: AISettings
  /** Abort handle for the in-flight stream (owned by App; nulled when settled). */
  abortControllerRef: MutableRefObject<AbortController | null>
  /** Whether the user manually scrolled away (suppresses auto-scroll-to-bottom). */
  userHasScrolled: MutableRefObject<boolean>
  /** Smooth-scroll the message list to the latest message. */
  scrollToBottom: () => void
  /** Strip markdown to a plain-text preview for chat `lastMessage` fields. */
  stripMarkdown: (text: string) => string
}

/**
 * The message send / streaming pipeline extracted from App. Owns:
 *  • `sendMessage` — append the user message, then stream the selected model's
 *    reply into a new assistant bubble (patched in place as tokens arrive).
 *  • `stopGeneration` — abort the current stream.
 *
 * Single-model only: the active model is read fresh from the model store at
 * send-time. Reads chat/model state from the stores directly; App-owned pieces
 * (aiSettings, the abort + scroll refs and stripMarkdown) are passed in so
 * behavior stays identical to the inline App implementation.
 */
export function useMessageStream({
  aiSettings,
  abortControllerRef,
  userHasScrolled,
  scrollToBottom,
  stripMarkdown,
}: MessageStreamDeps) {
  const chatStore = useChatStore()
  const messages = chatStore.messages
  const chatHistory = chatStore.chatHistory
  const activeChatId = chatStore.activeChatId
  const message = chatStore.inputText

  // ── sendMessage ─────────────────────────────────────────────────────────────
  // `baseMessages` overrides the conversation the new turn appends to — used by
  // editAndRegenerate to truncate at the edited turn. Normal sends omit it.
  const sendMessage = async (overrideText?: string, baseMessages?: Message[]) => {
    const text = overrideText ?? message
    if (text.trim()) {
      const newMessage: Message = {
        id: Date.now().toString(),
        text: text,
        isUser: true,
        timestamp: new Date(),
      }

      // Sending a message has weight — a light, confident thunk.
      haptics.impact('light')

      const updatedMessages = [...(baseMessages ?? messages), newMessage]
      chatStore.setMessages(updatedMessages)
      // Edits regenerate an old turn — they must not eat a draft sitting in the
      // composer. Normal sends clear it exactly as before.
      if (!baseMessages) chatStore.setInputText('')
      chatStore.setIsTyping(true)
      chatStore.setStreaming('')

      // Update chat title if first user message
      const currentChat = chatHistory.find(c => c.id === activeChatId)
      if (currentChat && currentChat.title === 'New Chat' && updatedMessages.filter(m => m.isUser).length === 1) {
        const newTitle = text.slice(0, 50) + (text.length > 50 ? '...' : '')
        chatStore.updateChat(activeChatId, { title: newTitle, lastMessage: text, messages: updatedMessages })
      } else {
        chatStore.updateChat(activeChatId, { lastMessage: text, messages: updatedMessages })
      }

      userHasScrolled.current = false
      setTimeout(scrollToBottom, 100)

      // ── Free "on us" intro ────────────────────────────────────────────────
      // The four welcome-screen example prompts ship with a pre-written answer
      // (identical for everyone) plus a fixed set of dotted drift terms, so a
      // visitor with no API key can experience Drift instantly — zero API calls.
      // Only fires when the active model has no usable key; a user with their
      // own key gets a live answer exactly as before.
      const t0 = useModelStore.getState().selectedTargets[0] || DEFAULT_TARGET
      const preset0 = (aiSettings?.modelPresets || []).find((p: any) => p.id === t0.key)
      const resolvedKey0 =
        t0.provider === 'gemini'
          ? (import.meta.env.VITE_GEMINI_API_KEY || (preset0 as any)?.apiKey || aiSettings.geminiApiKey)
          : t0.provider === 'openrouter'
          ? (import.meta.env.VITE_OPENROUTER_API_KEY || (preset0 as any)?.apiKey || aiSettings.openRouterApiKey)
          : 'ollama'
      const canned = (t0.provider !== 'ollama' && !resolvedKey0) ? getFreeExample(text) : null
      if (canned) {
        const aiResponseId = (Date.now() + Math.random()).toString()
        const aiMessage: Message = { id: aiResponseId, text: '', isUser: false, timestamp: new Date() }
        chatStore.setMessages([...useChatStore.getState().messages, aiMessage])
        chatStore.setStreamingMessageId(aiResponseId)
        try {
          // Reveal the canned answer token-by-token so it feels like a real stream.
          const tokens = canned.answer.match(/\s+|\S+/g) ?? [canned.answer]
          let acc = ''
          let first = true
          for (const tok of tokens) {
            if (!useChatStore.getState().isTyping) break // user pressed Stop
            acc += tok
            if (first) { first = false; haptics.selection() }
            chatStore.setStreaming(acc)
            const cur = useChatStore.getState().messages
            chatStore.setMessages(cur.map(m => m.id === aiResponseId ? { ...m, text: acc } : m))
            await new Promise(r => setTimeout(r, 14))
          }
          // Finalize the bubble and attach the fixed dotted drift terms.
          const finalCur = useChatStore.getState().messages
          chatStore.setMessages(finalCur.map(m => m.id === aiResponseId ? { ...m, text: canned.answer, suggestedHighlights: canned.highlights } : m))
          chatStore.updateMessage(activeChatId, aiResponseId, { text: canned.answer, suggestedHighlights: canned.highlights })
          chatStore.updateChat(activeChatId, { lastMessage: stripMarkdown(canned.answer).slice(0, 100) })
        } finally {
          chatStore.setStreaming('')
          chatStore.setIsTyping(false)
          if (useChatStore.getState().streamingMessageId === aiResponseId) chatStore.setStreamingMessageId(null)
          abortControllerRef.current = null
          if (!userHasScrolled.current) setTimeout(scrollToBottom, 100)
        }
        return
      }

      const apiMessages: (OpenRouterMessage | OllamaMessage)[] = updatedMessages.map(msg => ({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.text
      }))

      try {
        const abortController = new AbortController()
        abortControllerRef.current = abortController

        const streamIntoNewMessage = async (
          streamer: (msgs: any[], onChunk: (c: string) => void, signal?: AbortSignal) => Promise<void>,
          modelTag?: string,
        ) => {
          const aiResponseId = (Date.now() + Math.random()).toString()
          let acc = ''
          const aiMessage: Message = {
            id: aiResponseId,
            text: '',
            isUser: false,
            timestamp: new Date(),
            modelTag,
          }
          // append empty bubble — use getState() to avoid stale closure overwriting user message
          chatStore.setMessages([...useChatStore.getState().messages, aiMessage])
          // Mark this bubble as the actively-streaming one (drives the live shimmer).
          chatStore.setStreamingMessageId(aiResponseId)
          let firstToken = true
          try {
            await streamer(
              apiMessages as any,
              (chunk) => {
                if (firstToken) {
                  firstToken = false
                  // A thought materializing — a light tick as the first token lands.
                  haptics.selection()
                }
                acc += chunk
                chatStore.setStreaming(acc)
                // patch the bubble in place
                const current = useChatStore.getState().messages
                chatStore.setMessages(current.map(m => m.id === aiResponseId ? { ...m, text: acc } : m))
              },
              abortControllerRef.current?.signal
            )
          } finally {
            // Stop shimmering this bubble (only if it's still the active one).
            if (useChatStore.getState().streamingMessageId === aiResponseId) {
              chatStore.setStreamingMessageId(null)
            }
          }
          // update lastMessage preview
          chatStore.updateChat(activeChatId, { lastMessage: stripMarkdown(acc).slice(0, 100) })
          return { id: aiResponseId, text: acc }
        }

        // Read the selected model from the store directly at send-time to avoid
        // stale-closure issues when the selection has just changed but React
        // hasn't re-rendered yet.
        const freshTargets = useModelStore.getState().selectedTargets
        const t = freshTargets[0] || DEFAULT_TARGET

        if (t.provider === 'gemini') {
          const preset = (aiSettings?.modelPresets || []).find((p: any) => p.id === t.key)
          const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (preset as any)?.apiKey || aiSettings.geminiApiKey
          if (!apiKey) throw new Error('No Gemini API key found.')
          const model = (preset?.model || aiSettings.geminiModel) as any
          const result = await streamIntoNewMessage(async (msgs, onChunk, signal) =>
            sendMessageToGemini(msgs, onChunk, apiKey, signal, model)
          , t.label)
          // Fire-and-forget: enrich message with AI-suggested drift highlights
          if (result && result.text && apiKey) {
            const capturedChatId = activeChatId
            getSuggestedHighlights(result.text, apiKey, model)
              .then(highlights => {
                if (highlights.length > 0) {
                  chatStore.updateMessage(capturedChatId, result.id, { suggestedHighlights: highlights })
                }
              })
              .catch(() => {})
          }
        } else if (t.provider === 'openrouter') {
          const preset = (aiSettings?.modelPresets || []).find((p: any) => p.id === t.key)
          const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || (preset as any)?.apiKey || aiSettings.openRouterApiKey
          if (!apiKey) throw new Error('No OpenRouter API key found. Please set VITE_OPENROUTER_API_KEY in .env file')
          const model = preset?.model || aiSettings.openRouterModel || OPENROUTER_MODELS.QWEN3
          await streamIntoNewMessage(async (msgs, onChunk, signal) =>
            sendMessageToOpenRouter(msgs, onChunk, apiKey, signal, model as any)
          , t.label)
        } else if (t.provider === 'ollama') {
          const preset = (aiSettings?.modelPresets || []).find((p: any) => p.id === t.key)
          const url = preset?.serverUrl || aiSettings.ollamaUrl
          const model = preset?.model || aiSettings.ollamaModel
          await streamIntoNewMessage(async (msgs, onChunk, signal) => {
            await sendMessageToOllama(msgs, onChunk, signal!, url, model)
          }, t.label)
        }

        chatStore.setStreaming('')
      } catch (error) {
        let errorMessage = "Failed to connect to AI model. Please check your connection."
        if (error instanceof Error) {
          const msg = error.message || ''
          const lower = msg.toLowerCase()
          // Auth/config problems (any provider): the key is missing or rejected.
          // gemini.ts throws "...API key not configured..." or "Gemini API error 401/403"
          // (and Google's body says "API key not valid"); these must not be hidden
          // behind a generic "check your connection".
          const keyMissing = lower.includes('not configured')
          const keyInvalid =
            lower.includes('api key not valid') ||
            lower.includes('api_key_invalid') ||
            lower.includes('invalid api key') ||
            /api error 40[13]/.test(lower)
          const rateLimited = lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')

          if (aiSettings.useOpenRouter && msg.includes('API key')) {
            errorMessage = "OpenRouter API key not configured. Please add your API key to the .env file."
          } else if (!aiSettings.useOpenRouter && msg.includes('Ollama is not running')) {
            errorMessage = "Ollama is not running. Please install and start Ollama."
          } else if (keyMissing) {
            errorMessage = "No API key set. Add your key in Settings to start chatting."
          } else if (keyInvalid) {
            errorMessage = "Your API key looks invalid. Check it in Settings."
          } else if (rateLimited) {
            errorMessage = "Rate limit reached. Wait a moment and try again."
          }
        }
        toast.error(errorMessage)
        const aiResponse: Message = {
          id: (Date.now() + 1).toString(),
          text: errorMessage,
          isUser: false,
          timestamp: new Date()
        }
        chatStore.setMessages([...chatStore.messages, aiResponse])
        chatStore.updateChat(activeChatId, { lastMessage: 'Connection error' })
      } finally {
        chatStore.setIsTyping(false)
        chatStore.setStreamingMessageId(null)
        abortControllerRef.current = null
        if (!userHasScrolled.current) setTimeout(scrollToBottom, 100)
      }
    }
  }

  // ── editAndRegenerate ───────────────────────────────────────────────────────
  // Edit a sent user message and regenerate from that point. Everything after
  // the edited turn is discarded (the conversation honestly diverges there);
  // the revised text then flows through the normal send pipeline so streaming,
  // titles and suggested highlights behave identically to a fresh send.
  // Drift conversations opened from discarded replies survive as their own
  // sessions (sidebar, map and recall marks still reach them).
  const editAndRegenerate = async (messageId: string, newText: string) => {
    const text = newText.trim()
    if (!text) return
    if (useChatStore.getState().isTyping) return // never truncate mid-stream
    const current = useChatStore.getState().messages
    const idx = current.findIndex(m => m.id === messageId && m.isUser)
    if (idx === -1) return

    // If the chat was auto-titled from this exact message, retitle from the
    // edited text so the sidebar stays honest.
    const edited = current[idx]
    const oldAutoTitle = edited.text.slice(0, 50) + (edited.text.length > 50 ? '...' : '')
    const chat = useChatStore.getState().chatHistory.find(c => c.id === useChatStore.getState().activeChatId)
    if (chat && chat.title === oldAutoTitle) {
      chatStore.updateChat(chat.id, { title: text.slice(0, 50) + (text.length > 50 ? '...' : '') })
    }

    await sendMessage(text, current.slice(0, idx))
  }

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      chatStore.setIsTyping(false)
      chatStore.setStreaming('')
      chatStore.setStreamingMessageId(null)
    }
  }

  return {
    sendMessage,
    editAndRegenerate,
    stopGeneration,
  }
}
