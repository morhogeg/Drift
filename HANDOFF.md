# Drift — Session Handoff

**Date:** March 13, 2026
**Branch:** `feature/list-anchors-links`
**Build:** 31 (iOS Xcode) / 31 (web)
**Status:** Drift Tree panel fully redesigned — dropped ReactFlow for a clean indented tree list, topics strip, timestamps, collapsible branches, depth colour palette, light/dark theme via CSS variables.

---

## What Was Done This Session

### 101. Drift Tree — topics strip, timestamps, collapsible branches (POLISH)
- **Topics strip:** Row of coloured chips below header — one per phrase drifted on, cycling violet→indigo→blue. Click any chip to jump directly to that drift. True at-a-glance overview of the whole exploration.
- **Timestamps:** Relative time ("just now", "5m ago", "2h ago") per card next to the drift badge.
- **Collapsible branches:** Chevron toggle on any card with children. Collapses subtree, shows "N hidden branches" summary. Connector lines extend correctly through collapsed nodes.

### 100. Drift Tree — complete visual overhaul, Apple-grade polish (REDESIGN)
- Width: `min(560px, 44vw)`. Titles wrap to 2 lines instead of truncating. Preview bumped to 120 chars / 11px / 2 lines.
- Depth palette: depth 1 = violet, depth 2 = indigo, depth 3+ = blue — applied to left border, phrase pill, connector lines.
- Thick 3px coloured left accent border on drift cards.
- `↗ drift` / `main chat` eyebrow badges; message count top-right.
- Stats pill: `↗ N drifts · M messages across all branches`.
- Hover: subtle shadow; active: 3px glow ring matching depth colour.
- Phrase pills: `background` tint only (no border), up to 40 chars, depth-coloured.
- Removed "source" button (tap card to switch, already works).

### 99. Drift Tree — complete rebuild, dropped ReactFlow (MAJOR REFACTOR)
- Replaced `@xyflow/react` with pure HTML/CSS/SVG indented tree list. Eliminated white background bleed, CSS variable conflicts, floating edge label boxes.
- Top-down tree: root at top, each drift indented 24px per depth level with elbow connector lines.
- "branched from '[phrase]'" pill inside each drift card — unambiguous parent→child labelling.
- All colours via CSS custom properties (`rgb(var(--color-surface))` etc) — full light/dark theme support.
- Fixed duplicate node bug: `collectTree` now uses a `Set` to deduplicate child IDs from both `parentChatId` and `driftInfos` traversal.
- Fixed stale message count: temp messages now merged over persisted snapshots when available.

### 94. "↗ 1 drift" button — correctly reopens existing drift conversation (BUG FIX)
- **Root cause 1:** Early-return path in `handleStartDrift` (when source message text search fails) stripped both `driftChatId` and `existingMessages` entirely → drift opened fresh every time.
- **Root cause 2:** Even on the normal path, routing through `handleStartDrift` could produce mismatched chat IDs.
- **Fix:** Click handler now checks if an existing drift has messages (from `chatHistory` or `driftStore.getTempConversation`). If yes, calls `driftStore.openDrift` directly with the known `driftChatId` and full existing messages — bypasses `handleStartDrift` re-creation logic entirely. Only genuinely new drifts fall through to `handleStartDrift`.
- **Also fixed:** Early-return path now passes `driftChatId: existingDriftChatId` and `existingMessages` so even that fallback path preserves context.

### 93. Knowledge graph — edge labels show selected phrase (POLISH)
- Each edge now displays the selected text that spawned the child drift as a small label on the line. Makes the hierarchy readable as a sentence: "root → 'immutable history of information' → child node."
- Nested drift edges (depth ≥ 2) are slightly thicker and more saturated to visually distinguish depth level.

### 92. Knowledge graph — depth hierarchy visible via node styling (NEW)
- Nodes at depth ≥ 2 (drift-from-drift) now styled distinctly: more saturated purple background, `↗↗ nested drift` badge, slightly smaller (130px min-width vs 150px), more opaque edge.
- Depth tracked in node data and passed through `buildRadialTree`.

