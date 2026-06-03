/**
 * Google Gemini API client with streaming support.
 *
 * Uses the Gemini REST API directly (no SDK) for full Vite/browser compat.
 * Streaming via SSE with alt=sse query param.
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const GEMINI_MODELS = {
  FLASH_LITE_PREVIEW: 'gemini-3.1-flash-lite',
  FLASH_PREVIEW: 'gemini-3.5-flash',
  FLASH_25: 'gemini-2.5-flash',
  FLASH_20: 'gemini-2.5-flash-lite',
} as const

export type GeminiModel = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS]

/**
 * Appended to every prompt so AI output matches the user's language. Auto-generated
 * artifacts (suggestions, connections, synthesis, drift answers) otherwise drift to
 * English because the system prompts themselves are English.
 */
export const LANGUAGE_DIRECTIVE =
  'LANGUAGE: Write ALL output in the same language as the user\'s text / the source content provided (e.g. Hebrew→Hebrew, English→English, Arabic→Arabic). This applies to every string you produce — responses, suggestions, questions, labels, and JSON string values alike. Names too: write people, places, teams, works and every other proper noun in that language\'s OWN script, transliterating foreign names into it (for a Hebrew chat: "Johan Cruyff"→"יוהאן קרויף", "Real Madrid"→"ריאל מדריד", "Catalan nationalism"→"לאומיות קטלאנית"). Do NOT leave Latin-script words sitting inside otherwise Hebrew/Arabic/Cyrillic/etc. text. Only code, file paths, URLs, math symbols and units keep their original form.'

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

// ── Suggested highlights ──────────────────────────────────────────────────────

/**
 * Ask Gemini to identify 2–4 short phrases from a response that are worth
 * exploring deeper. Returns an empty array on any error — this is non-critical.
 */
export async function getSuggestedHighlights(
  responseText: string,
  apiKey: string,
  model: string = GEMINI_MODELS.FLASH_LITE_PREVIEW,
): Promise<string[]> {
  if (!apiKey?.trim() || !responseText?.trim()) return []

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey.trim()}`

    const body = {
      systemInstruction: {
        parts: [{
          text: `You are a reading guide for a curious thinker. Given a passage, pick the 2-4 phrases that are the richest DOORWAYS — a named entity, a specific concept, a term of art, a surprising claim — each of which could open a whole new line of inquiry if the reader pulled on it.

Hard rules:
- Each phrase MUST be a verbatim substring copied EXACTLY from the text (same language, same script, same wording, including casing). If it isn't an exact substring, do not return it.
- Prefer the specific and the proper-named over the generic: choose "the Antikythera mechanism" over "ancient technology", "wave function collapse" over "physics". Pick proper nouns, technical terms, and load-bearing concepts — NOT ordinary verbs, connective phrases, or whole clauses.
- 1-5 words each. Never a full sentence. No duplicates and no phrases that nest inside each other.
- If the text is too thin to offer good doorways, return fewer (even just 1) rather than padding with generic phrases.

Return ONLY a JSON array of strings, no explanation. Example: ["quantum entanglement", "Copenhagen interpretation", "wave function collapse"]

${LANGUAGE_DIRECTIVE}`,
        }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: `Pick the most exploration-worthy doorway phrases (verbatim substrings) from this text:\n\n${responseText.substring(0, 2400)}` }],
      }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) return []

    const json = await response.json()
    let raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    // Strip markdown code fences if present
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    // Filter to strings only, cap at 4
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, 4)
  } catch {
    return []
  }
}

// ── Drift panel suggestion chips ─────────────────────────────────────────────

/**
 * Generate 2 short question suggestions for the blank drift panel.
 * Returns an empty array on any error — non-critical.
 */
export async function getDriftSuggestions(
  selectedText: string,
  contextSnippet: string,
  apiKey: string,
  model: string = GEMINI_MODELS.FLASH_LITE_PREVIEW,
): Promise<string[]> {
  if (!apiKey?.trim() || !selectedText?.trim()) return []

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey.trim()}`

    const body = {
      systemInstruction: {
        parts: [{
          text: `The user is reading a conversation and marked a phrase to explore. Generate exactly 2 short questions that pull them somewhere genuinely interesting about THAT phrase, read in the sense the surrounding context implies.

Rules:
- Read the phrase through the context: if the context is about Lionel Messi, "Barcelona" is the football club, not the city — your questions must reflect the contextual meaning.
- Be SPECIFIC to this phrase, not a template. BAD (generic, banned): "Why does this matter today?", "What are real-world examples?", "How does this work?". GOOD: questions that name a tension, a surprising angle, a mechanism, an origin, or a consequence tied to this exact thing.
- Make the two questions distinct from each other — different angles, not rephrasings.
- Under 9 words each. No trailing fluff.

Return ONLY a JSON array of 2 strings. No explanations.

${LANGUAGE_DIRECTIVE}`,
        }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: `Phrase to explore: "${selectedText}"\n\nSurrounding conversation (use it to disambiguate the phrase):\n${contextSnippet.substring(0, 700)}` }],
      }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 128 },
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    if (!response.ok) return []

    const json = await response.json()
    let raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, 2)
  } catch {
    return []
  }
}

// ── Connections (intelligence layer) ──────────────────────────────────────────

/** One AI-derived connection between the marked term and the wider conversation. */
export interface Connection {
  /** Short label for the connection (e.g. a related idea, a tension, a bridge). */
  label: string
  /** Whether this points backward (something already discussed) or forward (a new direction). */
  kind: 'back' | 'forward'
}

