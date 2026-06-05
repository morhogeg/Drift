import type { MutableRefObject } from 'react'
import { useChatStore } from '@/store/chatStore'
import { useDriftStore } from '@/store/driftStore'
import { haptics } from '@/lib/haptics'
import type { Message, DriftContext } from '@/types/chat'

/** The minimal snapshot kept of the most recently closed drift, so it can be reopened. */
export interface LastDrift {
  driftChatId: string
  selectedText: string
  parentChatId: string
  sourceMessageId: string
}

interface DriftActionDeps {
  /** The most recently closed drift (null if none) — reopened by reopenLastDrift. */
  lastDrift: LastDrift | null
  /** Switch the active main chat (App-owned; used when a drift's parent differs). */
  switchChat: (chatId: string) => void
  /**
   * Rebuild a drift's cached content (messages or Connect cards/answers +
   * templateType) so reopening never re-fetches an already-explored drift.
   */
  resolveDriftRestore: (
    driftChatId: string,
    sourceMessageId?: string,
    selectedText?: string,
    parentMessages?: Message[],
  ) => {
    existingMessages: Message[]
    templateType: DriftContext['templateType']
    connectCards?: string[]
    connectAnswers?: Record<string, Message[]>
  }
  /** Live Connect state tracker shared with DriftPanel; reset on every (re)open. */
  connectStateRef: MutableRefObject<{ question: string | null; cards: string[] | null }>
}

/**
 * Lower-risk drift navigation + undo actions extracted from App: reopening the
 * last drift, breadcrumb navigation, and undoing a push-to-main / save-as-chat.
 * Reads chat/drift state from the stores directly; the handful of App-owned
 * pieces (lastDrift, switchChat, resolveDriftRestore, connectStateRef) are
 * passed in. (The larger handleStartDrift / push / close handlers stay in App
 * for now — they'll move here in a follow-up.)
 */
export function useDriftActions({
  lastDrift,
  switchChat,
  resolveDriftRestore,
  connectStateRef,
}: DriftActionDeps) {
  const chatStore = useChatStore()
  const driftStore = useDriftStore()
  const messages = chatStore.messages
  const activeChatId = chatStore.activeChatId
  const chatHistory = chatStore.chatHistory

  const reopenLastDrift = () => {
    if (!lastDrift) return
    haptics.impact('medium')
    const { driftChatId, selectedText, parentChatId, sourceMessageId } = lastDrift

    if (parentChatId && parentChatId !== activeChatId) {
      switchChat(parentChatId)
    }

    const parentMessages = chatHistory.find(c => c.id === parentChatId)?.messages ?? messages
    const msgIdx = sourceMessageId ? parentMessages.findIndex(m => m.id === sourceMessageId) : -1

    // Restore cached content (regular messages OR Connect cards/answers + the
    // correct templateType) so the panel never re-fetches an explored drift.
    const restore = resolveDriftRestore(driftChatId, sourceMessageId, selectedText, parentMessages)

    connectStateRef.current = { question: null, cards: null }
    driftStore.openDrift({
      selectedText,
      sourceMessageId,
      contextMessages: msgIdx >= 0 ? parentMessages.slice(0, msgIdx + 1) : [],
      highlightMessageId: sourceMessageId || undefined,
      driftChatId,
      existingMessages: restore.existingMessages,
      templateType: restore.templateType,
      connectCards: restore.connectCards,
      connectAnswers: restore.connectAnswers,
      ancestry: [{
        isMainChat: true,
        label: chatHistory.find(c => c.id === parentChatId)?.title || 'Chat',
        selectedText: '',
        sourceMessageId: '',
        contextMessages: [],
      }],
    })
  }

  const handleNavigateToBreadcrumb = (index: number) => {
    const { ancestry } = driftStore.driftContext
    if (!ancestry || index >= ancestry.length) return

    if (index === 0) {
      // Navigate to main chat — close the drift panel (temp messages already
      // synced to driftStore via onMessagesChange, so no data loss)
      driftStore.closeDrift()
      return
    }

    // Navigate to an ancestor drift
    const entry = ancestry[index]
    if (!entry.driftChatId) return

    const existingMsgs =
      driftStore.getTempConversation(entry.driftChatId) ??
      (chatHistory.find(c => c.id === entry.driftChatId)?.messages ?? [])

    // Reset connect tracker — the restored drift will fire onConnectStateChange to update it
    connectStateRef.current = { question: null, cards: null }

    driftStore.openDrift({
      selectedText: entry.selectedText,
      sourceMessageId: entry.sourceMessageId,
      contextMessages: entry.contextMessages,
      driftChatId: entry.driftChatId,
      existingMessages: existingMsgs,
      ancestry: ancestry.slice(0, index),
      templateType: entry.templateType,
      connectQuestion: entry.connectQuestion,
      connectCards: entry.connectCards,
    })
  }

  const handleUndoPushToMain = (sourceMessageId: string) => {
    const updatedMessages = messages.filter(msg =>
      !msg.isDriftPush || msg.driftPushMetadata?.sourceMessageId !== sourceMessageId
    )
    chatStore.setMessages(updatedMessages)
  }

  const handleUndoSaveAsChat = (chatId: string) => {
    chatStore.deleteChat(chatId)
    const updatedMessages = messages.map(msg => {
      if (msg.hasDrift && msg.driftInfos?.some(d => d.driftChatId === chatId)) {
        const remainingDrifts = msg.driftInfos.filter(d => d.driftChatId !== chatId)
        if (remainingDrifts.length === 0) {
          const { driftInfos, hasDrift, ...restMsg } = msg
          return restMsg
        } else {
          return { ...msg, driftInfos: remainingDrifts }
        }
      }
      return msg
    })
    chatStore.setMessages(updatedMessages)
  }

  return {
    reopenLastDrift,
    handleNavigateToBreadcrumb,
    handleUndoPushToMain,
    handleUndoSaveAsChat,
  }
}
