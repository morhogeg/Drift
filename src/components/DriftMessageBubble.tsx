/**
 * Memoized drift message bubble — prevents re-renders when the parent
 * DriftPanel updates state that doesn't affect this specific message.
 *
 * Equality check: only re-render when the message text, saved status,
 * hovered state, or handler identity changes.
 */
import { memo } from 'react'
import { ArrowLeft, Bookmark } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getTextDirection, getRTLClassName } from '../utils/rtl'

interface DriftMessage {
  id: string
  text: string
  isUser: boolean
  modelTag?: string
}

interface DriftMessageBubbleProps {
  message: DriftMessage
  isSaved: boolean
  isHovered: boolean
  onPushSingle: (msg: DriftMessage) => void
  onToggleSave: (msg: DriftMessage) => void
  onMouseEnter: (id: string) => void
  onMouseLeave: () => void
}

function DriftMessageBubbleInner({
  message,
  isSaved,
  isHovered,
  onPushSingle,
  onToggleSave,
  onMouseEnter,
  onMouseLeave,
}: DriftMessageBubbleProps) {
  const msg = message

  return (
    <div
      className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'} group`}
      onMouseEnter={() => onMouseEnter(msg.id)}
      onMouseLeave={onMouseLeave}
    >
      <div className="relative max-w-[85%]" data-drift-message-id={msg.id}>
        <div
          className={`relative rounded-2xl ${
            msg.isUser
              ? 'px-3.5 py-2 bg-gradient-to-br from-accent-pink to-accent-violet text-white'
              : 'px-3.5 pt-6 pb-2 bg-dark-bubble border border-dark-border/50 text-text-secondary'
          }`}
        >
          {/* Overlay header for assistant messages */}
          {!msg.isUser && (
            <>
              {msg.modelTag && (
                <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-dark-elevated/70 border border-dark-border/50 text-[10px] text-text-muted">
                  {msg.modelTag}
                </span>
              )}
              <div
                className={`absolute top-1 right-1 flex items-center gap-1.5 transition-opacity duration-150 ${
                  isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <button
                  onClick={() => onPushSingle(msg)}
                  className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-dark-elevated/70 border border-dark-border/50 hover:border-accent-pink/60 hover:bg-accent-pink/10 transition-all duration-150"
                  title="Push this message to main chat"
                >
                  <ArrowLeft className="w-3 h-3 text-text-muted" />
                </button>
                <button
                  onClick={() => onToggleSave(msg)}
                  className={`w-6 h-6 inline-flex items-center justify-center rounded-full bg-dark-elevated/70 border ${
                    isSaved ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-dark-border/50'
                  } hover:border-cyan-500/60 hover:bg-cyan-500/10 transition-all duration-150`}
                  title={isSaved ? 'Remove from snippets' : 'Save to snippets'}
                >
                  <Bookmark
                    className={`w-3 h-3 ${isSaved ? 'text-cyan-300 fill-cyan-300' : 'text-text-muted'}`}
                  />
                </button>
              </div>
            </>
          )}

          {/* User message content */}
          {msg.isUser ? (
            <>
              <div className="flex items-center justify-end mb-1">
                <button
                  onClick={() => onToggleSave(msg)}
                  className={`w-7 h-7 inline-flex items-center justify-center rounded-full bg-dark-elevated/70 border ${
                    isSaved ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-dark-border/50'
                  } hover:border-cyan-500/60 hover:bg-cyan-500/10 transition-all duration-150`}
                  title={isSaved ? 'Remove from snippets' : 'Save to snippets'}
                >
                  <Bookmark
                    className={`w-3.5 h-3.5 ${isSaved ? 'text-cyan-300 fill-cyan-300' : 'text-text-muted'}`}
                  />
                </button>
              </div>
              <p
                className={`text-[13px] leading-6 ${getRTLClassName(msg.text)}`}
                dir={getTextDirection(msg.text)}
              >
                {msg.text}
              </p>
            </>
          ) : (
            /* Assistant message content */
            <div className={getRTLClassName(msg.text)} dir={getTextDirection(msg.text)}>
              <ReactMarkdown
                className="text-[13px] leading-6 prose prose-sm prose-invert max-w-none
                  prose-headings:text-text-primary prose-headings:font-semibold prose-headings:mb-2 prose-headings:mt-3
                  prose-p:text-text-secondary prose-p:mb-2
                  prose-strong:text-text-primary prose-strong:font-semibold
                  prose-ul:my-2 prose-ul:space-y-1
                  prose-li:text-text-secondary prose-li:ml-4
                  prose-code:text-accent-violet prose-code:bg-dark-bg/50
                  prose-pre:bg-dark-bg prose-pre:border prose-pre:border-dark-border/50 prose-pre:rounded-lg prose-pre:p-3
                  prose-blockquote:border-l-accent-violet prose-blockquote:text-text-muted
                  prose-table:w-full prose-table:border-collapse prose-table:overflow-hidden prose-table:rounded-lg
                  prose-thead:bg-dark-elevated/50 prose-thead:border-b prose-thead:border-dark-border/50
                  prose-th:text-text-primary prose-th:font-semibold prose-th:px-2 prose-th:py-1.5 prose-th:text-left prose-th:text-xs
                  prose-td:text-text-secondary prose-td:px-2 prose-td:py-1.5 prose-td:border-b prose-td:border-dark-border/30 prose-td:text-xs
                  prose-tr:hover:bg-dark-elevated/20"
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-2">{children}</p>,
                  br: () => <br />,
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-3">
                      <table className="min-w-full text-xs">{children}</table>
                    </div>
                  ),
                }}
              >
                {msg.text.replace(/<br>/g, '\n').replace(/<br\/>/g, '\n')}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const DriftMessageBubble = memo(
  DriftMessageBubbleInner,
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.text === next.message.text &&
    prev.isSaved === next.isSaved &&
    prev.isHovered === next.isHovered &&
    prev.onPushSingle === next.onPushSingle &&
    prev.onToggleSave === next.onToggleSave &&
    prev.onMouseEnter === next.onMouseEnter &&
    prev.onMouseLeave === next.onMouseLeave,
)
