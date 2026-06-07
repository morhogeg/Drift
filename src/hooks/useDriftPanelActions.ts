import { useState, useEffect } from 'react'
import { snippetStorage } from '../services/snippetStorage'
import { isDriftOpenerText } from '../lib/driftPanel'
import type { Message } from '../components/DriftPanel'

interface DriftPanelActionsDeps {
  /** The drift-only conversation (excludes parent context messages). */
  driftOnlyMessages: Message[]
  /** The term the drift is exploring. */
  selectedText: string
  /** Id of the parent message the drift branched from. */
  sourceMessageId: string
  /** Id of the chat the parent message lives in. */
  parentChatId: string
  /** The chat id of this drift, once it has one (used to reconstruct on click). */
  driftChatId?: string
  /** Push the given messages back into the main chat. */
  onPushToMain?: (messages: Message[], selectedText: string, sourceMessageId: string, wasSavedAsChat: boolean, userQuestion?: string, driftChatId?: string) => void
  /** Persist the drift conversation as a standalone chat. */
  onSaveAsChat: (messages: Message[], title: string, metadata: any) => void
  /** Mark already-pushed drift messages as saved (after a save-as-chat). */
  onUpdatePushedDriftSaveStatus?: (sourceMessageId: string) => void
  /** Undo a push-to-main for the given source id. */
  onUndoPushToMain?: (sourceMessageId: string) => void
  /** Undo a save-as-chat for the given chat id. */
  onUndoSaveAsChat?: (chatId: string) => void
  /** Bump the parent's snippet count after a save/unsave. */
  onSnippetCountUpdate?: () => void
  /** Close the panel, handing back the full drift conversation to persist. */
  onClose: (driftMessages?: Message[]) => void
}

/**
 * The drift panel's push / save action layer, extracted verbatim from
 * DriftPanel. Owns the push/save state cluster and exposes:
 *  • `handlePushSingleMessage` — push one message (with its preceding turns as
 *    hidden context) back into the main chat.
 *  • `handleToggleSaveMessage` — save/unsave a single drift message as a snippet.
 *  • `handleSaveAsChat` — promote the whole drift to a standalone chat (toggles
 *    to undo when already saved).
 *  • `handlePushToMain` — push the whole drift to main (toggles to undo when
 *    already pushed); guards against duplicate / in-flight pushes.
 *
 * Also exposes:
 *  • `resetPushSaveState` — clear the push/save cluster when a new drift opens.
 *  • `loadSavedMessageIds` — repopulate `savedMessageIds` from storage on open.
 * The "reset push button when new messages arrive" effect lives here too, since
 * it owns the relevant state.
 *
 * Behavior-preserving: the state moved in wholesale; the panel reads back what
 * it renders (`pushedToMain`, `savedAsChat`, `savedMessageIds`, `isPushing`).
 */
