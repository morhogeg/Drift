# Drift — Quick Status

**Date:** March 13, 2026 | **Branch:** `feature/list-anchors-links` | **Build:** 31 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

## Last Session (Mar 13)
- Complete Drift Tree redesign: dropped ReactFlow, rebuilt as pure HTML/CSS indented tree list
- Depth colour palette: depth 1 = violet, depth 2 = indigo, depth 3+ = blue (left border, pills, lines)
- Topics strip: clickable chips below header (one per phrase drifted on) for at-a-glance navigation
- Timestamps per card ("just now", "5m ago") + collapsible branches with chevron toggle
- Full light/dark theme support via CSS custom properties throughout; fixed stale message count bug

## Pending (priority order)
- [ ] **TestFlight** — archive build 31 in Xcode → App Store Connect
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
**Drift Tree:** Pure HTML/CSS/SVG tree (no ReactFlow) · App.tsx ~3000 lines · DriftPanel.tsx ~1000 lines

## Key files
`src/App.tsx` · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx`
`src/components/SelectionTooltip.tsx` · `src/store/` · `src/services/gemini.ts`
`src/services/settingsStorage.ts` ← default Gemini API key lives here
