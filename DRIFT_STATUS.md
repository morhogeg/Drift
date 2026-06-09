# Drift — Quick Status

**Date:** June 9, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 57 (iOS + web) — ready for TestFlight
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ **CRITICAL ACTION REQUIRED:** Rotate both exposed Gemini API keys + raise spend cap in Google AI Studio. See HANDOFF.md entry 164.

## Last Session (Jun 9 continued) — Language fix + highlights polish + map lens colors

- **Hebrew→English language detection + directive** — replaced soft "match user's language" instructions (which Gemini 3.1 Flash Lite ignored, defaulting to Hebrew) with explicit `languageDirective()` that detects script (Hebrew/Arabic/Cyrillic/Greek/etc.) and Latin-script languages via stopword matching (English/Spanish/French/German/Portuguese/Italian), returning an imperative instruction naming the detected language. Applied to `sendMessageToGemini` system prompt + all 5 standalone helpers. Verified English→English, Hebrew→Hebrew.
- **Key terms now always highlighted** — rewrote `getSuggestedHighlights` prompt to two-tier: KEY SUBJECTS (central entities, esp. proper nouns) always first, THEN DOORWAYS (connective phrases). Previous prompt only asked for doorways, missing brand names. Raised cap from 4→7 terms. Verified: Patek Philippe, Rolex, Audemars Piguet all highlighted in watch brands test.
- **Render-pure highlights dedup fix** — fixed the StrictMode bug where shared mutable `seen` Set broke underlines in React's double-render. Switched to `priorText` calculated from `node.position.start.offset` (message source before current block); internalized fresh per-call `usedInBlock` Set. Blanked heading lines in dedup source to prevent headings from suppressing first body mentions. Applied to both factories (drift links + suggestions). Result: each term underlined exactly once.
- **Lens colors on the Drift Map** — added `LENS_COLORS` Record mapping lens types to hex codes (simplify: amber, research: blue, connect: cyan, challenge: rose) matching DriftPanel chips. Updated DriftKnowledgeGraph card eyebrows + orbs + DetailCard to apply lens color to non-drift nodes. Desktop Drift Map cards now color-coded by lens.
- **Build 56→57**, production bundle: 294.16 kB JS / 124.41 kB CSS (gzip 85.44 / 18.38 kB). tsc + vite + cap sync all clean.

## Pending (priority order)

- [ ] **🔴 Rotate Gemini keys + raise spend cap** (user action, not code) — two keys exposed
- [ ] **TestFlight build 57:** archive in Xcode → App Store Connect (language fix + highlights + map colors + synthesis)
- [ ] On-device pass: highlights (English→English, Hebrew→Hebrew; key brands always included; each term ≤1 underline)
- [ ] On-device pass: map lens colors (card colors match lens type — amber/blue/cyan/rose)
- [ ] On-device pass: prior sessions (synthesis honest/trail, mobile UX, header/footer, audit fixes, keyboard lift, RTL)
- [ ] **TODO(semantic):** Connect-lens seeding + semantic edges on map; persist composite lens-thread state
- [ ] Message editing + regeneration · Custom system prompts · Export & Share

## Stack snapshot

React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Embeddings:** Gemini `gemini-embedding-001` (768-dim) → IndexedDB vector cache + semantic recall. **Primary LLM:** Gemini REST+SSE (native, language-aware, transliterating). **Routed labs:** OpenRouter (OpenAI/Anthropic/Grok streaming). **Single-model only** (broadcast removed Jun 5). **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb (v2 schema). Drift Map = pure SVG + HTML cards (Hebrew-safe). **Synthesis:** adaptive (synthesis/trail), source chips reopen drifts in-panel. **Bundle:** manualChunks (vendor cacheable). App.tsx ~3.2k lines · DriftPanel.tsx ~1.3k (decomposed into hooks).

## Key files

`src/App.tsx` (`processHighlightsText`, `openExistingDrift`, `exploredLenses`) · `src/services/gemini.ts` (`detectLanguage`, `languageDirective`, `getSuggestedHighlights`, `synthesizeDrifts`) · `src/components/DriftPanel.tsx` (lens bar) · `src/components/DriftKnowledgeGraph.tsx` (`LENS_COLORS`, `lensColor`) · `src/components/SelectionTooltip.tsx` · `src/hooks/useDriftPanelActions.ts` · `src/utils/rtl.ts` · `vite.config.ts`
