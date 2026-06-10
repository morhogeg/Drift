/**
 * Central language detection — the single source of truth for "what language is
 * this text in?". Both the LLM language directive (services/gemini.ts) and the
 * localized drift scaffolding (lib/driftPanel.ts) derive from `detectLangCode`,
 * so detection never drifts apart between the two.
 *
 * Detection is heuristic and synchronous (no API call): the dominant script
 * picks the language outright, and within the Latin script we disambiguate by
 * stopword profile (English vs Spanish vs Italian vs … all share the alphabet).
 */

export type LangCode =
  | 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it'   // Latin-script
  | 'he' | 'ar' | 'ru' | 'el' | 'ja' | 'ko' | 'zh' | 'hi' | 'th' // distinct scripts

/** Human-readable name (with native form) used in the LLM language directive. */
const LANG_DISPLAY: Record<LangCode, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  he: 'Hebrew (עברית)',
  ar: 'Arabic (العربية)',
  ru: 'Russian (Русский)',
  el: 'Greek (Ελληνικά)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  zh: 'Chinese (中文)',
  hi: 'Hindi (हिन्दी)',
  th: 'Thai (ไทย)',
}

export const langDisplayName = (code: LangCode): string => LANG_DISPLAY[code]

// Non-Latin scripts, in priority order. The first script with the most matches
// in the sample wins; Latin falls through to stopword disambiguation below.
const SCRIPTS: [RegExp, LangCode][] = [
  [/[֐-׿ﬠ-ﭏ]/g, 'he'],            // Hebrew (+ presentation forms)
  [/[؀-ۿݐ-ݿﭐ-﷿ﹰ-ﻼ]/g, 'ar'],     // Arabic (+ presentation forms)
  [/[Ѐ-ӿ]/g, 'ru'],                 // Cyrillic
  [/[Ͱ-Ͽ]/g, 'el'],                 // Greek
  [/[぀-ヿ]/g, 'ja'],                // Japanese kana
  [/[가-힯]/g, 'ko'],                // Hangul
  [/[一-鿿]/g, 'zh'],                // Han (defaults to Chinese; kana above wins for Japanese)
  [/[ऀ-ॿ]/g, 'hi'],                 // Devanagari
  [/[฀-๿]/g, 'th'],                 // Thai
]

/** Disambiguate Latin-script text by stopword overlap. */
function detectLatinLangCode(text: string): LangCode {
  const words = text.toLowerCase().match(/[a-zà-ÿ]+/g) ?? []
  if (!words.length) return 'en'
  const set = new Set(words)
  const profiles: [LangCode, string[]][] = [
    ['en', ['the', 'and', 'is', 'are', 'you', 'what', 'how', 'why', 'of', 'to', 'in', 'do', 'does', 'that', 'this', 'with']],
    ['es', ['el', 'la', 'los', 'las', 'que', 'de', 'y', 'es', 'por', 'para', 'cómo', 'qué', 'un', 'una', 'con', 'no']],
    ['fr', ['le', 'la', 'les', 'que', 'de', 'et', 'est', 'pour', 'comment', 'vous', 'un', 'une', 'des', 'dans', 'pas', 'je']],
    ['de', ['der', 'die', 'das', 'und', 'ist', 'nicht', 'wie', 'was', 'für', 'ein', 'eine', 'mit', 'ich', 'sie', 'den']],
    ['pt', ['que', 'de', 'e', 'é', 'por', 'para', 'como', 'não', 'um', 'uma', 'com', 'os', 'as', 'do', 'da', 'em']],
    ['it', ['il', 'la', 'che', 'di', 'e', 'è', 'per', 'come', 'non', 'un', 'una', 'con', 'gli', 'le', 'sono', 'questo']],
  ]
  let best: LangCode = 'en'
  let bestHits = -1
  for (const [code, stop] of profiles) {
    const hits = stop.reduce((acc, w) => acc + (set.has(w) ? 1 : 0), 0)
    if (hits > bestHits) { bestHits = hits; best = code }
  }
  return best
}

/** Detect the dominant language of a text sample. Returns a stable BCP-47-ish code. */
export function detectLangCode(text: string): LangCode {
  const sample = (text ?? '').slice(0, 2000)
  let best: LangCode | '' = ''
  let bestN = 0
  for (const [re, code] of SCRIPTS) {
    const n = (sample.match(re) ?? []).length
    if (n > bestN) { bestN = n; best = code }
  }
  // Only fall to Latin disambiguation when no non-Latin script dominated.
  const latinN = (sample.match(/[A-Za-z]/g) ?? []).length
  if (!best || latinN > bestN) return detectLatinLangCode(sample)
  return best
}