/**
 * Ask Gemini for connections between the marked `term` and where the user has
 * been. Returns up to ~5 connections, split between "back" (relates to what
 * was already said / explored) and "forward" (directions not yet taken).
 *
 * `priorTerms` are terms the user already drifted on (from the term index) so
 * the model can steer toward genuinely unexplored ground. Returns an empty
 * array on any error — non-critical, the surface degrades gracefully.
 */
export async function getConnections(
  term: string,
  contextSnippet: string,
  priorTerms: string[],
  apiKey: string,
  model: string = GEMINI_MODELS.FLASH_LITE_PREVIEW,
): Promise<Connection[]> {
  if (!apiKey?.trim() || !term?.trim()) return []

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 6000)

    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey.trim()}`

    const priorLine = priorTerms.length
      ? `\nAlready explored elsewhere (do NOT repeat these — find fresh ground): ${priorTerms.slice(0, 12).join(', ')}`
      : ''

    const body = {
      systemInstruction: {
        parts: [{
          text: `You are the connective intelligence of a thinking app. The user marked a term mid-conversation. Read the term in the sense the conversation implies (disambiguate by context — "Barcelona" in a Messi thread is the club, not the city), then surface how it connects to where they have been and where they could go next.

Return ONLY a raw JSON array of 4-5 objects. Each object: {"label": string, "kind": "back" | "forward"}.
- "back": a link to something ALREADY in the conversation context — name the RELATIONSHIP, do not restate the fact ("echoes the tension you raised about X", "is the flip side of Y you discussed"). It must reference real content from the context, not a guess.
- "forward": a fresh direction worth drifting into next — a doorway that opens new ground, not trivia or a definition. Favor cross-domain leaps (history↔psychology, science↔culture, ancient↔modern) and non-obvious links the user wouldn't immediately think of.
- label is 5-11 words, concrete and specific (name the actual person/event/idea), no trailing punctuation, no hedging ("maybe", "perhaps").
- Aim for ~2 "back" and ~2-3 "forward". If the context is thin or absent, return all "forward".
- No prose, no markdown, no code fences. Any other text breaks the app.

${LANGUAGE_DIRECTIVE}`,
        }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: `Marked term: "${term}"\nConversation context (use it to disambiguate the term and to ground the "back" links):\n${contextSnippet.substring(0, 2000)}${priorLine}` }],
      }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 320 },
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    if (!response.ok) return []

    const json = await response.json()
    let raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((x): x is { label: unknown; kind: unknown } => !!x && typeof x === 'object')
      .map((x) => ({
        label: typeof x.label === 'string' ? x.label.trim() : '',
        kind: x.kind === 'back' ? ('back' as const) : ('forward' as const),
      }))
      .filter((c) => c.label.length > 0)
      .slice(0, 5)
  } catch {
    return []
  }
}

// ── Synthesis ────────────────────────────────────────────────────────────────
// "Bring it home" — weave the insights from several drift branches into one
// cohesive synthesis posted back on the parent conversation.

export async function synthesizeDrifts(
  rootTopic: string,
  branches: { term: string; content: string }[],
  apiKey: string,
  model: string = GEMINI_MODELS.FLASH_PREVIEW,
  signal?: AbortSignal,
): Promise<string> {
  if (!apiKey?.trim() || branches.length === 0) return ''

  try {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey.trim()}`
    const branchText = branches
      .map((b, i) => `### Branch ${i + 1}: ${b.term}\n${b.content.substring(0, 1600)}`)
      .join('\n\n')

    const body = {
      systemInstruction: {
        parts: [{
          text: `You are the synthesizing intelligence of a thinking app called Drift. The user explored a topic by branching into several focused side-threads ("drifts") — these branches ARE the shape of their curiosity. Weave the key insights into ONE cohesive, illuminating synthesis that tells them something they could not see from any single branch.

Write engaging markdown:
- Open with a single bold takeaway sentence — the one idea that ties the exploration together.
- Then 3-6 tight paragraphs or bullets that find the CONNECTIVE TISSUE between branches — how they reinforce, complicate, or stand in tension with each other. Reference branch topics by name, naturally.
- Do NOT summarize each branch in isolation; surface the through-line and the surprising links the user may have missed.
- Be honest: if two branches don't genuinely connect, say what each contributes rather than forcing a false link. Never invent facts not present in the branches.
- End with one open question worth exploring next, prefixed "**Next:**".
- Keep it under ~350 words. No preamble like "Here is the synthesis".

${LANGUAGE_DIRECTIVE}`,
        }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: `Root topic: "${rootTopic}"\n\nThe branches explored:\n\n${branchText}` }],
      }],
      // gemini-3.5-flash is a thinking model: reasoning tokens count against this
      // budget, so a low cap truncates the answer mid-sentence. Give it headroom.
      generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) return ''

    const json = await response.json()
    const raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return raw.trim()
  } catch {
    return ''
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
  // Always steer the reply to the user's language (covers main chat + every drift).
  body.systemInstruction = {
    parts: [...(systemInstruction?.parts ?? []), { text: LANGUAGE_DIRECTIVE }],
  }

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
          const parts: unknown[] = json?.candidates?.[0]?.content?.parts ?? []
          // Gemini grounding can return multiple parts per chunk; collect all string text
          let chunk = ''
          for (const part of parts) {
            const t = (part as any)?.text
            if (typeof t === 'string') chunk += t
          }
          if (chunk) onChunk(chunk)
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
