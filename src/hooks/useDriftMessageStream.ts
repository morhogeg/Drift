import { useRef, type Dispatch, type SetStateAction } from 'react'
import { haptics } from '../lib/haptics'
import { sendMessageToOpenRouter, type ChatMessage as OpenRouterMessage, type OpenRouterModel, OPENROUTER_MODELS } from '../services/openrouter'
import { sendMessageToOllama, type ChatMessage as OllamaMessage } from '../services/ollama'
import { sendMessageToGemini, getSuggestedHighlights, type ChatMessage as GeminiMessage } from '../services/gemini'
import type { AISettings } from '../components/Settings'
import type { TermOccurrence } from '../lib/termIndex'
import { TEMPLATE_SYSTEM_PROMPTS, isDriftScaffoldText, isDriftOpenerText, friendlyDriftError, isChallengeTriggerText } from '../lib/driftPanel'
import { resolveLensPrompt } from '../lib/customLenses'
import type { LensKey } from '../types/chat'
import { resolveChallengerTarget, resolveModelCall } from '../lib/challenger'
import type { Message } from '../components/DriftPanel'

interface DriftMessageStreamDeps {
  /** Current input box text (sent when no override is given). */
  message: string
  /** The drift-only conversation (excludes parent context messages). */
  driftOnlyMessages: Message[]
  /** Whether a request is already streaming — guards retry. */
  isTyping: boolean
  /** The term the drift is exploring. */
  selectedText: string
  /** Parent conversation, used to ground/disambiguate the prompt. */
  contextMessages: Message[]
  /** One-tap workflow type, if this is a template drift. */
  templateType?: LensKey
  /** Active Connect bridge question (null in chips view / non-connect drifts). */
  connectQuestion: string | null
  /** Prior explorations of related terms — fed into the Connect prompt to avoid repeats. */
  relatedDrifts?: TermOccurrence[]
  /** Provider inherited from the main chat (otherwise inferred from available keys). */
  selectedProvider?: 'openrouter' | 'ollama' | 'gemini'
  /** Selected model targets (length-1 today; compare needs 2+). */
  selectedTargets?: Array<{ provider: 'openrouter' | 'ollama' | 'gemini'; key: string; label: string }>
  aiSettings: AISettings
  setMessage: Dispatch<SetStateAction<string>>
  setMessages: Dispatch<SetStateAction<Message[]>>
  setDriftOnlyMessages: Dispatch<SetStateAction<Message[]>>
  setIsTyping: Dispatch<SetStateAction<boolean>>
  setIsComparing: Dispatch<SetStateAction<boolean>>
  setStreamingMsgId: Dispatch<SetStateAction<string | null>>
  setMsgHighlights: Dispatch<SetStateAction<Map<string, string[]>>>
}

/**
 * The drift conversation send / streaming pipeline, extracted verbatim from
 * DriftPanel. Owns the in-flight abort controllers (single + compare lanes) and
 * exposes:
 *  • `sendMessage` — append the user turn, build the context-aware/template
 *    system prompt, then stream the chosen provider's reply into a new bubble
 *    (patched in place as tokens arrive); fires off key-term highlight enrichment.
 *  • `retryLastMessage` — re-run the last user turn after a failed request.
 *  • `stopGeneration` — abort the active single + compare streams.
 *  • `handleCompareAcrossModels` — fan the prompt out across 2+ targets
 *    concurrently (dormant while single-model, parked for multi-model's return).
 *
 * Behavior-preserving: all panel-owned state is passed in via deps so the
 * functions read/write exactly what the inline implementation did.
 */
