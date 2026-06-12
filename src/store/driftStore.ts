/**
 * driftStore — owns the Drift panel state and temporary in-session drift conversations.
 *
 * Temp drift conversations (messages accumulated inside the Drift panel before
 * the user saves/pushes) are keyed by driftChatId. The in-memory Map is the
 * source of truth during the session; every write is mirrored to IndexedDB
 * (tempDriftDB) so an unsaved drift survives an app kill, and hydrated back
 * on startup via hydrateTempConversations().
 */

import { create } from 'zustand'
import type { DriftContext, Message } from '@/types/chat'
import { tempDriftDB, lensStateDB, msgToDB, msgFromDB } from '@/services/db'

function persistTempDrift(driftChatId: string, messages: Message[]) {
  tempDriftDB.put({
    id: driftChatId,
    messages: messages.map(msgToDB),
    updatedAt: new Date().toISOString(),
  })
}

function persistLensState(
  driftChatId: string,
  cards: string[] | undefined,
  answers: Record<string, Message[]> | undefined,
) {
  lensStateDB.put({
    id: driftChatId,
    cards,
    answers: answers
      ? Object.fromEntries(Object.entries(answers).map(([q, msgs]) => [q, msgs.map(msgToDB)]))
      : undefined,
    updatedAt: new Date().toISOString(),
  })
}

interface DriftStore {
  // ── State ──────────────────────────────────────────────────────────────────
  driftOpen: boolean
  driftExpanded: boolean
  driftContext: DriftContext

  /**
   * Temporary in-memory store for drift conversations.
   * Key: driftChatId  Value: messages accumulated during this session.
   */
  tempDriftConversations: Map<string, Message[]>

  /**
   * Connect-lens content per drift (suggestion cards + per-question answer
   * threads). Previously refs in App.tsx — lost on reload; now mirrored to
   * IndexedDB (lensStateDB) and hydrated on startup.
   */
  connectCards: Map<string, string[]>
  connectAnswers: Map<string, Record<string, Message[]>>

  // ── Actions ────────────────────────────────────────────────────────────────
  openDrift: (context: DriftContext) => void
  closeDrift: (driftMessages?: Message[]) => void
  expandDrift: (expanded: boolean) => void

  saveTempConversation: (driftChatId: string, messages: Message[]) => void
  getTempConversation: (driftChatId: string) => Message[] | undefined
  clearTempConversation: (driftChatId: string) => void
  hydrateTempConversations: () => Promise<void>

  setConnectCards: (driftChatId: string, cards: string[]) => void
  getConnectCards: (driftChatId: string) => string[] | undefined
  addConnectAnswer: (driftChatId: string, question: string, messages: Message[]) => void
  getConnectAnswers: (driftChatId: string) => Record<string, Message[]> | undefined
}

const EMPTY_CONTEXT: DriftContext = {
  selectedText: '',
  sourceMessageId: '',
  contextMessages: [],
}

