import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useChatStore } from '@/store/chatStore'
import { useModelStore, DEFAULT_TARGET } from '@/store/modelStore'
import { haptics } from '@/lib/haptics'
import { toast } from '@/hooks/useToast'
import { sendMessageToOpenRouter, type ChatMessage as OpenRouterMessage, OPENROUTER_MODELS } from '@/services/openrouter'
import { sendMessageToOllama, type ChatMessage as OllamaMessage } from '@/services/ollama'
import { sendMessageToGemini, getSuggestedHighlights } from '@/services/gemini'
import type { AISettings } from '@/components/Settings'
import type { Message, Target } from '@/types/chat'

interface MessageStreamDeps {
  /** Current AI provider settings (API keys, model presets, selected models). */
  aiSettings: AISettings
  /** Active drift strand id stamped onto new user/assistant messages (or undefined). */
  activeStrandId: string | null
  /** Active canvas id snapshot stamped onto the outgoing user message. */
  activeCanvasId: string | null
  /** Clear the active canvas once a message has been sent into it. */
  setActiveCanvasId: (id: string | null) => void
  /** Pending "continue from this message" target; cleared at send-time. */
  continueFromMessageId: string | null
  /** Clear the continue-from marker once the send begins. */
  setContinueFromMessageId: (id: string | null) => void
  /** Set/clear the active broadcast group (multi-model fan-out). */
  setActiveBroadcastGroupId: (id: string | null) => void
  /** Track the per-group "continued with" model selection. */
  setContinuedModelByGroup: Dispatch<SetStateAction<Record<string, string | null>>>
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
 *  • `sendMessage` — the primary send path (single-model + multi-model broadcast),
 *    including the inner `streamIntoNewMessage` helper that appends an empty
 *    assistant bubble and patches it in place as tokens stream in.
 *  • `sendToTarget` — stream one additional model into a bubble when a model is
 *    added after a broadcast group is already active.
 *  • `retroactivelyUpgradeToBroadcast` — promote the last single-model exchange
 *    into a broadcast group so a newly-added model joins the same exchange.
 *  • `stopGeneration` — abort the current stream.
 *
 * Reads chat/model state from the stores directly; the App-owned pieces
 * (aiSettings, the strand/canvas/continue setters, the abort + scroll refs and
 * stripMarkdown) are passed in so behavior stays identical to the inline App
 * implementation.
 */
export function useMessageStream({
  aiSettings,
  activeStrandId,
  activeCanvasId,
  setActiveCanvasId,
  continueFromMessageId,
  setContinueFromMessageId,
  setActiveBroadcastGroupId,
  setContinuedModelByGroup,
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

  // ── retroactivelyUpgradeToBroadcast ─────────────────────────────────────────
  // When the user was in single-model mode (no broadcastGroupId on the last
  // exchange), assign a new broadcastGroupId to the last user message and last
  // assistant message, set activeBroadcastGroupId, and return the new group id
  // along with context messages for sendToTarget.  Returns null if there is no
  // qualifying last exchange to upgrade.
  const retroactivelyUpgradeToBroadcast = (): {
    groupId: string
    contextMsgs: { role: string; content: string }[]
  } | null => {
    const currentMessages = useChatStore.getState().messages
    // Walk backwards to find the last assistant message that has no broadcastGroupId
    const lastAsstIndex = [...currentMessages].reduceRight((found, m, i) => {
      if (found !== -1) return found
      if (!m.isUser && !m.broadcastGroupId && !m.canvasId) return i
      return -1
    }, -1)
    if (lastAsstIndex === -1) return null

    // The user message immediately before it
    const lastUserIndex = lastAsstIndex - 1
    if (lastUserIndex < 0 || !currentMessages[lastUserIndex].isUser) return null

    const newGroupId = 'bg-' + Date.now()

    // Patch only the assistant message with the new broadcastGroupId
    // (user messages must NOT get broadcastGroupId — the carousel renderer
    // triggers on the first message that has it, so including the user msg
    // would make it the first carousel card)
    const upgraded = currentMessages.map((m, i) => {
      if (i === lastAsstIndex) {
        return { ...m, broadcastGroupId: newGroupId }
      }
      return m
    })
    chatStore.setMessages(upgraded)
    setActiveBroadcastGroupId(newGroupId)
    setContinuedModelByGroup(prev => ({ ...prev, [newGroupId]: null }))

    // Context = everything up to (not including) the user message that started
    // this exchange, so the new model receives the same context
    const contextMsgs = currentMessages
      .slice(0, lastUserIndex + 1)
      .map(m => ({ role: m.isUser ? 'user' : 'assistant', content: m.text }))

    return { groupId: newGroupId, contextMsgs }
  }

  // ── sendToTarget: stream a single target into a new message bubble ───────────
  // Used when a model is added after a broadcast group is already active.
  const sendToTarget = async (
    target: Target,
    contextMessages: { role: string; content: string }[],
    broadcastGroupId: string
  ) => {
    const aiResponseId = (Date.now() + Math.random()).toString()
    let acc = ''
    const aiMessage: Message = {
      id: aiResponseId,
      text: '',
      isUser: false,
      timestamp: new Date(),
      modelTag: target.label,
      broadcastGroupId,
    }
    chatStore.setMessages([...useChatStore.getState().messages, aiMessage])

    const abortController = new AbortController()
    const signal = abortController.signal

    const onChunk = (chunk: string) => {
      acc += chunk
      chatStore.setStreaming(acc)
      const current = useChatStore.getState().messages
      chatStore.setMessages(current.map(m => m.id === aiResponseId ? { ...m, text: acc } : m))
    }

    try {
      if (target.provider === 'gemini') {
        const preset = (aiSettings?.modelPresets || []).find((p: any) => p.id === target.key)
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (preset as any)?.apiKey || aiSettings.geminiApiKey
        if (!apiKey) throw new Error('No Gemini API key found.')
        const model = (preset?.model || aiSettings.geminiModel) as any
        await sendMessageToGemini(contextMessages as any, onChunk, apiKey, signal, model)
      } else if (target.provider === 'openrouter') {
        const preset = (aiSettings?.modelPresets || []).find((p: any) => p.id === target.key)
        const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || (preset as any)?.apiKey || aiSettings.openRouterApiKey
        if (!apiKey) throw new Error('No OpenRouter API key found.')
        const model = preset?.model || aiSettings.openRouterModel || OPENROUTER_MODELS.QWEN3
        await sendMessageToOpenRouter(contextMessages as any, onChunk, apiKey, signal, model as any)
      } else if (target.provider === 'ollama') {
        const preset = (aiSettings?.modelPresets || []).find((p: any) => p.id === target.key)
        const url = preset?.serverUrl || aiSettings.ollamaUrl
        const model = preset?.model || aiSettings.ollamaModel
        await sendMessageToOllama(contextMessages as any, onChunk, signal, url, model)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error'
      const current = useChatStore.getState().messages
      chatStore.setMessages(current.map(m => m.id === aiResponseId ? { ...m, text: `[Error: ${errMsg}]` } : m))
    }
  }

  // ── sendMessage ─────────────────────────────────────────────────────────────
  const sendMessage = async (overrideText?: string) => {
    const text = overrideText ?? message
    if (text.trim()) {
      if (continueFromMessageId) setContinueFromMessageId(null)
      const canvasIdSnapshot = activeCanvasId || undefined

      const newMessage: Message = {
        id: Date.now().toString(),
        text: text,
        isUser: true,
        timestamp: new Date(),
        strandId: activeStrandId || undefined,
        canvasId: canvasIdSnapshot
      }

      // Sending a message has weight — a light, confident thunk.
      haptics.impact('light')

      const updatedMessages = [...messages, newMessage]
      chatStore.setMessages(updatedMessages)
      if (activeCanvasId) setActiveCanvasId(null)
      chatStore.setInputText('')
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
          broadcastGroupId?: string,
          strandId?: string,
          canvasId?: string
        ) => {
          const aiResponseId = (Date.now() + Math.random()).toString()
          let acc = ''
          const aiMessage: Message = {
            id: aiResponseId,
            text: '',
            isUser: false,
            timestamp: new Date(),
            modelTag,
            broadcastGroupId,
            strandId,
            canvasId
          }
          // append empty bubble — use getState() to avoid stale closure overwriting user message
          chatStore.setMessages([...useChatStore.getState().messages, aiMessage])
          // Mark this bubble as the actively-streaming one (drives the live shimmer).
          // For broadcast we let the first lane "own" the id — the shimmer is per-message.
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

        // Read selectedTargets from the store directly at send-time to avoid
        // stale closure issues when continueWithModel has just updated the store
        // but React hasn't re-rendered yet (so the closure-captured `selectedTargets`
        // would still reflect the old multi-model selection).
        const freshTargets = useModelStore.getState().selectedTargets
        const targets = freshTargets.length ? freshTargets : [DEFAULT_TARGET]
        const isBroadcast = targets.length > 1

        if (isBroadcast) {
          const broadcastGroupId = 'bg-' + Date.now()
          setActiveBroadcastGroupId(broadcastGroupId)
          setContinuedModelByGroup(prev => ({ ...prev, [broadcastGroupId]: null }))
          const tasks: Promise<unknown>[] = []
          for (const t of targets) {
            if (t.provider === 'gemini') {
              const preset = (aiSettings?.modelPresets || []).find((p: any) => p.id === t.key)
              const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (preset as any)?.apiKey || aiSettings.geminiApiKey
              if (!apiKey) throw new Error('No Gemini API key found.')
              const model = (preset?.model || aiSettings.geminiModel) as any
              tasks.push(
                streamIntoNewMessage(async (msgs, onChunk, signal) =>
                  sendMessageToGemini(msgs, onChunk, apiKey, signal, model)
                , t.label, broadcastGroupId)
              )
            } else if (t.provider === 'openrouter') {
              const preset = (aiSettings?.modelPresets || []).find((p: any) => p.id === t.key)
              const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || (preset as any)?.apiKey || aiSettings.openRouterApiKey
              if (!apiKey) throw new Error('No OpenRouter API key found. Please set VITE_OPENROUTER_API_KEY in .env file')
              const model = preset?.model || aiSettings.openRouterModel || OPENROUTER_MODELS.QWEN3
              tasks.push(
                streamIntoNewMessage(async (msgs, onChunk, signal) =>
                  sendMessageToOpenRouter(msgs, onChunk, apiKey, signal, model as any)
                , t.label, broadcastGroupId)
              )
            } else if (t.provider === 'ollama') {
              const preset = (aiSettings?.modelPresets || []).find((p: any) => p.id === t.key)
              const url = preset?.serverUrl || aiSettings.ollamaUrl
              const model = preset?.model || aiSettings.ollamaModel
              tasks.push(
                streamIntoNewMessage(async (msgs, onChunk, signal) => {
                  await sendMessageToOllama(msgs, onChunk, signal!, url, model)
                }, t.label, broadcastGroupId)
              )
            }
          }
          await Promise.allSettled(tasks)
        } else {
          // Single-model send — clear any stale broadcast group so adding a model
          // later correctly retroactively upgrades THIS exchange, not an old one
          setActiveBroadcastGroupId(null)
          const t = targets[0]
          if (t.provider === 'gemini') {
            const preset = (aiSettings?.modelPresets || []).find((p: any) => p.id === t.key)
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (preset as any)?.apiKey || aiSettings.geminiApiKey
            if (!apiKey) throw new Error('No Gemini API key found.')
            const model = (preset?.model || aiSettings.geminiModel) as any
            const result = await streamIntoNewMessage(async (msgs, onChunk, signal) =>
              sendMessageToGemini(msgs, onChunk, apiKey, signal, model)
            , t.label, undefined, activeStrandId || undefined, undefined)
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
            , t.label, undefined, activeStrandId || undefined, undefined)
          } else if (t.provider === 'ollama') {
            const preset = (aiSettings?.modelPresets || []).find((p: any) => p.id === t.key)
            const url = preset?.serverUrl || aiSettings.ollamaUrl
            const model = preset?.model || aiSettings.ollamaModel
            await streamIntoNewMessage(async (msgs, onChunk, signal) => {
              await sendMessageToOllama(msgs, onChunk, signal!, url, model)
            }, t.label, undefined, activeStrandId || undefined, undefined)
          }
        }

        chatStore.setStreaming('')
      } catch (error) {
        let errorMessage = "Failed to connect to AI model. Please check your connection."
        if (error instanceof Error) {
          if (aiSettings.useOpenRouter && error.message.includes('API key')) {
            errorMessage = "OpenRouter API key not configured. Please add your API key to the .env file."
          } else if (!aiSettings.useOpenRouter && error.message.includes('Ollama is not running')) {
            errorMessage = "Ollama is not running. Please install and start Ollama."
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
    retroactivelyUpgradeToBroadcast,
    sendToTarget,
    sendMessage,
    stopGeneration,
  }
}
