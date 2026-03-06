# Drift — Session Handoff

**Date:** March 6, 2026
**Branch:** `main`
**Status:** Fully working on iOS simulator (Capacitor). Google Search grounding active. API key secured in `.env`.

---

## What Was Done This Session

### 1. iOS / Capacitor Setup
- Added `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios` — Xcode project at `ios/`
- Bundle ID: `com.morhogeg.drift` | Team: `8Y2M94RUHG`
- App display name: **Sidedrift** (set in `Info.plist` + App Store Connect)
- App Store Connect app record created manually (name "Drift", "Drift AI", "Drift - AI Chat" all taken)
- Custom Y-fork app icon generated (thin pink→violet gradient arms, deep purple bg)

### 2. Mobile UI Optimization
- **Login screen**: desktop container hidden on mobile (`hidden lg:flex`), mobile overlay `z-20`
- **Sidebar**: starts closed on mobile (`window.innerWidth >= 1024` check in `uiStore.ts`)
- **Backdrop**: dark blur overlay when sidebar opens on mobile
- **Safe areas**: `pt-safe` / `pb-safe` utilities + `env(safe-area-inset-*)` on input/panel
- **DriftPanel**: full-screen on mobile (`fixed inset-0`), desktop-only width via `lg:` prefix
- **Layout**: `h-[100dvh]`, main content margins scoped to `lg:ml-[260px]`
- **iOS polish** in `index.css`: `-webkit-tap-highlight-color: transparent`, `font-size: 16px` on inputs (prevents zoom), `overscroll-behavior: none`

### 3. API Key Security Fix
- Old key `AIzaSyAAQ4C79flJfL1Ggn2zukbhpMizA6hQ2RU` was hardcoded and leaked to git
- **New key** moved to `.env` (gitignored): `VITE_GEMINI_API_KEY=...`
- `settingsStorage.ts` fallback changed to empty string — settings UI opens if key missing

### 4. Google Search Grounding
- Already implemented (`tools: [{ google_search: {} }]`) and working
- Improved 400 fallback: now logs actual error body, only strips grounding if the error is specifically about the tool (checks for `google_search`/`tool`/`INVALID_ARGUMENT` in error text)

### 5. Header & UI Polish
- Header tightened: `py-2.5` → `py-1.5`, icons `w-5` → `w-4`
- App name changed: "Drift" → "Sidedrift", centered in header
- Send button: visual circle reduced from 44px to `w-7 h-7` (28px), tap target stays 44px
- Stop button: subtle white/border style instead of gradient

---

## Current Architecture

```
src/
  App.tsx                    ~2311 lines
  store/
    chatStore.ts             chat sessions + IndexedDB persistence
    driftStore.ts            drift panel open/closed + temp conversations
    modelStore.ts            selected targets + per-chat model prefs
    uiStore.ts               panels, hover/copy/scroll state
  services/
    gemini.ts                PRIMARY — Gemini REST + SSE + grounding
    openrouter.ts            secondary
    ollama.ts                local models
    db.ts                    IndexedDB (idb)
    settingsStorage.ts       localStorage settings (key from VITE_GEMINI_API_KEY)
  components/
    DriftPanel.tsx           full-screen on mobile, 450px on desktop
    Login.tsx                mobile + desktop layouts
    Settings.tsx             model config UI
    HeaderControls.tsx       model picker chip
ios/
  App/                       Capacitor Xcode project
    App/Info.plist           CFBundleDisplayName = Sidedrift
    App.xcodeproj/           bundle ID + signing team
```

---

## Running Locally

```bash
cd /Users/morhogeg/Drift
npm run dev                            # web dev server
npm run build && npx cap sync ios      # build + sync to Xcode
# then open Xcode → run on simulator or device
```

**API key**: create `.env` in project root:
```
VITE_GEMINI_API_KEY=your_key_here
```

---

## What's Pending / Next Ideas

### Good next features
- [ ] **Message editing** — click to edit a sent message, regenerate the AI response
- [ ] **Message regeneration** — re-run the last AI response
- [ ] **Real auth** — Supabase Auth or Firebase Auth (Login screen is currently a placeholder)
- [ ] **TestFlight submission** — archive in Xcode → upload to App Store Connect
- [ ] **Code block copy button** — syntax highlighted blocks lack a copy button
- [ ] **Multi-level drift** — drift from inside a drift conversation

### Polish
- [ ] App.tsx still ~2311 lines — could extract more custom hooks
- [ ] Main chat message bubbles could get same design treatment as DriftPanel
- [ ] Snippet Gallery not accessible on mobile (hidden on mobile currently)
