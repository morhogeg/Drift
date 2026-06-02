# Drift — Quick Status

**Date:** June 2, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 38 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ iOS bundles a copy of `dist/`. After ANY web change you MUST run `npm run build && npx cap sync ios` before Run/Archive in Xcode — a clean+rebuild in Xcode alone keeps the stale bundle.

## Last Session (Jun 2) — Screenshot-driven polish wave
- **Drift Map → full-screen tap-to-preview explorer**: mobile map is full-screen (no drawer); tapping a node previews it (select + center + detail card), opening is a deliberate 2nd tap; removed the All/This-chat scope toggle (always this chat).
- **Map nodes informative**: `nodeTopic()` labels nodes by the actual connection ("Juventus → Industrial Turin Identity"), disambiguated; Connect-lens drift previews now read from `connectAnswersCache`/`driftInfos.connectAnswers` so cards show real msg count + answer snippet.
- **Synthesis fixed**: bumped `synthesizeDrifts` maxOutputTokens 1000→4096 (thinking model was truncating mid-sentence); rendered in a polished `.synthesis-card`.
- **Horizontal text-cutoff fixed app-wide**: `min-w-0` on main column + `overflow-x:hidden`/word-wrap CSS.
- **Connect context-aware** (disambiguate term via conversation), **selection action bar** redesigned (Lucide icons, no wrap), **"Drift into" chips** polished.

## Pending (priority order)
- [ ] TestFlight: archive build 38 in Xcode → App Store Connect
- [ ] On-device pass: full-screen map (tap-preview, Connect node cards), synthesis full text, context-aware Connect, selection bar / Drift-into chips
- [ ] Message editing + regeneration (`updateMessage` exists)
- [ ] Custom system prompts per chat
- [ ] Export & Share (deferred) · Security: client-side Gemini key (deferred)
- [ ] Real auth (Login is a placeholder)
- [ ] Cleanup: dead `DriftMapPanel.tsx`; unused `onOpenRelatedDrift`; dormant `buildForest`/"All" map path (scope toggle removed)

## Stack snapshot
React 19 + TypeScript + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class', CSS vars). **Primary LLM:** Gemini REST+SSE · **Secondary:** OpenRouter · **Local:** Ollama · **Demo:** DummyAI. **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb. Drift Map = pure SVG bioluminescent graph (pan/pinch/keyboard), now full-screen + tap-to-preview. App.tsx ~3.9k lines · DriftPanel.tsx ~1.7k.

## Key files
`src/App.tsx` · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx` · `src/components/SearchModal.tsx` · `src/components/AddModelSheet.tsx` · `src/components/SelectionTooltip.tsx` · `src/store/` · `src/services/gemini.ts` · `src/services/settingsStorage.ts` (default Gemini key)
