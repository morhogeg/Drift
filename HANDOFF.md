# Drift — Session Handoff

**Date:** June 2, 2026
**Branch:** `feature/apple-level-overhaul`
**Build:** 38 (iOS Xcode) / web
**Status:** Screenshot-driven polish wave — term action bar redesigned, Connect made context-aware, horizontal text-cutoff fixed app-wide, synthesis card + truncation fixed, Drift Map turned into a full-screen tap-to-preview explorer with informative node labels/previews, and "Drift into" chips polished. (Bundle: index ~769 kB / gzip ~229.6 kB.)

---

## What Was Done This Session

### 134. Drift Map — informative node preview for Connect drifts (FIX)
- The map only read `driftStore.getTempConversation`, so Connect-lens drifts (whose Q&A lives in `connectAnswersCache` / parent `driftInfos.connectAnswers`) showed "0 msgs" and a blank preview card. `getTempMessages` now falls back to the connect-answers cache and the parent message's `driftInfos.connectAnswers`, so the node gets real message count + an answer-snippet preview.
- `DetailCard` title now uses `nodeTopic()` for drift nodes → shows the actual connection ("Juventus → Industrial Turin Identity") instead of the bare term.

### 133. "Drift into" suggestion chips — polish (POLISH)
- Label moved to its own line (uppercase section header) so wrapped chip rows align cleanly to the left (was inline with the first chip → ragged wrap).
- Roomier even grid (`gap-2`), larger tap target, subtle shadow, clearer hover/active, and a per-chip `↗` (ArrowUpRight) affordance that brightens on hover. Long terms truncate via `max-w-full` + `truncate`.

### 132. Drift Map — full-screen tap-to-preview explorer (REDESIGN)
- Mobile map is now **full-screen** (`fixed inset-0`), not an 88dvh bottom-sheet drawer — removed drag handle, rounded top, and dimmed backdrop; header gets a safe-area top inset.
- **Tap = preview, not jump:** tapping a node only selects + centers it (shows the detail card); navigation is a deliberate second step via the card's "Open this drift / Go to chat" button. Enter/Space still opens fully; arrow keys move + preview. EXPLORED chips also preview (select) instead of navigating away.
- **Removed the All / This chat scope toggle** — the map is always scoped to the current conversation (`scope` fixed to `'chat'`; toggle + `conversationCount` removed).

### 131. Drift Map — meaningful node labels (FIX)
- Nodes previously all showed the bare selected term (e.g. three identical "Barcelona"). Added `nodeTopic()` (surfaces the Connect bridge target / first real question, falls back to the term) + a per-node `labelById` map that runs `disambiguateTopics` so siblings stay distinct.

### 130. Drift synthesis — truncation fix (BUG FIX)
- `synthesizeDrifts` ran `gemini-3.5-flash` (a thinking model) with `maxOutputTokens: 1000`; reasoning tokens consumed the budget and the synthesis cut off mid-sentence (stray unclosed `**`). Raised to 4096 so the ~350-word answer completes and closes its markdown.

### 129. Synthesis message — polished card (POLISH)
- Synthesis messages (`id` starts with `synth-`) now render in a `.synthesis-card`: violet gradient border, soft glow, gradient title — reads as a deliberate artifact, not a stray message.

### 128. Horizontal text cutoff — app-wide fit fix (BUG FIX)
- Chat content (incl. synthesis) overflowed the right edge / was cut off. Root cause: the main chat column was `flex-1` without `min-w-0`, letting content widen past the viewport. Added `min-w-0` to the main column, `overflow-x: hidden` + `max-width:100%` on `.chat-messages-container`, and `overflow-wrap: anywhere` / `word-break` on `.ai-message`/prose (with code blocks/tables getting their own scroll). Added `min-w-0` on the message bubble too.

### 127. Connect — context-aware disambiguation (FIX)
- Connect ignored conversation context: "Barcelona" in a Messi thread returned city-of-Barcelona connections (Gaudí, Modernisme…). Connect prompt now gets a hard "DISAMBIGUATE BY CONTEXT" instruction that forces the term to be read through the surrounding conversation (FC Barcelona the club, not the city). Removed a latent double-append of context for Connect.

