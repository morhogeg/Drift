# Drift — Quick Status

**Date:** June 4, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 51 (iOS + web) — ready for TestFlight
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ iOS bundles a copy of `dist/`. After ANY web change run `npm run build && npx cap sync ios` before Run/Archive — a clean+rebuild in Xcode alone keeps the stale bundle.

## Last Session (Jun 4) — on-device bug fixes (builds 48–51)
- **Map "Open drift" losing answer** — drift registered at Q only, answer in temp store. Fixed: fullest of 3 sources + debounced IDB flush (survives reload).
- **Synthesis "Next" clickable** — extract `**Next:**` from prose, render "Explore next" chip. Tap sends the question (RTL-safe, Hebrew).
- **Lens labels + Connect bridge question localized** — "הסבר בפשטות"/"איך קשור ל-" in Hebrew; language-agnostic filters. Bilingual regex detects bridge threads.

## Pending (priority order)
- [ ] On-device pass: map/synthesis/localization fixes + prior session features
- [ ] TestFlight: archive build 50 → App Store Connect
- [ ] TODO(semantic): Connect-lens seeding + semantic edges; persist composite lens-thread state
- [ ] Providers/settings on-device pass (OpenRouter key, Settings UI, Ollama/Qwen3 gone)
- [ ] Message editing + regeneration · Custom system prompts · Export & Share
- [ ] Real auth · Security: Gemini key behind proxy · Light theme polish
- [ ] **Refactor IN PROGRESS** — see `REFACTOR_HANDOFF.md`; resume with `/continue-refactor`. App.tsx hooks COMPLETE (2948 lines). **DriftPanel.tsx step 4 underway: slices 1–3 done** (lib/driftPanel.ts + useDriftMessageStream) → **DriftPanel now 1504 lines** (was 1916). Next: slice 4 (useDriftPanelActions), then slice 5 (Connect mode). ⚠️ Two Gemini keys exposed — **rotate in Google AI Studio** (details in handoff).
- ✅ **Multi-model broadcast + continue-with-model REMOVED** (Jun 5, commit `f0e19d7`) — single-model only now. Pickers are single-select; `selectedTargets` kept as a length-1 array so multi-model is trivial to reintroduce later.
- [ ] Voice output · Code cleanup (dead DriftMapPanel, etc.)

## Stack snapshot
React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Embeddings:** Gemini `gemini-embedding-001` (768-dim) → IndexedDB vector cache + semantic recall. **Primary LLM:** Gemini REST+SSE (native, language-aware, transliterating). **Routed labs:** OpenRouter (OpenAI/Anthropic/Grok streaming). **Local:** Ollama · **Demo:** DummyAI. **Single-model only** (broadcast/continue removed Jun 5). **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb (v2 schema). Drift Map = pure SVG. **Localization:** Hebrew + English lens scaffolding. App.tsx ~2.95k lines · DriftPanel.tsx ~1.5k.

## Key files
`src/services/embeddings.ts` · `src/lib/embeddingBackfill.ts` · `src/lib/semanticRecall.ts` · `src/lib/onceFlags.ts` · `src/components/SidebarChatRow.tsx` · `src/components/DriftPanel.tsx` (localized labels + clickable synthesis) · `src/components/DriftKnowledgeGraph.tsx` (lineage) · `src/services/db.ts` (v2 + `embeddingDB`) · `src/App.tsx` (debounced drift persist + synthesis/next parsing)
