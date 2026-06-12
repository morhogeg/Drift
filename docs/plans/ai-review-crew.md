# AI Review Crew for Drift — Implementation Plan

> **Status:** approved plan, not yet implemented. To build it, open a session in this repo and say:
> _"Implement the plan in `docs/plans/ai-review-crew.md`."_

## Context

Build a set of role-based AI agents for the Drift repo — a QA tester who opens the app after changes, clicks around, and reports back; a product manager who accumulates feedback from all agents and summarizes what needs to be done; plus code and design reviewers. The goal: a repeatable "review crew" producing one prioritized action list, **and** a downtime skill (`/work-the-list`) that picks items off that list and fixes them while the user is away.

Drift already uses Claude Code customization (subagent `.claude/agents/mobile-ui-reviewer.md`, skills `.claude/skills/ios-preview/`, `.claude/skills/drift-prompt/`). This plan extends those existing patterns — match their file format and conventions.

### Decisions locked with the user
- **QA "hands": hybrid.** Playwright MCP (`@playwright/mcp` — free, open-source, runs locally via npx) for live interactive clicking of the *changed feature*, plus a scripted Playwright smoke spec for routine regression flows.
- **Roster:** QA Tester, Product Manager, Code Reviewer, Design/UX Reviewer.
- **Trigger:** manual `/review-feature` command.
- **Output:** tracked Markdown files in `.claude/reports/` **and** PM summary echoed in chat.
- **Downtime skill:** `/work-the-list` — loads latest reports, picks top-priority items, fixes them.
- **Every reported issue must include file paths** (`file:line` where known) so fixes need no re-discovery.
- **Agent model:** all subagents run on `fable` with **low reasoning effort** (set via frontmatter if the running Claude Code version supports an effort field; otherwise instruct concise, decisive behavior in the agent prompt).

### Key mechanics / constraints
- **Personas = subagents** (`.claude/agents/*.md`): YAML frontmatter (`name`, `description`, `tools`, `model`) + Markdown system prompt. Run in isolated contexts, parallelizable.
- **Subagents can't spawn subagents** — the `/review-feature` skill orchestrates from the top-level session; the PM agent is an aggregator, not a dispatcher.
- Playwright `v1.60.0` is in devDependencies but unwired (no `playwright.config.ts`; `e2e/entities.spec.ts` is an empty placeholder). Smoke recipes are already documented in code comments: mock Gemini SSE via `page.route()`, seed `localStorage` (`driftUser`, `drift_onboarded='true'`), viewport 1400×950, selectors `[data-drift-message-id]`, `.ai-message`, `textarea`.
- Reviewers are scoped to the **git diff under review**, not the whole app.

## Files to create / modify

### 1. New subagents — `.claude/agents/` (format matches existing `mobile-ui-reviewer.md`)

- **`qa-tester.md`** — persona "Quinn", the QA tester. After a feature/design/logic change: run `npx playwright test` (smoke suite), then use Playwright MCP tools to interactively exercise the flows touched by the diff (click, type, navigate, read accessibility snapshots). Reports each finding with: severity, flow, repro steps, expected vs actual, and **likely source file path(s)** (may Grep for the component). `model: fable` (low effort); tools: Bash, Read, Grep, Glob, Playwright MCP tools.
- **`product-manager.md`** — persona "Morgan", the PM/aggregator. Input: the three raw reports passed in by the orchestrator. Dedupes overlapping findings, groups by theme, prioritizes P0/P1/P2, and outputs one "What needs to be done" **checkbox checklist** where each item carries its file paths, repro, and rough effort — so `/work-the-list` can act without re-investigation. Items requiring a product decision are tagged `needs-decision`. `model: fable` (low effort); read-only tools.
- **`code-reviewer.md`** — reviews the current diff for correctness bugs plus reuse/simplification opportunities (criteria mirroring the existing `/code-review` skill). Findings include `file:line` + severity. `model: fable` (low effort); Read/Grep/Glob + Bash (git diff/log).
- **`mobile-ui-reviewer.md` (broaden in place)** — keep the filename and the existing iOS/Capacitor rules and `[severity] — component — description — fix` output format; add a web/design-system section (dark glassmorphic palette: `#0a0a0a`/`#111111`/`#1a1a1a`/`#333333`; purple `#a855f7` + pink `#ff006e` = Drift, cyan `#06b6d4` = Connect/Snippets; 150–200ms transitions; gradient accents) and require `file:line` in every finding. Add `model: fable`.

