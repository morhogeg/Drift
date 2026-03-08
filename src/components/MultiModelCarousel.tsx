import { useRef, useState, useCallback, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from '../types/chat'

interface MultiModelCarouselProps {
  messages: Message[]
  broadcastGroupId: string
  activeBroadcastGroupId: string | null
  onContinueWith: (modelTag: string, messageId: string) => void
  onActiveCardChange: (modelTag: string) => void
}

const MODEL_DOT_COLORS = ['bg-accent-violet', 'bg-sky-400', 'bg-emerald-400']
const MODEL_BORDER_COLORS = ['border-accent-violet/20', 'border-sky-500/20', 'border-emerald-500/20']

export default function MultiModelCarousel({
  messages,
  broadcastGroupId,
  activeBroadcastGroupId,
  onContinueWith,
  onActiveCardChange,
}: MultiModelCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const lastReportedIndex = useRef(-1)

  // Report initial active model
  useEffect(() => {
    if (messages[0]?.modelTag) {
      onActiveCardChange(messages[0].modelTag)
      lastReportedIndex.current = 0
    }
  }, [broadcastGroupId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || !messages.length) return
    const cardWidth = el.clientWidth
    if (cardWidth === 0) return
    const newIndex = Math.round(el.scrollLeft / cardWidth)
    const clamped = Math.min(Math.max(newIndex, 0), messages.length - 1)
    setCurrentIndex(clamped)
    if (clamped !== lastReportedIndex.current) {
      lastReportedIndex.current = clamped
      const msg = messages[clamped]
      if (msg?.modelTag) onActiveCardChange(msg.modelTag)
    }
  }, [messages, onActiveCardChange])

  const scrollTo = (index: number) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="w-full">
      {/* Horizontal scroll-snap container */}
      <div
        ref={scrollRef}
        className="flex"
        style={{
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        } as React.CSSProperties}
        onScroll={handleScroll}
      >
        {messages.map((msg, i) => (
          <div
            key={msg.id}
            style={{ minWidth: '100%', scrollSnapAlign: 'center' }}
            className="flex-shrink-0"
          >
            <div
              className={`ai-message border ${MODEL_BORDER_COLORS[i % MODEL_BORDER_COLORS.length]} rounded-2xl px-5 pt-8 pb-4 relative select-text bg-dark-bubble`}
              data-message-id={msg.id}
            >
              {/* Model label top-left */}
              <div className="absolute top-3 left-4 flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${MODEL_DOT_COLORS[i % MODEL_DOT_COLORS.length]}`} />
                <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider">
                  {msg.modelTag}
                </span>
              </div>

              {/* Continue button (only on active broadcast, only when response is ready) */}
              {broadcastGroupId === activeBroadcastGroupId && msg.text && msg.text.length > 0 && (
                <button
                  onClick={() => onContinueWith(msg.modelTag ?? '', msg.id)}
                  className="absolute top-2 right-3 px-2.5 py-1 rounded-full bg-dark-elevated border border-accent-violet/40 text-[10px] font-medium text-accent-violet active:opacity-70 transition-opacity"
                >
                  Continue →
                </button>
              )}

              {/* Response content */}
              {msg.text && msg.text.length > 0 ? (
                <div className="prose prose-invert prose-sm max-w-none text-[15px] leading-7">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.text.replace(/```([\s\S]*?)```/g, (_m, p1) => `\n\n\`\`\`\n${p1}\n\`\`\`\n\n`)}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="flex gap-1 py-2">
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination dots */}
      {messages.length > 1 && (
        <div className="flex justify-center items-center gap-2 mt-3">
          {messages.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              className={`rounded-full transition-all duration-200 ${
                i === currentIndex
                  ? 'w-5 h-1.5 bg-accent-violet'
                  : 'w-1.5 h-1.5 bg-white/15 active:bg-white/30'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
