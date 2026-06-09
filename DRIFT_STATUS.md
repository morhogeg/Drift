# Drift — Quick Status

**Date:** June 9, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 56 (iOS + web) — ready for TestFlight
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ **CRITICAL ACTION REQUIRED:** Rotate both exposed Gemini API keys + raise spend cap in Google AI Studio. See HANDOFF.md entry 164.

## Last Session (Jun 9) — Synthesis made honest + navigable

- **Adaptive synthesis prompt** — model assesses relatedness first, then writes a true synthesis (real through-line) OR an honest "trail" (independent tangents → shape + per-branch contribution, links only where genuine). Never forces a connection. Temp 0.8→0.55.
- **Wording cleanup** — killed "Bring it home" app-wide → "Synthesize" variations; resume-card button now "✦ Synthesize N drifts".
- **Source chips open the drift in-panel (no API call)** — extracted the Drift Map's open-drift logic into shared `openExistingDrift`; synthesis chips reuse it to reopen the already-explored drift (was switchChat). Chips deduped by term.
- **"View as" lens bar marks explored lenses** — content-verified dots show which lenses already have content (instant) vs. which would fire a fresh generation — no more blind tapping / wasted tokens. **Build 55→56**, tsc + vite + cap sync clean.

## Pending (priority order)

- [ ] **🔴 Rotate Gemini keys + raise spend cap** (user action, not code) — two keys exposed
- [ ] TestFlight: archive build 56 in Xcode → App Store Connect
- [ ] On-device pass: synthesis (honest output / trail mode, chips open in-panel no API call, lens-bar dots)
- [ ] On-device pass: mobile UX (build 55 — lens push, footer, header, audit fixes, keyboard lift, RTL)
- [ ] On-device pass: prior sessions (highlight-menu, map/panel stability, Hebrew content, providers/settings)
- [ ] **TODO(semantic):** Connect-lens seeding + semantic edges on map; persist composite lens-thread state
- [ ] Message editing + regeneration · Custom system prompts · Export & Share

## Stack snapshot

React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Embeddings:** Gemini `gemini-embedding-001` (768-dim) → IndexedDB vector cache + semantic recall. **Primary LLM:** Gemini REST+SSE (native, language-aware, transliterating). **Routed labs:** OpenRouter (OpenAI/Anthropic/Grok streaming). **Single-model only** (broadcast removed Jun 5). **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb (v2 schema). Drift Map = pure SVG + HTML cards (Hebrew-safe). **Synthesis:** adaptive (synthesis/trail), source chips reopen drifts in-panel. **Bundle:** manualChunks (vendor cacheable). App.tsx ~3.2k lines · DriftPanel.tsx ~1.3k (decomposed into hooks).

## Key files

`src/App.tsx` (`openExistingDrift`, `exploredLenses`) · `src/services/gemini.ts` (`synthesizeDrifts`) · `src/components/DriftPanel.tsx` (lens bar) · `src/components/SelectionTooltip.tsx` · `src/components/DriftKnowledgeGraph.tsx` · `src/hooks/useKeyboardVisibility.ts` · `src/hooks/useDriftPanelActions.ts` · `src/utils/rtl.ts` · `vite.config.ts`