export function useDriftPanelActions({
  driftOnlyMessages,
  selectedText,
  sourceMessageId,
  parentChatId,
  driftChatId,
  onPushToMain,
  onSaveAsChat,
  onUpdatePushedDriftSaveStatus,
  onUndoPushToMain,
  onUndoSaveAsChat,
  onSnippetCountUpdate,
  onClose,
}: DriftPanelActionsDeps) {
  const [pushedToMain, setPushedToMain] = useState(false)
  const [savedAsChat, setSavedAsChat] = useState(false)
  const [savedChatId, setSavedChatId] = useState<string | null>(null)
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set())
  const [pushedMessageCount, setPushedMessageCount] = useState(0)
  const [lastPushSourceId, setLastPushSourceId] = useState<string | null>(null)
  const [isPushing, setIsPushing] = useState(false)
  const [pushedContentSignature, setPushedContentSignature] = useState<string | null>(null)

  // Reset push button if new messages are added after pushing
  useEffect(() => {
    if (pushedToMain && pushedMessageCount > 0) {
      // Filter out the system message
      const currentMessageCount = driftOnlyMessages.filter(
        msg => !isDriftOpenerText(msg.text)
      ).length

      // If there are more messages now than when we pushed, reset the button
      if (currentMessageCount > pushedMessageCount) {
        console.log('DriftPanel: Resetting push button - new messages added')
        setPushedToMain(false)
        setPushedMessageCount(0)
        setLastPushSourceId(null) // Also clear the last push source
        setPushedContentSignature(null) // Clear the content signature
      }
    }
  }, [driftOnlyMessages, pushedToMain, pushedMessageCount])

  // Clear the push/save cluster when a new drift opens (called from the panel's
  // init effect, preserving the original inline reset order).
  const resetPushSaveState = () => {
    setPushedToMain(false)
    setSavedAsChat(false)
    setSavedChatId(null)
    setPushedMessageCount(0)
    setLastPushSourceId(null)
    setPushedContentSignature(null)
  }

  // Load saved message IDs for this drift from snippet storage (called on open).
  const loadSavedMessageIds = () => {
    const allSnippets = snippetStorage.getAllSnippets()
    const savedIds = new Set<string>()
    allSnippets.forEach(snippet => {
      if (snippet.source.messageId) {
        savedIds.add(snippet.source.messageId)
      }
    })
    setSavedMessageIds(savedIds)
  }

  const handlePushSingleMessage = (message: Message) => {
    if (onPushToMain) {
      // Find all drift messages up to and including this one (excluding system message)
      const messageIndex = driftOnlyMessages.findIndex(m => m.id === message.id)
      const allMessagesUpToThis = driftOnlyMessages
        .slice(0, messageIndex + 1)
        .filter(msg => !isDriftOpenerText(msg.text))

      // Mark only the selected message as visible, others as hidden context
      const messagesToPush = allMessagesUpToThis.map((msg) => ({
        ...msg,
        isHiddenContext: msg.id !== message.id  // Mark all except the selected message as hidden
      }))

      // Find the user message before this one for metadata
      const previousUserMessage = driftOnlyMessages.slice(0, messageIndex).reverse().find(m => m.isUser)
      const userQuestion = previousUserMessage?.text || selectedText

      // Use a unique but consistent source ID for single messages
      // Include message content hash to prevent exact duplicates
      const messageHash = message.text.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '')
      const singleMessageSourceId = `${sourceMessageId}-single-${message.id}-${messageHash}`

      // Important: Use the same driftChatId so we can reconstruct the full conversation
      const chatIdToUse = savedChatId || driftChatId || `drift-temp-single-${Date.now()}`

      // Push all messages but mark as single push (only one will be visible)
      onPushToMain(
        messagesToPush,
        selectedText,
        singleMessageSourceId,
        savedAsChat,
        userQuestion,
        chatIdToUse
      )
    }
  }

  const handleToggleSaveMessage = (message: Message) => {
    if (savedMessageIds.has(message.id)) {
      // Unsave: Find and delete the snippet
      const allSnippets = snippetStorage.getAllSnippets()
      const snippetToDelete = allSnippets.find(s =>
        s.source.messageId === message.id
      )

      if (snippetToDelete) {
        snippetStorage.deleteSnippet(snippetToDelete.id)
        setSavedMessageIds(prev => {
          const newSet = new Set(prev)
          newSet.delete(message.id)
          return newSet
        })
        // Update the snippet count in the parent component
        onSnippetCountUpdate?.()
      }
    } else {
      // Save: Create new snippet
      const driftTitle = savedChatId
        ? `Drift: ${selectedText.slice(0, 30)}${selectedText.length > 30 ? '...' : ''}`
        : `Drift from: ${selectedText.slice(0, 30)}${selectedText.length > 30 ? '...' : ''}`

      const source = {
        chatId: savedChatId || `drift-temp-${sourceMessageId}`,
        chatTitle: driftTitle,
        messageId: message.id,
        isFullMessage: true,
        timestamp: message.timestamp,
        isDrift: true,
        parentChatId,
        selectedText
      }

      snippetStorage.createSnippet(
        message.text,
        source,
        {
          tags: [],
          starred: false
        }
      )

      setSavedMessageIds(prev => new Set(prev).add(message.id))
      // Update the snippet count in the parent component
      onSnippetCountUpdate?.()
    }
  }

  const handleSaveAsChat = () => {
    // If already saved, handle undo
    if (savedAsChat && savedChatId && onUndoSaveAsChat) {
      onUndoSaveAsChat(savedChatId)
      setSavedAsChat(false)
      setSavedChatId(null)

      // Also update pushed messages if they exist
      if (pushedToMain && onUpdatePushedDriftSaveStatus) {
        // Just update the save status, don't re-push
        onUpdatePushedDriftSaveStatus(sourceMessageId)
      }
      return
    }

    const title = `Drift: ${selectedText.slice(0, 30)}${selectedText.length > 30 ? '...' : ''}`
    const metadata = {
      isDrift: true,
      parentChatId,
      sourceMessageId,
      selectedText,
      createdAt: new Date()
    }
    // Filter out the system message when saving as a new chat
    // The banner will provide all the context needed
    const messagesToSave = driftOnlyMessages.filter(
      msg => !msg.text.startsWith('🌀 Drift started from:')
    )

    const newChatId = 'drift-' + Date.now().toString()
    setSavedChatId(newChatId)

    onSaveAsChat(messagesToSave, title, { ...metadata, id: newChatId })
    setSavedAsChat(true)

    // If already pushed to main, update those messages to mark as saved
    if (pushedToMain && onUpdatePushedDriftSaveStatus) {
      onUpdatePushedDriftSaveStatus(sourceMessageId)
    }
    // Don't close - let user decide if they want to continue or close
    // onClose()
  }

  const handlePushToMain = async () => {
    const clickId = Math.random().toString(36).substring(7)
    console.log(`[BUTTON-CLICK ${clickId}] Push button clicked`)
    console.log(`[BUTTON-CLICK ${clickId}] Current state - pushedToMain:`, pushedToMain, 'isPushing:', isPushing)

    // If already pushed, handle undo
    if (pushedToMain && lastPushSourceId && onUndoPushToMain) {
      console.log(`[BUTTON-CLICK ${clickId}] Undoing previous push`)
      onUndoPushToMain(lastPushSourceId)
      setPushedToMain(false)
      setLastPushSourceId(null)
      setPushedContentSignature(null)
      return
    }

    // Prevent multiple pushes while one is in progress
    if (pushedToMain || isPushing) {
      console.log(`[BUTTON-CLICK ${clickId}] BLOCKED - Already pushed or pushing`)
      return
    }

    if (onPushToMain && driftOnlyMessages.length > 0) {
      // Filter out the system message when pushing to main
      const messagesToPush = driftOnlyMessages.filter(
        msg => !isDriftOpenerText(msg.text)
      )

      if (messagesToPush.length > 0) {
        // Create a content signature to track what we're pushing
        const contentSignature = messagesToPush.map(m => `${m.isUser}:${m.text}`).join('|||')

        // Check if we've already pushed this exact content
        if (pushedContentSignature === contentSignature) {
          console.log('DriftPanel: Preventing duplicate push - same content already pushed')
          return
        }

        // Set pushing state to prevent double-clicks
        setIsPushing(true)

        try {
          // Find the last user question in the drift conversation
          const lastUserMessage = messagesToPush.filter(m => m.isUser).pop()
          const userQuestion = lastUserMessage?.text || selectedText

          // Create a consistent push ID based on message content
          // This helps prevent duplicate pushes of the same content
          const messageHash = messagesToPush.map(m => m.text).join('').substring(0, 10)
          const pushSourceId = `${sourceMessageId}-push-${messageHash}-${Date.now()}`

          const pushAttemptId = Math.random().toString(36).substring(7)
          console.log(`[DRIFT-PANEL ${pushAttemptId}] Initiating push to main`)
          console.log(`[DRIFT-PANEL ${pushAttemptId}] sourceId:`, pushSourceId)
          console.log(`[DRIFT-PANEL ${pushAttemptId}] Messages:`, messagesToPush.length)
          console.log(`[DRIFT-PANEL ${pushAttemptId}] Content signature:`, contentSignature.substring(0, 50))

          const chatIdToUse = savedChatId || driftChatId || `drift-temp-full-${Date.now()}`
          onPushToMain(messagesToPush, selectedText, pushSourceId, savedAsChat, userQuestion, chatIdToUse)

          console.log(`[DRIFT-PANEL ${pushAttemptId}] Push call completed`)
          setPushedToMain(true)
          setPushedMessageCount(messagesToPush.length)
          setLastPushSourceId(pushSourceId)
          setPushedContentSignature(contentSignature)

          // Store the full conversation so it can be reconstructed when clicked
          if (onClose && driftOnlyMessages.length > 0) {
            onClose(driftOnlyMessages)
          }
        } finally {
          setIsPushing(false)
        }
        // Don't close - let user decide if they also want to save as chat
        // onClose()
      }
    }
  }

  return {
    // State the panel renders
    pushedToMain,
    savedAsChat,
    savedMessageIds,
    isPushing,
    // Handlers
    handlePushSingleMessage,
    handleToggleSaveMessage,
    handleSaveAsChat,
    handlePushToMain,
    // Lifecycle helpers used by the panel's init effect
    resetPushSaveState,
    loadSavedMessageIds,
  }
}
