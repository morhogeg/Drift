Work through the open items in the latest review-crew report and fix them.

Optional argument (`$ARGUMENTS`): batch size (number of items to tackle). Default 3.

## Steps

### 1. Keep the build hook quiet — dev server first
`.claude/settings.local.json` has a PostToolUse hook that runs `npm run build && npx cap sync ios` after every Edit/Write **when Vite is not running** — a batch of fixes would otherwise trigger repeated multi-minute builds. Check for a running Vite (`pgrep -f vite` or `curl -sf http://localhost:5199`); if none, start `npx vite --port 5199 --strictPort` in the background. The hook then self-skips; do one `npm run build` at the end of the batch instead.

### 2. Load the list
Find the most recent `.claude/reports/*/summary.md` (report folders are date-prefixed, so sort by name). List the open (unchecked `- [ ]`) items. If there are none, report that and stop.

### 3. Pick and fix
Take the top-priority unchecked items (P0 first, then P1, then P2), up to the batch size, **skipping** any item tagged `needs-decision`.

For each item, in order:
1. Implement the fix directly using the file paths, repro, and fix sketch in the item — no re-investigation should be needed. If an item says `path unknown — needs discovery`, treat it as last within its priority band.
2. Run the relevant tests (`npm run test` for logic; `npx playwright test` if the fix touches a user flow).
3. Check the item off in `summary.md` — flip `- [ ]` to `- [x]` and append a one-line note: `— fixed: <what was done> (<date>)`.
4. Commit the fix on its own with a clear message before moving to the next item.

### 4. Finish the batch
- Run `npm run build` once to verify everything compiles.
- End with a short chat recap: **fixed** (one-liners), **skipped** (and why — e.g. `needs-decision`), **blocked-needs-user** (anything started but not safely finishable).

## Safety rails
- **Never** tackle items tagged `needs-decision` — they need the user.
- If a fix balloons beyond its description (touching more files/behavior than implied), stop that item, leave it unchecked, note it as blocked, and move on — ask the user rather than improvising a refactor.
- Commit per-fix, never one mega-commit; stage explicit paths only.
