# Drift — Quick Status

**Date:** March 13, 2026 | **Branch:** `feature/list-anchors-links` | **Build:** 29 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

## Last Session (Mar 13)
- Unified DriftMapPanel + DriftKnowledgeGraph into a single **radial mind map** — root at center, branches radiate outward. Nodes show selected phrase, source message preview, message count, and a "↑ source" scroll button.
- Fixed **nested drift parentChatId bug** — drift-from-drift chains 3+ levels deep now render correctly in both map and graph
- Removed phrase truncation in map nodes/edges
- `↗ drift` tag now shows on **all** pushed AI messages (not just first)
- Settings "Add Model" → polished `AddModelSheet` flow (key validation + model picker)
- Floating `↗ N drifts` pill replaces header-only knowledge graph button

## Pending (priority order)
- [ ] **TestFlight** — archive build 29 in Xcode → App Store Connect
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
**Mind map:** @xyflow/react · App.tsx ~3000 lines · DriftPanel.tsx ~1000 lines

## Key files
`src/App.tsx` · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx`
`src/components/SelectionTooltip.tsx` · `src/store/` · `src/services/gemini.ts`
`src/services/settingsStorage.ts` ← default Gemini API key lives here