### 126. Term selection action bar — professional redesign (POLISH)
- The iOS selection bar (Drift / Simplify / Deep dive / Connect / Save) was cramped ("Deep dive" wrapped to two lines) with a cyan/violet/blue rainbow. Replaced emoji with consistent Lucide icons (BookOpen / Telescope / Link2), switched templates to a calm uniform icon-over-label layout (no wrap), kept Drift as the single gradient primary, and unified colors/dividers/padding into one polished control. Desktop tooltip updated to icons too.

### 125. Lens switcher — preserve Connect state across switches (FIX)
- Cache connect cards + visited-bridge answers per thread-id (`connectCardsCache` + new `connectAnswersCache`). Switching back to a Connect view restores its map AND tapped-connection indicators. Connect targets start with clean messages so bridge prose can't poison the JSON card parser.

### 124. Drift panel — "View as" lens switcher (NEW)
- A "View as" strip in the panel header re-views the SAME term through any lens (Drift / Simplify / Deep dive / Connect) without returning to the chat. Fixes terms being locked to their first action. Each lens keeps its own in-session thread via a per-term registry (`lensRegistryRef`, baseKey `msgId::term` → template → driftChatId); the original chat-linked thread is preserved at its id. Hidden inside Connect's bridge sub-mode.

### 123. Connect view → relationship map + bridge-maker (REDESIGN)
- Connect is no longer "more suggestions" (which duplicated the drift screen). The term is a hub with labeled relationship edges to related concepts; tapping an edge opens a thread where the AI draws the bridge between the two. "Connect to anything…" input bridges to any typed concept.
- Connect system prompt now returns `"<relationship> :: <concept>"` pairs (connectCards stays `string[]`; old bare-string cards still render). Bridge questions ride the existing `connectQuestion` flow (display + prompt). Removed dead `getConnections`/`connections` machinery.

### 122. Connect view — forward-only "Drift ideas" list (REDESIGN, superseded by #123)
- Removed both backward-looking sections ("You explored this before" + "How this relates to where you've been"). Connect is now purely about where to go next.
- Merged "Directions you could drift" + "Explore from here" into ONE deduped list of tappable doorways (questions first, sharper angles below), each opening a focused thread, with `↗` → cyan visited-dot. Prior-drift context still feeds the AI prompt; it's just no longer shown as a block.
- Removed now-unused imports/props (`Reveal`, `History`, `Compass`, `CornerUpLeft`, `onOpenRelatedDrift` destructure).

### 121. Conversation forking (NEW)
- Fork button (GitBranch) on AI messages → `handleForkChat`: creates a new sibling conversation carrying everything through that point (drift markers cleared), switches to it. `metadata.forkedFrom` / `forkedAtMessageId` link back. "What if I'd asked X instead?"

### 120. Suggested next terms — "Drift into" chips (NEW)
- Chip row under each AI answer from unexplored `suggestedHighlights` (already highlighted inline; now also explicit one-tap drift chips).

### 119. Drift Map — keyboard navigation + filter box (NEW)
- Arrow keys walk node→node spatially, Enter/Space opens, view re-centers on selection. Floating filter input dims non-matching nodes; Enter jumps to first match.

### 118. Full-text search across all chats + drifts (NEW)
- `SearchModal.tsx` command palette (⌘K): searches every message in every conversation/drift, ranked, keyboard-navigable, jumps + highlights. Header search button added.

### 117. Drift synthesis — "bring it home" (NEW)
- `synthesizeDrifts()` in gemini.ts weaves every descendant drift of a conversation into one markdown synthesis. Synthesize bar in the Drift Map (chat scope, ≥2 drifts) posts it back on the conversation and scrolls to it.

### 116. Global "All explorations" map (NEW)
- `DriftKnowledgeGraph` scope toggle **This chat / All**; "All" builds a synthetic super-root forest (`buildForest`) of every conversation. Node activation now keys off `isDrift` (drift→panel, chat→switch), not depth.

