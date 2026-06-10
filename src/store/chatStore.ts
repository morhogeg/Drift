/**
 * chatStore — owns all chat/message state and persists to IndexedDB.
 *
 * Every mutation that touches chat data fires an async persist call
 * (fire-and-forget so the UI is never blocked).
 */

import { create } from 'zustand'
import { chatDB, chatToDB, chatFromDB } from '@/services/db'
import type { Message, ChatSession } from '@/types/chat'

// ── Initial chat ──────────────────────────────────────────────────────────────
// First run seeds a single empty chat — no fake "Project Planning"/"Creative
// Brainstorming" placeholders (generic filler that contradicts the brand and
// just reads as redundant "New Chat" rows).

const DEMO_CHATS: ChatSession[] = [
  {
    id: '1',
    title: 'New Chat',
    messages: [],
    lastMessage: "Let's explore ideas together...",
    createdAt: new Date(),
  },
]

// ── Store shape ───────────────────────────────────────────────────────────────

interface ChatStore {
  // ── State ──────────────────────────────────────────────────────────────────
  chatHistory: ChatSession[]
  activeChatId: string
  /** Messages for the currently active chat (kept in sync with chatHistory). */
  messages: Message[]
  isTyping: boolean
  streamingResponse: string
  /** Id of the AI message currently receiving streamed tokens (null when idle).
   *  Drives the live shimmer on the materializing response. */
  streamingMessageId: string | null
  searchQuery: string
  /** Current value of the chat input textarea. */
  inputText: string

  // ── Actions ────────────────────────────────────────────────────────────────
  /** Called on app init — loads all chats from IndexedDB. Seeds demo data on first run. */
  loadChatsFromDB: () => Promise<void>

  /** Create a new empty chat, persist it, and switch to it. Returns the new id. */
  createChat: () => string

  /**
   * Switch the active chat.
   * Saves current messages back into chatHistory before switching.
   */
  setActiveChat: (id: string) => void

  /** Partially update a chat's metadata (title, lastMessage, etc.), then persist. */
  updateChat: (id: string, partial: Partial<Omit<ChatSession, 'id'>>) => void

  /** Delete a chat from state and IndexedDB. */
  deleteChat: (id: string) => void

  /** Append a message to the active chat's message list and persist. */
  addMessage: (chatId: string, message: Message) => void

  /** Update a single field on an existing message and persist the chat. */
  updateMessage: (chatId: string, messageId: string, partial: Partial<Message>) => void

  /** Replace messages wholesale for a chat (used for batch updates like push-to-main). */
  setMessages: (messages: Message[]) => void

  /** Update the streaming accumulation buffer (does NOT persist — transient). */
  setStreaming: (content: string) => void

  /** Mark which AI message is actively streaming (null when none). Transient. */
  setStreamingMessageId: (id: string | null) => void

  setIsTyping: (typing: boolean) => void
  setInputText: (text: string) => void
  setSearchQuery: (text: string) => void

  /**
   * Save current in-memory messages back to chatHistory entry for activeChatId.
   * Useful before switching chats.
   */
  flushCurrentMessages: () => void

  /** Import demo/external chats (e.g., first-run seed), persisting each one. */
  importDemoChats: (chats: ChatSession[]) => Promise<void>

  /**
   * Insert a drift chat session if it doesn't already exist in chatHistory.
   * Called when a drift panel closes with messages, so conversations survive restarts.
   * Idempotent: skipped silently if the id is already tracked.
   */
  registerDriftSession: (chat: ChatSession) => void
}

// ── Internal persist helper ───────────────────────────────────────────────────

function persistChat(chat: ChatSession): void {
  // Async fire-and-forget — errors are logged by chatDB
  chatDB.put(chatToDB(chat)).catch((err) => {
    console.error(`[chatStore] Failed to persist chat ${chat.id}:`, err)
  })
}

/**
 * A "blank" chat: no messages, still on the default title, and not a drift.
 * These are pure placeholders — clicking "New chat" on one (or seeding several)
 * just produces redundant identical rows, so we collapse them to a single one.
 */
