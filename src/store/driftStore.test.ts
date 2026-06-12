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
import { tempDriftDB, lensStateDB } from '@/services/db'
import type { Message } from '@/types/chat'

const driftMessages: Message[] = [
  { id: 'm1', text: 'What is entropy?', isUser: true, timestamp: new Date('2026-06-12T10:00:00Z') },
  { id: 'm2', text: 'Entropy is a measure of disorder…', isUser: false, timestamp: new Date('2026-06-12T10:00:05Z') },
]

/** Simulate an app kill: wipe in-memory state, leave IndexedDB intact. */
function killApp() {
  useDriftStore.setState({
    tempDriftConversations: new Map(),
    connectCards: new Map(),
    connectAnswers: new Map(),
  })
}

async function flushWrites() {
  // persistTempDrift is fire-and-forget; let the microtask queue drain.
  await new Promise((r) => setTimeout(r, 50))
}

beforeEach(async () => {
  killApp()
  await tempDriftDB.clear()
  await lensStateDB.clear()
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

describe('Connect lens-state persistence', () => {
  it('restores Connect cards and answers after an app kill', async () => {
    const s = useDriftStore.getState()
    s.setConnectCards('drift-temp-c1', ['How does X relate to Y?', 'Where else did this appear?'])
    s.addConnectAnswer('drift-temp-c1', 'How does X relate to Y?', driftMessages)
    await flushWrites()

    killApp()
    expect(useDriftStore.getState().getConnectCards('drift-temp-c1')).toBeUndefined()

    await useDriftStore.getState().hydrateTempConversations()
    const cards = useDriftStore.getState().getConnectCards('drift-temp-c1')
    const answers = useDriftStore.getState().getConnectAnswers('drift-temp-c1')
    expect(cards).toHaveLength(2)
    expect(answers!['How does X relate to Y?']).toHaveLength(2)
    expect(answers!['How does X relate to Y?'][0].timestamp).toBeInstanceOf(Date)
  })

  it('clearTempConversation removes lens state too', async () => {
    const s = useDriftStore.getState()
    s.setConnectCards('drift-temp-c2', ['card'])
    await flushWrites()
    s.clearTempConversation('drift-temp-c2')
    await flushWrites()

    killApp()
    await useDriftStore.getState().hydrateTempConversations()
    expect(useDriftStore.getState().getConnectCards('drift-temp-c2')).toBeUndefined()
    expect(await lensStateDB.getAll()).toHaveLength(0)
  })

  it('accumulates multiple answers per drift', async () => {
    const s = useDriftStore.getState()
    s.addConnectAnswer('drift-temp-c3', 'Q1', driftMessages)
    s.addConnectAnswer('drift-temp-c3', 'Q2', driftMessages.slice(0, 1))
    await flushWrites()

    killApp()
    await useDriftStore.getState().hydrateTempConversations()
    const answers = useDriftStore.getState().getConnectAnswers('drift-temp-c3')
    expect(Object.keys(answers!)).toEqual(['Q1', 'Q2'])
    expect(answers!['Q2']).toHaveLength(1)
  })
})
