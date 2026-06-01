import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Search, X, GitBranch, CornerDownLeft } from 'lucide-react'
import type { ChatSession } from '@/types/chat'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
  chatHistory: ChatSession[]
  onNavigate: (chatId: string, messageId: string) => void
}

interface Hit {
  chatId: string
  chatTitle: string
  isDrift: boolean
  term?: string
  messageId: string
  isUser: boolean
  snippet: string
  matchStart: number
  matchLen: number
  score: number
  ts: number
}

const MAX_RESULTS = 50
const SNIPPET_PAD = 48

function buildSnippet(text: string, idx: number, qlen: number): { snippet: string; matchStart: number } {
  const start = Math.max(0, idx - SNIPPET_PAD)
  const end = Math.min(text.length, idx + qlen + SNIPPET_PAD)
  let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
  const prefix = start > 0 ? '… ' : ''
  const suffix = end < text.length ? ' …' : ''
  // Re-find the match inside the trimmed snippet for accurate highlight bounds.
  const rel = snippet.toLowerCase().indexOf(text.slice(idx, idx + qlen).toLowerCase())
  snippet = prefix + snippet + suffix
  return { snippet, matchStart: rel >= 0 ? rel + prefix.length : 0 }
}

export default function SearchModal({ isOpen, onClose, chatHistory, onNavigate }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setDebounced('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 120)
    return () => clearTimeout(id)
  }, [query])

  const hits = useMemo<Hit[]>(() => {
    const q = debounced.toLowerCase()
    if (q.length < 2) return []
    const out: Hit[] = []
    for (const chat of chatHistory) {
      const isDrift = !!chat.metadata?.isDrift
      const term = chat.metadata?.selectedText
      const titleMatch = (chat.title || '').toLowerCase().includes(q)
      const ts = chat.createdAt ? new Date(chat.createdAt).getTime() : 0
      for (const m of chat.messages ?? []) {
        if (!m.text) continue
        const idx = m.text.toLowerCase().indexOf(q)
        if (idx === -1) continue
        const { snippet, matchStart } = buildSnippet(m.text, idx, q.length)
        out.push({
          chatId: chat.id,
          chatTitle: chat.title || 'Untitled',
          isDrift,
          term,
          messageId: m.id,
          isUser: m.isUser,
          snippet,
          matchStart,
          matchLen: q.length,
          // Title matches and recent chats float up; AI answers slightly over questions.
          score: (titleMatch ? 1000 : 0) + (m.isUser ? 0 : 20) + ts / 1e10,
          ts,
        })
      }
    }
    out.sort((a, b) => b.score - a.score)
    return out.slice(0, MAX_RESULTS)
  }, [debounced, chatHistory])

  useEffect(() => { setActive(0) }, [debounced])

  const choose = useCallback((hit: Hit) => {
    onNavigate(hit.chatId, hit.messageId)
  }, [onNavigate])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, hits.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
      else if (e.key === 'Enter') { e.preventDefault(); if (hits[active]) choose(hits[active]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, hits, active, choose, onClose])

  // Keep the active row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-hit-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Palette */}
      <div className="relative w-full max-w-xl rounded-2xl bg-dark-surface border border-dark-border/70 shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden animate-[searchIn_0.2s_cubic-bezier(0.16,1,0.3,1)]">
        <style>{`@keyframes searchIn{from{opacity:0;transform:translateY(-8px) scale(0.98)}to{opacity:1;transform:none}}`}</style>

        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-dark-border/50">
          <Search className="w-[18px] h-[18px] text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every conversation and drift…"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-[15px] text-text-primary placeholder:text-text-muted/50 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
            aria-label="Close search"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[56vh] overflow-y-auto py-1.5">
          {debounced.length < 2 ? (
            <p className="px-4 py-8 text-center text-[13px] text-text-muted">
              Type at least 2 characters to search across all your chats and drifts.
            </p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-text-muted">
              No matches for “<span className="text-text-secondary">{debounced}</span>”.
            </p>
          ) : (
            hits.map((hit, i) => (
              <button
                key={`${hit.chatId}-${hit.messageId}-${i}`}
                data-hit-index={i}
                onClick={() => choose(hit)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-start gap-3 px-4 py-2.5 min-h-[52px] text-left transition-colors ${
                  i === active ? 'bg-accent-violet/[0.12]' : 'hover:bg-dark-elevated/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {hit.isDrift && <GitBranch className="w-3 h-3 text-accent-violet/70 flex-shrink-0" />}
                    <span className={`text-[12px] font-medium truncate ${hit.isDrift ? 'text-accent-violet/85' : 'text-text-secondary'}`}>
                      {hit.isDrift && hit.term ? hit.term : hit.chatTitle}
                    </span>
                    <span className="text-[10px] text-text-muted/60 flex-shrink-0">· {hit.isUser ? 'you' : 'AI'}</span>
                  </div>
                  <p className="text-[12.5px] text-text-muted leading-snug line-clamp-2">
                    {hit.snippet.slice(0, hit.matchStart)}
                    <mark className="bg-accent-violet/25 text-text-primary rounded-[3px] px-0.5">
                      {hit.snippet.slice(hit.matchStart, hit.matchStart + hit.matchLen)}
                    </mark>
                    {hit.snippet.slice(hit.matchStart + hit.matchLen)}
                  </p>
                </div>
                {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-text-muted/50 flex-shrink-0 mt-1" />}
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        {hits.length > 0 && (
          <div className="px-4 py-2 border-t border-dark-border/50 flex items-center gap-3 text-[10.5px] text-text-muted/70">
            <span><kbd className="font-sans">↑↓</kbd> navigate</span>
            <span><kbd className="font-sans">↵</kbd> open</span>
            <span><kbd className="font-sans">esc</kbd> close</span>
            <span className="ml-auto tabular-nums">{hits.length}{hits.length === MAX_RESULTS ? '+' : ''} result{hits.length === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