export const useDriftStore = create<DriftStore>((set, get) => ({
  driftOpen: false,
  driftExpanded: false,
  driftContext: EMPTY_CONTEXT,
  tempDriftConversations: new Map(),
  connectCards: new Map(),
  connectAnswers: new Map(),

  // ── openDrift ──────────────────────────────────────────────────────────────
  openDrift(context: DriftContext) {
    set({ driftOpen: true, driftContext: context })
  },

  // ── closeDrift ─────────────────────────────────────────────────────────────
  closeDrift(driftMessages?: Message[]) {
    const { driftContext } = get()

    if (driftMessages && driftContext.driftChatId) {
      // Persist the closing conversation into temp storage so it can be
      // reopened later within the same session.
      set((state) => {
        const newMap = new Map(state.tempDriftConversations)
        newMap.set(driftContext.driftChatId!, driftMessages)
        return { driftOpen: false, tempDriftConversations: newMap }
      })
      persistTempDrift(driftContext.driftChatId, driftMessages)
    } else {
      set({ driftOpen: false })
    }
  },

  // ── expandDrift ────────────────────────────────────────────────────────────
  expandDrift(expanded: boolean) {
    set({ driftExpanded: expanded })
  },

  // ── saveTempConversation ───────────────────────────────────────────────────
  saveTempConversation(driftChatId: string, messages: Message[]) {
    set((state) => {
      const newMap = new Map(state.tempDriftConversations)
      newMap.set(driftChatId, messages)
      return { tempDriftConversations: newMap }
    })
    persistTempDrift(driftChatId, messages)
  },

  // ── getTempConversation ────────────────────────────────────────────────────
  getTempConversation(driftChatId: string): Message[] | undefined {
    return get().tempDriftConversations.get(driftChatId)
  },

  // ── clearTempConversation ──────────────────────────────────────────────────
  clearTempConversation(driftChatId: string) {
    set((state) => {
      const newMap = new Map(state.tempDriftConversations)
      newMap.delete(driftChatId)
      return { tempDriftConversations: newMap }
    })
    tempDriftDB.delete(driftChatId)
    // Connect content for a saved drift lives on its driftInfos from here on;
    // for a discarded drift it's gone either way.
    if (get().connectCards.has(driftChatId) || get().connectAnswers.has(driftChatId)) {
      set((state) => {
        const cards = new Map(state.connectCards)
        const answers = new Map(state.connectAnswers)
        cards.delete(driftChatId)
        answers.delete(driftChatId)
        return { connectCards: cards, connectAnswers: answers }
      })
      lensStateDB.delete(driftChatId)
    }
  },

  // ── hydrateTempConversations ───────────────────────────────────────────────
  // Restore unsaved drifts + Connect lens state persisted by a previous
  // session. In-memory entries win over stored ones (hydration normally runs
  // before any drift exists).
  async hydrateTempConversations() {
    const [stored, lensStates] = await Promise.all([tempDriftDB.getAll(), lensStateDB.getAll()])
    if (stored.length === 0 && lensStates.length === 0) return
    set((state) => {
      const newMap = new Map(state.tempDriftConversations)
      for (const rec of stored) {
        if (!newMap.has(rec.id)) {
          newMap.set(rec.id, rec.messages.map(msgFromDB))
        }
      }
      const cards = new Map(state.connectCards)
      const answers = new Map(state.connectAnswers)
      for (const rec of lensStates) {
        if (rec.cards?.length && !cards.has(rec.id)) cards.set(rec.id, rec.cards)
        if (rec.answers && !answers.has(rec.id)) {
          answers.set(
            rec.id,
            Object.fromEntries(
              Object.entries(rec.answers).map(([q, msgs]) => [q, msgs.map(msgFromDB)])
            )
          )
        }
      }
      return { tempDriftConversations: newMap, connectCards: cards, connectAnswers: answers }
    })
  },

  // ── Connect lens state ─────────────────────────────────────────────────────
  setConnectCards(driftChatId: string, cards: string[]) {
    set((state) => {
      const newMap = new Map(state.connectCards)
      newMap.set(driftChatId, cards)
      return { connectCards: newMap }
    })
    persistLensState(driftChatId, cards, get().connectAnswers.get(driftChatId))
  },

  getConnectCards(driftChatId: string): string[] | undefined {
    return get().connectCards.get(driftChatId)
  },

  addConnectAnswer(driftChatId: string, question: string, messages: Message[]) {
    set((state) => {
      const newMap = new Map(state.connectAnswers)
      newMap.set(driftChatId, { ...(newMap.get(driftChatId) ?? {}), [question]: messages })
      return { connectAnswers: newMap }
    })
    persistLensState(driftChatId, get().connectCards.get(driftChatId), get().connectAnswers.get(driftChatId))
  },

  getConnectAnswers(driftChatId: string): Record<string, Message[]> | undefined {
    return get().connectAnswers.get(driftChatId)
  },
}))
