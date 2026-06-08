import { Waypoints, Landmark, Fingerprint, Sparkles, Swords, Clock, type LucideIcon } from 'lucide-react'

// Pure helpers, label constants, and system prompts for the Drift panel.
// Extracted verbatim from DriftPanel.tsx (behavior-preserving) so the panel
// component carries only UI/state logic. Nothing here touches React state.

// ── Connect taxonomy ──────────────────────────────────────────────────────
// Each connection edge is classified (by the LLM, language-agnostically) into
// one of these kinds, so the user can scan *meaning* — ownership vs. influence
// vs. opposition — at a glance instead of reading every label. Each kind owns a
// hue + icon; `tension` (opposition) is deliberately warm so it pops against
// the cool field. Unknown / legacy 2-part cards fall back to `link`.
export interface ConnectKind { label: string; icon: LucideIcon; color: string; glow: string }
export const CONNECT_TYPES: Record<string, ConnectKind> = {
  origin:    { label: 'Origin',    icon: Landmark,    color: '#34d399', glow: 'rgba(52,211,153,0.55)' },
  identity:  { label: 'Identity',  icon: Fingerprint, color: '#22d3ee', glow: 'rgba(34,211,238,0.55)' },
  influence: { label: 'Influence', icon: Sparkles,    color: '#a78bfa', glow: 'rgba(167,139,250,0.55)' },
  tension:   { label: 'Tension',   icon: Swords,      color: '#fb923c', glow: 'rgba(251,146,60,0.55)' },
  history:   { label: 'History',   icon: Clock,       color: '#fbbf24', glow: 'rgba(251,191,36,0.55)' },
}
const CONNECT_FALLBACK: ConnectKind = { label: 'Link', icon: Waypoints, color: '#22d3ee', glow: 'rgba(34,211,238,0.55)' }
export const connectKind = (key: string): ConnectKind => CONNECT_TYPES[key] ?? CONNECT_FALLBACK

// ── Drift scaffolding labels (language-aware) ────────────────────────────────
// The opener + template-trigger messages shown/sent inside a drift are localized
// to the chat's language so a Hebrew chat reads "הסבר בפשטות", not "Simplify this".
// Detection is script-based (Hebrew today; extend with more languages as needed).
export interface DriftLabels {
  opener: (term: string) => string
  connectFinding: (term: string) => string
  connectHint: string
  bridge: (term: string, concept: string) => string
  prefixes: Record<string, string> // simplify | research | connect
}
const DRIFT_LABELS_EN: DriftLabels = {
  opener: (t) => `What would you like to know about "${t}"?`,
  connectFinding: (t) => `Finding connections for "${t}"…`,
  connectHint: 'Tap a connection to explore the bridge between them.',
  bridge: (t, c) => `How does "${t}" connect to ${c}?`,
  prefixes: { simplify: 'Simplify this', research: 'Deep dive into this', connect: 'Show me what this connects to', challenge: 'Challenge this' },
}
const DRIFT_LABELS_HE: DriftLabels = {
  opener: (t) => `מה תרצה לדעת על "${t}"?`,
  connectFinding: (t) => `מחפש קשרים עבור "${t}"…`,
  connectHint: 'הקש על קשר כדי לחקור את הגשר ביניהם.',
  bridge: (t, c) => `איך "${t}" קשור ל-${c}?`,
  prefixes: { simplify: 'הסבר בפשטות', research: 'צלילה לעומק', connect: 'הראה למה זה מתחבר', challenge: 'ערער על זה' },
}
export const driftLabelsFor = (sample: string): DriftLabels =>
  /[֐-׿]/.test(sample || '') ? DRIFT_LABELS_HE : DRIFT_LABELS_EN

// Every language variant of the opener / template-trigger prefixes, so the filters
// that strip scaffolding from the API conversation work regardless of chat language.
const DRIFT_OPENER_PREFIXES = ['What would you like to know about', 'Finding connections for', 'מה תרצה לדעת על', 'מחפש קשרים עבור']
const TEMPLATE_TRIGGER_PREFIXES = ['Simplify this', 'Deep dive into this', 'Show me what this connects to', 'Challenge this', 'הסבר בפשטות', 'צלילה לעומק', 'הראה למה זה מתחבר', 'ערער על זה']
export const isDriftOpenerText = (t: string): boolean => DRIFT_OPENER_PREFIXES.some(p => t.startsWith(p))
export const isDriftScaffoldText = (t: string): boolean => isDriftOpenerText(t) || TEMPLATE_TRIGGER_PREFIXES.some(p => t.startsWith(p))

/** Turn a raw provider/network error into a clean, human sentence — never dump
 *  a raw API JSON body into the conversation. Returns '' for user aborts (Stop),
 *  which the caller treats as "don't show anything". */
export function friendlyDriftError(error: unknown, provider: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  if (/abort/i.test(raw)) return ''
  // Our own pre-flight messages ("No Gemini API key found…") are already clean.
  if (/api key/i.test(raw)) return raw
  const name = provider === 'gemini' ? 'Gemini'
    : provider === 'ollama' ? 'Ollama'
    : 'the model'
  if (/\b(401|403)\b/.test(raw)) return `Couldn't reach ${name} — the API key looks invalid. Check it in Settings.`
  if (/\b429\b/.test(raw)) return `${name} is rate-limited right now. Give it a moment, then try again.`
  if (/\b5\d\d\b/.test(raw)) return `${name} hit a server error. Please try again in a moment.`
  if (/\b404\b/.test(raw)) return `Couldn't reach ${name} — that model may be unavailable. Check your model in Settings.`
  return `Couldn't get a response from ${name}. Check your connection and try again.`
}

