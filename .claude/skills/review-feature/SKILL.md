---
name: review-feature
description: Run the AI review crew on the current change — QA tester, design reviewer, and code reviewer in parallel, synthesized by the product manager into one prioritized action list under .claude/reports/. Optional arg, a short slug or base ref (e.g. "snippet-save" or "main").
disable-model-invocation: true
---

Run a full review pass over the change currently under review. You (the top-level session) are the orchestrator — subagents cannot spawn subagents, so all dispatch happens here.

## Steps

### 1. Compute the change under review
- If the working tree is dirty: the diff is `git diff HEAD` (include staged + unstaged), changed files from `git diff HEAD --name-only`.
- Otherwise: the diff is the branch vs main — `git diff main...HEAD` and `git diff main...HEAD --name-only`.
- If the user passed a base ref as the argument, diff against that instead.
- Produce a short **diff summary** (a few sentences: what changed, where) and the **changed-file list**. If the diff is empty, say so and stop.
- Derive a **slug**: from the argument if it looks like a slug, else from the branch name or the dominant changed component (kebab-case).

### 2. Ensure a dev server is up (for the QA pass)
- If something already responds on `http://localhost:5199` (`curl -sf -o /dev/null http://localhost:5199`), reuse it.
- Else if a user-run Vite instance responds on `http://localhost:5173`, reuse that URL — never restart or disturb it.
- Otherwise boot one in the background on the dedicated port: `npx vite --port 5199 --strictPort` (the `.fable/` convention — 5199 avoids clashing with a user-running 5173 instance), and wait until it responds.
- Pass the resulting URL to the qa-tester. (The Playwright `webServer` config covers the scripted suite on its own; this explicit step is for the interactive MCP pass.)

### 3. Launch the three reviewers in parallel
In a **single message**, launch three Agent calls so they run concurrently:
- **qa-tester** — give it: diff summary, changed-file list, dev-server URL. It runs `npx playwright test` plus an interactive Playwright MCP pass over the changed flows.
- **mobile-ui-reviewer** — give it: diff summary, changed-file list. Design-system + mobile review of the changed UI.
- **code-reviewer** — give it: the diff range (e.g. `HEAD` or `main...HEAD`), diff summary, changed-file list.

Each prompt must state the report requirements: every finding needs severity and `file:line` path(s).

### 4. Synthesize via the product manager
Launch the **product-manager** agent with the three raw reports pasted into its prompt (it is an aggregator — it gets the reports from you, it does not collect them itself). It returns the summary + prioritized checkbox checklist.

### 5. Write the report files
Create `.claude/reports/<YYYY-MM-DD>-<slug>/` and write:
- `qa.md` — raw qa-tester report
- `design.md` — raw mobile-ui-reviewer report
- `code-review.md` — raw code-reviewer report
- `summary.md` — the product-manager output (checkbox checklist; `/work-the-list` will check items off in place)

### 6. Echo the result
Print the contents of `summary.md` in chat as the headline result, followed by the report-folder path. If you booted a dev server in step 2, you may leave it running (it makes the Edit/Write PostToolUse build hook self-skip); mention that it's up.
