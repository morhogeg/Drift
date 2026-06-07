/**
 * Gemini embeddings infrastructure — pure, dependency-free, side-effect free.
 *
 * Reuses the same Gemini host/key as gemini.ts (no new service). Calls the
 * batch embeddings endpoint so we can embed many drifts in one round-trip.
 * Everything degrades gracefully: on any error/timeout we return [] so the
 * semantic layer never breaks or hangs the app — callers fall back to lexical.
 *
 * No DB, no React imports here on purpose: this file is unit-testable in
 * isolation (see scripts/test-embeddings.mjs which mirrors this exact shape).
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * The embedding model + its output dimension, exported for callers/tests.
 * `gemini-embedding-001` is the model surfaced by ListModels on this key
 * (text-embedding-004 returns 404 here). Its native dim is 3072; we request a
 * reduced 768-dim output via `outputDimensionality` to keep the IDB vector
 * cache compact — cosine similarity still ranks correctly at 768.
 */
export const EMBEDDING_MODEL = 'gemini-embedding-001'
/** Gemini requires the fully-qualified model id in batch request bodies. */
export const EMBEDDING_MODEL_PATH = `models/${EMBEDDING_MODEL}`
/** Reduced output dimension we request (model default is 3072). */
export const EMBEDDING_DIM = 768

/** Gemini caps batchEmbedContents at 100 requests per call. */
const MAX_BATCH = 100
const TIMEOUT_MS = 8000

interface BatchEmbedResponse {
  embeddings?: Array<{ values?: number[] }>
}

/**
 * Embed a list of texts. Returns one vector per input, in order. Chunks inputs
 * to ≤100 per request. On ANY error/timeout (no key, offline, API error) the
 * whole call resolves to `[]` — callers must treat an empty result as "no
 * semantic layer available" and fall back to lexical behavior.
 */
export async function embedTexts(
  texts: string[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<number[][]> {
  if (!apiKey?.trim() || texts.length === 0) return []

  try {
    const out: number[][] = []

    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const chunk = texts.slice(i, i + MAX_BATCH)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
      // Honor an external abort (e.g. component unmount) in addition to timeout.
      const onAbort = () => controller.abort()
      signal?.addEventListener('abort', onAbort)

      const url = `${GEMINI_BASE}/${EMBEDDING_MODEL}:batchEmbedContents`
      const body = {
        requests: chunk.map((text) => ({
          model: EMBEDDING_MODEL_PATH,
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIM,
        })),
      }

      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
        signal?.removeEventListener('abort', onAbort)
      }

      if (!response.ok) return []

      const json = (await response.json()) as BatchEmbedResponse
      const embeddings = json?.embeddings
      if (!Array.isArray(embeddings) || embeddings.length !== chunk.length) return []

      for (const e of embeddings) {
        const values = e?.values
        if (!Array.isArray(values) || values.length === 0) return []
        out.push(values)
      }
    }

    return out
  } catch {
    return []
  }
}

/**
 * Standard cosine similarity in [-1, 1]. Guards against zero-vectors and
 * length mismatches by returning 0 (treated as "no similarity").
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
