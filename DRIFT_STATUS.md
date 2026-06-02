# Drift — Quick Status

**Date:** June 2, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 41 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ iOS bundles a copy of `dist/`. After ANY web change you MUST run `npm run build && npx cap sync ios` before Run/Archive in Xcode — a clean+rebuild in Xcode alone keeps the stale bundle.

## Last Session (Jun 2) — Connect redesign + three-wave completion
- **Connect relationship taxonomy:** Updated prompt to emit `"<type> :: <relationship> :: <concept>"` where `<type>` is one of `origin·identity·influence·history·tension` (English keyword, works in any language). Module-scope `CONNECT_TYPES` registry maps each → hue + lucide icon. `tension` uses warm amber + dashed connector for visual contrast.
- **Alive map visuals:** Hub breathes (`animate-breathe`); each edge has a glowing type-colored synapse dot; explored edges light up in their color (the "where you've been" trail).
- **RTL fix:** Whole block uses logical Tailwind props (`border-s`/`ps`/`-start`/`text-start`) so rail + arrows mirror for Hebrew. Arrow swaps to `ArrowUpLeft` in RTL. Confirmed logical utilities compile.
- **Dead space:** First-visit hint + type legend footer fill lower area. Parser back-compat with legacy 2-part/bare-concept cached drifts.

## Pending (priority order)
- [ ] TestFlight: archive build 41 → App Store Connect
- [ ] On-device pass: Connect type spread, RTL, all wave-3 polish (full-screen map, synthesis, "Drift into" chips)
- [ ] Message editing + regeneration (`updateMessage` exists)
- [ ] Custom system prompts per chat
- [ ] Export & Share (deferred) · Security: client-side key (deferred) · Real auth
- [ ] App.tsx refactor (~3.9k lines) · Voice output · Dead code cleanup

## Stack snapshot
React 19 + TypeScript + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Primary LLM:** Gemini REST+SSE (language-aware) · **Secondary:** OpenRouter · **Local:** Ollama · **Demo:** DummyAI. **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb. Drift Map = pure SVG bioluminescent graph (pan/pinch/keyboard), full-screen + tap-to-preview, scoped error boundary. App.tsx ~3.9k lines · DriftPanel.tsx ~1.7k.

## Key files
`src/App.tsx` (`resolveDriftRestore`) · `src/components/DriftPanel.tsx` (CONNECT_TYPES registry + parse/render) · `src/components/DriftKnowledgeGraph.tsx` · `src/utils/rtl.ts` (direction detection) · `src/services/gemini.ts` (`LANGUAGE_DIRECTIVE`) · `src/store/` (chat/drift/model/ui)
