# Drift — Quick Status

**Date:** June 4, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 50 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ iOS bundles a copy of `dist/`. After ANY web change run `npm run build && npx cap sync ios` before Run/Archive — a clean+rebuild in Xcode alone keeps the stale bundle.

## Last Session (Jun 4) — on-device bug fixes
- **Map "Open drift" losing answer** — root cause: drift registered to `chatHistory` at first message (Q only); answer in temp store. `onOpenDrift` wrongly preferred stale snapshot. Fixed: pick fullest of 3 sources + debounced flush to IDB (survives reload).
- **Synthesis "Next" clickable** — extract `**Next:**` from prose, render as "Explore next" chip. Tap sends the question (RTL-safe, Hebrew works).
- **Lens labels localized** — "הסבר בפשטות" in Hebrew chat, "Simplify this" in English. Detected by script, language-agnostic scaffold filters prevent duplication in pushed drifts.

## Pending (priority order)
- [ ] On-device pass: map/synthesis/localization fixes + prior session features
- [ ] TestFlight: archive build 50 → App Store Connect
- [ ] TODO(semantic): Connect-lens seeding + semantic edges; persist composite lens-thread state
- [ ] Providers/settings on-device pass (OpenRouter key, Settings UI, Ollama/Qwen3 gone)
- [ ] Message editing + regeneration · Custom system prompts · Export & Share
- [ ] Real auth · Security: Gemini key behind proxy · Light theme polish
- [ ] App.tsx refactor (~4.1k lines) · Voice output · Code cleanup (dead DriftMapPanel, etc.)

## Stack snapshot
React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Embeddings:** Gemini `gemini-embedding-001` (768-dim) → IndexedDB vector cache + semantic recall. **Primary LLM:** Gemini REST+SSE (native, language-aware, transliterating). **Routed labs:** OpenRouter (OpenAI/Anthropic/Grok streaming). **Local:** Ollama · **Demo:** DummyAI. **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb (v2 schema). Drift Map = pure SVG. **Localization:** Hebrew + English lens scaffolding. App.tsx ~4.1k lines · DriftPanel.tsx ~1.8k.

## Key files
`src/services/embeddings.ts` · `src/lib/embeddingBackfill.ts` · `src/lib/semanticRecall.ts` · `src/lib/onceFlags.ts` · `src/components/SidebarChatRow.tsx` · `src/components/DriftPanel.tsx` (localized labels + clickable synthesis) · `src/components/DriftKnowledgeGraph.tsx` (lineage) · `src/services/db.ts` (v2 + `embeddingDB`) · `src/App.tsx` (debounced drift persist + synthesis/next parsing)
