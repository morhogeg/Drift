# Drift — Quick Status

**Date:** May 27, 2026 | **Branch:** `main` | **Build:** 34 (iOS + web, pending new archive)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

## Last Session (May 27)
- Fixed broken Gemini model names (gemini-3.1-flash-lite-preview → gemini-3.1-flash-lite, gemini-3-flash-preview → gemini-3.5-flash, gemini-2.0-flash → gemini-2.5-flash-lite before June 1 shutdown)
- Selection tooltip overhauled: removed Challenge, Pros/Cons, Devil's Advocate; kept Simplify + Deep dive; added new **Connect** template
- **Connect feature** built end-to-end:
  - Shows 4-5 AI-generated question chips as a discovery map (not a chat)
  - Tapping a chip opens an inline conversation in the same panel — no new window
  - Back button returns to chips list; visited chips show cyan dot + brighter border
  - Re-tapping a visited chip restores cached conversation (no extra LLM call)
  - Back button clears text selection to dismiss floating tooltip
  - Fixed bug: templateType was passed into wrong positional arg (existingDriftChatId slot)

## Pending (priority order)
- [ ] **TestFlight** — archive build in Xcode → App Store Connect (build 35)
- [ ] **Message editing** — click to edit sent message, regenerate AI response (`updateMessage` exists)
- [ ] **AddModelSheet: OpenRouter + Ollama** — extend model picker beyond Gemini-only
- [ ] **Conversation forking** — fork main chat at any message ("what if I'd asked X instead?")
- [ ] **Drift synthesis** — "Synthesize branches" button merges all branch insights into a summary
- [ ] **Full-text search** — search across ALL message content in ALL chats
- [ ] **Export & Share** — chat + drift tree as Markdown/PDF
- [ ] **Real auth** — Supabase/Firebase Auth (Login screen is a placeholder)

## Connect feature — architecture notes
- `templateType === 'connect'` in DriftPanel drives two sub-modes:
  - **chips mode** (`connectQuestion === null`): shows flat list of AI-generated question chips
  - **chat mode** (`connectQuestion !== null`): inline chat, auto-sends the question, input bar visible
- `connectAnswersRef` (useRef Map) caches per-question conversations; cleared on new term selection
- `connectVisitedVersion` state counter forces re-render when cache updates (visited dot appearance)
- Connect AI prompt returns raw JSON string array — parsed in effect gated on `!isTyping && !connectQuestion`
- System prompt in chat mode is conversational (NOT the JSON prompt) — keyed on `connectQuestion !== null`
- `SelectionTooltip` → `App.tsx` wrapper: `(text, msgId, templateType) => handleStartDrift(text, msgId, undefined, undefined, templateType)` — critical, don't remove

## Stack snapshot
React 19 + TypeScript + Vite 7 + Capacitor 7 + Tailwind CSS (darkMode: 'class', CSS vars for colors).
**Primary LLM:** Gemini REST+SSE (grounding enabled) · **Secondary:** OpenRouter · **Local:** Ollama · **Demo:** DummyAI
**Gemini models (May 2026):** gemini-3.1-flash-lite (FLASH_LITE_PREVIEW), gemini-3.5-flash (FLASH_PREVIEW), gemini-2.5-flash (FLASH_25), gemini-2.5-flash-lite (FLASH_20)
**State:** Zustand 5 — chatStore, driftStore, modelStore, uiStore · **DB:** IndexedDB via idb
**Drift Tree:** Mobile bottom sheet (88dvh) + desktop push panel — pure HTML/CSS/SVG tree, no ReactFlow · App.tsx ~3000 lines · DriftPanel.tsx ~1100 lines

## Key files
`src/App.tsx` · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx`
`src/components/SelectionTooltip.tsx` · `src/store/` · `src/services/gemini.ts`
`src/services/settingsStorage.ts` ← default Gemini API key lives here
