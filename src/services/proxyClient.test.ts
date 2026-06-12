import { describe, it, expect, vi, afterEach } from 'vitest'
import { streamViaProxy, QuotaExceededError, isProxyEnabled } from './proxyClient'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function sseResponse(frames: string[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      for (const f of frames) controller.enqueue(enc.encode(f))
      controller.close()
    },
  })
  return new Response(status === 200 ? body : null, { status })
}

const req = { provider: 'gemini' as const, model: 'm', messages: [{ isUser: true, text: 'hi' }] }

describe('proxyClient', () => {
  it('is inert without VITE_PROXY_URL', () => {
    // No env in test → disabled, and streaming throws rather than calling out.
    expect(isProxyEnabled()).toBe(false)
  })

  it('yields deltas and stops on done (with PROXY_URL stubbed)', async () => {
    vi.stubEnv('VITE_PROXY_URL', 'https://proxy.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          'data: {"delta":"Hel"}\n\n',
          'data: {"delta":"lo"}\n\ndata: {"done":true}\n\n',
        ])
      )
    )
    expect(isProxyEnabled()).toBe(true)
    const out: string[] = []
    for await (const d of streamViaProxy(req, 'tok')) out.push(d)
    expect(out.join('')).toBe('Hello')
  })

  it('throws QuotaExceededError on 402', async () => {
    vi.stubEnv('VITE_PROXY_URL', 'https://proxy.test')
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([], 402)))
    await expect(async () => {
      for await (const _ of streamViaProxy(req, 'tok')) { /* drain */ }
    }).rejects.toBeInstanceOf(QuotaExceededError)
  })
})
