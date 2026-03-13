# Drift — Session Handoff

**Date:** March 13, 2026
**Branch:** `feature/list-anchors-links`
**Build:** 33 (iOS Xcode) / 33 (web)
**Status:** Drift Tree chip bar now horizontally scrollable on both desktop and mobile.

---

## What Was Done This Session

### 107. Drift Tree — "Explored" chip bar horizontally scrollable (FIX)
- Added `flexWrap: 'nowrap'` to the chips scroll container — chips no longer wrap to a second line when there are many topics.
- Scrollbar hidden on all browsers (`scrollbarWidth: none` + `[&::-webkit-scrollbar]:hidden`) for a clean invisible-scroll feel.
- Applies to both desktop panel and mobile bottom sheet.

### 106. Drift Tree card → anchor scroll + open drift panel (NEW BEHAVIOUR)
- Tapping a drift card in the tree now: (1) switches to parent chat if needed, (2) smooth-scrolls the main chat to the exact source message anchor, (3) opens the DriftPanel with the existing drift conversation loaded. No more "just switch chat ID" — you land at the right place.
- Added `onOpenDrift` prop to `DriftKnowledgeGraph`. Mobile closes the bottom sheet on tap.

### 105. Drift Tree UX cleanup — redundant elements removed (POLISH)
- **Removed** per-message `↗ drift` badge below each message — the inline highlighted drift links already handle navigation, badge was redundant.
- **Removed** the old network-graph SVG icon from the top bar.
- **Removed** floating bottom-right `Drift Tree (N)` pill.
- **Added** Drift Tree button in header (right side, next to +New Chat): uses the app's own favicon icon (three-node graph with pink→violet gradient), shows a purple count badge, toggles active state when tree is open.

### 104. Drift Tree — desktop push layout (LAYOUT)
- When Drift Tree opens on desktop, main chat area slides left (shrinks `480px` from right) — like resizing a window. Full chat remains visible beside the tree panel.
- Desktop backdrop overlay removed (no dimming needed when content is pushed aside).
- Input bar and scroll-to-bottom button also reposition correctly.
- Mobile: unchanged — full-screen bottom sheet with backdrop.

### 103. Drift tree — two `↗ drifts` tags disambiguated (POLISH)
- Floating pill relabelled `GitBranch icon + "Drift Tree" + (N)` — clearly an overview action, not a per-message count.
- Inline badge simplified: `↗ drift` (singular, no count) vs `↗ N drifts` (multi).

### 102. Drift Tree — mobile-first redesign (MAJOR POLISH)
- **Mobile:** full-screen bottom sheet (`92dvh`), slides up from bottom, rounded top corners, drag handle, swipe-down-to-dismiss (80px threshold), blurred backdrop.
- **Cards:** 15px title, 12px preview, 10–11px labels — readable on mobile. Min touch target 44px. `active:scale-[0.98]` haptic feel.
- **Phrase pills:** larger (10px, rounded-full, border), max 28 chars.
- **Connector lines:** 1.5px wide for Retina visibility.
- **Topics strip:** horizontal scroll, 30px-tall chips.
- **Card top row fixed:** label left, msg-count pill + chevron right — no more text overlap.
- **Timestamp** moved to card bottom-right, its own line.
- **Collapse chevron** now `ChevronDown`/`ChevronRight` (semantically correct).

### 101. Drift Tree — topics strip, timestamps, collapsible branches (POLISH)
- **Topics strip:** Row of coloured chips below header — one per phrase drifted on, cycling violet→indigo→blue. Click any chip to jump directly to that drift.
- **Timestamps:** Relative time ("just now", "5m ago", "2h ago") per card.
- **Collapsible branches:** Chevron toggle on any card with children. Shows "N hidden branches" summary.

### 100. Drift Tree — complete visual overhaul, Apple-grade polish (REDESIGN)
- Width: `min(560px, 44vw)`. Titles wrap to 2 lines. Preview 120 chars / 11px / 2 lines.
- Depth palette: depth 1 = violet, depth 2 = indigo, depth 3+ = blue.
- Thick 3px coloured left accent border on drift cards. Hover shadow; active glow ring.

### 99. Drift Tree — complete rebuild, dropped ReactFlow (MAJOR REFACTOR)
- Replaced `@xyflow/react` with pure HTML/CSS/SVG indented tree list.
- Fixed duplicate node bug and stale message count.

### 94. "↗ 1 drift" button — correctly reopens existing drift conversation (BUG FIX)
### 93. Knowledge graph — edge labels show selected phrase (POLISH)
### 92. Knowledge graph — depth hierarchy visible via node styling (NEW)
### 91. Knowledge graph — direction-aware edge handles (BUG FIX)
### 90. Knowledge graph — live updates + node click keeps panel open (BUG FIX)
### 89. Unified radial mind map — replaced DriftMapPanel + DriftKnowledgeGraph (MAJOR REDESIGN)
### 88. Nested drift map reliability — critical bug fix (BUG FIX)
### 87. Phrase truncation removed / 86. ↗ drift tag on all pushed messages / 85. AddModelSheet in Settings (FIX/POLISH)

### 81. Subtle ↗ drift tag on pushed messages (FIX/POLISH)
### 80. Key-term highlights inside drift panel messages (NEW FEATURE)
### 79. Knowledge Graph — light mode support (FIX)
### 78–68: [see archived sessions below]

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
    DriftKnowledgeGraph.tsx  mobile bottom sheet + desktop push panel — pure HTML/CSS tree, topics strip, anchor navigation
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

- [ ] **TestFlight submission** — archive build 32 in Xcode → upload to App Store Connect.
- [ ] **AddModelSheet — OpenRouter & Ollama** — extend AddModelSheet with OpenRouter (fetches live model catalog) and Ollama (fetches /api/tags) paths.
- [ ] **Message editing + regeneration** — click to edit a sent message, regenerate the AI response. `updateMessage` already exists in chatStore.
- [ ] **Conversation forking** — fork the entire main chat at any message point ("what if I'd asked X instead?"). Extends the Drift metaphor to the main thread.
- [ ] **Custom system prompts per chat** — per-chat persona/instruction. Services already accept system messages.
- [ ] **Full-text search** — search across ALL message content in ALL chats (not just sidebar title filter).
- [ ] **Export & Share** — export chat + its drift tree as Markdown/PDF.
- [ ] **Drift synthesis** — "Synthesize branches" button in Drift Map — merges all branch insights into one summary.
- [ ] **Real auth** — Supabase Auth or Firebase Auth (Login screen is currently a placeholder)
- [ ] **Light theme color polish** — some hardcoded dark hex colors remain
- [ ] **App.tsx refactor** — ~3000 lines, could extract more hooks
- [ ] **Voice output** — TTS read-back of AI responses
