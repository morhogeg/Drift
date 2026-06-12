/**
 * proxyClient — optional managed-key streaming.
 *
 * When VITE_PROXY_URL is set, Drift can stream completions through Drift's own
 * server (server/proxy.mjs) using a server-held key, so Pro users (or a free
 * allowance) never enter their own key. When unset, this module is inert and
 * the app uses the existing BYOK paths in gemini.ts / openrouter.ts.
 *
 * This is the CLIENT half of the contract; productionizing the server is
 * tracked in docs/MANAGED_PROXY.md and ACTION_PLAN item 8.
 */

const proxyUrl = () => (import.meta.env.VITE_PROXY_URL as string | undefined) || undefined

export const isProxyEnabled = () => Boolean(proxyUrl())

export interface ProxyMessage {
  isUser: boolean
  text: string
}

export interface ProxyRequest {
  provider: 'gemini' | 'openrouter'
  model: string
  messages: ProxyMessage[]
  system?: string
}

export class QuotaExceededError extends Error {
  constructor() {
    super('quota_exceeded')
    this.name = 'QuotaExceededError'
  }
}

/**
 * Stream a completion through the managed proxy, yielding text deltas.
 * `idToken` is the Firebase ID token identifying (and authorizing) the user.
 * Throws QuotaExceededError on 402 so the UI can surface an upgrade prompt.
 */
export async function* streamViaProxy(
  req: ProxyRequest,
  idToken: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const base = proxyUrl()
  if (!base) throw new Error('proxy not configured')

  const resp = await fetch(`${base}/v1/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
    body: JSON.stringify(req),
    signal,
  })

  if (resp.status === 402) throw new QuotaExceededError()
  if (!resp.ok || !resp.body) throw new Error(`proxy error ${resp.status}`)

  const reader = resp.body.getReader()
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
      if (!data) continue
      const obj = JSON.parse(data)
      if (obj.error) throw new Error(obj.error)
      if (obj.done) return
      if (obj.delta) yield obj.delta as string
    }
  }
}
