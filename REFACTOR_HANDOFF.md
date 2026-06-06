# Refactor + Security Handoff

**Branch:** `feature/apple-level-overhaul` · **As of:** June 6, 2026
**Pick it up next session with:** `/continue-refactor` (Tier B steps 1–4 are DONE — see "What's left" for the remaining optional follow-ups)

> **Where we are:** Tier B steps 1–3 (App.tsx) are DONE (`useChatActions`,
> `useDriftActions`, `useMessageStream`); App.tsx is **2948 lines** (was 4195).
> **Tier B step 4 — `DriftPanel.tsx` decomposition — is now COMPLETE:**
> - **Slice 1+2 DONE** (commit `00965d9`): pure helpers + `TEMPLATE_SYSTEM_PROMPTS`
>   → `src/lib/driftPanel.ts`.
> - **Slice 3 DONE** (commit `ae686a0`): send/stream pipeline → `src/hooks/useDriftMessageStream.ts`.
> - **Slice 4 DONE** (commit `d489210`): push/save action layer + state cluster
>   → `src/hooks/useDriftPanelActions.ts`.
> - **Slice 5 DONE** (commit `c99fb3d`): Connect-mode logic (chips, bridge questions,
>   visited-answer cache, stale-render guards) → `src/hooks/useConnectThreads.ts`.
> - **DriftPanel.tsx is now 1199 lines** (was 1916 at the start of step 4).
> - All five slices verified: `tsc` + `vite build` + a live/mocked Playwright smoke
>   per slice. Slice 5's Connect smoke ran against a **mocked Gemini SSE** because the
>   live Gemini key is **spend-capped** (HTTP 429 `RESOURCE_EXHAUSTED`) — see below.

> ⚠️ **Gemini key is spend-capped** (monthly cap hit, every call 429s). This is on top
> of the rotate-the-key action below. The user must raise/reset the spend cap in
> Google AI Studio (https://ai.studio/spend) before live AI works again — or wire the
> OpenRouter fallback (no OpenRouter key is in `.env` today).

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

### Tier B core decomposition is DONE
App.tsx (steps 1–3) and DriftPanel.tsx (step 4, all 5 slices) are both decomposed.
No required extraction remains. What's left is **optional polish only** — pick up
any of these as its own clearly-labeled, behavior-preserving commit:

- **Drop the noisy `[BUTTON-CLICK …]` / `[DRIFT-PANEL …]` console.logs** now living in
  `useDriftPanelActions.ts` (`handlePushToMain`). Carried over verbatim during slice 4;
  safe to delete as a standalone cleanup commit.
- **`handleStartDrift`** (in `useDriftActions`) is ~200 lines with three branches
  (nested-drift / found-message / fallback) — could split into smaller private helpers.
- **`App.tsx` is still ~2948 lines** — if further decomposition is wanted, the render
  tree (not just logic) is the remaining bulk; that's a Tier C concern, not started.

> Reference pattern for new hooks: `src/hooks/useDriftMessageStream.ts`,
> `src/hooks/useDriftPanelActions.ts`, `src/hooks/useConnectThreads.ts` (deps-interface
> + JSDoc style). **Smoke recipe** (Playwright `.mjs` in-repo, set `localStorage`
> `driftUser`+`drift_onboarded='true'`, viewport ≥1400×950 + `{ force: true }` on the
> panel header buttons which can scroll out of view; trigger a drift by selecting text
> in an assistant bubble — `div.ai-message[data-message-id]` — and dispatching `mouseup`,
> then click `button[title^="Drift on selected text"]` or the **`Connect`** template
> button; drift input is `textarea[placeholder="Explore this drift…"]`; drift bubbles
> carry `[data-drift-message-id]`; Connect edge cards are
> `button[class*="min-h-[54px]"]`). **When the Gemini key is spend-capped, mock the
> stream:** `page.route('**/*:streamGenerateContent*', …)` and branch on `postData()` —
> `'raw JSON array of 5-6 strings'` ⇒ return the cards JSON, `'tapped a connection to
> explore this bridge'` ⇒ return prose, else ⇒ main-chat prose; fulfill with
> `Content-Type: text/event-stream` and `data: {…candidates…}\n\ndata: [DONE]\n\n`.

### ✅ Already complete (this + prior sessions)
- **Tier B step 4 — `DriftPanel.tsx` decomposition (all 5 slices)** — `src/lib/driftPanel.ts`
  (pure helpers + prompts), `src/hooks/useDriftMessageStream.ts` (send/stream),
  `src/hooks/useDriftPanelActions.ts` (push/save), `src/hooks/useConnectThreads.ts`
  (Connect mode). DriftPanel.tsx 1916 → **1199 lines**.
- **Tier B step 3** — message send/stream pipeline → `src/hooks/useMessageStream.ts` (commit `b551bfa`; later trimmed to single-model, now just `sendMessage` + `stopGeneration`).
- **Multi-model broadcast + continue-with-model REMOVED** (commit `f0e19d7`) — single-model only (may return later). Removed the broadcast send path, `sendToTarget`, `retroactivelyUpgradeToBroadcast`, `continueWithModel`, the broadcast-group render branch, `MultiModelCarousel` (deleted), per-model canvases, Continue buttons/banner, strand beads, and the related App state. Pickers are single-select. `selectedTargets` is still a length-1 array and the unused `Message` fields (`broadcastGroupId`/`canvasId`/`strandId`) remain in the type + DB schema, so multi-model is trivial to reintroduce. **`continueWithModel` no longer exists — the previously-planned `useModelActions` extraction is moot.**

---

## Guardrails (unchanged — see `.claude/commands/continue-refactor.md` for the full list)
- One concern per commit · behavior-preserving only · `tsc` + `build` + Playwright/live smoke before every commit.
- Stage explicit paths only (never `git add -A`) — leave the untracked `design-pink-first-todo.md` / `design-preview.html` alone.
- Push each verified step. Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Already extracted into `src/hooks/` (do NOT re-extract)
`useKeyboardVisibility`, `useCoachMark`, `useAuth`, `useConnectionStatus`, `useOnOutsideClick`, `useKeyboardShortcuts`, **`useChatActions`**, **`useDriftActions`** (COMPLETE — all 9 drift handlers), **`useMessageStream`** (COMPLETE — App's single-model send/stream), **`useDriftMessageStream`** (COMPLETE — DriftPanel's send/stream: `sendMessage` / `retryLastMessage` / `stopGeneration` / `handleCompareAcrossModels`), **`useDriftPanelActions`** (COMPLETE — DriftPanel push/save: `handlePushSingleMessage` / `handleToggleSaveMessage` / `handleSaveAsChat` / `handlePushToMain` + the push/save state cluster + `resetPushSaveState` / `loadSavedMessageIds`), **`useConnectThreads`** (COMPLETE — DriftPanel Connect mode: `bridgeQuestion` / `openConnectThread` / `initConnectState` + chips/question/visited-cache state + the 4 Connect effects + stale-render guards). Also `src/lib/format.ts`, `src/lib/onboardingFlag.ts`, **`src/lib/driftPanel.ts`** (DriftPanel pure helpers + `TEMPLATE_SYSTEM_PROMPTS`).
