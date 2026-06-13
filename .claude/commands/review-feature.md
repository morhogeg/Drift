Run the AI review crew on the current change and produce one prioritized action list.

Optional argument (`$ARGUMENTS`): a short slug for the report folder, or a base ref to diff against (e.g. `main`).

You are the orchestrator — subagents cannot spawn subagents, so all dispatch happens from this top-level session.

## Steps

### 1. Compute the change under review
- If the working tree is dirty: the diff is `git diff HEAD` (staged + unstaged); changed files from `git diff HEAD --name-only`.
- Otherwise: diff the branch vs main — `git diff main...HEAD` and `git diff main...HEAD --name-only`.
- If `$ARGUMENTS` is a base ref, diff against that instead.
- Produce a short **diff summary** (a few sentences) and the **changed-file list**. If the diff is empty, say so and stop.
- Derive a **slug**: from `$ARGUMENTS` if it looks like a slug, else from the branch name or the dominant changed component (kebab-case).

### 2. Ensure a dev server is up (for the QA pass)
- If something responds on `http://localhost:5199` (`curl -sf -o /dev/null http://localhost:5199`), reuse it.
- Else if a user-run Vite responds on `http://localhost:5173`, reuse that URL — never disturb it.
- Otherwise boot one in the background: `npx vite --port 5199 --strictPort` (the `.fable/` convention — 5199 avoids clashing with a user's 5173), and wait until it responds.
- Pass the resulting URL to the qa-tester.

### 3. Launch the three reviewers in parallel
In a **single message**, launch three Agent calls so they run concurrently:
- **qa-tester** — diff summary, changed-file list, dev-server URL. Runs `npx playwright test` + an interactive Playwright MCP pass over the changed flows.
- **mobile-ui-reviewer** — diff summary, changed-file list. Design-system + mobile review of the changed UI.
- **code-reviewer** — the diff range (e.g. `HEAD` or `main...HEAD`), diff summary, changed-file list.

Each prompt must require: every finding carries severity and `file:line` path(s).

### 4. Synthesize via the product manager
Launch the **product-manager** agent with the three raw reports pasted into its prompt. It returns the summary + prioritized checkbox checklist.

### 5. Write the report files
Create `.claude/reports/<YYYY-MM-DD>-<slug>/` and write `qa.md`, `design.md`, `code-review.md`, and `summary.md` (the PM output, with GitHub-style checkboxes so `/work-the-list` can mark progress in place).

### 6. Echo the result
Print the contents of `summary.md` in chat as the headline result, followed by the report-folder path. If you booted a dev server, you may leave it running (it makes the Edit/Write PostToolUse build hook self-skip); mention that it's up.