### 2. Orchestration skill — `.claude/skills/review-feature/SKILL.md`
Manual `/review-feature`. Steps the top-level session follows:
1. Compute the change under review (working-tree diff, or branch vs main) and the changed-file list.
2. Launch **qa-tester**, **mobile-ui-reviewer**, and **code-reviewer** subagents **in parallel**, each given the diff summary + changed file list.
3. Feed the three raw reports to the **product-manager** subagent for synthesis.
4. Write `.claude/reports/<YYYY-MM-DD>-<slug>/{qa,design,code-review,summary}.md`.
5. Echo `summary.md` (the PM action list) in chat as the headline result.

### 3. Downtime skill — `.claude/skills/work-the-list/SKILL.md`
Manual `/work-the-list` (optional arg `<n>` for batch size, default 3):
1. Read the most recent `.claude/reports/*/summary.md`; list open (unchecked) items.
2. Pick the top-priority unchecked items (P0 first); implement each fix directly using the file paths/repro in the report.
3. After each fix: run `npm run build` (and relevant tests), then check the item off in `summary.md` with a one-line note of what was done.
4. End with a short chat recap: fixed / skipped / blocked-needs-user.
- Safety rails: never tackle items tagged `needs-decision`; stop and ask if a fix balloons beyond its description; commit per-fix with clear messages.

### 4. Playwright MCP registration
Add to project MCP config (`.mcp.json` at repo root):
```json
{ "mcpServers": { "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] } } }
```
Free/open-source (Microsoft, Apache-2.0). One-time `npx playwright install chromium` for the browser binary (needs network access).

### 5. Playwright scripted wiring
- **`playwright.config.ts`** (new): baseURL `http://localhost:5173`, viewport 1400×950, `webServer` booting `vite dev`, screenshot/trace on failure.
- **`e2e/smoke.spec.ts`** (new): implement the smoke recipe documented in code comments — seed localStorage (`driftUser`, `drift_onboarded='true'`), mock Gemini SSE via `page.route()`, then exercise core flows: send a message → select text and drift → push-to-main → save a snippet; assert on key selectors. Replaces the empty `e2e/entities.spec.ts` placeholder.

### 6. Reports folder — `.claude/reports/`
Tracked (add `.gitkeep`). Layout: `.claude/reports/<YYYY-MM-DD>-<slug>/qa.md`, `design.md`, `code-review.md`, `summary.md`. `summary.md` uses GitHub-style checkboxes so `/work-the-list` can mark progress in place.

## Verification
1. Agents load cleanly (frontmatter parses; all four listed at session start).
2. `npx playwright test` runs `e2e/smoke.spec.ts` green against the dev server; the Playwright MCP server connects and can navigate to `http://localhost:5173`.
3. End-to-end dry run: make a small UI change → run `/review-feature` → confirm three reports + PM summary land under `.claude/reports/<date>-<slug>/`, summary is echoed in chat, and every finding carries file paths.
4. `/work-the-list` dry run: reads the latest summary, fixes one low-risk item, checks it off in the file, recaps in chat.
5. `npm run lint` and `npm run build` remain green.

## Out of scope (future)
- Auto-trigger hook after edits (manual-only for now; could mirror the existing iOS auto-build PostToolUse hook later).
- Posting PM summaries to GitHub PRs.
- iOS-simulator-based QA pass (web covers logic; the existing `ios-preview` skill remains for visual checks).
