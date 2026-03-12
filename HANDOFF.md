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

### 69. Auto-persist all drifts (BUG FIX)
- **Problem:** Temp drift conversations lived only in `driftStore.tempDriftConversations` (in-memory Map). Page refresh lost all unsaved drift work.
- **Fix:** In the `onMessagesChange` callback passed to `DriftPanel`, when the first user message appears and the drift chat isn't yet in `chatHistory`, `chatStore.registerDriftSession` is called automatically → `chatDB.put()` → IndexedDB. Drifts are now persisted from the moment the first message is sent. Idempotent guard prevents double-registration.

### 68. Frictionless model addition — Gemini (NEW FEATURE)
- **Problem:** ModelPickerSheet had a hardcoded list of 3 models; ALLOWED_KEYS whitelist in modelStore silently dropped custom preset targets; continueWithModel used a hardcoded label switch that broke for any user-added model.
- **New component:** `src/components/AddModelSheet.tsx` — 3-phase bottom sheet: (1) API key entry with show/hide toggle and branded Google AI Studio badge, (2) live key validation via `checkGeminiConnection` with spinner, (3) searchable model picker showing all 4 Gemini models with descriptions, multi-select up to available slots, already-added models shown greyed out.
- **ModelPickerSheet** now accepts `availableTargets: Target[]` (dynamic from presets) and `onOpenAddModel` prop. Replaced hardcoded `ALL_MODELS` with the dynamic list. Added "+ Connect a model..." dashed-border row at bottom. Demo AI always appended.
- **modelStore.ts** — removed `ALLOWED_KEYS` whitelist, replaced with `isValidTarget()` structural validation. Any preset with a valid provider/key/label now passes through. Label overrides also removed — labels come from presets.
- **settingsStorage.ts** — fixed migration to preserve `apiKey` on presets (was being silently dropped on every load/save cycle).
- **App.tsx** — `availableTargets` useMemo derives picker list from enabled presets; `handlePresetsAdded` upserts presets by ID and auto-selects first new model; `continueWithModel` now tries preset lookup by label before the hardcoded switch (custom models work with "Continue →").

### 67. [Previous session entries continue below]

### 64. Drift exploration bar redesigned (POLISH)
- **Before:** Heavy multi-row card with border, drop-shadow, gradient top line, large "Back to source" pill button, and "from conversation:" subtitle that wrapped onto a second line on long chat names.
- **After:** Single compact row (~40px) — `[git icon] "UEFA" · Chat Title [← back]`. No border shadow, parent title truncates with `flex-1 truncate` (never wraps), back button is borderless and subtle (violet on hover).

