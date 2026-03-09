# Drift — Session Handoff

**Date:** March 9, 2026
**Branch:** `main`
**Status:** Bug fix session — voice input, model picker light mode, model toggle revert. All pushed. Synced to Xcode.

---

## What Was Done This Session

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

- [ ] **Real model for multi-model** — add more real models to ModelPickerSheet's ALL_MODELS list (Gemini Flash 2.5, etc.)
- [ ] **Light theme color polish** — hardcoded dark hex colors in App.tsx/DriftPanel.tsx bypass theme system
- [ ] **Message editing** — click to edit a sent message, regenerate the AI response
- [ ] **Message regeneration** — re-run the last AI response
- [ ] **Real auth** — Supabase Auth or Firebase Auth (Login screen is currently a placeholder)
- [ ] **TestFlight submission** — archive in Xcode → upload to App Store Connect
- [ ] **Code block copy button** — syntax highlighted blocks lack a copy button
- [ ] **Multi-level drift** — drift from inside a drift conversation
- [ ] **App.tsx refactor** — still ~2430 lines, could extract more hooks
- [ ] **Voice output** — TTS read-back of AI responses
