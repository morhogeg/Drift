import { useState, useRef, useEffect, isValidElement, cloneElement } from 'react'
import { ArrowUp, ArrowLeft, Square, Upload, Undo2, Bookmark, Maximize2, Minimize2, Megaphone, ChevronLeft, Mic, Home, Compass, CornerUpLeft, History, ArrowUpRight } from 'lucide-react'
import type { AncestryEntry } from '../types/chat'
import type { TermOccurrence } from '../lib/termIndex'
import { sendMessageToOpenRouter, type ChatMessage as OpenRouterMessage, OPENROUTER_MODELS } from '../services/openrouter'
import { sendMessageToOllama, type ChatMessage as OllamaMessage } from '../services/ollama'
import { sendMessageToGemini, getDriftSuggestions, getSuggestedHighlights, getConnections, type ChatMessage as GeminiMessage, type Connection } from '../services/gemini'
import { type ChatMessage as DummyMessage } from '../services/dummyAI'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AISettings } from './Settings'
import { snippetStorage } from '../services/snippetStorage'
import { getTextDirection, getRTLClassName } from '../utils/rtl'
import { useVoiceInput } from '../hooks/useVoiceInput'
import { Reveal, Stagger, staggerChild } from './motion'
import { haptics } from '../lib/haptics'
import { motion } from 'framer-motion'

interface Message {
  id: string
  text: string
  isUser: boolean
  timestamp: Date
  modelTag?: string
  // For compare layout
  compareGroupId?: string
  laneKey?: string
}

interface DriftPanelProps {
  isOpen: boolean
  onClose: (driftMessages?: Message[]) => void
  selectedText: string
  contextMessages: Message[]
  sourceMessageId: string
  highlightMessageId?: string
  parentChatId: string
  onSaveAsChat: (messages: Message[], title: string, metadata: any) => void
  onPushToMain?: (messages: Message[], selectedText: string, sourceMessageId: string, wasSavedAsChat: boolean, userQuestion?: string, driftChatId?: string) => void
  onUpdatePushedDriftSaveStatus?: (sourceMessageId: string) => void
  onUndoPushToMain?: (sourceMessageId: string) => void
  onUndoSaveAsChat?: (chatId: string) => void
  onSnippetCountUpdate?: () => void
  aiSettings: AISettings
  existingMessages?: Message[]
  driftChatId?: string
  /** Called whenever the drift conversation messages change — used to keep the temp store in sync. */
  onMessagesChange?: (messages: Message[]) => void
  // If provided, Drift will follow the main chat model chips
  selectedProvider?: 'openrouter' | 'ollama' | 'gemini'
  // Optional: allow running compare against multiple targets from main
  selectedTargets?: Array<{ provider: 'openrouter' | 'ollama' | 'gemini'; key: string; label: string }>
  onExpandedChange?: (expanded: boolean) => void
  /** Breadcrumb trail from the root (main chat) up to (but not including) this drift. */
  ancestry?: AncestryEntry[]
  /** Called when the user taps a breadcrumb item to navigate back. Index 0 = main chat. */
  onNavigateToBreadcrumb?: (index: number) => void
  /** Optional template type for one-tap workflow drifts. */
  templateType?: 'simplify' | 'research' | 'connect'
  /** Pre-loaded suggestion chips — bypasses AI fetch when provided. */
  initialSuggestions?: string[]
  /** Restore Connect mode to a previously active question (breadcrumb navigation). */
  initialConnectQuestion?: string | null
  /** Restore Connect chips so they don't need to be re-fetched from AI. */
  initialConnectCards?: string[]
  /** Restore visited-question answer cache so re-tapping a chip skips the LLM call. */
  initialConnectAnswers?: Record<string, Message[]>
  /** Called whenever the active Connect question or chips change — lets App.tsx persist state for navigation. */
  onConnectStateChange?: (question: string | null, cards: string[] | null) => void
  /** Called when a Connect chip conversation is cached — lets App.tsx persist it to driftInfos. */
  onConnectAnswerSaved?: (question: string, messages: Message[]) => void
  /** Opens a new drift from within this panel (e.g. from a Connect card). */
  onStartDrift?: (text: string, messageId: string, suggestions?: string[]) => void
  /** Prior explorations of this same/related term across all chats (from the term index). */
  relatedDrifts?: TermOccurrence[]
  /** Navigate to a prior drift surfaced in the "explored before" strip. */
  onOpenRelatedDrift?: (occ: TermOccurrence) => void
}

