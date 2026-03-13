# Drift — Quick Status

**Date:** March 13, 2026 | **Branch:** `feature/list-anchors-links` | **Build:** 34 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

## Last Session (Mar 13)
- Mobile Drift Tree: compact design pass — smaller header (15px title, 30px close btn), tighter card padding (9/11px), uniform 11px preview, 88dvh sheet height
- Duplicate "Explored" chips fixed: `disambiguateTopics()` numbers duplicates ("guitarist 1", "guitarist 2") while leaving unique phrases unchanged
- Tree card tap on mobile now correctly opens the existing drift conversation — replaced `handleStartDrift` with direct `driftStore.openDrift()` using 3-tier message fallback (chatHistory → temp store → node object)
- Context messages for the opened drift resolved from parent chat's stored messages, not a stale closure

## Pending (priority order)
- [ ] **TestFlight** — archive build 34 in Xcode → App Store Connect
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
**Drift Tree:** Mobile bottom sheet (88dvh) + desktop push panel — pure HTML/CSS/SVG tree, no ReactFlow · App.tsx ~3000 lines · DriftPanel.tsx ~1000 lines

## Key files
`src/App.tsx` · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx`
`src/components/SelectionTooltip.tsx` · `src/store/` · `src/services/gemini.ts`
`src/services/settingsStorage.ts` ← default Gemini API key lives here