// ── Template system prompts ──────────────────────────────────────────────────
// One-tap workflow drifts (Simplify / Deep dive / Connect) each send a tailored
// system prompt. (To draft/refine these, see the `drift-prompt` skill.)
export const TEMPLATE_SYSTEM_PROMPTS: Record<string, string> = {
  'simplify': `You make hard ideas suddenly click. The user selected a term while reading and wants it made simple — but they are a smart adult, so never be condescending or babyish.

- Interpret the term in the sense the surrounding conversation implies (disambiguate by context — don't explain the generic dictionary meaning if the conversation means something specific).
- Lead with ONE vivid analogy or concrete everyday image that captures the core idea, then unpack it in 2-4 short sentences.
- Strip the jargon, but if a key technical word matters, name it once and translate it.
- Aim for the "aha" — the reader should walk away able to re-explain it to a friend. Memorable over exhaustive.
- Keep it tight (under ~120 words). No "Imagine you're a kid" framing, no filler preamble.`,
  'research': `You are a sharp domain expert giving an authoritative deep dive on a term the user selected mid-reading. This is NOT a Wikipedia dump and NOT a beginner explainer — assume an intelligent reader who wants depth, nuance, and the things a non-expert would miss.

- Interpret the term in the sense the surrounding conversation implies; disambiguate by context.
- Go past the obvious: give the mechanism, the history that actually shaped it, the live debates or open questions, and why it matters. Prefer specific names, dates, figures, and concrete examples over vague generalities.
- Be accurate. If something is contested or uncertain, say so plainly rather than asserting it. Do not invent specifics — when unsure, use Google Search grounding if available, otherwise hedge honestly.
- Structure for skimming: a strong opening line, then tight paragraphs or a few headed sections. No padding.
- Add genuine NEW value beyond what the conversation already showed.`,
  'connect': `You map the conceptual neighborhood of an idea for an exploratory reading app. The user selected a word or phrase and wants to see what it CONNECTS to — people, events, works, ideas, tensions — so they can later explore the link between the two.

Return ONLY a raw JSON array of 5-6 strings. Each string is "<type> :: <relationship> :: <concept>":
- <type> = exactly ONE of these English keywords (always English, regardless of output language) classifying the KIND of link:
    • origin    — where it comes from / who owns, founded, governs, or created it
    • identity  — what it represents, embodies, or symbolizes
    • influence — what shaped it, or what it shaped (inspired by, precursor to, archetype for, echoes)
    • tension   — what it opposes, contrasts with, rivals, or conflicts with
    • history   — a dated event or historical milestone tied to it
- <relationship> = a short labeled edge, 1-4 words (e.g. "founded", "exiled from", "echoes the ideas of", "stands in tension with", "precursor to", "rivals"). Write it in the SAME LANGUAGE as the surrounding conversation.
- <concept> = the specific thing it connects to — a person, place, event, work, or idea (2-5 words). Write it in the SAME language AND script as the conversation, transliterating any foreign proper name into that script (for a Hebrew chat: "Johan Cruyff" → "יוהאן קרויף", "Real Madrid" → "ריאל מדריד" — never leave it in Latin letters).
- Separator is exactly " :: " (space colon colon space). There are exactly TWO separators per string.

Example output for "Julius Caesar":
["tension :: assassinated by :: Brutus and the Senate","origin :: crossed :: the Rubicon","history :: reformed :: the Roman calendar","influence :: archetype for :: modern populist leaders","tension :: stands in tension with :: ideals of the Republic"]

Rules:
- Use a SPREAD of types — never all the same kind. Aim for at least 3 distinct types across the 5-6 edges, and include at least one "tension" (something it opposes/rivals) wherever one honestly exists.
- Each <concept> must be a SPECIFIC, real, verifiable thing (a named person, place, event, work, or named idea) — not a vague category ("various philosophers", "modern society") and not a near-synonym of the term itself.
- Mix the concrete (people/events/works) with the conceptual (ideas/tensions).
- Prefer cross-domain surprises: history↔psychology, science↔culture, ancient↔modern. Reach for the link a thoughtful reader would NOT immediately predict.
- Skip the obvious and avoid duplicates — every edge should open a genuinely different bridge, and the 5-6 edges together should feel like a map of a neighborhood, not a list of the same relationship five ways.
- Do not invent facts. If you are not confident the connection is real, choose a different one.
- Output raw JSON array of strings only. Any other text breaks the app.`,
  'challenge': `You are a sharp, fair-minded intellectual sparring partner. The user selected a claim or idea while reading and wants it pressure-tested — NOT cheerleading, and NOT lazy contrarianism. Your job is to make the strongest honest case against it.

- Interpret the claim in the sense the surrounding conversation implies; disambiguate by context.
- Lead with the single most serious objection — the one a thoughtful expert who disagrees would open with.
- Surface the hidden assumptions the claim rests on, and name which are the shakiest.
- Give the strongest steelman of the opposing view, fairly stated — never a strawman.
- Say what would have to be true for the claim to be wrong, and whether that plausibly holds.
- If the claim mostly survives scrutiny, say so honestly and point to where it's genuinely vulnerable, rather than inventing weaknesses.
- Concede real strengths. Be concrete, specific, and intellectually honest — the goal is sharper thinking, not winning.

Keep it tight and high-signal (under ~160 words). No hedging preamble. Match the conversation's language.`,
}