export default function DriftPanel({
  isOpen,
  onClose,
  selectedText,
  contextMessages,
  sourceMessageId,
  highlightMessageId,
  parentChatId,
  onSaveAsChat,
  onPushToMain,
  onUpdatePushedDriftSaveStatus,
  onUndoPushToMain,
  onUndoSaveAsChat,
  onSnippetCountUpdate,
  aiSettings,
  existingMessages,
  driftChatId,
  onMessagesChange,
  selectedProvider,
  selectedTargets,
  onExpandedChange,
  ancestry,
  onNavigateToBreadcrumb,
  templateType,
  initialSuggestions,
  initialConnectQuestion,
  initialConnectCards,
  initialConnectAnswers,
  onConnectStateChange,
  onConnectAnswerSaved,
  relatedDrifts,
  onOpenRelatedDrift,
}: DriftPanelProps) {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [driftOnlyMessages, setDriftOnlyMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  // Id of the AI message currently receiving streamed tokens — drives the live shimmer.
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null)
  // Bumped whenever a space unfolds (panel opens) or a new topic emerges (drift
  // changes while open) — retriggers the bloom animation on the panel shell.
  const [bloomKey, setBloomKey] = useState(0)
  const [pushedToMain, setPushedToMain] = useState(false)
  const [savedAsChat, setSavedAsChat] = useState(false)
  const [savedChatId, setSavedChatId] = useState<string | null>(null)
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set())
  const [, setHoveredMessageId] = useState<string | null>(null)
  const [pushedMessageCount, setPushedMessageCount] = useState(0)
  const [lastPushSourceId, setLastPushSourceId] = useState<string | null>(null)
  const [isPushing, setIsPushing] = useState(false)
  const [pushedContentSignature, setPushedContentSignature] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const breadcrumbScrollRef = useRef<HTMLDivElement>(null)
  const voiceInput = useVoiceInput((transcript) => {
    setMessage((prev) => (prev ? prev + ' ' : '') + transcript)
  })
  const compareAbortControllersRef = useRef<Record<string, AbortController> | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [showExpandHint, setShowExpandHint] = useState(false)
  const [connectCards, setConnectCards] = useState<string[] | null>(null)
  const [connectQuestion, setConnectQuestion] = useState<string | null>(null)
  const connectAnswersRef = useRef<Map<string, Message[]>>(new Map())
  const [connectVisitedVersion, setConnectVisitedVersion] = useState(0)
  /** Tracks the active chip session {question, messages} via ref so it survives React batching. */
  const chipSessionRef = useRef<{ question: string; messages: Message[] } | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  /** Tracks whether the auto-send for the current template drift has already fired. */
  const autoSentRef = useRef(false)
  const [driftSuggestions, setDriftSuggestions] = useState<string[]>([])
  /** Per-message AI-suggested highlight phrases (dotted underline, click to ask) */
  const [msgHighlights, setMsgHighlights] = useState<Map<string, string[]>>(new Map())
  /** Intelligence layer: AI-derived connections (back to context / forward to new directions). */
  const [connections, setConnections] = useState<Connection[] | null>(null)
  /** Guards the connections fetch so it fires once per open. */
  const connectionsFetchedRef = useRef(false)

  // --------------------------------------------------------------------------
  // Template helpers
  // --------------------------------------------------------------------------

  const TEMPLATE_SYSTEM_PROMPTS: Record<string, string> = {
    'simplify': "You are an expert at making complex ideas simple. Explain the selected text as if to a curious 12-year-old. Use analogies, avoid jargon, and make it memorable.",
    'research': "You are a thorough research assistant. Provide factual, well-sourced background on the selected text. Include key facts, context, history, and current relevance. Use Google Search grounding if available.",
    'connect': `You are a lateral thinking engine for an exploratory reading app. The user has selected a word or phrase from a conversation and wants to discover surprising intellectual threads to explore.

Return ONLY a raw JSON array of 4-5 strings. Each string is a short, thought-provoking question or reframe that opens a genuinely interesting direction. No prose, no markdown, no code fences.

Example output for "Julius Caesar":
["Did Shakespeare use Caesar to warn Elizabeth I about succession?","What does the Rubicon crossing tell us about the psychology of no return?","How did Caesar's calendar reform still shape our daily lives?","Why do assassinations so rarely achieve what their planners intended?","Is charisma a weapon or a vulnerability for leaders?"]

Rules:
- Each item is a question or reframe, 6-12 words.
- Prefer cross-domain surprises: history↔psychology, science↔culture, ancient↔modern.
- Skip the obvious — nothing the user can already infer from the conversation.
- Make them feel like doorways, not trivia.
- Output raw JSON array of strings only. Any other text breaks the app.`,
  }

  const TEMPLATE_USER_PREFIXES: Record<string, string> = {
    'simplify': 'Simplify this',
    'research': 'Deep dive into this',
    'connect': 'Show me what this connects to',
  }

  // Initialize Drift with existing messages or system message
  useEffect(() => {
    if (isOpen) {
      // Reset auto-send guard for each new open
      autoSentRef.current = false

      // Check if we have existing messages for this drift
      if (existingMessages && existingMessages.length > 0) {
        // Restore the existing conversation — template already fired for this drift
        autoSentRef.current = true
        setMessages(existingMessages)
        setDriftOnlyMessages(existingMessages)
      } else {
        // Add system context message for new drift
        const systemMessageText = templateType === 'connect'
          ? `Finding connections for "${selectedText}"…`
          : templateType
          ? `${TEMPLATE_USER_PREFIXES[templateType] ?? 'Exploring'}: "${selectedText}"`
          : `What would you like to know about "${selectedText}"?`
        const systemMessage: Message = {
          id: 'drift-system-' + Date.now(),
          text: systemMessageText,
          isUser: false,
          timestamp: new Date()
        }

        // Set only the system message - no context messages
        setMessages([systemMessage])

        // Set drift-only messages (just the system message to start)
        setDriftOnlyMessages([systemMessage])
      }

      // Reset suggestions and per-message highlights
      setDriftSuggestions([])
      setMsgHighlights(new Map())

      // Reset intelligence-layer connections for this open
      setConnections(null)
      connectionsFetchedRef.current = false

      // Restore or reset Connect state
      connectAnswersRef.current = initialConnectAnswers
        ? new Map(Object.entries(initialConnectAnswers))
        : new Map()
      chipSessionRef.current = null
      setConnectCards(initialConnectCards != null ? initialConnectCards : null)
      setConnectQuestion(initialConnectQuestion != null ? initialConnectQuestion : null)

      // If chips are being restored from cache, suppress the auto-send that would re-fetch them
      if (initialConnectCards != null && initialConnectCards.length > 0) {
        autoSentRef.current = true
      }

      // Suggestion chips: use pre-loaded ones, fetch for plain drifts, skip for templates
      if (initialSuggestions && initialSuggestions.length > 0) {
        setDriftSuggestions(initialSuggestions)
      } else if (!templateType && !(existingMessages && existingMessages.length > 0)) {
        const geminiKey = import.meta.env.VITE_GEMINI_API_KEY || aiSettings.geminiApiKey
        if (geminiKey) {
          const ctx = contextMessages.slice(-3).map(m => m.text).join(' ')
          getDriftSuggestions(selectedText, ctx, geminiKey).then(s => {
            setDriftSuggestions(s)
          })
        }
      }

      // Reset states when opening new drift
      setPushedToMain(false)
      setSavedAsChat(false)
      setSavedChatId(null)
      setPushedMessageCount(0)
      setLastPushSourceId(null)
      setPushedContentSignature(null)

      // Load saved message IDs for this drift
      const allSnippets = snippetStorage.getAllSnippets()
      const savedIds = new Set<string>()
      allSnippets.forEach(snippet => {
        if (snippet.source.messageId) {
          savedIds.add(snippet.source.messageId)
        }
      })
      setSavedMessageIds(savedIds)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedText, existingMessages, templateType])

  // Notify parent whenever Connect state changes so it can persist for navigation
  useEffect(() => {
    if (isOpen && templateType === 'connect') {
      onConnectStateChange?.(connectQuestion, connectCards)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectQuestion, connectCards, isOpen])

  // Auto-send initial message for template drifts (fires once per open, 400ms after panel opens)
  useEffect(() => {
    if (!isOpen || !templateType || autoSentRef.current) return
    // Only fire when the panel has exactly the system message (fresh drift, not restored)
    if (messages.length !== 1 || !messages[0]?.id?.startsWith('drift-system-')) return

    // In connect chip-chat mode, send the chosen question directly
    const autoText = (templateType === 'connect' && connectQuestion)
      ? connectQuestion
      : `${TEMPLATE_USER_PREFIXES[templateType] ?? 'Explore this'}: "${selectedText}"`

    const timer = window.setTimeout(() => {
      if (!autoSentRef.current) {
        autoSentRef.current = true
        sendMessage(autoText)
      }
    }, 60)

    return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, templateType, messages.length, connectQuestion])

  // connectAnswersRef is cleared in the init effect on each new open;
  // this separate effect was removed because it fired after init and wiped restored Connect state.

  // Parse Connect AI response into cards once streaming finishes (only in chips mode)
  useEffect(() => {
    if (templateType !== 'connect' || isTyping || connectQuestion) return
    const aiMsg = driftOnlyMessages.find(m => !m.isUser && !m.id.startsWith('drift-system-'))
    if (!aiMsg?.text) return
    try {
      const raw = aiMsg.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setConnectCards(parsed.filter((x: unknown) => typeof x === 'string').slice(0, 5))
      }
    } catch {
      setConnectCards([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateType, isTyping, driftOnlyMessages, selectedText])

  // Intelligence layer: fetch connections once per open (Connect mode chips view).
  // This is the "leaning in" moment — how the term relates to where the user has
  // been, plus fresh directions. priorTerms steers the model off explored ground.
  useEffect(() => {
    if (!isOpen || templateType !== 'connect' || connectionsFetchedRef.current) return
    if (!selectedText?.trim()) return
    connectionsFetchedRef.current = true

    const geminiKey = import.meta.env.VITE_GEMINI_API_KEY || aiSettings.geminiApiKey
    if (!geminiKey) return

    const ctx = contextMessages.slice(-6).map(m => `${m.isUser ? 'User' : 'Assistant'}: ${m.text}`).join('\n')
    const priorTerms = (relatedDrifts ?? []).map(o => o.term).filter(Boolean)

    getConnections(selectedText, ctx, priorTerms, geminiKey).then(c => {
      // Only show if the panel is still on the same term.
      setConnections(c)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, templateType, selectedText])

  // Sync driftOnlyMessages to the temp store so nested-drift detection
  // in handleStartDrift can always see the current conversation.
  useEffect(() => {
    if (driftChatId && driftOnlyMessages.length > 0) {
      onMessagesChange?.(driftOnlyMessages)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driftOnlyMessages])

  // Keep chipSessionRef in sync with the active chip conversation in real-time.
  // Using a ref (not state) means React batching can't lose the messages before we save them.
  useEffect(() => {
    if (connectQuestion !== null && driftOnlyMessages.length > 0) {
      chipSessionRef.current = { question: connectQuestion, messages: driftOnlyMessages }
    }
  }, [driftOnlyMessages, connectQuestion])

  // When returning to chips view (connectQuestion → null), persist the last chip session.
  // This fires after React commits the batch, so we read from the ref which was already updated.
  useEffect(() => {
    if (connectQuestion === null && chipSessionRef.current) {
      const { question, messages } = chipSessionRef.current
      chipSessionRef.current = null
      if (messages.length > 1) {
        connectAnswersRef.current.set(question, messages)
        setConnectVisitedVersion(v => v + 1)
        onConnectAnswerSaved?.(question, messages)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectQuestion])

  // Autofocus input when the drift panel opens
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  // Bloom: a space unfolding. Retrigger the bloom whenever the panel opens or
  // the topic changes underneath it (branching into a new drift) — the shell
  // scales up, the blur clears, and a glow blooms behind it.
  useEffect(() => {
    if (isOpen) setBloomKey(k => k + 1)
  }, [isOpen, driftChatId])

  // Auto-scroll breadcrumb to the end (current item) whenever depth changes
  useEffect(() => {
    if (breadcrumbScrollRef.current) {
      breadcrumbScrollRef.current.scrollLeft = breadcrumbScrollRef.current.scrollWidth
    }
  }, [ancestry?.length, isOpen])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Notify parent when expanded state changes
  useEffect(() => {
    if (onExpandedChange && isOpen) onExpandedChange(isExpanded)
  }, [isExpanded, isOpen])

  // Hint to expand when last assistant likely returned a table
  useEffect(() => {
    const lastAssistant = [...driftOnlyMessages].reverse().find(m => !m.isUser)
    const looksLikeTable = !!lastAssistant?.text && /\|.+\|/.test(lastAssistant.text) && /\n-+\|/.test(lastAssistant.text)
    if (looksLikeTable) {
      setShowExpandHint(true)
      const t = setTimeout(() => setShowExpandHint(false), 4000)
      return () => clearTimeout(t)
    }
    setShowExpandHint(false)
  }, [driftOnlyMessages])

  // Highlight specific message when opened from clicked drift message
  useEffect(() => {
    if (isOpen && highlightMessageId && driftOnlyMessages.length > 0) {
      setTimeout(() => {
        // Find the message element that corresponds to the pushed message
        const targetMessage = driftOnlyMessages.find(m => 
          m.text === highlightMessageId // We'll need to pass the text instead
        )
        
        if (targetMessage) {
          const element = document.querySelector(`[data-drift-message-id="${targetMessage.id}"]`)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            element.classList.add('highlight-message')
            setTimeout(() => {
              element.classList.remove('highlight-message')
            }, 2000)
          }
        }
      }, 300)
    }
  }, [isOpen, highlightMessageId, driftOnlyMessages])

  // Reset push button if new messages are added after pushing
  useEffect(() => {
    if (pushedToMain && pushedMessageCount > 0) {
      // Filter out the system message
      const currentMessageCount = driftOnlyMessages.filter(
        msg => !msg.text.startsWith('What would you like to know about')
      ).length
      
      // If there are more messages now than when we pushed, reset the button
      if (currentMessageCount > pushedMessageCount) {
        console.log('DriftPanel: Resetting push button - new messages added')
        setPushedToMain(false)
        setPushedMessageCount(0)
        setLastPushSourceId(null) // Also clear the last push source
        setPushedContentSignature(null) // Clear the content signature
      }
    }
  }, [driftOnlyMessages, pushedToMain, pushedMessageCount])

  const handlePushSingleMessage = (message: Message) => {
    if (onPushToMain) {
      // Find all drift messages up to and including this one (excluding system message)
      const messageIndex = driftOnlyMessages.findIndex(m => m.id === message.id)
      const allMessagesUpToThis = driftOnlyMessages
        .slice(0, messageIndex + 1)
        .filter(msg => !msg.text.startsWith('What would you like to know about'))
      
      // Mark only the selected message as visible, others as hidden context
      const messagesToPush = allMessagesUpToThis.map((msg) => ({
        ...msg,
        isHiddenContext: msg.id !== message.id  // Mark all except the selected message as hidden
      }))
      
      // Find the user message before this one for metadata
      const previousUserMessage = driftOnlyMessages.slice(0, messageIndex).reverse().find(m => m.isUser)
      const userQuestion = previousUserMessage?.text || selectedText
      
      // Use a unique but consistent source ID for single messages
      // Include message content hash to prevent exact duplicates
      const messageHash = message.text.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '')
      const singleMessageSourceId = `${sourceMessageId}-single-${message.id}-${messageHash}`
      
      // Important: Use the same driftChatId so we can reconstruct the full conversation
      const chatIdToUse = savedChatId || driftChatId || `drift-temp-single-${Date.now()}`
      
      // Push all messages but mark as single push (only one will be visible)
      onPushToMain(
        messagesToPush, 
        selectedText,
        singleMessageSourceId,
        savedAsChat,
        userQuestion,
        chatIdToUse
      )
    }
  }

  const handleToggleSaveMessage = (message: Message) => {
    if (savedMessageIds.has(message.id)) {
      // Unsave: Find and delete the snippet
      const allSnippets = snippetStorage.getAllSnippets()
      const snippetToDelete = allSnippets.find(s => 
        s.source.messageId === message.id
      )
      
      if (snippetToDelete) {
        snippetStorage.deleteSnippet(snippetToDelete.id)
        setSavedMessageIds(prev => {
          const newSet = new Set(prev)
          newSet.delete(message.id)
          return newSet
        })
        // Update the snippet count in the parent component
        onSnippetCountUpdate?.()
      }
    } else {
      // Save: Create new snippet
      const driftTitle = savedChatId 
        ? `Drift: ${selectedText.slice(0, 30)}${selectedText.length > 30 ? '...' : ''}`
        : `Drift from: ${selectedText.slice(0, 30)}${selectedText.length > 30 ? '...' : ''}`
      
      const source = {
        chatId: savedChatId || `drift-temp-${sourceMessageId}`,
        chatTitle: driftTitle,
        messageId: message.id,
        isFullMessage: true,
        timestamp: message.timestamp,
        isDrift: true,
        parentChatId,
        selectedText
      }
      
      snippetStorage.createSnippet(
        message.text,
        source,
        {
          tags: [],
          starred: false
        }
      )
      
      setSavedMessageIds(prev => new Set(prev).add(message.id))
      // Update the snippet count in the parent component
      onSnippetCountUpdate?.()
    }
  }

  const sendMessage = async (overrideText?: string) => {
    const textToSend = (overrideText ?? message).trim()
    if (textToSend) {
      // Sending a message has weight — a light, confident thunk.
      haptics.impact('light')

      const newMessage: Message = {
        id: 'drift-' + Date.now().toString(),
        text: textToSend,
        isUser: true,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, newMessage])
      setDriftOnlyMessages(prev => [...prev, newMessage])
      if (!overrideText) setMessage('')
      setIsTyping(true)

      // Only use drift-specific messages, not the context messages
      // Filter out the system message and any context messages
      const driftConversation = driftOnlyMessages.filter(
        msg => !msg.text.startsWith('What would you like to know about') && !msg.text.startsWith('Finding connections for') && !msg.text.startsWith('Simplify this') && !msg.text.startsWith('Deep dive into this') && !msg.text.startsWith('Show me what this connects to') && msg.id !== newMessage.id
      )
      
      // Build context string from parent conversation (last ~6 messages)
      const parentContext = contextMessages.slice(-6).map(msg =>
        `${msg.isUser ? 'User' : 'Assistant'}: ${msg.text}`
      ).join('\n')

      // Use template system prompt if set, otherwise use default context-aware prompt
      // In connect chat mode, use a conversational prompt (not the JSON-returning connect prompt)
      // History-aware Connect: feed prior same/related-term drifts into the chip
      // prompt so the directions are ones the user has NOT already taken.
      const priorTerms = (relatedDrifts ?? []).map(o => o.term).filter(Boolean)
      const connectChipsPrompt = priorTerms.length
        ? `${TEMPLATE_SYSTEM_PROMPTS['connect']}\n\nThe user has ALREADY explored these related threads — do NOT repeat them, point somewhere genuinely new: ${priorTerms.slice(0, 12).join(', ')}.`
        : TEMPLATE_SYSTEM_PROMPTS['connect']

      const baseSystemContent = (templateType === 'connect' && connectQuestion)
        ? `The user is reading about "${selectedText}" and chose to explore this question: "${connectQuestion}". Answer it directly and insightfully. Draw connections back to "${selectedText}" where relevant. Be concise.${parentContext ? `\n\nConversation context:\n${parentContext}` : ''}`
        : (templateType === 'connect')
        ? connectChipsPrompt
        : templateType
        ? TEMPLATE_SYSTEM_PROMPTS[templateType]
        : (parentContext
            ? `The user is exploring "${selectedText}" from an ongoing conversation. Here is the relevant context from that conversation:\n\n${parentContext}\n\nThe user has selected "${selectedText}" from the above and wants to explore it further. Answer in the context of that conversation — do not treat "${selectedText}" as an ambiguous term if the conversation makes its meaning clear. Be concise and add value beyond what's already visible.`
            : `The user selected "${selectedText}" from a conversation they're already reading. They want to explore this specific term/concept deeper. Don't repeat the basic definition - they can already see that. Instead, provide interesting insights, examples, etymology, cultural context, or related concepts. Be concise and add NEW value beyond what's already visible.`)
      const systemContent = (templateType && parentContext)
        ? `${baseSystemContent}\n\nContext from the conversation:\n${parentContext}`
        : baseSystemContent

      // Convert messages to API format with special Drift context
      const apiMessages: (OpenRouterMessage | OllamaMessage | DummyMessage)[] = [
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
      // If a provider was passed from main chat, honor it. Otherwise, infer.
      const provider: 'openrouter' | 'ollama' | 'gemini' = selectedProvider
        ? selectedProvider
        : (geminiKey ? 'gemini' : effectiveApiKey ? 'openrouter' : 'ollama')

      console.log('Drift panel - provider chosen:', provider)
      console.log('Drift panel - API messages:', apiMessages)
      
      try {
        // Create abort controller for this request
        const abortController = new AbortController()
        abortControllerRef.current = abortController
        
        const aiResponseId = 'drift-ai-' + Date.now().toString()
        let accumulatedResponse = ''
        
        // Add empty AI message
        const aiMessage: Message = {
          id: aiResponseId,
          text: '',
          isUser: false,
          timestamp: new Date()
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

        // Stream the response using the chosen provider
        if (provider === 'gemini') {
          const apiKey = geminiKey
          if (!apiKey) throw new Error('No Gemini API key found. Please set it in Settings.')
          const sTargets = selectedTargets || []
          const preset = sTargets.length === 1 ? sTargets[0] : null
          const model = (preset?.key && aiSettings.modelPresets?.find((p: any) => p.id === preset.key)?.model) || aiSettings.geminiModel as any
          await sendMessageToGemini(apiMessages as GeminiMessage[], onChunk, apiKey, abortController.signal, model)
        } else if (provider === 'openrouter') {
          const apiKey = effectiveApiKey
          if (!apiKey) throw new Error('No OpenRouter API key found. Please set VITE_OPENROUTER_API_KEY in .env file')
          const sTargets = selectedTargets || []
          const useQwen3 = (sTargets.length === 1 && (sTargets[0].key === 'qwen3' || sTargets[0].label === 'Qwen3'))
          const model = useQwen3 ? OPENROUTER_MODELS.QWEN3 : (aiSettings.openRouterModel || OPENROUTER_MODELS.OSS)
          await sendMessageToOpenRouter(apiMessages as OpenRouterMessage[], onChunk, apiKey, abortController.signal, model)
        } else if (provider === 'ollama') {
          await sendMessageToOllama(
            apiMessages as OllamaMessage[],
            onChunk,
            abortController.signal,
            aiSettings.ollamaUrl,
            aiSettings.ollamaModel
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
        const errorMessage = error instanceof Error ? error.message : "Failed to get response. Please check your connection."
        const aiResponse: Message = {
          id: 'drift-error-' + Date.now().toString(),
          text: errorMessage,
          isUser: false,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, aiResponse])
        setDriftOnlyMessages(prev => [...prev, aiResponse])
      } finally {
        setIsTyping(false)
        setStreamingMsgId(null)
        abortControllerRef.current = null
      }
    }
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

    // Build API messages with system context
    const baseConversation = workingDrift.filter(msg => !msg.text.startsWith('What would you like to know about'))
    const apiMessages: (OpenRouterMessage | OllamaMessage | DummyMessage)[] = [
      {
        role: 'system',
        content: `The user selected "${selectedText}" from a conversation they're already reading. They want to explore this specific term/concept deeper. Don't repeat the basic definition - they can already see that. Instead, provide interesting insights, examples, etymology, cultural context, or related concepts. Be concise and add NEW value beyond what's already visible.`
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

  const handleSaveAsChat = () => {
    // If already saved, handle undo
    if (savedAsChat && savedChatId && onUndoSaveAsChat) {
      onUndoSaveAsChat(savedChatId)
      setSavedAsChat(false)
      setSavedChatId(null)
      
      // Also update pushed messages if they exist
      if (pushedToMain && onUpdatePushedDriftSaveStatus) {
        // Just update the save status, don't re-push
        onUpdatePushedDriftSaveStatus(sourceMessageId)
      }
      return
    }
    
    const title = `Drift: ${selectedText.slice(0, 30)}${selectedText.length > 30 ? '...' : ''}`
    const metadata = {
      isDrift: true,
      parentChatId,
      sourceMessageId,
      selectedText,
      createdAt: new Date()
    }
    // Filter out the system message when saving as a new chat
    // The banner will provide all the context needed
    const messagesToSave = driftOnlyMessages.filter(
      msg => !msg.text.startsWith('🌀 Drift started from:')
    )
    
    const newChatId = 'drift-' + Date.now().toString()
    setSavedChatId(newChatId)
    
    onSaveAsChat(messagesToSave, title, { ...metadata, id: newChatId })
    setSavedAsChat(true)
    
    // If already pushed to main, update those messages to mark as saved
    if (pushedToMain && onUpdatePushedDriftSaveStatus) {
      onUpdatePushedDriftSaveStatus(sourceMessageId)
    }
    // Don't close - let user decide if they want to continue or close
    // onClose()
  }
  
  const handlePushToMain = async () => {
    const clickId = Math.random().toString(36).substring(7)
    console.log(`[BUTTON-CLICK ${clickId}] Push button clicked`)
    console.log(`[BUTTON-CLICK ${clickId}] Current state - pushedToMain:`, pushedToMain, 'isPushing:', isPushing)
    
    // If already pushed, handle undo
    if (pushedToMain && lastPushSourceId && onUndoPushToMain) {
      console.log(`[BUTTON-CLICK ${clickId}] Undoing previous push`)
      onUndoPushToMain(lastPushSourceId)
      setPushedToMain(false)
      setLastPushSourceId(null)
      setPushedContentSignature(null)
      return
    }
    
    // Prevent multiple pushes while one is in progress
    if (pushedToMain || isPushing) {
      console.log(`[BUTTON-CLICK ${clickId}] BLOCKED - Already pushed or pushing`)
      return
    }
    
    if (onPushToMain && driftOnlyMessages.length > 0) {
      // Filter out the system message when pushing to main
      const messagesToPush = driftOnlyMessages.filter(
        msg => !msg.text.startsWith('What would you like to know about')
      )
      
      if (messagesToPush.length > 0) {
        // Create a content signature to track what we're pushing
        const contentSignature = messagesToPush.map(m => `${m.isUser}:${m.text}`).join('|||')
        
        // Check if we've already pushed this exact content
        if (pushedContentSignature === contentSignature) {
          console.log('DriftPanel: Preventing duplicate push - same content already pushed')
          return
        }
        
        // Set pushing state to prevent double-clicks
        setIsPushing(true)
        
        try {
          // Find the last user question in the drift conversation
          const lastUserMessage = messagesToPush.filter(m => m.isUser).pop()
          const userQuestion = lastUserMessage?.text || selectedText
          
          // Create a consistent push ID based on message content
          // This helps prevent duplicate pushes of the same content
          const messageHash = messagesToPush.map(m => m.text).join('').substring(0, 10)
          const pushSourceId = `${sourceMessageId}-push-${messageHash}-${Date.now()}`
          
          const pushAttemptId = Math.random().toString(36).substring(7)
          console.log(`[DRIFT-PANEL ${pushAttemptId}] Initiating push to main`)
          console.log(`[DRIFT-PANEL ${pushAttemptId}] sourceId:`, pushSourceId)
          console.log(`[DRIFT-PANEL ${pushAttemptId}] Messages:`, messagesToPush.length)
          console.log(`[DRIFT-PANEL ${pushAttemptId}] Content signature:`, contentSignature.substring(0, 50))
          
          const chatIdToUse = savedChatId || driftChatId || `drift-temp-full-${Date.now()}`
          onPushToMain(messagesToPush, selectedText, pushSourceId, savedAsChat, userQuestion, chatIdToUse)
          
          console.log(`[DRIFT-PANEL ${pushAttemptId}] Push call completed`)
          setPushedToMain(true)
          setPushedMessageCount(messagesToPush.length)
          setLastPushSourceId(pushSourceId)
          setPushedContentSignature(contentSignature)
          
          // Store the full conversation so it can be reconstructed when clicked
          if (onClose && driftOnlyMessages.length > 0) {
            onClose(driftOnlyMessages)
          }
        } finally {
          setIsPushing(false)
        }
        // Don't close - let user decide if they also want to save as chat
        // onClose()
      }
    }
  }

  return (
    <div className={`
      fixed inset-0 z-30
      lg:inset-auto lg:top-0 lg:right-0 lg:h-full lg:z-20
      ${isExpanded ? 'lg:w-[70vw] lg:max-w-[920px]' : 'lg:w-[450px]'}
      transition-all duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : 'translate-x-full'}
    `}>
      {/* Glow blooming behind the panel as it unfolds — keyed to retrigger on
          open and on branching into a new topic. */}
      <div
        key={`glow-${bloomKey}`}
        aria-hidden
        className="drift-bloom-glow pointer-events-none absolute inset-y-0 right-0 w-2/3 z-0"
      />
      {/* Panel — blooms open (scale + blur-clear) on each new space */}
      <div
        key={`shell-${bloomKey}`}
        className={`
        drift-bloom-shell relative z-[1]
        w-full h-full bg-dark-bg
        border-l border-accent-violet/[0.12]
        shadow-[-8px_0_60px_rgba(168,85,247,0.08)]
        flex flex-col overflow-hidden
      `}>
        {/* Header */}
        <header className="relative z-10 border-b border-white/[0.05] bg-dark-surface/95 backdrop-blur-xl pt-safe">
          {/* Quiet breathing accent — the space stays alive while idle, settles
              while a thought is materializing. */}
          {!isTyping && (
            <div
              aria-hidden
              className="animate-breathe pointer-events-none absolute -top-6 right-8 w-40 h-12 rounded-full blur-2xl bg-accent-violet/[0.10]"
            />
          )}
          {(() => {
            const actionMessages = driftOnlyMessages.filter(m => !m.text.startsWith('What would you'))
            const showActions = templateType === 'connect'
              ? !!connectQuestion && actionMessages.length > 0
              : actionMessages.length > 0

            const handleBack = () => {
              if (templateType === 'connect' && connectQuestion !== null) {
                window.getSelection()?.removeAllRanges()
                // chipSessionRef + the connectQuestion→null effect handle saving the answer
                setConnectQuestion(null)
                autoSentRef.current = true
                setMessages([])
                setDriftOnlyMessages([])
              } else {
                onClose(driftOnlyMessages)
              }
            }

            const modeLabel = templateType === 'connect'
              ? (connectQuestion
                  ? connectQuestion.length > 36 ? connectQuestion.slice(0, 36) + '…' : connectQuestion
                  : 'Connect')
              : templateType === 'simplify' ? 'Simplify'
              : templateType ? 'Deep dive'
              : null

            return (
              <div className="px-1 flex items-center gap-0.5 min-h-[52px]">
                {/* Back / Close */}
                <button
                  onClick={handleBack}
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-white/50 hover:text-white/80 hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors shrink-0"
                  title={templateType === 'connect' && connectQuestion ? 'Back to suggestions' : 'Close'}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                {/* Title + subtitle (breadcrumb or mode label) */}
                <div className="flex-1 flex flex-col justify-center min-w-0 px-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {templateType && (
                      <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0
                        ${templateType === 'connect'  ? 'bg-cyan-400'   :
                          templateType === 'simplify' ? 'bg-violet-400' :
                          'bg-blue-400'}`}
                      />
                    )}
                    <span
                      className="text-[15px] font-semibold text-white/90 truncate leading-snug select-none"
                      title={selectedText}
                    >
                      {selectedText}
                    </span>
                  </div>

                  {/* Subtitle: breadcrumb when nested, mode label otherwise */}
                  {ancestry && ancestry.length > 0 ? (
                    <div
                      ref={breadcrumbScrollRef}
                      className="flex items-center gap-0 overflow-x-auto mt-[1px]"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      {ancestry.map((entry, i) => (
                        <span key={i} className="flex items-center gap-0 shrink-0">
                          <button
                            onClick={() => onNavigateToBreadcrumb?.(i)}
                            className="flex items-center gap-0.5 text-[11px] text-white/35 hover:text-white/65 transition-colors max-w-[110px]"
                            title={entry.isMainChat ? entry.label : entry.selectedText}
                          >
                            {entry.isMainChat && <Home className="w-2.5 h-2.5 shrink-0 mr-0.5" />}
                            <span className="truncate leading-none">{entry.label}</span>
                          </button>
                          <span className="text-[10px] text-white/20 mx-0.5 select-none">›</span>
                        </span>
                      ))}
                      <span className="text-[11px] text-white/55 font-medium leading-none truncate max-w-[110px]">{selectedText}</span>
                    </div>
                  ) : modeLabel ? (
                    <span className={`text-[11px] font-medium leading-snug mt-[1px]
                      ${templateType === 'connect'  ? 'text-cyan-400/55'   :
                        templateType === 'simplify' ? 'text-violet-400/55' :
                        'text-blue-400/55'}`}>
                      {modeLabel}
                    </span>
                  ) : null}
                </div>

                {/* Actions: only when there are messages */}
                {showActions && (
                  <>
                    <button
                      onClick={handlePushToMain}
                      disabled={isPushing}
                      className={`p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 shrink-0
                        ${pushedToMain ? 'text-accent-pink bg-accent-pink/[0.1]' : 'text-white/40 hover:text-white/80 hover:bg-white/[0.07]'}`}
                      title={isPushing ? 'Pushing…' : pushedToMain ? 'Undo push to main' : 'Push to main chat'}
                    >
                      {pushedToMain ? <Undo2 className="w-[17px] h-[17px]" /> : <Upload className="w-[17px] h-[17px]" />}
                    </button>

                    {selectedTargets && selectedTargets.length > 1 && (
                      <button
                        onClick={handleCompareAcrossModels}
                        disabled={isTyping || isComparing || ((message.trim().length === 0) && !driftOnlyMessages.some(m => m.isUser))}
                        className={`p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 shrink-0
                          ${isComparing ? 'text-accent-violet bg-accent-violet/[0.1]' : 'text-white/40 hover:text-white/80 hover:bg-white/[0.07]'}`}
                        title="Compare across models"
                      >
                        <Megaphone className="w-[17px] h-[17px]" />
                      </button>
                    )}

                    <button
                      onClick={handleSaveAsChat}
                      className={`p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full transition-all duration-150 active:scale-90 shrink-0
                        ${savedAsChat ? 'text-cyan-300 bg-cyan-500/[0.1]' : 'text-white/40 hover:text-white/80 hover:bg-white/[0.07]'}`}
                      title={savedAsChat ? 'Undo save as chat' : 'Save as chat'}
                    >
                      {savedAsChat ? <Undo2 className="w-[17px] h-[17px]" /> : <Bookmark className="w-[17px] h-[17px]" />}
                    </button>
                  </>
                )}

                {/* Expand — always anchored right */}
                <button
                  onClick={() => setIsExpanded(v => !v)}
                  className="p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full text-white/35 hover:text-white/65 hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors shrink-0"
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? <Minimize2 className="w-[17px] h-[17px]" /> : <Maximize2 className={`w-[17px] h-[17px] ${showExpandHint ? 'text-accent-pink' : ''}`} />}
                </button>
              </div>
            )
          })()}
        </header>
        
        {/* Connect view — chips list or inline chat */}
        {templateType === 'connect' && !connectQuestion && (
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32 custom-scrollbar">
            {/* ── Intelligence layer: the app leaning in ──────────────────────── */}

            {/* "You explored this before" — prior drifts of the same/related term */}
            {relatedDrifts && relatedDrifts.length > 0 && (
              <Reveal className="mb-5" data-drift-connection-block="explored-before">
                <div className="rounded-2xl border border-accent-discovery/20 bg-accent-discovery/[0.05] p-3.5 shadow-glow-discovery">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <History className="w-3.5 h-3.5 text-accent-discovery/80" />
                    <p className="text-tiny font-medium text-accent-discovery/90">You explored this before</p>
                  </div>
                  <Stagger className="flex flex-col gap-1.5" step={0.04}>
                    {relatedDrifts.slice(0, 4).map((occ) => (
                      <motion.button
                        key={occ.driftChatId}
                        variants={staggerChild}
                        onClick={() => { haptics.selection(); onOpenRelatedDrift?.(occ) }}
                        className="drift-related-pill group flex items-center justify-between gap-2 w-full text-left px-3 py-2 rounded-xl
                          border border-accent-discovery/15 bg-accent-discovery/[0.03]
                          hover:border-accent-discovery/35 hover:bg-accent-discovery/[0.08]
                          active:scale-[0.98] transition-all duration-150 min-h-[40px]"
                        title={`Return to your drift on "${occ.term}"`}
                      >
                        <span className="text-meta text-text-secondary group-hover:text-text-primary truncate">{occ.chatTitle || occ.term}</span>
                        <CornerUpLeft className="w-3.5 h-3.5 text-accent-discovery/50 group-hover:text-accent-discovery/90 shrink-0" />
                      </motion.button>
                    ))}
                  </Stagger>
                </div>
              </Reveal>
            )}

            {/* AI connections — how this relates to where you've been + directions */}
            {connections && connections.length > 0 && (() => {
              const backs = connections.filter(c => c.kind === 'back')
              const forwards = connections.filter(c => c.kind === 'forward')
              const openConnection = (label: string) => {
                haptics.selection()
                setConnectQuestion(label)
                autoSentRef.current = false
                const systemMsg: Message = {
                  id: 'drift-system-' + Date.now(),
                  text: label,
                  isUser: false,
                  timestamp: new Date(),
                }
                setMessages([systemMsg])
                setDriftOnlyMessages([systemMsg])
              }
              return (
                <Reveal className="mb-5" delay={0.05} data-drift-connection-block="ai-connections">
                  {backs.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <CornerUpLeft className="w-3 h-3 text-accent-discovery/70" />
                        <p className="text-micro uppercase tracking-widest text-accent-discovery/70">How this relates to where you've been</p>
                      </div>
                      <Stagger className="flex flex-col gap-1.5" step={0.04}>
                        {backs.map((c, i) => (
                          <motion.div
                            key={`back-${i}`}
                            variants={staggerChild}
                            className="drift-connection-back text-meta leading-snug text-text-secondary px-3 py-2 rounded-xl border border-white/[0.06] bg-white/[0.02]"
                          >
                            {c.label}
                          </motion.div>
                        ))}
                      </Stagger>
                    </div>
                  )}
                  {forwards.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Compass className="w-3 h-3 text-accent-discovery/70" />
                        <p className="text-micro uppercase tracking-widest text-accent-discovery/70">Directions you could drift</p>
                      </div>
                      <Stagger className="flex flex-col gap-1.5" step={0.04}>
                        {forwards.map((c, i) => (
                          <motion.button
                            key={`fwd-${i}`}
                            variants={staggerChild}
                            onClick={() => openConnection(c.label)}
                            className="drift-connection-forward group flex items-center justify-between gap-2 w-full text-left px-3 py-2.5 rounded-xl
                              border border-accent-discovery/20 bg-accent-discovery/[0.04]
                              hover:border-accent-discovery/40 hover:bg-accent-discovery/[0.10]
                              active:scale-[0.98] transition-all duration-150 min-h-[42px]"
                          >
                            <span className="text-meta leading-snug text-text-secondary group-hover:text-text-primary">{c.label}</span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-accent-discovery/50 group-hover:text-accent-discovery/90 shrink-0" />
                          </motion.button>
                        ))}
                      </Stagger>
                    </div>
                  )}
                </Reveal>
              )
            })()}

            {(isTyping || connectCards === null) ? (
              <div className="flex flex-col gap-2.5">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="h-12 rounded-2xl bg-white/[0.04] animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
                ))}
              </div>
            ) : connectCards.length === 0 ? (
              <p className="text-[13px] text-text-muted/60 text-center mt-8">No connections found.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                <p className="text-[10px] text-text-muted/40 uppercase tracking-widest mb-1">Explore from here</p>
                {connectCards.map((question, i) => {
                  const visited = connectAnswersRef.current.has(question)
                  void connectVisitedVersion // consumed to trigger re-render
                  return <button
                    key={i}
                    onClick={() => {
                      haptics.selection()
                      const cached = connectAnswersRef.current.get(question)
                      if (cached) {
                        // Restore previous conversation — no LLM call needed
                        setConnectQuestion(question)
                        autoSentRef.current = true
                        setMessages(cached)
                        setDriftOnlyMessages(cached)
                      } else {
                        // Fresh chat — auto-send the question
                        setConnectQuestion(question)
                        autoSentRef.current = false
                        const systemMsg: Message = {
                          id: 'drift-system-' + Date.now(),
                          text: question,
                          isUser: false,
                          timestamp: new Date(),
                        }
                        setMessages([systemMsg])
                        setDriftOnlyMessages([systemMsg])
                      }
                    }}
                    className={`text-left w-full flex items-start justify-between gap-2 px-4 py-3 rounded-2xl text-[14px] leading-snug active:scale-[0.98] transition-all duration-150
                      ${visited
                        ? 'border border-cyan-400/30 bg-cyan-500/[0.08] text-text-primary'
                        : 'border border-cyan-500/15 bg-cyan-500/[0.04] text-text-secondary hover:border-cyan-400/35 hover:text-text-primary hover:bg-cyan-500/[0.09]'}`}
                  >
                    <span>{question}</span>
                    {visited && <span className="flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-cyan-400/70" />}
                  </button>
                })}

              </div>
            )}
          </div>
        )}

        {/* Connect chips: custom question input bar */}
        {templateType === 'connect' && !connectQuestion && (
          <div className="absolute bottom-0 left-0 right-0 z-10">
            <div className="h-8 bg-gradient-to-t from-dark-bg to-transparent pointer-events-none" />
            <div className="bg-dark-bg px-4 pt-1" style={{ paddingBottom: 'calc(var(--kb-h, 0px) + env(safe-area-inset-bottom) + 0.5rem)' }}>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Ask your own question…"
                  className="w-full bg-dark-elevated text-text-primary text-[13px] rounded-2xl px-4 py-3 pr-12 border border-white/[0.08] focus:outline-none focus:border-accent-violet/30 focus:shadow-[0_0_0_3px_rgba(168,85,247,0.08)] placeholder:text-text-muted/50 transition-all duration-150 min-h-[46px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value.trim()
                      if (!val) return
                      ;(e.target as HTMLInputElement).value = ''
                      setConnectQuestion(val)
                      autoSentRef.current = false
                      const systemMsg: Message = {
                        id: 'drift-system-' + Date.now(),
                        text: val,
                        isUser: false,
                        timestamp: new Date(),
                      }
                      setMessages([systemMsg])
                      setDriftOnlyMessages([systemMsg])
                    }
                  }}
                />
                <div className="absolute right-2 top-0 bottom-0 flex items-center">
                  <button
                    type="button"
                    className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.06] text-text-muted active:scale-90 transition-all"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      const input = e.currentTarget.closest('.relative')?.querySelector('input') as HTMLInputElement | null
                      const val = input?.value.trim()
                      if (!val) return
                      if (input) input.value = ''
                      setConnectQuestion(val)
                      autoSentRef.current = false
                      const systemMsg: Message = {
                        id: 'drift-system-' + Date.now(),
                        text: val,
                        isUser: false,
                        timestamp: new Date(),
                      }
                      setMessages([systemMsg])
                      setDriftOnlyMessages([systemMsg])
                    }}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Messages — hidden in connect chips mode */}
        <div className={`flex-1 overflow-y-auto p-4 space-y-4 bg-transparent custom-scrollbar ${templateType === 'connect' && !connectQuestion ? 'hidden' : ''}`} style={{ paddingBottom: 'calc(var(--kb-h, 0px) + 5rem)' }}>
          {(() => {
            const renderedGroups = new Set<string>()
            return messages.map((msg) => {
              if (!msg.text) return null
              if (msg.compareGroupId) {
                const gid = msg.compareGroupId
                if (renderedGroups.has(gid)) return null
                renderedGroups.add(gid)
                const groupMsgs = messages.filter(m => m.compareGroupId === gid)
                const orderKeys = (selectedTargets || []).map(t => t.key)
                const lanes = [...groupMsgs].sort((a, b) => {
                  const ia = orderKeys.indexOf(a.laneKey || '')
                  const ib = orderKeys.indexOf(b.laneKey || '')
                  if (ia !== -1 && ib !== -1) return ia - ib
                  if (ia !== -1) return -1
                  if (ib !== -1) return 1
                  return (a.laneKey || '').localeCompare(b.laneKey || '')
                })
                const cols = Math.max(2, lanes.length)
                return (
                  <div key={`cmp-${gid}`} className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                    {lanes.map(col => (
                      <div
                        key={col.id}
                        className="group"
                        onMouseEnter={() => setHoveredMessageId(col.id)}
                        onMouseLeave={() => setHoveredMessageId(null)}
                      >
                        <div className="relative" data-drift-message-id={col.id}>
                          <div className="relative rounded-2xl px-3.5 pt-6 pb-3 bg-dark-elevated border border-white/[0.08] text-text-secondary min-h-[40px]">
                            {/* Overlay header chips: model tag (left) + actions (right) */}
                            {!col.isUser && (
                              <>
                                {col.modelTag && (
                                  <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-dark-elevated/70 border border-dark-border/50 text-[10px] text-text-muted">
                                    {col.modelTag}
                                  </span>
                                )}
                                <div className="absolute top-1 right-1 flex items-center gap-1.5 opacity-80 hover:opacity-100">
                                  <button
                                    onClick={() => handlePushSingleMessage(col)}
                                    className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-dark-elevated/70 border border-dark-border/50 hover:border-accent-pink/60 hover:bg-accent-pink/10 transition-all duration-150"
                                    title="Push this message to main chat"
                                  >
                                    <ArrowLeft className="w-3 h-3 text-text-muted" />
                                  </button>
                                  <button
                                    onClick={() => handleToggleSaveMessage(col)}
                                    className={`w-6 h-6 inline-flex items-center justify-center rounded-full bg-dark-elevated/70 border ${savedMessageIds.has(col.id) ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-dark-border/50'} hover:border-cyan-500/60 hover:bg-cyan-500/10 transition-all duration-150`}
                                    title={savedMessageIds.has(col.id) ? 'Remove from snippets' : 'Save to snippets'}
                                  >
                                    <Bookmark className={`w-3 h-3 ${savedMessageIds.has(col.id) ? 'text-cyan-300 fill-cyan-300' : 'text-text-muted'}`} />
                                  </button>
                                </div>
                              </>
                            )}
                            {/* Bubble content */}
                            <div className={`text-[13px] leading-6 ${getRTLClassName(col.text)}`} dir={getTextDirection(col.text)}>
                              <ReactMarkdown className="text-[13px] leading-6 prose prose-sm prose-invert max-w-none prose-p:mb-2 prose-code:text-accent-violet prose-code:bg-dark-bg/50 prose-pre:bg-dark-bg prose-pre:border prose-pre:border-dark-border/50 prose-pre:rounded-lg prose-pre:p-3" remarkPlugins={[remarkGfm]}>
                                {col.text}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }

              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'} group`}
                  onMouseEnter={() => setHoveredMessageId(msg.id)}
                  onMouseLeave={() => setHoveredMessageId(null)}
                >
                  {msg.isUser ? (
                    /* User bubble — subtle, not garish */
                    <div
                      className="relative max-w-[75%]"
                      data-drift-message-id={msg.id}
                    >
                      <div className="px-4 py-2.5 bg-accent-violet/15 border border-accent-violet/25 rounded-2xl rounded-br-md">
                        <p className={`text-sm text-text-primary leading-relaxed ${getRTLClassName(msg.text)}`} dir={getTextDirection(msg.text)}>{msg.text}</p>
                      </div>
                    </div>
                  ) : (
                    /* AI response — transparent, clean */
                    <div
                      className="ai-message relative w-full select-text"
                      data-message-id={msg.id}
                      data-drift-message-id={msg.id}
                    >
                      {msg.modelTag && (
                        <span className="block mb-1 text-[10px] text-text-muted/60 pl-1">{msg.modelTag}</span>
                      )}
                      <div className="px-1 pb-1">
                        <div className={`text-sm text-text-secondary leading-relaxed ${getRTLClassName(msg.text)} ${streamingMsgId === msg.id ? 'drift-text-shimmer' : ''}`} dir={getTextDirection(msg.text)}>
                          <ReactMarkdown
                            className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none prose-headings:text-text-primary prose-headings:font-semibold prose-headings:mb-2 prose-headings:mt-3 prose-p:text-text-secondary prose-p:mb-2 prose-strong:text-text-primary prose-strong:font-semibold prose-ul:my-2 prose-ul:space-y-1 prose-li:text-text-secondary prose-li:ml-4 prose-code:text-accent-violet prose-code:bg-dark-bg/50 prose-pre:bg-dark-bg prose-pre:border prose-pre:border-dark-border/50 prose-pre:rounded-lg prose-pre:p-3 prose-blockquote:border-l-accent-violet prose-blockquote:text-text-muted prose-table:w-full prose-table:border-collapse prose-table:overflow-hidden prose-table:rounded-lg prose-thead:bg-dark-elevated/50 prose-thead:border-b prose-thead:border-dark-border/50 prose-th:text-text-primary prose-th:font-semibold prose-th:px-2 prose-th:py-1.5 prose-th:text-left prose-th:text-xs prose-td:text-text-secondary prose-td:px-2 prose-td:py-1.5 prose-td:border-b prose-td:border-dark-border/30 prose-td:text-xs prose-tr:hover:bg-dark-elevated/20"
                            remarkPlugins={[remarkGfm]}
                            components={(() => {
                              const hl = msgHighlights.get(msg.id) ?? []
                              const injectHL = (text: string): React.ReactNode => {
                                if (!hl.length) return text
                                const matches: Array<{ start: number; end: number; phrase: string }> = []
                                hl.forEach(phrase => {
                                  const pos = text.indexOf(phrase)
                                  if (pos !== -1) matches.push({ start: pos, end: pos + phrase.length, phrase })
                                })
                                if (!matches.length) return text
                                matches.sort((a, b) => a.start - b.start)
                                const out: React.ReactNode[] = []
                                let cursor = 0
                                for (const m of matches) {
                                  if (m.start < cursor) continue
                                  if (m.start > cursor) out.push(text.slice(cursor, m.start))
                                  out.push(
                                    <span
                                      key={`hl-${m.start}`}
                                      className="drift-suggestion"
                                      title="Ask about this ↗"
                                      onClick={() => sendMessage(m.phrase)}
                                    >
                                      {m.phrase}
                                    </span>
                                  )
                                  cursor = m.end
                                }
                                if (cursor < text.length) out.push(text.slice(cursor))
                                return out
                              }
                              const walkHL = (node: React.ReactNode): React.ReactNode => {
                                if (typeof node === 'string') return injectHL(node)
                                if (typeof node === 'number' || node == null || node === false) return node
                                if (Array.isArray(node)) return node.map((n, i) => <span key={i}>{walkHL(n)}</span>)
                                if (isValidElement(node)) {
                                  const props: any = (node as any).props || {}
                                  if ('children' in props) return cloneElement(node as any, { ...props, children: walkHL(props.children) })
                                  return node
                                }
                                return null
                              }
                              const proc = (children: any) => hl.length ? walkHL(children) : children
                              return {
                                p: ({ children }: any) => <p className="mb-2">{proc(children)}</p>,
                                li: ({ children }: any) => <li>{proc(children)}</li>,
                                br: () => <br />,
                                table: ({ children }: any) => <div className="overflow-x-auto my-3"><table className="min-w-full text-xs">{children}</table></div>,
                              }
                            })()}
                          >
                            {msg.text.replace(/<br>/g, '\n').replace(/<br\/>/g, '\n')}
                          </ReactMarkdown>
                        </div>
                        {/* Action row — visible on hover (desktop) or always on mobile */}
                        <div className="mt-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 lg:opacity-0 lg:group-hover:opacity-100">
                          <button
                            onClick={() => handlePushSingleMessage(msg)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-accent-violet hover:bg-accent-violet/[0.08] transition-all duration-150"
                            title="Push this message to main chat"
                          >
                            <ArrowLeft className="w-3 h-3" />
                            Push
                          </button>
                          <button
                            onClick={() => handleToggleSaveMessage(msg)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-all duration-150 ${savedMessageIds.has(msg.id) ? 'text-cyan-300 bg-cyan-500/[0.08]' : 'text-text-muted hover:text-cyan-300 hover:bg-cyan-500/[0.08]'}`}
                            title={savedMessageIds.has(msg.id) ? 'Remove from snippets' : 'Save to snippets'}
                          >
                            <Bookmark className={`w-3 h-3 ${savedMessageIds.has(msg.id) ? 'fill-cyan-300' : ''}`} />
                            {savedMessageIds.has(msg.id) ? 'Saved' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          })()}
          
          {isTyping && (
            <div className="flex justify-start pl-1">
              {/* Thinking — the dot cluster breathes while each dot bounces */}
              <div className="flex gap-1 items-center py-2 animate-breathe">
                <span className="w-1.5 h-1.5 rounded-full bg-text-muted/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-text-muted/40 animate-bounce" style={{ animationDelay: '120ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-text-muted/40 animate-bounce" style={{ animationDelay: '240ms' }} />
              </div>
            </div>
          )}

          {/* Suggestion chips — shown for plain drifts and drifts opened from Connect cards */}
          {(!templateType || initialSuggestions?.length) && driftSuggestions.length > 0 && !driftOnlyMessages.some(m => m.isUser) && (
            <div className="mt-2 mb-4 flex flex-col gap-1.5">
              <p className="text-[10px] text-text-muted/50 uppercase tracking-wide px-1">Try asking</p>
              {driftSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setDriftSuggestions([]); sendMessage(s) }}
                  className="text-left px-3 py-2 rounded-xl text-[12px] text-text-secondary
                    border border-accent-violet/20 bg-accent-violet/[0.04]
                    hover:border-accent-violet/40 hover:text-text-primary hover:bg-accent-violet/[0.10]
                    transition-all duration-150"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input — hidden in connect chips mode, shown in connect chat mode */}
        <div className={`absolute bottom-0 left-0 right-0 z-10 ${templateType === 'connect' && !connectQuestion ? 'hidden' : ''}`}>
          <div className="h-8 bg-gradient-to-t from-dark-bg to-transparent pointer-events-none" />
          <div className="bg-dark-bg px-4 pt-1" style={{ paddingBottom: 'calc(var(--kb-h, 0px) + env(safe-area-inset-bottom) + 0.5rem)' }}>
            <div className="relative flex-1">
                <textarea
                  ref={inputRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !isTyping) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder="Explore this drift…"
                  rows={1}
                  dir={getTextDirection(message)}
                  className={`
                    w-full bg-dark-elevated text-text-primary text-[13px]
                    rounded-2xl px-4 py-3 pr-24
                    border border-white/[0.08]
                    focus:outline-none focus:border-accent-violet/30
                    focus:shadow-[0_0_0_3px_rgba(168,85,247,0.08)]
                    placeholder:text-text-muted/50
                    transition-all duration-150
                    resize-none
                    min-h-[46px] max-h-[200px]
                    ${message.split('\n').length > 5 ? 'overflow-y-auto' : 'overflow-y-hidden'}
                    custom-scrollbar
                    ${getRTLClassName(message)}
                  `}
                />
                <div className="absolute right-2 top-0 bottom-0 flex items-center gap-1">
                  {/* Mic — only when no text, not listening, not typing */}
                  {voiceInput.isSupported && !message.trim() && !voiceInput.isListening && !isTyping && (
                    <button
                      onClick={voiceInput.startListening}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/8 transition-all active:scale-90"
                      title="Voice input"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                  {/* Stop generation */}
                  {isTyping && (
                    <button
                      onClick={stopGeneration}
                      className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 border border-white/20 text-text-muted hover:text-text-primary transition-all active:scale-90"
                      title="Stop generating"
                    >
                      <Square className="w-3.5 h-3.5" fill="currentColor" />
                    </button>
                  )}
                  {/* Listening stop */}
                  {voiceInput.isListening && (
                    <button
                      onClick={voiceInput.stopListening}
                      className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-500/15 border border-red-500/30 text-red-400 animate-pulse active:scale-90"
                      title="Stop listening"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}
                  {/* Send button */}
                  {!isTyping && (
                    <button
                      onClick={() => sendMessage()}
                      disabled={!message.trim() && !voiceInput.isListening}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-90 ${message.trim() || voiceInput.isListening ? 'bg-gradient-to-br from-accent-pink to-accent-violet text-white shadow-lg shadow-accent-violet/20' : 'text-text-muted cursor-default'}`}
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {/* Voice listening red glow overlay */}
                {voiceInput.isListening && (
                  <div className="absolute inset-0 rounded-2xl pointer-events-none ring-1 ring-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]" />
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
