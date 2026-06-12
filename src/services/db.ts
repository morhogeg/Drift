/**
 * IndexedDB service for Drift chat persistence.
 *
 * Uses the `idb` library for a typed, promise-based API.
 * Only the "drift-chats" store is managed here.
 * Snippets remain in snippetStorage.ts (localStorage).
 */

import { openDB as idbOpenDB, type IDBPDatabase } from 'idb'
import { emitLocalDataChange } from './cloudHooks'

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
const DB_VERSION = 4
const CHATS_STORE = 'drift-chats'
const EMBEDDINGS_STORE = 'drift-embeddings'
const TEMP_DRIFTS_STORE = 'drift-temp-drifts'
const LENS_STATE_STORE = 'drift-lens-state'

// ── Lens-state record ────────────────────────────────────────────────────────
// Connect-lens content (suggestion cards + per-question answer threads) for one
// drift. Mirrors the caches in driftStore so lens threads survive a reload even
// before the drift is pushed/saved (after that, driftInfos also carry them).

export interface DBLensState {
  /** driftChatId — same id space as DBChatSession.id. */
  id: string
  cards?: string[]
  answers?: Record<string, DBMessage[]>
  /** ISO timestamp of the last write. */
  updatedAt: string
}

// ── Temp drift record ────────────────────────────────────────────────────────
// An unsaved (in-flight) drift conversation. Mirrors the in-memory
// tempDriftConversations Map in driftStore so a killed app can restore drifts
// the user never explicitly saved.

export interface DBTempDrift {
  /** driftChatId — same id space as DBChatSession.id. */
  id: string
  messages: DBMessage[]
  /** ISO timestamp of the last write. */
  updatedAt: string
}

// ── Embedding record ──────────────────────────────────────────────────────────
// One cached embedding per drift conversation. `hash` is a cheap stable hash of
// the embedded text so the backfill can skip drifts whose text hasn't changed.

export interface DBEmbedding {
  /** driftChatId — same id space as DBChatSession.id. */
  id: string
  /** The embedding vector. */
  vec: number[]
  /** The exact text that was embedded (for debugging / re-embed decisions). */
  text: string
  /** Cheap stable hash of `text` — re-embed only when this changes. */
  hash: string
  /** Embedding model used (so a model swap can invalidate old vectors). */
  model: string
  /** ISO timestamp of when this was written. */
  updatedAt: string
}

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
      // Version 2: additive — add the embeddings store. MUST NOT touch the
      // existing chats store so upgrading users keep all their conversations.
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(EMBEDDINGS_STORE)) {
          db.createObjectStore(EMBEDDINGS_STORE, { keyPath: 'id' })
        }
      }
      // Version 3: additive — add the temp (unsaved) drifts store.
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains(TEMP_DRIFTS_STORE)) {
          db.createObjectStore(TEMP_DRIFTS_STORE, { keyPath: 'id' })
        }
      }
      // Version 4: additive — add the Connect lens-state store.
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains(LENS_STATE_STORE)) {
          db.createObjectStore(LENS_STATE_STORE, { keyPath: 'id' })
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
      emitLocalDataChange() // no-op unless cloud sync is enabled + signed in
    } catch (err) {
      console.error(`[db] chatDB.put(${chat.id}) failed:`, err)
    }
  },

  /** Delete a chat session by id. */
  async delete(id: string): Promise<void> {
    try {
      const db = await getDB()
      await db.delete(CHATS_STORE, id)
      emitLocalDataChange()
    } catch (err) {
      console.error(`[db] chatDB.delete(${id}) failed:`, err)
    }
  },

  /** Remove every chat session from the store. */
  async clear(): Promise<void> {
    try {
      const db = await getDB()
      await db.clear(CHATS_STORE)
      emitLocalDataChange()
    } catch (err) {
      console.error('[db] chatDB.clear failed:', err)
    }
  },
}

// ── embeddingDB CRUD ──────────────────────────────────────────────────────────
// Persistent vector cache for the semantic layer. Mirrors chatDB so failures
// are swallowed + logged (never thrown) — the semantic layer is non-critical.

