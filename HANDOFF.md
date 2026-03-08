# Drift — Session Handoff

**Date:** March 8, 2026
**Branch:** `feature/list-anchors-links`
**Status:** Fully working on iOS (Capacitor). Major UI polish + voice input added.

---

## What Was Done This Session

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
  App.tsx                    ~2380 lines
  hooks/
    useVoiceInput.ts         NEW — Web Speech API wrapper
    useAutoScroll.ts
    useToast.ts
  store/
    chatStore.ts             chat sessions + IndexedDB persistence
    driftStore.ts            drift panel open/closed + temp conversations
    modelStore.ts            selected targets + per-chat model prefs
    uiStore.ts               panels + theme (dark/light) state
  services/
    gemini.ts                PRIMARY — Gemini REST + SSE + grounding
    openrouter.ts            secondary
    ollama.ts                local models
    db.ts                    IndexedDB (idb)
    settingsStorage.ts       localStorage settings
  components/
    DriftPanel.tsx           side panel (keyboard-aware input)
    SelectionTooltip.tsx     iOS-aware text selection tooltip
    Settings.tsx             settings panel
    Login.tsx                mobile + desktop layouts
    HeaderControls.tsx       model picker chip
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

- [ ] **Light theme color polish** — hardcoded dark hex colors in App.tsx/DriftPanel.tsx bypass theme system
- [ ] **Message editing** — click to edit a sent message, regenerate the AI response
- [ ] **Message regeneration** — re-run the last AI response
- [ ] **Real auth** — Supabase Auth or Firebase Auth (Login screen is currently a placeholder)
- [ ] **TestFlight submission** — archive in Xcode → upload to App Store Connect
- [ ] **Code block copy button** — syntax highlighted blocks lack a copy button
- [ ] **Multi-level drift** — drift from inside a drift conversation
- [ ] **App.tsx refactor** — still ~2380 lines, could extract more hooks
- [ ] **Voice output** — TTS read-back of AI responses
