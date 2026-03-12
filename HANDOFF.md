# Drift — Session Handoff

**Date:** March 13, 2026
**Branch:** `feature/list-anchors-links`
**Build:** 29 (iOS Xcode) / 29 (web)
**Status:** Major drift visualization overhaul — unified DriftMapPanel + DriftKnowledgeGraph into a single radial mind map. Nested drift reliability fixed (wrong parentChatId on nested drifts, temp drifts now visible in graph). Phrase truncation removed. ↗ drift tag now shows on all pushed AI messages. Settings "Add Model" now uses polished AddModelSheet flow. Synced to Xcode — ready to archive.

---

## What Was Done This Session

### 89. Unified radial mind map — replaced DriftMapPanel + DriftKnowledgeGraph (MAJOR REDESIGN)
- **Removed** `DriftMapPanel` (the list-style panel) entirely — all references stripped from App.tsx and uiStore.
- **Redesigned** `DriftKnowledgeGraph` into a true radial mind map: root chat at center, first-level drifts radiate at 250px, second level at 450px, third at 630px. Children fan outward in a 130° arc from their parent; root children spread full 360°.
- **Richer nodes**: each drift node shows the `↗ drift` badge, the selected phrase as the violet primary title, a 2-line italic preview of the source message text, message count, and a `↑ source` button that scrolls the main chat to the triggering message and closes the graph.
- **Clean edges**: no more text labels on connecting lines — the node content tells the full story. Animated dashed violet smoothstep curves only.
- **Floating drift pill**: `↗ N drifts` pill floats above the input bar (bottom-right, fixed position), always visible when current chat has branches. Replaces the header-only icon as primary access point.

### 88. Nested drift map reliability — critical bug fix (BUG FIX)
- **Root cause**: all three `registerDriftSession` call sites used `activeChatId` (main chat) as `parentChatId` regardless of nesting depth. Drift B opened from Drift A was recorded as a child of the main chat, not of Drift A.
- **Fix**: `handleCloseDrift`, nested branch of `handleStartDrift`, and `onMessagesChange` auto-persist all now walk the `ancestry` chain to find the correct parent chat ID.
- **Knowledge graph temp drifts**: added `getTempMessages` prop to `DriftKnowledgeGraph`; `collectTree` now synthesises minimal `ChatSession` objects for unsaved temp drifts, and also enqueues children discovered via `driftInfos` (not just `parentChatId`). Full chains of 3+ drifts now render correctly.

### 87. Phrase truncation removed (FIX)
- `DriftKnowledgeGraph` edge labels: removed `substring(0, 28)` — full selected text shown.
- `DriftMapPanel` (now removed): branch selectedText and title truncation removed.
- Source message preview in drift map increased to 120 chars.

### 86. ↗ drift tag on ALL pushed AI messages (FIX)
- Previously the drift tag only showed on `isSinglePushMessage || isFirstDriftMessage`. Extended to all non-user `isDriftMessage` — every pushed AI message now carries the badge. Selected text excerpt still limited to the first message of a group.

### 85. Settings "Add Model" → uses AddModelSheet (POLISH)
- Replaced the raw inline `PresetForm` add flow in Settings with the polished `AddModelSheet` (API key validation → model picker). Editing existing presets still uses `PresetForm`.

### 81. Subtle ↗ drift tag on pushed messages (FIX/POLISH)
- Replaced the old "Drift" label with a cleaner `↗ drift` badge using `bg-accent-violet/[0.08] border border-accent-violet/20` — subtle, theme-adaptive, visible in both light and dark mode.
- Shows uppercase tracking-wide `↗ DRIFT` pill + selected text excerpt on single push and first message of multi-push groups.
- Works correctly with light theme (uses opacity-based colors, not hardcoded dark values).

### 80. Key-term highlights inside drift panel messages (NEW FEATURE)
- After each AI response streams in `DriftPanel`, calls `getSuggestedHighlights()` fire-and-forget.
- Results stored in `msgHighlights` Map (keyed by message ID).
- ReactMarkdown components for each AI message now walk the node tree and inject `<span className="drift-suggestion">` for highlighted phrases — same dotted violet underline treatment as the main chat.
- Clicking a highlighted term in the drift panel sends that phrase as the next message in the drift (deepening the exploration).
- Resets on panel close/re-open.

### 79. Knowledge Graph — light mode support (FIX)
- Replaced hardcoded `bg-[#0a0a0f]` and `bg-[#0d0d12]/80` panel backgrounds with `bg-dark-bg` and `bg-dark-surface/80` — both use CSS variables that switch with the theme.
- Background dots: `color` prop now conditional — white dots in dark mode, subtle dark dots in light mode.
- Edge label background: switches between near-black (dark) and near-white (light).

