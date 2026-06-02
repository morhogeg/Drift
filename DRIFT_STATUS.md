# Drift — Quick Status

**Date:** June 2, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 35 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ iOS bundles a copy of `dist/`. After ANY web change you MUST run `npm run build && npx cap sync ios` before Run/Archive in Xcode — a clean+rebuild in Xcode alone keeps the stale bundle.

## Last Session (Jun 2) — exploration + navigation feature wave
- **Connect view → forward-only**: dropped the two backward sections; one unified "Drift ideas" list (questions + angles), tappable doorways with ↗ + visited state.
- **Global "All explorations" map**: scope toggle in the Drift Map; synthetic super-root forest of every conversation.
- **Drift synthesis**: Synthesize bar in the map weaves all of a conversation's drifts into one summary, posted back on the chat (`synthesizeDrifts` in gemini.ts).
- **Full-text search** (⌘K): command palette across every message in every chat/drift.
- **Map keyboard nav + filter**; **"Drift into" suggested-term chips** under AI answers; **conversation forking** (fork button on AI messages).
- Earlier in session: lateral sibling switcher, always-visible breadcrumb, model-agnostic AddModelSheet (Gemini/OpenRouter/Ollama/Demo), reopen-pill fix.

## Pending (priority order)
- [ ] TestFlight: archive build 35 in Xcode → App Store Connect
- [ ] On-device pass for this wave (synthesis needs Gemini key + ≥2 drifts; forking; global map; ⌘K)
- [ ] Message editing + regeneration (`updateMessage` exists)
- [ ] Custom system prompts per chat
- [ ] Export & Share (deferred) · Security: client-side Gemini key (deferred)
- [ ] Real auth (Login is a placeholder)
- [ ] Cleanup: dead `DriftMapPanel.tsx`; unused `onOpenRelatedDrift` prop

## Stack snapshot
React 19 + TypeScript + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class', CSS vars). **Primary LLM:** Gemini REST+SSE · **Secondary:** OpenRouter · **Local:** Ollama · **Demo:** DummyAI. **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb. Drift Map = pure SVG bioluminescent graph (pan/pinch/keyboard). App.tsx ~3.6k lines · DriftPanel.tsx ~1.7k.

## Key files
`src/App.tsx` · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx` · `src/components/SearchModal.tsx` · `src/components/AddModelSheet.tsx` · `src/components/SelectionTooltip.tsx` · `src/store/` · `src/services/gemini.ts` · `src/services/settingsStorage.ts` (default Gemini key)
