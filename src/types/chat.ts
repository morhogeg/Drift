/**
 * Shared domain types for chat sessions and messages.
 * Extracted here so they can be imported by stores and services
 * without circular dependency issues.
 */

export type Provider = 'openrouter' | 'ollama' | 'gemini'

export interface Target {
  provider: Provider
  key: string
  label: string
}

export interface Message {
  id: string
  text: string
  isUser: boolean
  /** When pushing drift messages back to main, remember the original role. */
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
    templateType?: 'simplify' | 'research' | 'connect' | 'challenge'
    connectCards?: string[]
    /** Cached per-question conversations for Connect chips — keyed by question text */
    connectAnswers?: Record<string, Message[]>
  }>
  /** Marks messages that were pushed from drift. */
  isDriftPush?: boolean
  /** Metadata for pushed drift messages. */
  driftPushMetadata?: {
    selectedText: string
    sourceMessageId: string
    parentChatId: string
    wasSavedAsChat?: boolean
    userQuestion?: string
    driftChatId?: string
    originSide?: 'left' | 'right'
    originModelTag?: string
  }
  /** For single message pushes, hides context messages. */
  isHiddenContext?: boolean
  /** Reference to original drift message id. */
  originalDriftId?: string
  /** Phrases the AI suggests as worth exploring deeper (populated asynchronously after streaming). */
  suggestedHighlights?: string[]
  /** Marks a message that represents a failed request, rendered as a recoverable
   *  inline error (with retry) rather than a normal assistant answer. */
  isError?: boolean
}

export interface ChatSession {
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
    /** Set on a forked conversation — the chat it was forked from. */
    forkedFrom?: string
    /** The message id the fork was taken at. */
    forkedAtMessageId?: string
  }
}

/** One step in the breadcrumb trail leading to the current drift. */
export interface AncestryEntry {
  /** Human-readable label (main chat title, or `"term"` for drifts). */
  label: string
  /** True only for the root main-chat entry. */
  isMainChat?: boolean
  /** The drifted term (empty string for the main-chat root). */
  selectedText: string
  /** Source message the drift was opened from (empty for root). */
  sourceMessageId: string
  /** Context messages passed to the drift when it was opened (empty for root). */
  contextMessages: Message[]
  /** Drift chat ID — undefined for the root main-chat entry. */
  driftChatId?: string
  /** Template type in use when this drift was active (preserved for navigation restore). */
  templateType?: 'simplify' | 'research' | 'connect' | 'challenge'
  /** Active Connect question when the user navigated away — used to restore chat mode. */
  connectQuestion?: string | null
  /** Chips that were visible in Connect mode — avoids re-fetching on navigate back. */
  connectCards?: string[]
}

export interface DriftContext {
  selectedText: string
  sourceMessageId: string
  contextMessages: Message[]
  highlightMessageId?: string
  driftChatId?: string
  existingMessages?: Message[]
  /** Breadcrumb trail of ancestor contexts, from root (main chat) to parent drift. */
  ancestry?: AncestryEntry[]
  /** Optional template type for one-tap workflow drifts. */
  templateType?: 'simplify' | 'research' | 'connect' | 'challenge'
  /** Pre-loaded suggestion chips to show in the drift panel (bypasses AI fetch). */
  initialSuggestions?: string[]
  /** Active Connect question to restore when re-opening a Connect drift. */
  connectQuestion?: string | null
  /** Connect chips to restore when re-opening a Connect drift in chips view. */
  connectCards?: string[]
  /** Cached per-question conversations to restore — avoids re-fetching on re-open. */
  connectAnswers?: Record<string, Message[]>
}
