# Refactor + Security Handoff

**Branch:** `feature/apple-level-overhaul` · **As of:** June 5, 2026
**Pick it up next session with:** `/continue-refactor` (next target = **`DriftPanel.tsx`**)

> **Where we are:** Tier B steps 1–3 are DONE (`useChatActions`, `useDriftActions`,
> `useMessageStream`). Multi-model broadcast + continue-with-model were then
> **removed** (product decision — single-model only). **App.tsx is now 2948 lines**
> (was 4195 at the start of the refactor). `DriftPanel.tsx` (~1,916 lines) is the
> last untouched monolith → **that's Tier B step 4, the next session's job.**

---

## 🔴 ACTION REQUIRED FROM YOU (not code — only you can do this)

**Rotate BOTH Gemini API keys in Google AI Studio.** A security audit found two live keys exposed:

1. `AIzaSyAAQ4C79...` — committed in **pushed `main` git history** (commit `0ff024e` + 3 later). Removing it from current code does nothing; git history is permanent. Anyone who can clone the repo can recover it with `git log -S`. If the GitHub repo is public, assume it's already harvested.
2. `AIzaSyA5I7...` — in `.env` (correctly gitignored) but Vite inlines `VITE_`-prefixed vars into the built JS, so it ships in plaintext inside every TestFlight/web build.

After rotating: add a Google Cloud API-key restriction (Generative Language API only). Real long-term fix = move the key behind a server-side proxy so no LLM key ships in the client bundle.

---

## What was done this session (pushed)

| Commit | Change | Result |
|---|---|---|
| `b551bfa` | **`useMessageStream`** — extracted the message send/stream pipeline (Tier B step 3) | App.tsx 3579 → 3275 |
| `f0e19d7` | **Removed multi-model broadcast + continue-with-model** (single-model only; pickers single-select) | App.tsx 3275 → **2948** |

Both verified with `tsc -b` + `vite build` + a live Gemini Playwright smoke. Surgical removal: `selectedTargets` stays a length-1 array and the unused `Message` fields (`broadcastGroupId`/`canvasId`/`strandId`) remain in the type + DB schema, so multi-model is trivial to reintroduce later.

### Earlier (prior session)
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

### ⭐ NEXT: `DriftPanel.tsx` (~1,916 lines) — Tier B step 4
The last untouched monolith. Same playbook as the App.tsx hooks: orient first, then pull cohesive concerns into focused hooks/modules one-per-commit, behavior-preserving. **Before starting, read it and map its concerns** (likely candidates: the drift conversation send/stream loop, the Connect/Simplify/Deep-dive template logic + `TEMPLATE_SYSTEM_PROMPTS`, the lens/"View as" switcher, the connect-cards parser, and the breadcrumb/ancestry UI). Then propose a slice order (lowest-risk first) and confirm before cutting. **Requires a live drift smoke** (create a drift → ask a question → watch it stream) on any send/stream change.

> Tip: `src/hooks/useMessageStream.ts` and `src/hooks/useDriftActions.ts` are the
> reference pattern for the deps-interface + JSDoc style to match.

### ✅ Already complete (this + prior sessions)
- **Tier B step 3** — message send/stream pipeline → `src/hooks/useMessageStream.ts` (commit `b551bfa`; later trimmed to single-model, now just `sendMessage` + `stopGeneration`).
- **Multi-model broadcast + continue-with-model REMOVED** (commit `f0e19d7`) — single-model only (may return later). Removed the broadcast send path, `sendToTarget`, `retroactivelyUpgradeToBroadcast`, `continueWithModel`, the broadcast-group render branch, `MultiModelCarousel` (deleted), per-model canvases, Continue buttons/banner, strand beads, and the related App state. Pickers are single-select. `selectedTargets` is still a length-1 array and the unused `Message` fields (`broadcastGroupId`/`canvasId`/`strandId`) remain in the type + DB schema, so multi-model is trivial to reintroduce. **`continueWithModel` no longer exists — the previously-planned `useModelActions` extraction is moot.**

### Optional follow-up (separate, clearly-labeled commit)
- `handleStartDrift` (in `useDriftActions`) is ~200 lines with three branches (nested-drift / found-message / fallback) — could split into smaller private helpers. Only as its own commit, not bundled with an extraction.

---

## Guardrails (unchanged — see `.claude/commands/continue-refactor.md` for the full list)
- One concern per commit · behavior-preserving only · `tsc` + `build` + Playwright/live smoke before every commit.
- Stage explicit paths only (never `git add -A`) — leave the untracked `design-pink-first-todo.md` / `design-preview.html` alone.
- Push each verified step. Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Already extracted into `src/hooks/` (do NOT re-extract)
`useKeyboardVisibility`, `useCoachMark`, `useAuth`, `useConnectionStatus`, `useOnOutsideClick`, `useKeyboardShortcuts`, **`useChatActions`**, **`useDriftActions`** (COMPLETE — all 9 drift handlers), **`useMessageStream`** (COMPLETE — single-model send/stream: `sendMessage` / `stopGeneration`). Also `src/lib/format.ts`, `src/lib/onboardingFlag.ts`.
