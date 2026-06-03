# Drift — Quick Status

**Date:** June 3, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 46 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ iOS bundles a copy of `dist/`. After ANY web change run `npm run build && npx cap sync ios` before Run/Archive — a clean+rebuild in Xcode alone keeps the stale bundle.

## Last Session (Jun 3 PM) — bug-fix + intelligence wave
- **Sidebar redesign** — `SidebarChatRow.tsx`: distinct Chat / Drift / Synthesis rows; drifts nest under their source chat with origin caption.
- **Drift Map fixes** — single-tap open (no flicker-close); node lineage (`<title>` + breadcrumb + at-a-glance `↳ parent` label); clickable AI terms now record as map nodes.
- **Connect / lens / state** — `driftChatId`-keyed init so Connect shows the selected term's cards; per-(term×lens) conversations persist across term/lens switches.
- **Semantic concept layer** — Gemini embeddings (`gemini-embedding-001`, 768-dim) + IDB vector cache + debounced backfill; meaning-based recall ("you explored before") + "Related by meaning" search. Degrades to lexical without a key. Live test PASS.
- **Continuity** — lens registry rebuilt from `driftInfos` on load; "Pick up where you left off" resume cards in the empty state.
- **Discoverability** — one-time coachmarks (`onceFlags.ts`) for the drift gesture + lens switcher.
- **Web QA** — keyless Demo provider in drift panel; `100dvh`; clipboard guard; stop logging secrets.

## Pending (priority order)
- [ ] TestFlight: archive build 46 → App Store Connect
- [ ] On-device pass — this session's features (see HANDOFF for the checklist)
- [ ] TODO(semantic): Connect-lens seeding + semantic map edges; persist composite lens-thread connect-state
- [ ] On-device pass — providers/settings wave (OpenRouter key streams; Settings; no Ollama/Qwen3)
- [ ] Message editing + regeneration (`updateMessage` exists) · Custom system prompts per chat
- [ ] Export & Share (deferred) · Security: client-side Gemini key (deferred) · Real auth
- [ ] App.tsx refactor (~4.1k lines) · Voice output · Bundle code-split (~804 kB single chunk)

## Stack snapshot
React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Primary LLM:** Gemini REST+SSE (native). **Embeddings:** Gemini `gemini-embedding-001` → IndexedDB vector cache. **Routed labs + others:** OpenRouter (streaming). **Local:** Ollama · **Demo:** DummyAI. **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb. Drift Map = pure SVG. App.tsx ~4.1k lines · DriftPanel.tsx ~1.8k.

## Key files
`src/services/embeddings.ts` · `src/lib/embeddingBackfill.ts` · `src/lib/semanticRecall.ts` · `src/lib/onceFlags.ts` · `src/components/SidebarChatRow.tsx` · `src/services/db.ts` (v2 + `embeddingDB`) · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx` · `src/services/gemini.ts` · `src/App.tsx`
