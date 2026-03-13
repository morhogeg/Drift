# Drift — Quick Status

**Date:** March 13, 2026 | **Branch:** `feature/list-anchors-links` | **Build:** 30 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

## Last Session (Mar 13)
- Fixed "↗ 1 drift" button always opening blank — now navigates directly to existing drift conversation (bypasses handleStartDrift re-creation logic when messages already exist)
- Fixed knowledge graph "ghost box" visuals — direction-aware handles on all 4 node sides + bezier edges replace smoothstep rectangle routing
- Graph now live-updates while open (stale `useNodesState` bug fixed with `setNodes`/`setEdges` effect)
- Node click no longer closes graph — stays open for tree navigation, active node highlights on switch
- Depth hierarchy visible: nested drifts (depth ≥ 2) get distinct styling + `↗↗ nested drift` badge; edge labels show the selected phrase that spawned each child

## Pending (priority order)
- [ ] **TestFlight** — archive build 30 in Xcode → App Store Connect
- [ ] **Message editing** — click to edit sent message, regenerate AI response (`updateMessage` exists in chatStore)
- [ ] **AddModelSheet: OpenRouter + Ollama** — extend beyond Gemini-only
- [ ] **Radial mind map polish** — mini always-visible thumbnail, node entrance animation, long-phrase sizing
- [ ] **Conversation forking** — fork main chat at any message ("what if I'd asked X instead?")
- [ ] **Real auth** — Supabase/Firebase Auth (Login screen is currently a stub)
- [ ] **App.tsx refactor** — ~3000 lines, extract more hooks
- [ ] **Voice output** — TTS read-back of AI responses

## Stack snapshot
React 19 + TypeScript + Vite 7 + Capacitor 7 + Tailwind CSS
**Primary LLM:** Gemini REST+SSE (grounding enabled) · **Secondary:** OpenRouter · **Local:** Ollama · **Demo:** DummyAI
**State:** Zustand 5 — chatStore, driftStore, modelStore, uiStore · **DB:** IndexedDB via idb
**Mind map:** @xyflow/react · App.tsx ~3000 lines · DriftPanel.tsx ~1000 lines · DriftKnowledgeGraph.tsx ~400 lines

## Key files
`src/App.tsx` · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx`
`src/components/SelectionTooltip.tsx` · `src/store/` · `src/services/gemini.ts`
`src/services/settingsStorage.ts` ← default Gemini API key lives here
