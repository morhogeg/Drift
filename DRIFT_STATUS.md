# Drift — Quick Status

**Date:** June 2, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 40 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ iOS bundles a copy of `dist/`. After ANY web change you MUST run `npm run build && npx cap sync ios` before Run/Archive in Xcode — a clean+rebuild in Xcode alone keeps the stale bundle.

## Last Session (Jun 2) — Reliability wave (after the screenshot-polish wave)
- **Language matching (Gemini)**: `LANGUAGE_DIRECTIVE` makes all output follow the user's language — wired into `sendMessageToGemini` + the 4 helpers (highlights/suggestions/connections/synthesis). Gemini-only by request.
- **No redundant LLM calls**: centralized `resolveDriftRestore()` + a DriftPanel auto-send backstop — re-opening any explored term+lens (reopen pill, siblings, chips, inline links, map) restores cached content with ZERO new calls; stable `driftChatId` reuse.
- **Map "Open this drift"** now restores the real generated drift (incl. Connect cards/answers), not just the term.
- **Connect lens-switch** no longer shows "No connections found" (parse effect stopped wiping restored cards with stale prose).
- **Map crash contained**: scoped `ErrorBoundary` around the map (auto-closes instead of full-app reload) + hardened node helpers. Root null-ref (`O.current`) not yet isolated — grab the on-device component stack via Safari Web Inspector if it recurs.

## Pending (priority order)
- [ ] TestFlight: archive build 40 in Xcode → App Store Connect
- [ ] Root-cause the intermittent map `O.current` null-ref (Safari Web Inspector component stack on device)
- [ ] On-device pass: language matching, no-refetch on re-tap, full-screen map tap-to-preview, synthesis full text
- [ ] Message editing + regeneration (`updateMessage` exists)
- [ ] Custom system prompts per chat
- [ ] Export & Share (deferred) · Security: client-side Gemini key (deferred) · Real auth (Login placeholder)
- [ ] Cleanup: dead `DriftMapPanel.tsx`; unused `onOpenRelatedDrift`; dormant `buildForest`/"All" map path (scope toggle removed)

## Stack snapshot
React 19 + TypeScript + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class', CSS vars). **Primary LLM:** Gemini REST+SSE (language-aware) · **Secondary:** OpenRouter · **Local:** Ollama · **Demo:** DummyAI. **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb. Drift Map = pure SVG bioluminescent graph (pan/pinch/keyboard), full-screen + tap-to-preview, scoped error boundary. App.tsx ~3.9k lines · DriftPanel.tsx ~1.7k.

## Key files
`src/App.tsx` (`resolveDriftRestore`) · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx` · `src/components/ErrorBoundary.tsx` · `src/components/SelectionTooltip.tsx` · `src/store/` · `src/services/gemini.ts` (`LANGUAGE_DIRECTIVE`) · `src/services/settingsStorage.ts`
