import { useState, useRef, useEffect, useMemo, isValidElement, cloneElement } from 'react'
import { ArrowUp, ArrowLeft, Square, Upload, Undo2, Bookmark, Maximize2, Minimize2, ChevronLeft, ChevronRight, Mic, Home, ArrowUpRight, ArrowUpLeft, Waypoints, Sparkles, X, AlertCircle, RefreshCw, Check, GitBranch, Scale } from 'lucide-react'
import { useOnceFlag } from '../lib/onceFlags'
import {
  connectKind,
  driftLabelsFor,
  isDriftScaffoldText,
  isDriftOpenerText,
} from '../lib/driftPanel'
import type { AncestryEntry, Target } from '../types/chat'
import { normalizeTerm, type TermOccurrence } from '../lib/termIndex'
import { getDriftSuggestions } from '../services/gemini'
import { resolveChallengerTarget, challengerOptions } from '../lib/challenger'
import ChallengerPicker from './ChallengerPicker'
import { useDriftMessageStream } from '../hooks/useDriftMessageStream'
import { useDriftPanelActions } from '../hooks/useDriftPanelActions'
import { useConnectThreads } from '../hooks/useConnectThreads'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'
import type { AISettings } from './Settings'
import { getTextDirection, getRTLClassName } from '../utils/rtl'
import { useVoiceInput } from '../hooks/useVoiceInput'
import { Stagger, staggerChild } from './motion'
import { motion } from 'framer-motion'
import ResizeHandle from './ResizeHandle'

export interface Message {
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
  onPushToMain?: (messages: Message[], selectedText: string, sourceMessageId: string, wasSavedAsChat: boolean, userQuestion?: string, driftChatId?: string, templateType?: 'simplify' | 'research' | 'connect' | 'challenge') => void
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
  /** Desktop drag-to-resize: explicit panel width (px). Undefined on mobile (full-screen sheet). */
  width?: number
  /** Desktop drag-to-resize: fires on every pointer move during a drag, with the pointer's viewport X. */
  onResize?: (clientX: number) => void
  onResizeStart?: () => void
  onResizeEnd?: () => void
  /** True while a panel is being dragged — suppresses the width transition. */
  resizing?: boolean
  /** Breadcrumb trail from the root (main chat) up to (but not including) this drift. */
  ancestry?: AncestryEntry[]
  /** Called when the user taps a breadcrumb item to navigate back. Index 0 = main chat. */
  onNavigateToBreadcrumb?: (index: number) => void
  /** Optional template type for one-tap workflow drifts. */
  templateType?: 'simplify' | 'research' | 'connect' | 'challenge'
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
  onSwitchLens?: (template: 'simplify' | 'research' | 'connect' | 'challenge' | undefined) => void
  /** Persist the user's chosen Challenge challenger model (first-tap picker). */
  onSetChallenger?: (target: Target) => void
  /** Open model settings so the user can add a second model for cross-model Challenge. */
  onOpenModelSettings?: () => void
  /** Lens keys ('drift'|'simplify'|'research'|'connect'|'challenge') that already have
   *  generated content for this term — marked in the "View as" bar so the user can tell
   *  which lenses are instant (already explored) vs. which would fire a fresh API call. */
  exploredLenses?: Set<string>
}

export interface SiblingDrift {
  selectedText: string
  driftChatId: string
  sourceMessageId: string
  templateType?: 'simplify' | 'research' | 'connect' | 'challenge'
}

