import { useState, useRef, useEffect } from 'react'
import { X, Save, Send, Square, ArrowLeft, Check, Undo2, Bookmark } from 'lucide-react'
import { sendMessageToOpenRouter, type ChatMessage as OpenRouterMessage } from '../services/openrouter'
import { sendMessageToOllama, type ChatMessage as OllamaMessage } from '../services/ollama'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AISettings } from './Settings'
import { snippetStorage } from '../services/snippetStorage'

interface Message {
  id: string
  text: string
  isUser: boolean
  timestamp: Date
}

interface DriftPanelProps {
  isOpen: boolean
  onClose: () => void
  selectedText: string
  contextMessages: Message[]
  sourceMessageId: string
  parentChatId: string
  onSaveAsChat: (messages: Message[], title: string, metadata: any) => void
  onPushToMain?: (messages: Message[], selectedText: string, sourceMessageId: string, wasSavedAsChat: boolean, userQuestion?: string, driftChatId?: string) => void
  onUpdatePushedDriftSaveStatus?: (sourceMessageId: string) => void
  onUndoPushToMain?: (sourceMessageId: string) => void
  onUndoSaveAsChat?: (chatId: string) => void
  onSnippetCountUpdate?: () => void
  aiSettings: AISettings
}

export default function DriftPanel({
  isOpen,
  onClose,
  selectedText,
  contextMessages: _contextMessages,
  sourceMessageId,
  parentChatId,
  onSaveAsChat,
  onPushToMain,
  onUpdatePushedDriftSaveStatus,
  onUndoPushToMain,
  onUndoSaveAsChat,
  onSnippetCountUpdate,
  aiSettings
}: DriftPanelProps) {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [driftOnlyMessages, setDriftOnlyMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [pushedToMain, setPushedToMain] = useState(false)
  const [savedAsChat, setSavedAsChat] = useState(false)
  const [savedChatId, setSavedChatId] = useState<string | null>(null)
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set())
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Initialize Drift with only system message (no context)
  useEffect(() => {
    if (isOpen) {
      // Add system context message
      const systemMessage: Message = {
        id: 'drift-system-' + Date.now(),
        text: `🌀 Drift started from: "${selectedText}"\n\nLet's explore this specific term or concept. What would you like to know about "${selectedText}"?`,
        isUser: false,
        timestamp: new Date()
      }
      
      // Set only the system message - no context messages
      setMessages([systemMessage])
      
      // Set drift-only messages (just the system message to start)
      setDriftOnlyMessages([systemMessage])
      
      // Reset states when opening new drift
      setPushedToMain(false)
      setSavedAsChat(false)
      setSavedChatId(null)
      
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
  }, [isOpen, selectedText])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handlePushSingleMessage = (message: Message) => {
    if (onPushToMain) {
      // Create a mini conversation with just this message
      const singleMessageArray = [message]
      
      // Find the user message before this one
      const messageIndex = driftOnlyMessages.findIndex(m => m.id === message.id)
      const previousUserMessage = driftOnlyMessages.slice(0, messageIndex).reverse().find(m => m.isUser)
      const userQuestion = previousUserMessage?.text || selectedText
      
      // Push just this message to main with context about it being a single message
      onPushToMain(
        singleMessageArray, 
        selectedText,
        sourceMessageId,
        savedAsChat,
        userQuestion,
        savedChatId || undefined
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
        msg => !msg.text.startsWith('🌀 Drift started from:') && msg.id !== newMessage.id
      )
      
      // Convert messages to API format with special Drift context
      const apiMessages: (OpenRouterMessage | OllamaMessage)[] = [
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
      
      console.log('Drift panel - sending message with OpenRouter:', aiSettings.useOpenRouter)
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
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === aiResponseId 
                    ? { ...msg, text: accumulatedResponse }
                    : msg
                )
              )
              setDriftOnlyMessages(prev => 
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
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === aiResponseId 
                    ? { ...msg, text: accumulatedResponse }
                    : msg
                )
              )
              setDriftOnlyMessages(prev => 
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
  
  const handlePushToMain = () => {
    // If already pushed, handle undo
    if (pushedToMain && onUndoPushToMain) {
      onUndoPushToMain(sourceMessageId)
      setPushedToMain(false)
      return
    }
    
    // Prevent multiple pushes
    if (pushedToMain) return
    
    if (onPushToMain && driftOnlyMessages.length > 0) {
      // Filter out the system message when pushing to main
      const messagesToPush = driftOnlyMessages.filter(
        msg => !msg.text.startsWith('🌀 Drift started from:')
      )
      
      if (messagesToPush.length > 0) {
        // Find the last user question in the drift conversation
        const lastUserMessage = messagesToPush.filter(m => m.isUser).pop()
        const userQuestion = lastUserMessage?.text || selectedText
        
        onPushToMain(messagesToPush, selectedText, sourceMessageId, savedAsChat, userQuestion, savedChatId || undefined)
        setPushedToMain(true)
        // Don't close - let user decide if they also want to save as chat
        // onClose()
      }
    }
  }

  return (
    <div className={`
      fixed top-0 right-0 h-full z-20
      w-[450px]
      transition-all duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : 'translate-x-full'}
    `}>
      {/* Panel */}
      <div className={`
        w-full h-full bg-dark-surface/95 backdrop-blur-md
        border-l border-accent-violet/30 shadow-2xl
        flex flex-col overflow-hidden
        ${isOpen ? 'shadow-[0_0_50px_rgba(168,85,247,0.2)]' : ''}
      `}>
        {/* Header - matching main chat header */}
        <header className="relative z-10 border-b border-dark-border/30 backdrop-blur-sm bg-dark-bg/80">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="text-2xl">🌀</span>
                  <div className="absolute inset-0 blur-lg bg-accent-violet/50 animate-pulse" />
                </div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-accent-pink to-accent-violet bg-clip-text text-transparent">Drift Mode</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="absolute right-6 p-2 hover:bg-dark-elevated rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-text-muted" />
            </button>
          </div>
          
          {/* Selected Text Context and Action Buttons */}
          <div className="px-6 pb-4">
            <div className="p-3 bg-dark-bg/50 rounded-lg border border-accent-violet/20 mb-3">
              <p className="text-sm text-accent-violet font-medium mb-1">Exploring:</p>
              <p className="text-sm text-text-secondary italic">"{selectedText}"</p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handlePushToMain}
                disabled={!pushedToMain && driftOnlyMessages.filter(m => !m.text.startsWith('🌀')).length === 0}
                className={`flex-1 flex items-center justify-center gap-2
                  ${pushedToMain 
                    ? 'bg-dark-elevated/70 border-accent-violet/50 hover:bg-accent-violet/20 hover:border-accent-violet/70' 
                    : 'bg-gradient-to-r from-accent-pink/20 to-accent-violet/20 border-accent-pink/30 hover:from-accent-pink/30 hover:to-accent-violet/30 hover:border-accent-pink/50'
                  }
                  border text-text-primary rounded-lg px-3 py-2
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-200`}
                title={pushedToMain ? 'Undo push to main' : 'Push drift to main chat'}
              >
                {pushedToMain ? (
                  <>
                    <Undo2 className="w-4 h-4" />
                    <span className="text-sm">Undo Push</span>
                  </>
                ) : (
                  <>
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm">Push to Main</span>
                  </>
                )}
              </button>
              
              <button
                onClick={handleSaveAsChat}
                disabled={!savedAsChat && driftOnlyMessages.filter(m => !m.text.startsWith('🌀')).length === 0}
                className={`flex-1 flex items-center justify-center gap-2
                  ${savedAsChat 
                    ? 'bg-dark-elevated/70 border-accent-violet/50 hover:bg-accent-violet/20 hover:border-accent-violet/70' 
                    : 'bg-dark-elevated/50 border border-accent-violet/30 hover:bg-accent-violet/10 hover:border-accent-violet/50'
                  }
                  border text-text-primary rounded-lg px-3 py-2
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-200`}
                title={savedAsChat ? 'Undo save as chat' : 'Save drift as new chat'}
              >
                {savedAsChat ? (
                  <>
                    <Undo2 className="w-4 h-4" />
                    <span className="text-sm">Undo Save</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span className="text-sm">Save as Chat</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </header>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            msg.text ? (
              <div
                key={msg.id}
                className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'} group`}
                onMouseEnter={() => setHoveredMessageId(msg.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
              >
                <div className="relative max-w-[85%]">
                  <div
                    className={`
                      rounded-2xl px-4 py-2.5
                      ${msg.isUser 
                        ? 'bg-gradient-to-br from-accent-pink to-accent-violet text-white' 
                        : msg.id.includes('system') 
                          ? 'bg-gradient-to-br from-accent-violet/10 to-accent-pink/10 border border-accent-violet/30 text-text-secondary'
                          : 'bg-dark-bubble border border-dark-border/50 text-text-secondary'
                      }
                    `}
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
                        prose-table:w-full prose-table:border-collapse prose-table:overflow-hidden prose-table:rounded-lg
                        prose-thead:bg-dark-elevated/50 prose-thead:border-b prose-thead:border-dark-border/50
                        prose-th:text-text-primary prose-th:font-semibold prose-th:px-2 prose-th:py-1.5 prose-th:text-left prose-th:text-xs
                        prose-td:text-text-secondary prose-td:px-2 prose-td:py-1.5 prose-td:border-b prose-td:border-dark-border/30 prose-td:text-xs
                        prose-tr:hover:bg-dark-elevated/20"
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({children}) => <p className="mb-2">{children}</p>,
                        br: () => <br />,
                        table: ({children}) => (
                          <div className="overflow-x-auto my-3">
                            <table className="min-w-full text-xs">{children}</table>
                          </div>
                        )
                      }}
                    >
                      {msg.text.replace(/<br>/g, '\n').replace(/<br\/>/g, '\n')}
                    </ReactMarkdown>
                  )}
                  </div>
                  
                  {/* Action Buttons - positioned to the side */}
                  {!msg.id.includes('system') && !msg.isUser && (
                    <div className={`absolute -right-2 top-2 flex flex-col gap-1
                                    ${hoveredMessageId === msg.id ? 'opacity-100' : 'opacity-0'}
                                    transition-all duration-200 pointer-events-none`}>
                      {/* Push to Main Button */}
                      <button
                        onClick={() => handlePushSingleMessage(msg)}
                        className="p-1.5 rounded-lg pointer-events-auto
                                 bg-dark-elevated border border-dark-border/50
                                 hover:bg-dark-surface hover:border-accent-pink/50 
                                 transition-all duration-200
                                 shadow-lg hover:scale-110"
                        title="Push this message to main chat"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-text-muted hover:text-accent-pink transition-colors" />
                      </button>
                      
                      {/* Save to Snippet Button */}
                      <button
                        onClick={() => handleToggleSaveMessage(msg)}
                        className={`p-1.5 rounded-lg pointer-events-auto
                                   bg-dark-elevated border 
                                   ${savedMessageIds.has(msg.id) 
                                     ? 'border-cyan-500/50 bg-cyan-500/10' 
                                     : 'border-dark-border/50'}
                                   hover:bg-dark-surface hover:border-cyan-500/50 
                                   transition-all duration-200
                                   shadow-lg hover:scale-110`}
                        title={savedMessageIds.has(msg.id) ? "Remove from snippets" : "Save to snippets"}
                      >
                        <Bookmark 
                          className={`w-3.5 h-3.5 transition-colors
                            ${savedMessageIds.has(msg.id) 
                              ? 'text-cyan-400 fill-cyan-400' 
                              : 'text-text-muted hover:text-cyan-400'}`} 
                        />
                      </button>
                    </div>
                  )}
                  
                  {/* Save to Snippet Button for User Messages */}
                  {!msg.id.includes('system') && msg.isUser && (
                    <button
                      onClick={() => handleToggleSaveMessage(msg)}
                      className={`absolute -left-2 top-2 p-1.5 rounded-lg pointer-events-auto
                                 bg-dark-elevated border 
                                 ${savedMessageIds.has(msg.id) 
                                   ? 'border-cyan-500/50 bg-cyan-500/10' 
                                   : 'border-dark-border/50'}
                                 hover:bg-dark-surface hover:border-cyan-500/50 
                                 transition-all duration-200
                                 ${hoveredMessageId === msg.id ? 'opacity-100' : 'opacity-0'}
                                 shadow-lg hover:scale-110`}
                      title={savedMessageIds.has(msg.id) ? "Remove from snippets" : "Save to snippets"}
                    >
                      <Bookmark 
                        className={`w-3.5 h-3.5 transition-colors
                          ${savedMessageIds.has(msg.id) 
                            ? 'text-cyan-400 fill-cyan-400' 
                            : 'text-text-muted hover:text-cyan-400'}`} 
                      />
                    </button>
                  )}
                </div>
              </div>
            ) : null
          ))}
          
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
        <div className="relative z-10 p-4 bg-gradient-to-t from-dark-bg to-dark-surface/50 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto">
            <div className="relative flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !isTyping) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder={isTyping ? "AI is responding..." : "Explore this drift..."}
                  disabled={isTyping}
                  rows={1}
                  className="
                    w-full bg-dark-elevated/80 backdrop-blur-sm text-text-primary 
                    rounded-2xl px-6 py-4 pr-14
                    border border-dark-border/50
                    focus:outline-none focus:border-accent-violet/50
                    focus:shadow-[0_0_0_2px_rgba(168,85,247,0.2)]
                    placeholder:text-text-muted
                    transition-all duration-300
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
                      text-white shadow-lg shadow-accent-violet/30
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
                      absolute right-3 bottom-3
                      w-10 h-10 rounded-full
                      bg-gradient-to-br from-accent-pink to-accent-violet
                      text-white shadow-lg shadow-accent-violet/30
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
      </div>
    </div>
  )
}