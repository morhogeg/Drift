import { describe, it, expect } from 'vitest'
import { buildSampleExploration, isSampleChat, SAMPLE_ROOT_ID } from './sampleExploration'

describe('sampleExploration', () => {
  const chats = buildSampleExploration()
  const root = chats.find((c) => c.id === SAMPLE_ROOT_ID)!
  const drifts = chats.filter((c) => c.metadata?.isDrift)
  const rootAi = root.messages.find((m) => !m.isUser && m.hasDrift)!

  it('builds a root plus three drift chats', () => {
    expect(root).toBeDefined()
    expect(drifts).toHaveLength(3)
  })

  it('flags every seeded chat as a sample', () => {
    expect(chats.every(isSampleChat)).toBe(true)
  })

  it('includes a synthesis message on the root so the Synthesis UI renders', () => {
    expect(root.messages.some((m) => m.id.startsWith('synth-'))).toBe(true)
  })

  it('roots every drift under the sample root + its drifted answer', () => {
    for (const d of drifts) {
      expect(d.metadata?.parentChatId).toBe(SAMPLE_ROOT_ID)
      expect(d.metadata?.sourceMessageId).toBe(rootAi.id)
      expect(d.metadata?.selectedText).toBeTruthy()
    }
  })

  it('renders inline drift links: every drifted term appears verbatim in the answer', () => {
    // The link injector matches driftInfos[].selectedText against the message body,
    // so a mismatch would silently drop the inline link. Guard that invariant.
    for (const info of rootAi.driftInfos ?? []) {
      expect(rootAi.text).toContain(info.selectedText)
      // and the drift it points at actually exists
      expect(drifts.some((d) => d.id === info.driftChatId)).toBe(true)
    }
    expect(rootAi.driftInfos).toHaveLength(3)
  })
})
