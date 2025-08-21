import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Menu, Plus, Search, MessageCircle, ChevronLeft, Square, ArrowDown, Bookmark, Edit3, Copy, Trash2, Pin, PinOff, Star, StarOff, ExternalLink, Check, ChevronDown, Settings as SettingsIcon, Save, X } from 'lucide-react'
import { sendMessageToOpenRouter, checkOpenRouterConnection, OPENROUTER_MODELS, type ChatMessage as OpenRouterMessage, type OpenRouterModel } from './services/openrouter'
import { sendMessageToOllama, checkOllamaConnection, type ChatMessage as OllamaMessage } from './services/ollama'
import DriftPanel from './components/DriftPanel'
import SelectionTooltip from './components/SelectionTooltip'
import SnippetGallery from './components/SnippetGallery'
import ContextMenu from './components/ContextMenu'
import Settings, { type AISettings } from './components/Settings'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { snippetStorage } from './services/snippetStorage'
import { settingsStorage } from './services/settingsStorage'

interface Message {
  id: string
  text: string
  isUser: boolean
  timestamp: Date
  hasDrift?: boolean
  driftInfo?: {
    selectedText: string
    driftChatId: string
  }
  isDriftPush?: boolean  // Marks messages that were pushed from drift
  driftPushMetadata?: {   // Metadata for pushed drift messages
    selectedText: string
    sourceMessageId: string
    parentChatId: string
    wasSavedAsChat?: boolean
    userQuestion?: string
    driftChatId?: string
  }
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
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeChatId, setActiveChatId] = useState('1')
  const [apiConnected, setApiConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [useOpenRouter, setUseOpenRouter] = useState(true) // Toggle between OpenRouter and Ollama
  const [selectedModel, setSelectedModel] = useState<OpenRouterModel>(OPENROUTER_MODELS.OSS)
  const [streamingResponse, setStreamingResponse] = useState('')
  const [showScrollButton, setShowScrollButton] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mainScrollPosition = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const userHasScrolled = useRef(false)
  
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
  
  // Drift state
  const [driftOpen, setDriftOpen] = useState(false)
  const [driftContext, setDriftContext] = useState<{
    selectedText: string
    sourceMessageId: string
    contextMessages: Message[]
    highlightMessageId?: string
  }>({
    selectedText: '',
    sourceMessageId: '',
    contextMessages: []
  })
  
  // Gallery state
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [snippetCount, setSnippetCount] = useState(0)
  
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
        if (aiSettings.useOpenRouter) {
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
      const newMessage: Message = {
        id: Date.now().toString(),
        text: message,
        isUser: true,
        timestamp: new Date()
      }
      
      const updatedMessages = [...messages, newMessage]
      setMessages(updatedMessages)
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
        
        // Create AI response message placeholder
        const aiResponseId = (Date.now() + 1).toString()
        let accumulatedResponse = ''
        
        // Add empty AI message immediately
        const aiMessage: Message = {
          id: aiResponseId,
          text: '',
          isUser: false,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, aiMessage])
        
        // Stream the response using the selected API
        if (aiSettings.useOpenRouter) {
          // ALWAYS use env variable if available, fallback to settings
          const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || aiSettings.openRouterApiKey
          
          if (!apiKey) {
            throw new Error('No OpenRouter API key found. Please set VITE_OPENROUTER_API_KEY in .env file')
          }
          
          await sendMessageToOpenRouter(
            apiMessages as any,
            (chunk) => {
              accumulatedResponse += chunk
              setStreamingResponse(accumulatedResponse)
              
              // Update the AI message with streamed content
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === aiResponseId 
                    ? { ...msg, text: accumulatedResponse }
                    : msg
                )
              )
            },
            apiKey,
            abortController.signal,
            aiSettings.openRouterModel
          )
        } else {
          await sendMessageToOllama(
            apiMessages as any,
            (chunk) => {
              accumulatedResponse += chunk
              setStreamingResponse(accumulatedResponse)
              
              // Update the AI message with streamed content
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === aiResponseId 
                    ? { ...msg, text: accumulatedResponse }
                    : msg
                )
              )
            },
            abortController.signal,
            aiSettings.ollamaUrl,
            aiSettings.ollamaModel
          )
        }
        
        // Final update to chat history
        setChatHistory(prevHistory => 
          prevHistory.map(chat => 
            chat.id === activeChatId 
              ? { 
                  ...chat, 
                  messages: messages.map(msg => 
                    msg.id === aiResponseId 
                      ? { ...msg, text: accumulatedResponse }
                      : msg
                  ),
                  lastMessage: stripMarkdown(accumulatedResponse).slice(0, 100) 
                }
              : chat
          )
        )
        
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
    if (newSettings.useOpenRouter) {
      setSelectedModel(newSettings.openRouterModel)
    }
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
  const handleStartDrift = (selectedText: string, messageId: string) => {
    console.log('handleStartDrift called with:', { selectedText, messageId })
    
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
      const updatedMessages = currentMessages.map(msg => 
        msg.id === actualMessage.id 
          ? { 
              ...msg, 
              hasDrift: true, 
              driftInfo: { 
                selectedText, 
                driftChatId: `drift-temp-${Date.now()}` // Temporary ID for current drift
              } 
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
    
    setDriftContext({
      selectedText,
      sourceMessageId: finalSourceMessageId,
      contextMessages,
      highlightMessageId: actualMessage?.id
    })
    setDriftOpen(true)
    console.log('Drift panel opened with', contextMessages.length, 'context messages')
  }

  const handleCloseDrift = () => {
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
          (msg.driftInfo && msg.driftInfo.selectedText === metadata.selectedText && 
           msg.driftInfo.driftChatId.startsWith('drift-temp-'))) {
        return { 
          ...msg, 
          hasDrift: true,
          driftInfo: {
            selectedText: metadata.selectedText,
            driftChatId: newChatId
          }
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
                (msg.driftInfo && msg.driftInfo.selectedText === metadata.selectedText && 
                 msg.driftInfo.driftChatId.startsWith('drift-temp-'))) {
              return { 
                ...msg, 
                hasDrift: true,
                driftInfo: {
                  selectedText: metadata.selectedText,
                  driftChatId: newChatId
                }
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
    setChatHistory(prevHistory => prevHistory.filter(chat => 
      !(chat.metadata?.id === chatId || chat.id === chatId)
    ))
    
    // Also remove the drift info from the source message
    const updatedMessages = messages.map(msg => {
      if (msg.hasDrift && msg.driftInfo?.driftChatId === chatId) {
        const { driftInfo, hasDrift, ...restMsg } = msg
        return restMsg
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
    // Check if these exact messages are already pushed (prevent duplicates)
    const duplicateExists = driftMessages.every(driftMsg => 
      messages.some(mainMsg => 
        mainMsg.isDriftPush && 
        mainMsg.text === driftMsg.text &&
        mainMsg.isUser === driftMsg.isUser
      )
    )
    
    if (duplicateExists) {
      return
    }
    
    // When pushing from a drift that has grown, we push the ENTIRE conversation
    // as a new group, without removing previous pushes
    
    // Generate a drift chat ID if not provided (for when it's saved later)
    const actualDriftChatId = driftChatId || 'drift-pushed-' + Date.now()
    
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
        driftChatId: actualDriftChatId
      }
    }
    
    // Update the original message to mark it as having a drift
    const messagesWithDriftMarked = messages.map(msg => 
      msg.id === sourceMessageId 
        ? { 
            ...msg, 
            hasDrift: true,
            driftInfo: {
              selectedText: selectedText,
              driftChatId: actualDriftChatId
            }
          }
        : msg
    )
    
    // Add metadata to all drift messages (pushing the complete conversation)
    const driftMessagesWithMetadata = driftMessages.map(msg => ({
      ...msg,
      isDriftPush: true,
      driftPushMetadata: {
        selectedText: selectedText,
        sourceMessageId: sourceMessageId,
        parentChatId: activeChatId,
        wasSavedAsChat: wasSavedAsChat,
        userQuestion: userQuestion,
        driftChatId: actualDriftChatId
      }
    }))
    
    // Then add the pushed drift messages
    const updatedMessages = [...messagesWithDriftMarked, separatorMessage, ...driftMessagesWithMetadata]
    setMessages(updatedMessages)
    
    // Get the last message text safely
    const lastDriftMessage = driftMessagesWithMetadata[driftMessagesWithMetadata.length - 1]
    const lastMessageText = lastDriftMessage?.text || 'Drift pushed'
    
    // Update chat history
    setChatHistory(prevHistory => 
      prevHistory.map(chat => 
        chat.id === activeChatId 
          ? { 
              ...chat, 
              messages: updatedMessages,
              lastMessage: stripMarkdown(lastMessageText)
            }
          : chat
      )
    )
    
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
          driftInfo: {
            selectedText: msg.driftPushMetadata!.selectedText,
            driftChatId: newChatId
          }
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
              <Sparkles className="w-4 h-4 text-accent-pink" />
              <h2 className="text-base font-semibold text-text-primary">Chat History</h2>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 hover:bg-dark-elevated rounded-lg transition-colors duration-75"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-text-muted" />
            </button>
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
                rounded-full pl-8 pr-8 py-1.5 text-sm
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
                  ? 'bg-dark-elevated border-l-2 border-accent-pink shadow-lg' 
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
                  <span className="text-xs mt-0.5 flex-shrink-0">🌀</span>
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
                    <h3 className="text-sm font-medium text-text-primary truncate">
                      {chat.title}
                    </h3>
                  )}
                  <p className="text-xs text-text-muted truncate mt-0.5">
                    {chat.lastMessage ? stripMarkdown(chat.lastMessage) : ''}
                  </p>
                  <p className="text-[11px] text-accent-violet/60 mt-0.5">
                    {formatDate(chat.createdAt)}
                  </p>
                </div>
              </div>
              {activeChatId === chat.id && (
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-accent-pink/10 to-accent-violet/10 pointer-events-none" />
              )}
            </div>
          ))}
        </div>

      </aside>

      {/* Main Chat Area */}
      <div className={`
        flex-1 flex flex-col relative
        transition-all duration-150 ease-in-out
        ${sidebarOpen ? 'ml-[260px]' : 'ml-0'}
        ${driftOpen ? 'mr-[450px]' : 'mr-0'}
      `}>
        {/* Header with Drift branding */}
        <header className="relative z-10 border-b border-dark-border/30 backdrop-blur-sm bg-dark-bg/80">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
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
                
                {/* Settings Button */}
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="p-2 hover:bg-dark-elevated rounded-lg transition-colors duration-75 group"
                  title="AI Settings"
                >
                  <SettingsIcon className="w-5 h-5 text-text-muted group-hover:text-accent-violet transition-colors duration-75" />
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
              <div className="flex items-center gap-2 animate-fade-up">
                <div className="relative">
                  <Sparkles className="w-6 h-6 text-accent-pink" />
                  <div className="absolute inset-0 blur-lg bg-accent-pink/50 animate-pulse" />
                </div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-accent-pink to-accent-violet bg-clip-text text-transparent">
                  Drift
                </h1>
              </div>
            </div>
            
            {/* Model Selector and Connection Status */}
            <div className="flex items-center gap-2">
              {/* Unified Model Selector with custom styling */}
              <div className="relative">
                <select
                  value={useOpenRouter ? selectedModel : 'ollama'}
                  onChange={(e) => {
                    const value = e.target.value
                    setIsConnecting(true)  // Show connecting state immediately
                    if (value === 'ollama') {
                      setUseOpenRouter(false)
                    } else {
                      setUseOpenRouter(true)
                      setSelectedModel(value as OpenRouterModel)
                    }
                  }}
                  className="appearance-none pl-4 pr-8 py-1.5 rounded-full bg-dark-elevated/70 border border-dark-border/40 hover:bg-dark-elevated hover:border-accent-violet/30 transition-all duration-100 text-xs font-medium text-text-primary cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-violet/40 focus:border-transparent backdrop-blur-sm"
                  title="Select AI model"
                >
                  <optgroup label="OpenRouter (Free)">
                    <option value={OPENROUTER_MODELS.OSS}>OSS-20B</option>
                  </optgroup>
                  <optgroup label="Local">
                    <option value="ollama">Ollama</option>
                  </optgroup>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
              </div>
              
              {/* Connection Status Badge */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-sm transition-all duration-150 ${
                isConnecting
                  ? 'bg-amber-500/10 border border-amber-500/30'
                  : apiConnected 
                    ? 'bg-emerald-500/10 border border-emerald-500/30' 
                    : 'bg-red-500/10 border border-red-500/30'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  isConnecting
                    ? 'bg-amber-500 animate-pulse'
                    : apiConnected 
                      ? 'bg-emerald-500' 
                      : 'bg-red-500'
                }`} />
                <span className={`text-xs font-medium ${
                  isConnecting
                    ? 'text-amber-400'
                    : apiConnected 
                      ? 'text-emerald-400' 
                      : 'text-red-400'
                }`}>
                  {isConnecting ? 'Connecting...' : apiConnected ? 'Connected' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </header>
        
        {/* Messages area with depth */}
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0 bg-dark-surface rounded-t-2xl shadow-inner">
            <div className="h-full overflow-y-auto py-6 space-y-4 chat-messages-container">
              
              {/* Scroll to bottom button */}
              {showScrollButton && (
                <button
                  onClick={() => {
                    userHasScrolled.current = false
                    scrollToBottom()
                  }}
                  className="
                    fixed bottom-24 right-8 z-20
                    w-10 h-10 rounded-full
                    bg-dark-elevated border border-dark-border/50
                    text-text-muted shadow-lg
                    flex items-center justify-center
                    hover:bg-dark-bubble hover:text-text-primary
                    transition-all duration-100 hover:scale-105
                    animate-fade-up
                  "
                  title="Scroll to bottom"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              )}
              
              {/* Show parent chat link if this is a saved drift */}
              {(() => {
                const currentChat = chatHistory.find(c => c.id === activeChatId)
                if (!currentChat?.metadata?.isDrift) return null
                
                const parentChat = chatHistory.find(c => c.id === currentChat.metadata?.parentChatId)
                const parentTitle = parentChat?.title || 'Previous conversation'
                
                return (
                  <div className="mb-4 p-3 bg-gradient-to-r from-accent-violet/10 to-accent-pink/10 rounded-lg border border-accent-violet/30 max-w-5xl mx-auto">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">🌀</span>
                          <span className="text-sm text-text-primary font-medium">
                            Drift exploration of "{currentChat.metadata?.selectedText}"
                          </span>
                        </div>
                        <span className="text-xs text-text-muted ml-6">
                          from conversation: <span className="text-accent-violet">{parentTitle}</span>
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
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-dark-elevated/50 hover:bg-dark-elevated 
                                 border border-accent-violet/30 hover:border-accent-violet/50 rounded-full
                                 text-accent-violet transition-all duration-100 ml-4"
                      >
                        <ChevronLeft className="w-3 h-3" />
                        Back to source
                      </button>
                    </div>
                  </div>
                )
              })()}
              
              {messages.map((msg, index) => {
                // Check if this is a drift message
                const isDriftHeader = msg.isDriftPush && msg.text.startsWith('📌');
                const isDriftMessage = msg.isDriftPush && !msg.text.startsWith('📌');
                
                // Find if this is the first/last drift message in a group
                const prevMsg = index > 0 ? messages[index - 1] : null;
                const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
                const isFirstDriftMessage = isDriftMessage && prevMsg?.isDriftPush && prevMsg?.text.startsWith('📌');
                const isLastDriftMessage = isDriftMessage && (!nextMsg?.isDriftPush || nextMsg?.text.startsWith('📌'));
                const isMiddleDriftMessage = isDriftMessage && !isFirstDriftMessage && !isLastDriftMessage;
                
                // Check if this is part of a multi-message drift (not a single message)
                const hasMultipleDriftMessages = isDriftMessage && (
                  (nextMsg?.isDriftPush && !nextMsg?.text.startsWith('📌')) || 
                  (prevMsg?.isDriftPush && !prevMsg?.text.startsWith('📌'))
                );
                
                // Skip rendering drift headers entirely
                if (isDriftHeader) return null;
                
                return msg.text ? (
                  <div 
                    className={`max-w-5xl mx-auto`}
                    key={msg.id}
                  >
                    {/* Drift group header - only show for first message in multi-message groups */}
                    {isFirstDriftMessage && hasMultipleDriftMessages && (
                      <div className="px-6 mb-2">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium text-accent-violet">
                            Drift conversation
                          </span>
                          {msg.driftPushMetadata?.selectedText && (
                            <span className="text-xs text-text-muted italic">
                              • "{msg.driftPushMetadata.selectedText}"
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Drift message container with connected background only for multi-message groups */}
                    <div className={`
                      px-6
                      ${isDriftMessage && hasMultipleDriftMessages && isFirstDriftMessage ? 'bg-gradient-to-r from-accent-violet/5 to-accent-pink/5 rounded-t-xl border-t border-x border-accent-violet/20 pt-3' : ''}
                      ${isDriftMessage && hasMultipleDriftMessages && isMiddleDriftMessage ? 'bg-gradient-to-r from-accent-violet/5 to-accent-pink/5 border-x border-accent-violet/20' : ''}
                      ${isDriftMessage && hasMultipleDriftMessages && isLastDriftMessage && !isFirstDriftMessage ? 'bg-gradient-to-r from-accent-violet/5 to-accent-pink/5 rounded-b-xl border-b border-x border-accent-violet/20 pb-3' : ''}
                      ${isDriftMessage && hasMultipleDriftMessages && isFirstDriftMessage && isLastDriftMessage ? 'bg-gradient-to-r from-accent-violet/5 to-accent-pink/5 rounded-xl border border-accent-violet/20 py-3' : ''}
                      ${isDriftMessage && hasMultipleDriftMessages ? 'border-l-4 border-l-accent-violet/50' : ''}
                    `}>
                    
                    <div
                      className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'} animate-fade-up relative group
                                  ${isDriftMessage && hasMultipleDriftMessages && !isLastDriftMessage ? 'mb-2' : ''}`}
                      style={{ animationDelay: `${index * 50}ms` }}
                      onMouseEnter={() => !msg.isUser && setHoveredMessageId(msg.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                    >
                      <div
                        className={`
                          max-w-[85%] rounded-2xl px-5 ${isFirstDriftMessage && !msg.isUser ? 'pt-12 pb-3' : 'py-3'} relative
                          ${msg.isUser 
                            ? isDriftMessage
                              ? 'bg-gradient-to-br from-accent-violet/30 to-accent-pink/30 text-text-primary border border-accent-violet/30 shadow-lg'
                              : 'bg-gradient-to-br from-accent-pink to-accent-violet text-white shadow-lg shadow-accent-pink/20'
                            : isDriftMessage
                              ? 'bg-dark-bubble/80 border border-dark-border/30 text-text-secondary shadow-lg cursor-pointer hover:border-accent-violet/50'
                              : 'ai-message bg-dark-bubble border border-dark-border/50 text-text-secondary shadow-lg shadow-black/20'
                          }
                          transition-all duration-100 hover:scale-[1.02]
                          ${!msg.isUser ? 'select-text' : ''}
                        `}
                        data-message-id={msg.id}
                        onClick={() => {
                          if (isDriftMessage && msg.driftPushMetadata) {
                            // For single pushed messages, open the drift panel directly
                            const isSingleMessage = msg.driftPushMetadata.sourceMessageId.includes('-single-')
                            
                            if (isSingleMessage) {
                              // Navigate to parent chat and open drift panel
                              if (activeChatId !== msg.driftPushMetadata.parentChatId) {
                                switchChat(msg.driftPushMetadata.parentChatId)
                              }
                              
                              // Find the original source message and open drift from it
                              setTimeout(() => {
                                const originalSourceId = msg.driftPushMetadata!.sourceMessageId.split('-single-')[0]
                                const sourceMessage = messages.find(m => m.id === originalSourceId)
                                
                                if (sourceMessage) {
                                  // Open drift panel with the original context
                                  handleStartDrift(
                                    msg.driftPushMetadata!.selectedText,
                                    originalSourceId,
                                    msg.text // Pass the message text to find and highlight
                                  )
                                }
                              }, 150)
                            } else if (msg.driftPushMetadata.wasSavedAsChat && msg.driftPushMetadata.driftChatId) {
                              // Navigate to the saved drift chat
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
                              // Drift wasn't saved, navigate to parent and highlight source
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
                      {/* Add drift context for first AI drift message in multi-message groups or single messages */}
                      {isDriftMessage && !msg.isUser && (isFirstDriftMessage || !hasMultipleDriftMessages) && (
                        <div 
                          className="absolute top-2 left-3 right-3 text-[10px] text-text-muted cursor-pointer hover:text-accent-violet transition-colors duration-75 duration-200"
                          onClick={() => {
                            // If this drift was saved as a chat, open it
                            if (msg.driftPushMetadata?.wasSavedAsChat && msg.driftPushMetadata?.driftChatId) {
                              switchChat(msg.driftPushMetadata.driftChatId)
                            } else if (msg.driftPushMetadata) {
                              // Otherwise, just start a new drift from the original source
                              // This is simpler and more predictable
                              handleStartDrift(msg.driftPushMetadata.selectedText, msg.driftPushMetadata.sourceMessageId || msg.id)
                            }
                          }}
                          title={msg.driftPushMetadata?.wasSavedAsChat ? "Click to open drift conversation" : "Click to view full drift"}
                        >
                          <div className="italic truncate mb-1">
                            From: "{msg.driftPushMetadata?.selectedText}"
                          </div>
                          {msg.driftPushMetadata?.userQuestion && (
                            <div className="italic truncate">
                              Q: "{msg.driftPushMetadata.userQuestion}"
                            </div>
                          )}
                        </div>
                      )}
                      
                      
                      {msg.isUser ? (
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                      ) : msg.driftInfo ? (
                        // Render AI message with clickable drift link
                        <div className="text-sm leading-relaxed">
                          <ReactMarkdown
                            className="prose prose-sm prose-invert max-w-none
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
                            components={{
                              p: ({children}) => {
                                // Check if this paragraph contains the drift text
                                const text = String(children)
                                const driftText = msg.driftInfo?.selectedText
                                
                                if (driftText && text.includes(driftText)) {
                                  const parts = text.split(driftText)
                                  return (
                                    <p className="mb-2">
                                      {parts[0]}
                                      <button
                                        onClick={() => {
                                          // If it's a temporary drift, reopen the drift panel
                                          if (msg.driftInfo!.driftChatId.startsWith('drift-temp-')) {
                                            handleStartDrift(msg.driftInfo!.selectedText, msg.id)
                                          } else {
                                            // Otherwise switch to the saved drift chat
                                            switchChat(msg.driftInfo!.driftChatId)
                                          }
                                        }}
                                        className="inline px-1.5 py-0.5 rounded
                                                 bg-gradient-to-r from-accent-violet/20 to-accent-pink/20
                                                 border border-accent-violet/30 hover:border-accent-violet/50
                                                 text-accent-violet hover:text-accent-pink
                                                 transition-all duration-100"
                                        title={msg.driftInfo!.driftChatId.startsWith('drift-temp-') 
                                          ? "Open drift panel" 
                                          : "View drift conversation"}
                                      >
                                        {driftText}
                                      </button>
                                      {parts.slice(1).join(driftText)}
                                    </p>
                                  )
                                }
                                return <p className="mb-2">{children}</p>
                              }
                            }}
                          >
                            {msg.text.replace(/<br>/g, '\n').replace(/<br\/>/g, '\n')}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <ReactMarkdown 
                          className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none
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
                          components={{
                            p: ({children}) => <p className="mb-2">{children}</p>,
                            br: () => <br />,
                            table: ({children}) => (
                              <div className="overflow-x-auto my-4">
                                <table className="min-w-full">{children}</table>
                              </div>
                            )
                          }}
                        >
                          {msg.text.replace(/<br>/g, '\n').replace(/<br\/>/g, '\n')}
                        </ReactMarkdown>
                      )}
                      </div>
                    </div>
                    </div>
                  </div>
                ) : null
              })}
              
              {isTyping && !streamingResponse && (
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

        {/* Modern input area */}
        <div className="relative z-10 p-4 bg-gradient-to-t from-dark-bg to-dark-surface/50 backdrop-blur-sm">
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
                  placeholder={isTyping ? "AI is responding..." : "Type your message..."}
                  disabled={isTyping}
                  rows={1}
                  className="
                    w-full bg-dark-elevated/80 backdrop-blur-sm text-text-primary 
                    rounded-2xl px-6 py-4 pr-14
                    border border-dark-border/50
                    focus:outline-none focus:border-accent-pink/50
                    focus:shadow-[0_0_0_2px_rgba(255,0,122,0.2)]
                    placeholder:text-text-muted
                    transition-all duration-150
                    disabled:opacity-70
                    resize-none
                    min-h-[56px] max-h-[200px]
                    overflow-y-auto
                    custom-scrollbar
                  "
                  style={{
                    height: '56px'
                  }}
                />
                {isTyping ? (
                  <button
                    onClick={stopGeneration}
                    className="
                      absolute right-3 bottom-3
                      w-10 h-10 rounded-full
                      bg-gradient-to-br from-accent-pink to-accent-violet
                      text-white shadow-lg shadow-accent-pink/30
                      flex items-center justify-center
                      hover:scale-105 active:scale-95
                      transition-all duration-100
                    "
                    title="Stop generating"
                  >
                    <Square className="w-4 h-4" fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={sendMessage}
                    disabled={!message.trim()}
                    className="
                      absolute right-3 bottom-3
                      w-10 h-10 rounded-full
                      bg-gradient-to-br from-accent-pink to-accent-violet
                      text-white shadow-lg shadow-accent-pink/30
                      flex items-center justify-center
                      hover:scale-105 active:scale-95
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-all duration-100
                    "
                  >
                    <Send className="w-4 h-4" />
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