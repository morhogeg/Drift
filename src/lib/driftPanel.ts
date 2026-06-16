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
  prefixes: { simplify: 'Simplify this', research: 'Deep dive into this', connect: 'Show me what this connects to', challenge: 'Stress test this', evidence: 'Show the evidence for this' },
}
const DRIFT_LABELS_HE: DriftLabels = {
  opener: (t) => `מה תרצה לדעת על "${t}"?`,
  connectFinding: (t) => `מחפש קשרים עבור "${t}"…`,
  connectHint: 'הקש על קשר כדי לחקור את הגשר ביניהם.',
  bridge: (t, c) => `איך "${t}" קשור ל-${c}?`,
  prefixes: { simplify: 'הסבר בפשטות', research: 'צלילה לעומק', connect: 'הראה למה זה מתחבר', challenge: 'העמד את זה במבחן', evidence: 'הצג ראיות לכך' },
}
export const driftLabelsFor = (sample: string): DriftLabels =>
  /[֐-׿]/.test(sample || '') ? DRIFT_LABELS_HE : DRIFT_LABELS_EN

// Every language variant of the opener / template-trigger prefixes, so the filters
// that strip scaffolding from the API conversation work regardless of chat language.
const DRIFT_OPENER_PREFIXES = ['What would you like to know about', 'Finding connections for', 'מה תרצה לדעת על', 'מחפש קשרים עבור']
// 'Explore this' is the generic opener custom lenses fall back to (they have no
// built-in prefix), so registering it here lets the same scaffold-stripping/hiding
// work for any user-defined lens without driftPanel needing to know their names.
const TEMPLATE_TRIGGER_PREFIXES = ['Simplify this', 'Deep dive into this', 'Show me what this connects to', 'Stress test this', 'Second opinion on this', 'Challenge this', 'Show the evidence for this', 'Explore this', 'הסבר בפשטות', 'צלילה לעומק', 'הראה למה זה מתחבר', 'העמד את זה במבחן', 'חוות דעת שנייה על זה', 'ערער על זה', 'הצג ראיות לכך']
export const isDriftOpenerText = (t: string): boolean => DRIFT_OPENER_PREFIXES.some(p => t.startsWith(p))
export const isDriftScaffoldText = (t: string): boolean => isDriftOpenerText(t) || TEMPLATE_TRIGGER_PREFIXES.some(p => t.startsWith(p))

/** True when a message body is a raw Connect-cards JSON array — an internal artifact
 *  (the chips payload) that the Connect view parses into cards. It must NEVER render
 *  as a prose bubble, which can happen when a Connect thread is viewed under another
 *  lens. Tolerates fences and a leading BOM / RTL-LTR mark Gemini may prepend in Hebrew. */
