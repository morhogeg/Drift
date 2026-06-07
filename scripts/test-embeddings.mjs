/**
 * Standalone live self-test for the Gemini embeddings endpoint.
 *
 * Mirrors the exact endpoint/body shape used by src/services/embeddings.ts.
 * Proves end-to-end that the live endpoint + cosine similarity behave: related
 * concepts score clearly higher than an unrelated topic.
 *
 * Run: node scripts/test-embeddings.mjs
 * Reads VITE_GEMINI_API_KEY from .env. Never prints the key.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(__dirname, '..', '.env')

const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_MODEL_PATH = `models/${EMBEDDING_MODEL}`
const EMBEDDING_DIM = 768
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function readEnvKey() {
  let raw
  try {
    raw = readFileSync(ENV_PATH, 'utf8')
  } catch {
    console.error('FAIL: could not read .env at', ENV_PATH)
    process.exit(1)
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*VITE_GEMINI_API_KEY\s*=\s*(.+?)\s*$/)
    if (m) return m[1].replace(/^["']|["']$/g, '')
  }
  return ''
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

async function embedTexts(texts, apiKey) {
  const url = `${GEMINI_BASE}/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`
  const body = {
    requests: texts.map((text) => ({
      model: EMBEDDING_MODEL_PATH,
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIM,
    })),
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status))
    throw new Error(`embeddings HTTP ${res.status}: ${errText}`)
  }
  const json = await res.json()
  return (json.embeddings || []).map((e) => e.values)
}

async function main() {
  const apiKey = readEnvKey()
  if (!apiKey) {
    console.error('FAIL: VITE_GEMINI_API_KEY not found in .env')
    process.exit(1)
  }

  const texts = [
    'Messi',
    'Lionel Messi the Argentine forward',
    'Paris Saint-Germain',
    'photosynthesis in plants',
  ]

  const vecs = await embedTexts(texts, apiKey)
  if (vecs.length !== texts.length || vecs.some((v) => !Array.isArray(v) || v.length === 0)) {
    console.error('FAIL: did not get one valid vector per input')
    process.exit(1)
  }

  console.log(`Model: ${EMBEDDING_MODEL}  |  Dimension: ${vecs[0].length}`)
  console.log('\nCosine similarity matrix:')
  const labels = ['Messi', 'Messi(Argentine fwd)', 'PSG', 'photosynthesis']
  const pad = (s, n) => String(s).padEnd(n)
  console.log(pad('', 22) + labels.map((l) => pad(l, 22)).join(''))
  for (let i = 0; i < vecs.length; i++) {
    let row = pad(labels[i], 22)
    for (let j = 0; j < vecs.length; j++) {
      row += pad(cosineSimilarity(vecs[i], vecs[j]).toFixed(4), 22)
    }
    console.log(row)
  }

  const simMessiArgentine = cosineSimilarity(vecs[0], vecs[1])
  const simMessiPSG = cosineSimilarity(vecs[0], vecs[2])
  const simMessiPhoto = cosineSimilarity(vecs[0], vecs[3])

  console.log('\nAssertions:')
  console.log(`  sim(Messi, Argentine forward) = ${simMessiArgentine.toFixed(4)}`)
  console.log(`  sim(Messi, PSG)               = ${simMessiPSG.toFixed(4)}`)
  console.log(`  sim(Messi, photosynthesis)    = ${simMessiPhoto.toFixed(4)}`)

  const pass =
    simMessiArgentine > simMessiPhoto &&
    simMessiPSG > simMessiPhoto

  console.log(`\n${pass ? 'PASS' : 'FAIL'}: related concepts ${pass ? 'are' : 'are NOT'} clearly closer to "Messi" than photosynthesis.`)
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
