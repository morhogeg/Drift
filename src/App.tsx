import { useState, useRef, useEffect, cloneElement, isValidElement } from 'react'
import { Menu, Plus, Search, ChevronLeft, Square, ArrowDown, ArrowUp, Bookmark, Edit3, Copy, Trash2, Pin, PinOff, Star, StarOff, ExternalLink, Check, ChevronDown, Settings as SettingsIcon, Save, X, LogOut, User, GitBranch } from 'lucide-react'
import { sendMessageToOpenRouter, checkOpenRouterConnection, type ChatMessage as OpenRouterMessage, OPENROUTER_MODELS } from './services/openrouter'
import { sendMessageToOllama, checkOllamaConnection, type ChatMessage as OllamaMessage } from './services/ollama'
import { sendMessageToGemini, checkGeminiConnection } from './services/gemini'
import { checkDummyConnection } from './services/dummyAI'
import DriftPanel from './components/DriftPanel'
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
import { registerGlobalNavigationHandlers } from './components/conversation/ConversationScroller'
import { indexListMessage, getAnchorId, matchListItemsInText } from './services/lists/index'
import InlineListLink from './components/lists/InlineListLink'
import { useChatStore } from '@/store/chatStore'
import { useDriftStore } from '@/store/driftStore'
import { useModelStore, DEFAULT_TARGET } from '@/store/modelStore'
import { useUIStore } from '@/store/uiStore'
import type { Message, ChatSession } from '@/types/chat'
import { toast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui'

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

  // Broadcast / canvas transient state
  const [activeBroadcastGroupId, setActiveBroadcastGroupId] = useState<string | null>(null)
  const [, setContinuedModelByGroup] = useState<Record<string, string | null>>({})
  const [activeStrandId, setActiveStrandId] = useState<string | null>(null)
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null)
  const [continueFromMessageId, setContinueFromMessageId] = useState<string | null>(null)
  const prevContinueTargetsRef = useRef<typeof modelStore.selectedTargets | null>(null)

  // Local derived UI
  const [contextLinkVersion, setContextLinkVersion] = useState(0)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mainScrollPosition = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const userHasScrolled = useRef(false)
  const activeMessageIdRef = useRef<string | null>(null)
  const listIndexedMessageIdsRef = useRef<Set<string>>(new Set())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Convenience aliases ─────────────────────────────────────────────────────
  const messages = chatStore.messages
  const chatHistory = chatStore.chatHistory
  const activeChatId = chatStore.activeChatId
  const isTyping = chatStore.isTyping
  const streamingResponse = chatStore.streamingResponse
  const message = chatStore.inputText
  const searchQuery = chatStore.searchQuery
  const selectedTargets = modelStore.selectedTargets

  const theme = uiStore.theme

  // Apply theme class to <html> on mount and when theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const sidebarOpen = uiStore.sidebarOpen
  const settingsOpen = uiStore.settingsOpen
  const galleryOpen = uiStore.galleryOpen
  const hoveredMessageId = uiStore.hoveredMessageId
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
  const driftExpanded = driftStore.driftExpanded

  // ── On mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    chatStore.loadChatsFromDB()
  }, [])

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
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [chatHistory, activeChatId, messages])

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
    modelStore.setChatModelPrefs(activeChatId, modelStore.selectedTargets)
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
          await streamer(
            apiMessages as any,
            (chunk) => {
              acc += chunk
              chatStore.setStreaming(acc)
              // patch the bubble in place
              const current = useChatStore.getState().messages
              chatStore.setMessages(current.map(m => m.id === aiResponseId ? { ...m, text: acc } : m))
            },
            abortControllerRef.current?.signal
          )
          // update lastMessage preview
          chatStore.updateChat(activeChatId, { lastMessage: stripMarkdown(acc).slice(0, 100) })
        }

        const targets = selectedTargets.length ? selectedTargets : [DEFAULT_TARGET]
        const isBroadcast = targets.length > 1

        if (isBroadcast) {
          const broadcastGroupId = 'bg-' + Date.now()
          setActiveBroadcastGroupId(broadcastGroupId)
          setContinuedModelByGroup(prev => ({ ...prev, [broadcastGroupId]: null }))
          const tasks: Promise<void>[] = []
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
          const t = targets[0]
          if (t.provider === 'gemini') {
            const preset = (aiSettings?.modelPresets || []).find((p: any) => p.id === t.key)
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (preset as any)?.apiKey || aiSettings.geminiApiKey
            if (!apiKey) throw new Error('No Gemini API key found.')
            const model = (preset?.model || aiSettings.geminiModel) as any
            await streamIntoNewMessage(async (msgs, onChunk, signal) =>
              sendMessageToGemini(msgs, onChunk, apiKey, signal, model)
            , t.label, undefined, activeStrandId || undefined, undefined)
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
      if (gid && msg?.modelTag) {
        const canvasId = `${gid}:${msg.modelTag}`
        setActiveCanvasId(canvasId)
        const lastAssistant = [...messages].reverse().find(m => m.canvasId === canvasId && !m.isUser)
        if (lastAssistant) targetId = lastAssistant.id
      }
      setActiveStrandId(messageId)
    }
    if (targetId) setContinueFromMessageId(targetId)
    if (modelTag === 'Qwen3' || modelTag === 'Dummy A') {
      setSelectedTargetsPersist([{ provider: 'openrouter', key: 'qwen3', label: 'Qwen3' }])
    } else if (modelTag === 'OpenAI OSS' || modelTag === 'OpenRouter') {
      setSelectedTargetsPersist([{ provider: 'openrouter', key: 'oss', label: 'OpenAI OSS' }])
    } else if (modelTag === 'Ollama') {
      setSelectedTargetsPersist([{ provider: 'ollama', key: 'ollama', label: 'Ollama' }])
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
  const handleStartDrift = (selectedText: string, messageId: string, existingDriftChatId?: string, reconstructedMessages?: Message[]) => {
    const chatContainer = document.querySelector('.chat-messages-container')
    if (chatContainer) mainScrollPosition.current = chatContainer.scrollTop

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
      driftStore.openDrift({
        selectedText,
        sourceMessageId: messageId,
        contextMessages: []
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
                { selectedText, driftChatId }
              ]
            }
          : msg
      )
      chatStore.setMessages(updatedMessages)
      chatStore.updateChat(activeChatId, { messages: updatedMessages })
    }

    const finalSourceMessageId = actualMessage?.id || messageId
    const existingDrift = actualMessage?.driftInfos?.find(d => d.selectedText === selectedText)
    const finalDriftChatId = existingDrift?.driftChatId || existingDriftChatId || `drift-temp-${Date.now()}`
    const existingMessagesToUse = reconstructedMessages || driftStore.getTempConversation(finalDriftChatId) || []

    driftStore.openDrift({
      selectedText,
      sourceMessageId: finalSourceMessageId,
      contextMessages,
      highlightMessageId: actualMessage?.id,
      driftChatId: finalDriftChatId,
      existingMessages: existingMessagesToUse
    })
  }

  const handleCloseDrift = (driftMessages?: Message[]) => {
    driftStore.closeDrift(driftMessages)
    setTimeout(() => {
      const chatContainer = document.querySelector('.chat-messages-container')
      if (chatContainer) chatContainer.scrollTop = mainScrollPosition.current
    }, 150)
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
        fixed z-20 w-[260px] h-full bg-dark-surface/95 backdrop-blur-sm
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

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sortedChats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => { switchChat(chat.id); uiStore.setSidebarOpen(false) }}
              onContextMenu={(e) => handleContextMenu(e, chat.id)}
              className={`
                group relative rounded-lg p-2.5 cursor-pointer
                transition-all duration-100 ease-in-out
                ${activeChatId === chat.id
                  ? 'bg-dark-elevated border-l-2 border-dark-border/60 shadow-lg'
                  : 'bg-dark-elevated/30 hover:bg-dark-elevated/50'
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
                    <h3
                      className={`text-[13px] font-medium text-text-primary truncate ${getRTLClassName(chat.title)}`}
                      dir={getTextDirection(chat.title)}
                    >
                      {chat.title}
                    </h3>
                  )}
                  <p
                    className={`text-[11px] text-text-muted truncate mt-0.5 ${getRTLClassName(chat.lastMessage || '')}`}
                    dir={getTextDirection(chat.lastMessage || '')}
                  >
                    {chat.lastMessage ? stripMarkdown(chat.lastMessage) : ''}
                  </p>
                </div>
              </div>
              {activeChatId === chat.id && (
                <div className="absolute inset-0 rounded-xl bg-white/5 pointer-events-none" />
              )}
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
            AI Settings
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
                AI settings
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
      <div className={`
        flex-1 flex flex-col relative
        transition-all duration-150 ease-in-out
        ${sidebarOpen ? 'lg:ml-[260px]' : 'ml-0'}
        ${driftOpen ? 'lg:mr-[450px]' : 'mr-0'}
      `}>
        {/* Header */}
        <header className="relative z-10 border-b border-dark-border/30 backdrop-blur-sm bg-dark-bg/80 pt-safe">
          <div className="px-2 py-0.5 flex items-center justify-between">
            <div className="flex items-center gap-4">
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

              <div className="flex items-center gap-2">
                {/* Snippet Gallery Button — hidden on mobile */}
                <button
                  onClick={() => uiStore.setGalleryOpen(true)}
                  className="hidden lg:flex p-2.5 min-w-[44px] min-h-[44px] items-center justify-center hover:bg-dark-elevated rounded-lg transition-colors duration-75 group relative"
                  title="Snippet Gallery"
                >
                  <Bookmark className="w-5 h-5 text-text-muted group-hover:text-cyan-400 transition-colors duration-75" />
                  {snippetCount > 0 && (
                    <span className="absolute -top-1 -right-1 text-[10px] bg-cyan-500 text-dark-bg px-1.5 py-0.5 rounded-full min-w-[18px] text-center font-medium">
                      {snippetCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
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
          <div className="absolute inset-0 bg-dark-surface/90 rounded-t-2xl shadow-inner">
            <div className={`h-full overflow-y-auto pt-4 pb-24 space-y-4 chat-messages-container ${driftOpen && !driftExpanded ? 'lg:pr-[450px] lg:md:pr-[520px]' : ''}`} data-context-links-version={contextLinkVersion}>

              {/* Scroll to bottom button */}
              {showScrollButton && (
                <div className={`fixed bottom-24 z-20 transition-all duration-150
                  left-1/2 lg:${sidebarOpen ? 'left-[calc(50%+130px)]' : 'left-1/2'}
                  transform -translate-x-1/2
                  ${driftOpen ? 'lg:mr-[225px]' : ''}
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
                  <div className="relative mb-4 px-4 py-3 rounded-xl border border-dark-border/60 bg-dark-elevated/60 backdrop-blur-sm max-w-5xl mx-auto overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent-violet/50 via-accent-pink/40 to-transparent opacity-60" />
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <GitBranch className="w-3.5 h-3.5 text-text-secondary" />
                          <span className="text-sm text-text-primary font-medium">
                            Drift exploration of "{currentChat.metadata?.selectedText}"
                          </span>
                        </div>
                        <span className="text-xs text-text-muted ml-6">
                          from conversation: <span className="text-text-secondary">{parentTitle}</span>
                        </span>
                      </div>
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
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-transparent hover:bg-dark-elevated/70
                                 border border-dark-border/60 hover:border-dark-border rounded-full
                                 text-text-secondary hover:text-text-primary transition-colors duration-150 ml-4"
                      >
                        <ChevronLeft className="w-3 h-3" />
                        Back to source
                      </button>
                    </div>
                  </div>
                )
              })()}

              {/* Empty state */}
              {messages.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16">
                  <div className="w-12 h-12 rounded-2xl bg-accent-violet/10 flex items-center justify-center mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 3 L12 12 M12 12 L8 17 M12 12 L16 17" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <h3 className="text-text-primary font-medium text-lg mb-2">Start a conversation</h3>
                  <p className="text-text-muted text-sm leading-relaxed">Ask anything. Highlight text to drift into a side conversation.</p>
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
                    </div>
                  )
                }

                return msg.text ? (
                  <div
                    className={`max-w-5xl mx-auto ${msg.strandId && msg.strandId === activeStrandId ? 'pl-3 border-l-2 border-accent-violet/30' : ''}`}
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

                    <div className={`px-6 ${isDriftMessage && hasMultipleDriftMessages ? 'pl-8 border-l border-dark-border/40' : ''}`}>
                      <div
                        className={`flex ${
                          msg.isDriftPush && !msg.isUser && msg.driftPushMetadata?.originSide === 'right'
                            ? 'justify-end'
                            : msg.isUser ? 'justify-end' : 'justify-start'
                        } animate-fade-up relative group
                                    ${isDriftMessage && hasMultipleDriftMessages && !isLastDriftMessage ? 'mb-2' : ''}`}
                        style={{ animationDelay: `${index * 50}ms` }}
                        onMouseEnter={() => !msg.isUser && uiStore.setHoveredMessageId(msg.id)}
                        onMouseLeave={() => uiStore.setHoveredMessageId(null)}
                      >
                        <div
                          className={`
                            ${(isDriftMessage && !msg.isUser) || isSinglePushMessage ? 'max-w-[95%] min-w-[320px] sm:min-w-[360px] md:min-w-[420px]' : 'max-w-[85%]'} rounded-2xl px-5 ${
                              (isDriftMessage && !msg.isUser) || isSinglePushMessage
                                ? 'pt-10 pb-3'
                                : (!msg.isUser && msg.modelTag ? 'pt-7 pb-3' : 'py-3')
                            } relative
                            ${msg.isUser
                              ? 'bg-gradient-to-br from-accent-pink to-accent-violet text-white shadow-lg shadow-accent-pink/20'
                              : isSinglePushMessage
                                ? 'ai-message bg-dark-bubble border border-dark-border/50 text-text-secondary shadow-lg shadow-black/20 cursor-pointer drift-push-glow'
                                : isDriftMessage
                                  ? 'bg-dark-bubble/80 border border-dark-border/30 text-text-secondary shadow-lg cursor-pointer hover:border-dark-border/60 drift-push-glow'
                                  : 'ai-message bg-dark-bubble border border-dark-border/50 text-text-secondary shadow-lg shadow-black/20'
                            }
                            transition-all duration-100 hover:scale-[1.02]
                            ${!msg.isUser && !isDriftMessage ? 'select-text' : ''}
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
                          {/* Message actions for AI messages */}
                          {!msg.isUser && (
                            <div className={`absolute -right-9 top-2 flex flex-col gap-1 transition-all duration-100 pointer-events-none ${hoveredMessageId === msg.id ? 'opacity-100' : 'opacity-0'}`}>
                              <button
                                onClick={() => handleCopyMessage(msg.text, msg.id)}
                                className="p-1.5 rounded-lg bg-dark-elevated border border-dark-border/50 pointer-events-auto
                                         hover:bg-dark-surface hover:border-accent-violet/30 transition-all duration-100
                                         shadow-lg hover:scale-110"
                                title="Copy message"
                              >
                                {copiedMessageId === msg.id ? (
                                  <Check className="w-3.5 h-3.5 text-green-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5 text-text-muted hover:text-accent-violet" />
                                )}
                              </button>
                              <button
                                onClick={() => handleToggleSaveMessage(msg)}
                                className={`p-1.5 rounded-lg bg-dark-elevated border pointer-events-auto
                                         ${savedMessageIds.has(msg.id)
                                           ? 'border-cyan-500/50 bg-cyan-500/10'
                                           : 'border-dark-border/50'}
                                         hover:bg-dark-surface hover:border-cyan-500/50 transition-all duration-100
                                         shadow-lg hover:scale-110`}
                                title={savedMessageIds.has(msg.id) ? "Remove from snippets" : "Save to snippets"}
                              >
                                <Bookmark
                                  className={`w-3.5 h-3.5 transition-colors duration-75
                                    ${savedMessageIds.has(msg.id)
                                      ? 'text-cyan-400 fill-cyan-400'
                                      : 'text-text-muted hover:text-cyan-400'}`}
                                />
                              </button>
                              {msg.isDriftPush && !msg.text.startsWith('📌') && msg.driftPushMetadata?.wasSavedAsChat !== true && (
                                <button
                                  onClick={() => handleSavePushedDriftAsChat(msg)}
                                  className="p-1.5 rounded-lg bg-dark-elevated border border-accent-violet/50 pointer-events-auto
                                           hover:bg-accent-violet/10 hover:border-accent-violet/70 transition-all duration-100
                                           shadow-lg hover:scale-110"
                                  title="Save drift as new chat"
                                >
                                  <Save className="w-3.5 h-3.5 text-accent-violet" />
                                </button>
                              )}
                            </div>
                          )}

                          {/* Strand bead */}
                          {msg.strandId && msg.strandId === activeStrandId && (
                            <>
                              {(!messages[index - 1] || messages[index - 1]?.strandId !== msg.strandId) && (
                                <div className="absolute -left-2 top-2 w-2 h-2 rounded-full bg-accent-violet/60" />
                              )}
                            </>
                          )}

                          {/* Model tag */}
                          {!msg.isUser && msg.modelTag && !(isDriftMessage && (isSinglePushMessage || isFirstDriftMessage)) && (
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

                          {/* Drift tag */}
                          {(isDriftMessage && (isFirstDriftMessage || isSinglePushMessage)) && (
                            <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-accent-violet to-accent-pink text-[9px] font-medium text-white shadow-md opacity-80 group-hover:opacity-100">
                              Drift
                            </div>
                          )}

                          {/* Inline drift header */}
                          {(isSinglePushMessage || (isDriftMessage && !msg.isUser && isFirstDriftMessage)) && (
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
                                    <span className="truncate text-text-primary/80">"{msg.driftPushMetadata.userQuestion}"</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Message content */}
                          {msg.isUser ? (
                            <p
                              className={`text-[13px] leading-6 ${getRTLClassName(msg.text)}`}
                              dir={getTextDirection(msg.text)}
                            >
                              {msg.text}
                            </p>
                          ) : msg.driftInfos && msg.driftInfos.length > 0 ? (
                            <div
                              className={`text-[13px] leading-6 ${getRTLClassName(msg.text)}`}
                              dir={getTextDirection(msg.text)}
                            >
                              <ReactMarkdown
                                className="prose prose-sm prose-invert max-w-none text-[13px] leading-6
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
                                  const processDriftText = (children: any) => {
                                    const text = String(children)
                                    let result: React.ReactNode[] = []
                                    let lastIndex = 0
                                    const sortedDrifts = [...msg.driftInfos!].sort((a, b) => {
                                      const aIndex = text.indexOf(a.selectedText)
                                      const bIndex = text.indexOf(b.selectedText)
                                      return aIndex - bIndex
                                    })
                                    sortedDrifts.forEach((drift, idx) => {
                                      const driftIndex = text.indexOf(drift.selectedText, lastIndex)
                                      if (driftIndex !== -1) {
                                        if (driftIndex > lastIndex) result.push(text.substring(lastIndex, driftIndex))
                                        result.push(
                                          <button
                                            key={`drift-${idx}-${drift.driftChatId}`}
                                            onClick={(e) => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              if (drift.driftChatId.startsWith('drift-temp-')) {
                                                const existingDriftMessages = driftStore.getTempConversation(drift.driftChatId)
                                                handleStartDrift(drift.selectedText, msg.id, drift.driftChatId, existingDriftMessages)
                                              } else {
                                                switchChat(drift.driftChatId)
                                              }
                                            }}
                                            onTouchEnd={(e) => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              if (drift.driftChatId.startsWith('drift-temp-')) {
                                                const existingDriftMessages = driftStore.getTempConversation(drift.driftChatId)
                                                handleStartDrift(drift.selectedText, msg.id, drift.driftChatId, existingDriftMessages)
                                              } else {
                                                switchChat(drift.driftChatId)
                                              }
                                            }}
                                            className="inline px-1.5 py-0.5 rounded cursor-pointer
                                                     bg-gradient-to-r from-accent-violet/20 to-accent-pink/20
                                                     border border-accent-violet/30 hover:border-accent-violet/50
                                                     text-accent-violet hover:text-accent-pink
                                                     transition-all duration-100"
                                            title={drift.driftChatId.startsWith('drift-temp-') ? "Open drift panel" : "View drift conversation"}
                                          >
                                            {drift.selectedText}
                                          </button>
                                        )
                                        lastIndex = driftIndex + drift.selectedText.length
                                      }
                                    })
                                    if (lastIndex < text.length) result.push(text.substring(lastIndex))
                                    if (result.length === 0) return children
                                    return result
                                  }
                                  return {
                                    p: ({ children }) => <p className="mb-2">{processDriftText(children)}</p>,
                                    td: ({ children }) => <td>{processDriftText(children)}</td>,
                                    th: ({ children }) => <th>{processDriftText(children)}</th>,
                                    li: ({ children }) => {
                                      const processed = processDriftText(children)
                                      const anchorId = getAnchorId(msg.id, liCounter++)
                                      return <li><span id={anchorId}>{processed}</span></li>
                                    }
                                  }
                                })()}
                              >
                                {msg.text.replace(/<br>/g, '\n').replace(/<br\/>/g, '\n')}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <div
                              className={`${getRTLClassName(msg.text)}`}
                              dir={getTextDirection(msg.text)}
                            >
                              <ReactMarkdown
                                className="text-[13px] leading-6 prose prose-sm prose-invert max-w-none
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
                                  return {
                                    p: ({ children }: any) => <p className="mb-2">{processEntityText(children, msg.id)}</p>,
                                    li: ({ children }: any) => {
                                      const anchorId = getAnchorId(msg.id, liCounter++)
                                      return <li><span id={anchorId}>{processEntityText(children, msg.id)}</span></li>
                                    },
                                    th: ({ children }: any) => <th>{processEntityText(children, msg.id)}</th>,
                                    td: ({ children }: any) => <td>{processEntityText(children, msg.id)}</td>,
                                    br: () => <br />,
                                    table: ({ children }: any) => (
                                      <div className="overflow-x-auto my-4">
                                        <table className="min-w-full">{children}</table>
                                      </div>
                                    )
                                  }
                                })()}
                              >
                                {msg.text.replace(/<br>/g, '\n').replace(/<br\/>/g, '\n')}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null
              })}

              {isTyping && !streamingResponse && !messages.some(m => !m.isUser && (!m.text || m.text.length === 0)) && (
                <div className="max-w-5xl mx-auto px-6">
                  <div className="flex justify-start animate-fade-up">
                    <div className="bg-dark-bubble border border-dark-border/50 rounded-2xl px-5 py-3 shadow-lg">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Input area */}
        <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }} className={`absolute bottom-0 left-0 right-0 z-10 px-4 pt-4 w-full box-border ${driftOpen && !driftExpanded ? 'lg:mr-[450px] lg:md:mr-[520px]' : ''}`}>
          <div className="max-w-4xl mx-auto">
            <div className="relative flex gap-3 items-end">
              <div className="flex-1 relative">
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
                    rounded-2xl px-5 py-3 pr-14
                    border border-dark-border/60
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
                {isTyping ? (
                  <button
                    onClick={stopGeneration}
                    className={`
                      absolute right-2
                      ${message.split('\n').length > 1 || message.length > 50 ? 'bottom-1.5' : 'top-1/2 -translate-y-1/2'}
                      min-w-[44px] min-h-[44px] rounded-full
                      flex items-center justify-center
                      active:scale-90 transition-all duration-100
                    `}
                    title="Stop generating"
                  >
                    <div className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                      <Square className="w-3 h-3 text-text-muted" fill="currentColor" />
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={sendMessage}
                    disabled={!message.trim()}
                    className={`
                      absolute right-2
                      ${message.split('\n').length > 1 || message.length > 50 ? 'bottom-1.5' : 'top-1/2 -translate-y-1/2'}
                      min-w-[44px] min-h-[44px] rounded-full
                      flex items-center justify-center
                      active:scale-90 disabled:opacity-30
                      transition-all duration-100
                    `}
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-pink to-accent-violet flex items-center justify-center shadow-md shadow-accent-pink/20">
                      <ArrowUp className="w-3.5 h-3.5 text-white" />
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selection Tooltip */}
      <SelectionTooltip
        onStartDrift={handleStartDrift}
        currentChatId={activeChatId}
        currentChatTitle={chatHistory.find(c => c.id === activeChatId)?.title || 'Chat'}
        onSnippetSaved={() => uiStore.setSnippetCount(snippetStorage.getAllSnippets().length)}
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
        selectedTargets={selectedTargets}
        selectedProvider={(() => {
          const targets = (selectedTargets && selectedTargets.length) ? selectedTargets : [DEFAULT_TARGET]
          if (targets.length === 1) return targets[0].provider as 'openrouter' | 'ollama' | 'gemini'
          if (targets.some(t => t.provider === 'gemini')) return 'gemini'
          if (targets.some(t => t.provider === 'openrouter')) return 'openrouter'
          if (targets.some(t => t.provider === 'ollama')) return 'ollama'
          return 'gemini'
        })()}
        onExpandedChange={(expanded) => driftStore.expandDrift(expanded)}
      />

      {/* Settings Modal */}
      <Settings
        isOpen={settingsOpen}
        onClose={() => uiStore.setSettingsOpen(false)}
        onSave={handleSaveSettings}
        currentSettings={aiSettings}
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