function isBlankChat(c: ChatSession): boolean {
  return (
    (c.messages?.length ?? 0) === 0 &&
    !c.metadata?.isDrift &&
    (c.title === 'New Chat' || c.title === 'Current Conversation')
  )
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>((set, get) => ({
  chatHistory: [],
  activeChatId: '1',
  messages: [],
  isTyping: false,
  streamingResponse: '',
  streamingMessageId: null,
  searchQuery: '',
  inputText: '',

  // ── loadChatsFromDB ────────────────────────────────────────────────────────
  async loadChatsFromDB() {
    try {
      const raw = await chatDB.getAll()

      if (raw.length === 0) {
        // First run — seed demo chats into IndexedDB and state
        await get().importDemoChats(DEMO_CHATS)
        return
      }

      const chats = raw.map(chatFromDB)
      // Sort newest first
      chats.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

      // Collapse redundant blank chats (from older builds that seeded several,
      // or repeated "New chat" taps): keep only the newest one, prune the rest
      // from both state and IndexedDB. Pruning empty placeholders loses nothing.
      const blanks = chats.filter(isBlankChat)
      if (blanks.length > 1) {
        const stale = blanks.slice(1) // keep blanks[0] (newest), drop the rest
        const staleIds = new Set(stale.map((c) => c.id))
        for (const c of stale) {
          chatDB.delete(c.id).catch((err) =>
            console.error(`[chatStore] pruning blank chat ${c.id} failed:`, err)
          )
        }
        chats.splice(0, chats.length, ...chats.filter((c) => !staleIds.has(c.id)))
      }

      const firstId = chats[0]?.id ?? '1'
      set({
        chatHistory: chats,
        activeChatId: firstId,
        messages: chats[0]?.messages ?? [],
      })
    } catch (err) {
      console.error('[chatStore] loadChatsFromDB failed:', err)
      // Fallback: use demo data in memory only
      set({
        chatHistory: DEMO_CHATS,
        activeChatId: DEMO_CHATS[0].id,
        messages: DEMO_CHATS[0].messages,
      })
    }
  },

  // ── importDemoChats ────────────────────────────────────────────────────────
  async importDemoChats(chats: ChatSession[]) {
    try {
      // Persist all demo chats
      await Promise.all(chats.map((c) => chatDB.put(chatToDB(c))))

      set({
        chatHistory: chats,
        activeChatId: chats[0]?.id ?? '1',
        messages: chats[0]?.messages ?? [],
      })
    } catch (err) {
      console.error('[chatStore] importDemoChats failed:', err)
      // Still set state even if persistence failed
      set({
        chatHistory: chats,
        activeChatId: chats[0]?.id ?? '1',
        messages: chats[0]?.messages ?? [],
      })
    }
  },

  // ── createChat ─────────────────────────────────────────────────────────────
  createChat() {
    const { chatHistory, activeChatId, messages } = get()

    // Flush current messages before creating new chat
    const updatedHistory = chatHistory.map((c) =>
      c.id === activeChatId ? { ...c, messages } : c
    )

    // Don't stack duplicate blank chats: if an empty "New Chat" already exists,
    // just switch to it instead of spawning an identical sibling.
    const existingBlank = updatedHistory.find(isBlankChat)
    if (existingBlank) {
      set({
        chatHistory: updatedHistory,
        activeChatId: existingBlank.id,
        messages: existingBlank.messages ?? [],
      })
      return existingBlank.id
    }

    const newId = Date.now().toString()
    const newChat: ChatSession = {
      id: newId,
      title: 'New Chat',
      messages: [],
      lastMessage: 'Start a new conversation...',
      createdAt: new Date(),
    }

    set({
      chatHistory: [newChat, ...updatedHistory],
      activeChatId: newId,
      messages: [],
    })

    return newId
  },

  // ── setActiveChat ──────────────────────────────────────────────────────────
  setActiveChat(id: string) {
    const { activeChatId, messages, chatHistory } = get()
    if (id === activeChatId) return

    // Save current messages
    const updatedHistory = chatHistory.map((c) =>
      c.id === activeChatId ? { ...c, messages } : c
    )

    const targetChat = updatedHistory.find((c) => c.id === id)
    if (!targetChat) return

    set({
      chatHistory: updatedHistory,
      activeChatId: id,
      messages: targetChat.messages ?? [],
    })
  },

  // ── updateChat ─────────────────────────────────────────────────────────────
  updateChat(id: string, partial: Partial<Omit<ChatSession, 'id'>>) {
    const { chatHistory } = get()
    const updated = chatHistory.map((c) =>
      c.id === id ? { ...c, ...partial } : c
    )
    set({ chatHistory: updated })

    const updatedChat = updated.find((c) => c.id === id)
    if (updatedChat) persistChat(updatedChat)
  },

  // ── deleteChat ─────────────────────────────────────────────────────────────
  deleteChat(id: string) {
    const { chatHistory, activeChatId } = get()
    const remaining = chatHistory.filter((c) => c.id !== id)

    const newState: Partial<ChatStore> = { chatHistory: remaining }

    if (activeChatId === id) {
      const fallback = remaining[0]
      newState.activeChatId = fallback?.id ?? ''
      newState.messages = fallback?.messages ?? []
    }

    set(newState as ChatStore)

    chatDB.delete(id).catch((err) => {
      console.error(`[chatStore] deleteChat(${id}) failed:`, err)
    })
  },

  // ── addMessage ─────────────────────────────────────────────────────────────
  addMessage(chatId: string, message: Message) {
    const { chatHistory, activeChatId, messages } = get()

    if (chatId === activeChatId) {
      const newMessages = [...messages, message]
      const updated = chatHistory.map((c) =>
        c.id === chatId ? { ...c, messages: newMessages, lastMessage: message.text } : c
      )
      set({ messages: newMessages, chatHistory: updated })
      const chat = updated.find((c) => c.id === chatId)
      if (chat) persistChat(chat)
    } else {
      // Append to the correct chat in history even if not active
      const updated = chatHistory.map((c) => {
        if (c.id !== chatId) return c
        const newMessages = [...(c.messages ?? []), message]
        return { ...c, messages: newMessages, lastMessage: message.text }
      })
      set({ chatHistory: updated })
      const chat = updated.find((c) => c.id === chatId)
      if (chat) persistChat(chat)
    }
  },

  // ── updateMessage ──────────────────────────────────────────────────────────
  updateMessage(chatId: string, messageId: string, partial: Partial<Message>) {
    const { chatHistory, activeChatId, messages } = get()

    if (chatId === activeChatId) {
      const newMessages = messages.map((m) =>
        m.id === messageId ? { ...m, ...partial } : m
      )
      const updated = chatHistory.map((c) =>
        c.id === chatId ? { ...c, messages: newMessages } : c
      )
      set({ messages: newMessages, chatHistory: updated })
      const chat = updated.find((c) => c.id === chatId)
      if (chat) persistChat(chat)
    } else {
      const updated = chatHistory.map((c) => {
        if (c.id !== chatId) return c
        return {
          ...c,
          messages: (c.messages ?? []).map((m) =>
            m.id === messageId ? { ...m, ...partial } : m
          ),
        }
      })
      set({ chatHistory: updated })
      const chat = updated.find((c) => c.id === chatId)
      if (chat) persistChat(chat)
    }
  },

  // ── setMessages ────────────────────────────────────────────────────────────
  setMessages(messages: Message[]) {
    const { activeChatId, chatHistory } = get()
    const updated = chatHistory.map((c) =>
      c.id === activeChatId
        ? { ...c, messages, lastMessage: messages[messages.length - 1]?.text }
        : c
    )
    set({ messages, chatHistory: updated })
    const chat = updated.find((c) => c.id === activeChatId)
    if (chat) persistChat(chat)
  },

  // ── setStreaming ───────────────────────────────────────────────────────────
  setStreaming(content: string) {
    set({ streamingResponse: content })
  },

  setStreamingMessageId(id: string | null) {
    set({ streamingMessageId: id })
  },

  setIsTyping(typing: boolean) {
    set({ isTyping: typing })
  },

  setInputText(text: string) {
    set({ inputText: text })
  },

  setSearchQuery(text: string) {
    set({ searchQuery: text })
  },

  // ── registerDriftSession ───────────────────────────────────────────────────
  registerDriftSession(chat: ChatSession) {
    const { chatHistory } = get()
    if (chatHistory.some((c) => c.id === chat.id)) {
      // Already tracked — update messages in place (conversation may have grown)
      const updated = chatHistory.map((c) => (c.id === chat.id ? { ...c, messages: chat.messages, lastMessage: chat.lastMessage } : c))
      set({ chatHistory: updated })
      persistChat({ ...chat })
      return
    }
    // New drift session — insert at front of history and persist
    set({ chatHistory: [chat, ...chatHistory] })
    persistChat(chat)
  },

  // ── flushCurrentMessages ───────────────────────────────────────────────────
  flushCurrentMessages() {
    const { activeChatId, messages, chatHistory } = get()
    const updated = chatHistory.map((c) =>
      c.id === activeChatId ? { ...c, messages } : c
    )
    set({ chatHistory: updated })
  },
}))