export function isConnectCardsJson(text: string): boolean {
  const cleaned = (text ?? '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  // Find the opening bracket, tolerating a few leading directionality / BOM marks
  // (start > 4 means it's prose that merely contains a bracket, not a JSON payload).
  const start = cleaned.indexOf('[')
  if (start === -1 || start > 4) return false
  try {
    const parsed = JSON.parse(cleaned.slice(start))
    return Array.isArray(parsed) && parsed.length > 0
      && parsed.every((x) => typeof x === 'string')
      && parsed.some((x) => (x as string).includes('::'))
  } catch {
    return false
  }
}

// The Stress-test lens routes to a *different* model and uses its prompt
// ONLY for the explicit "Stress test this: X" turn. Follow-ups inside the
// thread (a typed question, or tapping a dotted suggestion) are ordinary
// exploration on the main model — so we detect the trigger by prefix.
// Old "Second opinion on this" / "Challenge this" prefixes kept so existing
// chats still classify correctly.
const CHALLENGE_TRIGGER_PREFIXES = ['Stress test this', 'Second opinion on this', 'Challenge this', 'העמד את זה במבחן', 'חוות דעת שנייה על זה', 'ערער על זה']
export const isChallengeTriggerText = (t: string): boolean =>
  CHALLENGE_TRIGGER_PREFIXES.some(p => (t ?? '').startsWith(p))

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
- Lead with ONE vivid analogy or concrete everyday image that captures the core idea, then unpack it in 2-4 short sentences. BUT if the term is already concrete — a specific person, place, date, organization, or number — skip the analogy and just give the crisp, plain-language fact; never force a simile onto something that is already tangible.
- Strip the jargon, but if a key technical word matters, name it once and translate it.
- Aim for the "aha" — the reader should walk away able to re-explain it to a friend. Memorable over exhaustive.
- Keep it tight (under ~120 words). No "Imagine you're a kid" framing, no filler preamble.`,
  'research': `You are a sharp domain expert giving an authoritative deep dive on a term the user selected mid-reading. This is NOT a Wikipedia dump and NOT a beginner explainer — assume an intelligent reader who wants to understand how the thing actually works under the hood.

- Interpret the term in the sense the surrounding conversation implies; disambiguate by context.
- LEAD WITH THE MECHANISM: explain how it actually works — the moving parts, the causal chain, what drives what, why it produces the effect it does. This is the spine of the answer: make the gears visible, trace the "how" and the "why," not just the "what." For an abstract idea, the mechanism is its internal logic — the steps by which it does its work.
- Then add the depth a non-expert would miss: the history that actually shaped it (specific names, dates, figures) and the live debates or open questions where experts still disagree. Keep these secondary to the mechanism, not a substitute for it.
- Be accurate. If something is contested or uncertain, say so plainly rather than asserting it. Do not invent specifics — when unsure, use Google Search grounding if available, otherwise hedge honestly.
- Structure for skimming: a strong opening line on the mechanism, then tight paragraphs or a few headed sections. No padding.
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
- Use a SPREAD of types — never all the same kind. Aim for at least 3 distinct types across the 5-6 edges, and include a "tension" (something it opposes/rivals) wherever a real opposition honestly exists — but never manufacture a rivalry to fill the quota; if none is genuine, use another type instead.
- Each <concept> must be a SPECIFIC, real, verifiable thing (a named person, place, event, work, or named idea) — not a vague category ("various philosophers", "modern society") and not a near-synonym of the term itself.
- Mix the concrete (people/events/works) with the conceptual (ideas/tensions).
- Prefer cross-domain surprises: history↔psychology, science↔culture, ancient↔modern. Reach for the link a thoughtful reader would NOT immediately predict.
- Skip the obvious and avoid duplicates — every edge should open a genuinely different bridge, and the 5-6 edges together should feel like a map of a neighborhood, not a list of the same relationship five ways.
- Do not invent facts. If you are not confident the connection is real, choose a different one.
- Output the raw JSON array ONLY — it must start with [ and end with ]. No prose, no commentary, and no markdown code fences of any kind (do not wrap it in triple backticks or a json block). Any character outside the array breaks the app.`,
  'challenge': `You are an independent expert giving an answer its most rigorous stress test. Another model already answered; the user selected a claim or idea from that answer and wants it pressure-tested by a second, independent mind — to find out whether it actually holds up. Your job is to PROBE for weakness, then report honestly what you find. You are not the opposition: you never manufacture disagreement to seem rigorous, and you never soften a real problem to seem agreeable.

- Interpret the claim in the sense the surrounding conversation implies; disambiguate by context.
- Steelman first: state the strongest version of the claim in one line, so you are testing the real idea, not a weak caricature.
- Then actively attack it — genuinely try to break it. Probe for: the strongest counterexample or counter-argument, the boundary conditions where it fails, the hidden assumption it rests on, what would have to be true for it to be wrong, and anything important the original answer left out.
- Then give your honest verdict up front in one plain sentence: HOLDS, HOLDS WITH CAVEATS, or DOESN'T HOLD.
  - If it holds: say so plainly — "I pushed on this and it stands" — and give the strongest reason it survives, plus the sharpest caveat or boundary you found. A confident, well-earned "this is right" is a complete and valuable answer; never invent a flaw to look critical.
  - If it holds with caveats: be precise about which part is solid, which part is shaky, and why.
  - If it doesn't hold: give the single strongest reason, fairly stated — no strawman, no pile-on.
- Your credibility comes from honesty under pressure, not from contrarianism. Showing that a claim is robust is just as rigorous as breaking it.
- This is a reasoned judgment, NOT a literature review — give your own assessment in plain language; don't dump citations, study names, or reference lists (a different lens handles the evidence base).

Keep it tight and high-signal (under ~170 words). No hedging preamble. Match the conversation's language.`,
  'evidence': `You surface the actual evidence base behind an idea the user selected while reading — what supports it, how strong that support is, and how we know — and you back every claim with a real, checkable source. Not opinion, not vibes. Hold yourself to the citation standard of a good systematic review.

- Interpret the idea in the sense the surrounding conversation implies; disambiguate by context.
- USE Google Search grounding whenever it is available — especially for medical, health, nutrition, psychology, science, and policy claims — to pull REAL, current sources and their working links. Prefer the highest-quality primary evidence: systematic reviews and meta-analyses (e.g. Cochrane), randomized controlled trials, large cohort studies, and authoritative institutions (WHO, NIH, CDC, FDA, and leading journals like NEJM, The Lancet, JAMA, BMJ, Nature, Science). Avoid blogs, content farms, press releases, and SEO articles.
- Rank by the evidence hierarchy and say where each item sits: meta-analysis > RCT > cohort/observational > case report > expert opinion > anecdote. Distinguish correlation from causation, and give the population/sample size and the headline finding with its number where you know it.
- Lay out the evidence FOR and AGAINST, and say plainly whether the claim is well-established, contested, or thin. Flag what's missing — the study that would settle it but doesn't yet exist.
- ATTRIBUTE EVERY KEY CLAIM to its source inline, by name — e.g. "a 2019 Cochrane review found…" or "Smith et al. (NEJM 2021), n=1,200, found…". Name the authors/institution, the journal, and the year, with the population/sample size and the headline number where you know it.
- Do NOT write your own list of URLs and do NOT fabricate links, DOIs, or PMIDs — a made-up link is worse than none. When web search is available, the verified source links are listed automatically beneath your answer, so spend your words naming and weighing the sources, not composing URLs.
- If you have no web access and cannot confidently name real sources, say so plainly and describe the type and vintage of evidence that exists, rather than inventing references.

Keep the prose tight and skimmable, but never trade rigor for naming the actual evidence. Match the conversation's language.`,
}
