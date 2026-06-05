# Refactor + Security Handoff

**Branch:** `feature/apple-level-overhaul` · **As of:** June 5, 2026
**Pick it up next session with:** `/continue-refactor`
(or target a specific piece: `/continue-refactor handleStartDrift`)

---

## 🔴 ACTION REQUIRED FROM YOU (not code — only you can do this)

**Rotate BOTH Gemini API keys in Google AI Studio.** A security audit found two live keys exposed:

1. `AIzaSyAAQ4C79...` — committed in **pushed `main` git history** (commit `0ff024e` + 3 later). Removing it from current code does nothing; git history is permanent. Anyone who can clone the repo can recover it with `git log -S`. If the GitHub repo is public, assume it's already harvested.
2. `AIzaSyA5I7...` — in `.env` (correctly gitignored) but Vite inlines `VITE_`-prefixed vars into the built JS, so it ships in plaintext inside every TestFlight/web build.

After rotating: add a Google Cloud API-key restriction (Generative Language API only). Real long-term fix = move the key behind a server-side proxy so no LLM key ships in the client bundle.

---

## What was done this session (1 commit, pushed)

### Refactor — decomposing the `App.tsx` monolith (Tier B)
| Commit | Hook | Result |
|---|---|---|
| `33e1015` | **`useDriftActions` (slice 2)** — `handleStartDrift`, `handleCloseDrift`, `handlePushDriftToMain`, `handleSaveDriftAsChat`, `handleSavePushedDriftAsChat` | App.tsx 4075 → **3579** |

Behavior-preserving faithful copies. The App-owned pieces the handlers need are now passed through the hook deps interface: `mainScrollPosition`, `connectCardsCache`, `setLastDrift`, `setJustPromotedChatId`, `justPromotedTimerRef`, `stripMarkdown`. Verified: `tsc --noEmit` clean + `npm run build` + a live Gemini Playwright smoke that drove the full flow — create drift → push-to-main → undo → save-as-chat — with no console/page errors. `useDriftActions` now owns the entire drift action layer (9 handlers).

### Prior session (6 commits, pushed)
- `2054b86` **`useChatActions`** — sidebar CRUD (rename / duplicate / delete / pin / star / context-menu). App.tsx 4195 → 4162.
- `3886b5b` **`useDriftActions` (slice 1)** — `reopenLastDrift`, `handleNavigateToBreadcrumb`, `handleUndoPushToMain`, `handleUndoSaveAsChat`. App.tsx 4162 → 4075.
- Security: `07b4905` strip API keys from backup export · `f00f499` Gemini key via `x-goog-api-key` header · `364b366` remove copy-API-key button · `22a6803` `npm audit fix`.

### Security hardening (code-level fixes I could safely make)
| Commit | Fix |
|---|---|
| `07b4905` | Strip API keys from backup export (`backup.ts` `sanitizeSettings`) — backups no longer leak the key + all chats in plaintext |
| `f00f499` | Send Gemini key via `x-goog-api-key` header, not URL `?key=` (`gemini.ts` ×6, `embeddings.ts` ×1) — avoids proxy/CDN logging. Live-verified HTTP 200 |
| `364b366` | Remove copy-API-key-to-clipboard button in `Settings.tsx` |
| `22a6803` | `npm audit fix` — cleared both high-severity prod vulns (`@xmldom/xmldom`, `tar`) |

**Audited clean:** no `dangerouslySetInnerHTML`/XSS sink, no analytics/telemetry exfiltrating chats, no hardcoded emails. Chats only ever go to the user-configured LLM provider.

---

## What's left — next session

### Message send / stream pipeline (Tier B step 3) — RECOMMENDED NEXT
The biggest remaining concern still inline in `App.tsx`: the message send function(s) + streaming loop. Extract into a focused hook/module (e.g. `useMessageStream`). Highest blast radius after drift — **requires a live AI smoke** that actually sends a message and watches it stream (live Gemini key in `.env`).

### Optional after that
- Same hook-extraction treatment on `DriftPanel.tsx` (~1,900 lines).
- `handleStartDrift` is ~200 lines with three branches (nested-drift / found-message / fallback) — a candidate to split into smaller private helpers inside the hook, but only as a separate, clearly-labeled commit (not while it's still warm from the move).

### Optional after App.tsx shrinks
- Same hook-extraction treatment on `DriftPanel.tsx` (~1,900 lines).

---

## Guardrails (unchanged — see `.claude/commands/continue-refactor.md` for the full list)
- One concern per commit · behavior-preserving only · `tsc` + `build` + Playwright/live smoke before every commit.
- Stage explicit paths only (never `git add -A`) — leave the untracked `design-pink-first-todo.md` / `design-preview.html` alone.
- Push each verified step. Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Already extracted into `src/hooks/` (do NOT re-extract)
`useKeyboardVisibility`, `useCoachMark`, `useAuth`, `useConnectionStatus`, `useOnOutsideClick`, `useKeyboardShortcuts`, **`useChatActions`**, **`useDriftActions`** (COMPLETE — all 9 drift handlers). Also `src/lib/format.ts`, `src/lib/onboardingFlag.ts`.
