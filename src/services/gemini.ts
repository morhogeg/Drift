/**
 * Google Gemini API client with streaming support.
 *
 * Uses the Gemini REST API directly (no SDK) for full Vite/browser compat.
 * Streaming via SSE with alt=sse query param.
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const GEMINI_MODELS = {
  FLASH_LITE_PREVIEW: 'gemini-3.1-flash-lite-preview',
  FLASH_PREVIEW: 'gemini-3-flash-preview',
  FLASH_25: 'gemini-2.5-flash',
  FLASH_20: 'gemini-2.0-flash',
} as const

export type GeminiModel = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS]

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// ── Format conversion ────────────────────────────────────────────────────────

interface GeminiPart { text: string }
interface GeminiContent { role: 'user' | 'model'; parts: GeminiPart[] }

/**
 * Convert OpenAI-style messages to Gemini contents + systemInstruction.
 * Gemini only accepts alternating user/model turns — consecutive same-role
 * messages are merged.
 */
function toGeminiContents(messages: ChatMessage[]): {
  contents: GeminiContent[]
  systemInstruction?: { parts: GeminiPart[] }
} {
  const systemParts: GeminiPart[] = []
  const contents: GeminiContent[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push({ text: msg.content })
      continue
    }

    const role: 'user' | 'model' = msg.role === 'user' ? 'user' : 'model'
    const last = contents[contents.length - 1]

    if (last && last.role === role) {
      // Merge consecutive same-role messages (Gemini rejects them)
      last.parts.push({ text: msg.content })
    } else {
      contents.push({ role, parts: [{ text: msg.content }] })
    }
  }

  // Gemini requires the last message to be from the user
  if (contents.length && contents[contents.length - 1].role === 'model') {
    contents.push({ role: 'user', parts: [{ text: '' }] })
  }

  return {
    contents,
    systemInstruction: systemParts.length ? { parts: systemParts } : undefined,
  }
}

// ── Connection check ─────────────────────────────────────────────────────────

export async function checkGeminiConnection(
  apiKey: string,
  model: GeminiModel = GEMINI_MODELS.FLASH_LITE_PREVIEW,
): Promise<boolean> {
  if (!apiKey?.trim()) return false

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 6000)

    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey.trim()}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    return response.ok
  } catch (err) {
    if (err instanceof Error && err.name !== 'AbortError') {
      console.error('[gemini] checkGeminiConnection error:', err)
    }
    return false
  }
}

// ── Streaming ────────────────────────────────────────────────────────────────

export async function sendMessageToGemini(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  apiKey: string,
  signal?: AbortSignal,
  model: GeminiModel = GEMINI_MODELS.FLASH_LITE_PREVIEW,
  useGrounding = true,
): Promise<void> {
  if (!apiKey?.trim()) {
    throw new Error('Gemini API key not configured. Please set it in Settings.')
  }

  const { contents, systemInstruction } = toGeminiContents(messages)

  const url = `${GEMINI_BASE}/${model}:streamGenerateContent?key=${apiKey.trim()}&alt=sse`

  const body: Record<string, unknown> = {
    contents,
    // Google Search grounding — model decides when to search
    ...(useGrounding && { tools: [{ google_search: {} }] }),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  }
  if (systemInstruction) body.systemInstruction = systemInstruction

  const doFetch = (b: Record<string, unknown>) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
      signal,
    })

  let response: Response
  try {
    response = await doFetch(body)

    // If grounding caused a 400 specifically about tools/search, retry without it
    if (!response.ok && response.status === 400 && useGrounding) {
      const errBody = await response.clone().text().catch(() => '')
      console.warn('[gemini] 400 with grounding:', errBody)
      // Only strip grounding if the error is about the tool itself
      if (errBody.includes('google_search') || errBody.includes('tool') || errBody.includes('INVALID_ARGUMENT')) {
        console.warn('[gemini] Retrying without google_search grounding')
        const { tools: _tools, ...bodyWithoutGrounding } = body as any
        response = await doFetch(bodyWithoutGrounding)
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return
    throw err
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => String(response.status))
    throw new Error(`Gemini API error ${response.status}: ${errText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('Gemini: no response body')

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') return

        try {
          const json = JSON.parse(data)
          const text: string | undefined =
            json?.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) onChunk(text)
        } catch {
          // Partial / non-JSON line — skip
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return
    throw err
  } finally {
    reader.releaseLock()
  }
}