export function useDriftMessageStream({
  message,
  driftOnlyMessages,
  isTyping,
  selectedText,
  contextMessages,
  templateType,
  connectQuestion,
  relatedDrifts,
  selectedProvider,
  selectedTargets,
  aiSettings,
  setMessage,
  setMessages,
  setDriftOnlyMessages,
  setIsTyping,
  setIsComparing,
  setStreamingMsgId,
  setMsgHighlights,
}: DriftMessageStreamDeps) {
  const abortControllerRef = useRef<AbortController | null>(null)
  const compareAbortControllersRef = useRef<Record<string, AbortController> | null>(null)

  const sendMessage = async (overrideText?: string, isRetry = false) => {
    const textToSend = (overrideText ?? message).trim()
    if (textToSend) {
      // Sending a message has weight — a light, confident thunk.
      haptics.impact('light')

      let newMessage: Message
      if (isRetry) {
        // Re-run the last user turn: clear the error bubble and reuse the existing
        // user message rather than appending a duplicate.
        setMessages(prev => prev.filter(m => !m.isError))
        setDriftOnlyMessages(prev => prev.filter(m => !m.isError))
        const lastUser = [...driftOnlyMessages].reverse().find(m => m.isUser)
        newMessage = lastUser ?? { id: 'drift-' + Date.now().toString(), text: textToSend, isUser: true, timestamp: new Date() }
      } else {
        newMessage = {
          id: 'drift-' + Date.now().toString(),
          text: textToSend,
          isUser: true,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, newMessage])
        setDriftOnlyMessages(prev => [...prev, newMessage])
        if (!overrideText) setMessage('')
      }
      setIsTyping(true)

      // Only use drift-specific messages, not the context messages.
      // Filter out the system message, context messages, any prior error
      // bubble, and the current turn (re-appended below as the user prompt).
      const driftConversation = driftOnlyMessages.filter(
        msg => !isDriftScaffoldText(msg.text) && !msg.isError && msg.id !== newMessage.id
      )

      // Build context string from parent conversation (last ~8 messages). Cap each
      // message so one very long answer can't crowd out the rest of the context.
      const parentContext = contextMessages.slice(-8).map(msg => {
        const body = msg.text.length > 1200 ? msg.text.slice(0, 1200) + '…' : msg.text
        return `${msg.isUser ? 'User' : 'Assistant'}: ${body}`
      }).join('\n')

      // Use template system prompt if set, otherwise use default context-aware prompt
      // In connect chat mode, use a conversational prompt (not the JSON-returning connect prompt)
      // History-aware Connect: feed prior same/related-term drifts into the chip
      // prompt so the directions are ones the user has NOT already taken.
      const priorTerms = (relatedDrifts ?? []).map(o => o.term).filter(Boolean)
      // TODO(semantic): seed the Connect lens directly from semantic neighbors
      // (e.g. pass the top semantic matches/their answer snippets, not just term
      // labels, so "back" links can reference meaning-related drifts the lexical
      // pass missed). Out of scope for this pass — relatedDrifts already carries
      // merged semantic matches, so this benefits indirectly for now.
      // Disambiguation: "Barcelona" inside a Messi conversation means FC Barcelona
      // the club — not the city. Force the model to read the term through context.
      const connectDisambiguation = parentContext
        ? `\n\nCRITICAL — DISAMBIGUATE BY CONTEXT: The user selected "${selectedText}" while reading the conversation below. Interpret "${selectedText}" ONLY in the sense the conversation implies — use the surrounding text to resolve which specific entity is meant (e.g. a football club vs. a city, a person vs. a namesake, a company vs. a common word). Every connection MUST be about that contextual meaning, NOT the most generic/popular meaning of the word.\n\nConversation context:\n${parentContext}`
        : ''
      const connectChipsPrompt = (priorTerms.length
        ? `${TEMPLATE_SYSTEM_PROMPTS['connect']}\n\nThe user has ALREADY explored these related threads — do NOT repeat them, point somewhere genuinely new: ${priorTerms.slice(0, 12).join(', ')}.`
        : TEMPLATE_SYSTEM_PROMPTS['connect']) + connectDisambiguation

      // Challenge is cross-model + adversarial ONLY for the explicit "Challenge
      // this:" turn. A follow-up inside a challenge thread (typed, or tapping a
      // dotted suggestion) is ordinary exploration: drop the challenge framing so
      // it uses the normal context-aware prompt (and, below, the main model).
      const isChallengeTurn = templateType === 'challenge' && isChallengeTriggerText(textToSend)
      const effectiveTemplate = (templateType === 'challenge' && !isChallengeTurn) ? undefined : templateType

      const baseSystemContent = (effectiveTemplate === 'connect' && connectQuestion)
        ? `The user is reading about "${selectedText}" and tapped a connection to explore this bridge: "${connectQuestion}". Reveal the actual link between the two — the through-line, the shared mechanism, the influence, or the tension — not a standalone definition of either side. Lead with the most interesting or surprising part of the connection, give the concrete specifics (names, events, how one shaped or opposes the other), and keep "${selectedText}" in the frame throughout. If the connection is more tenuous than it sounds, be honest about that rather than overstating it. Do not invent facts. Be concise and vivid — a few tight paragraphs, no padding.${parentContext ? `\n\nInterpret "${selectedText}" in the sense this conversation implies (disambiguate by context):\n${parentContext}` : ''}`
        : (effectiveTemplate === 'connect')
        ? connectChipsPrompt
        : effectiveTemplate
        ? (resolveLensPrompt(effectiveTemplate) ?? TEMPLATE_SYSTEM_PROMPTS[effectiveTemplate])
        : (parentContext
            ? `The user is reading the conversation below and selected "${selectedText}" to explore it further.\n\nConversation context:\n${parentContext}\n\nInterpret "${selectedText}" ONLY in the sense this conversation implies — use the surrounding text to resolve which specific entity is meant (a club vs. a city, a person vs. a namesake). Do not restate the basic definition they can already see; instead add NEW value: the non-obvious angle, the mechanism, a concrete example, the relevant history or tension. Be concise, specific, and accurate — don't invent facts.`
            : `The user selected "${selectedText}" from a conversation they're already reading. They want to explore this specific term/concept deeper. Don't repeat the basic definition - they can already see that. Instead, provide interesting insights, examples, etymology, cultural context, or related concepts. Be concise, specific, and add NEW value beyond what's already visible. Don't invent facts.`)
      // Connect branches already embed their own context above; only the
      // non-connect templates need it appended here.
      const systemContent = (effectiveTemplate && effectiveTemplate !== 'connect' && parentContext)
        ? `${baseSystemContent}\n\nContext from the conversation:\n${parentContext}`
        : baseSystemContent

      // Convert messages to API format with special Drift context
      const apiMessages: (OpenRouterMessage | OllamaMessage)[] = [
        {
          role: 'system',
          content: systemContent
        },
        ...driftConversation.map(msg => ({
          role: msg.isUser ? 'user' as const : 'assistant' as const,
          content: msg.text
        })),
        { role: 'user' as const, content: textToSend }
      ]

      const envGeminiKey = import.meta.env.VITE_GEMINI_API_KEY
      const geminiKey = envGeminiKey || aiSettings.geminiApiKey
      const envKey = import.meta.env.VITE_OPENROUTER_API_KEY
      const effectiveApiKey = envKey || aiSettings.openRouterApiKey

      // Cross-model Challenge: route the critique through the user's chosen
      // challenger model — a genuinely independent voice, not the main model
      // arguing with itself. Falls back to the inherited model when no valid
      // challenger is set (the picker hasn't run, or it collapsed onto main).
      const mainKey = selectedTargets?.[0]?.key
      const challengerTarget = isChallengeTurn
        ? resolveChallengerTarget(aiSettings.challengerModel, aiSettings.modelPresets, mainKey)
        : null
      const challengerCall = challengerTarget ? resolveModelCall(challengerTarget, aiSettings) : null

      // If a provider was passed from main chat, honor it. Otherwise, infer.
      const provider: 'openrouter' | 'ollama' | 'gemini' = challengerCall
        ? challengerCall.provider
        : selectedProvider
        ? selectedProvider
        : (geminiKey ? 'gemini' : effectiveApiKey ? 'openrouter' : 'ollama')

      try {
        // Create abort controller for this request
        const abortController = new AbortController()
        abortControllerRef.current = abortController

        const aiResponseId = 'drift-ai-' + Date.now().toString()
        let accumulatedResponse = ''

        // Add empty AI message. Tag cross-model Challenge replies with the
        // challenger's label so the bubble reads "Challenged by {model}".
        const aiMessage: Message = {
          id: aiResponseId,
          text: '',
          isUser: false,
          timestamp: new Date(),
          ...(challengerTarget ? { modelTag: challengerTarget.label } : {}),
        }
        setMessages(prev => [...prev, aiMessage])
        setDriftOnlyMessages(prev => [...prev, aiMessage])
        setStreamingMsgId(aiResponseId)

        let firstToken = true
        const onChunk = (chunk: string) => {
          if (firstToken) {
            firstToken = false
            // A thought materializing — a light tick as the first token lands.
            haptics.selection()
          }
          accumulatedResponse += chunk
          setMessages(prev => prev.map(msg => msg.id === aiResponseId ? { ...msg, text: accumulatedResponse } : msg))
          setDriftOnlyMessages(prev => prev.map(msg => msg.id === aiResponseId ? { ...msg, text: accumulatedResponse } : msg))
        }

        // Stream the response using the chosen provider. When a challenger is
        // active, its resolved model/key/url win over the inherited main model.
        if (provider === 'gemini') {
          const apiKey = challengerCall?.apiKey || geminiKey
          if (!apiKey) throw new Error('No Gemini API key found. Please set it in Settings.')
          const sTargets = selectedTargets || []
          const preset = sTargets.length === 1 ? sTargets[0] : null
          const inheritedModel = (preset?.key && aiSettings.modelPresets?.find((p: any) => p.id === preset.key)?.model) || aiSettings.geminiModel as any
          const model = challengerCall?.model || inheritedModel
          // Append a clickable "Sources" list only for the Evidence lens — that's
          // the one whose job is citations; other drifts and the main chat stay clean.
          await sendMessageToGemini(apiMessages as GeminiMessage[], onChunk, apiKey, abortController.signal, model, true, effectiveTemplate === 'evidence')
        } else if (provider === 'openrouter') {
          const apiKey = challengerCall?.apiKey || effectiveApiKey
          if (!apiKey) throw new Error('No OpenRouter API key found. Please set VITE_OPENROUTER_API_KEY in .env file')
          const sTargets = selectedTargets || []
          const useQwen3 = (sTargets.length === 1 && (sTargets[0].key === 'qwen3' || sTargets[0].label === 'Qwen3'))
          const inheritedModel = useQwen3 ? OPENROUTER_MODELS.QWEN3 : (aiSettings.openRouterModel || OPENROUTER_MODELS.OSS)
          // Challenger picks its own model (e.g. anthropic/claude-haiku-4-5).
          const model = (challengerCall?.model || inheritedModel) as OpenRouterModel
          await sendMessageToOpenRouter(apiMessages as OpenRouterMessage[], onChunk, apiKey, abortController.signal, model)
        } else if (provider === 'ollama') {
          await sendMessageToOllama(
            apiMessages as OllamaMessage[],
            onChunk,
            abortController.signal,
            challengerCall?.serverUrl || aiSettings.ollamaUrl,
            challengerCall?.model || aiSettings.ollamaModel
          )
        }
      // Fire-and-forget: fetch key-term highlights for this AI response
      const geminiKeyForHL = import.meta.env.VITE_GEMINI_API_KEY || aiSettings.geminiApiKey
      if (geminiKeyForHL && accumulatedResponse.length > 80) {
        const capturedId = aiResponseId
        const capturedText = accumulatedResponse
        getSuggestedHighlights(capturedText, geminiKeyForHL).then(hl => {
          if (hl.length > 0) {
            setMsgHighlights(prev => {
              const next = new Map(prev)
              next.set(capturedId, hl)
              return next
            })
          }
        })
      }
    } catch (error) {
        console.error('Drift panel error:', error)
        const friendly = friendlyDriftError(error, provider)
        // An aborted request (user pressed Stop) isn't worth surfacing.
        if (friendly) {
          const aiResponse: Message = {
            id: 'drift-error-' + Date.now().toString(),
            text: friendly,
            isUser: false,
            isError: true,
            timestamp: new Date()
          }
          setMessages(prev => [...prev, aiResponse])
          setDriftOnlyMessages(prev => [...prev, aiResponse])
        }
      } finally {
        setIsTyping(false)
        setStreamingMsgId(null)
        abortControllerRef.current = null
      }
    }
  }

  // Re-run the most recent user turn after a failed request (the inline error
  // bubble's "Try again"). Reuses the existing user message — no duplicate turn.
  const retryLastMessage = () => {
    if (isTyping) return
    const lastUser = [...driftOnlyMessages].reverse().find(m => m.isUser)
    if (!lastUser) return
    sendMessage(lastUser.text, true)
  }

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsTyping(false)
      setIsComparing(false)
      setStreamingMsgId(null)
    }
    if (compareAbortControllersRef.current) {
      for (const c of Object.values(compareAbortControllersRef.current)) {
        try { c.abort() } catch {}
      }
      compareAbortControllersRef.current = null
    }
  }

  // Run the current prompt across multiple selected targets and stream results
  const handleCompareAcrossModels = async () => {
    const targets = (selectedTargets || []).filter(Boolean)
    if (!targets || targets.length < 2) return

    // Determine question: use current input if present; otherwise last user message
    const trimmed = message.trim()
    const lastUser = [...driftOnlyMessages].reverse().find(m => m.isUser)
    const questionText = trimmed || lastUser?.text || ''
    if (!questionText) return

    // If using new input, append it to the drift conversation for continuity
    let workingDrift: Message[] = driftOnlyMessages
    if (trimmed) {
      const newMsg: Message = { id: 'drift-' + Date.now().toString(), text: questionText, isUser: true, timestamp: new Date() }
      setMessages(prev => [...prev, newMsg])
      setDriftOnlyMessages(prev => [...prev, newMsg])
      workingDrift = [...driftOnlyMessages, newMsg]
      setMessage('')
    }

    // Build API messages with system context. Mirror the single-model path:
    // ground the answer in the parent conversation so each model disambiguates
    // "${selectedText}" the same way the user means it.
    const compareContext = contextMessages.slice(-8).map(msg => {
      const body = msg.text.length > 1200 ? msg.text.slice(0, 1200) + '…' : msg.text
      return `${msg.isUser ? 'User' : 'Assistant'}: ${body}`
    }).join('\n')
    const baseConversation = workingDrift.filter(msg => !isDriftOpenerText(msg.text))
    const apiMessages: (OpenRouterMessage | OllamaMessage)[] = [
      {
        role: 'system',
        content: compareContext
          ? `The user is reading the conversation below and selected "${selectedText}" to explore it further.\n\nConversation context:\n${compareContext}\n\nInterpret "${selectedText}" ONLY in the sense this conversation implies. Don't repeat the basic definition they can already see; add NEW value — the non-obvious angle, the mechanism, a concrete example, the relevant history or tension. Be concise, specific, and accurate; don't invent facts.`
          : `The user selected "${selectedText}" from a conversation they're already reading. They want to explore this specific term/concept deeper. Don't repeat the basic definition - they can already see that. Instead, provide interesting insights, examples, etymology, cultural context, or related concepts. Be concise, specific, and add NEW value beyond what's already visible. Don't invent facts.`
      },
      ...baseConversation.map(msg => ({ role: msg.isUser ? 'user' as const : 'assistant' as const, content: msg.text }))
    ]

    // If the last message in baseConversation isn't the question (when input was empty), ensure the API sees the question
    if (!trimmed && (!lastUser || lastUser.text !== questionText)) {
      apiMessages.push({ role: 'user', content: questionText })
    } else if (trimmed) {
      // When we just appended the user input locally, also reflect it in apiMessages
      apiMessages.push({ role: 'user', content: questionText })
    }

    // Prepare per-target abort controllers for concurrent streaming
    const controllers: Record<string, AbortController> = {}
    compareAbortControllersRef.current = controllers
    setIsTyping(true)
    setIsComparing(true)

    try {
      // Compare group id for this run
      const groupId = `cmp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`

      // Create placeholders and start all streams concurrently
      const tasks = targets.map(t => {
        const aiId = `drift-compare-${t.key}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
        const placeholder: Message = {
          id: aiId, text: '', isUser: false, timestamp: new Date(),
          modelTag: t.label, compareGroupId: groupId, laneKey: t.key
        }
        setMessages(prev => [...prev, placeholder])
        setDriftOnlyMessages(prev => [...prev, placeholder])

        const onChunk = (chunk: string) => {
          setMessages(prev => prev.map(m => m.id === aiId ? { ...m, text: (m.text || '') + chunk } : m))
          setDriftOnlyMessages(prev => prev.map(m => m.id === aiId ? { ...m, text: (m.text || '') + chunk } : m))
        }
        const controller = new AbortController()
        controllers[t.key] = controller

        const run = async () => {
          try {
            if (t.provider === 'openrouter') {
              const envKey = import.meta.env.VITE_OPENROUTER_API_KEY
              const settingsKey = aiSettings.openRouterApiKey
              const apiKey = envKey || settingsKey
              if (!apiKey) {
                onChunk('[OpenRouter] Missing API key. Configure in Settings.')
              } else {
                const model = (t.key === 'qwen3' || t.label === 'Qwen3')
                  ? OPENROUTER_MODELS.QWEN3
                  : (aiSettings.openRouterModel || OPENROUTER_MODELS.OSS)
                await sendMessageToOpenRouter(apiMessages as OpenRouterMessage[], onChunk, apiKey, controller.signal, model)
              }
            } else if (t.provider === 'ollama') {
              await sendMessageToOllama(apiMessages as OllamaMessage[], onChunk, controller.signal, aiSettings.ollamaUrl, aiSettings.ollamaModel)
            } else {
              // no-op
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to get response.'
            onChunk(`\n\n[${t.label}] ${msg}`)
          }
        }

        return run()
      })

      await Promise.allSettled(tasks)
    } finally {
      setIsTyping(false)
      setIsComparing(false)
      compareAbortControllersRef.current = null
    }
  }

  return {
    sendMessage,
    retryLastMessage,
    stopGeneration,
    handleCompareAcrossModels,
  }
}
