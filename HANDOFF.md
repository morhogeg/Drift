# Drift — Session Handoff

**Date:** March 6, 2026
**Branch:** `feature/list-anchors-links`
**Status:** Build passes, app fully functional. GitHub push pending (SSH auth fix needed).

---

## What Was Done This Session

### 1. Production Refactor
- Replaced 30+ `useState` hooks with **4 Zustand stores**: `chatStore`, `driftStore`, `modelStore`, `uiStore`
- `App.tsx` reduced from **3280 → ~2311 lines**
- Added **IndexedDB persistence** via `idb` (`src/services/db.ts`) — chats survive page reload
- Created shared type system (`src/types/chat.ts`)
- Added Toast notification system, `useAutoScroll` hook, `Button`/`Spinner` UI primitives

### 2. Google Gemini Integration
- Replaced OpenRouter as primary provider with **Google Gemini**
- Created `src/services/gemini.ts` — REST API, SSE streaming, converts OpenAI-style messages to Gemini format
- **Google Search grounding** enabled by default (`tools: [{google_search: {}}]`), retries without it on 400
- Default model: `gemini-3.1-flash-lite-preview`
- API key in `settingsStorage.ts` defaults: `AIzaSyAAQ4C79flJfL1Ggn2zukbhpMizA6hQ2RU`

### 3. Bug Fixes
| Bug | Fix |
|-----|-----|
| User messages disappearing | Stale closure in `streamIntoNewMessage` — now reads `useChatStore.getState().messages` |
| `[object Object]` in AI responses | `processEntityText` walk fn returned plain objects; now returns `null` |
| Pushed drift header truncated | Removed `whitespace-nowrap`, split into two rows with `truncate` |
| Gemini provider coerced to openrouter | `settingsStorage` migration now preserves `'gemini'` provider |
| Google Search grounding 400 errors | Added retry-without-grounding fallback |

### 4. DriftPanel Redesign
- Deeper panel background (`#0d0d12`) distinct from main chat
- Violet glow left border
- Glassmorphic header with quote-block context display
- Gradient user bubbles with glow shadow
- Gradient send button (lights up pink→violet when text is entered)
- Gradient typing indicator dots

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
    settingsStorage.ts       localStorage settings
  components/
    DriftPanel.tsx           redesigned side panel
    Settings.tsx             model config UI (Gemini first)
    HeaderControls.tsx       model picker chip
```

---

## What's Pending / Next Ideas

### Must do
- [x] **Push to GitHub** — SSH auth fixed. Key: `~/.ssh/github_drift` (ed25519), added to GitHub account. Remote set to `git@github.com:morhogeg/Drift.git`. Future sessions: just `git push origin main`.

### Good next features
- [ ] **Message editing** — click to edit a sent message, regenerate the AI response
- [ ] **Message regeneration** — re-run the last AI response (new button on AI bubbles)
- [ ] **Real auth** — Supabase Auth or Firebase Auth (currently a placeholder screen)
- [ ] **Keyboard shortcuts** — Cmd+Enter to send, Esc to close drift, etc.
- [ ] **Code block copy button** — syntax highlighted blocks lack a copy button
- [ ] **Multi-level drift** — drift from inside a drift conversation
- [ ] **Mobile** — Capacitor or PWA

### Polish
- [ ] App.tsx still ~2311 lines — could extract more custom hooks
- [ ] The main chat message bubbles could get the same design treatment as DriftPanel
- [ ] Dark backdrop/overlay when drift panel opens on mobile

---

## Running Locally

```bash
cd /Users/morhogeg/Drift
npm run dev        # dev server
npm run build      # production build
```

No `.env` needed — Gemini API key is hardcoded in `settingsStorage.ts` defaults.
