/**
 * Shared domain types for chat sessions and messages.
 * Extracted here so they can be imported by stores and services
 * without circular dependency issues.
 */

export type Provider = 'openrouter' | 'ollama'

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
  }
}

export interface DriftContext {
  selectedText: string
  sourceMessageId: string
  contextMessages: Message[]
  highlightMessageId?: string
  driftChatId?: string
  existingMessages?: Message[]
}
