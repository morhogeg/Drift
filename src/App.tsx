import { useState, useRef, useEffect, useMemo, cloneElement, isValidElement } from 'react'
import { Menu, Plus, Search, ChevronLeft, ChevronRight, Square, ArrowDown, ArrowUp, ArrowUpRight, Bookmark, Edit3, Copy, Trash2, Pin, PinOff, Star, StarOff, ExternalLink, Check, ChevronDown, Settings as SettingsIcon, Save, X, LogOut, User, GitBranch, Home, Mic, CornerUpLeft, MousePointerClick } from 'lucide-react'
import { Pressable } from './components/motion'
import { sendMessageToOpenRouter, checkOpenRouterConnection, type ChatMessage as OpenRouterMessage, OPENROUTER_MODELS } from './services/openrouter'
import { sendMessageToOllama, checkOllamaConnection, type ChatMessage as OllamaMessage } from './services/ollama'
import { sendMessageToGemini, checkGeminiConnection, getSuggestedHighlights, synthesizeDrifts } from './services/gemini'
import { checkDummyConnection, sendMessageToDummy } from './services/dummyAI'
import DriftPanel from './components/DriftPanel'
import DriftKnowledgeGraph from './components/DriftKnowledgeGraph'
import ErrorBoundary from './components/ErrorBoundary'
import SelectionTooltip from './components/SelectionTooltip'
import SnippetGallery from './components/SnippetGallery'
import ContextMenu from './components/ContextMenu'
import Settings, { type AISettings } from './components/Settings'
import { Login } from './components/Login'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { snippetStorage } from './services/snippetStorage'
import { settingsStorage } from './services/settingsStorage'
import { getTextDirection, getRTLClassName } from './utils/rtl'
import HeaderControls from './components/HeaderControls'
import MultiModelCarousel from './components/MultiModelCarousel'
import ModelPillRow from './components/ModelPillRow'
import ModelPickerSheet from './components/ModelPickerSheet'
import SearchModal from './components/SearchModal'
import AddModelSheet from './components/AddModelSheet'
import { registerGlobalNavigationHandlers } from './components/conversation/ConversationScroller'
import { indexListMessage, getAnchorId, matchListItemsInText } from './services/lists/index'
import InlineListLink from './components/lists/InlineListLink'
import { buildTermIndex, findRelatedDrifts, type TermOccurrence } from '@/lib/termIndex'
import { haptics } from '@/lib/haptics'
import { useChatStore } from '@/store/chatStore'
import { useDriftStore } from '@/store/driftStore'
import { useModelStore, DEFAULT_TARGET } from '@/store/modelStore'
import { useUIStore } from '@/store/uiStore'
import type { Message, ChatSession, DriftContext } from '@/types/chat'
import { toast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'

function App() {
  // ── Stores ──────────────────────────────────────────────────────────────────
  const chatStore = useChatStore()
  const driftStore = useDriftStore()
  const modelStore = useModelStore()
  const uiStore = useUIStore()

  // ── Local state (not in stores) ─────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const [apiConnected, setApiConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    const settings = settingsStorage.get()
    if (!settings.openRouterApiKey && import.meta.env.VITE_OPENROUTER_API_KEY) {
      settings.openRouterApiKey = import.meta.env.VITE_OPENROUTER_API_KEY
    }
    return settings
  })

  // Keyboard visibility (iOS — used to suppress safe-area padding when keyboard is up)
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  // Broadcast / canvas transient state
  const [activeBroadcastGroupId, setActiveBroadcastGroupId] = useState<string | null>(null)
  const [, setContinuedModelByGroup] = useState<Record<string, string | null>>({})
  const [activeStrandId, setActiveStrandId] = useState<string | null>(null)
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null)
  const [continueFromMessageId, setContinueFromMessageId] = useState<string | null>(null)
  // Drift just promoted to the main thread — drives a one-time settle-in arrival
  // animation (cleared shortly after, so reloads/scroll don't re-animate it).
  const [justPromotedChatId, setJustPromotedChatId] = useState<string | null>(null)
  const justPromotedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevContinueTargetsRef = useRef<typeof modelStore.selectedTargets | null>(null)

  // Mobile carousel + model picker state
  const [activeCarouselModel, setActiveCarouselModel] = useState<string | null>(null)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [addModelSheetOpen, setAddModelSheetOpen] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Detect touch/mobile — canvas view is desktop-only (hidden md:block)
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  // Local derived UI
  const [contextLinkVersion, setContextLinkVersion] = useState(0)

  // ── Coach mark (first AI message) ───────────────────────────────────────────
  const [coachMarkSeen, setCoachMarkSeen] = useState(
    () => localStorage.getItem('driftCoachMarkSeen') === 'true'
  )
  const [coachMarkActive, setCoachMarkActive] = useState(false)
  const coachMarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Last opened drift (for one-tap "reopen") ────────────────────────────────
  // Remembers the most recently opened drift in this session so the user can
  // jump back into their last branch from anywhere — they never lose their place.
  const [lastDrift, setLastDrift] = useState<
    { driftChatId: string; selectedText: string; parentChatId: string; sourceMessageId: string } | null
  >(null)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mainScrollPosition = useRef<number>(0)
  // Tracks the live Connect state inside DriftPanel so it can be saved into ancestry entries
  const connectStateRef = useRef<{ question: string | null; cards: string[] | null }>({ question: null, cards: null })
  // Persists generated Connect chips per driftChatId so re-opening a Connect drift shows chips instantly
  const connectCardsCache = useRef<Map<string, string[]>>(new Map())
  // Per-driftChatId cache of visited-bridge answers — survives lens switches so
  // returning to a Connect view keeps its "you tapped this" indicators.
  const connectAnswersCache = useRef<Map<string, Record<string, Message[]>>>(new Map())
  // Per-term lens registry: baseKey ("msgId::term") → (template → driftChatId).
  // Lets the in-panel "View as" switcher keep a separate thread per lens and
  // return to the original one, without touching the inline-link / map model.
  const lensRegistryRef = useRef<Map<string, Map<string, string>>>(new Map())
  const abortControllerRef = useRef<AbortController | null>(null)
  const userHasScrolled = useRef(false)
  const activeMessageIdRef = useRef<string | null>(null)
  const listIndexedMessageIdsRef = useRef<Set<string>>(new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const voiceInput = useVoiceInput((transcript) => {
    chatStore.setInputText((chatStore.inputText ? chatStore.inputText + ' ' : '') + transcript)
  })

  // Show toast when voice recognition errors (e.g. permission denied)
  useEffect(() => {
    if (voiceInput.error) {
      const msg = voiceInput.error === 'not-allowed'
        ? 'Microphone access denied. Please allow it in Settings.'
        : `Voice error: ${voiceInput.error}`
      toast.error(msg)
    }
  }, [voiceInput.error])

  // ── Convenience aliases ─────────────────────────────────────────────────────
  const messages = chatStore.messages
  const chatHistory = chatStore.chatHistory
  const activeChatId = chatStore.activeChatId
  const isTyping = chatStore.isTyping
  const streamingResponse = chatStore.streamingResponse
  const streamingMessageId = chatStore.streamingMessageId
  const message = chatStore.inputText
  const searchQuery = chatStore.searchQuery
  const selectedTargets = modelStore.selectedTargets

  // Targets derived from enabled presets — drives ModelPickerSheet dynamic list
  const availableTargets = useMemo(() => {
    const presetTargets = (aiSettings.modelPresets || [])
      .filter((p) => p.enabled)
      .map((p) => ({ provider: p.provider as import('@/types/chat').Target['provider'], key: p.id, label: p.label }))
    // Always include Demo AI
    const demoTarget = { provider: 'dummy' as const, key: 'dummy-lite', label: 'Demo AI' }
    const hasDummy = presetTargets.some((t) => t.key === 'dummy-lite')
    return hasDummy ? presetTargets : [...presetTargets, demoTarget]
  }, [aiSettings.modelPresets])

  const totalDriftCount = useMemo(() => {
    if (!activeChatId || !chatHistory.length) return 0
    const findRoot = (id: string): string => {
      const c = chatHistory.find(x => x.id === id)
      if (!c?.metadata?.isDrift || !c.metadata.parentChatId) return id
      return findRoot(c.metadata.parentChatId)
    }
    const rootId = findRoot(activeChatId)
    let count = 0
    const queue = [rootId]
    const seen = new Set<string>()
    while (queue.length) {
      const id = queue.shift()!
      if (seen.has(id)) continue
      seen.add(id)
      chatHistory.forEach(c => {
        if (c.metadata?.parentChatId === id) {
          count++
          queue.push(c.id)
        }
      })
    }
    return count
  }, [activeChatId, chatHistory])

  const theme = uiStore.theme

  // Apply theme class to <html> on mount and when theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // ── iOS keyboard: instant input lift via keyboardWillShow ───────────────────
  useEffect(() => {
    let cleanupFns: Array<() => void> = []
    const setup = async () => {
      try {
        const { Keyboard } = await import('@capacitor/keyboard')
        const show = await Keyboard.addListener('keyboardWillShow', (info) => {
          document.documentElement.style.setProperty('--kb-h', `${info.keyboardHeight}px`)
          setKeyboardVisible(true)
          // Scroll to bottom so the last message stays visible
          setTimeout(() => {
            const c = document.querySelector('.chat-messages-container')
            if (c) c.scrollTop = c.scrollHeight
          }, 50)
        })
        const hide = await Keyboard.addListener('keyboardWillHide', () => {
          document.documentElement.style.setProperty('--kb-h', '0px')
          setKeyboardVisible(false)
        })
        cleanupFns = [() => show.remove(), () => hide.remove()]
      } catch {
        // Not running in Capacitor (web dev) — no-op
      }
    }
    setup()
    return () => cleanupFns.forEach(fn => fn())
  }, [])

  const sidebarOpen = uiStore.sidebarOpen
  const settingsOpen = uiStore.settingsOpen
  const knowledgeGraphOpen = uiStore.knowledgeGraphOpen
  const setKnowledgeGraphOpen = uiStore.setKnowledgeGraphOpen

  // ── Swipe gesture: left → open sidebar, right → close sidebar ───────────────
  const swipeHandlers = useSwipeGesture(
    () => uiStore.setSidebarOpen(true),   // swipe left → open
    () => uiStore.setSidebarOpen(false),  // swipe right → close
  )
  const galleryOpen = uiStore.galleryOpen

  const copiedMessageId = uiStore.copiedMessageId
  const savedMessageIds = uiStore.savedMessageIds
  const editingChatId = uiStore.editingChatId
  const editingTitle = uiStore.editingTitle
  const pinnedChats = uiStore.pinnedChats
  const starredChats = uiStore.starredChats
  const contextMenu = uiStore.contextMenu
  const showScrollButton = uiStore.showScrollButton
  const snippetCount = uiStore.snippetCount
  const userMenuOpen = uiStore.userMenuOpen
  const profileOpen = uiStore.profileOpen

  const driftOpen = driftStore.driftOpen
  const driftContext = driftStore.driftContext

  // ── Intelligence layer: cross-drift connection surfacing ─────────────────────
  // Index every prior drift by its term (cheap; reads only what's persisted).
  // Rebuilds when chat history changes — memoized so it's free on other renders.
  const termIndex = useMemo(() => buildTermIndex(chatHistory), [chatHistory])

  // Prior explorations of the term the user just marked — surfaced as the
  // "you explored this before" moment in the drift panel.
  const relatedDrifts = useMemo<TermOccurrence[]>(() => {
    const term = driftContext?.selectedText
    if (!driftOpen || !term) return []
    return findRelatedDrifts(termIndex, term, driftContext?.driftChatId)
  }, [driftOpen, driftContext?.selectedText, driftContext?.driftChatId, termIndex])

  // Navigate to a prior drift surfaced in the connection strip. Reuses the same
  // path the inline drift links use, so persisted/temp conversations restore.
  const handleOpenRelatedDrift = (occ: TermOccurrence) => {
    const existing = chatHistory.find(c => c.id === occ.driftChatId)?.messages
      ?? driftStore.getTempConversation(occ.driftChatId)
      ?? undefined
    handleStartDrift(occ.term, occ.parentChatId ?? activeChatId, occ.driftChatId, existing, occ.templateType)
  }

  // ── Lateral term-walking: sibling drifts ──────────────────────────────────────
  // The other terms that branch from the same parent as the open drift. Lets the
  // user walk sideways term→term without returning to the map. Resolved from the
  // parent's messages' driftInfos, in the order they were created.
  interface SiblingDrift { selectedText: string; driftChatId: string; sourceMessageId: string; templateType?: DriftContext['templateType'] }
  const siblingDrifts = useMemo<SiblingDrift[]>(() => {
    if (!driftOpen || !driftContext?.driftChatId) return []
    const ancestry = driftContext.ancestry ?? []
    const parentEntry = ancestry[ancestry.length - 1]
    const parentIsMain = !parentEntry || parentEntry.isMainChat
    const parentId = parentIsMain ? activeChatId : parentEntry.driftChatId
    const parentMessages = parentIsMain
      ? (chatHistory.find(c => c.id === activeChatId)?.messages ?? messages)
      : (driftStore.getTempConversation(parentId!) ?? chatHistory.find(c => c.id === parentId)?.messages ?? [])
    const out: SiblingDrift[] = []
    const seen = new Set<string>()
    for (const m of parentMessages) {
      if (!m.driftInfos) continue
      for (const d of m.driftInfos) {
        if (seen.has(d.driftChatId)) continue
        seen.add(d.driftChatId)
        out.push({ selectedText: d.selectedText, driftChatId: d.driftChatId, sourceMessageId: m.id, templateType: d.templateType })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driftOpen, driftContext?.driftChatId, driftContext?.ancestry, chatHistory, messages, activeChatId])

  // Open a sibling drift in place. Siblings share this drift's ancestry-to-parent,
  // so we reuse it verbatim and only swap the term/source/conversation.
  const navigateToSiblingDrift = (sib: SiblingDrift) => {
    if (sib.driftChatId === driftContext?.driftChatId) return
    haptics.impact('light')
    const ancestry = driftContext?.ancestry ?? [{
      isMainChat: true,
      label: chatHistory.find(c => c.id === activeChatId)?.title || 'Chat',
      selectedText: '', sourceMessageId: '', contextMessages: [],
    }]
    const parentEntry = ancestry[ancestry.length - 1]
    const parentIsMain = !parentEntry || parentEntry.isMainChat
    const parentId = parentIsMain ? activeChatId : parentEntry.driftChatId
    const parentMessages = parentIsMain
      ? (chatHistory.find(c => c.id === activeChatId)?.messages ?? messages)
      : (driftStore.getTempConversation(parentId!) ?? chatHistory.find(c => c.id === parentId)?.messages ?? [])
    const msgIdx = parentMessages.findIndex(m => m.id === sib.sourceMessageId)
    // Restore cached content for the sibling so re-opening never re-fetches.
    const restore = resolveDriftRestore(sib.driftChatId, sib.sourceMessageId, sib.selectedText, parentMessages)
    connectStateRef.current = { question: null, cards: null }
    driftStore.openDrift({
      selectedText: sib.selectedText,
      sourceMessageId: sib.sourceMessageId,
      contextMessages: msgIdx >= 0 ? parentMessages.slice(0, msgIdx + 1) : [],
      highlightMessageId: sib.sourceMessageId,
      driftChatId: sib.driftChatId,
      existingMessages: restore.existingMessages,
      templateType: restore.templateType ?? sib.templateType,
      connectCards: restore.connectCards,
      connectAnswers: restore.connectAnswers,
      ancestry,
    })
  }

  // ── View-as lens switcher ─────────────────────────────────────────────────────
  // Re-view the SAME term through a different lens (Drift / Simplify / Deep dive /
  // Connect) without going back to the chat. Each lens keeps its own thread; the
  // first lens (the one opened from chat) is preserved at its original id.
  const handleSwitchLens = (template: DriftContext['templateType']) => {
    const ctx = driftStore.driftContext
    if (!ctx?.driftChatId || !ctx.selectedText) return

    const baseKey = `${ctx.sourceMessageId}::${ctx.selectedText}`
    let reg = lensRegistryRef.current.get(baseKey)
    if (!reg) { reg = new Map(); lensRegistryRef.current.set(baseKey, reg) }

    const curTpl = ctx.templateType ?? 'drift'
    if (!reg.has(curTpl)) reg.set(curTpl, ctx.driftChatId)   // remember the current thread

    const tgtTpl = template ?? 'drift'
    if (tgtTpl === curTpl) return

    let tgtId = reg.get(tgtTpl)
    if (!tgtId) { tgtId = `${reg.get(curTpl)}__${tgtTpl}`; reg.set(tgtTpl, tgtId) }

    // Restore the target thread's Connect state so its map + visited-bridge
    // indicators come back exactly as the user left them.
    const di = (chatHistory.find(c => c.id === activeChatId)?.messages ?? messages)
      .flatMap(m => m.driftInfos ?? [])
      .find(d => d.driftChatId === tgtId)
    const tgtCards = connectCardsCache.current.get(tgtId) ?? di?.connectCards
    const tgtAnswers = connectAnswersCache.current.get(tgtId) ?? di?.connectAnswers

    // For a Connect lens the chips view rebuilds from cached cards; passing the
    // (prose) bridge conversation as messages would poison the JSON card parser,
    // so start it clean and let initialConnectCards/Answers restore the map.
    const existing = template === 'connect'
      ? []
      : (driftStore.getTempConversation(tgtId) ?? chatHistory.find(c => c.id === tgtId)?.messages ?? [])

    haptics.impact('light')
    connectStateRef.current = { question: null, cards: null }
    driftStore.openDrift({
      selectedText: ctx.selectedText,
      sourceMessageId: ctx.sourceMessageId,
      contextMessages: ctx.contextMessages,
      highlightMessageId: ctx.highlightMessageId,
      driftChatId: tgtId,
      existingMessages: existing,
      templateType: template,
      ancestry: ctx.ancestry,
      connectCards: tgtCards?.length ? tgtCards : undefined,
      connectAnswers: tgtAnswers && Object.keys(tgtAnswers).length ? tgtAnswers : undefined,
    })
  }

  // ── Centralized drift restoration ─────────────────────────────────────────────
  // Single source of truth for restoring an already-explored drift. Given a
  // driftChatId (+ the source message / selected text it branched from), it
  // resolves the cached content so re-opening from ANY entry point (reopen pill,
  // sibling switcher, "Drift into" chips, inline links, map) restores with ZERO
  // new network calls. Mirrors the map `onOpenDrift` fix and `handleSwitchLens`.
  const resolveDriftRestore = (
    driftChatId: string,
    sourceMessageId?: string,
    selectedText?: string,
    parentMessages?: Message[],
  ): {
    existingMessages: Message[]
    templateType: DriftContext['templateType']
    connectCards?: string[]
    connectAnswers?: Record<string, Message[]>
  } => {
    // Where to look for the drift's metadata (driftInfos): the explicit parent
    // messages if provided, else the active chat, else all current messages.
    const searchPools: Message[][] = [
      parentMessages ?? [],
      chatHistory.find(c => c.id === activeChatId)?.messages ?? messages,
      messages,
    ]

    // Find the driftInfo entry for this id. Prefer the most specific match:
    // the entry on the exact source message, then a (term + id) match anywhere,
    // then any entry with this driftChatId.
    let di: NonNullable<Message['driftInfos']>[number] | undefined
    for (const pool of searchPools) {
      const srcMsg = sourceMessageId ? pool.find(m => m.id === sourceMessageId) : undefined
      di =
        (srcMsg?.driftInfos?.find(d =>
          d.driftChatId === driftChatId && (!selectedText || d.selectedText === selectedText))) ??
        undefined
      if (di) break
      const infos = pool.flatMap(m => m.driftInfos ?? [])
      di =
        (selectedText
          ? infos.find(d => d.driftChatId === driftChatId && d.selectedText === selectedText)
          : undefined) ??
        infos.find(d => d.driftChatId === driftChatId)
      if (di) break
    }

    const connectCards = connectCardsCache.current.get(driftChatId) ?? di?.connectCards
    const connectAnswers = connectAnswersCache.current.get(driftChatId) ?? di?.connectAnswers

    // Prefer the persisted templateType; infer Connect when cards/answers exist.
    const templateType: DriftContext['templateType'] =
      di?.templateType ??
      ((connectCards?.length || (connectAnswers && Object.keys(connectAnswers).length))
        ? 'connect'
        : undefined)

    // For Connect, existingMessages MUST be [] — the prose bridge conversation
    // would poison the JSON card parser (same as handleSwitchLens / map fix).
    const existingMessages: Message[] =
      templateType === 'connect'
        ? []
        : ((chatHistory.find(c => c.id === driftChatId)?.messages?.length
            ? chatHistory.find(c => c.id === driftChatId)!.messages
            : null)
          ?? driftStore.getTempConversation(driftChatId)
          ?? [])

    return {
      existingMessages,
      templateType,
      connectCards: connectCards?.length ? connectCards : undefined,
      connectAnswers: connectAnswers && Object.keys(connectAnswers).length ? connectAnswers : undefined,
    }
  }

  // ── Drift synthesis: "bring it home" ──────────────────────────────────────────
  // Weaves every descendant drift of a conversation into one cohesive synthesis,
  // posted back as a message on that conversation. Closes the explore→return loop.
  const handleSynthesize = async (rootId: string) => {
    if (synthesizing) return
    const rootChat = chatHistory.find(c => c.id === rootId)
    if (!rootChat) { toast.error('Conversation not found'); return }

    // Walk the whole drift subtree, gathering each branch's conversation.
    const branches: { term: string; content: string }[] = []
    const seen = new Set<string>()
    const collect = (pid: string) => {
      for (const c of chatHistory) {
        if (seen.has(c.id) || !c.metadata?.isDrift || c.metadata?.parentChatId !== pid) continue
        seen.add(c.id)
        const msgs = c.messages?.length ? c.messages : (driftStore.getTempConversation(c.id) ?? [])
        const content = msgs.map(m => `${m.isUser ? 'Q' : 'A'}: ${stripMarkdown(m.text)}`).join('\n').trim()
        if (content) branches.push({ term: c.metadata?.selectedText || c.title, content })
        collect(c.id)
      }
    }
    collect(rootId)

    if (branches.length < 2) { toast.info('Explore at least 2 drifts to synthesize them'); return }

    const geminiPreset = (aiSettings.modelPresets || []).find(p => p.provider === 'gemini' && p.enabled)
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || geminiPreset?.apiKey || aiSettings.geminiApiKey
    if (!apiKey) { toast.error('Add a Gemini key in Settings to synthesize'); return }

    setSynthesizing(true)
    haptics.impact('medium')
    toast.info(`Synthesizing ${branches.length} drifts…`)
    try {
      const text = await synthesizeDrifts(rootChat.title, branches, apiKey)
      if (!text) { toast.error('Synthesis failed — try again'); return }
      const msg: Message = {
        id: 'synth-' + Date.now(),
        text: `## ✦ Synthesis · ${branches.length} drifts\n\n${text}`,
        isUser: false,
        timestamp: new Date(),
      }
      chatStore.addMessage(rootId, msg)
      haptics.impact('heavy')
      if (rootId !== activeChatId) switchChat(rootId)
      setKnowledgeGraphOpen(false)
      setTimeout(() => {
        const el = document.querySelector(`[data-message-id="${msg.id}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('highlight-message')
          setTimeout(() => el.classList.remove('highlight-message'), 2200)
        }
      }, 280)
      toast.success('Synthesis added to your chat')
    } finally {
      setSynthesizing(false)
    }
  }

  // ── Conversation forking: "what if I'd asked X instead?" ──────────────────────
  // Branches the timeline at a message into a new sibling conversation containing
  // everything through that point, then switches there to continue differently.
  const handleForkChat = (messageId: string) => {
    const sourceChat = chatHistory.find(c => c.id === activeChatId)
    const msgs = sourceChat?.messages?.length ? sourceChat.messages : messages
    const idx = msgs.findIndex(m => m.id === messageId)
    if (idx === -1) return
    haptics.impact('medium')

    // Carry everything up to and including this message; drop drift markers so the
    // fork starts clean (its own drifts will be tracked independently).
    const carried: Message[] = msgs.slice(0, idx + 1).map(m => ({
      ...m,
      hasDrift: false,
      driftInfos: undefined,
    }))
    const forkId = 'fork-' + Date.now()
    const baseTitle = sourceChat?.title && sourceChat.title !== 'New Chat' ? sourceChat.title : 'Conversation'
    const last = carried[carried.length - 1]
    const forkChat: ChatSession = {
      id: forkId,
      title: `Fork: ${baseTitle}`,
      messages: carried,
      lastMessage: last ? stripMarkdown(last.text).slice(0, 100) : 'Forked conversation',
      createdAt: new Date(),
      metadata: { forkedFrom: activeChatId, forkedAtMessageId: messageId },
    }
    chatStore.registerDriftSession(forkChat)
    switchChat(forkId)
    setTimeout(() => {
      const el = document.querySelector(`[data-message-id="${messageId}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    toast.success('Forked — continue in a new direction')
  }

  // ── On mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      await chatStore.loadChatsFromDB()
      createNewChat()
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Per-chat model prefs ────────────────────────────────────────────────────
  useEffect(() => {
    const saved = modelStore.loadChatModelPrefs(chatStore.activeChatId)
    if (saved?.length) modelStore.setSelectedTargets(saved)
  }, [chatStore.activeChatId])

  // ── Helper: strip markdown for previews ─────────────────────────────────────
  const stripMarkdown = (text: string): string => {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/```[^`]*```/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/^[-*+]\s/gm, '')
      .replace(/^\d+\.\s/gm, '')
      .replace(/>\s/g, '')
      .replace(/\n{2,}/g, ' ')
      .trim()
  }

  // ── Sanitize stored message text (remove stale [object Object] grounding artifacts) ──
  const sanitizeText = (text: string) =>
    text.replace(/,?\[object Object\],?/g, '').replace(/<br\/?>$/gm, '\n')

  // ── Index assistant lists ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      for (const m of messages) {
        if (!listIndexedMessageIdsRef.current.has(m.id) && !m.isUser && m.text) {
          indexListMessage(m.id, m.text)
          listIndexedMessageIdsRef.current.add(m.id)
        }
      }
      setContextLinkVersion(v => v + 1)
    })()
  }, [messages])

  // ── Coach mark helpers ──────────────────────────────────────────────────────
  const dismissCoachMark = () => {
    setCoachMarkActive(false)
    setCoachMarkSeen(true)
    localStorage.setItem('driftCoachMarkSeen', 'true')
    if (coachMarkTimerRef.current) clearTimeout(coachMarkTimerRef.current)
  }

  // Show coach mark on first completed AI message
  useEffect(() => {
    if (!isTyping && !coachMarkSeen && messages.some(m => !m.isUser)) {
      setCoachMarkActive(true)
      coachMarkTimerRef.current = setTimeout(() => dismissCoachMark(), 6000)
    }
  }, [isTyping]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global navigation handlers ──────────────────────────────────────────────
  useEffect(() => {
    const unsubNav = registerGlobalNavigationHandlers()
    return () => { unsubNav() }
  }, [])

  // ── Track active message id by viewport center ──────────────────────────────
  useEffect(() => {
    let ticking = false
    const updateActive = () => {
      ticking = false
      const centerY = window.innerHeight / 2
      const els = Array.from(document.querySelectorAll<HTMLElement>('div[data-message-id]'))
      let best: { id: string; d: number } | null = null
      for (const el of els) {
        const rect = el.getBoundingClientRect()
        const mid = rect.top + rect.height / 2
        const d = Math.abs(mid - centerY)
        const id = el.getAttribute('data-message-id') || ''
        if (!best || d < best.d) best = { id, d }
      }
      if (best) activeMessageIdRef.current = best.id
    }
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateActive)
        ticking = true
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    updateActive()
    return () => window.removeEventListener('scroll', onScroll)
  }, [messages])

  // ── Inline list link processing ─────────────────────────────────────────────
  const processEntityText = (children: React.ReactNode, _messageId: string): React.ReactNode => {
    let remaining = 5

    const renderString = (text: string): React.ReactNode => {
      if (!text) return text
      const used: Array<{ s: number; e: number; list?: { to: string; anchor: string; surface: string } }> = []
      if (remaining > 0) {
        const listMatches = matchListItemsInText(text)
        for (const lm of listMatches) {
          if (remaining <= 0) break
          const s = lm.start, e = lm.end
          const overlaps = used.some(u => !(e <= u.s || s >= u.e))
          if (overlaps) continue
          used.push({ s, e, list: { to: lm.messageId, anchor: lm.anchorId, surface: text.slice(s, e) } })
          remaining--
        }
      }
      if (!used.length) return text
      used.sort((a, b) => a.s - b.s)
      const out: React.ReactNode[] = []
      let cursor = 0
      for (const u of used) {
        if (u.s > cursor) out.push(text.slice(cursor, u.s))
        if (u.list) {
          out.push(<InlineListLink key={`list-${u.list.to}-${u.list.anchor}-${u.s}-${u.e}`} toMessageId={u.list.to} anchorId={u.list.anchor} surface={u.list.surface} />)
        }
        cursor = u.e
      }
      if (cursor < text.length) out.push(text.slice(cursor))
      return out
    }

    const walk = (node: React.ReactNode): React.ReactNode => {
      if (typeof node === 'string') return renderString(node)
      if (typeof node === 'number' || node == null || node === false) return node
      if (Array.isArray(node)) return node.map((n, i) => <span key={`n-${i}`}>{walk(n)}</span>)
      if (isValidElement(node)) {
        const props: any = (node as any).props || {}
        if ('children' in props) {
          return cloneElement(node as any, { ...props, children: walk(props.children) })
        }
        return node
      }
      // Skip unrenderable plain objects (would show as [object Object])
      return null
    }

    return walk(children)
  }

  // ── Suggested highlights rendering ─────────────────────────────────────────
  /**
   * Wraps AI-suggested drift highlight phrases in a clickable span with violet
   * dotted underline. Runs as a second pass after processEntityText.
   */
  const processHighlightsText = (children: React.ReactNode, messageId: string, highlights: string[]): React.ReactNode => {
    if (!highlights.length) return children

    const injectHighlight = (text: string): React.ReactNode => {
      const matches: Array<{ start: number; end: number; phrase: string }> = []
      highlights.forEach(phrase => {
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
            title="Explore ↗"
            onClick={() => handleStartDrift(m.phrase, messageId)}
          >
            {m.phrase}
          </span>
        )
        cursor = m.end
      }
      if (cursor < text.length) out.push(text.slice(cursor))
      return out
    }

    const walk = (node: React.ReactNode): React.ReactNode => {
      if (typeof node === 'string') return injectHighlight(node)
      if (typeof node === 'number' || node == null || node === false) return node
      if (Array.isArray(node)) return node.map((n, i) => <span key={`hl-n-${i}`}>{walk(n)}</span>)
      if (isValidElement(node)) {
        const props: any = (node as any).props || {}
        if ('children' in props) return cloneElement(node as any, { ...props, children: walk(props.children) })
        return node
      }
      return null
    }

    return walk(children)
  }

  // ── Scroll helpers ──────────────────────────────────────────────────────────
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const isAtBottom = () => {
    const chatContainer = document.querySelector('.chat-messages-container')
    if (!chatContainer) return true
    const threshold = 100
    return chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < threshold
  }

  useEffect(() => {
    if (!userHasScrolled.current && messages.length > 0) {
      scrollToBottom()
    }
  }, [messages])

  useEffect(() => {
    if (!userHasScrolled.current && streamingResponse) {
      const chatContainer = document.querySelector('.chat-messages-container')
      if (chatContainer && isAtBottom()) {
        scrollToBottom()
      }
    }
  }, [streamingResponse])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'n') {
        e.preventDefault()
        createNewChat()
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'g') {
        e.preventDefault()
        setKnowledgeGraphOpen(!knowledgeGraphOpen)
      }
      // ⌘K / Ctrl-K — full-text search across all chats and drifts.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setSearchOpen(v => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [chatHistory, activeChatId, messages, knowledgeGraphOpen])

  // ── API connection check ────────────────────────────────────────────────────
  useEffect(() => {
    const checkConnection = async (showConnecting = true) => {
      if (showConnecting) setIsConnecting(true)
      try {
        if (aiSettings.useDummyAI) {
          const connected = await checkDummyConnection()
          setApiConnected(connected)
          setIsConnecting(false)
          return
        }

        const hasGeminiPreset = (aiSettings.modelPresets || []).some((p: any) => p.provider === 'gemini' && p.enabled)
        if (hasGeminiPreset) {
          const apiKey = import.meta.env.VITE_GEMINI_API_KEY || aiSettings.geminiApiKey
          if (!apiKey?.trim()) {
            uiStore.setSettingsOpen(true)
            setApiConnected(false)
            setIsConnecting(false)
            return
          }
          const connected = await checkGeminiConnection(apiKey, aiSettings.geminiModel)
          setApiConnected(connected)
        } else if (aiSettings.useOpenRouter) {
          const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || aiSettings.openRouterApiKey
          if (!apiKey || apiKey.trim() === '') {
            uiStore.setSettingsOpen(true)
            setApiConnected(false)
            setIsConnecting(false)
            return
          }
          const connected = await checkOpenRouterConnection(apiKey, aiSettings.openRouterModel)
          setApiConnected(connected)
          if (!connected && !import.meta.env.VITE_OPENROUTER_API_KEY) {
            uiStore.setSettingsOpen(true)
          }
        } else {
          const connected = await checkOllamaConnection(aiSettings.ollamaUrl)
          setApiConnected(connected)
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

  // ── Snippet count / saved IDs ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const allSnippets = snippetStorage.getAllSnippets()
      uiStore.setSnippetCount(allSnippets.length)
      const savedIds = new Set<string>()
      allSnippets.forEach(snippet => {
        if (snippet.source.messageId) savedIds.add(snippet.source.messageId)
      })
      uiStore.setSavedMessageIds(savedIds)
    } catch (error) {
      console.error('Error loading snippets:', error)
      uiStore.setSnippetCount(0)
    }
  }, [galleryOpen])

  // ── Auto-resize textarea ────────────────────────────────────────────────────
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const scrollHeight = textarea.scrollHeight
      const newHeight = Math.min(scrollHeight, 200)
      textarea.style.height = newHeight + 'px'
      if (scrollHeight > 200) {
        textarea.classList.add('scrollable')
      } else {
        textarea.classList.remove('scrollable')
      }
    }
  }, [message])

  // ── Scroll button visibility ────────────────────────────────────────────────
  useEffect(() => {
    const chatContainer = document.querySelector('.chat-messages-container')
    if (!chatContainer) return
    let scrollTimeout: ReturnType<typeof setTimeout>
    const handleScroll = () => {
      const atBottom = isAtBottom()
      uiStore.setShowScrollButton(!atBottom)
      if (!atBottom) userHasScrolled.current = true
      if (atBottom) {
        clearTimeout(scrollTimeout)
        scrollTimeout = setTimeout(() => {
          userHasScrolled.current = false
        }, 150)
      }
    }
    chatContainer.addEventListener('scroll', handleScroll)
    return () => {
      chatContainer.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimeout)
    }
  }, [])

  // ── setSelectedTargets with per-chat persistence ────────────────────────────
  const setSelectedTargetsPersist = (targets: typeof modelStore.selectedTargets) => {
    modelStore.setSelectedTargets(targets)
    // Use the passed-in `targets` rather than reading back modelStore.selectedTargets,
    // which is the stale reactive binding from the last render.
    modelStore.setChatModelPrefs(activeChatId, targets)
  }

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
    target: (typeof modelStore.selectedTargets)[number],
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
      } else if (target.provider === 'dummy') {
        await sendMessageToDummy(contextMessages as any, onChunk, signal)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error'
      const current = useChatStore.getState().messages
      chatStore.setMessages(current.map(m => m.id === aiResponseId ? { ...m, text: `[Error: ${errMsg}]` } : m))
    }
  }

  // ── sendMessage ─────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (message.trim()) {
      if (continueFromMessageId) setContinueFromMessageId(null)
      const canvasIdSnapshot = activeCanvasId || undefined

      const newMessage: Message = {
        id: Date.now().toString(),
        text: message,
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
        const newTitle = message.slice(0, 50) + (message.length > 50 ? '...' : '')
        chatStore.updateChat(activeChatId, { title: newTitle, lastMessage: message, messages: updatedMessages })
      } else {
        chatStore.updateChat(activeChatId, { lastMessage: message, messages: updatedMessages })
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
            } else if (t.provider === 'dummy') {
              tasks.push(
                streamIntoNewMessage(async (msgs, onChunk, signal) =>
                  sendMessageToDummy(msgs, onChunk, signal)
                , t.label, broadcastGroupId)
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
          } else if (t.provider === 'dummy') {
            await streamIntoNewMessage(async (msgs, onChunk, signal) =>
              sendMessageToDummy(msgs, onChunk, signal)
            , t.label, undefined, activeStrandId || undefined, undefined)
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

  // ── continueWithModel ───────────────────────────────────────────────────────
  const continueWithModel = (modelTag?: string, messageId?: string) => {
    if (!modelTag) return
    prevContinueTargetsRef.current = selectedTargets
    let targetId = messageId || ''
    if (messageId) {
      const msg = messages.find(m => m.id === messageId)
      const gid = msg?.broadcastGroupId
      if (gid) {
        setContinuedModelByGroup(prev => ({ ...prev, [gid]: modelTag }))
        setActiveBroadcastGroupId(gid)
      }
      if (gid && msg?.modelTag && !isTouchDevice) {
        // Canvas view is desktop-only; on mobile messages flow into main thread
        const canvasId = `${gid}:${msg.modelTag}`
        setActiveCanvasId(canvasId)
        const lastAssistant = [...messages].reverse().find(m => m.canvasId === canvasId && !m.isUser)
        if (lastAssistant) targetId = lastAssistant.id
      }
      setActiveStrandId(messageId)
    }
    if (targetId) setContinueFromMessageId(targetId)
    // Try preset lookup first — handles any user-added model
    const matchingPreset = (aiSettings.modelPresets || []).find((p) => p.label === modelTag && p.enabled)
    if (matchingPreset) {
      setSelectedTargetsPersist([{ provider: matchingPreset.provider, key: matchingPreset.id, label: matchingPreset.label }])
    } else if (modelTag === 'Qwen3' || modelTag === 'Dummy A') {
      setSelectedTargetsPersist([{ provider: 'openrouter', key: 'qwen3', label: 'Qwen3' }])
    } else if (modelTag === 'OpenAI OSS' || modelTag === 'OpenRouter') {
      setSelectedTargetsPersist([{ provider: 'openrouter', key: 'oss', label: 'OpenAI OSS' }])
    } else if (modelTag === 'Ollama') {
      setSelectedTargetsPersist([{ provider: 'ollama', key: 'ollama', label: 'Ollama' }])
    } else if (modelTag === 'Demo AI' || modelTag === 'dummy-lite') {
      setSelectedTargetsPersist([{ provider: 'dummy', key: 'dummy-lite', label: 'Demo AI' }])
    } else if (modelTag === 'Gemini Flash Lite' || modelTag === 'gemini-flash-lite') {
      setSelectedTargetsPersist([{ provider: 'gemini', key: 'gemini-flash-lite', label: 'Gemini Flash Lite' }])
    } else if (modelTag === 'Gemini Flash' || modelTag === 'gemini-flash') {
      setSelectedTargetsPersist([{ provider: 'gemini', key: 'gemini-flash', label: 'Gemini Flash' }])
    }
    setTimeout(() => {
      if (!targetId) return
      const el = document.querySelector(`[data-message-id="${targetId}"]`)
      if (el) {
        el.classList.add('highlight-message')
        setTimeout(() => el.classList.remove('highlight-message'), 1500)
      }
      textareaRef.current?.focus()
    }, 30)
  }

  // ── Settings ────────────────────────────────────────────────────────────────
  const handleSaveSettings = (newSettings: AISettings) => {
    if (!newSettings.openRouterApiKey && import.meta.env.VITE_OPENROUTER_API_KEY) {
      newSettings.openRouterApiKey = import.meta.env.VITE_OPENROUTER_API_KEY
    }
    setAiSettings(newSettings)
    settingsStorage.save(newSettings)
    modelStore.setUseOpenRouter(newSettings.useOpenRouter)
  }

  // ── handlePresetsAdded — called by AddModelSheet ─────────────────────────────
  const handlePresetsAdded = (newPresets: import('./components/Settings').ModelPreset[]) => {
    const existing = aiSettings.modelPresets || []
    // Upsert: update by ID if exists, append if new
    const merged = [...existing]
    for (const p of newPresets) {
      const idx = merged.findIndex((x) => x.id === p.id)
      if (idx >= 0) merged[idx] = p
      else merged.push(p)
    }
    handleSaveSettings({ ...aiSettings, modelPresets: merged })
    // Auto-select first newly added preset (not already selected)
    const firstNew = newPresets.find((p) => !selectedTargets.some((t) => t.key === p.id))
    if (firstNew && selectedTargets.length < 3) {
      setSelectedTargetsPersist(
        [...selectedTargets, { provider: firstNew.provider, key: firstNew.id, label: firstNew.label }].slice(0, 3),
      )
    }
  }

  // ── Dates ───────────────────────────────────────────────────────────────────
  const formatDate = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // ── Chat management ─────────────────────────────────────────────────────────
  const createNewChat = () => {
    if (driftOpen) driftStore.closeDrift()
    // Save title of current chat if still generic
    const currentChat = chatHistory.find(c => c.id === activeChatId)
    if (currentChat && messages.length > 0 && (currentChat.title === 'New Chat' || currentChat.title === 'Current Conversation')) {
      const firstUserMessage = messages.find(m => m.isUser)
      const newTitle = firstUserMessage
        ? firstUserMessage.text.slice(0, 50) + (firstUserMessage.text.length > 50 ? '...' : '')
        : `Chat from ${formatDate(currentChat.createdAt)}`
      chatStore.updateChat(activeChatId, { title: newTitle, messages })
    }
    chatStore.createChat()
  }

  const switchChat = (chatId: string) => {
    if (chatId === activeChatId) return
    // Update saved message IDs for new chat
    const allSnippets = snippetStorage.getAllSnippets()
    const savedIds = new Set<string>()
    allSnippets.forEach(snippet => {
      if (snippet.source.messageId && snippet.source.chatId === chatId) {
        savedIds.add(snippet.source.messageId)
      }
    })
    uiStore.setSavedMessageIds(savedIds)
    chatStore.setActiveChat(chatId)
  }

  // ── Drift handlers ──────────────────────────────────────────────────────────
  const handleStartDrift = (selectedText: string, messageId: string, existingDriftChatId?: string, reconstructedMessages?: Message[], templateType?: DriftContext['templateType'], initialSuggestions?: string[], restoredConnectCards?: string[], restoredConnectAnswers?: Record<string, Message[]>) => {
    // Haptic weight communicates significance:
    //  • branching deeper (panel already open → a new topic emerges) = the
    //    defining gesture, a heavy "you went somewhere" thunk.
    //  • opening a fresh space from the main thread = a medium "occasion."
    haptics.impact(driftStore.driftOpen ? 'heavy' : 'medium')

    const chatContainer = document.querySelector('.chat-messages-container')
    if (chatContainer) mainScrollPosition.current = chatContainer.scrollTop

    // Reset connect state tracker for the new drift context
    connectStateRef.current = { question: null, cards: null }

    // ── Nested drift: selection came from within an open drift panel ──────────
    // If the panel is open, look for the source message in the active drift's
    // temp conversation first. If found, record driftInfos THERE (not on the
    // main chat message) so the tree is correctly nested in DriftMapPanel.
    const activeDriftChatId = driftStore.driftContext?.driftChatId
    if (driftStore.driftOpen && activeDriftChatId) {
      const activeDriftMessages = driftStore.getTempConversation(activeDriftChatId)
      if (activeDriftMessages) {
        const driftSourceMsg =
          activeDriftMessages.find(m => m.id === messageId) ??
          activeDriftMessages.find(m => !m.isUser && m.text?.includes(selectedText))
        if (driftSourceMsg) {
          const existingNested = driftSourceMsg.driftInfos?.find(d => d.selectedText === selectedText)
          const newDriftChatId = existingNested?.driftChatId || existingDriftChatId || `drift-temp-${Date.now()}`
          // Get the messages to persist for the parent drift (with updated driftInfos)
          const msgsToSave = existingNested
            ? activeDriftMessages
            : activeDriftMessages.map(m =>
                m.id === driftSourceMsg.id
                  ? { ...m, hasDrift: true, driftInfos: [...(m.driftInfos || []), { selectedText, driftChatId: newDriftChatId }] }
                  : m
              )
          if (!existingNested) {
            driftStore.saveTempConversation(activeDriftChatId, msgsToSave)
          }
          // Persist parent drift to IndexedDB before replacing context — ensures
          // it survives app restarts and appears correctly in the Drift Map.
          const parentCtx = driftStore.driftContext
          // Determine the correct parent for the current (parent) drift:
          // if it has an ancestor drift, use that; otherwise fall back to main chat.
          const parentCtxAncestry = parentCtx.ancestry ?? []
          const parentDriftAncestor = [...parentCtxAncestry].reverse().find(e => e.driftChatId)
          const parentDriftParentId = parentDriftAncestor?.driftChatId ?? activeChatId
          chatStore.registerDriftSession({
            id: activeDriftChatId,
            title: `"${parentCtx.selectedText}"`,
            messages: msgsToSave as Message[],
            lastMessage: msgsToSave[msgsToSave.length - 1]?.text?.slice(0, 100),
            createdAt: new Date(),
            metadata: {
              isDrift: true,
              parentChatId: parentDriftParentId,
              sourceMessageId: parentCtx.sourceMessageId,
              selectedText: parentCtx.selectedText,
            },
          })
          const msgIdx = activeDriftMessages.findIndex(m => m.id === driftSourceMsg.id)
          const nestedContext = activeDriftMessages.slice(0, msgIdx + 1)
          const existingNestedMessages = reconstructedMessages || driftStore.getTempConversation(newDriftChatId) || []
          // Build breadcrumb ancestry: inherit parent ancestry + add the parent drift as a new entry
          const parentAncestry = parentCtx.ancestry ?? [{
            isMainChat: true,
            label: chatHistory.find(c => c.id === activeChatId)?.title || 'Chat',
            selectedText: '',
            sourceMessageId: '',
            contextMessages: [],
          }]
          driftStore.openDrift({
            selectedText,
            sourceMessageId: driftSourceMsg.id,
            contextMessages: nestedContext,
            highlightMessageId: driftSourceMsg.id,
            driftChatId: newDriftChatId,
            existingMessages: existingNestedMessages,
            templateType,
            initialSuggestions,
            ancestry: [
              ...parentAncestry,
              {
                label: `"${parentCtx.selectedText}"`,
                selectedText: parentCtx.selectedText,
                sourceMessageId: parentCtx.sourceMessageId,
                contextMessages: parentCtx.contextMessages,
                driftChatId: activeDriftChatId,
                templateType: parentCtx.templateType,
                connectQuestion: connectStateRef.current.question,
                connectCards: connectStateRef.current.cards ?? undefined,
              },
            ],
          })
          return
        }
      }
    }

    const currentChat = chatHistory.find(c => c.id === activeChatId)
    let currentMessages = currentChat?.messages || messages
    if (currentMessages.length === 0) currentMessages = messages

    let messageIndex = -1
    let actualMessage: Message | null = null
    for (let i = 0; i < currentMessages.length; i++) {
      const msg = currentMessages[i]
      if (!msg.isUser && msg.text && msg.text.includes(selectedText)) {
        messageIndex = i
        actualMessage = msg
        break
      }
    }

    if (messageIndex === -1) {
      // Preserve existing drift data even if the source message text can't be found
      const fallbackExisting = (reconstructedMessages?.length ? reconstructedMessages : null)
        ?? (existingDriftChatId ? driftStore.getTempConversation(existingDriftChatId) : undefined)
        ?? []
      const cachedFallbackCards = restoredConnectCards
        ?? (existingDriftChatId ? connectCardsCache.current.get(existingDriftChatId) : undefined)
      driftStore.openDrift({
        selectedText,
        sourceMessageId: messageId,
        contextMessages: [],
        driftChatId: existingDriftChatId,
        existingMessages: fallbackExisting,
        templateType,
        initialSuggestions,
        connectCards: cachedFallbackCards?.length ? cachedFallbackCards : undefined,
        connectAnswers: restoredConnectAnswers && Object.keys(restoredConnectAnswers).length > 0 ? restoredConnectAnswers : undefined,
        ancestry: [{
          isMainChat: true,
          label: chatHistory.find(c => c.id === activeChatId)?.title || 'Chat',
          selectedText: '',
          sourceMessageId: '',
          contextMessages: [],
        }],
      })
      return
    }

    const contextMessages = currentMessages.slice(0, messageIndex + 1)

    if (actualMessage) {
      const existingDrift = actualMessage.driftInfos?.find(d => d.selectedText === selectedText)
      const driftChatId = existingDrift?.driftChatId || existingDriftChatId || `drift-temp-${Date.now()}`

      const updatedMessages = currentMessages.map(msg =>
        msg.id === actualMessage!.id
          ? {
              ...msg,
              hasDrift: true,
              driftInfos: existingDrift ? msg.driftInfos : [
                ...(msg.driftInfos || []),
                { selectedText, driftChatId, templateType }
              ]
            }
          : msg
      )
      chatStore.setMessages(updatedMessages)
      chatStore.updateChat(activeChatId, { messages: updatedMessages })
    }

    const finalSourceMessageId = actualMessage?.id || messageId
    // Check actualMessage first, then search all messages as fallback (handles drifts started via Connect chips or other paths)
    const existingDrift = actualMessage?.driftInfos?.find(d => d.selectedText === selectedText)
      ?? currentMessages.flatMap(m => m.driftInfos ?? []).find(d => d.selectedText === selectedText)
    const finalDriftChatId = existingDrift?.driftChatId || existingDriftChatId || `drift-temp-${Date.now()}`

    // Resolve cached content + the effective lens for an ALREADY-explored drift.
    // Caller-supplied values (explicit param / restored cards/answers) win; the
    // resolver fills the gaps (e.g. an inline link that omits templateType for a
    // term first explored as Connect) so we never re-fetch an explored combo.
    const restore = resolveDriftRestore(finalDriftChatId, finalSourceMessageId, selectedText, currentMessages)
    const effectiveTemplateType = templateType ?? existingDrift?.templateType ?? restore.templateType

    const cachedConnectCards = restoredConnectCards
      ?? connectCardsCache.current.get(finalDriftChatId)
      ?? restore.connectCards
    const cachedConnectAnswers = restoredConnectAnswers
      ?? existingDrift?.connectAnswers
      ?? restore.connectAnswers

    // For Connect, existingMessages MUST be [] (prose poisons the card parser).
    const existingMessagesToUse: Message[] = effectiveTemplateType === 'connect'
      ? []
      : ((reconstructedMessages?.length ? reconstructedMessages : null)
        ?? driftStore.getTempConversation(finalDriftChatId)
        ?? [])

    driftStore.openDrift({
      selectedText,
      sourceMessageId: finalSourceMessageId,
      contextMessages,
      highlightMessageId: actualMessage?.id,
      driftChatId: finalDriftChatId,
      existingMessages: existingMessagesToUse,
      templateType: effectiveTemplateType,
      initialSuggestions,
      connectCards: cachedConnectCards?.length ? cachedConnectCards : undefined,
      connectAnswers: cachedConnectAnswers && Object.keys(cachedConnectAnswers).length > 0 ? cachedConnectAnswers : undefined,
      ancestry: [{
        isMainChat: true,
        label: chatHistory.find(c => c.id === activeChatId)?.title || 'Chat',
        selectedText: '',
        sourceMessageId: '',
        contextMessages: [],
      }],
    })
  }

  const handleCloseDrift = (driftMessages?: Message[]) => {
    // Read context before closing (driftContext is stable until next openDrift)
    const { selectedText, sourceMessageId, driftChatId, ancestry } = driftStore.driftContext

    // Remember this drift so the user can reopen it in one tap from the header —
    // only worth offering if there's an actual conversation to return to.
    if (driftChatId && selectedText && driftMessages && driftMessages.length > 0) {
      const rootEntry = ancestry?.[0]
      setLastDrift({
        driftChatId,
        selectedText,
        parentChatId: rootEntry?.isMainChat ? activeChatId : (ancestry?.find(e => e.driftChatId)?.driftChatId ?? activeChatId),
        sourceMessageId: sourceMessageId ?? '',
      })
    }

    driftStore.closeDrift(driftMessages)

    // Auto-persist the drift conversation so it survives app restarts.
    // Creates a ghost ChatSession in chatHistory + IndexedDB if not already there.
    if (driftMessages && driftMessages.length > 0 && driftChatId) {
      // Determine the correct parent: for nested drifts, the parent is the
      // immediately preceding drift in the ancestry chain (the last entry with a
      // driftChatId). For top-level drifts the parent is the main chat (activeChatId).
      const parentAncestry = ancestry ?? []
      const lastDriftAncestor = [...parentAncestry].reverse().find(e => e.driftChatId)
      const correctParentChatId = lastDriftAncestor?.driftChatId ?? activeChatId

      chatStore.registerDriftSession({
        id: driftChatId,
        title: `"${selectedText}"`,
        messages: driftMessages as Message[],
        lastMessage: driftMessages[driftMessages.length - 1]?.text?.slice(0, 100),
        createdAt: new Date(),
        metadata: {
          isDrift: true,
          parentChatId: correctParentChatId,
          sourceMessageId,
          selectedText,
        },
      })
    }

    setTimeout(() => {
      const chatContainer = document.querySelector('.chat-messages-container')
      if (chatContainer) chatContainer.scrollTop = mainScrollPosition.current
    }, 150)
  }

  // ── Reopen last drift ─────────────────────────────────────────────────────────
  // One tap returns the user to the branch they most recently left, switching to
  // its parent chat first if needed. Never make them hunt for where they were.
  const reopenLastDrift = () => {
    if (!lastDrift) return
    haptics.impact('medium')
    const { driftChatId, selectedText, parentChatId, sourceMessageId } = lastDrift

    if (parentChatId && parentChatId !== activeChatId) {
      switchChat(parentChatId)
    }

    const parentMessages = chatHistory.find(c => c.id === parentChatId)?.messages ?? messages
    const msgIdx = sourceMessageId ? parentMessages.findIndex(m => m.id === sourceMessageId) : -1

    // Restore cached content (regular messages OR Connect cards/answers + the
    // correct templateType) so the panel never re-fetches an explored drift.
    const restore = resolveDriftRestore(driftChatId, sourceMessageId, selectedText, parentMessages)

    connectStateRef.current = { question: null, cards: null }
    driftStore.openDrift({
      selectedText,
      sourceMessageId,
      contextMessages: msgIdx >= 0 ? parentMessages.slice(0, msgIdx + 1) : [],
      highlightMessageId: sourceMessageId || undefined,
      driftChatId,
      existingMessages: restore.existingMessages,
      templateType: restore.templateType,
      connectCards: restore.connectCards,
      connectAnswers: restore.connectAnswers,
      ancestry: [{
        isMainChat: true,
        label: chatHistory.find(c => c.id === parentChatId)?.title || 'Chat',
        selectedText: '',
        sourceMessageId: '',
        contextMessages: [],
      }],
    })
  }

  // ── Breadcrumb navigation ────────────────────────────────────────────────────
  const handleNavigateToBreadcrumb = (index: number) => {
    const { ancestry } = driftStore.driftContext
    if (!ancestry || index >= ancestry.length) return

    if (index === 0) {
      // Navigate to main chat — close the drift panel (temp messages already
      // synced to driftStore via onMessagesChange, so no data loss)
      driftStore.closeDrift()
      return
    }

    // Navigate to an ancestor drift
    const entry = ancestry[index]
    if (!entry.driftChatId) return

    const existingMsgs =
      driftStore.getTempConversation(entry.driftChatId) ??
      (chatHistory.find(c => c.id === entry.driftChatId)?.messages ?? [])

    // Reset connect tracker — the restored drift will fire onConnectStateChange to update it
    connectStateRef.current = { question: null, cards: null }

    driftStore.openDrift({
      selectedText: entry.selectedText,
      sourceMessageId: entry.sourceMessageId,
      contextMessages: entry.contextMessages,
      driftChatId: entry.driftChatId,
      existingMessages: existingMsgs,
      ancestry: ancestry.slice(0, index),
      templateType: entry.templateType,
      connectQuestion: entry.connectQuestion,
      connectCards: entry.connectCards,
    })
  }

  // ── Message actions ─────────────────────────────────────────────────────────
  const handleCopyMessage = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      uiStore.setCopiedMessageId(messageId)
    } catch (error) {
      toast.error('Failed to copy message')
    }
  }

  const handleToggleSaveMessage = (msg: Message) => {
    if (savedMessageIds.has(msg.id)) {
      const allSnippets = snippetStorage.getAllSnippets()
      const snippetToDelete = allSnippets.find(s =>
        s.source.messageId === msg.id && s.source.chatId === activeChatId
      )
      if (snippetToDelete) {
        snippetStorage.deleteSnippet(snippetToDelete.id)
        uiStore.removeSavedMessageId(msg.id)
        uiStore.setSnippetCount(Math.max(0, snippetCount - 1))
      }
    } else {
      const currentChat = chatHistory.find(c => c.id === activeChatId)
      const source = {
        chatId: activeChatId,
        chatTitle: currentChat?.title || 'Untitled Chat',
        messageId: msg.id,
        isFullMessage: true,
        timestamp: msg.timestamp
      }
      snippetStorage.createSnippet(msg.text, source, { tags: [], starred: false })
      uiStore.addSavedMessageId(msg.id)
      uiStore.setSnippetCount(snippetCount + 1)
    }
  }

  // ── Drift save/push operations ──────────────────────────────────────────────
  const handleSaveDriftAsChat = (driftMessages: Message[], title: string, metadata: any) => {
    const newChatId = metadata.id || 'drift-' + Date.now().toString()
    const newChat: ChatSession = {
      id: newChatId,
      title,
      messages: driftMessages,
      lastMessage: stripMarkdown(driftMessages[driftMessages.length - 1]?.text || 'Drift conversation'),
      createdAt: new Date(),
      metadata: {
        ...metadata,
        parentChatId: activeChatId,
        id: newChatId
      }
    }
    // Insert the new chat at the top of history using the store's setState
    useChatStore.setState(state => ({
      chatHistory: [newChat, ...state.chatHistory.filter(c => c.id !== newChatId)]
    }))

    const updatedMessages = messages.map(msg => {
      if (msg.id === metadata.sourceMessageId ||
          (msg.driftInfos && msg.driftInfos.some(d =>
            d.selectedText === metadata.selectedText &&
            d.driftChatId.startsWith('drift-temp-')))) {
        return {
          ...msg,
          hasDrift: true,
          driftInfos: [
            ...(msg.driftInfos?.filter(d => d.selectedText !== metadata.selectedText) || []),
            { selectedText: metadata.selectedText, driftChatId: newChatId }
          ]
        }
      }
      return msg
    })

    chatStore.setMessages(updatedMessages)
  }

  const handleUndoPushToMain = (sourceMessageId: string) => {
    const updatedMessages = messages.filter(msg =>
      !msg.isDriftPush || msg.driftPushMetadata?.sourceMessageId !== sourceMessageId
    )
    chatStore.setMessages(updatedMessages)
  }

  const handleUndoSaveAsChat = (chatId: string) => {
    chatStore.deleteChat(chatId)
    const updatedMessages = messages.map(msg => {
      if (msg.hasDrift && msg.driftInfos?.some(d => d.driftChatId === chatId)) {
        const remainingDrifts = msg.driftInfos.filter(d => d.driftChatId !== chatId)
        if (remainingDrifts.length === 0) {
          const { driftInfos, hasDrift, ...restMsg } = msg
          return restMsg
        } else {
          return { ...msg, driftInfos: remainingDrifts }
        }
      }
      return msg
    })
    chatStore.setMessages(updatedMessages)
  }

  const handleUpdatePushedDriftSaveStatus = (sourceMessageId: string) => {
    const updatedMessages = messages.map(msg => {
      if (msg.isDriftPush && msg.driftPushMetadata?.sourceMessageId === sourceMessageId) {
        return {
          ...msg,
          driftPushMetadata: { ...msg.driftPushMetadata, wasSavedAsChat: true }
        }
      }
      return msg
    })
    chatStore.setMessages(updatedMessages)
  }

  const handlePushDriftToMain = (driftMessages: Message[], selectedText: string, sourceMessageId: string, wasSavedAsChat: boolean, userQuestion?: string, driftChatId?: string) => {
    const pushCallId = Math.random().toString(36).substring(7)
    console.log(`[PUSH ${pushCallId}] handlePushDriftToMain called`)

    const originalSourceId = sourceMessageId.split('-push-')[0].split('-single-')[0]
    const driftSignature = driftMessages.map(m => `${m.isUser}:${m.text}`).join('|||')

    const duplicateExists = (() => {
      const existingPushWithSameId = messages.filter(msg =>
        msg.isDriftPush &&
        msg.driftPushMetadata?.sourceMessageId === sourceMessageId &&
        !msg.text.startsWith('📌 Drift exploration')
      )
      if (existingPushWithSameId.length > 0) return true

      const pushGroups = new Map<string, Message[]>()
      messages.forEach(msg => {
        if (msg.isDriftPush && msg.driftPushMetadata?.sourceMessageId) {
          const groupId = msg.driftPushMetadata.sourceMessageId
          const groupOriginalSource = groupId.split('-push-')[0].split('-single-')[0]
          if (groupOriginalSource === originalSourceId) {
            if (!pushGroups.has(groupId)) pushGroups.set(groupId, [])
            if (!msg.text.startsWith('📌 Drift exploration')) {
              pushGroups.get(groupId)!.push(msg)
            }
          }
        }
      })
      for (const [, groupMessages] of pushGroups) {
        const groupSignature = groupMessages.map(m => `${m.isUser}:${m.text}`).join('|||')
        if (groupSignature === driftSignature) return true
      }
      return false
    })()

    if (duplicateExists) {
      console.log(`[PUSH ${pushCallId}] BLOCKED - Duplicate detected`)
      return
    }

    const actualDriftChatId = driftChatId || 'drift-pushed-' + Date.now()
    const originMsg = messages.find(m => m.id === originalSourceId)
    const driftModelTag = driftMessages.find(m => !m.isUser && !!m.modelTag)?.modelTag
    const originModelTag = driftModelTag || originMsg?.modelTag
    let originSide: 'left' | 'right' | undefined = undefined
    if (originMsg?.broadcastGroupId) {
      const groupMsgs = messages.filter(m => m.broadcastGroupId === originMsg.broadcastGroupId && !m.canvasId && !!m.modelTag)
      const idx = groupMsgs.findIndex(m => m.id === originMsg.id)
      if (idx >= 0) originSide = idx === 0 ? 'left' : 'right'
    }

    const separatorMessage: Message = {
      id: 'drift-push-' + Date.now(),
      text: `📌 Drift exploration of "${selectedText}"`,
      isUser: false,
      timestamp: new Date(),
      isDriftPush: true,
      driftPushMetadata: {
        selectedText,
        sourceMessageId,
        parentChatId: activeChatId,
        wasSavedAsChat,
        userQuestion,
        driftChatId: actualDriftChatId,
        originSide,
        originModelTag
      },
      modelTag: originModelTag
    }

    const messagesWithDriftMarked = messages.map(msg => {
      if (msg.driftInfos?.some(d => d.selectedText === selectedText)) {
        const existingDriftIndex = msg.driftInfos.findIndex(d => d.selectedText === selectedText)
        const updatedDriftInfos = [...msg.driftInfos]
        updatedDriftInfos[existingDriftIndex] = { selectedText, driftChatId: actualDriftChatId }
        return { ...msg, hasDrift: true, driftInfos: updatedDriftInfos }
      }
      if (msg.id === originalSourceId && !msg.isDriftPush) {
        return {
          ...msg,
          hasDrift: true,
          driftInfos: [
            ...(msg.driftInfos || []),
            { selectedText, driftChatId: actualDriftChatId }
          ]
        }
      }
      if (!msg.isDriftPush && !msg.isUser && msg.text && msg.text.includes(selectedText)) {
        if (!msg.driftInfos?.some(d => d.selectedText === selectedText)) {
          return {
            ...msg,
            hasDrift: true,
            driftInfos: [
              ...(msg.driftInfos || []),
              { selectedText, driftChatId: actualDriftChatId }
            ]
          }
        }
      }
      return msg
    })

    const driftMessagesWithMetadata = driftMessages.map((msg, idx) => ({
      ...msg,
      isUser: false,
      originalIsUser: msg.isUser,
      isHiddenContext: msg.isUser ? true : (msg as any).isHiddenContext,
      id: `${sourceMessageId}-msg-${idx}-${Date.now()}`,
      originalDriftId: msg.id,
      isDriftPush: true,
      modelTag: originModelTag,
      driftPushMetadata: {
        selectedText,
        sourceMessageId,
        parentChatId: activeChatId,
        wasSavedAsChat,
        userQuestion,
        driftChatId: actualDriftChatId,
        originSide,
        originModelTag
      }
    }))

    const updatedMessages = [...messagesWithDriftMarked, separatorMessage, ...driftMessagesWithMetadata]
    const forceRefreshMessages = updatedMessages.map(msg => ({ ...msg }))
    chatStore.setMessages(forceRefreshMessages)
    const lastDriftMessage = driftMessagesWithMetadata[driftMessagesWithMetadata.length - 1]
    chatStore.updateChat(activeChatId, {
      messages: forceRefreshMessages,
      lastMessage: stripMarkdown(lastDriftMessage?.text || 'Drift pushed')
    })

    // Promoting an idea: this is a deliberate, satisfying gesture — a discovery
    // moving into the more permanent main thread. Confirm it physically + visibly.
    // (Undo stays available via the panel's push button toggle.)
    haptics.success()
    const promoteLabel = selectedText.length > 28 ? selectedText.slice(0, 28) + '…' : selectedText
    toast.success(`Promoted "${promoteLabel}" to the main thread`)

    // Trigger a one-time settle-in arrival for the freshly-promoted messages.
    setJustPromotedChatId(actualDriftChatId)
    if (justPromotedTimerRef.current) clearTimeout(justPromotedTimerRef.current)
    justPromotedTimerRef.current = setTimeout(() => setJustPromotedChatId(null), 1200)
  }

  // ── Context menu handlers ───────────────────────────────────────────────────
  const handleContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault()
    uiStore.setContextMenu({ x: e.clientX, y: e.clientY, chatId })
  }

  const handleRenameChat = (chatId: string) => {
    const chat = chatHistory.find(c => c.id === chatId)
    if (chat) {
      uiStore.setEditingChatId(chatId)
      uiStore.setEditingTitle(chat.title)
    }
  }

  const handleSaveRename = () => {
    if (editingChatId && editingTitle.trim()) {
      chatStore.updateChat(editingChatId, { title: editingTitle.trim() })
    }
    uiStore.setEditingChatId(null)
    uiStore.setEditingTitle('')
  }

  const handleDuplicateChat = (chatId: string) => {
    const chat = chatHistory.find(c => c.id === chatId)
    if (chat) {
      const newChat: ChatSession = {
        ...chat,
        id: Date.now().toString(),
        title: `${chat.title} (Copy)`,
        createdAt: new Date()
      }
      useChatStore.setState(state => ({
        chatHistory: [newChat, ...state.chatHistory]
      }))
    }
  }

  const handleDeleteChat = (chatId: string) => {
    if (confirm('Are you sure you want to delete this chat?')) {
      chatStore.deleteChat(chatId)
    }
  }

  const handleTogglePin = (chatId: string) => uiStore.togglePinnedChat(chatId)
  const handleToggleStar = (chatId: string) => uiStore.toggleStarredChat(chatId)

  const handleNavigateToSource = (chatId: string, messageId: string) => {
    switchChat(chatId)
    setTimeout(() => {
      let element = document.querySelector(`[data-message-id="${messageId}"]`)
      if (!element) element = document.querySelector(`[data-message-id="msg-${messageId}"]`)
      if (!element && messageId?.startsWith('msg-')) {
        element = document.querySelector(`[data-message-id="${messageId.substring(4)}"]`)
      }
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        element.classList.add('highlight-message', 'pulse-twice')
        setTimeout(() => element!.classList.remove('pulse-twice'), 2000)
        setTimeout(() => element!.classList.remove('highlight-message'), 3000)
      }
    }, 150)
  }

  const handleGoToSource = (chatId: string) => {
    const chat = chatHistory.find(c => c.id === chatId)
    if (chat?.metadata?.parentChatId && chat?.metadata?.sourceMessageId) {
      handleNavigateToSource(chat.metadata.parentChatId, chat.metadata.sourceMessageId)
    }
  }

  const handleSavePushedDriftAsChat = (msg: Message) => {
    if (!msg.isDriftPush || !msg.driftPushMetadata) return
    if (msg.driftPushMetadata.wasSavedAsChat) return

    const driftChatId = msg.driftPushMetadata.driftChatId
    const sourceMessageId = msg.driftPushMetadata.sourceMessageId

    const driftMessages = messages.filter(m => {
      if (!m.isDriftPush || m.text.startsWith('📌')) return false
      if (driftChatId && m.driftPushMetadata?.driftChatId === driftChatId) return true
      return m.driftPushMetadata?.sourceMessageId === sourceMessageId
    })

    if (driftMessages.length === 0) return

    const newChatId = 'drift-' + Date.now().toString()
    const title = `Drift: ${msg.driftPushMetadata.selectedText.slice(0, 30)}${msg.driftPushMetadata.selectedText.length > 30 ? '...' : ''}`

    const newChat: ChatSession = {
      id: newChatId,
      title,
      messages: driftMessages.map(m => ({
        ...m,
        isDriftPush: false,
        driftPushMetadata: undefined
      })),
      lastMessage: stripMarkdown(driftMessages[driftMessages.length - 1]?.text || 'Drift conversation'),
      createdAt: new Date(),
      metadata: {
        isDrift: true,
        parentChatId: msg.driftPushMetadata.parentChatId,
        sourceMessageId: msg.driftPushMetadata.sourceMessageId,
        selectedText: msg.driftPushMetadata.selectedText
      }
    }

    useChatStore.setState(state => ({
      chatHistory: [newChat, ...state.chatHistory]
    }))

    const updatedMessages = messages.map(m => {
      if (m.id === sourceMessageId) {
        return {
          ...m,
          hasDrift: true,
          driftInfos: [
            ...(m.driftInfos || []),
            { selectedText: msg.driftPushMetadata!.selectedText, driftChatId: newChatId }
          ]
        }
      }
      if (m.isDriftPush && m.driftPushMetadata) {
        const shouldUpdate = (driftChatId && m.driftPushMetadata.driftChatId === driftChatId) ||
          m.driftPushMetadata.sourceMessageId === sourceMessageId
        if (shouldUpdate) {
          return {
            ...m,
            driftPushMetadata: { ...m.driftPushMetadata, wasSavedAsChat: true, driftChatId: newChatId }
          }
        }
      }
      return m
    })

    chatStore.setMessages(updatedMessages)
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const handleLogin = (username: string) => {
    setCurrentUser(username)
    setIsAuthenticated(true)
    localStorage.setItem('driftUser', username)
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setCurrentUser(null)
    localStorage.removeItem('driftUser')
  }

  useEffect(() => {
    const savedUser = localStorage.getItem('driftUser')
    if (savedUser) {
      setCurrentUser(savedUser)
      setIsAuthenticated(true)
    }
  }, [])

  // ── Close user menu on outside click ───────────────────────────────────────
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!userMenuOpen) return
      const el = userMenuRef.current
      if (el && !el.contains(e.target as Node)) uiStore.setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [userMenuOpen])

  // ── Derived data ────────────────────────────────────────────────────────────
  const filteredChats = chatHistory.filter(chat =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const sortedChats = [...filteredChats].sort((a, b) => {
    const aPinned = pinnedChats.has(a.id)
    const bPinned = pinnedChats.has(b.id)
    if (aPinned && !bPinned) return -1
    if (!aPinned && bPinned) return 1
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  // ── Show login if not authenticated ────────────────────────────────────────
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex bg-dark-bg relative">
      <ToastContainer />
      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-dark-bg via-dark-surface/50 to-dark-bg pointer-events-none" />

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-10 backdrop-blur-sm"
          onClick={() => uiStore.setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed z-20 w-[85vw] max-w-[340px] h-full bg-dark-surface/95 backdrop-blur-sm
        border-r border-dark-border/30 flex flex-col
        transition-all duration-150 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        shadow-[inset_-8px_0_10px_-8px_rgba(0,0,0,0.4)]
      `}>
        {/* Sidebar Header */}
        <div className="px-2 py-2 border-b border-dark-border/30 flex items-center gap-1.5">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => chatStore.setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="
                w-full bg-dark-elevated/50 text-text-primary
                rounded-full pl-8 pr-8 py-1.5 text-[13px]
                border border-dark-border/30
                focus:outline-none focus:border-accent-violet/50
                placeholder:text-text-muted
                transition-all duration-100
              "
            />
            {searchQuery && (
              <button
                onClick={() => chatStore.setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full
                         bg-dark-border/30 hover:bg-accent-violet/20
                         flex items-center justify-center
                         transition-all duration-100 hover:scale-110
                         group"
                title="Clear search"
              >
                <X className="w-2.5 h-2.5 text-text-muted group-hover:text-accent-violet transition-colors duration-75" />
              </button>
            )}
          </div>
          {/* Collapse button */}
          <button
            onClick={() => uiStore.setSidebarOpen(false)}
            className="p-1.5 hover:bg-dark-elevated rounded-lg transition-colors duration-75 flex-shrink-0"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-text-muted" />
          </button>
        </div>

        {/* New chat — visible affordance (was keyboard-only, ⌘⌥N) */}
        <div className="px-2 pt-2 pb-1.5">
          <Pressable
            onClick={() => { createNewChat(); uiStore.setSidebarOpen(false) }}
            haptic="light"
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl
                       border border-accent-violet/25 bg-gradient-to-r from-accent-pink/[0.08] to-accent-violet/[0.08]
                       hover:from-accent-pink/[0.14] hover:to-accent-violet/[0.14] hover:border-accent-violet/40
                       transition-all duration-150 group"
          >
            <Plus className="w-4 h-4 text-accent-violet group-hover:text-accent-pink transition-colors shrink-0" />
            <span className="text-[13px] font-medium text-text-primary">New chat</span>
            <span className="ml-auto text-[10px] text-text-muted/70 font-mono hidden lg:inline">⌘⌥N</span>
          </Pressable>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto divide-y divide-dark-border/30">
          {sortedChats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => { switchChat(chat.id); uiStore.setSidebarOpen(false) }}
              onContextMenu={(e) => handleContextMenu(e, chat.id)}
              className={`
                group relative px-3 py-2.5 cursor-pointer
                transition-all duration-100 ease-in-out
                ${activeChatId === chat.id
                  ? 'bg-dark-elevated/60'
                  : 'hover:bg-dark-elevated/40'
                }
              `}
            >
              {/* Pin indicator */}
              {pinnedChats.has(chat.id) && (
                <Pin className="absolute top-2 right-2 w-3 h-3 text-cyan-400 fill-cyan-400" />
              )}

              {/* Star indicator */}
              {starredChats.has(chat.id) && (
                <Star className="absolute top-2 right-7 w-3 h-3 text-yellow-400 fill-yellow-400" />
              )}

              <div className="flex items-start gap-0">
                <div className="flex-1 min-w-0">
                  {editingChatId === chat.id ? (
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => uiStore.setEditingTitle(e.target.value)}
                      onBlur={handleSaveRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename()
                        if (e.key === 'Escape') {
                          uiStore.setEditingChatId(null)
                          uiStore.setEditingTitle('')
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-dark-bg/50 text-text-primary text-sm font-medium
                               rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-accent-violet"
                      autoFocus
                    />
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0">
                      {chat.metadata?.isDrift && (
                        <GitBranch className="w-3 h-3 text-accent-violet/70 shrink-0" />
                      )}
                      <h3
                        className={`text-[13px] font-medium truncate min-w-0 ${chat.metadata?.isDrift ? 'text-accent-violet/90' : 'text-text-primary'} ${getRTLClassName(chat.title)}`}
                        dir={getTextDirection(chat.title)}
                      >
                        {chat.title}
                      </h3>
                    </div>
                  )}
                  <p
                    className={`text-[11px] text-text-muted truncate mt-0.5 ${getRTLClassName(chat.lastMessage || '')}`}
                    dir={getTextDirection(chat.lastMessage || '')}
                  >
                    {chat.lastMessage ? stripMarkdown(chat.lastMessage) : ''}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Settings */}
        <div className="border-t border-dark-border/30 px-2 py-1">
          <button
            onClick={() => uiStore.setSettingsOpen(true)}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-dark-elevated/60 transition-colors text-sm text-text-primary"
          >
            <SettingsIcon className="w-4 h-4 text-text-muted" />
            Settings
          </button>
        </div>

        {/* Sidebar Footer: current user with menu */}
        <div className="relative border-t border-dark-border/30 p-2" ref={userMenuRef}>
          <button
            onClick={() => uiStore.setUserMenuOpen(!userMenuOpen)}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-dark-elevated/60 transition-colors"
            title="Account menu"
          >
            <div className="w-7 h-7 rounded-full bg-accent-violet/30 flex items-center justify-center text-[11px] text-accent-violet font-medium">
              {(currentUser?.[0]?.toUpperCase() || 'U')}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <span className="text-sm text-text-primary truncate block">{currentUser || 'User'}</span>
              <span className="text-[10px] text-text-muted">Signed in</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {userMenuOpen && (
            <div className="absolute bottom-12 left-2 right-2 bg-dark-surface border border-dark-border/60 rounded-lg shadow-xl overflow-hidden z-50">
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-dark-elevated/60"
                onClick={() => { uiStore.setUserMenuOpen(false); uiStore.setProfileOpen(true); }}
              >
                <User className="w-4 h-4 text-text-muted" />
                View profile
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-dark-elevated/60"
                onClick={() => { uiStore.setSettingsOpen(true); uiStore.setUserMenuOpen(false) }}
              >
                <SettingsIcon className="w-4 h-4 text-text-muted" />
                Settings
              </button>
              <div className="h-px bg-dark-border/60" />
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                onClick={() => { uiStore.setUserMenuOpen(false); handleLogout() }}
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <div
        className={`
          flex-1 min-w-0 flex flex-col relative
          transition-all duration-150 ease-in-out
          ${sidebarOpen ? 'lg:ml-[340px]' : 'ml-0'}
          ${(driftOpen || knowledgeGraphOpen) ? 'lg:mr-[480px]' : 'mr-0'}
        `}
        onTouchStart={swipeHandlers.onTouchStart}
        onTouchEnd={swipeHandlers.onTouchEnd}
      >
        {/* Header */}
        <header className="relative z-10 border-b border-dark-border/30 backdrop-blur-sm bg-dark-bg/80 pt-safe">
          <div className="px-2 py-0.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              {!sidebarOpen ? (
                <>
                  <button
                    onClick={() => uiStore.setSidebarOpen(true)}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-dark-elevated rounded-lg transition-colors duration-75"
                    title="Open sidebar"
                  >
                    <Menu className="w-4 h-4 text-text-muted" />
                  </button>
                  <div className="w-px h-6 bg-dark-border/30" />
                </>
              ) : (
                <div className="w-[36px]" />
              )}

              <div className="flex items-center gap-2 min-w-0">
                {/* Search — across every conversation and drift */}
                <button
                  onClick={() => setSearchOpen(true)}
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-dark-elevated rounded-lg transition-colors duration-75 group shrink-0"
                  title="Search (⌘K)"
                >
                  <Search className="w-5 h-5 text-text-muted group-hover:text-accent-violet transition-colors duration-75" />
                </button>

                {/* Snippet Gallery Button — hidden on mobile */}
                <button
                  onClick={() => uiStore.setGalleryOpen(true)}
                  className="hidden lg:flex p-2.5 min-w-[44px] min-h-[44px] items-center justify-center hover:bg-dark-elevated rounded-lg transition-colors duration-75 group relative shrink-0"
                  title="Snippet Gallery"
                >
                  <Bookmark className="w-5 h-5 text-text-muted group-hover:text-cyan-400 transition-colors duration-75" />
                  {snippetCount > 0 && (
                    <span className="absolute -top-1 -right-1 text-[10px] bg-cyan-500 text-dark-bg px-1.5 py-0.5 rounded-full min-w-[18px] text-center font-medium">
                      {snippetCount}
                    </span>
                  )}
                </button>

                {/* Current-chat context — always shows where you are. For a drift
                    chat it renders the full path (root › term › term) so "where am
                    I / how do I get back up" is visible and one tap from anywhere. */}
                {(() => {
                  const currentChat = chatHistory.find(c => c.id === activeChatId)
                  const title = currentChat?.title?.trim()
                  if (!title || messages.length === 0) return null

                  // Walk up parentChatId to build the trail from root → here.
                  const chain: { id: string; label: string; isDrift: boolean; sourceMessageId?: string }[] = []
                  const guard = new Set<string>()
                  let cur: typeof currentChat | undefined = currentChat
                  while (cur && !guard.has(cur.id)) {
                    guard.add(cur.id)
                    const isDrift = !!cur.metadata?.isDrift
                    chain.unshift({
                      id: cur.id,
                      label: (isDrift ? (cur.metadata?.selectedText || cur.title) : cur.title)?.trim() || 'Chat',
                      isDrift,
                      sourceMessageId: cur.metadata?.sourceMessageId,
                    })
                    const pid = cur.metadata?.parentChatId
                    cur = pid ? chatHistory.find(c => c.id === pid) : undefined
                  }

                  // Plain root chat — keep the simple single-title affordance.
                  if (chain.length <= 1) {
                    const isDriftChat = !!currentChat?.metadata?.isDrift
                    return (
                      <button
                        onClick={() => uiStore.setSidebarOpen(true)}
                        className="flex items-center gap-1.5 min-w-0 px-1.5 py-1 rounded-lg hover:bg-dark-elevated/60 transition-colors duration-75 group"
                        title={isDriftChat ? `Drift · ${title}` : title}
                      >
                        {isDriftChat && <GitBranch className="w-3 h-3 text-accent-violet/70 shrink-0" />}
                        <span
                          className={`truncate text-[13px] font-medium ${isDriftChat ? 'text-accent-violet/85' : 'text-text-secondary'} group-hover:text-text-primary transition-colors max-w-[40vw] lg:max-w-[280px] ${getRTLClassName(title)}`}
                          dir={getTextDirection(title)}
                        >
                          {title}
                        </span>
                      </button>
                    )
                  }

                  // Drift chat — full breadcrumb. Tapping an ancestor switches to it
                  // and scrolls to the message the child branched from.
                  const goToCrumb = (crumb: typeof chain[number], childSourceMessageId?: string) => {
                    haptics.selection()
                    switchChat(crumb.id)
                    if (childSourceMessageId) {
                      setTimeout(() => {
                        const el = document.querySelector(`[data-message-id="${childSourceMessageId}"]`)
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          el.classList.add('highlight-message')
                          setTimeout(() => el.classList.remove('highlight-message'), 2000)
                        }
                      }, 150)
                    }
                  }
                  return (
                    <div
                      className="flex items-center gap-0 min-w-0 overflow-x-auto max-w-[52vw] lg:max-w-[420px] [&::-webkit-scrollbar]:hidden"
                      style={{ scrollbarWidth: 'none' }}
                    >
                      {chain.map((crumb, i) => {
                        const isLast = i === chain.length - 1
                        const childSrc = chain[i + 1]?.sourceMessageId
                        return (
                          <span key={crumb.id} className="flex items-center gap-0 shrink-0">
                            <button
                              onClick={() => isLast ? uiStore.setSidebarOpen(true) : goToCrumb(crumb, childSrc)}
                              className={`flex items-center gap-1 px-1 py-1 rounded-md hover:bg-dark-elevated/60 transition-colors duration-75
                                ${isLast
                                  ? (crumb.isDrift ? 'text-accent-violet/90' : 'text-text-secondary')
                                  : 'text-text-muted hover:text-text-secondary'}`}
                              title={crumb.label}
                            >
                              {i === 0 && !crumb.isDrift && <Home className="w-3 h-3 shrink-0" />}
                              {crumb.isDrift && isLast && <GitBranch className="w-3 h-3 text-accent-violet/70 shrink-0" />}
                              <span
                                className={`truncate text-[13px] font-medium max-w-[24vw] lg:max-w-[160px] ${getRTLClassName(crumb.label)}`}
                                dir={getTextDirection(crumb.label)}
                              >
                                {crumb.label}
                              </span>
                            </button>
                            {!isLast && <ChevronRight className="w-3 h-3 text-text-muted/40 shrink-0" />}
                          </span>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Reopen last drift — one tap back to the branch you just left.
                  Hidden while the panel/tree is open (you're already there), and
                  only shown for a drift that belongs to the chat you're viewing —
                  otherwise a stale branch from another conversation leaks in. */}
              {lastDrift && lastDrift.parentChatId === activeChatId && !driftOpen && !knowledgeGraphOpen && (
                <Pressable
                  onClick={reopenLastDrift}
                  haptic={null}
                  title={`Reopen drift · "${lastDrift.selectedText}"`}
                  className="flex items-center gap-1.5 h-9 pl-2 pr-2.5 rounded-full
                             border border-accent-violet/25 bg-accent-violet/[0.07]
                             text-accent-violet/85 hover:text-accent-violet hover:bg-accent-violet/[0.12]
                             hover:border-accent-violet/40 transition-all duration-150 group max-w-[34vw] sm:max-w-[200px]"
                >
                  <CornerUpLeft className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[12px] font-medium truncate">{lastDrift.selectedText}</span>
                </Pressable>
              )}

              {/* Drift Tree Button — first-class control whenever the thread has
                  branched. Shows a label on mobile so it's unmistakably reachable. */}
              {totalDriftCount > 0 && (
                <Pressable
                  onClick={() => { haptics.selection(); setKnowledgeGraphOpen(!knowledgeGraphOpen) }}
                  haptic={null}
                  title="Drift Map (⌘⌥G)"
                  className={`h-9 px-2.5 flex items-center justify-center gap-1.5 rounded-full transition-all duration-150 relative
                    ${knowledgeGraphOpen
                      ? 'text-accent-violet bg-accent-violet/[0.12] border border-accent-violet/40'
                      : 'text-text-secondary border border-accent-violet/25 bg-accent-violet/[0.06] hover:text-accent-violet hover:bg-accent-violet/[0.12] hover:border-accent-violet/40'
                    }`}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <defs>
                      <linearGradient id="drift-icon-g" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#ff006e"/>
                        <stop offset="1" stopColor="#a855f7"/>
                      </linearGradient>
                    </defs>
                    <circle cx="14" cy="14" r="2.5" stroke={knowledgeGraphOpen ? 'url(#drift-icon-g)' : 'currentColor'} strokeWidth="1.5"/>
                    <circle cx="4" cy="4" r="2.5" stroke={knowledgeGraphOpen ? 'url(#drift-icon-g)' : 'currentColor'} strokeWidth="1.5"/>
                    <circle cx="4" cy="14" r="2.5" stroke={knowledgeGraphOpen ? 'url(#drift-icon-g)' : 'currentColor'} strokeWidth="1.5"/>
                    <path d="M4 6.5v5" stroke={knowledgeGraphOpen ? 'url(#drift-icon-g)' : 'currentColor'} strokeWidth="1.5"/>
                    <path d="M6.5 4h5a2 2 0 0 1 2 2v5.5" stroke={knowledgeGraphOpen ? 'url(#drift-icon-g)' : 'currentColor'} strokeWidth="1.5"/>
                  </svg>
                  <span className="text-[12px] font-medium leading-none">Map</span>
                  <span className={`text-[11px] font-semibold leading-none tabular-nums ${knowledgeGraphOpen ? 'text-accent-violet' : 'text-accent-violet/80'}`}>
                    {totalDriftCount}
                  </span>
                </Pressable>
              )}
              {/* New Chat Button */}
              <button
                onClick={createNewChat}
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-dark-elevated rounded-lg transition-colors duration-75 group"
                title="New chat (⌘⌥N)"
              >
                <Plus className="w-4 h-4 text-text-muted group-hover:text-accent-pink transition-colors duration-75" />
              </button>
              {/* Model picker — hidden on mobile */}
              <div className="hidden lg:flex">
                <HeaderControls
                  aiSettings={aiSettings}
                  selectedTargets={selectedTargets}
                  setSelectedTargets={setSelectedTargetsPersist}
                  isConnecting={isConnecting}
                  apiConnected={apiConnected}
                />
              </div>
            </div>
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0" style={{ touchAction: 'pan-y' }}>
            <div style={{ paddingBottom: selectedTargets.length > 1 ? 'calc(12rem + var(--kb-h, 0px))' : 'calc(9rem + var(--kb-h, 0px))' }} className={`h-full overflow-y-auto pt-6 space-y-2 chat-messages-container`} data-context-links-version={contextLinkVersion}>

              {/* Scroll to bottom button */}
              {showScrollButton && (
                <div className={`fixed bottom-24 z-20 transition-all duration-150
                  left-1/2 lg:${sidebarOpen ? 'left-[calc(50%+170px)]' : 'left-1/2'}
                  transform -translate-x-1/2
                  ${(driftOpen || knowledgeGraphOpen) ? 'lg:-translate-x-[calc(50%+240px)]' : ''}
                `}>
                  <button
                    onClick={() => {
                      userHasScrolled.current = false
                      scrollToBottom()
                    }}
                    className="
                      group relative
                      w-10 h-10 rounded-full
                      bg-dark-elevated/90 backdrop-blur-sm
                      border border-dark-border/50
                      shadow-[0_4px_12px_rgba(0,0,0,0.5)]
                      flex items-center justify-center
                      hover:bg-gradient-to-r hover:from-accent-violet/20 hover:to-accent-pink/20
                      hover:border-accent-violet/40
                      transition-all duration-200 hover:scale-110
                      animate-fade-up
                    "
                    title="Scroll to bottom"
                  >
                    <ArrowDown className="w-4 h-4 text-text-muted group-hover:text-accent-violet transition-colors animate-gentle-pulse" />
                  </button>
                </div>
              )}


              {/* Show parent chat link if this is a saved drift */}
              {(() => {
                const currentChat = chatHistory.find(c => c.id === activeChatId)
                if (!currentChat?.metadata?.isDrift) return null
                const parentChat = chatHistory.find(c => c.id === currentChat.metadata?.parentChatId)
                const parentTitle = parentChat?.title || 'Previous conversation'
                return (
                  <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-lg border border-dark-border/25 bg-dark-elevated/25 max-w-5xl mx-auto min-w-0">
                    <GitBranch className="w-3 h-3 text-accent-violet/50 shrink-0" />
                    <span className="text-[12px] italic text-text-secondary/80 font-medium shrink-0 leading-none">
                      "{currentChat.metadata?.selectedText}"
                    </span>
                    <span className="text-text-muted/25 shrink-0 text-[11px] leading-none select-none">·</span>
                    <span className="text-[11px] text-text-muted/55 truncate flex-1 min-w-0 leading-none">
                      {parentTitle}
                    </span>
                    <button
                      onClick={() => {
                        if (currentChat.metadata?.parentChatId) {
                          switchChat(currentChat.metadata.parentChatId)
                          setTimeout(() => {
                            const sourceMessageId = currentChat.metadata?.sourceMessageId
                            const selectedText = currentChat.metadata?.selectedText
                            let sourceElement: Element | null = null
                            if (sourceMessageId) {
                              sourceElement = document.querySelector(`div[data-message-id="${sourceMessageId}"]`) ||
                                            document.querySelector(`div[data-message-id="msg-${sourceMessageId}"]`)
                            }
                            if (!sourceElement && selectedText) {
                              const allMessages = document.querySelectorAll('div[data-message-id]')
                              for (const msg of allMessages) {
                                if (msg.textContent && msg.textContent.includes(selectedText)) {
                                  sourceElement = msg
                                  break
                                }
                              }
                            }
                            if (sourceElement) {
                              sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                              sourceElement.classList.add('highlight-message', 'pulse-twice')
                              setTimeout(() => sourceElement!.classList.remove('pulse-twice'), 2000)
                              setTimeout(() => sourceElement!.classList.remove('highlight-message'), 3000)
                            }
                          }, 150)
                        }
                      }}
                      className="flex items-center gap-0.5 text-[11px] font-medium text-accent-violet/70
                               hover:text-accent-violet rounded-full px-2 py-1 hover:bg-accent-violet/[0.08]
                               transition-colors duration-150 shrink-0 leading-none"
                      title="Back to the source conversation"
                    >
                      <ChevronLeft className="w-3 h-3" />
                      Back
                    </button>
                  </div>
                )
              })()}

              {/* Empty state */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center text-center px-8 pt-[22vh] pb-16">
                  <div className="mb-6">
                    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" className="mx-auto mb-5" strokeLinecap="round" strokeLinejoin="round">
                      <defs>
                        <linearGradient id="dg" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#ff006e"/>
                          <stop offset="1" stopColor="#a855f7"/>
                        </linearGradient>
                      </defs>
                      <circle cx="18" cy="18" r="3" stroke="url(#dg)" strokeWidth="1.8"/>
                      <circle cx="6" cy="6" r="3" stroke="url(#dg)" strokeWidth="1.8"/>
                      <circle cx="6" cy="18" r="3" stroke="url(#dg)" strokeWidth="1.8"/>
                      <path d="M6 9v6" stroke="url(#dg)" strokeWidth="1.8"/>
                      <path d="M9 6h10a2 2 0 0 1 2 2v7" stroke="url(#dg)" strokeWidth="1.8"/>
                    </svg>
                    <h2 className="text-text-primary font-semibold text-[22px] leading-snug mb-2">What's on your mind?</h2>
                    <p className="text-text-muted text-[14px] leading-relaxed max-w-[280px] mx-auto">Ask anything to begin.</p>
                  </div>
                  {/* Concept cue — teaches the core gesture without a tutorial wall. */}
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-full border border-accent-violet/20 bg-accent-violet/[0.05] mt-1">
                    <MousePointerClick className="w-4 h-4 text-accent-violet/70 shrink-0" />
                    <p className="text-text-muted text-[13px] leading-snug">
                      Highlight any phrase in a reply to <span className="text-accent-violet font-medium">drift</span> into a focused side-thread.
                    </p>
                  </div>
                </div>
              )}

              {/* Message list */}
              {messages.map((msg, index) => {
                if (msg.canvasId) return null
                const isDriftHeader = msg.isDriftPush && msg.text.startsWith('📌')
                const isDriftMessage = msg.isDriftPush && !msg.text.startsWith('📌')
                const prevMsg = index > 0 ? messages[index - 1] : null
                const nextMsg = index < messages.length - 1 ? messages[index + 1] : null
                const isFirstDriftMessage = isDriftMessage && prevMsg?.isDriftPush && prevMsg?.text.startsWith('📌')
                const isLastDriftMessage = isDriftMessage && (!nextMsg?.isDriftPush || nextMsg?.text.startsWith('📌'))
                const isSinglePushMessage = isDriftMessage &&
                  msg.driftPushMetadata?.sourceMessageId?.includes('-single-') &&
                  !msg.isHiddenContext
                const hasMultipleDriftMessages = isDriftMessage && !isSinglePushMessage && (
                  (nextMsg?.isDriftPush && !nextMsg?.text.startsWith('📌') && !nextMsg?.isHiddenContext) ||
                  (prevMsg?.isDriftPush && !prevMsg?.text.startsWith('📌') && !prevMsg?.isHiddenContext)
                )
                const isPlainAI = !msg.isUser && !isDriftMessage
                const isSynthesis = isPlainAI && msg.id.startsWith('synth-')

                if (isDriftHeader || msg.isHiddenContext) return null

                // Broadcast group rendering
                if (msg.broadcastGroupId) {
                  if (index > 0 && messages[index - 1]?.broadcastGroupId === msg.broadcastGroupId) return null
                  const groupId = msg.broadcastGroupId
                  const groupMessages: Message[] = []
                  for (let j = index; j < messages.length; j++) {
                    const m = messages[j]
                    if (m.broadcastGroupId === groupId) groupMessages.push(m)
                    else break
                  }
                  return (
                    <div
                      key={`bg-${groupId}-${index}`}
                      className="max-w-5xl mx-auto px-6"
                      data-broadcast-group={groupId}
                    >
                      {/* Mobile: horizontal scroll-snap carousel */}
                      <div className="md:hidden">
                        <MultiModelCarousel
                          messages={groupMessages}
                          broadcastGroupId={groupId}
                          activeBroadcastGroupId={activeBroadcastGroupId}
                          onContinueWith={continueWithModel}
                          onActiveCardChange={(modelTag) => setActiveCarouselModel(modelTag)}
                        />
                      </div>

                      {/* Desktop: existing 2-column grid */}
                      <div className="hidden md:block">
                      <div className="grid gap-4 items-start md:grid-cols-2">
                        {groupMessages.map((gm) => (
                          <div key={`resp-${gm.id}`} className="w-full">
                            <div className={`flex justify-start animate-fade-up relative group`}>
                              <div
                                className={`ai-message bg-dark-bubble border border-dark-border/50 text-text-secondary shadow-lg shadow-black/20 rounded-2xl px-5 ${gm.modelTag ? 'pt-7 pb-3' : 'py-3'} relative transition-all duration-100 hover:scale-[1.02] hover:border-accent-violet/30 select-text`}
                                data-message-id={gm.id}
                              >
                                {gm.modelTag && (() => {
                                  const canvasId = `${groupId}:${gm.modelTag}`
                                  return (
                                    <button
                                      onClick={() => setActiveCanvasId(canvasId)}
                                      className="absolute top-2 left-3 z-10 px-1.5 py-0.5 rounded bg-dark-elevated/90 border border-dark-border/50 text-[10px] text-text-muted hover:border-accent-violet/50 hover:text-text-secondary transition-colors whitespace-nowrap"
                                      title={`Show ${gm.modelTag} thread`}
                                    >
                                      {gm.modelTag}
                                    </button>
                                  )
                                })()}
                                {gm.modelTag && gm.broadcastGroupId === activeBroadcastGroupId && (
                                  <button
                                    onClick={() => continueWithModel(gm.modelTag, gm.id)}
                                    className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-dark-elevated border border-accent-violet/40 text-[10px] font-medium text-accent-violet hover:bg-accent-violet/10 transition-colors opacity-0 group-hover:opacity-100"
                                    title={`Continue with ${gm.modelTag}`}
                                  >
                                    Continue
                                  </button>
                                )}
                                {gm.text && gm.text.length > 0 ? (
                                  <div className="prose prose-invert prose-sm max-w-none relative text-[13px] leading-6">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}
                                      components={{
                                        p: ({ children }) => <p>{processEntityText(children, gm.id)}</p>,
                                        li: ({ children }) => <li>{processEntityText(children, gm.id)}</li>,
                                        th: ({ children }) => <th>{processEntityText(children, gm.id)}</th>,
                                        td: ({ children }) => <td>{processEntityText(children, gm.id)}</td>,
                                      }}
                                    >
                                      {gm.text.replace(/```([\s\S]*?)```/g, (_m, p1) => `\n\n\`\`\`\n${p1}\n\`\`\`\n\n`)}
                                    </ReactMarkdown>
                                  </div>
                                ) : (
                                  <div className="flex gap-1 py-1">
                                    <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Per-model continuation canvases */}
                        {groupMessages.map((gm) => {
                          const canvasId = `${groupId}:${gm.modelTag}`
                          const canvasMsgs = messages.filter(m => m.canvasId === canvasId)
                          const lastAssistant = [...canvasMsgs].reverse().find(m => !m.isUser && m.modelTag)
                          return (
                            <div key={`canvas-${gm.id}`} className="w-full">
                              {canvasMsgs.length > 0 && (
                                <div className={`mt-3 pl-3 border-l ${activeCanvasId === canvasId ? 'border-accent-violet/15' : 'border-dark-border/30'} transition-colors`}>
                                  {canvasMsgs.map((cm) => (
                                    <div key={cm.id} className="mb-3">
                                      <div className={`flex ${cm.isUser ? 'justify-end' : 'justify-start'} relative`}>
                                        <div data-message-id={cm.id} className={`${cm.isUser
                                          ? 'bg-gradient-to-br from-accent-pink to-accent-violet text-white'
                                          : 'ai-message bg-dark-bubble border border-dark-border/50 text-text-secondary'} rounded-2xl px-5 py-3 shadow-lg max-w-[85%] ${continueFromMessageId === cm.id ? 'ring-1 ring-accent-violet/25' : ''}`}
                                        >
                                          <div className={`${getRTLClassName(cm.text)}`} dir={getTextDirection(cm.text)}>
                                            <ReactMarkdown className="prose prose-sm prose-invert max-w-none text-[13px] leading-6"
                                              remarkPlugins={[remarkGfm]}
                                              components={{
                                                p: ({ children }) => <p>{processEntityText(children, cm.id)}</p>,
                                                li: ({ children }) => <li>{processEntityText(children, cm.id)}</li>,
                                                th: ({ children }) => <th>{processEntityText(children, cm.id)}</th>,
                                                td: ({ children }) => <td>{processEntityText(children, cm.id)}</td>,
                                              }}
                                            >
                                              {cm.text.replace(/<br>/g, '\n').replace(/<br\/>/g, '\n')}
                                            </ReactMarkdown>
                                          </div>
                                        </div>
                                        {lastAssistant && cm.id === lastAssistant.id && (
                                          <button
                                            onClick={() => continueWithModel(lastAssistant.modelTag, lastAssistant.id)}
                                            className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-dark-elevated border border-accent-violet/40 text-[10px] font-medium text-accent-violet hover:bg-accent-violet/10 transition-colors opacity-0 group-hover:opacity-100"
                                          >
                                            Continue
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      </div> {/* end hidden md:block */}
                    </div>
                  )
                }

                return msg.text ? (
                  <div
                    className={`max-w-5xl mx-auto ${msg.isUser ? 'mt-6' : 'mb-1'} ${msg.strandId && msg.strandId === activeStrandId ? 'pl-3 border-l-2 border-accent-violet/30' : ''} ${isDriftMessage ? 'drift-promoted' : ''} ${isDriftMessage && justPromotedChatId && msg.driftPushMetadata?.driftChatId === justPromotedChatId ? 'drift-promoted-arrive' : ''}`}
                    data-drift-promoted={isDriftMessage ? 'true' : undefined}
                    key={msg.id}
                  >
                    {/* Drift group header */}
                    {isFirstDriftMessage && hasMultipleDriftMessages && (
                      <div className="px-6 mb-2">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 rounded-full bg-dark-elevated/60 border border-dark-border/50 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                            Drift
                          </span>
                          {msg.driftPushMetadata?.selectedText && (
                            <span className="text-xs text-text-muted italic">
                              "{msg.driftPushMetadata.selectedText}"
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className={`px-5 ${isDriftMessage && hasMultipleDriftMessages ? 'pl-8 border-l border-dark-border/40' : ''}`}>
                      {isPlainAI && msg.modelTag && (
                        <div className="text-[11px] text-text-secondary mb-1 mt-1">{msg.modelTag}</div>
                      )}
                      {/* Subtle drift origin tag — shown on every non-user pushed message */}
                      {isDriftMessage && !msg.isUser && (
                        <div className="flex items-center gap-1.5 mb-1.5 mt-0.5">
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md
                            bg-accent-violet/[0.08] border border-accent-violet/20
                            text-[9px] font-semibold text-accent-violet/80 tracking-wide uppercase">
                            ↗ drift
                          </span>
                          {(isSinglePushMessage || isFirstDriftMessage) && msg.driftPushMetadata?.selectedText && (
                            <span className="text-[11px] text-text-muted italic truncate max-w-[260px]">
                              "{msg.driftPushMetadata.selectedText}"
                            </span>
                          )}
                        </div>
                      )}
                      <div
                        className={`flex ${
                          msg.isDriftPush && !msg.isUser && msg.driftPushMetadata?.originSide === 'right'
                            ? 'justify-end'
                            : msg.isUser ? 'justify-end' : 'justify-start'
                        } animate-fade-up relative group
                                    ${isDriftMessage && hasMultipleDriftMessages && !isLastDriftMessage ? 'mb-2' : ''}`}
                        /* Gentle cascade on load; capped so a new message in a long
                           thread still appears promptly rather than waiting out a
                           per-index delay. */
                        style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                      >
                        <div
                          className={`
                            ${isSynthesis
                              ? 'synthesis-card w-full'
                              : (isPlainAI || isDriftMessage || isSinglePushMessage)
                              ? 'w-full py-2'
                              : `max-w-[80%] rounded-2xl px-5 ${!msg.isUser && msg.modelTag ? 'pt-7 pb-3' : 'py-3'}`
                            } min-w-0 relative
                            ${(isPlainAI || isDriftMessage || isSinglePushMessage)
                              ? `ai-message text-text-secondary${(isDriftMessage || isSinglePushMessage) ? ' cursor-pointer' : ''}`
                              : msg.isUser
                                ? 'bg-gradient-to-br from-accent-pink to-accent-violet text-white shadow-lg shadow-accent-pink/20'
                                : 'ai-message bg-dark-bubble border border-dark-border/50 text-text-secondary shadow-lg shadow-black/20'
                            }
                            ${!isPlainAI && !isDriftMessage && !isSinglePushMessage ? 'transition-all duration-100 hover:scale-[1.02]' : ''}
                            ${!msg.isUser ? 'select-text' : ''}
                          `}
                          data-message-id={msg.id}
                          onClick={() => {
                            if (isDriftMessage && msg.driftPushMetadata) {
                              if (msg.driftPushMetadata.wasSavedAsChat && msg.driftPushMetadata.driftChatId) {
                                const driftChat = chatHistory.find(c => c.id === msg.driftPushMetadata?.driftChatId)
                                if (driftChat) {
                                  switchChat(msg.driftPushMetadata.driftChatId)
                                } else {
                                  switchChat(msg.driftPushMetadata.parentChatId)
                                  setTimeout(() => {
                                    const sourceElement = document.querySelector(`[data-message-id="${msg.driftPushMetadata?.sourceMessageId}"]`)
                                    if (sourceElement) {
                                      sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                      sourceElement.classList.add('highlight-message')
                                      setTimeout(() => sourceElement.classList.remove('highlight-message'), 2000)
                                    }
                                  }, 150)
                                }
                              } else {
                                const driftChatId = msg.driftPushMetadata.driftChatId
                                const originalSourceId = msg.driftPushMetadata.sourceMessageId.split('-single-')[0].split('-push-')[0]
                                const needsSwitch = activeChatId !== msg.driftPushMetadata.parentChatId

                                if (needsSwitch) switchChat(msg.driftPushMetadata.parentChatId)

                                const currentMessages = needsSwitch ?
                                  chatHistory.find(c => c.id === msg.driftPushMetadata?.parentChatId)?.messages || [] :
                                  messages

                                const allDriftMessages = currentMessages.filter(m =>
                                  m.isDriftPush &&
                                  m.driftPushMetadata?.driftChatId === driftChatId &&
                                  !m.text.startsWith('📌')
                                ).map(m => ({ ...m, isHiddenContext: false }))

                                const driftConversation = allDriftMessages
                                  .sort((a, b) => {
                                    const aMatch = a.id.match(/-msg-(\d+)-/)
                                    const bMatch = b.id.match(/-msg-(\d+)-/)
                                    if (aMatch && bMatch) return parseInt(aMatch[1]) - parseInt(bMatch[1])
                                    return a.timestamp.getTime() - b.timestamp.getTime()
                                  })
                                  .map(m => ({
                                    id: m.id,
                                    text: m.text,
                                    isUser: (m as any).originalIsUser ?? m.isUser,
                                    timestamp: m.timestamp
                                  }))

                                const finalDriftConversation = driftConversation.length > 0 &&
                                  !driftConversation[0].text.includes('What would you like to know about') ?
                                  [{
                                    id: 'drift-system-reconstructed',
                                    text: `What would you like to know about "${msg.driftPushMetadata!.selectedText}"?`,
                                    isUser: false,
                                    timestamp: new Date(driftConversation[0].timestamp.getTime() - 1000)
                                  }, ...driftConversation] :
                                  driftConversation

                                if (driftChatId) {
                                  driftStore.saveTempConversation(driftChatId, finalDriftConversation)
                                }

                                if (needsSwitch) {
                                  setTimeout(() => {
                                    handleStartDrift(msg.driftPushMetadata!.selectedText, originalSourceId, driftChatId, finalDriftConversation)
                                  }, 200)
                                } else {
                                  handleStartDrift(msg.driftPushMetadata!.selectedText, originalSourceId, driftChatId, finalDriftConversation)
                                }
                              }
                            }
                          }}
                        >


                          {/* Strand bead */}
                          {msg.strandId && msg.strandId === activeStrandId && (
                            <>
                              {(!messages[index - 1] || messages[index - 1]?.strandId !== msg.strandId) && (
                                <div className="absolute -left-2 top-2 w-2 h-2 rounded-full bg-accent-violet/60" />
                              )}
                            </>
                          )}

                          {/* Model tag */}
                          {!msg.isUser && !isPlainAI && msg.modelTag && !isDriftMessage && !isSinglePushMessage && (
                            msg.broadcastGroupId ? (
                              <button
                                onClick={() => setActiveCanvasId(`${msg.broadcastGroupId}:${msg.modelTag}`)}
                                className="absolute top-2 left-3 z-10 px-1.5 py-0.5 rounded bg-dark-elevated/90 border border-dark-border/50 text-[10px] text-text-muted hover:border-accent-violet/50 hover:text-text-secondary transition-colors whitespace-nowrap"
                                title={`Show ${msg.modelTag} thread`}
                              >
                                {msg.modelTag}
                              </button>
                            ) : (
                              <div className="absolute top-2 left-3 z-10 px-1.5 py-0.5 rounded bg-dark-elevated/90 border border-dark-border/50 text-[10px] text-text-muted whitespace-nowrap">
                                {msg.modelTag}
                              </div>
                            )
                          )}

                          {/* Continue action when broadcast is active */}
                          {!msg.isUser && msg.modelTag && msg.broadcastGroupId && msg.broadcastGroupId === activeBroadcastGroupId && (
                            <button
                              onClick={() => continueWithModel(msg.modelTag, msg.id)}
                              className="absolute -top-2 right-4 px-2 py-0.5 rounded-full bg-dark-elevated border border-accent-violet/40 text-[9px] font-medium text-accent-violet hover:bg-accent-violet/10 transition-colors"
                              title={`Continue with ${msg.modelTag}`}
                            >
                              Continue
                            </button>
                          )}

                          {/* Inline Continue context banner */}
                          {!msg.isUser && continueFromMessageId === msg.id && (
                            <div className="mt-2 text-[11px] px-3 py-2 rounded-lg bg-dark-elevated/60 border border-accent-violet/30 text-text-secondary flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-full bg-dark-bubble border border-dark-border/50 text-[10px] text-accent-violet">
                                  Continuing with {msg.modelTag}
                                </span>
                                <span className="text-text-muted">Your next message will use this model</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    textareaRef.current?.focus()
                                    scrollToBottom()
                                  }}
                                  className="px-2 py-0.5 rounded bg-accent-violet/20 text-accent-violet border border-accent-violet/40 hover:bg-accent-violet/30 transition-colors"
                                >
                                  Write reply
                                </button>
                                <button
                                  onClick={() => {
                                    if (prevContinueTargetsRef.current) setSelectedTargetsPersist(prevContinueTargetsRef.current)
                                    setContinueFromMessageId(null)
                                  }}
                                  className="px-2 py-0.5 rounded bg-dark-bubble border border-dark-border/50 text-text-muted hover:text-text-secondary hover:bg-dark-elevated transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}


                          {/* Inline drift header — removed, label is now above the bubble */}
                          {false && (isSinglePushMessage || (isDriftMessage && !msg.isUser && isFirstDriftMessage)) && (
                            <div
                              className="absolute top-2 left-3 right-3 flex items-center gap-2 text-[10px] text-text-muted/80 cursor-pointer hover:text-accent-violet/90 transition-colors duration-150 z-20 pointer-events-auto overflow-hidden"
                              style={{ minWidth: '220px' }}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (msg.driftPushMetadata?.wasSavedAsChat && msg.driftPushMetadata?.driftChatId) {
                                  switchChat(msg.driftPushMetadata.driftChatId)
                                } else if (msg.driftPushMetadata) {
                                  const driftChatId = msg.driftPushMetadata.driftChatId
                                  const originalSourceId = msg.driftPushMetadata.sourceMessageId.split('-single-')[0].split('-push-')[0]
                                  const allDriftMessages = messages.filter(m =>
                                    m.isDriftPush &&
                                    m.driftPushMetadata?.driftChatId === driftChatId &&
                                    !m.text.startsWith('📌')
                                  ).map(m => ({ ...m, isHiddenContext: false }))

                                  const driftConversation = allDriftMessages
                                    .sort((a, b) => {
                                      const aMatch = a.id.match(/-msg-(\d+)-/)
                                      const bMatch = b.id.match(/-msg-(\d+)-/)
                                      if (aMatch && bMatch) return parseInt(aMatch[1]) - parseInt(bMatch[1])
                                      return a.timestamp.getTime() - b.timestamp.getTime()
                                    })
                                    .map(m => ({
                                      id: m.id,
                                      text: m.text,
                                      isUser: (m as any).originalIsUser ?? m.isUser,
                                      timestamp: m.timestamp
                                    }))

                                  const finalDriftConversation = driftConversation.length > 0 &&
                                    !driftConversation[0].text.includes('What would you like to know about') ?
                                    [{
                                      id: 'drift-system-reconstructed',
                                      text: `What would you like to know about "${msg.driftPushMetadata!.selectedText}"?`,
                                      isUser: false,
                                      timestamp: new Date(driftConversation[0].timestamp.getTime() - 1000)
                                    }, ...driftConversation] :
                                    driftConversation

                                  if (driftChatId) {
                                    driftStore.saveTempConversation(driftChatId, finalDriftConversation)
                                  }

                                  handleStartDrift(msg.driftPushMetadata!.selectedText, originalSourceId, driftChatId, finalDriftConversation)
                                }
                              }}
                              title={msg.driftPushMetadata?.wasSavedAsChat ? "Click to open drift conversation" : "Click to view full drift"}
                            >
                              {msg.modelTag && (
                                <span className="px-1.5 py-0.5 rounded bg-dark-elevated/70 border border-dark-border/50 text-[9px] text-text-muted whitespace-nowrap">
                                  {msg.modelTag}
                                </span>
                              )}
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <div className="flex items-baseline gap-1 min-w-0">
                                  <span className="text-text-secondary/80 text-[10px] shrink-0">From</span>
                                  <span className="truncate text-text-secondary/90">"{msg.driftPushMetadata?.selectedText}"</span>
                                </div>
                                {msg.driftPushMetadata?.userQuestion && (
                                  <div className="flex items-baseline gap-1 min-w-0">
                                    <span className="text-text-secondary/80 text-[10px] shrink-0">Q</span>
                                    <span className="truncate text-text-primary/80">"{msg.driftPushMetadata?.userQuestion}"</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Message content */}
                          {msg.isUser ? (
                            <p
                              className={`text-[14px] leading-6 font-medium ${getRTLClassName(msg.text)}`}
                              dir={getTextDirection(msg.text)}
                            >
                              {msg.text}
                            </p>
                          ) : msg.driftInfos && msg.driftInfos.length > 0 ? (
                            <div
                              className={`text-[13px] leading-6 ${getRTLClassName(msg.text)} ${streamingMessageId === msg.id ? 'drift-text-shimmer' : ''}`}
                              dir={getTextDirection(msg.text)}
                            >
                              <ReactMarkdown
                                className="prose prose-sm prose-invert max-w-none text-[15px] leading-7
                                  prose-headings:text-text-primary prose-headings:font-semibold prose-headings:mb-2 prose-headings:mt-3
                                  prose-p:text-text-secondary prose-p:mb-2
                                  prose-strong:text-text-primary prose-strong:font-semibold
                                  prose-ul:my-2 prose-ul:space-y-1
                                  prose-li:text-text-secondary prose-li:ml-4
                                  prose-code:text-accent-violet prose-code:bg-dark-bg/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                                  prose-pre:bg-dark-bg prose-pre:border prose-pre:border-dark-border/50 prose-pre:rounded-lg prose-pre:p-3
                                  prose-blockquote:border-l-accent-violet prose-blockquote:text-text-muted
                                  prose-a:text-accent-violet prose-a:no-underline hover:prose-a:underline"
                                remarkPlugins={[remarkGfm]}
                                components={(() => {
                                  let liCounter = 0
                                  const processDriftText = (children: any): React.ReactNode => {
                                    const drifts = msg.driftInfos!

                                    const injectIntoString = (text: string): React.ReactNode => {
                                      const matches: Array<{ start: number; end: number; drift: typeof drifts[0]; idx: number }> = []
                                      drifts.forEach((drift, idx) => {
                                        const pos = text.indexOf(drift.selectedText)
                                        if (pos !== -1) matches.push({ start: pos, end: pos + drift.selectedText.length, drift, idx })
                                      })
                                      if (!matches.length) return text
                                      matches.sort((a, b) => a.start - b.start)
                                      const out: React.ReactNode[] = []
                                      let cursor = 0
                                      for (const m of matches) {
                                        if (m.start < cursor) continue
                                        if (m.start > cursor) out.push(text.slice(cursor, m.start))
                                        out.push(
                                          <button
                                            key={`drift-${m.idx}-${m.drift.driftChatId}`}
                                            onClick={(e) => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              const existing = chatHistory.find(c => c.id === m.drift.driftChatId)?.messages
                                                ?? driftStore.getTempConversation(m.drift.driftChatId)
                                                ?? undefined
                                              handleStartDrift(m.drift.selectedText, msg.id, m.drift.driftChatId, existing, m.drift.templateType, undefined, m.drift.connectCards, m.drift.connectAnswers)
                                            }}
                                            onTouchEnd={(e) => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              const existing = chatHistory.find(c => c.id === m.drift.driftChatId)?.messages
                                                ?? driftStore.getTempConversation(m.drift.driftChatId)
                                                ?? undefined
                                              handleStartDrift(m.drift.selectedText, msg.id, m.drift.driftChatId, existing, m.drift.templateType, undefined, m.drift.connectCards, m.drift.connectAnswers)
                                            }}
                                            className="inline cursor-pointer
                                                     border-b border-accent-violet/50 hover:border-accent-violet
                                                     text-accent-violet hover:bg-accent-violet/10
                                                     rounded-sm transition-all duration-100"
                                            title={m.drift.driftChatId.startsWith('drift-temp-') ? "Open drift panel" : "View drift conversation"}
                                          >
                                            {m.drift.selectedText}
                                          </button>
                                        )
                                        cursor = m.end
                                      }
                                      if (cursor < text.length) out.push(text.slice(cursor))
                                      return out
                                    }

                                    const walkNode = (node: React.ReactNode): React.ReactNode => {
                                      if (typeof node === 'string') return injectIntoString(node)
                                      if (typeof node === 'number' || node == null || node === false) return node
                                      if (Array.isArray(node)) return node.map((n, i) => <span key={i}>{walkNode(n)}</span>)
                                      if (isValidElement(node)) {
                                        const props: any = (node as any).props || {}
                                        if ('children' in props) return cloneElement(node as any, { ...props, children: walkNode(props.children) })
                                        return node
                                      }
                                      return null
                                    }

                                    return walkNode(children)
                                  }
                                  // Unexplored suggestions: highlights not yet drifted on
                                  const exploredTexts = new Set(msg.driftInfos!.map(d => d.selectedText))
                                  const unexploredHl = (msg.suggestedHighlights ?? []).filter(h => !exploredTexts.has(h))
                                  const procWithBoth = (children: any): React.ReactNode => {
                                    const withDrifts = processDriftText(children)
                                    return unexploredHl.length ? processHighlightsText(withDrifts, msg.id, unexploredHl) : withDrifts
                                  }
                                  return {
                                    p: ({ children }) => <p className="mb-2">{procWithBoth(children)}</p>,
                                    td: ({ children }) => <td>{procWithBoth(children)}</td>,
                                    th: ({ children }) => <th>{procWithBoth(children)}</th>,
                                    li: ({ children }) => {
                                      const processed = procWithBoth(children)
                                      const anchorId = getAnchorId(msg.id, liCounter++)
                                      return <li><span id={anchorId}>{processed}</span></li>
                                    }
                                  }
                                })()}
                              >
                                {sanitizeText(msg.text)}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <div
                              className={`${getRTLClassName(msg.text)} ${streamingMessageId === msg.id ? 'drift-text-shimmer' : ''}`}
                              dir={getTextDirection(msg.text)}
                            >
                              <ReactMarkdown
                                className="text-[15px] leading-7 prose prose-sm prose-invert max-w-none
                                prose-headings:text-text-primary prose-headings:font-semibold prose-headings:mb-2 prose-headings:mt-3
                                prose-p:text-text-secondary prose-p:mb-2
                                prose-strong:text-text-primary prose-strong:font-semibold
                                prose-ul:my-2 prose-ul:space-y-1
                                prose-li:text-text-secondary prose-li:ml-4
                                prose-code:text-accent-violet prose-code:bg-dark-bg/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                                prose-pre:bg-dark-bg prose-pre:border prose-pre:border-dark-border/50 prose-pre:rounded-lg prose-pre:p-3
                                prose-blockquote:border-l-accent-violet prose-blockquote:text-text-muted
                                prose-a:text-accent-violet prose-a:no-underline hover:prose-a:underline
                                prose-table:w-full prose-table:border-collapse prose-table:overflow-hidden prose-table:rounded-lg
                                prose-thead:bg-dark-elevated/50 prose-thead:border-b prose-thead:border-dark-border/50
                                prose-th:text-text-primary prose-th:font-semibold prose-th:px-3 prose-th:py-2 prose-th:text-left
                                prose-td:text-text-secondary prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-dark-border/30
                                prose-tr:hover:bg-dark-elevated/20"
                                remarkPlugins={[remarkGfm]}
                                components={(() => {
                                  let liCounter = 0
                                  const hl = msg.suggestedHighlights ?? []
                                  const proc = (children: any) => {
                                    const base = processEntityText(children, msg.id)
                                    return hl.length ? processHighlightsText(base, msg.id, hl) : base
                                  }
                                  return {
                                    p: ({ children }: any) => <p className="mb-2">{proc(children)}</p>,
                                    li: ({ children }: any) => {
                                      const anchorId = getAnchorId(msg.id, liCounter++)
                                      return <li><span id={anchorId}>{proc(children)}</span></li>
                                    },
                                    th: ({ children }: any) => <th>{proc(children)}</th>,
                                    td: ({ children }: any) => <td>{proc(children)}</td>,
                                    br: () => <br />,
                                    table: ({ children }: any) => (
                                      <div className="overflow-x-auto my-4">
                                        <table className="min-w-full">{children}</table>
                                      </div>
                                    )
                                  }
                                })()}
                              >
                                {sanitizeText(msg.text)}
                              </ReactMarkdown>
                            </div>
                          )}

                          {/* Drift-into chips — AI-suggested next terms worth exploring.
                              Surfaces the unexplored highlights as one-tap branches so
                              "where do I go next" is explicit, not just inline. */}
                          {!msg.isUser && (() => {
                            const explored = new Set((msg.driftInfos ?? []).map(d => d.selectedText))
                            const nextTerms = (msg.suggestedHighlights ?? []).filter(h => h && !explored.has(h)).slice(0, 4)
                            if (nextTerms.length === 0) return null
                            return (
                              <div className="mt-3.5">
                                <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-violet/55">
                                  <GitBranch className="w-3 h-3" />
                                  Drift into
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {nextTerms.map((term) => (
                                    <button
                                      key={term}
                                      onClick={(e) => { e.stopPropagation(); haptics.selection(); handleStartDrift(term, msg.id) }}
                                      className="group inline-flex items-center gap-1.5 max-w-full pl-3 pr-2 py-1.5 rounded-full
                                        text-[12.5px] font-medium leading-none text-accent-violet/90
                                        border border-accent-violet/25 bg-accent-violet/[0.07]
                                        shadow-[0_1px_3px_rgba(0,0,0,0.15)]
                                        hover:bg-accent-violet/[0.14] hover:border-accent-violet/50 hover:text-accent-violet
                                        active:scale-[0.97] transition-all duration-150"
                                      title={`Drift into "${term}"`}
                                    >
                                      <span className="truncate">{term}</span>
                                      <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0 text-accent-violet/45 group-hover:text-accent-violet/90 transition-colors" />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )
                          })()}

                          {/* Bottom action row — Gemini-style */}
                          {!msg.isUser && (
                            <div className={`flex items-center gap-0.5 mt-2 ${!isPlainAI ? 'pt-1.5 border-t border-dark-border/20' : ''}`}>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCopyMessage(msg.text, msg.id) }}
                                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyMessage(msg.text, msg.id) }}
                                className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-dark-elevated/60 active:bg-dark-elevated transition-colors"
                                title="Copy"
                              >
                                {copiedMessageId === msg.id
                                  ? <Check className="w-4 h-4 text-green-400" />
                                  : <Copy className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleToggleSaveMessage(msg) }}
                                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleToggleSaveMessage(msg) }}
                                className={`p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors ${savedMessageIds.has(msg.id) ? 'text-cyan-400' : 'text-text-muted hover:text-text-primary hover:bg-dark-elevated/60 active:bg-dark-elevated'}`}
                                title={savedMessageIds.has(msg.id) ? 'Remove from snippets' : 'Save to snippets'}
                              >
                                <Bookmark className={`w-4 h-4 ${savedMessageIds.has(msg.id) ? 'fill-cyan-400' : ''}`} />
                              </button>
                              {isPlainAI && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleForkChat(msg.id) }}
                                  onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleForkChat(msg.id) }}
                                  className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-text-muted hover:text-accent-violet hover:bg-dark-elevated/60 active:bg-dark-elevated transition-colors"
                                  title="Fork conversation from here — explore a different path"
                                >
                                  <GitBranch className="w-4 h-4" />
                                </button>
                              )}
                              {msg.isDriftPush && !msg.text.startsWith('📌') && msg.driftPushMetadata?.wasSavedAsChat !== true && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleSavePushedDriftAsChat(msg) }}
                                  onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleSavePushedDriftAsChat(msg) }}
                                  className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-text-muted hover:text-accent-violet hover:bg-dark-elevated/60 active:bg-dark-elevated transition-colors"
                                  title="Save drift as new chat"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null
              })}

              {isTyping && !streamingResponse && !messages.some(m => !m.isUser && (!m.text || m.text.length === 0)) && (
                <div className="max-w-5xl mx-auto px-5">
                  <div className="flex justify-start animate-fade-up py-2">
                    {/* Thinking — the dots breathe (container) while each dot bounces */}
                    <div className="flex gap-1.5 items-center px-1 animate-breathe">
                      <span className="w-1.5 h-1.5 bg-text-muted/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-text-muted/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-text-muted/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Coach mark — first-time drift hint */}
        {coachMarkActive && (
          <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[99990] pointer-events-none animate-fade-in">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-full
                            bg-dark-surface/95 backdrop-blur-xl
                            border border-accent-violet/30
                            shadow-[0_4px_24px_rgba(168,85,247,0.25)]
                            pointer-events-auto">
              {/* Pulsing violet dot */}
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-violet opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-violet" />
              </span>
              <span className="text-sm text-text-primary">
                Highlight anything that sparks a question to <span className="text-accent-violet font-medium">drift</span>
              </span>
              <button
                onClick={dismissCoachMark}
                className="ml-1 text-text-muted hover:text-text-primary transition-colors text-xs"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Input area */}
        <div style={{ paddingBottom: keyboardVisible ? '0px' : 'env(safe-area-inset-bottom, 8px)', transform: 'translateY(calc(-1 * var(--kb-h, 0px)))', transition: 'transform 250ms cubic-bezier(0.36, 0.66, 0.04, 1)' }} className={`absolute bottom-0 left-0 right-0 z-10 px-4 pt-2 w-full box-border `}>
          <div className="max-w-4xl mx-auto">
            {/* Mobile-only: model pill row above textarea */}
            <div className="lg:hidden">
              <ModelPillRow
                selectedTargets={selectedTargets}
                onToggleTarget={(target) => {
                  const exists = selectedTargets.some(t => t.key === target.key)
                  const next = exists ? selectedTargets.filter(t => t.key !== target.key) : [...selectedTargets, target]
                  setSelectedTargetsPersist(next.length ? next : [DEFAULT_TARGET])
                  if (!exists) {
                    if (activeBroadcastGroupId) {
                      // Existing broadcast group — send to newly added model
                      const currentMessages = useChatStore.getState().messages
                      const firstBroadcastMsg = currentMessages.find(m => m.broadcastGroupId === activeBroadcastGroupId)
                      const firstBroadcastIndex = firstBroadcastMsg ? currentMessages.findIndex(m => m.id === firstBroadcastMsg.id) : -1
                      const userMsg = firstBroadcastIndex > 0 ? currentMessages[firstBroadcastIndex - 1] : null
                      if (userMsg && userMsg.isUser) {
                        const contextMsgs = currentMessages.slice(0, firstBroadcastIndex).map(m => ({ role: m.isUser ? 'user' : 'assistant', content: m.text }))
                        sendToTarget(target, contextMsgs, activeBroadcastGroupId)
                      }
                    } else {
                      // Single-model mode — retroactively upgrade last exchange to broadcast
                      const upgraded = retroactivelyUpgradeToBroadcast()
                      if (upgraded) {
                        sendToTarget(target, upgraded.contextMsgs, upgraded.groupId)
                      }
                    }
                  }
                }}
                onOpenPicker={() => setModelPickerOpen(true)}
              />
              {selectedTargets.length > 1 && activeCarouselModel && (
                <div className="px-1 pb-1 text-[11px] text-text-muted">
                  Replying to: <span className="text-accent-violet font-medium">{activeCarouselModel}</span>
                </div>
              )}
            </div>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => chatStore.setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isTyping) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder={"Type your message..."}
                rows={1}
                dir={getTextDirection(message)}
                className={`
                  w-full bg-dark-elevated/90 backdrop-blur-md text-text-primary
                  rounded-2xl px-5 py-3
                  ${message.trim() || voiceInput.isListening || !voiceInput.isSupported ? 'pr-14' : 'pr-24'}
                  border
                  ${voiceInput.isListening ? 'border-red-500/40' : 'border-dark-border/60'}
                  shadow-lg shadow-black/50
                  focus:outline-none focus:border-accent-pink/50
                  focus:shadow-[0_0_20px_rgba(255,0,122,0.15)]
                  placeholder:text-text-muted
                  transition-all duration-150
                  resize-none
                  min-h-[48px] max-h-[200px]
                  ${message.split('\n').length > 5 ? 'overflow-y-auto' : 'overflow-y-hidden'}
                  custom-scrollbar
                  ${getRTLClassName(message)}
                `}
              />

              {/* Buttons container — spans full textarea height so items are always vertically centered */}
              <div className="absolute right-2 top-0 bottom-0 flex items-center gap-1">
                {/* Mic button — only when no text, not listening, and voice is supported */}
                {voiceInput.isSupported && !message.trim() && !voiceInput.isListening && !isTyping && (
                  <button
                    onClick={voiceInput.startListening}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/8 transition-all active:scale-90"
                    title="Voice input"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                )}

                {/* Stop-generation button when AI is typing */}
                {isTyping && (
                  <button
                    onClick={stopGeneration}
                    className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 border border-white/20 text-text-muted hover:text-text-primary transition-all active:scale-90"
                    title="Stop generating"
                  >
                    <Square className="w-3.5 h-3.5" fill="currentColor" />
                  </button>
                )}

                {/* Listening stop button with red pulse */}
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
                    onClick={sendMessage}
                    disabled={!message.trim() && !voiceInput.isListening}
                    className={`
                      w-9 h-9 rounded-xl flex items-center justify-center
                      transition-all duration-150 active:scale-90
                      ${message.trim() || voiceInput.isListening
                        ? 'bg-gradient-to-br from-accent-pink to-accent-violet text-white shadow-lg shadow-accent-violet/20'
                        : 'text-text-muted cursor-default'
                      }
                    `}
                    title="Send message"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Voice listening: subtle red glow overlay */}
              {voiceInput.isListening && (
                <div className="absolute inset-0 rounded-2xl pointer-events-none ring-1 ring-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Selection Tooltip */}
      <SelectionTooltip
        onStartDrift={(text, messageId, templateType) => handleStartDrift(text, messageId, undefined, undefined, templateType)}
        currentChatId={activeChatId}
        currentChatTitle={chatHistory.find(c => c.id === activeChatId)?.title || 'Chat'}
        onSnippetSaved={() => uiStore.setSnippetCount(snippetStorage.getAllSnippets().length)}
        onFirstSelection={dismissCoachMark}
      />

      {/* Drift Panel */}
      <DriftPanel
        isOpen={driftOpen}
        onClose={handleCloseDrift}
        selectedText={driftContext?.selectedText || ''}
        contextMessages={driftContext?.contextMessages || []}
        sourceMessageId={driftContext?.sourceMessageId || ''}
        highlightMessageId={driftContext?.highlightMessageId}
        parentChatId={activeChatId}
        onSaveAsChat={handleSaveDriftAsChat}
        onPushToMain={handlePushDriftToMain}
        onUpdatePushedDriftSaveStatus={handleUpdatePushedDriftSaveStatus}
        onUndoPushToMain={handleUndoPushToMain}
        onUndoSaveAsChat={handleUndoSaveAsChat}
        onSnippetCountUpdate={() => uiStore.setSnippetCount(snippetStorage.getAllSnippets().length)}
        aiSettings={aiSettings}
        existingMessages={driftContext?.existingMessages}
        driftChatId={driftContext?.driftChatId}
        onMessagesChange={(msgs) => {
          const chatId = driftContext?.driftChatId
          if (chatId) {
            driftStore.saveTempConversation(chatId, msgs as Message[])
            // Auto-persist the first time a user message appears and the drift
            // isn't yet registered in chatHistory (i.e., first message sent).
            const hasUserMessage = msgs.some(m => m.isUser)
            const alreadyRegistered = chatStore.chatHistory.some(c => c.id === chatId)
            if (hasUserMessage && !alreadyRegistered) {
              const { selectedText, sourceMessageId, ancestry } = driftStore.driftContext
              // Determine the correct parent: use the last drift ancestor if available
              // (for nested drifts), otherwise fall back to the main chat.
              const currentAncestry = ancestry ?? []
              const lastDriftAnc = [...currentAncestry].reverse().find(e => e.driftChatId)
              const correctParent = lastDriftAnc?.driftChatId ?? activeChatId
              chatStore.registerDriftSession({
                id: chatId,
                title: `"${selectedText}"`,
                messages: msgs as Message[],
                lastMessage: msgs[msgs.length - 1]?.text?.slice(0, 100),
                createdAt: new Date(),
                metadata: {
                  isDrift: true,
                  parentChatId: correctParent,
                  sourceMessageId,
                  selectedText,
                },
              })
            }
          }
        }}
        selectedTargets={selectedTargets as { provider: 'openrouter' | 'ollama' | 'gemini'; key: string; label: string }[]}
        selectedProvider={(() => {
          const targets = (selectedTargets && selectedTargets.length) ? selectedTargets : [DEFAULT_TARGET]
          if (targets.length === 1 && targets[0].provider !== 'dummy') return targets[0].provider as 'openrouter' | 'ollama' | 'gemini'
          if (targets.some(t => t.provider === 'gemini')) return 'gemini'
          if (targets.some(t => t.provider === 'openrouter')) return 'openrouter'
          if (targets.some(t => t.provider === 'ollama')) return 'ollama'
          return 'gemini'
        })()}
        onExpandedChange={(expanded) => driftStore.expandDrift(expanded)}
        ancestry={driftContext?.ancestry}
        onNavigateToBreadcrumb={handleNavigateToBreadcrumb}
        templateType={driftContext?.templateType}
        initialSuggestions={driftContext?.initialSuggestions}
        initialConnectQuestion={driftContext?.connectQuestion}
        initialConnectCards={driftContext?.connectCards}
        onConnectStateChange={(question, cards) => {
          connectStateRef.current = { question, cards }
          // Persist chips into the message's driftInfos so re-opening always gets the original set
          if (cards && cards.length > 0 && driftContext?.driftChatId) {
            const driftId = driftContext.driftChatId
            connectCardsCache.current.set(driftId, cards)
            // Update the parent message's driftInfos entry so cards survive component remounts
            const currentChat = chatHistory.find(c => c.id === activeChatId)
            const currentMsgs = currentChat?.messages ?? messages
            const updated = currentMsgs.map(msg => {
              if (!msg.driftInfos) return msg
              const hasEntry = msg.driftInfos.some(d => d.driftChatId === driftId)
              if (!hasEntry) return msg
              return {
                ...msg,
                driftInfos: msg.driftInfos.map(d =>
                  d.driftChatId === driftId ? { ...d, connectCards: cards } : d
                ),
              }
            })
            if (updated !== currentMsgs) {
              chatStore.setMessages(updated)
              chatStore.updateChat(activeChatId, { messages: updated })
            }
          }
        }}
        initialConnectAnswers={driftContext?.connectAnswers}
        onConnectAnswerSaved={(question, answerMessages) => {
          if (!driftContext?.driftChatId) return
          const driftId = driftContext.driftChatId
          // Cache by id (works for original + composite lens threads alike).
          const prevCache = connectAnswersCache.current.get(driftId) ?? {}
          connectAnswersCache.current.set(driftId, { ...prevCache, [question]: answerMessages })
          const currentChat = chatHistory.find(c => c.id === activeChatId)
          const currentMsgs = currentChat?.messages ?? messages
          const updated = currentMsgs.map(msg => {
            if (!msg.driftInfos) return msg
            const hasEntry = msg.driftInfos.some(d => d.driftChatId === driftId)
            if (!hasEntry) return msg
            return {
              ...msg,
              driftInfos: msg.driftInfos.map(d => {
                if (d.driftChatId !== driftId) return d
                const prev = d.connectAnswers ?? {}
                return { ...d, connectAnswers: { ...prev, [question]: answerMessages } }
              }),
            }
          })
          if (updated !== currentMsgs) {
            chatStore.setMessages(updated)
            chatStore.updateChat(activeChatId, { messages: updated })
          }
        }}
        onStartDrift={(text, msgId, suggestions) => handleStartDrift(text, msgId, undefined, undefined, undefined, suggestions)}
        relatedDrifts={relatedDrifts}
        onOpenRelatedDrift={handleOpenRelatedDrift}
        siblingDrifts={siblingDrifts}
        currentDriftChatId={driftContext?.driftChatId}
        onNavigateToSibling={navigateToSiblingDrift}
        onSwitchLens={handleSwitchLens}
      />

      {/* Settings Modal */}
      <Settings
        isOpen={settingsOpen}
        onClose={() => uiStore.setSettingsOpen(false)}
        onSave={handleSaveSettings}
        currentSettings={aiSettings}
      />

      {/* Mobile Model Picker Sheet */}
      <ModelPickerSheet
        isOpen={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        selectedTargets={selectedTargets}
        availableTargets={availableTargets}
        onOpenAddModel={() => setAddModelSheetOpen(true)}
        onToggleTarget={(target) => {
          const exists = selectedTargets.some(t => t.key === target.key)
          const next = exists ? selectedTargets.filter(t => t.key !== target.key) : [...selectedTargets, target]
          setSelectedTargetsPersist(next.length ? next : [DEFAULT_TARGET])
          if (!exists) {
            if (activeBroadcastGroupId) {
              // Existing broadcast group — send to newly added model
              const currentMessages = useChatStore.getState().messages
              const firstBroadcastMsg = currentMessages.find(m => m.broadcastGroupId === activeBroadcastGroupId)
              const firstBroadcastIndex = firstBroadcastMsg ? currentMessages.findIndex(m => m.id === firstBroadcastMsg.id) : -1
              const userMsg = firstBroadcastIndex > 0 ? currentMessages[firstBroadcastIndex - 1] : null
              if (userMsg && userMsg.isUser) {
                const contextMsgs = currentMessages.slice(0, firstBroadcastIndex).map(m => ({ role: m.isUser ? 'user' : 'assistant', content: m.text }))
                sendToTarget(target, contextMsgs, activeBroadcastGroupId)
              }
            } else {
              // Single-model mode — retroactively upgrade last exchange to broadcast
              const upgraded = retroactivelyUpgradeToBroadcast()
              if (upgraded) {
                sendToTarget(target, upgraded.contextMsgs, upgraded.groupId)
              }
            }
          }
        }}
      />

      {/* Add Model Sheet */}
      <AddModelSheet
        isOpen={addModelSheetOpen}
        onClose={() => setAddModelSheetOpen(false)}
        currentPresets={aiSettings.modelPresets || []}
        onPresetsAdded={handlePresetsAdded}
        maxAdd={Math.max(0, 3 - selectedTargets.length)}
      />

      {/* Knowledge Graph */}
      {knowledgeGraphOpen && (
        <ErrorBoundary fallback={null} onError={() => setKnowledgeGraphOpen(false)}>
        <DriftKnowledgeGraph
          chatHistory={chatHistory}
          activeChatId={activeChatId}
          onClose={() => setKnowledgeGraphOpen(false)}
          onSwitchChat={switchChat}
          onScrollToMessage={(msgId) => {
            const el = document.querySelector(`[data-message-id="${msgId}"]`)
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            setKnowledgeGraphOpen(false)
          }}
          onOpenDrift={(driftChat) => {
            const sourceMessageId = driftChat.metadata?.sourceMessageId
            const parentChatId = driftChat.metadata?.parentChatId
            const selectedText = driftChat.metadata?.selectedText ?? ''
            const driftChatId = driftChat.id

            // Switch to the parent chat if needed
            if (parentChatId && parentChatId !== activeChatId) {
              switchChat(parentChatId)
            }

            // Scroll to the source anchor message
            if (sourceMessageId) {
              requestAnimationFrame(() => {
                setTimeout(() => {
                  const el = document.querySelector(`[data-message-id="${sourceMessageId}"]`)
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }, 150)
              })
            }

            // Get context from parent chat (use the chat we're switching to)
            const parentMessages = chatHistory.find(c => c.id === (parentChatId ?? activeChatId))?.messages ?? messages
            const msgIdx = sourceMessageId ? parentMessages.findIndex(m => m.id === sourceMessageId) : -1

            // Resolve the persisted drift metadata (templateType + Connect content)
            // from the parent's driftInfos — search the resolved parent first, then
            // fall back across all current messages.
            const di = parentMessages
              .flatMap(m => m.driftInfos ?? [])
              .find(d => d.driftChatId === driftChatId)
              ?? messages.flatMap(m => m.driftInfos ?? []).find(d => d.driftChatId === driftChatId)

            const cachedCards = connectCardsCache.current.get(driftChatId) ?? di?.connectCards
            const cachedAnswers = connectAnswersCache.current.get(driftChatId) ?? di?.connectAnswers

            // A node whose only content is "Finding connections for…" is a Connect drift.
            // Prefer the persisted templateType; otherwise infer Connect from cached cards/answers.
            const templateType = di?.templateType
              ?? ((cachedCards?.length || (cachedAnswers && Object.keys(cachedAnswers).length)) ? 'connect' : undefined)

            // For a Connect lens the chips view rebuilds from cached cards; passing the
            // (prose) bridge conversation as messages would poison the JSON card parser,
            // so start it clean and let connectCards/connectAnswers restore the map.
            const existing: Message[] = templateType === 'connect'
              ? []
              : ((chatHistory.find(c => c.id === driftChatId)?.messages?.length
                  ? chatHistory.find(c => c.id === driftChatId)!.messages
                  : null)
                ?? driftStore.getTempConversation(driftChatId)
                ?? (driftChat.messages?.length ? driftChat.messages : null)
                ?? [])

            // Open drift panel directly — restores the already-generated content with
            // no new LLM/API call (regular: existingMessages; Connect: cards/answers).
            driftStore.openDrift({
              selectedText,
              sourceMessageId: sourceMessageId ?? '',
              contextMessages: msgIdx >= 0 ? parentMessages.slice(0, msgIdx + 1) : [],
              highlightMessageId: sourceMessageId,
              driftChatId,
              existingMessages: existing,
              templateType,
              connectCards: cachedCards?.length ? cachedCards : undefined,
              connectAnswers: cachedAnswers && Object.keys(cachedAnswers).length ? cachedAnswers : undefined,
              ancestry: [{
                isMainChat: true,
                label: chatHistory.find(c => c.id === (parentChatId ?? activeChatId))?.title || 'Chat',
                selectedText: '',
                sourceMessageId: '',
                contextMessages: [],
              }],
            })
          }}
          getTempMessages={(id) => {
            const temp = driftStore.getTempConversation(id)
            if (temp && temp.length) return temp
            // Connect-lens drifts keep their Q&A in a per-id cache / on the parent's
            // driftInfos — surface it so the map node has real content + a preview.
            const answers =
              connectAnswersCache.current.get(id) ??
              chatHistory
                .flatMap(c => c.messages ?? [])
                .flatMap(m => m.driftInfos ?? [])
                .find(d => d.driftChatId === id)?.connectAnswers
            if (answers) {
              const flat = Object.values(answers).flat()
              if (flat.length) return flat
            }
            return null
          }}
          onSynthesize={handleSynthesize}
          synthesizing={synthesizing}
        />
        </ErrorBoundary>
      )}

      {/* Full-text search across all chats and drifts */}
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        chatHistory={chatHistory}
        onNavigate={(chatId, messageId) => {
          setSearchOpen(false)
          switchChat(chatId)
          setTimeout(() => {
            const el = document.querySelector(`[data-message-id="${messageId}"]`)
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' })
              el.classList.add('highlight-message')
              setTimeout(() => el.classList.remove('highlight-message'), 2000)
            }
          }, 150)
        }}
      />

      {/* Snippet Gallery */}
      <SnippetGallery
        isOpen={galleryOpen}
        onClose={() => uiStore.setGalleryOpen(false)}
        onNavigateToSource={(chatId, messageId) => {
          uiStore.setGalleryOpen(false)
          switchChat(chatId)
          setTimeout(() => {
            const element = document.querySelector(`[data-message-id="${messageId}"]`)
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' })
              element.classList.add('highlight-message')
              setTimeout(() => element.classList.remove('highlight-message'), 2000)
            }
          }, 150)
        }}
      />

      {/* Profile Modal */}
      {profileOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-surface border border-dark-border rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-dark-border">
              <h2 className="text-lg font-semibold text-text-primary">Profile</h2>
              <button
                onClick={() => uiStore.setProfileOpen(false)}
                className="p-2 hover:bg-dark-elevated rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-text-secondary" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent-violet/30 flex items-center justify-center text-sm text-accent-violet font-medium">
                  {(currentUser?.[0]?.toUpperCase() || 'U')}
                </div>
                <div>
                  <div className="text-text-primary font-medium">{currentUser || 'User'}</div>
                  <div className="text-xs text-text-secondary">Local account</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1.5 rounded-lg bg-dark-elevated border border-dark-border text-sm text-text-primary hover:border-dark-border/80"
                  onClick={() => { navigator.clipboard?.writeText(currentUser || '') }}
                >
                  Copy username
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300 hover:bg-red-500/20"
                  onClick={() => { uiStore.setProfileOpen(false); handleLogout() }}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={(() => {
            const chat = chatHistory.find(c => c.id === contextMenu.chatId)
            const isPinned = pinnedChats.has(contextMenu.chatId)
            const isStarred = starredChats.has(contextMenu.chatId)
            const isDrift = chat?.metadata?.isDrift
            const items = [
              { label: 'Rename', icon: <Edit3 className="w-4 h-4" />, action: () => handleRenameChat(contextMenu.chatId) },
              { label: 'Duplicate', icon: <Copy className="w-4 h-4" />, action: () => handleDuplicateChat(contextMenu.chatId) },
              { label: isPinned ? 'Unpin' : 'Pin', icon: isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />, action: () => handleTogglePin(contextMenu.chatId) },
              { label: isStarred ? 'Unstar' : 'Star', icon: isStarred ? <StarOff className="w-4 h-4" /> : <Star className="w-4 h-4" />, action: () => handleToggleStar(contextMenu.chatId) }
            ]
            if (isDrift) {
              items.push({ label: 'Go to Source', icon: <ExternalLink className="w-4 h-4" />, action: () => handleGoToSource(contextMenu.chatId) })
            }
            items.push({ label: 'Delete', icon: <Trash2 className="w-4 h-4" />, action: () => handleDeleteChat(contextMenu.chatId) })
            return items
          })()}
          onClose={() => uiStore.setContextMenu(null)}
        />
      )}
    </div>
  )
}

export default App