### 91. Knowledge graph — direction-aware edge handles (BUG FIX)
- **Root cause:** Handles were fixed to `Position.Top` (target) and `Position.Bottom` (source) only. In a radial layout where children can be in any direction, `smoothstep` edges routed as right-angle rectangles — visually appeared as empty "ghost boxes" around each node.
- **Fix:** Each node now has 8 invisible handles (all 4 sides, both source + target). `directionHandles(angle)` computes which side the child is on and sets `sourceHandle`/`targetHandle` per edge. Edge type changed from `smoothstep` to `default` (bezier) with arrowhead markers.

### 90. Knowledge graph — live updates + node click keeps panel open (BUG FIX)
- **Stale state:** `useNodesState(initNodes)` only used initial value — graph never updated while open. New drifts, chat switches, and `isActive` highlight were all frozen at open-time. Fixed with `useEffect` on `[chatHistory, activeChatId]` that calls `setNodes`/`setEdges` and re-runs `fitView`.
- **Node click closed panel:** `onNodeClick` was calling `onClose()` — clicking any node dismissed the graph. Removed `onClose()` from `onNodeClick` so the graph stays open while navigating the drift tree.
- **fitView:** Now also re-runs after node updates, not only on mount.

### 89. Unified radial mind map — replaced DriftMapPanel + DriftKnowledgeGraph (MAJOR REDESIGN)
- **Removed** `DriftMapPanel` entirely. **Redesigned** `DriftKnowledgeGraph` into a true radial mind map.
- Floating `↗ N drifts` pill replaces header-only icon. Richer nodes with source preview + `↑ source` button.

### 88. Nested drift map reliability — critical bug fix (BUG FIX)
- All three `registerDriftSession` call sites now walk the `ancestry` chain to find the correct parent chat ID. Full chains of 3+ drifts render correctly.

### 87. Phrase truncation removed / 86. ↗ drift tag on all pushed messages / 85. AddModelSheet in Settings (FIX/POLISH)

### 81. Subtle ↗ drift tag on pushed messages (FIX/POLISH)
### 80. Key-term highlights inside drift panel messages (NEW FEATURE)
### 79. Knowledge Graph — light mode support (FIX)
### 78. Drift Map — remove duplicate titles, clean up layout (FIX)
### 77. Knowledge Graph — full-canvas aesthetic, 520px panel, no controls (FIX)
### 76. Suggestion chips — moved inside scroll area (FIX)
### 75. Knowledge Graph — side panel, current chat tree only (FIX)
### 74. Suggestion chips in blank drift panel (NEW FEATURE)
### 73. Preserve unexplored highlights in hasDrift messages (FIX)
### 72. Drift Knowledge Graph — zoomable 2D canvas (NEW FEATURE)
### 71. AI-Suggested Drift Highlights (NEW FEATURE)
### 70. Drift Templates — one-tap workflows (NEW FEATURE)
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
  App.tsx                    ~3000 lines
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
    DriftPanel.tsx           ~1000 lines — side panel (keyboard-aware input)
    DriftKnowledgeGraph.tsx  indented tree list — pure HTML/CSS, topics strip, timestamps, collapsible, depth palette
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

- [ ] **TestFlight submission** — archive build 31 in Xcode → upload to App Store Connect.
- [ ] **AddModelSheet — OpenRouter & Ollama** — extend AddModelSheet with OpenRouter (fetches live model catalog) and Ollama (fetches /api/tags) paths.
- [ ] **Message editing + regeneration** — click to edit a sent message, regenerate the AI response. `updateMessage` already exists in chatStore.
- [ ] **Radial mind map — polish pass** — mini always-visible thumbnail (small collapsed graph in corner); animate node entrance; improve node sizing for very long selected phrases.
- [ ] **Conversation forking** — fork the entire main chat at any message point ("what if I'd asked X instead?"). Extends the Drift metaphor to the main thread.
- [ ] **Custom system prompts per chat** — per-chat persona/instruction. Services already accept system messages.
- [ ] **Full-text search** — search across ALL message content in ALL chats (not just sidebar title filter).
- [ ] **Export & Share** — export chat + its drift tree as Markdown/PDF.
- [ ] **Drift synthesis** — "Synthesize branches" button in Drift Map — merges all branch insights into one summary.
- [ ] **Real auth** — Supabase Auth or Firebase Auth (Login screen is currently a placeholder)
- [ ] **Light theme color polish** — some hardcoded dark hex colors remain
- [ ] **App.tsx refactor** — ~3000 lines, could extract more hooks
- [ ] **Voice output** — TTS read-back of AI responses
