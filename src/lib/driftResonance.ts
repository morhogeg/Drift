/**
 * driftResonance — the pure core of the knowledge graph's "resonance" links.
 *
 * Lineage edges show where a thought CAME FROM (parent→child). Resonance edges
 * show which drifts landed in the same conceptual water by different paths:
 * pairs whose answer embeddings are similar above SEMANTIC_THRESHOLD, but which
 * are NOT already related by lineage and are NOT just lens views of the same term.
 *
 * Extracted from DriftKnowledgeGraph so BOTH the map (dashed arcs) and the
 * outline ("↔ also relates to" chips) compute identical links from one place.
 * Pure + side-effect free so it's unit-testable without React or IndexedDB.
 */
import { cosineSimilarity } from '@/services/embeddings'
import { SEMANTIC_THRESHOLD } from '@/lib/semanticRecall'
import { normalizeTerm } from '@/lib/termIndex'

export interface ResonancePair { a: string; b: string; score: number }

/** A drift reduced to just what resonance needs: its id, its term (for lens-view
 *  dedupe), and the ids of all its ancestors (for lineage exclusion). */
export interface ResonanceNode {
  id: string
  /** Raw term/title; normalized internally so "Messi" === "messi". */
  term: string
  /** Ids of every ancestor up the parent chain. */
  ancestorIds: string[]
}

export interface ResonanceOptions {
  threshold?: number
  maxEdges?: number
  maxPerNode?: number
  /** Injectable for tests; defaults to cosine similarity. */
  similarity?: (a: number[], b: number[]) => number
}

export const RESONANCE_MAX_EDGES = 8
export const RESONANCE_MAX_PER_NODE = 2

/**
 * Find the strongest semantic links between drifts that aren't already connected
 * by the tree. Greedy: keep the highest-scoring pairs first, capped globally
 * (maxEdges) and per node (maxPerNode) so the view stays legible.
 */
export function computeResonance(
  nodes: ResonanceNode[],
  vecById: Map<string, number[]>,
  opts: ResonanceOptions = {},
): ResonancePair[] {
  const threshold = opts.threshold ?? SEMANTIC_THRESHOLD
  const maxEdges = opts.maxEdges ?? RESONANCE_MAX_EDGES
  const maxPerNode = opts.maxPerNode ?? RESONANCE_MAX_PER_NODE
  const sim = opts.similarity ?? cosineSimilarity

  if (nodes.length < 2) return []

  const pairs: ResonancePair[] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const A = nodes[i], B = nodes[j]
      const va = vecById.get(A.id), vb = vecById.get(B.id)
      if (!va || !vb) continue
      // Lens threads on one term are near-identical embeddings — linking
      // "Simplify: X" to "Deep dive: X" is noise, not insight.
      const ta = normalizeTerm(A.term || '')
      if (ta && ta === normalizeTerm(B.term || '')) continue
      // Lineage already draws a river between these two.
      if (A.ancestorIds.includes(B.id) || B.ancestorIds.includes(A.id)) continue
      const score = sim(va, vb)
      if (score >= threshold) pairs.push({ a: A.id, b: B.id, score })
    }
  }
  pairs.sort((x, y) => y.score - x.score)

  const perNode = new Map<string, number>()
  const kept: ResonancePair[] = []
  for (const p of pairs) {
    if (kept.length >= maxEdges) break
    if ((perNode.get(p.a) ?? 0) >= maxPerNode) continue
    if ((perNode.get(p.b) ?? 0) >= maxPerNode) continue
    kept.push(p)
    perNode.set(p.a, (perNode.get(p.a) ?? 0) + 1)
    perNode.set(p.b, (perNode.get(p.b) ?? 0) + 1)
  }
  return kept
}
