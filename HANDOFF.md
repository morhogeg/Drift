# Drift — Session Handoff

**Date:** March 6, 2026
**Branch:** `feature/list-anchors-links`
**Status:** Fully working on iOS (Capacitor/TestFlight). Light/dark theme system live.

---

## What Was Done This Session

### 1. iOS Keyboard Fix
- `#root` changed from `height: 100dvh` to `height: 100%` (follows body height that Capacitor resizes)
- Root div changed from `h-[100dvh] overflow-hidden` to `h-full` — allows layout to reflow when keyboard appears
- Input field now stays above keyboard when tapped

### 2. Header Cleanup
- Removed "Sidedrift" title from header
- Plus (new chat) button moved to right side of header (where Settings was)
- Settings removed from header — now lives in sidebar footer
- Header height shrunk: `py-1.5` → `py-0.5`, `px-3` → `px-2`

### 3. Sidebar Cleanup
- Removed "Chat History" label
- Search bar and collapse arrow combined into single row
- Chat item icons (MessageCircle, GitBranch) removed
- Tapping a chat now auto-closes sidebar (`switchChat` + `setSidebarOpen(false)`)

### 4. Light/Dark Theme System
- Tailwind `darkMode: 'class'` strategy
- CSS variables as RGB triplets in `:root` (light) and `.dark` (dark) — supports opacity modifiers
- `uiStore.ts` — `theme: 'dark' | 'light'`, `setTheme()`, persisted to localStorage, applies `dark` class to `<html>`
- Defaults to dark theme

### 5. Settings Screen Redesign
- Full panel redesign: sections (MODELS, APPEARANCE, ADVANCED), clean rows, custom toggle switches
- API keys moved inside each model's expanded section (no separate API KEYS section)
- Theme toggle in APPEARANCE section — live dark/light switch

### 6. DriftPanel Redesign
- Slim header: chevron-down close + selected text (italic) + expand — no "DRIFT" label
- Removed quote block (selected text now lives in header)
- User bubbles: `max-w-[75%]` subtle violet-tinted, not gradient blobs
- AI bubbles: transparent background, clean typography
- Push/Save actions: slim bar below header, only shown when messages exist
- Typing indicator: 3 bare dots, no container

### 7. Drift Link Tap on iOS
- Added `onTouchEnd` + `e.preventDefault()` + `e.stopPropagation()` to inline drift link buttons in main chat
- Prevents iOS text-selection handler from swallowing the tap
- Both temp drifts (in panel) and saved drift chats now open correctly on tap

### 8. iOS Text Selection for Drift
- `SelectionTooltip.tsx`: added `selectionchange` (debounced 300ms) and `touchend` (350ms delay) listeners
- Uses `getBoundingClientRect()` for tooltip positioning on mobile
- Tooltip buttons have `onTouchStart`/`onTouchEnd` to prevent selection loss

---

## Current Architecture

```
src/
  App.tsx                    ~2350 lines
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
    DriftPanel.tsx           redesigned side panel
    SelectionTooltip.tsx     iOS-aware text selection tooltip
    Settings.tsx             redesigned settings panel
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
- [ ] **App.tsx refactor** — still ~2350 lines, could extract more hooks