### 78. Drift Map — remove duplicate titles, clean up layout (FIX)
- **Duplicate issue:** Branch title showed same text as selectedText (both "distributed ledger technology" appeared twice). Fix: `normalise()` comparison skips title if it matches selectedText or starts with "Drift:" prefix.
- **Component:** Extracted recursive `BranchItem` component — handles unlimited nesting depth cleanly with `depth` prop controlling accent color (violet → pink → …).
- **Dedup guard:** Added `seenDriftIds` Set in tree builder to prevent same driftChatId appearing in multiple message nodes.
- **Close button:** Replaced text ✕ with `<X>` lucide icon, consistent with rest of app.
- **Spacing:** Tightened vertical rhythm, cleaner `border-l` connector lines.

### 77. Knowledge Graph — full-canvas aesthetic, 520px panel, no controls (FIX)
- **Restored** the dark canvas aesthetic: dotted grid background, violet animated edges, violet-glow active node — identical to the original design.
- **Panel size:** 520px wide (was 340px) with semi-transparent backdrop on left. Still non-blocking.
- **Removed** `<Controls>` component (zoom +/-/fit/lock buttons — looked dated).
- **Empty state:** Friendly "tap Drift to start branching" hint when no drifts yet.
- Node click closes panel after switching chat.

### 76. Suggestion chips — moved inside scroll area (FIX)
- **Before:** Chips were rendered outside the scroll container → pushed below viewport on desktop.
- **After:** Chips now render inside `flex-1 overflow-y-auto` div, just before `messagesEndRef`. Always visible without scrolling.
- Fixed missing `</div>` closing tag for the scroll container that was causing a build error.

### 75. Knowledge Graph — side panel, current chat tree only (FIX)
- **Before:** Full-screen overlay showing entire database of chats/drifts — covered message text.
- **After:** 340px right-side panel (`fixed top-0 right-0 bottom-0`) that shows only the active chat + its drift descendants. Non-blocking — main content still visible.
- **Tree filtering:** `findRootId()` walks up parent chain to the ultimate root; `collectTree()` BFS-collects all descendants. `buildTree()` uses BFS level layout (root at top, children stacked below at 160px intervals).
- **Empty state:** If only 1 node (no drifts yet), shows a friendly "Select text → Drift to explore" hint. Removed MiniMap (too small in narrow panel).
- Clicking a node now also closes the panel after switching.

### 74. Suggestion chips in blank drift panel (NEW FEATURE)
- **What:** When a drift panel opens fresh (no existing messages, no template), 2 tappable question suggestions appear above the input field.
- **How:** `getDriftSuggestions(selectedText, contextSnippet, apiKey)` added to `gemini.ts` — 5s timeout, returns 2 short questions, silent failure. Fetched in the init `useEffect` of `DriftPanel.tsx` and stored in `driftSuggestions` state.
- **UX:** Pills show under "Try asking" label. Tapping sends immediately and dismisses the chips. Hidden once the user has sent their first message, and not shown for template drifts (which auto-send).

### 73. Preserve unexplored highlights in hasDrift messages (FIX)
- **Before:** Once a message got a drift link (entered `hasDrift` branch), all AI-suggested dotted highlights disappeared.
- **After:** In the hasDrift ReactMarkdown `components`, `unexploredHl` is computed as highlights NOT already in `driftInfos`. A combined `procWithBoth()` runs `processDriftText` first (solid violet drift links), then `processHighlightsText` on top (dotted unexplored suggestions). Explored = solid link; unexplored = dotted underline.

### 72. Drift Knowledge Graph — zoomable 2D canvas (NEW FEATURE)
- **New component:** `src/components/DriftKnowledgeGraph.tsx` — full-screen overlay showing all chats and their drift relationships as a zoomable/pannable graph.
- **Tech:** `@xyflow/react` (React Flow v12, already in package.json) for canvas rendering. Custom dark-themed node component: regular chats show last message preview; drift chats show violet left-border accent + selected text quote. Active chat highlighted with violet glow ring. Animated dashed violet edges labeled with drift selected text.
- **Layout:** Root chats arranged in a 3-column grid; drift chats positioned relative to their parent with offset per sibling index.
- **Access:** Network icon button in chat header (shown when chatHistory.length > 1) + `⌘⌥G` keyboard shortcut.
- **Interactions:** Click any node → navigate to that chat (panel closes). Escape to close. Built-in Controls (zoom/fit) + MiniMap with violet color coding.
- **State:** `knowledgeGraphOpen` / `setKnowledgeGraphOpen` added to `uiStore.ts`.

