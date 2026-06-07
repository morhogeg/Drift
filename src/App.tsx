import { useState, useRef, useEffect, useMemo, cloneElement, isValidElement, lazy, Suspense } from 'react'
import { Menu, Plus, Search, ChevronLeft, ChevronRight, Square, ArrowDown, ArrowUp, ArrowUpRight, Bookmark, Edit3, Copy, Trash2, Pin, PinOff, Star, StarOff, ExternalLink, Check, ChevronDown, Settings as SettingsIcon, Save, X, LogOut, User, GitBranch, Home, Mic, CornerUpLeft, MousePointerClick, Sparkles } from 'lucide-react'
import { Pressable } from './components/motion'
import { synthesizeDrifts } from './services/gemini'
import DriftPanel from './components/DriftPanel'
const DriftKnowledgeGraph = lazy(() => import('./components/DriftKnowledgeGraph'))
import ErrorBoundary from './components/ErrorBoundary'
import SelectionTooltip from './components/SelectionTooltip'
import SnippetGallery from './components/SnippetGallery'
import ContextMenu from './components/ContextMenu'
import Settings, { type AISettings } from './components/Settings'
import { Login } from './components/Login'
import { ONBOARDED_FLAG } from './lib/onboardingFlag'
const Onboarding = lazy(() => import('./components/Onboarding'))
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { snippetStorage } from './services/snippetStorage'
import { settingsStorage } from './services/settingsStorage'
import { getTextDirection, getRTLClassName } from './utils/rtl'
import HeaderControls from './components/HeaderControls'
import ModelPillRow from './components/ModelPillRow'
import ModelPickerSheet from './components/ModelPickerSheet'
import SearchModal from './components/SearchModal'
import AddModelSheet from './components/AddModelSheet'
import { registerGlobalNavigationHandlers } from './components/conversation/ConversationScroller'
import { indexListMessage, getAnchorId, matchListItemsInText } from './services/lists/index'
import InlineListLink from './components/lists/InlineListLink'
import { buildTermIndex, findRelatedDrifts, type TermOccurrence } from '@/lib/termIndex'
import { runEmbeddingBackfill, getCachedVectors } from '@/lib/embeddingBackfill'
import { useOnceFlag } from '@/lib/onceFlags'
import { embedTexts } from '@/services/embeddings'
import { rankBySemanticSimilarity, mergeLexicalAndSemantic } from '@/lib/semanticRecall'
import { haptics } from '@/lib/haptics'
import { sanitizeText, formatDate, timeAgo } from '@/lib/format'
import { useKeyboardVisibility } from '@/hooks/useKeyboardVisibility'
import { useCoachMark } from '@/hooks/useCoachMark'
import { useAuth } from '@/hooks/useAuth'
import { useConnectionStatus } from '@/hooks/useConnectionStatus'
import { useOnOutsideClick } from '@/hooks/useOnOutsideClick'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useChatActions } from '@/hooks/useChatActions'
import { useDriftActions } from '@/hooks/useDriftActions'
import { useMessageStream } from '@/hooks/useMessageStream'
import { useChatStore } from '@/store/chatStore'
import { useDriftStore } from '@/store/driftStore'
import { useModelStore, DEFAULT_TARGET } from '@/store/modelStore'
import { useUIStore } from '@/store/uiStore'
import type { Message, ChatSession, DriftContext } from '@/types/chat'
import { toast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import { SidebarChatRow, type SidebarRowKind } from '@/components/SidebarChatRow'

function App() {
  // ── Stores ──────────────────────────────────────────────────────────────────
  const chatStore = useChatStore()
  const driftStore = useDriftStore()
  const modelStore = useModelStore()
  const uiStore = useUIStore()

  // ── Local state (not in stores) ─────────────────────────────────────────────
  const { isAuthenticated, currentUser, login: handleLogin, logout: handleLogout } = useAuth()
  // First-run onboarding — shown once per device, only after login.
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem(ONBOARDED_FLAG) !== 'true'
  )
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    const settings = settingsStorage.get()
    if (!settings.openRouterApiKey && import.meta.env.VITE_OPENROUTER_API_KEY) {
      settings.openRouterApiKey = import.meta.env.VITE_OPENROUTER_API_KEY
    }
    return settings
  })

  // Live provider reachability (polls every 5s; opens Settings if creds missing)
  const { apiConnected, isConnecting } = useConnectionStatus(aiSettings, () => uiStore.setSettingsOpen(true))

  // Keyboard visibility (iOS — used to suppress safe-area padding when keyboard is up)
  const keyboardVisible = useKeyboardVisibility()

  // Drift just promoted to the main thread — drives a one-time settle-in arrival
  // animation (cleared shortly after, so reloads/scroll don't re-animate it).
  const [justPromotedChatId, setJustPromotedChatId] = useState<string | null>(null)
  const justPromotedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Model picker state
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [addModelSheetOpen, setAddModelSheetOpen] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Local derived UI
  const [contextLinkVersion, setContextLinkVersion] = useState(0)

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
  // Debounces flushing a growing drift conversation into chatHistory/IDB (so it
  // survives reload — the temp store is in-memory only). Coalesces stream chunks.
  const driftPersistTimerRef = useRef<number | null>(null)
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

  // First-AI-message coach mark (one-time drift-gesture hint)
  const { coachMarkActive, dismissCoachMark } = useCoachMark({ isTyping, messages })

  // Targets derived from enabled presets — drives ModelPickerSheet dynamic list
  const availableTargets = useMemo(() => {
    const presetTargets = (aiSettings.modelPresets || [])
      .filter((p) => p.enabled)
      .map((p) => ({ provider: p.provider as import('@/types/chat').Target['provider'], key: p.id, label: p.label }))
    return presetTargets
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

  const sidebarOpen = uiStore.sidebarOpen
  const settingsOpen = uiStore.settingsOpen
  const knowledgeGraphOpen = uiStore.knowledgeGraphOpen
  const setKnowledgeGraphOpen = uiStore.setKnowledgeGraphOpen

  // Drift Map "expand" (desktop): widens the map panel for a larger view. Tracked
  // here (not inside the map) so the main column's right margin can match the panel
  // width and never get covered.
  const [mapExpanded, setMapExpanded] = useState(false)
  const [isLgUp, setIsLgUp] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)')
    const h = () => setIsLgUp(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  // The map panel's width (kept in sync with DriftKnowledgeGraph's desktop panel).
  const mapPanelWidth = mapExpanded ? 'min(1040px, 90vw)' : 'min(680px, 56vw)'

  // Bug 2 fix: on touch devices a single tap can surface as both a `pointerup`/
  // framer-motion tap AND a synthesized `click`, firing the toggle twice in the
  // same gesture (open → immediately close). Guard the toggle so it can't flip
  // more than once per gesture (~450ms), and always read the *latest* state via
  // the store (never a stale closure value).
  const graphToggleLockRef = useRef(0)
  const toggleKnowledgeGraph = () => {
    const now = Date.now()
    if (now - graphToggleLockRef.current < 450) return
    graphToggleLockRef.current = now
    setKnowledgeGraphOpen(!useUIStore.getState().knowledgeGraphOpen)
  }

  // ── Swipe gesture: right → close sidebar only ──────────────────────────────
  // Swipe-to-OPEN was removed: a horizontal drag in the chat to select text was
  // being read as an open-sidebar swipe, hijacking the drift selection tooltip.
  // The sidebar still opens via the header menu button; close keeps the swipe.
  const swipeHandlers = useSwipeGesture(
    undefined,                            // swipe left → (disabled — collided with text selection)
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

  // Right margin the main column reserves so the open side panel never covers it
  // (matches the actual panel width, including the map's expanded width).
  const mainRightMargin = isLgUp
    ? (knowledgeGraphOpen ? mapPanelWidth : driftOpen ? 'min(450px, 56vw)' : 0)
    : 0

  // ── Intelligence layer: cross-drift connection surfacing ─────────────────────
  // Index every prior drift by its term (cheap; reads only what's persisted).
  // Rebuilds when chat history changes — memoized so it's free on other renders.
  const termIndex = useMemo(() => buildTermIndex(chatHistory), [chatHistory])

  // Resolved Gemini key (env > enabled preset > settings). Empty when there is
  // no key (Demo / offline) — every semantic surface below treats "" as "no
  // semantic layer" and falls back to today's lexical behavior. Never logged.
  const geminiApiKey = useMemo(() => {
    const preset = (aiSettings.modelPresets || []).find(p => p.provider === 'gemini' && p.enabled)
    return (import.meta.env.VITE_GEMINI_API_KEY || preset?.apiKey || aiSettings.geminiApiKey || '').trim()
  }, [aiSettings.modelPresets, aiSettings.geminiApiKey])

  // ── Semantic backfill (lifecycle) ──────────────────────────────────────────
  // Whenever chat history settles, diff drifts against the IDB vector cache and
  // batch-embed any that are missing/stale. Debounced, fire-and-forget, never
  // blocks UI; silently no-ops without a Gemini key. The in-memory cache inside
  // embeddingBackfill keeps this cheap on repeat passes.
  useEffect(() => {
    if (!geminiApiKey) return
    const id = setTimeout(() => {
      runEmbeddingBackfill(chatHistory, geminiApiKey).catch(() => {})
    }, 1500)
    return () => clearTimeout(id)
  }, [chatHistory, geminiApiKey])

  // Prior explorations of the term the user just marked — surfaced as the
  // "you explored this before" moment in the drift panel. The lexical result is
  // instant; semantic matches (added below) fill in asynchronously.
  const lexicalRelatedDrifts = useMemo<TermOccurrence[]>(() => {
    const term = driftContext?.selectedText
    if (!driftOpen || !term) return []
    return findRelatedDrifts(termIndex, term, driftContext?.driftChatId)
  }, [driftOpen, driftContext?.selectedText, driftContext?.driftChatId, termIndex])

  // Semantic recall: embed the marked term, rank cached drift vectors, and merge
  // with the lexical list (lexical first, semantic-only appended). Held in local
  // state so the lexical strip renders immediately, then semantic matches appear.
  const [relatedDrifts, setRelatedDrifts] = useState<TermOccurrence[]>([])
  useEffect(() => {
    // Always show the instant lexical result first.
    setRelatedDrifts(lexicalRelatedDrifts)

    const term = driftContext?.selectedText
    if (!driftOpen || !term || !geminiApiKey) return // graceful: lexical-only

    let cancelled = false
    const controller = new AbortController()
    ;(async () => {
      try {
        const [queryVecs, candidates] = await Promise.all([
          embedTexts([term], geminiApiKey, controller.signal),
          getCachedVectors(),
        ])
        if (cancelled || queryVecs.length === 0 || candidates.length === 0) return

        const matches = rankBySemanticSimilarity(
          queryVecs[0],
          candidates,
          driftContext?.driftChatId,
        )
        if (cancelled || matches.length === 0) return

        const resolve = (driftChatId: string): TermOccurrence | undefined => {
          const c = chatHistory.find(x => x.id === driftChatId)
          if (!c?.metadata?.isDrift) return undefined
          const t = c.metadata.selectedText || c.title || ''
          if (!t) return undefined
          return {
            driftChatId,
            chatTitle: c.title || t,
            term: t,
            parentChatId: c.metadata.parentChatId,
          }
        }

        const merged = mergeLexicalAndSemantic(lexicalRelatedDrifts, matches, resolve)
        if (!cancelled) setRelatedDrifts(merged)
      } catch {
        // Stay on the lexical result.
      }
    })()

    return () => { cancelled = true; controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driftOpen, driftContext?.selectedText, driftContext?.driftChatId, lexicalRelatedDrifts, geminiApiKey])

  // Navigate to a prior drift surfaced in the connection strip. Reuses the same
  // path the inline drift links use, so persisted/temp conversations restore.
  const handleOpenRelatedDrift = (occ: TermOccurrence) => {
    const existing = chatHistory.find(c => c.id === occ.driftChatId)?.messages
      ?? driftStore.getTempConversation(occ.driftChatId)
      ?? undefined
    handleStartDrift(occ.term, occ.parentChatId ?? activeChatId, occ.driftChatId, existing, occ.templateType)
  }

  // First-run coachmark: teach the signature drift gesture the moment a reply is
  // on screen. Auto-dismisses for good once the user opens any drift.
  const [seenDriftHint, markDriftHint] = useOnceFlag('drift-gesture')
  useEffect(() => { if (driftOpen) markDriftHint() }, [driftOpen, markDriftHint])

  // Rebuild the in-memory per-term lens registry from persisted driftInfos so
  // returning to a term (and its lens threads) survives a reload — the registry
  // is otherwise in-memory only. Fill-only: never clobber a live in-session map.
  useEffect(() => {
    if (!chatHistory.length) return
    const reg = lensRegistryRef.current
    for (const chat of chatHistory) {
      for (const m of chat.messages) {
        if (!m.driftInfos) continue
        for (const d of m.driftInfos) {
          if (!d.selectedText || !d.driftChatId) continue
          const baseKey = `${m.id}::${d.selectedText}`
          let lenses = reg.get(baseKey)
          if (!lenses) { lenses = new Map(); reg.set(baseKey, lenses) }
          const tpl = d.templateType ?? 'drift'
          if (!lenses.has(tpl)) lenses.set(tpl, d.driftChatId)
        }
      }
    }
  }, [chatHistory])

  // ── Continuity: "pick up where you left off" ─────────────────────────────────
  // Unfinished drift trees — conversations with ≥2 explored drifts not yet woven
  // into a synthesis. Surfaced on the empty state to invite the user back rather
  // than letting hard-won exploration go cold. sortKey is a timestamp; the date
  // is formatted in the JSX (formatDate is defined further down).
  interface ResumableTree { rootId: string; title: string; driftCount: number; terms: string; sortKey: number }
  const resumableTrees = useMemo<ResumableTree[]>(() => {
    if (!chatHistory.length) return []
    const byId = new Map(chatHistory.map(c => [c.id, c]))
    const rootOf = (id: string): string => {
      let cur = byId.get(id); const seen = new Set<string>()
      while (cur?.metadata?.isDrift && cur.metadata.parentChatId && !seen.has(cur.id)) {
        seen.add(cur.id); cur = byId.get(cur.metadata.parentChatId)
      }
      return cur?.id ?? id
    }
    const groups = new Map<string, ChatSession[]>()
    for (const c of chatHistory) {
      if (!c.metadata?.isDrift) continue
      const root = rootOf(c.id)
      if (!groups.has(root)) groups.set(root, [])
      groups.get(root)!.push(c)
    }
    const out: ResumableTree[] = []
    for (const [rootId, drifts] of groups) {
      const root = byId.get(rootId)
      if (!root || root.metadata?.isDrift || rootId === activeChatId) continue
      const synthesized = root.messages.some(m => m.id.startsWith('synth-')) || /✦\s*Synthesis/i.test(root.lastMessage || '')
      if (synthesized) continue
      const real = drifts.filter(d => (d.messages?.length ?? 0) > 0 || !!d.lastMessage)
      if (real.length < 2) continue
      const times = real.map(d => new Date(d.createdAt as unknown as string).getTime()).filter(n => !Number.isNaN(n))
      const sortKey = times.length ? Math.max(...times) : 0
      const terms = real.map(d => d.metadata?.selectedText || d.title).filter(Boolean).slice(0, 3).join(' · ')
      out.push({ rootId, title: root.title || 'Untitled', driftCount: real.length, terms, sortKey })
    }
    return out.sort((a, b) => b.sortKey - a.sortKey).slice(0, 3)
  }, [chatHistory, activeChatId])

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
        : [
            chatHistory.find(c => c.id === driftChatId)?.messages ?? [],
            driftStore.getTempConversation(driftChatId) ?? [],
          ].reduce((a, b) => (b.length > a.length ? b : a), [] as Message[])

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

  // ── Global navigation handlers ──────────────────────────────────────────────
  useEffect(() => {
    const unsubNav = registerGlobalNavigationHandlers()
    return () => { unsubNav() }
  }, [])

  // Bug 8: clickable AI terms (InlineListLink) open a drift on the tapped term.
  // Route them through the SAME entry point as a text-selection drift so the
  // drift is recorded in driftInfos + registered as a session — which is exactly
  // what makes it appear as a node/edge (with lineage) in the Drift Map.
  useEffect(() => {
    const onStartFromTerm = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      const term: string = (detail.term || '').trim()
      const messageId: string = detail.messageId || ''
      if (!term || !messageId) return
      handleStartDrift(term, messageId)
    }
    window.addEventListener('drift:start-from-term', onStartFromTerm as EventListener)
    return () => window.removeEventListener('drift:start-from-term', onStartFromTerm as EventListener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const fromMessageId = _messageId
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
          out.push(<InlineListLink key={`list-${u.list.to}-${u.list.anchor}-${u.s}-${u.e}`} toMessageId={u.list.to} fromMessageId={fromMessageId} anchorId={u.list.anchor} surface={u.list.surface} />)
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

  // ── Message send / stream pipeline ──────────────────────────────────────────
  // Single-model send + streaming. Extracted into useMessageStream; the App-owned
  // settings, the abort + scroll refs and stripMarkdown are passed in so behavior
  // is identical to the inline implementation.
  const {
    sendMessage,
    stopGeneration,
  } = useMessageStream({
    aiSettings,
    abortControllerRef,
    userHasScrolled,
    scrollToBottom,
    stripMarkdown,
  })

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
    // Single-model: switch to the first newly added preset (not already selected)
    const firstNew = newPresets.find((p) => !selectedTargets.some((t) => t.key === p.id))
    if (firstNew) {
      setSelectedTargetsPersist([{ provider: firstNew.provider, key: firstNew.id, label: firstNew.label }])
    }
  }

  // ── Dates ───────────────────────────────────────────────────────────────────
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

  // Global keyboard shortcuts (⌘⌥N new chat · ⌘⌥G map · ⌘K search)
  useKeyboardShortcuts({
    onNewChat: createNewChat,
    onToggleMap: toggleKnowledgeGraph,
    onToggleSearch: () => setSearchOpen(v => !v),
  })

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

  // ── Drift actions ─────────────────────────────────────────────────────────────
  // The full drift action layer: navigation + undo (reopen last / breadcrumb /
  // undo push / undo save-as-chat) plus the signature start / close / push / save
  // lifecycle. Extracted into useDriftActions; the App-owned refs, setters and
  // stripMarkdown are passed through so behavior is identical to the inline impl.
  const {
    reopenLastDrift,
    handleNavigateToBreadcrumb,
    handleUndoPushToMain,
    handleUndoSaveAsChat,
    handleStartDrift,
    handleCloseDrift,
    handleSaveDriftAsChat,
    handlePushDriftToMain,
    handleSavePushedDriftAsChat,
  } = useDriftActions({
    lastDrift,
    switchChat,
    resolveDriftRestore,
    connectStateRef,
    mainScrollPosition,
    connectCardsCache,
    setLastDrift,
    setJustPromotedChatId,
    justPromotedTimerRef,
    stripMarkdown,
  })

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

  // ── Context menu handlers ───────────────────────────────────────────────────
  // Sidebar chat CRUD (rename/duplicate/delete/pin/star) + context menu.
  const {
    handleContextMenu,
    handleRenameChat,
    handleSaveRename,
    handleDuplicateChat,
    handleDeleteChat,
    handleTogglePin,
    handleToggleStar
  } = useChatActions()

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

  // ── Close user menu on outside click ───────────────────────────────────────
  useOnOutsideClick(userMenuRef, userMenuOpen, () => uiStore.setUserMenuOpen(false))

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

  // ── Group drifts under their origin chat for a differentiated sidebar ────────
  // The Chat model links a drift to its source via `metadata.isDrift` +
  // `metadata.parentChatId` (which may point at another drift) + `metadata.selectedText`.
  // We resolve each drift up to its ROOT chat so nested drift-of-drift still slots
  // under the conversation it ultimately came from.
  const sidebarGroups = useMemo(() => {
    const byId = new Map(chatHistory.map((c) => [c.id, c]))

    const kindOf = (c: ChatSession): SidebarRowKind => {
      if (c.metadata?.isDrift) return 'drift'
      // Synthesis = a chat whose latest message is a woven "bring it home" synthesis.
      if (c.lastMessage && /✦\s*Synthesis/i.test(c.lastMessage)) return 'synthesis'
      return 'chat'
    }

    // Walk parent links until we hit a non-drift chat (the root conversation).
    const rootOf = (c: ChatSession): string => {
      let cur: ChatSession | undefined = c
      const seen = new Set<string>()
      while (cur && cur.metadata?.isDrift && cur.metadata.parentChatId && !seen.has(cur.id)) {
        seen.add(cur.id)
        const parent = byId.get(cur.metadata.parentChatId)
        if (!parent) break
        cur = parent
      }
      return cur?.id ?? c.id
    }

    // Build groups keyed by root chat id, preserving the sorted top-level order.
    const groupOrder: string[] = []
    const drifts = new Map<string, ChatSession[]>()
    const orphanDrifts: ChatSession[] = []

    for (const c of sortedChats) {
      if (kindOf(c) === 'drift') {
        const root = rootOf(c)
        if (root === c.id || !byId.has(root)) {
          // Could not resolve a real parent — show it as a standalone row.
          orphanDrifts.push(c)
        } else {
          if (!drifts.has(root)) drifts.set(root, [])
          drifts.get(root)!.push(c)
        }
      } else {
        if (!groupOrder.includes(c.id)) groupOrder.push(c.id)
      }
    }

    const rows: Array<{
      chat: ChatSession
      kind: SidebarRowKind
      nested: boolean
      originTitle?: string
    }> = []

    for (const rootId of groupOrder) {
      const parent = byId.get(rootId)!
      rows.push({ chat: parent, kind: kindOf(parent), nested: false })
      // Drifts that branch off this conversation, newest first.
      const children = (drifts.get(rootId) ?? []).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )
      for (const d of children) {
        rows.push({ chat: d, kind: 'drift', nested: true, originTitle: parent.title })
      }
    }

    // Drifts whose parent isn't in the visible list (e.g. filtered out by search).
    for (const d of orphanDrifts) {
      const parent = d.metadata?.parentChatId ? byId.get(d.metadata.parentChatId) : undefined
      rows.push({ chat: d, kind: 'drift', nested: false, originTitle: parent?.title })
    }

    return rows
  }, [sortedChats, chatHistory])

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

        {/* Chat List — grouped: chats, with their drifts nested beneath, plus synthesis rows */}
        <div className="flex-1 overflow-y-auto">
          {sidebarGroups.map((row) => (
            <div
              key={row.chat.id}
              className={
                // Hairline separator only above top-level rows, so a chat and its
                // nested drifts read as one connected cluster.
                !row.nested ? 'border-t border-dark-border/20 first:border-t-0' : ''
              }
            >
              <SidebarChatRow
                chat={row.chat}
                kind={row.kind}
                nested={row.nested}
                originTitle={row.originTitle}
                isActive={activeChatId === row.chat.id}
                isPinned={pinnedChats.has(row.chat.id)}
                isStarred={starredChats.has(row.chat.id)}
                isEditing={editingChatId === row.chat.id}
                editingTitle={editingTitle}
                stripMarkdown={stripMarkdown}
                onOpen={() => { switchChat(row.chat.id); uiStore.setSidebarOpen(false) }}
                onContextMenu={(e) => handleContextMenu(e, row.chat.id)}
                onEditTitleChange={(v) => uiStore.setEditingTitle(v)}
                onSaveRename={handleSaveRename}
                onCancelRename={() => {
                  uiStore.setEditingChatId(null)
                  uiStore.setEditingTitle('')
                }}
              />
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
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'lg:ml-[340px]' : 'ml-0'}
        `}
        style={{ marginRight: mainRightMargin }}
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
                  onClick={() => { haptics.selection(); toggleKnowledgeGraph() }}
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
                  {resumableTrees.length > 0 && (
                    <div className="w-full max-w-[340px] mt-9 text-left">
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <CornerUpLeft className="w-3.5 h-3.5 text-accent-violet/60 shrink-0" />
                        <span className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">Pick up where you left off</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {resumableTrees.map(t => (
                          <div
                            key={t.rootId}
                            role="button"
                            tabIndex={0}
                            onClick={() => { haptics.selection(); switchChat(t.rootId) }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); haptics.selection(); switchChat(t.rootId) } }}
                            className="group cursor-pointer rounded-xl border border-dark-border/60 bg-dark-elevated/40 hover:bg-dark-elevated/70 hover:border-accent-violet/30 transition-all px-3.5 py-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-text-primary text-[14px] font-medium truncate" dir="auto">{t.title}</span>
                              <span className="text-text-muted text-[11px] shrink-0 tabular-nums">{formatDate(new Date(t.sortKey || Date.now()))}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-1.5">
                              <span className="text-text-muted text-[12px] truncate" dir="auto">{t.terms}</span>
                              <span className="flex items-center gap-1 shrink-0 text-accent-violet/80 text-[11px] font-medium">
                                <GitBranch className="w-3 h-3" /> {t.driftCount}
                              </span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); haptics.selection(); handleSynthesize(t.rootId) }}
                              disabled={synthesizing}
                              className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent-violet/90 hover:text-accent-violet disabled:opacity-50 transition-colors"
                            >
                              <span className="text-[13px] leading-none">✦</span> Bring it home
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Message list */}
              {messages.map((msg, index) => {
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
                // Synthesis ends with a "**Next:**" open question — pull it out so it
                // can be rendered as a tappable "explore next" chip (and stripped from
                // the prose body so it isn't duplicated).
                const synthNext = isSynthesis ? (msg.text.match(/\*\*Next:\*\*\s*([\s\S]+?)\s*$/)?.[1]?.trim() || null) : null
                const synthBody = synthNext ? msg.text.replace(/\n*\*\*Next:\*\*[\s\S]*$/, '').trim() : msg.text
                // The artifact renders its own header band, so strip the leading
                // "## ✦ Synthesis · N drifts" heading from the prose we display.
                const synthDisplay = isSynthesis
                  ? synthBody.replace(/^##\s*✦?\s*Synthesis[^\n]*\n+/i, '').trim()
                  : msg.text
                // The drift branches this synthesis was woven from — derived live from
                // the tree (survives reloads; chips open each source drift).
                const synthSources: { term: string; chatId: string }[] = []
                if (isSynthesis) {
                  const seenSrc = new Set<string>()
                  const walkSrc = (pid: string) => {
                    for (const c of chatHistory) {
                      if (seenSrc.has(c.id) || !c.metadata?.isDrift || c.metadata?.parentChatId !== pid) continue
                      seenSrc.add(c.id)
                      synthSources.push({ term: (c.metadata?.selectedText || c.title || 'Drift').trim(), chatId: c.id })
                      walkSrc(c.id)
                    }
                  }
                  walkSrc(activeChatId)
                }

                if (isDriftHeader || msg.isHiddenContext) return null

                return msg.text ? (
                  <div
                    className={`max-w-5xl mx-auto ${msg.isUser ? 'mt-6' : 'mb-1'} ${isDriftMessage ? 'drift-promoted' : ''} ${isDriftMessage && justPromotedChatId && msg.driftPushMetadata?.driftChatId === justPromotedChatId ? 'drift-promoted-arrive' : ''}`}
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
                                  !(driftConversation[0].text.includes('What would you like to know about') || driftConversation[0].text.includes('מה תרצה לדעת על')) ?
                                  [{
                                    id: 'drift-system-reconstructed',
                                    text: /[֐-׿]/.test(msg.driftPushMetadata!.selectedText) ? `מה תרצה לדעת על "${msg.driftPushMetadata!.selectedText}"?` : `What would you like to know about "${msg.driftPushMetadata!.selectedText}"?`,
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
                                    !(driftConversation[0].text.includes('What would you like to know about') || driftConversation[0].text.includes('מה תרצה לדעת על')) ?
                                    [{
                                      id: 'drift-system-reconstructed',
                                      text: /[֐-׿]/.test(msg.driftPushMetadata!.selectedText) ? `מה תרצה לדעת על "${msg.driftPushMetadata!.selectedText}"?` : `What would you like to know about "${msg.driftPushMetadata!.selectedText}"?`,
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
                            <>
                            {isSynthesis && (
                              <div className="synthesis-artifact-head">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="synthesis-eyebrow">✦ Synthesis</span>
                                  <span className="text-[10.5px] font-medium" style={{ color: 'rgba(255,255,255,0.42)' }}>
                                    woven from {synthSources.length || ''} {synthSources.length === 1 ? 'drift' : 'drifts'}
                                    {(() => { const t = timeAgo(msg.timestamp); return t ? ` · ${t}` : '' })()}
                                  </span>
                                </div>
                                {synthSources.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mb-3">
                                    {synthSources.slice(0, 8).map((s) => (
                                      <button
                                        key={s.chatId}
                                        onClick={(e) => { e.stopPropagation(); haptics.selection(); switchChat(s.chatId) }}
                                        dir={getTextDirection(s.term)}
                                        className="synthesis-source-chip"
                                        title={`Open drift: ${s.term}`}
                                      >
                                        ↗ {s.term.length > 26 ? s.term.slice(0, 26) + '…' : s.term}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
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
                                {sanitizeText(isSynthesis ? synthDisplay : msg.text)}
                              </ReactMarkdown>
                            </div>
                            </>
                          )}

                          {/* Synthesis "Next" — the open question the synthesis ends on,
                              made tappable so one tap asks it in the main chat. */}
                          {isSynthesis && synthNext && (
                            <div className="mt-3.5">
                              <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-violet/55">
                                <Sparkles className="w-3 h-3" />
                                Explore next
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); haptics.selection(); sendMessage(synthNext) }}
                                dir={getTextDirection(synthNext)}
                                className="group flex items-start gap-2 w-full text-start px-3.5 py-2.5 rounded-2xl
                                  text-[13px] font-medium leading-snug text-accent-violet/90
                                  border border-accent-violet/25 bg-accent-violet/[0.07]
                                  shadow-[0_1px_3px_rgba(0,0,0,0.15)]
                                  hover:bg-accent-violet/[0.14] hover:border-accent-violet/50 hover:text-accent-violet
                                  active:scale-[0.99] transition-all duration-150"
                                title="Ask this next"
                              >
                                <span className="flex-1 min-w-0">{synthNext}</span>
                                <ArrowUpRight className="w-4 h-4 flex-shrink-0 mt-0.5 text-accent-violet/45 group-hover:text-accent-violet/90 transition-colors" />
                              </button>
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
            {/* First-run hint — teaches the drift gesture when a reply is on screen. */}
            {!seenDriftHint && !driftOpen && !knowledgeGraphOpen && messages.some(m => !m.isUser && !!m.text) && (
              <div className="flex items-center gap-2.5 mb-2 px-3.5 py-2 rounded-full border border-accent-violet/20 bg-accent-violet/[0.07] backdrop-blur-sm">
                <MousePointerClick className="w-4 h-4 text-accent-violet/80 shrink-0" />
                <span className="text-[12.5px] text-text-secondary leading-snug flex-1">Highlight any phrase above to <span className="text-accent-violet font-medium">drift</span> into a focused side-thread.</span>
                <button onClick={markDriftHint} aria-label="Dismiss tip" className="text-text-muted/60 hover:text-text-muted shrink-0 p-0.5"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            {/* Mobile-only: model pill row above textarea */}
            <div className="lg:hidden">
              <ModelPillRow
                selectedTargets={selectedTargets}
                onOpenPicker={() => setModelPickerOpen(true)}
              />
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
                    onClick={() => sendMessage()}
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

      {/* First-run onboarding — only after login, only when the flag is unset */}
      {showOnboarding && (
        <Suspense fallback={null}>
        <Onboarding
          settings={aiSettings}
          onSaveGeminiKey={(key) => {
            const presets = aiSettings.modelPresets || []
            const idx = presets.findIndex((p) => p.provider === 'gemini')
            const nextPresets = idx >= 0
              ? presets.map((p, i) => (i === idx ? { ...p, apiKey: key, enabled: true } : p))
              : [{ id: 'gemini-flash-lite', provider: 'gemini' as const, label: 'Gemini Flash Lite', apiKey: key, enabled: true }, ...presets]
            handleSaveSettings({ ...aiSettings, geminiApiKey: key, modelPresets: nextPresets })
          }}
          onDone={() => {
            localStorage.setItem(ONBOARDED_FLAG, 'true')
            setShowOnboarding(false)
          }}
        />
        </Suspense>
      )}

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
            } else if (alreadyRegistered) {
              // Already in chatHistory — keep its messages current so the full
              // conversation (incl. the streamed answer) survives a reload, not
              // just the question captured at registration. Debounced to coalesce
              // streaming chunks into a single IDB write.
              if (driftPersistTimerRef.current) clearTimeout(driftPersistTimerRef.current)
              const snapshot = msgs as Message[]
              driftPersistTimerRef.current = window.setTimeout(() => {
                chatStore.updateChat(chatId, {
                  messages: snapshot,
                  lastMessage: (snapshot[snapshot.length - 1]?.text ?? '').slice(0, 100),
                })
              }, 700)
            }
          }
        }}
        selectedTargets={selectedTargets as { provider: 'openrouter' | 'ollama' | 'gemini'; key: string; label: string }[]}
        selectedProvider={(() => {
          const targets = (selectedTargets && selectedTargets.length) ? selectedTargets : [DEFAULT_TARGET]
          if (targets.length === 1) return targets[0].provider as 'openrouter' | 'ollama' | 'gemini'
          // Broadcast/multi-model: the drift panel can only use one provider, so
          // pick one that can actually answer (has credentials) — otherwise a
          // keyless Gemini would win by rank and the drift would 404.
          const orKey = (import.meta.env.VITE_OPENROUTER_API_KEY || aiSettings.openRouterApiKey || '').trim()
          const has = (p: string) => targets.some(t => t.provider === p)
          if (has('gemini') && geminiApiKey) return 'gemini'
          if (has('openrouter') && orKey) return 'openrouter'
          if (has('ollama')) return 'ollama'
          // Nothing has clear credentials — fall back to rank order.
          if (has('gemini')) return 'gemini'
          if (has('openrouter')) return 'openrouter'
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
        onSelectTarget={(target) => {
          // Single-model: selecting a model replaces the current selection.
          setSelectedTargetsPersist([target])
          setModelPickerOpen(false)
        }}
      />

      {/* Add Model Sheet */}
      <AddModelSheet
        isOpen={addModelSheetOpen}
        onClose={() => setAddModelSheetOpen(false)}
        currentPresets={aiSettings.modelPresets || []}
        onPresetsAdded={handlePresetsAdded}
        maxAdd={3}
      />

      {/* Knowledge Graph */}
      {knowledgeGraphOpen && (
        // Bug 2: do NOT auto-close on a render error. The boundary is remounted
        // every time the panel opens, so an onError→close turned any transient
        // render throw into an "opens then immediately closes" loop. Containing
        // the error in place (empty fallback) keeps a single tap stable and makes
        // a real failure visible/diagnosable instead of silently yanking the map.
        <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
        <DriftKnowledgeGraph
          chatHistory={chatHistory}
          activeChatId={activeChatId}
          expanded={mapExpanded}
          onToggleExpand={() => setMapExpanded(v => !v)}
          onClose={() => { setMapExpanded(false); setKnowledgeGraphOpen(false) }}
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

            // The drift's own conversation. The chatHistory copy is a snapshot from
            // first-message registration (often just the question — the streamed
            // answer only lives in the temp store), so pick the FULLEST of the three
            // sources rather than preferring chatHistory and losing the answer.
            const driftMsgs: Message[] = [
              chatHistory.find(c => c.id === driftChatId)?.messages ?? [],
              driftStore.getTempConversation(driftChatId) ?? [],
              driftChat.messages ?? [],
            ].reduce((a, b) => (b.length > a.length ? b : a), [] as Message[])

            // A Connect *bridge* node is itself a focused Q&A thread ("How does X
            // connect to Y?") — NOT the connections list. Detect its question and
            // open the thread on its answer (connectQuestion set → chip-chat view),
            // instead of dropping back to the cards screen.
            const bridgeUserMsg = driftMsgs.find(m => m.isUser && (/connect(?:s|ed)?\s+to\s+.+/i.test(m.text) || /קשור\s+ל-?\s*.+/.test(m.text)))
            const isConnectBridge = templateType === 'connect' && !!bridgeUserMsg

            // The connections-LIST drift rebuilds its chips from cached cards, and
            // passing the (prose) conversation as messages would poison the JSON card
            // parser — so start it clean. A bridge thread (or any non-Connect drift)
            // keeps its real messages so the actual conversation shows.
            const existing: Message[] = (templateType === 'connect' && !isConnectBridge) ? [] : driftMsgs

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
              connectQuestion: isConnectBridge ? bridgeUserMsg!.text : undefined,
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
        </Suspense>
        </ErrorBoundary>
      )}

      {/* Full-text search across all chats and drifts */}
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        chatHistory={chatHistory}
        geminiApiKey={geminiApiKey}
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
