---
name: ship
description: Inner loop — self-drive one goal end to end. Implement the smallest next increment, verify with `npm run check:fix`, fix on failure (max 3 tries), repeat until the goal's acceptance criteria are met, then run the full review→fix loop (/grind) and commit. The goal is the argument.
disable-model-invocation: true
---

Self-drive a single goal to completion. The goal is the argument — e.g. `/ship "add Cmd+K to focus the chat composer"`.

This is the **act → observe → decide → repeat** inner loop. `npm run check:fix` is the verification gate every iteration calls; you do not move to the next increment until it is green. Stop conditions are explicit so the loop can run unattended without running away.

## Before you start — make the goal checkable
A loop needs a definition of done. Restate the goal as **acceptance criteria** in one or two lines (what must be true when finished, e.g. "Cmd+K focuses the composer input; a test covers it; `npm run check` is green"). If the goal is too vague to write criteria for (open-ended "make it better", no finish line), **stop and ask** via `AskUserQuestion` — an unbounded goal is the classic loop anti-pattern. The verifier + the review report's `summary.md` are the rest of the finish line.

## Keep the build hook quiet — dev server first
`.claude/settings.local.json` has a PostToolUse hook that runs `npm run build && npx cap sync ios` after every Edit/Write **when Vite is not running**. A loop of edits would trigger repeated multi-minute builds. So first check for a running Vite (`pgrep -f vite` or `curl -sf http://localhost:5199`); if none, start `npx vite --port 5199 --strictPort` in the background. The hook then self-skips; the loop's own `check:fix` is the gate instead.

## The loop
Repeat until the acceptance criteria are met:

### 1. Implement the smallest next increment
Make the **smallest** change that moves toward the goal — one component, one handler, one test. Smaller increments keep each verify step fast and each failure easy to localize. Reuse existing patterns in the touched files (match naming, imports, type-only-import convention).

### 2. Verify (the observe step)
Run `npm run check:fix` (`tsc -b && vitest run` — skips the slow `vite build`, which the final step covers).
- **Green:** the increment is good. Go to step 4.
- **Red:** go to step 3.

### 3. Fix on failure — bounded
Diagnose from the tsc/vitest output and fix. Re-run `npm run check:fix`. **Maximum 3 repair attempts per increment.** If still red after 3, stop the loop, leave the increment uncommitted, and report what's failing and what you tried — do not thrash.

### 4. Commit the increment
Commit this increment on its own with a clear message before the next one. Stage explicit paths only — never `git add -A`. (Same discipline as `/work-the-list`.)

### 5. Decide
Are the acceptance criteria met? If not, return to step 1 for the next increment. If yes, exit the loop and go to Finish.

## Finish — full verify + review→fix
1. Run the **full** `npm run check` (adds `vite build`) to confirm the production build is clean.
2. Run **`/grind`** (the review→fix loop) to put the change through the review crew and burn down anything it finds.
3. End with a short chat recap: what shipped, the commits, and the final `check` / `grind` status.

## Safety rails (so this is safe to leave alone)
- **Bounded iteration:** max 3 repair attempts per increment (step 3). Don't loop forever on a red gate.
- **Bounded scope:** if an increment balloons beyond the goal (touching unrelated files/behavior, or implying a refactor), **stop and ask** via `AskUserQuestion` rather than improvising. Goal-drift is how loops go wrong.
- **Escalate decisions:** any genuine product/design choice (which key, which copy, which behavior) → `AskUserQuestion`, don't guess.
- **Commit per increment**, never one mega-commit; explicit-path staging only.
