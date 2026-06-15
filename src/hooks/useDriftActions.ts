import type { MutableRefObject } from 'react'
import { useChatStore } from '@/store/chatStore'
import { useDriftStore } from '@/store/driftStore'
import { haptics } from '@/lib/haptics'
import { toast } from '@/hooks/useToast'
import type { Message, ChatSession, DriftContext, LensKey } from '@/types/chat'

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
  /** Main-thread scroll offset, saved on drift-open and restored on drift-close. */
  mainScrollPosition: MutableRefObject<number>
  /** Record the just-closed drift so the header can offer one-tap reopen. */
  setLastDrift: (drift: LastDrift | null) => void
  /** Arm the one-time "settle-in" arrival animation for a freshly-promoted drift. */
  setJustPromotedChatId: (id: string | null) => void
  /** Timer backing the promoted-arrival animation (cleared/reset on each push). */
  justPromotedTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  /** Strip markdown to a plain-text preview for chat `lastMessage` fields. */
  stripMarkdown: (text: string) => string
}

/**
 * The drift action layer extracted from App: navigation + undo (reopen last,
 * breadcrumb, undo push / undo save-as-chat) plus the signature drift lifecycle
 * handlers (start, close, push-to-main, save-as-chat, save-pushed-as-chat).
 * Reads chat/drift state from the stores directly; the App-owned pieces
 * (lastDrift, switchChat, resolveDriftRestore, the refs/setters and
 * stripMarkdown) are passed in so behavior stays identical to the inline App
 * implementation.
 */
