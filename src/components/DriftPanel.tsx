import { useState, useRef, useEffect } from 'react'
import { X, Save, ArrowUp, Square, ArrowLeft, Undo2, Bookmark, Maximize2, Minimize2, Megaphone } from 'lucide-react'
import { sendMessageToOpenRouter, type ChatMessage as OpenRouterMessage, OPENROUTER_MODELS } from '../services/openrouter'
import { sendMessageToOllama, type ChatMessage as OllamaMessage } from '../services/ollama'
import { type ChatMessage as DummyMessage } from '../services/dummyAI'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AISettings } from './Settings'
import { snippetStorage } from '../services/snippetStorage'
import { getTextDirection, getRTLClassName } from '../utils/rtl'

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
  // If provided, Drift will follow the main chat model chips
  selectedProvider?: 'openrouter' | 'ollama'
  // Optional: allow running compare against multiple targets from main
  selectedTargets?: Array<{ provider: 'openrouter' | 'ollama'; key: string; label: string }>
  onExpandedChange?: (expanded: boolean) => void
}

export default function DriftPanel({
  isOpen,
  onClose,
  selectedText,
  contextMessages: _contextMessages,
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
  selectedProvider,
  selectedTargets,
  onExpandedChange
}: DriftPanelProps) {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [driftOnlyMessages, setDriftOnlyMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
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
  const compareAbortControllersRef = useRef<Record<string, AbortController> | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [showExpandHint, setShowExpandHint] = useState(false)
  const [isComparing, setIsComparing] = useState(false)

  // Initialize Drift with existing messages or system message
  useEffect(() => {
    if (isOpen) {
      // Check if we have existing messages for this drift
      if (existingMessages && existingMessages.length > 0) {
        // Restore the existing conversation
        setMessages(existingMessages)
        setDriftOnlyMessages(existingMessages)
      } else {
        // Add system context message for new drift
        const systemMessage: Message = {
          id: 'drift-system-' + Date.now(),
          text: `What would you like to know about "${selectedText}"?`,
          isUser: false,
          timestamp: new Date()
        }
        
        // Set only the system message - no context messages
        setMessages([systemMessage])
        
        // Set drift-only messages (just the system message to start)
        setDriftOnlyMessages([systemMessage])
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
  }, [isOpen, selectedText, existingMessages])

  // Autofocus input when the drift panel opens
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
      return () => clearTimeout(t)
    }
  }, [isOpen])

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

  const sendMessage = async () => {
    if (message.trim()) {
      const newMessage: Message = {
        id: 'drift-' + Date.now().toString(),
        text: message,
        isUser: true,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, newMessage])
      setDriftOnlyMessages(prev => [...prev, newMessage])
      setMessage('')
      setIsTyping(true)
      
      // Only use drift-specific messages, not the context messages
      // Filter out the system message and any context messages
      const driftConversation = driftOnlyMessages.filter(
        msg => !msg.text.startsWith('What would you like to know about') && msg.id !== newMessage.id
      )
      
      // Convert messages to API format with special Drift context
      const apiMessages: (OpenRouterMessage | OllamaMessage | DummyMessage)[] = [
        {
          role: 'system',
          content: `The user selected "${selectedText}" from a conversation they're already reading. They want to explore this specific term/concept deeper. Don't repeat the basic definition - they can already see that. Instead, provide interesting insights, examples, etymology, cultural context, or related concepts. Be concise and add NEW value beyond what's already visible.`
        },
        ...driftConversation.map(msg => ({
          role: msg.isUser ? 'user' as const : 'assistant' as const,
          content: msg.text
        })),
        { role: 'user' as const, content: message }
      ]
      
      const envKey = import.meta.env.VITE_OPENROUTER_API_KEY
      const settingsKey = aiSettings.openRouterApiKey
      const effectiveApiKey = envKey || settingsKey
      // If a provider was passed from main chat, honor it. Otherwise, infer.
      const provider: 'openrouter' | 'ollama' = selectedProvider
        ? selectedProvider
        : (effectiveApiKey ? 'openrouter' : 'ollama')

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
        
        // Stream the response using the chosen provider
        if (provider === 'openrouter') {
          const apiKey = effectiveApiKey
          if (!apiKey) throw new Error('No OpenRouter API key found. Please set VITE_OPENROUTER_API_KEY in .env file')
          // Choose model based on selected target when single-target
          const sTargets = selectedTargets || []
          const useQwen3 = (sTargets.length === 1 && (sTargets[0].key === 'qwen3' || sTargets[0].label === 'Qwen3'))
          const model = useQwen3 ? OPENROUTER_MODELS.QWEN3 : (aiSettings.openRouterModel || OPENROUTER_MODELS.OSS)
          await sendMessageToOpenRouter(
            apiMessages as any,
            (chunk) => {
              accumulatedResponse += chunk
              setMessages(prev => prev.map(msg => msg.id === aiResponseId ? { ...msg, text: accumulatedResponse } : msg))
              setDriftOnlyMessages(prev => prev.map(msg => msg.id === aiResponseId ? { ...msg, text: accumulatedResponse } : msg))
            },
            apiKey,
            abortController.signal,
            model
          )
        } else if (provider === 'ollama') {
          await sendMessageToOllama(
            apiMessages as any,
            (chunk) => {
              accumulatedResponse += chunk
              setMessages(prev => prev.map(msg => msg.id === aiResponseId ? { ...msg, text: accumulatedResponse } : msg))
              setDriftOnlyMessages(prev => prev.map(msg => msg.id === aiResponseId ? { ...msg, text: accumulatedResponse } : msg))
            },
            abortController.signal,
            aiSettings.ollamaUrl,
            aiSettings.ollamaModel
          )
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
      fixed top-0 right-0 h-full z-20
      ${isExpanded ? 'w-[70vw] max-w-[920px]' : 'w-[450px] md:w-[520px]'}
      transition-all duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : 'translate-x-full'}
    `}>
      {/* Panel */}
      <div className={`
        w-full h-full bg-dark-bg
        border-l border-dark-border/30 shadow-2xl
        flex flex-col overflow-hidden
      `}>
        {/* Header - matching main chat header */}
        <header className="relative z-10 border-b border-dark-border/30 backdrop-blur-sm bg-dark-bg/80">
          <div className="px-2 py-1 flex items-center justify-between gap-1">
            <button
              onClick={() => setIsExpanded(v => !v)}
              className={`p-1 rounded-lg border ${isExpanded ? 'border-dark-border/60 bg-dark-elevated' : 'border-dark-border/40 bg-dark-elevated/60'} hover:border-accent-violet/40 transition-colors`}
              title={isExpanded ? 'Collapse panel' : 'Expand panel'}
            >
              {isExpanded ? (
                <Minimize2 className="w-3.5 h-3.5 text-text-muted" />
              ) : (
                <Maximize2 className={`w-3.5 h-3.5 ${showExpandHint ? 'text-accent-pink' : 'text-text-muted'}`} />
              )}
            </button>
            <button
              onClick={() => onClose(driftOnlyMessages)}
              className="p-1 hover:bg-dark-elevated rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5 text-text-muted" />
            </button>
          </div>
          
        </header>

        {/* Exploring + Actions toolbar (ultra-compact) */}
        <div className="px-2 py-1 border-b border-dark-border/30 bg-dark-bg/70">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1 overflow-hidden">
              <span className="text-[11px] text-text-muted mr-2">Exploring</span>
              <span className="text-[13px] text-text-secondary italic align-middle block truncate" title={selectedText}>"{selectedText}"</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handlePushToMain}
                disabled={isPushing || (!pushedToMain && driftOnlyMessages.filter(m => !m.text.startsWith('What would you')).length === 0)}
                className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px]
                  border transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed
                  ${pushedToMain
                    ? 'text-accent-pink border-accent-pink/50 bg-accent-pink/10 hover:bg-accent-pink/15 shadow-[0_0_20px_rgba(236,72,153,0.08)]'
                    : 'text-text-primary border-dark-border/50 bg-dark-elevated/60 hover:border-accent-violet/50 hover:bg-accent-violet/10 hover:text-accent-violet'}
                `}
                title={isPushing ? 'Pushing...' : pushedToMain ? 'Undo push to main' : 'Push drift to main chat'}
                aria-label={pushedToMain ? 'Undo push to main' : 'Push drift to main chat'}
              >
                {pushedToMain ? <Undo2 className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                <span className="translate-y-[0.5px]">{pushedToMain ? 'Undo' : 'Push'}</span>
              </button>
              {selectedTargets && selectedTargets.length > 1 && (
                <button
                  onClick={handleCompareAcrossModels}
                  disabled={
                    isTyping || isComparing || (
                      (message.trim().length === 0) && !driftOnlyMessages.some(m => m.isUser)
                    )
                  }
                  className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px]
                    border transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed
                    ${isComparing
                      ? 'text-accent-violet border-accent-violet/60 bg-accent-violet/10'
                      : 'text-text-primary border-dark-border/50 bg-dark-elevated/60 hover:border-accent-violet/50 hover:bg-accent-violet/10 hover:text-accent-violet'}
                  `}
                  title="Compare answers from selected models"
                  aria-label="Compare answers from selected models"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span className="translate-y-[0.5px]">{isComparing ? 'Comparing' : 'Compare'}</span>
                </button>
              )}
              <button
                onClick={handleSaveAsChat}
                disabled={!savedAsChat && driftOnlyMessages.filter(m => !m.text.startsWith('What would you')).length === 0}
                className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px]
                  border transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed
                  ${savedAsChat
                    ? 'text-cyan-300 border-cyan-500/60 bg-cyan-500/10 hover:bg-cyan-500/15'
                    : 'text-text-primary border-dark-border/50 bg-dark-elevated/60 hover:border-cyan-400/60 hover:bg-cyan-500/10 hover:text-cyan-300'}
                `}
                title={savedAsChat ? 'Undo save as chat' : 'Save drift as new chat'}
                aria-label={savedAsChat ? 'Undo save as chat' : 'Save drift as new chat'}
              >
                {savedAsChat ? <Undo2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                <span className="translate-y-[0.5px]">{savedAsChat ? 'Saved' : 'Save'}</span>
              </button>
            </div>
          </div>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 pb-16 space-y-3 bg-dark-bg">
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
                          <div className="relative rounded-2xl px-3.5 pt-6 pb-2 bg-dark-bubble border border-dark-border/50 text-text-secondary min-h-[40px]">
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
                  <div className="relative max-w-[85%]" data-drift-message-id={msg.id}>
                    <div className={`relative rounded-2xl ${msg.isUser ? 'px-3.5 py-2 bg-gradient-to-br from-accent-pink to-accent-violet text-white' : 'px-3.5 pt-6 pb-2 bg-dark-bubble border border-dark-border/50 text-text-secondary'}`}>
                      {/* Overlay header for assistant: model tag and actions */}
                      {!msg.isUser && (
                        <>
                          {msg.modelTag && (
                            <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-dark-elevated/70 border border-dark-border/50 text-[10px] text-text-muted">
                              {msg.modelTag}
                            </span>
                          )}
                          <div className="absolute top-1 right-1 flex items-center gap-1.5 opacity-80 hover:opacity-100">
                            <button
                              onClick={() => handlePushSingleMessage(msg)}
                              className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-dark-elevated/70 border border-dark-border/50 hover:border-accent-pink/60 hover:bg-accent-pink/10 transition-all duration-150"
                              title="Push this message to main chat"
                            >
                              <ArrowLeft className="w-3 h-3 text-text-muted" />
                            </button>
                            <button
                              onClick={() => handleToggleSaveMessage(msg)}
                              className={`w-6 h-6 inline-flex items-center justify-center rounded-full bg-dark-elevated/70 border ${savedMessageIds.has(msg.id) ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-dark-border/50'} hover:border-cyan-500/60 hover:bg-cyan-500/10 transition-all duration-150`}
                              title={savedMessageIds.has(msg.id) ? 'Remove from snippets' : 'Save to snippets'}
                            >
                              <Bookmark className={`w-3 h-3 ${savedMessageIds.has(msg.id) ? 'text-cyan-300 fill-cyan-300' : 'text-text-muted'}`} />
                            </button>
                          </div>
                        </>
                      )}
                      {msg.isUser ? (
                        <>
                          <div className="flex items-center justify-end mb-1">
                            <button
                              onClick={() => handleToggleSaveMessage(msg)}
                              className={`w-7 h-7 inline-flex items-center justify-center rounded-full bg-dark-elevated/70 border ${savedMessageIds.has(msg.id) ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-dark-border/50'} hover:border-cyan-500/60 hover:bg-cyan-500/10 transition-all duration-150`}
                              title={savedMessageIds.has(msg.id) ? 'Remove from snippets' : 'Save to snippets'}
                            >
                              <Bookmark className={`w-3.5 h-3.5 ${savedMessageIds.has(msg.id) ? 'text-cyan-300 fill-cyan-300' : 'text-text-muted'}`} />
                            </button>
                          </div>
                          <p className={`text-[13px] leading-6 ${getRTLClassName(msg.text)}`} dir={getTextDirection(msg.text)}>{msg.text}</p>
                        </>
                      ) : (
                        <div className={`${getRTLClassName(msg.text)}`} dir={getTextDirection(msg.text)}>
                          <ReactMarkdown className="text-[13px] leading-6 prose prose-sm prose-invert max-w-none prose-headings:text-text-primary prose-headings:font-semibold prose-headings:mb-2 prose-headings:mt-3 prose-p:text-text-secondary prose-p:mb-2 prose-strong:text-text-primary prose-strong:font-semibold prose-ul:my-2 prose-ul:space-y-1 prose-li:text-text-secondary prose-li:ml-4 prose-code:text-accent-violet prose-code:bg-dark-bg/50 prose-pre:bg-dark-bg prose-pre:border prose-pre:border-dark-border/50 prose-pre:rounded-lg prose-pre:p-3 prose-blockquote:border-l-accent-violet prose-blockquote:text-text-muted prose-table:w-full prose-table:border-collapse prose-table:overflow-hidden prose-table:rounded-lg prose-thead:bg-dark-elevated/50 prose-thead:border-b prose-thead:border-dark-border/50 prose-th:text-text-primary prose-th:font-semibold prose-th:px-2 prose-th:py-1.5 prose-th:text-left prose-th:text-xs prose-td:text-text-secondary prose-td:px-2 prose-td:py-1.5 prose-td:border-b prose-td:border-dark-border/30 prose-td:text-xs prose-tr:hover:bg-dark-elevated/20" remarkPlugins={[remarkGfm]} components={{ p: ({children}) => <p className="mb-2">{children}</p>, br: () => <br />, table: ({children}) => (<div className="overflow-x-auto my-3"><table className="min-w-full text-xs">{children}</table></div>) }}>
                            {msg.text.replace(/<br>/g, '\n').replace(/<br\/>/g, '\n')}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                    
                  </div>
                </div>
              )
            })
          })()}
          
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-dark-bubble border border-dark-border/50 rounded-2xl px-4 py-2.5">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input - matching main chat input */}
        <div className="absolute bottom-0 left-0 right-0 z-10 pb-2 px-4 pt-4">
          <div className="max-w-4xl mx-auto">
            <div className="relative flex gap-3 items-end">
              <div className="flex-1 relative">
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
                  placeholder={"Explore this drift..."}
                  rows={1}
                  dir={getTextDirection(message)}
                  className={`
                    w-full bg-dark-elevated/80 backdrop-blur-md text-text-primary 
                    rounded-2xl px-4 py-2.5 pr-12
                    border border-dark-border/60
                    
                    focus:outline-none focus:border-accent-violet/40
                    focus:shadow-[0_0_20px_rgba(168,85,247,0.15)]
                    placeholder:text-text-muted
                    transition-all duration-150
                    resize-none
                    min-h-[44px] max-h-[200px]
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
                      bg-dark-elevated/70 border border-dark-border/60
                      text-text-primary
                      flex items-center justify-center
                      hover:border-accent-violet/40 hover:bg-dark-elevated active:scale-95
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
                      bg-dark-elevated/70 border border-dark-border/60
                      text-text-primary
                      flex items-center justify-center
                      hover:border-accent-violet/40 hover:bg-dark-elevated active:scale-95
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
    </div>
  )
}
