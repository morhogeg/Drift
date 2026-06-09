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
 * Detect the language the user is actually writing in so we can give the model
 * an explicit, named target language. A soft "match the user's language"
 * instruction is NOT reliable on small models (gemini-3.1-flash-lite in
 * particular would default to Hebrew even for English input), so we detect the
 * dominant script — and, within the Latin script, the language via stopwords —
 * and name it outright in the directive.
 */
function detectLatinLanguage(text: string): string {
  const words = (text.toLowerCase().match(/[a-zà-ÿ]+/g) ?? [])
  if (!words.length) return 'English'
  const set = new Set(words)
  const profiles: [string, string[]][] = [
    ['English', ['the', 'and', 'is', 'are', 'you', 'what', 'how', 'why', 'of', 'to', 'in', 'do', 'does', 'that', 'this', 'with']],
    ['Spanish', ['el', 'la', 'los', 'las', 'que', 'de', 'y', 'es', 'por', 'para', 'cómo', 'qué', 'un', 'una', 'con', 'no']],
    ['French', ['le', 'la', 'les', 'que', 'de', 'et', 'est', 'pour', 'comment', 'vous', 'un', 'une', 'des', 'dans', 'pas', 'je']],
    ['German', ['der', 'die', 'das', 'und', 'ist', 'nicht', 'wie', 'was', 'für', 'ein', 'eine', 'mit', 'ich', 'sie', 'den']],
    ['Portuguese', ['que', 'de', 'e', 'é', 'por', 'para', 'como', 'não', 'um', 'uma', 'com', 'os', 'as', 'do', 'da', 'em']],
    ['Italian', ['il', 'la', 'che', 'di', 'e', 'è', 'per', 'come', 'non', 'un', 'una', 'con', 'gli', 'le', 'sono', 'questo']],
  ]
  let best = 'English'
  let bestHits = -1
  for (const [name, stop] of profiles) {
    const hits = stop.reduce((acc, w) => acc + (set.has(w) ? 1 : 0), 0)
    if (hits > bestHits) { bestHits = hits; best = name }
  }
  return best
}

/** Returns a human-readable language name (with native form) for a sample of text. */
function detectLanguage(text: string): string {
  const sample = (text ?? '').slice(0, 2000)
  const scripts: [RegExp, string][] = [
    [/[֐-׿]/g, 'Hebrew'],
    [/[؀-ۿݐ-ݿ]/g, 'Arabic'],
    [/[Ѐ-ӿ]/g, 'Cyrillic'],
    [/[Ͱ-Ͽ]/g, 'Greek'],
    [/[぀-ヿ]/g, 'Japanese'],
    [/[가-힯]/g, 'Korean'],
    [/[一-鿿]/g, 'Han'],
    [/[ऀ-ॿ]/g, 'Devanagari'],
    [/[฀-๿]/g, 'Thai'],
    [/[A-Za-z]/g, 'Latin'],
  ]
  let best = ''
  let bestN = 0
  for (const [re, name] of scripts) {
    const n = (sample.match(re) ?? []).length
    if (n > bestN) { bestN = n; best = name }
  }
  switch (best) {
    case 'Hebrew': return 'Hebrew (עברית)'
    case 'Arabic': return 'Arabic (العربية)'
    case 'Cyrillic': return 'Russian (Русский)'
    case 'Greek': return 'Greek (Ελληνικά)'
    case 'Japanese': return 'Japanese (日本語)'
    case 'Korean': return 'Korean (한국어)'
    case 'Han': return 'Chinese (中文)'
    case 'Devanagari': return 'Hindi (हिन्दी)'
    case 'Thai': return 'Thai (ไทย)'
    case 'Latin': return detectLatinLanguage(sample)
    default: return 'English'
  }
}

/**
 * Build the language directive for a given sample of the user's text. Auto-generated
 * artifacts (suggestions, connections, synthesis, drift answers) otherwise drift to
 * the model's default language because the system prompts themselves are English.
 * Naming the target language explicitly is what makes this stick.
 */
