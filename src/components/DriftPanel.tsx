import { useState, useRef, useEffect, useMemo, isValidElement, cloneElement } from 'react'
import { ArrowUp, ArrowLeft, Square, Upload, Undo2, Bookmark, Maximize2, Minimize2, Megaphone, ChevronLeft, ChevronRight, Mic, Home, ArrowUpRight, ArrowUpLeft, Waypoints, Sparkles, X, AlertCircle, RefreshCw } from 'lucide-react'
import { useOnceFlag } from '../lib/onceFlags'
import {
  CONNECT_TYPES,
  connectKind,
  driftLabelsFor,
  isDriftOpenerText,
  isDriftScaffoldText,
  friendlyDriftError,
  TEMPLATE_SYSTEM_PROMPTS,
} from '../lib/driftPanel'
import type { AncestryEntry } from '../types/chat'
import type { TermOccurrence } from '../lib/termIndex'
import { sendMessageToOpenRouter, type ChatMessage as OpenRouterMessage, OPENROUTER_MODELS } from '../services/openrouter'
import { sendMessageToOllama, type ChatMessage as OllamaMessage } from '../services/ollama'
import { sendMessageToGemini, getDriftSuggestions, getSuggestedHighlights, type ChatMessage as GeminiMessage } from '../services/gemini'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AISettings } from './Settings'
import { snippetStorage } from '../services/snippetStorage'
import { getTextDirection, getRTLClassName } from '../utils/rtl'
import { useVoiceInput } from '../hooks/useVoiceInput'
import { Stagger, staggerChild } from './motion'
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
  // Marks a failed request rendered as a recoverable inline error (with retry).
  isError?: boolean
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
  /** Sibling drifts — other terms branched from the same parent — for lateral walking. */
  siblingDrifts?: SiblingDrift[]
  /** The chat id of the drift currently open, used to locate it among its siblings. */
  currentDriftChatId?: string
  /** Walk sideways to a sibling drift without leaving the panel. */
  onNavigateToSibling?: (sib: SiblingDrift) => void
  /** Re-view the same term through a different lens (Drift / Simplify / Deep dive / Connect). */
  onSwitchLens?: (template: 'simplify' | 'research' | 'connect' | undefined) => void
}

export interface SiblingDrift {
  selectedText: string
  driftChatId: string
  sourceMessageId: string
  templateType?: 'simplify' | 'research' | 'connect'
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
  siblingDrifts,
  currentDriftChatId,
  onNavigateToSibling,
  onSwitchLens,
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
  const siblingStripRef = useRef<HTMLDivElement>(null)
  const breadcrumbScrollRef = useRef<HTMLDivElement>(null)
  const voiceInput = useVoiceInput((transcript) => {
    setMessage((prev) => (prev ? prev + ' ' : '') + transcript)
  })
  const compareAbortControllersRef = useRef<Record<string, AbortController> | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [showExpandHint, setShowExpandHint] = useState(false)
  const [connectCards, setConnectCards] = useState<string[] | null>(null)
  // First-run hint for the lens switcher — shown once, dismissed on first use.
  const [seenLensHint, markLensHint] = useOnceFlag('lens-bar')
  const [connectQuestion, setConnectQuestion] = useState<string | null>(null)
  const connectAnswersRef = useRef<Map<string, Message[]>>(new Map())
  // When the panel re-initializes for a new thread (term switch / lens switch),
  // `driftChatId` flips immediately but the PREVIOUS thread's `driftOnlyMessages`
  // linger in state for one render until the init effect's queued reset commits.
  // The Connect-card parser must not parse that stale render's JSON — doing so
  // keys the previous drift's cards onto the newly-selected term (the "Connect
  // shows the wrong drift" bug). The init effect arms this flag so the parser
  // skips exactly that one stale pass; it clears once consumed.
  const skipStaleCardParseRef = useRef(false)
  // The driftChatId the live `driftOnlyMessages` belong to. Updated synchronously
  // by the init effect when a thread loads. The persistence effect gates on this
  // so that during a term switch — where driftOnlyMessages still holds the OLD
  // thread but driftChatId has already flipped — the old conversation is never
  // written under the new thread's key (which would lose it on return: Bug 5).
  const messagesThreadRef = useRef<string | undefined>(driftChatId)
  const [connectVisitedVersion, setConnectVisitedVersion] = useState(0)
  /** Tracks the active chip session {question, messages} via ref so it survives React batching. */
  const chipSessionRef = useRef<{ question: string; messages: Message[] } | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  /** Tracks whether the auto-send for the current template drift has already fired. */
  const autoSentRef = useRef(false)
  const [driftSuggestions, setDriftSuggestions] = useState<string[]>([])
  /** Per-message AI-suggested highlight phrases (dotted underline, click to ask) */
  const [msgHighlights, setMsgHighlights] = useState<Map<string, string[]>>(new Map())

