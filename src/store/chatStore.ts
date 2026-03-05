/**
 * chatStore — owns all chat/message state and persists to IndexedDB.
 *
 * Every mutation that touches chat data fires an async persist call
 * (fire-and-forget so the UI is never blocked).
 */

import { create } from 'zustand'
import { chatDB, chatToDB, chatFromDB } from '@/services/db'
import type { Message, ChatSession } from '@/types/chat'

// ── Demo / initial chats ─────────────────────────────────────────────────────

const DEMO_CHATS: ChatSession[] = [
  {
    id: '1',
    title: 'New Chat',
    messages: [],
    lastMessage: "Let's explore ideas together...",
    createdAt: new Date(),
  },
  {
    id: '2',
    title: 'Project Planning Discussion',
    messages: [],
    lastMessage: 'The timeline looks good for Q2...',
    createdAt: new Date(Date.now() - 86400000),
  },
  {
    id: '3',
    title: 'Creative Brainstorming',
    messages: [],
    lastMessage: "That's an innovative approach!",
    createdAt: new Date(Date.now() - 172800000),
  },
  {
    id: '4',
    title: 'Technical Architecture',
    messages: [],
    lastMessage: 'The microservices pattern would...',
    createdAt: new Date(Date.now() - 259200000),
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
}

// ── Internal persist helper ───────────────────────────────────────────────────

function persistChat(chat: ChatSession): void {
  // Async fire-and-forget — errors are logged by chatDB
  chatDB.put(chatToDB(chat)).catch((err) => {
    console.error(`[chatStore] Failed to persist chat ${chat.id}:`, err)
  })
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>((set, get) => ({
  chatHistory: [],
  activeChatId: '1',
  messages: [],
  isTyping: false,
  streamingResponse: '',
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

    persistChat(newChat)

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

  setIsTyping(typing: boolean) {
    set({ isTyping: typing })
  },

  setInputText(text: string) {
    set({ inputText: text })
  },

  setSearchQuery(text: string) {
    set({ searchQuery: text })
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
