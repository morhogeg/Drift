import type { EntityID, MessageID, EntityNavigationState } from '../../types/entities'
import { getAllMentions } from './indexer'

const navState: Record<EntityID, EntityNavigationState> = {}

function ensure(entityId: EntityID): EntityNavigationState {
  if (!navState[entityId]) navState[entityId] = { backStack: [], forwardStack: [] }
  return navState[entityId]
}

export function beginEntityJump(entityId: EntityID, originMessageId: MessageID): void {
  const st = ensure(entityId)
  if (!st.originMessageId) st.originMessageId = originMessageId
  st.forwardStack = []
}

export function jumpToPrior(entityId: EntityID, currentMessageId: MessageID): MessageID | null {
  const st = ensure(entityId)
  const mentions = getAllMentions(entityId)
  // Find nearest prior mention strictly before current
  const prior = [...mentions]
    .filter(m => m.messageId < currentMessageId)
    .sort((a, b) => (a.messageId < b.messageId ? 1 : -1))[0]
  if (!prior) return null
  st.backStack.push(currentMessageId)
  return prior.messageId
}

export function jumpForward(entityId: EntityID): MessageID | null {
  const st = ensure(entityId)
  if (!st.forwardStack.length) return null
  return st.forwardStack.pop() || null
}

export function pushForward(entityId: EntityID, messageId: MessageID): void {
  const st = ensure(entityId)
  st.forwardStack.push(messageId)
}

export function resetNavigation(entityId: EntityID): void {
  navState[entityId] = { backStack: [], forwardStack: [] }
}

export function getNavigationState(entityId: EntityID): EntityNavigationState {
  return ensure(entityId)
}