### 71. AI-Suggested Drift Highlights (NEW FEATURE)
- **New:** After each Gemini response finishes streaming, a lightweight follow-up call (`getSuggestedHighlights` in `gemini.ts`) asks the model to identify 2–4 phrases worth exploring deeper.
- **UX:** Phrases appear with a violet dotted underline (`.drift-suggestion` CSS class). Hovering brightens the underline and tints the background. Clicking immediately opens a drift on that phrase — zero friction.
- **Implementation:** Non-streaming, 5s timeout, silent failure on any error. `suggestedHighlights?: string[]` added to `Message` type. Fire-and-forget async call in `sendMessage` path updates the message after response via `chatStore.updateMessage`. `processHighlightsText()` added to `App.tsx` renders highlights as a second pass on top of `processEntityText`.

### 70. Drift Templates — one-tap workflows (NEW FEATURE)
- **New:** 5 template quick-action buttons added to the selection tooltip (both mobile bottom bar and desktop floating): 🔥 Challenge, 📖 Simplify, 🔍 Research, 🤔 Devil's Advocate, ⚖️ Pros & Cons.
- **How it works:** Each template pre-configures a specialized AI system prompt. When opened, an auto-send fires 400ms after the panel opens with a framing message ("Challenge this: [selectedText]") — user sees an AI response immediately without typing anything.
- **Auto-send:** New `useEffect` in `DriftPanel.tsx` guards against double-fire via `autoSentRef`. `sendMessage` accepts optional `overrideText` to bypass the `message` state for the auto-send path.
- **Types added:** `templateType` optional field on `DriftContext` in `types/chat.ts`.
- **Components modified:** `SelectionTooltip.tsx` (template row + `TemplateType`), `DriftPanel.tsx` (system prompt injection, auto-send), `App.tsx` (`handleStartDrift` signature + propagation).

### 69. Auto-persist all drifts — drifts persist to IndexedDB on first message (BUG FIX)
### 68. AddModelSheet — 3-phase Gemini model add flow with key validation (NEW FEATURE)

---

## Sessions 1–67 (archived)

| # | What |
|---|---|
| 67 | Previous session marker |
| 64 | Drift exploration bar — compact single-row redesign |
| 63 | Dead code removed (AddModelSheet JSX stub, addModelSheetOpen state) |
| 62 | Input buttons vertically centered (absolute top-0 bottom-0) |
| 61 | Drift breadcrumb navigation in DriftPanel header |
| 60 | Send arrow — no grey idle background |
| 59 | Sidebar dividers — bumped opacity (was invisible in dark mode) |
| 58 | Settings toggles — Apple UISwitch proportions |
| 57 | Drift reopens blank fix + nested Drift Map branches fix |
| 55 | Welcome screen cut off by keyboard — pt-[22vh] fix |
| 54 | "AI Settings" → "Settings" rename |
| 53 | Sidebar chat list — flat divider layout |
| 52 | App logo + favicon + iOS app icon — network icon brand |
| 51 | Drift map — nested temp drifts visible |
| 50 | Drift badge / inline link — opens existing drift correctly |
| 49 | Drift badge — moved to action row |
| 48 | Drift Map panel — light mode color fix |
| 47 | DriftMapPanel — bird's eye view (now superseded by radial graph) |
| 46 | Per-message drift count badge |
| 45 | Drift inline link restyle (underline only) |
| 44 | First-message coach mark (one-time floating pill) |
| 43 | New chat on every app open; input bar safe-area gap fix |
| 42 | Retroactive multi-model — stale activeBroadcastGroupId fix |
| 41 | Retroactive multi-model — user message in carousel fix |
| 40 | Input field gap when keyboard open fix |
| 39 | [object Object] in main chat on drift open — walkNode fix |
| 38 | [object Object] in Gemini grounding responses — multi-part SSE fix |
| 37 | Model tag badge overlapping drift message text fix |
| 36 | "Ask Drift" iOS text selection explored + reverted |
| 35 | Model tag label — increased opacity |
| 34 | Pushed drift messages — redesigned as regular AI messages |
| 33 | Drift context — parent conversation included in system prompt |
| 32 | Scroll reliability — touch-action pan-y |
| 31 | Swipe left/right to open/close sidebar |
| 30 | Multi-model continue — stale closure fix |
| 29 | Drift bottom bar — reliability overhaul (6 root causes) |
| 28 | Single-model → retroactive multi-model carousel |
| 27 | Model picker light mode fix |
| 26 | Scroll overlap in multi-model mode |
| 25 | User message not appearing after Continue on mobile |
| 24 | Drift bottom bar — full redesign (glassmorphic) |
| 23 | Continue button moved below content |
| 22 | Multi-model carousel swipe enabled |
| 21 | Single-model mode — remove purple dot |
| 20 | Drift bottom bar restored (.ai-message class) |
| 19 | Multi-model carousel text overflow fix |
| 18 | Input field polish (inactive send button) |
| 17 | DriftPanel input — match main chat layout |
| 16 | Retroactive model add to broadcast group |
| 15 | Multi-model carousel — frameless card design |
| 14 | Continue → button Gemini cases |
| 13 | Model selection toggle revert bug |
| 12 | Model picker light mode visibility |
| 11 | Voice input restart fix (fresh instance on onend) |
| 10 | Voice input toggle fix |
| 9 | ChatGPT-style input field (mic + send inside textarea) |
| 8 | iOS drift text selection — persistent bottom bar |
| 7 | Mobile multi-model chat (pills row + carousel + ModelPickerSheet) |
| 1–6 | AI reply design, DriftPanel keyboard fix, sidebar width, input placement, design polish, voice input initial |



