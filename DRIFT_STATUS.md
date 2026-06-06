# Drift — Quick Status

**Date:** June 6, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 52 (iOS + web) — ready for TestFlight
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ **CRITICAL ACTION REQUIRED:** Rotate both exposed Gemini API keys + raise spend cap in Google AI Studio. See HANDOFF.md entry 164.

## Last Session (Jun 6) — Tier B refactor complete

- **Slice 4 complete** — extracted push/save logic (282 lines) → `useDriftPanelActions.ts`; verified with live Gemini smoke test
- **Slice 5 complete** — extracted Connect mode (198 lines) → `useConnectThreads.ts`; verified with mocked SSE (Gemini spend-capped)
- **DriftPanel.tsx:** 1916 → **1199 lines** (717-line reduction across both slices)
- **All 5 slices verified:** tsc clean, vite build clean, Playwright smoke tests (live AI + mocked SSE)
- **Bundle:** index 752 kB / gzip 229 kB (minimal change from slice 3; main refactoring work done)

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
