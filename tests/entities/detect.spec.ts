import { describe, it, expect } from 'vitest'
import { detectEntities, resolveCandidates } from '../../src/services/entities/indexer'

describe('detectEntities', () => {
  it('detects Title Case names and possessives', async () => {
    const text = "Richard J. Evans's book on the Third Reich"
    const cands = await detectEntities(text, 'm1')
    expect(cands.length).toBeGreaterThan(0)
    expect(cands.some(c => c.type === 'person')).toBe(true)
  })
})