### 63. Dead code removed (CLEANUP)
- Removed `AddModelSheet` JSX block (component doesn't exist — was always a dead render)
- Removed `addModelSheetOpen` / `setAddModelSheetOpen` state
- Removed `handlePresetsAdded` function
- Wired `ModelPickerSheet.onOpenAddModel` to `uiStore.setSettingsOpen(true)` (opens Settings as fallback)
- Wired `ModelPickerSheet.availableTargets` to the existing `availableTargets` useMemo (dynamic, preset-driven)

### 62. Input buttons vertically centered (BUG FIX)
- **Root cause:** Button container was `absolute right-2 bottom-2` — anchored to bottom edge of textarea, causing slight vertical misalignment when textarea height != expected.
- **Fix:** Changed to `absolute right-2 top-0 bottom-0` + `items-center` in both `App.tsx` and `DriftPanel.tsx`. Container now spans the full textarea height and flex-centers buttons for all textarea sizes.

### 61. Drift breadcrumb navigation (NEW FEATURE)
- **DriftPanel header** now shows a subtle breadcrumb trail below the title bar: `🏠 Sports Chat › "UEFA" › "Champions League"`.
- **Current drift** (last item) is shown italic and non-tappable.
- **Ancestor items** are tappable: clicking the main-chat root closes the panel; clicking an intermediate drift reopens that drift (with correct context and existing messages).
- **`AncestryEntry` type** added to `types/chat.ts` — stores label, selectedText, sourceMessageId, contextMessages, and driftChatId for each step.
- **`ancestry` field** added to `DriftContext` — built automatically in all three `openDrift` call sites in `handleStartDrift`. For nested drifts, ancestry = parent's ancestry + parent entry. For main-chat drifts, ancestry = `[{ isMainChat: true, label: chatTitle }]`.
- **`handleNavigateToBreadcrumb`** added to App.tsx — closes drift (index 0) or calls `driftStore.openDrift()` with the ancestor's stored context and `ancestry.slice(0, index)`.
- Breadcrumb auto-scrolls to the end (current item) on open/depth change.
- Temp messages already synced via `onMessagesChange` so no data loss when navigating.

---

### 60. Send arrow — remove grey idle background (POLISH)
- The send arrow button had `bg-dark-border/40` when no text was typed, creating a grey capsule in both dark and light mode.
- Removed the background entirely for the idle state — arrow now floats as a plain muted icon, matching the mic button style. Gradient still appears when there's text to send.

### 59. Sidebar dividers invisible in dark mode (BUG FIX)
- `divide-dark-border/[0.12]` (12% opacity) was invisible on near-black background. Bumped to `divide-dark-border/30`.

### 58. Settings toggles resized to Apple UISwitch proportions (POLISH)
- Old size: `h-6 w-11` (24×44px) — too large/fat.
- New size: `h-[30px] w-[50px]` with `h-[26px] w-[26px]` knob and 2px gutters — matches Apple's 31×51pt UISwitch ratio.

### 57. Drift reopens blank + missing nested Drift Map branches (BUG FIX)
- **Root cause:** DriftPanel messages lived only in local React state. When a nested drift opened (e.g. Europe from within UEFA), `getTempConversation` returned `undefined` — nested-drift check failed. UEFA was never persisted because `handleCloseDrift` was never called when the context switched.
- **Fix 1:** `DriftPanel` now has `onMessagesChange` prop that fires on every `driftOnlyMessages` change, keeping `tempDriftConversations` always current during a live session.
- **Fix 2:** In the nested drift path, `registerDriftSession` is now called for the parent drift before opening the child — persists parent to IndexedDB so it survives restarts and Drift Map sub-branches are visible.

### 55. Welcome screen cut off when keyboard opens (BUG FIX)
- **Problem:** Empty state used `h-full flex justify-center` — when iOS keyboard opened, the viewport shrank and the vertically-centered content ended up above the scroll origin (can't scroll up past the top). Icon and heading were clipped.
- **Fix:** Replaced `h-full justify-center` with `pt-[22vh]` top padding. Content is now anchored from the top of the scroll container and always visible regardless of keyboard state.

### 54. "AI Settings" → "Settings" (POLISH)
- Renamed label in sidebar button, user menu dropdown, and Settings panel header (`Settings.tsx`).

### 53. Sidebar chat list — flat divider layout (UX)
- **Before:** Each chat row had its own card background (`bg-dark-elevated/30`), rounded corners, and `space-y-1` gaps — felt visually busy.
- **After:** Rows are transparent by default with `divide-y divide-dark-border/[0.12]` hairline dividers between them. Hover and active states use background tints only. Removed redundant `bg-white/5` active overlay.

---

## Previous Session

### 52. App logo — drift map network icon as brand identity (NEW)
- **Empty state logo:** Replaced the old gradient circle/diamond SVG with a 52×52px version of the drift map network icon (3 nodes + connecting paths), using the same pink→violet gradient. Cleaner and on-brand.
- **Favicon:** New `public/favicon.svg` — 32×32 dark background (`#0a0a0a`, rounded corners) with the gradient network icon. Referenced in `index.html`.
- **iOS app icon:** Regenerated `AppIcon-512@2x.png` (1024×1024) using Node + sharp: dark background + scaled gradient network icon. Replaces the old placeholder.

### 51. Drift map — nested temp drifts now visible (BUG FIX)
- **Root cause:** `buildBranchNode` only looked up child drift chats in `chatHistory` (IndexedDB). Temp drifts (not yet saved as chats) live in `driftStore` memory, which `DriftMapPanel` had no access to.
- **Fix:** Added `getTempMessages?: (chatId: string) => Message[] | null` prop to `DriftMapPanel`. `buildBranchNode` now falls back to `getTempMessages(driftChatId)` when `chatHistory` lookup returns undefined. App.tsx passes `driftStore.getTempConversation`. Nested drifts from unsaved conversations now appear as sub-branches.

### 50. Drift badge / inline link — opens existing drift, not new one (BUG FIX)
- **Root cause:** Clicking the `↗ N drifts` badge or an inline drift word called `switchChat(driftChatId)` for saved drifts (navigates main view away) and `handleStartDrift` with a stale/empty temp lookup for temp drifts. Both paths failed to re-open the correct existing drift side panel.
- **Fix:** Unified lookup for both badge and inline drift links: `chatHistory.find(c => c.id === driftChatId)?.messages ?? driftStore.getTempConversation(driftChatId) ?? []`. Always calls `handleStartDrift` (opens side panel) — never `switchChat`. Works for saved and temp drifts.

### 49. Drift badge — moved to action row, no text overlap (BUG FIX)
- **Root cause:** Badge was `absolute top-2 right-2` inside the message bubble, overlapping the first line of message text.
- **Fix:** Removed absolute positioning. Badge is now an inline flex item in the bottom action row (alongside copy/bookmark buttons), styled with `ml-1` to separate it slightly.

### 48. Drift Map panel — light mode colors (BUG FIX)
- **Root cause:** `DriftMapPanel.tsx` used hardcoded dark hex colors (`bg-[#0d0d12]`, `bg-[#0f0f15]`) and `text-white/*` opacity classes — invisible/wrong in light mode.
- **Fix:** All colors replaced with theme-aware Tailwind custom properties: `bg-dark-bg`, `bg-dark-surface`, `text-text-primary`, `text-text-secondary`, `text-text-muted`, `border-dark-border`. Panel now adapts to both themes.

---

## Previous Session

### 47. Drift Map panel — bird's eye view of all drifts (NEW FEATURE)
- **New component:** `src/components/DriftMapPanel.tsx` — slides in from the right (320px), shows the active chat as a vertical spine of messages with violet branches for each drift child. Sub-branches rendered for nested drifts (up to 3 levels). No graph library — pure CSS border-left connecting lines.
- **Access:** Header icon button (visible only when chat has ≥1 drift) + `⌘⌥M` keyboard shortcut.
- **Navigation:** Clicking any node calls `handleDriftMapNavigate` — navigates to the drift chat or scrolls to the source message. Panel closes on navigate.
- **Data:** Fully derived from existing `message.driftInfos` + `chatHistory` — zero schema changes.
- **State:** `driftMapOpen` / `setDriftMapOpen` added to `uiStore.ts`.

### 46. Per-message drift count badge (UX)
- AI messages with `driftInfos.length > 0` now show an `↗ N drifts` pill badge at top-right of the bubble.
- Clicking the badge opens the first drift for that message.
- Doubles as a re-open affordance when the drift panel has been closed.

### 45. Drift inline link restyle (POLISH)
- Replaced the heavy filled-badge treatment (gradient background + border + colored text) with a lighter underline-only style: `border-b border-accent-violet/50` + `hover:bg-accent-violet/10`.
- Drift links are now clearly interactive (universal underline signal) without visually overloading dense responses.

### 44. First-message coach mark (NEW FEATURE)
- One-time floating pill (`"Select any text to drift →"`) appears when the first AI message completes streaming.
- Pulsing violet dot animation draws the eye without being intrusive.
- Auto-dismisses after 6 seconds OR on first text selection (whichever comes first).
- Stored in `localStorage` as `driftCoachMarkSeen: true` — never shown again after dismissal.
- Desktop: ghost `"Select to drift"` hint fades in on hover over unseen AI messages.
- `SelectionTooltip.tsx`: added `onFirstSelection` prop — fires callback once on first qualifying selection.

### 43. New chat on every app open (UX)
- App now always opens to a fresh empty chat ("What's on your mind?") instead of resuming the last session.
- Sidebar still shows full chat history unchanged.
- Empty new chats are **not persisted** to IndexedDB until the first message is sent — no ghost sessions litter the history on reload.
- `chatStore.createChat()`: removed immediate `persistChat()` call; `addMessage()` handles first-persist naturally.
- `App.tsx` on-mount `useEffect`: awaits `loadChatsFromDB()` then calls `createNewChat()`.

---

## Previous Session Fixes

### 43. Input bar gap at phone bottom when keyboard closed (BUG FIX)
- **Root cause:** `html, body { height: 100dvh }` — on iOS WKWebView, `dvh` is the *dynamic/visual* viewport height, which excludes the home indicator safe area (~34px). This made the app body stop 34px short of the physical screen bottom. `absolute bottom-0` landed there, and we then added `env(safe-area-inset-bottom) + 0.5rem` padding inside the container on top — compounding the gap.
- **Fix 1 (`index.css`):** Changed `height: 100dvh` → `height: 100vh`. With `viewport-fit=cover` in the meta tag, `100vh` is the full layout viewport including the physical screen bottom edge. `absolute bottom-0` now truly anchors at the screen bottom.
- **Fix 2 (`App.tsx`):** Removed the extra `0.5rem` from the closed-keyboard bottom padding. `env(safe-area-inset-bottom, 8px)` alone is sufficient to clear the home indicator, keeping the input snug at the bottom.

---

## Previous Session Fixes

### 42. Retroactive multi-model — stale activeBroadcastGroupId (BUG FIX)
- **Root cause:** `activeBroadcastGroupId` was never cleared when a new single-model message was sent. If the user had a previous broadcast session in the same chat, the stale group ID caused "add model" to target the old broadcast group instead of retroactively upgrading the current exchange. New model's response got added to the old group; the current Demo AI response stayed as a plain message.
- **Fix:** `sendMessage` single-model path now calls `setActiveBroadcastGroupId(null)` before sending, clearing any stale group so the next "add model" correctly upgrades the current exchange.

### 41. Retroactive multi-model — user message included as carousel card (BUG FIX)
- **Root cause:** `retroactivelyUpgradeToBroadcast` assigned `broadcastGroupId` to both the user message AND the assistant message. The carousel renderer triggers on the first message with that group ID — so the user's question became card 0, the Demo AI response card 1, the new model card 2. Wrong and confusing.
- **Fix:** Only the assistant message gets `broadcastGroupId`. User messages are never given one. The carousel now starts at the first AI response, matching the normal broadcast behaviour.

### 40. Input field gap when keyboard is open (BUG FIX)
- **Root cause:** The input container had `paddingBottom: calc(env(safe-area-inset-bottom) + 0.5rem)` regardless of keyboard state. With `resize: none`, `translateY(-kb-h)` lifts the bar above the keyboard, but the safe-area padding inside the container still pushed the textarea up from the bottom of the bar — creating a visible gap between the input and the keyboard top.
- **Fix:** Added `keyboardVisible` state (toggled in `keyboardWillShow`/`keyboardWillHide`). When keyboard is visible, `paddingBottom` is `0px`; when hidden, the normal safe-area padding is restored.

---

## Previous Session Fixes

### 39. [object Object] in main chat when opening side chat — fixed (BUG FIX)
- **Root cause:** `processDriftText` (used to render drift-linked messages) called `String(children)` on the ReactMarkdown `children` prop. For list items, `children` is a React element tree, not a plain string — `String(<ReactElement>)` → `"[object Object]"`. This rendering path activates as soon as a message gains `driftInfos` (i.e., the moment you open a side chat from it), which is why text was fine before and corrupted immediately after opening the drift panel.
- **Fix:** Replaced `String(children)` + string-split logic with a proper recursive tree walk (`walkNode`), matching the pattern in `processEntityText`. Only actual string leaf nodes are searched for drift text and replaced with buttons; all other React structure (bold, italic, code, etc.) is preserved via `cloneElement`.

---

## Previous Session Fixes

### 38. [object Object] in Gemini grounding responses — fixed (BUG FIX)

### 38. [object Object] in Gemini grounding responses — fixed (BUG FIX)
- **Root cause:** Gemini SSE parser only read `parts[0]?.text`. With grounding active, some chunks have multiple parts where `parts[0].text` is a citation object (not a string). `acc += object` coerced to `"[object Object]"`, stored in IndexedDB.
- **Fix 1 (`gemini.ts`):** SSE parser now iterates ALL parts per chunk, only accumulates where `typeof text === 'string'`.
- **Fix 2 (`App.tsx`):** `sanitizeText()` strips residual `[object Object]` from `msg.text` before ReactMarkdown — cleans up already-stored messages.

### 37. Model tag badge overlapping drift message text (BUG FIX)
- **Root cause:** Absolute-positioned model tag (`absolute top-2 left-3`) was only excluded for `isSinglePushMessage || isFirstDriftMessage`. Mid-group drift messages still showed it, overlapping the first line of text.
- **Fix:** Condition changed to `!isDriftMessage && !isSinglePushMessage` — excludes ALL drift push messages.

---

## What Was Done This Session

### 36. "Ask Drift" in iOS text selection menu — explored & reverted (N/A)
- Investigated adding "Ask Drift" to the native iOS text selection popup (like ChatGPT's "Ask ChatGPT")
- Attempted via `AppIntents` / `AppShortcutsProvider` — hit multiple Swift compile errors
- Root cause: "Ask ChatGPT" is a special Apple/OpenAI OS-level integration, not a public API
- All changes reverted: removed `AskDriftIntent.swift`, `DriftShortcuts.swift`, URL scheme from `Info.plist`, and JS listener from `App.tsx`

### 35. Model tag label — increased opacity (POLISH)
- **Root cause:** Model tag above AI messages used `text-text-muted` (`#6b7280`) — too faint, hard to read against the dark background.
- **Fix:** Changed to `text-text-secondary` (`#9ca3af`) — more readable while still clearly secondary.

### 34. Pushed drift messages — redesigned to look like regular AI messages (UX)
- **Root cause:** Pushed drift messages were rendered as a bordered dark card with `pt-10` top padding to fit an absolute-positioned `From:` / `Q:` header inside the bubble, plus a gradient "Drift" corner badge. Looked heavy and inconsistent with the rest of the chat.
- **Fix:** Removed the card border/background, `pt-10`, inline absolute header, and corner badge. Drift messages now render full-width like plain AI messages. A small `[Drift] "selectedText"` label (styled like the model tag line) appears above the content — subtle and consistent.

### 33. Drift context — parent conversation now included (BUG FIX)
- **Root cause:** `contextMessages` prop was passed into `DriftPanel` but destructured as `_contextMessages` (prefixed underscore = unused). The system prompt had zero knowledge of the parent conversation, so drifting on "Shila" from a Tel Aviv restaurants list gave the AI no idea it was a restaurant.
- **Fix:** Removed the `_` prefix so `contextMessages` is used. Last 6 parent messages are now injected into the system prompt as labelled `User:`/`Assistant:` lines. The AI is instructed to answer in that context and not treat the selected text as ambiguous when the conversation makes its meaning clear. Falls back to the generic prompt when `contextMessages` is empty.

### 32. Scroll reliability (BUG FIX)
- **Root cause:** Missing `touch-action: pan-y` on scroll container and intermediate wrapper div; MultiModelCarousel outer wrapper had no touch-action, intercepting vertical scroll gestures
- **Fix:** Added `touch-action: pan-y` to `.chat-messages-container` CSS, the `absolute inset-0` wrapper div in App.tsx, and carousel outer wrapper. Inner carousel scroll div stays `pan-x`. Vertical scroll now works reliably anywhere in the chat.

### 31. Swipe left/right to open/close sidebar (NEW FEATURE)
- New `src/hooks/useSwipeGesture.ts` hook — 50px min horizontal, ≤0.5 vertical/horizontal ratio to distinguish from scroll
- Swipe left anywhere in main chat → open sidebar; swipe right → close
- Excludes touches starting inside `.multi-model-carousel` to avoid conflict with carousel swipe
- Wired into main chat container in App.tsx

### 30. Multi-model continue — only continued model responds (BUG FIX)
- **Root cause:** Classic React stale closure — `sendMessage` captured `selectedTargets` from last render; `continueWithModel` updated the store synchronously but React hadn't re-rendered, so old multi-model array was used
- **Fix:** `sendMessage` now reads `useModelStore.getState().selectedTargets` (Zustand escape hatch) at call time. Also fixed `setSelectedTargetsPersist` which was persisting a stale value.

### 29. Drift bottom bar — reliability overhaul (BUG FIX)
- **Root cause (multiple):**
  1. Regular AI messages missing `.ai-message` class entirely — tooltip's `anchorEl.closest('.ai-message')` silently bailed
  2. Drift push-back messages also missing `.ai-message`, and had `select-text` explicitly suppressed
  3. DriftPanel AI messages missing both `.ai-message` and `data-message-id`
  4. iOS `selectionchange` race: bar dismissed before selection committed after finger lift
  5. Selection handle drag only checked `anchorNode`, not `focusNode`
  6. Bottom bar z-index too low (9999)
- **Fix:** Added `.ai-message` + `data-message-id` to all AI message render paths (App.tsx, DriftPanel.tsx). Fixed `select-text` suppression. Added `touchActiveRef` + 400ms post-touchend dismiss suppression. Now checks both `anchorNode` and `focusNode`. z-index raised to 99997.

### 28. Single-model → retroactive multi-model carousel (NEW FEATURE)
- New `retroactivelyUpgradeToBroadcast()` helper: when user adds a model after a single-model exchange, assigns a new `broadcastGroupId` to the last user + assistant messages
- Both `onToggleTarget` handlers (ModelPillRow + ModelPickerSheet) now handle the single-model case: if no active broadcast group exists, upgrades the last exchange and sends to new model(s)
- Result: existing response + new response(s) appear as a swipeable carousel, exactly like a native multi-model broadcast

### 27. Model picker — light mode (BUG FIX)
- **Root cause:** `ModelPickerSheet.tsx` used hardcoded dark colors (`bg-[#0f0f18]`, `text-white`, `text-white/40`, `bg-white/5`) — invisible/ugly in light mode
- **Fix:** All colors replaced with theme-aware Tailwind classes (`bg-dark-surface`, `text-text-primary`, `text-text-muted`, `bg-dark-elevated`, `border-dark-border`) — adapts to both themes automatically

### 26. Scroll overlap in multi-model mode (BUG FIX)
- **Root cause:** Messages container `padding-bottom: 9rem` didn't account for multi-model mode which adds ModelPillRow (~48px) + "Replying to" label (~24px) ≈ 72px extra bottom bar height
- **Fix:** Padding-bottom is now dynamic: `12rem` when `selectedTargets.length > 1`, `9rem` for single model

### 25. User message not appearing after "Continue →" on mobile (BUG FIX)
- **Root cause:** `continueWithModel` set `activeCanvasId`, causing the user reply to get `canvasId` on send → filtered out by `if (msg.canvasId) return null`. The canvas section is `hidden md:block` (desktop only), so messages were invisible on mobile
- **Fix:** Added `isTouchDevice` detection in App.tsx; `setActiveCanvasId` is now skipped on mobile so replies flow normally into the main message thread

### 24b. Drift bottom bar — redesign (UX)
- Full redesign of the iOS selection bottom bar (`SelectionTooltip.tsx` touch path)
- **Before:** Hardcoded `bg-[#1a1a2e]`, `text-white/40` — broken in light mode, dated look
- **After:** `bg-dark-surface/95 backdrop-blur-2xl` (white in light, dark in dark) + layered shadow
- Added `3px` vertical pink→violet gradient accent bar beside text preview
- **Drift button:** full gradient + `shadow-[0_4px_14px_rgba(168,85,247,0.35)]` + `active:scale-95`
- **Save button:** `bg-dark-elevated + border-dark-border` — fully theme-aware
- Desktop tooltip also updated to same treatment (gradient Drift, ghost Save)

### 21. Single-model mode — remove purple dot (POLISH)
- **Fix:** In `ModelPillRow.tsx`, the colored model dot is now hidden when only 1 target is selected. Shows only in multi-model mode where it helps distinguish models.

### 22. Multi-model carousel — swipe enabled (BUG FIX)
- **Root cause:** Outer `overflow-hidden` wrapper was creating a clipping context that blocked iOS touch-based horizontal scroll on the inner snap container
- **Fix:** Changed outer wrapper to `style={{ overflowX: 'clip' }}` (doesn't intercept scroll events); inner container changed from `overflowX: 'auto'` → `'scroll'`; added `touchAction: 'pan-x'` for explicit iOS gesture routing; `scrollSnapAlign: 'start'` for better snap feel

### 23. Continue button — moved below content (UX)
- **Root cause:** `absolute top-2 right-3` positioned the button overlapping the first line of text
- **Fix:** Button is now a flex row at the bottom of the card (`flex justify-end mt-3`), no longer overlapping content

### 24. Voice input — fixed (BUG FIX)
- **Root cause:** `Info.plist` was missing `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`. iOS silently denied `webkitSpeechRecognition.start()` with `not-allowed`, which was never shown to the user.
- **Fix:** Added both privacy keys to `Info.plist`. Added `toast.error()` display for voice errors so failures are visible. Installed `@capacitor-community/speech-recognition@7.0.1` as a fallback (Capacitor plugin, SPM-incompatible warning is benign — web speech path works).
- **⚠️ First launch after rebuild:** iOS will show a permission dialog for mic + speech. User must allow both.

### 19. Multi-model carousel — text overflow fix (BUG FIX)
- **Root cause:** `minWidth: '100%'` in a flex scroll container allows children to expand beyond viewport width — text spilled horizontally instead of wrapping
- **Fix:** Added `maxWidth: '100%'`, `min-w-0`, `overflow-hidden` on card and content divs so text wraps fully within the card, matching a normal single-model response

### 20. Drift bottom bar — restored (BUG FIX)
- **Root cause:** `SelectionTooltip` requires `.ai-message` class on the message element to know it's selectable AI content — the class was accidentally removed during the carousel restyle
- **Fix:** Re-added `ai-message` to the carousel card's content div; Drift + Save bottom bar works again on iOS

### 15. Multi-model carousel — frameless card design
- Removed the bordered card frame from each carousel card; each model's answer now renders as clean full-width content matching a normal single-model AI message
- Model label (colored dot + name) kept, positioned subtly above the content
- Pagination dots fixed for light mode: changed from `bg-white/15` (invisible on light bg) to theme-aware `bg-text-muted/30`

### 16. Retroactive model add
- When user adds a new model via ModelPillRow or ModelPickerSheet while an active broadcast group exists, the original user question is automatically sent to the new model
- Response is added to the same `broadcastGroupId` so it appears as a new swipeable card alongside existing answers
- Added `sendToTarget` helper that mirrors the broadcast dispatch switch-case for a single target

### 17. DriftPanel input — match main chat
- Moved mic button inside the textarea (was a separate external button to the right)
- Now uses `absolute right-2 bottom-2 flex items-center gap-1` container matching main chat exactly
- Button order: mic (when empty) → stop-generation → listening-stop → send
- Red glow overlay on listening state added
- Textarea `pr-24` to accommodate both buttons

### 18. Input field polish
- Inactive send button: removed grey background (`bg-white/[0.05] border border-white/10 opacity-40`) → just `text-text-muted cursor-default`, arrow visible without background
- Send button positioning: `bottom-2` via container (no more conditional `top-1/2 -translate-y-1/2`)
- Applies to DriftPanel; main chat was already using this style

### 11. Voice Input — Restart Fix (BUG FIX)
- **Root cause:** `recognition.onend` called `recognition.start()` on the already-ended instance → Chrome throws `InvalidStateError` → caught silently → mic dies after ~1ms
- **Fix:** `onend` now restarts via `startWebRef` (ref to `startListeningWeb`) after a 50ms delay, always creating a **fresh** `SpeechRecognition` instance
- Initial `start()` now wrapped in try/catch to surface real errors instead of silent failure
- Mic now stays live across silence gaps as intended

### 12. Model Picker — Light Mode Visibility (BUG FIX)
- **Root cause:** `ModelPillRow` used `text-white / border-white/10 / text-white/40` — invisible against light-mode background (`rgb(242 242 247)`)
- **Fix:** Replaced with theme-aware classes: `text-text-primary`, `text-text-muted`, `border-dark-border/60`
- Pill ✕ label also updated from `text-white/30` → `text-text-muted`

### 13. Model Selection — Toggle Revert Bug (BUG FIX)
- **Root cause:** `onToggleTarget` called `modelStore.toggleTarget(target)` then immediately `setSelectedTargetsPersist(modelStore.selectedTargets)` — but `modelStore.selectedTargets` is the stale pre-render snapshot, so `setSelectedTargets(old_value)` **undid every toggle**
- **Fix:** Compute next target list locally from current render's `selectedTargets` and call `setSelectedTargetsPersist(next)` directly — applied to both ModelPillRow and ModelPickerSheet handlers

### 14. Continue → Button — Gemini Cases (BUG FIX)
- `continueWithModel` previously had no cases for Gemini models — clicking "Continue →" on a Gemini broadcast card did nothing
- Added `Gemini Flash Lite` / `gemini-flash-lite` and `Gemini Flash` / `gemini-flash` cases

---

## Previous Sessions (1-10)
### 7. Mobile Multi-Model Chat (NEW)
- **Model pills row** — horizontal scrollable chips above the textarea (mobile-only, `lg:hidden`)
- **"+ Add model"** chip opens a **ModelPickerSheet** bottom sheet (slide-up) to select up to 3 models
- **Swipeable card carousel** — `MultiModelCarousel` component replaces the desktop grid on mobile; uses CSS `scroll-snap-type: x mandatory` for full-width per-model cards
- **Pagination dots** — tappable dots below the carousel show current card position
- **"Replying to: X"** label above textarea updates live as user swipes between model cards
- **"Continue →"** button on each card (appears when broadcast is active and response is ready)
- **Demo AI model** — wired in as `dummy-lite` target; streams word-by-word with 30-50ms delay
- Desktop (md+) keeps the existing 2-column grid unchanged

### 8. iOS Drift Text Selection Fix
- On touch/iOS devices, the tooltip no longer tries to appear above the selection (conflicts with native iOS copy menu)
- Instead: a **persistent bottom bar** appears fixed at the bottom of screen with selected text preview + Save + Drift buttons
- Touch events isolated from mouse events — touch path fires at 150ms; selectionchange debounce 200ms
- Bottom bar stays visible after native iOS menu dismisses; hides only when selection is cleared

### 9. ChatGPT-Style Input Field
- Both mic and send buttons now live **inside** the textarea, right edge
- **Empty state**: mic icon + dimmed send visible inside field
- **Typing state**: mic hidden, send glows pink→violet gradient
- **Voice listening state**: red ring on field border + pulsing red stop button

### 10. Voice Input — Toggle Fix (superseded by session 11)
- Tap-to-speak / tap-to-stop; `isListeningRef` pattern; three-tier fallback

### 1–6. Previous Sessions
1. AI Reply Design — containerless, full width
2. DriftPanel iOS keyboard fix
3. Sidebar wider (85vw/340px)
4. Input field placement in long chats
5. Design polish — Claude/Gemini feel
6. Voice input (Web Speech API) — initial implementation

---

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
