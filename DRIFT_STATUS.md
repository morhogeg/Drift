# Drift — Quick Status

**Date:** May 31, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 34 (iOS + web, pending new archive)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

## Last Session (May 31) — Model-agnostic add flow + reopen-pill bug
Build green (`tsc -b`, `vite build`, dev 200). On `feature/apple-level-overhaul`, not committed.
- **Bug fix**: the reopen-last-drift pill (`App.tsx` header) leaked a stale drift (e.g. "Sporting CP") from another conversation onto a fresh chat. Now gated on `lastDrift.parentChatId === activeChatId`.
- **Model-agnostic Add Model** (`AddModelSheet.tsx` full rewrite): was hardcoded Gemini-only. Now provider-first: **pick provider (Gemini / OpenRouter / Ollama / Demo) → connect (API key or server URL, validated) → choose model(s)**. OpenRouter & Ollama fetch live model lists (searchable) + accept a custom model ID / name. Outputs generic `ModelPreset[]`; downstream send-path already honors per-preset model/key/url, so added models work immediately. Demo AI adds in one tap.
- Aligned provider dot colors across `ModelPickerSheet` + `ModelPillRow` to match Settings (gemini=sky, openrouter=blue, ollama=emerald, dummy=violet).
- The deep Settings `PresetForm` was already provider-agnostic; only the prominent quick-add path needed it.

## Last Session (May 31) — Navigation round 2: walk between terms
Focus: make it effortless to "walk around" between terms without going back to the map. Build green (`tsc -b` clean, `vite build` ok, dev boots 200). On `feature/apple-level-overhaul`, not committed yet.
- **Lateral term-walking** (`DriftPanel.tsx` + `App.tsx`): a sibling switcher strip under the drift header — prev/next chevrons + scrollable pills of every term branched from the *same parent*, current one highlighted. Walk term→term in place; active pill auto-scrolls into view. New `SiblingDrift` type exported from DriftPanel. `App.tsx` computes `siblingDrifts` (from parent's `driftInfos`) + `navigateToSiblingDrift` (reuses the open drift's ancestry, swaps term/source/conversation).
- **Always-visible breadcrumb** (`App.tsx` header): when the active chat is a drift, the header shows the full path `root › term › term` (was only inside the drift panel). Each crumb is tappable — switches to that chat and scrolls to the message the child branched from. Plain root chats keep the simple single-title button. Walks `metadata.parentChatId` up with a cycle guard.
- Note: `DriftMapPanel.tsx` is dead code (the bioluminescent `DriftKnowledgeGraph` replaced it) — safe to delete later.
- Deferred (offered, not chosen this round): map keyboard-hub (arrow/Enter/`/`-search), global "All explorations" map across every chat.

## Last Session (May 31) — Apple-level overhaul (4-domain pass)
Foundation-first, then four coordinated domains. All on `feature/apple-level-overhaul`, build green, not yet merged to `main`.
- **Foundation:** motion easing + luminous accent ramp + glow/type tokens (`tailwind.config.js`), reduced-motion floor + `.drift-text-shimmer` (`index.css`), `src/lib/haptics.ts`, `src/lib/termIndex.ts` (cross-drift term index), `src/components/motion/` (Reveal/Stagger/Bloom/Pressable). Added `@capacitor/haptics`.
- **Vision:** rebuilt `DriftKnowledgeGraph.tsx` into a bioluminescent spatial map (glow-from-within nodes, river bézier connectors, pan/pinch); new `DESIGN_SYSTEM.md`.
- **Intelligence:** `getConnections()` in `gemini.ts`; connection-surfacing moment in the Connect view ("you explored this before" via termIndex, back/forward connections); history-aware Connect chips; push-to-main reworked as "promote an idea" (haptics + toast).
- **Feel:** drift-open/branch bloom, streaming "thought materializing" shimmer + first-token haptic, breathing idle states, full haptic map, capped staggered message entry.
- **Flow:** first-run gesture cue, mobile Knowledge Tree now a first-class "Map" pill, persistent chat-context header + one-tap reopen-last-drift, visible New-chat button, drift-vs-chat sidebar distinction.
- **Synthesis:** verified boots clean (0 console errors, iOS-width); fixed duplicated tagline on mobile Login.

- **Mobile tooltip Drift button** (`b00636f`): mobile pill bar was missing plain "Drift" — added as first/prominent item (pink→violet gradient) ahead of Simplify/Deep dive/Connect.

### Next on this branch
- [ ] Manual on-device simulator pass: haptics, tree bottom-sheet feel, safe-area, reduced-motion.
- [ ] Merge to `main` once happy → new TestFlight archive (build 35).
- [ ] Optional: distinguish *saved* vs *auto-persisted draft* drifts (needs a `ChatSession` flag).
- [ ] Message editing (click to edit, regenerate AI response).
- [ ] AddModelSheet: extend beyond Gemini-only (OpenRouter + Ollama).

## Style & vibe to continue in
See `DESIGN_SYSTEM.md` for the full canonical spec. Short version:
- **Dark, luminous** — the void is calm, important things glow. Never borders for borders' sake.
- **Spring physics** — `ease-spring` `cubic-bezier(0.34,1.46,0.64,1)` everywhere motion happens.
- **Breathe, don't snap** — idle states pulse gently; entrances bloom or reveal-up; nothing just appears.
- **iOS-first** — touch targets ≥ 26 px, haptics on meaningful moments, safe-area aware, reduced-motion honored.
- **Voice: smart, understated, curious** — never generic ("explore" → "drift"), teaches through design not instructions.
- **Primitives:** `src/components/motion/` + `src/lib/haptics.ts` — reach for these before hand-rolling.

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
