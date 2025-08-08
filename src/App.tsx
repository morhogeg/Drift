import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Menu, X, Plus, Search, MessageCircle, ChevronLeft, AlertCircle, Square, ArrowDown } from 'lucide-react'
import { sendMessageToOllama, checkOllamaConnection, type ChatMessage as OllamaMessage } from './services/ollama'
import DriftPanel from './components/DriftPanel'
import SelectionTooltip from './components/SelectionTooltip'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Message {
  id: string
  text: string
  isUser: boolean
  timestamp: Date
  hasDrift?: boolean
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
  const [ollamaConnected, setOllamaConnected] = useState(false)
  const [streamingResponse, setStreamingResponse] = useState('')
  const [showScrollButton, setShowScrollButton] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mainScrollPosition = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const userHasScrolled = useRef(false)
  
  // Drift state
  const [driftOpen, setDriftOpen] = useState(false)
  const [driftContext, setDriftContext] = useState<{
    selectedText: string
    sourceMessageId: string
    contextMessages: Message[]
  }>({
    selectedText: '',
    sourceMessageId: '',
    contextMessages: []
  })

  // Chat history state
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([
    {
      id: '1',
      title: 'Current Conversation',
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

  useEffect(() => {
    // Check Ollama connection on mount
    checkOllamaConnection().then(setOllamaConnected)
    
    // Check connection every 5 seconds
    const interval = setInterval(() => {
      checkOllamaConnection().then(setOllamaConnected)
    }, 5000)
    
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Monitor scroll position to show/hide scroll button
    const chatContainer = document.querySelector('.chat-messages-container')
    if (!chatContainer) return
    
    let scrollTimeout: NodeJS.Timeout
    
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
        }, 100)
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
      setChatHistory(prevHistory => 
        prevHistory.map(chat => 
          chat.id === activeChatId 
            ? { ...chat, messages: updatedMessages, lastMessage: message }
            : chat
        )
      )
      
      // Convert messages to Ollama format
      const ollamaMessages: OllamaMessage[] = updatedMessages.map(msg => ({
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
        
        // Stream the response
        await sendMessageToOllama(
          ollamaMessages, 
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
          abortController.signal
        )
        
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
                  lastMessage: accumulatedResponse.slice(0, 100) 
                }
              : chat
          )
        )
        
        setStreamingResponse('')
      } catch (error) {
        // Fallback message if Ollama isn't running
        const errorMessage = error instanceof Error && error.message.includes('Ollama is not running')
          ? "Ollama is not running. Please install and start Ollama:\n1. Download from ollama.com\n2. Run: ollama pull gpt-oss:20b\n3. Run: ollama serve"
          : "Failed to connect to AI model. Please check your connection."
          
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
    // Update the title and save messages of the current active chat
    const updatedHistory = chatHistory.map(chat => {
      if (chat.id === activeChatId) {
        // Save current messages
        const updatedChat = { ...chat, messages: messages }
        
        // Update title if there are messages
        if (messages.length > 0) {
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
    }
  }

  // Drift handlers
  const handleStartDrift = (selectedText: string, messageId: string) => {
    // Save scroll position
    const chatContainer = document.querySelector('.chat-messages-container')
    if (chatContainer) {
      mainScrollPosition.current = chatContainer.scrollTop
    }
    
    // Find the message index to get context up to that point
    const messageIndex = messages.findIndex(m => m.id === messageId)
    if (messageIndex === -1) return
    
    // Get all messages up to and including the selected message
    const contextMessages = messages.slice(0, messageIndex + 1)
    
    // Mark the source message as having a drift
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, hasDrift: true } : msg
    ))
    
    setDriftContext({
      selectedText,
      sourceMessageId: messageId,
      contextMessages
    })
    setDriftOpen(true)
  }

  const handleCloseDrift = () => {
    setDriftOpen(false)
    
    // Restore scroll position
    setTimeout(() => {
      const chatContainer = document.querySelector('.chat-messages-container')
      if (chatContainer) {
        chatContainer.scrollTop = mainScrollPosition.current
      }
    }, 100)
  }

  const handleSaveDriftAsChat = (driftMessages: Message[], title: string, metadata: any) => {
    const newChatId = 'drift-' + Date.now().toString()
    const newChat: ChatSession = {
      id: newChatId,
      title,
      messages: driftMessages,
      lastMessage: driftMessages[driftMessages.length - 1]?.text || 'Drift conversation',
      createdAt: new Date(),
      metadata: {
        ...metadata,
        parentChatId: activeChatId
      }
    }
    
    setChatHistory(prev => [newChat, ...prev])
    
    // Update current chat history to save current messages
    setChatHistory(prevHistory => 
      prevHistory.map(chat => 
        chat.id === activeChatId 
          ? { ...chat, messages: messages }
          : chat
      )
    )
  }

  return (
    <div className="h-screen flex bg-dark-bg relative overflow-hidden">
      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-dark-bg via-dark-surface/50 to-dark-bg pointer-events-none" />
      
      {/* Sidebar */}
      <aside className={`
        fixed z-20 w-[300px] h-full bg-dark-surface/95 backdrop-blur-sm
        border-r border-dark-border/30 flex flex-col
        transition-all duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        shadow-[inset_-8px_0_10px_-8px_rgba(0,0,0,0.4)]
      `}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-dark-border/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent-pink" />
              <h2 className="text-lg font-semibold text-text-primary">Chat History</h2>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 hover:bg-dark-elevated rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-text-muted" />
            </button>
          </div>
          
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="
                w-full bg-dark-elevated/50 text-text-primary
                rounded-full pl-10 pr-4 py-2 text-sm
                border border-dark-border/30
                focus:outline-none focus:border-accent-violet/50
                placeholder:text-text-muted
                transition-all duration-200
              "
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredChats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => switchChat(chat.id)}
              className={`
                group relative rounded-xl p-3 cursor-pointer
                transition-all duration-200 ease-in-out
                ${activeChatId === chat.id 
                  ? 'bg-dark-elevated border-l-4 border-accent-pink shadow-lg' 
                  : 'bg-dark-elevated/30 hover:bg-dark-elevated/50 hover:scale-[1.02]'
                }
              `}
            >
              <div className="flex items-start gap-3">
                {chat.metadata?.isDrift ? (
                  <span className="text-base mt-0.5 flex-shrink-0">🌀</span>
                ) : (
                  <MessageCircle className={`
                    w-4 h-4 mt-0.5 flex-shrink-0
                    ${activeChatId === chat.id ? 'text-accent-pink' : 'text-text-muted'}
                  `} />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-text-primary truncate flex items-center gap-1">
                    {chat.title}
                    {chat.metadata?.isDrift && (
                      <span className="text-xs text-accent-violet/70 font-normal">(Drift)</span>
                    )}
                  </h3>
                  <p className="text-xs text-text-muted truncate mt-0.5">
                    {chat.lastMessage}
                  </p>
                  <p className="text-xs text-accent-violet/70 mt-1">
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

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-dark-border/30">
          <button 
            onClick={createNewChat}
            className="
            w-full flex items-center justify-center gap-2
            bg-gradient-to-r from-accent-pink to-accent-violet
            text-white rounded-full px-4 py-2.5
            hover:shadow-lg hover:shadow-accent-pink/20
            transition-all duration-200 hover:scale-[1.02]
          ">
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">New Chat</span>
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className={`
        flex-1 flex flex-col relative
        transition-all duration-300 ease-in-out
        ${sidebarOpen ? 'ml-[300px]' : 'ml-0'}
      `}>
        {/* Header with Drift branding */}
        <header className="relative z-10 border-b border-dark-border/30 backdrop-blur-sm bg-dark-bg/80">
          <div className="px-6 py-4 flex items-center justify-between">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-dark-elevated rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5 text-text-muted" />
              </button>
            )}
            
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
            
            {/* Connection Status - moved to right */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-dark-elevated/50 border border-dark-border/30">
              <div className={`w-2 h-2 rounded-full ${ollamaConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
              <span className="text-xs text-text-muted">
                {ollamaConnected ? 'Connected to OSS-20B' : 'Offline Mode'}
              </span>
            </div>
          </div>
        </header>
        
        {/* Messages area with depth */}
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0 bg-dark-surface rounded-t-2xl shadow-inner">
            <div className="h-full overflow-y-auto px-4 py-6 space-y-4 chat-messages-container">
              
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
                    transition-all duration-200 hover:scale-105
                    animate-fade-up
                  "
                  title="Scroll to bottom"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              )}
              {messages.length === 0 && (
                <div className={`flex flex-col items-center py-20 animate-fade-up ${sidebarOpen ? '-ml-[150px]' : '-ml-28'}`}>
                  <Sparkles className="w-12 h-12 text-accent-pink/50 mb-4" />
                  <p className="text-text-muted">Start a conversation with Drift AI</p>
                </div>
              )}
              
              {messages.map((msg, index) => (
                msg.text ? (
                  <div
                    key={msg.id}
                    className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'} animate-fade-up relative`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div
                      className={`
                        max-w-[70%] rounded-2xl px-5 py-3 relative
                        ${msg.isUser 
                          ? 'bg-gradient-to-br from-accent-pink to-accent-violet text-white shadow-lg shadow-accent-pink/20' 
                          : 'ai-message bg-dark-bubble border border-dark-border/50 text-text-secondary shadow-lg shadow-black/20'
                        }
                        transition-all duration-200 hover:scale-[1.02]
                        ${!msg.isUser ? 'select-text' : ''}
                      `}
                      data-message-id={msg.id}
                    >
                      {msg.isUser ? (
                        <p className="text-sm leading-relaxed">{msg.text}</p>
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
                      {msg.hasDrift && (
                        <span className="absolute -top-2 -right-2 text-sm animate-pulse">🌀</span>
                      )}
                    </div>
                  </div>
                ) : null
              ))}
              
              {isTyping && !streamingResponse && (
                <div className="flex justify-start animate-fade-up">
                  <div className="bg-dark-bubble border border-dark-border/50 rounded-2xl px-5 py-3 shadow-lg">
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
          </div>
        </div>

        {/* Modern input area */}
        <div className="relative z-10 p-4 bg-gradient-to-t from-dark-bg to-dark-surface/50 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto">
            <div className="relative flex gap-3 items-center">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && !isTyping && sendMessage()}
                placeholder={isTyping ? "AI is responding..." : "Type your message..."}
                disabled={isTyping}
                className="
                  flex-1 bg-dark-elevated/80 backdrop-blur-sm text-text-primary 
                  rounded-full px-6 py-4 pr-14
                  border border-dark-border/50
                  focus:outline-none focus:border-accent-pink/50
                  focus:shadow-[0_0_0_2px_rgba(255,0,122,0.2)]
                  placeholder:text-text-muted
                  transition-all duration-300
                  disabled:opacity-70
                "
              />
              {isTyping ? (
                <button
                  onClick={stopGeneration}
                  className="
                    absolute right-2 top-1/2 -translate-y-1/2
                    w-10 h-10 rounded-full
                    bg-gradient-to-br from-accent-pink to-accent-violet
                    text-white shadow-lg shadow-accent-pink/30
                    flex items-center justify-center
                    hover:scale-105 active:scale-95
                    transition-all duration-200
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
                    absolute right-2 top-1/2 -translate-y-1/2
                    w-10 h-10 rounded-full
                    bg-gradient-to-br from-accent-pink to-accent-violet
                    text-white shadow-lg shadow-accent-pink/30
                    flex items-center justify-center
                    hover:scale-105 active:scale-95
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-all duration-200
                  "
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Selection Tooltip */}
      <SelectionTooltip onStartDrift={handleStartDrift} />
      
      {/* Drift Panel */}
      <DriftPanel
        isOpen={driftOpen}
        onClose={handleCloseDrift}
        selectedText={driftContext.selectedText}
        contextMessages={driftContext.contextMessages}
        sourceMessageId={driftContext.sourceMessageId}
        parentChatId={activeChatId}
        onSaveAsChat={handleSaveDriftAsChat}
      />
    </div>
  )
}

export default App