export function useDriftActions({
  lastDrift,
  switchChat,
  resolveDriftRestore,
  connectStateRef,
  mainScrollPosition,
  setLastDrift,
  setJustPromotedChatId,
  justPromotedTimerRef,
  stripMarkdown,
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

  // ── Drift lifecycle (slice 2): start / close / push / save ──────────────────
  const handleStartDrift = (selectedText: string, messageId: string, existingDriftChatId?: string, reconstructedMessages?: Message[], templateType?: DriftContext['templateType'], initialSuggestions?: string[], restoredConnectCards?: string[], restoredConnectAnswers?: Record<string, Message[]>) => {
    // Haptic weight communicates significance:
    //  • branching deeper (panel already open → a new topic emerges) = the
    //    defining gesture, a heavy "you went somewhere" thunk.
    //  • opening a fresh space from the main thread = a medium "occasion."
    haptics.impact(driftStore.driftOpen ? 'heavy' : 'medium')

    const chatContainer = document.querySelector('.chat-messages-container')
    if (chatContainer) mainScrollPosition.current = chatContainer.scrollTop

    // Reset connect state tracker for the new drift context
    connectStateRef.current = { question: null, cards: null }

    // ── Nested drift: selection came from within an open drift panel ──────────
    // If the panel is open, look for the source message in the active drift's
    // temp conversation first. If found, record driftInfos THERE (not on the
    // main chat message) so the tree is correctly nested in the Drift Map.
    const activeDriftChatId = driftStore.driftContext?.driftChatId
    if (driftStore.driftOpen && activeDriftChatId) {
      const activeDriftMessages = driftStore.getTempConversation(activeDriftChatId)
      if (activeDriftMessages) {
        const driftSourceMsg =
          activeDriftMessages.find(m => m.id === messageId) ??
          activeDriftMessages.find(m => !m.isUser && m.text?.includes(selectedText))
        if (driftSourceMsg) {
          const existingNested = driftSourceMsg.driftInfos?.find(d => d.selectedText === selectedText)
          const newDriftChatId = existingNested?.driftChatId || existingDriftChatId || `drift-temp-${Date.now()}`
          // Get the messages to persist for the parent drift (with updated driftInfos)
          const msgsToSave = existingNested
            ? activeDriftMessages
            : activeDriftMessages.map(m =>
                m.id === driftSourceMsg.id
                  ? { ...m, hasDrift: true, driftInfos: [...(m.driftInfos || []), { selectedText, driftChatId: newDriftChatId }] }
                  : m
              )
          if (!existingNested) {
            driftStore.saveTempConversation(activeDriftChatId, msgsToSave)
          }
          // Persist parent drift to IndexedDB before replacing context — ensures
          // it survives app restarts and appears correctly in the Drift Map.
          const parentCtx = driftStore.driftContext
          // Determine the correct parent for the current (parent) drift:
          // if it has an ancestor drift, use that; otherwise fall back to main chat.
          const parentCtxAncestry = parentCtx.ancestry ?? []
          const parentDriftAncestor = [...parentCtxAncestry].reverse().find(e => e.driftChatId)
          const parentDriftParentId = parentDriftAncestor?.driftChatId ?? activeChatId
          chatStore.registerDriftSession({
            id: activeDriftChatId,
            title: `"${parentCtx.selectedText}"`,
            messages: msgsToSave as Message[],
            lastMessage: msgsToSave[msgsToSave.length - 1]?.text?.slice(0, 100),
            createdAt: new Date(),
            metadata: {
              isDrift: true,
              parentChatId: parentDriftParentId,
              sourceMessageId: parentCtx.sourceMessageId,
              selectedText: parentCtx.selectedText,
            },
          })
          const msgIdx = activeDriftMessages.findIndex(m => m.id === driftSourceMsg.id)
          const nestedContext = activeDriftMessages.slice(0, msgIdx + 1)
          const existingNestedMessages = reconstructedMessages || driftStore.getTempConversation(newDriftChatId) || []
          // Build breadcrumb ancestry: inherit parent ancestry + add the parent drift as a new entry
          const parentAncestry = parentCtx.ancestry ?? [{
            isMainChat: true,
            label: chatHistory.find(c => c.id === activeChatId)?.title || 'Chat',
            selectedText: '',
            sourceMessageId: '',
            contextMessages: [],
          }]
          driftStore.openDrift({
            selectedText,
            sourceMessageId: driftSourceMsg.id,
            contextMessages: nestedContext,
            highlightMessageId: driftSourceMsg.id,
            driftChatId: newDriftChatId,
            existingMessages: existingNestedMessages,
            templateType,
            initialSuggestions,
            ancestry: [
              ...parentAncestry,
              {
                label: `"${parentCtx.selectedText}"`,
                selectedText: parentCtx.selectedText,
                sourceMessageId: parentCtx.sourceMessageId,
                contextMessages: parentCtx.contextMessages,
                driftChatId: activeDriftChatId,
                templateType: parentCtx.templateType,
                connectQuestion: connectStateRef.current.question,
                connectCards: connectStateRef.current.cards ?? undefined,
              },
            ],
          })
          return
        }
      }
    }

    const currentChat = chatHistory.find(c => c.id === activeChatId)
    let currentMessages = currentChat?.messages || messages
    if (currentMessages.length === 0) currentMessages = messages

    let messageIndex = -1
    let actualMessage: Message | null = null
    for (let i = 0; i < currentMessages.length; i++) {
      const msg = currentMessages[i]
      if (!msg.isUser && msg.text && msg.text.includes(selectedText)) {
        messageIndex = i
        actualMessage = msg
        break
      }
    }

    if (messageIndex === -1) {
      // Preserve existing drift data even if the source message text can't be found
      const fallbackExisting = (reconstructedMessages?.length ? reconstructedMessages : null)
        ?? (existingDriftChatId ? driftStore.getTempConversation(existingDriftChatId) : undefined)
        ?? []
      const cachedFallbackCards = restoredConnectCards
        ?? (existingDriftChatId ? driftStore.getConnectCards(existingDriftChatId) : undefined)
      driftStore.openDrift({
        selectedText,
        sourceMessageId: messageId,
        contextMessages: [],
        driftChatId: existingDriftChatId,
        existingMessages: fallbackExisting,
        templateType,
        initialSuggestions,
        connectCards: cachedFallbackCards?.length ? cachedFallbackCards : undefined,
        connectAnswers: restoredConnectAnswers && Object.keys(restoredConnectAnswers).length > 0 ? restoredConnectAnswers : undefined,
        ancestry: [{
          isMainChat: true,
          label: chatHistory.find(c => c.id === activeChatId)?.title || 'Chat',
          selectedText: '',
          sourceMessageId: '',
          contextMessages: [],
        }],
      })
      return
    }

    const contextMessages = currentMessages.slice(0, messageIndex + 1)

    if (actualMessage) {
      const existingDrift = actualMessage.driftInfos?.find(d => d.selectedText === selectedText)
      const driftChatId = existingDrift?.driftChatId || existingDriftChatId || `drift-temp-${Date.now()}`

      const updatedMessages = currentMessages.map(msg =>
        msg.id === actualMessage!.id
          ? {
              ...msg,
              hasDrift: true,
              driftInfos: existingDrift ? msg.driftInfos : [
                ...(msg.driftInfos || []),
                { selectedText, driftChatId, templateType }
              ]
            }
          : msg
      )
      chatStore.setMessages(updatedMessages)
      chatStore.updateChat(activeChatId, { messages: updatedMessages })
    }

    const finalSourceMessageId = actualMessage?.id || messageId
    // Check actualMessage first, then search all messages as fallback (handles drifts started via Connect chips or other paths)
    const existingDrift = actualMessage?.driftInfos?.find(d => d.selectedText === selectedText)
      ?? currentMessages.flatMap(m => m.driftInfos ?? []).find(d => d.selectedText === selectedText)
    const finalDriftChatId = existingDrift?.driftChatId || existingDriftChatId || `drift-temp-${Date.now()}`

    // Resolve cached content + the effective lens for an ALREADY-explored drift.
    // Caller-supplied values (explicit param / restored cards/answers) win; the
    // resolver fills the gaps (e.g. an inline link that omits templateType for a
    // term first explored as Connect) so we never re-fetch an explored combo.
    const restore = resolveDriftRestore(finalDriftChatId, finalSourceMessageId, selectedText, currentMessages)
    const effectiveTemplateType = templateType ?? existingDrift?.templateType ?? restore.templateType

    const cachedConnectCards = restoredConnectCards
      ?? driftStore.getConnectCards(finalDriftChatId)
      ?? restore.connectCards
    const cachedConnectAnswers = restoredConnectAnswers
      ?? existingDrift?.connectAnswers
      ?? restore.connectAnswers

    // For Connect, existingMessages MUST be [] (prose poisons the card parser).
    const existingMessagesToUse: Message[] = effectiveTemplateType === 'connect'
      ? []
      : ((reconstructedMessages?.length ? reconstructedMessages : null)
        ?? driftStore.getTempConversation(finalDriftChatId)
        ?? [])

    driftStore.openDrift({
      selectedText,
      sourceMessageId: finalSourceMessageId,
      contextMessages,
      highlightMessageId: actualMessage?.id,
      driftChatId: finalDriftChatId,
      existingMessages: existingMessagesToUse,
      templateType: effectiveTemplateType,
      initialSuggestions,
      connectCards: cachedConnectCards?.length ? cachedConnectCards : undefined,
      connectAnswers: cachedConnectAnswers && Object.keys(cachedConnectAnswers).length > 0 ? cachedConnectAnswers : undefined,
      ancestry: [{
        isMainChat: true,
        label: chatHistory.find(c => c.id === activeChatId)?.title || 'Chat',
        selectedText: '',
        sourceMessageId: '',
        contextMessages: [],
      }],
    })
  }

  const handleCloseDrift = (driftMessages?: Message[]) => {
    // Read context before closing (driftContext is stable until next openDrift)
    const { selectedText, sourceMessageId, driftChatId, ancestry } = driftStore.driftContext

    // Remember this drift so the user can reopen it in one tap from the header —
    // only worth offering if there's an actual conversation to return to.
    if (driftChatId && selectedText && driftMessages && driftMessages.length > 0) {
      const rootEntry = ancestry?.[0]
      setLastDrift({
        driftChatId,
        selectedText,
        parentChatId: rootEntry?.isMainChat ? activeChatId : (ancestry?.find(e => e.driftChatId)?.driftChatId ?? activeChatId),
        sourceMessageId: sourceMessageId ?? '',
      })
    }

    driftStore.closeDrift(driftMessages)

    // Auto-persist the drift conversation so it survives app restarts.
    // Creates a ghost ChatSession in chatHistory + IndexedDB if not already there.
    if (driftMessages && driftMessages.length > 0 && driftChatId) {
      // Determine the correct parent: for nested drifts, the parent is the
      // immediately preceding drift in the ancestry chain (the last entry with a
      // driftChatId). For top-level drifts the parent is the main chat (activeChatId).
      const parentAncestry = ancestry ?? []
      const lastDriftAncestor = [...parentAncestry].reverse().find(e => e.driftChatId)
      const correctParentChatId = lastDriftAncestor?.driftChatId ?? activeChatId

      chatStore.registerDriftSession({
        id: driftChatId,
        title: `"${selectedText}"`,
        messages: driftMessages as Message[],
        lastMessage: driftMessages[driftMessages.length - 1]?.text?.slice(0, 100),
        createdAt: new Date(),
        metadata: {
          isDrift: true,
          parentChatId: correctParentChatId,
          sourceMessageId,
          selectedText,
        },
      })
    }

    setTimeout(() => {
      const chatContainer = document.querySelector('.chat-messages-container')
      if (chatContainer) chatContainer.scrollTop = mainScrollPosition.current
    }, 150)
  }

  const handleSaveDriftAsChat = (driftMessages: Message[], title: string, metadata: any) => {
    const newChatId = metadata.id || 'drift-' + Date.now().toString()
    const newChat: ChatSession = {
      id: newChatId,
      title,
      messages: driftMessages,
      lastMessage: stripMarkdown(driftMessages[driftMessages.length - 1]?.text || 'Drift conversation'),
      createdAt: new Date(),
      metadata: {
        ...metadata,
        parentChatId: activeChatId,
        id: newChatId
      }
    }
    // Insert the new chat at the top of history using the store's setState
    useChatStore.setState(state => ({
      chatHistory: [newChat, ...state.chatHistory.filter(c => c.id !== newChatId)]
    }))

    // The drift is now a durable chat — drop its unsaved temp record(s).
    driftStore.clearTempConversation(newChatId)
    messages.forEach(msg => {
      msg.driftInfos?.forEach(d => {
        if (d.selectedText === metadata.selectedText && d.driftChatId.startsWith('drift-temp-')) {
          driftStore.clearTempConversation(d.driftChatId)
        }
      })
    })

    const updatedMessages = messages.map(msg => {
      if (msg.id === metadata.sourceMessageId ||
          (msg.driftInfos && msg.driftInfos.some(d =>
            d.selectedText === metadata.selectedText &&
            d.driftChatId.startsWith('drift-temp-')))) {
        return {
          ...msg,
          hasDrift: true,
          driftInfos: [
            ...(msg.driftInfos?.filter(d => d.selectedText !== metadata.selectedText) || []),
            { selectedText: metadata.selectedText, driftChatId: newChatId }
          ]
        }
      }
      return msg
    })

    chatStore.setMessages(updatedMessages)
  }

  const handlePushDriftToMain = (driftMessages: Message[], selectedText: string, sourceMessageId: string, wasSavedAsChat: boolean, userQuestion?: string, driftChatId?: string, templateType?: LensKey) => {
    const originalSourceId = sourceMessageId.split('-push-')[0].split('-single-')[0]
    const driftSignature = driftMessages.map(m => `${m.isUser}:${m.text}`).join('|||')

    const duplicateExists = (() => {
      const existingPushWithSameId = messages.filter(msg =>
        msg.isDriftPush &&
        msg.driftPushMetadata?.sourceMessageId === sourceMessageId &&
        !msg.text.startsWith('📌 Drift exploration')
      )
      if (existingPushWithSameId.length > 0) return true

      const pushGroups = new Map<string, Message[]>()
      messages.forEach(msg => {
        if (msg.isDriftPush && msg.driftPushMetadata?.sourceMessageId) {
          const groupId = msg.driftPushMetadata.sourceMessageId
          const groupOriginalSource = groupId.split('-push-')[0].split('-single-')[0]
          if (groupOriginalSource === originalSourceId) {
            if (!pushGroups.has(groupId)) pushGroups.set(groupId, [])
            if (!msg.text.startsWith('📌 Drift exploration')) {
              pushGroups.get(groupId)!.push(msg)
            }
          }
        }
      })
      for (const [, groupMessages] of pushGroups) {
        const groupSignature = groupMessages.map(m => `${m.isUser}:${m.text}`).join('|||')
        if (groupSignature === driftSignature) return true
      }
      return false
    })()

    if (duplicateExists) {
      return
    }

    const actualDriftChatId = driftChatId || 'drift-pushed-' + Date.now()
    const originMsg = messages.find(m => m.id === originalSourceId)
    const driftModelTag = driftMessages.find(m => !m.isUser && !!m.modelTag)?.modelTag
    const originModelTag = driftModelTag || originMsg?.modelTag
    let originSide: 'left' | 'right' | undefined = undefined
    if (originMsg?.broadcastGroupId) {
      const groupMsgs = messages.filter(m => m.broadcastGroupId === originMsg.broadcastGroupId && !m.canvasId && !!m.modelTag)
      const idx = groupMsgs.findIndex(m => m.id === originMsg.id)
      if (idx >= 0) originSide = idx === 0 ? 'left' : 'right'
    }

    const separatorMessage: Message = {
      id: 'drift-push-' + Date.now(),
      text: `📌 Drift exploration of "${selectedText}"`,
      isUser: false,
      timestamp: new Date(),
      isDriftPush: true,
      driftPushMetadata: {
        selectedText,
        sourceMessageId,
        parentChatId: activeChatId,
        wasSavedAsChat,
        userQuestion,
        driftChatId: actualDriftChatId,
        originSide,
        originModelTag,
        templateType
      },
      modelTag: originModelTag
    }

    const messagesWithDriftMarked = messages.map(msg => {
      if (msg.driftInfos?.some(d => d.selectedText === selectedText)) {
        const existingDriftIndex = msg.driftInfos.findIndex(d => d.selectedText === selectedText)
        const updatedDriftInfos = [...msg.driftInfos]
        updatedDriftInfos[existingDriftIndex] = { ...updatedDriftInfos[existingDriftIndex], selectedText, driftChatId: actualDriftChatId, templateType }
        return { ...msg, hasDrift: true, driftInfos: updatedDriftInfos }
      }
      if (msg.id === originalSourceId && !msg.isDriftPush) {
        return {
          ...msg,
          hasDrift: true,
          driftInfos: [
            ...(msg.driftInfos || []),
            { selectedText, driftChatId: actualDriftChatId, templateType }
          ]
        }
      }
      if (!msg.isDriftPush && !msg.isUser && msg.text && msg.text.includes(selectedText)) {
        if (!msg.driftInfos?.some(d => d.selectedText === selectedText)) {
          return {
            ...msg,
            hasDrift: true,
            driftInfos: [
              ...(msg.driftInfos || []),
              { selectedText, driftChatId: actualDriftChatId, templateType }
            ]
          }
        }
      }
      return msg
    })

    const driftMessagesWithMetadata = driftMessages.map((msg, idx) => ({
      ...msg,
      isUser: false,
      originalIsUser: msg.isUser,
      isHiddenContext: msg.isUser ? true : (msg as any).isHiddenContext,
      id: `${sourceMessageId}-msg-${idx}-${Date.now()}`,
      originalDriftId: msg.id,
      isDriftPush: true,
      modelTag: originModelTag,
      driftPushMetadata: {
        selectedText,
        sourceMessageId,
        parentChatId: activeChatId,
        wasSavedAsChat,
        userQuestion,
        driftChatId: actualDriftChatId,
        originSide,
        originModelTag,
        templateType
      }
    }))

    const updatedMessages = [...messagesWithDriftMarked, separatorMessage, ...driftMessagesWithMetadata]
    const forceRefreshMessages = updatedMessages.map(msg => ({ ...msg }))
    chatStore.setMessages(forceRefreshMessages)
    const lastDriftMessage = driftMessagesWithMetadata[driftMessagesWithMetadata.length - 1]
    chatStore.updateChat(activeChatId, {
      messages: forceRefreshMessages,
      lastMessage: stripMarkdown(lastDriftMessage?.text || 'Drift pushed')
    })

    // Promoting an idea: this is a deliberate, satisfying gesture — a discovery
    // moving into the more permanent main thread. Confirm it physically + visibly.
    // (Undo stays available via the panel's push button toggle.)
    haptics.success()
    const promoteLabel = selectedText.length > 28 ? selectedText.slice(0, 28) + '…' : selectedText
    toast.success(`Promoted "${promoteLabel}" to the main thread`)

    // Mark this drift as freshly promoted. On desktop the main chat is already
    // visible so the settle-in arrival plays now; on mobile the panel covers the
    // screen, so App's reveal effect waits until the panel closes, then scrolls
    // to the promoted block and gives it a sustained "landed here" glow. The id
    // is cleared by that reveal (or when the next push overwrites it), not on a
    // short timer — otherwise the mobile indication would expire behind the panel.
    if (justPromotedTimerRef.current) clearTimeout(justPromotedTimerRef.current)
    setJustPromotedChatId(actualDriftChatId)
  }

  const handleSavePushedDriftAsChat = (msg: Message) => {
    if (!msg.isDriftPush || !msg.driftPushMetadata) return
    if (msg.driftPushMetadata.wasSavedAsChat) return

    const driftChatId = msg.driftPushMetadata.driftChatId
    const sourceMessageId = msg.driftPushMetadata.sourceMessageId

    const driftMessages = messages.filter(m => {
      if (!m.isDriftPush || m.text.startsWith('📌')) return false
      if (driftChatId && m.driftPushMetadata?.driftChatId === driftChatId) return true
      return m.driftPushMetadata?.sourceMessageId === sourceMessageId
    })

    if (driftMessages.length === 0) return

    const newChatId = 'drift-' + Date.now().toString()
    const title = `Drift: ${msg.driftPushMetadata.selectedText.slice(0, 30)}${msg.driftPushMetadata.selectedText.length > 30 ? '...' : ''}`

    const newChat: ChatSession = {
      id: newChatId,
      title,
      messages: driftMessages.map(m => ({
        ...m,
        isDriftPush: false,
        driftPushMetadata: undefined
      })),
      lastMessage: stripMarkdown(driftMessages[driftMessages.length - 1]?.text || 'Drift conversation'),
      createdAt: new Date(),
      metadata: {
        isDrift: true,
        parentChatId: msg.driftPushMetadata.parentChatId,
        sourceMessageId: msg.driftPushMetadata.sourceMessageId,
        selectedText: msg.driftPushMetadata.selectedText
      }
    }

    useChatStore.setState(state => ({
      chatHistory: [newChat, ...state.chatHistory]
    }))

    // The pushed drift is now a durable chat — drop its unsaved temp record.
    if (driftChatId) driftStore.clearTempConversation(driftChatId)

    const updatedMessages = messages.map(m => {
      if (m.id === sourceMessageId) {
        return {
          ...m,
          hasDrift: true,
          driftInfos: [
            ...(m.driftInfos || []),
            { selectedText: msg.driftPushMetadata!.selectedText, driftChatId: newChatId }
          ]
        }
      }
      if (m.isDriftPush && m.driftPushMetadata) {
        const shouldUpdate = (driftChatId && m.driftPushMetadata.driftChatId === driftChatId) ||
          m.driftPushMetadata.sourceMessageId === sourceMessageId
        if (shouldUpdate) {
          return {
            ...m,
            driftPushMetadata: { ...m.driftPushMetadata, wasSavedAsChat: true, driftChatId: newChatId }
          }
        }
      }
      return m
    })

    chatStore.setMessages(updatedMessages)
  }

  return {
    reopenLastDrift,
    handleNavigateToBreadcrumb,
    handleUndoPushToMain,
    handleUndoSaveAsChat,
    handleStartDrift,
    handleCloseDrift,
    handleSaveDriftAsChat,
    handlePushDriftToMain,
    handleSavePushedDriftAsChat,
  }
}
