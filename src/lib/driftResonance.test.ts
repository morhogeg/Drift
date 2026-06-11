import { describe, it, expect } from 'vitest'
import { computeResonance, type ResonanceNode } from './driftResonance'

// SEMANTIC_THRESHOLD is 0.62. Build vectors with easy cosine values:
//   [1,0]·[1,0] = 1.0   (linked)
//   [1,0]·[0,1] = 0.0   (not linked)
//   [1,1]·[1,0] ≈ 0.707 (linked)
const node = (id: string, term: string, ancestorIds: string[] = []): ResonanceNode => ({ id, term, ancestorIds })

describe('computeResonance', () => {
  it('links two unrelated drifts whose embeddings are similar', () => {
    const nodes = [node('a', 'Messi'), node('b', 'Maradona')]
    const vecs = new Map([['a', [1, 0]], ['b', [1, 0]]])
    const pairs = computeResonance(nodes, vecs)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({ a: 'a', b: 'b' })
    expect(pairs[0].score).toBeCloseTo(1, 5)
  })

  it('drops pairs below threshold and pairs that are lens views of the same term', () => {
    const nodes = [
      node('a', 'Messi'),       // dissimilar to b
      node('b', 'Maradona'),
      node('c', 'Messi'),       // same term as a → lens-view dedupe even if similar
    ]
    const vecs = new Map([['a', [1, 0]], ['b', [0, 1]], ['c', [1, 0]]])
    const pairs = computeResonance(nodes, vecs)
    expect(pairs).toHaveLength(0)
  })

  it('excludes pairs already connected by lineage (ancestor/descendant)', () => {
    const nodes = [node('parent', 'Football'), node('child', 'Dribbling', ['parent'])]
    const vecs = new Map([['parent', [1, 0]], ['child', [1, 0]]]) // identical → would link if not lineage
    expect(computeResonance(nodes, vecs)).toHaveLength(0)
  })

  it('respects the per-node and global edge caps, keeping the highest scores', () => {
    // 'hub' is similar to a, b, c; with maxPerNode=2 only the 2 best survive.
    const nodes = [node('hub', 'Hub'), node('a', 'A'), node('b', 'B'), node('c', 'C')]
    const vecs = new Map<string, number[]>([
      ['hub', [1, 0]],
      ['a', [1, 0]],       // score 1.0
      ['b', [0.95, 0.05]], // ~0.998
      ['c', [1, 1]],       // ~0.707
    ])
    const pairs = computeResonance(nodes, vecs, { maxPerNode: 2, maxEdges: 8 })
    const hubLinks = pairs.filter(p => p.a === 'hub' || p.b === 'hub')
    expect(hubLinks).toHaveLength(2)
    // the dropped one should be the weakest (c)
    expect(hubLinks.some(p => p.a === 'c' || p.b === 'c')).toBe(false)
  })
})
