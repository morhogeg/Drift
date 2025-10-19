export type MessageID = string
export type EntityID = string

export interface ChatMessage {
  id: MessageID
  authorType: 'user' | 'assistant' | 'system'
  createdAt: string
  text: string
}

export type EntityType = 'person' | 'book' | 'work' | 'org' | 'law' | 'case' | 'topic' | 'other'

export interface EntityCandidate {
  surface: string
  start: number
  end: number
  type: EntityType
  messageId: MessageID
  confidence: number // 0..1
}

export interface CanonicalEntity {
  id: EntityID
  name: string
  altNames: string[]
  type: EntityType
}

export interface Mention {
  entityId: EntityID
  messageId: MessageID
  surface: string
  start: number
  end: number
  createdAt: string
  snippet: string
}

export interface ConversationEntityIndex {
  entities: Record<EntityID, CanonicalEntity>
  mentionsByEntity: Record<EntityID, Mention[]>
  mentionsByMessage: Record<MessageID, Mention[]>
}

export interface EntityNavigationState {
  originMessageId?: MessageID
  backStack: MessageID[]
  forwardStack: MessageID[]
}

export interface ContextFeaturesConfig {
  contextLinks: 'off' | 'inline-only' | 'inline+hover' | 'full'
}

