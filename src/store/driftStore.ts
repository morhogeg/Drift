/**
 * driftStore — owns the Drift panel state and temporary in-session drift conversations.
 *
 * Temp drift conversations (messages accumulated inside the Drift panel before
 * the user saves/pushes) are keyed by driftChatId and live only in memory for
 * the current session.
 */

import { create } from 'zustand'
import type { DriftContext, Message } from '@/types/chat'

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

  // ── Actions ────────────────────────────────────────────────────────────────
  openDrift: (context: DriftContext) => void
  closeDrift: (driftMessages?: Message[]) => void
  expandDrift: (expanded: boolean) => void

  saveTempConversation: (driftChatId: string, messages: Message[]) => void
  getTempConversation: (driftChatId: string) => Message[] | undefined
  clearTempConversation: (driftChatId: string) => void
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
  },
}))
