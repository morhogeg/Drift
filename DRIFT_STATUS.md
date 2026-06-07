# Drift — Quick Status

**Date:** June 7, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 53 (iOS + web) — ready for TestFlight
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ **CRITICAL ACTION REQUIRED:** Rotate both exposed Gemini API keys + raise spend cap in Google AI Studio. See HANDOFF.md entry 164.

## Last Session (Jun 7) — Map polish + shortcuts + TestFlight prep

- **Filter live-search** — fade-away on non-matching cards (opacity: 0, pointerEvents: none, 0.3s ease)
- **Chip-tap pulse** — selected chip highlights matching cards with 1.1s ring; zoom ±/fit buttons with 0.4x–2.4x scale clamps
- **RTL arrows** — dirArrow() detects Hebrew/Arabic, returns correct direction for Connect bridges + breadcrumbs
- **Light-mode fixes** — Connect card surface/border use color tokens; detail card reduced height (40%), smart re-fit on open/close
- **Zoom button subtlety** — transparent at rest, faint bg on hover, 28px size, muted colors
- **Chips tone** — removed glows, muted inactive colors (neutral text + hairline + 6% hue), full hue on active
- **Keyboard shortcuts** — new ShortcutsHelp overlay (⌘K, ⌘⌥N, ⌘⌥G, ?); honest Login (no fake auth)
- **Bundle:** main 757.81 kB / gzip 231.81 kB; tsc clean, vite clean, Capacitor sync clean; **Build 52→53**

## Pending (priority order)

- [ ] **🔴 Rotate Gemini keys + raise spend cap** (user action, not code) — two keys exposed
- [ ] TestFlight: archive build 52 in Xcode → App Store Connect
- [ ] On-device pass: verify refactored hooks (drift flow, Connect cache, no regressions)
- [ ] **TODO(semantic):** Connect-lens seeding + semantic edges on map; persist composite lens-thread state
- [ ] Message editing + regeneration · Custom system prompts · Export & Share
- [ ] Real auth · Security: key behind proxy · Light theme polish
- [ ] Voice output · Code cleanup (dead DriftMapPanel, dormant forest scope, debug logs)

## Stack snapshot

React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Embeddings:** Gemini `gemini-embedding-001` (768-dim) → IndexedDB vector cache + semantic recall. **Primary LLM:** Gemini REST+SSE (native, language-aware, transliterating). **Routed labs:** OpenRouter (OpenAI/Anthropic/Grok streaming). **Single-model only** (broadcast removed Jun 5). **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb (v2 schema). Drift Map = pure SVG. **Localization:** Hebrew + English scaffolding. App.tsx ~2.95k lines · DriftPanel.tsx ~1.2k (decomposed into 4 hooks + lib/driftPanel).

## Key files

`src/hooks/useDriftPanelActions.ts` · `src/hooks/useConnectThreads.ts` · `src/hooks/useDriftMessageStream.ts` · `src/lib/driftPanel.ts` · `src/services/embeddings.ts` · `src/lib/semanticRecall.ts` · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx` · `src/services/db.ts` (v2) · `src/App.tsx`