export default function DriftPanel({
  isOpen,
  width,
  onResize,
  onResizeStart,
  onResizeEnd,
  resizing,
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
  siblingDrifts,
  currentDriftChatId,
  onNavigateToSibling,
  onSwitchLens,
  exploredLenses,
  onSetChallenger,
  onOpenModelSettings,
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
  const [, setHoveredMessageId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // When a drift is re-opened from the map ("Open this drift"), land on the user's
  // question (the anchor) instead of the bottom of the answer — so it opens exactly
  // where the thought began, with no scroll-hunting. Armed on a restored open,
  // consumed by the anchor effect (and it suppresses the one-shot scroll-to-bottom).
  const anchorOnOpenRef = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const siblingStripRef = useRef<HTMLDivElement>(null)
  const breadcrumbScrollRef = useRef<HTMLDivElement>(null)
  // Click-and-drag horizontal scroll for the sibling term strip. `dragged` lets a
  // drag suppress the chip's click so dragging never accidentally switches drifts.
  const stripDrag = useRef({ active: false, startX: 0, startScroll: 0, dragged: false })
  const voiceInput = useVoiceInput((transcript) => {
    setMessage((prev) => (prev ? prev + ' ' : '') + transcript)
  })
  const [isExpanded, setIsExpanded] = useState(false)
  const [showExpandHint, setShowExpandHint] = useState(false)
  // First-run hint for the lens switcher — shown once, dismissed on first use.
  const [seenLensHint, markLensHint] = useOnceFlag('lens-bar')
  // The driftChatId the live `driftOnlyMessages` belong to. Updated synchronously
  // by the init effect when a thread loads. The persistence effect gates on this
  // so that during a term switch — where driftOnlyMessages still holds the OLD
  // thread but driftChatId has already flipped — the old conversation is never
  // written under the new thread's key (which would lose it on return: Bug 5).
  const messagesThreadRef = useRef<string | undefined>(driftChatId)
  // `isComparing` was only read by the removed multi-model Compare button; the
  // stream hook still needs the setter, so keep the setter and drop the binding.
  const [, setIsComparing] = useState(false)
  /** Tracks whether the auto-send for the current template drift has already fired. */
  const autoSentRef = useRef(false)
  /** Cross-model Challenge: whether we've already shown the challenger picker for
   *  this drift (so cancelling falls through to a same-model challenge, no nagging). */
  const challengerPromptedRef = useRef(false)
  const [challengerPickerOpen, setChallengerPickerOpen] = useState(false)
  const [driftSuggestions, setDriftSuggestions] = useState<string[]>([])
  /** Per-message AI-suggested highlight phrases (dotted underline, click to ask) */
  const [msgHighlights, setMsgHighlights] = useState<Map<string, string[]>>(new Map())

  // Localize the drift scaffolding to the chat's language (sampled from the term +
  // recent parent context), so the opener and "Simplify this"/etc. match Hebrew chats.
  const driftLabels = useMemo(
    () => driftLabelsFor(`${selectedText} ${(contextMessages ?? []).slice(-3).map(m => m.text).join(' ')}`.slice(0, 400)),
    [selectedText, contextMessages]
  )

  // Cross-model Challenge: the challenger is the *main* model's counterpart — a
  // different model the user picks once (and edits in Settings). resolveChallengerTarget
  // returns null when none is set / it collapsed onto main / its preset is gone.
  const mainKey = selectedTargets?.[0]?.key
  const challenger = useMemo(
    () => resolveChallengerTarget(aiSettings.challengerModel, aiSettings.modelPresets, mainKey),
    [aiSettings.challengerModel, aiSettings.modelPresets, mainKey],
  )
  const challengerChoices = useMemo(
    () => challengerOptions(aiSettings.modelPresets, mainKey),
    [aiSettings.modelPresets, mainKey],
  )

  // Connect-mode logic (chips, bridge questions, visited-answer cache).
  const {
    connectCards,
    connectQuestion,
    setConnectQuestion,
    connectVisitedVersion,
    connectAnswersRef,
    bridgeQuestion,
    openConnectThread,
    initConnectState,
  } = useConnectThreads({
    isOpen,
    templateType,
    selectedText,
    driftLabels,
    driftOnlyMessages,
    isTyping,
    initialConnectQuestion,
    initialConnectCards,
    initialConnectAnswers,
    onConnectStateChange,
    onConnectAnswerSaved,
    setMessages,
    setDriftOnlyMessages,
    autoSentRef,
  })

  // Drift conversation send / stream pipeline (owns the abort controllers).
  const { sendMessage, retryLastMessage, stopGeneration } = useDriftMessageStream({
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
  })

  // Drift panel push/save action layer (owns the push/save state cluster).
  const {
    pushedToMain,
    savedAsChat,
    savedMessageIds,
    isPushing,
    handlePushSingleMessage,
    handleToggleSaveMessage,
    handleSaveAsChat,
    handlePushToMain,
    resetPushSaveState,
    loadSavedMessageIds,
  } = useDriftPanelActions({
    driftOnlyMessages,
    selectedText,
    sourceMessageId,
    parentChatId,
    driftChatId,
    templateType,
    onPushToMain,
    onSaveAsChat,
    onUpdatePushedDriftSaveStatus,
    onUndoPushToMain,
    onUndoSaveAsChat,
    onSnippetCountUpdate,
    onClose,
  })

  // Initialize Drift with existing messages or system message
  useEffect(() => {
    if (isOpen) {
      // The messages this effect is about to set belong to THIS thread. Stamping
      // it synchronously means the persistence effect (which fires after the
      // queued setDriftOnlyMessages commits) saves under the correct key, and any
      // stale-render fire for the previous thread is gated out.
      messagesThreadRef.current = driftChatId

      // Reset auto-send guard for each new open
      autoSentRef.current = false
      challengerPromptedRef.current = false

      // Check if we have existing messages for this drift
      if (existingMessages && existingMessages.length > 0) {
        // Restore the existing conversation — template already fired for this drift
        autoSentRef.current = true
        // Re-opening an explored drift: open at the question anchor, not the bottom.
        anchorOnOpenRef.current = true
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

      // Restore or reset Connect state (also arms the stale-card-parse skip).
      initConnectState()

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
      resetPushSaveState()

      // Load saved message IDs for this drift
      loadSavedMessageIds()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedText, existingMessages, templateType, driftChatId])

  // Auto-send initial message for template drifts (fires once per open, 400ms after panel opens)
  useEffect(() => {
    if (!isOpen || !templateType || autoSentRef.current) return
    // Only fire when the panel has exactly the system message (fresh drift, not restored)
    if (messages.length !== 1 || !messages[0]?.id?.startsWith('drift-system-')) return

    // Cross-model Challenge gate: the first time, open the picker before the
    // critique streams — even when no second model exists yet. With one model the
    // picker shows its empty state, whose "Add a model" button routes to Settings,
    // so the Challenge tap itself is the entry point for setting up a challenger.
    // Cancelling falls through to a same-model challenge (graceful, no dead-end).
    if (templateType === 'challenge') {
      if (challengerPickerOpen) return
      if (!challenger && !challengerPromptedRef.current) {
        challengerPromptedRef.current = true
        setChallengerPickerOpen(true)
        return
      }
    }

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
  }, [isOpen, templateType, messages.length, connectQuestion, challenger?.key, challengerChoices.length, challengerPickerOpen])

  // connectAnswersRef is cleared in the init effect on each new open;
  // this separate effect was removed because it fired after init and wiped restored Connect state.

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
    // A restored open anchors on the question instead (handled below) — don't
    // yank the view to the bottom on that first render.
    if (anchorOnOpenRef.current) return
    scrollToBottom()
  }, [messages])

  // Restored-open anchor: scroll the user's question to the top of the thread so
  // the drift opens exactly where it began (no scroll-hunting through the answer).
  useEffect(() => {
    if (!isOpen || !anchorOnOpenRef.current || driftOnlyMessages.length === 0) return
    const firstQuestion = driftOnlyMessages.find(m => m.isUser && !m.id?.startsWith('drift-system-'))
    requestAnimationFrame(() => setTimeout(() => {
      const el = firstQuestion
        ? document.querySelector(`[data-drift-message-id="${firstQuestion.id}"]`)
        : null
      if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' })
      anchorOnOpenRef.current = false
    }, 80))
  }, [isOpen, driftOnlyMessages])

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

  return (
    <>
    <div
      className={`
      fixed inset-0 z-30
      lg:inset-auto lg:top-0 lg:right-0 lg:h-full lg:z-20
      transition-all duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : 'translate-x-full'}
    `}
      style={{ width, transition: resizing ? 'none' : undefined }}
    >
      {/* Drag to resize (desktop) */}
      {onResize && (
        <ResizeHandle
          edge="left"
          onResize={onResize}
          onResizeStart={onResizeStart}
          onResizeEnd={onResizeEnd}
        />
      )}
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
        <header className="relative z-10 border-b border-dark-border bg-dark-surface/95 backdrop-blur-xl pt-safe">
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
              : templateType === 'research' ? 'Deep dive'
              : templateType === 'challenge' ? 'Second opinion'
              : null

            return (
              <div className="px-1 flex items-center gap-0.5 min-h-[52px]">
                {/* Back / Close */}
                <button
                  onClick={handleBack}
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors shrink-0"
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
                      className="text-[15px] font-semibold text-text-primary truncate leading-snug select-none"
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
                            className="flex items-center gap-0.5 text-[11px] text-text-muted hover:text-text-secondary transition-colors max-w-[110px]"
                            title={entry.isMainChat ? entry.label : entry.selectedText}
                          >
                            {entry.isMainChat && <Home className="w-2.5 h-2.5 shrink-0 mr-0.5" />}
                            <span className="truncate leading-none">{entry.label}</span>
                          </button>
                          <span className="text-[10px] text-text-muted mx-0.5 select-none">›</span>
                        </span>
                      ))}
                      <span className="text-[11px] text-text-secondary font-medium leading-none truncate max-w-[110px]">{selectedText}</span>
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
                        ${pushedToMain ? 'text-accent-pink bg-accent-pink/[0.1]' : 'text-text-muted hover:text-text-primary hover:bg-white/[0.07]'}`}
                      title={isPushing ? 'Pushing…' : pushedToMain ? 'Undo push to main' : 'Push to main chat'}
                    >
                      {pushedToMain ? <Undo2 className="w-[17px] h-[17px]" /> : <Upload className="w-[17px] h-[17px]" />}
                    </button>

                    <button
                      onClick={handleSaveAsChat}
                      className={`p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full transition-all duration-150 active:scale-90 shrink-0
                        ${savedAsChat ? 'text-cyan-300 bg-cyan-500/[0.1]' : 'text-text-muted hover:text-text-primary hover:bg-white/[0.07]'}`}
                      title={savedAsChat ? 'Undo save as chat' : 'Save as chat'}
                    >
                      {savedAsChat ? <Undo2 className="w-[17px] h-[17px]" /> : <Bookmark className="w-[17px] h-[17px]" />}
                    </button>
                  </>
                )}

                {/* Expand — always anchored right */}
                <button
                  onClick={() => setIsExpanded(v => !v)}
                  className="p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full text-text-muted hover:text-text-secondary hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors shrink-0"
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? <Minimize2 className="w-[17px] h-[17px]" /> : <Maximize2 className={`w-[17px] h-[17px] ${showExpandHint ? 'text-accent-pink' : ''}`} />}
                </button>
              </div>
            )
          })()}
        </header>

        {/* Push confirmation — on mobile the panel covers the whole screen, so a
            corner toast is easy to miss. This makes "it landed in main" explicit
            and gives a one-tap "View" that closes the panel and reveals where the
            content was added. */}
        {pushedToMain && !isPushing && (
          <button
            onClick={() => onClose(driftOnlyMessages)}
            className="flex items-center gap-2 px-3 py-2 w-full text-left shrink-0
                       border-b border-accent-violet/20 bg-accent-violet/[0.07]
                       hover:bg-accent-violet/[0.11] transition-colors group animate-fade-in"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent-violet/20 shrink-0">
              <Check className="w-3 h-3 text-accent-violet" />
            </span>
            <span className="text-[12.5px] text-text-secondary flex-1 leading-snug">Added to the main thread</span>
            <span className="text-[12px] font-semibold text-accent-violet group-hover:text-accent-pink inline-flex items-center gap-0.5 shrink-0 transition-colors">
              View <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </button>
        )}

        {/* "View as" lens switcher — re-view the same term through a different lens
            without returning to the chat. Each lens keeps its own thread. Hidden in
            Connect's bridge sub-mode (you're inside an answer there). */}
        {onSwitchLens && !(templateType === 'connect' && connectQuestion) && (
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-dark-border bg-white/[0.015] shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <span className="text-[10px] uppercase tracking-wider text-text-muted/50 mr-1 shrink-0">View as</span>
            {([
              { tpl: undefined, label: 'Drift', key: 'drift' },
              { tpl: 'simplify', label: 'Simplify', key: 'simplify' },
              { tpl: 'research', label: 'Deep dive', key: 'research' },
              { tpl: 'connect', label: 'Connect', key: 'connect' },
              { tpl: 'challenge', label: '2nd opinion', key: 'challenge' },
            ] as const).map((l) => {
              const active = (l.tpl ?? undefined) === (templateType ?? undefined)
              // Already-explored lenses (content exists → instant, no API call). The
              // active lens is obviously explored; mark the OTHERS so the user knows
              // which taps are free vs. which would fire a fresh generation.
              const explored = !active && !!exploredLenses?.has(l.key)
              // Each lens's signature hue — used filled when active, as a small dot
              // when explored-but-inactive. Connect cyan matches the Connections page.
              const activeTint: Record<string, string> = {
                drift:     'bg-accent-violet/20 text-accent-violet border-accent-violet/40',
                simplify:  'bg-amber-500/15 text-amber-500 border-amber-500/40',
                research:  'bg-blue-500/15 text-blue-500 border-blue-500/40',
                connect:   'bg-accent-discovery/15 text-accent-discovery border-accent-discovery/45',
                challenge: 'bg-rose-500/15 text-rose-500 border-rose-500/40',
              }
              const dotTint: Record<string, string> = {
                drift:     'bg-accent-violet',
                simplify:  'bg-amber-500',
                research:  'bg-blue-500',
                connect:   'bg-accent-discovery',
                challenge: 'bg-rose-500',
              }
              return (
                <button
                  key={l.label}
                  onClick={() => { markLensHint(); if (!active) onSwitchLens(l.tpl) }}
                  title={explored ? `${l.label} — already explored` : undefined}
                  className={`shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-2.5 py-1 rounded-full text-[11px] font-medium leading-none border transition-colors
                    ${active
                      ? activeTint[l.key]
                      : explored
                        ? 'text-text-secondary border-dark-border/80 hover:text-text-primary'
                        : 'text-text-muted border-dark-border hover:text-text-primary hover:border-dark-border'}`}
                >
                  {explored && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotTint[l.key]}`} />}
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
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-dark-border bg-white/[0.015] shrink-0">
              <button
                onClick={() => prev && onNavigateToSibling(prev)}
                disabled={!prev}
                className="p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-text-muted hover:text-accent-violet hover:bg-accent-violet/[0.1] disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-text-muted transition-colors shrink-0"
                title={prev ? `Previous: "${prev.selectedText}"` : 'No previous term'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div
                ref={siblingStripRef}
                className="flex-1 flex items-center gap-1 overflow-x-auto cursor-grab active:cursor-grabbing select-none [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: 'none' }}
                onPointerDown={(e) => {
                  const el = siblingStripRef.current
                  if (!el) return
                  stripDrag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, dragged: false }
                }}
                onPointerMove={(e) => {
                  const el = siblingStripRef.current
                  const d = stripDrag.current
                  if (!el || !d.active) return
                  const dx = e.clientX - d.startX
                  if (Math.abs(dx) > 4) {
                    d.dragged = true
                    el.setPointerCapture?.(e.pointerId)
                  }
                  el.scrollLeft = d.startScroll - dx
                }}
                onPointerUp={() => { stripDrag.current.active = false }}
                onPointerCancel={() => { stripDrag.current.active = false }}
              >
                {siblingDrifts.map((sib) => {
                  const isCurrent = sib.driftChatId === currentDriftChatId
                  return (
                    <button
                      key={sib.driftChatId}
                      data-sibling-active={isCurrent}
                      onClick={() => { if (stripDrag.current.dragged) { stripDrag.current.dragged = false; return } if (!isCurrent) onNavigateToSibling(sib) }}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium leading-none truncate max-w-[140px] transition-colors
                        ${isCurrent
                          ? 'bg-accent-violet/[0.18] text-accent-violet border border-accent-violet/40'
                          : 'text-text-muted border border-dark-border hover:text-text-primary hover:border-dark-border hover:bg-white/[0.04]'}`}
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
                className="p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-text-muted hover:text-accent-violet hover:bg-accent-violet/[0.1] disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-text-muted transition-colors shrink-0"
                title={next ? `Next: "${next.selectedText}"` : 'No next term'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )
        })()}

        {/* Connect view — chips list or inline chat */}
        {templateType === 'connect' && !connectQuestion && (
          <div className="flex-1 overflow-y-auto px-4 pt-4 custom-scrollbar" style={{ paddingBottom: 'calc(8rem + var(--kb-h, 0px))' }}>
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
              // Your own prior explorations near this term — the most meaningful
              // connections are the ones you already made. Rendered as violet
              // "You explored" edges on the same rail; tapping one reopens that
              // drift directly (no API call). Same-term lens siblings are
              // excluded — the sibling strip above already covers those.
              const curTerm = normalizeTerm(selectedText)
              const personal = (relatedDrifts ?? [])
                .filter(o => normalizeTerm(o.term) !== curTerm)
                .slice(0, 3)
              if (edges.length === 0 && personal.length === 0) {
                return <p className="text-[13px] text-text-muted/60 text-center mt-8">No connections found.</p>
              }
              const dir = getTextDirection(selectedText)
              const Arrow = dir === 'rtl' ? ArrowUpLeft : ArrowUpRight
              const anyVisited = edges.some(e => connectAnswersRef.current.has(bridgeQuestion(e.concept)))
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
                      {/* Personal edges first — connections to the user's own
                          prior drifts. Violet (the drift brand hue) marks
                          "yours" against the AI edges' per-kind colors. */}
                      {personal.map((occ) => (
                        <motion.button
                          key={`personal-${occ.driftChatId}`}
                          variants={staggerChild}
                          onClick={() => onOpenRelatedDrift?.(occ)}
                          className="group relative flex items-center gap-3 w-full text-start px-3 py-2.5 rounded-xl border active:scale-[0.98] transition-all duration-150 min-h-[54px]"
                          style={{
                            borderColor: 'rgba(168,85,247,0.40)',
                            background: 'rgba(168,85,247,0.08)',
                          }}
                          title={`Reopen your drift: "${occ.chatTitle}"`}
                        >
                          <span
                            className="absolute top-1/2 -translate-y-1/2 -start-5 w-5 h-px"
                            style={{ background: 'rgba(168,85,247,0.45)' }}
                            aria-hidden
                          />
                          <span
                            className="absolute top-1/2 -translate-y-1/2 -start-[23px] w-1.5 h-1.5 rounded-full transition-transform duration-200 group-hover:scale-150"
                            style={{ background: '#a855f7', boxShadow: '0 0 8px rgba(168,85,247,0.6)' }}
                            aria-hidden
                          />
                          <span
                            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: 'rgba(168,85,247,0.10)', color: '#a855f7' }}
                          >
                            <GitBranch className="w-[18px] h-[18px]" strokeWidth={2} />
                          </span>
                          <div className="flex-1 min-w-0" dir={getTextDirection(occ.term)}>
                            <span className="block text-[10px] tracking-wider leading-none mb-1 truncate" style={{ color: 'rgba(168,85,247,0.85)' }}>You explored</span>
                            <span className="block text-[14px] text-text-secondary group-hover:text-text-primary leading-snug transition-colors">{occ.term}</span>
                          </div>
                          <Arrow className="w-4 h-4 text-text-muted/40 group-hover:text-text-secondary shrink-0 transition-colors" />
                        </motion.button>
                      ))}
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
                              // Neutral, theme-aware surface for unvisited connections
                              // (was a fixed dark grey that looked wrong on the light canvas).
                              borderColor: visited ? `${k.color}66` : 'rgb(var(--color-border))',
                              background: visited ? `${k.color}14` : 'rgb(var(--color-elevated))',
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
                  {/* Footer: first-visit hint. (Color legend removed — each card
                      already names its relationship in words + shows a tinted icon.) */}
                  {!anyVisited && (
                    <p className="mt-4 ps-5 text-[11px] text-text-muted/50 leading-snug">{driftLabels.connectHint}</p>
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
                  className="w-full bg-dark-elevated text-text-primary text-[13px] rounded-2xl px-4 py-3 pr-12 border border-dark-border focus:outline-none focus:border-accent-violet/30 focus:shadow-[0_0_0_3px_rgba(168,85,247,0.08)] placeholder:text-text-muted/50 transition-all duration-150 min-h-[46px]"
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
              // Template scaffold ("Second opinion on this: …" etc.) is immediately
              // duplicated by the auto-sent user bubble — render only the bubble.
              if (msg.id?.startsWith('drift-system-') && isDriftScaffoldText(msg.text) && !isDriftOpenerText(msg.text)) return null
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
                          <div className="relative rounded-2xl px-3.5 pt-6 pb-3 bg-dark-elevated border border-dark-border text-text-secondary min-h-[40px]">
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
                        <span className="flex items-center gap-1 mb-1 text-[10px] text-text-muted/60 pl-1">
                          {templateType === 'challenge' && <Scale className="w-2.5 h-2.5 text-rose-400/70" />}
                          {templateType === 'challenge' ? `Second opinion from ${msg.modelTag}` : msg.modelTag}
                        </span>
                      )}
                      <div className="px-1 pb-1">
                        <div className={`text-sm text-text-secondary leading-relaxed ${getRTLClassName(msg.text)} ${streamingMsgId === msg.id ? 'drift-text-shimmer' : ''}`} dir={getTextDirection(msg.text)}>
                          <ReactMarkdown
                            className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none prose-headings:text-text-primary prose-headings:font-semibold prose-headings:mb-2 prose-headings:mt-3 prose-p:text-text-secondary prose-p:mb-2 prose-strong:text-text-primary prose-strong:font-semibold prose-ul:my-2 prose-ul:space-y-1 prose-li:text-text-secondary prose-li:ml-4 prose-code:text-accent-violet prose-code:bg-dark-bg/50 prose-pre:bg-dark-bg prose-pre:border prose-pre:border-dark-border/50 prose-pre:rounded-lg prose-pre:p-3 prose-blockquote:border-l-accent-violet prose-blockquote:text-text-muted prose-table:w-full prose-table:border-collapse prose-table:overflow-hidden prose-table:rounded-lg prose-thead:bg-dark-elevated/50 prose-thead:border-b prose-thead:border-dark-border/50 prose-th:text-text-primary prose-th:font-semibold prose-th:px-2 prose-th:py-1.5 prose-th:text-left prose-th:text-xs prose-td:text-text-secondary prose-td:px-2 prose-td:py-1.5 prose-td:border-b prose-td:border-dark-border/30 prose-td:text-xs prose-tr:hover:bg-dark-elevated/20"
                            remarkPlugins={[remarkGfm]}
                            components={(() => {
                              const hl = msgHighlights.get(msg.id) ?? []
                              // Each suggested term is underlined only on its FIRST occurrence in
                              // the message — tapping any repeat asks the same thing, so marking
                              // every mention is noise. Mirrors the main chat: `seen` dedupes within
                              // a block, `priorText` (the source before this block) dedupes across
                              // blocks. Render-pure (StrictMode double-invokes), so both read stable
                              // data — `seen` is fresh per block, `priorText` is sliced from source.
                              const src = msg.text.replace(/<br>/g, '\n').replace(/<br\/>/g, '\n')
                                .replace(/^[ \t]{0,3}#{1,6}[^\n]*/gm, (m) => ' '.repeat(m.length))
                              const injectHL = (text: string, seen: Set<string>, priorText: string): React.ReactNode => {
                                if (!hl.length) return text
                                const matches: Array<{ start: number; end: number; phrase: string }> = []
                                hl.forEach(phrase => {
                                  if (seen.has(phrase) || priorText.includes(phrase)) return
                                  const pos = text.indexOf(phrase)
                                  if (pos !== -1) matches.push({ start: pos, end: pos + phrase.length, phrase })
                                })
                                if (!matches.length) return text
                                matches.sort((a, b) => a.start - b.start)
                                const out: React.ReactNode[] = []
                                let cursor = 0
                                for (const m of matches) {
                                  if (m.start < cursor || seen.has(m.phrase) || priorText.includes(m.phrase)) continue
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
                                  seen.add(m.phrase)
                                  cursor = m.end
                                }
                                if (cursor < text.length) out.push(text.slice(cursor))
                                return out
                              }
                              const walkHL = (node: React.ReactNode, seen: Set<string>, priorText: string): React.ReactNode => {
                                if (typeof node === 'string') return injectHL(node, seen, priorText)
                                if (typeof node === 'number' || node == null || node === false) return node
                                if (Array.isArray(node)) return node.map((n, i) => <span key={i}>{walkHL(n, seen, priorText)}</span>)
                                if (isValidElement(node)) {
                                  const props: any = (node as any).props || {}
                                  if ('children' in props) return cloneElement(node as any, { ...props, children: walkHL(props.children, seen, priorText) })
                                  return node
                                }
                                return null
                              }
                              const proc = (children: any, node?: any) => {
                                if (!hl.length) return children
                                const priorText = src.slice(0, node?.position?.start?.offset ?? 0)
                                return walkHL(children, new Set<string>(), priorText)
                              }
                              return {
                                pre: ({ children }: any) => <CodeBlock>{children}</CodeBlock>,
                                p: ({ node, children }: any) => <p className="mb-2">{proc(children, node)}</p>,
                                li: ({ node, children }: any) => <li>{proc(children, node)}</li>,
                                th: ({ node, children }: any) => <th>{proc(children, node)}</th>,
                                td: ({ node, children }: any) => <td>{proc(children, node)}</td>,
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
                  dir="auto"
                  className="text-start px-3 py-2 rounded-xl text-[12px] text-text-secondary
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
                    border border-dark-border
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
                      className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 border border-dark-border text-text-muted hover:text-text-primary transition-all active:scale-90"
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
    <ChallengerPicker
      open={challengerPickerOpen}
      options={challengerChoices}
      current={challenger}
      onPick={(t) => { onSetChallenger?.(t); setChallengerPickerOpen(false) }}
      onClose={() => setChallengerPickerOpen(false)}
      onAddModel={onOpenModelSettings ? () => {
        // The user chose to set up a challenger — don't fire a throwaway same-model
        // challenge behind their back. Suppress this open's auto-send; re-tapping
        // Challenge after adding a model reopens the picker with the new option.
        autoSentRef.current = true
        setChallengerPickerOpen(false)
        onOpenModelSettings()
      } : undefined}
    />
    </>
  )
}
