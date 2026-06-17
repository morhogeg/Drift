---
name: grind
description: Review→fix loop — alternate /review-feature and /work-the-list until the review report has zero open non-needs-decision items, or after N rounds (default 3). Closes the critique→repair→re-critique cycle automatically. Optional arg, max rounds (default 3).
disable-model-invocation: true
---

Run the review→fix loop to convergence. Max rounds = the numeric argument if given, else 3.

This wraps the two commands you currently alternate by hand — `/review-feature` and `/work-the-list` — into one self-driving **act → observe → decide → repeat** loop over your own review crew. It stops on its own when the change is clean or the round cap is hit, so it's safe to leave running.

## The loop
Track a round counter starting at 1. Each round:

### 1. Review (observe)
Run **`/review-feature`** on the current change. This produces / refreshes the latest `.claude/reports/<date>-<slug>/summary.md` with a prioritized checklist.

### 2. Check the stop condition (decide)
Look at the open items in that `summary.md` — unchecked `- [ ]` entries that are **not** tagged `needs-decision`.
- **Zero open actionable items** → the change is clean. **Stop**, report success.
- **Only `needs-decision` items remain** → nothing to auto-fix. **Stop**, list those items for the user to decide, then end.
- **Round counter > max rounds** → **Stop**, report what's still open (the loop hit its cap; don't keep grinding).
- Otherwise → go to step 3.

### 3. Fix (act)
Run **`/work-the-list`** to fix the top open items (it skips `needs-decision`, runs tests, checks items off in `summary.md`, and commits per fix).

### 4. Repeat
Increment the round counter and return to step 1 — re-review so newly introduced issues are caught and fixed items are confirmed resolved. (Re-running `/review-feature` on the same change updates the same report.)

## Finish
End with a short chat recap:
- **rounds run** (e.g. 2 of 3),
- **why it stopped** (clean / only needs-decision left / hit round cap),
- **fixed** this run (one-liners),
- **still open** — anything left, especially `needs-decision` items the user must resolve.

## Safety rails
- **Bounded:** never exceed max rounds (default 3) — convergence is not guaranteed, the cap guarantees termination.
- **Never auto-fix `needs-decision` items** — surface them for the user (inherited from `/work-the-list`).
- If `/work-the-list` reports an item as blocked (scope ballooned), don't re-attempt it in the next round — carry it to the recap as needs-user.
