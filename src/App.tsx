import { useState, useRef, useEffect, cloneElement, isValidElement } from 'react'
import { Menu, Plus, Search, MessageCircle, ChevronLeft, Square, ArrowDown, ArrowUp, Bookmark, Edit3, Copy, Trash2, Pin, PinOff, Star, StarOff, ExternalLink, Check, ChevronDown, Settings as SettingsIcon, Save, X, LogOut, User, GitBranch } from 'lucide-react'
import { sendMessageToOpenRouter, checkOpenRouterConnection, type ChatMessage as OpenRouterMessage, OPENROUTER_MODELS } from './services/openrouter'
import { sendMessageToOllama, checkOllamaConnection, type ChatMessage as OllamaMessage } from './services/ollama'
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
// DummyModelSelector removed in favor of inline chips
import HeaderControls from './components/HeaderControls'
import { registerGlobalNavigationHandlers } from './components/conversation/ConversationScroller'
import { indexListMessage, getAnchorId, matchListItemsInText } from './services/lists/index'
import InlineListLink from './components/lists/InlineListLink'
// navigation helpers used internally by popup; no app-level hooks required here

interface Message {
  id: string
  text: string
  isUser: boolean
  // When pushing drift messages back to main, we convert all
  // pushed entries to assistant bubbles but remember the original
  // role so that reconstructing the drift can restore roles.
  originalIsUser?: boolean
  timestamp: Date
  modelTag?: string
  broadcastGroupId?: string
  strandId?: string
  canvasId?: string
  hasDrift?: boolean
  driftInfos?: Array<{
    selectedText: string
    driftChatId: string
  }>
  isDriftPush?: boolean  // Marks messages that were pushed from drift
  driftPushMetadata?: {   // Metadata for pushed drift messages
    selectedText: string
    sourceMessageId: string
    parentChatId: string
    wasSavedAsChat?: boolean
    userQuestion?: string
    driftChatId?: string
    // When a drift is pushed while in broadcast mode, remember
    // which side (left/right) the originating model was rendered on
    originSide?: 'left' | 'right'
    // Preserve the originating model tag for labeling/alignment
    originModelTag?: string
  }
  isHiddenContext?: boolean  // For single message pushes, hides context messages
}

