import { useState, useRef, useEffect } from 'react'
import { X, Save, Send, Sparkles, Square } from 'lucide-react'
import { sendMessageToOllama, type ChatMessage as OllamaMessage } from '../services/ollama'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
}

export default function DriftPanel({
  isOpen,
  onClose,
  selectedText,
  contextMessages,
  sourceMessageId,
  parentChatId,
  onSaveAsChat
}: DriftPanelProps) {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Initialize Drift with context and system message
  useEffect(() => {
    if (isOpen && contextMessages.length > 0) {
      // Copy context messages
      const driftMessages = [...contextMessages]
      
      // Add system context message
      const systemMessage: Message = {
        id: 'drift-system-' + Date.now(),
        text: `🌀 Drift started from: "${selectedText}"\n\nLet's explore this part more deeply - expand or clarify this specific concept.`,
        isUser: false,
        timestamp: new Date()
      }
      
      setMessages([...driftMessages, systemMessage])
    }
  }, [isOpen, contextMessages, selectedText])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async () => {
    if (message.trim()) {
      const newMessage: Message = {
        id: 'drift-' + Date.now().toString(),
        text: message,
        isUser: true,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, newMessage])
      setMessage('')
      setIsTyping(true)
      
      // Convert messages to Ollama format with special Drift context
      const ollamaMessages: OllamaMessage[] = [
        {
          role: 'system',
          content: `The user wants to explore this part more deeply: "${selectedText}" — expand or clarify. Provide focused, detailed exploration of this specific topic.`
        },
        ...messages.map(msg => ({
          role: msg.isUser ? 'user' as const : 'assistant' as const,
          content: msg.text
        })),
        { role: 'user' as const, content: message }
      ]
      
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
        
        // Stream the response
        await sendMessageToOllama(
          ollamaMessages, 
          (chunk) => {
            accumulatedResponse += chunk
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
      } catch (error) {
        const errorMessage = "Failed to get response. Please check your connection."
        const aiResponse: Message = {
          id: 'drift-error-' + Date.now().toString(),
          text: errorMessage,
          isUser: false,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, aiResponse])
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
    const title = `Drift: ${selectedText.slice(0, 30)}${selectedText.length > 30 ? '...' : ''}`
    const metadata = {
      isDrift: true,
      parentChatId,
      sourceMessageId,
      selectedText,
      createdAt: new Date()
    }
    onSaveAsChat(messages, title, metadata)
    onClose()
  }

  return (
    <div className={`
      fixed top-0 right-0 h-full z-30
      transition-all duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : 'translate-x-full'}
    `}>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-sm"
          onClick={onClose}
        />
      )}
      
      {/* Panel */}
      <div className={`
        relative w-[500px] h-full bg-dark-surface/95 backdrop-blur-md
        border-l border-accent-violet/30 shadow-2xl
        flex flex-col overflow-hidden
        ${isOpen ? 'shadow-[0_0_50px_rgba(168,85,247,0.2)]' : ''}
      `}>
        {/* Header */}
        <div className="p-4 border-b border-dark-border/30 bg-dark-elevated/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-accent-pink/20 to-accent-violet/20 border border-accent-violet/30">
                <span className="text-lg">🌀</span>
              </div>
              <h2 className="text-lg font-semibold text-text-primary">Drift Mode</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-dark-elevated rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-text-muted" />
            </button>
          </div>
          
          {/* Selected Text Context */}
          <div className="p-3 bg-dark-bg/50 rounded-lg border border-accent-violet/20">
            <p className="text-sm text-accent-violet font-medium mb-1">Exploring:</p>
            <p className="text-sm text-text-secondary italic">"{selectedText}"</p>
          </div>
          
          {/* Save Button */}
          <button
            onClick={handleSaveAsChat}
            className="mt-3 w-full flex items-center justify-center gap-2
              bg-dark-elevated/50 border border-accent-violet/30
              text-text-primary rounded-lg px-3 py-2
              hover:bg-accent-violet/10 hover:border-accent-violet/50
              transition-all duration-200"
          >
            <Save className="w-4 h-4" />
            <span className="text-sm">Save Drift as New Chat</span>
          </button>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            msg.text ? (
              <div
                key={msg.id}
                className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`
                    max-w-[85%] rounded-2xl px-4 py-2.5
                    ${msg.isUser 
                      ? 'bg-gradient-to-br from-accent-pink to-accent-violet text-white' 
                      : msg.id.includes('system') 
                        ? 'bg-gradient-to-br from-accent-violet/10 to-accent-pink/10 border border-accent-violet/30 text-text-secondary'
                        : 'bg-dark-bubble border border-dark-border/50 text-text-secondary'
                    }
                  `}
                >
                  {msg.id.includes('system') ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
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
        
        {/* Input */}
        <div className="p-4 border-t border-dark-border/30 bg-dark-elevated/30">
          <div className="relative flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && !isTyping && sendMessage()}
              placeholder={isTyping ? "AI is responding..." : "Explore this drift..."}
              disabled={isTyping}
              className="
                flex-1 bg-dark-bg/70 text-text-primary 
                rounded-full px-4 py-3 pr-12
                border border-accent-violet/30
                focus:outline-none focus:border-accent-violet/50
                focus:shadow-[0_0_0_2px_rgba(168,85,247,0.2)]
                placeholder:text-text-muted
                transition-all duration-200
                disabled:opacity-70
              "
            />
            {isTyping ? (
              <button
                onClick={stopGeneration}
                className="
                  absolute right-2 top-1/2 -translate-y-1/2
                  w-8 h-8 rounded-full
                  bg-gradient-to-br from-accent-pink to-accent-violet
                  text-white shadow-lg shadow-accent-violet/30
                  flex items-center justify-center
                  hover:scale-105 active:scale-95
                  transition-all duration-200
                "
                title="Stop generating"
              >
                <Square className="w-3.5 h-3.5" fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={sendMessage}
                disabled={!message.trim()}
                className="
                  absolute right-2 top-1/2 -translate-y-1/2
                  w-8 h-8 rounded-full
                  bg-gradient-to-br from-accent-pink to-accent-violet
                  text-white shadow-lg shadow-accent-violet/30
                  flex items-center justify-center
                  hover:scale-105 active:scale-95
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-200
                "
              >
                <Send className="w-3.5 h-3.5 ml-0.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}