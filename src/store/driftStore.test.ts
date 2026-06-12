/**
 * Kill-and-restore test for unsaved drift persistence.
 *
 * Simulates: user starts a drift → app is killed without saving →
 * app relaunches → hydrateTempConversations() restores the drift.
 * IndexedDB is backed by fake-indexeddb, which survives across the
 * simulated "kill" (only the in-memory store state is wiped).
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { useDriftStore } from './driftStore'
import { tempDriftDB } from '@/services/db'
import type { Message } from '@/types/chat'

const driftMessages: Message[] = [
  { id: 'm1', text: 'What is entropy?', isUser: true, timestamp: new Date('2026-06-12T10:00:00Z') },
  { id: 'm2', text: 'Entropy is a measure of disorder…', isUser: false, timestamp: new Date('2026-06-12T10:00:05Z') },
]

/** Simulate an app kill: wipe in-memory state, leave IndexedDB intact. */
function killApp() {
  useDriftStore.setState({ tempDriftConversations: new Map() })
}

async function flushWrites() {
  // persistTempDrift is fire-and-forget; let the microtask queue drain.
  await new Promise((r) => setTimeout(r, 50))
}

beforeEach(async () => {
  killApp()
  await tempDriftDB.clear()
})

describe('unsaved drift persistence', () => {
  it('restores an unsaved drift after an app kill', async () => {
    useDriftStore.getState().saveTempConversation('drift-temp-123', driftMessages)
    await flushWrites()

    killApp()
    expect(useDriftStore.getState().getTempConversation('drift-temp-123')).toBeUndefined()

    await useDriftStore.getState().hydrateTempConversations()
    const restored = useDriftStore.getState().getTempConversation('drift-temp-123')
    expect(restored).toHaveLength(2)
    expect(restored![0].text).toBe('What is entropy?')
    expect(restored![1].timestamp).toBeInstanceOf(Date)
    expect(restored![1].timestamp.toISOString()).toBe('2026-06-12T10:00:05.000Z')
  })

  it('persists drifts stashed via closeDrift', async () => {
    useDriftStore.getState().openDrift({
      selectedText: 'entropy',
      sourceMessageId: 'm0',
      contextMessages: [],
      driftChatId: 'drift-temp-456',
    })
    useDriftStore.getState().closeDrift(driftMessages)
    await flushWrites()

    killApp()
    await useDriftStore.getState().hydrateTempConversations()
    expect(useDriftStore.getState().getTempConversation('drift-temp-456')).toHaveLength(2)
  })

  it('clearTempConversation removes the durable copy too', async () => {
    useDriftStore.getState().saveTempConversation('drift-temp-789', driftMessages)
    await flushWrites()
    useDriftStore.getState().clearTempConversation('drift-temp-789')
    await flushWrites()

    killApp()
    await useDriftStore.getState().hydrateTempConversations()
    expect(useDriftStore.getState().getTempConversation('drift-temp-789')).toBeUndefined()
    expect(await tempDriftDB.getAll()).toHaveLength(0)
  })

  it('in-memory entries win over stored ones during hydration', async () => {
    useDriftStore.getState().saveTempConversation('drift-temp-abc', driftMessages)
    await flushWrites()

    const newer: Message[] = [...driftMessages, { id: 'm3', text: 'follow-up', isUser: true, timestamp: new Date() }]
    useDriftStore.setState({ tempDriftConversations: new Map([['drift-temp-abc', newer]]) })

    await useDriftStore.getState().hydrateTempConversations()
    expect(useDriftStore.getState().getTempConversation('drift-temp-abc')).toHaveLength(3)
  })
})
