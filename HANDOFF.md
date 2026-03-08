# Drift — Session Handoff

**Date:** March 9, 2026
**Branch:** `main` (was `feature/list-anchors-links`, merged to main)
**Status:** Major session — multi-model mobile UX, iOS drift fix, ChatGPT-style input, voice fix. All pushed.

---

## What Was Done This Session

### 7. Mobile Multi-Model Chat (NEW)
- **Model pills row** — horizontal scrollable chips above the textarea (mobile-only, `lg:hidden`)
- **"+ Add model"** chip opens a **ModelPickerSheet** bottom sheet (slide-up) to select up to 3 models
- **Swipeable card carousel** — `MultiModelCarousel` component replaces the desktop grid on mobile; uses CSS `scroll-snap-type: x mandatory` for full-width per-model cards
- **Pagination dots** — tappable dots below the carousel show current card position
- **"Replying to: X"** label above textarea updates live as user swipes between model cards
- **"Continue →"** button on each card (appears when broadcast is active and response is ready)
- **Demo AI model** — wired in as `dummy-lite` target; streams word-by-word with 30-50ms delay
- Desktop (md+) keeps the existing 2-column grid unchanged

### 8. iOS Drift Text Selection Fix (NEW)
- On touch/iOS devices, the tooltip no longer tries to appear above the selection (conflicts with native iOS copy menu)
- Instead: a **persistent bottom bar** appears fixed at the bottom of screen with selected text preview + Save + Drift buttons
- Touch events isolated from mouse events — touch path fires at 150ms (was 350ms); selectionchange debounce 200ms (was 300ms)
- Bottom bar stays visible after native iOS menu dismisses; hides only when selection is cleared
- Desktop floating tooltip unchanged

### 9. ChatGPT-Style Input Field (NEW)
- Both mic and send buttons now live **inside** the textarea, right edge (no external floating buttons)
- Field takes full container width with dynamic right-padding to accommodate buttons
- **Empty state**: mic icon + dimmed send visible inside field
- **Typing state**: mic hidden, send glows pink→violet gradient
- **Voice listening state**: red ring on field border + pulsing red stop button
- Old external floating send/mic buttons fully removed

### 10. Voice Input — Properly Fixed (NEW)
- **Tap to speak / tap to stop** (was hold-to-speak, now toggle)
- `isListeningRef` pattern fixes iOS auto-stop quirk: recognition restarts on `onend` if user hasn't explicitly stopped, so mic stays live across silence gaps
- Three-tier fallback: `webkitSpeechRecognition` → `SpeechRecognition` → `@capacitor-community/speech-recognition` (Capacitor plugin, auto-detected if installed)
- Transcript accumulates across chunks; `onResult` callback fires per chunk for real-time textarea updates
- Fully backward-compatible: `onResult` optional, same return shape

### Previous Sessions (1-6)
### 1. AI Reply Design — Containerless, Full Width
- Removed the gray card/border/shadow from plain AI messages — text renders directly on background
- AI messages now take full width (no `max-w-[85%]` constraint)
- Model label (e.g. "Gemini Flash Lite") moved above the message as a small muted `text-[11px]` label
- Copy/bookmark action row no longer has the card's `border-t` separator
- User bubbles kept as gradient pill but narrowed to `max-w-[80%]`

### 2. DriftPanel iOS Keyboard Fix
- Messages scroll area: `paddingBottom: calc(var(--kb-h, 0px) + 5rem)` — scrolls above keyboard
- Input container: `paddingBottom: calc(var(--kb-h, 0px) + env(safe-area-inset-bottom) + 0.5rem)`
- `--kb-h` CSS var is set globally by `keyboardWillShow` listener in App.tsx (already existed)

### 3. Sidebar Wider
- Width: `w-[85vw] max-w-[340px]` (was fixed `w-[260px]`)
- Chat titles: removed `truncate` — titles now wrap to second line instead of cutting off
- Desktop main content margin updated to `lg:ml-[340px]`

### 4. Input Field Placement in Long Chats
- Messages container bottom padding: `calc(9rem + var(--kb-h, 0px))` (was 6rem)
- Last message no longer slides under the floating input bar

### 5. Design Polish — Claude/Gemini Feel
- **Empty state**: New centered "What's on your mind?" screen with gradient Drift logo mark and subtitle
- **AI text**: Bumped from `text-[13px] leading-6` → `text-[15px] leading-7` (more readable)
- **User text**: Bumped to `text-[14px] font-medium`
- **Typing indicator**: Bare 3 dots (`w-1.5 h-1.5`), no card container
- **Messages area**: Removed heavy `bg-dark-surface/90 rounded-t-2xl shadow-inner` wrapper
- **Message spacing**: `space-y-2` with `mt-6` on each user message for natural conversation rhythm

### 6. Voice Input (Web Speech API)
- New hook: `src/hooks/useVoiceInput.ts` — wraps `SpeechRecognition` / `webkitSpeechRecognition`
- Mic button added to main chat input (between textarea and send button)
- Mic button added to DriftPanel input area
- Idle: ghost circular button; Listening: red + `animate-pulse`; Appends transcript to input text
- Hidden automatically if browser doesn't support SpeechRecognition

---

## Current Architecture

```
src/
  App.tsx                    ~2420 lines
  hooks/
    useVoiceInput.ts         tap-to-speak, 3-tier fallback, iOS-safe
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
    MultiModelCarousel.tsx   NEW — mobile swipeable card carousel for broadcast
    ModelPillRow.tsx         NEW — model selection chips above input (mobile)
    ModelPickerSheet.tsx     NEW — bottom sheet model picker (up to 3 models)
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

- [ ] **Real model for multi-model** — wire in Gemini Flash as second model alongside Flash Lite in the default picker (add more real models to ModelPickerSheet's ALL_MODELS list)
- [ ] **Light theme color polish** — hardcoded dark hex colors in App.tsx/DriftPanel.tsx bypass theme system
- [ ] **Message editing** — click to edit a sent message, regenerate the AI response
- [ ] **Message regeneration** — re-run the last AI response
- [ ] **Real auth** — Supabase Auth or Firebase Auth (Login screen is currently a placeholder)
- [ ] **TestFlight submission** — archive in Xcode → upload to App Store Connect
- [ ] **Code block copy button** — syntax highlighted blocks lack a copy button
- [ ] **Multi-level drift** — drift from inside a drift conversation
- [ ] **App.tsx refactor** — still ~2400 lines, could extract more hooks
- [ ] **Voice output** — TTS read-back of AI responses
