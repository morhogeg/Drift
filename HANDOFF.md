# Drift — Session Handoff

**Date:** March 11, 2026
**Branch:** `main`
**Build:** 16
**Status:** Fixed input field positioning on iOS (keyboard open/closed), fixed retroactive multi-model not going into carousel. Build 16 synced to Xcode.

---

## What Was Done This Session

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

- [ ] **TestFlight submission** — archive build 16 in Xcode → upload to App Store Connect. ⚠️ First launch after install will prompt for mic + speech recognition permissions — user must allow both for voice to work.
- [ ] **Real model for multi-model** — add more real models to ModelPickerSheet's ALL_MODELS list (Gemini Flash 2.5, etc.)
- [ ] **Light theme color polish** — some hardcoded dark hex colors remain in App.tsx/DriftPanel.tsx (e.g. `bg-[#0d0d12]`, `bg-[#0a0a0a]`)
- [ ] **Message editing** — click to edit a sent message, regenerate the AI response
- [ ] **Message regeneration** — re-run the last AI response
- [ ] **Real auth** — Supabase Auth or Firebase Auth (Login screen is currently a placeholder)
- [ ] **Code block copy button** — syntax highlighted blocks lack a copy button
- [ ] **Multi-level drift** — drift from inside a drift conversation
- [ ] **App.tsx refactor** — still ~2430 lines, could extract more hooks
- [ ] **Voice output** — TTS read-back of AI responses
