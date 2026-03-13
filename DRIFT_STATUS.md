# Drift — Quick Status

**Date:** March 13, 2026 | **Branch:** `feature/list-anchors-links` | **Build:** 32 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

## Last Session (Mar 13)
- Drift Tree mobile redesign: full-screen bottom sheet (92dvh), drag-to-dismiss, blurred backdrop, larger touch-friendly cards
- Desktop push layout: tree panel now pushes main chat aside (480px) instead of overlapping it; backdrop removed
- UX cleanup: removed redundant per-message `↗ drift` badge and old KG header icon; replaced with a single Drift Tree button in the header using the app's favicon icon + count badge
- Drift tree card tap now scrolls main chat to the source anchor message AND opens the DriftPanel with existing conversation
- Inline drift badge simplified: `↗ drift` (1 drift) / `↗ N drifts` (multiple)

## Pending (priority order)
- [ ] **TestFlight** — archive build 32 in Xcode → App Store Connect
- [ ] **Message editing** — click to edit sent message, regenerate AI response (`updateMessage` exists)
- [ ] **AddModelSheet: OpenRouter + Ollama** — extend beyond Gemini-only
- [ ] **Conversation forking** — fork main chat at any message ("what if I'd asked X instead?")
- [ ] **Drift synthesis** — "Synthesize branches" button merges all branch insights into a summary
- [ ] **Full-text search** — search across ALL message content in ALL chats
- [ ] **Export & Share** — chat + drift tree as Markdown/PDF
- [ ] **Real auth** — Supabase/Firebase Auth (Login screen is a placeholder)

## Stack snapshot
React 19 + TypeScript + Vite 7 + Capacitor 7 + Tailwind CSS (darkMode: 'class', CSS vars for colors).
**Primary LLM:** Gemini REST+SSE (grounding enabled) · **Secondary:** OpenRouter · **Local:** Ollama · **Demo:** DummyAI
**State:** Zustand 5 — chatStore, driftStore, modelStore, uiStore · **DB:** IndexedDB via idb
**Drift Tree:** Mobile bottom sheet + desktop push panel — pure HTML/CSS/SVG tree, no ReactFlow · App.tsx ~3000 lines · DriftPanel.tsx ~1000 lines

## Key files
`src/App.tsx` · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx`
`src/components/SelectionTooltip.tsx` · `src/store/` · `src/services/gemini.ts`
`src/services/settingsStorage.ts` ← default Gemini API key lives here