## Current Architecture

```
src/
  App.tsx                    ~2430 lines
  hooks/
    useVoiceInput.ts         tap-to-speak, fresh-instance restart, 3-tier fallback
    useAutoScroll.ts
    useToast.ts
  store/
    chatStore.ts             chat sessions + IndexedDB persistence
    driftStore.ts            drift panel open/closed + temp conversations
    modelStore.ts            selected targets + per-chat model prefs (+ dummy provider)
    uiStore.ts               panels + theme (dark/light) state
  services/
    gemini.ts                PRIMARY — Gemini REST + SSE + grounding
    openrouter.ts            secondary
    ollama.ts                local models
    dummyAI.ts               streaming demo model (Demo AI)
    db.ts                    IndexedDB (idb)
    settingsStorage.ts       localStorage settings
  components/
    DriftPanel.tsx           side panel (keyboard-aware input)
    DriftMapPanel.tsx        bird's eye drift map (timeline + branches, ⌘⌥M)
    SelectionTooltip.tsx     iOS: persistent bottom bar; desktop: floating tooltip
    MultiModelCarousel.tsx   mobile swipeable card carousel for broadcast
    ModelPillRow.tsx         model selection chips above input (mobile, light+dark)
    ModelPickerSheet.tsx     bottom sheet model picker (up to 3 models)
    Settings.tsx             settings panel
    Login.tsx                mobile + desktop layouts
    HeaderControls.tsx       model picker chip (desktop)
ios/
  App/                       Capacitor Xcode project
```

---

## Running Locally

```bash
cd /Users/morhogeg/Drift
npm run dev                            # web dev server
npm run build && npx cap sync ios      # build + sync to Xcode
```

**API key**: create `.env` in project root:
```
VITE_GEMINI_API_KEY=your_key_here
```

---

## What's Pending / Next Ideas

- [ ] **TestFlight submission** — archive build 29 in Xcode → upload to App Store Connect. ⚠️ First launch after install will prompt for mic + speech recognition permissions.
- [ ] **AddModelSheet — OpenRouter & Ollama** — extend AddModelSheet with OpenRouter (fetches live model catalog) and Ollama (fetches /api/tags) paths.
- [ ] **Radial mind map — polish pass** — consider adding a mini always-visible thumbnail (small collapsed graph in corner); animate node entrance; improve node sizing for very long selected phrases.
- [x] **DriftMapPanel removed** — consolidated into radial Knowledge Graph.
- [ ] **Message editing + regeneration** — click to edit a sent message, regenerate the AI response. `updateMessage` already exists in chatStore.
- [ ] **Conversation forking** — fork the entire main chat at any message point ("what if I'd asked X instead?"). Extends the Drift metaphor to the main thread.
- [ ] **Custom system prompts per chat** — per-chat persona/instruction. Services already accept system messages.
- [ ] **Full-text search** — search across ALL message content in ALL chats (not just sidebar title filter).
- [ ] **Export & Share** — export chat + its drift tree as Markdown/PDF.
- [ ] **Drift synthesis** — "Synthesize branches" button in Drift Map — merges all branch insights into one summary.
- [ ] **Real auth** — Supabase Auth or Firebase Auth (Login screen is currently a placeholder)
- [ ] **Light theme color polish** — some hardcoded dark hex colors remain (e.g. `bg-[#0d0d12]`, `bg-[#0a0a0a]`)
- [ ] **Drift Map — clickable spine nodes** — message spine nodes currently pass empty chatId; wire them to scroll to the source message in the main chat
- [ ] **App.tsx refactor** — ~2430+ lines, could extract more hooks
- [ ] **Voice output** — TTS read-back of AI responses