  // Localize the drift scaffolding to the chat's language (sampled from the term +
  // recent parent context), so the opener and "Simplify this"/etc. match Hebrew chats.
  const driftLabels = useMemo(
    () => driftLabelsFor(`${selectedText} ${(contextMessages ?? []).slice(-3).map(m => m.text).join(' ')}`.slice(0, 400)),
    [selectedText, contextMessages]
  )

  // Initialize Drift with existing messages or system message
  useEffect(() => {
    if (isOpen) {
      // Arm the stale-parse skip: the about-to-be-reset messages may still hold
      // the previous thread's Connect JSON for one render. (See parser below.)
      skipStaleCardParseRef.current = true
      // The messages this effect is about to set belong to THIS thread. Stamping
      // it synchronously means the persistence effect (which fires after the
      // queued setDriftOnlyMessages commits) saves under the correct key, and any
      // stale-render fire for the previous thread is gated out.
      messagesThreadRef.current = driftChatId

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
          ? driftLabels.connectFinding(selectedText)
          : templateType
          ? `${driftLabels.prefixes[templateType] ?? 'Exploring'}: "${selectedText}"`
          : driftLabels.opener(selectedText)
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

      // Restore or reset Connect state
      connectAnswersRef.current = initialConnectAnswers
        ? new Map(Object.entries(initialConnectAnswers))
        : new Map()
      chipSessionRef.current = null
      setConnectCards(initialConnectCards != null ? initialConnectCards : null)
      setConnectQuestion(initialConnectQuestion != null ? initialConnectQuestion : null)

      // Defensive backstop: if ANY cached/restored content exists for this drift
      // (restored messages, Connect chips, or visited-bridge answers), suppress
      // the auto-send so an already-explored term+lens can never re-fetch — no
      // matter which entry point opened it. A genuinely new drift (no cache) has
      // none of these, so first-time generation still fires exactly once.
      const hasRestoredContent =
        (existingMessages != null && existingMessages.length > 0) ||
        (initialConnectCards != null && initialConnectCards.length > 0) ||
        (initialConnectAnswers != null && Object.keys(initialConnectAnswers).length > 0)
      if (hasRestoredContent) {
        autoSentRef.current = true
      }

      // Suggestion chips: use pre-loaded ones, fetch for plain drifts, skip for templates
      if (initialSuggestions && initialSuggestions.length > 0) {
        setDriftSuggestions(initialSuggestions)
      } else if (!templateType && !(existingMessages && existingMessages.length > 0)) {
        const geminiKey = import.meta.env.VITE_GEMINI_API_KEY || aiSettings.geminiApiKey
        if (geminiKey) {
          const ctx = contextMessages.slice(-4).map(m => `${m.isUser ? 'User' : 'Assistant'}: ${m.text}`).join('\n')
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
  }, [isOpen, selectedText, existingMessages, templateType, driftChatId])

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
      : `${driftLabels.prefixes[templateType] ?? 'Explore this'}: "${selectedText}"`

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
    if (templateType !== 'connect') return
    // Stale-window guard: when switching terms/lenses, this effect can fire on the
    // render where driftChatId already points at the NEW thread but
    // driftOnlyMessages still holds the PREVIOUS thread's streamed JSON (the init
    // effect's reset is queued, not yet committed). Parsing that would key the
    // previous drift's cards onto the newly-selected term — the "Connect shows the
    // wrong drift" bug. The init effect arms a skip for exactly that stale pass;
    // we consume it here (before the isTyping/question early-returns) so it can
    // never linger and swallow the next thread's legitimate first parse.
    if (skipStaleCardParseRef.current) {
      skipStaleCardParseRef.current = false
      return
    }
    if (isTyping || connectQuestion) return
    const aiMsg = driftOnlyMessages.find(m => !m.isUser && !m.id.startsWith('drift-system-'))
    if (!aiMsg?.text) return
    const raw = aiMsg.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    // Only treat this as connect cards if it actually looks like a JSON array. When
    // switching lenses (Connect → Deep dive → Connect), this effect can fire on a
    // render where driftOnlyMessages still holds the PREVIOUS lens's prose answer;
    // parsing that and wiping to [] is what caused "No connections found" after the
    // cards had already been restored. Prose → leave the restored cards intact.
    if (!raw.startsWith('[')) return
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setConnectCards(parsed.filter((x: unknown) => typeof x === 'string').slice(0, 5))
      }
    } catch {
      // Malformed JSON — keep whatever cards we have rather than blanking the view.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateType, isTyping, driftOnlyMessages, selectedText])

  // Sync driftOnlyMessages to the temp store so nested-drift detection
  // in handleStartDrift can always see the current conversation.
  useEffect(() => {
    // Only persist messages that belong to the thread currently loaded. During a
    // term switch there is a render where driftOnlyMessages still holds the OLD
    // thread but driftChatId has flipped to the new one; saving then would write
    // the old conversation under the new key. Gate on the messages' own thread.
    if (driftChatId && driftChatId === messagesThreadRef.current && driftOnlyMessages.length > 0) {
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

  // A bridge question frames the connection between the term and a concept —
  // it doubles as the displayed label and the prompt sent to the model.
  const bridgeQuestion = (concept: string) => driftLabels.bridge(selectedText, concept)

  // Open (or restore) a focused Connect thread for a given question/bridge.
  const openConnectThread = (question: string) => {
    haptics.selection()
    const cached = connectAnswersRef.current.get(question)
    setConnectQuestion(question)
    if (cached) {
      autoSentRef.current = true
      setMessages(cached)
      setDriftOnlyMessages(cached)
    } else {
      autoSentRef.current = false
      const systemMsg: Message = { id: 'drift-system-' + Date.now(), text: question, isUser: false, timestamp: new Date() }
      setMessages([systemMsg])
      setDriftOnlyMessages([systemMsg])
    }
  }

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

  // Keep the active term pill visible as the user walks between siblings.
  useEffect(() => {
    const strip = siblingStripRef.current
    if (!strip) return
    const active = strip.querySelector('[data-sibling-active="true"]')
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [currentDriftChatId, siblingDrifts])

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
        msg => !isDriftOpenerText(msg.text)
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
        .filter(msg => !isDriftOpenerText(msg.text))
      
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

      const baseSystemContent = (templateType === 'connect' && connectQuestion)
        ? `The user is reading about "${selectedText}" and tapped a connection to explore this bridge: "${connectQuestion}". Reveal the actual link between the two — the through-line, the shared mechanism, the influence, or the tension — not a standalone definition of either side. Lead with the most interesting or surprising part of the connection, give the concrete specifics (names, events, how one shaped or opposes the other), and keep "${selectedText}" in the frame throughout. If the connection is more tenuous than it sounds, be honest about that rather than overstating it. Do not invent facts. Be concise and vivid — a few tight paragraphs, no padding.${parentContext ? `\n\nInterpret "${selectedText}" in the sense this conversation implies (disambiguate by context):\n${parentContext}` : ''}`
        : (templateType === 'connect')
        ? connectChipsPrompt
        : templateType
        ? TEMPLATE_SYSTEM_PROMPTS[templateType]
        : (parentContext
            ? `The user is reading the conversation below and selected "${selectedText}" to explore it further.\n\nConversation context:\n${parentContext}\n\nInterpret "${selectedText}" ONLY in the sense this conversation implies — use the surrounding text to resolve which specific entity is meant (a club vs. a city, a person vs. a namesake). Do not restate the basic definition they can already see; instead add NEW value: the non-obvious angle, the mechanism, a concrete example, the relevant history or tension. Be concise, specific, and accurate — don't invent facts.`
            : `The user selected "${selectedText}" from a conversation they're already reading. They want to explore this specific term/concept deeper. Don't repeat the basic definition - they can already see that. Instead, provide interesting insights, examples, etymology, cultural context, or related concepts. Be concise, specific, and add NEW value beyond what's already visible. Don't invent facts.`)
      // Connect branches already embed their own context above; only the
      // non-connect templates need it appended here.
      const systemContent = (templateType && templateType !== 'connect' && parentContext)
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
      // If a provider was passed from main chat, honor it. Otherwise, infer.
      const provider: 'openrouter' | 'ollama' | 'gemini' = selectedProvider
        ? selectedProvider
        : (geminiKey ? 'gemini' : effectiveApiKey ? 'openrouter' : 'ollama')

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
        msg => !isDriftOpenerText(msg.text)
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

        {/* "View as" lens switcher — re-view the same term through a different lens
            without returning to the chat. Each lens keeps its own thread. Hidden in
            Connect's bridge sub-mode (you're inside an answer there). */}
        {onSwitchLens && !(templateType === 'connect' && connectQuestion) && (
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.015] shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <span className="text-[10px] uppercase tracking-wider text-text-muted/50 mr-1 shrink-0">View as</span>
            {([
              { tpl: undefined, label: 'Drift' },
              { tpl: 'simplify', label: 'Simplify' },
              { tpl: 'research', label: 'Deep dive' },
              { tpl: 'connect', label: 'Connect' },
            ] as const).map((l) => {
              const active = (l.tpl ?? undefined) === (templateType ?? undefined)
              return (
                <button
                  key={l.label}
                  onClick={() => { markLensHint(); if (!active) onSwitchLens(l.tpl) }}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium leading-none transition-colors
                    ${active
                      ? 'bg-accent-violet/20 text-accent-violet border border-accent-violet/40'
                      : 'text-white/45 border border-white/[0.07] hover:text-white/80 hover:border-white/20'}`}
                >
                  {l.label}
                </button>
              )
            })}
          </div>
        )}
        {/* First-run hint: the lens switcher is an invisible affordance — teach it once. */}
        {onSwitchLens && !(templateType === 'connect' && connectQuestion) && !seenLensHint && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-accent-violet/15 bg-accent-violet/[0.06] shrink-0">
            <Sparkles className="w-3 h-3 text-accent-violet/70 shrink-0" />
            <span className="text-[11px] text-text-muted leading-snug flex-1">Same term, a new angle — try <span className="text-accent-violet/90 font-medium">Simplify</span>, <span className="text-accent-violet/90 font-medium">Deep dive</span>, or <span className="text-accent-violet/90 font-medium">Connect</span>.</span>
            <button onClick={markLensHint} aria-label="Dismiss tip" className="text-text-muted/60 hover:text-text-muted shrink-0 p-0.5"><X className="w-3 h-3" /></button>
          </div>
        )}

        {/* Sibling switcher — walk sideways between terms branched from the same
            parent, without going back to the map. Only shown when siblings exist. */}
        {siblingDrifts && siblingDrifts.length > 1 && onNavigateToSibling && (() => {
          const idx = siblingDrifts.findIndex(s => s.driftChatId === currentDriftChatId)
          const prev = idx > 0 ? siblingDrifts[idx - 1] : null
          const next = idx >= 0 && idx < siblingDrifts.length - 1 ? siblingDrifts[idx + 1] : null
          return (
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/[0.06] bg-white/[0.015] shrink-0">
              <button
                onClick={() => prev && onNavigateToSibling(prev)}
                disabled={!prev}
                className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-full text-white/40 hover:text-accent-violet hover:bg-accent-violet/[0.1] disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-white/40 transition-colors shrink-0"
                title={prev ? `Previous: "${prev.selectedText}"` : 'No previous term'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div
                ref={siblingStripRef}
                className="flex-1 flex items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: 'none' }}
              >
                {siblingDrifts.map((sib) => {
                  const isCurrent = sib.driftChatId === currentDriftChatId
                  return (
                    <button
                      key={sib.driftChatId}
                      data-sibling-active={isCurrent}
                      onClick={() => !isCurrent && onNavigateToSibling(sib)}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium leading-none truncate max-w-[140px] transition-colors
                        ${isCurrent
                          ? 'bg-accent-violet/[0.18] text-accent-violet border border-accent-violet/40'
                          : 'text-white/45 border border-white/[0.07] hover:text-white/80 hover:border-white/20 hover:bg-white/[0.04]'}`}
                      title={sib.selectedText}
                    >
                      {sib.selectedText}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => next && onNavigateToSibling(next)}
                disabled={!next}
                className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-full text-white/40 hover:text-accent-violet hover:bg-accent-violet/[0.1] disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-white/40 transition-colors shrink-0"
                title={next ? `Next: "${next.selectedText}"` : 'No next term'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )
        })()}

        {/* Connect view — chips list or inline chat */}
        {templateType === 'connect' && !connectQuestion && (
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32 custom-scrollbar">
            {/* Relationship map: the term is a hub with labeled edges to related
                concepts. Tap an edge → the AI draws the bridge between the two,
                which becomes its own thread. "Connect to anything" adds an edge. */}
            {(isTyping || connectCards === null) ? (
              <div className="flex flex-col gap-2.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-14 rounded-2xl bg-white/[0.04] animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
                ))}
              </div>
            ) : (() => {
              // Each card is "<type> :: <relationship> :: <concept>". Legacy cards
              // may be "<relationship> :: <concept>" (no type) or a bare concept —
              // parse defensively so old cached drifts still render.
              const edges = (connectCards ?? []).map(card => {
                const parts = card.split('::').map(s => s.trim()).filter(Boolean)
                if (parts.length >= 3) {
                  return { typeKey: parts[0].toLowerCase(), relationship: parts[1].replace(/:+$/, ''), concept: parts.slice(2).join(' :: ') }
                }
                if (parts.length === 2) {
                  return { typeKey: '', relationship: parts[0].replace(/:+$/, ''), concept: parts[1] }
                }
                return { typeKey: '', relationship: '', concept: parts[0] ?? '' }
              }).filter(e => e.concept)
              void connectVisitedVersion // consumed to trigger re-render on cache changes
              if (edges.length === 0) {
                return <p className="text-[13px] text-text-muted/60 text-center mt-8">No connections found.</p>
              }
              const dir = getTextDirection(selectedText)
              const Arrow = dir === 'rtl' ? ArrowUpLeft : ArrowUpRight
              const anyVisited = edges.some(e => connectAnswersRef.current.has(bridgeQuestion(e.concept)))
              const presentKinds = [...new Set(edges.map(e => e.typeKey).filter(k => k in CONNECT_TYPES))]
              return (
                <div dir={dir}>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Waypoints className="w-3.5 h-3.5 text-accent-discovery/80" />
                    <p className="text-micro uppercase tracking-widest text-accent-discovery/80">Connections</p>
                  </div>
                  {/* Hub — a living node the edges emanate from */}
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="relative flex items-center justify-center shrink-0 w-3.5 h-3.5">
                      <span className="absolute -inset-1 rounded-full border border-accent-discovery/30 animate-breathe" aria-hidden />
                      <span className="w-3 h-3 rounded-full bg-accent-discovery" style={{ boxShadow: '0 0 14px rgba(34,211,238,0.7)' }} />
                    </span>
                    <span className="text-[15px] font-semibold text-text-primary leading-snug truncate" dir={dir}>{selectedText}</span>
                  </div>
                  {/* Edges branching from the hub. Logical props (border-s / ps /
                      -start) mirror automatically for RTL languages like Hebrew. */}
                  <div className="ms-[6px] border-s ps-5" style={{ borderColor: 'rgba(34,211,238,0.18)' }}>
                    <Stagger className="flex flex-col gap-2 pt-1" step={0.04}>
                      {edges.map((e, i) => {
                        const q = bridgeQuestion(e.concept)
                        const visited = connectAnswersRef.current.has(q)
                        const k = connectKind(e.typeKey)
                        const Icon = k.icon
                        const isTension = e.typeKey === 'tension'
                        return (
                          <motion.button
                            key={i}
                            variants={staggerChild}
                            onClick={() => openConnectThread(q)}
                            className="group relative flex items-center gap-3 w-full text-start px-3 py-2.5 rounded-xl border active:scale-[0.98] transition-all duration-150 min-h-[54px]"
                            style={{
                              borderColor: visited ? `${k.color}66` : 'rgba(255,255,255,0.07)',
                              background: visited ? `${k.color}14` : 'rgba(26,26,26,0.4)',
                            }}
                            title={bridgeQuestion(e.concept)}
                          >
                            {/* connector + glowing synapse node sitting on the rail */}
                            <span
                              className={`absolute top-1/2 -translate-y-1/2 -start-5 w-5 ${isTension ? 'border-t border-dashed' : 'h-px'}`}
                              style={isTension ? { borderColor: `${k.color}88` } : { background: `${k.color}66` }}
                              aria-hidden
                            />
                            <span
                              className="absolute top-1/2 -translate-y-1/2 -start-[23px] w-1.5 h-1.5 rounded-full transition-transform duration-200 group-hover:scale-150"
                              style={{ background: k.color, boxShadow: `0 0 8px ${k.glow}` }}
                              aria-hidden
                            />
                            {/* type icon chip */}
                            <span
                              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{ background: `${k.color}1a`, color: k.color }}
                            >
                              <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
                            </span>
                            <div className="flex-1 min-w-0" dir={getTextDirection(e.concept)}>
                              {e.relationship && (
                                <span className="block text-[10px] tracking-wider leading-none mb-1 truncate" style={{ color: `${k.color}cc` }}>{e.relationship}</span>
                              )}
                              <span className="block text-[14px] text-text-secondary group-hover:text-text-primary leading-snug transition-colors">{e.concept}</span>
                            </div>
                            {visited
                              ? <span className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: k.color, boxShadow: `0 0 6px ${k.glow}` }} aria-hidden />
                              : <Arrow className="w-4 h-4 text-text-muted/40 group-hover:text-text-secondary shrink-0 transition-colors" />}
                          </motion.button>
                        )
                      })}
                    </Stagger>
                  </div>
                  {/* Footer: first-visit hint, then a legend of the kinds present */}
                  {!anyVisited && (
                    <p className="mt-4 ps-5 text-[11px] text-text-muted/50 leading-snug">Tap a connection to explore the bridge between them.</p>
                  )}
                  {presentKinds.length > 0 && (
                    <div className="mt-4 ps-5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {presentKinds.map(key => {
                        const k = CONNECT_TYPES[key]
                        return (
                          <span key={key} className="inline-flex items-center gap-1.5 text-[10px] text-text-muted/70">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: k.color, boxShadow: `0 0 5px ${k.glow}` }} aria-hidden />
                            {k.label}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}
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
                  placeholder="Connect to anything…"
                  className="w-full bg-dark-elevated text-text-primary text-[13px] rounded-2xl px-4 py-3 pr-12 border border-white/[0.08] focus:outline-none focus:border-accent-violet/30 focus:shadow-[0_0_0_3px_rgba(168,85,247,0.08)] placeholder:text-text-muted/50 transition-all duration-150 min-h-[46px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value.trim()
                      if (!val) return
                      ;(e.target as HTMLInputElement).value = ''
                      openConnectThread(bridgeQuestion(val))
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
                      openConnectThread(bridgeQuestion(val))
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
                  ) : msg.isError ? (
                    /* Recoverable inline error — clearly an error, with retry */
                    <div className="w-full" data-drift-message-id={msg.id}>
                      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-rose-500/[0.08] border border-rose-500/25">
                        <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-secondary leading-relaxed">{msg.text}</p>
                          <button
                            onClick={retryLastMessage}
                            disabled={isTyping}
                            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" /> Try again
                          </button>
                        </div>
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
