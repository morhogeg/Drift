/**
 * IndexedDB service for Drift chat persistence.
 *
 * Uses the `idb` library for a typed, promise-based API.
 * Only the "drift-chats" store is managed here.
 * Snippets remain in snippetStorage.ts (localStorage).
 */

import { openDB as idbOpenDB, type IDBPDatabase } from 'idb'

// ── Types ───────────────────────────────────────────────────────────────────

export interface DBMessage {
  id: string
  text: string
  isUser: boolean
  originalIsUser?: boolean
  /** Stored as ISO string; caller must convert back to Date */
  timestamp: string
  modelTag?: string
  broadcastGroupId?: string
  strandId?: string
  canvasId?: string
  hasDrift?: boolean
  driftInfos?: Array<{
    selectedText: string
    driftChatId: string
  }>
  isDriftPush?: boolean
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
  isHiddenContext?: boolean
  originalDriftId?: string
}

export interface DBChatSession {
  id: string
  title: string
  messages: DBMessage[]
  lastMessage?: string
  /** Stored as ISO string */
  createdAt: string
  metadata?: {
    isDrift?: boolean
    parentChatId?: string
    sourceMessageId?: string
    selectedText?: string
  }
}

// ── DB schema version ───────────────────────────────────────────────────────

const DB_NAME = 'drift-db'
const DB_VERSION = 1
const CHATS_STORE = 'drift-chats'

// ── Singleton DB promise ────────────────────────────────────────────────────

let _db: IDBPDatabase | null = null

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db

  _db = await idbOpenDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Version 1: create the chats store keyed by id
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(CHATS_STORE)) {
          db.createObjectStore(CHATS_STORE, { keyPath: 'id' })
        }
      }
    },
    blocked() {
      console.warn('[db] IndexedDB upgrade blocked by another open tab.')
    },
    blocking() {
      // Another tab is trying to upgrade — close our connection gracefully.
      _db?.close()
      _db = null
    },
    terminated() {
      console.warn('[db] IndexedDB connection terminated unexpectedly.')
      _db = null
    },
  })

  return _db
}

// ── chatDB CRUD ─────────────────────────────────────────────────────────────

export const chatDB = {
  /** Load all chat sessions from IndexedDB. */
  async getAll(): Promise<DBChatSession[]> {
    try {
      const db = await getDB()
      return await db.getAll(CHATS_STORE)
    } catch (err) {
      console.error('[db] chatDB.getAll failed:', err)
      return []
    }
  },

  /** Load a single chat session by id. Returns undefined if not found. */
  async get(id: string): Promise<DBChatSession | undefined> {
    try {
      const db = await getDB()
      return await db.get(CHATS_STORE, id)
    } catch (err) {
      console.error(`[db] chatDB.get(${id}) failed:`, err)
      return undefined
    }
  },

  /** Insert or replace a chat session. */
  async put(chat: DBChatSession): Promise<void> {
    try {
      const db = await getDB()
      await db.put(CHATS_STORE, chat)
    } catch (err) {
      console.error(`[db] chatDB.put(${chat.id}) failed:`, err)
    }
  },

  /** Delete a chat session by id. */
  async delete(id: string): Promise<void> {
    try {
      const db = await getDB()
      await db.delete(CHATS_STORE, id)
    } catch (err) {
      console.error(`[db] chatDB.delete(${id}) failed:`, err)
    }
  },

  /** Remove every chat session from the store. */
  async clear(): Promise<void> {
    try {
      const db = await getDB()
      await db.clear(CHATS_STORE)
    } catch (err) {
      console.error('[db] chatDB.clear failed:', err)
    }
  },
}

// ── Serialisation helpers ───────────────────────────────────────────────────
// App-level Message / ChatSession use Date objects; IDB stores plain JSON
// (ISO strings). These helpers convert between the two shapes.

import type { Message, ChatSession } from '@/types/chat'

export function chatToDB(chat: ChatSession): DBChatSession {
  return {
    ...chat,
    createdAt: chat.createdAt instanceof Date ? chat.createdAt.toISOString() : String(chat.createdAt),
    messages: chat.messages.map(msgToDB),
  }
}

export function chatFromDB(raw: DBChatSession): ChatSession {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    messages: raw.messages.map(msgFromDB),
  }
}

function msgToDB(msg: Message): DBMessage {
  return {
    ...msg,
    timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : String(msg.timestamp),
  }
}

function msgFromDB(raw: DBMessage): Message {
  return {
    ...raw,
    timestamp: new Date(raw.timestamp),
  }
}
