---
description: Resume the production-grade decomposition of Drift's App.tsx / DriftPanel monoliths (Tier B), step by step with rollback-safe commits.
argument-hint: "[optional: specific hook/target to start with]"
---

You are resuming a **staged, production-grade refactor** of the Drift web app. Context was cleared, so orient yourself first, then continue exactly in the established pattern. The user's overriding requirement: **production-grade code, and do NOT break anything — verify multiple times.**

## 1. Orient yourself (do this first)
- Repo: `/Users/morhogeg/Drift`. Branch: **`feature/apple-level-overhaul`** (confirm with `git branch --show-current`; do not switch).
- Read `DRIFT_STATUS.md` and run `git log --oneline -12` to see recent work.
- The refactor checkpoint is commit **`b3db9e2`** ("Map drag fix, drift error UX, onboarding, backup + code-quality pass"). Everything after it is one-hook-per-commit.
- Already extracted into `src/hooks/` (do NOT re-extract): `useKeyboardVisibility`, `useCoachMark`, `useAuth`, `useConnectionStatus`, `useOnOutsideClick`, `useKeyboardShortcuts`. Also `src/lib/format.ts` and `src/lib/onboardingFlag.ts`.
- The monolith is `src/App.tsx` (~4,195 lines, ALL inside one `App()` component). Secondary: `src/components/DriftPanel.tsx` (~1,900 lines).

## 2. The task — Tier B (core logic), in this order
Extract the remaining cohesive concerns out of `App.tsx` into focused hooks/modules. Suggested order (lowest risk first):
1. **`useChatActions`** — sidebar CRUD: rename / save-rename / duplicate / delete / pin / star / context-menu (`handleRenameChat`, `handleDuplicateChat`, `handleDeleteChat`, `handleTogglePin`, `handleToggleStar`, `handleContextMenu`, `handleSaveRename`). These mostly delegate to `chatStore`/`uiStore` — UI-verifiable without AI.
2. **`useDriftActions`** — the signature feature: `handleStartDrift`, `handleCloseDrift`, `reopenLastDrift`, `handleNavigateToBreadcrumb`, push/save/undo drift handlers. **Large + entangled — requires live drift smoke.**
3. **Message send / stream pipeline** — the big send function(s) + streaming. **Requires live AI smoke.**
4. If `App.tsx` is meaningfully smaller, optionally start the same treatment on `DriftPanel.tsx`.
(If the user passed an argument — `$ARGUMENTS` — start with that target instead.)

## 3. Guardrails (NON-NEGOTIABLE)
- **One concern per commit.** Each step: extract → verify → commit → push. Never batch multiple extractions into one commit. This is how we keep rollback granular.
- **Behavior-preserving only.** A refactor commit must not change behavior. If you spot a real improvement, do it as a SEPARATE, clearly-labeled commit — never smuggle logic changes into an extraction. (Faithful copies; preserve effect dependency arrays exactly, even eslint-disabled ones.)
- **Verify multiple times before every commit:**
  - `npx tsc --noEmit` → must be clean.
  - `npm run build` → must succeed (the ~777 KB chunk warning is pre-existing/OK).
  - For any state/handler/effect change, also run a **Playwright smoke** (recipe below). For Tier B drift/messaging, run a **live-flow smoke** that actually sends a message / creates a drift (there is a live Gemini key in `.env`).
- **Rules of Hooks:** every hook call must be unconditional and placed **before** the `if (!isAuthenticated) return <Login/>` early return in `App.tsx`. If a hook needs a handler defined later in the file (e.g. `createNewChat`), either place the hook call after that handler, or pass handlers via a callback-ref pattern (see `useKeyboardShortcuts` for the reference pattern).
- **Clean up as you go:** remove now-unused imports after each extraction (`tsc` won't always flag them — grep to confirm).
- **Do NOT touch** the untracked `design-pink-first-todo.md` / `design-preview.html` files (unrelated, pre-existing). Stage only the files you changed (`git add <explicit paths>` or `git add src/`), never `git add -A`.
- **Match existing conventions:** comment density, naming, JSDoc style of the already-extracted hooks. Add a clear JSDoc header to every new hook/module.
- **Commit footer:** end each commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Push each verified step** to `origin/feature/apple-level-overhaul` so every step is a remote rollback point.
- If anything is ambiguous or a change feels risky, STOP and ask rather than guessing.

## 4. Playwright smoke recipe (learned gotchas)
- Write the test `.mjs` **inside the repo** (so it resolves `node_modules` `playwright`), run with `node script.mjs`, then delete it.
- Start dev server in background; it prints the localhost port (often 5173). Kill it (`pkill -f vite`) when done.
- Use `ctx.addInitScript(() => { localStorage.setItem('driftUser','tester'); localStorage.setItem('drift_onboarded','true'); })` to skip login + onboarding. **The onboarding flag must equal the string `'true'`** or the onboarding dialog appears and intercepts all clicks.
- Useful selectors/triggers: Settings = button named `Settings`; search = `Ctrl+k`; Drift Map = `Ctrl+Alt+g` (ungated); login one-tap = button matching `/quick demo/i`.
- Filter pre-existing Gemini connection-check `404 / Failed to load resource` console noise when asserting "no errors."
- For a live drift smoke: type into the `textarea`, send, wait for an assistant message to stream, then select text in it and trigger the drift tooltip.

## 5. Parked (out of scope unless the user asks)
- **Key proxy + real cloud auth/sync** — deferred pending the user's hosting-stack choice (Firebase recommended). The client-side Gemini key exposure remains until then.
- Local **backup export/import** is already DONE (`src/services/backup.ts`, wired into Settings).

When you finish a batch, give a short report: which hooks were extracted, the new `App.tsx` line count, verification results per step, and the next target. Then keep going unless told otherwise.