export function languageDirective(sampleText: string): string {
  const lang = detectLanguage(sampleText)
  return `LANGUAGE — HIGHEST PRIORITY, OVERRIDES ANY DEFAULT: Write your ENTIRE response in ${lang}. ` +
    `Every string you produce — prose, suggestions, questions, labels, and JSON string values alike — must be in ${lang}, and you must not switch to any other language mid-response. ` +
    `Write proper nouns (people, places, organizations, works) in ${lang}'s own script, transliterating foreign names into it; do not leave foreign-script words embedded in the text. ` +
    `Only code, file paths, URLs, math symbols and units keep their original form.`
}

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

    const url = `${GEMINI_BASE}/${model}:generateContent`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
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
 * Ask Gemini to identify the short phrases from a response that are worth
 * exploring deeper — the answer's key subject entities first (always included),
 * then additional rich "doorway" phrases. Returns an empty array on any error —
 * this is non-critical.
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

    const url = `${GEMINI_BASE}/${model}:generateContent`

    const body = {
      systemInstruction: {
        parts: [{
          text: `You are a reading guide for a curious thinker. From the passage, pick the phrases most worth exploring, in two tiers — KEY SUBJECTS first, then DOORWAYS:

1. KEY SUBJECTS (always include every one of these): the central named things the passage is actually ABOUT — the specific people, products, brands, companies, organizations, works, places, or named theories/models that anchor the answer or head its main sections. If the passage is built around a short set of entities (e.g. three watch brands, two authors), you MUST include ALL of them, not just one.
2. DOORWAYS: additional rich phrases — a term of art, a specific concept, a surprising claim — each of which could open a new line of inquiry.

Hard rules:
- Each phrase MUST be a verbatim substring copied EXACTLY from the text (same language, same script, same wording, including casing). If it isn't an exact substring, do not return it. (A section heading like "1. Patek Philippe" is not a verbatim phrase — return "Patek Philippe".)
- Prefer the specific and the proper-named over the generic: choose "the Antikythera mechanism" over "ancient technology", "wave function collapse" over "physics". Pick proper nouns, technical terms, and load-bearing concepts — NOT ordinary verbs, connective phrases, generic section labels ("Summary", "Why they matter"), or whole clauses.
- 1-5 words each. Never a full sentence. No duplicates and no phrases that nest inside each other.
- Return 3-7 phrases total, ordered KEY SUBJECTS first. If the passage genuinely centers on fewer, return fewer rather than padding.

Return ONLY a JSON array of strings, no explanation. Example: ["Patek Philippe", "Rolex", "Audemars Piguet", "Holy Trinity", "perpetual calendars"]

${languageDirective(responseText)}`,
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
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
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

    // Filter to strings only, cap at 7 (key subjects + doorways)
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, 7)
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

    const url = `${GEMINI_BASE}/${model}:generateContent`

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

${languageDirective(`${selectedText} ${contextSnippet}`)}`,
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
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
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

    const url = `${GEMINI_BASE}/${model}:generateContent`

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

${languageDirective(`${contextSnippet} ${term}`)}`,
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
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
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
// Weave the insights from several drift branches into one
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
    const url = `${GEMINI_BASE}/${model}:generateContent`
    const branchText = branches
      .map((b, i) => `### Branch ${i + 1}: ${b.term}\n${b.content.substring(0, 1600)}`)
      .join('\n\n')

    const body = {
      systemInstruction: {
        parts: [{
          text: `You are the reflecting intelligence of a thinking app called Drift. The user explored a topic by branching into several focused side-threads ("drifts") — these branches ARE the shape of their curiosity. Your job is to give them something genuinely useful about where they went. NEVER manufacture a unifying idea that isn't really there — a forced connection is worse than no connection.

FIRST, silently assess how much the branches actually relate:
- If a real through-line exists (the branches reinforce, complicate, or stand in tension with each other in a way the user might have missed) → write a SYNTHESIS: open with a single bold takeaway sentence naming that through-line, then 3-5 tight paragraphs or bullets tracing the connective tissue. Reference branches by name, naturally. Surface the surprising links, not a per-branch recap.
- If the branches are mostly independent tangents with no honest unifying thread → write a TRAIL instead: open with one bold sentence describing the SHAPE of the exploration (e.g. "You started at X and followed your curiosity into three loosely-related corners."). Then one tight line per branch naming what each one actually gave you. Call out ONLY the genuine links between branches, if any — and if there are none, say so plainly rather than inventing one.
- It's fine to be partial: synthesize the branches that connect, list the rest as standalone threads.

Rules for both modes:
- Never invent facts not present in the branches. Never overstate a connection.
- Don't pad. If there's little to say, say little — usefulness over length.
- End with one open question genuinely worth exploring next, prefixed "**Next:**".
- Keep it under ~350 words. No preamble like "Here is the synthesis". Write engaging markdown.

${languageDirective(`${rootTopic} ${branches.map((b) => b.content).join(' ').slice(0, 1200)}`)}`,
        }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: `Root topic: "${rootTopic}"\n\nThe branches explored:\n\n${branchText}` }],
      }],
      // gemini-3.5-flash is a thinking model: reasoning tokens count against this
      // budget, so a low cap truncates the answer mid-sentence. Give it headroom.
      // Lower temperature keeps it grounded — high temp nudges toward flowery,
      // manufactured connections, which is exactly what we want to avoid here.
      generationConfig: { temperature: 0.55, maxOutputTokens: 4096 },
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
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

  const url = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse`

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
  // Detect from the most recent user turn so a single conversation can switch
  // languages and the reply follows the latest message.
  const lastUserText = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  body.systemInstruction = {
    parts: [...(systemInstruction?.parts ?? []), { text: languageDirective(lastUserText) }],
  }

  const doFetch = (b: Record<string, unknown>) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
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