### 115. Model-agnostic Add Model flow (REDESIGN)
- `AddModelSheet` rebuilt provider-first: pick provider (Gemini / OpenRouter / Ollama / Demo) → connect (API key or server URL, validated) → choose model(s). OpenRouter & Ollama fetch live model lists (searchable) + accept custom IDs. Outputs generic `ModelPreset[]`. Aligned provider dot colors across picker/pill/settings.

### 114. Always-visible breadcrumb in main header (NEW)
- When the active chat is a drift, the header shows the full path `root › term › term` (was only inside the drift panel); each crumb taps to that chat and scrolls to the branch point.

### 113. Lateral term-walking — sibling switcher (NEW)
- Sibling strip under the drift-panel header: prev/next + scrollable pills of every term branched from the same parent; walk term→term in place, active pill auto-scrolls into view.

### 112. Reopen-last-drift pill scoped to active chat (BUG FIX)
- The header reopen pill leaked a stale drift from another conversation onto a fresh chat. Now gated on `lastDrift.parentChatId === activeChatId`.

### 111. iOS bundle staleness resolved (INFRA)
- Confirmed iOS loads bundled `dist/` (no live-reload server). Stale May 31 bundle was being rebuilt by Xcode; `npm run build && npx cap sync ios` now required after web changes. Build bumped to 35.

### 110. Drift Tree — card tap opens existing drift correctly on mobile (BUG FIX)
- Replaced `handleStartDrift` (designed for new drifts) with a direct `driftStore.openDrift()` call when opening from tree card — bypasses the complex message-index-finding logic that was producing blank panels.
- Three-tier message fallback: `chatHistory` → `driftStore.getTempConversation` → `driftChat.messages` (the node itself always has messages since the tree renders the count).
- Context messages resolved from the parent chat's stored messages, not the stale closure — fixes the case where `switchChat` hasn't settled before context is read.

### 109. Drift Tree — mobile design compact pass (POLISH)
- Bottom sheet: `88dvh` (was 92), `16px` border radius (was 20px).
- Header: title `15px` clamped to 1 line (was 17px / 2 lines), tighter padding, close button `30×30` (was 36×36), drift badge text `10px`.
- Cards: padding `9/11px` (was `12/14px`), title `13px` (was `15px`), preview `11px` uniform on all sizes.
- Topics strip: label `9px`, chips `11px` / `3px 10px` padding / `26px` min-height.

### 108. Drift Tree — duplicate "Explored" chips disambiguated (FIX)
- Added `disambiguateTopics()`: two-pass over collected phrases — if "guitarist" appears twice, chips become "guitarist 1" / "guitarist 2". Single occurrences are unchanged.
- Applied in both mobile and desktop paths via `disambiguateTopics(collectTopics(tree))`.

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

- [ ] **TestFlight submission** — archive build 38 in Xcode → upload to App Store Connect.
- [ ] **On-device pass for this wave** — verify the full-screen Drift Map (tap-to-preview, informative Connect node cards), synthesis (full text, no truncation), context-aware Connect, and the redesigned selection bar / "Drift into" chips.
- [ ] **Message editing + regeneration** — click to edit a sent message, regenerate the AI response. `updateMessage` already exists in chatStore.
- [ ] **Custom system prompts per chat** — per-chat persona/instruction. Services already accept system messages.
- [ ] **Export & Share** — export chat + its drift tree as Markdown/PDF. (Deferred by request.)
- [ ] **Security: Gemini key client-side** — key is bundled in the web build; move behind a proxy before any public release. (Deferred by request.)
- [ ] **Real auth** — Supabase Auth or Firebase Auth (Login screen is currently a placeholder)
- [ ] **Light theme color polish** — some hardcoded dark hex colors remain
- [ ] **App.tsx refactor** — ~3.5k lines, could extract more hooks
- [ ] **Voice output** — TTS read-back of AI responses
- [ ] **Cleanup** — `DriftMapPanel.tsx` is dead code (graph replaced it); `onOpenRelatedDrift` prop now unused in DriftPanel. Map scope toggle removed (#132) → `buildForest`/forest "All explorations" path is now dormant (scope fixed to `'chat'`); remove if the global map isn't coming back.

## Completed this session (was pending)
- ✅ AddModelSheet OpenRouter & Ollama · ✅ Conversation forking · ✅ Full-text search · ✅ Drift synthesis
