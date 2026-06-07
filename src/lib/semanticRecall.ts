/**
 * semanticRecall — the layer that connects ideas by *meaning*, not spelling.
 *
 * termIndex.ts is lexical only: it matches normalized strings + substrings, so
 * "PSG" never links to "Paris Saint-Germain" and "Messi" never links to "the
 * Argentine forward". This module ranks drifts by embedding cosine similarity
 * and MERGES that with the lexical results so the existing consumers
 * (DriftPanel, SearchModal) need no shape change — they still receive
 * `TermOccurrence[]`, lexical matches first, semantic-only matches appended.
 *
 * Pure: no DB, no React. Callers supply the query vector + candidate vectors.
 */

import type { TermOccurrence } from './termIndex'
import { cosineSimilarity } from '../services/embeddings'

/**
 * Minimum cosine similarity for a semantic-only match to count. Calibrated to
 * gemini-embedding-001 at 768 dims (reduced-dim output is NOT renormalized, so
 * its cosines compress vs. a normalized model). Empirically (see
 * scripts/test-embeddings.mjs): genuinely related concepts score ~0.55–0.75
 * ("Messi"↔"Lionel Messi the Argentine forward" = 0.75, "Messi"↔"PSG" = 0.64)
 * while unrelated topics sit ~0.43–0.49 ("Messi"↔"photosynthesis" = 0.49).
 * 0.62 cleanly separates related from unrelated for this model.
 */
export const SEMANTIC_THRESHOLD = 0.62

/** A drift's cached vector, paired with its id. */
export interface SemanticCandidate {
  driftChatId: string
  vec: number[]
}

/** A semantic neighbor: a drift id and how close it scored. */
export interface SemanticMatch {
  driftChatId: string
  score: number
}

/**
 * Rank candidates by cosine similarity to `queryVec`, keeping only those above
 * SEMANTIC_THRESHOLD, sorted high→low. Excludes `excludeDriftChatId` (self).
 */
export function rankBySemanticSimilarity(
  queryVec: number[],
  candidates: SemanticCandidate[],
  excludeDriftChatId?: string,
  threshold: number = SEMANTIC_THRESHOLD,
): SemanticMatch[] {
  if (!queryVec || queryVec.length === 0) return []

  const out: SemanticMatch[] = []
  for (const cand of candidates) {
    if (cand.driftChatId === excludeDriftChatId) continue
    if (!cand.vec || cand.vec.length === 0) continue
    const score = cosineSimilarity(queryVec, cand.vec)
    if (score >= threshold) out.push({ driftChatId: cand.driftChatId, score })
  }

  out.sort((a, b) => b.score - a.score)
  return out
}

/**
 * Merge lexical `findRelatedDrifts` output with semantic neighbors.
 *
 * Lexical exact/substring matches are authoritative and always come first, in
 * their original order. Semantic-only matches (not already present lexically)
 * are appended in descending similarity order. De-duped by driftChatId.
 *
 * `resolve` turns a semantic-only driftChatId into a TermOccurrence (the caller
 * knows how to look up the drift's title/term/parent from chat history). If it
 * returns undefined the match is dropped — keeps the shape contract intact.
 */
export function mergeLexicalAndSemantic(
  lexical: TermOccurrence[],
  semantic: SemanticMatch[],
  resolve: (driftChatId: string) => TermOccurrence | undefined,
): TermOccurrence[] {
  const seen = new Set<string>()
  const out: TermOccurrence[] = []

  for (const occ of lexical) {
    if (seen.has(occ.driftChatId)) continue
    seen.add(occ.driftChatId)
    out.push(occ)
  }

  for (const match of semantic) {
    if (seen.has(match.driftChatId)) continue
    const occ = resolve(match.driftChatId)
    if (!occ) continue
    seen.add(match.driftChatId)
    out.push(occ)
  }

  return out
}