export const embeddingDB = {
  /** Load every cached embedding. */
  async getAll(): Promise<DBEmbedding[]> {
    try {
      const db = await getDB()
      return await db.getAll(EMBEDDINGS_STORE)
    } catch (err) {
      console.error('[db] embeddingDB.getAll failed:', err)
      return []
    }
  },

  /** Load a single embedding by drift id. Returns undefined if not found. */
  async get(id: string): Promise<DBEmbedding | undefined> {
    try {
      const db = await getDB()
      return await db.get(EMBEDDINGS_STORE, id)
    } catch (err) {
      console.error(`[db] embeddingDB.get(${id}) failed:`, err)
      return undefined
    }
  },

  /** Insert or replace an embedding record. */
  async put(rec: DBEmbedding): Promise<void> {
    try {
      const db = await getDB()
      await db.put(EMBEDDINGS_STORE, rec)
    } catch (err) {
      console.error(`[db] embeddingDB.put(${rec.id}) failed:`, err)
    }
  },

  /** Delete an embedding by drift id. */
  async delete(id: string): Promise<void> {
    try {
      const db = await getDB()
      await db.delete(EMBEDDINGS_STORE, id)
    } catch (err) {
      console.error(`[db] embeddingDB.delete(${id}) failed:`, err)
    }
  },

  /** Remove every cached embedding. */
  async clear(): Promise<void> {
    try {
      const db = await getDB()
      await db.clear(EMBEDDINGS_STORE)
    } catch (err) {
      console.error('[db] embeddingDB.clear failed:', err)
    }
  },
}

// ── tempDriftDB CRUD ──────────────────────────────────────────────────────────
// Durable mirror of driftStore.tempDriftConversations. Failures are swallowed
// + logged (never thrown) — losing a temp drift write must not break the panel.

export const tempDriftDB = {
  /** Load every unsaved drift conversation. */
  async getAll(): Promise<DBTempDrift[]> {
    try {
      const db = await getDB()
      return await db.getAll(TEMP_DRIFTS_STORE)
    } catch (err) {
      console.error('[db] tempDriftDB.getAll failed:', err)
      return []
    }
  },

  /** Insert or replace an unsaved drift conversation. */
  async put(rec: DBTempDrift): Promise<void> {
    try {
      const db = await getDB()
      await db.put(TEMP_DRIFTS_STORE, rec)
    } catch (err) {
      console.error(`[db] tempDriftDB.put(${rec.id}) failed:`, err)
    }
  },

  /** Delete an unsaved drift conversation by drift id. */
  async delete(id: string): Promise<void> {
    try {
      const db = await getDB()
      await db.delete(TEMP_DRIFTS_STORE, id)
    } catch (err) {
      console.error(`[db] tempDriftDB.delete(${id}) failed:`, err)
    }
  },

  /** Remove every unsaved drift conversation. */
  async clear(): Promise<void> {
    try {
      const db = await getDB()
      await db.clear(TEMP_DRIFTS_STORE)
    } catch (err) {
      console.error('[db] tempDriftDB.clear failed:', err)
    }
  },
}

// ── lensStateDB CRUD ──────────────────────────────────────────────────────────
// Durable mirror of the Connect cards/answers caches in driftStore. Failures
// are swallowed + logged (never thrown) — lens restore is best-effort.

export const lensStateDB = {
  /** Load every persisted lens-state record. */
  async getAll(): Promise<DBLensState[]> {
    try {
      const db = await getDB()
      return await db.getAll(LENS_STATE_STORE)
    } catch (err) {
      console.error('[db] lensStateDB.getAll failed:', err)
      return []
    }
  },

  /** Insert or replace a lens-state record. */
  async put(rec: DBLensState): Promise<void> {
    try {
      const db = await getDB()
      await db.put(LENS_STATE_STORE, rec)
    } catch (err) {
      console.error(`[db] lensStateDB.put(${rec.id}) failed:`, err)
    }
  },

  /** Delete a lens-state record by drift id. */
  async delete(id: string): Promise<void> {
    try {
      const db = await getDB()
      await db.delete(LENS_STATE_STORE, id)
    } catch (err) {
      console.error(`[db] lensStateDB.delete(${id}) failed:`, err)
    }
  },

  /** Remove every lens-state record. */
  async clear(): Promise<void> {
    try {
      const db = await getDB()
      await db.clear(LENS_STATE_STORE)
    } catch (err) {
      console.error('[db] lensStateDB.clear failed:', err)
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

export function msgToDB(msg: Message): DBMessage {
  return {
    ...msg,
    timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : String(msg.timestamp),
  }
}

export function msgFromDB(raw: DBMessage): Message {
  return {
    ...raw,
    timestamp: new Date(raw.timestamp),
  }
}