interface ChatSession {
  id: string
  title: string
  messages: Message[]
  lastMessage?: string
  createdAt: Date
  metadata?: {
    isDrift?: boolean
    parentChatId?: string
    sourceMessageId?: string
    selectedText?: string
  }
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeChatId, setActiveChatId] = useState('1')
  const [apiConnected, setApiConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [useOpenRouter, setUseOpenRouter] = useState(true) // Toggle between OpenRouter and Ollama
  const [streamingResponse, setStreamingResponse] = useState('')
  const [showScrollButton, setShowScrollButton] = useState(false)
  // Model selection for main chat (multi-provider broadcast)
  type Provider = 'dummy' | 'openrouter' | 'ollama'
  type Target = { provider: Provider, key: string, label: string }
  const DEFAULT_TARGET: Target = { provider: 'dummy', key: 'dummy-basic', label: 'Qwen3' }
  const [selectedTargets, setSelectedTargets] = useState<Target[]>([DEFAULT_TARGET])
  // Broadcast grouping state
  const [activeBroadcastGroupId, setActiveBroadcastGroupId] = useState<string | null>(null)
  const [, setContinuedModelByGroup] = useState<Record<string, string | null>>({})
  const CHAT_MODEL_PREFS_KEY = 'drift_chat_model_prefs'
  const [chatModelPrefs, setChatModelPrefs] = useState<Record<string, Target[]>>(() => {
    try {
      const raw = localStorage.getItem(CHAT_MODEL_PREFS_KEY)
      const parsed = raw ? JSON.parse(raw) : {}
      return parsed
    } catch {
      return {}
    }
  })
  const persistSelectedTargets = (chatId: string, targets: Target[]) => {
    setChatModelPrefs(prev => {
      const next = { ...prev, [chatId]: targets }
      try { localStorage.setItem(CHAT_MODEL_PREFS_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }
  // Ensure selected mode follows per-chat preference
  useEffect(() => {
    const saved = chatModelPrefs[activeChatId]
    if (saved && Array.isArray(saved) && saved.length) setSelectedTargets(saved as Target[])
  }, [activeChatId])
  const setSelectedTargetsPersist = (targets: Target[]) => {
    // Deduplicate by key
    const allowed = new Set(['dummy-basic','openrouter','ollama'])
    const map = new Map<string, Target>()
    for (const t of targets) {
      if (allowed.has(t.key)) map.set(t.key, t)
    }
    const final = map.size ? Array.from(map.values()) : [DEFAULT_TARGET]
    setSelectedTargets(final)
    persistSelectedTargets(activeChatId, final)
  }
  // expand/regenerate removed per UX
  const [activeStrandId, setActiveStrandId] = useState<string | null>(null)
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mainScrollPosition = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const userHasScrolled = useRef(false)
  const activeMessageIdRef = useRef<string | null>(null)
  // List linking state (no entity mentions)
  const listIndexedMessageIdsRef = useRef<Set<string>>(new Set())
  const [contextLinkVersion, setContextLinkVersion] = useState(0)
  
  // Helper function to strip markdown formatting for preview text
  const stripMarkdown = (text: string): string => {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
      .replace(/\*([^*]+)\*/g, '$1') // Italic
      .replace(/#{1,6}\s/g, '') // Headers
      .replace(/`([^`]+)`/g, '$1') // Inline code
      .replace(/```[^`]*```/g, '') // Code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // Images
      .replace(/^[-*+]\s/gm, '') // Lists
      .replace(/^\d+\.\s/gm, '') // Numbered lists
      .replace(/>\s/g, '') // Blockquotes
      .replace(/\n{2,}/g, ' ') // Multiple newlines
      .trim()
  }

  // Index assistant lists for list-based navigation (no entity mentions)
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

  // Global handlers for message navigation (list links)
  useEffect(() => {
    const unsubNav = registerGlobalNavigationHandlers()
    return () => { unsubNav() }
  }, [])

  // Track active message id based on viewport center
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

  // Inline list link processing for ReactMarkdown children (recursive, preserves formatting)
  const processEntityText = (children: React.ReactNode, messageId: string): React.ReactNode => {
    // per-call limit to avoid clutter
    let remaining = 5

    const renderString = (text: string): React.ReactNode => {
      if (!text) return text
      const used: Array<{ s: number; e: number; list?: { to: string; anchor: string; surface: string } }> = []
      // Wrap list item references (explicit names + ordinals)
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
      return node
    }

    return walk(children)
  }
  
  // Drift state
  const [driftOpen, setDriftOpen] = useState(false)
  const [driftContext, setDriftContext] = useState<{
    selectedText: string
    sourceMessageId: string
    contextMessages: Message[]
    highlightMessageId?: string
    driftChatId?: string
    existingMessages?: Message[]
  }>({
    selectedText: '',
    sourceMessageId: '',
    contextMessages: []
  })
  
  // Gallery state
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [snippetCount, setSnippetCount] = useState(0)
  // Track Drift panel expansion to adjust main layout padding
  const [driftExpanded, setDriftExpanded] = useState(false)
  
  // Store temporary drift conversations - key is driftChatId
  const [tempDriftConversations, setTempDriftConversations] = useState<Map<string, Message[]>>(new Map())
  
  // Settings state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    const settings = settingsStorage.get()
    // Ensure we always have the API key from env if settings don't have it
    if (!settings.openRouterApiKey && import.meta.env.VITE_OPENROUTER_API_KEY) {
      settings.openRouterApiKey = import.meta.env.VITE_OPENROUTER_API_KEY
    }
    return settings
  })
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    chatId: string
  } | null>(null)
  const [pinnedChats, setPinnedChats] = useState<Set<string>>(new Set())
  const [starredChats, setStarredChats] = useState<Set<string>>(new Set())
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  
  // Message action states
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set())
  
  // Input textarea ref for auto-resize
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const scrollHeight = textarea.scrollHeight
      textarea.style.height = Math.min(scrollHeight, 200) + 'px'
    }
  }, [message])

  // Chat history state
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([
    {
      id: '1',
      title: 'New Chat',
      messages: [],
      lastMessage: 'Let\'s explore ideas together...',
      createdAt: new Date()
    },
    {
      id: '2',
      title: 'Project Planning Discussion',
      messages: [],
      lastMessage: 'The timeline looks good for Q2...',
      createdAt: new Date(Date.now() - 86400000)
    },
    {
      id: '3',
      title: 'Creative Brainstorming',
      messages: [],
      lastMessage: 'That\'s an innovative approach!',
      createdAt: new Date(Date.now() - 172800000)
    },
    {
      id: '4',
      title: 'Technical Architecture',
      messages: [],
      lastMessage: 'The microservices pattern would...',
      createdAt: new Date(Date.now() - 259200000)
    }
  ])

  const filteredChats = chatHistory.filter(chat =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const isAtBottom = () => {
    const chatContainer = document.querySelector('.chat-messages-container')
    if (!chatContainer) return true
    
    // Check if user is within 100px of the bottom
    const threshold = 100
    return chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < threshold
  }

  useEffect(() => {
    // Only auto-scroll if user hasn't manually scrolled
    if (!userHasScrolled.current && messages.length > 0) {
      scrollToBottom()
    }
  }, [messages])
  
  useEffect(() => {
    // Don't auto-scroll during streaming if user has scrolled
    if (!userHasScrolled.current && streamingResponse) {
      const chatContainer = document.querySelector('.chat-messages-container')
      if (chatContainer && isAtBottom()) {
        scrollToBottom()
      }
    }
  }, [streamingResponse])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command+Option+N or Ctrl+Alt+N for new chat
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'n') {
        e.preventDefault()
        createNewChat()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [chatHistory, activeChatId, messages]) // Dependencies needed by createNewChat

  useEffect(() => {
    // Check API connection on mount
    const checkConnection = async (showConnecting = true) => {
      if (showConnecting) {
        setIsConnecting(true)
      }
      try {
        if (aiSettings.useDummyAI) {
          // Dummy AI always connects instantly
          const connected = await checkDummyConnection()
          setApiConnected(connected)
          setIsConnecting(false)
          return
        } else if (aiSettings.useOpenRouter) {
          // ALWAYS use env variable if available
          const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || aiSettings.openRouterApiKey
          console.log('Attempting to connect with OpenRouter:', {
            hasEnvKey: !!import.meta.env.VITE_OPENROUTER_API_KEY,
            hasSettingsKey: !!aiSettings.openRouterApiKey,
            keyLength: apiKey?.length
          })
          
          // If no API key is configured, open settings automatically
          if (!apiKey || apiKey.trim() === '') {
            console.log('No API key found, opening settings...')
            setSettingsOpen(true)
            setApiConnected(false)
            setIsConnecting(false)
            return
          }
          
          const connected = await checkOpenRouterConnection(apiKey, aiSettings.openRouterModel)
          setApiConnected(connected)
          
          // If connection failed and no env key, open settings
          if (!connected && !import.meta.env.VITE_OPENROUTER_API_KEY) {
            setSettingsOpen(true)
          }
        } else {
          console.log('Attempting to connect with Ollama:', aiSettings.ollamaUrl)
          const connected = await checkOllamaConnection(aiSettings.ollamaUrl)
          setApiConnected(connected)
        }
      } catch (error) {
        console.error('Connection check error:', error)
        setApiConnected(false)
      } finally {
        if (showConnecting) {
          setIsConnecting(false)
        }
      }
    }
    
    // Initial connection check with "Connecting..." state
    checkConnection(true)
    
    // Check connection every 5 seconds without showing "Connecting..." state
    const interval = setInterval(() => checkConnection(false), 5000)
    
    return () => clearInterval(interval)
  }, [aiSettings])

  useEffect(() => {
    // Update snippet count and load saved message IDs
    try {
      const allSnippets = snippetStorage.getAllSnippets()
      setSnippetCount(allSnippets.length)
      
      // Track which messages are saved
      const savedIds = new Set<string>()
      allSnippets.forEach(snippet => {
        if (snippet.source.messageId) {
          savedIds.add(snippet.source.messageId)
        }
      })
      setSavedMessageIds(savedIds)
    } catch (error) {
      console.error('Error loading snippets:', error)
      setSnippetCount(0)
    }
  }, [galleryOpen])
  
  // Auto-resize textarea and manage scrollbar visibility
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const scrollHeight = textareaRef.current.scrollHeight
      const newHeight = Math.min(scrollHeight, 200)
      textareaRef.current.style.height = newHeight + 'px'
      
      // Add scrollable class only when content overflows
      if (scrollHeight > 200) {
        textareaRef.current.classList.add('scrollable')
      } else {
        textareaRef.current.classList.remove('scrollable')
      }
    }
  }, [message])

  useEffect(() => {
    // Monitor scroll position to show/hide scroll button
    const chatContainer = document.querySelector('.chat-messages-container')
    if (!chatContainer) return
    
    let scrollTimeout: ReturnType<typeof setTimeout>
    
    const handleScroll = () => {
      const atBottom = isAtBottom()
      setShowScrollButton(!atBottom)
      
      // If user scrolled up manually, set the flag
      if (!atBottom) {
        userHasScrolled.current = true
      }
      
      // Reset the flag if user scrolls back to bottom
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

  const sendMessage = async () => {
    if (message.trim()) {
      // Clear inline continue context on send
      if (continueFromMessageId) {
        setContinueFromMessageId(null)
      }
      // Take a snapshot of the current canvas context (if user had clicked Continue)
      const canvasIdSnapshot = activeCanvasId || undefined

      const newMessage: Message = {
        id: Date.now().toString(),
        text: message,
        isUser: true,
        timestamp: new Date(),
        strandId: activeStrandId || undefined,
        // Only this message should use the snapshot; clear canvas afterwards
        canvasId: canvasIdSnapshot
      }
      
      const updatedMessages = [...messages, newMessage]
      setMessages(updatedMessages)
      // Exit canvas mode so subsequent messages are not grouped unintentionally
      if (activeCanvasId) setActiveCanvasId(null)
      setMessage('')
      setIsTyping(true)
      setStreamingResponse('')
      
      // Reset scroll flag and scroll to bottom when sending a message
      userHasScrolled.current = false
      setTimeout(scrollToBottom, 100)
      
      // Update chat history with new message
      // Also update title if this is the first message
      setChatHistory(prevHistory => 
        prevHistory.map(chat => {
          if (chat.id === activeChatId) {
            const updatedChat = { ...chat, messages: updatedMessages, lastMessage: message }
            // If this is the first user message and title is still "New Chat", update it
            if (chat.title === 'New Chat' && updatedMessages.filter(m => m.isUser).length === 1) {
              updatedChat.title = message.slice(0, 50) + (message.length > 50 ? '...' : '')
            }
            return updatedChat
          }
          return chat
        })
      )
      
      // Convert messages to API format
      const apiMessages: (OpenRouterMessage | OllamaMessage)[] = updatedMessages.map(msg => ({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.text
      }))
      
      try {
        // Create abort controller for this request
        const abortController = new AbortController()
        abortControllerRef.current = abortController
        
        // Helper: stream one response into a new message bubble
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
          setMessages(prev => [...prev, aiMessage])
          await streamer(
            apiMessages as any,
            (chunk) => {
              acc += chunk
              setStreamingResponse(acc)
              setMessages(prev => prev.map(m => m.id === aiResponseId ? { ...m, text: acc } : m))
            },
            abortControllerRef.current?.signal
          )
          // Finalize lastMessage preview for the chat after this stream
          setChatHistory(prevHistory =>
            prevHistory.map(chat =>
              chat.id === activeChatId
                ? {
                    ...chat,
                    lastMessage: stripMarkdown(acc).slice(0, 100)
                  }
                : chat
            )
          )
        }

        // Stream the response using the selected API
        {
          const targets = selectedTargets.length ? selectedTargets : [DEFAULT_TARGET]
          const isBroadcast = targets.length > 1
          if (isBroadcast) {
            const broadcastGroupId = 'bg-' + Date.now()
            setActiveBroadcastGroupId(broadcastGroupId)
            setContinuedModelByGroup(prev => ({ ...prev, [broadcastGroupId]: null }))
            const tasks: Promise<void>[] = []
            for (const t of targets) {
              if (t.provider === 'dummy') {
                // Replace Dummy with OpenRouter Qwen3 model
                const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || aiSettings.openRouterApiKey
                if (!apiKey) {
                  throw new Error('No OpenRouter API key found. Please set VITE_OPENROUTER_API_KEY in .env file')
                }
                tasks.push(
                  streamIntoNewMessage(async (msgs, onChunk, signal) =>
                    sendMessageToOpenRouter(msgs, onChunk, apiKey, signal, OPENROUTER_MODELS.QWEN3)
                  , t.label, broadcastGroupId)
                )
              } else if (t.provider === 'openrouter') {
                const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || aiSettings.openRouterApiKey
                tasks.push(
                  streamIntoNewMessage(async (msgs, onChunk, signal) => 
                    sendMessageToOpenRouter(msgs, onChunk, apiKey, signal, aiSettings.openRouterModel)
                  , 'OpenAI OSS', broadcastGroupId)
                )
              } else if (t.provider === 'ollama') {
                tasks.push(
                  streamIntoNewMessage(async (msgs, onChunk, signal) => {
                    await sendMessageToOllama(msgs, onChunk, signal!, aiSettings.ollamaUrl, aiSettings.ollamaModel)
                  }, 'Ollama', broadcastGroupId)
                )
              }
            }
            await Promise.allSettled(tasks)
          } else {
            const t = targets[0]
            if (t.provider === 'dummy') {
              // Replace Dummy with OpenRouter Qwen3 model
              const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || aiSettings.openRouterApiKey
              if (!apiKey) {
                throw new Error('No OpenRouter API key found. Please set VITE_OPENROUTER_API_KEY in .env file')
              }
              await streamIntoNewMessage(async (msgs, onChunk, signal) =>
                sendMessageToOpenRouter(msgs, onChunk, apiKey, signal, OPENROUTER_MODELS.QWEN3)
              , t.label, undefined, activeStrandId || undefined, undefined)
            } else if (t.provider === 'openrouter') {
              const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || aiSettings.openRouterApiKey
              if (!apiKey) {
                throw new Error('No OpenRouter API key found. Please set VITE_OPENROUTER_API_KEY in .env file')
              }
              await streamIntoNewMessage(async (msgs, onChunk, signal) =>
                sendMessageToOpenRouter(msgs, onChunk, apiKey, signal, aiSettings.openRouterModel)
              , 'OpenAI OSS', undefined, activeStrandId || undefined, undefined)
            } else if (t.provider === 'ollama') {
              await streamIntoNewMessage(async (msgs, onChunk, signal) => {
                await sendMessageToOllama(msgs, onChunk, signal!, aiSettings.ollamaUrl, aiSettings.ollamaModel)
              }, 'Ollama', undefined, activeStrandId || undefined, undefined)
            }
          }
        }

        // Clear stream buffer indicator
        setStreamingResponse('')
      } catch (error) {
        // Fallback message based on which API is being used
        let errorMessage = "Failed to connect to AI model. Please check your connection."
        
        if (error instanceof Error) {
          if (useOpenRouter && error.message.includes('API key')) {
            errorMessage = "OpenRouter API key not configured. Please add your API key to the .env file:\n1. Get your API key from https://openrouter.ai/keys\n2. Add to .env: VITE_OPENROUTER_API_KEY=your_key_here\n3. Restart the development server"
          } else if (!useOpenRouter && error.message.includes('Ollama is not running')) {
            errorMessage = "Ollama is not running. Please install and start Ollama:\n1. Download from ollama.com\n2. Run: ollama pull gpt-oss:20b\n3. Run: ollama serve"
          }
        }
          
        const aiResponse: Message = {
          id: (Date.now() + 1).toString(),
          text: errorMessage,
          isUser: false,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, aiResponse])
        
        // Update chat history with error
        setChatHistory(prevHistory => 
          prevHistory.map(chat => 
            chat.id === activeChatId 
              ? { ...chat, messages: [...updatedMessages, aiResponse], lastMessage: 'Connection error' }
              : chat
          )
        )
      } finally {
        setIsTyping(false)
        abortControllerRef.current = null
        // Reset scroll flag when AI finishes
        if (!userHasScrolled.current) {
          setTimeout(scrollToBottom, 100)
        }
      }
    }
  }

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsTyping(false)
      setStreamingResponse('')
    }
  }

  // toggleExpand / regenerate removed

  // Choose a specific model from a broadcast response and switch mode
  const [continueFromMessageId, setContinueFromMessageId] = useState<string | null>(null)
  const prevContinueTargetsRef = useRef<Target[] | null>(null)
  const continueWithModel = (modelTag?: string, messageId?: string) => {
    if (!modelTag) return
    {
      prevContinueTargetsRef.current = selectedTargets
      // Resolve the exact bubble to glow (last assistant in the selected lane)
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
        // Set active strand root to the chosen header bubble
        setActiveStrandId(messageId)
      }
      // Update state for ring; do NOT rely on it for immediate DOM highlighting
      if (targetId) setContinueFromMessageId(targetId)
      // Normalize to current model labels
      if (modelTag === 'Qwen3' || modelTag === 'Dummy A') {
        setSelectedTargetsPersist([{ provider: 'dummy', key: 'dummy-basic', label: 'Qwen3' }])
      } else if (modelTag === 'OpenAI OSS' || modelTag === 'OpenRouter') {
        setSelectedTargetsPersist([{ provider: 'openrouter', key: 'openrouter', label: 'OpenAI OSS' }])
      } else if (modelTag === 'Ollama') {
        setSelectedTargetsPersist([{ provider: 'ollama', key: 'ollama', label: 'Ollama' }])
      }
      // Briefly highlight and focus input for seamless continuation (use local targetId)
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
  }

  // Settings changes are handled via the Settings modal (handleSaveSettings)

  const handleSaveSettings = (newSettings: AISettings) => {
    // If API key is empty, use the one from environment
    if (!newSettings.openRouterApiKey && import.meta.env.VITE_OPENROUTER_API_KEY) {
      newSettings.openRouterApiKey = import.meta.env.VITE_OPENROUTER_API_KEY
    }
    console.log('Saving settings:', newSettings)
    setAiSettings(newSettings)
    settingsStorage.save(newSettings)
    // Update the connection states - these are now redundant since we use aiSettings directly
    setUseOpenRouter(newSettings.useOpenRouter)
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const createNewChat = () => {
    // Close drift panel if it's open (it belongs to the previous chat context)
    if (driftOpen) {
      setDriftOpen(false)
    }
    
    // Update the title and save messages of the current active chat
    const updatedHistory = chatHistory.map(chat => {
      if (chat.id === activeChatId) {
        // Save current messages
        const updatedChat = { ...chat, messages: messages }
        
        // Update title if there are messages and it's still generic
        if (messages.length > 0 && (chat.title === 'New Chat' || chat.title === 'Current Conversation')) {
          const firstUserMessage = messages.find(m => m.isUser)
          const newTitle = firstUserMessage 
            ? firstUserMessage.text.slice(0, 50) + (firstUserMessage.text.length > 50 ? '...' : '')
            : `Chat from ${formatDate(chat.createdAt)}`
          updatedChat.title = newTitle
        }
        
        return updatedChat
      }
      return chat
    })
    
    const newChatId = Date.now().toString()
    const newChat: ChatSession = {
      id: newChatId,
      title: 'New Chat',
      messages: [],
      lastMessage: 'Start a new conversation...',
      createdAt: new Date()
    }
    
    setChatHistory([newChat, ...updatedHistory])
    setActiveChatId(newChatId)
    setMessages([])
  }

  const switchChat = (chatId: string) => {
    // Don't switch to the same chat
    if (chatId === activeChatId) return
    
    // Save current chat's messages before switching
    const updatedHistory = chatHistory.map(chat => 
      chat.id === activeChatId 
        ? { ...chat, messages: messages }
        : chat
    )
    
    setChatHistory(updatedHistory)
    
    // Load the selected chat's messages
    const targetChat = updatedHistory.find(c => c.id === chatId)
    if (targetChat) {
      setActiveChatId(chatId)
      setMessages(targetChat.messages || [])
      
      // Update saved message IDs for the new chat
      const allSnippets = snippetStorage.getAllSnippets()
      const savedIds = new Set<string>()
      allSnippets.forEach(snippet => {
        if (snippet.source.messageId && 
            snippet.source.chatId === chatId) {
          savedIds.add(snippet.source.messageId)
        }
      })
      setSavedMessageIds(savedIds)
    }
  }

  // Drift handlers
  const handleStartDrift = (selectedText: string, messageId: string, existingDriftChatId?: string, reconstructedMessages?: Message[]) => {
    console.log('handleStartDrift called with:', { 
      selectedText, 
      messageId, 
      existingDriftChatId, 
      hasReconstructedMessages: !!reconstructedMessages,
      reconstructedMessageCount: reconstructedMessages?.length || 0
    })
    
    // Save scroll position
    const chatContainer = document.querySelector('.chat-messages-container')
    if (chatContainer) {
      mainScrollPosition.current = chatContainer.scrollTop
    }
    
    // Get current chat's messages directly from the rendered messages
    // Since the messages are being displayed, we should use the same source
    const currentChat = chatHistory.find(c => c.id === activeChatId)
    let currentMessages = currentChat?.messages || messages
    
    // If messages are empty, try to get them from state
    if (currentMessages.length === 0) {
      currentMessages = messages
    }
    
    console.log('Using messages from:', currentChat ? 'chatHistory' : 'state')
    console.log('Total messages:', currentMessages.length)
    
    // Find message by selected text (most reliable method)
    let messageIndex = -1
    let actualMessage = null
    
    // First try to find an AI message containing the exact selected text
    for (let i = 0; i < currentMessages.length; i++) {
      const msg = currentMessages[i]
      if (!msg.isUser && msg.text && msg.text.includes(selectedText)) {
        messageIndex = i
        actualMessage = msg
        console.log('Found message by text at index:', i)
        break
      }
    }
    
    if (messageIndex === -1) {
      console.error('Could not find message containing text:', selectedText)
      console.error('Searched in', currentMessages.length, 'messages')
      // Don't return - create a minimal context instead
      
      // Create a minimal drift context with just the selected text
      setDriftContext({
        selectedText,
        sourceMessageId: messageId,
        contextMessages: [],
        highlightMessageId: undefined
      })
      setDriftOpen(true)
      return
    }
    
    // Get all messages up to and including the selected message
    const contextMessages = currentMessages.slice(0, messageIndex + 1)
    
    // Mark the source message as having a drift (for visual indication)
    if (actualMessage) {
      // Check if there's already a drift for this text from this message
      const existingDrift = actualMessage.driftInfos?.find(d => d.selectedText === selectedText)
      const driftChatId = existingDrift?.driftChatId || existingDriftChatId || `drift-temp-${Date.now()}`
      
      const updatedMessages = currentMessages.map(msg => 
        msg.id === actualMessage.id 
          ? { 
              ...msg, 
              hasDrift: true, 
              driftInfos: existingDrift ? msg.driftInfos : [
                ...(msg.driftInfos || []),
                { 
                  selectedText, 
                  driftChatId
                }
              ]
            }
          : msg
      )
      setMessages(updatedMessages)
      
      // Also update in chat history
      setChatHistory(prev => prev.map(chat => 
        chat.id === activeChatId 
          ? { ...chat, messages: updatedMessages }
          : chat
      ))
    }
    
    const finalSourceMessageId = actualMessage?.id || messageId
    console.log('Setting drift context with sourceMessageId:', finalSourceMessageId)
    console.log('actualMessage:', actualMessage)
    
    // Check if we have an existing drift conversation for this drift ID
    const existingDrift = actualMessage?.driftInfos?.find(d => d.selectedText === selectedText)
    const finalDriftChatId = existingDrift?.driftChatId || existingDriftChatId || `drift-temp-${Date.now()}`
    
    const existingMessagesToUse = reconstructedMessages || tempDriftConversations.get(finalDriftChatId) || []
    
    console.log('Setting drift context with:', {
      driftChatId: finalDriftChatId,
      existingMessagesCount: existingMessagesToUse.length,
      contextMessagesCount: contextMessages.length
    })
    
    setDriftContext({
      selectedText,
      sourceMessageId: finalSourceMessageId,
      contextMessages,
      highlightMessageId: actualMessage?.id,
      driftChatId: finalDriftChatId,
      existingMessages: existingMessagesToUse
    })
    setDriftOpen(true)
    console.log('Drift panel opened with', contextMessages.length, 'context messages and', existingMessagesToUse.length, 'existing messages')
  }

  const handleCloseDrift = (driftMessages?: Message[]) => {
    // Save drift conversation if provided
    if (driftMessages && driftContext.driftChatId) {
      setTempDriftConversations(prev => {
        const newMap = new Map(prev)
        newMap.set(driftContext.driftChatId!, driftMessages)
        return newMap
      })
    }
    
    setDriftOpen(false)
    
    // Restore scroll position
    setTimeout(() => {
      const chatContainer = document.querySelector('.chat-messages-container')
      if (chatContainer) {
        chatContainer.scrollTop = mainScrollPosition.current
      }
    }, 150)
  }

  const handleCopyMessage = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }
  
  const handleToggleSaveMessage = (message: Message) => {
    if (savedMessageIds.has(message.id)) {
      // Unsave: Find and delete the snippet
      const allSnippets = snippetStorage.getAllSnippets()
      const snippetToDelete = allSnippets.find(s => 
        s.source.messageId === message.id &&
        s.source.chatId === activeChatId
      )
      
      if (snippetToDelete) {
        snippetStorage.deleteSnippet(snippetToDelete.id)
        setSavedMessageIds(prev => {
          const newSet = new Set(prev)
          newSet.delete(message.id)
          return newSet
        })
        setSnippetCount(prev => Math.max(0, prev - 1))
      }
    } else {
      // Save: Create new snippet
      const currentChat = chatHistory.find(c => c.id === activeChatId)
      const source = {
        chatId: activeChatId,
        chatTitle: currentChat?.title || 'Untitled Chat',
        messageId: message.id,
        isFullMessage: true,
        timestamp: message.timestamp
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
      setSnippetCount(prev => prev + 1)
    }
  }
  
  const handleSaveDriftAsChat = (driftMessages: Message[], title: string, metadata: any) => {
    // Use the ID from metadata if provided (for undo tracking), otherwise generate new one
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
    
    setChatHistory(prev => [newChat, ...prev])
    
    // Update the source message to include drift info
    const updatedMessages = messages.map(msg => {
      // Update if it's the source message OR if it has a temporary drift ID for this drift
      if (msg.id === metadata.sourceMessageId || 
          (msg.driftInfos && msg.driftInfos.some(d => 
            d.selectedText === metadata.selectedText && 
            d.driftChatId.startsWith('drift-temp-')))) {
        return { 
          ...msg, 
          hasDrift: true,
          driftInfos: [
            ...(msg.driftInfos?.filter(d => d.selectedText !== metadata.selectedText) || []),
            {
              selectedText: metadata.selectedText,
              driftChatId: newChatId
            }
          ]
        }
      }
      return msg
    })
    
    setMessages(updatedMessages)
    
    // Update ALL chats in history to ensure the source message is updated everywhere
    setChatHistory(prevHistory => 
      prevHistory.map(chat => {
        if (chat.id === activeChatId) {
          // Update the active chat with the new messages
          return { ...chat, messages: updatedMessages }
        } else if (chat.messages) {
          // Also update messages in other chats if they contain the source message
          const updatedChatMessages = chat.messages.map(msg => {
            if (msg.id === metadata.sourceMessageId || 
                (msg.driftInfos && msg.driftInfos.some(d => 
                  d.selectedText === metadata.selectedText && 
                  d.driftChatId.startsWith('drift-temp-')))) {
              return { 
                ...msg, 
                hasDrift: true,
                driftInfos: [
                  ...(msg.driftInfos?.filter(d => d.selectedText !== metadata.selectedText) || []),
                  {
                    selectedText: metadata.selectedText,
                    driftChatId: newChatId
                  }
                ]
              }
            }
            return msg
          })
          return { ...chat, messages: updatedChatMessages }
        }
        return chat
      })
    )
  }
  
  const handleUndoPushToMain = (sourceMessageId: string) => {
    // Remove all pushed drift messages from this source
    const updatedMessages = messages.filter(msg => {
      // Keep message if it's not a drift push OR if it's from a different source
      return !msg.isDriftPush || msg.driftPushMetadata?.sourceMessageId !== sourceMessageId
    })
    
    setMessages(updatedMessages)
    
    // Update chat history as well
    setChatHistory(prevHistory =>
      prevHistory.map(chat =>
        chat.id === activeChatId
          ? { ...chat, messages: updatedMessages }
          : chat
      )
    )
  }
  
  const handleUndoSaveAsChat = (chatId: string) => {
    // Remove the saved drift chat from history
    setChatHistory(prevHistory => prevHistory.filter(chat => chat.id !== chatId))
    
    // Also remove the drift info from the source message
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
    
    setMessages(updatedMessages)
    
    // Update chat history for current chat
    setChatHistory(prevHistory =>
      prevHistory.map(chat =>
        chat.id === activeChatId
          ? { ...chat, messages: updatedMessages }
          : chat
      )
    )
  }

  const handleUpdatePushedDriftSaveStatus = (sourceMessageId: string) => {
    // Update all pushed drift messages from this source to mark them as saved
    const updatedMessages = messages.map(msg => {
      if (msg.isDriftPush && msg.driftPushMetadata?.sourceMessageId === sourceMessageId) {
        return {
          ...msg,
          driftPushMetadata: {
            ...msg.driftPushMetadata,
            wasSavedAsChat: true
          }
        }
      }
      return msg
    })
    
    setMessages(updatedMessages)
    
    // Update chat history as well
    setChatHistory(prevHistory =>
      prevHistory.map(chat =>
        chat.id === activeChatId
          ? { ...chat, messages: updatedMessages }
          : chat
      )
    )
  }

  const handlePushDriftToMain = (driftMessages: Message[], selectedText: string, sourceMessageId: string, wasSavedAsChat: boolean, userQuestion?: string, driftChatId?: string) => {
    const pushCallId = Math.random().toString(36).substring(7)
    console.log(`[PUSH ${pushCallId}] handlePushDriftToMain called`)
    console.log(`[PUSH ${pushCallId}] sourceMessageId:`, sourceMessageId)
    console.log(`[PUSH ${pushCallId}] Messages to push:`, driftMessages.length)
    console.log(`[PUSH ${pushCallId}] First message preview:`, driftMessages[0]?.text?.substring(0, 50))
    
    // Extract the original source ID (remove any suffix like -push-timestamp or -single-id)
    const originalSourceId = sourceMessageId.split('-push-')[0].split('-single-')[0]
    
    // Create a signature of the content being pushed to check for exact duplicates
    const driftSignature = driftMessages.map(m => `${m.isUser}:${m.text}`).join('|||')
    
    // Check if we're trying to push the EXACT same content that already exists
    // We need to check against the specific sourceMessageId to prevent duplicate pushes
    // but allow multiple different pushes from the same drift
    const duplicateExists = (() => {
      // First check: exact sourceMessageId match (prevents double-clicking the same button)
      const existingPushWithSameId = messages.filter(msg => 
        msg.isDriftPush && 
        msg.driftPushMetadata?.sourceMessageId === sourceMessageId &&
        !msg.text.startsWith('📌 Drift exploration')
      )
      
      if (existingPushWithSameId.length > 0) {
        // We found messages with the exact same sourceMessageId
        // This means the exact same push button was clicked twice
        console.log(`[PUSH ${pushCallId}] Found push with identical sourceMessageId, preventing duplicate`)
        return true
      }
      
      // Second check: Look for pushes from the same original drift that have identical content
      // This prevents pushing the exact same messages multiple times
      // BUT allows pushing expanded conversations (e.g., 1 message, then 3 messages)
      const pushGroups = new Map<string, Message[]>()
      messages.forEach(msg => {
        if (msg.isDriftPush && msg.driftPushMetadata?.sourceMessageId) {
          const groupId = msg.driftPushMetadata.sourceMessageId
          const groupOriginalSource = groupId.split('-push-')[0].split('-single-')[0]
          
          // Only consider groups from the same original drift source
          if (groupOriginalSource === originalSourceId) {
            if (!pushGroups.has(groupId)) {
              pushGroups.set(groupId, [])
            }
            if (!msg.text.startsWith('📌 Drift exploration')) {
              pushGroups.get(groupId)!.push(msg)
            }
          }
        }
      })
      
      // Check each group from the same drift to see if it has the exact same content
      for (const [groupId, groupMessages] of pushGroups) {
        const groupSignature = groupMessages
          .map(m => `${m.isUser}:${m.text}`)
          .join('|||')
        
        if (groupSignature === driftSignature) {
          console.log(`[PUSH ${pushCallId}] Found exact duplicate content from same drift`)
          console.log(`[PUSH ${pushCallId}] Existing group:`, groupId)
          console.log(`[PUSH ${pushCallId}] Current attempt:`, sourceMessageId)
          // Block only if the content is exactly the same
          return true
        }
      }
      
      // Allow the push - it's either new content or expanded content from the same drift
      return false
    })()
    
    if (duplicateExists) {
      console.log(`[PUSH ${pushCallId}] BLOCKED - Duplicate detected, not pushing`)
      return
    }
    
    console.log(`[PUSH ${pushCallId}] No duplicates found, proceeding with push`)
    
    // Each push is a separate instance - we keep all previous pushes
    
    // Generate a drift chat ID if not provided (for when it's saved later)
    const actualDriftChatId = driftChatId || 'drift-pushed-' + Date.now()
    
    // Determine originating model and side (for broadcast alignment)
    const originMsg = messages.find(m => m.id === originalSourceId)
    const originModelTag = originMsg?.modelTag
    let originSide: 'left' | 'right' | undefined = undefined
    if (originMsg?.broadcastGroupId) {
      // Find order of messages within this broadcast group to infer side
      const groupMsgs = messages.filter(m => m.broadcastGroupId === originMsg.broadcastGroupId && !m.canvasId && !!m.modelTag)
      const idx = groupMsgs.findIndex(m => m.id === originMsg.id)
      if (idx >= 0) originSide = idx === 0 ? 'left' : 'right'
    }

    // Add a separator message to indicate where drift was pushed
    const separatorMessage: Message = {
      id: 'drift-push-' + Date.now(),
      text: `📌 Drift exploration of "${selectedText}"`,
      isUser: false,
      timestamp: new Date(),
      isDriftPush: true,
      driftPushMetadata: {
        selectedText: selectedText,
        sourceMessageId: sourceMessageId,
        parentChatId: activeChatId,
        wasSavedAsChat: wasSavedAsChat,
        userQuestion: userQuestion,
        driftChatId: actualDriftChatId,
        originSide,
        originModelTag
      },
      // Preserve model tag for visual context (not rendered for header but harmless)
      modelTag: originModelTag
    }
    
    // Update ONLY the original source message to mark it as having a drift
    // We need to find the actual original message that contains the selected text
    console.log(`[PUSH ${pushCallId}] Looking for message containing "${selectedText}"`)
    console.log(`[PUSH ${pushCallId}] Total messages to search: ${messages.length}`)
    console.log(`[PUSH ${pushCallId}] Original source ID: ${originalSourceId}`)
    
    // First, let's find if we already have drift info anywhere
    const existingDriftMessage = messages.find(msg => 
      msg.driftInfos?.some(d => d.selectedText === selectedText)
    )
    
    if (existingDriftMessage) {
      console.log(`[PUSH ${pushCallId}] Found existing drift info in message: ${existingDriftMessage.id}`)
    }
    
    const messagesWithDriftMarked = messages.map(msg => {
      // First priority: Check if this message already has drift info for this text
      if (msg.driftInfos?.some(d => d.selectedText === selectedText)) {
        console.log(`[PUSH ${pushCallId}] Found message with existing drift info: ${msg.id}`)
        
        const existingDriftIndex = msg.driftInfos.findIndex(d => d.selectedText === selectedText)
        const updatedDriftInfos = [...msg.driftInfos]
        updatedDriftInfos[existingDriftIndex] = {
          selectedText: selectedText,
          driftChatId: actualDriftChatId
        }
        
        console.log(`[PUSH ${pushCallId}] Updating drift info with new ID: ${actualDriftChatId}`)
        return {
          ...msg,
          hasDrift: true,
          driftInfos: updatedDriftInfos
        }
      }
      
      // Second priority: Check if this is the original message by ID match
      if (msg.id === originalSourceId && !msg.isDriftPush) {
        console.log(`[PUSH ${pushCallId}] Found original message by ID: ${msg.id}`)
        return {
          ...msg,
          hasDrift: true,
          driftInfos: [
            ...(msg.driftInfos || []),
            {
              selectedText: selectedText,
              driftChatId: actualDriftChatId
            }
          ]
        }
      }
      
      // Third priority: Check if message contains the text (only for AI messages)
      if (!msg.isDriftPush && !msg.isUser && msg.text && msg.text.includes(selectedText)) {
        console.log(`[PUSH ${pushCallId}] Found message containing text: ${msg.id}`)
        
        // Make sure we don't already have drift info
        if (!msg.driftInfos?.some(d => d.selectedText === selectedText)) {
          console.log(`[PUSH ${pushCallId}] Adding new drift info to message ${msg.id}`)
          return { 
            ...msg, 
            hasDrift: true,
            driftInfos: [
              ...(msg.driftInfos || []),
              {
                selectedText: selectedText,
                driftChatId: actualDriftChatId
              }
            ]
          }
        }
      }
      
      return msg
    })
    
    // Check if we successfully marked any message
    const markedMessage = messagesWithDriftMarked.find(msg => 
      msg.driftInfos?.some(d => d.selectedText === selectedText && d.driftChatId === actualDriftChatId)
    )
    
    if (!markedMessage) {
      console.log(`[PUSH ${pushCallId}] WARNING: Failed to mark any message with drift info!`)
      console.log(`[PUSH ${pushCallId}] Selected text: "${selectedText}"`)
      
      // Log first few messages to debug
      messages.slice(0, 5).forEach((msg, idx) => {
        if (!msg.isUser) {
          console.log(`[PUSH ${pushCallId}] Message ${idx}: ${msg.text?.substring(0, 100)}...`)
        }
      })
    } else {
      console.log(`[PUSH ${pushCallId}] Successfully marked message: ${markedMessage.id}`)
    }
    
    // Add metadata to all drift messages (pushing the complete conversation)
    // IMPORTANT: Give each pushed message a unique ID to avoid React key conflicts
    const driftMessagesWithMetadata = driftMessages.map((msg, idx) => ({
      ...msg,
      // Convert all pushed messages to assistant bubbles in main chat
      // to avoid rendering a pink user bubble for the drift question.
      // Preserve the original role for reconstruction via originalIsUser.
      isUser: false,
      originalIsUser: msg.isUser,
      // Hide user messages in the main feed but keep them for reconstruction
      isHiddenContext: msg.isUser ? true : (msg as any).isHiddenContext,
      id: `${sourceMessageId}-msg-${idx}-${Date.now()}`, // Unique ID for each pushed message
      originalDriftId: msg.id, // Keep reference to original drift message ID
      isDriftPush: true,
      // Carry through the origin model tag so the label appears
      modelTag: originModelTag,
      driftPushMetadata: {
        selectedText: selectedText,
        sourceMessageId: sourceMessageId,
        parentChatId: activeChatId,
        wasSavedAsChat: wasSavedAsChat,
        userQuestion: userQuestion,
        driftChatId: actualDriftChatId,
        originSide,
        originModelTag
      }
    }))
    
    // Debug: Log what we're about to add
    console.log(`[PUSH ${pushCallId}] Adding separator and ${driftMessagesWithMetadata.length} drift messages`)
    console.log(`[PUSH ${pushCallId}] Current total messages before push: ${messagesWithDriftMarked.length}`)
    
    // Then add the pushed drift messages (keeping all existing messages)
    const updatedMessages = [...messagesWithDriftMarked, separatorMessage, ...driftMessagesWithMetadata]
    
    console.log(`[PUSH ${pushCallId}] Total messages after push: ${updatedMessages.length}`)
    
    // Force a complete re-render by creating new message objects
    const forceRefreshMessages = updatedMessages.map(msg => ({ ...msg }))
    
    setMessages(forceRefreshMessages)
    
    // Get the last message text safely
    const lastDriftMessage = driftMessagesWithMetadata[driftMessagesWithMetadata.length - 1]
    const lastMessageText = lastDriftMessage?.text || 'Drift pushed'
    
    // Update chat history with the same forced refresh
    setChatHistory(prevHistory => 
      prevHistory.map(chat => 
        chat.id === activeChatId 
          ? { 
              ...chat, 
              messages: forceRefreshMessages,
              lastMessage: stripMarkdown(lastMessageText)
            }
          : chat
      )
    )
    
    // Log the actual drift info in the updated messages for debugging
    const messageWithDrift = forceRefreshMessages.find(m => 
      m.driftInfos?.some(d => d.selectedText === selectedText)
    )
    if (messageWithDrift) {
      console.log(`[PUSH ${pushCallId}] Final message with drift info:`, messageWithDrift.id)
      console.log(`[PUSH ${pushCallId}] Drift infos:`, messageWithDrift.driftInfos)
    }
    
    // Don't close drift panel - let user decide if they also want to save it as a chat
    // setDriftOpen(false)
  }

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, chatId })
  }

  const handleRenameChat = (chatId: string) => {
    const chat = chatHistory.find(c => c.id === chatId)
    if (chat) {
      setEditingChatId(chatId)
      setEditingTitle(chat.title)
    }
  }

  const handleSaveRename = () => {
    if (editingChatId && editingTitle.trim()) {
      setChatHistory(prev => 
        prev.map(chat => 
          chat.id === editingChatId 
            ? { ...chat, title: editingTitle.trim() }
            : chat
        )
      )
    }
    setEditingChatId(null)
    setEditingTitle('')
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
      setChatHistory(prev => [newChat, ...prev])
    }
  }

  const handleDeleteChat = (chatId: string) => {
    if (confirm('Are you sure you want to delete this chat?')) {
      setChatHistory(prev => prev.filter(chat => chat.id !== chatId))
      if (activeChatId === chatId) {
        setActiveChatId(chatHistory[0]?.id || '1')
        setMessages([])
      }
    }
  }

  const handleTogglePin = (chatId: string) => {
    setPinnedChats(prev => {
      const newPinned = new Set(prev)
      if (newPinned.has(chatId)) {
        newPinned.delete(chatId)
      } else {
        newPinned.add(chatId)
      }
      return newPinned
    })
  }

  const handleToggleStar = (chatId: string) => {
    setStarredChats(prev => {
      const newStarred = new Set(prev)
      if (newStarred.has(chatId)) {
        newStarred.delete(chatId)
      } else {
        newStarred.add(chatId)
      }
      return newStarred
    })
  }

  const handleNavigateToSource = (chatId: string, messageId: string) => {
    // Switch to the parent chat
    switchChat(chatId)
    
    // After a short delay to allow the chat to load, scroll to the message
    setTimeout(() => {
      // Try finding with the exact ID first
      let element = document.querySelector(`[data-message-id="${messageId}"]`)
      
      // If not found, try with msg- prefix
      if (!element) {
        element = document.querySelector(`[data-message-id="msg-${messageId}"]`)
      }
      
      // If still not found, try without msg- prefix if the ID already has it
      if (!element && messageId?.startsWith('msg-')) {
        const idWithoutPrefix = messageId.substring(4)
        element = document.querySelector(`[data-message-id="${idWithoutPrefix}"]`)
      }
      
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Add pulse animation class
        element.classList.add('highlight-message', 'pulse-twice')
        // Remove the pulse class after animation completes (2 pulses = ~2 seconds)
        setTimeout(() => {
          element.classList.remove('pulse-twice')
        }, 2000)
        // Remove highlight after a bit longer
        setTimeout(() => {
          element.classList.remove('highlight-message')
        }, 3000)
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
    
    // Check if already saved
    if (msg.driftPushMetadata.wasSavedAsChat) {
      return
    }
    
    // Find all drift messages that were pushed together
    // They either share the same driftChatId OR the same sourceMessageId
    const driftChatId = msg.driftPushMetadata.driftChatId
    const sourceMessageId = msg.driftPushMetadata.sourceMessageId
    
    const driftMessages = messages.filter(m => {
      if (!m.isDriftPush || m.text.startsWith('📌')) return false
      
      // Match by driftChatId if available, otherwise by sourceMessageId
      if (driftChatId && m.driftPushMetadata?.driftChatId === driftChatId) {
        return true
      }
      return m.driftPushMetadata?.sourceMessageId === sourceMessageId
    })
    
    if (driftMessages.length === 0) return
    
    // Create a new chat ID for the saved drift
    const newChatId = 'drift-' + Date.now().toString()
    const title = `Drift: ${msg.driftPushMetadata.selectedText.slice(0, 30)}${msg.driftPushMetadata.selectedText.length > 30 ? '...' : ''}`
    
    const newChat: ChatSession = {
      id: newChatId,
      title,
      messages: driftMessages.map(m => ({
        ...m,
        isDriftPush: false,  // Remove the drift push marker
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
    
    setChatHistory(prev => [newChat, ...prev])
    
    // Update all pushed messages to mark them as saved
    const updatedMessages = messages.map(m => {
      // Update the source message to include drift info
      if (m.id === sourceMessageId) {
        return { 
          ...m, 
          hasDrift: true,
          driftInfos: [
            ...(m.driftInfos || []),
            {
              selectedText: msg.driftPushMetadata!.selectedText,
              driftChatId: newChatId
            }
          ]
        }
      }
      // Update all drift pushed messages to mark them as saved
      // Match by driftChatId if available, otherwise by sourceMessageId
      if (m.isDriftPush && m.driftPushMetadata) {
        const shouldUpdate = (driftChatId && m.driftPushMetadata.driftChatId === driftChatId) ||
                           m.driftPushMetadata.sourceMessageId === sourceMessageId
        
        if (shouldUpdate) {
          return {
            ...m,
            driftPushMetadata: {
              ...m.driftPushMetadata,
              wasSavedAsChat: true,
              driftChatId: newChatId
            }
          }
        }
      }
      return m
    })
    
    setMessages(updatedMessages)
    
    // Update current chat history
    setChatHistory(prevHistory => 
      prevHistory.map(chat => 
        chat.id === activeChatId 
          ? { ...chat, messages: updatedMessages }
          : chat
      )
    )
  }

  // Sort chats with pinned at top
  const sortedChats = [...filteredChats].sort((a, b) => {
    const aPinned = pinnedChats.has(a.id)
    const bPinned = pinnedChats.has(b.id)
    if (aPinned && !bPinned) return -1
    if (!aPinned && bPinned) return 1
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  const handleLogin = (username: string) => {
    setCurrentUser(username)
    setIsAuthenticated(true)
    // Store in localStorage for persistence (optional)
    localStorage.setItem('driftUser', username)
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setCurrentUser(null)
    localStorage.removeItem('driftUser')
    // Optionally clear chat history on logout
    // setChatHistory([])
    // setMessages([])
  }

  // removed inline DummyModelSelector; now imported as a component

  // Check for existing session on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('driftUser')
    if (savedUser) {
      setCurrentUser(savedUser)
      setIsAuthenticated(true)
    }
  }, [])

  // Close user menu on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!userMenuOpen) return
      const el = userMenuRef.current
      if (el && !el.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [userMenuOpen])

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="h-screen flex bg-dark-bg relative overflow-hidden">
      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-dark-bg via-dark-surface/50 to-dark-bg pointer-events-none" />
      
      {/* Sidebar */}
      <aside className={`
        fixed z-20 w-[260px] h-full bg-dark-surface/95 backdrop-blur-sm
        border-r border-dark-border/30 flex flex-col
        transition-all duration-150 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        shadow-[inset_-8px_0_10px_-8px_rgba(0,0,0,0.4)]
      `}>
        {/* Sidebar Header */}
        <div className="p-3 border-b border-dark-border/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-text-secondary">Chat History</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 hover:bg-dark-elevated rounded-lg transition-colors duration-75"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-text-muted" />
              </button>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
                onClick={() => setSearchQuery('')}
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
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sortedChats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => switchChat(chat.id)}
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
              
              <div className="flex items-start gap-3">
                {chat.metadata?.isDrift ? (
                  <GitBranch className={`
                    w-3.5 h-3.5 mt-0.5 flex-shrink-0
                    ${activeChatId === chat.id ? 'text-accent-violet' : 'text-text-muted'}
                  `} />
                ) : (
                  <MessageCircle className={`
                    w-3.5 h-3.5 mt-0.5 flex-shrink-0
                    ${activeChatId === chat.id ? 'text-accent-pink' : 'text-text-muted'}
                  `} />
                )}
                <div className="flex-1 min-w-0">
                  {editingChatId === chat.id ? (
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={handleSaveRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename()
                        if (e.key === 'Escape') {
                          setEditingChatId(null)
                          setEditingTitle('')
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
                  {/* removed time label for cleaner, neutral sidebar */}
                </div>
              </div>
              {activeChatId === chat.id && (
                <div className="absolute inset-0 rounded-xl bg-white/5 pointer-events-none" />
              )}
            </div>
          ))}
        </div>


        {/* Sidebar Footer: current user with menu */}
        <div className="relative border-t border-dark-border/30 p-2" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(v => !v)}
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
                onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }}
              >
                <User className="w-4 h-4 text-text-muted" />
                View profile
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-dark-elevated/60"
                onClick={() => { setSettingsOpen(true); setUserMenuOpen(false) }}
              >
                <SettingsIcon className="w-4 h-4 text-text-muted" />
                AI settings
              </button>
              <div className="h-px bg-dark-border/60" />
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                onClick={() => { setUserMenuOpen(false); handleLogout() }}
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
        ${sidebarOpen ? 'ml-[260px]' : 'ml-0'}
        ${driftOpen ? 'mr-[450px]' : 'mr-0'}
      `}>
        {/* Header with Drift branding (classic), with settings on the right */}
        <header className="relative z-10 border-b border-dark-border/30 backdrop-blur-sm bg-dark-bg/80">
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {!sidebarOpen ? (
                <>
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 hover:bg-dark-elevated rounded-lg transition-colors duration-75"
                    title="Open sidebar"
                  >
                    <Menu className="w-5 h-5 text-text-muted" />
                  </button>
                  <div className="w-px h-6 bg-dark-border/30" />
                </>
              ) : (
                <div className="w-[41px]" />
              )}

              {/* Action buttons - always visible */}
              <div className="flex items-center gap-2">
                {/* New Chat Button */}
                <button
                  onClick={createNewChat}
                  className="p-2 hover:bg-dark-elevated rounded-lg transition-colors duration-75 group"
                  title="New chat (⌘⌥N)"
                >
                  <Plus className="w-5 h-5 text-text-muted group-hover:text-accent-pink transition-colors duration-75" />
                </button>

                {/* Snippet Gallery Button */}
                <button
                  onClick={() => setGalleryOpen(true)}
                  className="p-2 hover:bg-dark-elevated rounded-lg transition-colors duration-75 group relative"
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

            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-text-secondary tracking-tight">Drift</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 hover:bg-dark-elevated rounded-lg transition-colors duration-75"
                title="AI settings"
              >
                <SettingsIcon className="w-4 h-4 text-text-muted" />
              </button>
              <HeaderControls
                aiSettings={aiSettings}
                selectedTargets={selectedTargets}
                setSelectedTargets={setSelectedTargetsPersist}
                isConnecting={isConnecting}
                apiConnected={apiConnected}
              />
            </div>
          </div>
        </header>
        
        {/* Messages area with depth */}
        <div className="flex-1 overflow-hidden relative">
            <div className="absolute inset-0 bg-dark-surface/90 rounded-t-2xl shadow-inner">
            <div className={`h-full overflow-y-auto pt-4 pb-24 space-y-4 chat-messages-container ${driftOpen && !driftExpanded ? 'pr-[450px] md:pr-[520px]' : ''}`} data-context-links-version={contextLinkVersion}>
              
              {/* Scroll to bottom button - centered and elegant */}
              {showScrollButton && (
                <div className={`fixed bottom-24 z-20 transition-all duration-150
                  ${sidebarOpen ? 'left-[calc(50%+130px)]' : 'left-1/2'} 
                  transform -translate-x-1/2
                  ${driftOpen ? 'mr-[225px]' : ''}
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
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-accent-violet/40 to-accent-pink/40 blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-300 pointer-events-none" />
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
                            // After switching, scroll to the source message
                            setTimeout(() => {
                              const sourceMessageId = currentChat.metadata?.sourceMessageId
                              const selectedText = currentChat.metadata?.selectedText
                              console.log('Back to source - Looking for message with selectedText:', selectedText)
                              
                              // Find the message that contains the selected text
                              let sourceElement = null
                              
                              // First try to find by ID
                              if (sourceMessageId) {
                                sourceElement = document.querySelector(`div[data-message-id="${sourceMessageId}"]`) ||
                                              document.querySelector(`div[data-message-id="msg-${sourceMessageId}"]`)
                              }
                              
                              // If not found by ID, find by text content
                              if (!sourceElement && selectedText) {
                                const allMessages = document.querySelectorAll('div[data-message-id]')
                                for (const msg of allMessages) {
                                  if (msg.textContent && msg.textContent.includes(selectedText)) {
                                    sourceElement = msg
                                    console.log('Found message by text content')
                                    break
                                  }
                                }
                              }
                              
                              if (sourceElement) {
                                console.log('Found source element, applying animation')
                                sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                // Add pulse animation class
                                sourceElement.classList.add('highlight-message', 'pulse-twice')
                                // Remove the pulse class after animation completes (2 pulses = ~2 seconds)
                                setTimeout(() => {
                                  sourceElement.classList.remove('pulse-twice')
                                }, 2000)
                                // Remove highlight after a bit longer
                                setTimeout(() => {
                                  sourceElement.classList.remove('highlight-message')
                                }, 3000)
                              } else {
                                console.log('Source element not found by ID or text!')
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
              
              {messages.map((msg, index) => {
                // Skip canvas messages; they render inside their canvas
                if (msg.canvasId) return null
                // Check if this is a drift message
                const isDriftHeader = msg.isDriftPush && msg.text.startsWith('📌');
                const isDriftMessage = msg.isDriftPush && !msg.text.startsWith('📌');
                
                // Find if this is the first/last drift message in a group
                const prevMsg = index > 0 ? messages[index - 1] : null;
                const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
                const isFirstDriftMessage = isDriftMessage && prevMsg?.isDriftPush && prevMsg?.text.startsWith('📌');
                const isLastDriftMessage = isDriftMessage && (!nextMsg?.isDriftPush || nextMsg?.text.startsWith('📌'));
                
                // Check if this is a single message push (sourceMessageId contains '-single-')
                const isSinglePushMessage = isDriftMessage && 
                  msg.driftPushMetadata?.sourceMessageId?.includes('-single-') &&
                  !msg.isHiddenContext;
                
                // Check if this is part of a multi-message drift (not a single message)
                // For single pushes, only the visible message counts
                const hasMultipleDriftMessages = isDriftMessage && !isSinglePushMessage && (
                  (nextMsg?.isDriftPush && !nextMsg?.text.startsWith('📌') && !nextMsg?.isHiddenContext) || 
                  (prevMsg?.isDriftPush && !prevMsg?.text.startsWith('📌') && !prevMsg?.isHiddenContext)
                );
                
                // Skip rendering drift headers and hidden context messages
                if (isDriftHeader || msg.isHiddenContext) return null;
                
                // Handle broadcast group rendering (horizontal row of model answers)
                if (msg.broadcastGroupId) {
                  // Skip if not the first in a contiguous group
                  if (index > 0 && messages[index - 1]?.broadcastGroupId === msg.broadcastGroupId) {
                    return null
                  }
                  const groupId = msg.broadcastGroupId
                  const groupMessages = [] as Message[]
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

                        {/* Row 2: per-model continuation canvases, start aligned under the tallest reply */}
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
                    {/* Drift group header - only show for first message in multi-message groups */}
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
                    
                    {/* Drift message container - minimal neutral styling */}
                    <div className={`px-6 ${isDriftMessage && hasMultipleDriftMessages ? 'pl-8 border-l border-dark-border/40' : ''}`}>
                    
                    <div
                      className={`flex ${
                        // For drift pushes in broadcast mode, align AI bubbles to the
                        // originating model's side (left/right). Default to standard alignment otherwise.
                        msg.isDriftPush && !msg.isUser && msg.driftPushMetadata?.originSide === 'right'
                          ? 'justify-end'
                          : msg.isUser ? 'justify-end' : 'justify-start'
                      } animate-fade-up relative group
                                  ${isDriftMessage && hasMultipleDriftMessages && !isLastDriftMessage ? 'mb-2' : ''}`}
                      style={{ animationDelay: `${index * 50}ms` }}
                      onMouseEnter={() => !msg.isUser && setHoveredMessageId(msg.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                    >
                      <div
                        className={`
                          ${(isDriftMessage && !msg.isUser) || isSinglePushMessage ? 'max-w-[95%] min-w-[250px]' : 'max-w-[85%]'} rounded-2xl px-5 ${
                            (isDriftMessage && !msg.isUser) || isSinglePushMessage
                              ? 'pt-10 pb-3'
                              : (!msg.isUser && msg.modelTag ? 'pt-7 pb-3' : 'py-3')
                          } relative
                          ${msg.isUser 
                            ? 'bg-gradient-to-br from-accent-pink to-accent-violet text-white shadow-lg shadow-accent-pink/20'
                            : isSinglePushMessage
                              ? 'ai-message bg-dark-bubble border border-dark-border/50 text-text-secondary shadow-lg shadow-black/20 cursor-pointer'
                              : isDriftMessage
                                ? 'bg-dark-bubble/80 border border-dark-border/30 text-text-secondary shadow-lg cursor-pointer hover:border-dark-border/60'
                                : 'ai-message bg-dark-bubble border border-dark-border/50 text-text-secondary shadow-lg shadow-black/20'
                          }
                          transition-all duration-100 hover:scale-[1.02]
                          ${!msg.isUser && !isDriftMessage ? 'select-text' : ''}
                        `}
                        data-message-id={msg.id}
                        onClick={() => {
                          if (isDriftMessage && msg.driftPushMetadata) {
                            // Unified handler for all drift message clicks
                            
                            // If this drift was saved as a chat, open it
                            if (msg.driftPushMetadata.wasSavedAsChat && msg.driftPushMetadata.driftChatId) {
                              const driftChat = chatHistory.find(c => c.id === msg.driftPushMetadata?.driftChatId)
                              if (driftChat) {
                                switchChat(msg.driftPushMetadata.driftChatId)
                              } else {
                                // Drift chat was deleted, navigate to parent and highlight source
                                switchChat(msg.driftPushMetadata.parentChatId)
                                setTimeout(() => {
                                  const sourceElement = document.querySelector(`[data-message-id="${msg.driftPushMetadata?.sourceMessageId}"]`)
                                  if (sourceElement) {
                                    sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                    sourceElement.classList.add('highlight-message')
                                    setTimeout(() => {
                                      sourceElement.classList.remove('highlight-message')
                                    }, 2000)
                                  }
                                }, 150)
                              }
                            } else {
                              // Drift wasn't saved - reconstruct and open drift panel
                              const driftChatId = msg.driftPushMetadata.driftChatId
                              const originalSourceId = msg.driftPushMetadata.sourceMessageId.split('-single-')[0].split('-push-')[0]
                              
                              // Check if we need to switch to parent chat first
                              const needsSwitch = activeChatId !== msg.driftPushMetadata.parentChatId
                              
                              if (needsSwitch) {
                                switchChat(msg.driftPushMetadata.parentChatId)
                              }
                              
                              // Find all messages that were part of this drift conversation
                              const currentMessages = needsSwitch ? 
                                chatHistory.find(c => c.id === msg.driftPushMetadata?.parentChatId)?.messages || [] :
                                messages
                                
                              const allDriftMessages = currentMessages.filter(m => 
                                m.isDriftPush && 
                                m.driftPushMetadata?.driftChatId === driftChatId &&
                                !m.text.startsWith('📌')
                              ).map(m => ({
                                ...m,
                                isHiddenContext: false  // Unhide all messages when reconstructing
                              }))
                              
                              console.log('Found drift messages:', allDriftMessages.map(m => ({
                                text: m.text.substring(0, 50),
                                isUser: m.isUser,
                                hasMeta: !!m.driftPushMetadata
                              })))
                              
                              // Reconstruct the drift conversation from the pushed messages
                              // Sort by the original order (using the index in the ID)
                              const driftConversation = allDriftMessages
                                .sort((a, b) => {
                                  // Extract the index from IDs like "sourceMessageId-msg-0-timestamp"
                                  const aMatch = a.id.match(/-msg-(\d+)-/)
                                  const bMatch = b.id.match(/-msg-(\d+)-/)
                                  if (aMatch && bMatch) {
                                    return parseInt(aMatch[1]) - parseInt(bMatch[1])
                                  }
                                  // Fallback to timestamp comparison
                                  return a.timestamp.getTime() - b.timestamp.getTime()
                                })
                                .map(m => ({
                                  id: m.id,
                                  text: m.text,
                                  // Restore original role if present
                                  isUser: (m as any).originalIsUser ?? m.isUser,
                                  timestamp: m.timestamp
                                }))
                              
                              console.log('Message bubble clicked - reconstructed drift:', {
                                driftChatId,
                                messageCount: driftConversation.length,
                                userMessages: driftConversation.filter(m => m.isUser).length,
                                aiMessages: driftConversation.filter(m => !m.isUser).length,
                                originalSourceId,
                                needsSwitch
                              })
                              
                              // Add system message at the beginning if not present
                              const finalDriftConversation = driftConversation.length > 0 && 
                                !driftConversation[0].text.includes('What would you like to know about') ? 
                                [{
                                  id: 'drift-system-reconstructed',
                                  text: `What would you like to know about "${msg.driftPushMetadata!.selectedText}"?`,
                                  isUser: false,
                                  timestamp: new Date(driftConversation[0].timestamp.getTime() - 1000)
                                }, ...driftConversation] : 
                                driftConversation
                              
                              // Store the reconstructed conversation in temp storage for future use
                              if (driftChatId) {
                                setTempDriftConversations(prev => {
                                  const newMap = new Map(prev)
                                  newMap.set(driftChatId, finalDriftConversation)
                                  console.log('Stored drift conversation in temp storage (from message bubble)')
                                  return newMap
                                })
                              }
                              
                              // Handle chat switching and opening drift panel
                              if (needsSwitch) {
                                // Need to wait for chat switch to complete
                                setTimeout(() => {
                                  handleStartDrift(
                                    msg.driftPushMetadata!.selectedText,
                                    originalSourceId,
                                    driftChatId,
                                    finalDriftConversation  // Pass the reconstructed messages directly
                                  )
                                }, 200)
                              } else {
                                // Can open immediately
                                handleStartDrift(
                                  msg.driftPushMetadata!.selectedText,
                                  originalSourceId,
                                  driftChatId,
                                  finalDriftConversation  // Pass the reconstructed messages directly
                                )
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
                          {/* Regenerate removed per UX */}
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
                          {/* Show "Save as Chat" button for drift pushed messages (only if not already saved) */}
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
                      {/* Strand bead and clearer line ownership */}
                      {msg.strandId && msg.strandId === activeStrandId && (
                        <>
                          {/* Bead for first message in strand sequence */}
                          {(!messages[index - 1] || messages[index - 1]?.strandId !== msg.strandId) && (
                            <div className="absolute -left-2 top-2 w-2 h-2 rounded-full bg-accent-violet/60" />
                          )}
                        </>
                      )}

                      {/* Minimal model tag (skip when inline drift header is shown) */}
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
                      {/* Inline Continue context banner under chosen message */}
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
                                if (prevContinueTargetsRef.current) {
                                  setSelectedTargetsPersist(prevContinueTargetsRef.current)
                                }
                                setContinueFromMessageId(null)
                              }}
                              className="px-2 py-0.5 rounded bg-dark-bubble border border-dark-border/50 text-text-muted hover:text-text-secondary hover:bg-dark-elevated transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Add Drift tag: show on first drift bubble (including single pushes) */}
                      {(isDriftMessage && isFirstDriftMessage) && (
                        <div 
                          className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-accent-violet to-accent-pink text-[9px] font-medium text-white shadow-md opacity-80 group-hover:opacity-100"
                        >
                          Drift
                        </div>
                      )}
                      
                      {/* Inline, compact drift header: model tag + From/Q in one row */}
                      {(isSinglePushMessage || (isDriftMessage && !msg.isUser && isFirstDriftMessage)) && (
                        <div 
                          className="absolute top-2 left-3 right-3 flex items-center gap-2 text-[10px] text-text-muted/80 cursor-pointer hover:text-accent-violet/90 transition-colors duration-150 z-20 pointer-events-auto"
                          style={{ minWidth: '220px' }}
                          onClick={(e) => {
                            // Prevent event bubbling to parent message click
                            e.stopPropagation()
                            
                            // If this drift was saved as a chat, open it
                            if (msg.driftPushMetadata?.wasSavedAsChat && msg.driftPushMetadata?.driftChatId) {
                              switchChat(msg.driftPushMetadata.driftChatId)
                            } else if (msg.driftPushMetadata) {
                              // Reconstruct and open drift panel
                              const driftChatId = msg.driftPushMetadata.driftChatId
                              const originalSourceId = msg.driftPushMetadata.sourceMessageId.split('-single-')[0].split('-push-')[0]
                              
                              // Find all messages that were part of this drift conversation
                              const allDriftMessages = messages.filter(m => 
                                m.isDriftPush && 
                                m.driftPushMetadata?.driftChatId === driftChatId &&
                                !m.text.startsWith('📌')
                              ).map(m => ({
                                ...m,
                                isHiddenContext: false  // Unhide all messages when reconstructing
                              }))
                              
                              console.log('Drift context click - found messages:', allDriftMessages.map(m => ({
                                text: m.text.substring(0, 50),
                                isUser: m.isUser,
                                driftChatId: m.driftPushMetadata?.driftChatId
                              })))
                              
                              // Reconstruct the drift conversation from the pushed messages
                              // Sort by the original order (using the index in the ID)
                              const driftConversation = allDriftMessages
                                .sort((a, b) => {
                                  // Extract the index from IDs like "sourceMessageId-msg-0-timestamp"
                                  const aMatch = a.id.match(/-msg-(\d+)-/)
                                  const bMatch = b.id.match(/-msg-(\d+)-/)
                                  if (aMatch && bMatch) {
                                    return parseInt(aMatch[1]) - parseInt(bMatch[1])
                                  }
                                  // Fallback to timestamp comparison
                                  return a.timestamp.getTime() - b.timestamp.getTime()
                                })
                                .map(m => ({
                                  id: m.id,
                                  text: m.text,
                                  // Restore original role if present
                                  isUser: (m as any).originalIsUser ?? m.isUser,
                                  timestamp: m.timestamp
                                }))
                              
                              console.log('Drift context click - reconstructed:', {
                                driftChatId,
                                messageCount: driftConversation.length,
                                userMessages: driftConversation.filter(m => m.isUser).length,
                                aiMessages: driftConversation.filter(m => !m.isUser).length,
                                originalSourceId
                              })
                              
                              // Add system message at the beginning if not present
                              const finalDriftConversation = driftConversation.length > 0 && 
                                !driftConversation[0].text.includes('What would you like to know about') ? 
                                [{
                                  id: 'drift-system-reconstructed',
                                  text: `What would you like to know about "${msg.driftPushMetadata!.selectedText}"?`,
                                  isUser: false,
                                  timestamp: new Date(driftConversation[0].timestamp.getTime() - 1000)
                                }, ...driftConversation] : 
                                driftConversation
                              
                              // Store the reconstructed conversation in temp storage for future use
                              if (driftChatId) {
                                setTempDriftConversations(prev => {
                                  const newMap = new Map(prev)
                                  newMap.set(driftChatId, finalDriftConversation)
                                  console.log('Stored drift conversation in temp storage')
                                  return newMap
                                })
                              }
                              
                              // Open drift panel immediately with the reconstructed messages
                              handleStartDrift(
                                msg.driftPushMetadata!.selectedText, 
                                originalSourceId, 
                                driftChatId,
                                finalDriftConversation  // Pass the reconstructed messages directly
                              )
                            }
                          }}
                          title={msg.driftPushMetadata?.wasSavedAsChat ? "Click to open drift conversation" : "Click to view full drift"}
                        >
                          {/* Inline model tag chip */}
                          {msg.modelTag && (
                            <span className="px-1.5 py-0.5 rounded bg-dark-elevated/70 border border-dark-border/50 text-[9px] text-text-muted whitespace-nowrap">
                              {msg.modelTag}
                            </span>
                          )}
                          {/* Compact meta: About and Q on one line */}
                          <span className="truncate">
                            <span className="text-text-secondary/80">About:</span> "{msg.driftPushMetadata?.selectedText}"
                            {msg.driftPushMetadata?.userQuestion && (
                              <>
                                {' '}• <span className="text-text-secondary/80">Q:</span> "{msg.driftPushMetadata.userQuestion}"
                              </>
                            )}
                          </span>
                        </div>
                      )}
                      
                      
                      {msg.isUser ? (
                        <p 
                          className={`text-[13px] leading-6 ${getRTLClassName(msg.text)}`}
                          dir={getTextDirection(msg.text)}
                        >
                          {msg.text}
                        </p>
                      ) : msg.driftInfos && msg.driftInfos.length > 0 ? (
                        // Render AI message with clickable drift links
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
                              return {
                              // Helper function to process text and add drift links
                              ...((()=> {
                                const processDriftText = (children: any) => {
                                  const text = String(children)
                                  let result: React.ReactNode[] = []
                                  let lastIndex = 0
                                  
                                  // Sort drifts by their position in the text to handle them in order
                                  const sortedDrifts = [...msg.driftInfos!].sort((a, b) => {
                                    const aIndex = text.indexOf(a.selectedText)
                                    const bIndex = text.indexOf(b.selectedText)
                                    return aIndex - bIndex
                                  })
                                  
                                  // Process each drift
                                  sortedDrifts.forEach((drift, idx) => {
                                    const driftIndex = text.indexOf(drift.selectedText, lastIndex)
                                    if (driftIndex !== -1) {
                                      // Add text before the drift
                                      if (driftIndex > lastIndex) {
                                        result.push(text.substring(lastIndex, driftIndex))
                                      }
                                      
                                      // Add the drift button
                                      result.push(
                                        <button
                                          key={`drift-${idx}-${drift.driftChatId}`}
                                          onClick={() => {
                                            // If it's a temporary drift, reopen the drift panel
                                            if (drift.driftChatId.startsWith('drift-temp-')) {
                                              // Pass existing messages from temp storage if available
                                              const existingDriftMessages = tempDriftConversations.get(drift.driftChatId)
                                              handleStartDrift(drift.selectedText, msg.id, drift.driftChatId, existingDriftMessages)
                                            } else {
                                              // Otherwise switch to the saved drift chat
                                              switchChat(drift.driftChatId)
                                            }
                                          }}
                                          className="inline px-1.5 py-0.5 rounded
                                                   bg-gradient-to-r from-accent-violet/20 to-accent-pink/20
                                                   border border-accent-violet/30 hover:border-accent-violet/50
                                                   text-accent-violet hover:text-accent-pink
                                                   transition-all duration-100"
                                          title={drift.driftChatId.startsWith('drift-temp-') 
                                            ? "Open drift panel" 
                                            : "View drift conversation"}
                                        >
                                          {drift.selectedText}
                                        </button>
                                      )
                                      
                                      lastIndex = driftIndex + drift.selectedText.length
                                    }
                                  })
                                  
                                  // Add any remaining text
                                  if (lastIndex < text.length) {
                                    result.push(text.substring(lastIndex))
                                  }
                                  
                                  // If no drifts were found, return original
                                  if (result.length === 0) {
                                    return children
                                  }
                                  
                                  return result
                                }
                                
                                return {
                                  p: ({children}) => {
                                    const processed = processDriftText(children)
                                    return <p className="mb-2">{processed}</p>
                                  },
                                  td: ({children}) => {
                                    const processed = processDriftText(children)
                                    return <td>{processed}</td>
                                  },
                                  th: ({children}) => {
                                    const processed = processDriftText(children)
                                    return <th>{processed}</th>
                                  },
                                  li: ({children}) => {
                                    const processed = processDriftText(children)
                                    const anchorId = getAnchorId(msg.id, liCounter++)
                                    return <li><span id={anchorId}>{processed}</span></li>
                                  }
                                }
                              })())
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
                              p: ({children}: any) => <p className="mb-2">{processEntityText(children, msg.id)}</p>,
                              li: ({children}: any) => {
                                const anchorId = getAnchorId(msg.id, liCounter++)
                                return <li><span id={anchorId}>{processEntityText(children, msg.id)}</span></li>
                              },
                              th: ({children}: any) => <th>{processEntityText(children, msg.id)}</th>,
                              td: ({children}: any) => <td>{processEntityText(children, msg.id)}</td>,
                              br: () => <br />,
                              table: ({children}: any) => (
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

        {/* Composer context bar when continuing with a model */}
        {false && (() => {
          const refMsg = messages.find(m => m.id === continueFromMessageId)
          if (!refMsg) return null
          const rm = refMsg!
          const model = rm.modelTag || 'Model'
          const excerpt = rm.text ? stripMarkdown(rm.text).slice(0, 80) : ''
          const chipsGroupId = activeBroadcastGroupId || rm.broadcastGroupId || null
          const chipModels = chipsGroupId
            ? Array.from(new Map(
                messages
                  .filter(m => m.broadcastGroupId === chipsGroupId && !!m.modelTag)
                  .map(m => [m.modelTag as string, { id: m.id, modelTag: m.modelTag as string }])
              ).values())
            : []
          return (
            <div className="absolute bottom-16 left-0 right-0 z-10 px-4">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-dark-elevated/70 border border-accent-violet/30 text-[12px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-dark-bubble border border-dark-border/50 text-accent-violet text-[11px]">
                      Continuing with {model}
                    </span>
                    {chipModels.length > 1 && (
                      <div className="flex items-center gap-1">
                        {chipModels.map((cm: any) => (
                          <button
                            key={`chip-${cm.id}`}
                            onClick={() => continueWithModel(cm.modelTag, cm.id)}
                            className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                              cm.id === continueFromMessageId
                                ? 'bg-accent-violet/20 border-accent-violet/50 text-accent-violet'
                                : 'bg-dark-bubble border-dark-border/50 text-text-muted hover:text-text-secondary hover:bg-dark-elevated'
                            }`}
                            title={`Switch to ${cm.modelTag}`}
                          >
                            {cm.modelTag}
                          </button>
                        ))}
                      </div>
                    )}
                    {excerpt && (
                      <span className="text-text-muted hidden sm:inline">{excerpt}{((refMsg?.text?.length || 0) > 80 ? '…' : '')}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {chipsGroupId && (
                      <button
                        onClick={() => {
                          const el = document.querySelector(`[data-broadcast-group="${chipsGroupId}"]`)
                          if (el) {
                            ;(el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
                            el.classList.add('highlight-message')
                            setTimeout(() => el.classList.remove('highlight-message'), 1200)
                          }
                        }}
                        className="px-2 py-0.5 rounded bg-dark-bubble border border-dark-border/50 text-text-muted hover:text-text-secondary hover:bg-dark-elevated transition-colors"
                      >
                        Compare again
                      </button>
                    )}
                    <button
                      onClick={() => {
                      if (prevContinueTargetsRef.current) setSelectedTargetsPersist(prevContinueTargetsRef.current)
                      setContinueFromMessageId(null)
                      setActiveStrandId(null)
                    }}
                      className="px-2 py-0.5 rounded bg-dark-bubble border border-dark-border/50 text-text-muted hover:text-text-secondary hover:bg-dark-elevated transition-colors"
                      title="Cancel continuing"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Modern input area */}
        <div className={`absolute bottom-0 left-0 right-0 z-10 pb-2 px-4 pt-4 ${driftOpen && !driftExpanded ? 'mr-[450px] md:mr-[520px]' : ''}`}>
          <div className="max-w-4xl mx-auto">
            <div className="relative flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
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
                      ${message.split('\n').length > 1 || message.length > 50 ? 'bottom-2' : 'top-1/2 -translate-y-1/2'}
                      w-8 h-8 rounded-full
                      bg-gradient-to-br from-accent-pink to-accent-violet
                      text-white shadow-lg shadow-accent-pink/30
                      flex items-center justify-center
                      hover:scale-105 active:scale-95
                      transition-all duration-100
                    `}
                    title="Stop generating"
                  >
                    <Square className="w-3.5 h-3.5" fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={sendMessage}
                    disabled={!message.trim()}
                    className={`
                      absolute right-2
                      ${message.split('\n').length > 1 || message.length > 50 ? 'bottom-2' : 'top-1/2 -translate-y-1/2'}
                      w-8 h-8 rounded-full
                      bg-gradient-to-br from-accent-pink to-accent-violet
                      text-white shadow-lg shadow-accent-pink/30
                      flex items-center justify-center
                      hover:scale-105 active:scale-95
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-all duration-100
                    `}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Sticky model chips removed: model tag on bubbles is clickable */}

      {/* Selection Tooltip */}
      <SelectionTooltip 
        onStartDrift={handleStartDrift}
        currentChatId={activeChatId}
        currentChatTitle={chatHistory.find(c => c.id === activeChatId)?.title || 'Chat'}
        onSnippetSaved={() => setSnippetCount(snippetStorage.getAllSnippets().length)}
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
        onSnippetCountUpdate={() => setSnippetCount(snippetStorage.getAllSnippets().length)}
        aiSettings={aiSettings}
        existingMessages={driftContext?.existingMessages}
        driftChatId={driftContext?.driftChatId}
        selectedProvider={(() => {
          const targets = (selectedTargets && selectedTargets.length) ? selectedTargets : [DEFAULT_TARGET]
          if (targets.length === 1) return targets[0].provider as 'dummy' | 'openrouter' | 'ollama'
          if (targets.some(t => t.provider === 'openrouter')) return 'openrouter'
          if (targets.some(t => t.provider === 'ollama')) return 'ollama'
          return 'dummy'
        })()}
        onExpandedChange={(expanded) => setDriftExpanded(expanded)}
      />
      
      {/* Settings Modal */}
      <Settings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        currentSettings={aiSettings}
      />

      {/* Snippet Gallery */}
      <SnippetGallery
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onNavigateToSource={(chatId, messageId) => {
          setGalleryOpen(false)
          switchChat(chatId)
          setTimeout(() => {
            const element = document.querySelector(`[data-message-id="${messageId}"]`)
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' })
              element.classList.add('highlight-message')
              setTimeout(() => {
                element.classList.remove('highlight-message')
              }, 2000)
            }
          }, 150)
        }}
      />

      
      {/* Profile Modal */}
          {profileOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-[#333333] rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-[#333333]">
              <h2 className="text-lg font-semibold text-white">Profile</h2>
              <button
                onClick={() => setProfileOpen(false)}
                className="p-2 hover:bg-[#222222] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#9ca3af]" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent-violet/30 flex items-center justify-center text-sm text-accent-violet font-medium">
                  {(currentUser?.[0]?.toUpperCase() || 'U')}
                </div>
                <div>
                  <div className="text-white font-medium">{currentUser || 'User'}</div>
                  <div className="text-xs text-[#9ca3af]">Local account</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333333] text-sm text-white hover:border-[#444444]"
                  onClick={() => { navigator.clipboard?.writeText(currentUser || ''); }}
                >
                  Copy username
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300 hover:bg-red-500/20"
                  onClick={() => { setProfileOpen(false); handleLogout(); }}
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
              {
                label: 'Rename',
                icon: <Edit3 className="w-4 h-4" />,
                action: () => handleRenameChat(contextMenu.chatId)
              },
              {
                label: 'Duplicate',
                icon: <Copy className="w-4 h-4" />,
                action: () => handleDuplicateChat(contextMenu.chatId)
              },
              {
                label: isPinned ? 'Unpin' : 'Pin',
                icon: isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />,
                action: () => handleTogglePin(contextMenu.chatId)
              },
              {
                label: isStarred ? 'Unstar' : 'Star',
                icon: isStarred ? <StarOff className="w-4 h-4" /> : <Star className="w-4 h-4" />,
                action: () => handleToggleStar(contextMenu.chatId)
              }
            ]
            
            // Add "Go to Source" for drift chats
            if (isDrift) {
              items.push({
                label: 'Go to Source',
                icon: <ExternalLink className="w-4 h-4" />,
                action: () => handleGoToSource(contextMenu.chatId)
              })
            }
            
            // Add delete at the end
            items.push({
              label: 'Delete',
              icon: <Trash2 className="w-4 h-4" />,
              action: () => handleDeleteChat(contextMenu.chatId)
            })
            
            return items
          })()}
          onClose={() => setContextMenu(null)}
        />
      )}

      
    </div>
  )
}

export default App
