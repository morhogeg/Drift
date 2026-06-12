/**
 * Drift managed-key proxy — REFERENCE IMPLEMENTATION (not production).
 *
 * Streams Gemini/OpenRouter completions using a SERVER-held key so users on the
 * Pro tier (or a free bundled allowance) never enter their own key. This file
 * is intentionally minimal and dependency-light (Node 22 built-ins only) so it
 * documents the contract the client expects; productionizing means adding the
 * pieces called out in docs/MANAGED_PROXY.md (real auth verification, a durable
 * quota store, billing webhooks, deployment).
 *
 * Run locally:  GEMINI_API_KEY=… node server/proxy.mjs
 * Then point the client at  VITE_PROXY_URL=http://localhost:8787
 *
 * Contract (matches src/services/proxyClient.ts):
 *   POST /v1/stream
 *     headers: Authorization: Bearer <firebase-id-token>
 *     body:    { provider: 'gemini'|'openrouter', model, messages, system? }
 *     resp:    text/event-stream of {delta} then {done:true}, or 402 over quota
 */

import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 8787)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? ''
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? ''

// ── Quota (in-memory placeholder) ──────────────────────────────────────────
// PROD: replace with Firestore/Redis keyed by verified uid; reset on billing
// period. Free tier gets FREE_DAILY; Pro is effectively unlimited (soft cap).
const FREE_DAILY = 25
const usage = new Map() // uid -> { count, day }

function today() {
  // Server-local date string; PROD should use the user's billing anchor.
  return new Date().toISOString().slice(0, 10)
}

function checkAndIncrement(uid, isPro) {
  if (isPro) return true
  const rec = usage.get(uid)
  const day = today()
  if (!rec || rec.day !== day) {
    usage.set(uid, { count: 1, day })
    return true
  }
  if (rec.count >= FREE_DAILY) return false
  rec.count++
  return true
}

// ── Auth (placeholder) ──────────────────────────────────────────────────────
// PROD: verify the Firebase ID token with firebase-admin and read a custom
// claim (or a Firestore doc) for the subscription tier. Here we only decode the
// unverified payload so the shape is exercised end-to-end — NOT secure.
function decodeUid(authHeader) {
  const token = (authHeader ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    const [, payload] = token.split('.')
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return { uid: json.user_id ?? json.sub ?? 'anon', isPro: Boolean(json.pro) }
  } catch {
    return null
  }
}

async function streamGemini(res, { model, messages, system }) {
  const contents = messages.map((m) => ({
    role: m.isUser ? 'user' : 'model',
    parts: [{ text: m.text }],
  }))
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    }),
  })
  await pipeSSE(upstream, res, (obj) => obj?.candidates?.[0]?.content?.parts?.[0]?.text ?? '')
}

async function streamOpenRouter(res, { model, messages, system }) {
  const msgs = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...messages.map((m) => ({ role: m.isUser ? 'user' : 'assistant', content: m.text })),
  ]
  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({ model, messages: msgs, stream: true }),
  })
  await pipeSSE(upstream, res, (obj) => obj?.choices?.[0]?.delta?.content ?? '')
}

/** Read an upstream SSE body, extract deltas, re-emit our own SSE frames. */
async function pipeSSE(upstream, res, extract) {
  if (!upstream.ok || !upstream.body) {
    res.write(`data: ${JSON.stringify({ error: `upstream ${upstream.status}` })}\n\n`)
    res.end()
    return
  }
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const delta = extract(JSON.parse(data))
        if (delta) res.write(`data: ${JSON.stringify({ delta })}\n\n`)
      } catch {
        /* ignore keep-alives / partial frames */
      }
    }
  }
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
  res.end()
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors()).end()
    return
  }
  if (req.method !== 'POST' || req.url !== '/v1/stream') {
    res.writeHead(404, cors()).end()
    return
  }

  const auth = decodeUid(req.headers['authorization'])
  if (!auth) {
    res.writeHead(401, cors()).end(JSON.stringify({ error: 'unauthorized' }))
    return
  }

  let body = ''
  for await (const chunk of req) body += chunk
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    res.writeHead(400, cors()).end(JSON.stringify({ error: 'bad json' }))
    return
  }

  if (!checkAndIncrement(auth.uid, auth.isPro)) {
    res.writeHead(402, cors()).end(JSON.stringify({ error: 'quota_exceeded', upgrade: true }))
    return
  }

  res.writeHead(200, { ...cors(), 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  try {
    if (parsed.provider === 'openrouter') await streamOpenRouter(res, parsed)
    else await streamGemini(res, parsed)
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
    res.end()
  }
})

function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  }
}

server.listen(PORT, () => console.log(`[proxy] listening on :${PORT}`))
