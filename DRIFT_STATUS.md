# Drift — Quick Status

**Date:** June 2, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 42 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ iOS bundles a copy of `dist/`. After ANY web change you MUST run `npm run build && npx cap sync ios` before Run/Archive in Xcode — a clean+rebuild in Xcode alone keeps the stale bundle.

## Last Session (Jun 2) — Content + map quality wave
- **Transliteration**: `LANGUAGE_DIRECTIVE` now writes proper nouns in the chat's OWN script (Hebrew → "יוהאן קרויף", not "Johan Cruyff"). Was the root cause of Latin terms in Hebrew chats.
- **Map bridge open**: `onOpenDrift` (App.tsx) detects a Connect bridge node and opens its conversation (connectQuestion set), instead of dropping to the cards screen.
- **Meaningful map labels**: `nodeTopic` priority chain (bridge → user question → answer gist → term); `collectTopics` uses it too. No more "Barcelona 1/2/3". iOS-15-safe.
- **Filter field**: fixed-height pill aligned to recenter button, stable width, `dir="auto"` for RTL.
- **Prompt quality rewrite**: every generation surface (Connect edges + bridge answers, Simplify, Deep dive, highlights, suggestions, connections, synthesis) rewritten for context-grounding + intent-fidelity + anti-generic; context window 6→8 msgs; fixed compare-path that ignored context.

## Pending (priority order)
- [ ] TestFlight: archive build 42 → App Store Connect
- [ ] On-device pass (Hebrew): transliteration, map labels, bridge open, filter, content quality + prior Connect-redesign wave
- [ ] Message editing + regeneration (`updateMessage` exists)
- [ ] Custom system prompts per chat
- [ ] Export & Share (deferred) · Security: client-side key (deferred) · Real auth
- [ ] App.tsx refactor (~3.9k lines) · Voice output · Dead code cleanup

## Stack snapshot
React 19 + TypeScript + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Primary LLM:** Gemini REST+SSE (language-aware, transliterating). **Secondary:** OpenRouter · **Local:** Ollama · **Demo:** DummyAI. **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb. Drift Map = pure SVG bioluminescent graph (pan/pinch/keyboard), full-screen + tap-to-preview, scoped error boundary. App.tsx ~3.9k lines · DriftPanel.tsx ~1.7k.

## Key files
`src/App.tsx` (`resolveDriftRestore`, `onOpenDrift` bridge detection) · `src/components/DriftPanel.tsx` (CONNECT_TYPES, prompts, context plumbing) · `src/components/DriftKnowledgeGraph.tsx` (`nodeTopic`/`collectTopics`, filter) · `src/utils/rtl.ts` · `src/services/gemini.ts` (`LANGUAGE_DIRECTIVE` + generation prompts) · `src/store/`
